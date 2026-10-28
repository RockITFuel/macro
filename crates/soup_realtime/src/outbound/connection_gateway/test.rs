use std::sync::Mutex;

use connection::domain::models::InvalidationEvent;
use macro_user_id::{lowercased::Lowercase, user_id::MacroUserId};
use serde_json::json;

use super::*;

const TASK_ID: &str = "00000000-0000-0000-0000-000000000001";

type Sent = (Vec<String>, String, serde_json::Value);

#[derive(Default)]
struct FakeGateway {
    sent: Mutex<Vec<Sent>>,
    fail: bool,
}

impl ConnectionGateway for FakeGateway {
    type Err = anyhow::Error;

    async fn bulk_send_invalidation_event<'a, T: std::fmt::Debug + serde::Serialize + Send>(
        &self,
        _users: &[MacroUserId<Lowercase<'a>>],
        _invalidation_event: InvalidationEvent<'a, T>,
    ) -> Result<(), Self::Err> {
        unreachable!("the notifier sends Soup patch messages only")
    }

    async fn batch_send_message<'a>(
        &self,
        users: &[MacroUserIdStr<'a>],
        message_type: &str,
        message: serde_json::Value,
    ) -> Result<(), Self::Err> {
        self.sent.lock().expect("sent lock").push((
            users.iter().map(|user| user.as_ref().to_string()).collect(),
            message_type.to_string(),
            message,
        ));
        if self.fail {
            anyhow::bail!("gateway unavailable");
        }
        Ok(())
    }
}

fn recipients() -> Vec<MacroUserIdStr<'static>> {
    ["macro|one@example.com", "macro|two@example.com"]
        .into_iter()
        .map(|id| MacroUserIdStr::try_from(id.to_string()).expect("valid user id"))
        .collect()
}

#[tokio::test]
async fn sends_one_message_naming_the_entity_to_every_recipient() {
    let gateway = Arc::new(FakeGateway::default());
    let notifier = ConnectionGatewayLiveNotifier::new(Arc::clone(&gateway));

    for patch in [
        Patch::Updated(EntityType::Document.with_entity_string(TASK_ID.to_string())),
        Patch::Deleted(EntityType::Initiative.with_entity_string(TASK_ID.to_string())),
    ] {
        notifier
            .notify(&recipients(), &patch)
            .await
            .expect("message is sent");
    }

    let sent = gateway.sent.lock().expect("sent lock");
    let users = vec![
        "macro|one@example.com".to_string(),
        "macro|two@example.com".to_string(),
    ];
    assert_eq!(
        sent.as_slice(),
        &[
            (
                users.clone(),
                "soup_patch".to_string(),
                json!({ "operation": "updated", "entityType": "document", "entityId": TASK_ID }),
            ),
            (
                users,
                "soup_patch".to_string(),
                json!({ "operation": "deleted", "entityType": "initiative", "entityId": TASK_ID }),
            ),
        ]
    );
}

#[tokio::test]
async fn entities_with_their_own_live_channel_are_not_sent() {
    let gateway = Arc::new(FakeGateway::default());
    let notifier = ConnectionGatewayLiveNotifier::new(Arc::clone(&gateway));

    for entity_type in [
        EntityType::EmailThread,
        EntityType::Channel,
        EntityType::Chat,
    ] {
        notifier
            .notify(
                &recipients(),
                &Patch::Updated(entity_type.with_entity_string(TASK_ID.to_string())),
            )
            .await
            .expect("nothing to send");
    }

    assert!(gateway.sent.lock().expect("sent lock").is_empty());
}

#[tokio::test]
async fn gateway_failure_is_returned() {
    let gateway = Arc::new(FakeGateway {
        fail: true,
        ..FakeGateway::default()
    });
    let notifier = ConnectionGatewayLiveNotifier::new(gateway);

    let error = notifier
        .notify(
            &recipients(),
            &Patch::Updated(EntityType::Document.with_entity_string(TASK_ID.to_string())),
        )
        .await
        .expect_err("gateway failure reaches the caller");

    assert!(error.to_string().contains("connection gateway"));
}
