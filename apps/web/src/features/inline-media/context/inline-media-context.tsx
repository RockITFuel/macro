import { createContext, type JSX, useContext } from 'solid-js';
import type { MediaLayout } from '../primitives/create-media-layout';
import type { MediaLightbox } from '../primitives/create-media-lightbox';

/** What inline media on one page share: their widths and the lightbox. */
export type InlineMediaContextValue = {
  /** Origin whose `/app/image|video/<id>` links render as media. */
  origin: string;
  layout: MediaLayout;
  lightbox: MediaLightbox;
};

const InlineMediaContext = createContext<InlineMediaContextValue>();

export function InlineMediaContextProvider(props: {
  value: InlineMediaContextValue;
  children: JSX.Element;
}) {
  return (
    <InlineMediaContext.Provider value={props.value}>
      {props.children}
    </InlineMediaContext.Provider>
  );
}

/**
 * The page's inline media, or undefined where the host shows media links as
 * plain links (channels keep their own attachment gallery).
 */
export function useInlineMedia(): InlineMediaContextValue | undefined {
  return useContext(InlineMediaContext);
}
