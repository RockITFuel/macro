use super::*;
use chrono::Utc;
use macro_db_migrator::MACRO_DB_MIGRATIONS;

fn metadata(file_id: &str) -> MetadataObject {
    MetadataObject {
        file_id: file_id.to_owned(),
        owner_id: "macro|ada@example.com".to_owned(),
        content_type: "image/png".to_owned(),
        is_uploaded: false,
        last_accessed: Utc::now(),
        extension_data: Some(serde_json::json!({ "width": 64 })),
        file_name: "picture.png".to_owned(),
        s3_key: format!("file/{file_id}"),
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn metadata_round_trips_and_follows_the_dynamodb_semantics(pool: PgPool) -> Result<()> {
    let store = PgMetadataStore::new(pool);
    assert!(store.get_metadata("missing").await?.is_none());

    store.put_metadata(metadata("a")).await?;
    store.put_metadata(metadata("b")).await?;
    let stored = store.get_metadata("a").await?.expect("stored");
    assert_eq!(stored.file_name, "picture.png");
    assert_eq!(
        stored.extension_data,
        Some(serde_json::json!({ "width": 64 }))
    );
    assert!(!stored.is_uploaded);

    store.mark_uploaded("a").await?;
    assert!(store.get_metadata("a").await?.expect("stored").is_uploaded);

    // Put replaces, as a DynamoDB PutItem does.
    let mut renamed = metadata("a");
    renamed.file_name = "renamed.png".to_owned();
    store.put_metadata(renamed).await?;
    assert_eq!(
        store.get_metadata("a").await?.expect("stored").file_name,
        "renamed.png"
    );

    let both = store
        .bulk_get_metadata(&["a".to_owned(), "b".to_owned(), "c".to_owned()])
        .await?;
    assert_eq!(both.len(), 2);

    assert!(store.delete_metadata("missing").await.is_ok());
    let results = store.bulk_delete_metadata(&["a", "b"]).await;
    assert!(results.iter().all(Result::is_ok));
    assert!(
        store
            .bulk_get_metadata(&["a".to_owned(), "b".to_owned()])
            .await?
            .is_empty()
    );
    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn a_read_marks_a_file_uploaded_once_its_object_exists(pool: PgPool) -> Result<()> {
    use crate::service::metadata_store::{MetadataStore, confirm_uploaded};
    let store = MetadataStore::Postgres(PgMetadataStore::new(pool));
    store.put_metadata(metadata("a")).await?;

    let mut missing = store.get_metadata("a").await?.expect("stored");
    confirm_uploaded(&mut missing, &store, |_| async { Ok(false) }).await?;
    assert!(!missing.is_uploaded);
    assert!(!store.get_metadata("a").await?.expect("stored").is_uploaded);

    let mut present = store.get_metadata("a").await?.expect("stored");
    let mut checked = None;
    confirm_uploaded(&mut present, &store, |key| {
        checked = Some(key);
        async { Ok(true) }
    })
    .await?;
    assert_eq!(checked.as_deref(), Some("file/a"));
    assert!(present.is_uploaded);
    assert!(store.get_metadata("a").await?.expect("stored").is_uploaded);

    // Once uploaded, reads no longer touch object storage.
    confirm_uploaded(&mut present, &store, |_| async {
        panic!("an uploaded file is not checked again")
    })
    .await?;
    Ok(())
}
