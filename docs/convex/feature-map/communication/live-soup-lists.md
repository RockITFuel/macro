# Live lists

Live lists are the sorted, filtered lists Macro shows for Home, Tasks, Drive, Email, Chat, and Projects. Rows update in place when the user or a teammate changes them, when a notification is read or completed, or when a new item arrives. Marking a row done hides it at once, Undo brings it back in place, and a list keeps its position while more rows load. Grouped lists (by status, assignee, or project) move a row between groups when its property changes. The list stays usable offline, showing the last known result until the server answers.

## Sub-features

- `live-rows` updates rows in place after a property edit or rename, without rebuilding the visible list.
- `live-done-undo` hides a row on Mark done and restores it on Undo, with Redo available.
- `live-groups` moves a row between groups or counts when its property, project, or date changes.
- `live-load-more` loads further pages as the user scrolls and keeps loaded rows during a refresh.
- `live-filters` applies filter menus (multiselect with checkboxes that stay open, and Only or Shift to select one).
- `live-offline` shows the last local result offline, and replays queued edits when the connection returns.
- `live-channel-rows` keeps channel and thread rows current, including unread state and the default channel scope.

## How to get to it (user POV)

- Any list view: Home (`/app/home`), Tasks (`/app/tasks`), Drive (`/app/drive`), Email (`/app/mail`), Chat (`/app/channels`), and Projects inside Tasks.
- Filter menus: the funnel or `Filter` control above a list; in Home the menu opens with `f`.
- Row actions: hover a row for `Mark done`, or press `e` with the row focused; `Ctrl+Z` or `Cmd+Z` undoes the last action.
- Grouping and sort options sit beside the list's filter control.
- Phones: pull to refresh in the notifications and list views; swipe a row left to mark it done.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page) with at least five unread or open items in Home or Tasks.
- A second browser tab or second account is available to make a change to a visible row.
- The list is at its default sort and filter.

- **Mark done.** `navigate_page` to `/app/home`, `take_snapshot`, then hover a row and `click` `Mark done`. The row disappears at once from the Signal feed.
- **Undo.** `press_key` `Control+z`. The row returns in its original place as seen, without a reload.
- **Redo.** Use the Redo control in the toast (shortcut unverified). The row leaves again.
- **Rename in place.** In a second tab, rename a task. Back in the first tab, the same row shows the new title without a reload; other rows keep their DOM.
- **Group move.** In a Tasks grouped view, change a task's status with its row menu. The task moves into the new group and its count updates; it does not appear twice.
- **Filter.** Open the `Filter` menu, `click` the checkbox `Email` to uncheck it. The checkbox menu stays open; `Escape` closes it.
- **Load more.** Scroll to the bottom of the list. The next page loads automatically; there is no load-more button.
- **Proof.** `take_snapshot` before and after the action, plus a `take_screenshot`. Proof shows the row present, absent, and restored.

## Gotchas

- Live results are best effort: a row whose current state is unknown keeps its previous place until the server confirms it.
- Undo after Mark done is offered immediately, even while the server write is pending. A late server reply does not override a newer Undo.
- Restoring an item after a reload uses the server answer; an optimistic Undo can briefly differ from it.
- Clearing the cache or changing filters drops local reconciliation evidence, so rows can re-sort after a filter change.
- Grouped counts reflect loaded rows, not the full server count, until more pages load.
- Done and archive for an email row can succeed or fail separately; a partial failure keeps the Undo option for the part that succeeded.
- Snapshots during a live update are noisy; wait for the row change to settle before reading the list.
- Account switches must not leave the previous account's rows or undo history on screen.
