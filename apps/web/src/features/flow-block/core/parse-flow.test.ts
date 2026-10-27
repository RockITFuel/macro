import { describe, expect, it } from 'vitest';
import { parseFlow } from './parse-flow';

describe('parseFlow', () => {
  it('reads YAML with objects, shorthands and groups', () => {
    const graph = parseFlow(`direction: LR
nodes:
  - id: start
    label: Start
    shape: stadium
    status: success
    result: Received · 10:42
  - { id: check, label: Valid?, shape: diamond, group: core, class: hot }
  - done
groups:
  - { id: core, label: Core }
edges:
  - start -> check
  - check --> done: yes
  - check -.-> start
  - { from: check, to: retry, label: no, style: thick, arrow: both }
classes:
  hot: { fill: "#f96", stroke-width: 2 }
`)._unsafeUnwrap();

    expect(graph.direction).toBe('LR');
    expect(graph.nodes.map((n) => n.id)).toEqual([
      'start',
      'check',
      'done',
      'retry',
    ]);
    expect(graph.nodes[0]).toMatchObject({
      shape: 'stadium',
      status: 'success',
      result: 'Received · 10:42',
    });
    expect(graph.nodes[1]).toMatchObject({ group: 'core', classes: ['hot'] });
    expect(graph.groups).toEqual([{ id: 'core', label: 'Core' }]);
    expect(
      graph.edges.map((e) => [e.source, e.target, e.label ?? null, e.stroke])
    ).toEqual([
      ['start', 'check', null, 'solid'],
      ['check', 'done', 'yes', 'solid'],
      ['check', 'start', null, 'dotted'],
      ['check', 'retry', 'no', 'thick'],
    ]);
    expect(graph.edges[3]).toMatchObject({ arrowStart: true, arrowEnd: true });
    expect(graph.classDefs.hot).toEqual({ fill: '#f96', strokeWidth: '2px' });
  });

  it('reads JSON', () => {
    const graph = parseFlow(
      JSON.stringify({
        direction: 'TD',
        nodes: [{ id: 1, label: 'One' }, 'two'],
        edges: [{ from: 1, to: 'two' }],
      })
    )._unsafeUnwrap();
    expect(graph.direction).toBe('TB');
    expect(graph.edges[0]).toMatchObject({ source: '1', target: 'two' });
  });

  it('creates groups that nodes name but the document does not list', () => {
    const graph = parseFlow('nodes:\n  - { id: a, group: g }')._unsafeUnwrap();
    expect(graph.groups).toEqual([{ id: 'g', label: 'g' }]);
  });

  it.each([
    ['', 'empty'],
    ['nodes: []', 'empty'],
  ])('reports an empty document %j', (source, kind) => {
    expect(parseFlow(source)._unsafeUnwrapErr().kind).toBe(kind);
  });

  it.each([
    ['nodes: [a\nedges: x', 1, /Flow sequence/],
    ['nodes:\n  - id: a\n    shape: blob', 3, /nodes\.0\.shape/],
    ['nodes: [a]\nedges:\n  - a to b', 3, /edges\.0/],
    ['direction: up\nnodes: [a]', 1, /direction/],
    ['nodes: [a, g]\ngroups: [g]', 2, /both a node and a group/],
    [
      'nodes: [a]\ngroups:\n  - { id: x, parent: y }\n  - { id: y, parent: x }',
      3,
      /cannot contain itself/,
    ],
  ])('reports %j with a line', (source, line, message) => {
    const error = parseFlow(source)._unsafeUnwrapErr();
    expect(error).toMatchObject({ kind: 'syntax', line });
    expect(error.kind === 'syntax' && error.message).toMatch(message);
  });
});
