# Compose, send, and schedule email

Compose lets a user write a new email, reply, reply all, or forward; attach files (or share large ones as links); choose the sending inbox; save drafts automatically; send now, with a short Undo window; or schedule a send for later. Sending from an open thread can also mark that thread done.

## Sub-features

- `compose-new` opens a standalone composer for a new email.
- `compose-reply` opens an inline reply on desktop, or a full-screen reply on touch, for reply, reply all, and forward.
- `compose-attachments` attaches files, removes them, and inserts share links for files over the sending inbox's limit.
- `compose-from` picks the sending inbox (From), and copies the draft when the sender changes.
- `compose-draft` autosaves drafts, offers Save Draft and Delete Draft on close, and reopens them from Drafts.
- `compose-send` sends now, shows the message in the thread at once, and offers Undo.
- `compose-schedule` schedules a send for a chosen time and lists it under Scheduled.
- `compose-discard` discards a draft from the keyboard or the trash button.

## How to get to it (user POV)

- Choose the `Email` button in the Email view, or `Create` then `Email`.
- Press `r` to reply, `Alt+R` (`Option+R` on macOS) or `R` to reply all, and `F` to forward, with the selected message or the latest one.
- Open a saved draft from the Drafts tab.
- Choose the schedule clock in the composer header or footer to schedule a send.
- Keyboard send and mark done: `Shift+Cmd+Enter` in a reply.
- Discard a draft with `Cmd+Shift+D`, or the trash button.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user with one connected Gmail inbox and one connected Outlook inbox if you test From switching.
- A test file under 1 MB and a file over 18 MB (for the share-link prompt) are available locally.
- The Email view is at `/app/component/mail`. Use a test recipient you own.

- **Open new email.** Click the `Email` compose button. Observable result: a composer opens with To, Subject, and body fields, and the Send control is disabled until a recipient is set.
- **Fill and autosave.** Type a recipient, a subject `Release notes`, and a body. Wait about one second. Observable result: the composer stays open and reopening the draft from Drafts shows the saved body.
- **Attach.** Click the Attach control and choose the small test file. Observable result: a button named by the filename appears; a separate `Remove <filename>` control removes it.
- **Large file.** Attach the file over the limit. Observable result: a confirmation offers to upload it to Macro and share view-only links; Cancel adds nothing, confirm inserts one link per file at the end of the body.
- **Switch From.** With two inboxes, choose the Outlook inbox in From. Observable result: the subject warning appears only if the subject is over 255 characters, and attachments are copied to the new sender.
- **Send.** Click `Send`. Observable result: the sent message appears in the thread immediately with an `Email sent` notice and `Undo`.
- **Undo send.** Click `Undo` within the notice. Observable result: the message disappears and the reply draft reopens.
- **Schedule.** Choose the schedule control, pick a time, and confirm. Observable result: `Email scheduled` appears with the send time, `Undo`, and `View message`; the draft lists under Scheduled.
- **Cancel scheduled.** Open the scheduled draft from Scheduled and choose `Cancel`. Observable result: the draft becomes editable again.
- **Discard.** Press `Cmd+Shift+D` in the composer. Observable result: the draft is discarded and the thread or view returns to the previous state.

## Gotchas

- Sending a reply marks its thread done but keeps you on that thread; Send and mark done (`Shift+Cmd+Enter`) moves to the next email instead.
- Failed delivery removes the optimistic message and restores the reply draft; a notice appears only for conflicts, uncertain or rejected delivery, revoked access, or unsavable content.
- Gmail's limit is 18 MB and Outlook's is 25 MB per sent message for attachments; larger files take the share-link path.
- Forwarded files stay attached after switching to another inbox, and the original files are fetched from the receiving inbox at send time.
- Scheduled drafts stay drafts until their send time; a trashed thread can cancel unsubmitted scheduled drafts.
- Opening a reply from Drafts keeps the composer and header controls; closing an empty reply discards its draft and removes its Draft row from the thread.
- Offline, a send shows `Email queued to send`; adding new files offline is unavailable.
- Only one active send can own a draft across tabs; a queued composer is read-only.
- Use disposable recipients; a real send is not reversible once it leaves the provider.
