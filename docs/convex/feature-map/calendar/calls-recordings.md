# Calls list, recordings and transcripts

The Calls view lists calls the user can see: recordings, transcripts, and AI summaries of finished calls. The user filters by All, Missed, or Unattended, by Internal or External, by channel, or by tag, and searches by name or transcript text. Opening a call shows its video, a seekable transcript, the summary, Share, and a side panel. Calls appear in each channel's own Calls tab too.

## Sub-features

- `calls-list` shows the list with views (All, Missed, Unattended), `Type` (Internal, External), `Channels`, `Tags`, and `Search calls`.
- `calls-detail` shows the recording, transcript, and summary under a `Calls > <name>` breadcrumb, with a side panel and Retry on failure.
- `calls-seek` jumps the video to a transcript search hit.
- `calls-share` sets a call's team sharing: a `Share with team` checkbox that is editable while the call is live and read-only afterwards for everyone but the creator.
- `calls-channel-tab` lists a channel's recordings in its Calls tab, with search over that channel only.
- `calls-recover` reloads a recording with a fresh link or offers `Open or download recording` when playback fails.
- `calls-legacy-links` keeps old `/app/call/<id>` and `/app/drive/call/<id>` links working.

## How to get to it (user POV)

- Calls in the main navigation (exact label unverified), at `/app/calls`.
- A channel's `Calls` tab.
- Search results or Home/Soup rows for a call.
- Shift+Enter or `Open in new split` opens a second Calls view beside the first.
- Breadcrumb `Calls` returns to the list with search, filters, and scroll kept.
- Phones: pill tabs at the top, Search in the header; the detail view has the same breadcrumb.

## Driving it with chrome-devtools MCP

Preconditions:

- The test user is a member of a channel with at least one finished, recorded call.
- Navigate to `/app/calls`. Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Open the list.** Navigate to `/app/calls`. Result: the `All` view is selected and rows show call names, dates, and status.
- **Filter the view.** Choose `Missed`, then `Unattended`, then `All`. Result: the rows change to match each view.
- **Filter by type or channel.** Under `Type`, choose `External`. Result: only calls with at least one guest without a Macro account remain. Choose it again to clear.
- **Search.** Choose `Search calls` (or press Cmd/Ctrl+F). Type a word from a transcript. Result: matching calls appear, including transcript hits.
- **Open a recording.** Choose a call row. Result: the URL becomes `/app/calls/call/<callId>`; the breadcrumb reads `Calls > <name>`; the video and transcript load.
- **Seek from transcript.** Choose a transcript hit. Result: the video jumps to that segment.
- **Return to list.** Choose the `Calls` breadcrumb. Result: the list returns with the earlier search and filter preserved.
- **Old link.** Navigate to `/app/call/<callId>`. Result: the browser lands on `/app/calls/call/<callId>` with the transcript target kept.

## Gotchas

- Standalone instant and scheduled calls are never team-shared; only channel calls have `Share with team`.
- Once a channel call ends, only its creator can change team sharing.
- If playback fails, reload for a fresh recording link before assuming the file is broken; the warning does not prove an unsupported format.
- Recorded call headers on phones omit `Call Again`.
- Imported Granola calls open with title, summary, guests, and transcript but no recording; see `granola-import`.
- Rename and delete do not apply to imported calls yet.
- An empty list shows the note that calls are available to agents.
