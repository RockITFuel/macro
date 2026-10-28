# Agent direct messages

Agent direct messages let a user hold a private conversation with an AI agent persona inside Chat. The user writes normally, without a mention; the agent's reply arrives as ordinary messages while it works, with a live typing row and its steps shown inside each message. The owner can answer the agent's questions, approve its requests, stop a running turn, and retry a failed one. The conversation stays in the Chat list even when its underlying agent session is hidden from the standalone Agents list.

## Sub-features

- `adm-start` starts a conversation with an agent persona from the Create menu or from the persona's profile.
- `adm-send` sends prompts without a mention; follow-up prompts queue in order while the agent works.
- `adm-live` shows the typing row ("is thinking", "is working", "is waiting for an answer") and the streamed passage.
- `adm-steps` shows the steps taken between passages (for example "Ran", "Read", "Edited") in a message, collapsed to the latest six.
- `adm-question` answers an agent question or approval request inline.
- `adm-stop-retry` stops the running turn, or retries a failed, stopped, or interrupted message.
- `adm-access` keeps the transcript readable and explains when the persona is unavailable.

## How to get to it (user POV)

- Sidebar `Create`, then `Message`, then choose an agent in the picker; the picker lists the user's agents, eligible team agents, and Macro.
- Open an agent's settings or bot profile and click its `Message` action.
- Find an existing agent conversation in the Chat list (`/app/channels/<uuid>`) or by searching the Chat list for the persona name, including older conversations beyond the first page.
- Search results for agent messages open the conversation at the matching passage.
- Reopening the same persona returns to the existing conversation rather than creating a new one.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page), with agent DM discovery enabled. It is on in development builds and off in production unless `VITE_ENABLE_AGENT_DMS` overrides it.
- At least one agent persona is available to the signed-in user.
- No conversation with that persona exists yet, or note the existing one before starting.

- **Start.** `take_snapshot`, `click` the button `Create`, then `click` the menu item `Message`. In the picker, select the persona's row. The conversation opens at `/app/channels/<uuid>` with an empty composer.
- **Send.** `click` the composer (contenteditable), `type_text` "List three open questions" with `submitKey: "Enter"`. Your message appears in the timeline.
- **Watch the live turn.** Wait for the typing row text ("is thinking", "is working") under the newest message. The streamed passage appears as it is written; steps tick from running to done inside the message.
- **Queue a follow-up.** While the turn runs, send a second prompt. The bar above the composer reads "1 queued". It runs after the first turn ends.
- **Stop.** While a turn is running, `click` the button `Stop`. The turn ends; the typing row clears. A failure toast appears if the stop fails.
- **Retry.** On a failed or stopped source message, `click` `Retry message`. Retry only the one message the user chose.
- **Answer.** When the agent asks a question, the question appears inline with its answer controls; choose an option or type the answer and send. The turn resumes.
- **Proof.** `take_snapshot` of the conversation, then `take_screenshot`. Proof shows the user prompt, the agent reply, and the step rows inside the reply.

## Gotchas

- Agent DMs are hidden from the standalone Agents and Home session lists once the backend hiding switch is on. Verify them in Chat, not in Agents.
- Opening the owner view versus a shared reader differs: readers without session access see the stored step snapshot without commands or tool input.
- A reply inside a thread is not part of the conversation. The agent answers a thread reply only when it is mentioned in that thread.
- Editing a sent prompt does not invoke the agent again. Only a new prompt or a Retry runs a turn.
- Reloading during a turn returns the typing row and live steps without a duplicate reply.
- The persona's settings, model, and permission choice are fixed when a conversation starts; edits to the persona do not reach an existing conversation.
- If access to the persona is revoked, the transcript stays readable but new prompts, retries, and approvals fail with an unavailable notice.
- Agent answers are streamed and steps are animated; use `take_snapshot` after the typing row clears, not during.
