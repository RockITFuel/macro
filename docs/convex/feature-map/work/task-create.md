# Create a task

Creating a task opens a composer with a title, an optional description (rich text), and property pills for status, priority, assignees (defaults to you), due date, project, and tags. Ctrl+Enter creates it. The composer can keep a draft, create several tasks in a row, continue in a split, and reads the preset of the pane it was opened from (for example a board column, a CRM record, or a due date selected on a timeline). Tasks can also be made from a channel message.

## Sub-features

- `task-create-dialog` the composer: title, description, property pills, Share switch, Create Task.
- `task-create-more` the **Create More** switch to create several tasks in a row.
- `task-subtask` **Subtask** creates a task under a parent task chosen from a picker.
- `task-create-presets` context-driven defaults: a board column's value, a project, a CRM company or contact, a Gantt due date.
- `task-create-message` the **Task** switch in a channel composer turns a message into a task.
- `task-create-attach` attaches an image or video to the description.

## How to get to it (user POV)

- **Create** menu → **Task** (keyboard **C** then **T**, or `c` then `t`).
- Sidebar and toolbar **New** menu → **Task**, **Subtask**, **Project** (when Projects is on), **Tag**.
- Board: the **+** in a column header (preselects that column's value).
- Gantt: drag across empty calendar space (preselects the due date).
- Project: **New task** in a project's Tasks tab (preselects the project).
- Channel composer: toggle the **Task** switch before sending.
- Touch: the composer opens as a bottom sheet with a drag handle.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in. Use a disposable task title (prefix with "TEST").
- Snapshot after opening the composer; the title field is a contenteditable.

- **Open the composer.** Activate the **Create** menu button, then the **Task** menu item (or press `c` then `t`). Result: a dialog with the title field focused (placeholder "New task").
- **Enter a title.** Click the title field and type the title (contenteditable: click to focus, then type). Result: the **Create Task** button enables.
- **Set status and priority.** Activate the **Not Started** status pill and choose a status; activate **Priority** and choose one. Result: each pill shows its new value in the composer.
- **Create.** Press Ctrl+Enter. Result: the dialog closes and the new task appears in the list.
- **Create more.** Turn on the **Create More** switch, create one task, and type another title. Result: the composer stays open for the next task.
- **Subtask.** Activate **New** → **Subtask**, choose a parent in the picker, then fill the normal composer. Result: the new task is created under the chosen parent.
- **Preset from a board column.** Open **Board** layout, activate the **+** in a column header, and read the composer's status or priority pill. Result: it shows that column's value before you type.
- **Message to task.** In a channel composer, toggle **Task** and send a message. Result: the message is posted and a task is created from it.

## Gotchas

- The composer keeps a per-pane draft: a board column, a project, and a CRM record each have their own draft. Clear the draft to reset to the preset.
- The **Share with <team name>** switch in the footer defaults to on and remembers its choice across openings and reloads; it is hidden when you are not on a team.
- If the chosen project cannot be set, the task is still created and a toast says so.
- With CRM activity flagged off, the CRM company and contact presets are not applied, but a record-level **New task** still links the task to that record.
- Ctrl+Enter submits; on touch, the **Create Task** button shows no shortcut.
- Tasks are documents under the hood, so they also appear in Files and in AI chat document lists.
