import { fireAndForget } from '@core/util/fireAndForget';
import { queryClient } from '@queries/client';
import type { Query } from '@tanstack/solid-query';
import { refreshActiveGraphqlSoupQueries } from './graphql/active-queries';
import {
  invalidateAllSoup,
  refetchSoupEntity,
  removeSoupEntities,
} from './normalized-cache/operations';

/**
 * A `soup_patch` gateway message: `soup_realtime` sends it to every user with
 * current access when a document (tasks included) or initiative changes,
 * whoever made the change (a person, a bot, an agent, an API key). It names
 * the entity only; the refetches below read it back through the access-checked
 * endpoints.
 */
export type SoupPatchMessage = {
  operation: 'updated' | 'deleted';
  entityType: 'document' | 'initiative';
  entityId: string;
};

/** Patches arriving this close together share one round of refetches. */
export const SOUP_PATCH_COALESCE_MS = 150;
/** Lower bound between two rounds, so a burst of edits cannot refetch every list continuously. */
export const SOUP_PATCH_MIN_INTERVAL_MS = 1000;

/** Query roots that hold one entity's fields: its preview (title), properties and metadata. */
const ENTITY_QUERY_ROOTS = new Set(['preview', 'properties', 'entity']);

/** The latest operation per entity since the last round. */
const pendingPatches = new Map<string, SoupPatchMessage>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let lastFlushAt = Number.NEGATIVE_INFINITY;
let stopWaitingForMutations: (() => void) | undefined;

function isSoupPatchMessage(value: unknown): value is SoupPatchMessage {
  if (value === null || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    (message.operation === 'updated' || message.operation === 'deleted') &&
    (message.entityType === 'document' ||
      message.entityType === 'initiative') &&
    typeof message.entityId === 'string' &&
    message.entityId.length > 0
  );
}

function referencesEntity(query: Query, entityIds: string[]): boolean {
  if (!ENTITY_QUERY_ROOTS.has(String(query.queryKey[0]))) return false;
  const serialized = JSON.stringify(query.queryKey);
  return entityIds.some((id) => serialized.includes(id));
}

async function applyPatches(patches: SoupPatchMessage[]): Promise<void> {
  const deleted = new Set(
    patches
      .filter((patch) => patch.operation === 'deleted')
      .map((patch) => patch.entityId)
  );
  if (deleted.size > 0) removeSoupEntities(deleted);
  // Re-reads each changed row into every list holding it, moving it between
  // groups (a new status moves a board card) and inserting rows no list held.
  await Promise.all(
    patches
      .filter((patch) => patch.operation === 'updated')
      .map((patch) => refetchSoupEntity(patch.entityId, patch.entityType))
  );
  // Membership can still change in lists that never held the row, such as
  // My tasks after an assignment, so every active list refetches too.
  invalidateAllSoup();
  const entityIds = patches.map((patch) => patch.entityId);
  await Promise.all([
    refreshActiveGraphqlSoupQueries(),
    queryClient.invalidateQueries({
      predicate: (query) => referencesEntity(query, entityIds),
    }),
  ]);
}

function flush(): void {
  flushTimer = undefined;
  // A refetch landing between an optimistic write and its server reply would
  // briefly show the old value; wait until this tab's own writes settle.
  if (queryClient.isMutating() > 0) {
    waitForMutationsToSettle();
    return;
  }
  const patches = [...pendingPatches.values()];
  pendingPatches.clear();
  if (patches.length === 0) return;
  lastFlushAt = Date.now();
  fireAndForget(applyPatches(patches), 'soup-live-patches');
}

function scheduleFlush(): void {
  if (flushTimer !== undefined || stopWaitingForMutations) return;
  const wait = Math.max(
    SOUP_PATCH_COALESCE_MS,
    lastFlushAt + SOUP_PATCH_MIN_INTERVAL_MS - Date.now()
  );
  flushTimer = setTimeout(flush, wait);
}

function waitForMutationsToSettle(): void {
  if (stopWaitingForMutations) return;
  const unsubscribe = queryClient.getMutationCache().subscribe(() => {
    if (queryClient.isMutating() > 0) return;
    unsubscribe();
    stopWaitingForMutations = undefined;
    scheduleFlush();
  });
  stopWaitingForMutations = unsubscribe;
}

/** Brings the lists and entity reads a remote document or initiative change affects up to date. */
export function handleSoupPatch(payload: unknown): void {
  if (!isSoupPatchMessage(payload)) {
    console.warn('Malformed soup_patch payload', payload);
    return;
  }
  pendingPatches.set(payload.entityId, payload);
  scheduleFlush();
}

/** Drops scheduled work so each test starts from a clean slate. */
export function resetSoupPatches(): void {
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
  stopWaitingForMutations?.();
  stopWaitingForMutations = undefined;
  pendingPatches.clear();
  lastFlushAt = Number.NEGATIVE_INFINITY;
}
