import { createSignal, onCleanup } from 'solid-js';

/** How long a card changed elsewhere stays marked. */
export const RECENT_TASK_CHANGE_MS = 4000;
/** A change this tab made itself is not news when its realtime echo arrives. */
export const LOCAL_TASK_CHANGE_MS = 6000;

/**
 * Tasks another person (or bot, or tab) changed a moment ago, for the board's
 * "just changed" ring. Adapted from `useBoardLive` in Project Alpha's Support
 * board (© Luka Pelgrom): a newer change of the same task restarts its timer.
 * `subscribe` reports changed entities after their refetch settled; this
 * primitive only marks them and never holds that refetch back.
 */
export function createRecentTaskChanges(options: {
  subscribe(listener: (ids: readonly string[]) => void): () => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const [recent, setRecent] = createSignal<ReadonlyMap<string, number>>(
    new Map()
  );
  const local = new Map<string, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let mark = 0;

  const isLocal = (id: string) => {
    const at = local.get(id);
    if (at === undefined) return false;
    if (now() - at <= LOCAL_TASK_CHANGE_MS) return true;
    local.delete(id);
    return false;
  };

  const unsubscribe = options.subscribe((ids) => {
    const shown = ids.filter((id) => !isLocal(id));
    if (shown.length === 0) return;
    const token = ++mark;
    setRecent(
      (current) =>
        new Map([...current, ...shown.map((id) => [id, token] as const)])
    );
    const timer = setTimeout(() => {
      timers.delete(timer);
      setRecent(
        (current) =>
          new Map([...current].filter(([, shownBy]) => shownBy !== token))
      );
    }, RECENT_TASK_CHANGE_MS);
    timers.add(timer);
  });

  onCleanup(() => {
    unsubscribe();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  });

  return {
    isRecent: (id: string) => recent().has(id),
    /** Record a change this tab makes, so its realtime echo stays unmarked. */
    markLocal: (id: string) => {
      local.set(id, now());
    },
  };
}
