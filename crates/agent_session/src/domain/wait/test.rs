use std::sync::{Arc, Mutex};

use agent_fold::domain::model::{
    ElicitationOption, ElicitationProperty, ElicitationPropertySchema, ElicitationRequest,
    ElicitationRequestId, ElicitationSchema, PendingElicitation, PendingInteraction, TurnState,
};

use super::*;
use crate::domain::read::{SessionConversationMessage, SessionMessageRole};

fn conversation(messages: Vec<SessionConversationMessage>) -> SessionConversation {
    SessionConversation {
        session_id: uuid::Uuid::nil(),
        name: "Fix the build".to_owned(),
        owner_id: "macro|owner@example.com".to_owned(),
        bot_id: uuid::Uuid::nil(),
        is_archived: false,
        harness: "claude_code".to_owned(),
        model: "opus".to_owned(),
        status: "acp_ready".to_owned(),
        total_messages: messages.len(),
        truncated: false,
        messages,
    }
}

fn ask_user_question() -> PendingInteraction {
    PendingInteraction::Elicitation(PendingElicitation {
        request_id: ElicitationRequestId::Number(4),
        turn: 2,
        tool_call: None,
        message: "Which branch should I deploy?".to_owned(),
        request: ElicitationRequest::Form {
            schema: ElicitationSchema {
                title: None,
                description: None,
                properties: vec![ElicitationProperty {
                    name: "answer".to_owned(),
                    title: None,
                    description: None,
                    schema: ElicitationPropertySchema::String {
                        min_length: None,
                        max_length: None,
                        pattern: None,
                        format: None,
                        default: None,
                        options: vec![
                            ElicitationOption {
                                value: "main".to_owned(),
                                title: None,
                                description: None,
                                preview: None,
                            },
                            ElicitationOption {
                                value: "self-host".to_owned(),
                                title: Some("Self-host".to_owned()),
                                description: None,
                                preview: None,
                            },
                        ],
                        custom_field: None,
                    },
                }],
                required: vec!["answer".to_owned()],
            },
        },
    })
}

/// A session whose turn the test moves, read the way the waiter reads one.
#[derive(Clone)]
struct ScriptedSession {
    turn: Arc<Mutex<(TurnState, Vec<PendingInteraction>)>>,
    reads: Arc<Mutex<usize>>,
    read_done: Arc<tokio::sync::Notify>,
}

impl ScriptedSession {
    fn new(turn: TurnState) -> Self {
        Self {
            turn: Arc::new(Mutex::new((turn, Vec::new()))),
            reads: Arc::new(Mutex::new(0)),
            read_done: Arc::new(tokio::sync::Notify::new()),
        }
    }

    fn set(&self, turn: TurnState, pending: Vec<PendingInteraction>) {
        *self.turn.lock().expect("turn") = (turn, pending);
    }

    fn read(&self) -> SessionWait {
        *self.reads.lock().expect("reads") += 1;
        let (turn, pending) = self.turn.lock().expect("turn").clone();
        self.read_done.notify_one();
        settle(turn, &pending, conversation(Vec::new()))
    }

    fn reads(&self) -> usize {
        *self.reads.lock().expect("reads")
    }
}

#[tokio::test(start_paused = true)]
async fn returns_at_once_when_the_session_is_already_idle() {
    let session = ScriptedSession::new(TurnState::Idle);
    let signals = TurnSignals::default();
    let start = tokio::time::Instant::now();
    let result = wait_until_settled(
        || std::future::ready(Ok(session.read())),
        signals.subscribe(AgentSessionId::TEST_A),
        start + DEFAULT_WAIT,
    )
    .await
    .expect("wait");
    assert_eq!(result.status, SessionWaitStatus::Idle);
    assert!(!result.timed_out);
    assert_eq!(session.reads(), 1);
    assert_eq!(tokio::time::Instant::now(), start);
}

#[tokio::test(start_paused = true)]
async fn a_finished_turn_wakes_the_waiter_before_its_deadline() {
    let session = ScriptedSession::new(TurnState::Running);
    let signals = TurnSignals::default();
    let subscription = signals.subscribe(AgentSessionId::TEST_A);
    let deadline = tokio::time::Instant::now() + DEFAULT_WAIT;
    let waiter = tokio::spawn({
        let session = session.clone();
        async move {
            wait_until_settled(
                || std::future::ready(Ok(session.read())),
                subscription,
                deadline,
            )
            .await
        }
    });
    session.read_done.notified().await;
    signals.notify(AgentSessionId::TEST_B);
    session.set(TurnState::Idle, Vec::new());
    signals.notify(AgentSessionId::TEST_A);
    let result = waiter.await.expect("join").expect("wait");
    assert_eq!(result.status, SessionWaitStatus::Idle);
    assert!(!result.timed_out);
    assert_eq!(session.reads(), 2);
    assert!(tokio::time::Instant::now() < deadline);
}

#[tokio::test(start_paused = true)]
async fn a_question_wakes_the_waiter_with_the_pending_question() {
    let session = ScriptedSession::new(TurnState::Running);
    let signals = TurnSignals::default();
    let subscription = signals.subscribe(AgentSessionId::TEST_A);
    let deadline = tokio::time::Instant::now() + DEFAULT_WAIT;
    let waiter = tokio::spawn({
        let session = session.clone();
        async move {
            wait_until_settled(
                || std::future::ready(Ok(session.read())),
                subscription,
                deadline,
            )
            .await
        }
    });
    session.read_done.notified().await;
    session.set(TurnState::Blocked, vec![ask_user_question()]);
    signals.notify(AgentSessionId::TEST_A);
    let result = waiter.await.expect("join").expect("wait");
    assert_eq!(result.status, SessionWaitStatus::Waiting);
    assert_eq!(
        result.pending_requests,
        vec![PendingRequest {
            kind: PendingRequestKind::Question,
            turn: 2,
            message: "Which branch should I deploy?".to_owned(),
            options: vec!["main".to_owned(), "Self-host".to_owned()],
        }]
    );
    assert!(tokio::time::Instant::now() < deadline);
}

#[tokio::test(start_paused = true)]
async fn a_turn_still_running_at_the_deadline_times_out() {
    let session = ScriptedSession::new(TurnState::Running);
    let signals = TurnSignals::default();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    let result = wait_until_settled(
        || std::future::ready(Ok(session.read())),
        signals.subscribe(AgentSessionId::TEST_A),
        deadline,
    )
    .await
    .expect("wait");
    assert_eq!(result.status, SessionWaitStatus::Running);
    assert!(result.timed_out);
    assert_eq!(tokio::time::Instant::now(), deadline);
}

#[test]
fn a_failed_last_turn_reports_its_error() {
    let result = settle(
        TurnState::Idle,
        &[],
        conversation(vec![
            SessionConversationMessage {
                turn: 1,
                role: SessionMessageRole::User,
                content: "run the migration".to_owned(),
                failure: None,
                truncated: false,
            },
            SessionConversationMessage {
                turn: 1,
                role: SessionMessageRole::Agent,
                content: String::new(),
                failure: Some("model overloaded".to_owned()),
                truncated: false,
            },
        ]),
    );
    assert_eq!(result.status, SessionWaitStatus::Failed);
    assert_eq!(result.failure.as_deref(), Some("model overloaded"));
}

#[test]
fn a_disconnected_runtime_is_not_running() {
    let result = settle(TurnState::Disconnected, &[], conversation(Vec::new()));
    assert_eq!(result.status, SessionWaitStatus::Disconnected);
    assert!(result.pending_requests.is_empty());
}
