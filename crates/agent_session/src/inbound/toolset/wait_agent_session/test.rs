use std::sync::Arc;

use super::*;
use crate::domain::{read::SessionReader, sharing::SessionSharingService, wait::{SessionWaiter, TurnSignals}};
use crate::testing::InMemoryAgentSessionRepo;
use entity_access::domain::ports::NoOpEntityAccessService;
use macro_user_id::user_id::MacroUserIdStr;

#[tokio::test]
async fn failed_access_check_never_reads_the_session() {
    let repo = InMemoryAgentSessionRepo::new();
    let context = ServiceContext(ReadAgentSessionContext {
        service: Arc::new(SessionReader::new(repo.clone())),
        waiter: Arc::new(SessionWaiter::new(repo.clone(), TurnSignals::default())),
        sharing: Arc::new(SessionSharingService::new(repo.clone())),
        access: Arc::new(NoOpEntityAccessService),
    });
    let result = WaitAgentSession {
        session_id: uuid::Uuid::nil(),
        timeout_seconds: None,
    }
    .call(
        context,
        RequestContext::new(MacroUserIdStr::try_from_email("viewer@example.com").expect("viewer")),
    )
    .await;
    assert!(result.is_err());
    assert_eq!(repo.session_reads(), 0);
    assert_eq!(repo.log_reads(), 0);
}
