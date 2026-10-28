//! Settings values, the env fallback, and their validation.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use url::Url;

#[cfg(test)]
mod test;

/// Where dictation is transcribed.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum::EnumString,
    strum::AsRefStr,
    strum::Display,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub enum SttProvider {
    /// The self-hosted local speech-to-text hub (OpenAI-compatible gateway).
    Local,
    /// OpenAI Whisper.
    Cloud,
}

/// Model family the local hub routes dictation to.
#[derive(
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum::EnumString,
    strum::AsRefStr,
    strum::Display,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub enum SttModel {
    /// Parakeet TDT 0.6B v3: every local worker runs it.
    #[default]
    Parakeet,
    /// Whisper large-v3-turbo: needs a worker with the faster-whisper engine.
    Whisper,
}

/// An ISO 639-1 language preference: exactly two lowercase ASCII letters.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct LanguageCode(String);

impl LanguageCode {
    /// The validated code.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for LanguageCode {
    type Error = TranscriptionSettingsError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() == 2 && value.bytes().all(|byte| byte.is_ascii_lowercase()) {
            Ok(Self(value))
        } else {
            Err(TranscriptionSettingsError::InvalidLanguage)
        }
    }
}

impl From<LanguageCode> for String {
    fn from(code: LanguageCode) -> Self {
        code.0
    }
}

/// A team's stored settings. `None` means "use the server env default".
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TeamTranscriptionSettings {
    /// Transcribe the team's calls and dictation.
    pub enabled: Option<bool>,
    /// Dictation provider.
    pub provider: Option<SttProvider>,
    /// Base URL of the local hub's OpenAI-compatible API.
    pub hub_url: Option<String>,
    /// Model family on the local hub.
    pub model: Option<SttModel>,
    /// Language hint for dictation when the client sends none.
    pub language: Option<LanguageCode>,
    /// Who last saved the settings.
    pub updated_by: Option<String>,
    /// When the settings were last saved.
    pub updated_at: Option<DateTime<Utc>>,
}

/// A partial update. Outer `None` keeps a value; `Some(None)` clears it back
/// to the env default.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TranscriptionSettingsPatch {
    /// New `enabled`.
    pub enabled: Option<Option<bool>>,
    /// New `provider`.
    pub provider: Option<Option<SttProvider>>,
    /// New `hub_url`.
    pub hub_url: Option<Option<String>>,
    /// New `model`.
    pub model: Option<Option<SttModel>>,
    /// New `language`.
    pub language: Option<Option<LanguageCode>>,
}

impl TeamTranscriptionSettings {
    /// Apply `patch`, trimming the hub URL and treating a blank one as unset.
    pub fn patched(mut self, patch: TranscriptionSettingsPatch) -> Self {
        if let Some(enabled) = patch.enabled {
            self.enabled = enabled;
        }
        if let Some(provider) = patch.provider {
            self.provider = provider;
        }
        if let Some(hub_url) = patch.hub_url {
            self.hub_url = hub_url
                .map(|url| url.trim().trim_end_matches('/').to_owned())
                .filter(|url| !url.is_empty());
        }
        if let Some(model) = patch.model {
            self.model = model;
        }
        if let Some(language) = patch.language {
            self.language = language;
        }
        self
    }

    /// These settings with every unset value taken from `env`.
    pub fn resolve(&self, env: &TranscriptionEnv) -> EffectiveTranscriptionSettings {
        EffectiveTranscriptionSettings {
            enabled: self.enabled.unwrap_or(true),
            provider: self.provider.unwrap_or_else(|| env.default_provider()),
            hub_url: self.hub_url.clone().or_else(|| env.hub_url.clone()),
            model: self.model.unwrap_or_default(),
            language: self.language.clone(),
        }
    }

    /// Reject values that would break transcription or send the hub token to
    /// a host the operator did not allow.
    pub fn validate(&self, env: &TranscriptionEnv) -> Result<(), TranscriptionSettingsError> {
        if let Some(hub_url) = &self.hub_url {
            env.check_hub_url(hub_url)?;
        }
        let effective = self.resolve(env);
        if effective.provider == SttProvider::Local {
            if !env.hub_api_key_set {
                return Err(TranscriptionSettingsError::MissingHubApiKey);
            }
            if effective.hub_url.is_none() {
                return Err(TranscriptionSettingsError::MissingHubUrl);
            }
        }
        if effective.provider == SttProvider::Cloud && !env.openai_api_key_set {
            return Err(TranscriptionSettingsError::MissingOpenaiApiKey);
        }
        Ok(())
    }
}

/// What a team's calls and dictation actually use.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct EffectiveTranscriptionSettings {
    /// Transcribe the team's calls and dictation.
    pub enabled: bool,
    /// Dictation provider.
    pub provider: SttProvider,
    /// Local hub base URL, when one is configured.
    pub hub_url: Option<String>,
    /// Model family on the local hub.
    pub model: SttModel,
    /// Language hint for dictation, or none to let the model decide.
    #[cfg_attr(feature = "inbound", schema(value_type = Option<String>))]
    pub language: Option<LanguageCode>,
}

/// Server env read once at startup: the bootstrap defaults for every team and
/// whether the secrets are present. Secret values never enter this type.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TranscriptionEnv {
    /// `DICTATION_STT_API_BASE`.
    pub hub_url: Option<String>,
    /// `DICTATION_STT_API_KEY` is set.
    pub hub_api_key_set: bool,
    /// `OPENAI_API_KEY` is set.
    pub openai_api_key_set: bool,
    /// `LIVEKIT_TRANSCRIPTION_AGENT_NAME`: calls are transcribed only with it.
    pub call_agent_name: Option<String>,
    /// `DICTATION_STT_ALLOWED_HOSTS`, plus the host of `hub_url`.
    pub allowed_hub_hosts: Vec<String>,
}

impl TranscriptionEnv {
    /// Build from the raw env values; the host of `hub_url` is always allowed.
    pub fn new(
        hub_url: Option<&str>,
        hub_api_key_set: bool,
        openai_api_key_set: bool,
        call_agent_name: Option<&str>,
        extra_allowed_hosts: Option<&str>,
    ) -> Self {
        let hub_url = hub_url
            .map(|url| url.trim().trim_end_matches('/').to_owned())
            .filter(|url| !url.is_empty());
        let mut allowed_hub_hosts: Vec<String> = extra_allowed_hosts
            .unwrap_or_default()
            .split(',')
            .map(|host| host.trim().to_ascii_lowercase())
            .filter(|host| !host.is_empty())
            .collect();
        if let Some(host) = hub_url
            .as_deref()
            .and_then(|url| Url::parse(url).ok())
            .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
            && !allowed_hub_hosts.contains(&host)
        {
            allowed_hub_hosts.insert(0, host);
        }
        Self {
            hub_url,
            hub_api_key_set,
            openai_api_key_set,
            call_agent_name: call_agent_name
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_owned),
            allowed_hub_hosts,
        }
    }

    /// Local when the env configures a hub with its token, else OpenAI.
    pub fn default_provider(&self) -> SttProvider {
        if self.hub_url.is_some() && self.hub_api_key_set {
            SttProvider::Local
        } else {
            SttProvider::Cloud
        }
    }

    /// The defaults a team without settings gets.
    pub fn defaults(&self) -> EffectiveTranscriptionSettings {
        TeamTranscriptionSettings::default().resolve(self)
    }

    fn check_hub_url(&self, hub_url: &str) -> Result<(), TranscriptionSettingsError> {
        let url = Url::parse(hub_url).map_err(|_| TranscriptionSettingsError::InvalidHubUrl)?;
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(TranscriptionSettingsError::InvalidHubUrl);
        }
        let host = url
            .host_str()
            .ok_or(TranscriptionSettingsError::InvalidHubUrl)?
            .to_ascii_lowercase();
        if self.allowed_hub_hosts.contains(&host) {
            Ok(())
        } else {
            Err(TranscriptionSettingsError::HubHostNotAllowed(host))
        }
    }
}

/// Whether the server env holds the secrets and the call agent, for the
/// settings page. Never carries a secret value.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct TranscriptionEnvStatus {
    /// `DICTATION_STT_API_KEY` is set.
    pub hub_api_key_set: bool,
    /// `OPENAI_API_KEY` is set.
    pub openai_api_key_set: bool,
    /// `LIVEKIT_TRANSCRIPTION_AGENT_NAME` is set, so calls can be transcribed.
    pub call_agent_configured: bool,
    /// Hosts a team may point the hub URL at.
    pub allowed_hub_hosts: Vec<String>,
    /// What a team without settings gets.
    pub defaults: EffectiveTranscriptionSettings,
}

impl TranscriptionEnv {
    /// The status shown on the settings page.
    pub fn status(&self) -> TranscriptionEnvStatus {
        TranscriptionEnvStatus {
            hub_api_key_set: self.hub_api_key_set,
            openai_api_key_set: self.openai_api_key_set,
            call_agent_configured: self.call_agent_name.is_some(),
            allowed_hub_hosts: self.allowed_hub_hosts.clone(),
            defaults: self.defaults(),
        }
    }
}

/// A team's settings as the settings page shows them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TranscriptionSettingsView {
    /// What the team set; unset values follow the env.
    pub stored: TeamTranscriptionSettings,
    /// What the team's calls and dictation use.
    pub effective: EffectiveTranscriptionSettings,
    /// Env secrets and defaults.
    pub env: TranscriptionEnvStatus,
}

/// Errors returned by the transcription settings service.
#[derive(Debug, thiserror::Error)]
pub enum TranscriptionSettingsError {
    /// The hub URL is not an absolute http(s) URL without credentials.
    #[error("Hub URL must be an http(s) URL like http://macro-stt-hub:8790/v1")]
    InvalidHubUrl,
    /// The hub URL points at a host the server does not allow.
    #[error(
        "Hub host {0} is not allowed. The server only sends its hub token to the host of DICTATION_STT_API_BASE and DICTATION_STT_ALLOWED_HOSTS"
    )]
    HubHostNotAllowed(String),
    /// Malformed language code.
    #[error("Language must be a two-letter ISO 639-1 code such as nl or en")]
    InvalidLanguage,
    /// Local transcription needs the hub token in the server env.
    #[error("Local transcription needs DICTATION_STT_API_KEY in the server env")]
    MissingHubApiKey,
    /// Local transcription needs a hub URL.
    #[error("Local transcription needs a hub URL")]
    MissingHubUrl,
    /// Cloud transcription needs the OpenAI key in the server env.
    #[error("Cloud transcription needs OPENAI_API_KEY in the server env")]
    MissingOpenaiApiKey,
    /// Any other internal error.
    #[error("internal transcription settings error: {0:?}")]
    Internal(rootcause::Report),
}

impl From<rootcause::Report> for TranscriptionSettingsError {
    fn from(report: rootcause::Report) -> Self {
        Self::Internal(report)
    }
}
