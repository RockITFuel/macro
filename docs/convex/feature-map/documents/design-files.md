# Design files (Figma, Photoshop, Illustrator)

Uploaded design files open in browser editors: `.fig` Figma designs, `.psd` and `.psb` Photoshop documents, and `.ai` Illustrator documents. Each runs its engine in WebAssembly and draws tiles as you zoom. People with edit access get the editor; others get the same view read-only with only the selection, hand and zoom tools. Each type has its own feature flag, and with the flag off the file is download-only. Macro AI reads these files through their own tools.

## Sub-features

- `design-open-fig` opens an uploaded `.fig` in the Figma-style editor, showing a preview while the session starts.
- `design-create-fig` creates a new empty design.
- `design-open-psd` opens an uploaded `.psd` or `.psb` in the Photoshop editor.
- `design-create-psd` creates a new 1920 × 1080 Photoshop document with a white background.
- `design-open-ai` opens an uploaded `.ai` in the Illustrator editor.
- `design-create-ai` creates a new Illustrator document with one 1920 × 1080 artboard.
- `design-autosave` saves edits automatically 1.5 seconds after the last change.
- `design-ai-read` lets Macro AI read these files with dedicated read tools.

## How to get to it (user POV)

- Open an uploaded `.fig`, `.psd`, `.psb` or `.ai` from Files, a channel or a document card.
- Create menu: Design (key `I`), Photoshop file (key `H`), Illustrator file (key `V`). The same items appear in project create menus.
- Routes: `/app/fig/<id>`, `/app/psd/<id>`, `/app/ai/<id>`.
- Photoshop and Illustrator documents appear with the design files, not with images.

## Driving it with chrome-devtools MCP

Preconditions:

- The matching flag is on: `enable-fig-viewer`, `enable-psd-editor` or `enable-ai-editor`.
- A disposable file of each type is uploaded, or the create menu is available.
- A second window signed in as a viewer is available for the read-only check.

- **Create Photoshop file.** Press `H` outside a text field, or click Create → Photoshop file. Result: a new document opens with a white background at 1920 × 1080.
- **Create Illustrator file.** Press `V`, or click Create → Illustrator file. Result: a new document opens with one artboard.
- **Create Design.** Press `I`, or click Create → Design. Result: an empty design opens.
- **Open uploaded Figma file.** Click the `.fig` row in Files. Result: the preview appears first and then the editor takes over.
- **Edit.** Draw or move an object in the editor. Result: after about 1.5 seconds the edit saves; reloading shows it.
- **Viewer check.** In the viewer window, open the same file. Result: only the selection, hand and zoom tools appear.
- **Proof.** `take_screenshot` of each editor and the viewer window.

## Gotchas

- Keyboard shortcuts `H`, `I` and `V` only work outside text fields.
- The first open of a session downloads and compiles the engine. Reopening a file reuses the compiled engine.
- With the flag off the file is download-only. Check flags before concluding an editor is broken.
- Macro AI reads Photoshop and Illustrator documents through `ReadPhotoshopDocument` and `ReadIllustratorDocument`, not as images.
