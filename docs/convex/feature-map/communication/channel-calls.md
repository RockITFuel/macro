# Channel calls

Channel calls let a channel's members start or join a live audio and video call from the conversation, see who is in it, and use a chat thread beside the video. Each call has one persistent message thread, so its chat stays with the call and its recording. Signed-in participants use the full composer; guests of quick and scheduled calls can read and send text without signing in. When a call ends, its recording page keeps the transcript and the call chat, and a Calls tab lists recordings for the channel.

## Sub-features

- `call-start` starts a call from the channel header's `Call` button.
- `call-join` joins a live call from the active-call panel, the Call tab, or a Join call button, with a single connection per join.
- `call-leave` leaves the call from either the panel or the floating call controls; leaving ends only the user's own participation.
- `call-chat` opens the chat panel beside the video; messages, reactions, quotes, and drafts persist while the call runs.
- `call-guest-chat` lets a guest in a quick or scheduled call read and send chat text while connected.
- `call-ringing` shows an incoming call with ringing when a channel member starts a call.
- `call-recording` shows the transcript and read-only call chat on the recording page; a chat link highlights one message.
- `call-tab` lists the channel's call recordings with search over names and transcripts.

## How to get to it (user POV)

- Channel header `Call` button in a team channel, DM, or private conversation.
- `Join call` in the channel while a call is live.
- Calls tab inside a channel (recordings and the live Call tab while a call is in progress).
- `Calls` lists recordings across channels at `/app/calls` (sidebar entry unverified).
- Follow a shared call link (`/app/call/<id>` or `/app/meet/...`) to join as a guest.
- Mobile: the Call pill sits beside Invite in the channel header; starting a call opens a full-width `Start call` button.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page) in a team channel where the account is a member.
- Calls are enabled in the environment (a LiveKit-backed call backend is reachable; not verified in headless runs).
- No other call is active for the account.

- **Start.** `take_snapshot`, then `click` the button `Call` in the channel header. The call panel opens above the composer with `Start call`; `click` `Start call`. The live call view replaces the timeline.
- **Open chat.** `click` the button `Open chat` in the bottom toolbar. The chat panel opens beside the video; the button now reads `Close chat`.
- **Send chat.** `click` the chat composer and `type_text` "Hi from the call" with `submitKey: "Enter"`. The message appears in the panel.
- **Quote.** Hover another participant's message and `click` its reply action (label unverified). The quote appears in the bottom composer; send it to add a quoted reply.
- **Leave.** `click` the button `Leave` in the call controls. The view returns to the channel's Messages tab immediately.
- **Recording.** After the call ends, open the Calls tab (`Calls`) and `click` the recording row. The recording page shows the transcript and a read-only `Call chat` below it.
- **Proof.** `take_snapshot` on the live call view and the recording page; `take_screenshot` of the chat panel. Proof shows the call name, the chat message, and the Calls tab row.

## Gotchas

- A repeated click on `Join` while connecting produces one connection; wait for `Connecting` to clear rather than clicking again.
- If another call blocks joining, the error asks the user to leave the current call first; the current call stays connected.
- Guests lose chat access after leaving or after the call ends; their messages remain in the saved call discussion.
- Each call session has its own thread: a new call in the same channel starts an empty chat.
- A call's completed row appears in the channel timeline only when the call ends; the active call shows the existing live indicator.
- Media cannot be proven in headless browser runs. Verify call join and leave with the chat panel and controls, and mark media checks as unverified.
- Calls overlap with a separate calls area (the agent guide's calls page); confirm scope before treating call recordings as part of this feature.
