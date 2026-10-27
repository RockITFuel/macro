use super::super::test_support::*;
use super::*;
use serde_json::{Value, json};

#[tokio::test]
async fn pages_all_candidates_and_redelivery_deduplicates_using_owner_not_actor() {
    let repo = Arc::new(Repo::default());
    repo.0.lock().unwrap().configurations = (0..5).map(|_| configuration()).collect();
    let access = Arc::new(Access::default());
    let service = EventAdmissionService::new(repo.clone(), access.clone(), 2.try_into().unwrap());
    let event = incoming();
    assert_eq!(
        service.ingest(&event).await.unwrap(),
        EventIngestionResult::Admitted { inserted: 5 }
    );
    assert_eq!(repo.0.lock().unwrap().pages.len(), 4);
    assert_eq!(
        service.ingest(&event).await.unwrap(),
        EventIngestionResult::Admitted { inserted: 0 }
    );
    assert_eq!(repo.0.lock().unwrap().pending.len(), 5);
    assert!(
        access
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|owner| owner == &user())
    );
}

#[tokio::test]
async fn partial_fanout_failure_is_not_acknowledged_and_replay_is_safe() {
    let repo = Arc::new(Repo::default());
    repo.0.lock().unwrap().configurations = vec![configuration(), configuration()];
    repo.0.lock().unwrap().fail_page = Some(2);
    let service = EventAdmissionService::new(
        repo.clone(),
        Arc::new(Access::default()),
        1.try_into().unwrap(),
    );
    let event = incoming();
    assert!(service.ingest(&event).await.is_err());
    assert_eq!(repo.0.lock().unwrap().pending.len(), 1);
    assert_eq!(
        service.ingest(&event).await.unwrap(),
        EventIngestionResult::Admitted { inserted: 1 }
    );
    assert_eq!(repo.0.lock().unwrap().pending.len(), 2);
}

#[tokio::test]
async fn coarse_candidates_are_rechecked_before_access_or_admission() {
    let repo = Arc::new(Repo::default());
    let mut configs: Vec<_> = (0..5).map(|_| configuration()).collect();
    configs[0].enabled = false;
    configs[1].activated_at = Utc::now() + chrono::Duration::days(1);
    configs[2].filters =
        serde_json::from_value(json!([{"events":["document.updated"],"ids":[]}])).unwrap();
    configs[3].owner = Owner::Team(generate_uuid_v7());
    configs[4].owner =
        Owner::from_principal_str("bot|01900000-0000-7000-8000-000000000004").unwrap();
    repo.0.lock().unwrap().configurations = configs;
    let access = Arc::new(Access::default());
    let service = EventAdmissionService::new(repo, access.clone(), 100.try_into().unwrap());
    assert_eq!(
        service.ingest(&incoming()).await.unwrap(),
        EventIngestionResult::Admitted { inserted: 0 }
    );
    assert!(access.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn permanent_rejections_do_not_query_candidates() {
    let repo = Arc::new(Repo::default());
    let service = EventAdmissionService::new(
        repo.clone(),
        Arc::new(Access::default()),
        10.try_into().unwrap(),
    );
    let mut event = incoming();
    event.schema_version = 2;
    assert_eq!(
        service.ingest(&event).await.unwrap(),
        EventIngestionResult::Rejected(EventRejection::UnsupportedSchema)
    );
    event.schema_version = 1;
    let super::super::super::event_trigger::EventPayload::Document(ref mut payload) = event.payload
    else {
        unreachable!()
    };
    *payload = serde_json::from_value(json!({"event_type":"document.updated", "metadata": {
        "document_id":generate_uuid_v7(),"share_permission_updated":false,
        "actor":"bot|01900000-0000-7000-8000-000000000004",
        "actor_user_id":"macro|event-actor@macro.com", "owner":"macro|event-actor@macro.com"
    }}))
    .unwrap();
    assert_eq!(
        service.ingest(&event).await.unwrap(),
        EventIngestionResult::Rejected(EventRejection::UnsafeAttribution)
    );
    assert!(repo.0.lock().unwrap().pages.is_empty());
}

#[tokio::test]
async fn denied_and_mismatched_receipts_skip_but_unavailable_access_defers_intake() {
    let repo = Arc::new(Repo::default());
    repo.0.lock().unwrap().configurations.push(configuration());
    let access = Arc::new(Access::default());
    let service = EventAdmissionService::new(repo.clone(), access.clone(), 10.try_into().unwrap());
    *access.denied.lock().unwrap() = true;
    assert_eq!(
        service.ingest(&incoming()).await.unwrap(),
        EventIngestionResult::Admitted { inserted: 0 }
    );
    *access.denied.lock().unwrap() = false;
    *access.override_receipt.lock().unwrap() = Some(capability(
        user(),
        &incoming().normalize().unwrap().reference,
    ));
    assert_eq!(
        service.ingest(&incoming()).await.unwrap(),
        EventIngestionResult::Admitted { inserted: 0 }
    );
    *access.unavailable.lock().unwrap() = true;
    assert!(service.ingest(&incoming()).await.is_err());
    assert!(repo.0.lock().unwrap().pending.is_empty());
}

#[tokio::test]
async fn mentions_mail_and_calls_only_admit_their_recipient_even_when_others_have_access() {
    use crate::domain::event_trigger::{EventPayload, MessageFact};
    for name in [
        "channel.mentioned",
        "email.message_received",
        "call.started",
        "call.ended",
    ] {
        let owner = user();
        let mut subscribed = configuration();
        subscribed.filters = serde_json::from_value(json!([{"events":[name]}])).unwrap();
        let mut other = subscribed.clone();
        other.action_id = generate_uuid_v7();
        other.owner = Owner::User(MacroUserIdStr::parse_from_str("macro|other@macro.com").unwrap());
        let action_id = subscribed.action_id;
        let repo = Arc::new(Repo::default());
        repo.0.lock().unwrap().configurations = vec![subscribed, other];
        repo.0
            .lock()
            .unwrap()
            .configurations
            .sort_by_key(|c| c.action_id);
        let access = Arc::new(Access::default());
        let service =
            EventAdmissionService::new(repo.clone(), access.clone(), 10.try_into().unwrap());
        let id = generate_uuid_v7();
        let payload = match name {
            "email.message_received" => EventPayload::Email(serde_json::from_value(json!({
                "event_type":"email.message_received", "metadata": {
                    "link_id": id, "owner": owner, "message_id": id, "thread_id": id,
                    "provider_message_id": "message", "provider_thread_id": "thread",
                    "is_new_thread": true, "to_emails": [], "attachment_count": 0, "is_spam_or_trash": false
                }
            })).unwrap()),
            "call.started" => EventPayload::Call(serde_json::from_value(json!({
                "event_type":"call.started", "metadata": {
                    "call_id": id, "channel_id": null, "created_by": owner,
                    "created_at": Utc::now(), "recording_enabled": false
                }
            })).unwrap()),
            "call.ended" => EventPayload::Call(serde_json::from_value(json!({
                "event_type":"call.record_archived", "metadata": {
                    "call_id": id, "channel_id": null, "created_by": "macro|host@macro.com",
                    "started_at": Utc::now(), "ended_at": Utc::now(), "duration_ms": 1_000,
                    "participant_count": 2, "participants": ["macro|host@macro.com", owner],
                    "has_recording": false, "archive_reason": "last_participant_left"
                }
            })).unwrap()),
            _ => EventPayload::Message(MessageFact::Mentioned(
                serde_json::from_value(json!({
                    "parent": {"type":"channel", "id": id}, "message_id": id, "root_id": id,
                    "sender": "macro|sender@macro.com", "content":"", "created_at": Utc::now(),
                    "mentioned": {"entity_type":"user", "entity_id": owner}
                }))
                .unwrap(),
            )),
        };
        let event = IncomingEvent {
            event_id: generate_uuid_v7(),
            schema_version: 1,
            payload,
        };
        assert_eq!(
            service.ingest(&event).await.unwrap(),
            EventIngestionResult::Admitted { inserted: 1 }
        );
        assert_eq!(repo.0.lock().unwrap().pending[0].action_id, action_id);
        assert_eq!(*access.calls.lock().unwrap(), vec![owner]);
        assert_eq!(
            service.ingest(&event).await.unwrap(),
            EventIngestionResult::Admitted { inserted: 0 }
        );
    }
}

/// Work recorded in the bot work chain, as one fixed cause.
struct FixedChain(agent_session::domain::work_chain::ChainCause);

impl WorkChain for FixedChain {
    fn cause<'a>(
        &'a self,
        _bot: bot_id::BotId,
        _user: &'a MacroUserIdStr<'static>,
        _at: DateTime<Utc>,
    ) -> agent_session::domain::work_chain::ChainFuture<'a, ChainCause> {
        let cause = self.0.clone();
        Box::pin(async move { Ok(cause) })
    }
    fn start(
        &self,
        _link: agent_session::domain::work_chain::ChainLink,
    ) -> agent_session::domain::work_chain::ChainFuture<'_, ()> {
        Box::pin(async { Ok(()) })
    }
    fn finish(
        &self,
        _id: Uuid,
        _at: DateTime<Utc>,
    ) -> agent_session::domain::work_chain::ChainFuture<'_, ()> {
        Box::pin(async { Ok(()) })
    }
    fn mention_sessions_since<'a>(
        &'a self,
        _bot: bot_id::BotId,
        _user: &'a MacroUserIdStr<'static>,
        _since: DateTime<Utc>,
    ) -> agent_session::domain::work_chain::ChainFuture<'a, u32> {
        Box::pin(async { Ok(0) })
    }
}

/// A document edit an agent made for the routine owner.
fn bot_edit() -> IncomingEvent {
    IncomingEvent {
        event_id: generate_uuid_v7(),
        schema_version: 1,
        payload: crate::domain::event_trigger::EventPayload::Document(
            serde_json::from_value(json!({
                "event_type": "document.updated", "metadata": {
                    "document_id": generate_uuid_v7(), "owner": user().as_ref(),
                    "actor": "bot|01900000-0000-7000-8000-000000000004",
                    "on_behalf_of": user().as_ref(), "share_permission_updated": false
                }
            }))
            .unwrap(),
        ),
    }
}

fn bot_configuration(bot_activity: Value) -> EventActionConfiguration {
    EventActionConfiguration {
        filters: serde_json::from_value(
            json!([{"events": ["document.updated"], "bot_activity": bot_activity}]),
        )
        .unwrap(),
        ..configuration()
    }
}

fn chain(hop: u8, routines: Vec<Uuid>) -> Arc<dyn WorkChain> {
    Arc::new(FixedChain(ChainCause { hop, routines }))
}

async fn admitted_hops(
    configuration: EventActionConfiguration,
    chain: Arc<dyn WorkChain>,
    earlier_bot_runs: u8,
) -> Vec<u8> {
    let repo = Arc::new(Repo::default());
    for _ in 0..earlier_bot_runs {
        repo.0.lock().unwrap().pending.push(PendingEventRun {
            hop: 1,
            ..pending(&configuration)
        });
    }
    repo.0.lock().unwrap().configurations = vec![configuration];
    let service = EventAdmissionService::new(
        repo.clone(),
        Arc::new(Access::default()),
        10.try_into().unwrap(),
    )
    .with_work_chain(chain);
    service.ingest(&bot_edit()).await.unwrap();
    let state = repo.0.lock().unwrap();
    state.pending[usize::from(earlier_bot_runs)..]
        .iter()
        .map(|run| run.hop)
        .collect()
}

#[tokio::test]
async fn bot_activity_starts_only_routines_that_accept_it() {
    let people_only = configuration();
    assert_eq!(
        admitted_hops(people_only, chain(0, vec![]), 0).await,
        Vec::<u8>::new()
    );
    assert_eq!(
        admitted_hops(bot_configuration(json!({})), chain(0, vec![]), 0).await,
        vec![1]
    );
}

#[tokio::test]
async fn a_bot_chain_stops_at_its_hop_limit() {
    let configuration = || bot_configuration(json!({"max_hops": 3}));
    assert_eq!(
        admitted_hops(configuration(), chain(2, vec![]), 0).await,
        vec![3]
    );
    assert_eq!(
        admitted_hops(configuration(), chain(3, vec![]), 0).await,
        Vec::<u8>::new()
    );
}

#[tokio::test]
async fn a_routine_never_runs_for_its_own_output() {
    let configuration = bot_configuration(json!({}));
    let own = chain(0, vec![configuration.action_id]);
    assert_eq!(admitted_hops(configuration, own, 0).await, Vec::<u8>::new());
}

#[tokio::test]
async fn bot_caused_runs_are_rate_limited_per_routine() {
    let configuration = || bot_configuration(json!({"max_runs_per_hour": 2}));
    assert_eq!(
        admitted_hops(configuration(), chain(0, vec![]), 1).await,
        vec![1]
    );
    assert_eq!(
        admitted_hops(configuration(), chain(0, vec![]), 2).await,
        Vec::<u8>::new()
    );
}

#[tokio::test]
async fn without_a_work_chain_bot_activity_is_rejected() {
    let repo = Arc::new(Repo::default());
    repo.0.lock().unwrap().configurations = vec![bot_configuration(json!({}))];
    let service =
        EventAdmissionService::new(repo, Arc::new(Access::default()), 10.try_into().unwrap());
    assert_eq!(
        service.ingest(&bot_edit()).await.unwrap(),
        EventIngestionResult::Rejected(EventRejection::UnsafeAttribution)
    );
}
