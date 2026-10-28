# Onboarding

After a first desktop sign-up, a guided flow sets the workspace color, feature interests, security details, work and personal Google accounts, tools, team, and a plan. Each step is a page of the same flow, and a user who returns is resumed at the saved step. Accounts on `@macro.com` see a `Bypass` button on every step that skips the rest. First-run mobile users get a separate wizard for connecting Gmail, plus a short interactive tutorial. Finishing setup lands on Home.

## Sub-features

- `onboard-color` picks the workspace color. Cream mode hides Pearl. The choice forks the default theme and pins a custom accent.
- `onboard-interests` picks visual feature interests. These are visual only and do not change the account.
- `onboard-security` shows security details with a `Read more` section below the fold.
- `onboard-work-email` connects the work address with Google sign-up. It creates the account and links the primary inbox.
- `onboard-personal-email` connects a personal Google account. Skippable.
- `onboard-tools` lists connectable tools: Linear, Notion, Slack, then startup and small-business tools. It supports search and load more.
- `onboard-team` creates a team with a workspace name and invites teammates by address.
- `onboard-plan` offers Free, Pro (with a trial only when eligible), and Max. It returns after checkout.
- `onboard-resume` reopens the flow at the saved step or at a step named in a link.
- `onboard-bypass` lets `@macro.com` accounts skip the rest of the flow.
- `onboard-mobile` is the mobile wizard: `Connect Gmail`, `Create account without connecting email`, and `Connect More Accounts`.

## How to get to it (user POV)

- Desktop: right after first sign-up. Sign-up runs through `/app/signup`, sign-in through `/app/login`, and the flow itself lives at `/app/onboarding`.
- Direct link: `/app/onboarding?step=<step>`, where `<step>` is `welcome`, `vision`, `security`, `work`, `personal`, `tools`, `team`, or `plan`. Other values are ignored.
- Lifecycle emails link to the step the user left.
- Mobile web and native: the wizard follows sign-in for first-run users.
- Plan purchases after onboarding: Settings → Billing.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running and a brand-new account is signed in, with desktop viewport width (at least 1280 px).
- For a walkthrough without a backend or real billing, use the onboarding browser-test fixture (open `/?view=flow&theme=cream`; its README lives with the onboarding code). It forces the cream preview without changing account settings.

- **Enter the flow.** Navigate to `/app/onboarding` as a new user. Observable: the workspace color step shows and the button `Continue` is visible.
- **Pick a color.** Click a color swatch in the color picker. Observable: that swatch shows as selected and `Continue` advances. The selection must survive any later reload of this step.
- **Work email.** On the work step, observe that `Connect work email` is the only account button and it uses Google sign-up. There is no alternate email button. Stop at the Google consent page.
- **Skip work email.** Choose the skip control on the work step. Observable: the secondary-account prompt is skipped.
- **Tools.** Observe the featured order Linear, Notion, Slack, then PostHog and Stripe, then QuickBooks. Type in the search field; results cover the full directory. Observable: no duplicate cards after load more.
- **Team.** On the team step, fill the textbox with placeholder `Enter team name`. Fill the invite textbox with placeholder `name@company.com`, one address per line. Click `Continue`. Observable: the button reads `Opening your workspace…` while saving.
- **Plan.** On the plan step, observe one of three states. An eligible first-time subscriber sees `Free Claude & GPT for 30 days` with the trial button. A returning customer sees `Get more with Pro.` and `Get Pro`. An existing subscriber sees `Manage subscription`. The free option completes onboarding without a card.
- **Finish.** Click the final completion button. Observable: URL becomes `/app/home`, and the app shows no `Couldn't finish setup` message.
- **Bypass.** Signed in as an `@macro.com` account, click `Bypass` on any step. Observable: onboarding closes and the app opens. Other domains do not see the button.
- **Resume link.** Navigate to `/app/onboarding?step=team` for an account with no saved progress. Observable: the team step shows and the `step` parameter is removed from the URL.

## Gotchas

- Saved progress wins over a resume link. A first visit with nothing saved opens the link; with neither, the flow starts at welcome.
- A Stripe checkout return always opens the plan step. A Google sign-up return opens the work step. Both win over saved progress.
- A session refresh during the flow must not restart it or flash it. Finishing must complete even if a background refresh overlaps.
- A successful finish must not show `Couldn't finish setup — please try again`.
- Members whose team already has an active or trialing license finish directly from the team step, without the plan page.
- If the Pro trial eligibility lookup fails, Pro checkout is disabled and `Try again` is offered. Free remains available.
- The workspace accent survives the Google redirect and is saved to the user's theme (see the appearance feature).
- The public marketing preview at `/onboarding-preview.html` is a mock. It is not this flow and it never purchases a plan.
- The tools and plan steps depend on external services. A tools step without those services can still complete with a skip.
