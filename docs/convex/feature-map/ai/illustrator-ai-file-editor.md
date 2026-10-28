# Illustrator file editor

The Illustrator file editor opens Adobe Illustrator `.ai` files and creates new ones with a single 1920 × 1080 artboard. Users view and edit artboards, layers, shapes, paint, text and properties in a canvas editor, with changes shown to collaborators. This is a document-type editor for design files; it has no AI model calls. The directory is named `ai` because of the file type.

## Sub-features

- `ai-open` opens an uploaded `.ai` file from Files or a link.
- `ai-create` creates a new Illustrator file from the Create menu.
- `ai-canvas` pans, zooms and selects artboards and shapes on the canvas.
- `ai-tools` draws shapes and text and edits paint and properties.
- `ai-layers` shows and reorders layers and artboards from the layers panel.
- `ai-collab` shows collaborators' cursors and presence.
- `ai-download` downloads the file when the editor is off.

## How to get to it (user POV)

- Open an uploaded `.ai` file from Files; it opens at `/app/ai/<document-id>`.
- Create menu (`V` key, also in project create menus): Illustrator file.
- With the editor flag off, the file offers download instead of opening.
- Mobile: view-oriented; editing controls are reduced (unverified).

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running with the `enable-ai-editor` flag on (on by default in dev builds).
- A test `.ai` file or a new file from the Create menu is available.

- **Create.** Press `v` outside any editable field. Observable: a new Illustrator document opens with one artboard at 1920 by 1080.
- **Draw.** Choose a shape tool from the tool bar, click and drag on the canvas. Observable: a shape appears in the layers panel.
- **Edit properties.** Select the shape, change its paint swatch in the properties panel. Observable: the swatch and the shape's fill update.
- **Layers.** Open the layers panel and select the shape's row. Observable: the canvas selection matches the row.
- **Reload.** Reload the page at the same URL. Observable: the shape is still present.
- **Proof.** Save a snapshot of the layers panel and a screenshot of the canvas.

## Gotchas

- The canvas renders in a web worker with tile helpers; a blank canvas on first load can be a renderer delay rather than missing data.
- With the flag off the block offers download, not editing; do not mark the feature broken in that state.
- Collaborator presence is only as current as the last shared update.
- The file format is rendered by a compiled engine in the browser; backend work is mainly file storage and sharing.
- This feature is not part of the AI chat or agent workflows; scope it with documents and files.
