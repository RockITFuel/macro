import { createMemo, For, type JSX, Match, Switch } from 'solid-js';
import { segmentMessageMedia } from '../core/media-refs';
import { MediaGallery } from './MediaGallery';

/**
 * A message body with its image and video links shown as the media itself:
 * lines that only list media become a gallery in their place, and media named
 * inside a sentence follow that paragraph.
 */
export function MessageMedia(props: {
  content: string;
  origin: string;
  markdown: (text: string) => JSX.Element;
}) {
  const segments = createMemo(() =>
    segmentMessageMedia(props.content, props.origin)
  );
  return (
    <For each={segments()}>
      {(segment) => (
        <Switch>
          <Match when={segment.type === 'markdown' && segment}>
            {(text) => props.markdown(text().markdown)}
          </Match>
          <Match when={segment.type === 'media' && segment}>
            {(media) => <MediaGallery refs={media().refs} />}
          </Match>
        </Switch>
      )}
    </For>
  );
}
