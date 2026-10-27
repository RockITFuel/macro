//! Markdown conversions of a document's Loro state, for exact markdown writes.

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::STANDARD};

use super::LexicalClient;
use crate::parse_markdown::check_response;

#[derive(serde::Serialize)]
struct MarkdownUpdateRequest<'a> {
    snapshot: String,
    markdown: &'a str,
}

#[derive(serde::Deserialize)]
struct MarkdownUpdateResponse {
    update: Option<String>,
}

#[derive(serde::Serialize)]
struct SnapshotMarkdownRequest {
    snapshot: String,
}

#[derive(serde::Deserialize)]
struct SnapshotMarkdownResponse {
    markdown: String,
}

impl LexicalClient {
    /// The Loro update that makes the document in `snapshot` hold exactly
    /// `markdown`, or `None` when it already does.
    #[tracing::instrument(skip_all, err, fields(snapshot_len = snapshot.len()))]
    pub async fn markdown_update(
        &self,
        snapshot: &[u8],
        markdown: &str,
    ) -> Result<Option<Vec<u8>>> {
        let response = check_response(
            self.client
                .post(format!("{}/snapshot/markdown-update", self.url))
                .json(&MarkdownUpdateRequest {
                    snapshot: STANDARD.encode(snapshot),
                    markdown,
                })
                .send()
                .await?,
        )
        .await?;
        let body: MarkdownUpdateResponse = response.json().await?;
        body.update
            .map(|update| STANDARD.decode(update).context("update is not base64"))
            .transpose()
    }

    /// The markdown of the document in `snapshot`, as document text reads return it.
    #[tracing::instrument(skip_all, err, fields(snapshot_len = snapshot.len()))]
    pub async fn snapshot_markdown(&self, snapshot: &[u8]) -> Result<String> {
        let response = check_response(
            self.client
                .post(format!("{}/snapshot/to-markdown", self.url))
                .json(&SnapshotMarkdownRequest {
                    snapshot: STANDARD.encode(snapshot),
                })
                .send()
                .await?,
        )
        .await?;
        let body: SnapshotMarkdownResponse = response.json().await?;
        Ok(body.markdown)
    }
}
