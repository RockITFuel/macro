# Guided tours and setup prompts

Desktop views show a dismissible feature tour: a card sits beside the feature, with Back, Next, and Dismiss, and the feature is outlined. Tours cover Home, Email, Documents, Tasks, Channels, Calendar, Customers, Agents, Calls, and Folders. Mobile-web first-run users see an interactive tutorial modal. Sidebars can also show cards that invite users to import from connected apps or to finish setup, such as connecting calendars or repositories. Dismissing a setup card is permanent for the account.

## Sub-features

- `tour-view` shows the per-view feature tour, with beacons that point at controls that must be opened first.
- `tour-video` embeds a video from Macro's YouTube channel. It loads only after `Watch`.
- `tour-progress` saves progress per user and view in the browser. `Got it` and skipping past the last step complete the tour; `Dismiss` hides it.
- `tutorial-mobile` is the first-run mobile-web tutorial. Its lessons cover the command menu, markdown mentions, sidebar navigation, and creating an entity.
- `prompt-import-cards` shows `Import files`, `Import tasks`, or `Import customers`, and opens a connector import dialog.
- `prompt-setup-cards` shows Home's `Make Macro your home base`, Calendar's `Connect more calendars`, and Pull requests' `Bring in more repositories`.
- `prompt-dismiss` hides a card for good, on every device.

## How to get to it (user POV)

- Desktop: tours appear on their views automatically until dismissed. Tours do not show on narrow screens or touch devices.
- Beacons: a pulsing dot marks the sidebar toggle, the Agents nav item, Create, or the top conversation row that reveals the step's feature.
- Import cards: at the end of the Drive, Tasks, and Customers sidebars.
- Setup cards: Home, Calendar, and Pull requests sidebars.
- Mobile-web first run: the tutorial modal opens after sign-in.

## Driving it with chrome-devtools MCP

Preconditions:

- Local dev: set `VITE_ENABLE_IN_APP_TOURS=true` so tours show, and turn on the `enable-sidebar-promotions` flag for cards.
- Desktop viewport (at least 1280 px) and a user whose tour progress is cleared in the browser.

- **Home tour.** Navigate to `/app/home`. Observable: a card with the heading `Home` and a step counter, with `Back`, `Next`, and `Dismiss` buttons. `Got it` replaces `Next` on the last step.
- **Dismiss a tour.** Click button `Dismiss`. Observable: the card closes. Reload. Observable: the tour stays hidden for that view.
- **Beacon.** On Agents with the sidebar collapsed, observe the pulsing dot on the sidebar toggle. Open the sidebar. Observable: the dot moves to the Agents nav item when needed.
- **Import card.** Open the Drive sidebar and click button `Import files`. Observable: a dialog lists Notion, Google Drive, Dropbox, OneDrive, Box, and Confluence. Each row offers `Connect <App>` or `Import from <App>`.
- **Dismiss a setup card.** Click the close button on the card. Observable: the card disappears. Reload, and on another browser for the same account. Observable: the card stays hidden.
- **Mobile tutorial.** Emulate a phone viewport as a first-time user. Observable: the interactive tutorial modal opens after sign-in. It does not open for users whose tutorial is complete.

## Gotchas

- A tour never navigates or opens anything for you. A step whose feature is behind a control shows a beacon and waits.
- On localhost in development, tours start from the first step on every mount and saved progress is left alone.
- Dismissing a setup card is stored on the server for the account. If the list of dismissals cannot load, the browser's own record is used, which can show a card dismissed on another device for a moment.
- The `Invite team` card is hidden for members of a team that limits invites to admins.
- The Calendar card hides once two accounts have working calendar access. Its button label changes to `Turn on calendar` or `Reconnect calendar` when an account's grant needs attention.
- The video player does not load until `Watch` is clicked. Dismissing the tour removes the video.
- Setup-card visibility is remembered per browser, so a previously shown card appears at once while flags and lists load.
