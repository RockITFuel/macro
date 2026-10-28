# Drive files

Drive is Macro's file browser at Files. It lists documents, folders, databases and uploaded files under the tabs My Files, Shared with me, Recent, Folders and All files, with search, filters, tags, sorting, folder creation, uploads, downloads and trash. Opening a file replaces the list with a breadcrumbed detail with file actions.

## Sub-features

- `drive-browse` opens tabs (Owned/My Files, Shared, Recent, Folders, All) and folder overview.
- `drive-search` searches the current tab or folder overview with Cmd/Ctrl+F or the Search Drive field.
- `drive-filter` narrows by Type, Tags and Created by; Files scope options (Default, All files, Email attachments).
- `drive-sort` sorts by modified, created or viewed date (not offered on Recent).
- `drive-folder-create` creates a folder with a name, tags, and staged files or folders.
- `drive-upload` uploads files or a folder by drag and drop or the New menu.
- `drive-detail` opens a Markdown, code, CSV, image, video, PDF, DOCX, canvas, or unknown file in place with a breadcrumb.
- `drive-download` downloads a file (PDF also prints; DOCX downloads as DOCX).
- `drive-trash` moves items to trash, restores them, and deletes permanently.
- `drive-favorites` adds and removes favorites in the sidebar.
- `drive-rename-move` renames and moves files and folders, including to root.

## How to get to it (user POV)

- Sidebar: choose **Drive** (route `/app/component/documents`).
- Sidebar: **New file or folder**, **My Files**, **Recent**, **Shared with me**, favorites and the folder tree.
- Mobile dock: choose **Files**; opens on **Recent**. The header pill strip holds Recent, My Files, Shared with me, Folders.
- Command menu and Quick Access open the same locations.
- Right-click any view or folder for Open in new split, Open in current split, Open fullscreen.
- New menu (sidebar or toolbar) for file, folder and database creation; the label reads `New file or folder in <location>`.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in; the test user has a folder with at least one document and one uploaded file.
- Start from `/app/component/documents` with no active filters.
- Use a small test file for uploads; do not upload customer data to hosted dev.

- **Open My Files.** Navigate to `/app/component/documents`. Take a snapshot. Observable: a tab `My Files` is selected; rows show a title, tags and an updated time.
- **Create a folder.** Click the New menu (named `New file or folder in <location>`), choose `Folder`. Enter `Folder name` text, then click `Create Folder`. Observable: the composer closes; a toast offers `Open`; the folder appears in the list.
- **Upload.** Choose `button "Upload files"` from the New menu, or drop a file onto the list. Observable: an upload progresses; the file appears in the current folder after completion.
- **Filter by type.** Open `Filter` and choose `Type`, then the option `Database` (other type option names unverified). Observable: the filter trigger shows a count of 1; the list narrows.
- **Open a file in place.** Click a row's title for a Markdown file. Observable: the list is replaced by a detail with a breadcrumb; the top bar shows the file title.
- **Download.** Open the file menu and choose `Download`. Observable: a download starts with the file name.
- **Trash and restore.** Choose the trash action on a test file (menu label unverified), then open Trash and choose `Restore`. Observable: the row returns to its location.
- **Proof.** Record snapshot text for the tab state, the breadcrumb, and the filter count after each step.

## Gotchas

- Shared never includes files you own. Selecting Created by → Me on Shared returns no files.
- Databases do not appear in Recent, folder contents, or Email attachments, and they have no folder membership yet.
- Files opened from Drive show a return link with the originating view name; the link restores that view.
- Folder creation closes the composer immediately; uploads finish in the background. Confirm the item after a short wait.
- On a failed folder upload, the toast's Retry restores the draft with only the failed uploads.
- Closing a folder composer without submitting leaves no server data.
- Search inside a folder is temporarily hidden; sidebar folder-name search still works.
