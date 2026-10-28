# Pull request merge

Pull request merge lets the signed-in user merge an open, ready pull request from Macro. A confirmation names the repository, PR number and title, then GitHub decides whether the merge is allowed. A refused merge shows GitHub's reason in a toast, and a successful merge refreshes the PR status in place.

## Sub-features

- `pr-merge-button` shows **Merge** in the top bar beside **Changes** only for a ready PR.
- `pr-merge-confirm` asks for confirmation with the repository, PR number and title.
- `pr-merge-done` merges on GitHub as the signed-in user and refreshes the PR status.
- `pr-merge-refused` shows GitHub's reason in a toast when GitHub refuses (permissions, branch protection).
- `pr-merge-unlinked` points to Settings when the user has no GitHub link.

## How to get to it (user POV)

- PR detail top bar: **Merge**, beside **Changes**.
- Reviews row menu, if present (unverified).
- Mobile: the same top bar control on the PR detail.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running with a linked GitHub account that has merge rights on a test repository.
- A test PR is open, not a draft, with all checks passed (success, skipped or neutral). Set this up in the test repository before the run.
- A second test PR that is a draft, to confirm the button is absent.

- **Show the button.** Navigate to `/app/reviews/pr/<id>` for the ready test PR. Take a snapshot. Observable: `button "Merge"` in the top bar beside `Changes`.
- **Open confirmation.** Click `button "Merge"`. Observable: a dialog names the repository, the PR number and the PR title.
- **Confirm merge.** Click the confirm button in the dialog. Observable: the dialog closes; the PR status changes to merged; the Merge button disappears.
- **Refused merge.** On a PR blocked by branch protection, repeat the steps. Observable: a toast shows GitHub's reason; the PR stays open and Merge stays visible.
- **Absent on draft.** Navigate to the draft PR. Observable: no `Merge` button in the top bar.
- **Proof.** Record the dialog text, the toast text on refusal, and the PR status before and after; then reload and confirm the merged state persists.

## Gotchas

- Macro does not decide merge rights; GitHub's permissions and branch protections do, and their reason is shown verbatim.
- Draft PRs, PRs with no checks, and PRs whose checks are running or failing have no Merge button.
- Merged and closed PRs have no Merge button.
- Without a linked GitHub account the toast points to Settings; link the account first (see GitHub account link).
- A successful merge is verified by reloading, not by the toast alone.
