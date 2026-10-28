import { describe, expect, it } from 'vitest';
import { markdownToLoroSnapshot } from '../markdown-loro-snapshot';
import { loroSnapshotToMarkdown } from '../markdown-loro-update';

/** Markdown in, through a Loro document, and back out as document text. */
async function roundTrip(markdown: string): Promise<string> {
  const snapshot = await markdownToLoroSnapshot(markdown);
  if (!snapshot) throw new Error('no snapshot');
  return loroSnapshotToMarkdown(snapshot);
}

const SKILL = `---
name: factory_prompt
description: Writes snake_case_names, __dunder__ and "quotes"
tags: [a, b]
---

# Factory prompt

Read MACRO_API_KEY and MACRO_BASE_URL, then run \`bun run macro -- docs get\`.
Files live in ~/macro-wt/markdown-api and packages/cli/src/main.ts.

## Steps

1. Fetch the doc_id
2. Compare with a_b_c
  - nested bullet with \`code_snake\`
3. Done

- [ ] open_task
- [x] done_task

| Name | Value |
| --- | --- |
| max_retries | 3 |
| \`base_url\` | **https://macro.alphamonitoring.app** |

\`\`\`yaml
key: value
list:
  - a_b
\`\`\`

\`\`\`json
{"a_b": 1, "c": [true, null]}
\`\`\`

\`\`\`mermaid
graph TD
  A[start_node] --> B{choice}
\`\`\`

> **Note:** keep a_b intact.

Use {{variable}}, <placeholder> and $HOME; 2 * 3 = 6.
See https://macro.alphamonitoring.app/app/ or mail a.b@example.com.
[link_text](https://example.com/a_b?c=d_e) and ![alt](https://example.com/i.png)

![block image](https://example.com/b.png)

---

Final paragraph.`;

describe('markdown round-trip', () => {
  it('returns a typical skill document byte for byte', async () => {
    expect(await roundTrip(SKILL)).toBe(SKILL);
  });

  it.each([
    ['front matter only', '---\ntitle: x\n---'],
    ['a leading rule is not front matter', '---\n\nafter the rule'],
    ['an ordered list keeps its start', '3. three\n4. four'],
    ['intraword underscores', 'snake_case and MACRO_API_KEY'],
    ['tilde paths', 'cd ~/github/macro && ls ~/macro-wt'],
    ['single tildes', 'about ~5 minutes, ~a~ is no strikethrough'],
    ['spaced asterisk', '2 * 3 and a * b'],
    ['windows paths', 'C:\\Users\\path'],
    ['escaped literals', '\\*not italic\\* and 4\\*5 and \\_x\\_'],
    ['code fence with backticks inside', '````md\n```js\nx\n```\n````'],
    ['code block without language', '```\nplain\n```'],
    ['hard line break', 'line one  \nline two'],
    ['star bullets', '* one\n* two'],
    ['mixed nested lists', '- a\n  1. one\n  2. two\n    - [ ] deep\n- b'],
    ['six heading levels', '###### h6 with snake_case'],
    ['bare www link', 'www.example.com'],
  ])('keeps %s', async (_name, markdown) => {
    expect(await roundTrip(markdown)).toBe(markdown);
  });

  // Equivalent markdown that the document model cannot tell apart.
  it.each([
    ['underscore emphasis becomes asterisks', '_a_ and __b__', '*a* and **b**'],
    ['blank lines collapse', 'one\n\n\n\ntwo', 'one\n\ntwo'],
    ['loose lists become tight', '- a\n\n- b', '- a\n- b'],
    [
      'table alignment is dropped',
      '| L | R |\n| :--- | ---: |\n| a | b |',
      '| L | R |\n| --- | --- |\n| a | b |',
    ],
    [
      'nested lists indent two spaces',
      '1. one\n   1. nested\n2. two',
      '1. one\n  1. nested\n2. two',
    ],
    ['entities are decoded', 'a &amp; b', 'a & b'],
    ['double underscores are strong emphasis', '__init__.py', '**init**.py'],
    [
      'angle autolinks lose brackets',
      '<https://example.com>',
      'https://example.com',
    ],
    ['word-edge underscores are escaped', 'foo_ _bar', 'foo\\_ \\_bar'],
    ['a trailing newline is dropped', 'text\n', 'text'],
  ])('normalizes: %s', async (_name, markdown, normalized) => {
    expect(await roundTrip(markdown)).toBe(normalized);
    expect(await roundTrip(normalized)).toBe(normalized);
  });
});
