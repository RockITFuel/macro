# Agent roster, personas and direct messages

The Agents roster lists the agents a user can talk to: Macro's built-in agent, team agents, private agents, and personas. Users create and edit agents (name, instructions, where the agent runs, who can use it, its model, connections, channels and permission policy), can start a private direct message with a persona they own, and can save their own API key for an Anthropic or OpenAI model. Connecting Cursor or pairing a local runtime is available but later.

## Sub-features

- `roster-list` lists Built-in, Your agents and Needs connection groups, each with its runtime and model.
- `roster-create` creates an agent through a full page with Profile, Instructions, Where it runs and Who can use it.
- `roster-edit` edits or deletes an agent; the Advanced section holds mention style, permissions, connections and channels.
- `roster-visibility` sets an agent to Private or Team.
- `persona-dm` opens a private direct message with a persona the user owns.
- `roster-api-key` saves, replaces or removes an agent's own Anthropic or OpenAI API key.
- `roster-runtimes` (later) connects Cursor and pairs a local runtime.

## How to get to it (user POV)

- Settings → Agents shows the same roster as the Agents page.
- Agents sidebar: Agents, or the composer's Create agent action at the bottom right of the list.
- Composer model picker: Create agent opens the roster on the selected kind's tab.
- Persona: the persona's Message action opens its direct message.
- Mobile: the agent picker bottom sheet has Create agent; Settings → Agents for management.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user with the agents flag on.
- Use a throwaway agent name; delete it at the end.

- **Open roster.** Navigate to `/app/agents`, then click `Agents` in the sidebar. Take a snapshot. Observable: list headings `Built-in`, `Your agents` and, when present, `Needs connection`.
- **Create.** Click `Create agent` at the bottom right. Observable: a full page titled with the agent kind opens, with Profile and Instructions fields.
- **Fill profile.** Click the name textbox, `type_text` the name, then click the page's save control (label unverified). Observable: the agent appears under Your agents with a TEAM or PRIVATE pill.
- **Visibility.** Open the agent's edit page, choose the Who can use it option (Private or Team), save. Observable: the pill updates.
- **API key.** Under the model, open the Anthropic or OpenAI API key field. Observable: a saved key shows only as a masked value; Remove clears it.
- **Persona DM.** Open a persona the test user owns and click its message action. Observable: a direct conversation with the persona opens; a persona not owned shows no message action.
- **Delete.** Return to the list, open the agent's row menu, choose Delete, confirm. Observable: the row disappears.
- **Proof.** Save a snapshot of the roster before and after, and a screenshot of the editor page.

## Gotchas

- Editing and deleting need ownership or team admin rights; the actions are missing otherwise.
- A saved API key is never displayed again. Removing it does not revoke it at the provider.
- A key stops applying when the agent moves to a different provider's model; the editor says so.
- API keys are a paid-plan feature; on the free plan the field is disabled.
- A persona's private conversation cannot add other recipients, and sharing a channel with a persona does not share its DM.
- Cursor and paired runtimes show Connect or Set up actions; they are a later integration, so do not treat their absence as a v1 bug.
- Agent warm-up is best-effort; a warm-up failure must not block creating the agent.
