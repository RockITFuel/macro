# Macro verification map

This directory is the maintained source for verifying Macro's user-facing behavior,
and the parity checklist for the Convex backend rebuild: a feature is ported when
its recipe passes against the Convex backend. Read the index before driving the
app, then use the matching feature file as the recipe. The format follows pstack's
`create-verification-skill` feature map.

## Baseline preconditions

- Run the local stack and sign in as described in
  [the app agent guide](../../agent-guide/README.md) and its
  [login page](../../agent-guide/login.md).
- Drive the browser through the chrome-devtools MCP server, following
  [browser technique](../../agent-guide/browser-technique.md).
- Never drive an instance that was not started for this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Take a snapshot after every navigation; editors and composers are
  contenteditable, so click to focus and then type.
- Prefix created records with `TEST` and remove them afterwards; keep proof
  artifacts.
- Labels marked `(unverified)` came from code or docs, not a live run; confirm
  them on the first run and remove the marker.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an accessibility snapshot and a screenshot.
- Mutation proof includes a second, read-only view of the stored value.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted action and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behavior, followed by exactly four H2 sections in this order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with chrome-devtools MCP`
and `Gotchas`. Keep implementation details out of the map; they belong in the
[feature graph](../feature-graph/README.md).

## Features

Scope is the Convex v1 scope from the feature graph: `v1` core, `v1-integration`
(Gmail, Outlook, GitHub), `later`, `drop?` (needs confirmation).

### Account

- [Sign in and sign up](account/login-and-signup.md) · `v1`
- [Onboarding](account/onboarding.md) · `v1`
- [Teams and invitations](account/teams-and-invitations.md) · `v1`
- [Settings and account](account/settings-and-account.md) · `v1`
- [Appearance and themes](account/appearance-and-theme.md) · `v1` (client only)
- [Connections and integrations](account/connections-and-integrations.md) · `v1-integration`
- [Agents and developer settings](account/agents-and-developer-settings.md) · `later`
- [Guided tours and setup prompts](account/guided-tours-and-setup-prompts.md) · `later`
- [Billing, usage, and paywall](account/billing-usage-and-paywall.md) · `drop?`
- [Developer tools and UI gallery](account/developer-tools-and-ui-gallery.md) · `drop?`

### Documents

- [Markdown documents](documents/markdown-documents.md) · `v1`
- [Canvas](documents/canvas.md) · `v1`
- [Word documents (DOCX)](documents/word-documents.md) · `v1`
- [PDF documents](documents/pdf-documents.md) · `v1`
- [Comments and history](documents/comments-and-history.md) · `v1`
- [Sharing and access](documents/sharing-and-access.md) · `v1`
- [Uploads and conversion](documents/uploads-and-conversion.md) · `v1`
- [Spreadsheets](documents/spreadsheets.md) · `later`
- [Presentations (PowerPoint)](documents/presentations.md) · `later`
- [Design files (Figma, Photoshop, Illustrator)](documents/design-files.md) · `later`

### Work

- [Tasks list](work/tasks-list.md) · `v1`
- [Create a task](work/task-create.md) · `v1`
- [Projects](work/projects.md) · `v1`
- [Databases](work/databases.md) · `v1`
- [Customers (CRM)](work/crm.md) · `v1`
- [Forms](work/forms.md) · `v1`
- [Email reminders](work/reminders.md) · `v1-integration`
- [Reviews (GitHub pull requests)](work/task-reviews.md) · `v1-integration`

### Communication

- [Channel conversations](communication/channel-conversations.md) · `v1`
- [Channel messages](communication/channel-messages.md) · `v1`
- [Home feed](communication/home-feed.md) · `v1`
- [Live lists](communication/live-soup-lists.md) · `v1`
- [Notifications](communication/notifications.md) · `v1`
- [Activity feed](communication/activity-feed.md) · `v1`
- [Search](communication/search.md) · `v1`
- [Navigation and command menu](communication/navigation-and-command-menu.md) · `v1`
- [Agent direct messages](communication/agent-dms.md) · `later`
- [Channel calls](communication/channel-calls.md) · `later`

### Email

- [Connect an email inbox](email/connect-inbox.md) · `v1-integration`
- [Browse mail list](email/browse-list.md) · `v1-integration`
- [Read an email thread](email/read-thread.md) · `v1-integration`
- [Triage email](email/triage.md) · `v1-integration`
- [Compose, send, and schedule email](email/compose-send.md) · `v1-integration`
- [Search and filter mail](email/search-filter.md) · `v1-integration`
- [Snooze email with reminders](email/reminders.md) · `v1-integration`
- [Use mail offline](email/offline.md) · `later`

### Calendar and calls

- [Calendar views](calendar/calendar-views.md) · `v1`
- [Meeting notes](calendar/meeting-notes.md) · `v1`
- [Scheduling and booking pages](calendar/scheduling.md) · `v1`
- [Calls list, recordings and transcripts](calendar/calls-recordings.md) · `later`
- [Live calls and meeting links](calendar/live-calls.md) · `later`
- [Calendar connections and calendar settings](calendar/calendar-connections.md) · `v1-integration`
- [Event create, edit and details](calendar/event-editing.md) · `v1-integration`
- [Calendar invitations in email](calendar/invitations-in-email.md) · `v1-integration`
- [Granola meeting import](calendar/granola-import.md) · `later`
- [Voice dictation in composers](calendar/dictation.md) · `later`

### AI and agents

- [Agent session](ai/agent-session.md) · `v1`
- [Agent conversation list](ai/agent-conversation-list.md) · `v1`
- [Agent roster, personas and direct messages](ai/agent-roster-and-personas.md) · `v1`
- [Agent questions, permission prompts and approvals](ai/agent-approvals-and-questions.md) · `v1`
- [AI chat (standalone and document-scoped)](ai/ai-chat-legacy.md) · `v1`
- [AI edit in documents](ai/document-ai-edit.md) · `v1`
- [Routines](ai/routines.md) · `v1`
- [Agent reviews](ai/agent-reviews.md) · `v1-integration`
- [Connections, MCP and code mode](ai/mcp-connectors-and-code-mode.md) · `later`
- [Illustrator file editor](ai/illustrator-ai-file-editor.md) · `later`
- [AI usage limits and plan allowances](ai/ai-usage-limits.md) · `drop?`

### Files and integrations

- [Drive files](integrations/drive-files.md) · `v1`
- [File sharing](integrations/file-sharing.md) · `v1`
- [GitHub account link](integrations/github-account.md) · `v1-integration`
- [GitHub repositories](integrations/github-repositories.md) · `v1-integration`
- [Pull request list](integrations/pull-request-list.md) · `v1-integration`
- [Pull request detail](integrations/pull-request-detail.md) · `v1-integration`
- [Pull request changes](integrations/pull-request-changes.md) · `v1-integration`
- [Pull request merge](integrations/pull-request-merge.md) · `v1-integration`
- [Connector imports](integrations/connector-imports.md) · `later`
- [Slack import](integrations/slack-import.md) · `later`
