//! Normalize once, then durably admit each eligible user-owned action.

use std::sync::Arc;

use agent_session::domain::work_chain::{ChainCause, WorkChain};
use chrono::TimeDelta;

use super::super::event_trigger::{EventOrigin, NormalizedEvent};
use super::*;

#[cfg(test)]
mod test;

/// The window `BotActivity::max_runs_per_hour` counts over.
const BOT_RUN_RATE_WINDOW: TimeDelta = TimeDelta::hours(1);

/// Keyset paging bounds memory without truncating an event's fan-out. A failed
/// page or access lookup leaves intake unacknowledged; redelivery deduplicates
/// any earlier inserts.
pub struct EventAdmissionService<R, A> {
    repository: Arc<R>,
    access: Arc<A>,
    page_size: PageSize,
    /// Without it, bot activity starts nothing.
    chain: Option<Arc<dyn WorkChain>>,
}

impl<R, A> EventAdmissionService<R, A> {
    pub fn new(repository: Arc<R>, access: Arc<A>, page_size: PageSize) -> Self {
        Self {
            repository,
            access,
            page_size,
            chain: None,
        }
    }

    /// Attribute bot activity to the work that caused it, so filters that
    /// accept bot activity can start runs within their limits.
    pub fn with_work_chain(mut self, chain: Arc<dyn WorkChain>) -> Self {
        self.chain = Some(chain);
        self
    }
}

impl<R: EventRunRepository, A> EventAdmissionService<R, A> {
    /// The hop of the run bot activity starts for `configuration`, or `None`
    /// when no matching filter accepts bot activity, the activity came from
    /// the routine's own run, the chain is at its limit, or the routine
    /// reached its hourly limit of bot-caused runs.
    async fn bot_run_hop(
        &self,
        configuration: &EventActionConfiguration,
        event: &EventReference,
        cause: &ChainCause,
    ) -> Result<Option<u8>, Report> {
        let Some(policy) = configuration.filters.bot_activity(event) else {
            return Ok(None);
        };
        if cause.produced_by(configuration.action_id) {
            return Ok(None);
        }
        let Some(hop) = cause.next_hop(policy.max_hops()) else {
            tracing::info!(
                action_id = %configuration.action_id,
                hop = cause.hop,
                "bot chain reached its hop limit"
            );
            return Ok(None);
        };
        let recent = self
            .repository
            .bot_runs_since(configuration.action_id, Utc::now() - BOT_RUN_RATE_WINDOW)
            .await?;
        if recent >= u32::from(policy.max_runs_per_hour()) {
            tracing::info!(
                action_id = %configuration.action_id,
                recent,
                "routine reached its hourly limit of bot-caused runs"
            );
            return Ok(None);
        }
        Ok(Some(hop))
    }
}

impl<R: EventRunRepository, A: CurrentOwnerAccess> EventIngestion for EventAdmissionService<R, A> {
    async fn ingest(&self, incoming: &IncomingEvent) -> Result<EventIngestionResult, Report> {
        let NormalizedEvent {
            reference: event,
            origin,
        } = match incoming.normalize() {
            Ok(event) => event,
            Err(reason) => return Ok(EventIngestionResult::Rejected(reason)),
        };
        let cause = match (&origin, &self.chain) {
            (EventOrigin::Person, _) => None,
            (EventOrigin::Bot { bot, user }, Some(chain)) => Some(
                chain
                    .cause(*bot, user, event.published_at())
                    .await
                    .map_err(|error| rootcause::report!("read bot work chain: {error:#}"))?,
            ),
            (EventOrigin::Bot { .. }, None) => {
                return Ok(EventIngestionResult::Rejected(
                    EventRejection::UnsafeAttribution,
                ));
            }
        };
        let mut after = None;
        let mut inserted = 0;
        loop {
            let candidates = self
                .repository
                .candidate_actions(&event, after, self.page_size)
                .await?;
            let Some(next_after) = candidates.next_after else {
                if !candidates.configurations.is_empty() {
                    return Err(rootcause::report!("event candidate page has no cursor"));
                }
                return Ok(EventIngestionResult::Admitted { inserted });
            };
            if after.is_some_and(|id| next_after <= id) {
                return Err(rootcause::report!("event candidate cursor did not advance"));
            }
            for configuration in candidates.configurations {
                // Enforce forward progress even for a broken repository adapter.
                if after.is_some_and(|id| configuration.action_id <= id)
                    || configuration.action_id > next_after
                {
                    return Err(rootcause::report!("event candidate page is not ordered"));
                }
                after = Some(configuration.action_id);
                let pending = PendingEventRun {
                    action_id: configuration.action_id,
                    revision: configuration.revision,
                    event: event.clone(),
                    admitted_at: Utc::now(),
                    hop: 0,
                };
                if configuration.check_pending(&pending).is_err() {
                    continue;
                }
                let Owner::User(owner) = &configuration.owner else {
                    continue;
                };
                if !incoming.is_for_owner(owner) {
                    continue;
                }
                let Some(access) = self.access.authorize(owner, &event).await? else {
                    continue;
                };
                if AuthorizedEventRun::prepare(pending, &configuration, access).is_err() {
                    continue;
                }
                let hop = match &cause {
                    None => 0,
                    Some(cause) => match self.bot_run_hop(&configuration, &event, cause).await? {
                        Some(hop) => hop,
                        None => continue,
                    },
                };
                if self
                    .repository
                    .admit(configuration.action_id, configuration.revision, &event, hop)
                    .await?
                    == AdmissionResult::Admitted
                {
                    inserted += 1;
                }
            }
            after = Some(next_after);
        }
    }
}
