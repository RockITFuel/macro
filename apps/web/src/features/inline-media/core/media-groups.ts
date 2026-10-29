import type { MediaKind, MediaRef } from './media-refs';

/** One picture or video, possibly stored in several formats (mp4 and webm). */
export type MediaEntry = {
  kind: MediaKind;
  /** The first ref; its document carries the tile's size and lightbox slot. */
  primary: MediaRef;
  /** Every stored format, in the order they were linked. */
  formats: MediaRef[];
};

/** A gallery tile: one entry, or a light and a dark variant of the same picture. */
export type MediaTile =
  | { type: 'single'; entry: MediaEntry }
  | { type: 'pair'; light: MediaEntry; dark: MediaEntry };

const EXTENSION = /\.([a-z0-9]{2,5})$/i;
const VARIANT = /^(.*?)[-_.](light|dark)$/i;

function splitName(name: string | undefined) {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  const ext = EXTENSION.exec(lower);
  return ext ? lower.slice(0, -ext[0].length) : lower;
}

/** Joins formats of the same video, keeping the order of first appearance. */
function toEntries(refs: MediaRef[]): MediaEntry[] {
  const entries: MediaEntry[] = [];
  const videosByBase = new Map<string, MediaEntry>();
  for (const ref of refs) {
    const base = splitName(ref.name);
    const known =
      ref.kind === 'video' && base ? videosByBase.get(base) : undefined;
    if (known) {
      known.formats.push(ref);
      continue;
    }
    const entry: MediaEntry = { kind: ref.kind, primary: ref, formats: [ref] };
    entries.push(entry);
    if (ref.kind === 'video' && base) videosByBase.set(base, entry);
  }
  return entries;
}

/**
 * Turns a message's media into gallery tiles: formats of one video share a
 * player, and `name-light.*` with `name-dark.*` of the same kind become one
 * tile with a light/dark switch.
 */
export function groupMediaTiles(refs: MediaRef[]): MediaTile[] {
  const entries = toEntries(refs);
  const variantOf = (entry: MediaEntry) => {
    const match = VARIANT.exec(splitName(entry.primary.name) ?? '');
    if (!match) return undefined;
    return {
      key: `${entry.kind}:${match[1]}`,
      variant: match[2].toLowerCase(),
    };
  };
  const partners = new Map<string, { light?: MediaEntry; dark?: MediaEntry }>();
  for (const entry of entries) {
    const variant = variantOf(entry);
    if (!variant) continue;
    const pair = partners.get(variant.key) ?? {};
    if (variant.variant === 'light') pair.light ??= entry;
    else pair.dark ??= entry;
    partners.set(variant.key, pair);
  }

  const tiles: MediaTile[] = [];
  const placed = new Set<MediaEntry>();
  for (const entry of entries) {
    if (placed.has(entry)) continue;
    const variant = variantOf(entry);
    const pair = variant ? partners.get(variant.key) : undefined;
    if (pair?.light && pair.dark) {
      tiles.push({ type: 'pair', light: pair.light, dark: pair.dark });
      placed.add(pair.light);
      placed.add(pair.dark);
      continue;
    }
    tiles.push({ type: 'single', entry });
    placed.add(entry);
  }
  return tiles;
}

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
};

/** The `<source type>` of a video file name, when its extension is known. */
export function videoMimeType(name: string | undefined): string | undefined {
  const ext = name ? EXTENSION.exec(name.toLowerCase())?.[1] : undefined;
  return ext ? VIDEO_TYPES[ext] : undefined;
}
