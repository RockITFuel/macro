# Convex backend rebuild

Start here before working on the Convex backend. This rebuild replaces Macro's
Rust backend (46 services, 260 crates, Kafka, OpenSearch, FusionAuth) with one
self-hosted Convex deployment, while keeping the existing web frontend.

## Decisions

1. **Rebuild, not migrate.** Port only the behavior the frontend needs, domain by
   domain, from the [feature graph](feature-graph/). The 669 Rust endpoints are a
   reference, not a target.
2. **Audience:** self-hosted for three users. Optimize for development speed and
   a small footprint, not for multi-tenant scale.
3. **Frontend:** the full existing `apps/web` frontend stays. The backend serves
   every feature the [feature map](feature-map/) lists as `v1` or `v1-integration`.
4. **Integrations in v1:** Gmail, Outlook (mail and calendar) and GitHub. Every
   other integration is `later`.
5. **Runtime:** self-hosted Convex, as in solid-morgo
   (`packages/backend/self-hosted`), with Postgres as Convex's storage (not
   SQLite) and S3-compatible storage for files. Local development runs one local
   Convex deployment per worktree.
6. **Code style:** [Confect](https://github.com/rjdellecese/confect) (Effect on
   Convex): Effect schemas for tables and validators, typed errors, middleware as
   Effect services. Confect has no tagged release yet; pin a commit.
7. **Conventions from solid-morgo:** every public function starts with the auth
   and policy check; one permissions package is the authority for server and UI;
   Better Auth owns identity and sessions, Convex owns product data.
8. **Lists (Soup):** the frontend list layer is refactored to plain Convex
   queries and mutations instead of reproducing the GraphQL Soup shapes, with the
   same user-facing features (feature map is the parity check).
9. **Identity:** FusionAuth is replaced by Better Auth with organizations;
   Gmail, Outlook and GitHub keep their own OAuth grants.
10. **Data:** import tasks, projects and documents from the current Macro
    instance once; mail and calendars resync from Gmail and Outlook.
11. **LLM:** all model calls go through CLIProxy (one endpoint, configured per
    deployment); no provider SDK keys in the backend.
12. **Transactional email:** templates with `@solid-email/render` (as in
    project-alpha), sent through Cloudflare Email from a Convex action.
13. **Projects:** one project concept; the `macro` CLI's `--project` means the
    same project as the Projects page.
14. **Later, not v1:** live calls and transcription, spreadsheets,
    presentations and design files.

## Platform limits that shape the design

- A Convex row is at most 1 MiB: document content, Loro snapshots and
  attachments live in file storage; rows hold metadata and small CRDT updates.
- A transaction writes at most 16,000 rows: mail, calendar and GitHub sync run as
  `@convex-dev/workflow` steps over cursors, with a workpool to cap concurrency.
- Long-running work (agent harness, coding agent, conversion, transcription)
  stays in external workers that a workflow starts and that report back over
  HTTP actions.
- Search uses Convex full-text and vector search.

## Map

| Path | Contents |
| --- | --- |
| [feature-map/](feature-map/) | User-facing features in the pstack verification format; the parity checklist. |
| [feature-graph/](feature-graph/) | Per domain: feature → API calls → Rust services → tables → external systems, with v1 scope. |
