use super::*;

fn spec() -> CreateSpec {
    CreateSpec {
        image: "macro-agent-harness-cua:latest".to_owned(),
        name: "macro-agent-abc".to_owned(),
        runtime: "runc".to_owned(),
        cpus: 4,
        memory_gib: 8,
        sidecar_port: 8700,
    }
}

fn value_after<'a>(args: &'a [String], flag: &str) -> &'a str {
    let at = args
        .iter()
        .position(|arg| arg == flag)
        .unwrap_or_else(|| panic!("{flag} missing from {args:?}"));
    &args[at + 1]
}

#[test]
fn create_names_the_image_runtime_and_size() {
    let args = create_args(&spec());

    assert_eq!(
        &args[..3],
        ["sandbox", "create", "macro-agent-harness-cua:latest"]
    );
    assert_eq!(value_after(&args, "--name"), "macro-agent-abc");
    assert_eq!(value_after(&args, "--runtime"), "runc");
    assert_eq!(value_after(&args, "--cpu"), "4");
    assert_eq!(value_after(&args, "--memory"), "8GB");
    assert!(args.contains(&"--headless".to_owned()));
}

/// The sidecar is found again by service name, and the create returns only
/// once `cua-spacesd` answers, so the first exec does not race it.
#[test]
fn create_publishes_the_sidecar_and_waits_for_spacesd() {
    let args = create_args(&spec());

    assert_eq!(value_after(&args, "--service"), "sidecar=8700");
    assert_eq!(value_after(&args, "--wait"), "tcp:3211");
}

/// An `--env KEY=VALUE` argument is readable by every user on the host.
#[test]
fn create_passes_no_environment_on_the_command_line() {
    assert!(!create_args(&spec()).contains(&"--env".to_owned()));
}

#[test]
fn exec_runs_one_login_shell_line_with_a_time_limit() {
    assert_eq!(
        exec_args("macro-agent-abc", "echo 'hi'", Duration::from_secs(300)),
        [
            "sandbox",
            "exec",
            "--local",
            "--timeout",
            "300",
            "macro-agent-abc",
            r"bash -lc 'echo '\''hi'\'''",
        ]
    );
}

/// `--timeout 0` means no limit to `cua`, which a sub-second timeout must not
/// turn into.
#[test]
fn a_sub_second_timeout_still_limits_the_command() {
    let args = exec_args("macro-agent-abc", "true", Duration::from_millis(200));

    assert_eq!(value_after(&args, "--timeout"), "1");
}

#[test]
fn a_private_file_is_written_from_stdin_with_a_restrictive_umask() {
    assert_eq!(
        write_private_file_args("macro-agent-abc", "/etc/macro-sandbox.env"),
        [
            "sandbox",
            "exec",
            "--local",
            "--stdin",
            "macro-agent-abc",
            "sh",
            "-c",
            "umask 077 && cat > '/etc/macro-sandbox.env'",
        ]
    );
}

/// Without a terminal, `cua` deletes nothing unless told not to ask.
#[test]
fn remove_does_not_prompt() {
    assert!(remove_args("macro-agent-abc").contains(&"--force".to_owned()));
}

/// Lookups stay on this machine's Spaces: a session's Space is never one a
/// relay or another computer provides.
#[test]
fn lookups_are_local() {
    for args in [
        info_args("macro-agent-abc"),
        service_url_args("macro-agent-abc", SIDECAR_SERVICE),
        remove_args("macro-agent-abc"),
        list_args(),
        exec_args("macro-agent-abc", "true", Duration::from_secs(1)),
    ] {
        assert!(args.contains(&"--local".to_owned()), "{args:?}");
    }
}

#[test]
fn shell_quote_keeps_a_value_one_word() {
    assert_eq!(shell_quote("plain"), "'plain'");
    assert_eq!(shell_quote("it's"), r"'it'\''s'");
    assert_eq!(shell_quote("$HOME `x`"), "'$HOME `x`'");
}

#[test]
fn space_info_reads_cua_json() {
    let json = r#"[{"endpoints":{"sidecar":"http://127.0.0.1:32789"},"id":"local:macro-agent-abc",
        "kind":"container","name":"macro-agent-abc","state":"running","status":"ready"},
        {"name":"other"}]"#;

    let spaces: Vec<SpaceInfo> = serde_json::from_str(json).unwrap();

    assert_eq!(spaces[0].name, "macro-agent-abc");
    assert_eq!(spaces[0].state, "running");
    assert_eq!(spaces[1].state, "");
}
