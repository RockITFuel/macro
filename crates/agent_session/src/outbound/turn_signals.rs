//! [`TurnSignals`] fed by the `agent_session_turn_state` NOTIFY.
//!
//! A trigger on `agent_session.turn_state` notifies on every change, so a
//! waiter on any replica hears a turn move on the replica managing it. One
//! listener connection per process, whatever the number of waiters. A dropped
//! connection loses the notifications sent while it was down, which costs a
//! waiter no more than its deadline: it re-reads the session then.

use sqlx::{PgPool, postgres::PgListener};

use crate::domain::{model::AgentSessionId, wait::TurnSignals};

/// The channel the `agent_session_turn_state_notify` trigger notifies on.
pub const TURN_STATE_CHANNEL: &str = "agent_session_turn_state";

/// Start listening. The listener runs until the pool closes.
pub fn spawn_pg_turn_signals(pool: PgPool) -> TurnSignals {
    let signals = TurnSignals::default();
    let sender = signals.clone();
    tokio::spawn(async move {
        while !pool.is_closed() {
            if let Err(error) = listen(&pool, &sender).await {
                tracing::warn!(error = %error, "agent session turn listener failed; reconnecting");
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });
    signals
}

async fn listen(pool: &PgPool, signals: &TurnSignals) -> Result<(), sqlx::Error> {
    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen(TURN_STATE_CHANNEL).await?;
    loop {
        let notification = listener.recv().await?;
        if let Ok(id) = notification.payload().parse::<uuid::Uuid>() {
            signals.notify(AgentSessionId::new_from_uuid(id));
        }
    }
}
