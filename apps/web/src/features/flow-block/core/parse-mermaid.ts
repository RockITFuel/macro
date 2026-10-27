import { err, ok, type Result } from 'neverthrow';
import {
  FLOW_LIMITS,
  type FlowDirection,
  type FlowEdge,
  type FlowGraph,
  type FlowGroup,
  type FlowNode,
  type FlowParseError,
  type FlowShape,
  type FlowStroke,
  parseStyleList,
} from './graph';

/**
 * A Mermaid flowchart subset: `flowchart`/`graph` with a direction, node shapes
 * `[ ]` `( )` `([ ])` `[[ ]]` `(( ))` `{ }` `{{ }}`, edges `-->` `---` `-.->` `==>`
 * with `|label|` or inline `-- label -->` text, `&` fan-out, `subgraph … end`,
 * `classDef`, `class` and `:::class`. Styling and interaction statements
 * (`style`, `linkStyle`, `click`) are ignored; anything else is a syntax error
 * with its line number.
 */
export function parseMermaid(
  source: string
): Result<FlowGraph, FlowParseError> {
  const statements = splitStatements(source);
  if (statements.length === 0) return err({ kind: 'empty' });

  const [header, ...body] = statements;
  const headerMatch = /^(flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i.exec(
    header.text
  );
  if (!headerMatch) {
    return err({
      kind: 'syntax',
      line: header.line,
      message:
        'Only flowcharts are supported: start with `flowchart TD` or `graph LR`.',
    });
  }
  const direction = toDirection(headerMatch[2]);

  const builder = new GraphBuilder(direction);
  const groupStack: string[] = [];

  for (const statement of body) {
    const result = parseStatement(statement.text, builder, groupStack);
    if (result !== null) {
      return err({ kind: 'syntax', line: statement.line, message: result });
    }
    if (
      builder.nodes.size > FLOW_LIMITS.nodes ||
      builder.edges.length > FLOW_LIMITS.edges
    ) {
      return err({
        kind: 'too-large',
        message: `Flowcharts are limited to ${FLOW_LIMITS.nodes} nodes and ${FLOW_LIMITS.edges} edges.`,
      });
    }
  }
  if (groupStack.length > 0) {
    const last = statements[statements.length - 1];
    return err({
      kind: 'syntax',
      line: last.line,
      message: `Subgraph "${groupStack[groupStack.length - 1]}" is missing its \`end\`.`,
    });
  }
  return ok(builder.build());
}

type Statement = { text: string; line: number };

/** Lines, split again on `;` outside quotes and brackets, without `%%` comments. */
function splitStatements(source: string): Statement[] {
  const statements: Statement[] = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trimStart().startsWith('%%') ? '' : raw;
    let depth = 0;
    let quoted = false;
    let start = 0;
    const push = (end: number) => {
      const text = line.slice(start, end).trim();
      if (text) statements.push({ text, line: index + 1 });
    };
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') quoted = !quoted;
      else if (quoted) continue;
      else if ('[({'.includes(char)) depth++;
      else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
      else if (char === ';' && depth === 0) {
        push(i);
        start = i + 1;
      }
    }
    push(line.length);
  });
  return statements;
}

function toDirection(value: string | undefined): FlowDirection {
  const upper = value?.toUpperCase();
  if (upper === 'LR' || upper === 'RL' || upper === 'BT') return upper;
  return 'TB';
}

class GraphBuilder {
  nodes = new Map<string, FlowNode>();
  edges: FlowEdge[] = [];
  groups = new Map<string, FlowGroup>();
  classDefs: FlowGraph['classDefs'] = {};
  constructor(readonly direction: FlowDirection) {}

  node(id: string, group: string | undefined): FlowNode {
    let node = this.nodes.get(id);
    if (!node) {
      node = { id, label: id, shape: 'rect', classes: [] };
      this.nodes.set(id, node);
    }
    if (group && !node.group && !this.groups.has(id)) node.group = group;
    return node;
  }

  build(): FlowGraph {
    // Mermaid lets an edge end at a subgraph; point it at the group's first node.
    const firstMember = (groupId: string): string | undefined => {
      for (const node of this.nodes.values()) {
        if (node.group === groupId) return node.id;
      }
      for (const group of this.groups.values()) {
        if (group.parent === groupId) {
          const nested = firstMember(group.id);
          if (nested) return nested;
        }
      }
      return undefined;
    };
    // A subgraph id used in an edge is the subgraph, not a new node.
    for (const id of this.groups.keys()) this.nodes.delete(id);
    const resolve = (id: string) =>
      this.groups.has(id) ? firstMember(id) : id;

    const edges: FlowEdge[] = [];
    for (const edge of this.edges) {
      const source = resolve(edge.source);
      const target = resolve(edge.target);
      if (source && target) edges.push({ ...edge, source, target });
    }
    return {
      direction: this.direction,
      nodes: [...this.nodes.values()],
      edges,
      groups: [...this.groups.values()],
      classDefs: this.classDefs,
    };
  }
}

/** Returns an error message, or null when the statement was applied. */
function parseStatement(
  text: string,
  builder: GraphBuilder,
  groupStack: string[]
): string | null {
  const currentGroup = groupStack[groupStack.length - 1];

  if (/^end$/i.test(text)) {
    if (groupStack.length === 0) return '`end` without a matching `subgraph`.';
    groupStack.pop();
    return null;
  }

  const subgraph = /^subgraph\b\s*(.*)$/i.exec(text);
  if (subgraph) {
    const group = parseSubgraphTitle(subgraph[1], builder.groups.size);
    if (!group) return 'A subgraph needs an id or a title.';
    builder.groups.set(group.id, { ...group, parent: currentGroup });
    groupStack.push(group.id);
    return null;
  }

  if (/^direction\s+(TB|TD|BT|LR|RL)$/i.test(text)) return null;
  if (/^(style|linkStyle|click)\b/i.test(text)) return null;

  const classDef = /^classDef\s+([\w,-]+)\s+(.+)$/i.exec(text);
  if (classDef) {
    const style = parseStyleList(classDef[2]);
    for (const name of classDef[1].split(',')) {
      if (name) builder.classDefs[name] = style;
    }
    return null;
  }

  const classStatement = /^class\s+([^\s]+)\s+([\w-]+)$/i.exec(text);
  if (classStatement) {
    for (const id of classStatement[1].split(',')) {
      if (id) builder.node(id, currentGroup).classes.push(classStatement[2]);
    }
    return null;
  }

  return parseChain(text, builder, currentGroup);
}

function parseSubgraphTitle(
  rest: string,
  index: number
): { id: string; label: string } | null {
  const trimmed = rest.trim();
  if (!trimmed) return null;
  const quoted = /^"([^"]*)"$/.exec(trimmed);
  if (quoted) return { id: `subgraph-${index}`, label: quoted[1] };
  const withTitle = /^([\p{L}\p{N}_-]+)\s*\[\s*"?([^"\]]*)"?\s*\]$/u.exec(
    trimmed
  );
  if (withTitle) return { id: withTitle[1], label: withTitle[2] };
  if (/^[\p{L}\p{N}_-]+$/u.test(trimmed))
    return { id: trimmed, label: trimmed };
  return { id: trimmed, label: trimmed };
}

/** Bracket pairs, longest opener first so `((` wins over `(`. */
const SHAPES: ReadonlyArray<[open: string, close: string, shape: FlowShape]> = [
  ['(((', ')))', 'circle'],
  ['((', '))', 'circle'],
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'round'],
  ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'rect'],
  ['[\\', '\\]', 'rect'],
  ['[/', '\\]', 'rect'],
  ['[\\', '/]', 'rect'],
  ['[', ']', 'rect'],
  ['(', ')', 'round'],
  ['{', '}', 'diamond'],
  ['>', ']', 'rect'],
];

const ID = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[-.](?![-.=>]))*/u;

class Cursor {
  index = 0;
  constructor(readonly text: string) {}
  get rest() {
    return this.text.slice(this.index);
  }
  skipSpace() {
    while (this.index < this.text.length && /\s/.test(this.text[this.index]))
      this.index++;
  }
  done() {
    this.skipSpace();
    return this.index >= this.text.length;
  }
}

function parseChain(
  text: string,
  builder: GraphBuilder,
  group: string | undefined
): string | null {
  const cursor = new Cursor(text);
  let previous = parseNodeGroup(cursor, builder, group);
  if (typeof previous === 'string') return previous;

  while (!cursor.done()) {
    const link = parseLink(cursor);
    if (typeof link === 'string') return link;
    cursor.skipSpace();
    const next = parseNodeGroup(cursor, builder, group);
    if (typeof next === 'string') return next;
    for (const source of previous) {
      for (const target of next) {
        builder.edges.push({
          id: `e${builder.edges.length}`,
          source,
          target,
          ...link,
        });
      }
    }
    previous = next;
  }
  return null;
}

function parseNodeGroup(
  cursor: Cursor,
  builder: GraphBuilder,
  group: string | undefined
): string[] | string {
  const ids: string[] = [];
  for (;;) {
    cursor.skipSpace();
    const id = parseNode(cursor, builder, group);
    if (id === null) {
      const near = cursor.rest.slice(0, 20);
      return near
        ? `Expected a node id near "${near}".`
        : 'Expected a node after the arrow.';
    }
    if (typeof id === 'object') return id.error;
    ids.push(id);
    cursor.skipSpace();
    if (cursor.text[cursor.index] !== '&') return ids;
    cursor.index++;
  }
}

function parseNode(
  cursor: Cursor,
  builder: GraphBuilder,
  group: string | undefined
): string | null | { error: string } {
  const idMatch = ID.exec(cursor.rest);
  if (!idMatch) return null;
  const id = idMatch[0];
  if (/^end$/i.test(id)) return { error: '`end` cannot be used as a node id.' };
  cursor.index += id.length;
  const node = builder.node(id, group);

  const rest = cursor.rest;
  if (rest.startsWith('@{')) {
    return { error: 'The `@{ shape: … }` node syntax is not supported.' };
  }
  const shape = SHAPES.find(([open]) => rest.startsWith(open));
  if (shape) {
    const [open, close, kind] = shape;
    const label = readLabel(rest.slice(open.length), close);
    if (label === null) {
      return { error: `Node "${id}" is missing its closing \`${close}\`.` };
    }
    cursor.index += open.length + label.consumed + close.length;
    node.shape = kind;
    const lines = label.text.split('\n');
    node.label = lines[0].trim() || id;
    const detail = lines.slice(1).join('\n').trim();
    node.detail = detail || undefined;
  }

  const classMatch = /^:::([\w-]+)/.exec(cursor.rest);
  if (classMatch) {
    node.classes.push(classMatch[1]);
    cursor.index += classMatch[0].length;
  }
  return id;
}

/** Reads a label up to `close`, honoring a quoted label that may contain brackets. */
function readLabel(
  text: string,
  close: string
): { text: string; consumed: number } | null {
  const leading = text.length - text.trimStart().length;
  const body = text.slice(leading);
  if (body.startsWith('"')) {
    const end = body.indexOf('"', 1);
    if (end < 0) return null;
    const after = body.slice(end + 1);
    const trailing = after.length - after.trimStart().length;
    if (!after.trimStart().startsWith(close)) return null;
    return {
      text: cleanLabel(body.slice(1, end)),
      consumed: leading + end + 1 + trailing,
    };
  }
  const end = text.indexOf(close);
  if (end < 0) return null;
  return { text: cleanLabel(text.slice(0, end)), consumed: end };
}

const ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  '35': '#',
};

function cleanLabel(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/#(\w+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/^`(.*)`$/s, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

type Link = Pick<FlowEdge, 'label' | 'stroke' | 'arrowEnd' | 'arrowStart'>;

const ARROW = String.raw`(>|[xo](?=[\s|]|$))?`;
const INLINE_TEXT_LINKS: ReadonlyArray<[RegExp, FlowStroke]> = [
  [new RegExp(String.raw`^(<)?--(?![-.>])\s*(.+?)\s*-{2,}` + ARROW), 'solid'],
  [new RegExp(String.raw`^(<)?-\.(?![-.>])\s*(.+?)\s*\.+-` + ARROW), 'dotted'],
  [new RegExp(String.raw`^(<)?==(?![=>])\s*(.+?)\s*={2,}` + ARROW), 'thick'],
];
const PLAIN_LINK = new RegExp(String.raw`^(<)?(-{2,}|={2,}|-\.+-)` + ARROW);

function parseLink(cursor: Cursor): Link | string {
  cursor.skipSpace();
  const rest = cursor.rest;
  let link: Link | null = null;

  const plain = PLAIN_LINK.exec(rest);
  // `--` and `==` alone open an inline label (`-- yes -->`), they aren't links.
  if (plain && (plain[3] !== undefined || !/^(--|==)$/.test(plain[2]))) {
    cursor.index += plain[0].length;
    link = {
      stroke: plain[2].startsWith('=')
        ? 'thick'
        : plain[2].includes('.')
          ? 'dotted'
          : 'solid',
      arrowEnd: plain[3] !== undefined,
      arrowStart: plain[1] === '<',
    };
  } else {
    for (const [pattern, stroke] of INLINE_TEXT_LINKS) {
      const match = pattern.exec(rest);
      if (!match) continue;
      cursor.index += match[0].length;
      link = {
        label: cleanLabel(match[2]) || undefined,
        stroke,
        arrowEnd: match[3] !== undefined,
        arrowStart: match[1] === '<',
      };
      break;
    }
  }
  if (!link) {
    return `Expected an arrow such as \`-->\` near "${rest.slice(0, 20)}".`;
  }

  const pipe = /^\s*\|\s*(?:"([^"]*)"|([^|]*))\s*\|/.exec(cursor.rest);
  if (pipe) {
    link.label = cleanLabel(pipe[1] ?? pipe[2]) || undefined;
    cursor.index += pipe[0].length;
  }
  return link;
}
