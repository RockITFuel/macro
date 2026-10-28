use super::*;
use transcription_settings::domain::models::{LanguageCode, SttModel};

fn settings(provider: SttProvider, hub_url: Option<&str>) -> EffectiveTranscriptionSettings {
    EffectiveTranscriptionSettings {
        enabled: true,
        provider,
        hub_url: hub_url.map(str::to_owned),
        model: SttModel::Whisper,
        language: Some(LanguageCode::try_from("nl".to_owned()).unwrap()),
    }
}

#[test]
fn local_settings_route_dictation_to_the_hub_with_the_team_model_and_language() {
    let route = dictation_route(settings(
        SttProvider::Local,
        Some("http://macro-stt-hub:8790/v1"),
    ));
    assert_eq!(
        route.target,
        SttTarget::Local {
            api_base: "http://macro-stt-hub:8790/v1".into(),
            model: "whisper".into(),
        }
    );
    assert_eq!(
        route.default_language.map(|l| l.to_string()),
        Some("nl".into())
    );
}

#[test]
fn cloud_or_a_missing_hub_url_routes_to_openai() {
    assert_eq!(
        dictation_route(settings(SttProvider::Cloud, Some("http://hub/v1"))).target,
        SttTarget::Cloud
    );
    assert_eq!(
        dictation_route(settings(SttProvider::Local, None)).target,
        SttTarget::Cloud
    );
}
