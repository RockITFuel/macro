# Email reminders

A reminder snoozes an email conversation: it leaves the inbox and returns to the top of the inbox at a chosen time, with a notification on the original email. The reminder can be set to cancel if the other person replies (the default) or to survive replies. One reminder can exist per conversation; you can edit or remove it, and undo a confirmed change with Ctrl/Cmd+Z. The Reminders list inside Email shows every snoozed conversation, ordered by return time.

## Sub-features

- `rem-set` the reminder picker: time choices (In 30m, Later today, Tomorrow, Next week) or a typed time such as "tomorrow 9am".
- `rem-condition` **If no reply** (default) or **Regardless** toggle.
- `rem-edit-remove` reopen the menu to edit; **Remove reminder** returns the conversation to the inbox.
- `rem-undo` Ctrl/Cmd+Z undoes a confirmed scheduling change.
- `rem-delivery` the reminder fires and the conversation returns to the top of the inbox with a notification.
- `rem-list` Email → **Reminders** lists snoozed conversations with a clock on each row.

## How to get to it (user POV)

- Select an email or open a conversation and press **H**, or choose **Remind me** from its menu, or activate its bell.
- Email sidebar → **Reminders** (beside **Scheduled**) lists active snoozes; clicking a row's clock reopens its menu.
- There is no global Reminders item and no reminder for tasks or standalone reminders; calendar event alarms are separate.
- Mobile: the same picker from the message's menu; push titles read "Reminder: <subject>".

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in with a connected mailbox that has at least one inbox conversation.
- Use a test conversation; reminders fire on the server, once a minute, so a reminder set for a few minutes ahead will return the conversation.

- **Open the picker.** Select an email in the inbox and press `h` (or activate the email's **Remind me** menu item). Result: the picker shows "Remind me: <subject>" with time choices and a **Remind me when** input.
- **Set a preset time.** Activate **In 30m**. Result: the picker closes, the conversation leaves the inbox, and an undo is available.
- **Set a typed time.** Focus **Remind me when**, type `tomorrow 9am`, then press Enter. Result: the same as above with that time.
- **Change the condition.** Activate the **If no reply** / **Regardless** toggle in the picker footer, then save. Result: the reminder's condition updates on reopen.
- **Open the Reminders list.** Activate **Reminders** in the Email sidebar. Result: the snoozed conversation is listed with its return time; activating its clock reopens the picker.
- **Remove.** Reopen the picker and activate **Remove reminder**. Result: the conversation returns to the inbox and leaves the list.
- **Undo.** After a confirmed change, press Ctrl+Z (Cmd+Z on macOS). Result: the previous time or condition is restored.

## Gotchas

- Only one reminder can exist per conversation; reopening the menu edits the existing one.
- A new inbound reply cancels an "If no reply" reminder. Outgoing mail and drafts do not.
- Delivery is sweep-based, once a minute, so it is not exact to the second.
- Deleted, trashed, or inaccessible conversations are not returned to the inbox.
- Text search is unavailable in the Reminders list.
- A failed lookup inside the picker shows an inline error and **Retry**; Cancel and Escape still work.
- Bare **H** types in reply and compose fields; it only snoozes when focus is outside an editable field.
