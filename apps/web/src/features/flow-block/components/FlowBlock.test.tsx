import { render, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { installCanvasDom } from '../tests/jsdom-canvas';
import { FlowBlock } from './FlowBlock';

beforeAll(installCanvasDom);

const steps = (container: HTMLElement) =>
  [...container.querySelectorAll('.flow-step strong')].map(
    (n) => n.textContent
  );

describe('FlowBlock', () => {
  it('draws mermaid nodes, shapes, groups and edge labels', async () => {
    const rendered = render(() => (
      <FlowBlock
        language="mermaid"
        source={`flowchart LR
          A([Start]) -->|go| B{Valid?}
          subgraph S [Checks]
            B --> C[Done]
          end`}
      />
    ));
    await waitFor(() => expect(steps(rendered.container)).toHaveLength(3));
    expect(steps(rendered.container)).toEqual(['Start', 'Valid?', 'Done']);
    const shapes = [...rendered.container.querySelectorAll('.flow-step')].map(
      (n) => n.getAttribute('data-shape')
    );
    expect(shapes).toEqual(['stadium', 'diamond', 'rect']);
    expect(rendered.container.querySelector('.flow-step__icon')).not.toBeNull();
    expect(
      rendered.container.querySelector('.flow-group__title')?.textContent
    ).toBe('Checks');
    expect(
      rendered.container
        .querySelector('[role="figure"]')
        ?.getAttribute('aria-label')
    ).toBe('Flowchart with 3 steps');
    rendered.unmount();
  });

  it('draws a flow document with result footers and status', async () => {
    const rendered = render(() => (
      <FlowBlock
        language="flow"
        source={`nodes:
  - { id: a, label: Meter, detail: New readings, result: "Received · 10:42", status: success }
  - { id: b, label: Inverter, status: warning }
edges:
  - a -> b`}
      />
    ));
    await waitFor(() =>
      expect(steps(rendered.container)).toEqual(['Meter', 'Inverter'])
    );
    const first = rendered.container.querySelector('.flow-step');
    expect(first?.getAttribute('data-status')).toBe('success');
    expect(first?.querySelector('.flow-step__result')?.textContent).toContain(
      'Received · 10:42'
    );
    rendered.unmount();
  });

  it('applies classDef colors to the card', async () => {
    const rendered = render(() => (
      <FlowBlock
        language="mermaid"
        source={
          'graph TD\nA:::hot --> B\nclassDef hot fill:#ff9966,stroke:#333333'
        }
      />
    ));
    await waitFor(() => expect(steps(rendered.container)).toHaveLength(2));
    const card = rendered.container.querySelector<HTMLElement>('.flow-step');
    expect(card?.style.backgroundColor).toBe('rgb(255, 153, 102)');
    expect(card?.style.borderColor).toBe('rgb(51, 51, 51)');
    rendered.unmount();
  });

  it('shows only the problem when nothing has parsed', () => {
    const rendered = render(() => (
      <FlowBlock language="mermaid" source={'pie title Pets\n"Dogs" : 3'} />
    ));
    expect(rendered.container.querySelector('.flow-canvas')).toBeNull();
    expect(rendered.container.textContent).toContain('Line 1: Only flowcharts');
    rendered.unmount();
  });

  it('keeps the last chart and names the problem while the source is broken', async () => {
    const [source, setSource] = createSignal('graph TD\nA[One] --> B[Two]');
    const rendered = render(() => (
      <FlowBlock language="mermaid" source={source()} />
    ));
    await waitFor(() =>
      expect(steps(rendered.container)).toEqual(['One', 'Two'])
    );

    setSource('graph TD\nA[One] --> B[Two]\nB -->');
    await waitFor(() =>
      expect(
        rendered.container.querySelector('.flow-block__problem')?.textContent
      ).toContain('Line 3')
    );
    expect(steps(rendered.container)).toEqual(['One', 'Two']);

    setSource('graph TD\nA[One] --> B[Two]\nB --> C[Three]');
    await waitFor(() =>
      expect(steps(rendered.container)).toEqual(['One', 'Two', 'Three'])
    );
    expect(rendered.container.querySelector('.flow-block__problem')).toBeNull();
    rendered.unmount();
  });
});
