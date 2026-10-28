# Uploads and conversion

Files can be added to Macro by dropping them into the app, dragging them from the desktop app, or choosing a folder. Legacy Office files are converted to their modern formats on upload. Converted workbooks open in a read-only preview where Edit in Macro creates a native copy. Each uploaded file keeps its name and id; its type changes when it is converted.

## Sub-features

- `upload-drop` adds dropped or chosen files to Files, a document or a chat.
- `upload-desktop-drop` drops files from Finder into the rebuilt macOS desktop app.
- `upload-folder` imports a dropped folder as a folder tree, with empty subfolders kept.
- `upload-legacy-office` converts `.doc`, `.ppt` and `.xls` to `.docx`, `.pptx` and `.xlsx`.
- `upload-converting-view` shows the progress of a conversion for files uploaded in the last 10 minutes.
- `upload-preview-workbook` shows an uploaded workbook read-only, with Edit in Macro.

## How to get to it (user POV)

- Files view: drop files on the page, or use New → Upload (label unverified).
- Folder: drop a folder, or choose one with the folder picker.
- Markdown editor: drop an image or PDF to attach it inline; channel and AI chat composers accept drops too.
- macOS desktop app: Finder drag into a document or composer, when the desktop setting is on.
- A converted file keeps its id and name; its type changes. Download still returns the original file.

## Driving it with chrome-devtools MCP

Preconditions:

- A disposable Files folder is open.
- Fixtures are ready: a PNG, a PDF, a `.doc`, an `.xls` and a small folder with a subfolder.
- Folder import runs in a Lambda that the local stack does not run. Verify folder imports against a deployed backend.

- **Upload file.** Click the button named `New`, then the upload item (exact label unverified). Choose the PNG in the picker. Result: the file appears in the list after upload.
- **Drop folder.** Drop the folder fixture onto Files. Result: a folder tree appears; empty subfolders are kept, and `__MACOSX` and hidden files are not imported.
- **Legacy Word.** Upload the `.doc`. Result: the view shows `Converting … to a Word document…` with Download still available; when conversion lands the view reopens as a DOCX.
- **Legacy workbook.** Upload the `.xls`. Result: the workbook opens in the read-only preview with the Import notes panel.
- **Edit in Macro.** Click `Edit in Macro` on the workbook preview. Result: a native copy opens, and the original file stays available.
- **Proof.** `take_screenshot` after the converting view and after conversion.

## Gotchas

- A conversion that takes more than three minutes falls back to a plain view with Download.
- The converting view only applies to files uploaded in the last 10 minutes.
- The browser cannot see empty folders selected with the folder picker. Only a dropped folder keeps them.
- Office lock files (`~$…`), `Thumbs.db`, `desktop.ini` and hidden files are skipped on folder import.
- Desktop Finder drops need the rebuilt macOS app; synthetic browser drops do not test them.
- Pasting or dropping an image on a canvas shows a local preview until upload finishes. A failed upload removes the preview and reports the error.
