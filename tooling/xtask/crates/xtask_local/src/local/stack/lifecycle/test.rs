use super::*;

#[test]
fn up_refuses_to_wipe_existing_data_unless_fresh() {
    let instance = Instance::derive(Some("wipe-guard"), None).unwrap();
    assert!(refuse_wipe(&instance, &[], false).is_ok());
    let existing = vec![instance.volume_postgres()];
    let error = refuse_wipe(&instance, &existing, false)
        .unwrap_err()
        .to_string();
    assert!(error.contains("stack start"), "{error}");
    assert!(error.contains(&instance.volume_postgres()), "{error}");
    assert!(refuse_wipe(&instance, &existing, true).is_ok());
}

#[test]
fn backups_dump_both_databases_of_the_instance() {
    let instance = Instance::derive(Some("prod"), None).unwrap();
    let dumps: Vec<Vec<String>> = BACKUPS
        .iter()
        .map(|(service, role, database, _)| dump_args(&instance, service, role, database))
        .collect();
    assert_eq!(
        dumps[0],
        [
            "exec",
            "macro-prod-postgres-1",
            "pg_dump",
            "-U",
            "user",
            "-Fc",
            "macrodb"
        ]
    );
    assert_eq!(
        dumps[1],
        [
            "exec",
            "macro-prod-db-1",
            "pg_dump",
            "-U",
            "postgres",
            "-Fc",
            "fusionauth"
        ]
    );
}
