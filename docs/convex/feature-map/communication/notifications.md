# Notifications

Notifications tell a user about things addressed to them: channel messages and replies, mentions, reactions, direct messages, document comments, reminders, and agent-session events. Each notification moves through three states: unseen, seen, and done. The inbox lists active notifications; done ones leave it. Users control what they receive in Settings → Notifications, with system alerts on desktop and phones, mobile push, and email digests. Muting a conversation silences its alerts without changing the inbox.

## Sub-features

- `notif-inbox` lists active notifications (unseen or seen) with their sender, channel name, and excerpt.
- `notif-lifecycle` moves a notification from unseen to seen when viewed, and to done when marked; undo returns a done item to seen.
- `notif-preferences` turns individual notification types on or off in Settings (for example `Message reactions`, and an `AI` group for agent-session events).
- `notif-desktop` shows system alerts on desktop with a toggle that reads the real OS permission.
- `notif-activate` opens the message, thread, or document location when a system alert is clicked (native builds).
- `notif-mobile-push` delivers push on iOS and Android; a tap opens the target, receiving one does not navigate.
- `notif-mute` silences a conversation's alerts and shows mute indicators from the account's own mute list.
- `notif-reactions` notifies a message author when someone else reacts; removing a reaction does not notify.
- `notif-email-digest` emails a digest of unread notifications (`Email digest` preference).

## How to get to it (user POV)

- Desktop: the Home feed (`/app/home`) is the inbox; see the home feed feature.
- Phones: the bottom dock's bell icon labelled `Notifications`.
- Settings: `Ctrl ;` or the gear in the sidebar, then `Notifications`. Delivery controls sit under `Delivery`; `Desktop notifications` toggles system alerts.
- Clicking a system alert on macOS or Linux desktop builds restores Macro and opens its target.
- Keyboard: `Ctrl+Z` or `Cmd+Z` undoes a done.
- Mute and snooze: the channel's ellipsis menu (`Mute notifications`, `Snooze notifications…`).

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page) with at least one unseen channel reply and one unread DM from a second account.
- Settings → Notifications is reachable; the browser has no OS-level alert permission granted, so system alerts are unverified in headless runs.

- **Open the inbox.** `navigate_page` to `/app/home`, then `take_snapshot`. The unseen reply appears in the feed with an unread dot.
- **Mark seen.** `click` the row to open it. Its unread dot clears when the viewing delay passes.
- **Mark done.** Hover the row and `click` `Mark done`. The row leaves the feed.
- **Undo.** Press `Ctrl+Z`. The row returns as seen, not unseen, and without an unread badge.
- **Preferences.** `navigate_page` to the Settings page (`Ctrl ;`, then `Notifications`; the direct path is unverified). `take_snapshot` lists the switches including `Message reactions`. `click` the switch to turn it off; reload and confirm it stays off.
- **Mute.** Open a channel's ellipsis menu, `click` `Mute notifications`. The channel row shows a mute indicator. Clicking it again unmutes.
- **Reaction notification.** From the second account, add a reaction to a message the signed-in user wrote. The thread row returns to the inbox with the reaction and the channel name.
- **Proof.** `take_snapshot` of the Notifications settings and the inbox row, then `take_screenshot`. Proof shows the switch state and the row with its sender and channel.

## Gotchas

- Desktop alerts depend on OS permission and the build. Browser runs cannot prove click-to-open for system alerts; mark those checks unverified rather than passed.
- Receiving an alert must not navigate. Only a click on the alert opens its target.
- Staff email rows still appear in the inbox but do not trigger browser popups.
- Mute indicators use the signed-in account's own mute list; right after a switch of account, no indicator should show from the previous account until its list loads.
- Mobile push can arrive quietly on iOS (Notification Center only) and then counts as delivered, so no email digest follows for it.
- Notification toggles that fail show an error toast and can be retried.
- Agent-session notifications remain until marked done, even after the question is answered or the next turn starts.
- The toast region is labelled `Notifications (alt+T)` and has empty live regions in every snapshot; do not count them as notifications.
