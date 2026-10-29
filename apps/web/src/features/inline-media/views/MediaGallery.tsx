import { liveThemeMode } from '@app/features/theme/signals/themeSignals';
import ArrowsOutIcon from '@icon/system/regular/arrows-out-simple.svg';
import ImageIcon from '@icon/system/regular/image.svg';
import { Button, cn, Tabs } from '@ui';
import {
  createMemo,
  createSignal,
  For,
  Index,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { ResizableFrame } from '../components/ResizableFrame';
import { useInlineMedia } from '../context/inline-media-context';
import {
  groupMediaTiles,
  type MediaEntry,
  type MediaTile,
  videoMimeType,
} from '../core/media-groups';
import type { MediaRef } from '../core/media-refs';
import type { LightboxSlot } from '../primitives/create-media-lightbox';
import { useMediaUrl } from '../queries/media-url';

type Variant = 'light' | 'dark';

const VARIANT_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/**
 * Images and videos shown in place of their links: one tile per picture or
 * video, two or three to a row when there are several, each resizable and
 * opening the page's lightbox.
 */
export function MediaGallery(props: { refs: MediaRef[] }) {
  const tiles = createMemo(() => groupMediaTiles(props.refs));
  return (
    <div
      data-inline-media-gallery
      class="my-2 flex flex-wrap items-start gap-2 whitespace-normal"
    >
      <For each={tiles()}>
        {(tile) => <TileView tile={tile} count={tiles().length} />}
      </For>
    </div>
  );
}

function TileView(props: { tile: MediaTile; count: number }) {
  const media = useInlineMedia();
  const [variant, setVariant] = createSignal<Variant>();
  const shownVariant = () => variant() ?? liveThemeMode();
  const entry = (): MediaEntry => {
    const tile = props.tile;
    if (tile.type === 'single') return tile.entry;
    return shownVariant() === 'light' ? tile.light : tile.dark;
  };
  // A light/dark tile keeps one size for both variants.
  const sizeKey = () =>
    props.tile.type === 'single'
      ? props.tile.entry.primary.documentId
      : props.tile.light.primary.documentId;
  const label = () => entry().primary.name ?? 'media';

  return (
    <ResizableFrame
      width={media?.layout.width(sizeKey())}
      onResize={(width) => media?.layout.setWidth(sizeKey(), width)}
      label={label()}
      class={cn(
        props.count === 1 && 'w-120',
        props.count === 2 && 'w-[calc(50%-4px)]',
        props.count > 2 && 'w-[calc(50%-4px)] sm:w-[calc((100%-16px)/3)]'
      )}
    >
      <figure class="m-0 flex flex-col gap-1">
        <EntryView entry={entry()} />
        <figcaption class="flex min-h-6 items-center gap-2 text-xs text-ink-muted">
          <span class="min-w-0 flex-1 truncate" title={label()}>
            {label()}
          </span>
          <Show when={props.tile.type === 'pair'}>
            <Tabs
              aria-label={`Variant of ${label()}`}
              size="sm"
              options={VARIANT_OPTIONS}
              value={shownVariant()}
              onChange={setVariant}
            />
          </Show>
        </figcaption>
      </figure>
    </ResizableFrame>
  );
}

function EntryView(props: { entry: MediaEntry }) {
  return (
    <Switch>
      <Match when={props.entry.kind === 'image'}>
        <ImageView entry={props.entry} />
      </Match>
      <Match when={props.entry.kind === 'video'}>
        <VideoView entry={props.entry} />
      </Match>
    </Switch>
  );
}

/** Registers the tile with the page's lightbox while it is mounted. */
function useLightboxSlot(
  element: () => HTMLElement,
  entry: () => MediaEntry,
  video?: () => HTMLVideoElement | undefined
) {
  const media = useInlineMedia();
  if (!media) return undefined;
  let slot: LightboxSlot | undefined;
  onMount(() => {
    slot = { element: element(), entry, video };
    onCleanup(media.lightbox.register(slot));
  });
  return () => {
    if (slot) media.lightbox.open(slot);
  };
}

function MediaStatus(props: { failed: boolean; children?: JSX.Element }) {
  return (
    <div
      role="status"
      class="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-edge-muted bg-surface text-xs text-ink-muted"
    >
      <ImageIcon class="size-4" />
      {props.failed ? 'Preview unavailable' : props.children}
    </div>
  );
}

function ImageView(props: { entry: MediaEntry }) {
  let button!: HTMLButtonElement;
  const source = useMediaUrl(() => props.entry.primary.documentId);
  const open = useLightboxSlot(
    () => button,
    () => props.entry
  );
  const name = () => props.entry.primary.name ?? 'image';

  return (
    <button
      ref={button}
      type="button"
      aria-label={`Open ${name()}`}
      data-inline-media="image"
      class="block w-full overflow-hidden rounded-lg border border-edge-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
      onClick={() => open?.()}
    >
      <Show
        when={source.url()}
        fallback={<MediaStatus failed={source.failed()} />}
      >
        {(url) => (
          <img
            src={url()}
            alt={name()}
            loading="lazy"
            decoding="async"
            class="block h-auto w-full"
          />
        )}
      </Show>
    </button>
  );
}

function VideoView(props: { entry: MediaEntry }) {
  let container!: HTMLDivElement;
  const [video, setVideo] = createSignal<HTMLVideoElement>();
  const open = useLightboxSlot(
    () => container,
    () => props.entry,
    video
  );
  const name = () => props.entry.primary.name ?? 'video';

  return (
    <div
      ref={container}
      data-inline-media="video"
      class="relative overflow-hidden rounded-lg border border-edge-muted bg-[black]"
    >
      <video
        ref={setVideo}
        controls
        playsinline
        preload="metadata"
        aria-label={name()}
        class="block aspect-video h-auto w-full"
      >
        <Index each={props.entry.formats}>
          {(format) => <VideoSource format={format()} />}
        </Index>
      </video>
      <Show when={open}>
        {(openLightbox) => (
          <Button
            variant="ghost"
            size="icon-sm"
            label={`Enlarge ${name()}`}
            class="absolute top-1 right-1 bg-surface/80"
            onClick={() => openLightbox()()}
          >
            <ArrowsOutIcon />
          </Button>
        )}
      </Show>
    </div>
  );
}

/** One stored format; `#t` makes the browser paint the first frame as poster. */
function VideoSource(props: { format: MediaRef }) {
  const source = useMediaUrl(() => props.format.documentId);
  return (
    <Show when={source.url()}>
      {(url) => (
        <source
          src={`${url()}#t=0.001`}
          type={videoMimeType(props.format.name)}
        />
      )}
    </Show>
  );
}
