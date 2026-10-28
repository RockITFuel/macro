# Channel conversations

Channel conversations let a user create a team or private channel, start a direct message with a person or agent persona, invite teammates and outside email addresses, and find every conversation in the Chat list. Team channels are visible to the whole team; private channels are visible only to people who were invited. The channel header and its ellipsis menu hold the day-to-day controls: invite, rename, picture, favorite, mute, snooze, and copy link.

## Sub-features

- `chan-create` creates a team or private channel in a three-step dialog, with an optional invite step.
- `chan-dm` opens a one-to-one or group direct message; an empty DM shows a "Say hello" prompt and sends nothing until the user writes.
- `chan-invite` adds teammates or external email addresses to an existing channel from the header Invite button.
- `chan-join` lets an invited or link-holding person join a channel from its join link.
- `chan-rail` lists conversations in the Chat sidebar, with All and sectioned views.
- `chan-threads-tab` shows the Threads tab, listing threads the user takes part in (flag-gated).
- `chan-manage` renames a channel, sets or removes its picture, and favorites, mutes, snoozes, or copies its link.
- `chan-labels` filters the channel list by channel labels (flag-gated).
- `chan-slack-import` brings Slack channels and history into Macro through the Chat import card (team admins; gated).

## How to get to it (user POV)

- Sidebar `Chat` item opens the Chat workspace (`/app/channels`); choosing a row opens the conversation (`/app/channels/<uuid>`).
- Sidebar `Create` button, then `Channel` to start a channel or `Message` to start a DM.
- Keyboard: `c` then `m` creates a channel, with focus outside any editor.
- Command menu (`Ctrl+K`) with the `Create` command, or the `Channels` category to find a conversation by name.
- Shift-click a conversation row to open it in a new split.
- The Chat workspace's `Create or import channels` card holds the Import Slack button (team admins, when enabled).
- On phones, Chat is reached from the bottom dock; the same create actions are in the create menu.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in as an account that belongs to a team with at least one other teammate (email-code sign-in; see the agent guide's login page).
- A teammate account exists that has no existing DM with the signed-in user.
- The Chat sidebar item is visible in the rail.

- **Open the create dialog.** Run `take_snapshot`, then `click` the button named `Create`, then `click` the menu item whose name starts with `Channel`. The dialog `Create a channel` opens on step 1 of 3 with the `Name` textbox focused.
- **Name and visibility.** `fill` the `Name` textbox, then `click` the button `Next`. Step 2 of 3 shows the `Visibility` radio group with `Team — anyone on your team` selected. For a private channel, `click` the radio `Private — only specific people`.
- **Create.** `click` the button `Create`. The URL changes to `/app/channels/<uuid>` and the timeline shows the system row `Channel <name> created`.
- **Invite from the header.** On the new channel, `click` the button `Invite`. The dialog `Invite people to <channel>` opens. Choose the radio `Add specific people`, `click` the recipient combobox, `type_text` the teammate's name, and press `Enter` to tokenize it. `click` the button `Add`. The dialog closes and the channel timeline shows the new participant as a system row.
- **Start a DM.** `click` `Create`, then `Message`. In the person picker, `type_text` the teammate's name and select the row. The DM opens with the `Say hello` empty state above the composer. No message has been sent.
- **Rail check.** `take_snapshot` and confirm the new channel's name appears as a row in the Chat sidebar list.
- **Manage menu.** `click` the ellipsis button beside the channel name in the header. The menu lists `Rename`, `Set channel picture`, `Favorite`, `Mute notifications`, `Copy Link`, and `Copy ID`. Pressing `Escape` closes it.

## Gotchas

- Visibility is chosen at creation. Team channels are always discoverable by the team; private channels cannot be found by search and must be joined by invitation.
- The first message in a DM to an unregistered email sends an invitation email, not a channel invite. Named channels send an email that says "Join channel".
- Choosing a Macro agent persona in the picker removes every other recipient; reopening the same persona returns to the same private conversation.
- The ellipsis menu is reachable from the split header even when the row is not visible in the rail, so it is the reliable way to favorite or rename.
- The Threads tab, channel labels, and the Slack import card appear only when their flags or roles allow them. Their absence is not a failure.
- Click tab labels, not the radio inputs, in the channel tab strip; clicking the radio input can time out.
