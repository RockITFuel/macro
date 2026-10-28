# cli

## What it is

`macro`, the command-line client for agents and scripts on top of
[`@macro-inc/sdk`](../sdk/): documents and skills (exact markdown get/put),
projects, tasks, channels, agent sessions and search. `--help` lists the
commands; every command takes `--json`.

## Start here

- `src/main.ts`: argument parsing, help, output and exit codes
  (0 ok, 1 error, 2 usage, 3 conflict/409, 4 wait timeout).
- `src/commands/`: one module per command group, each a list of `Command`s
  (`src/command.ts`).
- `src/macro.ts`: the SDK client. `MACRO_API_KEY` or `MACRO_BOT_TOKEN`
  authenticates; `MACRO_BASE_URL` maps every service to the self-hosted
  proxy's path prefixes.
- `src/resolve.ts`: `<id|name>` lookups through the workspace listing.

## Boundaries

- Depends on: `packages/sdk` only. A missing capability goes into the SDK
  first (`add-sdk-endpoint` skill), then here; no hand-written HTTP.

## Gotchas

- The SDK is not a workspace dependency: `tsconfig.json` maps
  `@macro-inc/sdk` to its source, which Bun resolves at run time.
- `docs put`/`skills put` use `PUT /documents/{id}/markdown`; `--base
  <versionId>` from `docs get --json` turns a concurrent edit into exit 3.
- `sessions start` calls the generated agent-harness client directly: the SDK
  cannot start a session for a chosen agent or bot yet.

## Checks

- `bun test` (spawns the CLI against a fake server), `bun run check`,
  `bun run lint`
