# GitHub account link

GitHub account link connects a Macro user to their GitHub identity so Reviews can show that user's pull requests and merge them as themselves. The link shows as connected, with the GitHub username, in Settings. It can be reconnected when GitHub asks for reauthentication, disconnected, or replaced after disconnecting first.

## Sub-features

- `gh-link-connect` links a GitHub account through GitHub's own authorization page.
- `gh-link-status` shows connected, reauthentication-needed, or not-connected state with the GitHub username.
- `gh-link-reconnect` re-runs authorization when GitHub reports that reauthentication is required; cancelling keeps the current link.
- `gh-link-disconnect` removes the link so another GitHub account can be connected.
- `gh-link-prompt` shows a reauthentication prompt when a GitHub-backed action fails for lack of a valid link.

## How to get to it (user POV)

- Open Settings, then Connections, and find the GitHub card under connected accounts.
- Open Reviews without a linked account; the empty state offers a connect action.
- Open the Pull requests sidebar card; without a link its button is **Connect GitHub**, and with an expired link **Reconnect GitHub**.
- A GitHub-backed action that needs reauthentication shows a reauthentication prompt that starts the same flow.
- Mobile: the same Settings path; the onboarding connect-accounts step also offers GitHub.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a user.
- The test user has no GitHub link at the start, or the scenario states which link state it needs.
- A GitHub test account is available for the authorization page; do not use a real personal account on hosted dev.

- **Open the card.** Navigate to the settings route for Connections. Take a snapshot and find the card region named for GitHub. Observable: a button named `Connect GitHub` appears inside that region.
- **Start connect.** Click `button "Connect GitHub"`. Observable: a new tab opens on GitHub's authorization host; the Macro tab is unchanged.
- **Finish authorization.** In the GitHub tab, approve with the test account. Switch back to the Macro tab with `select_page`. Observable: the card shows the GitHub username and a connected status dot after the app regains focus.
- **Reconnect.** With an expired link, the card button reads `Reconnect GitHub`. Click it. Observable: authorization opens in a new tab; if you cancel it, the card still shows the previous username.
- **Disconnect.** Open the card's disconnect action (`button` in the GitHub region; exact name unverified). Confirm. Observable: the card returns to `Connect GitHub`.
- **Proof.** Take a snapshot after each step and record the card's accessible name and status text. Use `take_screenshot` on the Connections page once at the end.

## Gotchas

- GitHub's authorization page opens in a new tab; the card updates only after the Macro tab regains focus.
- Cancelling a reconnect must keep the existing link. A missing username after cancel is a bug, not expected behavior.
- Connecting a second GitHub account while one is linked fails; the user must disconnect first. The error does not change the connection.
- Accounts that share one GitHub identity all see the reconnect result; verify with two Macro users if the scenario covers sharing.
- A failed upstream outage must leave the existing link in place and show an error.
