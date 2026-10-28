//! PostgreSQL implementation of [`TranscriptionSettingsRepository`] over
//! `team_transcription_settings`.

#[cfg(test)]
mod tests;

use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::models::{LanguageCode, TeamTranscriptionSettings};
use crate::domain::ports::TranscriptionSettingsRepository;

/// Postgres-backed team transcription settings.
#[derive(Debug, Clone)]
pub struct PgTranscriptionSettingsRepo {
    pool: PgPool,
}

impl PgTranscriptionSettingsRepo {
    /// Create a repository backed by the provided pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

/// Errors produced by the Postgres repository.
#[derive(Debug, thiserror::Error)]
pub enum PgTranscriptionSettingsErr {
    /// Underlying database error.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    /// A stored value is outside its closed set.
    #[error("invalid stored transcription setting {0}")]
    InvalidValue(&'static str),
}

struct Row {
    enabled: Option<bool>,
    provider: Option<String>,
    hub_url: Option<String>,
    model: Option<String>,
    language: Option<String>,
    updated_by: String,
    updated_at: DateTime<Utc>,
}

impl TryFrom<Row> for TeamTranscriptionSettings {
    type Error = PgTranscriptionSettingsErr;

    fn try_from(row: Row) -> Result<Self, Self::Error> {
        Ok(Self {
            enabled: row.enabled,
            provider: row
                .provider
                .map(|v| v.parse())
                .transpose()
                .map_err(|_| PgTranscriptionSettingsErr::InvalidValue("provider"))?,
            hub_url: row.hub_url,
            model: row
                .model
                .map(|v| v.parse())
                .transpose()
                .map_err(|_| PgTranscriptionSettingsErr::InvalidValue("model"))?,
            language: row
                .language
                .map(LanguageCode::try_from)
                .transpose()
                .map_err(|_| PgTranscriptionSettingsErr::InvalidValue("language"))?,
            updated_by: Some(row.updated_by),
            updated_at: Some(row.updated_at),
        })
    }
}

impl TranscriptionSettingsRepository for PgTranscriptionSettingsRepo {
    type Err = PgTranscriptionSettingsErr;

    #[tracing::instrument(err, skip(self))]
    async fn get(&self, team_id: Uuid) -> Result<Option<TeamTranscriptionSettings>, Self::Err> {
        sqlx::query_as!(
            Row,
            r#"
            SELECT enabled, provider, hub_url, model, language, updated_by, updated_at
            FROM team_transcription_settings
            WHERE team_id = $1
            "#,
            team_id,
        )
        .fetch_optional(&self.pool)
        .await?
        .map(TryInto::try_into)
        .transpose()
    }

    #[tracing::instrument(err, skip(self, settings, updated_by))]
    async fn upsert(
        &self,
        team_id: Uuid,
        settings: &TeamTranscriptionSettings,
        updated_by: &MacroUserIdStr<'_>,
    ) -> Result<TeamTranscriptionSettings, Self::Err> {
        sqlx::query_as!(
            Row,
            r#"
            INSERT INTO team_transcription_settings
                (team_id, enabled, provider, hub_url, model, language, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, now())
            ON CONFLICT (team_id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                provider = EXCLUDED.provider,
                hub_url = EXCLUDED.hub_url,
                model = EXCLUDED.model,
                language = EXCLUDED.language,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            RETURNING enabled, provider, hub_url, model, language, updated_by, updated_at
            "#,
            team_id,
            settings.enabled,
            settings.provider.map(|p| p.as_ref().to_owned()),
            settings.hub_url.as_deref(),
            settings.model.map(|m| m.as_ref().to_owned()),
            settings.language.as_ref().map(LanguageCode::as_str),
            updated_by.as_ref(),
        )
        .fetch_one(&self.pool)
        .await?
        .try_into()
    }
}
