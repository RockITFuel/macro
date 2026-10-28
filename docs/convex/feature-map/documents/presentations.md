# Presentations (PowerPoint)

An uploaded `.pptx` opens in a PowerPoint-style editor: a ribbon with Home, Insert, Design, Transitions, Slide Show, Review and View tabs, a slide rail, a stage for shapes, text, tables, charts, equations and SmartArt, speaker notes, comments, and a slide show with presenter view. Pictures, shapes and tables get contextual format tabs. With the `enable-pptx-editor` flag off, the file is download-only.

## Sub-features

- `pptx-open` opens an uploaded `.pptx` in the editor, with one-time engine load on first open.
- `pptx-slides` adds, reorders and sections slides in the rail or the Slide Sorter, and edits Header & Footer and slide size.
- `pptx-shapes` covers shape, text, table, chart and SmartArt editing on the stage.
- `pptx-pictures` covers picture corrections, cropping, shape effects and Merge Shapes.
- `pptx-master` opens Slide Master view.
- `pptx-review` covers comments in the Review tab and spelling marks.
- `pptx-present` runs the slide show and presenter view.
- `pptx-export` exports slides as pictures and prints.
- `pptx-find` runs find and replace.
- `pptx-ask` opens Ask Macro beside the deck.

## How to get to it (user POV)

- Open an uploaded `.pptx` from Files or a channel. It opens at `/app/pptx/<id>`.
- Ribbon tabs: Home, Insert, Design, Transitions, Slide Show, Review, View. Contextual tabs appear for Shape Format, Picture Format, Table Design, Layout, Chart Design and SmartArt.
- Insert → Header & Footer, Insert → Equation, Insert → SmartArt, Insert → Link.
- Design → Customize → Slide Size.
- View → Slide Sorter, View → Master views → Slide Master, View → Show → Ruler, Guides.
- Shortcuts: F5 (slide show from the start), Shift+F5 (from current slide), Cmd/Ctrl+K (link), Cmd/Ctrl+F and Cmd/Ctrl+H (find), Cmd/Ctrl+P (print), Alt+F9 (guides).
- Header: Ask Macro beside Share; Download; Print; Export as pictures.
- Creating a new presentation from the create menus is not documented in the agent guide (unverified).

## Driving it with chrome-devtools MCP

Preconditions:

- `enable-pptx-editor` is on for the test account. Development builds have it on by default.
- A disposable `.pptx` fixture is uploaded.
- The first open downloads a one-time engine of about 6 MB, so allow extra time.

- **Open.** Click the `.pptx` row in Files. Result: the ribbon appears and the slide rail shows the first slide.
- **Insert text.** Click the stage, double-click a text box, then `type_text`. Result: the text appears on the slide.
- **Ribbon tab.** Click the tab named `Insert`. Result: the Insert ribbon group is visible.
- **Slide Sorter.** Click the `View` tab, then the button named `Slide Sorter`. Result: all slides appear as a grid.
- **Slide show.** Press `F5`. Result: a full-screen slide show starts from the first slide.
- **Comment.** Click the `Review` tab, then the button named `New Comment`. Result: a comment composer opens beside the slide.
- **Download-only check.** Open with the flag off in a second run. Result: the view offers a download instead of the editor.
- **Proof.** `take_screenshot` of the editor and the slide show.

## Gotchas

- The engine runs in a worker and renders to a canvas. Read slide text from the editor or a download, not from page text.
- Spelling marks appear only on the slide being edited.
- Presenter view is a separate window; check it in a separate page.
- Creation of a new deck is not in the agent guide. Confirm the create menu label in the snapshot before testing it.
- Flag state controls editor versus download. Check the flag in PostHog before judging the result.
