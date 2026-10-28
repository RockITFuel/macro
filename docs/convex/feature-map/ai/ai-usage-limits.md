# AI usage limits and plan allowances

Each plan includes a monthly AI allowance, measured per seat, shown as a percentage of the monthly limit in Settings → Usage. When the allowance runs out, AI requests are refused with a dialog that offers to add credits, to open usage settings, or to view plans. Free users have a hard monthly cap. Paid users can buy credits or turn on automatic reload.

## Sub-features

- `usage-meter` shows the current period's Monthly limit percentage in Settings → Usage.
- `usage-refusal` opens the AI usage limit dialog when a send or AI edit is refused for quota.
- `usage-free-cap` shows the free-plan dialog with View plans.
- `usage-credits` buys credits and enables auto-reload (paid only).
- `usage-api-keys` (see the agent roster feature) lets an agent's own key bypass Macro's allowance.

## How to get to it (user POV)

- Settings → Usage shows the meter, credit purchase and auto-reload controls.
- Settings → Billing changes the subscription.
- The dialog appears automatically when a send or AI edit is refused for quota.
- Mobile: the same Settings screens; the dialog is a bottom sheet.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running on a dev or local stack. Production billing controls are gated by a flag and show an announcement until enabled.
- Use an isolated local backend with billing fixtures, not a real hosted account.
- A developer-tools override in Settings → Usage can open the dialog for display checks; it does not change quota.

- **Open usage.** Navigate to Settings → Usage. Take a snapshot. Observable: a `Monthly limit` percentage and an info button.
- **Open the dialog directly.** On dev, use the Developer tools control in Usage to open the free or paid dialog. Observable: a dialog titled `You've used this month's free AI` or `You've used this month's included AI`.
- **Dismiss.** Close the dialog with its close control (label unverified). Observable: the dialog closes and the send you attempted remains unsent.
- **Refusal path.** Intercept only the tested AI request in DevTools and return a 402 body with the matching code, then send a prompt. Observable: the dialog opens and no message appears in the transcript. Restore the interception afterward.
- **Proof.** Save a snapshot of the Usage page and of the dialog; record the title text shown.

## Gotchas

- A quota refusal is a failed result; no provider work runs and no orphaned session is created.
- A 503 for unavailable billing is not an approval; retry later instead of resending.
- A chat's optional automatic rename can be refused without failing the chat itself.
- Manual editing, dictation and deterministic tools are never blocked by quota.
- Free users cannot buy credits or enable auto-reload; the dialog offers View plans only.
- Allowance amounts come from deployment configuration, not from the client.
- This feature is billing-related and needs a decision before v1 (see the graph's open questions).
