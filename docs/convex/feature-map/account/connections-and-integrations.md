# Connections and integrations

Connections link the accounts Macro reads from and the tools agents may use. Users connect Gmail and Outlook inboxes (with calendar and mail permissions), link a GitHub account for pull requests, and manage each inbox's email signature. Settings → Integrations also lists third-party tools from a catalog, plus custom MCP servers. Admins of a team can import Slack history and install the GitHub App. Gmail, Outlook, and GitHub belong to the first port. Other connectors come later.

## Sub-features

- `email-accounts` lists owned inboxes and adds or removes them.
- `email-signatures` edits each inbox's signature in Preview, HTML, or Rich text, saves or clears it, and sets whether replies and forwards include it.
- `gmail-link` connects a Gmail account, a second one, or reconnects with calendar permissions.
- `outlook-link` connects an Outlook account.
- `github-link` links a GitHub account for pull requests, reconnects it, and disconnects it. `Configure GitHub repositories` opens the GitHub App install.
- `integrations-catalog` lists `Installed`, `Featured`, and `All apps`, with search, categories, and `Connect`, `Enable`, `Disable`, `Reconnect`, and `Disconnect`.
- `custom-mcp` adds a custom MCP server by name and URL, connects it by OAuth, renames it, or removes it.
- `team-slack-import` imports channels and history from a Slack export ZIP (team admins, behind a flag).

## How to get to it (user POV)

- Settings → Email (`/app/settings/email`), with `Add inbox` and `Remove inbox`.
- Settings → Integrations (`/app/settings/connections`). The Email card's gear opens Email settings.
- Settings → Team → Connections (`/app/settings/team-connections`), for admins.
- Agents page: the same Connections section.
- Sidebar setup cards: `Connect GitHub`, `Connect tools`, `Connect a calendar`.
- Onboarding's work, personal, and tools steps.
- Desktop: connecting an inbox opens the provider's consent in the system browser, and the app stays open.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running and a signed-in account is available.
- Provider consent (Google, Microsoft, GitHub) is an external page. The local stack cannot complete it end to end. (Unverified: check whether the local stack supplies simulated providers.) Stop at the consent page.

- **Open Email settings.** Navigate to `/app/settings/email`. Observable: each owned inbox shows a `Preview` view with `HTML` and `Rich text` view controls.
- **Edit signature in HTML.** Click the `HTML` view control, then click into the HTML editor and type. Click button `Save signature`. Observable: the preview shows the saved HTML with tables and spacing intact after reopening settings.
- **Clear signature.** Click button `Clear signature`. Reopen `Rich text`. Observable: the editor is empty and new composers have no signature.
- **Reply and forward toggle.** Toggle `Add to replies & forwards`. Observable: the setting saves immediately without a save button.
- **Import Gmail signature (desktop).** In an inbox's header, click button `Import from Gmail`. Observable: a toast reports whether Gmail had a signature, and the imported one replaces any unsaved draft.
- **Browse integrations.** Navigate to `/app/settings/connections`. Observable: headings `Installed`, `Featured`, and `All apps`, with search field `Search apps` and a category picker.
- **Connect a catalog app.** Click button `Connect` on a catalog card. Observable: a Pipedream connect view opens in the dialog. Stop at the provider consent.
- **Add a custom MCP server.** Click button `Add Custom` beside `All apps`, enter a name and a URL, and submit. Observable: the row shows `Connect`. Stop before OAuth.
- **Reconnect GitHub.** Click button `Reconnect GitHub` (or `Connect GitHub` if not linked). Observable: the OAuth page opens. After return, the state reads `Account linked`, distinct from tool readiness. `Configure GitHub repositories` opens GitHub App installation in a new tab.
- **Team Slack import.** As an admin with the flag on, open `/app/settings/team-connections`, click `Import from Slack`, and choose an export ZIP. Observable: a grouped conversation picker. Select channels and click `Import selected channels (N)`. No server writes occur before that click.

## Gotchas

- Opening provider consent does not mark an account connected. Returning from consent shows the new account. Canceling leaves the app usable.
- Native Gmail and Calendar consent does not request Drive or Sheets scopes. Those tools appear separately in the catalog.
- Gmail and Google Calendar are hidden from the catalog because their native connections replace them.
- A GitHub account link does not grant repository access. Repository access comes from the GitHub App installation.
- Reconnecting GitHub keeps the existing link. Selecting a different GitHub account fails; the user must disconnect first.
- A connection-status failure offers an explicit retry. It must not start a duplicate OAuth flow, and independent providers stay connectable.
- Replacing an inbox's signature is not atomic with its draft. Clearing a signature removes the saved and draft versions but keeps the inbox connected.
- Converting custom HTML to Rich text asks first. A canceled conversion leaves the saved HTML unchanged.
- Closing the Slack import dialog before confirmation discards the archive and selection. Reloading recovers job tracking but not an interrupted local upload.
- Custom MCP servers that are disabled are not offered to agents. An expired connection tells the agent to have the owner reconnect under `Custom MCP`.
- Agents with a fixed app selection do not receive the owner's custom servers.
