export type MediaKind = 'image' | 'video';

/** A stored image or video a message refers to, by mention or app link. */
export type MediaRef = {
  documentId: string;
  kind: MediaKind;
  /** File name from the mention or the link text; absent for a bare URL. */
  name?: string;
};

/** A message body cut into markdown and the media that replace their links. */
export type MediaSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'media'; refs: MediaRef[] };

const MENTION_PATTERN = /<m-document-mention>([\s\S]*?)<\/m-document-mention>/g;
const LINK_PATTERN = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;
const URL_PATTERN = /https?:\/\/[^\s)<>\]]+/g;
const APP_MEDIA_PATH = /^\/app\/(image|video)\/([0-9a-f-]{36})\/?$/i;
// What may stay on a line besides its media for the line to count as media
// only: list markers, separators and spaces.
const LEFTOVER_ONLY = /^\s*(?:[-*+]|\d+[.)])?[\s·•|,;:–-]*$/;
const FENCE = /^\s*(```|~~~)/;

function kindFromBlockName(blockName: unknown): MediaKind | undefined {
  if (blockName === 'image' || blockName === 'video') return blockName;
  return undefined;
}

/** The media a URL points at when it is an `/app/image|video/<id>` link of `origin`. */
function parseAppMediaUrl(
  href: string,
  origin: string
): Pick<MediaRef, 'documentId' | 'kind'> | undefined {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return undefined;
  }
  if (url.origin !== origin) return undefined;
  const match = APP_MEDIA_PATH.exec(url.pathname);
  if (!match) return undefined;
  const kind = kindFromBlockName(match[1].toLowerCase());
  if (!kind) return undefined;
  return { documentId: match[2].toLowerCase(), kind };
}

function parseMention(json: string): MediaRef | undefined {
  try {
    const mention = JSON.parse(json);
    const kind = kindFromBlockName(mention?.blockName);
    if (!kind || typeof mention.documentId !== 'string') return undefined;
    return {
      documentId: mention.documentId,
      kind,
      name:
        typeof mention.documentName === 'string'
          ? mention.documentName
          : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Media on one line, and the line with them removed. */
function lineMedia(line: string, origin: string) {
  const refs: MediaRef[] = [];
  let rest = line.replace(MENTION_PATTERN, (whole, json: string) => {
    const ref = parseMention(json);
    if (!ref) return whole;
    refs.push(ref);
    return '';
  });
  rest = rest.replace(LINK_PATTERN, (whole, text: string, href: string) => {
    const media = parseAppMediaUrl(href, origin);
    if (!media) return whole;
    refs.push({ ...media, name: text.trim() || undefined });
    return '';
  });
  rest = rest.replace(URL_PATTERN, (whole) => {
    const media = parseAppMediaUrl(whole, origin);
    if (!media) return whole;
    refs.push(media);
    return '';
  });
  return { refs, mediaOnly: refs.length > 0 && LEFTOVER_ONLY.test(rest) };
}

/** Keeps the first ref per document, filling a missing name from a later one. */
function dedupe(refs: MediaRef[], seen: Map<string, MediaRef>): MediaRef[] {
  const fresh: MediaRef[] = [];
  for (const ref of refs) {
    const known = seen.get(ref.documentId);
    if (known) {
      known.name ??= ref.name;
      continue;
    }
    const copy = { ...ref };
    seen.set(ref.documentId, copy);
    fresh.push(copy);
  }
  return fresh;
}

/**
 * Splits a message into markdown and media. Lines that hold nothing but media
 * (a list of video links, a mention per line) become a media segment in their
 * place; media named inside running text keep their link and are shown after
 * that text. Code blocks are left alone.
 */
export function segmentMessageMedia(
  content: string,
  origin: string
): MediaSegment[] {
  const segments: MediaSegment[] = [];
  const seen = new Map<string, MediaRef>();
  let text: string[] = [];
  let trailing: MediaRef[] = [];
  let inFence = false;

  const pushMedia = (refs: MediaRef[]) => {
    const fresh = dedupe(refs, seen);
    if (fresh.length === 0) return;
    const last = segments.at(-1);
    if (last?.type === 'media') last.refs.push(...fresh);
    else segments.push({ type: 'media', refs: fresh });
  };
  const flushText = () => {
    const markdown = text.join('\n');
    text = [];
    if (markdown.trim()) segments.push({ type: 'markdown', markdown });
    pushMedia(trailing);
    trailing = [];
  };

  for (const line of content.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence || FENCE.test(line)) {
      text.push(line);
      continue;
    }
    const { refs, mediaOnly } = lineMedia(line, origin);
    if (mediaOnly) {
      flushText();
      pushMedia(refs);
      continue;
    }
    // A blank line between media-only lines keeps the gallery together.
    if (!line.trim() && segments.at(-1)?.type === 'media' && !text.length) {
      continue;
    }
    text.push(line);
    trailing.push(...refs);
  }
  flushText();
  return segments;
}

/** Every media ref in `content`, in order and without repeats. */
export function collectMedia(content: string, origin: string): MediaRef[] {
  return segmentMessageMedia(content, origin).flatMap((segment) =>
    segment.type === 'media' ? segment.refs : []
  );
}
