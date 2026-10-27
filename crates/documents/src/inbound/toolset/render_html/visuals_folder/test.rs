use std::sync::atomic::{AtomicUsize, Ordering};

use macro_user_id::user_id::MacroUserIdStr;

use super::*;

fn user(email: &str) -> CreationPrincipal {
    CreationPrincipal::User(
        MacroUserIdStr::try_from(format!("macro|{email}")).expect("valid user id"),
    )
}

/// Projects in memory; creating one takes a moment, so concurrent renders
/// overlap the way real ones do.
#[derive(Default)]
struct FakeStore {
    folders: Mutex<Vec<FolderSummary>>,
    created: AtomicUsize,
}

#[async_trait]
impl FolderStore for FakeStore {
    async fn folders(&self, _principal: &CreationPrincipal) -> anyhow::Result<Vec<FolderSummary>> {
        Ok(self.folders.lock().unwrap().clone())
    }

    async fn create_folder(
        &self,
        principal: &CreationPrincipal,
        name: &str,
    ) -> anyhow::Result<Uuid> {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        self.created.fetch_add(1, Ordering::SeqCst);
        let id = Uuid::new_v4();
        self.folders.lock().unwrap().push(FolderSummary {
            id,
            name: name.to_owned(),
            owner: principal.owner(),
            nested: false,
            deleted: false,
        });
        Ok(id)
    }
}

#[tokio::test]
async fn creates_the_folder_once_and_reuses_it() {
    let folders = VisualsFolders::new(FakeStore::default());
    let alice = user("alice@example.com");

    let first = folders.visuals_folder(&alice).await.unwrap();
    let second = folders.visuals_folder(&alice).await.unwrap();

    assert_eq!(first, second);
    assert_eq!(folders.store.created.load(Ordering::SeqCst), 1);
    let stored = folders.store.folders.lock().unwrap().clone();
    assert_eq!(stored[0].name, "Visuals");
}

#[tokio::test]
async fn concurrent_renders_share_one_new_folder() {
    let folders = Arc::new(VisualsFolders::new(FakeStore::default()));
    let alice = user("alice@example.com");

    let ids = futures::future::join_all((0..5).map(|_| {
        let folders = Arc::clone(&folders);
        let alice = alice.clone();
        async move { folders.visuals_folder(&alice).await.unwrap() }
    }))
    .await;

    assert!(ids.windows(2).all(|pair| pair[0] == pair[1]), "{ids:?}");
    assert_eq!(folders.store.created.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn each_owner_gets_their_own_and_lookalikes_are_ignored() {
    let alice = user("alice@example.com");
    let bob = user("bob@example.com");
    let lookalikes = [
        // Bob's own folder is not Alice's.
        FolderSummary {
            id: Uuid::new_v4(),
            name: "Visuals".to_owned(),
            owner: bob.owner(),
            nested: false,
            deleted: false,
        },
        // A nested, a trashed and a differently named project of Alice's.
        FolderSummary {
            id: Uuid::new_v4(),
            name: "Visuals".to_owned(),
            owner: alice.owner(),
            nested: true,
            deleted: false,
        },
        FolderSummary {
            id: Uuid::new_v4(),
            name: "Visuals".to_owned(),
            owner: alice.owner(),
            nested: false,
            deleted: true,
        },
        FolderSummary {
            id: Uuid::new_v4(),
            name: "visuals old".to_owned(),
            owner: alice.owner(),
            nested: false,
            deleted: false,
        },
    ];
    let store = FakeStore::default();
    store.folders.lock().unwrap().extend(lookalikes.clone());
    let folders = VisualsFolders::new(store);

    let alices = folders.visuals_folder(&alice).await.unwrap();
    assert!(lookalikes.iter().all(|folder| folder.id != alices));
    assert_eq!(folders.store.created.load(Ordering::SeqCst), 1);

    // Bob's existing folder is reused.
    assert_eq!(
        folders.visuals_folder(&bob).await.unwrap(),
        lookalikes[0].id
    );
    assert_eq!(folders.store.created.load(Ordering::SeqCst), 1);
}
