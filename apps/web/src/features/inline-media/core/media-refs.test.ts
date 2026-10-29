import { describe, expect, it } from 'vitest';
import { groupMediaTiles } from './media-groups';
import { collectMedia, segmentMessageMedia } from './media-refs';

const ORIGIN = 'https://macro.example.com';
const id = (n: number) =>
  `01a186ba-0000-7000-8000-${String(n).padStart(12, '0')}`;
const link = (name: string, kind: string, n: number) =>
  `[${name}](${ORIGIN}/app/${kind}/${id(n)})`;
const mention = (name: string, blockName: string, n: number) =>
  `<m-document-mention>${JSON.stringify({ documentId: id(n), documentName: name, blockName })}</m-document-mention>`;

describe('segmentMessageMedia', () => {
  it('turns a list of media links into one media segment in its place', () => {
    const content = [
      '**Files** (project Alpha):',
      '',
      `- ${link('a.mp4', 'video', 1)}`,
      `- ${link('a.webm', 'video', 2)}`,
      '',
      `- ${link('b.png', 'image', 3)}`,
      '',
      '# Report',
    ].join('\n');

    const segments = segmentMessageMedia(content, ORIGIN);

    expect(segments.map((segment) => segment.type)).toEqual([
      'markdown',
      'media',
      'markdown',
    ]);
    expect(segments[1]).toEqual({
      type: 'media',
      refs: [
        { documentId: id(1), kind: 'video', name: 'a.mp4' },
        { documentId: id(2), kind: 'video', name: 'a.webm' },
        { documentId: id(3), kind: 'image', name: 'b.png' },
      ],
    });
    expect(segments[2]).toEqual({ type: 'markdown', markdown: '# Report' });
  });

  it('keeps media named in running text and shows them after it', () => {
    const content = `Light: ${mention('x-light.png', 'image', 4)} · ${ORIGIN}/app/image/${id(4)}`;

    const segments = segmentMessageMedia(content, ORIGIN);

    expect(segments).toEqual([
      { type: 'markdown', markdown: content },
      {
        type: 'media',
        refs: [{ documentId: id(4), kind: 'image', name: 'x-light.png' }],
      },
    ]);
  });

  it('ignores other origins, non-media mentions and code blocks', () => {
    const content = [
      link('other.png', 'image', 5).replace(ORIGIN, 'https://elsewhere.com'),
      mention('notes.md', 'md', 6),
      '```',
      link('code.png', 'image', 7),
      '```',
    ].join('\n');

    expect(collectMedia(content, ORIGIN)).toEqual([]);
  });
});

describe('groupMediaTiles', () => {
  it('joins formats of one video and light/dark variants into one tile', () => {
    const refs = collectMedia(
      [
        link('glass-light.mp4', 'video', 1),
        link('glass-dark.mp4', 'video', 2),
        link('glass-light.webm', 'video', 3),
        link('glass-dark.webm', 'video', 4),
        link('sheet.png', 'image', 5),
      ].join('\n'),
      ORIGIN
    );

    const tiles = groupMediaTiles(refs);

    expect(tiles).toHaveLength(2);
    const [pair, single] = tiles;
    expect(pair.type).toBe('pair');
    if (pair.type !== 'pair') return;
    expect(pair.light.formats.map((ref) => ref.name)).toEqual([
      'glass-light.mp4',
      'glass-light.webm',
    ]);
    expect(pair.dark.formats.map((ref) => ref.name)).toEqual([
      'glass-dark.mp4',
      'glass-dark.webm',
    ]);
    expect(single).toMatchObject({
      type: 'single',
      entry: { primary: { name: 'sheet.png' } },
    });
  });

  it('leaves a lone light variant as a single tile', () => {
    const refs = collectMedia(link('only-light.png', 'image', 1), ORIGIN);
    expect(groupMediaTiles(refs)).toMatchObject([{ type: 'single' }]);
  });
});
