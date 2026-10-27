//! Upload finalization for object storage that cannot notify a queue: an
//! external S3 endpoint such as Cloudflare R2, whose event notifications only
//! reach Cloudflare Queues. Polls Postgres for documents still waiting for
//! their upload and finalizes the objects that have since appeared, through
//! the same use case as the S3 notification adapters.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context as _;
use lambda_runtime::tracing;
use macro_env_var::env_vars;

use crate::AppContext;
use crate::app::ObjectCreated;

env_vars! {
    struct DatabaseUrl;
    struct DocumentStorageBucket;
}

/// How often pending uploads are checked.
const POLL_INTERVAL: Duration = Duration::from_secs(5);
/// Documents older than this are no longer waited for.
const PENDING_WINDOW_HOURS: i32 = 24;
/// Upper bound on documents checked per poll.
const MAX_PENDING: i64 = 200;

/// Poll for uploaded objects of pending documents forever.
pub async fn run_storage_poller(context: Arc<AppContext>) -> Result<(), anyhow::Error> {
    let database_url = DatabaseUrl::new().context("DATABASE_URL must be provided")?;
    let bucket = DocumentStorageBucket::new()
        .context("DOCUMENT_STORAGE_BUCKET must be provided")?
        .to_string();
    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(database_url.as_ref())
        .await
        .context("failed to connect to postgres")?;
    let s3 = macro_aws_config::s3_client().await;
    // Objects already handed to the finalizer. A document can stay pending
    // after its object is finalized (a DOCX waits for its converted PDF), and
    // its object must not be finalized again on every poll.
    let mut finalized: HashSet<String> = HashSet::new();
    tracing::info!(%bucket, "polling object storage for document uploads");
    loop {
        if let Err(error) = poll_once(&context, &db, &s3, &bucket, &mut finalized).await {
            tracing::warn!(error=?error, "document upload poll failed");
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn poll_once(
    context: &AppContext,
    db: &sqlx::PgPool,
    s3: &aws_sdk_s3::Client,
    bucket: &str,
    finalized: &mut HashSet<String>,
) -> Result<(), anyhow::Error> {
    let pending = sqlx::query!(
        r#"
        SELECT d.id, d.owner
        FROM "Document" d
        WHERE d.uploaded = false
          AND d."deletedAt" IS NULL
          AND d."createdAt" > now() - make_interval(hours => $1)
        ORDER BY d."createdAt" DESC
        LIMIT $2
        "#,
        PENDING_WINDOW_HOURS,
        MAX_PENDING,
    )
    .fetch_all(db)
    .await
    .context("listing pending document uploads")?;

    for document in pending {
        let prefix = document_prefix(&document.owner, &document.id);
        let listed = s3
            .list_objects_v2()
            .bucket(bucket)
            .prefix(&prefix)
            .send()
            .await
            .with_context(|| format!("listing objects under {prefix}"))?;
        for key in listed
            .contents()
            .iter()
            .filter_map(|object| object.key())
            .filter(|key| !finalized.contains(*key))
            .map(str::to_owned)
            .collect::<Vec<_>>()
        {
            match context
                .handle_object_created(ObjectCreated {
                    bucket: bucket.to_owned(),
                    key: key.clone(),
                })
                .await
            {
                Ok(()) => {
                    finalized.insert(key);
                }
                Err(error) => {
                    tracing::error!(error=?error, %key, "failed to finalize polled upload; retrying next poll");
                }
            }
        }
    }
    Ok(())
}

/// The key prefix every object of a document lives under
/// (`{owner}/{document_id}/…`, see `s3_key::DocumentKey`).
fn document_prefix(owner: &str, document_id: &str) -> String {
    format!("{owner}/{document_id}/")
}

#[cfg(test)]
mod test;
