# PDF documents

An uploaded PDF opens in the Macro PDF viewer. From its toolbar a person with edit access can draw a signature, place it on a page and save it into the PDF. Other PDF features, such as markup and tabs, sit behind their own flags, and the agent guide does not document them; they are unverified here.

## Sub-features

- `pdf-view` opens and reads an uploaded PDF, including from links in documents.
- `pdf-signature` draws a signature, places it on a page, and saves it into that PDF.
- `pdf-markup` (unverified) is gated by the markup flag; its tools are not documented in the agent guide.
- `pdf-tabs` (unverified) is gated by the tabs flag; the behavior is not documented in the agent guide.

## How to get to it (user POV)

- Open an uploaded `.pdf` from Files, a channel or a document card.
- PDF toolbar: Signature.
- Access: a PDF offers Comment as an access upgrade, but not Edit.
- Tabs and markup entry points are unverified.

## Driving it with chrome-devtools MCP

Preconditions:

- A disposable PDF is open with edit access.
- The toolbar is visible, not hidden by a narrow viewport.

- **Start signature.** Click the toolbar button named `Signature`, then click a page. Result: the dialog `Draw signature` opens over the PDF.
- **Draw.** Drag across the canvas inside the dialog. Result: a stroke appears under the pointer, and the button `Use signature` becomes enabled.
- **Place.** Click `Use signature`, then click the page where the signature should go. Result: the signature appears on the page.
- **Adjust.** Drag the placed signature. Result: it moves and stays where released.
- **Save.** Use the normal save flow for the PDF. Result: reopening the PDF shows the signature.
- **Cancel.** Open the dialog and click `Cancel signature`, or press `Escape`. Result: no empty signature box is left on the page.
- **Proof.** `take_screenshot` before and after placing the signature.

## Gotchas

- Saved, reusable signatures are not available yet. Each signature is drawn fresh.
- Draw near the right and bottom edges as well as the center to confirm strokes land under the pointer.
- Check the dialog at phone width and at a 2x pixel density; strokes must survive a resize.
- The dialog stays centered during its opening animation and starts with an empty canvas.
