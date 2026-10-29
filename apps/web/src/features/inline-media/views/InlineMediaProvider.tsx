import { getWebOrigin } from '@core/util/webOrigin';
import type { LoroDoc } from 'loro-crdt';
import type { Accessor, JSX } from 'solid-js';
import { InlineMediaContextProvider } from '../context/inline-media-context';
import { createMediaLayout } from '../primitives/create-media-layout';
import { createMediaLightbox } from '../primitives/create-media-lightbox';
import { MediaLightbox } from './MediaLightbox';

/**
 * Inline media for a collaborative document page (a ticket and its
 * Discussion): sizes live in the document's Loro doc, and one lightbox steps
 * through every image and video on the page.
 */
export function InlineMediaProvider(props: {
  doc: LoroDoc;
  canEdit: Accessor<boolean>;
  children: JSX.Element;
}) {
  const layout = createMediaLayout(props.doc, props.canEdit);
  const lightbox = createMediaLightbox();
  return (
    <InlineMediaContextProvider
      value={{ origin: getWebOrigin(), layout, lightbox }}
    >
      {props.children}
      <MediaLightbox lightbox={lightbox} />
    </InlineMediaContextProvider>
  );
}
