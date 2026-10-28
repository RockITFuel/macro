import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRecentTaskChanges,
  LOCAL_TASK_CHANGE_MS,
  RECENT_TASK_CHANGE_MS,
} from './create-recent-task-changes';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount() {
  let emit: (ids: readonly string[]) => void = () => {};
  const unsubscribe = vi.fn();
  return createRoot((dispose) => {
    const recent = createRecentTaskChanges({
      subscribe: (listener) => {
        emit = listener;
        return unsubscribe;
      },
    });
    return { recent, emit: (ids: string[]) => emit(ids), dispose, unsubscribe };
  });
}

describe('recently changed tasks', () => {
  it('marks a task changed elsewhere until its highlight ends', () => {
    const board = mount();
    board.emit(['task']);
    expect(board.recent.isRecent('task')).toBe(true);
    expect(board.recent.isRecent('other')).toBe(false);

    vi.advanceTimersByTime(RECENT_TASK_CHANGE_MS);
    expect(board.recent.isRecent('task')).toBe(false);
    board.dispose();
  });

  it('restarts the highlight when the same task changes again', () => {
    const board = mount();
    board.emit(['task']);
    vi.advanceTimersByTime(RECENT_TASK_CHANGE_MS - 100);
    board.emit(['task']);
    vi.advanceTimersByTime(200);
    expect(board.recent.isRecent('task')).toBe(true);
    board.dispose();
  });

  it('does not mark the echo of a change this tab made', () => {
    const board = mount();
    board.recent.markLocal('mine');
    board.emit(['mine', 'theirs']);
    expect(board.recent.isRecent('mine')).toBe(false);
    expect(board.recent.isRecent('theirs')).toBe(true);

    vi.advanceTimersByTime(LOCAL_TASK_CHANGE_MS + 1);
    board.emit(['mine']);
    expect(board.recent.isRecent('mine')).toBe(true);
    board.dispose();
  });

  it('stops listening when the board unmounts', () => {
    const board = mount();
    board.dispose();
    expect(board.unsubscribe).toHaveBeenCalledOnce();
  });
});
