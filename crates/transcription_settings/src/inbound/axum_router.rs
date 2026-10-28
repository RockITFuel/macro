//! Axum router for `GET`/`PUT /transcription/settings`: team owners and
//! admins read and change their team's transcription settings.

#[cfg(test)]
mod test;

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{FromRef, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use entity_access::{
    domain::{
        models::{AdminTeamRole, EntityType},
        ports::EntityAccessService,
    },
    inbound::axum_extractors::MacroUserTeamExtractorV2,
};
use macro_authorization::{
    MacroAuthorizationExtractor, MacroAuthorizationService, MacroAuthorizationState, UserOnly,
};
use model_error_response::ErrorResponse;
use serde::{Deserialize, Deserializer, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domain::{
    models::{
        EffectiveTranscriptionSettings, LanguageCode, SttModel, SttProvider,
        TeamTranscriptionSettings, TranscriptionEnvStatus, TranscriptionSettingsError,
        TranscriptionSettingsPatch, TranscriptionSettingsView,
    },
    ports::TranscriptionSettingsService,
};

/// Router state for the transcription settings endpoint.
pub struct TranscriptionSettingsRouterState<S, Eas, Auth> {
    /// Settings service.
    pub service: Arc<S>,
    /// Entity access service used by the team-role extractor.
    pub entity_access_service: Arc<Eas>,
    /// State used to authenticate users.
    pub authorization_state: MacroAuthorizationState<Auth>,
}

impl<S, Eas, Auth> Clone for TranscriptionSettingsRouterState<S, Eas, Auth> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            entity_access_service: self.entity_access_service.clone(),
            authorization_state: self.authorization_state.clone(),
        }
    }
}

impl<S, Eas, Auth> FromRef<TranscriptionSettingsRouterState<S, Eas, Auth>> for Arc<Eas> {
    fn from_ref(state: &TranscriptionSettingsRouterState<S, Eas, Auth>) -> Self {
        state.entity_access_service.clone()
    }
}

impl<S, Eas, Auth> FromRef<TranscriptionSettingsRouterState<S, Eas, Auth>>
    for MacroAuthorizationState<Auth>
{
    fn from_ref(state: &TranscriptionSettingsRouterState<S, Eas, Auth>) -> Self {
        state.authorization_state.clone()
    }
}

/// Build the router. Mount under `/transcription`.
///
/// Routes:
/// - `GET /settings` — the caller's team settings (owner/admin only).
/// - `PUT /settings` — partially update them (owner/admin only).
pub fn transcription_settings_router<S, Eas, Auth, T>(
    state: TranscriptionSettingsRouterState<S, Eas, Auth>,
) -> Router<T>
where
    S: TranscriptionSettingsService,
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
    T: Send + Sync + 'static,
{
    Router::new()
        .route(
            "/settings",
            get(get_handler::<S, Eas, Auth>).put(update_handler::<S, Eas, Auth>),
        )
        .with_state(state)
}

/// What the team set. `null` values follow the server env.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StoredTranscriptionSettings {
    /// Transcribe the team's calls and dictation.
    pub enabled: Option<bool>,
    /// Dictation provider.
    pub provider: Option<SttProvider>,
    /// Local hub base URL.
    pub hub_url: Option<String>,
    /// Model family on the local hub.
    pub model: Option<SttModel>,
    /// Dictation language hint.
    #[schema(value_type = Option<String>)]
    pub language: Option<LanguageCode>,
    /// Who last saved the settings.
    pub updated_by: Option<String>,
    /// When the settings were last saved.
    pub updated_at: Option<DateTime<Utc>>,
}

impl From<TeamTranscriptionSettings> for StoredTranscriptionSettings {
    fn from(s: TeamTranscriptionSettings) -> Self {
        Self {
            enabled: s.enabled,
            provider: s.provider,
            hub_url: s.hub_url,
            model: s.model,
            language: s.language,
            updated_by: s.updated_by,
            updated_at: s.updated_at,
        }
    }
}

/// The team's transcription settings page.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSettingsResponse {
    /// What the team set.
    pub stored: StoredTranscriptionSettings,
    /// What the team's calls and dictation use.
    pub effective: EffectiveTranscriptionSettings,
    /// Server env status: secrets set or not, defaults, allowed hub hosts.
    pub env: TranscriptionEnvStatus,
}

impl From<TranscriptionSettingsView> for TranscriptionSettingsResponse {
    fn from(view: TranscriptionSettingsView) -> Self {
        Self {
            stored: view.stored.into(),
            effective: view.effective,
            env: view.env,
        }
    }
}

/// Missing key → outer `None` (keep), `null` → `Some(None)` (back to env).
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

/// Request body for `PUT /transcription/settings`. Omitted fields keep their
/// value; `null` returns a field to the server env default.
#[derive(Debug, Default, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTranscriptionSettingsRequest {
    /// New `enabled`.
    #[serde(default, deserialize_with = "double_option")]
    pub enabled: Option<Option<bool>>,
    /// New `provider`.
    #[serde(default, deserialize_with = "double_option")]
    pub provider: Option<Option<SttProvider>>,
    /// New `hubUrl`.
    #[serde(default, deserialize_with = "double_option")]
    pub hub_url: Option<Option<String>>,
    /// New `model`.
    #[serde(default, deserialize_with = "double_option")]
    pub model: Option<Option<SttModel>>,
    /// New `language`.
    #[serde(default, deserialize_with = "double_option")]
    #[schema(value_type = Option<String>)]
    pub language: Option<Option<LanguageCode>>,
}

impl From<UpdateTranscriptionSettingsRequest> for TranscriptionSettingsPatch {
    fn from(req: UpdateTranscriptionSettingsRequest) -> Self {
        Self {
            enabled: req.enabled,
            provider: req.provider,
            hub_url: req.hub_url,
            model: req.model,
            language: req.language,
        }
    }
}

fn team_id<Eas, Auth>(
    access: &MacroUserTeamExtractorV2<AdminTeamRole, Eas, Auth>,
) -> Result<Uuid, TranscriptionSettingsError> {
    let entity = access.entity_access_receipt.entity();
    if entity.entity_type != EntityType::Team {
        return Err(rootcause::report!("receipt is not for a team").into());
    }
    Uuid::parse_str(&entity.entity_id).map_err(|e| rootcause::Report::new(e).into_dynamic().into())
}

/// Read the caller's team transcription settings. Team owners and admins only.
#[utoipa::path(
    get,
    path = "/transcription/settings",
    operation_id = "get_transcription_settings",
    responses(
        (status = 200, body = TranscriptionSettingsResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn get_handler<S, Eas, Auth>(
    _user: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: MacroUserTeamExtractorV2<AdminTeamRole, Eas, Auth>,
    State(state): State<TranscriptionSettingsRouterState<S, Eas, Auth>>,
) -> Result<Json<TranscriptionSettingsResponse>, TranscriptionSettingsError>
where
    S: TranscriptionSettingsService,
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
{
    let view = state.service.get(team_id(&access)?).await?;
    Ok(Json(view.into()))
}

/// Partially update the caller's team transcription settings. Team owners and
/// admins only. Returns the resulting settings.
#[utoipa::path(
    put,
    path = "/transcription/settings",
    operation_id = "put_transcription_settings",
    request_body = UpdateTranscriptionSettingsRequest,
    responses(
        (status = 200, body = TranscriptionSettingsResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn update_handler<S, Eas, Auth>(
    user: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: MacroUserTeamExtractorV2<AdminTeamRole, Eas, Auth>,
    State(state): State<TranscriptionSettingsRouterState<S, Eas, Auth>>,
    Json(req): Json<UpdateTranscriptionSettingsRequest>,
) -> Result<Json<TranscriptionSettingsResponse>, TranscriptionSettingsError>
where
    S: TranscriptionSettingsService,
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
{
    let view = state
        .service
        .update(
            team_id(&access)?,
            &user.authorization.macro_user_id,
            req.into(),
        )
        .await?;
    Ok(Json(view.into()))
}

impl IntoResponse for TranscriptionSettingsError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::Internal(report) => {
                tracing::error!(error = ?report, "transcription settings failed");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        message: "internal error".into(),
                    }),
                )
                    .into_response();
            }
            _ => StatusCode::BAD_REQUEST,
        };
        (
            status,
            Json(ErrorResponse {
                message: self.to_string().into(),
            }),
        )
            .into_response()
    }
}
