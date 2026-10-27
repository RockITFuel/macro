use super::*;

#[test]
fn local_cookies_stay_cross_site_unless_configured() {
    assert_eq!(local_same_site(None), SameSite::None);
    assert_eq!(local_same_site(Some("")), SameSite::None);
    assert_eq!(local_same_site(Some("Lax")), SameSite::Lax);
    assert_eq!(local_same_site(Some(" strict ")), SameSite::Strict);
    assert_eq!(local_same_site(Some("bogus")), SameSite::None);
}
