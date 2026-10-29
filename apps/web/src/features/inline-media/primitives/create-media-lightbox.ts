import { type Accessor, createMemo, createSignal } from 'solid-js';
import type { MediaEntry } from '../core/media-groups';

/** A tile on the page that the lightbox can show and step through. */
export type LightboxSlot = {
  element: HTMLElement;
  /** The entry the tile shows now (a light/dark tile switches between two). */
  entry: Accessor<MediaEntry>;
  /** The tile's own player, so the lightbox can continue where it was. */
  video?: Accessor<HTMLVideoElement | undefined>;
};

export type MediaLightbox = {
  slots: Accessor<LightboxSlot[]>;
  index: Accessor<number | undefined>;
  current: Accessor<LightboxSlot | undefined>;
  /** Playback position to start the lightbox video at. */
  startTime: Accessor<number>;
  register: (slot: LightboxSlot) => () => void;
  open: (slot: LightboxSlot) => void;
  step: (delta: number) => void;
  close: () => void;
};

function byDocumentOrder(a: LightboxSlot, b: LightboxSlot) {
  const position = a.element.compareDocumentPosition(b.element);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * The media of one page (a ticket's description and Discussion) as a single
 * gallery in page order, with the open lightbox position.
 */
export function createMediaLightbox(): MediaLightbox {
  const [registered, setRegistered] = createSignal<LightboxSlot[]>([]);
  const [openSlot, setOpenSlot] = createSignal<LightboxSlot>();
  const [startTime, setStartTime] = createSignal(0);
  const slots = createMemo(() =>
    registered()
      .filter((slot) => slot.element.isConnected)
      .sort(byDocumentOrder)
  );
  const index = () => {
    const slot = openSlot();
    if (!slot) return undefined;
    const at = slots().indexOf(slot);
    return at === -1 ? undefined : at;
  };

  const show = (slot: LightboxSlot | undefined) => {
    const player = slot?.video?.();
    player?.pause();
    setStartTime(player?.currentTime ?? 0);
    setOpenSlot(slot);
  };

  return {
    slots,
    index,
    current: () => {
      const at = index();
      return at === undefined ? undefined : slots()[at];
    },
    startTime,
    register: (slot) => {
      setRegistered((prev) => [...prev, slot]);
      return () => {
        setRegistered((prev) => prev.filter((other) => other !== slot));
        if (openSlot() === slot) setOpenSlot(undefined);
      };
    },
    open: show,
    step: (delta) => {
      const at = index();
      if (at === undefined) return;
      const next = slots()[at + delta];
      if (next) show(next);
    },
    close: () => setOpenSlot(undefined),
  };
}
