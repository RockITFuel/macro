use std::sync::Mutex;

use macro_sync_service_jwt::DocumentPermissionToken;

use super::*;

/// One document whose revision is the number of applied writes, and which
/// takes `concurrent_edits` other edits right after each of the first reads.
struct FakeState {
    revision: Mutex<u8>,
    concurrent_edits: Mutex<u8>,
    writes: Mutex<Vec<(Vec<u8>, Vec<u8>)>>,
}

impl FakeState {
    fn new(concurrent_edits: u8) -> Self {
        Self {
            revision: Mutex::new(0),
            concurrent_edits: Mutex::new(concurrent_edits),
            writes: Mutex::new(Vec::new()),
        }
    }

    fn writes(&self) -> Vec<(Vec<u8>, Vec<u8>)> {
        self.writes.lock().unwrap().clone()
    }
}

impl CollaborativeStatePort for FakeState {
    async fn state(
        &self,
        document_id: &str,
        _token: &DocumentPermissionToken,
    ) -> Result<CollaborativeState, DocumentError> {
        assert_eq!(document_id, "doc");
        let revision = *self.revision.lock().unwrap();
        let mut concurrent = self.concurrent_edits.lock().unwrap();
        if *concurrent > 0 {
            *concurrent -= 1;
            *self.revision.lock().unwrap() += 1;
        }
        Ok(CollaborativeState {
            snapshot: format!("snapshot@{revision}").into_bytes(),
            revision: vec![revision],
        })
    }

    async fn write(
        &self,
        _document_id: &str,
        _token: &DocumentPermissionToken,
        expected_revision: &[u8],
        update: &[u8],
    ) -> Result<StateWrite, DocumentError> {
        self.writes
            .lock()
            .unwrap()
            .push((expected_revision.to_vec(), update.to_vec()));
        let mut revision = self.revision.lock().unwrap();
        if expected_revision != [*revision] {
            return Ok(StateWrite::Conflict);
        }
        *revision += 1;
        Ok(StateWrite::Applied {
            revision: vec![*revision],
        })
    }
}

/// Holds `current` markdown: the update is the new markdown's bytes.
struct FakeConverter {
    current: &'static str,
}

impl MarkdownStateConverter for FakeConverter {
    async fn markdown(&self, snapshot: &[u8]) -> Result<String, DocumentError> {
        Ok(format!(
            "{} ({})",
            self.current,
            String::from_utf8_lossy(snapshot)
        ))
    }

    async fn update(
        &self,
        _snapshot: &[u8],
        markdown: &str,
    ) -> Result<Option<Vec<u8>>, DocumentError> {
        Ok((markdown != self.current).then(|| markdown.as_bytes().to_vec()))
    }
}

fn token() -> DocumentPermissionToken {
    DocumentPermissionToken::from("signed-token".to_string())
}

const CONVERTER: FakeConverter = FakeConverter { current: "# Old" };

#[tokio::test]
async fn read_returns_markdown_with_its_revision() {
    let state = FakeState::new(0);

    let read = read_markdown(&state, &CONVERTER, "doc", &token())
        .await
        .unwrap();

    assert_eq!(
        read,
        VersionedMarkdown {
            markdown: "# Old (snapshot@0)".to_string(),
            revision: vec![0],
        }
    );
}

#[tokio::test]
async fn write_applies_the_update_at_the_read_revision() {
    let state = FakeState::new(0);

    let written = write_markdown(&state, &CONVERTER, "doc", &token(), "# New", None)
        .await
        .unwrap();

    assert_eq!(
        written,
        MarkdownWritten {
            revision: vec![1],
            changed: true,
        }
    );
    assert_eq!(state.writes(), [(vec![0], b"# New".to_vec())]);
}

#[tokio::test]
async fn unchanged_markdown_writes_nothing() {
    let state = FakeState::new(0);

    let written = write_markdown(&state, &CONVERTER, "doc", &token(), "# Old", Some(&[7]))
        .await
        .unwrap();

    assert!(!written.changed);
    assert!(state.writes().is_empty());
}

#[tokio::test]
async fn write_at_the_current_base_succeeds() {
    let state = FakeState::new(0);

    let written = write_markdown(&state, &CONVERTER, "doc", &token(), "# New", Some(&[0]))
        .await
        .unwrap();

    assert!(written.changed);
}

#[tokio::test]
async fn stale_base_conflicts_without_retrying() {
    let state = FakeState::new(1);

    let error = write_markdown(&state, &CONVERTER, "doc", &token(), "# New", Some(&[0]))
        .await
        .unwrap_err();

    assert!(matches!(error, DocumentError::Conflict(_)));
    assert_eq!(state.writes().len(), 1);
}

#[tokio::test]
async fn concurrent_edit_without_base_retries_on_the_newer_state() {
    let state = FakeState::new(1);

    let written = write_markdown(&state, &CONVERTER, "doc", &token(), "# New", None)
        .await
        .unwrap();

    assert_eq!(written.revision, vec![2]);
    assert_eq!(
        state.writes(),
        [(vec![0], b"# New".to_vec()), (vec![1], b"# New".to_vec())]
    );
}

#[tokio::test]
async fn persistent_concurrent_edits_end_in_a_conflict() {
    let state = FakeState::new(u8::MAX);

    let error = write_markdown(&state, &CONVERTER, "doc", &token(), "# New", None)
        .await
        .unwrap_err();

    assert!(matches!(error, DocumentError::Conflict(_)));
    assert_eq!(state.writes().len(), WRITE_ATTEMPTS);
}
