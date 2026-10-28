import { LoroDoc } from 'loro-crdt';
import { describe, expect, it } from 'vitest';
import { markdownToLoroSnapshot } from '../markdown-loro-snapshot';
import {
  loroSnapshotToMarkdown,
  markdownToLoroUpdate,
} from '../markdown-loro-update';

type Block = { $?: { id?: string } };

function blockIds(doc: LoroDoc): (string | undefined)[] {
  const { root } = doc.toJSON() as { root: { children: Block[] } };
  return root.children.map((block) => block.$?.id);
}

async function documentWith(markdown: string): Promise<LoroDoc> {
  const snapshot = await markdownToLoroSnapshot(markdown);
  if (!snapshot) throw new Error('no snapshot');
  const doc = new LoroDoc();
  doc.import(snapshot);
  return doc;
}

async function replace(doc: LoroDoc, markdown: string) {
  const update = await markdownToLoroUpdate(
    doc.export({ mode: 'snapshot' }),
    markdown
  );
  if (update) doc.import(update);
  return update;
}

describe('markdownToLoroUpdate', () => {
  it('makes the document hold exactly the new markdown', async () => {
    const doc = await documentWith('# Old\n\nold body');
    const markdown =
      '---\nname: my_skill\n---\n\n# New\n\n- snake_case\n- `a_b`\n\n```yaml\nk: v\n```';

    await replace(doc, markdown);

    expect(loroSnapshotToMarkdown(doc.export({ mode: 'snapshot' }))).toBe(
      markdown
    );
  });

  it('keeps unchanged blocks and replaces only changed ones', async () => {
    const doc = await documentWith('# Title\n\nfirst\n\nsecond');
    const [title, first, second] = blockIds(doc);

    await replace(doc, '# Title\n\nchanged\n\nsecond\n\nthird');

    const ids = blockIds(doc);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe(title);
    expect(ids[1]).not.toBe(first);
    expect(ids[2]).toBe(second);
  });

  it('returns null when the document already holds the markdown', async () => {
    const doc = await documentWith('# Same\n\ntext_with_underscores');

    expect(await replace(doc, '# Same\n\ntext_with_underscores')).toBeNull();
  });

  it('reaches a peer that has the document open', async () => {
    const server = await documentWith('# Shared\n\nbefore');
    const editor = new LoroDoc();
    editor.import(server.export({ mode: 'snapshot' }));

    const update = await replace(server, '# Shared\n\nafter');
    if (!update) throw new Error('expected an update');
    editor.import(update);

    expect(loroSnapshotToMarkdown(editor.export({ mode: 'snapshot' }))).toBe(
      '# Shared\n\nafter'
    );
  });

  it('applies on top of a shallow snapshot', async () => {
    const doc = await documentWith('# History\n\none');
    await replace(doc, '# History\n\ntwo');
    const shallow = doc.export({
      mode: 'shallow-snapshot',
      frontiers: doc.oplogFrontiers(),
    });

    const update = await markdownToLoroUpdate(shallow, '# History\n\nthree');
    if (!update) throw new Error('expected an update');
    doc.import(update);

    expect(loroSnapshotToMarkdown(doc.export({ mode: 'snapshot' }))).toBe(
      '# History\n\nthree'
    );
  });
});
