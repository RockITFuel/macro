//! Exact markdown reads and writes of a native markdown document through its
//! collaborative state. A write is an ordinary Loro edit: sync-service checks
//! the revision, stores it in the operation log and broadcasts it to open
//! editors, like any collaborator's edit.

use std::future::Future;

use macro_sync_service_jwt::DocumentPermissionToken;
use model::document::{DocumentBasic, FileType};

use super::models::DocumentError;

#[cfg(test)]
mod test;

/// How often a write without a base version re-reads the document when a
/// concurrent edit lands between its read and its write.
const WRITE_ATTEMPTS: usize = 3;

/// A document's current collaborative state.
pub struct CollaborativeState {
    /// A Loro snapshot of the document.
    pub snapshot: Vec<u8>,
    /// The encoded version vector the snapshot is at.
    pub revision: Vec<u8>,
}

/// The outcome of a conditional write of collaborative state.
pub enum StateWrite {
    /// The update is part of the document, now at `revision`.
    Applied {
        /// The encoded version vector after the update.
        revision: Vec<u8>,
    },
    /// The document is no longer at the expected revision; nothing was written.
    Conflict,
}

/// Signed reads and revision-checked writes of a document's collaborative state.
pub trait CollaborativeStatePort: Send + Sync {
    /// The document's current state.
    fn state(
        &self,
        document_id: &str,
        token: &DocumentPermissionToken,
    ) -> impl Future<Output = Result<CollaborativeState, DocumentError>> + Send;

    /// Apply `update` if the document is still at `expected_revision`.
    fn write(
        &self,
        document_id: &str,
        token: &DocumentPermissionToken,
        expected_revision: &[u8],
        update: &[u8],
    ) -> impl Future<Output = Result<StateWrite, DocumentError>> + Send;
}

/// Markdown conversions of collaborative state.
pub trait MarkdownStateConverter: Send + Sync {
    /// The markdown of the document in `snapshot`.
    fn markdown(
        &self,
        snapshot: &[u8],
    ) -> impl Future<Output = Result<String, DocumentError>> + Send;

    /// The update that makes `snapshot` hold exactly `markdown`, or `None`
    /// when it already does.
    fn update(
        &self,
        snapshot: &[u8],
        markdown: &str,
    ) -> impl Future<Output = Result<Option<Vec<u8>>, DocumentError>> + Send;
}

/// A document's markdown at a version.
#[derive(Debug, PartialEq, Eq)]
pub struct VersionedMarkdown {
    /// The markdown.
    pub markdown: String,
    /// The encoded version vector it was read at.
    pub revision: Vec<u8>,
}

/// The result of a markdown write.
#[derive(Debug, PartialEq, Eq)]
pub struct MarkdownWritten {
    /// The encoded version vector the document is at after the write.
    pub revision: Vec<u8>,
    /// False when the document already held the markdown and nothing was written.
    pub changed: bool,
}

/// Only native markdown documents have collaborative markdown.
pub fn ensure_markdown(document: &DocumentBasic) -> Result<(), DocumentError> {
    if document.try_file_type() == Some(FileType::Md) {
        return Ok(());
    }
    Err(DocumentError::BadRequest(
        "only native markdown documents have markdown content".to_string(),
    ))
}

/// Read the document's markdown with the version it was read at.
pub async fn read_markdown(
    state: &impl CollaborativeStatePort,
    converter: &impl MarkdownStateConverter,
    document_id: &str,
    token: &DocumentPermissionToken,
) -> Result<VersionedMarkdown, DocumentError> {
    let current = state.state(document_id, token).await?;
    Ok(VersionedMarkdown {
        markdown: converter.markdown(&current.snapshot).await?,
        revision: current.revision,
    })
}

/// Replace the document's content with exactly `markdown`.
///
/// With `base_revision`, the write applies only if the document is still at
/// that version, else [`DocumentError::Conflict`]. Without it, a concurrent
/// edit between read and write is retried on the newer state. Writing the
/// markdown a document already holds changes nothing and succeeds, whatever
/// the base.
pub async fn write_markdown(
    state: &impl CollaborativeStatePort,
    converter: &impl MarkdownStateConverter,
    document_id: &str,
    token: &DocumentPermissionToken,
    markdown: &str,
    base_revision: Option<&[u8]>,
) -> Result<MarkdownWritten, DocumentError> {
    for _ in 0..WRITE_ATTEMPTS {
        let current = state.state(document_id, token).await?;
        let Some(update) = converter.update(&current.snapshot, markdown).await? else {
            return Ok(MarkdownWritten {
                revision: current.revision,
                changed: false,
            });
        };
        let expected = base_revision.unwrap_or(&current.revision);
        match state.write(document_id, token, expected, &update).await? {
            StateWrite::Applied { revision } => {
                return Ok(MarkdownWritten {
                    revision,
                    changed: true,
                });
            }
            StateWrite::Conflict if base_revision.is_some() => {
                return Err(DocumentError::Conflict(
                    "the document changed since baseVersionId".to_string(),
                ));
            }
            StateWrite::Conflict => {}
        }
    }
    Err(DocumentError::Conflict(
        "the document kept changing during the write; retry".to_string(),
    ))
}
