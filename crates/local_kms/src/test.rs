use super::*;

fn key() -> LocalKms {
    LocalKms::from_base64(&STANDARD.encode([7u8; 32])).unwrap()
}

fn context(owner: &str) -> HashMap<String, String> {
    HashMap::from([
        ("macro:purpose".to_owned(), "test".to_owned()),
        ("macro:user-id".to_owned(), owner.to_owned()),
    ])
}

#[test]
fn round_trips_under_the_same_context() {
    let kms = key();
    let sealed = kms.encrypt(&context("macro|a@x.test"), b"secret").unwrap();
    let opened = kms
        .decrypt(KEY_ID, &sealed, &context("macro|a@x.test"))
        .unwrap();
    assert_eq!(opened.as_slice(), b"secret");
    // A fresh nonce every time.
    assert_ne!(
        sealed,
        kms.encrypt(&context("macro|a@x.test"), b"secret").unwrap()
    );
}

#[test]
fn refuses_another_owner_key_or_key_id() {
    let kms = key();
    let sealed = kms.encrypt(&context("macro|a@x.test"), b"secret").unwrap();
    assert!(
        kms.decrypt(KEY_ID, &sealed, &context("macro|b@x.test"))
            .is_err()
    );
    let other = LocalKms::from_base64(&STANDARD.encode([8u8; 32])).unwrap();
    assert!(
        other
            .decrypt(KEY_ID, &sealed, &context("macro|a@x.test"))
            .is_err()
    );
    assert!(matches!(
        kms.decrypt(
            "arn:aws:kms:us-east-1:000000000000:key/x",
            &sealed,
            &context("macro|a@x.test")
        ),
        Err(LocalKmsError::ForeignKey)
    ));
}

#[test]
fn data_keys_are_fresh_and_recoverable() {
    let kms = key();
    let (plaintext, encrypted) = kms.generate_data_key(&context("o")).unwrap();
    assert_eq!(plaintext.len(), 32);
    assert_eq!(
        kms.decrypt(KEY_ID, &encrypted, &context("o"))
            .unwrap()
            .as_slice(),
        plaintext.as_slice()
    );
    assert_ne!(plaintext, kms.generate_data_key(&context("o")).unwrap().0);
}

#[test]
fn rejects_keys_that_are_not_32_bytes() {
    assert!(LocalKms::from_base64("not base64!").is_err());
    assert!(LocalKms::from_base64(&STANDARD.encode([1u8; 16])).is_err());
    assert!(format!("{:?}", key()).contains("redacted"));
}
