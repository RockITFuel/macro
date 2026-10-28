# Agent session

An agent session is a durable conversation with an agent that can read and change Macro items, run tools and work in the background. The user sends prompts, watches the transcript stream with tool rows and thoughts, can queue follow-ups or interrupt the turn, and can share the session. Sessions also start from channel mentions, and their replies post back into the thread. Coding sessions add a repository, a branch, a Changes pane and a linked pull request.

## Sub-features

- `session-create` starts a session from the Agents composer, Home, the command menu or a channel `@Macro` mention.
- `session-send` sends a prompt with mentions, skills, files attached, dictation and an optional model or effort override.
- `session-stream` streams the transcript live, with tool groups, thoughts, and results that expand.
- `session-queue` queues prompts while a turn runs, with send-next, steer, flush and edit or remove for each queued prompt.
- `session-stop` stops the current turn.
- `session-model` chooses the model and reasoning effort for the next send or the open session.
- `session-share` shares a session with people, channels, a link or the team, with View, Comment or Edit access.
- `session-references` lists where a session was mentioned and opens each reference.
- `session-transcript` navigates long transcripts, jumps to latest and quotes selected text.
- `session-changes` (coding sessions) shows the linked pull request diff in a pane, with notes sent back to the agent.
- `session-preview` (coding sessions) shares a live development server preview from the session.

## How to get to it (user POV)

- Agents composer: Create, then Agent; or press `c` then `a`. Placeholder `Message the agent, @mention anything`.
- Home composer: type a prompt on Home; the session opens in Home's detail pane.
- Command menu or desktop search: Ask AI or Ask Macro on a document, task, email, channel, call or project, which opens the bare session in a new split with the item mentioned.
- Channels: mention `@Macro` (or `@cursor`) in a channel message; the session opens at `/app/agent/<id>` and replies stream back into the thread.
- Session header: title menu caret (Rename, Copy link, Favorite, Delete), Share, Side panel toggle (`]`).
- Mobile: the Agents composer floats above the dock; tap a conversation row for a full-screen session.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user with the agents flag on.
- Use a throwaway prompt; each send is a real turn that uses AI usage.
- Start from `/app/agents` with the composer empty.

- **Start a session.** Press `c` then `a` outside any editable field. Observable: the composer textbox `Message the agent, @mention anything` is focused.
- **Send a prompt.** Click the composer, then `type_text` a short prompt and press Enter. Observable: URL changes to `/app/agents/<id>`; the prompt appears in the transcript with a `Context` chip.
- **Watch the stream.** Poll with `evaluate_script` until no button named `Stop generating` (or `Stop`) remains. Observable: a Working state shows on the row in the conversation list while the turn runs.
- **Queue a follow-up.** Send a second prompt while the first is still running. Observable: a row labeled `Queued` appears above the composer. `Send next` interrupts and sends the oldest queued prompt.
- **Stop.** With an empty composer while busy, click `Stop`. Observable: the turn ends and the row's Working state clears.
- **Choose model.** Open the model control beside the composer, type `Search models`, pick a model. Observable: the control label shows the chosen model name; effort control appears when the model has more than one level.
- **Share.** Click `Share` in the header. Observable: the Share dialog lists People with access and Link sharing options (None, Public, Team).
- **Expand a tool group.** Click a `N steps` or `Called N tools` button. Observable: rows appear; a single result expands with its caret.
- **Proof.** Save a snapshot of the completed transcript and a screenshot of the header; record the session URL and the queued prompt's final state.

## Gotchas

- Completion signal is the disappearance of the `Stop generating` button. Do not wait on answer text; the page shows `Time to first token`.
- The first prompt in a new session must not change the model mid-stream; a model selected before the first prompt is part of creation.
- A pending permission or question blocks the composer until answered; see the approvals feature.
- Archived sessions are read-only and show an Unarchive action in place of the composer.
- Coding sessions need a connected GitHub account for repository access; without it the session fails with Unable to start this agent.
- Pull request review in the Changes pane is GitHub-backed; with no linked PR the pane explains that one is required.
- Focusing a composer prepares the transcript renderer; focus alone must not send a prompt.
- `/ask` shortcuts exist only on local and dev builds; in production the text is a normal prompt.
- Live development previews stop after the agent's HTTP server disconnects; the banner asks the agent to share again.
- The coding-runtime rows (Cursor, Codex, paired runtimes) are a later integration; the Macro in-app agent is the v1 path.
