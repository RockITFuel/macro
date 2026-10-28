# Read an email thread

Read thread lets a user open a conversation, read its messages in order, expand or collapse individual messages and the hidden middle of a long thread, open attachments, and share or copy a link to the thread. The thread can open in place of the list, beside it in a reading pane, or in its own split.

## Sub-features

- `read-open` opens a thread from its list row and returns to the list with Back.
- `read-pane` keeps the list and the thread side by side on desktop, and remembers that choice per browser.
- `read-messages` expands and collapses messages and reveals `Show N hidden messages` in long threads.
- `read-attachments` opens an attachment as a split from its Drive copy, or opens a calendar file as its event.
- `read-link` copies a thread link and opens a deep-linked message with its highlight.
- `read-split` opens a thread in a standalone split from a row with Shift-click.

## How to get to it (user POV)

- Click or press Enter on a thread row in any Email tab.
- Click the columns button in the list header, or press `Shift+V`, to turn on the reading pane on desktop.
- Shift-click a thread row to open it in its own split.
- Open the thread's title menu and choose `Copy Link`, or use the Share control in the thread header.
- Follow an email link in Macro, which opens the thread in Mail at `/app/mail/<thread-id>`.
- A legacy link at `/app/email/<thread-id>` (the standalone block URL) still opens the thread.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user with one connected inbox.
- The inbox has a thread with at least four messages, and a message with a PDF attachment.
- The Email view is at `/app/component/mail`.

- **Open thread.** Click the row whose subject is `Quarterly plan` in the list. Observable result: the URL becomes `/app/mail/<thread-id>`, the thread header shows a Back control, and the latest message body is visible.
- **Back.** Click the Back control in the thread header. Observable result: the list returns and keeps the row you came from focused.
- **Keyboard close.** With focus outside any input in the open thread, press `Escape`. Observable result: the list returns, as with Back.
- **Reading pane.** Press `Shift+V` in the list. Observable result: the list and the thread show side by side, the open row carries an accent marker, and pressing `j` moves the cursor and updates the thread.
- **Expand message.** Click the header of a collapsed message. Observable result: its body and attachments render.
- **Hidden messages.** Click `Show N hidden messages`. Observable result: the collapsed middle messages appear in order.
- **Attachment.** Click the button named by the PDF filename. Observable result: the attachment opens in a split. A calendar invitation opens its event instead.
- **Copy link.** Open the thread title menu and choose `Copy Link`. Observable result: the clipboard holds `/app/mail/<thread-id>`.
- **Standalone split.** Shift-click a row. Observable result: a split opens at `/app/email/<thread-id>` with the thread loaded.

## Gotchas

- A standalone link with `?email_message_id=<message-id>` loads older pages as needed, expands the target message, and highlights it. Test one message on the first page and one beyond it.
- Opening another target while a previous positioning request is pending must not scroll the new thread; closing the split cancels pending positioning.
- Ordinary HTML message bodies render in a shadow root, so text search in the page does not reach them; use text locators that pierce shadow roots.
- Cloud-reference attachments (Outlook links) open the original Outlook message and are not downloadable files.
- Forwarding a message with cloud references shows a notice to share those links from Outlook.
- Sender names use the message's From display name, falling back to the address-book name; threads from one address keep distinct names.
- Opening a thread can mark it read; the mark-as-read is announced only if it fails.
- Verify a cold open and switching directly between threads with delayed reads: a flash of "Sorry, an unexpected error has occurred" or of the previous email is a failure.
