# Live calls and meeting links

Users start calls: an instant call, a call to a channel or contacts, or a scheduled call created from Calendar. Each call has a shareable link. Guests join from the link without a Macro account, and signed-in users join channel calls. Setup previews camera and microphone, shows who is connected, and lets the user pick devices and backgrounds. In the call the user toggles audio and video, shares the screen, chats, renames the call if they own it, copies the meeting URL, and leaves. Incoming invitations ring until answered or timed out.

## Sub-features

- `live-instant` starts an instant call from `/app/meet/new`, with optional teammate invitations (`Invite Teammates`, `Start call`, `Retry invites`).
- `live-channel` calls a channel or contacts through the recipient picker; invitees press `Join call` when they are ready.
- `live-links` manages standalone links under `Manage call links` (Join call, Copy link, Revoke link) and joins through `/app/meet/join/<shareToken>`.
- `live-setup` is the join preview: `Your name` (guests), microphone, camera, backgrounds, Join call, and the people currently connected.
- `live-controls` is the in-call toolbar: microphone and camera with settings menus, screen share, `Copy Meeting Url`, rename, `Leave call`.
- `live-chat` is call chat, which persists with the call and supports replies and `@` mentions of people and agents.
- `live-incoming` shows an incoming call card with `Decline` and `Join`, dismissed after 30 seconds.
- `live-android` is the native Android call drawer and picture-in-picture (hardware-dependent).

## How to get to it (user POV)

- Calls view: `New call` menu, then `Start an instant call`, `Call a channel or contact`, or `Manage call links`.
- Calendar: `New call` beside `New event`, or `New` → `Call` (shortcut `C` then `C`).
- Calendar event composer: meeting link `Macro call` (the default when quick calls are on).
- Calendar upcoming list: `Join` on an event with a call link during the event.
- Channel: the call's `Join call` or the in-channel call controls.
- Standalone link: a guest opens the shared URL in any browser.
- Phones: `Start call` and the call controls use the same labels; the call UI is a full-screen page.

## Driving it with chrome-devtools MCP

Preconditions:

- `enable-quick-calls` is on for the test user (locally `VITE_ENABLE_QUICK_CALLS=true`).
- The browser can grant microphone and camera for the test; a second browser or private window acts as the guest.
- Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Start an instant call.** Navigate to `/app/meet/new`. Choose `Start call`. Result: the call page opens with `Leave call` and the in-call toolbar.
- **Copy the link.** In the in-call header, choose `Copy Meeting Url`. Result: the button shows a checkmark briefly; pasting yields the call URL.
- **Join as guest.** In a private window, open the copied link. Type a name in `Your name`, check the preview, then choose `Join call`. Result: the guest appears in the host's participant list.
- **Toggle devices.** Choose the microphone button (left half toggles; caret opens `Audio settings`). Result: the button shows pressed when on; the settings menu lists microphones, speakers, and noise suppression.
- **Pick a background.** Open `Video settings`, choose `Light blur`. Result: the preview shows the effect; choosing `None` removes it.
- **Chat.** Choose `Call chat`, type a message, and send. Result: the message appears in the chat and stays in the call's record afterwards.
- **Leave.** Choose `Leave call`. Result: a `Leaving call…` state appears, then the page goes to the call record (when the call ended) or to its channel or Calendar.
- **Manage links.** Open `New call` → `Manage call links`. Choose `Revoke link` on a standalone link. Result: the link stops admitting new joins; current participants stay.

## Gotchas

- Opening or reloading an in-call URL returns to setup; the user must press `Join call` again. A `?join=true` URL does not auto-join.
- While authentication loads or the user is signed out, channel-linked setup must not request camera or microphone.
- Guests see the call room and its chat only, never the channel or saved recordings.
- The reserved room for a new call expires after five minutes if setup is left; starting still works if preparation fails.
- Leaving as the last participant archives the call first; the next call does not wait for the old room to be deleted.
- Permission denial leaves that device off but still allows joining.
- Screen sharing starts only after joining.
- Revoking a standalone link does not end current participants or delete calendar events.
- A channel call's link stops working when that call ends.
- Native Android and iOS behavior (ringing, PiP, CallKit) cannot be verified in a browser.
