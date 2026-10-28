//! Wait for a session's current turn to settle: finish, ask the user, or fail.
//!
//! A waiter subscribes to [`TurnSignals`] before it reads, then re-reads the
//! session each time its turn state changes, until the turn is no longer
//! running or the deadline passes. Signals carry only the session id; the
//! durable log is the truth every read folds.

use std::time::Duration;

use agent_fold::domain::model::{
    ElicitationPropertySchema, ElicitationRequest, PendingInteraction, TurnState,
};
use entity_access::domain::models::{EntityAccessReceipt, ViewAccessLevel};
use serde::Serialize;
use tokio::sync::broadcast;

use super::{
    error::Result,
    model::AgentSessionId,
    ports::{AgentSessionLogRepo, AgentSessionRepo},
    read::{SessionConversation, SessionReader, conversation, session_id},
};

/// How long a wait lasts when the caller names no timeout.
pub const DEFAULT_WAIT: Duration = Duration::from_secs(120);
/// The longest wait a caller may ask for; longer requests are shortened.
pub const MAX_WAIT: Duration = Duration::from_secs(600);

/// Where a session's current turn stands for someone waiting on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum SessionWaitStatus {
    /// The agent is still working on the turn.
    Running,
    /// No turn is open: the last one finished, or none was ever prompted.
    Idle,
    /// The turn is blocked on a question, permission, or tool approval.
    Waiting,
    /// The last turn ended with a runtime error.
    Failed,
    /// The runtime disconnected; nothing will move until the session resumes.
    Disconnected,
}

/// What a request blocking the turn asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum PendingRequestKind {
    /// The agent asked the user a question (`AskUser`, a form, or a URL).
    Question,
    /// The agent asked permission to run a tool call.
    Permission,
    /// An MCP tool call is held until the session's owner approves it.
    ToolApproval,
}

/// One request the turn is blocked on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PendingRequest {
    /// What kind of answer it needs.
    pub kind: PendingRequestKind,
    /// The turn that asked.
    pub turn: u32,
    /// The question, or what needs approval, in prose.
    pub message: String,
    /// The choices offered, when the request offers fixed ones.
    pub options: Vec<String>,
}

/// A session's state when a wait ended, with its latest messages.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct SessionWait {
    /// Where the current turn stands.
    pub status: SessionWaitStatus,
    /// Whether the wait ended at its deadline with the turn still running.
    pub timed_out: bool,
    /// Requests the turn is blocked on; empty unless `status` is `waiting`.
    pub pending_requests: Vec<PendingRequest>,
    /// The runtime error that ended the last turn, when `status` is `failed`.
    pub failure: Option<String>,
    /// The latest messages, bounded as `ReadAgentSession` bounds them.
    pub conversation: SessionConversation,
}

/// Wakes waiters when a session's turn state changes, fanned out in process.
///
/// The Postgres adapter feeds it from the `agent_session_turn_state` NOTIFY;
/// tests and single-process tooling call [`Self::notify`] directly.
#[derive(Clone)]
pub struct TurnSignals {
    changed: broadcast::Sender<AgentSessionId>,
}

impl Default for TurnSignals {
    fn default() -> Self {
        Self {
            changed: broadcast::channel(256).0,
        }
    }
}

impl TurnSignals {
    /// Wake whoever waits on `session`.
    pub fn notify(&self, session: AgentSessionId) {
        // Nobody listening is not an error: no one is waiting.
        let _ = self.changed.send(session);
    }

    /// Hear about `session`'s turn changes from now on.
    #[must_use]
    pub fn subscribe(&self, session: AgentSessionId) -> TurnSubscription {
        TurnSubscription {
            session,
            changed: self.changed.subscribe(),
        }
    }
}

/// A waiter on one session among every change the process hears.
pub struct TurnSubscription {
    session: AgentSessionId,
    changed: broadcast::Receiver<AgentSessionId>,
}

impl TurnSubscription {
    /// Resolves when the session's turn may have changed.
    pub async fn changed(&mut self) {
        loop {
            match self.changed.recv().await {
                Ok(session) if session == self.session => return,
                Ok(_) => {}
                // Missed some: this session may be among them.
                Err(broadcast::error::RecvError::Lagged(_)) => return,
                // The listener is gone; the deadline still ends the wait.
                Err(broadcast::error::RecvError::Closed) => std::future::pending().await,
            }
        }
    }
}

/// Waits on sessions the caller may view.
pub struct SessionWaiter<R> {
    reader: SessionReader<R>,
    signals: TurnSignals,
}

impl<R> SessionWaiter<R> {
    /// Compose the session repository and the process's turn signals.
    pub fn new(repo: R, signals: TurnSignals) -> Self {
        Self {
            reader: SessionReader::new(repo),
            signals,
        }
    }
}

impl<R: AgentSessionRepo + AgentSessionLogRepo> SessionWaiter<R> {
    /// Wait up to `timeout` (default [`DEFAULT_WAIT`], at most [`MAX_WAIT`])
    /// for the session named by a verified view-access capability to stop
    /// running. Returns at once when it is not running.
    #[tracing::instrument(name = "agent_session.wait", skip_all, fields(session_id = %access.entity().entity_id), err)]
    pub async fn wait(
        &self,
        access: EntityAccessReceipt<ViewAccessLevel>,
        timeout: Option<Duration>,
    ) -> Result<SessionWait> {
        let session = session_id(&access)?;
        let subscription = self.signals.subscribe(session);
        let deadline = tokio::time::Instant::now() + timeout.unwrap_or(DEFAULT_WAIT).min(MAX_WAIT);
        let (reader, access) = (&self.reader, &access);
        wait_until_settled(
            move || async move {
                let (session, fold) = reader.fold(access).await?;
                let turn = fold.metadata().turn;
                let pending = fold.metadata().pending_interactions.clone();
                let messages = conversation(&session, fold.into_messages(), None);
                Ok(settle(turn, &pending, messages))
            },
            subscription,
            deadline,
        )
        .await
    }
}

/// Read until the turn is not running, re-reading on each signal; at the
/// deadline, read once more and report whether it is still running.
pub(crate) async fn wait_until_settled<Read, Reading>(
    mut read: Read,
    mut subscription: TurnSubscription,
    deadline: tokio::time::Instant,
) -> Result<SessionWait>
where
    Read: FnMut() -> Reading,
    Reading: Future<Output = Result<SessionWait>>,
{
    loop {
        let state = read().await?;
        if state.status != SessionWaitStatus::Running {
            return Ok(state);
        }
        tokio::select! {
            () = subscription.changed() => {}
            () = tokio::time::sleep_until(deadline) => {
                let mut state = read().await?;
                state.timed_out = state.status == SessionWaitStatus::Running;
                return Ok(state);
            }
        }
    }
}

/// The wait result for a folded session.
pub(crate) fn settle(
    turn: TurnState,
    pending: &[PendingInteraction],
    conversation: SessionConversation,
) -> SessionWait {
    let failure = conversation
        .messages
        .last()
        .filter(|_| turn == TurnState::Idle)
        .and_then(|message| message.failure.clone());
    let status = match turn {
        TurnState::Starting | TurnState::Running | TurnState::Stopping => {
            SessionWaitStatus::Running
        }
        TurnState::Blocked => SessionWaitStatus::Waiting,
        TurnState::Disconnected => SessionWaitStatus::Disconnected,
        TurnState::Idle if failure.is_some() => SessionWaitStatus::Failed,
        TurnState::Idle => SessionWaitStatus::Idle,
    };
    let pending_requests = if status == SessionWaitStatus::Waiting {
        pending.iter().map(pending_request).collect()
    } else {
        Vec::new()
    };
    SessionWait {
        status,
        timed_out: false,
        pending_requests,
        failure,
        conversation,
    }
}

fn pending_request(pending: &PendingInteraction) -> PendingRequest {
    match pending {
        PendingInteraction::Elicitation(question) => PendingRequest {
            kind: PendingRequestKind::Question,
            turn: question.turn,
            message: question.message.clone(),
            options: question_options(&question.request),
        },
        PendingInteraction::Permission(permission) => PendingRequest {
            kind: PendingRequestKind::Permission,
            turn: permission.turn,
            message: format!("Permission to run tool call {}", permission.tool_call.0),
            options: permission
                .options
                .iter()
                .map(|option| option.name.clone())
                .collect(),
        },
        PendingInteraction::ToolApproval(approval) => PendingRequest {
            kind: PendingRequestKind::ToolApproval,
            turn: approval.turn,
            message: format!(
                "{} on {} needs the session owner's approval",
                approval.tool_name, approval.server_name
            ),
            options: Vec::new(),
        },
    }
}

/// The labels of a question's fixed choices, across its fields.
fn question_options(request: &ElicitationRequest) -> Vec<String> {
    let schema = match request {
        ElicitationRequest::Form { schema } => schema,
        ElicitationRequest::UserTool { schema, .. } => schema.as_ref(),
        ElicitationRequest::Url { .. } | ElicitationRequest::Unrecognized { .. } => {
            return Vec::new();
        }
    };
    schema
        .properties
        .iter()
        .flat_map(|property| match &property.schema {
            ElicitationPropertySchema::String { options, .. }
            | ElicitationPropertySchema::MultiSelect { options, .. } => options.as_slice(),
            _ => &[],
        })
        .map(|option| option.title.clone().unwrap_or_else(|| option.value.clone()))
        .collect()
}

#[cfg(test)]
mod test;
