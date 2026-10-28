use std::collections::HashMap;
use std::sync::Mutex;

use super::*;
use crate::domain::models::{SttModel, SttProvider, TeamTranscriptionSettings};

#[derive(Debug, thiserror::Error)]
#[error("fake failure")]
struct FakeErr;

#[derive(Default)]
struct FakeRepo(Mutex<HashMap<Uuid, TeamTranscriptionSettings>>);

impl TranscriptionSettingsRepository for FakeRepo {
    type Err = FakeErr;

    async fn get(&self, team_id: Uuid) -> Result<Option<TeamTranscriptionSettings>, FakeErr> {
        Ok(self.0.lock().unwrap().get(&team_id).cloned())
    }

    async fn upsert(
        &self,
        team_id: Uuid,
        settings: &TeamTranscriptionSettings,
        updated_by: &MacroUserIdStr<'_>,
    ) -> Result<TeamTranscriptionSettings, FakeErr> {
        let stored = TeamTranscriptionSettings {
            updated_by: Some(updated_by.as_ref().to_owned()),
            ..settings.clone()
        };
        self.0.lock().unwrap().insert(team_id, stored.clone());
        Ok(stored)
    }
}

struct FakeTeams(Option<Uuid>);

impl UserTeams for FakeTeams {
    type Err = FakeErr;

    async fn team_of(&self, _user: &MacroUserIdStr<'_>) -> Result<Option<Uuid>, FakeErr> {
        Ok(self.0)
    }
}

const HUB: &str = "http://macro-stt-hub:8790/v1";

fn env() -> TranscriptionEnv {
    TranscriptionEnv::new(Some(HUB), true, true, Some("macro-transcriber"), None)
}

fn user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|admin@example.com").unwrap()
}

fn service(team: Option<Uuid>) -> TranscriptionSettingsServiceImpl<FakeRepo, FakeTeams> {
    TranscriptionSettingsServiceImpl::new(FakeRepo::default(), FakeTeams(team), env())
}

#[tokio::test]
async fn a_saved_setting_reaches_the_teams_users() {
    let team = Uuid::now_v7();
    let service = service(Some(team));
    let view = service
        .update(
            team,
            &user(),
            TranscriptionSettingsPatch {
                enabled: Some(Some(false)),
                model: Some(Some(SttModel::Whisper)),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        view.stored.updated_by.as_deref(),
        Some("macro|admin@example.com")
    );
    let effective = service.effective_for_user(&user()).await.unwrap();
    assert!(!effective.enabled);
    assert_eq!(effective.model, SttModel::Whisper);
    assert_eq!(effective.provider, SttProvider::Local);
}

#[tokio::test]
async fn users_without_a_team_get_the_env_defaults() {
    let effective = service(None).effective_for_user(&user()).await.unwrap();
    assert_eq!(effective, env().defaults());
}

#[tokio::test]
async fn an_invalid_update_is_not_stored() {
    let team = Uuid::now_v7();
    let service = service(Some(team));
    let result = service
        .update(
            team,
            &user(),
            TranscriptionSettingsPatch {
                hub_url: Some(Some("https://elsewhere.example/v1".into())),
                ..Default::default()
            },
        )
        .await;
    assert!(matches!(
        result,
        Err(TranscriptionSettingsError::HubHostNotAllowed(_))
    ));
    assert_eq!(
        service.get(team).await.unwrap().stored,
        TeamTranscriptionSettings::default()
    );
}

#[tokio::test]
async fn the_view_reports_env_status_without_secrets() {
    let view = service(None).get(Uuid::now_v7()).await.unwrap();
    assert!(view.env.hub_api_key_set);
    assert!(view.env.call_agent_configured);
    assert_eq!(view.env.allowed_hub_hosts, vec!["macro-stt-hub".to_owned()]);
}
