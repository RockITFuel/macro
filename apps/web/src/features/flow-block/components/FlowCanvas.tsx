import {
  Background,
  BaseEdge,
  Controls,
  createEdgeStore,
  createNodeStore,
  type EdgeProps,
  Handle,
  MarkerType,
  type NodeProps,
  Position,
  SolidFlow,
} from '@dschz/solid-flow';
import '@dschz/solid-flow/dist/style.css';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import DiamondIcon from '@icon/system/regular/diamond.svg';
import HexagonIcon from '@icon/system/regular/hexagon.svg';
import { createUniqueId, type JSX, Show } from 'solid-js';
import {
  type FlowDirection,
  type FlowGraph,
  type FlowNode,
  type FlowStyle,
  nodeStyle,
} from '../core/graph';
import { type FlowLayout, type Point, stepPath } from '../core/layout';
import '../flow-block.css';

type StepData = { node: FlowNode; style: FlowStyle; direction: FlowDirection };
type GroupData = { label: string; depth: number };

const HANDLES: Record<FlowDirection, { target: Position; source: Position }> = {
  TB: { target: Position.Top, source: Position.Bottom },
  BT: { target: Position.Bottom, source: Position.Top },
  LR: { target: Position.Left, source: Position.Right },
  RL: { target: Position.Right, source: Position.Left },
};

function cardStyle(style: FlowStyle): JSX.CSSProperties {
  return {
    'background-color': style.fill,
    'border-color': style.stroke,
    color: style.color,
    'border-width': style.strokeWidth,
    'border-style': style.strokeDasharray ? 'dashed' : undefined,
    'font-weight': style.fontWeight,
  };
}

/** Alpha's step card: icon well for decisions, title over muted detail, result footer. */
function FlowStep(props: NodeProps<StepData, 'step'>) {
  const node = () => props.data.node;
  const handles = () => HANDLES[props.data.direction];
  const icon = () =>
    node().shape === 'diamond'
      ? DiamondIcon
      : node().shape === 'hexagon'
        ? HexagonIcon
        : null;
  return (
    <div
      class="flow-step"
      data-shape={node().shape}
      data-status={node().status}
      style={cardStyle(props.data.style)}
    >
      <Handle type="target" position={handles().target} isConnectable={false} />
      <div class="flow-step__main">
        <Show when={icon()}>
          {(Icon) => {
            const Glyph = Icon();
            return (
              <span class="flow-step__icon" aria-hidden="true">
                <Glyph class="size-4" />
              </span>
            );
          }}
        </Show>
        <Show
          when={node().status && !node().result && node().shape !== 'circle'}
        >
          <span class="flow-step__status" aria-hidden="true" />
        </Show>
        <span class="flow-step__copy">
          <strong>{node().label}</strong>
          <Show when={node().detail}>
            <span>{node().detail}</span>
          </Show>
        </span>
      </div>
      <Show when={node().result}>
        <div class="flow-step__result">
          <span class="flow-step__status" aria-hidden="true" />
          <span>{node().result}</span>
        </div>
      </Show>
      <Handle type="source" position={handles().source} isConnectable={false} />
    </div>
  );
}

function FlowGroupBox(props: NodeProps<GroupData, 'cluster'>) {
  return (
    <div class="flow-group" data-depth={props.data.depth % 2}>
      <span class="flow-group__title">{props.data.label}</span>
    </div>
  );
}

const nodeTypes = { step: FlowStep, cluster: FlowGroupBox };

type RouteData = { points: Point[]; labelAt?: Point; horizontal: boolean };

/** Follows dagre's route instead of a straight handle-to-handle step. */
function RoutedEdge(props: EdgeProps<RouteData, 'routed'>) {
  const route = () => {
    const data = props.data;
    return data && data.points.length >= 2
      ? data.points
      : [
          { x: props.sourceX, y: props.sourceY },
          { x: props.targetX, y: props.targetY },
        ];
  };
  return (
    <BaseEdge
      path={stepPath(route(), props.data?.horizontal ?? false)}
      label={props.label}
      labelX={props.data?.labelAt?.x}
      labelY={props.data?.labelAt?.y}
      markerStart={props.markerStart}
      markerEnd={props.markerEnd}
      interactionWidth={0}
    />
  );
}

const edgeTypes = { routed: RoutedEdge };

function toNodes(graph: FlowGraph, layout: FlowLayout) {
  const groups = [...layout.groups]
    .sort((a, b) => a.depth - b.depth)
    .map((entry) => ({
      id: `group:${entry.group.id}`,
      type: 'cluster' as const,
      data: { label: entry.group.label, depth: entry.depth },
      position: { x: entry.box.x, y: entry.box.y },
      width: entry.box.width,
      height: entry.box.height,
      style: { width: `${entry.box.width}px`, height: `${entry.box.height}px` },
      zIndex: -10 + entry.depth,
      selectable: false,
      draggable: false,
      focusable: false,
    }));
  const steps = layout.nodes.map((entry) => ({
    id: entry.node.id,
    type: 'step' as const,
    data: {
      node: entry.node,
      style: nodeStyle(graph, entry.node),
      direction: graph.direction,
    },
    position: { x: entry.box.x, y: entry.box.y },
    width: entry.box.width,
    height: entry.box.height,
    style: { width: `${entry.box.width}px`, height: `${entry.box.height}px` },
    ariaRole: 'listitem' as const,
  }));
  return [...groups, ...steps];
}

function toEdges(graph: FlowGraph, layout: FlowLayout) {
  const horizontal = graph.direction === 'LR' || graph.direction === 'RL';
  return layout.edges.map(({ edge, points, labelAt }) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'routed' as const,
    data: { points, labelAt, horizontal },
    label: edge.label,
    class: `flow-edge flow-edge--${edge.stroke}`,
    markerEnd: edge.arrowEnd
      ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'none' }
      : undefined,
    markerStart: edge.arrowStart
      ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'none' }
      : undefined,
    selectable: false,
    focusable: false,
  }));
}

/**
 * Read-only interactive canvas: pan (drag on desktop, two fingers on touch so a
 * page still scrolls under one), pinch/ctrl-wheel zoom, and zoom/fit controls.
 * A new layout remounts it so it fits the view again.
 */
export function FlowCanvas(props: {
  graph: FlowGraph;
  layout: FlowLayout;
  label: string;
}) {
  const id = `flow-${createUniqueId()}`;
  const [nodes] = createNodeStore<typeof nodeTypes>(
    toNodes(props.graph, props.layout)
  );
  const [edges] = createEdgeStore<typeof edgeTypes>(
    toEdges(props.graph, props.layout)
  );
  const touch = isTouchDevice();

  return (
    <div class="flow-canvas" role="figure" aria-label={props.label}>
      <SolidFlow
        id={id}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={!touch}
        panOnScroll={false}
        zoomOnScroll={false}
        preventScrolling={false}
        zoomOnPinch
        zoomOnDoubleClick
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={20} size={1} />
        <Controls showLock={false} position="bottom-right" />
      </SolidFlow>
    </div>
  );
}
