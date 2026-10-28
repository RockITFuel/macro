# Event create, edit and details

Users create, edit, RSVP to, and delete calendar events in the event composer and the event details panel. Recurring events can change for one occurrence or the whole series. Guests can be invited and their permissions set. Events can carry a Macro call or a Google Meet link, be marked out-of-office, or be shared as an `.ics` file or by email. Outlook organizers can replace an event. Changes sync to the provider (Google or Outlook), so provider rules decide what a guest may change.

## Sub-features

- `evt-create` creates an event from the composer, with All day, an Event or Out of office kind, and a calendar choice. Dragging or clicking an empty grid range also opens it.
- `evt-scope` chooses `This event` or `All events` when changing a recurring event, including reminder-only edits.
- `evt-guests` shows the guests row, copies guest emails, emails guests, and adds guests (feature-gated).
- `evt-guest-policy` sets what guests may do: Modify event, Invite others, See guest list (Google, feature-gated).
- `evt-conference` picks Macro call, Google Meet, or No meeting link, and offers Join and Copy call link in details.
- `evt-rsvp` answers Going? with Yes, Maybe, or No, and shows a spinner while the response saves.
- `evt-delete` deletes an event after confirmation, noting whether guests are notified.
- `evt-ics-forward` downloads an `.ics` file or forwards the event by email with the file attached.
- `evt-shared-copy` handles events shared into Macro from a channel or a mention: Add to calendar, Ask to join, Delete your copy.
- `evt-outlook-replace` lets an Outlook organizer replace an event, resetting guest responses or removing the online meeting.

## How to get to it (user POV)

- Calendar `New` menu, then `Event`. On phones the `New` menu sits beside the bottom AI input.
- Desktop: click or drag an empty range on the grid.
- Open an event, then choose the `Edit event` icon in its details header. Phones: the same action is in the detail drawer.
- Open an event, then `Delete event` in the details header.
- Calendar search result, then the event details.
- Email invitation card (RSVP buttons; see `invitations-in-email`).
- In a message, document, or comment composer: type `@` and at least three characters of an event title, then pick it under `Calendar events`. Alternative: `Copy event` in details, then paste.

## Driving it with chrome-devtools MCP

Preconditions:

- The test user has a connected Google calendar with a writable primary calendar (see `calendar-connections`). Outlook steps need a connected Outlook calendar.
- Guest and Macro-call steps need the quick-call flag on, and guest invites need `enable-calendar-guest-invites`.
- Run `take_snapshot` before each step and act on the uid whose role and name match the handle. Click a contenteditable title first, then `type_text`.

- **Open the composer.** Choose `New`, then `Event`. Result: the `New event` composer opens with `All day` in the date fields and a title box focused.
- **Create an event.** Click the title field and type a title. Choose `Create event`. Result: the composer closes and the event appears on the grid at the chosen time.
- **Edit one occurrence of a recurring event.** Open a later occurrence, change the reminder, choose `This event`, then `Save`. Result: the occurrence shows the new reminder; the other occurrences keep their times.
- **Reply to an invitation.** Open an event you were invited to. Choose `Yes` in the RSVP footer beside `Going?`. Result: `Yes` stays pressed and the footer shows no error. For a recurring event, choose `This event` or `All events` in the sheet, then `Save response`.
- **Copy guest emails.** Open details with guests. Choose `Copy guest emails`. Result: pasting into a text field yields every guest address, comma-separated.
- **Download the file.** In details, choose `Download .ics`. Result: a file named after the title downloads and holds the series, title, description, and location.
- **Forward by email.** Choose `Forward by email`. Result: a new composer opens with an empty recipient list, the event title as subject, and the file attached.
- **Email guests.** Choose `Email guests`. Result: a new composer opens addressed to every guest except you, with the title as subject.
- **Delete.** Choose `Delete event`, then confirm. Result: the event leaves the grid.
- **Mention an event.** In a message composer, type `@` and three characters of a title. Result: a `Calendar events` list appears; choosing a row inserts an event chip.

## Gotchas

- Guests on a provider event may see `Only the organizer can change this event.` and read-only fields. Notifications stay editable for them.
- If the organizer hides the guest list, the guests row reads `Guest list hidden` and guests cannot add others.
- Google takes 15 to 30 seconds to carry organizer changes to copies on secondary calendars. Macro shows the new values at once; do not treat an old value shown after a delay as a failed save.
- Saving a Macro call with a new event creates the call first. If the call cannot be created, nothing is saved; Save retries the whole create.
- Out-of-office events accept no guests, conferencing, or location, and their kind cannot be changed after creation.
- Points (timed events with identical start and end) cannot be dragged or resized, and a new Macro call needs a duration first.
- Changing a start time moves the end time too, until the end is picked in the same edit.
- Phones show the editor as a bottom sheet. Changing a draft and dismissing asks before discarding it.
- Deleting an event does not revoke its reusable Macro call.
