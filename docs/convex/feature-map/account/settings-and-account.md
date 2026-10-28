# Settings and account

Settings opens as a split view from the app rail's gear button or with `Ctrl+;`. Its left nav is grouped into Team, Blocks, Personal, Workspace, Developer, and Admin, and it shows only the sections the account can use. Account holds the profile name and picture, the current plan card, log out, and account deletion. Personal pages cover notifications and snoozes, keyboard shortcuts, desktop and mobile app pages, and the update prompt. Search finds individual settings across all pages.

## Sub-features

- `settings-open` opens Settings from the rail, `Ctrl+;`, a Shift-click for a new split, or the URL `/app/settings/<tab>`.
- `settings-search` searches settings by title and keywords, tolerates typos, and reveals the matched control.
- `settings-mobile-sheet` is the phone version: an inset sheet from `More views → Settings`.
- `account-profile` edits the display name and uploads a profile picture.
- `account-plan-card` shows the current plan and opens Billing.
- `account-logout` signs out.
- `account-delete` deletes the account through a two-step dialog with a 5-second hold.
- `notifications-permission` shows `Enable Desktop Notifications` (desktop app) or `Enable Browser Notifications` (web).
- `notifications-snooze` pauses notifications for items until a chosen time, then lists them under `Snoozed items`.
- `notifications-mutes` lists permanently muted items under `Muted items`, with `Snooze instead`.
- `shortcuts-list` lists keyboard shortcuts by category, with a `Keyboard preview`.
- `tags-page` manages workspace tags.
- `desktop-app-page` shows the desktop app version card (desktop app, or web with the feature flag on).
- `mobile-app-page` shows a QR code to download Macro from the App Store.
- `app-update-prompt` announces a new web or desktop build with the `Update available` button.

## How to get to it (user POV)

- App rail gear button, or `Ctrl+;`. Leave by picking another rail item.
- Routes: `/app/settings/<tab>`. Examples: `/app/settings/account`, `/app/settings/notifications`, `/app/settings/shortcuts`, `/app/settings/tags`.
- Shift-click the gear to open Settings in a new split.
- Phone: `More views → Settings`. The header has `Close settings`.
- Right-click (long-press on phones) a notification row, then `Snooze notifications…`.
- Search from inside Settings: the field `Search settings`.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running and a signed-in account is available on desktop viewport (at least 1280 px wide).
- Notifications exist for the snooze steps (a seeded mention or message is enough).

- **Open settings.** Press `Ctrl+;`. Observable: a split with the group headings `Team`, `Blocks`, `Personal`, `Workspace`, `Developer`, and the `Account` page is selected.
- **Open by URL.** Navigate to `/app/settings/notifications`. Observable: the Notifications page shows in the settings split with the rail still visible.
- **Search settings.** Focus the textbox `Search settings`, type `singature`. Observable: result rows appear with parent-page labels. Press ArrowDown to focus the first result and Enter to open it. Observable: the page scrolls to the control and briefly highlights it. Press Escape in the field to clear the query.
- **Edit name.** On `/app/settings/account`, edit the textbox for the name and click button `Save`. Observable: the new name shows after a reload.
- **Log out.** Click button `Log out` below the plan card. Observable: URL becomes `/app/welcome`.
- **Start account deletion.** Click link or button `Delete account`. Observable: a first dialog warns about irreversibility, with a `Log out instead` link.
- **Confirm deletion.** Continue to the final step. Press and hold button `Hold to delete my account` for 5 seconds. Releasing early cancels. Use only a disposable account.
- **Snooze an item.** Right-click a row on `/app/home` and choose `Snooze notifications…`. Observable: a picker with presets. Pick `2h` or type `tomorrow 10am`, then save. Escape before choosing changes nothing.
- **Review snoozes.** Navigate to `/app/settings/notifications`. Observable: the item appears under `Snoozed items` with its local resume time. Click button `Resume`. Observable: the item leaves the list.
- **Shortcuts.** Navigate to `/app/settings/shortcuts`. Observable: categories with actions on the left and keys on the right. Expand `Keyboard preview` for the key map.
- **Mobile sheet.** Emulate a phone viewport, open `More views → Settings`. Observable: a sheet with grouped sections. Tap a row to open that page inside the sheet. Button `Back to settings` returns to the list.

## Gotchas

- The settings split cannot be hidden at desktop widths. `Cmd .` does nothing there.
- Below 720 px the settings sidebar is an overlay opened by `Show navigation`, which starts closed.
- Team entries show the team name in the nav, for example `Team · <name>`. Search results name their group, for example `Team · Members`.
- `API Keys` is desktop-only. `Shortcuts` is hidden on touch devices. `Mobile App` is hidden on native mobile.
- `Desktop App` shows on the desktop app always. On the web it shows only with the desktop-app flag.
- The delete dialog's 5-second hold is the only confirmation. Releasing early cancels the delete.
- Snoozing pauses notifications only. The item stays visible and unread state does not change. The server enforces expiry even if no client is open.
- A snooze picker that fails to save keeps itself open for retry. A partially saved multi-select retries only the failed items.
- The update prompt reappears even after dismissal when part of the app fails to load because a newer web build replaced it.
- The `Usage` tab sits above `Billing` in Personal and is available on Free accounts. Its behavior is in the billing feature.
