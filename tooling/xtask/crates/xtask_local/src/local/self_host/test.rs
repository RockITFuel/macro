use super::*;

fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn unset_and_empty_settings_are_the_local_stack() {
    assert_eq!(SelfHost::from_env(&env(&[])), SelfHost::default());
    let empty = SelfHost::from_env(&env(&[(PUBLIC_ORIGIN, ""), (BIND_ADDRESS, " ")]));
    assert_eq!(empty, SelfHost::default());
    assert!(!empty.is_public());
    assert_eq!(empty.publish("5432:5432".into()), "5432:5432");
    assert_eq!(
        empty.database_url("postgres:5432"),
        "postgres://user:password@postgres:5432/macrodb"
    );
}

#[test]
fn settings_are_read_and_written_back() {
    let settings = SelfHost::from_env(&env(&[
        (PUBLIC_ORIGIN, "https://macro.example.com/"),
        (FUSIONAUTH_PUBLIC_URL, "https://auth.macro.example.com"),
        (BIND_ADDRESS, "127.0.0.1"),
        (POSTGRES_PASSWORD, "pg-secret"),
    ]));
    assert!(settings.is_public());
    assert_eq!(
        settings.public_origin.as_deref(),
        Some("https://macro.example.com")
    );
    assert_eq!(
        settings.publish("41000:5432".into()),
        "127.0.0.1:41000:5432"
    );
    assert_eq!(
        settings.database_url("localhost:41000"),
        "postgres://user:pg-secret@localhost:41000/macrodb"
    );

    let mut written = BTreeMap::new();
    settings.write(&mut written);
    assert_eq!(written[PUBLIC_ORIGIN], "https://macro.example.com");
    assert_eq!(SelfHost::from_env(&written), settings);
}

#[test]
fn a_public_stack_refuses_fixture_secrets() {
    let fixtures: BTreeMap<String, String> = PUBLIC_SECRETS
        .iter()
        .map(|key| (key.to_string(), "fixture".to_string()))
        .collect();

    // Local stacks keep their fixtures.
    assert!(check(&fixtures, &fixtures).is_ok());

    let mut public = fixtures.clone();
    public.insert(PUBLIC_ORIGIN.into(), "https://macro.example.com".into());
    public.insert(SMTP_HOST.into(), "smtp.example.com".into());
    public.insert(MAIL_FROM.into(), "noreply@example.com".into());
    public.insert("JWT_SECRET_KEY".into(), "overridden".into());
    let error = check(&public, &fixtures).unwrap_err().to_string();
    assert!(error.contains(INTERNAL_AUTH_KEY), "{error}");
    assert!(error.contains(FUSIONAUTH_ADMIN_PASSWORD), "{error}");
    assert!(!error.contains("JWT_SECRET_KEY"), "{error}");

    for key in PUBLIC_SECRETS {
        public.insert(key.into(), format!("deployed-{key}"));
    }
    public.insert(FUSIONAUTH_ADMIN_PASSWORD.into(), "admin-secret".into());
    assert!(check(&public, &fixtures).is_ok());
}

#[test]
fn a_public_stack_needs_real_mail() {
    let public = env(&[(PUBLIC_ORIGIN, "https://macro.example.com")]);
    let error = check(&public, &BTreeMap::new()).unwrap_err().to_string();
    assert!(error.contains(SMTP_HOST), "{error}");
}

#[test]
fn smtp_settings_default_the_port_from_the_security() {
    assert_eq!(SelfHost::default().smtp().unwrap(), None);
    let settings = SelfHost::from_env(&env(&[
        (SMTP_HOST, "smtp.mx.cloudflare.net"),
        (SMTP_SECURITY, "ssl"),
        (SMTP_USERNAME, "mailer"),
        (SMTP_PASSWORD, "secret"),
    ]));
    assert_eq!(
        settings.smtp().unwrap(),
        Some(Smtp {
            host: "smtp.mx.cloudflare.net",
            port: 465,
            security: "SSL",
            username: Some("mailer"),
            password: Some("secret"),
        })
    );
    for broken in [
        env(&[(SMTP_HOST, "smtp.example.com"), (SMTP_SECURITY, "STARTTLS")]),
        env(&[(SMTP_HOST, "smtp.example.com"), (SMTP_PORT, "smtps")]),
        env(&[(SMTP_HOST, "smtp.example.com"), (SMTP_USERNAME, "mailer")]),
    ] {
        assert!(SelfHost::from_env(&broken).smtp().is_err(), "{broken:?}");
    }
}

#[test]
fn a_public_stack_refuses_local_containers() {
    let public = env(&[
        (PUBLIC_ORIGIN, "https://macro.example.com"),
        ("DEV_DANGEROUS_LOCAL_CONTAINERS", "true"),
    ]);
    let error = check(&public, &BTreeMap::new()).unwrap_err().to_string();
    assert!(error.contains("DEV_DANGEROUS_LOCAL_CONTAINERS"), "{error}");
}
