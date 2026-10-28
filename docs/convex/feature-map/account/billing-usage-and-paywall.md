# Billing, usage, and paywall

Billing shows the account's plan (Free, Pro, or Max) with upgrade cards, a trial offer for first-time subscribers, and `Manage` for existing subscriptions. Usage shows the monthly AI allowance meter, prepaid credits, and automatic reload. When a free limit is reached, a paywall dialog offers an upgrade. An AI usage dialog appears when AI allowance is exhausted. Checkout and subscription management go through Stripe. Developer previews and a local Billing Lab show these states without a backend.

## Sub-features

- `billing-plan-cards` shows Pro and Max cards with `Get Pro`, `Get Max`, or `Upgrade to Max`, and the trial offer when eligible.
- `billing-checkout` opens Stripe Checkout and returns to the app, then confirms the new license.
- `billing-manage` opens the Stripe billing management for existing subscribers.
- `billing-team-seats` shows the viewer's own seat plan on teams, scheduled downgrades, and `Keep Max plan`.
- `usage-meter` shows the `Monthly limit` meter and the explanation dialog.
- `usage-credits` shows the credit balance and `Add more` with `$25`, `$50`, `$100`, or `Other`.
- `usage-auto-reload` configures automatic credit purchases with minimum balance, target balance, and a monthly cap.
- `paywall-modal` offers upgrades from feature limits.
- `ai-limit-dialog` appears when AI usage or credits are exhausted.
- `billing-lab` is a local simulator with 20 presets. It makes no billing calls.

## How to get to it (user POV)

- Settings → Personal → Billing (`/app/settings/billing`) and Usage (`/app/settings/usage`).
- The plan card in Settings → Account opens Billing.
- Paywall triggers: folder, file, image, chat, and o1 limits; saved prompts; removing an email signature; a second inbox; and teams.
- AI usage dialog: from chat or AI editing when allowance runs out.
- Onboarding's plan step.
- Team → Members: the `Seat plan` menu on each paid seat.
- Local only: Usage → `Developer tools` → `Open Billing Lab`, and `Preview Free plan` or `Preview paid plan`.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running. Checkout cannot complete locally without Stripe credentials (unverified). The Billing Lab works without a backend.
- A Free account is signed in.

- **Open Billing.** Navigate to `/app/settings/billing`. Observable: the current plan label reads `Free plan`, with cards for `Get Pro` and `Get Max`.
- **Open Usage.** Navigate to `/app/settings/usage`. Observable: `Monthly limit` meter, `Usage Credits`, and `Add more`. In production while the flag is off, the page shows `AI billing changes take effect on October 8, 2026.` and every control is disabled.
- **Buy credits.** Click button `Add more`. Observable: dialog `Need more usage?` with `$25`, `$50`, `$100`, and `Other`. Stop before the Stripe redirect.
- **Auto-reload.** Click the `Automatic reload` switch. Observable: dialog `Auto-Reload` with `Minimum balance` (default `$10`), `Target balance` (default `$100`), and a monthly maximum. Close without saving.
- **Billing Lab.** Navigate to `/billing-lab.html` (no login). Choose the preset `Max → Pro at renewal`. Observable: the timeline shows a scheduled downgrade. Click `Advance to renewal`. Observable: Pro is active and included usage resets.
- **Paywall preview (local HMR only).** In Billing, use `Preview paywall` for the selected state. Observable: a modal with Pro and Max cards. `Manage plan` returns to Billing with the selection kept.
- **Reset previews.** Click `Reset preview` (Usage or Billing). Observable: the normal account state returns.

## Gotchas

- The trial appears only for a first subscription, including after a canceled one. Eligibility loading disables Pro checkout without advertising a trial. A failed lookup shows `Try again`.
- A checkout rejected for trial eligibility shows the server's explanation and refreshes eligibility. It never retries as a paid purchase silently.
- After checkout returns, the app polls the server's license. A pending webhook shows a retryable confirmation state.
- Team members who do not pay for their seat see no plan options and a notice to contact the team owner. Team credits are managed by the payer.
- Team payers see `Team Usage Credits`. The included-usage meter still belongs to the viewer's own seat.
- A failed automatic reload shows `Paused — payment failed`. Saving the dialog retries.
- The monthly reload cap resets at the UTC month boundary. Manual credit purchases do not count toward it.
- Historical direct-charge invoices are still recognized by webhooks, but no new ones are created or retried.
- Preview modes never purchase or change payment methods. Billing Lab and the Developer tools section are local only.
