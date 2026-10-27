import { graphlib, layout } from '@dagrejs/dagre';
import type { FlowEdge, FlowGraph, FlowGroup, FlowNode } from './graph';

export type Box = { x: number; y: number; width: number; height: number };

export type LaidOutNode = { node: FlowNode; box: Box };
export type LaidOutGroup = { group: FlowGroup; box: Box; depth: number };

export type Point = { x: number; y: number };

/** An edge along dagre's route: its bends and where its label sits. */
export type LaidOutEdge = { edge: FlowEdge; points: Point[]; labelAt?: Point };

export type FlowLayout = {
  nodes: LaidOutNode[];
  groups: LaidOutGroup[];
  edges: LaidOutEdge[];
  bounds: Box;
};

/** Text metrics for the node card: 13px title, 12px detail (Macro's body sizes). */
const CHAR_WIDTH = 7.4;
const LINE_HEIGHT = 18;
const MAX_LINE_CHARS = 30;
const PADDING_X = 28;
const MIN_WIDTH = 120;
const MAX_WIDTH = MAX_LINE_CHARS * CHAR_WIDTH + PADDING_X + 40;
/** Room above a group's members for its title. */
const GROUP_TITLE = 30;
const GROUP_PAD = 14;

function wrappedLines(text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= MAX_LINE_CHARS)
        line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Estimated card size; deterministic so layout needs no DOM measurement. */
export function nodeSize(node: FlowNode): { width: number; height: number } {
  const title = wrappedLines(node.label);
  const detail = node.detail ? wrappedLines(node.detail) : [];
  const result = node.result ? [node.result] : [];
  const longest = Math.max(
    ...[...title, ...detail, ...result].map((l) => l.length),
    1
  );
  const icon = node.shape === 'diamond' || node.shape === 'hexagon' ? 40 : 0;
  let width = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, longest * CHAR_WIDTH + PADDING_X + icon)
  );
  let height = 22 + (title.length + detail.length) * LINE_HEIGHT;
  if (node.result) height += 28;
  height = Math.max(height, 46);
  if (node.shape === 'circle') {
    const size = Math.max(width * 0.8, height, 88);
    width = size;
    height = size;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function labelSize(label: string): { width: number; height: number } {
  const lines = wrappedLines(label);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    width: Math.round(longest * 6.6 + 16),
    height: lines.length * 16 + 8,
  };
}

/**
 * Lays the graph out with dagre (a compound graph so subgraphs stay together)
 * and returns top-left boxes in flow coordinates.
 */
export function layoutFlow(graph: FlowGraph): FlowLayout {
  const g = new graphlib.Graph({ compound: true, multigraph: true });
  const horizontal = graph.direction === 'LR' || graph.direction === 'RL';
  g.setGraph({
    rankdir: graph.direction,
    nodesep: horizontal ? 24 : 36,
    ranksep: horizontal ? 56 : 40,
    edgesep: 16,
    marginx: 8,
    marginy: 8,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const groupIds = new Set(graph.groups.map((group) => group.id));
  for (const group of graph.groups) {
    g.setNode(group.id, {});
  }
  for (const group of graph.groups) {
    if (group.parent && groupIds.has(group.parent)) {
      g.setParent(group.id, group.parent);
    }
  }
  for (const node of graph.nodes) {
    g.setNode(node.id, nodeSize(node));
    if (node.group && groupIds.has(node.group))
      g.setParent(node.id, node.group);
  }
  for (const edge of graph.edges) {
    const size = edge.label ? labelSize(edge.label) : { width: 0, height: 0 };
    g.setEdge(
      edge.source,
      edge.target,
      { ...size, labelpos: 'c', minlen: 1 },
      edge.id
    );
  }

  // Empty groups have no members to lay out; dagre drops them as plain nodes.
  for (const group of graph.groups) {
    if (g.children(group.id).length === 0)
      g.setNode(
        group.id,
        nodeSize({
          id: group.id,
          label: group.label,
          shape: 'rect',
          classes: [],
        })
      );
  }

  layout(g);

  const nodes: LaidOutNode[] = graph.nodes.map((node) => {
    const placed = g.node(node.id);
    return {
      node,
      box: {
        x: placed.x - placed.width / 2,
        y: placed.y - placed.height / 2,
        width: placed.width,
        height: placed.height,
      },
    };
  });

  const depthOf = (group: FlowGroup): number => {
    let depth = 0;
    let parent = group.parent;
    while (parent && depth < graph.groups.length) {
      depth++;
      parent = graph.groups.find(
        (candidate) => candidate.id === parent
      )?.parent;
    }
    return depth;
  };

  // Grow each group around its members plus a title band, innermost first so
  // parents enclose their grown children.
  const boxes = new Map<string, Box>();
  const groupsByDepth = [...graph.groups].sort(
    (a, b) => depthOf(b) - depthOf(a)
  );
  for (const group of groupsByDepth) {
    const members: Box[] = [
      ...nodes.filter((n) => n.node.group === group.id).map((n) => n.box),
      ...graph.groups
        .filter((child) => child.parent === group.id)
        .flatMap((child) => boxes.get(child.id) ?? []),
    ];
    if (members.length === 0) {
      const placed = g.node(group.id);
      boxes.set(group.id, {
        x: placed.x - placed.width / 2,
        y: placed.y - placed.height / 2,
        width: placed.width,
        height: placed.height,
      });
      continue;
    }
    const inner = union(members);
    boxes.set(group.id, {
      x: inner.x - GROUP_PAD,
      y: inner.y - GROUP_PAD - GROUP_TITLE,
      width: inner.width + GROUP_PAD * 2,
      height: inner.height + GROUP_PAD * 2 + GROUP_TITLE,
    });
  }

  const groups: LaidOutGroup[] = graph.groups.map((group) => ({
    group,
    box: boxes.get(group.id) ?? { x: 0, y: 0, width: 0, height: 0 },
    depth: depthOf(group),
  }));

  const edges: LaidOutEdge[] = graph.edges.map((edge) => {
    const placed = g.edge({ v: edge.source, w: edge.target, name: edge.id });
    const points = (placed?.points ?? []).map((p) => ({ x: p.x, y: p.y }));
    const labelAt =
      edge.label && placed?.x !== undefined && placed.y !== undefined
        ? { x: placed.x, y: placed.y }
        : undefined;
    return { edge, points, labelAt };
  });

  return {
    nodes,
    groups,
    edges,
    bounds: union([...nodes.map((n) => n.box), ...groups.map((g) => g.box)]),
  };
}

function union(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * An orthogonal path through `points` (Alpha's step edges): each hop leaves along
 * the flow axis, turns once halfway, and arrives along it again; corners are
 * rounded by `radius`.
 */
export function stepPath(
  points: Point[],
  horizontal: boolean,
  radius = 8
): string {
  const route = simplify(points);
  if (route.length < 2) return '';
  const corners: Point[] = [route[0]];
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1];
    const to = route[i];
    if (horizontal ? from.y !== to.y : from.x !== to.x) {
      const mid = horizontal ? (from.x + to.x) / 2 : (from.y + to.y) / 2;
      corners.push(
        horizontal ? { x: mid, y: from.y } : { x: from.x, y: mid },
        horizontal ? { x: mid, y: to.y } : { x: to.x, y: mid }
      );
    }
    corners.push(to);
  }
  return roundedPolyline(simplify(corners), radius);
}

/** Drops points on a straight line with their neighbours and near-duplicates. */
function simplify(points: Point[]): Point[] {
  const snapped: Point[] = [];
  for (const point of points) {
    const last = snapped[snapped.length - 1];
    if (last && Math.abs(last.x - point.x) < 1 && Math.abs(last.y - point.y) < 1)
      continue;
    snapped.push(point);
  }
  return snapped.filter((point, i) => {
    if (i === 0 || i === snapped.length - 1) return true;
    const a = snapped[i - 1];
    const b = snapped[i + 1];
    return !(
      (Math.abs(a.x - point.x) < 1 && Math.abs(b.x - point.x) < 1) ||
      (Math.abs(a.y - point.y) < 1 && Math.abs(b.y - point.y) < 1)
    );
  });
}

function roundedPolyline(points: Point[], radius: number): string {
  const fmt = (p: Point) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`;
  let d = `M${fmt(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const inLength = Math.hypot(b.x - a.x, b.y - a.y);
    const outLength = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const before = {
      x: b.x - ((b.x - a.x) / inLength) * r,
      y: b.y - ((b.y - a.y) / inLength) * r,
    };
    const after = {
      x: b.x + ((c.x - b.x) / outLength) * r,
      y: b.y + ((c.y - b.y) / outLength) * r,
    };
    d += `L${fmt(before)}Q${fmt(b)} ${fmt(after)}`;
  }
  return `${d}L${fmt(points[points.length - 1])}`;
}
