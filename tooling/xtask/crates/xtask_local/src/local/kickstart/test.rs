use super::*;

fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn google_idp_requires_a_real_client_secret() {
    // The legacy Doppler placeholder is a Secrets-Manager key NAME, not a
    // secret — building IdPs from it would bake a broken FusionAuth config
    // into the init snapshot.
    assert!(
        GoogleIdp::from_env(&env(&[
            ("GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com"),
            ("GOOGLE_CLIENT_SECRET_KEY", "google-client-secret-dev"),
        ]))
        .is_none()
    );
    assert!(GoogleIdp::from_env(&env(&[])).is_none());
    assert!(
        GoogleIdp::from_env(&env(&[
            ("GOOGLE_CLIENT_ID", ""),
            ("GOOGLE_CLIENT_SECRET_KEY", "GOCSPX-real"),
        ]))
        .is_none()
    );

    let ok = GoogleIdp::from_env(&env(&[
        ("GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com"),
        ("GOOGLE_CLIENT_SECRET_KEY", "GOCSPX-real"),
    ]))
    .expect("a real client id + GOCSPX secret must parse");
    assert_eq!(ok.client_id, "abc.apps.googleusercontent.com");
    assert_eq!(ok.client_secret, "GOCSPX-real");
}

#[test]
fn kickstart_without_google_has_no_idp_requests() {
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    let urls: Vec<&str> = doc["requests"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["url"].as_str().unwrap())
        .collect();
    assert!(
        !urls.iter().any(|u| u.contains("/api/identity-provider")),
        "no Google client -> no IdP requests: {urls:?}"
    );
}

#[test]
fn kickstart_with_google_adds_lambda_and_both_idps_after_the_application() {
    let google = GoogleIdp {
        client_id: "abc.apps.googleusercontent.com".into(),
        client_secret: "GOCSPX-real".into(),
    };
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        Some(&google),
        None,
        None,
    );
    let requests = doc["requests"].as_array().unwrap();

    let pos = |needle: &str| {
        requests
            .iter()
            .position(|r| r["url"].as_str().unwrap().contains(needle))
            .unwrap_or_else(|| panic!("missing request for {needle}"))
    };
    let app = pos(identity::APPLICATION_ID);
    let reconcile = pos(identity::RECONCILE_LAMBDA_ID);
    let google_idp = pos(identity::GOOGLE_IDP_ID);
    let gmail_idp = pos(identity::GOOGLE_GMAIL_IDP_ID);
    assert!(app < reconcile && reconcile < google_idp && google_idp < gmail_idp);

    let gmail = &requests[gmail_idp]["body"]["identityProvider"];
    assert_eq!(gmail["name"], "google_gmail");
    assert_eq!(
        gmail["lambdaConfiguration"]["reconcileId"],
        identity::RECONCILE_LAMBDA_ID
    );
    assert_eq!(
        gmail["oauth2"]["client_id"],
        "abc.apps.googleusercontent.com"
    );
    assert!(
        gmail["oauth2"]["scope"]
            .as_str()
            .unwrap()
            .contains("gmail.modify")
    );
    assert_eq!(
        gmail["applicationConfiguration"][identity::APPLICATION_ID]["createRegistration"],
        true
    );

    let plain = &requests[google_idp]["body"]["identityProvider"];
    assert_eq!(plain["name"], "google");
    assert_eq!(plain["oauth2"]["scope"], "openid profile email");
    assert!(plain["lambdaConfiguration"].is_null());
}

#[test]
fn kickstart_adopts_the_default_tenant() {
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    assert_eq!(
        doc["variables"]["defaultTenantId"],
        identity::TENANT_ID,
        "the built-in default tenant must be pinned to the fixed local id"
    );
    let tenant = doc["requests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["url"].as_str().unwrap() == format!("/api/tenant/{}", identity::TENANT_ID))
        .expect("missing tenant request");
    assert_eq!(
        tenant["method"], "PATCH",
        "the tenant is reconfigured in place, not created — local stays single-tenant"
    );
}

/// A no-Doppler stack fills these with placeholders so the service's config
/// loader is satisfied. Building the provider from them would bake a broken
/// FusionAuth config into the init snapshot, which reads as a *configured*
/// GitHub connector that fails at the callback rather than an absent one.
#[test]
fn github_idp_requires_a_real_client() {
    assert!(GithubIdp::from_env(&env(&[])).is_none());
    assert!(
        GithubIdp::from_env(&env(&[
            ("GITHUB_CLIENT_ID", "local-github-client"),
            ("GITHUB_CLIENT_SECRET", "local-github-client-secret"),
        ]))
        .is_none()
    );
    assert!(
        GithubIdp::from_env(&env(&[
            ("GITHUB_CLIENT_ID", "Iv23livpJoVJw98dlKCk"),
            ("GITHUB_CLIENT_SECRET", "local-github-client-secret"),
        ]))
        .is_none()
    );
    assert!(
        GithubIdp::from_env(&env(&[
            ("GITHUB_CLIENT_ID", ""),
            ("GITHUB_CLIENT_SECRET", "realsecret"),
        ]))
        .is_none()
    );

    let ok = GithubIdp::from_env(&env(&[
        ("GITHUB_CLIENT_ID", "Iv23livpJoVJw98dlKCk"),
        ("GITHUB_CLIENT_SECRET", "a-real-github-secret"),
    ]))
    .expect("a real github client must parse");
    assert_eq!(ok.client_id, "Iv23livpJoVJw98dlKCk");
    assert_eq!(ok.client_secret, "a-real-github-secret");
    // No Doppler layer, so the local constant stands in.
    assert_eq!(ok.idp_id, identity::GITHUB_IDP_ID);
}

/// `authentication_service` reads `GITHUB_IDP_ID` as config and Doppler
/// overrides it with the dev instance's id. Creating the provider at our own
/// constant instead would put it somewhere the service never looks: starting a
/// link (by name) would work while every link call addressed nothing.
#[test]
fn the_github_idp_id_follows_the_env_the_service_reads() {
    let github = GithubIdp::from_env(&env(&[
        ("GITHUB_CLIENT_ID", "Iv23livpJoVJw98dlKCk"),
        ("GITHUB_CLIENT_SECRET", "a-real-github-secret"),
        ("GITHUB_IDP_ID", "c8014fe7-aeb4-4898-a460-4047e0fdf6d8"),
    ]))
    .expect("a real github client must parse");
    assert_eq!(github.idp_id, "c8014fe7-aeb4-4898-a460-4047e0fdf6d8");

    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        Some(&github),
        None,
    );
    assert!(
        doc["requests"]
            .as_array()
            .expect("requests")
            .iter()
            .any(|request| request["url"].as_str()
                == Some("/api/identity-provider/c8014fe7-aeb4-4898-a460-4047e0fdf6d8"))
    );
}

/// `authentication_service` resolves this provider by name to start a link and
/// then addresses it by `GITHUB_IDP_ID` for the link itself, so one provider
/// has to answer to both or the two halves address different things.
#[test]
fn the_github_idp_is_created_under_both_the_name_and_the_id_the_service_uses() {
    let github = GithubIdp {
        client_id: "Iv23livpJoVJw98dlKCk".to_string(),
        client_secret: "a-real-github-secret".to_string(),
        idp_id: identity::GITHUB_IDP_ID.to_string(),
    };
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        Some(&github),
        None,
    );

    let requests = doc["requests"].as_array().expect("requests");
    let idp = requests
        .iter()
        .find(|request| {
            request["url"]
                .as_str()
                .is_some_and(|url| url.ends_with(identity::GITHUB_IDP_ID))
        })
        .expect("the github identity provider must be created at its fixed id");

    let provider = &idp["body"]["identityProvider"];
    assert_eq!(provider["name"], "github");
    // FusionAuth has no GitHub provider type; it rejects one outright.
    assert_eq!(provider["type"], "OpenIDConnect");
    assert_eq!(provider["enabled"], true);
    // The provider and the service must share one OAuth client.
    assert_eq!(provider["oauth2"]["client_id"], "Iv23livpJoVJw98dlKCk");
    assert_eq!(provider["oauth2"]["client_secret"], "a-real-github-secret");
    assert_eq!(
        provider["applicationConfiguration"][identity::APPLICATION_ID]["enabled"],
        true
    );
}

/// Absent client, absent provider - the connector is plainly unavailable
/// rather than misconfigured.
#[test]
fn kickstart_without_github_creates_no_github_idp() {
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );

    assert!(
        !doc["requests"]
            .as_array()
            .expect("requests")
            .iter()
            .any(|request| request["url"]
                .as_str()
                .is_some_and(|url| url.contains(identity::GITHUB_IDP_ID)))
    );
}

fn authorized_redirects(frontend_port: u16, auth_port: u16, proxy_port: u16) -> Vec<String> {
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            frontend_port,
            auth_port,
            vec![format!("https://localhost:{proxy_port}")],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    doc["requests"]
        .as_array()
        .expect("requests")
        .iter()
        .find(|request| {
            request["url"].as_str()
                == Some(&format!("/api/application/{}", identity::APPLICATION_ID))
        })
        .expect("application request")["body"]["application"]["oauthConfiguration"]
        ["authorizedRedirectURLs"]
        .as_array()
        .expect("authorizedRedirectURLs")
        .iter()
        .filter_map(|url| url.as_str().map(ToOwned::to_owned))
        .collect()
}

/// OAuth callbacks follow the instance proxy now that the agent APIs share a process.
#[test]
fn agent_oauth_redirects_follow_the_instance_proxy_port() {
    let default = authorized_redirects(3000, 8080, 8090);
    assert!(
        default.contains(&"https://localhost:8090/cognition/mcp/servers/auth/callback".to_string()),
        "default instance authorizes its proxy callback: {default:?}"
    );

    // Named instances authorize their own HTTPS proxy port.
    let named = authorized_redirects(31010, 31011, 31019);
    assert!(
        named.contains(&"https://localhost:31019/cognition/mcp/servers/auth/callback".to_string()),
        "named instance must authorize its proxy callback: {named:?}"
    );
    assert!(
        !named.iter().any(|url| url.contains("localhost:8085")),
        "named instance must not keep the retired DCS callback: {named:?}"
    );
}

#[test]
fn agent_oauth_redirects_authorize_the_machine_hostname_and_loopback() {
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec![
                "https://localhost:8090".to_string(),
                "https://devbox.example:8090".to_string(),
            ],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    let application = doc["requests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|request| request["url"] == format!("/api/application/{}", identity::APPLICATION_ID))
        .unwrap();
    let redirects =
        application["body"]["application"]["oauthConfiguration"]["authorizedRedirectURLs"]
            .as_array()
            .unwrap();
    assert!(redirects.contains(&json!(
        "https://localhost:8090/cognition/mcp/servers/auth/callback"
    )));
    assert!(redirects.contains(&json!(
        "https://devbox.example:8090/cognition/mcp/servers/auth/callback"
    )));
    assert!(redirects.contains(&json!("https://devbox.example:8090/mcp/oauth/callback")));
}

/// The kickstart and the services must hold the same secrets: an override in
/// `--env-file` reaches the services through the typed env and FusionAuth
/// through this document, both read from the one resolved env.
#[test]
fn kickstart_takes_secrets_from_the_resolved_env() {
    use crate::local::Mode;
    use crate::local::instance::Instance;
    use crate::local::local_env::{LocalEnv, Tunnels};
    use crate::local::self_host::SelfHost;

    let self_host = SelfHost::from_env(&env(&[
        ("INTERNAL_AUTH_KEY", "deployed-internal-key"),
        ("FUSIONAUTH_API_KEY", "deployed-api-key"),
        ("MACRO_FUSIONAUTH_ADMIN_PASSWORD", "deployed-admin-password"),
    ]));
    let instance = Instance::derive(Some("kickstart-secrets"), None).unwrap();
    let mut resolved =
        LocalEnv::for_instance(Mode::Local, &instance, true, Tunnels::default(), &self_host)
            .unwrap()
            .to_env();
    // Single-name secrets come straight from `--env-file`.
    resolved.insert("JWT_SECRET_KEY".into(), "deployed-jwt".into());
    resolved.insert(
        "FUSIONAUTH_CLIENT_SECRET_KEY".into(),
        "deployed-client".into(),
    );

    let doc = build(
        &Redirects::for_env(&resolved, 3000, 8080, vec![]),
        &Secrets::from_env(&resolved),
        &Mail::from_env(&resolved).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    let json = doc.to_string();
    for fixture in [
        identity::FUSIONAUTH_API_KEY,
        identity::JWT_SECRET,
        identity::CLIENT_SECRET,
        "macroIsGreat!",
    ] {
        assert!(!json.contains(fixture), "fixture {fixture} leaked");
    }
    assert_eq!(
        doc["apiKeys"][0]["key"],
        resolved["FUSIONAUTH_API_KEY_SECRET_KEY"]
    );
    assert_eq!(
        resolved["FUSIONAUTH_API_KEY_SECRET_KEY"],
        "deployed-api-key"
    );
    let requests = doc["requests"].as_array().unwrap();
    let body = |url: &str| {
        requests
            .iter()
            .find(|request| request["url"].as_str().unwrap().starts_with(url))
            .map(|request| &request["body"])
            .unwrap()
    };
    assert_eq!(body("/api/key/import")["key"]["secret"], "deployed-jwt");
    assert_eq!(
        body("/api/application/")["application"]["oauthConfiguration"]["clientSecret"],
        "deployed-client"
    );
    assert_eq!(
        body("/api/user/registration")["user"]["password"],
        "deployed-admin-password"
    );
    for webhook in requests.iter().filter(|r| r["url"] == "/api/webhook") {
        assert_eq!(
            webhook["body"]["webhook"]["headers"]["x-internal-auth-key"],
            resolved["INTERNAL_API_SECRET_KEY"]
        );
    }
    assert_eq!(resolved["INTERNAL_API_SECRET_KEY"], "deployed-internal-key");
}

#[test]
fn a_public_origin_replaces_the_localhost_redirects() {
    let resolved = env(&[
        ("MACRO_PUBLIC_ORIGIN", "https://macro.example.com"),
        (
            "FUSIONAUTH_OAUTH_REDIRECT_URI",
            "https://macro.example.com/auth/oauth/redirect",
        ),
    ]);
    let doc = build(
        &Redirects::for_env(&resolved, 3000, 8080, vec!["https://localhost:8090".into()]),
        &Secrets::from_env(&resolved),
        &Mail::from_env(&resolved).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    let application = doc["requests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|request| request["url"] == format!("/api/application/{}", identity::APPLICATION_ID))
        .unwrap();
    let redirects: Vec<&str> =
        application["body"]["application"]["oauthConfiguration"]["authorizedRedirectURLs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|url| url.as_str().unwrap())
            .collect();
    assert_eq!(
        redirects,
        vec![
            "https://macro.example.com/app",
            "https://macro.example.com/auth/oauth/redirect",
            "http://authentication-service:8080/oauth/redirect",
            "https://macro.example.com/cognition/mcp/servers/auth/callback",
            "https://macro.example.com/mcp/oauth/callback",
        ]
    );
}

#[test]
fn kickstart_sends_login_codes_through_the_configured_smtp_server() {
    let local = Mail::from_env(&BTreeMap::new()).unwrap();
    assert_eq!((local.host.as_str(), local.port), ("mailpit", 1025));

    let resolved = env(&[
        ("MACRO_SMTP_HOST", "smtp.mx.cloudflare.net"),
        ("MACRO_SMTP_SECURITY", "SSL"),
        ("MACRO_SMTP_USERNAME", "mailer"),
        ("MACRO_SMTP_PASSWORD", "smtp-secret"),
        ("MACRO_MAIL_FROM", "noreply@example.com"),
        ("MACRO_MAIL_FROM_NAME", "Macro"),
    ]);
    let doc = build(
        &Redirects::for_env(&resolved, 3000, 8080, vec![]),
        &Secrets::from_env(&resolved),
        &Mail::from_env(&resolved).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        None,
    );
    let requests = doc["requests"].as_array().unwrap();
    let tenant = requests
        .iter()
        .find(|r| r["url"] == format!("/api/tenant/{}", identity::TENANT_ID))
        .unwrap();
    let email = &tenant["body"]["tenant"]["emailConfiguration"];
    assert_eq!(email["host"], "smtp.mx.cloudflare.net");
    assert_eq!(email["port"], 465);
    assert_eq!(email["security"], "SSL");
    assert_eq!(email["username"], "mailer");
    assert_eq!(email["password"], "smtp-secret");
    assert_eq!(email["defaultFromEmail"], "noreply@example.com");
    assert_eq!(email["defaultFromName"], "Macro");
    let template = requests
        .iter()
        .find(|r| {
            r["url"]
                .as_str()
                .unwrap()
                .starts_with("/api/email/template/")
        })
        .unwrap();
    assert_eq!(
        template["body"]["emailTemplate"]["fromEmail"],
        "noreply@example.com"
    );
}

#[test]
fn microsoft_idp_requires_the_whole_client() {
    assert!(MicrosoftIdp::from_env(&env(&[])).is_none());
    assert!(
        MicrosoftIdp::from_env(&env(&[
            ("MICROSOFT_CLIENT_ID", "client"),
            ("MICROSOFT_CLIENT_SECRET", "secret"),
            ("MICROSOFT_TENANT_ID", " "),
        ]))
        .is_none()
    );
    let ok = MicrosoftIdp::from_env(&env(&[
        ("MICROSOFT_CLIENT_ID", "client"),
        ("MICROSOFT_CLIENT_SECRET", "secret"),
        ("MICROSOFT_TENANT_ID", "organizations"),
    ]))
    .expect("a complete Entra client must parse");
    assert_eq!(ok.tenant_id, "organizations");
}

/// `authentication_service` resolves the Outlook provider by the name
/// `microsoft`; without it `POST /link/outlook` answers 404.
#[test]
fn the_microsoft_idp_is_created_under_the_name_the_service_resolves() {
    let microsoft = MicrosoftIdp {
        client_id: "client".to_string(),
        client_secret: "secret".to_string(),
        tenant_id: "organizations".to_string(),
    };
    let doc = build(
        &Redirects::for_env(
            &BTreeMap::new(),
            3000,
            8080,
            vec!["https://localhost:8085".to_string()],
        ),
        &Secrets::from_env(&BTreeMap::new()),
        &Mail::from_env(&BTreeMap::new()).unwrap(),
        "function populate() {}",
        "function reconcile() {}",
        None,
        None,
        Some(&microsoft),
    );

    let provider = doc["requests"]
        .as_array()
        .expect("requests")
        .iter()
        .find(|request| {
            request["url"]
                .as_str()
                .is_some_and(|url| url.ends_with(identity::MICROSOFT_IDP_ID))
        })
        .map(|request| &request["body"]["identityProvider"])
        .expect("the microsoft identity provider must be created at its fixed id");
    assert_eq!(provider["name"], "microsoft");
    assert_eq!(provider["type"], "OpenIDConnect");
    assert_eq!(provider["oauth2"]["client_id"], "client");
    assert_eq!(
        provider["oauth2"]["token_endpoint"],
        "https://login.microsoftonline.com/organizations/oauth2/v2.0/token"
    );
    assert_eq!(
        provider["applicationConfiguration"][identity::APPLICATION_ID]["enabled"],
        true
    );
}
