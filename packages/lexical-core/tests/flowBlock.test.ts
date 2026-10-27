import { $isCodeNode } from '@lexical/code';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type Transformer,
} from '@lexical/markdown';
import { $getRoot, createEditor } from 'lexical';
import { describe, expect, it } from 'vitest';
import { SupportedNodeTypes } from '../node-list';
import {
  ALL_TRANSFORMERS,
  EXTERNAL_TRANSFORMERS,
  INTERNAL_TRANSFORMERS,
} from '../transformers';

const MERMAID = [
  '```mermaid',
  'flowchart LR',
  '  %% a comment the chart ignores',
  '  A[Start] -->|yes| B{Check?}',
  '  B -.-> C((Done)):::ok ; B ==> D[[Retry]]',
  '  subgraph S [Group]',
  '    D --> E([End])',
  '  end',
  '  classDef ok fill:#9f6,stroke:#333',
  '```',
].join('\n');

const FLOW = [
  '```flow',
  'direction: LR',
  'nodes:',
  '  - { id: a, label: "Start", shape: stadium }',
  '  - id: b',
  '    label: Check',
  '    shape: diamond',
  'edges:',
  '  - a -> b: maybe',
  '```',
].join('\n');

function editorFor(markdown: string, transformers: Transformer[]) {
  const editor = createEditor({
    nodes: SupportedNodeTypes,
    onError(error) {
      throw error;
    },
  });
  editor.update(() => $convertFromMarkdownString(markdown, transformers), {
    discrete: true,
  });
  return editor;
}

describe('flow blocks in Markdown', () => {
  it.each([
    ['internal', INTERNAL_TRANSFORMERS],
    ['external', EXTERNAL_TRANSFORMERS],
    ['all', ALL_TRANSFORMERS],
  ] as const)(
    'round-trips mermaid and flow fences unchanged (%s)',
    (_, transformers) => {
      const markdown = `Intro\n\n${MERMAID}\n\n${FLOW}\n\nOutro`;
      const editor = editorFor(markdown, transformers);
      const exported = editor.read(() =>
        $convertToMarkdownString(transformers)
      );
      expect(exported).toBe(markdown);
    }
  );

  it('keeps the language and the exact source on the code node', () => {
    const editor = editorFor(MERMAID, ALL_TRANSFORMERS);
    const code = editor.read(() => {
      const node = $getRoot().getFirstChild();
      if (!$isCodeNode(node)) throw new Error('expected a code node');
      return { language: node.getLanguage(), text: node.getTextContent() };
    });
    expect(code.language).toBe('mermaid');
    expect(code.text).toBe(MERMAID.split('\n').slice(1, -1).join('\n'));
  });

  it('survives a Lexical JSON round trip', () => {
    const editor = editorFor(FLOW, ALL_TRANSFORMERS);
    const json = editor.getEditorState().toJSON();
    const copy = createEditor({ nodes: SupportedNodeTypes });
    copy.setEditorState(copy.parseEditorState(json));
    const exported = copy.read(() =>
      $convertToMarkdownString(ALL_TRANSFORMERS)
    );
    expect(exported).toBe(FLOW);
  });
});
