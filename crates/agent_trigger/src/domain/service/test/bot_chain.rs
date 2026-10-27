//! A bot's post that mentions another bot, bounded by the work chain.

use std::sync::Mutex;

use agent_session::domain::work_chain::{ChainCause, ChainFuture, ChainLink, WorkChain};
use chrono::DateTime;

use super::*;

/// One fixed cause and rate, recording every link started.
struct MemoryChain {
    cause: ChainCause,
    recent: u32,
    links: Mutex<Vec<ChainLink>>,
}

impl WorkChain for MemoryChain {
    fn cause<'a>(
        &'a self,
        _bot: BotId,
        _user: &'a MacroUserIdStr<'static>,
        _at: DateTime<Utc>,
    ) -> ChainFuture<'a, ChainCause> {
        let cause = self.cause.clone();
        Box::pin(async move { Ok(cause) })
    }
    fn start(&self, link: ChainLink) -> ChainFuture<'_, ()> {
        self.links.lock().unwrap().push(link);
        Box::pin(async { Ok(()) })
    }
    fn finish(&self, _id: Uuid, _at: DateTime<Utc>) -> ChainFuture<'_, ()> {
        Box::pin(async { Ok(()) })
    }
    fn mention_sessions_since<'a>(
        &'a self,
        _bot: BotId,
        _user: &'a MacroUserIdStr<'static>,
        _since: DateTime<Utc>,
    ) -> ChainFuture<'a, u32> {
        let recent = self.recent;
        Box::pin(async move { Ok(recent) })
    }
}

fn chain(hop: u8, recent: u32) -> Arc<MemoryChain> {
    Arc::new(MemoryChain {
        cause: ChainCause {
            hop,
            routines: Vec::new(),
        },
        recent,
        links: Mutex::new(Vec::new()),
    })
}

/// TEST_B's post for the test user that mentions TEST_A.
fn bot_post() -> MessagePostedMetadata {
    MessagePostedMetadata {
        sender: ChannelSender::new_from_bot(BotId::TEST_B),
        triggered_by: Some(user().as_ref().to_owned()),
        ..message(vec![mention_of(BotId::TEST_A), mention_of(BotId::TEST_B)])
    }
}

/// Evaluate `posted` where TEST_A is the user's private agent.
async fn evaluate(posted: &MessagePostedMetadata, chain: Arc<MemoryChain>) -> Vec<TriggerDecision> {
    let mut sessions = MockAgentSessionRepo::new();
    sessions
        .expect_find_for_thread()
        .returning(|_, _| Box::pin(async { Ok(ThreadSession::None) }));
    let mut bots = MockAgentBotLookup::new();
    bots.expect_get_agent()
        .returning(|bot_id| Box::pin(async move { Ok(Some(private_agent(bot_id))) }));
    let (replies, judge) = no_implicit();
    service(sessions, bots, replies, judge)
        .with_work_chain(chain)
        .evaluate(posted)
        .await
        .expect("evaluate message")
}

#[tokio::test]
async fn a_bot_mention_starts_the_mentioned_bot_one_hop_later() {
    let chain = chain(1, 0);
    let events = evaluate(&bot_post(), chain.clone()).await;

    assert!(matches!(
        events.as_slice(),
        [TriggerDecision::Open { bot_id, .. }] if *bot_id == BotId::TEST_A
    ));
    let links = chain.links.lock().unwrap();
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].bot, BotId::TEST_A);
    assert_eq!(links[0].user, user());
    assert_eq!(links[0].hop, 2);
    assert_eq!(links[0].routine_id, None);
}

#[tokio::test]
async fn a_bot_mention_at_the_hop_limit_starts_nothing() {
    let chain = chain(DEFAULT_MAX_HOPS, 0);
    assert!(evaluate(&bot_post(), chain.clone()).await.is_empty());
    assert!(chain.links.lock().unwrap().is_empty());
}

#[tokio::test]
async fn bot_mentions_are_rate_limited_per_mentioned_bot() {
    let chain = chain(0, MENTION_SESSIONS_PER_HOUR);
    assert!(evaluate(&bot_post(), chain.clone()).await.is_empty());
    assert!(chain.links.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_bot_acting_for_nobody_starts_nothing() {
    let posted = MessagePostedMetadata {
        triggered_by: None,
        ..bot_post()
    };
    let chain = chain(0, 0);
    assert!(evaluate(&posted, chain.clone()).await.is_empty());
    assert!(chain.links.lock().unwrap().is_empty());
}
