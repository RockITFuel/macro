# AI edit in documents

AI edit lets a user describe a change to a markdown document, then watches the assistant type it into the document. The edit streams directly into the document as a live cursor named for the assistant, with no accept or reject step. A selected passage can be edited the same way. The user can stop a running edit at any point.

## Sub-features

- `edit-whole` edits the whole document from a prompt via Edit with AI.
- `edit-selection` edits only the selected text from a prompt.
- `edit-stream` shows the edit as a live cursor labeled `Macro (AI)` or the name of the agent that asked, typing in place.
- `edit-stop` stops a running edit with Stop AI edit.
- `edit-mentions` lets the edit prompt and the document use @ mention chips.
- `edit-refused` shows the usage-limit dialog or the AI edit failed message when an edit is refused.

## How to get to it (user POV)

- Open a document and click `Edit with AI`, directly under the editor body.
- Select text in a document and use the selection's AI edit control; the prompt box appears at the selection.
- An agent session can ask for an edit on a document; the cursor is then labeled with that agent's name.
- Mobile: the same button under the editor body; the prompt box uses the shared Send button.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user who owns a test markdown document.
- The document has a few paragraphs of text. Edits are real and mutate the document, so use a throwaway document.

- **Open the edit prompt.** Open the test document. Click the button named `Edit with AI`. Observable: a focused prompt box with placeholder `Describe the edit…` appears.
- **Enter the instruction.** Click the prompt box, `type_text` an instruction such as "Add a one-line summary at the top", then press Enter. Observable: the Send button becomes black with a white arrow in light mode; Stop appears in the button row.
- **Watch the cursor.** Take a snapshot after a few seconds. Observable: a cursor labeled `Macro (AI)` (or the asking agent's name) sits in the text and new text appears.
- **Wait for completion.** Poll with `evaluate_script` until no button named `Stop AI edit` (or matching `Stop`) remains. Do not wait on text.
- **Verify.** Read the editor's text content from the snapshot. Observable: the new text is in the document; there is no accept or reject control.
- **Stop path.** Start another edit and click `Stop AI edit` before completion. Observable: the text stops changing and the running state clears.
- **Proof.** Save a snapshot of the document before and after the edit, and record the final text.

## Gotchas

- Edits have no undo-by-review step; verify the document content before and after.
- Completion is shown only by the disappearance of the Stop button; text can false-match `wait_for`.
- Edits are refused with the usage-limit dialog when the AI allowance is used up, and the document stays unchanged.
- The edit runs in a separate worker that joins the document as a collaborator; a live collaborator sees the same cursor.
- A stopped edit can leave partially applied text; a user who wants a clean document should undo or edit manually.
- Document AI edit uses the Macro-funded models; the account's allowance applies.
- Word (DOCX) documents are not covered by this flow; the documents guide says the edit tool still rejects DOCX (unverified for the in-editor button).
