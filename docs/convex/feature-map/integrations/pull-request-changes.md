# Pull request changes

Pull request changes is the Changes pane for a GitHub pull request. It slides in beside the PR details and shows the diff with a file tree, unified or split view, and per-file copy path. Changes can be spotlighted to fill the window, then restored to the split. Narrow screens open it full width.

## Sub-features

- `pr-changes-open` opens the Changes pane from the Changes toggle or the `+N −M` diff count pill.
- `pr-changes-tree` shows the full-height file tree with a count, Hide/Show file tree, and a resizable divider.
- `pr-changes-view` switches between Unified and Split diffs and collapses or expands all files.
- `pr-changes-copy-path` copies a file path with a brief checkmark, without collapsing the file.
- `pr-changes-spotlight` hides the left pane and its top bar to focus on the diff; Back to the split restores it.
- `pr-changes-close` slides the pane away and restores the PR details at full width.

## How to get to it (user POV)

- Open a PR detail, then choose **Changes** in the top bar.
- Choose the `+N −M` diff count pill beside the PR number.
- Phones and narrow widths open Changes full width automatically.
- Keyboard: none specified for this feature (unverified).

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running; the test PR has a diff with at least three files, including one renamed or added.
- Start from the PR detail at `/app/reviews/pr/<id>` with the PR side panel visible.

- **Open Changes.** Click `button "Changes"` in the top bar. Observable: a pane opens to the right; the PR details shrink; the Changes toggle shows an active state.
- **Read the tree.** Take a snapshot. Observable: a file count and `button "Hide file tree"`; a file list with the test file names.
- **Switch view.** Click `Unified` or `Split` in the diff controls. Observable: the diff layout changes and the chosen control is selected.
- **Copy a path.** Click the copy-path control on one file header. Observable: a checkmark appears briefly; the file stays expanded.
- **Spotlight.** Choose the spotlight control on the diff. Observable: the left pane and PR top bar disappear. Click `Back to the split`. Observable: the PR details return at the prior divider position.
- **Close.** Click `Changes` again. Observable: the pane slides off the right edge and the PR details return to full width.
- **Proof.** Record the diff totals beside the PR number (for example `+12 −3`) and the file count before and after.

## Gotchas

- The pane is read-only; there is no agent review note action.
- Changes is unavailable when the PR has no diff data; the count pill then stays passive.
- At 720px host width or less, Changes opens full width and the width toggle is hidden.
- Reopening during the exit animation keeps the same pane mounted; do not count that as a second open.
- Reduced-motion settings skip the slide animation, so assert on final state rather than mid-animation.
