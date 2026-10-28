# Appearance and themes

Appearance chooses light, dark, or system mode, picks a theme for each mode, and manages themes. Users can search themes, edit tokens, create custom themes, copy a theme to the clipboard, and import one from the clipboard. The app follows the chosen mode immediately. Theme choices live in the browser, not on the account, so they do not follow the user to another device. Agent replies can include theme chips that apply a theme in one click.

## Sub-features

- `theme-mode` chooses `System`, `Light`, or `Dark`. Each has a visual preview.
- `theme-pick` chooses the theme for the active mode, with search.
- `theme-create-edit` creates a custom theme and edits its color tokens in the theme editor.
- `theme-copy-import` copies a theme to the clipboard or imports one with `Import from clipboard`.
- `theme-mention` applies a theme from a chip in an agent reply and opens Appearance.

## How to get to it (user POV)

- Settings → Personal → Appearance (`/app/settings/appearance`).
- Theme dropdown: the theme pill beside any theme opens the list, with copy and import.
- Onboarding's workspace color step, which forks the default theme.
- Agent reply theme chips.

## Driving it with chrome-devtools MCP

Preconditions:

- The local stack is running. A signed-in account is optional; theme state does not need the backend.

- **Open Appearance.** Navigate to `/app/settings/appearance`. Observable: three mode choices `System`, `Light`, and `Dark` with previews.
- **Switch mode.** Click the `Dark` choice. Observable: the page background matches Macro Dark (outer `#0E0E0E`, inset panels `#121212`).
- **Pick a theme.** Open the theme selector for the active mode, type a theme name in its search field, and select it. Observable: the theme applies at once.
- **Import a theme.** Copy a valid theme JSON to the clipboard. Open the theme dropdown and click `Import from clipboard`. Observable: a new custom theme pill appears and is applied.
- **Persistence check.** Reload the page. Observable: the same mode and theme remain. Open a new private window and observe the defaults, which proves the state is browser-local.

## Gotchas

- Theme state (custom themes, the selected theme, the mode, and per-mode choices) lives only in this browser. It is not synced to the account.
- On first load, a setting from an older version of the app is migrated to the new mode setting, so returning users keep their look.
- Macro Light uses `#F5F5F5` outside and `#FCFCFC` inset panels. Both modes share the same muted blue accent.
- The theme editor saves an unsaved draft to local storage, so a reload keeps the draft.
- A theme chip only imports when its theme has every required color token. An incomplete theme is rejected.
- Cream mode for onboarding hides Pearl and centers the other five swatches.
