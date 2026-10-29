import { cn } from '@ui';
import { createSignal, type JSX } from 'solid-js';
import { MIN_MEDIA_WIDTH } from '../primitives/create-media-layout';

const KEYBOARD_STEP = 32;
const KEY_DELTAS: Record<string, number> = {
  ArrowRight: KEYBOARD_STEP,
  ArrowUp: KEYBOARD_STEP,
  ArrowLeft: -KEYBOARD_STEP,
  ArrowDown: -KEYBOARD_STEP,
};

/**
 * A box whose width the user drags from its bottom-right corner (or sets with
 * the arrow keys on that grip). Height follows the content, so the media
 * inside keeps its aspect ratio. The width never exceeds the column.
 */
export function ResizableFrame(props: {
  /** Saved width; the class decides the size while it is undefined. */
  width: number | undefined;
  onResize: (width: number) => void;
  label: string;
  class?: string;
  children: JSX.Element;
}) {
  const [dragWidth, setDragWidth] = createSignal<number>();
  let frame!: HTMLDivElement;

  const clamp = (width: number) => {
    const column = frame.parentElement?.clientWidth ?? width;
    return Math.min(Math.max(width, MIN_MEDIA_WIDTH), column);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = frame.getBoundingClientRect().width;
    const move = (moveEvent: PointerEvent) =>
      setDragWidth(clamp(startWidth + moveEvent.clientX - startX));
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      const width = dragWidth();
      setDragWidth(undefined);
      if (width !== undefined) props.onResize(width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = KEY_DELTAS[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    props.onResize(clamp(frame.getBoundingClientRect().width + delta));
  };

  const width = () => dragWidth() ?? props.width;

  return (
    <div
      ref={frame}
      data-inline-media-frame
      class={cn('group/frame relative max-w-full', props.class)}
      style={width() === undefined ? undefined : { width: `${width()}px` }}
    >
      {props.children}
      <div
        role="slider"
        tabindex="0"
        aria-label={`Resize ${props.label}`}
        aria-orientation="horizontal"
        aria-valuemin={MIN_MEDIA_WIDTH}
        aria-valuenow={Math.round(width() ?? 0) || undefined}
        data-inline-media-resize
        class="absolute right-0 bottom-0 z-1 size-5 touch-none rounded-tl-md rounded-br-lg bg-surface/80 opacity-0 outline-none group-hover/frame:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-edge-focus touch:opacity-100"
        style={{ cursor: 'nwse-resize' }}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox="0 0 20 20"
          class="size-full text-ink-muted"
          aria-hidden="true"
        >
          <path
            d="M15 8 8 15M15 12l-3 3"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
