use super::*;

#[test]
fn a_documents_prefix_matches_the_keys_its_uploads_are_stored_under() {
    let owner = "macro|ada@example.com";
    let prefix = document_prefix(owner, "doc-1");
    let versioned = s3_key::DocumentKey::Versioned {
        owner_segment: owner.to_owned(),
        document_id: "doc-1".to_owned(),
        version_id: 7,
    }
    .to_key();
    assert!(versioned.starts_with(&prefix), "{versioned} vs {prefix}");
    assert!(!format!("{owner}/doc-10/7").starts_with(&prefix));
}
