# Connector imports

Connector imports bring work from other apps into Macro: Notion pages and databases into Drive, and Linear, Jira, GitHub, Asana and others into Tasks. An import card in each sidebar opens a dialog listing that category's apps. Connecting an app and choosing Import opens an agent chat that reads the source, shows a review, and creates items only after approval. Nothing is written to the source app.

## Sub-features

- `conn-import-card` shows the sidebar import card (Import files, Import tasks) with overlapping provider logos.
- `conn-import-dialog` lists a category's apps with connected and disconnected states.
- `conn-import-connect` connects an app through its connect flow (GitHub's MCP connection or the Pipedream connect UI).
- `conn-import-handoff` opens an agent chat beside the view with the prompt "Import my <Provider> workspace into Macro."
- `conn-import-review` shows the plan with totals, Team / Only you badges, and a skipped/already-in-Macro section.
- `conn-import-approve` approves the review from the card or by answering yes in chat.
- `conn-import-dismiss` hides the card permanently.

## How to get to it (user POV)

- Drive sidebar: the **Import files** card; its button opens the dialog for Notion, Google Drive, Dropbox, OneDrive, Box and Confluence.
- Tasks sidebar: the **Import tasks** card; its dialog lists Linear, Jira, Asana, GitHub, Trello and monday.com.
- Customers sidebar (team members only): **Import customers**; lists HubSpot, Salesforce, Close and Airtable.
- Mobile: the same cards in the sidebar and dialog; **Open full review** uses a full-height sheet.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in; the test user has no connector connected, or a named connector state for the scenario.
- A test Notion or Linear workspace with a handful of items; do not use a customer workspace on hosted dev.
- Start from `/app/component/documents` for the Drive card.

- **Open the card.** Navigate to `/app/component/documents`. Take a snapshot. Observable: a card with the text `Import files` and a button `Import files`.
- **Open the dialog.** Click `button "Import files"`. Observable: a dialog lists the file sources with `Connect` buttons for disconnected rows.
- **Connect.** Click `button "Connect Notion"`. Complete the connector's authorization in the new tab, then return. Observable: the row shows a check and an `Import` button named `Import from Notion`.
- **Start import.** Click `button "Import from Notion"`. Observable: the dialog closes; an agent chat opens in a split beside Drive with the import prompt.
- **Review.** Wait for the review card. Observable: totals (Documents, Databases, Skipped, Already in Macro) and a `Team` or `Only you` badge on each row.
- **Approve.** Click the approve control on the card (`Import …`). Observable: the run state reads `Started by the agent at your request` or similar.
- **Proof.** Record the review totals and the imported items after the run completes; confirm the source workspace was not modified.

## Gotchas

- No importer writes to its source app; if the source changes, that is a bug.
- Stop affects only the selected source; completed copies stay in Macro.
- Without a team, imports stay personal and the card says nothing is shared.
- Databases cannot be shared with the team yet; the review says they stay with you.
- Approval from chat only happens when the owner answers yes; a message from anyone else does not approve.
- GitHub here means importing tasks from GitHub issues; it is separate from the GitHub pull request feature.
