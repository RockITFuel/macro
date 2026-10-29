import type { LoroDoc } from 'loro-crdt';
import { type Accessor, createSignal, onCleanup } from 'solid-js';

/** Root map of a document's Loro doc holding the display width per media document. */
const MEDIA_LAYOUT_MAP = 'mediaLayout';
// `history-` keeps a resize out of the editor's undo stack (see collaboration/undo.ts).
const MEDIA_LAYOUT_ORIGIN = 'history-media-layout';

export const MIN_MEDIA_WIDTH = 160;

export type MediaLayout = {
  /** Chosen display width in CSS pixels, or undefined for the default. */
  width: (documentId: string) => number | undefined;
  setWidth: (documentId: string, width: number) => void;
};

/**
 * Media widths stored in the host document's Loro doc, so a resize persists
 * and reaches everyone with the document open through its sync stream.
 * Without edit rights a resize applies to this view only.
 */
export function createMediaLayout(
  doc: LoroDoc,
  canEdit: Accessor<boolean>
): MediaLayout {
  const map = doc.getMap(MEDIA_LAYOUT_MAP);
  const [version, setVersion] = createSignal(0);
  const [local, setLocal] = createSignal<Record<string, number>>({});
  const unsubscribe = map.subscribe(() => setVersion((v) => v + 1));
  onCleanup(unsubscribe);

  return {
    width: (documentId) => {
      const own = local()[documentId];
      if (own !== undefined) return own;
      version();
      const stored = map.get(documentId);
      return typeof stored === 'number' ? stored : undefined;
    },
    setWidth: (documentId, width) => {
      const rounded = Math.max(MIN_MEDIA_WIDTH, Math.round(width));
      if (!canEdit()) {
        setLocal((prev) => ({ ...prev, [documentId]: rounded }));
        return;
      }
      if (map.get(documentId) === rounded) return;
      map.set(documentId, rounded);
      doc.commit({ origin: MEDIA_LAYOUT_ORIGIN });
    },
  };
}

/** Widths for hosts without a shared document: kept for this view only. */
export function createLocalMediaLayout(): MediaLayout {
  const [widths, setWidths] = createSignal<Record<string, number>>({});
  return {
    width: (documentId) => widths()[documentId],
    setWidth: (documentId, width) =>
      setWidths((prev) => ({
        ...prev,
        [documentId]: Math.max(MIN_MEDIA_WIDTH, Math.round(width)),
      })),
  };
}
