//! Bounds chains of bots triggering bots.
//!
//! Activity a bot causes (a channel post, a document edit) can start more bot
//! work - a routine run or a session for a mentioned bot - which can cause more
//! activity. Every piece of such work records its hop, the bot hand-offs since
//! the last human action, for the bot and user it acts as and the window in
//! which it may act. Activity by that bot for that user inside a window
//! descends from that work, so the next piece of work starts one hop later and
//! a chain stops at a limit.
//!
//! Work nothing recorded descends from a person: hop 0. Attribution by bot,
//! user and time is deliberately coarse: two overlapping pieces of work for the
//! same bot and user both count as the cause, which can only stop a chain
//! early, never let it run longer.

use std::future::Future;
use std::pin::Pin;

use bot_id::BotId;
use chrono::{DateTime, TimeDelta, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;

#[cfg(test)]
mod test;

/// Hops a chain may take unless configured otherwise.
pub const DEFAULT_MAX_HOPS: u8 = 3;
/// The most hops any chain may be configured to take.
pub const MAX_HOPS: u8 = 5;
/// How long a session a bot mention started counts as the cause of the
/// mentioned bot's activity. Its turns have no end the trigger can see.
pub const MENTION_WINDOW: TimeDelta = TimeDelta::minutes(15);
/// Sessions bot mentions may start per mentioned bot and user per hour.
pub const MENTION_SESSIONS_PER_HOUR: u32 = 20;

/// One piece of bot work and the window in which it may act.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChainLink {
    /// Identifies the link, so its window can be closed when the work ends.
    pub id: Uuid,
    /// The bot doing the work.
    pub bot: BotId,
    /// The user the bot acts for.
    pub user: MacroUserIdStr<'static>,
    /// Bot hand-offs since the last human action.
    pub hop: u8,
    /// The routine running, when the work is a routine run.
    pub routine_id: Option<Uuid>,
    /// When the work started.
    pub started_at: DateTime<Utc>,
    /// When the work stops acting, at the latest.
    pub ends_at: DateTime<Utc>,
}

/// The recorded work a bot's activity may descend from.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChainCause {
    /// The highest hop among that work; 0 when none was recorded.
    pub hop: u8,
    /// Routines whose runs may have produced the activity.
    pub routines: Vec<Uuid>,
}

impl ChainCause {
    /// The hop of work this activity starts, or `None` when that would take the
    /// chain past `max_hops`.
    pub fn next_hop(&self, max_hops: u8) -> Option<u8> {
        let hop = self.hop.saturating_add(1);
        (hop <= max_hops).then_some(hop)
    }

    /// Whether a run of `routine` may have produced the activity.
    pub fn produced_by(&self, routine: Uuid) -> bool {
        self.routines.contains(&routine)
    }
}

/// Boxed so the ledger can be shared as a trait object.
pub type ChainFuture<'a, T> = Pin<Box<dyn Future<Output = anyhow::Result<T>> + Send + 'a>>;

/// Durable record of bot work, read to attribute bot activity.
pub trait WorkChain: Send + Sync + 'static {
    /// The recorded work of `bot` for `user` whose window contains `at`.
    fn cause<'a>(
        &'a self,
        bot: BotId,
        user: &'a MacroUserIdStr<'static>,
        at: DateTime<Utc>,
    ) -> ChainFuture<'a, ChainCause>;

    /// Record work that starts now. Recording the same link again is a no-op.
    fn start(&self, link: ChainLink) -> ChainFuture<'_, ()>;

    /// Close a link's window at `at`, when its work ended before the window did.
    fn finish(&self, id: Uuid, at: DateTime<Utc>) -> ChainFuture<'_, ()>;

    /// Sessions bot mentions started for `bot` and `user` since `since`.
    fn mention_sessions_since<'a>(
        &'a self,
        bot: BotId,
        user: &'a MacroUserIdStr<'static>,
        since: DateTime<Utc>,
    ) -> ChainFuture<'a, u32>;
}
