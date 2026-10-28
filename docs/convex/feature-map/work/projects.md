# Projects

Projects group tasks in the Tasks workspace. Each project has an overview (a collaborative description, properties such as status, priority, assignees, and due date, and a discussion) and a Tasks tab listing the tasks whose Project property names it, in List or Board layout. A Gantt timeline shows all visible projects. Projects can be shared, can be assigned agents that take on their tasks, and can be renamed or deleted (the owner only; deleting leaves tasks in place).

## Sub-features

- `proj-list` the Projects tab: list, search, sort, group (Status, Priority, Assignee, or None), filters, load more.
- `proj-create` the project composer: name, Markdown description, Status, Priority, Assignees, Due date, sharing.
- `proj-overview` the overview: description editor, property pills, side panel, discussion.
- `proj-tasks` the project's Tasks tab: New task, Add existing tasks, List and Board layouts.
- `proj-gantt` Project layout Gantt (one bar per project from creation to due date).
- `proj-share` sharing, collaborators, and Copy Link for a project.
- `proj-agents` assigning an agent to a project so that its tasks get the agent.
- `proj-actions` the row context menu and bulk actions: rename, set status, set priority, delete.

## How to get to it (user POV)

- Tasks → **Projects** tab (also `/app/component/tasks-projects`).
- Sidebar **My projects** (shown when Projects is enabled): click a project to open it inside the Tasks workspace; Shift-click opens a new split.
- **Create** menu → **Project** (keyboard **C** then **P**), or **New** → **Project** in the Tasks sidebar.
- A task's **Project** property, or **Add to project…** in a task's context menu, which assigns a task to a project.
- Project links open `/app/component/initiative-view~<id>~overview` (or `~tasks`).
- Projects are enabled by default in development; production is gated by the `enable-projects` flag, and with it off the Projects tab and project columns are hidden.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in with Projects enabled (or `VITE_ENABLE_PROJECTS=true`).
- A disposable project; deleting or renaming changes hosted data.

- **Open the Projects tab.** Activate the **Projects** tab in Tasks. Result: URL `/app/component/tasks-projects`; project rows with Status groups by default.
- **Create a project.** Activate **Create** then **Project** (or press `c` then `p`). Type a name, press Enter to move to the description, type a description, then activate **Create Project** (or Ctrl/Cmd+Enter). Result: the composer closes; a "Project created" toast offers **Open** and **Open (New Split)**.
- **Open a project.** Click a project row. Result: the Tasks workspace shows the project's breadcrumb and name, and the Overview tab.
- **Edit the description.** Click into the Description on Overview and type. Result: text saves automatically; a second tab on the same project sees it live.
- **Open the side panel.** Activate the side panel toggle in the project's top bar. Result: a floating panel with project properties; click outside to close.
- **Add an existing task.** In the Tasks tab, activate **Add existing tasks**, select one or more tasks, and activate **Add N tasks**. Result: the tasks appear in the project's list; they leave their previous project.
- **Share.** Activate **Share** (or Cmd+S). Result: the standard share menu with a To field; only owners can share, other members see Copy Link.
- **Rename or delete.** Open the row context menu (right-click the row) and choose **Rename**, or **Delete** (owner, with confirmation). Result: the name changes, or the project is removed and its tasks remain.
- **Gantt.** Activate **Project layout** and choose **Gantt**. Result: one bar per visible project; click a label to open its overview.

## Gotchas

- Projects here are separate from folders in Files, which keep their own structure; moving a task between projects changes its Project property, not its folder.
- Projects show Status values Not Started, In Progress, and Completed; older status values remain until edited.
- Removing a project's assigned agent stops future assignments; sessions already running for its tasks continue.
- Assigning a person to a project adds them as a collaborator with edit access; clearing the assignee does not remove that access.
- Deleting a project does not delete its tasks.
- Assigning an agent to a project does not start work on tasks already in it; only tasks created in or moved into the project start a session.
- The project's Tasks tab shows tasks whose Project property names it; the project title and pills appear only on Overview.
- Project URLs use the `initiative-view~` prefix; these are not the same as the folder `projects` route.
