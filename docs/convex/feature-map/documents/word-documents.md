# Word documents (DOCX)

An uploaded `.docx` opens in a paginated editor that looks like Word. Each page is drawn in place, so the text is not in the page DOM. Edits sync live as you type, each collaborator's caret shows their name, and Download .docx writes the current state back to Word format. Track changes, Word comments, footnotes and endnotes, headers and footers, find and replace, and AI reads and edits are part of the editor. It is behind the `enable-docx-editor` flag and labelled Beta.

## Sub-features

- `docx-open` opens an uploaded `.docx` in the editor; viewers and commenters get the same pages read-only.
- `docx-format` covers typing, paragraph styles, fonts, lists, indents, alignment, line spacing, tables and right-to-left text.
- `docx-headers-footers` edits a header or footer by double-clicking its area.
- `docx-notes` inserts and edits footnotes and endnotes.
- `docx-track` turns track changes on, shows insertions and deletions, and accepts or rejects them.
- `docx-comments` comments on selected text, including table cells, and shows Word comments as read-only cards.
- `docx-find` finds and replaces text with match options.
- `docx-download` exports the current state as `.docx`.
- `docx-ai` lets Ask Macro attach the document, and lets AI read, edit and comment on it.

## How to get to it (user POV)

- Upload a `.docx` in Files or a channel. It opens at `/app/write/<id>`.
- Home: clicking a DOCX opens the editor in the Home preview pane.
- Header: Ask Macro sits beside Share and opens a new agent session with the document mentioned.
- Formatting toolbar (labelled Document formatting) sits under the header.
- Shortcuts: Mod+F or Ctrl+H (find and replace), Mod+Z and Mod+Shift+Z (undo and redo your own edits), Mod+B/I/U (formatting), Ctrl+Alt+F and Ctrl+Alt+D (footnote and endnote), Mod+Alt+M (comment on selection).
- Floating Comment button appears beside a text selection.
- File title menu: Download .docx.

## Driving it with chrome-devtools MCP

Preconditions:

- `enable-docx-editor` is on for the test account.
- A disposable `.docx` fixture is uploaded and processing has finished.
- Page content is drawn on canvas, so verify text by downloading the file or opening it in a second window.

- **Open.** Click the document row in Files. Result: the header shows a Beta badge and the toolbar `Document formatting` appears. The pages render as paginated sheets.
- **Type.** Click a page to place the caret, then `type_text`. Result: a second window shows the new text and the caret labelled with the typing user's name.
- **Bold.** Select text by dragging across a page, then click the button named `Bold`. Result: the selected text renders bold.
- **Track changes.** Click the button named `Track changes`, then type. Result: the new text appears underlined as an insertion, and the margin shows a change bar.
- **Comment.** Select text, click the floating button named `Comment`, type in the discussion composer, then click `Send comment`. Result: a thread card opens in the right margin.
- **Find.** Press `Mod+F`. Result: a find bar opens with the field `Find in document`. Type a word; the status shows `<n> of <total>`.
- **Download.** Click the button named `Download .docx`. Result: a `.docx` file downloads that contains the edits.
- **Proof.** `take_screenshot` of the pages, and the downloaded file's path for a text check.

## Gotchas

- The browser's own find cannot see page text. Use the editor find bar.
- Keystrokes go to a hidden textarea labelled `Document text`. It must have focus, and a click on a page gives it focus.
- On a fresh upload the editor can wait up to 30 seconds for processing. After that it asks you to open the file again.
- The stored upload is not rewritten yet. Search, PDF export and AI reads still see the original file until the stored copy is updated.
- Macro discussion comments are not written into the `.docx`. Word comments, including the ones AI adds, are.
- Comments anchor in the body only, not in headers or footers.
- Undo reverts only your own edits, never a collaborator's.
