//! Ports (trait contracts) for team transcription settings.

use std::future::Future;

use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use crate::domain::models::{
    EffectiveTranscriptionSettings, TeamTranscriptionSettings, TranscriptionSettingsError,
    TranscriptionSettingsPatch, TranscriptionSettingsView,
};

/// Outbound persistence port for team transcription settings.
pub trait TranscriptionSettingsRepository: Send + Sync + 'static {
    /// The error type returned by repository operations.
    type Err: std::error::Error + Send + Sync + 'static;

    /// The team's stored settings, or `None` when it never saved any.
    fn get(
        &self,
        team_id: Uuid,
    ) -> impl Future<Output = Result<Option<TeamTranscriptionSettings>, Self::Err>> + Send;

    /// Insert or replace the team's settings and return what was stored.
    fn upsert(
        &self,
        team_id: Uuid,
        settings: &TeamTranscriptionSettings,
        updated_by: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<TeamTranscriptionSettings, Self::Err>> + Send;
}

/// Outbound port: the team a user belongs to.
pub trait UserTeams: Send + Sync + 'static {
    /// The error type returned by the lookup.
    type Err: std::error::Error + Send + Sync + 'static;

    /// The user's team, or `None` when they are in none.
    fn team_of(
        &self,
        user: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Option<Uuid>, Self::Err>> + Send;
}

/// Inbound service port used by the HTTP router, dictation and calls.
pub trait TranscriptionSettingsService: Send + Sync + 'static {
    /// The team's stored settings, what they resolve to, and the env status.
    /// Callers must have checked that the user may manage the team.
    fn get(
        &self,
        team_id: Uuid,
    ) -> impl Future<Output = Result<TranscriptionSettingsView, TranscriptionSettingsError>> + Send;

    /// Validate and store a partial update for the team.
    /// Callers must have checked that the user may manage the team.
    fn update(
        &self,
        team_id: Uuid,
        user: &MacroUserIdStr<'_>,
        patch: TranscriptionSettingsPatch,
    ) -> impl Future<Output = Result<TranscriptionSettingsView, TranscriptionSettingsError>> + Send;

    /// What `user`'s dictation and calls use: their team's settings over the
    /// env defaults, or the env defaults when they are in no team.
    fn effective_for_user(
        &self,
        user: &MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<EffectiveTranscriptionSettings, TranscriptionSettingsError>> + Send;
}
