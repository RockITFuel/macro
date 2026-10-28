//! Connection-gateway notifier for web clients that read Soup over REST.

#[cfg(test)]
mod test;

use std::sync::Arc;

use connection::domain::ports::ConnectionGateway;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use rootcause::{Report, compat::IntoRootcause as _, prelude::ResultExt as _};
use serde_json::json;

use crate::domain::{models::Patch, ports::SoupRealtimeLiveNotifier};

/// Gateway message type the web client turns into list and entity refetches.
pub const SOUP_PATCH_MESSAGE_TYPE: &str = "soup_patch";

/// Sends each patch's recipients a `soup_patch` message naming the entity.
///
/// Only entity types whose web views have no other live channel are sent:
/// documents (tasks among them) and initiatives (projects). Email, channels,
/// chats and calls keep their own gateway messages.
pub struct ConnectionGatewayLiveNotifier<G> {
    gateway: Arc<G>,
}

impl<G> ConnectionGatewayLiveNotifier<G> {
    /// Creates a notifier sending through `gateway`.
    pub fn new(gateway: Arc<G>) -> Self {
        Self { gateway }
    }
}

impl<G> SoupRealtimeLiveNotifier for ConnectionGatewayLiveNotifier<G>
where
    G: ConnectionGateway,
{
    #[tracing::instrument(skip(self, recipients), fields(recipient_count = recipients.len()), err)]
    async fn notify(
        &self,
        recipients: &[MacroUserIdStr<'static>],
        patch: &Patch<Entity<'static>>,
    ) -> Result<(), Report> {
        let Some(message) = soup_patch_message(patch) else {
            return Ok(());
        };
        self.gateway
            .batch_send_message(recipients, SOUP_PATCH_MESSAGE_TYPE, message)
            .await
            .map_err(|error| Into::<anyhow::Error>::into(error).into_rootcause())
            .context("failed to send Soup patch through the connection gateway")?;
        Ok(())
    }
}

/// The message body for `patch`, or `None` when its entity type is not sent.
fn soup_patch_message(patch: &Patch<Entity<'static>>) -> Option<serde_json::Value> {
    let entity = patch.value();
    if !matches!(
        entity.entity_type,
        EntityType::Document | EntityType::Initiative
    ) {
        return None;
    }
    let operation = match patch {
        Patch::Updated(_) => "updated",
        Patch::Deleted(_) => "deleted",
    };
    Some(json!({
        "operation": operation,
        "entityType": entity.entity_type,
        "entityId": entity.entity_id,
    }))
}
