use super::*;

/// `up` writes stack.json and `update`/`status` read it back — the record and
/// the mode labels must stay in agreement.
#[test]
fn stack_state_roundtrips() {
    let state = StackState {
        mode: "local".to_string(),
        frontend: "static".to_string(),
        binaries_dir: Some(PathBuf::from("/tmp/binaries")),
        port_base: Some(41000),
    };
    let json = serde_json::to_string(&state).unwrap();
    let back: StackState = serde_json::from_str(&json).unwrap();
    assert_eq!(back.mode, "local");
    assert_eq!(back.frontend, "static");
    assert_eq!(back.binaries_dir, Some(PathBuf::from("/tmp/binaries")));
    assert!(mode_from_label(&back.mode).is_ok());
    assert!(mode_from_label("nonsense").is_err());
}

#[test]
fn legacy_stack_state_has_no_binaries_dir() {
    let state: StackState =
        serde_json::from_str(r#"{"mode":"local","frontend":"static"}"#).unwrap();
    assert_eq!(state.binaries_dir, None);
}

#[test]
fn clearing_state_invalidates_a_previous_headless_stack() {
    let instance =
        Instance::derive(Some(&format!("state-clear-{}", std::process::id())), None).unwrap();
    write_state(
        &instance,
        &StackState {
            mode: "local".to_string(),
            frontend: "static".to_string(),
            binaries_dir: None,
            port_base: None,
        },
    )
    .unwrap();
    assert!(read_state(&instance).is_some());
    clear_state(&instance).unwrap();
    assert!(read_state(&instance).is_none());
    clear_state(&instance).unwrap();
    let _ = std::fs::remove_dir_all(instance.artifact_dir());
}

#[test]
fn later_commands_find_the_recorded_port_base() {
    let name = format!("port-base-{}", std::process::id());
    let derived = Instance::derive(Some(&name), None).unwrap();
    let recorded = derived.port_base() + 1000;
    write_state(
        &derived,
        &StackState {
            mode: "local".to_string(),
            frontend: "static".to_string(),
            binaries_dir: None,
            port_base: Some(recorded),
        },
    )
    .unwrap();
    let args = InstanceArgs {
        instance: Some(name.clone()),
        port_base: None,
    };
    assert_eq!(recorded_instance(&args).unwrap().port_base(), recorded);
    // An explicit --port-base still wins.
    let explicit = InstanceArgs {
        instance: Some(name),
        port_base: Some(derived.port_base()),
    };
    assert_eq!(
        recorded_instance(&explicit).unwrap().port_base(),
        derived.port_base()
    );
    let _ = std::fs::remove_dir_all(derived.artifact_dir());
}
