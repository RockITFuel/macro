# File sharing

File sharing controls who can open a Drive file or folder. The owner sets team access (None, View, Comment, Edit), link sharing, or channel access from a Share dialog. Folders share with team access only when the owner is on a team. Sharing only covers files and folders; document sharing in the editor is a separate feature.

## Sub-features

- `share-team-access` sets team access (None, View, Comment, Edit) for a file or folder owned by a team member.
- `share-link` shows link sharing options on files that have them; folders show no Link card or Link tab for team owners.
- `share-channel` shares a file with a channel where channel access is offered (unverified for Drive files).
- `share-native-sheet` shares a file through the phone's native share sheet (mobile).
- `share-shared-filter` keeps the Shared tab limited to files other people own, with creator filtering.

## How to get to it (user POV)

- Right-click or open the menu on a folder row and choose Share (unverified label).
- Open a file's detail or header and choose Share.
- Mobile: the file's share action opens the native share sheet on a phone.
- Shared with me tab lists what others have shared with you.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as the owner of a test folder; the owner is on a team.
- A second test user exists on the same team to verify access.
- The test folder is in My Files with no team access set at the start.

- **Open the share dialog.** Navigate to `/app/component/documents`, select the test folder row, and open its menu. Choose `Share`. Observable: a dialog opens titled with the folder name.
- **Set team access.** In the team access control, choose `View`. Observable: the control shows `View`; no Link card appears for the folder.
- **Verify as the second user.** Sign in as the second user and open Shared with me. Observable: the test folder appears with a read-only indicator (scenario-specific label).
- **Remove access.** As the owner, choose `None` in team access. Observable: the folder disappears from the second user's Shared with me after refresh.
- **Shared filter check.** As the owner, open Shared and select Created by → Me. Observable: no files are returned, as expected.
- **Proof.** Record the team access control's value before and after each change and the second user's Shared list.

## Gotchas

- Shared always excludes files you own; a filter that selects only yourself returns an empty list.
- Folder sharing uses team access, not link sharing, for team owners.
- A failed or denied share change does not retry or report success; check the control's value after reload.
- Access changes are visible to the other user only after their list refreshes.
- Document sharing in the editor is owned by the documents feature; do not verify it here.
