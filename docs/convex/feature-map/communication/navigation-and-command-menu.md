# Navigation and command menu

Navigation is how a user moves around Macro: the sidebar rail of workspaces, split panes that show several items side by side, Back and Forward, and the keyboard. The command menu (`Ctrl+K`) jumps to anything by name, runs commands such as Create and Change theme, and searches by category. Favorites pin items to the sidebar. The Create launcher starts new documents, tasks, emails, channels, and chats. Each split holds its own location, so Back and Forward restore earlier views, filters, and selections.

## Sub-features

- `nav-rail` switches workspaces from the sidebar: Home, Drive, Email, Chat, Tasks, Calendar, Agents, Customers, and any added from More.
- `nav-customize` shows, hides, and reorders sidebar apps through `Customize sidebar`.
- `nav-splits` opens a second or third item side by side; Shift-click opens in a new split.
- `nav-back-forward` returns to the previous view, including nested detail and filters, when the user goes Back or Forward.
- `nav-favorites` pins documents, chats, projects, email threads, channels, calls, and CRM records to Favorites.
- `nav-create` opens the Create launcher from the sidebar button, `c`, or the command menu.
- `nav-command-menu` opens the command menu with name search, category radios, and commands (Create, Change theme, MCP setup).
- `nav-theme` previews themes with Up and Down, commits with Enter, and reverts with Escape.
- `nav-keyboard` provides the shortcut model: `g` sequences for workspaces, `/` for search, `j` and `k` for lists, `e` for mark done, and `?` for the current view's shortcuts.
- `nav-people-search` finds teammates in the command menu's People and All categories, even before a first DM.

## How to get to it (user POV)

- Sidebar rail: the workspace icons on the left; hover shows the tooltip label.
- Sidebar top: `Create` and `Search` buttons; `Search` opens a menu with `Command Menu` and `Search everything`.
- Sidebar bottom: `Settings` (`Ctrl ;`), and `More` for Customize sidebar and the rest of the apps.
- Keyboard: `Ctrl+K` or `Cmd+K` for the command menu; `?` for the shortcut list; `g` then a letter for a workspace.
- Direct URLs with splits use `~` between panes (for example `/app/home/~/drive`).
- Phones: the bottom dock and the hamburger menu (command-menu entry on phones unverified).

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page) on a desktop-width viewport.
- A document named `Quarterly plan` and a channel exist for jump targets.
- The app is at `/app/home` with a single split open.

- **Rail navigation.** `take_snapshot` and `click` the rail button named `Drive`. The URL becomes `/app/drive` and the Drive view replaces Home.
- **Back.** `press_key` `Alt+ArrowLeft` (or `navigate_page` back). Home returns, and the rail highlights Home.
- **Command menu.** `press_key` `Control+k`. The dialog with a focused `Search...` textbox opens. `type_text` "quarterly" and press `Enter`; the top hit opens. Confirm the URL changed to the document.
- **Categories.** Reopen with `Control+k`, `press_key` `Tab` to cycle the category radios; the selected category name is announced in the snapshot.
- **Split.** Shift-click the `Chat` rail item. A second pane opens beside the first; the URL gains a second `~` segment (exact shape unverified). The first pane stays as it was.
- **Customize sidebar.** `click` `More`, then `Customize sidebar`. The app list shows checkboxes and `Reorder <name>` handles; uncheck an app and close. The rail updates.
- **Change theme.** Open the command menu, type "Change theme", `Enter`. Press `Down` once to preview the next palette, then `Escape`. The original palette returns.
- **Proof.** `take_snapshot` of the rail with the active workspace, then `take_screenshot`. Proof shows the rail highlight, the split count, and the URL.

## Gotchas

- The rail highlights the workspace of the active split, not every open split.
- Pressing the current workspace again keeps its filters and nested detail; it does not reset them.
- Single-letter shortcuts do not work while an editor has focus; press `Escape` first.
- `#` moves an email to Trash, not `Delete`, and only in email views.
- Command menu counts describe loaded results, not the full server corpus; scroll or narrow the query for more.
- Email hits are excluded from Cmd+K entity results and come from a separate search path.
- Typed People and All queries find known teammates even without a CRM record; a teammate with no DM should show one row, not two, once their DM loads.
- Snapshots of the rail and split headers include many nested labels; use `take_snapshot` with the filePath option and grep the output.
