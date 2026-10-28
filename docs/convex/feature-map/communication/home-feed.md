# Home feed

Home is the desktop starting pane: one feed of what needs the user's attention, merged from notifications and the user's own recent work. Rows are grouped by time (Last few minutes, Last hour, This morning, and so on), filtered by entity type and read state, and previewed in place. Home also carries a centered chat composer that starts an AI chat. On phones the same inbox is called Notifications, with Signal and Noise tabs and swipe-to-done.

## Sub-features

- `home-signal` shows the Signal feed: unread and recent notifications, recent own work, and threads, grouped by time.
- `home-noise` shows the Noise feed for lower-priority email and other rows.
- `home-filter` filters by read state (Unread, Read, All) and by entity type (Email, Channels, Chats, Agents, and others); filters persist per user.
- `home-preview` previews a row in the main pane; `j` and `k` move through rows and update the preview.
- `home-mark-done` marks a row done; Undo restores it in place.
- `home-live-recency` moves a row into "Last few minutes" when a new message or notification arrives, without a reload.
- `home-compose` starts an AI chat from the centered composer under "What should we get done in Macro?".
- `home-mobile-notifications` is the phone Notifications inbox with Signal and Noise pills and pull-to-refresh.

## How to get to it (user POV)

- Sidebar `Home` (first item in the rail); `g` then `h` from anywhere outside an editor.
- Direct URL `/app/home`; an item open inline uses `/app/home/<type>/<uuid>`.
- Command menu (`Ctrl+K`) with `Home` as a jump target.
- Phones: the bottom dock's bell icon labelled `Notifications` (Home itself is desktop-only).
- Desktop `Filter Home` menu, opened with the funnel next to the Home heading or `f`.
- Clicking the `Home` heading inside a preview clears the preview and returns to the starting pane.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page) on desktop width, with at least one unread notification and one channel reply in the feed.
- A second account is available to send a new DM.
- Home is at `/app/home` with no preview open.

- **Open Home.** `navigate_page` to `/app/home`, then `take_snapshot`. The `Home` heading and the centered composer (`What should we get done in Macro?`) are visible.
- **Preview a row.** `click` the first row in the feed. The main pane shows its preview with a `Home >` breadcrumb above it.
- **Keyboard browse.** Press `j` to move to the next row; the preview updates to that row.
- **Filter.** Press `f` (or `click` the funnel button labelled `Filter Home`). `click` the menu item `Type`, then uncheck `Email`. Emails disappear from the feed. Press `Escape`.
- **Mark done.** Hover a row and `click` `Mark done` (or press `e` with the row focused). The row leaves the feed.
- **Undo.** Press `Ctrl+Z` (or `Cmd+Z`). The row returns to its place as seen, not unread.
- **Live recency.** With the second account, send a DM to the signed-in user. Without reloading, the row moves into the `Last few minutes` section and shows unread.
- **Compose.** `click` the composer, `type_text` "Summarize my day" with `submitKey: "Enter"`. An AI chat opens in the main pane.
- **Proof.** `take_snapshot` of the feed after the filter change and `take_screenshot`. Proof shows the section headings and the filter state.

## Gotchas

- Desktop Signal merges several sources; on phones Signal is a notification-only feed, so sent mail and AI chats without notifications appear only on desktop.
- Email rows in Home depend on the email integration being connected; without it, expect fewer rows, not an error.
- `Mark done` clears notifications, and it archives an inbox email. A row that was also worked on stays, read, after reload.
- Rows move on live actions. A reload is not required to see the new position, but a stale snapshot may show old sections until the next action.
- The Home composer does not create a chat for an empty prompt; a chat-creation failure restores the submitted text and attachments.
- Agent-session rows stay out of Home once the backend hiding switch for agent DMs is on, even if they have notifications.
- Snapshots include the Notifications toast region (`Notifications (alt+T)`) with empty live regions; ignore them when reading the feed.
