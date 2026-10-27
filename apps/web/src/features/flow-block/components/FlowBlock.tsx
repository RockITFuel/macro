import { throttledDependent } from '@core/util/debounce';
import WarningIcon from '@icon/system/regular/warning.svg';
import { createMemo, Show } from 'solid-js';
import type { FlowGraph } from '../core/graph';
import { layoutFlow } from '../core/layout';
import { describeParseError, parseFlowSource } from '../core/parse';
import type { FlowLanguage } from '../language';
import { FlowCanvas } from './FlowCanvas';

type Rendered = { graph: FlowGraph; layout: ReturnType<typeof layoutFlow> };

/**
 * Parses and draws a flow block's source. While the source is broken (mid-edit,
 * or an agent still streaming) it keeps the last chart that parsed and names the
 * problem; with nothing to show it shows only the problem.
 */
export function FlowBlock(props: { language: FlowLanguage; source: string }) {
  const source = throttledDependent(() => props.source, 200);
  const parsed = createMemo(() => parseFlowSource(props.language, source()));

  let lastGood: Rendered | null = null;
  const rendered = createMemo<Rendered | null>(() => {
    const result = parsed();
    if (result.isErr()) return lastGood;
    lastGood = { graph: result.value, layout: layoutFlow(result.value) };
    return lastGood;
  });
  const problem = () => {
    const result = parsed();
    return result.isErr() ? describeParseError(result.error) : null;
  };
  const label = () => {
    const chart = rendered();
    return chart
      ? `Flowchart with ${chart.graph.nodes.length} steps`
      : 'Flowchart';
  };

  return (
    <div class="flow-block" data-flow-block>
      <Show
        when={rendered()}
        keyed
        fallback={
          <div class="flow-block__empty" role="status">
            <WarningIcon class="size-4 shrink-0" />
            <span>{problem()}</span>
          </div>
        }
      >
        {(chart) => (
          <FlowCanvas
            graph={chart.graph}
            layout={chart.layout}
            label={label()}
          />
        )}
      </Show>
      <Show when={rendered() && problem()}>
        <div class="flow-block__problem" role="status">
          <WarningIcon class="size-3.5 shrink-0" />
          <span>{problem()}</span>
        </div>
      </Show>
    </div>
  );
}
