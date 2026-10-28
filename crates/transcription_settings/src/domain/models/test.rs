use super::*;

const HUB: &str = "http://macro-stt-hub:8790/v1";

fn env() -> TranscriptionEnv {
    TranscriptionEnv::new(Some(HUB), true, true, Some("macro-transcriber"), None)
}

fn lang(code: &str) -> LanguageCode {
    LanguageCode::try_from(code.to_owned()).unwrap()
}

#[test]
fn a_team_without_settings_gets_the_env_defaults() {
    assert_eq!(
        env().defaults(),
        EffectiveTranscriptionSettings {
            enabled: true,
            provider: SttProvider::Local,
            hub_url: Some(HUB.into()),
            model: SttModel::Parakeet,
            language: None,
        }
    );
}

#[test]
fn without_a_hub_token_the_default_provider_is_cloud() {
    let env = TranscriptionEnv::new(Some(HUB), false, true, None, None);
    assert_eq!(env.defaults().provider, SttProvider::Cloud);
    let env = TranscriptionEnv::new(None, true, true, None, None);
    assert_eq!(env.defaults().provider, SttProvider::Cloud);
}

#[test]
fn stored_values_override_env_and_clearing_returns_to_it() {
    let stored = TeamTranscriptionSettings::default().patched(TranscriptionSettingsPatch {
        enabled: Some(Some(false)),
        provider: Some(Some(SttProvider::Cloud)),
        model: Some(Some(SttModel::Whisper)),
        language: Some(Some(lang("nl"))),
        ..Default::default()
    });
    let effective = stored.resolve(&env());
    assert!(!effective.enabled);
    assert_eq!(effective.provider, SttProvider::Cloud);
    assert_eq!(effective.model, SttModel::Whisper);
    assert_eq!(effective.language, Some(lang("nl")));

    let cleared = stored.patched(TranscriptionSettingsPatch {
        enabled: Some(None),
        provider: Some(None),
        model: Some(None),
        language: Some(None),
        ..Default::default()
    });
    assert_eq!(cleared.resolve(&env()), env().defaults());
}

#[test]
fn a_blank_hub_url_means_unset_and_trailing_slashes_are_dropped() {
    let stored = TeamTranscriptionSettings::default().patched(TranscriptionSettingsPatch {
        hub_url: Some(Some("  http://macro-stt-hub:9000/v1/ ".into())),
        ..Default::default()
    });
    assert_eq!(
        stored.hub_url.as_deref(),
        Some("http://macro-stt-hub:9000/v1")
    );
    let cleared = stored.patched(TranscriptionSettingsPatch {
        hub_url: Some(Some("   ".into())),
        ..Default::default()
    });
    assert_eq!(cleared.hub_url, None);
}

fn with_hub(url: &str) -> TeamTranscriptionSettings {
    TeamTranscriptionSettings {
        hub_url: Some(url.into()),
        ..Default::default()
    }
}

#[test]
fn the_hub_token_only_goes_to_allowed_hosts() {
    assert!(
        with_hub("http://macro-stt-hub:9000/v1")
            .validate(&env())
            .is_ok()
    );
    assert!(matches!(
        with_hub("https://attacker.example/v1").validate(&env()),
        Err(TranscriptionSettingsError::HubHostNotAllowed(host)) if host == "attacker.example"
    ));
    let env = TranscriptionEnv::new(
        Some(HUB),
        true,
        true,
        None,
        Some("100.81.201.84, Stt.Internal"),
    );
    assert!(
        with_hub("http://stt.internal:8790/v1")
            .validate(&env)
            .is_ok()
    );
    assert!(
        with_hub("http://100.81.201.84:8790/v1")
            .validate(&env)
            .is_ok()
    );
}

#[test]
fn hub_urls_must_be_plain_http() {
    for url in [
        "ftp://macro-stt-hub/v1",
        "http://user:secret@macro-stt-hub:8790/v1",
        "http://macro-stt-hub:8790/v1?x=1",
        "macro-stt-hub:8790",
        "not a url",
    ] {
        assert!(
            matches!(
                with_hub(url).validate(&env()),
                Err(TranscriptionSettingsError::InvalidHubUrl)
                    | Err(TranscriptionSettingsError::HubHostNotAllowed(_))
            ),
            "{url} should be rejected"
        );
    }
}

#[test]
fn local_needs_the_hub_token_and_a_url() {
    let local = TeamTranscriptionSettings {
        provider: Some(SttProvider::Local),
        ..Default::default()
    };
    let no_token = TranscriptionEnv::new(Some(HUB), false, true, None, None);
    assert!(matches!(
        local.validate(&no_token),
        Err(TranscriptionSettingsError::MissingHubApiKey)
    ));
    let no_url = TranscriptionEnv::new(None, true, true, None, None);
    assert!(matches!(
        local.validate(&no_url),
        Err(TranscriptionSettingsError::MissingHubUrl)
    ));
}

#[test]
fn cloud_needs_the_openai_key() {
    let cloud = TeamTranscriptionSettings {
        provider: Some(SttProvider::Cloud),
        ..Default::default()
    };
    let env = TranscriptionEnv::new(Some(HUB), true, false, None, None);
    assert!(matches!(
        cloud.validate(&env),
        Err(TranscriptionSettingsError::MissingOpenaiApiKey)
    ));
}

#[test]
fn languages_are_two_lowercase_letters() {
    assert!(LanguageCode::try_from("nl".to_owned()).is_ok());
    for bad in ["NL", "nld", "", "n1"] {
        assert!(LanguageCode::try_from(bad.to_owned()).is_err(), "{bad}");
    }
}
