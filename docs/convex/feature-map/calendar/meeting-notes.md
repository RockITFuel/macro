# Meeting notes

Meeting notes attach Markdown documents to a calendar meeting. From a live meeting's details the user creates a note named after the meeting, or links an existing document they own. Each note gets meeting-viewer access, and the user can add team access per note. Linked notes appear in the note's side panel under References, and a reference reopens that meeting occurrence.

## Sub-features

- `notes-create` creates a Markdown note named after the meeting, links it, and opens it.
- `notes-link` links an existing owned Markdown document, optionally including the user's team, for the displayed occurrence only.
- `notes-share` changes each link's team access in the document's Share dialog, or removes the link with `Unlink from meeting`.
- `notes-references` lists linked meetings in the note's side panel, with safe placeholders for unavailable meetings.
- `notes-retry` recovers from a failed link (`Retry linking`) or opens a saved note before linking is confirmed (`Open saved note`).

## How to get to it (user POV)

- Open a live meeting's details in Calendar; the `Meeting notes` section sits under the event details rows, with `Create` and `Link` on its title row.
- Open a linked note's title from the meeting details to read it (desktop opens a split; phones replace the calendar pane).
- In the note: `Options` → `Share` (the `Meeting links` section) or `Options` → `Unlink from meeting`.
- The note's side panel: `References` lists linked meetings; choosing one reopens that occurrence.

## Driving it with chrome-devtools MCP

Preconditions:

- `enable-calendar-meeting-notes` is on for the test user (on automatically in dev; `VITE_ENABLE_CALENDAR_MEETING_NOTES=true` overrides locally).
- A live, synced meeting is visible in the Calendar, and the test user owns at least one Markdown document.
- Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Open a meeting.** Navigate to `/app/calendar/week`, then choose the meeting on the grid. Result: event details open with a `Meeting notes` section.
- **Create a note.** Choose `Create` beside `Meeting notes`. Result: a new Markdown document named after the meeting opens; the section lists it as a linked note.
- **Link an existing note.** Choose `Link`, type in the search box, select a document title, review the sharing explanation, leave the team box unchecked, and choose `Link note`. Result: the document appears in the list; its sharing is unchanged for existing editors.
- **Add team access.** In the note, choose `Options`, then `Share`. In `Meeting links`, check the team option. Result: the link shows team access; unchecking it removes only the team grant.
- **Unlink.** Choose `Options` → `Unlink from meeting`. Result: the meeting no longer lists the note; the document remains in Drive.
- **Reopen from references.** In the note's `References` section, choose a meeting. Result: the Calendar opens on that exact occurrence.

## Gotchas

- With the flag off, the notes controls do not appear, even though existing grants remain in place.
- Recurring meetings link only the displayed occurrence; a one-time meeting's note follows the meeting when its date changes.
- Team access starts off for each new note.
- If creation succeeds but linking fails, `Retry linking` reuses the saved document; do not expect a duplicate note.
- Closing the details never deletes the document.
- Changing the selected meeting or account stops a late creation result from navigating away from the new selection.
- A cancelled or out-of-sync meeting's links can still be removed from the document's Share dialog.
- Long titles must keep the `Options` button visible without horizontal scrolling.
