# Lexical core

## What it is

Shared Lexical nodes and Markdown conversion for web editors, message renderers,
and backend document transformations.

## Start here

- `transformers/index.ts`: internal, external, and combined import/export sets.
- `utils/auto-link.ts` and `transformers/auto-link.ts`: shared URL matching and
  its adapter to Lexical's inline importer.
- `README.md`: persisted link and explicit-unlink behavior.
- `markdown-loro-update.ts`: the Loro update that makes a snapshot hold given
  markdown, reusing unchanged top-level blocks; `tests/markdown-round-trip.test.ts`
  lists what round-trips byte for byte and what normalizes.

## Boundaries

Keep runtime code independent of the web app and browser-only modules. The web
composer imports the URL matcher from this package; do not duplicate it.

## Checks

- From `apps/web`: `bun run test --project lexical-core`.
- Run `bunx @biomejs/biome ci <changed-files>` from this directory for its
  format/lint rules; include untracked files before the first commit.
- Link changes also run `bun run test --project core linksPlugin.test.ts
  StaticMarkdown.test.tsx` in `apps/web`, and the browser check documented in
  `apps/web/src/lib/core/component/LexicalMarkdown/component/core/browser-test/README.md`.

## Gotchas

External export must re-import to the same document: escape only what would
change the parse (intraword `_` stays bare; the `@lexical/markdown` patch in
`apps/web/patches/`), and add a round-trip case for new syntax.

Keep URLs protected from inline formatting during import; matching rendered
text is too late. Preserve code, mention payloads, existing links, and escaped
literal URLs. Keep unlink state through both Markdown and Lexical JSON saves.
