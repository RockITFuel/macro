import { validateSchema } from '@loro-mirror/core';
import { MARKDOWN_LORO_SCHEMA } from '@macro-inc/lexical-core/markdown-loro-schema';
import { LoroDoc } from 'loro-crdt';
import { createRoot } from 'solid-js';
import { expect, it } from 'vitest';
import { createMediaLayout } from './create-media-layout';

const VIDEO = '01a186ba-9944-7d0c-b28c-b7c2224cc2a5';

function layoutOn(doc: LoroDoc, canEdit: boolean) {
  return createRoot((dispose) => ({
    layout: createMediaLayout(doc, () => canEdit),
    dispose,
  }));
}

it('syncs an editor resize to another copy of the document and keeps it valid markdown state', () => {
  const docA = new LoroDoc();
  const docB = new LoroDoc();
  const a = layoutOn(docA, true);
  const b = layoutOn(docB, true);

  a.layout.setWidth(VIDEO, 321.6);
  docB.import(docA.export({ mode: 'update' }));

  expect(a.layout.width(VIDEO)).toBe(322);
  expect(b.layout.width(VIDEO)).toBe(322);
  expect(
    validateSchema(
      MARKDOWN_LORO_SCHEMA.definition.mediaLayout,
      docA.toJSON().mediaLayout
    ).valid
  ).toBe(true);
  a.dispose();
  b.dispose();
});

it('keeps a resize without edit rights to this view, and never below the minimum', () => {
  const doc = new LoroDoc();
  const viewer = layoutOn(doc, false);

  viewer.layout.setWidth(VIDEO, 40);

  expect(viewer.layout.width(VIDEO)).toBe(160);
  expect(doc.getMap('mediaLayout').get(VIDEO)).toBeUndefined();
  viewer.dispose();
});
