//! Postgres ledger of bot work for [`WorkChain`].

use anyhow::Context;
use bot_id::BotId;
use chrono::{DateTime, TimeDelta, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;
use sqlx::PgPool;

use crate::domain::work_chain::{ChainCause, ChainFuture, ChainLink, WorkChain};

#[cfg(test)]
mod test;

/// Activity is published shortly after the work that caused it acted, so a
/// window still counts this long after it closed.
const PUBLISH_GRACE: TimeDelta = TimeDelta::seconds(30);
/// Links older than this can no longer be a cause and are pruned.
const RETENTION: TimeDelta = TimeDelta::days(1);

/// [`WorkChain`] over the `agent_work_chain` table.
#[derive(Clone)]
pub struct PgWorkChain {
    pool: PgPool,
}

impl PgWorkChain {
    /// Read and record links in `pool`.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl WorkChain for PgWorkChain {
    fn cause<'a>(
        &'a self,
        bot: BotId,
        user: &'a MacroUserIdStr<'static>,
        at: DateTime<Utc>,
    ) -> ChainFuture<'a, ChainCause> {
        Box::pin(async move {
            let row = sqlx::query!(
                r#"
                SELECT COALESCE(MAX(hop), 0)::SMALLINT AS "hop!",
                       COALESCE(array_agg(DISTINCT routine_id) FILTER (WHERE routine_id IS NOT NULL), '{}') AS "routines!"
                FROM agent_work_chain
                WHERE user_id = $1 AND bot_id = $2 AND ends_at >= $3 AND started_at <= $4
                "#,
                user.as_ref(),
                bot.as_uuid(),
                at - PUBLISH_GRACE,
                at,
            )
            .fetch_one(&self.pool)
            .await
            .context("read work chain cause")?;
            Ok(ChainCause {
                hop: u8::try_from(row.hop).unwrap_or(u8::MAX),
                routines: row.routines,
            })
        })
    }

    fn start(&self, link: ChainLink) -> ChainFuture<'_, ()> {
        Box::pin(async move {
            let mut tx = self.pool.begin().await.context("begin work chain start")?;
            sqlx::query!(
                r#"
                INSERT INTO agent_work_chain (id, bot_id, user_id, hop, routine_id, started_at, ends_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO NOTHING
                "#,
                link.id,
                link.bot.as_uuid(),
                link.user.as_ref(),
                i16::from(link.hop),
                link.routine_id,
                link.started_at,
                link.ends_at,
            )
            .execute(&mut *tx)
            .await
            .context("record work chain link")?;
            sqlx::query!(
                "DELETE FROM agent_work_chain WHERE user_id = $1 AND bot_id = $2 AND ends_at < $3",
                link.user.as_ref(),
                link.bot.as_uuid(),
                link.started_at - RETENTION,
            )
            .execute(&mut *tx)
            .await
            .context("prune work chain links")?;
            tx.commit().await.context("commit work chain start")?;
            Ok(())
        })
    }

    fn finish(&self, id: Uuid, at: DateTime<Utc>) -> ChainFuture<'_, ()> {
        Box::pin(async move {
            sqlx::query!(
                "UPDATE agent_work_chain SET ends_at = GREATEST(started_at, $2) WHERE id = $1 AND ends_at > $2",
                id,
                at,
            )
            .execute(&self.pool)
            .await
            .context("close work chain link")?;
            Ok(())
        })
    }

    fn mention_sessions_since<'a>(
        &'a self,
        bot: BotId,
        user: &'a MacroUserIdStr<'static>,
        since: DateTime<Utc>,
    ) -> ChainFuture<'a, u32> {
        Box::pin(async move {
            let count = sqlx::query_scalar!(
                r#"
                SELECT COUNT(*) AS "count!" FROM agent_work_chain
                WHERE user_id = $1 AND bot_id = $2 AND routine_id IS NULL AND hop > 0 AND started_at >= $3
                "#,
                user.as_ref(),
                bot.as_uuid(),
                since,
            )
            .fetch_one(&self.pool)
            .await
            .context("count mention sessions")?;
            Ok(u32::try_from(count).unwrap_or(u32::MAX))
        })
    }
}
