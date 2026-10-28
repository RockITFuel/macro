# Developer tools and UI gallery

Internal surfaces for developers and designers. The UI gallery at `/app/debug/ui` shows the app's components and their docs with a coverage page, and it is registered on every build. Local-only debug panes (for example the hotkey debugger and the notifications playground) open at `/app/debug/<id>` on local dev only. A status bar in development builds shows the git branch and the dev port. The Billing Lab and the Usage developer section are described in the billing feature. None of these are end-user features.

## Sub-features

- `ui-gallery` shows component docs, live examples, and a coverage page.
- `debug-panes` opens registered debug views at `/app/debug/<id>`. Most are local only.
- `hotkey-debugger` shows registered hotkeys. Local only.
- `dev-status-bar` shows the git branch and dev port chip. Development builds only.

## How to get to it (user POV)

- UI gallery: navigate to `/app/debug/ui`. The component route `/app/component/ui` is an alias.
- Debug views: `/app/debug/<id>` or the alias `/app/component/<id>`. Ids include `hotkey-debugger`, `quick-access-list`, `notifications-playground`, `projection-playground` (development only), and others.
- Hotkey debugger: its keyboard shortcut is registered only on local builds. (Unverified: the key binding.)
- Dev status bar: at the bottom of the sidebar in `vite` dev builds.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running, or a preview deployment is available for the gallery.
- For local-only panes, use the local dev server, not a deployed build.

- **Open the gallery.** Navigate to `/app/debug/ui`. Observable: a gallery sidebar lists the component docs, and the coverage page lists which components have docs.
- **Open a component doc.** In the gallery sidebar, click a component name. Observable: the doc page shows its demo preview and a code block.
- **Open a debug pane (local).** Navigate to `/app/debug/hotkey-debugger`. Observable: the pane renders with a list of registered hotkeys.
- **Check the dev bar (local).** Observe the bottom of the sidebar. Observable: the git branch name and a colored port chip such as `:3001`.

## Gotchas

- The UI gallery route has no environment gate in the route definitions. A deployed build exposes `/app/debug/ui`. Confirm whether that is intended before the port.
- Debug panes listed under the local-only gate are absent on deployed builds. The projection playground needs the development mode flag.
- Each gallery entry's docs live beside its component. Editing a component's docs changes the gallery.
- The Billing Lab page (`/billing-lab.html`) is a standalone page with no login. It is not part of the app shell.
- The dev status bar only appears in development builds, and only when it has a branch name to show.
