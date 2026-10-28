//! Team transcription settings service.

#[cfg(test)]
mod test;

use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use crate::domain::models::{
    EffectiveTranscriptionSettings, TranscriptionEnv, TranscriptionSettingsError,
    TranscriptionSettingsPatch, TranscriptionSettingsView,
};
use crate::domain::ports::{
    TranscriptionSettingsRepository, TranscriptionSettingsService, UserTeams,
};

/// Settings backed by a repository, with `env` as the fallback for every
/// value a team has not set.
#[derive(Debug, Clone)]
pub struct TranscriptionSettingsServiceImpl<R, T> {
    repo: R,
    teams: T,
    env: TranscriptionEnv,
}

impl<R: TranscriptionSettingsRepository, T: UserTeams> TranscriptionSettingsServiceImpl<R, T> {
    /// Create the service.
    pub fn new(repo: R, teams: T, env: TranscriptionEnv) -> Self {
        Self { repo, teams, env }
    }

    /// The env the service falls back to.
    pub fn env(&self) -> &TranscriptionEnv {
        &self.env
    }

    async fn stored(
        &self,
        team_id: Uuid,
    ) -> Result<crate::domain::models::TeamTranscriptionSettings, TranscriptionSettingsError> {
        Ok(self
            .repo
            .get(team_id)
            .await
            .map_err(|e| rootcause::Report::new(e).into_dynamic())?
            .unwrap_or_default())
    }

    fn view(
        &self,
        stored: crate::domain::models::TeamTranscriptionSettings,
    ) -> TranscriptionSettingsView {
        TranscriptionSettingsView {
            effective: stored.resolve(&self.env),
            stored,
            env: self.env.status(),
        }
    }
}

impl<R: TranscriptionSettingsRepository, T: UserTeams> TranscriptionSettingsService
    for TranscriptionSettingsServiceImpl<R, T>
{
    #[tracing::instrument(err, skip(self))]
    async fn get(
        &self,
        team_id: Uuid,
    ) -> Result<TranscriptionSettingsView, TranscriptionSettingsError> {
        Ok(self.view(self.stored(team_id).await?))
    }

    #[tracing::instrument(err, skip(self, user))]
    async fn update(
        &self,
        team_id: Uuid,
        user: &MacroUserIdStr<'_>,
        patch: TranscriptionSettingsPatch,
    ) -> Result<TranscriptionSettingsView, TranscriptionSettingsError> {
        let next = self.stored(team_id).await?.patched(patch);
        next.validate(&self.env)?;
        let saved = self
            .repo
            .upsert(team_id, &next, user)
            .await
            .map_err(|e| rootcause::Report::new(e).into_dynamic())?;
        tracing::info!(%team_id, "team transcription settings updated");
        Ok(self.view(saved))
    }

    #[tracing::instrument(err, skip_all)]
    async fn effective_for_user(
        &self,
        user: &MacroUserIdStr<'_>,
    ) -> Result<EffectiveTranscriptionSettings, TranscriptionSettingsError> {
        let team = self
            .teams
            .team_of(user)
            .await
            .map_err(|e| rootcause::Report::new(e).into_dynamic())?;
        match team {
            Some(team_id) => Ok(self.stored(team_id).await?.resolve(&self.env)),
            None => Ok(self.env.defaults()),
        }
    }
}
