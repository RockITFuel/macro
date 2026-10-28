import { createHeadlessEditor } from '@lexical/headless';
import { $convertToMarkdownString } from '@lexical/markdown';
import { type InferType, Mirror } from '@loro-mirror/core';
import type {
  LexicalEditor,
  SerializedEditorState,
  SerializedLexicalNode,
} from 'lexical';
import { LoroDoc } from 'loro-crdt';
import {
  MARKDOWN_LORO_SCHEMA,
  type MarkdownLoroSchemaType,
} from './markdown-loro-schema';
import { markdownToSerializedEditorState } from './markdown-loro-snapshot';
import { NodeReplacements, SupportedNodeTypes } from './node-list';
import { EXTERNAL_TRANSFORMERS } from './transformers';

// Keep in sync with markdown-loro-snapshot.ts: mirror writes settle after a
// few microtasks.
async function awaitMirrorSync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createMarkdownEditor(): LexicalEditor {
  return createHeadlessEditor({
    nodes: [...SupportedNodeTypes, ...NodeReplacements],
  });
}

function externalMarkdown(
  editor: LexicalEditor,
  state: SerializedEditorState
): string {
  editor.setEditorState(editor.parseEditorState(state));
  return editor.read(() => $convertToMarkdownString(EXTERNAL_TRANSFORMERS));
}

/** The external (GFM-like) markdown of a Loro markdown snapshot. */
export function loroSnapshotToMarkdown(snapshot: Uint8Array): string {
  const doc = new LoroDoc();
  doc.import(snapshot);
  return externalMarkdown(
    createMarkdownEditor(),
    doc.toJSON() as SerializedEditorState
  );
}

/**
 * Reuse each current top-level block whose markdown equals a new block's, so
 * unchanged blocks keep their identity, comments and mentions, and the update
 * only touches what changed.
 */
function keepUnchangedBlocks(
  current: SerializedEditorState,
  next: SerializedEditorState
): SerializedLexicalNode[] {
  const editor = createMarkdownEditor();
  const blockMarkdown = (block: SerializedLexicalNode) =>
    externalMarkdown(editor, { root: { ...next.root, children: [block] } });
  const unchanged = new Map<string, SerializedLexicalNode[]>();
  for (const block of current.root.children) {
    const key = blockMarkdown(block);
    unchanged.set(key, [...(unchanged.get(key) ?? []), block]);
  }
  return next.root.children.map(
    (block) => unchanged.get(blockMarkdown(block))?.shift() ?? block
  );
}

/**
 * A Loro update that makes the document in `snapshot` hold exactly
 * `markdown`, or null when it already does. Apply it on top of the
 * snapshot's version; it is an ordinary edit for every peer.
 */
export async function markdownToLoroUpdate(
  snapshot: Uint8Array,
  markdown: string
): Promise<Uint8Array | null> {
  const doc = new LoroDoc();
  doc.setRecordTimestamp(true);
  doc.import(snapshot);
  const before = doc.oplogVersion();
  const frontiers = JSON.stringify(doc.oplogFrontiers());
  const current = doc.toJSON() as SerializedEditorState;
  const next = markdownToSerializedEditorState(markdown);
  const root = {
    ...current.root,
    children: keepUnchangedBlocks(current, next),
  };

  const mirror = new Mirror({ doc, schema: MARKDOWN_LORO_SCHEMA });
  try {
    // The mirror schema types the serialized editor state loosely; the same
    // projection seeds every markdown document (markdown-loro-snapshot.ts).
    mirror.setState({ root } as unknown as InferType<MarkdownLoroSchemaType>);
    mirror.sync();
    await awaitMirrorSync();
  } finally {
    mirror.dispose();
  }
  doc.commit();

  if (JSON.stringify(doc.oplogFrontiers()) === frontiers) return null;
  return doc.export({ mode: 'update', from: before });
}
