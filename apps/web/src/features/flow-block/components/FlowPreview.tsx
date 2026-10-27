import { lazyNamed } from '@core/util/lazyNamed';
import { cn } from '@ui';
import { Suspense } from 'solid-js';
import type { FlowLanguage } from '../language';

const FlowBlock = lazyNamed(() => import('./FlowBlock'), 'FlowBlock');

/**
 * The chart at a fixed height, so a block in a channel or chat never changes
 * size while the renderer chunk loads or the source changes.
 */
export function FlowPreview(props: {
  language: FlowLanguage;
  source: string;
  class?: string;
}) {
  return (
    <div
      class={cn('h-[400px] w-full mobile:h-[320px]', props.class)}
      data-flow-preview
    >
      <Suspense>
        <FlowBlock language={props.language} source={props.source} />
      </Suspense>
    </div>
  );
}
