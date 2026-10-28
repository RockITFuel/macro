# Pull request list

Pull request list is the Reviews page for GitHub pull requests. It lists PRs by scope (all, authored, assigned, involving me, review requests), filters them by status, repository, author, assignee, label, review state, priority, links and origin, sorts them, and shows them as a list or board. Rows update live when GitHub data changes. PRs are not tasks and never appear in the Tasks list.

## Sub-features

- `pr-list-scopes` switches between All, Authored, Assigned, Involves me, and Review requests.
- `pr-list-status` filters with the Open, Closed, and All tabs; Merged is a status filter option.
- `pr-list-filters` narrows results by repository, author, assignee, label, review state (reviewed by you, not reviewed by you, awaiting your review), priority, linked item, and origin.
- `pr-list-sort` orders by priority, recently updated, least recently updated, newest, or oldest.
- `pr-list-board` switches the same results to a board layout grouped by status.
- `pr-list-live` updates an open row when the PR changes on GitHub, without reloading the list.
- `pr-list-search` filters the list by text across the loaded tabs.

## How to get to it (user POV)

- Sidebar: choose **Reviews** in the main navigation.
- Direct link: `/app/reviews/pr` (or the Reviews route for a scope such as All).
- Mobile dock: choose **Reviews**, or **More** then **Reviews**; it opens on **Pull requests** with the All scope.
- Command menu: search for Reviews and choose the Pull requests entry (unverified).
- Desktop default scope is **Involves me**; explicit review-tab links keep their selected scope.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in; the user's GitHub account is linked.
- At least one repository is connected and has open PRs, including one authored by the test user and one with a review request.
- Start from `/app/reviews/pr` with default filters (status Open).

- **Open the list.** Navigate to `/app/reviews/pr`. Take a snapshot. Observable: the status tabs `Open`, `Closed`, `All`, and rows with PR titles.
- **Switch scope.** Click the sidebar entry or scope control named `Authored`. Observable: only rows authored by the test user remain.
- **Change status.** Click the tab `button "Closed"`. Observable: rows change to closed PRs; the `Open` tab is no longer selected.
- **Apply a review filter.** Open `button "Filter pull requests"`, choose `Awaiting review from you`. Observable: the list narrows; the filter trigger shows an active count.
- **Sort.** Open the sort control and choose `Least recently updated`. Observable: the first row is the oldest by update time.
- **Board layout.** Choose `Board` in the `Review layout` group. Observable: a board appears; choose `List` to return.
- **Live update.** Keep two rows visible. Change one PR's state on GitHub. Observable: the row updates in place after the webhook arrives, without a full list reload.
- **Proof.** Record snapshots after each step and note the visible row titles and status tab state.

## Gotchas

- The default scope on desktop is Involves me, not All; mobile starts on All.
- Scopes that match the viewer's GitHub identity wait for the GitHub link; before it loads, those scopes can look empty.
- Priority sort is computed on the client from link data; expect a short reorder after load.
- PRs never appear in Tasks, so a PR missing from Tasks is not a bug.
- Status filtering uses the Open/Closed tabs and the filter menu; PR status pills in rows are passive and do not filter.
- A PR linked to an agent session shows a session chip on the row; clicking the chip opens the session without activating the row.
