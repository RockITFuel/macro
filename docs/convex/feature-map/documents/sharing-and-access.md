# Sharing and access

Every document has a Share dialog that lists who can open it and at what level. The owner can share with people, teams or a link, and can add a team grant or a meeting link. A person without access to a private file sees a request screen and can ask for View, Comment or Edit. Owners and reviewers approve or deny requests from the same dialog.

## Sub-features

- `share-people` lists People with access and changes or removes a direct grant.
- `share-link` copies a share link and sets Public or restricted link access.
- `share-team` sets team access (None, View, Comment or Edit) on a document or folder.
- `share-meeting-links` lists calendar meeting links on a markdown document's Share panel, with a toggle for team access.
- `share-request` lets a person without access request View, Comment or Edit.
- `share-review` lets an owner or reviewer see pending requests, then grant or deny them.
- `share-public-view` opens a Public View link in a signed-out browser.
- `share-live-revoke` reloads or closes an open document when its access changes.
- `share-status` shows the share label: Only people with access, Anyone with the link, Team members with the link, or Restricted.

## How to get to it (user POV)

- Document header: Share, next to Copy Share Link and Side Panel.
- Folder row or folder page: Share, with Team access.
- Phone: Share is in the header; review requests are in the People tab; the Link tab holds link sharing.
- Notifications: opening a permission-request notification opens the item and its Share dialog.
- Opening a private file you lack access to shows the request screen with Request access.
- Calendar notes: Options → Share opens the same dialog.

## Driving it with chrome-devtools MCP

Preconditions:

- Two accounts are available: an owner and a second signed-in person without access to a disposable document.
- A signed-out browser context is available for the Public View check.

- **Open Share.** Click the header button named `Share`. Result: the dialog shows the heading `People with access` and the share status.
- **Copy link.** Click the button named `Copy Share Link`. Result: the link is copied; no grant changes.
- **Request access.** As the second person, open the private document. Result: the request screen shows the signed-in email and a `Request access` button.
- **Choose level.** Pick View, Comment or Edit where offered, then click `Request access`. Result: `Request sent` appears with a `Cancel request` button.
- **Review.** As the owner, open the document. Result: the Share button shows a pending count; the dialog lists the request under `Permission requests`.
- **Grant.** Choose a level and click `Grant access`. Result: the requester appears in People with access, and the requester's open document reloads with the new level.
- **Deny.** Click `Deny` on a request. Result: the request is marked denied and the requester is not notified.
- **Public view.** In a signed-out context, open the document's public link. Result: the document shows without folder lists, and a sign-in banner may appear.
- **Proof.** `take_snapshot` of the Share dialog before and after each action.

## Gotchas

- A requester can send or change a request once per minute. After a denial they wait 24 hours before a new request.
- PDFs offer Comment as an upgrade; view-only email sharing has no upgrade.
- Removing the last grant closes the open document and returns the viewer to the request screen.
- Copying a restricted link does not grant access.
- If meeting access cannot be checked, the status reads Restricted instead of Just me.
- Signed-out Drive list URLs show a sign-in prompt, not an endless loader.
- Turning off the meeting-notes flag hides meeting links but does not revoke saved grants.
- Meeting access and team sharing of calendar notes are covered by the calendar domain; this file names only the Share entry points.
