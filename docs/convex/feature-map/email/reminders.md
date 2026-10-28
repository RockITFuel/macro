# Snooze email with reminders

Email reminders let a user snooze a conversation so it leaves the inbox and returns at a chosen time, either unless the other party replies (default) or regardless. Snoozed conversations are listed under Reminders in the Email view. When a reminder is due, the conversation returns to the top of its inbox and a notification appears on its row in Home. Reminders apply only to email; there is no standalone reminder feature here.

## Sub-features

- `remind-set` snoozes one selected email or the open conversation with a time choice or a typed time.
- `remind-condition` switches a reminder between `If no reply` (default) and `Regardless` with a footer toggle.
- `remind-edit` reopens the menu for an existing reminder to change its time or condition, or to remove it with `Remove reminder`.
- `remind-list` shows active snoozes in Email's Reminders tab, ordered by return time.
- `remind-return` returns a due conversation to its inbox and adds a notification to its row in Home.
- `remind-undo` undoes a confirmed scheduling change with Cmd/Ctrl+Z.

## How to get to it (user POV)

- Select one email in a list and press `H`, or choose `Remind me` in its menu.
- Open a conversation and use the reminder control in its header group (the bell on desktop, or `Remind me` in the title menu).
- On touch, swipe a row right to open `Remind me`.
- Open the Email view's `Reminders` sidebar item (shown when reminders are enabled), which sits beside `Scheduled`.
- Mobile push titled `Reminder: <email subject>` opens the conversation.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user with one connected inbox and reminders enabled.
- The inbox has a thread with the subject `Quarterly plan` in Signal.
- The Email view is at `/app/component/mail`.

- **Open menu.** Select the `Quarterly plan` row with `j` and press `H`. Observable result: a command menu opens with the placeholder `Remind me: Quarterly plan` and choices `In 30m`, `Later today`, `Tomorrow`, and `Next week`.
- **Typed time.** In the `Remind me when` input type `in 2 hours` and press Enter. Observable result: the reminder saves at once, the menu closes, and the row leaves Signal.
- **Condition.** Reopen the menu and check the footer toggle that reads `If no reply` or `Regardless`. Click to switch it. Observable result: the toggle changes state and is saved with the next choice.
- **Reminders tab.** Click `Reminders` in the sidebar. Observable result: the snoozed thread appears, ordered by return time, and its clock icon reopens the reminder menu.
- **Cancel edit.** Open the menu for an existing reminder, then press Escape or click `Cancel`. Observable result: the menu closes and the reminder is unchanged.
- **Remove.** Open the menu for the reminder and choose `Remove reminder`. Observable result: the thread returns to its inbox and leaves Reminders.
- **Undo.** After a confirmed save, press `Cmd+Z` (`Ctrl+Z` on Windows and Linux). Observable result: the previous time or condition is restored, or a new reminder is removed and the inbox position is restored.
- **Due delivery.** Wait for the return time (the dispatcher sweeps once a minute). Observable result: the thread reappears at the top of its inbox and a notification for it appears in Home.

## Gotchas

- Bare `H` in a reply, compose, or search field types the letter; it does not open the menu.
- Only one active reminder exists per user and conversation; reopening the menu edits it.
- Under `If no reply`, a new inbound reply cancels the reminder. Outgoing mail, drafts, and historical backfill do not cancel it. `Regardless` survives a reply.
- Due delivery is not exact to the second; allow up to about a minute.
- Deleted, trashed, or inaccessible conversations are not returned.
- The Reminders tab has no text search, but its Inbox, Read, Done, Calendar, Tags, and attachment filters apply before pagination.
- The reminder menu's time choices enable only after the existing reminder lookup succeeds; a failed lookup shows an inline error with Retry.
- No reply email is sent and no reminder toast appears; the Home notification is the only signal.
- Email Done is archive state, not notification lifecycle; a snoozed thread can be archived and still appear in Reminders.
