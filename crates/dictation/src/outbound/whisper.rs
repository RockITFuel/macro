//! OpenAI Whisper adapter for the [`TranscriptionProvider`] port.
//!
//! `/v1/audio/transcriptions` is eligible for OpenAI's Zero Data Retention and
//! has no abuse-monitoring retention by default, so an enterprise key with ZDR
//! can serve dictation without audio or transcripts being stored by the
//! provider. This adapter never logs either.

use crate::domain::{DictationError, Recording, SttTarget, Transcript, TranscriptionProvider};
use async_openai::{
    Client,
    config::OpenAIConfig,
    error::OpenAIError,
    types::audio::{AudioInput, AudioResponseFormat, CreateTranscriptionRequest},
};
use macro_env_var::env_vars;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tracing::instrument::WithSubscriber;

env_vars! {
    /// Server-side OpenAI credential, injected as `OPENAI_API_KEY`. Never
    /// exposed to the browser.
    pub struct OpenaiApiKey;
}

macro_env_var::maybe_env_vars! {
    /// Default base URL of an OpenAI-compatible transcription API to use
    /// instead of OpenAI, e.g. the self-hosted local speech-to-text gateway
    /// (`http://macro-stt-hub:8790/v1`). Unset: OpenAI. Teams can change the
    /// URL in their transcription settings, within `DICTATION_STT_ALLOWED_HOSTS`.
    pub struct DictationSttApiBase;
    /// Bearer token for the OpenAI-compatible API, required with
    /// `DICTATION_STT_API_BASE`. A secret: never stored in team settings.
    pub struct DictationSttApiKey;
    /// Comma-separated extra hosts a team may point dictation at, besides the
    /// host of `DICTATION_STT_API_BASE`. `DICTATION_STT_API_KEY` is sent to
    /// whichever host is chosen, so only list hubs you run.
    pub struct DictationSttAllowedHosts;
}

const MODEL: &str = "whisper-1";
/// Overall request deadline, including the SDK's retries.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
/// Total budget for retrying provider 429/5xx responses before giving up.
const RETRY_BUDGET: Duration = Duration::from_secs(10);

/// Speech-to-text through OpenAI Whisper or an OpenAI-compatible API.
pub struct WhisperTranscriber {
    cloud: Client<OpenAIConfig>,
    /// Token for [`SttTarget::Local`]; without it local targets fail.
    local_key: Option<String>,
    /// One client per local base URL, built on first use.
    local: Mutex<HashMap<String, Arc<Client<OpenAIConfig>>>>,
}

/// The subset of the `verbose_json` response this adapter relies on.
#[derive(Deserialize)]
struct VerboseTranscription {
    text: String,
    duration: f32,
}

impl WhisperTranscriber {
    /// Construct once at startup against the public OpenAI API, without a
    /// token for local targets.
    pub fn new(api_key: &OpenaiApiKey) -> Result<Self, WhisperConfigError> {
        Self::with_api_base(api_key, None)
    }

    /// Construct from the environment: OpenAI for cloud targets and
    /// `DICTATION_STT_API_KEY` for local ones. Fails when
    /// `DICTATION_STT_API_BASE` is set without that token.
    pub fn from_env(api_key: &OpenaiApiKey) -> Result<Self, WhisperConfigError> {
        let base = DictationSttApiBase::new();
        let key = DictationSttApiKey::new();
        Self::with_local_key(
            api_key,
            base.as_ref().and_then(|v| v.value()),
            key.as_ref().and_then(|v| v.value()),
        )
    }

    /// OpenAI with `api_key`, and `local_key` for local targets. A non-empty
    /// `default_base` requires `local_key`.
    pub fn with_local_key(
        api_key: &OpenaiApiKey,
        default_base: Option<&str>,
        local_key: Option<&str>,
    ) -> Result<Self, WhisperConfigError> {
        let has_base = default_base.is_some_and(|base| !base.trim().is_empty());
        let local_key = match local_key {
            Some(key) if key.trim().is_empty() => return Err(WhisperConfigError::EmptyApiKey),
            Some(key) => Some(key.trim().to_owned()),
            // Never send the OpenAI key to another API.
            None if has_base => return Err(WhisperConfigError::MissingSttApiKey),
            None => None,
        };
        if has_base {
            tracing::info!(
                "dictation defaults to the OpenAI-compatible API at DICTATION_STT_API_BASE"
            );
        }
        Ok(Self {
            cloud: build_client(api_key.as_ref(), None)?,
            local_key,
            local: Mutex::default(),
        })
    }

    /// Construct with the cloud client at a custom API base, e.g. a test server.
    pub fn with_api_base(
        api_key: &OpenaiApiKey,
        api_base: Option<&str>,
    ) -> Result<Self, WhisperConfigError> {
        Ok(Self {
            cloud: build_client(api_key.as_ref(), api_base)?,
            local_key: None,
            local: Mutex::default(),
        })
    }

    fn local_client(&self, api_base: &str) -> Result<Arc<Client<OpenAIConfig>>, DictationError> {
        let Some(key) = self.local_key.as_deref() else {
            tracing::warn!(kind = "config", "DICTATION_STT_API_KEY is not set");
            return Err(DictationError::Provider);
        };
        let mut clients = self
            .local
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(client) = clients.get(api_base) {
            return Ok(client.clone());
        }
        let client = Arc::new(build_client(key, Some(api_base)).map_err(|_| {
            tracing::warn!(kind = "config", "could not build the local STT client");
            DictationError::Provider
        })?);
        clients.insert(api_base.to_owned(), client.clone());
        Ok(client)
    }
}

fn build_client(
    api_key: &str,
    api_base: Option<&str>,
) -> Result<Client<OpenAIConfig>, WhisperConfigError> {
    if api_key.trim().is_empty() {
        return Err(WhisperConfigError::EmptyApiKey);
    }
    let config = OpenAIConfig::new()
        .with_api_key(api_key)
        .with_api_base(api_base.unwrap_or("https://api.openai.com/v1"));
    let http_client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()?;
    let backoff = backoff::ExponentialBackoffBuilder::new()
        .with_max_elapsed_time(Some(RETRY_BUDGET))
        .build();
    Ok(Client::build(http_client, config, backoff))
}

/// Startup failures for [`WhisperTranscriber::new`].
#[derive(Debug, thiserror::Error)]
pub enum WhisperConfigError {
    /// The required credential contains no usable key.
    #[error("OPENAI_API_KEY must not be empty")]
    EmptyApiKey,
    /// `DICTATION_STT_API_BASE` is set without `DICTATION_STT_API_KEY`.
    #[error("DICTATION_STT_API_KEY is required with DICTATION_STT_API_BASE")]
    MissingSttApiKey,
    /// The HTTP client could not be constructed.
    #[error(transparent)]
    HttpClient(#[from] reqwest::Error),
}

impl TranscriptionProvider for WhisperTranscriber {
    fn model_id(&self) -> &'static str {
        MODEL
    }

    #[tracing::instrument(name = "transcribe whisper-1", skip_all, err, fields(
        otel.kind = "client",
        gen_ai.operation.name = "transcribe",
        gen_ai.provider.name = "openai",
        gen_ai.request.model = tracing::field::Empty,
        audio.format = recording.format().extension(),
        audio.bytes = recording.bytes().len(),
        audio.duration_seconds = tracing::field::Empty,
        stt.target = tracing::field::Empty,
        error.type = tracing::field::Empty,
    ))]
    async fn transcribe(
        &self,
        recording: Recording,
        target: &SttTarget,
    ) -> Result<Transcript, DictationError> {
        let (client, model) = match target {
            SttTarget::Cloud => {
                tracing::Span::current().record("stt.target", "cloud");
                (None, MODEL)
            }
            SttTarget::Local { api_base, model } => {
                tracing::Span::current().record("stt.target", "local");
                (Some(self.local_client(api_base)?), model.as_str())
            }
        };
        tracing::Span::current().record("gen_ai.request.model", model);
        let client = client.as_deref().unwrap_or(&self.cloud);
        let (bytes, format, language) = recording.into_parts();
        let request = CreateTranscriptionRequest {
            file: AudioInput::from_bytes(format.filename(), bytes),
            model: model.to_owned(),
            language: language.map(|hint| hint.to_string()),
            response_format: Some(AudioResponseFormat::VerboseJson),
            ..Default::default()
        };
        let audio_api = client.audio();
        let transcriptions = audio_api.transcription();
        let transcription =
            transcriptions.create_verbose_json_byot::<_, VerboseTranscription>(request);
        // async-openai 0.36 logs raw response bodies on parse/HTTP failures.
        // Scope a silent subscriber to this future's polls only; our surrounding
        // span and sanitized diagnostics remain visible, including after await.
        let response = tokio::time::timeout(
            REQUEST_TIMEOUT,
            transcription.with_subscriber(tracing::Dispatch::none()),
        )
        .await
        .map_err(|_| {
            tracing::Span::current().record("error.type", "timeout");
            tracing::warn!(kind = "timeout", "Whisper request failed");
            DictationError::Provider
        })?
        .map_err(|error| {
            let kind = match &error {
                OpenAIError::Reqwest(error) if error.is_timeout() => "timeout",
                OpenAIError::Reqwest(error) if error.is_connect() => "connection",
                OpenAIError::Reqwest(_) => "http",
                OpenAIError::ApiError(_) => "provider_rejection",
                OpenAIError::JSONDeserialize(..) => "invalid_response",
                _ => "client_error",
            };
            tracing::Span::current().record("error.type", kind);
            // ApiError discards HTTP headers/status. Only Reqwest retains status;
            // never recover it by logging the SDK error or its raw body.
            let status = match &error {
                OpenAIError::Reqwest(error) => error.status().map(|status| status.as_u16()),
                _ => None,
            };
            tracing::warn!(kind, status, "Whisper request failed");
            DictationError::Provider
        })?;
        if !response.duration.is_finite() || response.duration <= 0.0 {
            tracing::Span::current().record("error.type", "invalid_duration");
            tracing::warn!(kind = "invalid_duration", "Whisper response unusable");
            return Err(DictationError::Provider);
        }
        tracing::Span::current().record("audio.duration_seconds", response.duration);
        Ok(Transcript {
            text: response.text,
            duration_seconds: response.duration,
        })
    }
}

#[cfg(test)]
mod test;
