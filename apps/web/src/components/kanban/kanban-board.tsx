import { fireAndForget } from '@core/util/fireAndForget';
import { Key } from '@solid-primitives/keyed';
import { createElementSize } from '@solid-primitives/resize-observer';
import { Scroll } from '@ui/components/Scroll';
import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type JSX,
  on,
  onCleanup,
  Show,
  useContext,
} from 'solid-js';
import {
  Kanban,
  type KanbanAppearance,
  KanbanCard,
  KanbanCardInsertion,
  type KanbanDrop,
  type KanbanDropVisual,
  KanbanLane,
  useKanbanDragSource,
  useKanbanDropTarget,
} from './kanban';
import {
  createKanbanAnimation,
  type KanbanAnimationItem,
} from './kanban-animation';
import {
  CardActions,
  CardFields,
  CardHeader,
  ColumnCount as ColumnCountContent,
  ColumnLabel,
  ColumnPlaceholder,
  LandingPlaceholder,
} from './kanban-board-content';
import type {
  KanbanBoardColumn,
  KanbanBoardControls,
} from './kanban-board-types';
import {
  createKanbanVirtualizer,
  type KanbanScrollSnapshot,
} from './kanban-virtualizer';
import { createKanbanWheelScroll } from './kanban-wheel-scroll';

const END_COLUMN_KEY = -1;
const DEFAULT_COLUMN_WIDTH = 336;
/** Panel columns share the board's width and never get narrower than this. */
const PANEL_MIN_COLUMN_WIDTH = 256;
const COLUMN_GAP = { default: 16, panel: 12 } as const;
const CARD_GAP = { default: 12, panel: 8 } as const;
const BOARD_PADDING = 16;
const LANDING_KEY_PREFIX = 'kanban-landing:';

/** Where a card dropped into another column lands among that column's other cards. */
export type KanbanLandingIndex = (
  drop: { id: string; fromLane: string; toLane: string },
  itemIds: readonly string[]
) => number;

/**
 * Panel columns fill the viewport evenly, like flex-1 columns with a minimum
 * width; once they no longer fit, the board scrolls horizontally.
 */
export function panelColumnWidth(
  viewportWidth: number,
  columnCount: number,
  gap: number = COLUMN_GAP.panel
) {
  if (columnCount <= 0) return PANEL_MIN_COLUMN_WIDTH;
  const available = viewportWidth - BOARD_PADDING * 2 - gap * (columnCount - 1);

  return Math.max(PANEL_MIN_COLUMN_WIDTH, Math.floor(available / columnCount));
}

/**
 * The column's keys with the landing placeholder inserted at `index` (clamped
 * to the column), so it takes a row of its own in the virtualized list.
 */
export function withLandingKey(
  itemIds: readonly string[],
  landing: { id: string; index: number } | undefined
): readonly string[] {
  if (!landing) return itemIds;
  const others = itemIds.filter((id) => id !== landing.id);
  const index = Math.min(Math.max(0, landing.index), others.length);

  return [
    ...others.slice(0, index),
    `${LANDING_KEY_PREFIX}${landing.id}`,
    ...others.slice(index),
  ];
}

type Reveal = { toLane: string; scope?: string } & (
  | { kind: 'card'; id: string }
  | { kind: 'column' | 'footer' }
);

type BoardContextValue = {
  columns: Accessor<readonly KanbanBoardColumn[]>;
  appearance: Accessor<KanbanAppearance>;
  landingIndex: Accessor<KanbanLandingIndex | undefined>;
  animationScope: Accessor<string | undefined>;
  reveal: Accessor<Reveal | undefined>;
  onRevealed(request: Reveal): void;
  attachViewport(element: HTMLDivElement): () => void;
};

type ColumnContextValue = {
  column: Accessor<KanbanBoardColumn>;
  headerId: string;
  snapshot?: KanbanScrollSnapshot;
  onSnapshot(snapshot: KanbanScrollSnapshot): void;
};

const BoardContext = createContext<BoardContextValue>();
const ColumnContext = createContext<ColumnContextValue>();
const ColumnHoverContext = createContext<Accessor<boolean>>();

function useBoardContext() {
  const context = useContext(BoardContext);
  if (!context) throw new Error('KanbanBoard.Root is required');
  return context;
}

function useColumnContext() {
  const context = useContext(ColumnContext);
  if (!context) throw new Error('KanbanBoard.Columns is required');
  return context;
}

/** Shared board layout and drag lifecycle; hosts own item content and writes. */
function Root(props: {
  columns: readonly KanbanBoardColumn[];
  animationScope?: string;
  mode?: 'ordered' | 'cross-column';
  /** The task board's look; other boards keep the default. */
  appearance?: KanbanAppearance;
  /**
   * In cross-column mode, show a card-sized placeholder where a dropped card
   * will land in the hovered column (a sorted board decides that, not the pointer).
   */
  landingIndex?: KanbanLandingIndex;
  canMove?: (drop: Extract<KanbanDrop, { kind: 'card' }>) => boolean;
  onDrop(drop: KanbanDrop): void | boolean | Promise<void | boolean>;
  controlsRef?: (controls: KanbanBoardControls) => void;
  ref?: (element: HTMLDivElement) => void;
  children: JSX.Element;
}) {
  let viewport: HTMLDivElement | undefined;
  let revealGeneration = 0;
  const [reveal, setReveal] = createSignal<Reveal>();
  let disposed = false;
  props.controlsRef?.({
    revealColumn: (id) => requestReveal(id, 'column'),
    revealFooter: (id) => requestReveal(id, 'footer'),
  });
  function requestReveal(toLane: string, kind: 'column' | 'footer') {
    if (disposed) return;
    revealGeneration += 1;
    setReveal({ kind, toLane, scope: props.animationScope });
  }
  const motion = createKanbanAnimation({
    viewport: () => viewport,
    items: () => {
      if (!viewport) {
        return [];
      }

      const items: KanbanAnimationItem[] = [];

      for (const layout of viewport.querySelectorAll<HTMLElement>(
        '[data-kanban-board-column]'
      )) {
        const element = layout.firstElementChild;

        if (!(element instanceof HTMLElement)) {
          continue;
        }

        const key = JSON.stringify([
          'column',
          layout.dataset.kanbanBoardColumn,
        ]);
        items.push({ key, element, layout });

        for (const card of element.querySelectorAll<HTMLElement>(
          '[data-kanban-card]'
        )) {
          const row = card.parentElement;

          if (!row) {
            continue;
          }

          items.push({
            key: JSON.stringify([key, card.dataset.kanbanCard]),
            identity: card.dataset.kanbanCard,
            parentKey: key,
            element: card,
            layout: row,
          });
        }
      }

      return items;
    },
  });

  let finishHover: (() => void) | undefined;
  const endHover = () => {
    finishHover?.();
    finishHover = undefined;
    document.removeEventListener('mouseup', endHover);
  };
  const startHover = (event: MouseEvent) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-kanban-card]')
    ) {
      return;
    }

    endHover();
    finishHover = motion.beginHover();
    document.addEventListener('mouseup', endHover);
  };

  createEffect(
    on(
      () => props.animationScope,
      () => {
        revealGeneration += 1;
        setReveal(undefined);
        motion.cancel();
      }
    )
  );
  onCleanup(() => {
    disposed = true;
    viewport?.removeEventListener('mousedown', startHover);
    endHover();
    motion.cancel();
  });

  const context: BoardContextValue = {
    columns: () => props.columns,
    appearance: () => props.appearance ?? 'default',
    landingIndex: () =>
      props.mode === 'cross-column' ? props.landingIndex : undefined,
    animationScope: () => props.animationScope,
    reveal,
    onRevealed: (request) =>
      setReveal((current) => (current === request ? undefined : current)),
    attachViewport: (element) => {
      viewport?.removeEventListener('mousedown', startHover);
      viewport = element;
      viewport.addEventListener('mousedown', startHover);
      props.ref?.(element);

      return () => {
        if (viewport !== element) return;
        element.removeEventListener('mousedown', startHover);
        viewport = undefined;
        revealGeneration += 1;
        setReveal(undefined);
        endHover();
        motion.cancel();
      };
    },
  };

  const canDropCard = (drop: Extract<KanbanDrop, { kind: 'card' }>) =>
    props.canMove?.(drop) ?? true;

  function commitDrop(drop: KanbanDrop, visual?: KanbanDropVisual) {
    if (drop.kind === 'lane') {
      fireAndForget(props.onDrop(drop), 'kanban-drop');
      return;
    }
    if (!canDropCard(drop)) return;
    const sourceParentKey = JSON.stringify(['column', drop.fromLane]);
    const finish = motion.begin(
      drop.id,
      JSON.stringify(['column', drop.toLane]),
      visual
        ? {
            ...visual,
            key: JSON.stringify([sourceParentKey, drop.id]),
            parentKey: sourceParentKey,
          }
        : undefined
    );
    const scope = props.animationScope;
    const generation = ++revealGeneration;
    setReveal(undefined);
    async function saveAndReveal() {
      try {
        const moved = await props.onDrop(drop);
        if (
          moved !== false &&
          generation === revealGeneration &&
          props.animationScope === scope
        ) {
          setReveal({ kind: 'card', id: drop.id, toLane: drop.toLane, scope });
        }
      } finally {
        finish();
      }
    }
    fireAndForget(saveAndReveal(), 'kanban-drop');
  }

  const dragProps =
    props.mode === 'cross-column'
      ? {
          mode: 'cross-column' as const,
          targetActivationSpeed: 600,
          liftPreview: props.appearance === 'panel',
          canDropCard,
          onDrop: commitDrop,
        }
      : {
          mode: 'ordered' as const,
          pointerPlacement: true,
          liftPreview: props.appearance === 'panel',
          canDropCard,
          onDrop: commitDrop,
        };
  return (
    <BoardContext.Provider value={context}>
      <Kanban {...dragProps} getViewport={() => viewport}>
        {props.children}
      </Kanban>
    </BoardContext.Provider>
  );
}

/** Virtualizes columns and an optional final column supplied by the caller. */
function Columns(props: {
  children(column: Accessor<KanbanBoardColumn>): JSX.Element;
  endColumn?: () => JSX.Element;
  /** The board's accessible name; boards of other items name their own. */
  'aria-label'?: string;
}) {
  const board = useBoardContext();
  let viewport: HTMLDivElement | undefined;
  let releaseViewport: (() => void) | undefined;
  const [viewportElement, setViewportElement] = createSignal<HTMLDivElement>();
  // The appearance is fixed for a board; only panel columns follow the viewport.
  const viewportSize =
    board.appearance() === 'panel'
      ? createElementSize(viewportElement)
      : undefined;
  const columnCount = () => board.columns().length + (props.endColumn ? 1 : 0);
  const columnWidth = () =>
    viewportSize
      ? panelColumnWidth(viewportSize.width ?? 0, columnCount())
      : DEFAULT_COLUMN_WIDTH;
  const scrollSnapshots = new Map<string, KanbanScrollSnapshot>();
  const wheel = createKanbanWheelScroll({
    viewport: () => viewport,
    verticalViewport: (target) =>
      target.closest<HTMLElement>('[data-kanban-board-scroll]') ??
      target
        .closest('[data-kanban-lane]')
        ?.querySelector<HTMLElement>('[data-kanban-board-scroll]') ??
      null,
  });
  onCleanup(() => {
    wheel.reset();
    releaseViewport?.();
  });
  createEffect(on(board.animationScope, wheel.reset));
  const columnsById = createMemo(
    () => new Map(board.columns().map((column) => [column.id, column]))
  );
  const virtualizer = createKanbanVirtualizer({
    direction: 'horizontal',
    keys: () => {
      const keys: (string | number)[] = board
        .columns()
        .map((column) => column.id);

      if (props.endColumn) {
        keys.push(END_COLUMN_KEY);
      }

      return keys;
    },
    getScrollElement: () => viewport,
    estimateSize: () => columnWidth(),
    remeasure: columnWidth,
    gap: COLUMN_GAP[board.appearance()],
    overscan: 1,
    paddingStart: BOARD_PADDING,
    paddingEnd: BOARD_PADDING,
  });
  const virtualItems = createMemo(() =>
    virtualizer.getVirtualItems().map((item) => ({ ...item }))
  );
  createEffect(() => {
    const request = board.reveal();
    const columns = board.columns();
    if (!request || request.scope !== board.animationScope()) return;
    const index = columns.findIndex((column) => column.id === request.toLane);
    if (index < 0) return;
    if (request.kind === 'card' && !columns[index].itemIds.includes(request.id))
      return;
    virtualizer.scrollToIndex(index, { align: 'auto' });
    if (request.kind === 'column') board.onRevealed(request);
  });

  return (
    <Scroll
      orientation="horizontal"
      scrollbars="horizontal"
      autoHide={false}
      scrollRef={(element) => {
        releaseViewport?.();
        viewport = element;
        setViewportElement(element);
        releaseViewport = board.attachViewport(element);
      }}
      onWheel={wheel.onWheel}
      class="ph-no-capture min-h-0 min-w-0 w-full flex-1"
      viewportProps={{
        tabindex: -1,
        role: 'region',
        'aria-label': props['aria-label'] ?? 'Kanban board',
        'data-kanban-board-viewport': '',
        class: 'pt-1 pb-4 outline-none',
      }}
      contentProps={{ style: { height: '100%' } }}
    >
      <div
        class="relative h-full min-w-full"
        data-kanban-board-columns
        style={{ width: `${virtualizer.getTotalSize()}px` }}
      >
        <Key each={virtualItems()} by="key">
          {(item) => {
            const key = item().key;
            return (
              <div
                class="absolute top-0 h-full"
                data-kanban-board-column={key}
                style={{
                  left: `${item().start}px`,
                  width: `${item().size}px`,
                }}
              >
                <Show when={key === END_COLUMN_KEY}>{props.endColumn?.()}</Show>
                <Show when={columnsById().get(String(key))}>
                  {(column) => {
                    // Cleanup runs after Show invalidates its column accessor.
                    const columnId = column().id;
                    const context: ColumnContextValue = {
                      column,
                      headerId: createUniqueId(),
                      snapshot: scrollSnapshots.get(columnId),
                      onSnapshot: (snapshot) => {
                        scrollSnapshots.set(columnId, snapshot);
                      },
                    };

                    return (
                      <ColumnContext.Provider value={context}>
                        {props.children(column)}
                      </ColumnContext.Provider>
                    );
                  }}
                </Show>
              </div>
            );
          }}
        </Key>
      </div>
    </Scroll>
  );
}

function Column(props: {
  canReorder?: boolean;
  onKeyDown?: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent>;
  children: JSX.Element;
}) {
  const board = useBoardContext();
  const { column, headerId } = useColumnContext();
  const [hovered, setHovered] = createSignal(false);

  return (
    <ColumnHoverContext.Provider value={hovered}>
      <KanbanLane
        id={column().id}
        label={column().label}
        canReorder={props.canReorder}
        onKeyDown={props.onKeyDown}
        aria-labelledby={headerId}
        appearance={board.appearance()}
        class={
          board.appearance() === 'panel'
            ? 'h-full min-h-0 w-full'
            : 'max-h-full min-h-0 w-84'
        }
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        {props.children}
      </KanbanLane>
    </ColumnHoverContext.Provider>
  );
}

function Header(props: { children: JSX.Element }) {
  const board = useBoardContext();
  const { headerId } = useColumnContext();

  return (
    <header
      id={headerId}
      class={
        board.appearance() === 'panel'
          ? 'flex min-h-9 min-w-0 shrink-0 items-center gap-2 px-2 pt-1.5 pb-1.5'
          : 'flex min-w-0 shrink-0 items-center gap-2 px-2 pt-1 pb-2'
      }
    >
      {props.children}
    </header>
  );
}

/** The column's card count; panel boards show it in a pill. */
function ColumnCount(props: { count: number; 'aria-label'?: string }) {
  const board = useContext(BoardContext);

  return (
    <ColumnCountContent
      count={props.count}
      aria-label={props['aria-label']}
      pill={board?.appearance() === 'panel'}
    />
  );
}

function DropOverlay(props: { children: JSX.Element }) {
  const { column } = useColumnContext();
  const target = useKanbanDropTarget();

  return (
    <Show when={target()?.kind === 'card' && target()?.toLane === column().id}>
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg bg-surface-0/95 p-4 text-center text-sm font-medium text-ink"
      >
        {props.children}
      </div>
    </Show>
  );
}

/** Owns the vertical viewport and row measurements; card content stays with the caller. */
function Cards(props: {
  children(id: string): JSX.Element;
  empty?: JSX.Element;
  footer?: JSX.Element;
  /** What the cards are, for each column's accessible name. */
  itemsLabel?: string;
  /** Shown inside the landing placeholder, such as why the card lands there. */
  landingLabel?: string;
}) {
  const board = useBoardContext();
  const lane = useColumnContext();
  const hovered = useContext(ColumnHoverContext);
  if (!hovered) throw new Error('KanbanBoard.Column is required');
  const target = useKanbanDropTarget();
  const source = useKanbanDragSource();
  let viewport: HTMLDivElement | undefined;
  const rows = () => lane.column().itemIds;
  const landing = createMemo(() => {
    const drop = target();
    const dragged = source();
    const landingIndex = board.landingIndex();
    if (
      !landingIndex ||
      !dragged ||
      drop?.kind !== 'card' ||
      drop.id !== dragged.id ||
      drop.toLane !== lane.column().id ||
      drop.fromLane === drop.toLane
    )
      return undefined;
    const others = rows().filter((id) => id !== drop.id);

    return {
      id: drop.id,
      index: landingIndex(drop, others),
      height: dragged.height,
    };
  });
  const landingKey = () => {
    const current = landing();

    return current ? `${LANDING_KEY_PREFIX}${current.id}` : undefined;
  };
  const keys = createMemo(() => withLandingKey(rows(), landing()));
  const nextRowId = (id: string) => {
    const ids = rows();
    const index = ids.indexOf(id);

    return index < 0 ? undefined : ids[index + 1];
  };
  const virtualizer = createKanbanVirtualizer({
    direction: 'vertical',
    laneId: () => lane.column().id,
    keys,
    getScrollElement: () => viewport,
    estimateSize: (key) =>
      key === landingKey() ? (landing()?.height ?? 104) : 104,
    gap: CARD_GAP[board.appearance()],
    overscan: 3,
    // Keep the before-first-card marker inside the lane's scroll clip.
    paddingStart: 8,
    snapshot: lane.snapshot,
  });
  const virtualItems = createMemo(() =>
    virtualizer.getVirtualItems().map((item) => ({ ...item }))
  );

  createEffect(() => {
    const request = board.reveal();
    const mountedRows = virtualItems();
    const scrollElement = virtualizer.scrollElement;
    if (
      !request ||
      request.scope !== board.animationScope() ||
      request.toLane !== lane.column().id ||
      !scrollElement?.isConnected
    )
      return;
    if (request.kind === 'footer') {
      queueMicrotask(() => {
        if (board.reveal() !== request || !scrollElement.isConnected) return;
        scrollElement.scrollTop = scrollElement.scrollHeight;
        board.onRevealed(request);
      });
      return;
    }
    if (request.kind !== 'card' || !mountedRows.length) return;
    const row = keys().indexOf(request.id);
    if (row < 0) return;
    virtualizer.scrollToIndex(row, { align: 'auto' });
    queueMicrotask(() => board.onRevealed(request));
  });

  onCleanup(() => {
    lane.onSnapshot({
      offset: viewport?.scrollTop ?? 0,
      measurements: virtualizer.takeSnapshot(),
    });
  });

  return (
    <Scroll
      orientation="vertical"
      scrollbars="vertical"
      autoHide
      autoHideDelay={200}
      revealOn="hover"
      hovered={hovered()}
      fill={false}
      scrollRef={(element) => {
        viewport = element;
      }}
      class="min-h-0 flex-auto"
      viewportProps={{
        role: 'region',
        'aria-label': `${lane.column().label} ${props.itemsLabel ?? 'items'}`,
        'aria-labelledby': lane.headerId,
        tabindex: 0,
        'data-kanban-board-scroll': lane.column().id,
        'data-kanban-scroll': '',
        style: { 'overflow-anchor': 'none' },
      }}
    >
      <div
        class="relative w-full"
        data-kanban-board-rows
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <Key each={virtualItems()} by="key">
          {(item) => {
            const key = String(item().key);
            let row: HTMLDivElement | undefined;

            createEffect(
              on(
                () => item().index,
                () => {
                  // Measure after content mounts, and again if a stable key moves.
                  queueMicrotask(() => {
                    if (row?.isConnected) {
                      virtualizer.measureElement(row);
                    }
                  });
                }
              )
            );

            if (key.startsWith(LANDING_KEY_PREFIX)) {
              return (
                <div
                  ref={row}
                  data-index={item().index}
                  class="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item().start}px)` }}
                >
                  <LandingPlaceholder
                    height={landing()?.height}
                    label={props.landingLabel}
                  />
                </div>
              );
            }

            return (
              <div
                ref={row}
                data-index={item().index}
                data-kanban-card-layout
                data-kanban-next-id={nextRowId(key)}
                class="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${item().start}px)` }}
              >
                {props.children(key)}
              </div>
            );
          }}
        </Key>
        <KanbanCardInsertion laneId={lane.column().id} />
      </div>
      <Show when={rows().length === 0 && !landing()}>{props.empty}</Show>
      {props.footer}
    </Scroll>
  );
}

function Card(props: {
  id: string;
  canDrag: boolean;
  pending?: boolean;
  recent?: boolean;
  onClick?: JSX.EventHandler<HTMLElement, MouseEvent>;
  children: JSX.Element;
}) {
  const board = useBoardContext();
  const { column } = useColumnContext();

  return (
    <KanbanCard
      id={props.id}
      laneId={column().id}
      canDrag={props.canDrag}
      pending={props.pending}
      recent={props.recent}
      appearance={board.appearance()}
      onClick={props.onClick}
    >
      {props.children}
    </KanbanCard>
  );
}

export const KanbanBoard = {
  Root,
  Columns,
  Column,
  Header,
  ColumnLabel,
  ColumnCount,
  ColumnPlaceholder,
  CardHeader,
  CardFields,
  CardActions,
  DropOverlay,
  Cards,
  Card,
};
