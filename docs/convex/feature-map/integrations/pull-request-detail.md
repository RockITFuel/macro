# Pull request detail

Pull request detail shows one GitHub pull request inside the Reviews shell: its title and status, linked GitHub metadata, the discussion timeline, and a Details/Checks side panel. Linked agent sessions and linked tasks appear as pills and in the side panel. If GitHub data does not load, an error banner offers Retry.

## Sub-features

- `pr-open` opens a PR from a Reviews row, a link, or an agent session.
- `pr-timeline` shows the GitHub discussion timeline for the PR.
- `pr-side-panel` toggles the Details and Checks side panel beside the PR.
- `pr-agent-sessions` shows linked agent sessions as a chip, or a count chip opening a session list.
- `pr-linked-work` shows linked tasks and other linked work in the side panel.
- `pr-retry` refetches the PR in place after an error banner.
- `pr-copy-link` copies the Reviews link for the PR.

## How to get to it (user POV)

- Choose a PR row in the Reviews list.
- Open a PR link from a Reviews or agent session; old `/app/pr/<id>` links redirect to Reviews.
- Choose a linked session's PR from an agent session view.
- Quick Access: Copy Link on a PR copies the Reviews link, which opens the same detail.
- Mobile: choose a row in Reviews; the side panel stacks below the detail.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in with a linked GitHub account.
- A test PR exists with at least one comment, one linked agent session, and checks.
- Note the PR's Reviews URL from the list (`/app/reviews/pr/<id>`).

- **Open a PR.** Navigate to `/app/reviews`, then click the row whose accessible name contains the test PR title. Observable: the URL becomes `/app/reviews/pr/<id>`; a breadcrumb reads `Reviews` and the PR title appears in the top bar.
- **Read the timeline.** Take a snapshot. Observable: comments and events from GitHub appear in order in the discussion region.
- **Open side panel.** Click the side-panel toggle named for Details or Checks. Observable: the panel shows `Details` and `Checks` sections; the toggle state changes.
- **Open a linked session.** Click the agent session chip (single session shows its name). Observable: the session opens in the split beside the PR.
- **Shift-open.** Shift-click the same single-session chip. Observable: a second split opens with that session; the PR stays open.
- **Error and retry.** With GitHub data unavailable (scenario-specific), observe an error banner with `button "Retry"`. Click it. Observable: the banner clears when the PR loads.
- **Copy link.** Open the PR's Quick Access menu and choose `Copy link`. Observable: the clipboard holds `/app/reviews/pr/<id>`.
- **Proof.** Take a snapshot after each step; record the URL and breadcrumb.

## Gotchas

- Session chips are not navigable while the session preview is still loading or inaccessible.
- Empty links show no chip at all, so a missing chip is correct when nothing is linked.
- Diff and discussion requests are separate from the live status update; a discussion that is slow does not mean the status is stale.
- Old `/app/pr/<id>` URLs redirect; verify the destination, not the old address.
- The PR viewer is read-only: there are no agent review notes and no comment composer in this feature.
- Changes, merge and checks are separate features; this page only shows the summary and the checks side panel.
