import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import type { Accessor } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskBoardColumn, TaskBoardTask } from '../core/task-board';
import { TaskBoard } from './task-board';

// JSDOM has no layout: render every key, and keep the real drag surface.
vi.mock('@app/components/kanban/kanban-virtualizer', () => ({
  createKanbanVirtualizer: (options: {
    keys: Accessor<readonly (string | number)[]>;
    getScrollElement: () => HTMLDivElement | undefined;
  }) => ({
    get scrollElement() {
      return options.getScrollElement();
    },
    getVirtualItems: () =>
      options.keys().map((key, index) => ({
        key,
        index,
        start: index * 100,
        size: 100,
      })),
    getTotalSize: () => options.keys().length * 100,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
    takeSnapshot: () => [],
  }),
}));

// Lanes sit side by side, To do at 0 and Done at 300; cards stack from y = 60.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-kanban-board-viewport'))
        return new DOMRect(0, 0, 880, 500);
      const lane = this.closest('[data-kanban-lane]');
      const x = lane?.getAttribute('aria-label') === 'Done' ? 300 : 0;
      const card = this.closest('[data-kanban-card]');
      if (lane && card) {
        const index = Array.from(
          lane.querySelectorAll('[data-kanban-card]')
        ).indexOf(card);
        return new DOMRect(x + 8, 60 + index * 100, 264, 80);
      }
      return new DOMRect(x, 0, 280, 500);
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const task = (id: string, statusId: string): TaskBoardTask => ({
  id,
  name: `Task ${id}`,
  statusId,
  assigneeIds: [],
  projectIds: [],
});

const columns: TaskBoardColumn[] = [
  {
    id: 'todo',
    label: 'To do',
    tasks: [task('first', 'todo'), task('third', 'todo')],
    hasMore: false,
    loadingMore: false,
  },
  {
    id: 'done',
    label: 'Done',
    tasks: [task('second', 'done')],
    hasMore: false,
    loadingMore: false,
  },
];

const rank = new Map([
  ['first', 1],
  ['second', 2],
  ['third', 3],
]);

function mountBoard(appearance?: 'panel') {
  const onMove = vi.fn(async () => true);
  render(() => (
    <TaskBoard.Root
      columns={columns}
      appearance={appearance}
      compareTasks={(left, right) =>
        (rank.get(left) ?? 0) - (rank.get(right) ?? 0)
      }
      canMove={() => true}
      onMove={onMove}
    >
      <TaskBoard.Columns>
        {(column) => (
          <TaskBoard.Column>
            <TaskBoard.Header>{column().label}</TaskBoard.Header>
            <TaskBoard.Cards landingLabel="Sorted by Rank">
              {(current) => (
                <TaskBoard.Card
                  task={current()}
                  canDrag
                  pending={false}
                  onOpen={vi.fn()}
                >
                  <span>{current().name}</span>
                </TaskBoard.Card>
              )}
            </TaskBoard.Cards>
          </TaskBoard.Column>
        )}
      </TaskBoard.Columns>
    </TaskBoard.Root>
  ));
  return onMove;
}

/** Drag "Task second" from Done over To do and rest there. */
async function dragSecondOverToDo() {
  fireEvent.mouseDown(screen.getByText('Task second'), {
    button: 0,
    clientX: 320,
    clientY: 80,
  });
  fireEvent.mouseMove(document, { clientX: 40, clientY: 150 });
  // The board waits for the pointer to rest before it activates a column.
  await new Promise((resolve) => setTimeout(resolve, 150));
  fireEvent.mouseMove(document, { clientX: 40, clientY: 150 });
}

const lane = (label: string) =>
  document.querySelector<HTMLElement>(
    `[data-kanban-lane][aria-label="${label}"]`
  )!;

const laneOrder = (label: string) =>
  Array.from(
    lane(label).querySelectorAll<HTMLElement>(
      '[data-kanban-card], [data-kanban-landing]'
    )
  ).map((element) => element.dataset.kanbanCard ?? 'landing');

describe('task board landing placeholder', () => {
  it('shows where a card dragged to another column will land in the sorted order', async () => {
    const onMove = mountBoard('panel');
    await dragSecondOverToDo();

    await waitFor(() =>
      expect(laneOrder('To do')).toEqual(['first', 'landing', 'third'])
    );
    expect(lane('To do').textContent).toContain('Sorted by Rank');
    expect(laneOrder('Done')).toEqual(['second']);
    // The preview is lifted off the board while it follows the pointer.
    expect(
      document.querySelector<HTMLElement>('[data-kanban-preview]')?.style
        .boxShadow
    ).not.toBe('');

    fireEvent.mouseUp(document, { button: 0, clientX: 40, clientY: 150 });

    await waitFor(() =>
      expect(onMove).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'second',
          fromLane: 'done',
          toLane: 'todo',
        })
      )
    );
    expect(document.querySelector('[data-kanban-landing]')).toBeNull();
  });

  it('leaves boards without the panel look as they were', async () => {
    const onMove = mountBoard();
    await dragSecondOverToDo();

    await waitFor(() =>
      expect(
        document.querySelector('[data-kanban-drop-target="column"]')
      ).not.toBeNull()
    );
    expect(laneOrder('To do')).toEqual(['first', 'third']);
    expect(document.querySelector('[data-kanban-landing]')).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-kanban-preview]')?.style
        .boxShadow
    ).toBe('');

    fireEvent.mouseUp(document, { button: 0, clientX: 40, clientY: 150 });
    await waitFor(() => expect(onMove).toHaveBeenCalledOnce());
  });
});
