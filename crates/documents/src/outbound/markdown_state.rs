//! Sync-service and lexical-service adapters for exact markdown reads and writes.

use lexical_client::LexicalClient;
use macro_sync_service_jwt::DocumentPermissionToken;
use sync_service_client::{
    SyncServiceClient,
    document_state::{DocumentStateError, DocumentUpdate},
};

use crate::domain::markdown_replace::{
    CollaborativeState, CollaborativeStatePort, MarkdownStateConverter, StateWrite,
};
use crate::domain::models::DocumentError;

impl CollaborativeStatePort for SyncServiceClient {
    async fn state(
        &self,
        document_id: &str,
        token: &DocumentPermissionToken,
    ) -> Result<CollaborativeState, DocumentError> {
        let state = self
            .document_state(document_id, token)
            .await
            .map_err(|error| state_error(document_id, error))?;
        Ok(CollaborativeState {
            snapshot: state.snapshot,
            revision: state.revision,
        })
    }

    async fn write(
        &self,
        document_id: &str,
        token: &DocumentPermissionToken,
        expected_revision: &[u8],
        update: &[u8],
    ) -> Result<StateWrite, DocumentError> {
        match self
            .update_document(document_id, token, expected_revision, update)
            .await
            .map_err(|error| state_error(document_id, error))?
        {
            DocumentUpdate::Applied { revision } => Ok(StateWrite::Applied { revision }),
            DocumentUpdate::Conflict => Ok(StateWrite::Conflict),
        }
    }
}

/// A grant we minted being refused is our failure, not the caller's.
fn state_error(document_id: &str, error: DocumentStateError) -> DocumentError {
    match error {
        DocumentStateError::NotFound => DocumentError::NotFound(document_id.to_string()),
        DocumentStateError::TooLarge => {
            DocumentError::BadRequest("the document exceeds the size limit".to_string())
        }
        DocumentStateError::Invalid => {
            DocumentError::BadRequest("invalid baseVersionId".to_string())
        }
        error => DocumentError::Internal(error.into()),
    }
}

impl MarkdownStateConverter for LexicalClient {
    async fn markdown(&self, snapshot: &[u8]) -> Result<String, DocumentError> {
        self.snapshot_markdown(snapshot)
            .await
            .map_err(DocumentError::Internal)
    }

    async fn update(
        &self,
        snapshot: &[u8],
        markdown: &str,
    ) -> Result<Option<Vec<u8>>, DocumentError> {
        self.markdown_update(snapshot, markdown)
            .await
            .map_err(DocumentError::Internal)
    }
}
