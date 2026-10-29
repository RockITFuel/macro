import { DocumentDownloadButton } from '@core/component/DocumentDownloadButton';
import { openExternalUrl } from '@core/util/url';
import ArrowSquareOutIcon from '@icon/system/regular/arrow-square-out.svg';
import CaretLeftIcon from '@icon/system/regular/caret-left.svg';
import CaretRightIcon from '@icon/system/regular/caret-right.svg';
import XIcon from '@icon/system/regular/x.svg';
import { makeEventListener } from '@solid-primitives/event-listener';
import { Button, Dialog } from '@ui';
import { createSignal, Index, Match, Show, Switch } from 'solid-js';
import { videoMimeType } from '../core/media-groups';
import type { MediaRef } from '../core/media-refs';
import type { MediaLightbox as MediaLightboxState } from '../primitives/create-media-lightbox';
import { useMediaUrl } from '../queries/media-url';

const SWIPE_DISTANCE = 50;

/**
 * Full-screen view of the page's media: arrows, swipe and ←/→ step through
 * every tile on the page, Escape closes, and a video continues from where its
 * tile was and hands its position back on close.
 */
export function MediaLightbox(props: { lightbox: MediaLightboxState }) {
  const lightbox = () => props.lightbox;
  const [player, setPlayer] = createSignal<HTMLVideoElement>();
  const entry = () => lightbox().current()?.entry();
  const total = () => lightbox().slots().length;
  const at = () => lightbox().index() ?? 0;
  const name = () => entry()?.primary.name ?? 'Media';

  const close = () => {
    const tileVideo = lightbox().current()?.video?.();
    const shown = player();
    if (tileVideo && shown) tileVideo.currentTime = shown.currentTime;
    lightbox().close();
  };

  let touchStartX: number | undefined;
  const onTouchStart = (event: TouchEvent) => {
    touchStartX =
      event.touches.length === 1 ? event.touches[0].clientX : undefined;
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStartX === undefined) return;
    const distance = touchStartX - event.changedTouches[0].clientX;
    touchStartX = undefined;
    if (Math.abs(distance) < SWIPE_DISTANCE) return;
    lightbox().step(distance > 0 ? 1 : -1);
  };
  // On the document, so the keys keep working when stepping removes the
  // focused player.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') lightbox().step(1);
    else if (event.key === 'ArrowLeft') lightbox().step(-1);
    else if (event.key === 'Escape') close();
    else return;
    event.preventDefault();
  };

  return (
    <Dialog
      open={entry() !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      fullscreen
      class="bg-[black]/90 text-[white]"
    >
      <Show when={entry()}>
        {(current) => (
          <div
            data-inline-media-lightbox
            class="flex size-full flex-col"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <DocumentKeys onKeyDown={onKeyDown} />
            <header class="flex items-center gap-2 bg-page p-2 pt-[max(var(--safe-top,0px),0.5rem)] text-ink">
              <Dialog.Title class="min-w-0 flex-1 truncate text-sm font-medium">
                {name()}
              </Dialog.Title>
              <Show when={total() > 1}>
                <span class="text-xs text-ink-muted tabular-nums">
                  {at() + 1}/{total()}
                </span>
              </Show>
              <OpenInNewTab documentId={current().primary.documentId} />
              <DocumentDownloadButton
                documentId={current().primary.documentId}
              />
              <Button
                variant="ghost"
                size="icon-md"
                label="Close"
                onClick={close}
              >
                <XIcon />
              </Button>
            </header>
            <div class="relative flex min-h-0 flex-1 items-center justify-center p-2 pb-[max(var(--safe-bottom,0px),0.5rem)]">
              {/* Keyed so a video switches source instead of keeping the old one. */}
              <Show when={current()} keyed>
                {(shown) => (
                  <Switch>
                    <Match when={shown.kind === 'image'}>
                      <LightboxImage refs={shown.formats} name={name()} />
                    </Match>
                    <Match when={shown.kind === 'video'}>
                      <video
                        ref={setPlayer}
                        controls
                        autoplay
                        playsinline
                        aria-label={name()}
                        class="max-h-full max-w-full"
                        onLoadedMetadata={(event) => {
                          event.currentTarget.currentTime =
                            lightbox().startTime();
                        }}
                      >
                        <Index each={shown.formats}>
                          {(format) => (
                            <LightboxVideoSource format={format()} />
                          )}
                        </Index>
                      </video>
                    </Match>
                  </Switch>
                )}
              </Show>
              <Show when={at() > 0}>
                <Button
                  variant="outline"
                  size="icon-md"
                  label="Previous media"
                  class="absolute left-2"
                  onClick={() => lightbox().step(-1)}
                >
                  <CaretLeftIcon />
                </Button>
              </Show>
              <Show when={at() < total() - 1}>
                <Button
                  variant="outline"
                  size="icon-md"
                  label="Next media"
                  class="absolute right-2"
                  onClick={() => lightbox().step(1)}
                >
                  <CaretRightIcon />
                </Button>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Dialog>
  );
}

function LightboxImage(props: { refs: MediaRef[]; name: string }) {
  const source = useMediaUrl(() => props.refs[0].documentId);
  return (
    <Show when={source.url()}>
      {(url) => (
        <img
          src={url()}
          alt={props.name}
          class="max-h-full max-w-full object-contain"
        />
      )}
    </Show>
  );
}

function LightboxVideoSource(props: { format: MediaRef }) {
  const source = useMediaUrl(() => props.format.documentId);
  return (
    <Show when={source.url()}>
      {(url) => <source src={url()} type={videoMimeType(props.format.name)} />}
    </Show>
  );
}

function OpenInNewTab(props: { documentId: string }) {
  const source = useMediaUrl(() => props.documentId);
  return (
    <Show when={source.url()}>
      {(url) => (
        <Button
          variant="ghost"
          size="icon-md"
          label="Open in new tab"
          onClick={() => openExternalUrl(url())}
        >
          <ArrowSquareOutIcon />
        </Button>
      )}
    </Show>
  );
}

/** Listens on the document while mounted. */
function DocumentKeys(props: { onKeyDown: (event: KeyboardEvent) => void }) {
  makeEventListener(document, 'keydown', (event) => props.onKeyDown(event));
  return null;
}
