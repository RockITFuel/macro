# Markdown documents

Markdown documents are collaborative rich-text notes at `/app/drive/md/<id>`. Several people edit the same body live, changes save as you type, and undo reverts only your own edits. The editor has a `/` slash menu, `@` mentions, a section outline rail, embedded cards for documents, code, canvases and PDFs, Copy Code on code blocks, and AI edits that stream into the text. The title bar has Share, Copy Share Link and Side Panel; the side panel shows actions, details, tags and properties.

## Sub-features

- `md-create` creates a document from Create → Document, from the `/document` composer, or with Cmd/Ctrl+Enter.
- `md-live-edit` edits one body with other people in real time, with per-user undo and visible carets.
- `md-slash` opens the `/` menu for headings, Query, Database and other blocks.
- `md-mentions` inserts `@` mentions of people, documents, channels, dates, agent sessions, companies and projects.
- `md-embeds` shows embedded document, code, canvas and PDF cards with a resize grip and Convert to Embed.
- `md-outline` shows section ticks in the left margin of documents with three or more headings.
- `md-ai-edit` runs Edit with AI on the whole body or on selected text, with a Stop control.
- `md-title-meta` shows Add tags and Add property pills under the title, plus details on hover.
- `md-side-panel` shows Actions, Details, Tags and Properties; properties can be pinned below the title.
- `md-copy-code` copies a code block with its Copy Code button.
- `md-offline-mobile` reopens a previously opened document on native mobile from its cache.

## How to get to it (user POV)

- Files view: choose `New` → Document, or open an existing document row.
- Create menu: choose Create → Document to open a new document directly.
- Any Markdown editor: type `/document`, choose Document, then choose Create Document or press Cmd/Ctrl+Enter. Choose Continue editing in split to open it beside the source.
- Paste a Macro document link (for example `/app/drive/md/<id>`) into an editor to insert a document card.
- Type `@` in an editor and choose a document from the mention list.
- Document header: Share, Copy Share Link, Side Panel. The title's `…` menu holds History (desktop), Copy as prompt, Download and file actions.
- Phone: document links open the full-page route; Share is under the Link tab.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is signed in. Use a disposable account or a disposable document.
- The Files view is open at `/app/drive`.
- A second browser window is available for the collaboration check.

- **Create document.** Click the button named `New` (or the Create control), then the menu item `Document`. Result: an untitled document opens and its body contains an editable textbox.
- **Type body.** Click the body textbox in the snapshot, then `type_text` a sentence. Result: the sentence appears in the snapshot value of the body.
- **Slash menu.** On an empty line type `/`, then `take_snapshot` and click the option named `Database`. Result: an Untitled database block is inserted at the caret.
- **Create from composer.** Type `/document` on an empty line, choose the option named `Document`, type a title, then press `Ctrl+Enter`. Result: the composer closes, a placeholder appears, and a document mention replaces it.
- **Share.** Click the header button named `Share`. Result: a dialog with the heading `People with access` opens.
- **Side panel.** Click the header button named `Side Panel` or `Hide/Show Side Panel`. Result: the right panel toggles and shows the sections Details, Tags and Properties.
- **Edit with AI.** Click the button named `Edit with AI`, `type_text` an instruction into the textbox named `Describe the edit…`, then press `Enter`. Result: a button named `Stop AI edit` appears, text streams into the body, and the live cursor is labelled `Macro (AI)`.
- **Copy code.** Hover a code block and click the button named `Copy Code`. Result: the icon briefly turns into a green check. No toast appears.
- **Proof.** `take_screenshot` after the create step and after the AI step.

## Gotchas

- The body is contenteditable. Use `click` to focus it and `type_text`; `fill` works only on real inputs.
- Re-snapshot after each re-render. Element ids change when a region rerenders.
- `wait_for` can match placeholder or duplicate text. Choose unique strings.
- A `LoroDoc` crash dialog after an HMR reconnect needs a hard reload that ignores the cache. A normal reload does not clear it.
- Undo reverts only your own edits. Verify collaborator text with a second window.
- The `Create → Document` and `New` labels are as documented in the agent guide; confirm the exact menu labels in the snapshot before clicking.
