# Slack import

Slack import brings a Slack workspace's history into Macro as channels. A team admin or owner, with the feature enabled, uploads a Slack export ZIP, picks conversations, chooses whether to include history, and confirms the import. Progress and results are kept in job history after reload. Only the selected channels are imported.

## Sub-features

- `slack-admin-entry` shows **Import from Slack** in Team Connections for admins and owners when the feature is on.
- `slack-zip-select` selects a Slack export ZIP; selecting a file alone makes no server writes.
- `slack-conversation-picker` filters, groups and selects conversations, with archived conversations optionally shown.
- `slack-confirm` confirms the workspace binding, email attribution and history option, then starts the import.
- `slack-progress` shows counters, errors and skip reasons while the job runs.
- `slack-job-history` lists earlier jobs with their selected channels and results, including after reload.
- `slack-cancel` cancels and keeps partial results.
- `slack-channel-card` shows the chat sidebar card that starts the same import (or connects Slack first).

## How to get to it (user POV)

- Settings, then Team, then Connections: **Import from Slack** (admins and owners only).
- Chat sidebar: the **Create or import channels** card's **Import Slack** button.
- Connect a Slack connector first when the workspace has one connected; otherwise the archive upload opens directly.
- Mobile: same Settings path.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a team admin on a team where the Slack archive import feature is enabled.
- A synthetic Slack export ZIP exists locally with two or three channels; do not use a real customer export on hosted dev.
- Start from Settings, Team, Connections.

- **Open the import.** Navigate to Settings and open the Team section, then Connections. Take a snapshot. Observable: a button `Import from Slack`.
- **Pick the ZIP.** Click `button "Import from Slack"`, then use the file input labeled for the export ZIP and upload the synthetic file (`upload_file`). Observable: the conversation picker lists the channels with stable Slack IDs.
- **Select.** Filter the picker, then check two channels with the checkboxes. Observable: the counter reads `Import selected channels (2)`.
- **Confirm.** Review the attribution text, keep history on or off, then click `button "Import selected channels (2)"`. Observable: the dialog shows the job starting; progress counters appear.
- **Reload.** Reload the page and return to Connections. Observable: `Job history` lists the job with the selected channel names.
- **Cancel path.** Start a second import, then press Escape before confirming. Observable: the dialog closes and no job appears in job history.
- **Proof.** Record counters and job-history names after completion; check the imported channels appear in the chat list.

## Gotchas

- The feature is flag-gated and rolled out in stages; production stays off until enabled.
- Closing before confirmation discards the archive and selection; reopening needs the file again.
- Reloading recovers server progress but not an interrupted local upload; use Recover job receipt or finalize with skips.
- Unselected channels are not skipped work; only selected channels count.
- Slack file and canvas discussion folders are ignored and do not block channel discovery.
- Use a synthetic export; the runbook separates fixture tests from live-backend release gates.
