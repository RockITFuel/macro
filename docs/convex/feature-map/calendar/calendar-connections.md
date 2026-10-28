# Calendar connections and calendar settings

Users connect Gmail or Outlook / Microsoft 365 accounts so their calendars sync into Macro. They grant calendar permission per inbox, reconnect expired authorizations, turn calendars off, and choose how much of their busy time teammates can see. Connecting a calendar sends the user through the provider's consent screen; Macro cannot complete that step for them.

## Sub-features

- `conn-connect` starts `Connect account` (pick Gmail or Outlook / Microsoft 365) and returns from consent with `Back to app`.
- `conn-per-inbox` offers `Enable`, `Reconnect`, or `Turn off` per connected account, and `Connect calendar` for an inbox that lacks calendar permission.
- `conn-disconnect` removes calendar access and data after confirmation. The email connection stays.
- `conn-team-sharing` sets `Share with teammates` to `Busy blocks` (default), `Event details`, or `Nothing` (feature-gated).
- `conn-busy-calendars` chooses which calendars count as busy time. Primary calendars count by default.
- `conn-enable-prompt` shows an `Enable calendar` toast once per own inbox missing calendar permission (feature-gated).
- `conn-errors` shows `Could not load your calendars.` with `Try again`, and a warning icon on a calendar whose sync keeps failing.

## How to get to it (user POV)

- Settings → Calendar (`/app/settings/calendar`).
- Calendar view: setup prompt `Connect calendar` (or `Connect your calendar` for a delegate with no own inbox).
- Calendar `Settings` (gear) menu, section `Accounts`.
- Settings → Email: per-inbox `Enable calendar` (the Shared rows for delegated inboxes also show it).
- The `Enable calendar` toast shown once per own inbox that lacks calendar permission.

## Driving it with chrome-devtools MCP

Preconditions:

- A test user is signed in with a Gmail account that the test can use. Provider consent pages require a human or a pre-authorized test account; automated runs stop at the provider screen.
- `navigate_page` to `/app/settings/calendar` loads the Calendar settings. Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Open calendar settings.** Navigate to `/app/settings/calendar`. Result: the connected accounts list and `Connect account` appear.
- **Start a connection.** Choose `Connect account`, then `Gmail` (or `Outlook / Microsoft 365`). Result: the provider consent page opens; after consent, the page shows `Back to app`, and choosing it returns to the previous layout with the account listed.
- **Turn off an account's calendar.** Choose `Turn off` on an account row. Result: a confirmation stays open with `Turning off…` until removal finishes; re-enabling is not offered while the old calendar is still being deleted.
- **Disconnect.** Choose `Disconnect` on a calendar row and confirm. Result: the calendar row disappears; the Gmail connection stays in Settings → Email.
- **Team sharing.** Open the `Team sharing` section (flag on). Choose the `Share with teammates` select and pick `Event details`. Result: the description line updates at once; if the save fails, the previous choice returns with a toast.
- **Calendars that count as busy.** Expand an account in `Calendars that count as busy` and toggle one calendar. Result: the checkbox state persists after reload.

## Gotchas

- Consent screens belong to the provider; the test cannot complete them without an authorized test account.
- Disconnecting removes calendar data but not the Gmail connection.
- Settings → Calendar lists only the viewer's own inboxes. A delegated (Shared) inbox gets its own `Enable calendar` in Settings → Email instead.
- Reconnecting an inbox that used calendar requests email and calendar together; an explicit calendar opt-out stays off during an email-only reconnect.
- Team sharing gives teammates read-only views. It does not change Google calendar sharing or invite teammates to meetings.
- Private and confidential events show only as generic time blocks to teammates.
- Re-consent is per account; a second Google account needs its own `Connect calendar` step.
