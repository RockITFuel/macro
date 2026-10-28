# Tasks list

The Tasks workspace is a list of tasks with four tabs (My tasks, Created by me, Team tasks, Projects) and three layouts: List, Board (columns by status, priority, assignee, or project), and Gantt (timelines from creation to due date, when enabled). Anyone can filter, search, group, sort, and edit a task's status, priority, assignees, and tags directly in the list, select several tasks to act on at once, or delete them in bulk.

## Sub-features

- `tasks-tabs` switches between My tasks, Created by me, Team tasks, and Projects; keeps favorites and My projects in the sidebar.
- `tasks-list` the grouped, sortable, paged list with collapsible groups and keyboard navigation (J/K, H, arrows).
- `tasks-board` Board layout: columns by a grouping, card drag between columns, per-column Add task.
- `tasks-gantt` Gantt timeline of tasks, drag to move between groups, drag across empty space to set a due date.
- `tasks-filter` the Filter menu (status, priority, assignee, created by, tags) and **Filter with AI…**.
- `tasks-props` inline status, priority, assignee, tag, and project edits from the list, board, or task detail.
- `tasks-bulk` multi-select actions, including **Delete items** with partial-failure retry.
- `tasks-favorites` favorite tasks shown in the sidebar.

## How to get to it (user POV)

- Sidebar **Go to Tasks** or the Tasks entry; route `/app/component/tasks`.
- Mobile: the Tasks tabs as pills, with the sliders button opening the Sort, Group, and Filters drawer; the bottom dock has **+ Task** and Search.
- Keyboard: Go To, or the command palette.
- Layout choice is the **Task layout** group in the toolbar (List, Board, and Gantt when enabled). Mobile supports List only; opening a Board or Gantt link on mobile switches to List.
- Opening a task: click its row or favorite (replaces the list with the task); Shift-click opens it in a new split.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in with at least a few tasks in My tasks. New accounts start with three sample tasks.
- For Gantt, the `enable-gantt` flag on (or `VITE_ENABLE_GANTT=true`).
- Use disposable tasks for any edit or delete.

- **Open the list.** Activate the sidebar **Go to Tasks** entry. Result: URL `/app/component/tasks`, the tab row shows My tasks selected, and the list shows its grouped rows.
- **Switch tab.** Activate **Team tasks** in the tab row. Result: the list reloads; the Filter menu's tag selection is cleared.
- **Switch layout.** Activate **Board** in the **Task layout** group. Result: columns for each status (or the grouping you chose); URL gains `tasks.layout=board`.
- **Group.** Activate **Group** and choose Priority. Result: groups per priority with counts.
- **Filter.** Activate **Filter**, then the Priority or Status option. Result: the list narrows and the filter count appears beside the icon.
- **Filter with AI.** Activate **Filter**, type `urgent and high priority tasks that are not completed` in **Filter with AI…** and press Enter. Result: the Status and Priority options are replaced to match.
- **Edit status inline.** Activate a task's status pill in the row, choose a new status. Result: the row moves to its new group and the counts update before the save finishes; a failed save rolls back.
- **Search.** Press Ctrl+F or activate the Search icon and type. Result: the list narrows to matching task names.
- **Bulk delete.** Tick the leading checkboxes on two disposable tasks, choose **Actions → Delete items**, then **Delete**. Result: the rows disappear; the dialog closes when every item succeeded.
- **Gantt drag to create.** In Gantt, drag horizontally over empty calendar space. Result: the task composer opens with the due date prefilled.
- **Open a task.** Click its title. Result: the task document replaces the list; the breadcrumb returns to the originating tab.

## Gotchas

- Mobile shows only the List layout; Board and Gantt links there fall back to List and rewrite the layout parameter.
- Gantt bars use creation time as start and due date as end. There is no start-date property, and bars without a due date are open-ended. Dragging a bar never changes its dates; only moving it between groups changes a property.
- Board cards with an active sort cannot be dragged to a custom position until **Remove sort** is chosen; moving a card between columns only sets its property.
- Completing a task or removing yourself as assignee can hide it from the current filtered view.
- Bulk delete: after a partial failure, only the failed items stay in the dialog. A retry does not resubmit successful items.
- Hidden board columns with a filter: the **N hidden** count is a lower bound for assignee and project groups.
- Project column and project pill are shown in the list; project membership is the task's Project property, not a folder.
- Status icons: empty circle is Not started, partly filled is In progress or In review, check is Completed, cross is Canceled.
- Hidden tabs defer refreshes; switch back to see the latest state.
