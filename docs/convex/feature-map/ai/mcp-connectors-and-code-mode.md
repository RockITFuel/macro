# Connections, MCP and code mode

Connections are the apps an agent can use: Macro's own tools plus third-party apps and custom MCP servers that the user authorizes. Code mode lets an agent write a short program that calls Macro's API in one run instead of many tool calls, with the results shown as one activity block. Macro also exposes its workspace to outside MCP clients (such as Claude Code) through a public endpoint with OAuth sign-in.

## Sub-features

- `conn-list` lists installed tools above the app catalog, with personal Gmail and GitHub account links in their own section.
- `conn-discover` searches apps by name and shows an app's tool list (later).
- `conn-authorize` opens an app's hosted authorization flow and returns to Macro (later for non-v1 apps).
- `conn-disable` disables or disconnects a connection without deleting its configuration.
- `code-run` runs an agent-written program with SDK calls, shown as Calling N tools.
- `code-review-mode` presents saved reviews produced by a program for the user to submit.
- `mcp-public` lets an outside MCP client sign in with OAuth and use the workspace tools.

## How to get to it (user POV)

- Sidebar Connections, or Settings → Integrations.
- Agent composer: the `+` menu offers Add connections (Discover) and Manage connections (Connected).
- Agent replies: a Connect app chip opens the Integrations page for that app.
- Mobile: Settings → Integrations.
- Outside clients: add Macro's MCP server URL in the client and complete the OAuth sign-in in the browser.
- Code mode is not a user-facing toggle; it appears as an activity block in agent sessions for accounts with the feature flag.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user.
- A test app that is not yet connected is available for the discovery case. Do not authorize a real personal account.

- **Open connections.** Navigate to Settings → Integrations. Take a snapshot. Observable: the Installed section lists connected tools above the catalog.
- **Disable a connection.** Open an installed connection's controls and choose the disable option (label unverified). Observable: it shows as disabled, not connected.
- **Discover.** In an agent composer, open the `+` menu and choose `Add connections`. Observable: the Discover view lists app results.
- **Code run.** In an agent session, ask for a lookup that code mode would handle. Expand the `Calling N tools` row. Observable: each SDK request is its own compact row with a status.
- **Proof.** Save snapshots of the Integrations page and of the expanded activity block.

## Gotchas

- Discovery and authorization of apps beyond Gmail, Outlook and GitHub are later integrations.
- An app name alone does not prove the requested action is supported; check the app's tool list.
- Cancelling authorization sends no continuation message and cannot resume the agent.
- Code-mode runs act as the user; a run that uses the session owner's account asks the owner to approve.
- Code-mode request activity is advisory; an unfinished request shows as interrupted, never as a success.
- Public MCP clients cache tool lists; a flag change appears only after the client reconnects.
- Program source and returned JSON are hidden in the transcript; do not expect them in the UI.
