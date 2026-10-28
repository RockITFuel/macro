use base64::Engine;
use livekit_api::access_token::AccessToken;
use livekit_api::services::{ServiceError, TwirpError, TwirpErrorCode};
use macro_user_id::user_id::MacroUserIdStr;
use sha2::{Digest, Sha256};

use super::*;
use crate::domain::models::CallError;
use crate::domain::ports::CallRtcClient as _;

const API_KEY: &str = "test-api-key";
const API_SECRET: &str = "test-api-secret-test-api-secret-test";

fn twirp(code: &str, msg: &str) -> ServiceError {
    ServiceError::Twirp(TwirpError::Twirp(TwirpErrorCode {
        code: code.to_string(),
        msg: msg.to_string(),
    }))
}

fn client() -> LivekitRtcClient {
    LivekitRtcClient::new("wss://lk.example", API_KEY, API_SECRET, None)
}

fn client_with_transcription_agent(agent_name: &str) -> LivekitRtcClient {
    LivekitRtcClient::new(
        "wss://lk.example",
        API_KEY,
        API_SECRET,
        Some(agent_name.to_owned()),
    )
}

fn sign_webhook(body: &str) -> String {
    let digest = Sha256::digest(body.as_bytes());
    let sha256 = base64::engine::general_purpose::STANDARD.encode(digest);
    AccessToken::with_api_key(API_KEY, API_SECRET)
        .with_sha256(&sha256)
        .to_jwt()
        .expect("webhook jwt")
}

fn participant_joined_body(identity: &str) -> String {
    serde_json::json!({
        "event": "participant_joined",
        "id": "EV_test",
        "createdAt": 1,
        "room": { "name": "room-1" },
        "participant": { "identity": identity }
    })
    .to_string()
}

fn receive_participant_joined(
    client: &LivekitRtcClient,
    identity: &str,
) -> Result<crate::domain::models::CallWebhookEvent, CallError> {
    let body = participant_joined_body(identity);
    let token = sign_webhook(&body);
    client.receive_webhook(&body, &token)
}

#[test]
fn room_composite_egress_uses_speaker_layout() {
    let request = build_room_composite_egress_request(
        "room-1",
        &EgressS3Config {
            bucket: "test-bucket".to_owned(),
            region: "us-east-1".to_owned(),
            access_key: "test-access-key".to_owned(),
            secret: "test-secret".to_owned(),
            endpoint: None,
        },
    );

    assert_eq!(request.options.layout, "speaker");
}

#[test]
fn room_composite_egress_uploads_to_an_s3_compatible_endpoint() {
    let upload = |endpoint: Option<&str>| {
        let request = build_room_composite_egress_request(
            "room-1",
            &EgressS3Config {
                bucket: "macro-call-recording".to_owned(),
                region: "auto".to_owned(),
                access_key: "key".to_owned(),
                secret: "secret".to_owned(),
                endpoint: endpoint.map(str::to_owned),
            },
        );
        let Some(EgressOutput::File(file)) = request.outputs.into_iter().next() else {
            panic!("a file output");
        };
        let Some(encoded_file_output::Output::S3(s3)) = file.output else {
            panic!("an S3 upload");
        };
        s3
    };
    let aws = upload(None);
    assert_eq!(aws.endpoint, "");
    assert!(!aws.force_path_style);
    let r2 = upload(Some("https://account.r2.cloudflarestorage.com"));
    assert_eq!(r2.endpoint, "https://account.r2.cloudflarestorage.com");
    assert!(r2.force_path_style);
}

#[tokio::test]
async fn verify_access_token_round_trips_identity_and_room() {
    let client = client();
    let identity = MacroUserIdStr::try_from_email("alice@example.com").unwrap();

    let token = client
        .generate_token("room-1", identity.clone())
        .await
        .expect("token mint is pure JWT crypto, no network");

    let verified = client.verify_access_token(&token).expect("token verifies");
    assert_eq!(verified.identity, identity.as_ref());
    assert_eq!(verified.room.as_deref(), Some("room-1"));
}

#[tokio::test]
async fn verify_access_token_rejects_token_signed_with_a_different_secret() {
    let identity = MacroUserIdStr::try_from_email("alice@example.com").unwrap();
    let token = client()
        .generate_token("room-1", identity)
        .await
        .expect("token mint is pure JWT crypto, no network");

    let other = LivekitRtcClient::new(
        "wss://lk.example",
        "test-api-key",
        "a-completely-different-secret-value!",
        None,
    );
    assert!(other.verify_access_token(&token).is_err());
}

#[test]
fn verify_access_token_rejects_garbage() {
    assert!(client().verify_access_token("not-a-jwt").is_err());
}

#[test]
fn remove_participant_not_found_is_already_gone() {
    let error = twirp(TwirpErrorCode::NOT_FOUND, "participant does not exist");
    interpret_remove_participant_result(Err(error))
        .expect("leave must succeed when LiveKit already dropped the participant");
}

#[test]
fn remove_participant_room_not_found_is_already_gone() {
    let error = twirp(TwirpErrorCode::NOT_FOUND, "requested room does not exist");
    interpret_remove_participant_result(Err(error))
        .expect("leave must succeed when the LiveKit room is already gone");
}

#[test]
fn remove_participant_unavailable_still_fails() {
    let error = twirp(TwirpErrorCode::UNAVAILABLE, "overloaded");
    let message = interpret_remove_participant_result(Err(error))
        .expect_err("transient LiveKit failures must still surface")
        .to_string();
    assert_eq!(message, "twirp error: twirp error: unavailable: overloaded");
}

#[test]
fn receive_webhook_accepts_livekit_agent_participant_identity() {
    let event = receive_participant_joined(
        &client_with_transcription_agent("macro-transcriber"),
        "agent-AJ_CNFob6rwkHxK",
    )
    .expect("agent join must not fail webhook ingest");

    assert_eq!(event.event, "participant_joined");
    assert_eq!(event.room_name.as_deref(), Some("room-1"));
    assert_eq!(event.participant_identity, None);
}

#[test]
fn receive_webhook_parses_macro_user_participant_identity() {
    let event = receive_participant_joined(&client(), "macro|alice@example.com")
        .expect("user join must parse identity");

    assert_eq!(
        event
            .participant_identity
            .as_ref()
            .map(|identity| identity.as_ref()),
        Some("macro|alice@example.com")
    );
}

#[test]
fn receive_webhook_skips_configured_transcription_agent_name() {
    let event = receive_participant_joined(
        &client_with_transcription_agent("macro-transcriber"),
        "macro-transcriber",
    )
    .expect("configured agent name must not fail webhook ingest");

    assert_eq!(event.participant_identity, None);
}

#[tokio::test]
async fn guest_tokens_preserve_names_and_only_grant_the_room() {
    let client = client();
    let guest_id = crate::domain::meetings::GuestId::generate();
    let token = client
        .generate_guest_token("meeting-room", guest_id, "Ada")
        .await
        .unwrap();
    let verified = client.verify_access_token(&token).unwrap();
    assert_eq!(verified.identity, guest_id.to_string());
    assert_eq!(verified.room.as_deref(), Some("meeting-room"));
    let payload = token.split('.').nth(1).unwrap();
    let claims: serde_json::Value = serde_json::from_slice(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(payload)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(claims["name"], "Ada");
    assert_eq!(claims["video"]["roomJoin"], true);
    assert_ne!(claims["video"]["roomAdmin"], true);
    let event = receive_participant_joined(&client, &guest_id.to_string()).unwrap();
    assert_eq!(event.guest_identity, Some(guest_id));
    assert_eq!(event.participant_identity, None);
}

struct FixedGate {
    enabled: bool,
    asked: std::sync::Mutex<Vec<String>>,
}

impl crate::domain::ports::CallTranscriptionGate for FixedGate {
    fn transcription_enabled<'a>(
        &'a self,
        created_by: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send + 'a>> {
        self.asked.lock().unwrap().push(created_by.to_owned());
        Box::pin(async move { self.enabled })
    }
}

#[tokio::test]
async fn a_team_that_turned_transcription_off_gets_no_agent() {
    let gate = std::sync::Arc::new(FixedGate {
        enabled: false,
        asked: Default::default(),
    });
    // The unreachable LiveKit URL proves no dispatch request is attempted.
    let client =
        client_with_transcription_agent("macro-transcriber").with_transcription_gate(gate.clone());

    client
        .dispatch_transcription_agent("room", "macro|owner@example.com")
        .await
        .unwrap();

    assert_eq!(*gate.asked.lock().unwrap(), vec!["macro|owner@example.com"]);
}

#[tokio::test]
async fn without_an_agent_name_the_gate_is_not_asked() {
    let gate = std::sync::Arc::new(FixedGate {
        enabled: true,
        asked: Default::default(),
    });
    client()
        .with_transcription_gate(gate.clone())
        .dispatch_transcription_agent("room", "macro|owner@example.com")
        .await
        .unwrap();

    assert!(gate.asked.lock().unwrap().is_empty());
}
