use super::*;

#[test]
fn only_a_host_is_mailpit() {
    let config = SmtpConfig::from_values("mailpit", None, None, None, None, None).unwrap();
    assert_eq!(config.port, 1025);
    assert_eq!(config.security, SmtpSecurity::None);
    assert!(config.credentials.is_none());
    assert!(config.from.is_none());
}

#[test]
fn a_real_server_gets_tls_a_login_and_its_own_sender() {
    let config = SmtpConfig::from_values(
        "smtp.example.test",
        Some("465"),
        Some("ssl"),
        Some("mailer"),
        Some("hunter2"),
        Some("Macro <noreply@example.test>"),
    )
    .unwrap();
    assert_eq!(config.port, 465);
    assert_eq!(config.security, SmtpSecurity::Ssl);
    assert!(config.credentials.is_some());
    assert_eq!(
        config.from.as_ref().map(ToString::to_string).as_deref(),
        Some("Macro <noreply@example.test>")
    );
    assert!(!format!("{config:?}").contains("hunter2"));
    assert!(config.transport().is_ok());
}

#[test]
fn rejects_half_a_login_and_unknown_security() {
    assert!(
        SmtpConfig::from_values("smtp.example.test", None, None, Some("mailer"), None, None)
            .is_err()
    );
    assert!(
        SmtpConfig::from_values(
            "smtp.example.test",
            None,
            Some("STARTTLS"),
            None,
            None,
            None
        )
        .is_err()
    );
}
