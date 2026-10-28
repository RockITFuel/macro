use super::*;
use crate::domain::model::{EGRESS_URL_VARIABLE, SESSION_TOKEN_VARIABLE};
use crate::testing::helpers::egress::test_egress;

#[test]
fn a_session_names_one_space() {
    let session = AgentSessionId::TEST_A;

    assert_eq!(space_name(session), format!("macro-agent-{session}"));
    assert!(owned(&space_name(session)));
}

/// Shutdown deletes this provider's Spaces only, never a Space someone else
/// runs through the same `cua`.
#[test]
fn shutdown_leaves_other_spaces_alone() {
    assert!(!owned("agent-desktop"));
    assert!(!owned("dev-macro-agent-x"));
}

/// The environment every other provider hands a sandbox: the Anthropic key
/// plus the egress variables the clone and every outbound call go through.
#[test]
fn sandbox_env_carries_the_model_key_and_egress() {
    let env = sandbox_env(
        &AnthropicApiKey::new("test-anthropic-key".to_owned()),
        test_egress(),
    );

    assert!(env.contains(&(
        "ANTHROPIC_API_KEY".to_owned(),
        "test-anthropic-key".to_owned()
    )));
    assert!(env.iter().any(|(key, _)| key == EGRESS_URL_VARIABLE));
    assert!(env.iter().any(|(key, _)| key == SESSION_TOKEN_VARIABLE));
    assert!(!env.iter().any(|(key, _)| key == "GITHUB_TOKEN"));
}

/// Values go in quoted, so one that holds shell syntax is data, not code.
#[test]
fn the_env_file_quotes_every_value() {
    let file = env_file(&[
        ("A".to_owned(), "plain".to_owned()),
        ("B".to_owned(), "it's $(rm -rf /)".to_owned()),
    ]);

    assert_eq!(file, "export A='plain'\nexport B='it'\\''s $(rm -rf /)'\n");
}

/// The readiness recipe and the token read-back both need the environment
/// the Space was given.
#[test]
fn commands_source_the_env_file_first() {
    assert_eq!(
        with_sandbox_env("printenv MACRO_SESSION_TOKEN"),
        "set -a; . /etc/macro-sandbox.env; set +a; printenv MACRO_SESSION_TOKEN"
    );
}

#[test]
fn the_sidecar_is_dialed_over_websocket_at_the_published_port() {
    assert_eq!(
        websocket_url("http://127.0.0.1:32789").unwrap(),
        "ws://127.0.0.1:32789"
    );
    assert_eq!(
        websocket_url("http://127.0.0.1:32789/").unwrap(),
        "ws://127.0.0.1:32789"
    );
    assert!(websocket_url("https://example.com").is_err());
}

/// Spaces are created at the session's size; Cua cannot change it later.
#[test]
fn a_size_change_needs_a_new_space() {
    let manager = CuaContainerManager::new(CuaSettings {
        binary: "cua".to_owned(),
        image: "macro-agent-harness-cua:latest".to_owned(),
        runtime: "runc".to_owned(),
        anthropic_api_key: AnthropicApiKey::new(String::new()),
    });

    assert_eq!(
        manager.resize_effect(SandboxSize::Default, SandboxSize::Default),
        SandboxResizeEffect::NoOp
    );
    assert_eq!(
        manager.resize_effect(SandboxSize::Default, SandboxSize::Large),
        SandboxResizeEffect::Unsupported
    );
}
