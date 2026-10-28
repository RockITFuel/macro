use super::*;

fn parse(json: &str) -> TranscriptionSettingsPatch {
    serde_json::from_str::<UpdateTranscriptionSettingsRequest>(json)
        .unwrap()
        .into()
}

#[test]
fn omitted_fields_are_kept_and_null_returns_to_the_env_default() {
    let patch = parse(r#"{"enabled": false, "hubUrl": null}"#);
    assert_eq!(patch.enabled, Some(Some(false)));
    assert_eq!(patch.hub_url, Some(None));
    assert_eq!(patch.provider, None);
    assert_eq!(patch.model, None);
    assert_eq!(patch.language, None);
}

#[test]
fn closed_sets_and_languages_are_parsed_strictly() {
    let patch = parse(r#"{"provider": "local", "model": "whisper", "language": "nl"}"#);
    assert_eq!(patch.provider, Some(Some(SttProvider::Local)));
    assert_eq!(patch.model, Some(Some(SttModel::Whisper)));
    assert!(
        serde_json::from_str::<UpdateTranscriptionSettingsRequest>(r#"{"provider": "deepgram"}"#)
            .is_err()
    );
    assert!(
        serde_json::from_str::<UpdateTranscriptionSettingsRequest>(r#"{"language": "Dutch"}"#)
            .is_err()
    );
}

#[test]
fn validation_errors_are_bad_requests_and_internal_errors_hide_details() {
    let response =
        TranscriptionSettingsError::HubHostNotAllowed("evil.example".into()).into_response();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let response =
        TranscriptionSettingsError::Internal(rootcause::report!("db down")).into_response();
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}
