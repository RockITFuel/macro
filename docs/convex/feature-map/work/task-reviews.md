# Reviews (GitHub pull requests)

Reviews is a separate view that lists the GitHub pull requests you can access, in Open, Closed, and All states, with filters for priority, linked work, repository, author, assignee, label, and review state. It shows each pull request's linked Macro tasks, customers, channels, and agent sessions, and a board of review stages you can move cards across to merge, draft, or mark ready (GitHub acts as you). Opening a pull request shows its details and a read-only Changes pane.

## Sub-features

- `rev-list` lists pull requests with Open, Closed, and All tabs; paged as you scroll.
- `rev-scopes` the five scopes in the sidebar: Pull requests, Authored by me, Assigned to me, Involves me, Review requests.
- `rev-filter-sort` filters (priority, linked to, started from, repository, author, assignee, label, reviewed by you) and sorts.
- `rev-board` the review board: Draft, In review, Checks failing, Conflicts, Ready to merge, Merged; drag to merge or convert drafts.
- `rev-favorites` favorite pull requests shown in a Favorites section.
- `rev-detail` pull request detail with a Changes pane (file tree, unified or split diff) and the Linked work section.
- `rev-agent-sessions` agent session chips on rows and in the detail.

## How to get to it (user POV)

- Desktop navigation: **Reviews**, above **My Tasks** on the Tasks sidebar when the `enable-tasks-reviews` flag is on (on by default in development).
- Mobile: the bottom dock's **More views** drawer (or in the dock after customizing it), not the Tasks tabs.
- Route `/app/reviews`; a pull request opens at `/app/reviews/pr/<id>`. Old `/app/pr/<id>` links redirect here.
- With the flag off, Reviews is hidden and `/app/reviews` redirects to Tasks.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in with a linked GitHub account, and `enable-tasks-reviews` on (or development build).
- Use existing pull requests only; do not merge or convert drafts on real repositories.

- **Open Reviews.** Activate **Reviews** in the sidebar. Result: URL `/app/reviews`; **Involves me** is selected by default.
- **Switch scope.** Activate **Authored by me** in the sidebar. Result: list changes; the URL keeps the selected scope.
- **Change status.** Activate the **Open**, **Closed**, or **All** toggle (labelled "Pull request status"). Result: the list shows pull requests in that state; Closed includes merged pull requests.
- **Filter.** Activate **Filter**, then a **Reviewed by you** or **Priority** option. Result: list narrows; the filter count appears beside the icon.
- **Sort.** Activate **Sort** and choose **Recently updated**. Result: date groups (Today, Yesterday, Last 7 days, and so on).
- **Open a pull request.** Click a row. Result: URL `/app/reviews/pr/<id>`; the breadcrumb returns to the list.
- **Changes pane.** On a pull request, activate the **Changes** toggle. Result: a pane with the file tree and the diff of the current base and head.
- **Favorite.** Open the row's context menu and choose the favorite action. Result: the Favorites section appears above the views.
- **Board.** Activate **Board** in the header. Result: columns for each review stage; the status toggle is hidden.

## Gotchas

- Without a linked GitHub account, the Authored by me, Assigned to me, and Review requests tabs are unavailable and say why.
- Involves me is not strictly the current review requests; it includes anyone who commented or was assigned.
- Opening a pull request refreshes it from GitHub in the background; new commits replace the previous diff.
- Dragging a card to **Merged** merges the pull request on GitHub after the same confirmation as the Merge button; a refusal shows GitHub's message and the card returns.
- Checks failing, Conflicts, and Ready to merge columns do not accept drops.
- Saved review filters stay inactive while the GitHub identity is unavailable.
- Priority on a row comes from the most urgent open linked task or a GitHub priority label.
- Hidden Reviews on mobile unless the dock has been customized to include it.
