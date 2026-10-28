# Calendar views

Calendar shows the user's connected calendars as a Month, Week, or Day grid at `/app/calendar/<period>`. A sidebar lists accounts and calendars with visibility checkboxes and colors, plus upcoming events. The user moves between periods, searches events, and opens an event's details beside the grid. Team out-of-office days can overlay the grid. Until a calendar has synced, its events do not appear and the page shows a connect prompt or a syncing banner.

## Sub-features

- `cal-periods` switches Month, Week, and Day. Phones default to Day and desktop to Week; the last choice is remembered.
- `cal-navigation` moves Today, previous, and next, by arrow, hotkey, or swipe.
- `cal-sidebar` shows or hides accounts and single calendars, and sets their colors. Choices stay in this browser.
- `cal-upcoming` lists the next events, active Quick Calls, and a Join action for events with a call link.
- `cal-search` searches events by text, with filters for search-in, status, organizer, and attendee. Exact-match mode is available.
- `cal-availability-copy` copies free time ranges for a chosen date span and time window.
- `cal-team-ooo` overlays teammates' out-of-office days (feature-gated) and lists them in the sidebar.
- `cal-sync-states` shows skeletons while events load, a `Syncing your calendar…` banner during backfill, and a retryable error.

## How to get to it (user POV)

- Open Calendar from the app's main navigation (exact label unverified).
- Go straight to `/app/calendar/month`, `/app/calendar/week`, or `/app/calendar/day`.
- Home shows the Calendar inline, at the same period paths.
- Shift-click `Open in calendar` on an email invitation card to open Calendar in a new split beside the email.
- Desktop header: `Search events`, `Today`, previous/next arrows, the period selector, `Booking links`, and `New`.
- Desktop sidebar: `Upcoming events`, `Calendars`, `Team out of office` (when shown), and `Settings` in the footer.
- Phones: the month selector and `Today` sit in the left header island, and `Availability`, `Search`, and `Settings` sit on the right. The `New` menu is beside the bottom AI input.
- Keyboard (desktop): `d`, `w`, `m` switch Day, Week, Month; `p`/`k` go back, `n`/`j` forward, `t` jumps to today; Cmd/Ctrl+F opens search.

## Driving it with chrome-devtools MCP

Preconditions:

- The test user has at least one connected calendar with synced events (see `calendar-connections`).
- `navigate_page` to `/app/calendar/week` loads the grid. Run `take_snapshot` before each step and act on the uid whose role and name match the handle.
- Feature flags for the test run are set as on the running stack; `enable-calendar-team-ooo` is required for the overlay step.

- **Open week view.** Navigate to `/app/calendar/week`. Wait for the grid. Result: the URL ends in `/week` and events from the current week are drawn.
- **Switch to month.** Press `m` with focus outside a text field. Result: the URL changes to `/month` and the month grid renders with the same events.
- **Step forward.** Choose the next-period arrow (accessible name unverified; confirm in the snapshot) or press `n`. Result: the heading advances one period and the URL reflects the new date.
- **Return to today.** Choose `Today` (or press `t`). Result: the grid shows the current date.
- **Search.** Choose `Search events` (or press Cmd/Ctrl+F). Type a title substring with three or more characters. Result: a results list appears; choosing a result opens its details and keeps the search text.
- **Upcoming list.** Find `Upcoming events` in the sidebar and expand it. Result: upcoming rows show color swatch, name, and time; choosing a row opens its details.
- **Hide a calendar.** Uncheck one calendar under `Calendars`. Result: its events disappear from the grid without a reload.
- **Team overlay.** Check `Team out of office`. Result: read-only teammate chips titled `<name>: <event title>` appear; choosing a teammate row navigates to that date.
- **Phone period.** At phone width, open the month selector in the left header island. Result: a date-selection drawer opens; choosing a day updates the grid.

## Gotchas

- Events show only after their calendar has synced. A first connection shows `Syncing your calendar…` until backfill finishes; assert on events only after the banner disappears.
- Sidebar visibility and colors are browser-local. Clearing site data or using another browser resets them.
- Hidden calendars still count for conflict checks and booking availability; visibility does not change them.
- Keyboard period keys do nothing while a text field has focus; click the grid first.
- Opening details by clicking the grid's empty time closes details instead of creating an event while details are open.
- Working locations (such as Office or Home) appear on the grid but not in Upcoming events.
- Events on a shared calendar that Google also copies to your primary calendar render as one chip.
