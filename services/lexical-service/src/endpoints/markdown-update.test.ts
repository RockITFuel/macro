import '../polyfills/prism';
import { describe, expect, it } from 'bun:test';
import { markdownToLoroSnapshot } from '@macro-inc/lexical-core/markdown-loro-snapshot';
import { LoroDoc } from 'loro-crdt';
import app from '../index';

const post = (path: string, body: unknown, authenticated = true) =>
  app.request(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated ? { 'x-internal-auth-key': 'test-key' } : {}),
      },
      body: JSON.stringify(body),
    },
    { INTERNAL_AUTH_KEY: 'test-key' }
  );

async function snapshotOf(markdown: string): Promise<string> {
  const snapshot = await markdownToLoroSnapshot(markdown);
  if (!snapshot) throw new Error('no snapshot');
  return Buffer.from(snapshot).toString('base64');
}

describe('markdown update endpoints', () => {
  it('returns an update that makes the snapshot hold the markdown', async () => {
    const snapshot = await snapshotOf('# Before');
    const markdown = '---\nname: a_b\n---\n\n# After\n\n- snake_case';

    const response = await post('/snapshot/markdown-update', {
      snapshot,
      markdown,
    });
    expect(response.status).toBe(200);
    const { update }: { update: string } = await response.json();

    const doc = new LoroDoc();
    doc.import(Buffer.from(snapshot, 'base64'));
    doc.import(Buffer.from(update, 'base64'));
    const read = await post('/snapshot/to-markdown', {
      snapshot: Buffer.from(doc.export({ mode: 'snapshot' })).toString(
        'base64'
      ),
    });
    expect(await read.json()).toEqual({ markdown });
  });

  it('returns no update for unchanged markdown', async () => {
    const response = await post('/snapshot/markdown-update', {
      snapshot: await snapshotOf('# Same'),
      markdown: '# Same',
    });
    expect(await response.json()).toEqual({ update: null });
  });

  it('requires the internal key', async () => {
    const response = await post(
      '/snapshot/to-markdown',
      { snapshot: await snapshotOf('# x') },
      false
    );
    expect(response.status).toBe(401);
  });
});
