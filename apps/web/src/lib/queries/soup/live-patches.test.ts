import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@queries/client', async () => {
  const { QueryClient } = await import('@tanstack/query-core');
  return {
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
  };
});
const soupCache = vi.hoisted(() => ({
  invalidateAllSoup: vi.fn(),
  refetchSoupEntity: vi.fn(async () => {}),
  removeSoupEntities: vi.fn(),
}));
vi.mock('./normalized-cache/operations', () => soupCache);
const graphqlLists = vi.hoisted(() => ({
  refreshActiveGraphqlSoupQueries: vi.fn(async () => {}),
}));
vi.mock('./graphql/active-queries', () => graphqlLists);

import { queryClient } from '@queries/client';
import { previewKeys } from '../preview/keys';
import { propertiesKeys } from '../properties/keys';
import { entityKeys } from '../storage/keys';
import {
  handleSoupPatch,
  onSoupPatchesApplied,
  resetSoupPatches,
  SOUP_PATCH_COALESCE_MS,
  SOUP_PATCH_MIN_INTERVAL_MS,
} from './live-patches';

const TASK = '019f0000-0000-7000-8000-000000000001';
const OTHER_TASK = '019f0000-0000-7000-8000-000000000002';

const taskProperties = propertiesKeys.entity({
  entityType: 'TASK',
  entityId: TASK,
}).queryKey;
const otherTaskProperties = propertiesKeys.entity({
  entityType: 'TASK',
  entityId: OTHER_TASK,
}).queryKey;
const taskMetadata = entityKeys.documentMetadata(TASK).queryKey;
const taskTitle = previewKeys.item(TASK).queryKey;
const taskContent = ['documentLoad', TASK];

const invalidated = (queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated ?? false;

const patch = (
  entityId: string,
  operation: 'updated' | 'deleted' = 'updated'
) => ({ operation, entityType: 'document', entityId });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  queryClient.clear();
  resetSoupPatches();
  for (const queryKey of [
    taskProperties,
    otherTaskProperties,
    taskMetadata,
    taskTitle,
    taskContent,
  ]) {
    queryClient.setQueryData(queryKey, {});
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe('soup_patch gateway messages', () => {
  it('re-read the changed row, refresh every list, and reload only that entity’s reads', async () => {
    handleSoupPatch(patch(TASK));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS);

    expect(soupCache.refetchSoupEntity).toHaveBeenCalledWith(TASK, 'document');
    expect(soupCache.invalidateAllSoup).toHaveBeenCalledOnce();
    expect(graphqlLists.refreshActiveGraphqlSoupQueries).toHaveBeenCalledOnce();
    expect(invalidated(taskProperties)).toBe(true);
    expect(invalidated(taskMetadata)).toBe(true);
    expect(invalidated(taskTitle)).toBe(true);
    expect(invalidated(otherTaskProperties)).toBe(false);
    // An editor's loaded content is never reloaded underneath it.
    expect(invalidated(taskContent)).toBe(false);
  });

  it('remove a deleted entity from every list without re-reading it', async () => {
    handleSoupPatch(patch(TASK, 'deleted'));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS);

    expect(soupCache.removeSoupEntities).toHaveBeenCalledWith(new Set([TASK]));
    expect(soupCache.refetchSoupEntity).not.toHaveBeenCalled();
  });

  it('coalesce a burst into one round and rate-limit the next', async () => {
    handleSoupPatch(patch(TASK));
    handleSoupPatch(patch(OTHER_TASK));
    handleSoupPatch(patch(TASK));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS);
    expect(soupCache.refetchSoupEntity).toHaveBeenCalledTimes(2);
    expect(soupCache.invalidateAllSoup).toHaveBeenCalledOnce();

    handleSoupPatch(patch(TASK));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS);
    expect(soupCache.invalidateAllSoup).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_MIN_INTERVAL_MS);
    expect(soupCache.invalidateAllSoup).toHaveBeenCalledTimes(2);
  });

  it('wait for this tab’s pending writes before refetching', async () => {
    const { promise: reply, resolve: settle } = Promise.withResolvers<void>();
    const mutation = queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => reply })
      .execute(undefined);

    handleSoupPatch(patch(TASK));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS * 4);
    expect(soupCache.refetchSoupEntity).not.toHaveBeenCalled();
    expect(invalidated(taskProperties)).toBe(false);

    settle();
    await mutation;
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS);
    expect(soupCache.refetchSoupEntity).toHaveBeenCalledWith(TASK, 'document');
    expect(invalidated(taskProperties)).toBe(true);
  });

  it('tell listeners which entities changed once the refetches settled', async () => {
    const { promise: refetched, resolve: settleRefetch } =
      Promise.withResolvers<void>();
    graphqlLists.refreshActiveGraphqlSoupQueries.mockImplementationOnce(
      () => refetched
    );
    const listener = vi.fn();
    const stop = onSoupPatchesApplied(listener);

    handleSoupPatch(patch(TASK));
    handleSoupPatch(patch(OTHER_TASK, 'deleted'));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_COALESCE_MS);
    // The refetch starts without waiting for anyone listening.
    expect(soupCache.refetchSoupEntity).toHaveBeenCalledWith(TASK, 'document');
    expect(listener).not.toHaveBeenCalled();

    settleRefetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledExactlyOnceWith([TASK]);

    stop();
    handleSoupPatch(patch(TASK));
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_MIN_INTERVAL_MS);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('ignore malformed messages', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    handleSoupPatch({
      operation: 'updated',
      entityType: 'email_thread',
      entityId: TASK,
    });
    handleSoupPatch('not json');
    await vi.advanceTimersByTimeAsync(SOUP_PATCH_MIN_INTERVAL_MS);
    expect(soupCache.invalidateAllSoup).not.toHaveBeenCalled();
  });
});
