# Comments and history

Each document has a Discussion section under the body where people leave comments, reply in threads, and mention others. Spreadsheets and Word documents add their own comment flows, anchored to cells or text. Document history shows earlier versions on a timeline, lets you preview any point, and can fork a version into a new document.

## Sub-features

- `comments-discussion` posts, replies to, edits and deletes comments in a document's Discussion section.
- `comments-mentions` mentions people in comments, which notifies them.
- `comments-anchored-md` attaches a comment to selected text in a Markdown document.
- `comments-sheet` comments on a spreadsheet cell or range and reads threads in the workbook sidebar.
- `comments-docx` comments on Word text and shows Word comments as read-only cards.
- `comments-pptx` leaves comments in the presentation Review tab.
- `history-view` opens History and previews a version or session.
- `history-fork` copies a selected version into a separate document.

## How to get to it (user POV)

- Markdown document: Discussion section below the body; select text and use the comment action to anchor a thread.
- Spreadsheet: select a cell or range and choose Comment in the ribbon or press Cmd/Ctrl+Alt+M. The header's Comments opens the sidebar. Open, Resolved and All filter the range threads.
- Word: floating Comment button beside a selection, the toolbar's Comment on selection, or Mod+Alt+M.
- Presentation: Review tab → New Comment.
- History (desktop only): document title's `…` menu → History. Phone does not offer it.

## Driving it with chrome-devtools MCP

Preconditions:

- A disposable Markdown document is open, and a second account is available for the mention check.
- Discard unsent test drafts when finished.

- **Post comment.** Click the Discussion composer named `Leave a comment...`, `type_text` a sentence, then click `Send comment`. Result: the comment appears above the composer with the author and timestamp.
- **Mention.** Type `@` and choose the second account. Result: the mention chip appears; the second account gets a notification after sending.
- **Reply.** Hover a comment, click its reply control (name from the snapshot), type, then send. Result: the reply appears under the thread.
- **Delete first message.** Click the delete action on the first message. Result: the confirmation reads `Delete comment` and the whole discussion is removed when confirmed.
- **Open history.** Click the title `…` menu, then `History`. Result: an overlay shows a read-only version preview and a timeline on the right.
- **Preview.** Click a point on the timeline. Result: the preview shows that version. Click `Current version` to return.
- **Fork.** Click `Fork` with a version selected. Result: a new separate document opens.
- **Close.** Press `Escape` or click `Close history`. Result: the editor returns with its scroll position.
- **Proof.** `take_screenshot` of the history overlay and of the discussion.

## Gotchas

- The Discussion composer is compact until its text wraps or a second line is typed.
- Comments on text that has since changed appear under `Comments on text that has changed`.
- Discussions on a Word document are stored with the document. Word comments stay in the file; Macro comment threads do not.
- A spreadsheet comment draft captures the sheet and range when it opens. Later selection changes do not move the draft.
- The history overlay is desktop-only. On phone, History is hidden.
- Editing a comment keeps its attachment and send controls. There is no trash button in edit mode.
