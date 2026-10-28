# AI chat (standalone and document-scoped)

AI chat is the original question-and-answer conversation with Macro's assistant. A user types a prompt, the assistant streams a reply with inline tool rows, mention chips and rich results, and the chat gets an automatic title after the first exchange. A chat can open on its own page or in a split beside a document. Existing chats keep working after the newer agent sessions replaced most new-conversation entry points, and the chat can be shared like a document.

## Sub-features

- `chat-open` opens an existing standalone chat or a chat scoped to a document in a split.
- `chat-send` sends a typed prompt with mentions, optional model choice and attached context.
- `chat-stream` streams the reply, shows a stop control while it runs, and keeps the complete answer after reload.
- `chat-tools` shows tool activity as grouped rows, including results that expand.
- `chat-title` gives the chat an automatic title after the first exchange, keeping the route.
- `chat-share` shares a chat with people, channels, a link or the owner's team.

## How to get to it (user POV)

- Type in the bottom composer on Home, Files, Tasks, Customers or Email (placeholder `Ask AI, @mention anything`), then press Enter. The app creates a chat and opens it.
- Open a document, use the side panel's Actions section, and choose Ask Macro. This opens an agent session, not a legacy chat, with the document already mentioned.
- Open an existing chat from the Home or Agents list, or from a link to `/app/chat/<id>`.
- Use the Ask AI entry in desktop search (Tab) or the command menu. These open an agent session.
- Mobile: a floating Ask AI composer sits above the bottom dock on the AI view. Send creates the chat.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user with AI enabled.
- A test document exists for the document-scoped case.
- Use a throwaway prompt. Each send creates a real chat and spends AI usage.

- **Start from a list.** Navigate to Home. Take a snapshot and find the textbox named `Ask AI, @mention anything`. Observable: a contenteditable composer is focused or focusable.
- **Send a prompt.** Click the composer, then `type_text` a short question and press Enter. Observable: the URL changes to `/app/chat/<uuid>` and the prompt appears as a right-aligned bubble.
- **Wait for the reply.** Poll with `evaluate_script` until no button whose text matches `Stop generating` or `Stop` remains. Do not wait on answer text; the page also shows `Time to first token`.
- **Check the reply.** Take a snapshot. Observable: an assistant message exists, with `Copy assistant response` and `Edit assistant response in Notes` controls under it. Tool activity appears as `N steps`.
- **Check the title.** Observable: the page title or header changes from the placeholder to a generated title, and the URL stays the same.
- **Document-scoped chat.** Open the test document, open the side panel, click the `Actions` section, then `Ask Macro`. Observable: an agent session opens with a link chip for the document in the composer and no message sent yet.
- **Proof.** Save a snapshot at the completed reply and a screenshot of the chat header. Record the chat URL.

## Gotchas

- With the agents rollout on, the list composers and Ask Macro open agent sessions. Only existing chats and some flag-off paths stay on this legacy surface, so confirm the URL before proving a flow.
- Pressing Enter on a touch keyboard adds a newline. Send only submits from the button on touch devices.
- Attach files opens the device file chooser on phones and the browser picker on desktop; it does not open the Macro file browser.
- A refused send because the AI allowance is used up opens the usage-limit dialog. Retry only after the dialog is dismissed.
- Auto-titling can fail without failing the chat; the chat keeps its default title.
- Mentions in a streaming answer keep their names and icons while more text arrives; a flash back to loading placeholders is a bug.
