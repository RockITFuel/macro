use super::*;

fn client() -> fusionauth::FusionAuthClient {
    fusionauth::FusionAuthClient::new(
        "api-key".to_owned(),
        "client-id".to_owned(),
        "client-secret".to_owned(),
        "http://fusionauth:9011".to_owned(),
        "https://macro.example.test/mcp/oauth/callback".to_owned(),
        "google-client".to_owned(),
        "google-secret".to_owned(),
    )
    .with_public_url("https://auth.example.test".to_owned())
}

#[test]
fn without_a_google_provider_sign_in_is_refused_not_misdirected() {
    let provider = FusionAuthOAuthProvider {
        client: Arc::new(client()),
        google_idp_id: None,
    };
    let error = provider.construct_authorize_url("state").unwrap_err();
    assert!(error.to_string().contains("google_gmail"), "{error}");
}

#[test]
fn with_a_google_provider_sign_in_goes_through_it() {
    let provider = FusionAuthOAuthProvider {
        client: Arc::new(client()),
        google_idp_id: Some("55555555-5555-4555-8555-555555555555".to_owned()),
    };
    let url = provider.construct_authorize_url("state").unwrap();
    assert!(
        url.starts_with("https://auth.example.test/oauth2/authorize"),
        "{url}"
    );
    assert!(
        url.contains("55555555-5555-4555-8555-555555555555"),
        "{url}"
    );
}
