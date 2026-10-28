# Scheduling and booking pages

Scheduling lets a user, or a team, publish booking links. Guests pick a time from the owner's availability on a public page, with no Macro sign-in. The workspace also manages weekly availability schedules, bookings, and insights. A guest's booking produces a receipt page where they can cancel or reschedule. Team links let any team member edit the link, and team hosts take bookings in collective or round-robin mode.

## Sub-features

- `sched-links` lists booking links; creates them in a five-step dialog (Details, Location & availability, Questions, Booking rules, Review); pauses, duplicates, previews, copies, and deletes them.
- `sched-availability` manages named weekly schedules and date exceptions in one time zone, and sets a default schedule.
- `sched-bookings` lists upcoming, unconfirmed, past, cancelled, and needs-attention bookings, with filters; confirms, cancels, reschedules, and records attendance.
- `sched-insights` reports bookings by period with trends, outcomes, popular events, and hosts; exports CSV.
- `sched-page` edits the public booking page's name and introduction, with Save, Revert, and Copy link.
- `sched-public` is the guest flow on a booking URL: landing, time zone, date, time, details, confirmation.
- `sched-receipt` is the private receipt page for cancel and reschedule.

## How to get to it (user POV)

- `More` → `Scheduling` opens the workspace at `/app/scheduling`.
- Calendar header `Booking links` dropdown: choose an active link to copy it, or `Manage booking links` for the workspace.
- Calendar sidebar `Booking links` section (desktop, narrow panes); phones use the header dropdown.
- `Create with agent` (sparkle icon) opens an unsent request in an agent conversation.
- Guests: the booking URL `/app/book/<profile>/<slug>` (no sign-in needed).
- Guests: the receipt link `/app/booking/<id>#<token>` from the confirmation.
- Phones: the Scheduling tabs are a horizontal pill strip; the owner selector sits at its start.

## Driving it with chrome-devtools MCP

Preconditions:

- `enable-calendar-scheduling` is on (dev default on; `VITE_ENABLE_CALENDAR_SCHEDULING=true` locally).
- The owner has a connected calendar and at least one schedule with weekly hours.
- Public-page steps run in a separate private window so the guest is signed out.
- Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Open the workspace.** Navigate to `/app/scheduling`. Result: the `Booking links` tab shows the owner (`Personal` or a team) in the top header.
- **Create a link.** Choose `New`. In the dialog, fill the title and duration fields in Details (exact field names unverified; confirm in the snapshot), then move through `Next` to `Location & availability`, `Questions`, `Booking rules`, and `Review`; choose `Create link`. Result: a new row appears with a copy-link icon; the link is active by default.
- **Copy a link.** Choose the URL pill, then `Copy link`. Result: clipboard holds the public URL; the icon shows a brief green check.
- **Pause a link.** Turn off the acceptance switch on a row. Result: the row dims; it remains editable.
- **Edit the booking page.** Open `Booking page`, edit `Display name`, choose `Save`. Result: the saved values persist after reload; `Revert` restores the saved values.
- **Set availability.** Open `Availability`, choose `New schedule`, add weekly hours with `Add hours`, then `Save schedule`. Result: the schedule card lists its weekday hours.
- **Book as a guest.** In a private window, navigate to the booking URL, choose an event, pick a time zone, a date, and a time, enter name and email, and confirm. Result: a receipt page opens.
- **Cancel a booking.** In `Bookings`, open the booking and choose `Cancel`, then confirm in the dialog (confirm button label unverified). Result: the card shows as cancelled and dimmed.

## Gotchas

- Scheduling does not report a confirmed booking when the calendar provider fails. A `Check booking status` retry repeats the original request and never creates a replacement booking.
- While the flag is off, booking URLs and receipts show an unavailable page.
- Unsaved edits to the booking page or a link draft raise a `Save changes?` prompt on tab or owner change.
- Team owners and admins can manage every booking; an assigned host can change only their own future confirmed bookings.
- Every team member can edit a team's links, schedules, and booking page; personal links belong to their owner.
- Legacy approval-only links show as `Paused` until switched to automatic confirmation.
- Time zones: booking dates load in the browser's zone; changing the display zone only changes grouping and times shown.
- Insights excludes failed and processing requests; oversized result sets return an error instead of a partial report.
- Public booking links still load when the feature-flag request gets no answer.
