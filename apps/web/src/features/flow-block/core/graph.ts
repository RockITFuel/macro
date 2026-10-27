/** Layout direction: top-bottom, bottom-top, left-right, right-left. */
export type FlowDirection = 'TB' | 'BT' | 'LR' | 'RL';

export type FlowShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'circle'
  | 'diamond'
  | 'hexagon';

export type FlowStatus = 'success' | 'warning' | 'danger' | 'neutral';

export type FlowStroke = 'solid' | 'dotted' | 'thick';

/** The few style properties a `classDef` may set; values are validated colors and lengths. */
export type FlowStyle = {
  fill?: string;
  stroke?: string;
  color?: string;
  strokeWidth?: string;
  strokeDasharray?: string;
  fontWeight?: string;
};

export type FlowNode = {
  id: string;
  label: string;
  detail?: string;
  /** Footer line, as in Alpha's step cards (`Received · 10:42`). */
  result?: string;
  shape: FlowShape;
  status?: FlowStatus;
  classes: string[];
  group?: string;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  stroke: FlowStroke;
  arrowEnd: boolean;
  arrowStart: boolean;
};

export type FlowGroup = {
  id: string;
  label: string;
  parent?: string;
};

export type FlowGraph = {
  direction: FlowDirection;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
  classDefs: Record<string, FlowStyle>;
};

export type FlowParseError =
  | { kind: 'empty' }
  | { kind: 'syntax'; line: number; message: string }
  | { kind: 'too-large'; message: string };

/**
 * Beyond this a chart is unreadable in a document and layout gets slow. The
 * statement length bounds the parser's own work on a single line.
 */
export const FLOW_LIMITS = {
  nodes: 300,
  edges: 600,
  groups: 100,
  statementLength: 2000,
} as const;

export const FLOW_TOO_LARGE: FlowParseError = {
  kind: 'too-large',
  message: `Flowcharts are limited to ${FLOW_LIMITS.nodes} nodes, ${FLOW_LIMITS.edges} edges and ${FLOW_LIMITS.groups} subgraphs.`,
};

const COLOR =
  /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(rgb|rgba|hsl|hsla|oklch)\([0-9.,%\s/-]+\))$/i;
const LENGTH = /^[0-9.]+(px)?$/;
const DASH = /^[0-9.]+(px)?([\s,]+[0-9.]+(px)?)*$/;
const WEIGHT = /^(normal|bold|[1-9]00)$/;

/** Parses `fill:#f96,stroke:#333,stroke-width:2px`; drops anything that isn't a plain value. */
export function parseStyleList(text: string): FlowStyle {
  const style: FlowStyle = {};
  for (const part of text.split(/[,;](?![^(]*\))/)) {
    const index = part.indexOf(':');
    if (index < 0) continue;
    const key = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).trim();
    if (key === 'fill' && COLOR.test(value)) style.fill = value;
    else if (key === 'stroke' && COLOR.test(value)) style.stroke = value;
    else if (key === 'color' && COLOR.test(value)) style.color = value;
    else if (key === 'stroke-width' && LENGTH.test(value))
      style.strokeWidth = value.endsWith('px') ? value : `${value}px`;
    else if (key === 'stroke-dasharray' && DASH.test(value))
      style.strokeDasharray = value;
    else if (key === 'font-weight' && WEIGHT.test(value))
      style.fontWeight = value;
  }
  return style;
}

/** Merges the class styles a node uses, `default` first, later classes winning. */
export function nodeStyle(graph: FlowGraph, node: FlowNode): FlowStyle {
  const style: FlowStyle = {};
  for (const name of ['default', ...node.classes]) {
    Object.assign(style, graph.classDefs[name]);
  }
  return style;
}
