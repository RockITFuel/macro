import { cn } from '@ui';
import { type JSX, Show } from 'solid-js';

export function ColumnLabel(props: { title: string; children: JSX.Element }) {
  return (
    <h2
      class="min-w-0 truncate text-sm font-medium text-ink"
      title={props.title}
    >
      {props.children}
    </h2>
  );
}

export function ColumnCount(props: {
  count: number;
  'aria-label'?: string;
  pill?: boolean;
}) {
  return (
    <span
      class={cn(
        'shrink-0 text-xs tabular-nums text-ink-muted',
        props.pill && 'rounded-full bg-surface-3 px-2 leading-5'
      )}
      aria-label={props['aria-label']}
    >
      {props.count}
    </span>
  );
}

/**
 * A card-sized slot where a dragged card will land. Adapted from Project Alpha
 * packages/ui/src/kanban (© Luka Pelgrom), after the "shadow drop" of
 * Atlassian's Pragmatic drag and drop board.
 */
export function LandingPlaceholder(props: { height?: number; label?: string }) {
  return (
    <div
      aria-hidden="true"
      data-kanban-landing=""
      class="flex items-center justify-center rounded-lg border-2 border-dashed border-accent/40 bg-accent/5 px-3 text-center text-xs text-ink-muted"
      style={{ height: `${props.height ?? 104}px` }}
    >
      <Show when={props.label}>
        <span class="line-clamp-2">{props.label}</span>
      </Show>
    </div>
  );
}

export function CardHeader(props: { class?: string; children: JSX.Element }) {
  return (
    <div
      class={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 p-3 pb-2 last:pb-3 [&_[data-cell-display]]:min-h-6 [&_[data-cell-display]]:p-0 [&_[data-cell-display]]:text-sm [&_[data-cell-display]]:leading-6 [&_[data-cell-display]>span:last-child]:break-words [&_[data-cell-display]>span:last-child]:whitespace-normal',
        props.class
      )}
    >
      {props.children}
    </div>
  );
}

export function CardFields(props: { class?: string; children: JSX.Element }) {
  return (
    <div
      class={cn(
        'flex flex-wrap items-center gap-1 px-3 pb-3 text-xs text-ink-muted [&_[data-cell-display]]:min-h-6 [&_[data-cell-display]]:p-0 [&_[data-cell-display]]:text-xs',
        props.class
      )}
    >
      {props.children}
    </div>
  );
}

export function CardActions(props: { children: JSX.Element }) {
  return (
    <div
      data-kanban-no-drag
      class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
    >
      {props.children}
    </div>
  );
}

/** Dashed end-of-board panel for an action beyond the existing lanes. */
export function ColumnPlaceholder(props: {
  'aria-label': string;
  children: JSX.Element;
}) {
  return (
    <section
      aria-label={props['aria-label']}
      class="flex h-full min-h-40 w-full flex-col items-center gap-3 rounded-xl border border-dashed border-ink-extra-muted/25 p-4 pt-8 text-ink-muted"
    >
      {props.children}
    </section>
  );
}
