# Agents and developer settings

Agents are configurable assistants for a team or a person. Each has a name, instructions, a runtime (Macro's built-in runtime, Cursor, Codex, or a paired local runtime), a model, connected apps, channels, and sharing. Developer settings hold the runtime pairing and connection pages, the MCP server instructions for external AI clients, API keys, and bots (accounts for programs that use a token). These pages are gated by flags and are later in the port, except where another feature depends on them.

## Sub-features

- `agents-list-form` lists team and private agents, and creates, edits, and deletes them.
- `agents-runtime-model` chooses the runtime, the model, and whether a channel mention opens a coding or chat agent.
- `agents-connections` chooses `Use my connected apps` or `Specific apps`, and shows connect status per viewer.
- `runtimes` lists built-in, Cursor, Codex, and paired runtimes. It includes `Bring your own agent` and the `New runtime` pairing flow.
- `cursor-connect` stores a Cursor API key and the default model.
- `codex-connect` connects ChatGPT with a device code and saves a cloud environment.
- `mcp-server-page` shows how to connect Macro's MCP server to an external AI client.
- `api-keys` creates and copies API keys. Desktop only.
- `bots` creates bot accounts, their channels, and tokens. The bot token is shown once.
- `routines-list` shows routines on touch devices, where the Agents sidebar is hidden.

## How to get to it (user POV)

- Settings → Blocks → Agents (`/app/settings/agents`), and Routines (`/app/settings/routines`) on touch devices.
- Settings → Developer → Runtimes (`/app/settings/runtimes`), MCP server (`/app/settings/mcp-server`), API Keys (`/app/settings/api-keys`), Bots (`/app/settings/bots`).
- The Agents workspace opens the same Integrations page as Settings → Connections.
- Channel `@` mention menus list agents, and the agent's picture appears there.
- Settings search: `agent`, `cursor`, `bot`.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running with the `enable-chat-v3-agents` flag on. The `bot-management` flag must also be on for the Bots tab. (Unverified: how the local stack sets these flags.)
- A signed-in account on desktop viewport.

- **Open agents.** Navigate to `/app/settings/agents`, then click button `New agent`. Observable: a full-page form with the sections `Profile`, `Behavior`, `Runtime`, `Connections`, `Channels`, and `Share`.
- **Write instructions.** In the `Instructions` editor (a rich-text textbox, not a plain textarea), click to focus, then type. Select text to open the formatting menu. Enter adds a paragraph.
- **Set connections.** In `Connections`, choose the radio `Specific apps`. Observable: textbox `Search connectors` appears. Pick an app to add a row with a connected or not-connected dot.
- **Save agent.** Click button `Create agent` (or `Save changes` when editing). Observable: the agent appears in the list.
- **Delete agent.** Edit an agent you created, click button `Delete agent`, and confirm. Cancel keeps the form open.
- **Create a bot.** Navigate to `/app/settings/bots`, click `Create bot`. Observable: `Profile` and `Channels` are visible. Expand `Advanced`, which starts collapsed, to see `Show in model selector` and `Mentionable`. Save, then copy `Bot token` before leaving the page.
- **Connect Codex.** Navigate to `/app/settings/runtimes`, click `Connect with ChatGPT` under Codex. Observable: a device code appears with `Continue to ChatGPT` and `Cancel sign-in`. Stop before the ChatGPT page.
- **Create an API key.** Navigate to `/app/settings/api-keys` on desktop. Observable: a one-time secret is shown and copyable. (Unverified: the exact create-button label.)

## Gotchas

- `API Keys` is hidden on phones. Its one-time secret cannot be shown on mobile.
- Delete agent is available to the creator, the team owner, and team admins. Other members can edit but cannot delete.
- The model list loads separately for each runtime. A saved model that the runtime no longer offers stays selected and is labeled `saved, unavailable`.
- If the runtime rejects the saved model, the prompt fails. The app does not silently switch models.
- The default for `Answering a mention` is chat for Macro's built-in runtime and coding for every other runtime. The saved choice is what counts.
- Cursor is not in the Connections catalog. It appears only in Runtimes.
- Enabled custom MCP servers reach an agent's session through the owner's connections. The sandbox never sees the server's address or token.
- A bot token is shown once. Losing it means rotating it.
- Routines appear in Settings only on touch devices. On desktop they appear in the Agents sidebar.
- The `This computer` runtime card appears only in the desktop app. The web app never shows it.
