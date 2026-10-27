import { describe, expect, it } from 'vitest';
import type { Box } from './layout';
import { layoutFlow, nodeSize, stepPath } from './layout';
import { parseMermaid } from './parse-mermaid';

const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe('layoutFlow', () => {
  it('ranks top to bottom and left to right', () => {
    const tb = layoutFlow(parseMermaid('graph TD\nA --> B')._unsafeUnwrap());
    expect(tb.nodes[1].box.y).toBeGreaterThan(tb.nodes[0].box.y);
    const lr = layoutFlow(parseMermaid('graph LR\nA --> B')._unsafeUnwrap());
    expect(lr.nodes[1].box.x).toBeGreaterThan(lr.nodes[0].box.x);
    const rl = layoutFlow(parseMermaid('graph RL\nA --> B')._unsafeUnwrap());
    expect(rl.nodes[1].box.x).toBeLessThan(rl.nodes[0].box.x);
  });

  it('keeps nodes apart and groups around their members', () => {
    const graph = parseMermaid(`flowchart TD
      A --> B & C
      subgraph outer [Outer]
        B --> D
        subgraph inner [Inner]
          C --> E
        end
      end
      D & E --> F`)._unsafeUnwrap();
    const layout = layoutFlow(graph);
    const boxes = layout.nodes.map((n) => n.box);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
    const box = (id: string) =>
      layout.groups.find((g) => g.group.id === id)?.box as Box;
    const node = (id: string) =>
      layout.nodes.find((n) => n.node.id === id)?.box as Box;
    expect(contains(box('outer'), node('B'))).toBe(true);
    expect(contains(box('inner'), node('E'))).toBe(true);
    expect(contains(box('outer'), box('inner'))).toBe(true);
    expect(contains(box('outer'), node('A'))).toBe(false);
    expect(layout.groups.find((g) => g.group.id === 'inner')?.depth).toBe(1);
    expect(contains(layout.bounds, box('outer'))).toBe(true);
  });

  it('lays out a subgraph with no members', () => {
    const layout = layoutFlow(
      parseMermaid('graph TD\nA --> B\nsubgraph Empty\nend')._unsafeUnwrap()
    );
    expect(layout.groups[0].box.width).toBeGreaterThan(0);
  });

  it('sizes nodes from their text, within bounds', () => {
    const short = nodeSize({ id: 'a', label: 'A', shape: 'rect', classes: [] });
    const long = nodeSize({
      id: 'b',
      label: 'A much longer label that has to wrap onto more lines',
      shape: 'rect',
      classes: [],
    });
    expect(short.width).toBe(120);
    expect(long.width).toBeLessThanOrEqual(290);
    expect(long.height).toBeGreaterThan(short.height);
    const circle = nodeSize({
      id: 'c',
      label: 'C',
      shape: 'circle',
      classes: [],
    });
    expect(circle.width).toBe(circle.height);
  });

  it('routes every edge and places labels on the route', () => {
    const layout = layoutFlow(
      parseMermaid('graph TD\nA -->|yes| B\nA --> C\nB --> C')._unsafeUnwrap()
    );
    for (const { points } of layout.edges) {
      expect(points.length).toBeGreaterThanOrEqual(2);
    }
    expect(layout.edges[0].labelAt).toBeDefined();
    expect(layout.edges[1].labelAt).toBeUndefined();
  });
});

describe('stepPath', () => {
  it('draws a straight hop as one line', () => {
    expect(
      stepPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 50 },
        ],
        false
      )
    ).toBe('M0,0L0,50');
  });

  it('turns once halfway along the flow axis, with rounded corners', () => {
    expect(
      stepPath(
        [
          { x: 0, y: 0 },
          { x: 40, y: 60 },
        ],
        false,
        8
      )
    ).toBe('M0,0L0,22Q0,30 8,30L32,30Q40,30 40,38L40,60');
    expect(
      stepPath(
        [
          { x: 0, y: 0 },
          { x: 60, y: 40 },
        ],
        true,
        8
      )
    ).toBe('M0,0L22,0Q30,0 30,8L30,32Q30,40 38,40L60,40');
  });

  it('ignores points on a straight line', () => {
    expect(
      stepPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 20 },
          { x: 0, y: 50 },
        ],
        false
      )
    ).toBe('M0,0L0,50');
  });
});
