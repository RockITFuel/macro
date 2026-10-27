//! Wait for a session's current turn using the authenticated caller's view access.

use ai_toolset::{
    AsyncTool, RequestContext, ServiceContext, ToolAnnotated, ToolAnnotations, ToolCallError,
    ToolResult,
};
use async_trait::async_trait;
use entity_access::domain::{
    models::{EntityType, ViewAccessLevel},
    ports::EntityAccessService,
};
use schemars::JsonSchema;
use serde::Deserialize;

use super::ReadAgentSessionContext;
use crate::domain::{
    ports::{AgentSessionLogRepo, AgentSessionRepo},
    wait::SessionWait,
};

/// Block until an agent session's current turn finishes, needs input, or fails.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(
    title = "WaitAgentSession",
    description = "Wait until an agent session's current turn finishes, needs an answer or approval, or fails, then return its status and latest messages. Returns at once if the session is not running. status is running, idle, waiting, failed or disconnected; timedOut is true when the timeout passed with the turn still running, so call again to keep waiting. When status is waiting, pendingRequests holds the agent's question or approval request with its options; this tool cannot answer it. Messages are bounded like ReadAgentSession. Requires view access to the session."
)]
pub struct WaitAgentSession {
    /// Session to wait on.
    #[schemars(
        description = "The agent session UUID from its mention, search result, or creation."
    )]
    pub session_id: uuid::Uuid,
    /// How long to wait.
    #[schemars(
        description = "Seconds to wait before returning with timedOut; default 120, at most 600."
    )]
    pub timeout_seconds: Option<u64>,
}

impl ToolAnnotated for WaitAgentSession {
    const ANNOTATIONS: ToolAnnotations = ToolAnnotations::read_only("Wait for agent session");
}

#[async_trait]
impl<R, A> AsyncTool<ReadAgentSessionContext<R, A>> for WaitAgentSession
where
    R: AgentSessionRepo + AgentSessionLogRepo + Clone + 'static,
    A: EntityAccessService,
{
    type Output = SessionWait;

    #[tracing::instrument(name = "agent_session.tool.wait", skip_all, fields(session_id = %self.session_id), err)]
    async fn call(
        &self,
        context: ServiceContext<ReadAgentSessionContext<R, A>>,
        request: RequestContext,
    ) -> ToolResult<Self::Output> {
        let access = context.access.generate_entity_access_receipt::<ViewAccessLevel>(
            &request.user_id, None, &self.session_id.to_string(), EntityType::AgentSession,
        ).await.map_err(|error| ToolCallError {
            description: "Unable to read this agent session. Check the session ID and that it is shared with you.".into(),
            internal_error: error.into(),
        })?;
        context
            .waiter
            .wait(
                access,
                self.timeout_seconds.map(std::time::Duration::from_secs),
            )
            .await
            .map_err(|error| ToolCallError {
                description: "Unable to load the agent session conversation.".into(),
                internal_error: error.into(),
            })
    }
}

#[cfg(test)]
mod test;
