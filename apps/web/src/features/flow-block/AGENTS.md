# Flow blocks

## What it is

Fenced code blocks in `mermaid` (a flowchart subset) or `flow` (JSON/YAML nodes,
edges, groups) drawn as an interactive, read-only flowchart in Markdown
documents and in agent chat. The block stays an ordinary code node: Markdown,
Lexical JSON and Loro sync keep the source text exactly as written; the chart is
only a view of it.

## Start here

- `core/parse-mermaid.ts`, `core/parse-flow.ts`: source → `FlowGraph`, errors carry a line.
- `core/layout.ts`: dagre layout with estimated node sizes (no DOM measuring).
- `components/FlowCanvas.tsx`: `@dschz/solid-flow` 0.2.x (the Solid 1 line; 1.x is Solid 2).
- `components/FlowPreview.tsx`: fixed-height, lazy entry used by hosts.
- Hosts: `LexicalMarkdown/component/accessory/CodeBoxAccessory.tsx` (editor) and
  `StaticCodeContainer` in `LexicalMarkdown/component/core/StaticMarkdown.tsx` (chat, read-only).

## Boundaries

Import only `index.ts` from hosts; it stays light, and the parser, layout and
solid-flow load in the `FlowBlock` chunk. The Diagram/Source choice is local view
state; never write it to the node, or viewing a document would edit it.

## Checks

- `bun run test --project app src/features/flow-block` from `apps/web`.
- `bun run test --project lexical-core flowBlock` for the Markdown round trip.

## Gotchas

- solid-flow's arrowhead uses SVG presentation attributes, which ignore CSS
  variables; `flow-block.css` colors them with a CSS rule instead.
- Node sizes are estimated from text length; change `nodeSize` and the card CSS together.
