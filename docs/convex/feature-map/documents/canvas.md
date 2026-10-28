# Canvas

Canvas is a shared drawing board with shapes, text labels, connectors, images, videos and document cards. Several people edit it at once and see each other's colored cursors and selections. Viewers can read but not edit. Ask Macro can read the canvas and apply bounded edits, and an open canvas can be copied, downloaded or saved as an image.

## Sub-features

- `canvas-create` creates an empty canvas from the create menus or through Ask Macro.
- `canvas-edit` draws and styles shapes, text, connectors and groups, with object snapping and zoom.
- `canvas-multiplayer` shows live cursors, remote selections and drag ghosts, and converges edits across editors.
- `canvas-offline` keeps unsent edits in the local cache during a disconnect and sends them on reconnect.
- `canvas-media` attaches media, uploads images or videos, and references documents through the Attach button or the I radial menu.
- `canvas-paste` pastes copied selections with their layout, and Shift+Cmd/Ctrl+V pastes in place.
- `canvas-image-actions` copies or saves the original image of a single selected image.
- `canvas-ai` lets Ask Macro read the canvas, make batched edits and watch named AI writers.
- `canvas-embed` shows a read-only canvas inside a Markdown document with Select and Hand tools.

## How to get to it (user POV)

- Create a canvas from the create menu, or ask Ask Macro to create one (the exact Drive menu label is unverified).
- Open an existing canvas from Files or a document card. Canvas opens in Canvas Next everywhere, including Drive detail views and Markdown embeds.
- Header: Ask Macro attaches the open canvas to the agent composer. The title menu offers Copy as prompt, Download and file actions.
- Attach button in the drawing toolbar: Media, Upload media, Reference.
- Keyboard: `I` opens the radial menu at the pointer (Media, Upload media, Reference). `V` selects and `H` pans. `.` fits the selection, or all content if nothing is selected.
- Zoom percentage at bottom left: Zoom In/Out, Zoom to fit, Zoom to fit selection, and presets 25%, 50%, 100%, 200%.
- Right-click an image: Copy image, Save image.
- Phone: tap the title to open the file menu with Ask Macro.

## Driving it with chrome-devtools MCP

Preconditions:

- Two browser windows are open on the same canvas: one signed in as an editor and one as a viewer. Use a fresh canvas for the test.
- Reload any tab opened before Canvas Next, since older tabs do not join shared state.

- **Create shape.** Click the shape tool in the toolbar, then drag on the canvas. Result: a rectangle appears in the editor window and in the other editor window within a few seconds.
- **Add text.** Choose the text tool, click the canvas, and `type_text`. Result: a text label with the typed text appears.
- **Attach menu.** Click the button named `Attach`. Result: a dropdown shows `Media`, `Upload media` and `Reference`.
- **Radial menu.** Press `i` with focus on the canvas and not in a text field. Result: separate floating buttons appear around the pointer. Press `Escape` to close.
- **Zoom to fit.** Click the zoom percentage button, then the menu item `Zoom to fit`. Result: all shapes fit the viewport.
- **Copy image.** Select one image, right-click it, and click `Copy image`. Result: the menu closes and the image is copied where the browser allows it.
- **Ask Macro.** Click the button named `Ask Macro` in the header, type a request such as "add two boxes with an arrow", and submit. Result: named AI writer previews appear in the other editor window before the batch commits.
- **Viewer check.** In the viewer window, try to create a shape. Result: no shape appears, and the edit tools are disabled.
- **Proof.** `take_screenshot` of both windows, plus `take_snapshot` of the viewer window.

## Gotchas

- Pressing `i` while a text field has focus types the letter instead of opening the radial menu.
- Remote overlays from absent peers expire after ten seconds.
- Editing the same text label at the same time keeps one finished string. Characters do not merge.
- If the first connection or local storage fails, the canvas opens read-only from its original JSON with a Retry action.
- Viewers can wait on the original JSON until the first editor initializes the room.
- Embedded canvases in Markdown are read-only and hide the grid. Their shortcuts must not change the outer document.
- Blob preview URLs never enter the saved scene. A missing native snapshot is an error, not an empty canvas.
- Ask Macro edits can be cancelled or lose acknowledgement. Inspect the canvas before repeating a request.
