# Use mail offline

Offline mail keeps recently synchronized email readable and partly usable without a connection: the list and thread bodies stay visible, read and done changes queue and replay after reconnect, and a send made offline waits on the device until it can go out. The Email view says when results come from local synchronized data rather than the server. This is a convenience layer; the web and native apps behave differently in places, noted below.

## Sub-features

- `offline-read` shows cached mail lists and thread bodies with no connection, and labels them `Showing cached mail`.
- `offline-filter` applies tab, inbox, tag, and read or done filters to cached mail.
- `offline-actions` queues read, unread, and done changes and replays them after reconnect.
- `offline-send` queues a send made offline with `Email queued to send` and keeps it visible in Drafts.
- `offline-recovery` keeps a composer's text when local storage cannot open, with a sync status and Retry.

## How to get to it (user POV)

- Open the Email view at `/app/component/mail` while online once so mail syncs; then go offline and reopen it.
- A `Showing cached mail` notice appears above the list when results come from synchronized data.
- Use the Email tabs and filters as normal; the same controls work offline for the supported combinations.
- Send from any composer; an offline send returns you to the list with `Email queued to send`.
- A sync status with Retry appears in the composer when local storage needs recovery.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user whose mail has finished its first background sync (allow several minutes after connecting).
- Network can be disabled for the page (use the DevTools network throttling or offline emulation tool).
- The Email view is at `/app/component/mail`.

- **Cached list.** Load `/app/component/mail` online, let it sync, then go offline and reload. Observable result: the Signal list renders from local data and a `Showing cached mail` notice is visible.
- **Cached thread.** While offline, click a row that was opened earlier. Observable result: the thread body and header render from cache with no network error notice.
- **Offline tab change.** While offline, click `Sent` and then `Noise`. Observable result: each tab renders its cached rows without a spinner that never resolves.
- **Offline done.** Hover a row and click `Archive email` while offline. Observable result: the row leaves Signal at once and the change stays queued until reconnect.
- **Reconnect.** Restore network and reload or wait for sync. Observable result: the queued change replays and the server state matches the list.
- **Offline send.** Open a new email, fill it, and click `Send`. Observable result: the Email view shows `Email queued to send` and the message appears under Drafts with a Cancel control.
- **Cache failure.** Block local storage initialization, then type in a composer. Observable result: the text stays in the composer with a sync status and a Retry control.

## Gotchas

- `Showing cached mail` identifies results over synchronized metadata, not complete mailbox coverage. Load more pages from the same server chain after reconnecting.
- Timestamp order and date headings for Signal, Noise, Drafts, Sent, Calendar, and Shared use local indexes; a missing index shows unknown, not false.
- Opening every message body offline requires that body to have been fetched before; the metadata backfill alone does not guarantee bodies.
- Shared-with-you mail is evaluated from the last synchronized grants when offline.
- Native builds need a full app update for the offline filter and archive support, not only an over-the-air frontend update.
- Sign-out or clearing data must not show the previous account's cached mail; verify with disposable drafts only.
- Offline sends freeze recipients, sender, body, and attachment references in one attempt; adding files offline is unavailable.
- Offline mail is a later-scope feature for the Convex port; it is not required for the first cut.
