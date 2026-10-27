import { err, ok, type Result } from 'neverthrow';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import {
  FLOW_LIMITS,
  type FlowDirection,
  type FlowEdge,
  type FlowGraph,
  type FlowGroup,
  type FlowNode,
  type FlowParseError,
  type FlowStyle,
  parseStyleList,
} from './graph';

const id = z.union([z.string().min(1), z.number()]).transform(String);

const shape = z.enum([
  'rect',
  'round',
  'stadium',
  'subroutine',
  'circle',
  'diamond',
  'hexagon',
]);

const nodeSchema = z.union([
  id,
  z.object({
    id,
    label: z.string().optional(),
    detail: z.string().optional(),
    result: z.string().optional(),
    shape: shape.optional(),
    status: z.enum(['success', 'warning', 'danger', 'neutral']).optional(),
    group: id.optional(),
    class: z.union([z.string(), z.array(z.string())]).optional(),
  }),
]);

const edgeSchema = z.union([
  z.string(),
  // YAML reads `- a -> b: label` as a one-key map.
  z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .refine((value) => Object.keys(value).length === 1)
    .transform((value) => {
      const [[edge, label]] = Object.entries(value);
      return label === null ? edge : `${edge}: ${label}`;
    }),
  z.object({
    from: id,
    to: id,
    label: z.string().optional(),
    style: z.enum(['solid', 'dashed', 'dotted', 'thick']).optional(),
    arrow: z.enum(['end', 'both', 'none']).optional(),
  }),
]);

const styleSchema = z.union([
  z.string(),
  z.record(z.string(), z.union([z.string(), z.number()])),
]);

const flowSchema = z.object({
  direction: z
    .enum(['TB', 'TD', 'BT', 'LR', 'RL', 'tb', 'td', 'bt', 'lr', 'rl'])
    .optional(),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
  groups: z
    .array(
      z.union([
        id,
        z.object({ id, label: z.string().optional(), parent: id.optional() }),
      ])
    )
    .default([]),
  classes: z.record(z.string(), styleSchema).default({}),
});

/** `a -> b`, `a --> b: label`, `a -.-> b`, `a ==> b` as an edge shorthand. */
const EDGE_SHORTHAND =
  /^\s*(\S+?)\s*(<)?(-+>|-\.+->|=+>|-{2,}|-\.+-|={2,})\s*(\S+?)\s*(?::\s*(.*))?$/;

/**
 * The `flow` block: a small JSON or YAML document of nodes, edges and groups.
 *
 * ```yaml
 * direction: LR
 * nodes:
 *   - { id: start, label: Start, shape: stadium }
 *   - { id: check, label: Valid?, shape: diamond }
 * edges:
 *   - start -> check
 *   - { from: check, to: done, label: yes }
 * ```
 */
export function parseFlow(source: string): Result<FlowGraph, FlowParseError> {
  if (!source.trim()) return err({ kind: 'empty' });

  const document = parseDocument(source, { prettyErrors: false });
  const yamlError = document.errors[0];
  if (yamlError) {
    return err({
      kind: 'syntax',
      line: yamlError.linePos?.[0]?.line ?? 1,
      message: yamlError.message.split('\n')[0],
    });
  }
  const parsed = flowSchema.safeParse(document.toJS());
  if (!parsed.success) {
    const issue = specificIssue(parsed.error.issues[0]);
    const path = issue.path.join('.');
    return err({
      kind: 'syntax',
      line: lineOf(source, document, issue.path),
      message: path ? `${path}: ${issue.message}` : issue.message,
    });
  }
  const data = parsed.data;

  const nodes = new Map<string, FlowNode>();
  const ensureNode = (nodeId: string) => {
    let node = nodes.get(nodeId);
    if (!node) {
      node = { id: nodeId, label: nodeId, shape: 'rect', classes: [] };
      nodes.set(nodeId, node);
    }
    return node;
  };

  for (const entry of data.nodes) {
    if (typeof entry === 'string') {
      ensureNode(entry);
      continue;
    }
    const node = ensureNode(entry.id);
    node.label = entry.label ?? entry.id;
    node.detail = entry.detail;
    node.result = entry.result;
    node.shape = entry.shape ?? 'rect';
    node.status = entry.status;
    node.group = entry.group;
    node.classes =
      entry.class === undefined
        ? []
        : Array.isArray(entry.class)
          ? entry.class
          : entry.class.split(/[\s,]+/).filter(Boolean);
  }

  const edges: FlowEdge[] = [];
  for (const [index, entry] of data.edges.entries()) {
    if (typeof entry === 'string') {
      const match = EDGE_SHORTHAND.exec(entry);
      if (!match) {
        return err({
          kind: 'syntax',
          line: lineOf(source, document, ['edges', index]),
          message: `edges.${index}: write "a -> b" or { from: a, to: b }.`,
        });
      }
      const [, from, back, operator, to, label] = match;
      edges.push({
        id: `e${index}`,
        source: ensureNode(from).id,
        target: ensureNode(to).id,
        label: label?.trim() || undefined,
        stroke: operator.startsWith('=')
          ? 'thick'
          : operator.includes('.')
            ? 'dotted'
            : 'solid',
        arrowEnd: operator.endsWith('>'),
        arrowStart: back === '<',
      });
      continue;
    }
    edges.push({
      id: `e${index}`,
      source: ensureNode(entry.from).id,
      target: ensureNode(entry.to).id,
      label: entry.label || undefined,
      stroke:
        entry.style === 'thick'
          ? 'thick'
          : entry.style === 'dashed' || entry.style === 'dotted'
            ? 'dotted'
            : 'solid',
      arrowEnd: entry.arrow !== 'none',
      arrowStart: entry.arrow === 'both',
    });
  }

  const groups = new Map<string, FlowGroup>();
  for (const entry of data.groups) {
    const group =
      typeof entry === 'string'
        ? { id: entry, label: entry }
        : {
            id: entry.id,
            label: entry.label ?? entry.id,
            parent: entry.parent,
          };
    groups.set(group.id, group);
  }
  for (const node of nodes.values()) {
    if (node.group && !groups.has(node.group)) {
      groups.set(node.group, { id: node.group, label: node.group });
    }
  }
  for (const group of groups.values()) {
    if (group.parent && !groups.has(group.parent)) group.parent = undefined;
  }
  const clash = [...nodes.keys()].find((nodeId) => groups.has(nodeId));
  if (clash) {
    return err({
      kind: 'syntax',
      line: lineOf(source, document, ['groups']),
      message: `"${clash}" is both a node and a group; edges connect nodes.`,
    });
  }
  if (hasGroupCycle(groups)) {
    return err({
      kind: 'syntax',
      line: lineOf(source, document, ['groups']),
      message: 'groups: a group cannot contain itself.',
    });
  }

  if (nodes.size > FLOW_LIMITS.nodes || edges.length > FLOW_LIMITS.edges) {
    return err({
      kind: 'too-large',
      message: `Flowcharts are limited to ${FLOW_LIMITS.nodes} nodes and ${FLOW_LIMITS.edges} edges.`,
    });
  }
  if (nodes.size === 0) return err({ kind: 'empty' });

  const classDefs: Record<string, FlowStyle> = {};
  for (const [name, style] of Object.entries(data.classes)) {
    classDefs[name] = parseStyleList(
      typeof style === 'string'
        ? style
        : Object.entries(style)
            .map(([key, value]) => `${key}:${value}`)
            .join(',')
    );
  }

  return ok({
    direction: toDirection(data.direction),
    nodes: [...nodes.values()],
    edges,
    groups: [...groups.values()],
    classDefs,
  });
}

type Issue = z.core.$ZodIssue;

/** A union reports "Invalid input"; descend into the branch that got furthest. */
function specificIssue(issue: Issue): { path: PropertyKey[]; message: string } {
  if (issue.code === 'invalid_union' && issue.errors.length > 0) {
    const candidates = issue.errors
      .flat()
      .filter((inner) => inner.path.length > 0);
    const best = candidates.sort((a, b) => b.path.length - a.path.length)[0];
    if (best) {
      const inner = specificIssue(best);
      return { path: [...issue.path, ...inner.path], message: inner.message };
    }
  }
  return { path: issue.path, message: issue.message };
}

function toDirection(value: string | undefined): FlowDirection {
  const upper = value?.toUpperCase();
  if (upper === 'LR' || upper === 'RL' || upper === 'BT') return upper;
  return 'TB';
}

function hasGroupCycle(groups: Map<string, FlowGroup>): boolean {
  for (const start of groups.values()) {
    const seen = new Set<string>();
    let current: FlowGroup | undefined = start;
    while (current?.parent) {
      if (seen.has(current.id)) return true;
      seen.add(current.id);
      current = groups.get(current.parent);
    }
  }
  return false;
}

function lineOf(
  source: string,
  document: ReturnType<typeof parseDocument>,
  path: ReadonlyArray<PropertyKey>
): number {
  const keys = path.filter(
    (key): key is string | number =>
      typeof key === 'string' || typeof key === 'number'
  );
  for (let length = keys.length; length > 0; length--) {
    const node: unknown = document.getIn(keys.slice(0, length), true);
    const range =
      node && typeof node === 'object' && 'range' in node
        ? (node as { range?: [number, number, number] }).range
        : undefined;
    if (range) return source.slice(0, range[0]).split('\n').length;
  }
  return 1;
}
