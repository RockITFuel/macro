# Agent reviews

When an agent drafts several emails, calendar events or an import, it presents them as a review stack before anything is sent or created. The user inspects each item, edits it, dismisses it or confirms the batch. Nothing is sent or created until the user confirms, and a stale review offers a reload. Code-mode runs can also present a saved review that the user submits later.

## Sub-features

- `review-stack` shows the drafts as a stack with Next and Previous; only the active draft is editable.
- `review-edit` edits an email draft's recipients, subject, body and attachments, or an event draft's fields.
- `review-confirm` sends or creates only the selected batch after confirmation.
- `review-cancel` leaves all drafts unchanged.
- `review-import` shows an import plan of imported and skipped items and its outcome.
- `review-reload` reloads a saved review after a revision conflict or uncertain request.

## How to get to it (user POV)

- In an agent session, the agent presents drafts and a review card appears above the composer with Review changes, Pull request, or Dismiss in coding sessions.
- The review card appears in the transcript the moment the agent presents it, before the program finishes.
- Email drafts appear as cards in the transcript with the same surface as email blocks.
- Import plans appear from the agent's import tool with their summary.
- Mobile: the same stack in the session transcript, with the composer docked above.

## Driving it with chrome-devtools MCP

Preconditions:

- A test session in which the agent has drafted at least two emails without sending. Use a throwaway test mailbox; sends are real.
- The test account has a connected email provider (Gmail or Outlook).

- **Find the stack.** Open the session and take a snapshot. Observable: a review region shows the first draft with Next and Previous controls and a counter.
- **Move through drafts.** Click `Next`. Observable: the second draft becomes active and the first stays in the stack.
- **Edit a draft.** Click the body of the active draft, then `type_text` a change. Observable: the change shows in the card; it survives navigation and reload.
- **Dismiss one.** Use the dismiss control on one draft (control name unverified). Observable: it stays in the stack with its saved state marked dismissed.
- **Confirm.** Click the batch's confirm control (`Send email` is the label for email drafts per the guide; event label unverified). Observable: a `with N attachments` or sent row appears in the transcript; the confirmed items leave the stack.
- **Cancel.** On another review, click `Cancel`. Observable: drafts remain unchanged and nothing appears in the sent list.
- **Proof.** Save a snapshot before and after confirmation. For email, verify in the sent list via the Email feature, not this card.

## Gotchas

- The stack confirms only the selected batch. Dismissed items stay in the stack.
- A revision conflict or uncertain request shows `Reload saved review`. Do not resend; reload first.
- Attachments still uploading block confirmation; the send button stays disabled until they finish.
- Presenting a draft is not approval. The card reads Presented to the user until confirmation.
- Gmail and Outlook are the email integrations in v1; sends go through those providers.
- A single email or event has no stack navigation.
