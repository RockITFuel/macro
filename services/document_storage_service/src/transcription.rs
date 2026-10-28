//! Team transcription settings wired into dictation and call agent dispatch.

#[cfg(test)]
mod test;

use std::{future::Future, pin::Pin, sync::Arc};

use dictation::domain::{
    DictationError, DictationRoute, DictationRouting, LanguageHint, SttTarget,
};
use macro_user_id::user_id::MacroUserIdStr;
use transcription_settings::domain::{
    models::{EffectiveTranscriptionSettings, SttProvider},
    ports::TranscriptionSettingsService,
};

/// Dictation route from the user's team settings.
pub(crate) struct SettingsDictationRouting<S>(pub Arc<S>);

/// The dictation route these settings describe.
pub(crate) fn dictation_route(settings: EffectiveTranscriptionSettings) -> DictationRoute {
    let target = match (settings.provider, settings.hub_url) {
        (SttProvider::Local, Some(api_base)) => SttTarget::Local {
            api_base,
            model: settings.model.as_ref().to_owned(),
        },
        _ => SttTarget::Cloud,
    };
    DictationRoute {
        enabled: settings.enabled,
        target,
        default_language: settings
            .language
            .and_then(|code| code.as_str().parse::<LanguageHint>().ok()),
    }
}

impl<S: TranscriptionSettingsService> DictationRouting for SettingsDictationRouting<S> {
    async fn route(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> Result<DictationRoute, DictationError> {
        let settings = self.0.effective_for_user(user).await.map_err(|error| {
            tracing::error!(error = ?error, "could not read transcription settings");
            DictationError::Provider
        })?;
        Ok(dictation_route(settings))
    }
}

/// Call agent dispatch gate from the call creator's team settings.
pub(crate) struct SettingsCallGate<S>(pub Arc<S>);

impl<S: TranscriptionSettingsService> call::domain::ports::CallTranscriptionGate
    for SettingsCallGate<S>
{
    fn transcription_enabled<'a>(
        &'a self,
        created_by: &'a str,
    ) -> Pin<Box<dyn Future<Output = bool> + Send + 'a>> {
        Box::pin(async move {
            let Ok(user) = MacroUserIdStr::parse_from_str(created_by) else {
                return true;
            };
            match self.0.effective_for_user(&user).await {
                Ok(settings) => settings.enabled,
                Err(error) => {
                    // Fail open: a settings outage must not silently drop transcripts.
                    tracing::warn!(error = ?error, "could not read transcription settings; transcribing");
                    true
                }
            }
        })
    }
}
