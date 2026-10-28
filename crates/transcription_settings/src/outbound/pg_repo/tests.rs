use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;
use uuid::Uuid;

use super::PgTranscriptionSettingsRepo;
use crate::domain::models::{LanguageCode, SttModel, SttProvider, TeamTranscriptionSettings};
use crate::domain::ports::TranscriptionSettingsRepository;

const ADMIN: &str = "macro|admin@example.com";

async fn insert_team(pool: &PgPool) -> Uuid {
    let macro_user_id = Uuid::now_v7();
    sqlx::query!(
        "INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $2, $2)",
        macro_user_id,
        ADMIN,
    )
    .execute(pool)
    .await
    .expect("macro_user should insert");
    sqlx::query!(
        r#"INSERT INTO "User" (id, email, macro_user_id) VALUES ($1, $1, $2)"#,
        ADMIN,
        macro_user_id,
    )
    .execute(pool)
    .await
    .expect("user should insert");
    let team_id = Uuid::now_v7();
    sqlx::query!(
        "INSERT INTO team (id, name, owner_id) VALUES ($1, 'Team', $2)",
        team_id,
        ADMIN,
    )
    .execute(pool)
    .await
    .expect("team should insert");
    team_id
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn upsert_round_trips_and_replaces(pool: PgPool) {
    let team_id = insert_team(&pool).await;
    let repo = PgTranscriptionSettingsRepo::new(pool.clone());
    let admin = MacroUserIdStr::parse_from_str(ADMIN).unwrap();
    assert_eq!(repo.get(team_id).await.unwrap(), None);

    let settings = TeamTranscriptionSettings {
        enabled: Some(false),
        provider: Some(SttProvider::Local),
        hub_url: Some("http://macro-stt-hub:8790/v1".into()),
        model: Some(SttModel::Whisper),
        language: Some(LanguageCode::try_from("nl".to_owned()).unwrap()),
        ..Default::default()
    };
    let saved = repo.upsert(team_id, &settings, &admin).await.unwrap();
    assert_eq!(saved.updated_by.as_deref(), Some(ADMIN));
    assert_eq!(
        TeamTranscriptionSettings {
            updated_by: None,
            updated_at: None,
            ..saved.clone()
        },
        settings
    );
    assert_eq!(repo.get(team_id).await.unwrap(), Some(saved));

    let cleared = repo
        .upsert(team_id, &TeamTranscriptionSettings::default(), &admin)
        .await
        .unwrap();
    assert_eq!(cleared.enabled, None);
    assert_eq!(cleared.provider, None);
    assert_eq!(cleared.language, None);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn settings_go_with_the_team(pool: PgPool) {
    let team_id = insert_team(&pool).await;
    let repo = PgTranscriptionSettingsRepo::new(pool.clone());
    let admin = MacroUserIdStr::parse_from_str(ADMIN).unwrap();
    repo.upsert(team_id, &TeamTranscriptionSettings::default(), &admin)
        .await
        .unwrap();
    sqlx::query!("DELETE FROM team WHERE id = $1", team_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(repo.get(team_id).await.unwrap(), None);
}
