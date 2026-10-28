# Agent questions, permission prompts and approvals

While an agent works, it can pause to ask the user a question, to request permission for a tool, or to ask the session owner to approve a call made with the owner's account. It can also offer to connect an app that it needs. The user answers in the transcript, and the turn resumes, is declined, or is cancelled. Everyone with edit access may answer; viewers see the waiting state.

## Sub-features

- `ask-form` answers a question with a choice, free text, multi-select, or a link to open.
- `ask-permission` approves or denies a tool permission request, once or always for the session.
- `ask-owner-approval` lets the session owner approve, always allow or decline a tool call made on the owner's account.
- `ask-connect-app` finds an app the agent needs, opens its authorization flow and resumes the session afterward.
- `ask-notify` notifies the owner and participants that a session is waiting for input.

## How to get to it (user POV)

- A card titled `<agent> is asking` appears in the transcript; the composer shows `The agent is waiting for your answer above`.
- An `Approval needed` card appears above the composer when a permission or owner approval is pending.
- A `Connect <app>` action appears in the transcript when the agent needs an unconnected app; it opens Settings → Integrations.
- Notifications: `agent_session_waiting_for_input` opens the session from the inbox, browser or iOS push.
- Mobile: the same cards in the session transcript; the bottom composer stays visible above the keyboard.

## Driving it with chrome-devtools MCP

Preconditions:

- A test session exists in which the agent is waiting. Reaching this state needs a prompt that triggers a question, such as asking the agent to ask you to choose between two options. Confirm the state before proving.
- A second test user with viewer access is needed for the waiting-for-editor case.

- **Find the question.** Open the session URL. Take a snapshot. Observable: a card titled with the agent name followed by `is asking` and the notice `The agent is waiting for your answer above`.
- **Answer a choice.** Click the radio option named for your choice, then click `Submit`. Observable: the card collapses to `Question · <text>` with `Answered` on the right and the agent continues.
- **Decline.** Click `Decline` instead. Observable: the card shows `Declined`.
- **Permission request.** Find the `Approval needed` card above the composer. Click the option the card offers for allowing once (button name unverified; the card lists its choices with the agent's rule text). Observable: the card disappears; a compact outcome such as `Allowed once` or `Denied` appears in the transcript.
- **Owner approval.** As the owner, click `Approve` in the `Approval needed` card. Observable: the held tool row resumes. As another participant, the card reads `Waiting for <owner> to approve`.
- **Viewer state.** Sign in as a viewer. Observable: the form is locked with `Waiting for an editor`.
- **Proof.** Save a snapshot of the card before and after the answer, and record the outcome label shown on the card.

## Gotchas

- Messages typed while a question is open queue behind it. The composer Stop control cancels the question and the turn together.
- Permission prompts can be bypassed only when both harness consent and the agent's explicit choice allow it; a bypass setting is off by default.
- A declined, cancelled, expired or superseded call never runs; the Magic Chip shows `Waiting for approval` while held.
- Clicking a link request's Open button opens a new tab only after the click; the URL alone does not open anything.
- Connect-app continuation sends a visible follow-up message only after the backend verifies the connection; a cancelled or failed authorization sends nothing.
- Owner approval does not change which account a call selects; Always allow is scoped to the session.
- Connector discovery and third-party app authorization are a later integration; questions and permission prompts are v1.
