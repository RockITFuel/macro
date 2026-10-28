# Granola meeting import

With a Granola connection set up, Granola meeting notes that have a generated summary appear in Macro as private calls. Each imported call carries its title, summary, attendees as guests, and transcript, but no recording. Setup is one step; there are no sync controls. Only notes whose summary is generated, edited, or shared after the connection exist as imports; older notes are not backfilled.

## Sub-features

- `granola-connect` adds a Granola connection with a Granola Business or Enterprise API key, or through the app connector.
- `granola-sync` imports new Granola notes as calls about a minute after Granola finishes the summary.
- `granola-disconnect` stops imports when the connection is removed or disabled.

## How to get to it (user POV)

- Settings → Agent connections (per the agent guide); the Granola row sits in the integrations list (location in the current build: Settings → Integrations, unverified).
- A `Granola` promo chip in the app points to the connection flow (placement unverified).
- Imported calls show in Calls under `All` and `Attended`.

## Driving it with chrome-devtools MCP

Preconditions:

- A Granola Business or Enterprise API key is available for the test workspace.
- The stack has a public HTTPS callback origin for Granola webhooks (a tunnel is needed on a laptop stack).
- Run `take_snapshot` before each step and act on the uid whose role and name match the handle.

- **Connect.** Open Settings → Integrations (or Agent connections). Choose `Connect` in the Granola row and complete the key entry it opens (exact fields unverified). Result: the row shows `Connected` within about 30 seconds.
- **Confirm sync.** Generate or edit a summary in Granola for a new note. Wait about a minute. Navigate to `/app/calls` and choose `All`. Result: the note appears as a call with its title and summary and no recording.
- **Open an import.** Choose the imported call. Result: the call detail shows summary, guests, and transcript; no video area.
- **Disconnect.** In the Granola row, choose `Disconnect`. Result: the row shows `Disconnected`; later Granola notes do not appear.

## Gotchas

- History is not backfilled; only notes whose summary changes after connecting are imported.
- Imported calls do not appear in any channel's Calls tab.
- Rename and delete are not available for imported calls.
- Webhooks need a public HTTPS origin; a laptop stack without a tunnel never receives notes.
- Granola import is a later-scope integration; do not block the Calls view on it.
