# Browse mail list

Browse mail list shows a connected user's email threads grouped by mailbox: Inbox (split into Signal and Noise), Favorites, Drafts, Sent, Scheduled, Reminders, the Library (All mail, Archived, Shared), and personal Tags. The user switches between them, picks which connected inboxes the list covers, scrolls and loads more threads, and opens a thread from its row.

## Sub-features

- `list-sidebar` switches between Inbox, Favorites, Drafts, Sent, Scheduled, Reminders, All mail, Archived, Shared, and Tags.
- `list-signal-noise` switches the Inbox between Signal and Noise with the pill tabs beside the Inbox title.
- `list-inbox-scope` limits the list to All inboxes or one connected inbox.
- `list-row` shows sender, subject, date, unread state, star, and a paperclip for threads with a sent file.
- `list-paging` loads more threads with `Load more` and keeps date headings for older mail.
- `list-calendar` shows calendar invitation mail through the Calendar filter (the calendar feature owns invitation handling).
- `list-tags` lists only personal tags and filters the mailbox to a tag.
- `list-keys` moves the cursor with `j` and `k`, and jumps between list ends with `Cmd+Up` and `Cmd+Down`.

## How to get to it (user POV)

- Open the Email view at `/app/component/mail`. Signal is the default Inbox tab.
- Choose a sidebar item in the desktop Email sidebar: Inbox, Favorites, Drafts, Sent, Scheduled, Reminders, All mail, Archived, Shared, or a tag under Tags.
- On mobile, use the Email tabs and selector (Signal, Noise, Calendar, and the other tabs keep their original order).
- Keyboard: while Email is focused, `g` then `i` (Signal), `o` (Noise), `s` (Favorites), `t` (Sent), `d` (Drafts), `e` (Archived), `a` (All). `Escape` in an empty list returns to Signal.
- Sidebar number shortcuts follow the sidebar order.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user with one connected inbox.
- The inbox has threads in Signal, at least one in Noise, one sent message, one draft, and one favorited thread.
- The Email view is at `/app/component/mail`.

- **Open Email.** Navigate to `/app/component/mail`. Take a snapshot. Observable result: the sidebar lists `Inbox`, `Favorites`, `Drafts`, `Sent`, `Scheduled`, and a `Library` group with `All mail`, `Archived`, and `Shared`.
- **Switch to Noise.** Click the StaticText label `Noise` in the pill tabs beside the Inbox title. Do not click the radio input itself; the radio does not become interactive. Observable result: the list heading stays `Inbox` and the rows change to Noise threads.
- **Switch to Sent.** Click the sidebar item `Sent`. Observable result: rows show recipients of sent threads and the heading reads `Sent`.
- **Keyboard tab jump.** Focus the list and press `g`, then `d`. Observable result: the Drafts list appears with the draft row.
- **Favorites.** Click `Favorites`. Observable result: only starred threads appear. With no favorites, the empty text `No favorite emails` appears.
- **Archived.** Click `Archived`. Observable result: archived rows show `Unarchive email` on hover. With none, the text `No archived email` appears.
- **Inbox scope.** Open the inbox selector and choose one connected inbox. Observable result: the list only shows threads from that inbox. Choose All inboxes to restore.
- **Load more.** Scroll to the bottom of a long list and click `Load more`. Observable result: older rows append and date headings remain in order.
- **Open a row.** Click a thread row by its subject. Observable result: the thread opens inside `/app/component/mail` with a Back arrow in its header.

## Gotchas

- Rapid switching between Signal, Noise, and Sent must not leave the previous tab's rows visible. Check the list after each switch, not only the final one.
- Today's messages start the list with no `Today` heading; older dates keep headings.
- The Favorites tab persists across reloads. Unstarring removes the row from Favorites at once.
- Archived means Mark Done applied to your own mail; threads teammates shared with you are excluded from it and appear under Shared.
- Calendar mail is reached through the Calendar filter, not a separate sidebar item; the Calendar route still works.
- Tags shows personal tags only. Team-shared tags are hidden here.
- Mobile keeps the original tab order and separate Signal, Noise, and Calendar tabs; desktop groups Signal and Noise under one Inbox item.
