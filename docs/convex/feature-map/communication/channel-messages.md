# Channel messages

Channel messages let a user write, send, and read messages in a channel or direct message, reply in threads, react, edit and delete their own messages, and follow links and mentions. The composer carries formatting, `@` mentions, attachments, slash commands, and voice dictation. The timeline stays pinned to the newest message until the user scrolls up, and shows system updates such as added participants and renames alongside messages.

## Sub-features

- `msg-send` sends a message with Enter; the composer stays at the bottom of the conversation.
- `msg-compose` formats text, opens the `@` mention typeahead, attaches files, and runs slash commands (`/task`, `/poll`, `/form`, `/document`; poll and form only when forms are on).
- `msg-dictate` appends spoken text to the draft.
- `msg-thread` opens a thread from a message and posts replies; a thread shows its first three replies and `N more replies` to expand.
- `msg-react` adds and removes emoji reactions on a message.
- `msg-edit-delete` edits or deletes the user's own message.
- `msg-links` makes bare URLs, domains, and email addresses clickable in opened messages.
- `msg-scroll` keeps the view at the latest message, pauses following when the user scrolls up, and loads older history.
- `msg-system` shows participant, rename, picture, and completed-call rows in the timeline.
- `msg-target` jumps to a specific message or reply from a mention, search result, or notification, and highlights it.

## How to get to it (user POV)

- Open any conversation from the Chat list (`/app/channels/<uuid>`), from a Home preview, or from a search result.
- Click into the composer at the bottom of the conversation; on phones it sits in the bottom accessory dock.
- Hover a message to reach its reply, reaction, edit, and delete actions.
- Keyboard: `Enter` sends, `Shift+Enter` adds a new line in the composer.
- Following a mention or a channel notification opens the conversation at the mentioned message.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page), with a channel that has at least three messages and one thread with four or more replies.
- A second account is available for reaction and mention checks.
- The conversation is open at `/app/channels/<uuid>`.

- **Send.** `take_snapshot`, then `click` the composer (a contenteditable; the composer is not a plain textbox, so `fill` does not work). `type_text` "Hello from the agent" with `submitKey: "Enter"`. The timeline gains a row at the bottom with that text.
- **Mention.** `click` the composer, `type_text` "@", and wait for the mention listbox to appear. `type_text` a teammate's first name and press `Enter`. A mention chip appears in the draft.
- **Slash command.** `click` the composer, `type_text` "/task", and press `Enter`. The task creation dialog opens; close it with `Escape`.
- **Open a thread.** Hover a message that has replies, then `click` its reply action (label `Reply to` or `Reply in thread`). The thread pane opens with its own composer.
- **Reply.** `click` the thread composer, `type_text` "Replying" with `submitKey: "Enter"`. The reply appears under the parent in the thread pane.
- **Expand a thread.** On a thread with more than three replies, `click` the `Show more` control under the first replies. All replies are visible.
- **React.** Hover a message, `click` the `Add reaction` button, and choose an emoji. A reaction chip with count `1` appears under the message. Choose it again to remove it.
- **Edit.** Hover your own message, `click` `Edit message`, change the text, and press `Enter`. The message shows the new text.
- **Scroll pause.** Scroll up in the timeline by one screen. Send a message from the second account; the view must not jump to the bottom. Scroll to the bottom to resume following.
- **Proof.** `take_snapshot` with the message list in view, then `take_screenshot`. The snapshot shows the sent text, the reply count, and the reaction chip.

## Gotchas

- Snapshot output for a conversation includes the full message list; save the snapshot to a file and grep it rather than reading it inline.
- The composer is a contenteditable. Click to focus, then `type_text`; `fill` only works on real inputs.
- Dictation needs microphone permission and a download of a language pack on first use. A headless browser cannot prove it; treat it as unverified there.
- A collapsed thread preview does not grow when new replies arrive while the channel is open. Expanding and collapsing again shows every new reply.
- Removing a link in the composer is kept after sending; verify this by reopening the message for editing.
- A reaction notification goes to the message author only when someone else reacts. Self-reactions and removals do not notify.
- Timeline rows for system updates have no reply, edit, or reaction actions; their absence is expected.
