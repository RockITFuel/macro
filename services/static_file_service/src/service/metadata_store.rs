//! Where static file metadata lives: DynamoDB in deployed environments,
//! Postgres where DynamoDB is LocalStack (see [`MetadataStore::from_env`]).

use std::collections::HashMap;

use anyhow::{Context, Result};

use super::dynamodb::client::DynamodbClient;
use super::dynamodb::model::{DeleteError, MetadataObject};
use super::postgres_metadata::PgMetadataStore;

macro_env_var::maybe_env_vars! {
    struct DatabaseUrl;
}

/// Mark `metadata` uploaded once its object exists.
///
/// Object storage notifies the service of uploads where it can (S3 with an
/// SQS notification). Where it cannot - R2, or LocalStack without that
/// notification - nothing else would ever flip the flag, so a read that finds
/// a file not yet uploaded checks the object itself (`object_exists`, given
/// the object key) and records what it finds.
pub async fn confirm_uploaded<F, Fut>(
    metadata: &mut MetadataObject,
    store: &MetadataStore,
    object_exists: F,
) -> Result<()>
where
    F: FnOnce(String) -> Fut,
    Fut: std::future::Future<Output = Result<bool>>,
{
    if metadata.is_uploaded || !object_exists(metadata.s3_key.clone()).await? {
        return Ok(());
    }
    store.mark_uploaded(&metadata.file_id).await?;
    metadata.is_uploaded = true;
    Ok(())
}

/// The metadata store the service runs on.
#[derive(Debug, Clone)]
pub enum MetadataStore {
    Dynamodb(DynamodbClient),
    Postgres(PgMetadataStore),
}

impl MetadataStore {
    /// Postgres when AWS is LocalStack (local and self-hosted stacks), whose
    /// DynamoDB does not survive a restart; DynamoDB otherwise.
    pub async fn from_env(aws_config: &macro_aws_config::SdkConfig, table: String) -> Result<Self> {
        if !macro_aws_config::is_local_aws() {
            return Ok(Self::Dynamodb(DynamodbClient::new(aws_config, table)));
        }
        let url = DatabaseUrl::new()
            .and_then(|url| url.value().map(str::to_owned))
            .context("DATABASE_URL is required for static file metadata on local AWS")?;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .context("failed to connect to postgres for static file metadata")?;
        Ok(Self::Postgres(PgMetadataStore::new(pool)))
    }

    pub async fn put_metadata(&self, metadata: MetadataObject) -> Result<()> {
        match self {
            Self::Dynamodb(store) => store.put_metadata(metadata).await,
            Self::Postgres(store) => store.put_metadata(metadata).await,
        }
    }

    pub async fn get_metadata(&self, id: &str) -> Result<Option<MetadataObject>> {
        match self {
            Self::Dynamodb(store) => store.get_metadata(id).await,
            Self::Postgres(store) => store.get_metadata(id).await,
        }
    }

    pub async fn delete_metadata(&self, id: &str) -> Result<(), DeleteError> {
        match self {
            Self::Dynamodb(store) => store.delete_metadata(id).await,
            Self::Postgres(store) => store.delete_metadata(id).await,
        }
    }

    pub async fn mark_uploaded(&self, id: &str) -> Result<()> {
        match self {
            Self::Dynamodb(store) => store.mark_uploaded(id).await,
            Self::Postgres(store) => store.mark_uploaded(id).await,
        }
    }

    pub async fn bulk_get_metadata(
        &self,
        file_ids: &[String],
    ) -> Result<HashMap<String, MetadataObject>> {
        match self {
            Self::Dynamodb(store) => store.bulk_get_metadata(file_ids).await,
            Self::Postgres(store) => store.bulk_get_metadata(file_ids).await,
        }
    }

    pub async fn bulk_delete_metadata(&self, file_ids: &[&str]) -> Vec<Result<(), DeleteError>> {
        match self {
            Self::Dynamodb(store) => store.bulk_delete_metadata(file_ids).await,
            Self::Postgres(store) => store.bulk_delete_metadata(file_ids).await,
        }
    }
}
