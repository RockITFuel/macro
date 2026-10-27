//! Static file metadata in Postgres (`static_file_metadata`), used instead of
//! DynamoDB where DynamoDB is LocalStack and would lose it on a restart.

use std::collections::HashMap;

use anyhow::{Context, Result};
use sqlx::PgPool;

use super::dynamodb::model::{DeleteError, MetadataObject};

#[cfg(test)]
mod test;

/// The Postgres metadata store.
#[derive(Debug, Clone)]
pub struct PgMetadataStore {
    pool: PgPool,
}

impl PgMetadataStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Insert or replace a file's metadata, like DynamoDB's PutItem.
    pub async fn put_metadata(&self, metadata: MetadataObject) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO static_file_metadata
                (file_id, owner_id, content_type, is_uploaded, last_accessed,
                 extension_data, file_name, s3_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (file_id) DO UPDATE SET
                owner_id = EXCLUDED.owner_id,
                content_type = EXCLUDED.content_type,
                is_uploaded = EXCLUDED.is_uploaded,
                last_accessed = EXCLUDED.last_accessed,
                extension_data = EXCLUDED.extension_data,
                file_name = EXCLUDED.file_name,
                s3_key = EXCLUDED.s3_key
            "#,
            metadata.file_id,
            metadata.owner_id,
            metadata.content_type,
            metadata.is_uploaded,
            metadata.last_accessed,
            metadata.extension_data,
            metadata.file_name,
            metadata.s3_key,
        )
        .execute(&self.pool)
        .await
        .context("failed to put static file metadata")?;
        Ok(())
    }

    pub async fn get_metadata(&self, id: &str) -> Result<Option<MetadataObject>> {
        Ok(self.bulk_get_metadata(&[id.to_owned()]).await?.remove(id))
    }

    /// Delete a file's metadata. Deleting a missing row succeeds, as a
    /// DynamoDB DeleteItem does.
    pub async fn delete_metadata(&self, id: &str) -> Result<(), DeleteError> {
        sqlx::query!("DELETE FROM static_file_metadata WHERE file_id = $1", id)
            .execute(&self.pool)
            .await
            .map(drop)
            .map_err(|error| DeleteError::Other(error.to_string()))
    }

    pub async fn mark_uploaded(&self, id: &str) -> Result<()> {
        sqlx::query!(
            "UPDATE static_file_metadata SET is_uploaded = true WHERE file_id = $1",
            id
        )
        .execute(&self.pool)
        .await
        .context("failed to mark file as uploaded")?;
        Ok(())
    }

    pub async fn bulk_get_metadata(
        &self,
        file_ids: &[String],
    ) -> Result<HashMap<String, MetadataObject>> {
        if file_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT file_id, owner_id, content_type, is_uploaded, last_accessed,
                   extension_data, file_name, s3_key
            FROM static_file_metadata
            WHERE file_id = ANY($1)
            "#,
            file_ids,
        )
        .fetch_all(&self.pool)
        .await
        .context("failed to get static file metadata")?;
        Ok(rows
            .into_iter()
            .map(|row| {
                (
                    row.file_id.clone(),
                    MetadataObject {
                        file_id: row.file_id,
                        owner_id: row.owner_id,
                        content_type: row.content_type,
                        is_uploaded: row.is_uploaded,
                        last_accessed: row.last_accessed,
                        extension_data: row.extension_data,
                        file_name: row.file_name,
                        s3_key: row.s3_key,
                    },
                )
            })
            .collect())
    }

    pub async fn bulk_delete_metadata(&self, file_ids: &[&str]) -> Vec<Result<(), DeleteError>> {
        let ids: Vec<String> = file_ids.iter().map(|id| (*id).to_owned()).collect();
        let outcome = sqlx::query!(
            "DELETE FROM static_file_metadata WHERE file_id = ANY($1)",
            &ids
        )
        .execute(&self.pool)
        .await;
        file_ids
            .iter()
            .map(|_| match &outcome {
                Ok(_) => Ok(()),
                Err(error) => Err(DeleteError::Other(error.to_string())),
            })
            .collect()
    }
}
