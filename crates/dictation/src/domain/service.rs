//! The transcription use case.

use super::{
    models::{DictationError, LanguageHint, MAX_AUDIO_DURATION, Recording, Transcript},
    ports::{DictationRouting, DictationService, RecordingInspector, TranscriptionProvider},
};
use ai_usage::{AiFeature, UsageContext, UsageRecorder};
use bytes::Bytes;
use macro_user_id::user_id::MacroUserIdStr;
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;

/// Upper bound on in-flight inspections/provider requests per service process.
const MAX_CONCURRENT_TRANSCRIPTIONS: usize = 16;
/// Dictation for authenticated users on every plan.
pub struct DictationServiceImpl<P, I, R = super::models::DictationRoute> {
    provider: P,
    inspector: I,
    routing: R,
    recorder: Arc<dyn UsageRecorder>,
    capacity: Semaphore,
}

impl<P: TranscriptionProvider, I: RecordingInspector>
    DictationServiceImpl<P, I, super::models::DictationRoute>
{
    /// Build a service that always sends dictation to OpenAI.
    pub fn new(provider: P, inspector: I, recorder: Arc<dyn UsageRecorder>) -> Self {
        Self::with_routing(
            provider,
            inspector,
            super::models::DictationRoute::cloud(),
            recorder,
        )
    }
}

impl<P: TranscriptionProvider, I: RecordingInspector, R: DictationRouting>
    DictationServiceImpl<P, I, R>
{
    /// Build a service with a bounded number of concurrent provider requests
    /// whose provider and defaults `routing` resolves per user.
    pub fn with_routing(
        provider: P,
        inspector: I,
        routing: R,
        recorder: Arc<dyn UsageRecorder>,
    ) -> Self {
        Self {
            provider,
            inspector,
            routing,
            recorder,
            capacity: Semaphore::new(MAX_CONCURRENT_TRANSCRIPTIONS),
        }
    }

    #[cfg(test)]
    pub(super) fn capacity(&self) -> &Semaphore {
        &self.capacity
    }
}

impl<P: TranscriptionProvider, I: RecordingInspector, R: DictationRouting> DictationService
    for DictationServiceImpl<P, I, R>
{
    #[tracing::instrument(name = "dictation.transcribe", skip_all, err, fields(
        user_id = %user,
        audio.bytes = audio.len(),
        audio.format = tracing::field::Empty,
        audio.duration_seconds = tracing::field::Empty,
        dictation.stage = "validation",
        dictation.in_flight = tracing::field::Empty,
    ))]
    async fn transcribe(
        &self,
        user: MacroUserIdStr<'static>,
        audio: Bytes,
        language: Option<LanguageHint>,
    ) -> Result<Transcript, DictationError> {
        let span = tracing::Span::current();
        let route = self.routing.route(&user).await?;
        if !route.enabled {
            return Err(DictationError::Disabled);
        }
        let recording = Recording::new(audio, language.or(route.default_language))?;
        span.record("audio.format", recording.format().extension());
        span.record("dictation.stage", "admission");
        let _permit = self.capacity.try_acquire().map_err(|_| {
            tracing::warn!(
                limit = MAX_CONCURRENT_TRANSCRIPTIONS,
                "dictation capacity exhausted"
            );
            DictationError::Busy
        })?;
        span.record(
            "dictation.in_flight",
            MAX_CONCURRENT_TRANSCRIPTIONS - self.capacity.available_permits(),
        );
        span.record("dictation.stage", "inspection");
        let duration = self.inspector.duration(recording.clone()).await?;
        span.record("audio.duration_seconds", duration.as_secs_f64());
        if duration.is_zero() {
            return Err(DictationError::InvalidAudio);
        }
        if duration > MAX_AUDIO_DURATION {
            return Err(DictationError::TooLong);
        }
        span.record("dictation.stage", "provider");
        let transcript = self.provider.transcribe(recording, &route.target).await?;
        span.record("dictation.stage", "usage");
        let duration = Duration::try_from_secs_f32(transcript.duration_seconds)
            .map_err(|_| DictationError::Provider)?;
        self.recorder.record(
            UsageContext::new(AiFeature::Dictation, user)
                .into_audio_event(self.provider.model_id().to_owned(), duration),
        );
        span.record("dictation.stage", "complete");
        Ok(Transcript {
            text: transcript.text.trim().to_owned(),
            duration_seconds: transcript.duration_seconds,
        })
    }
}

#[cfg(test)]
mod test;
