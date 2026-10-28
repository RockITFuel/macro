# Agent conversation list

The agent conversation list is the Agents workspace sidebar: one mixed list of chats and coding sessions, with search, grouping, filters, archived sessions and routine runs. Each row shows its state (starting, working, pull request status) and updates as a session's turn starts and ends, without a reload. Home shows the same rows.

## Sub-features

- `list-browse` shows conversations newest first, with skeleton rows on first load and more rows as the user scrolls.
- `list-search` searches chats and coding sessions by title with one search box.
- `list-group` groups rows by Status (default), Type or None and remembers the choice.
- `list-filter` filters by Type, Status and Pull request; choices within a group are ORed, groups are ANDed.
- `list-state` shows Starting or Working on a row, and a pull-request chip that opens the linked PR.
- `list-actions` offers rename, favorite, copy link, share, archive and delete from a row menu.
- `list-archived` groups archived sessions at the bottom under Archived.
- `list-routine-runs` hides routine runs by default and shows them with the clock toggle.

## How to get to it (user POV)

- Open Agents from the sidebar. The list shows on the left of the Agents workspace.
- Home lists the same conversation rows.
- Mobile: on a phone with the new agents flag, Agents opens a full-screen conversation list; tap a row to open it.
- Open Agents with the `/app/agents` path. Reloading restores the list.
- Keyboard: `c` then `a` opens the new conversation composer in the Agents workspace.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user with at least two existing conversations, one of them a coding session and one a chat.
- Navigate to `/app/agents` before starting.

- **Open the list.** Navigate to `/app/agents`. Take a snapshot. Observable: a list region contains named conversation buttons; wait for those names before selecting one, since skeleton placeholders are decorative.
- **Search.** Click the search control in the list header, then `type_text` a title fragment. Observable: only matching rows remain; clearing the field restores the list.
- **Group.** Open the list menu named for grouping (`Group conversations`). Choose Type. Observable: section headings change to the type names; the choice survives reload.
- **Filter.** Open `Filter conversations`, tick a Status option, then close the menu. Observable: rows outside that status are hidden. Use `Clear filters` to reset.
- **Open a row.** Click a conversation row button. Observable: the URL becomes `/app/agents/<id>` for a chat or `/app/coders/<id>` for a coding session.
- **Row menu.** Right-click a row (or use its menu button). Observable: a menu with Rename, Favorite, Copy link, Share, Archive, Delete.
- **Proof.** Take a snapshot of the list with a grouping and filter applied, and a screenshot of the sidebar. Record the visible row names.

## Gotchas

- Wait for named conversation buttons, not placeholders. Placeholders are decorative and cannot be focused.
- A row's Working state clears when the last turn ends; a stale replica read can briefly restore an old state until the next session update.
- Routine runs set to Hide runs are missing from the list until the clock toggle is pressed. The list starts without them each time Agents opens.
- Rows have no runtime subtext; the agent name appears only in the open session.
- Changing the composer mode (Chat or Code) does not filter the sidebar.
