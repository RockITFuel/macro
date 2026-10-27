import { describe, expect, it } from 'vitest';
import type { FlowGraph } from './graph';
import { parseMermaid } from './parse-mermaid';

function graph(source: string): FlowGraph {
  return parseMermaid(source)._unsafeUnwrap();
}

function error(source: string) {
  return parseMermaid(source)._unsafeUnwrapErr();
}

const edges = (g: FlowGraph) =>
  g.edges.map((e) => [e.source, e.target, e.label ?? null, e.stroke]);

describe('parseMermaid', () => {
  it.each([
    ['flowchart TD', 'TB'],
    ['graph TB', 'TB'],
    ['graph LR', 'LR'],
    ['flowchart RL', 'RL'],
    ['flowchart BT', 'BT'],
    ['graph', 'TB'],
    ['FLOWCHART lr', 'LR'],
  ])('reads the header "%s"', (header, direction) => {
    expect(graph(`${header}\nA --> B`).direction).toBe(direction);
  });

  it('reads every node shape', () => {
    const g = graph(`flowchart TD
      a[Rect] --> b(Round) --> c([Stadium]) --> d[[Sub]]
      d --> e((Circle)) --> f{Decide} --> h{{Hex}}`);
    expect(g.nodes.map((n) => [n.id, n.shape, n.label])).toEqual([
      ['a', 'rect', 'Rect'],
      ['b', 'round', 'Round'],
      ['c', 'stadium', 'Stadium'],
      ['d', 'subroutine', 'Sub'],
      ['e', 'circle', 'Circle'],
      ['f', 'diamond', 'Decide'],
      ['h', 'hexagon', 'Hex'],
    ]);
  });

  it('reads edge kinds and labels', () => {
    const g = graph(`graph LR
      A -->|yes| B
      B -- no --> C
      C -.-> D
      D -. maybe .-> E
      E ==> F
      F == sure ==> G
      G --- H
      H -->|"quoted | pipe"| I`);
    expect(edges(g)).toEqual([
      ['A', 'B', 'yes', 'solid'],
      ['B', 'C', 'no', 'solid'],
      ['C', 'D', null, 'dotted'],
      ['D', 'E', 'maybe', 'dotted'],
      ['E', 'F', null, 'thick'],
      ['F', 'G', 'sure', 'thick'],
      ['G', 'H', null, 'solid'],
      ['H', 'I', 'quoted | pipe', 'solid'],
    ]);
    expect(g.edges.find((e) => e.target === 'H')?.arrowEnd).toBe(false);
  });

  it('reads arrows without spaces, long arrows and both-way arrows', () => {
    const g = graph('graph TD\nA-->B\nB--->C\nC<-->D\nmy-node-->D');
    expect(edges(g).map(([s, t]) => `${s}>${t}`)).toEqual([
      'A>B',
      'B>C',
      'C>D',
      'my-node>D',
    ]);
    expect(g.edges[2]).toMatchObject({ arrowStart: true, arrowEnd: true });
  });

  it('expands & on both sides and chains', () => {
    const g = graph('graph TD\nA & B --> C & D --> E');
    expect(edges(g).map(([s, t]) => `${s}${t}`)).toEqual([
      'AC',
      'AD',
      'BC',
      'BD',
      'CE',
      'DE',
    ]);
  });

  it('keeps the first label and lets a later shape win', () => {
    const g = graph('graph TD\nA[First] --> B\nA --> C\nB{Later}');
    expect(g.nodes.find((n) => n.id === 'A')?.label).toBe('First');
    expect(g.nodes.find((n) => n.id === 'B')).toMatchObject({
      shape: 'diamond',
      label: 'Later',
    });
  });

  it('reads quoted labels with brackets, entities and line breaks', () => {
    const g = graph(
      'graph TD\nA["Use [brackets] (here)"] --> B["Line one<br/>line #quot;two#quot;"]'
    );
    expect(g.nodes[0].label).toBe('Use [brackets] (here)');
    expect(g.nodes[1]).toMatchObject({
      label: 'Line one',
      detail: 'line "two"',
    });
  });

  it('splits statements on semicolons and skips comments and styling', () => {
    const g = graph(`graph TD;
      %% a comment
      A --> B; B --> C;
      style A fill:#f00
      linkStyle 0 stroke:#f00
      click A callback`);
    expect(g.edges).toHaveLength(2);
  });

  it('nests subgraphs and assigns members', () => {
    const g = graph(`flowchart TB
      X --> A
      subgraph outer [Outer group]
        A --> B
        subgraph inner
          direction LR
          C
        end
      end
      subgraph "Quoted title"
        D
      end`);
    expect(g.groups).toEqual([
      { id: 'outer', label: 'Outer group', parent: undefined },
      { id: 'inner', label: 'inner', parent: 'outer' },
      { id: 'subgraph-2', label: 'Quoted title', parent: undefined },
    ]);
    expect(
      Object.fromEntries(g.nodes.map((n) => [n.id, n.group ?? null]))
    ).toEqual({ X: null, A: 'outer', B: 'outer', C: 'inner', D: 'subgraph-2' });
  });

  it('points an edge at a subgraph to its first member', () => {
    const g = graph(`graph TD
      subgraph S
        A --> B
      end
      Start --> S`);
    expect(g.nodes.map((n) => n.id)).not.toContain('S');
    expect(edges(g)).toContainEqual(['Start', 'A', null, 'solid']);
  });

  it('applies classDef, class and :::', () => {
    const g = graph(`graph TD
      A:::hot --> B
      class B,C cool
      classDef hot fill:#f96,stroke:#333,stroke-width:3,color:red;
      classDef cool fill:url(javascript:alert(1)),stroke-dasharray:4 2`);
    expect(g.nodes.find((n) => n.id === 'A')?.classes).toEqual(['hot']);
    expect(g.nodes.find((n) => n.id === 'C')?.classes).toEqual(['cool']);
    expect(g.classDefs.hot).toEqual({
      fill: '#f96',
      stroke: '#333',
      strokeWidth: '3px',
      color: 'red',
    });
    expect(g.classDefs.cool).toEqual({ strokeDasharray: '4 2' });
  });

  it.each([
    ['', 'empty'],
    ['   \n  %% only a comment\n', 'empty'],
  ])('reports an empty source', (source, kind) => {
    expect(error(source).kind).toBe(kind);
  });

  it.each([
    ['sequenceDiagram\nA->>B: hi', 1, /Only flowcharts/],
    ['graph TD\nA --> B\nB -->', 3, /node after the arrow/],
    ['graph TD\nA[open --> B', 2, /missing its closing `\]`/],
    ['graph TD\nsubgraph S\nA', 3, /missing its `end`/],
    ['graph TD\nend', 2, /without a matching/],
    ['graph TD\nA ~~ B', 2, /Expected an arrow/],
    ['graph TD\nA@{ shape: rect }', 2, /not supported/],
    [
      'graph TD\nsubgraph B\nsubgraph A\nsubgraph B\nx --> y\nend\nend\nend',
      4,
      /cannot contain itself/,
    ],
    [`graph TD\nA -- a${' '.repeat(3000)}b`, 2, /limited to 2000 characters/],
  ])('reports %j at its line', (source, line, message) => {
    const result = error(source);
    expect(result).toMatchObject({ kind: 'syntax', line });
    expect(result.kind === 'syntax' && result.message).toMatch(message);
  });

  it('refuses charts beyond the size limit', () => {
    const lines = Array.from({ length: 400 }, (_, i) => `n${i} --> n${i + 1}`);
    expect(error(`graph TD\n${lines.join('\n')}`).kind).toBe('too-large');
  });

  it('refuses more subgraphs than the limit', () => {
    const open = Array.from({ length: 150 }, (_, i) => `subgraph g${i}`);
    const close = Array.from({ length: 150 }, () => 'end');
    const source = ['graph TD', ...open, 'x --> y', ...close].join('\n');
    expect(error(source).kind).toBe('too-large');
  });
});
