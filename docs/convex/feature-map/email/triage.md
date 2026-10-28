# Triage email

Triage lets a user act on email threads without composing: star a thread into Favorites, mark it read or unread, mark it done (archive it out of the Inbox) or not done, move it to Trash, mute it, and add or remove personal tags. Each action gives an immediate visible change, and most can be undone.

## Sub-features

- `triage-star` stars or unstars a thread so it appears in Favorites.
- `triage-read` marks a thread read or unread, from the list or the thread header.
- `triage-done` marks a thread done (removed from the Inbox) or not done, and advances to the next row when acting from the open thread.
- `triage-delete` moves a thread to Trash with an Undo toast.
- `triage-mute` mutes the selected rows or the open thread with `Shift+M`.
- `triage-undo` reverses the last action with `z` or the Undo toast.
- `triage-tags` applies or removes personal tags on a thread (unverified exact control).
- `triage-swipe` on touch, swipes a row left to mark done and right to set a reminder.

## How to get to it (user POV)

- Hover a desktop row to reveal `Star email`, `Archive email` (Mark Done, with Undo), and `Open command menu`.
- Select rows and use the list keys: `s` to star, `e` for Mark done, `Shift+M` to mute, `z` to undo, and Delete to trash.
- In the open thread on desktop, use the outlined group with `Mark as unread`, `Mark done`, and the reminder control.
- Open the thread's title menu for the thread actions, including `Delete`, which moves it to Trash.
- On touch, swipe a row left to mark it done, or right to open `Remind me`.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user with one connected inbox.
- The Inbox (Signal) has at least three unread threads and one favorited thread.
- The Email view is at `/app/component/mail`.

- **Star.** Hover the row with subject `Quarterly plan`. Click the control named `Star email`. Observable result: a muted filled star stays before the row's timestamp, and the row appears in the Favorites tab.
- **Unstar.** Click `Star email` again on the same row, or open Favorites and unstar it there. Observable result: the row leaves Favorites at once.
- **Mark read.** Open an unread thread's title menu and choose `Mark as read` (menu location unverified). Observable result: the row loses its bold unread styling; the thread stays open.
- **Mark done.** Hover a row and click `Archive email`. Observable result: the row leaves Signal and an Undo notice appears.
- **Undo.** Click the Undo notice, or press `z` with the list focused. Observable result: the row returns to Signal.
- **Done from the open thread.** Open a thread, then click `Mark done` in the header group. Observable result: the next row opens and the done thread leaves Signal.
- **Keyboard done.** Select a row with `j`, then press `e`. Observable result: the row leaves the Inbox and the cursor moves to the next row.
- **Mute.** Select a row and press `Shift+M`. Observable result: the mute state applies to that thread (visible indicator unverified; check the row and the thread header).
- **Delete.** Open the thread title menu and choose `Delete`. Observable result: the view returns to the same filtered list and an Undo toast appears; the thread shows in Trash.
- **Touch swipe.** On a phone-width viewport, swipe a row left. Observable result: the row is marked done.

## Gotchas

- Mark done advances to the next row in the list; an action on a different row, such as the one under the pointer, leaves the open thread alone.
- Holding a key in a list auto-repeats; Mark done, Mark as not done, and Delete ignore repeats so one press acts once.
- Undo of Mark done is only available for threads with received mail. Sent-only threads and unsent drafts cannot be unarchived; sent mail addressed back to its sender can.
- Bulk Mark not done can partly succeed: rejected sent-only threads stay done while the others restore. Check the partial-success count, not only the final list.
- Outlook writes distinguish accepted from confirmed by the provider; a pending or failed change shows in the organization notice and inbox settings.
- Mark done and Mark as unread from the header keep the originating list, its tab, inbox, and filters.
- Delete from the title menu returns to the same filtered list and its Undo toast restores the email; restoring later from Trash is unverified.
