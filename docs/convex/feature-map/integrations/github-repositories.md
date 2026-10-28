# GitHub repositories

GitHub repositories lets a team bring GitHub repositories into Reviews by installing Macro's GitHub App on chosen organizations or repositories. GitHub then tells Macro about pull request changes, so Reviews and linked agent sessions update without a page reload. The sidebar card and Settings are the entry points.

## Sub-features

- `gh-repos-card` shows the Pull requests sidebar card "Bring in more repositories" with the button matching the account state.
- `gh-repos-install` opens GitHub's App installation page in a new tab, where the user picks orgs and repositories.
- `gh-repos-return` returns from GitHub after installation and lands the user back in Macro.
- `gh-repos-sync` reflects GitHub pull request events in Reviews rows and linked sessions after a webhook arrives.
- `gh-repos-dismiss` hides the card permanently for the account.

## How to get to it (user POV)

- Open the Pull requests sidebar card in Reviews; its button is **Add repositories** once GitHub is linked.
- Without a linked GitHub account the same card shows **Connect GitHub**, which starts the account link first (see GitHub account link).
- Reviews empty state offers the repository setup when no repositories are connected.
- Dismiss the card with its close button; it stays hidden on every device.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a user whose GitHub account is linked.
- The GitHub test organization exists, and the App is installable there (the scenario names the org).
- The card is visible, meaning the account has not dismissed it.

- **Open the card.** Navigate to the Reviews route for pull requests (`/app/reviews`). Take a snapshot and find the sidebar region named for the Pull requests card. Observable: a heading or text `Bring in more repositories` and a button `Add repositories` are present.
- **Start install.** Click `button "Add repositories"`. Observable: a new tab opens on GitHub's installation page for the Macro App.
- **Choose repositories.** In the GitHub tab, select the test repositories and install. Observable: GitHub redirects back to Macro; the Macro tab is at a Macro URL and no error banner appears.
- **Confirm sync.** Return to Reviews. Observable: repositories chosen in GitHub show pull requests in the list after the first sync; the card no longer shows the add prompt if the scenario covers that state.
- **Dismiss.** Click `button "Dismiss pull request repositories"` (or the card's close button, found by its accessible name). Observable: the card disappears and stays hidden after reload.
- **Proof.** Take a snapshot after each step. Record the Reviews list rows that appeared and the card state.

## Gotchas

- Installing the App is per GitHub organization or repository; a repository missing from the install choices will not appear in Reviews.
- The install page opens in a new tab. Focus-based refresh only happens when the Macro tab regains focus.
- Dismissing is server-side and per account; a second browser will not show the card again.
- A PR change on GitHub reaches Reviews only after GitHub's webhook arrives; allow a short wait before asserting.
- An unrelated GitHub account signing into the install page cannot grant access the user does not have; the same not-found response is used for both cases.
