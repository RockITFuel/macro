# Voice dictation in composers

Dictation lets a user speak into a composer instead of typing. The user starts recording from the composer's Dictation control, sees a volume timeline while speaking, stops, and the transcript is inserted into the draft. An empty transcript shows no text. Dictation is available in the AI chat, channel, comment, and discussion composers. Speech leaves the device for transcription.

## Sub-features

- `dict-record` starts and stops recording, with a live volume timeline.
- `dict-insert` puts the transcript into the draft at the caret, after transcription completes.
- `dict-empty` leaves the draft unchanged when the transcript is empty.

## How to get to it (user POV)

- Any supported composer: the `Dictation` button (microphone) beside the send control.
- Keyboard: the same button; no dedicated shortcut was found (unverified).
- Phones: the same control in the composer (placement unverified).

## Driving it with chrome-devtools MCP

Preconditions:

- A composer is open (for example the AI chat input or a channel message box).
- The browser can grant microphone access.
- Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Start.** Choose the button named `Dictation`. Result: the browser asks for microphone access on first use; the control shows recording state and the volume timeline moves while speaking.
- **Stop.** Choose `Dictation` again. Result: recording stops, and the composer shows a pending state until the transcript returns.
- **Insert.** Wait for transcription to finish. Result: the spoken text appears in the composer draft (exact placement relative to existing text unverified).
- **Empty.** Record silence and stop. Result: the draft is unchanged and no text is inserted.

## Gotchas

- Audio is sent to a transcription service; do not dictate content that must stay on the device.
- Recordings are capped by a server body-size limit; behavior for a recording over the cap is unverified.
- Transcription can fail; the failure path's user-visible message is unverified.
- The dictation feature is outside the calendar domain's backend; its owner should confirm scope (see the feature graph).
