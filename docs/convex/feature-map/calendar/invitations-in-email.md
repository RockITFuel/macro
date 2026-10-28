# Calendar invitations in email

When an email carries a calendar invitation or a published event file, Macro shows a card under the sender. The card lists the saved details right away, then checks the user's connected calendars to decide whether the user can RSVP, join, or add the event. The user can answer Yes, Maybe, or No, open the event in Calendar, or add a shared event to their own calendar. Invitations that arrive as attachments open in a dialog with the same card.

## Sub-features

- `inv-card` shows the invitation details under the sender, with expandable guests and description.
- `inv-rsvp` sends Yes, Maybe, or No from the responding address. Recurring invitations ask `This event` or `All events`.
- `inv-shared-event` handles published event files: `Shared event organized by <name>`, `On your calendar.`, or `Not on your calendar.` with `Add to calendar` (feature-gated).
- `inv-open` provides `Open in calendar` (Shift-click for a new split) and `View your day`.
- `inv-attachment` opens the `.ics` attachment in a dialog (a drawer on phones) with `Download .ics`.
- `inv-outlook` shows `Open in Outlook` for an Outlook invitation the user attends.

## How to get to it (user POV)

- Mail: open an invitation message in `/app/component/mail`.
- Email thread: `/app/email/:threadId`.
- Click the calendar attachment chip to open the same card in a dialog.
- From the card: `Open in calendar`, `View your day`, `Yes`/`Maybe`/`No`.

## Driving it with chrome-devtools MCP

Preconditions:

- The mailbox holds an invitation email received after this feature shipped. Older invitations render as plain email.
- A connected calendar is available to resolve the event. Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Open an invitation.** Navigate to `/app/email/<threadId>` for an invitation thread. Result: the card appears under the sender; saved details show before calendar sync finishes.
- **Wait for the check.** Wait for `Checking your connected calendar…` to disappear. Result: the card shows either RSVP buttons with the responding address, or a status line explaining why not.
- **Answer.** Choose `Yes` (or `Maybe` / `No`). For a recurring invitation choose `This event` or `All events` first. Result: the chosen response stays pressed; a failure keeps the card and shows a retry.
- **Open in Calendar.** Choose `Open in calendar`. Result: the calendar opens focused on the event's current occurrence.
- **Open the attachment.** Click the `.ics` chip. Result: a dialog opens with the same card and `Download .ics`; `Escape` returns focus to the chip.
- **Add a shared event.** On a published event with `Not on your calendar.`, choose `Add to calendar` (flag on). Result: the card resolves to a snapshot of the event on the user's only writable Google calendar, or a picked one.

## Gotchas

- Do not assert an RSVP or join action before `Checking your connected calendar…` clears; the card withholds actions until the check resolves.
- A card whose calendar check failed shows `Calendar unavailable. Saved event details are shown.` and no button.
- A delegated inbox gets invitation access only for that inbox; another inbox of the same account stays private.
- Local verification needs both mail and calendar services. Seeded accounts have no Google token, so an RSVP fails at the provider and rolls back.
- For an Outlook invitation the user attends, `Open in Outlook` sits below the RSVP controls and opens the occurrence so the response can be cleared there.
- Shared-event snapshots do not update when the organizer changes the meeting.
