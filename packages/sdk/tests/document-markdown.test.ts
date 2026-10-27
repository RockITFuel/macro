import { afterEach, expect, test } from 'bun:test';
import { Macro } from '../src/macro';
import { MacroApiError } from '../src/utils';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const macro = () =>
  new Macro({
    token: 'test-user-token',
    hosts: { storage: 'https://storage.example.test' },
  });

const capture = (response: () => Response) => {
  const requests: Request[] = [];
  globalThis.fetch = (async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    return response();
  }) as typeof fetch;
  return requests;
};

test('markdown reads the exact text with its version', async () => {
  const requests = capture(() =>
    Response.json({
      markdown: 'snake_case\n\n---\nkey: value',
      versionId: 'v1',
    }),
  );
  expect(await macro().documents.byId('skill').markdown()).toEqual({
    markdown: 'snake_case\n\n---\nkey: value',
    versionId: 'v1',
  });
  expect(requests[0].method).toBe('GET');
  expect(new URL(requests[0].url).pathname).toBe('/documents/skill/markdown');
});

test('setMarkdown sends the text and the base version', async () => {
  const requests = capture(() =>
    Response.json({ versionId: 'v2', changed: true }),
  );
  expect(
    await macro()
      .documents.byId('skill')
      .setMarkdown('# New', { baseVersionId: 'v1' }),
  ).toEqual({ versionId: 'v2', changed: true });
  expect(requests[0].method).toBe('PUT');
  expect(new URL(requests[0].url).pathname).toBe('/documents/skill/markdown');
  expect(await requests[0].json()).toEqual({
    markdown: '# New',
    baseVersionId: 'v1',
  });
});

test('a stale base version surfaces as a 409', async () => {
  capture(() =>
    Response.json({ message: 'the document changed' }, { status: 409 }),
  );
  const error = await macro()
    .documents.byId('skill')
    .setMarkdown('# New', { baseVersionId: 'v0' })
    .catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(MacroApiError);
  expect(error).toMatchObject({ status: 409 });
});
