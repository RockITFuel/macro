# Self-host smoke suite

Playwright checks of the user flows a self-hosted Macro must not lose: email
code sign-in, onboarding without billing, documents with a flow block, uploads
to object storage, channels/DMs/threads/mentions, a two-person call, agent
chat (reply, RenderHtml, AskUser), tasks (create, assign, board move, comment),
CRM and settings, plus two-user realtime checks tagged `@realtime`. Every test
also fails on console errors and 5xx responses that are not in the documented
noise list in `lib/fixtures.ts`. Entries marked `known` there are real defects
that predate the fork's changes: they do not fail a test but are reported as
`known-issue` annotations. A failure the environment causes (such as a bucket
whose CORS rules lack the origin) throws an error starting with `ENVIRONMENT:`,
which the gate lists as not verified.

The release gate (`tooling/self-host/gate/gate.sh`) runs it against the local
`staging` instance. Run it by hand against any origin:

```sh
bun install
# Local stack: codes come from its Mailpit, accounts are created on first run.
SMOKE_BASE_URL=https://localhost:43009 SMOKE_MAILPIT_URL=http://127.0.0.1:43008/mailpit bunx playwright test

# Production: sign the two test accounts in once (prompts for the mailed code).
SMOKE_BASE_URL=https://macro.alphamonitoring.app bun run login <a@d2d.cloud> a
SMOKE_BASE_URL=https://macro.alphamonitoring.app bun run login <b@d2d.cloud> b
SMOKE_BASE_URL=https://macro.alphamonitoring.app SMOKE_USER_A=<a> SMOKE_USER_B=<b> bunx playwright test
```

A and B must share a team; on a stack with Mailpit the setup creates
"Smoke Team" for A with B invited. Everything a run creates carries
`[smoke <label>]` in its name. Settings are documented in `lib/env.ts`.
Results: `$SMOKE_OUT/results.json`, an HTML report in `$SMOKE_OUT/html`, and
traces/screenshots of failures in `$SMOKE_OUT/artifacts`.
