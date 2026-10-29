import { deepEqual } from '@core/util/compareUtils';
import { debouncedDependent } from '@core/util/debounce';
import { $isLinkNode } from '@lexical/link';
import { $dfsIterator } from '@lexical/utils';
import { $isDocumentMentionNode } from '@macro-inc/lexical-core';
import type { LexicalEditor } from 'lexical';
import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { useInlineMedia } from '../context/inline-media-context';
import { collectMedia, type MediaRef } from '../core/media-refs';
import { MediaGallery } from './MediaGallery';

const RECOLLECT_DELAY_MS = 300;

/** The description's media links and mentions, as the markdown they stand for. */
function $descriptionMediaMarkdown(): string {
  const lines: string[] = [];
  for (const { node } of $dfsIterator()) {
    if ($isLinkNode(node)) {
      lines.push(`[${node.getTextContent()}](${node.getURL()})`);
    } else if ($isDocumentMentionNode(node)) {
      lines.push(
        `<m-document-mention>${JSON.stringify({
          documentId: node.getDocumentId(),
          documentName: node.getDocumentName(),
          blockName: node.getBlockName(),
        })}</m-document-mention>`
      );
    }
  }
  return lines.join('\n');
}

/**
 * The images and videos a document's text links to or mentions, shown as a
 * gallery below the editor. The links stay in the text, editable as before.
 */
export function DescriptionMedia(props: {
  editor: () => LexicalEditor | undefined;
}) {
  const media = useInlineMedia();
  const [refs, setRefs] = createSignal<MediaRef[]>([], { equals: deepEqual });
  const settledRefs = debouncedDependent(refs, RECOLLECT_DELAY_MS);

  createEffect(
    on(props.editor, (editor) => {
      if (!editor || !media) return;
      const collect = () =>
        setRefs(
          collectMedia(
            editor.getEditorState().read($descriptionMediaMarkdown),
            media.origin
          )
        );
      collect();
      onCleanup(editor.registerUpdateListener(collect));
    })
  );

  return (
    <Show when={settledRefs().length > 0}>
      <div data-description-media>
        <MediaGallery refs={settledRefs()} />
      </div>
    </Show>
  );
}
