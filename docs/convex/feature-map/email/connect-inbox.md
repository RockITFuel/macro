# Connect an email inbox

Connect inbox lets a user link a Gmail, Google Workspace, Outlook.com, or Microsoft 365 mailbox to Macro through the provider's own consent screen, then add, reconnect, remove, or force-sync those inboxes and choose which one is primary. Until an inbox is connected, the Email view shows a connect prompt and most mail actions are unavailable.

## Sub-features

- `connect-gmail` links a Gmail or Google Workspace inbox through Google consent.
- `connect-outlook` links an Outlook.com or Microsoft 365 inbox through Microsoft consent.
- `connect-admin-approval` shows the admin approval dialog when a Microsoft tenant only lets administrators consent, and resumes the connect dialog after approval.
- `connect-manage` adds another inbox, reconnects one that lost access, force-syncs it, or removes it.
- `connect-primary` marks one connected inbox as primary, the default sender for new mail.

## How to get to it (user POV)

- Open the Email view at `/app/component/mail` on a fresh account and choose the connect action in the `Connect your email` empty state.
- Choose the `Email` compose button (or `Create` then `Email`) on a fresh account; it shows the same connect prompt.
- Open Settings, go to the Email section, and choose `Add inbox` (or `Add another inbox` when one is already connected).
- Choose `Reconnect` or `Remove inbox` beside an inbox row in the Email settings list.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running locally (see `docs/development/running-locally.md`) and signed in as a disposable test user.
- The test user has no connected inbox for `connect-gmail` or `connect-outlook`. Use a second disposable account for `connect-manage`.
- A test Gmail or Outlook account is available for provider consent. Do not use a real personal or production mailbox.

- **Empty-state entry.** Navigate to `/app/component/mail`. Take a snapshot and find the `Connect your email` heading. Click the connect action inside that empty state. Observable result: the provider consent window opens for the chosen provider, or a provider picker appears if both are offered (exact button names unverified; match by text inside the empty-state region).
- **Gmail consent.** Complete Google consent with the test account. Observable result: the Email view returns to `/app/component/mail`, the `Connect your email` heading is gone, and the list shows the account's threads after sync starts.
- **Outlook consent.** Repeat with a Microsoft account. Observable result: the same return to the Email view, with the inbox listed in Settings.
- **Admin approval.** Use a tenant where only administrators can consent. Observable result: a dialog titled `Admin approval required` appears with buttons `Copy admin approval link` and `Connect a different account`.
- **Cancel consent.** Start a connect, then cancel on the provider screen. Observable result: the previous Macro view returns with no error notice.
- **Add inbox.** Navigate to Settings, Email. Click the control with accessible name `Add inbox`. Observable result: a second inbox appears in the list after consent.
- **Primary.** In the inbox list, the row marked `Primary` is the default sender. Observable result: a new compose window's `From` defaults to that inbox.
- **Remove.** Click the `Remove <address>` control on the non-primary row and confirm. Observable result: the row disappears from the list and that inbox's threads leave the Email view.

## Gotchas

- Cancelling on the provider's consent screen returns silently; there is no error to look for.
- Admin approval is not shown on native mobile. Verify it on the web app only.
- The `Copy admin approval link` link is tenant-wide and is meant for an IT administrator, not for the test user.
- Outlook covers personal Outlook.com and individual Microsoft 365 inboxes. Shared or delegated Microsoft mailboxes are out of scope for this account; sharing an inbox inside Macro is a different flow.
- On a mixed Gmail and Outlook account, choose the inbox explicitly before checking a thread or sending mail.
- A fresh user with no inbox sees the connect prompt even though other sections of the app work.
- Free accounts are limited to a small number of connected inboxes (unverified count); an add past the limit is refused.
