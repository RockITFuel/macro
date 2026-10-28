import { describe, expect, it } from 'vitest';
import { panelColumnWidth, withLandingKey } from './kanban-board';

describe('panel column width', () => {
  it('shares the viewport between the columns', () => {
    // 1600 - 2 * 16 padding - 3 * 12 gaps = 1532, over four columns.
    expect(panelColumnWidth(1600, 4)).toBe(383);
  });

  it('never gets narrower than 256px, so a crowded board scrolls', () => {
    expect(panelColumnWidth(900, 8)).toBe(256);
    expect(panelColumnWidth(0, 3)).toBe(256);
  });

  it('fits exactly without a horizontal scrollbar', () => {
    const width = panelColumnWidth(1001, 3);
    expect(16 * 2 + width * 3 + 12 * 2).toBeLessThanOrEqual(1001);
  });
});

describe('landing placeholder row', () => {
  it('takes its own row at the landing index', () => {
    expect(withLandingKey(['a', 'b'], { id: 'moving', index: 1 })).toEqual([
      'a',
      'kanban-landing:moving',
      'b',
    ]);
  });

  it('replaces another placement of the same card and clamps to the column', () => {
    expect(
      withLandingKey(['a', 'moving', 'b'], { id: 'moving', index: 9 })
    ).toEqual(['a', 'b', 'kanban-landing:moving']);
  });

  it('leaves the rows alone without a landing', () => {
    const rows = ['a', 'b'];
    expect(withLandingKey(rows, undefined)).toBe(rows);
  });
});
