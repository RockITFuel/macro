//! Long-poll for a session's current turn to settle, for the SDK.

use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Query, State},
    routing::get,
};
use entity_access::{
    domain::{models::ViewAccessLevel, ports::EntityAccessService},
    inbound::axum_extractors::AgentSessionAccessLevelExtractor,
};
use macro_authorization::MacroAuthorizationService;
use serde::Deserialize;
use utoipa::IntoParams;

use super::{AgentSessionApiError, AgentSessionRouterState};
use crate::domain::{
    ports::{AgentSessionLogRepo, AgentSessionRepo},
    wait::{SessionWait, SessionWaiter},
};

/// The wait route, mounted below `/agent-sessions`.
pub fn agent_session_wait_router<R, Access, Auth, S>(
    state: AgentSessionRouterState<SessionWaiter<R>, Access, Auth>,
) -> Router<S>
where
    R: AgentSessionRepo + AgentSessionLogRepo + Send + Sync + 'static,
    Access: EntityAccessService,
    Auth: MacroAuthorizationService,
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route(
            "/{session_id}/wait",
            get(wait_agent_session_handler::<R, Access, Auth>),
        )
        .with_state(state)
}

/// How long to wait.
#[derive(Debug, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
#[into_params(parameter_in = Query)]
pub struct WaitAgentSessionQuery {
    /// Milliseconds to wait before returning with `timedOut`; default
    /// 120000, at most 600000.
    pub timeout_ms: Option<u64>,
}

#[utoipa::path(
    get,
    path = "/agent-sessions/{session_id}/wait",
    tag = "agent-sessions",
    operation_id = "wait_agent_session",
    params(
        ("session_id" = macro_uuid::Uuid, Path, description = "ID of the agent session"),
        WaitAgentSessionQuery,
    ),
    responses(
        (status = 200, body = SessionWait),
        (status = 401, body = String),
        (status = 403, body = String),
        (status = 500, body = String),
    )
)]
/// Wait until the session's current turn finishes, needs an answer or
/// approval, or fails; returns at once when it is not running.
///
/// Returns the turn's status, any pending question or approval, and the
/// latest messages. `timedOut` is true when the wait ended with the turn
/// still running.
#[tracing::instrument(skip_all, err(Debug))]
pub async fn wait_agent_session_handler<R, Access, Auth>(
    access: AgentSessionAccessLevelExtractor<ViewAccessLevel, Access, Auth>,
    State(state): State<AgentSessionRouterState<SessionWaiter<R>, Access, Auth>>,
    Query(query): Query<WaitAgentSessionQuery>,
) -> Result<Json<SessionWait>, AgentSessionApiError>
where
    R: AgentSessionRepo + AgentSessionLogRepo,
    Access: EntityAccessService,
    Auth: MacroAuthorizationService,
{
    Ok(Json(
        state
            .service
            .wait(
                access.entity_access_receipt,
                query.timeout_ms.map(Duration::from_millis),
            )
            .await?,
    ))
}
