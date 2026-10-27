//! The folder every `RenderHtml` page is saved in: one top-level project
//! named "Visuals" per owner, created on the first render and reused after.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};

use async_trait::async_trait;
use model_owner::{CreationPrincipal, Owner};
use uuid::Uuid;

/// The folder's name, as the user sees it in their files.
pub const VISUALS_FOLDER_NAME: &str = "Visuals";

/// A project, as far as finding the folder needs it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSummary {
    /// The project id.
    pub id: Uuid,
    /// Its name.
    pub name: String,
    /// Who owns it.
    pub owner: Owner,
    /// Whether it sits inside another project.
    pub nested: bool,
    /// Whether it is in the trash.
    pub deleted: bool,
}

/// The projects a principal can see, and creating one: the port the
/// composition root fills with the project service.
#[async_trait]
pub trait FolderStore: Send + Sync {
    /// Projects the principal's user can access.
    async fn folders(&self, principal: &CreationPrincipal) -> anyhow::Result<Vec<FolderSummary>>;
    /// Create a top-level project named `name`, owned as `principal` says.
    async fn create_folder(
        &self,
        principal: &CreationPrincipal,
        name: &str,
    ) -> anyhow::Result<Uuid>;
}

/// Finds or creates the "Visuals" folder a page is saved in.
#[async_trait]
pub trait VisualsFolder: Send + Sync {
    /// The principal's folder, created when it does not exist yet.
    async fn visuals_folder(&self, principal: &CreationPrincipal) -> anyhow::Result<Uuid>;
}

/// One lock per owner for this process, shared by every [`VisualsFolders`]:
/// tool contexts are rebuilt per call, the race is not.
static OWNER_LOCKS: LazyLock<Mutex<HashMap<Owner, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(Mutex::default);

fn lock_for(owner: &Owner) -> Arc<tokio::sync::Mutex<()>> {
    let mut locks = OWNER_LOCKS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    locks.entry(owner.clone()).or_default().clone()
}

/// [`VisualsFolder`] over a [`FolderStore`]. Lookups for one owner are
/// serialized in this process, so two pages rendered at once do not create
/// two folders; across processes the first-listed match wins.
pub struct VisualsFolders<S> {
    store: S,
}

impl<S: FolderStore> VisualsFolders<S> {
    /// Folders kept in `store`.
    pub fn new(store: S) -> Self {
        Self { store }
    }
}

/// The owner's live, top-level folder named "Visuals", if any.
fn existing(folders: &[FolderSummary], owner: &Owner) -> Option<Uuid> {
    folders
        .iter()
        .find(|folder| {
            folder.name == VISUALS_FOLDER_NAME
                && &folder.owner == owner
                && !folder.nested
                && !folder.deleted
        })
        .map(|folder| folder.id)
}

#[async_trait]
impl<S: FolderStore> VisualsFolder for VisualsFolders<S> {
    async fn visuals_folder(&self, principal: &CreationPrincipal) -> anyhow::Result<Uuid> {
        let owner = principal.owner();
        let lock = lock_for(&owner);
        let _held = lock.lock().await;
        if let Some(id) = existing(&self.store.folders(principal).await?, &owner) {
            return Ok(id);
        }
        self.store
            .create_folder(principal, VISUALS_FOLDER_NAME)
            .await
    }
}

#[cfg(test)]
mod test;
