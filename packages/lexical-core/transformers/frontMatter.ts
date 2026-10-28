import { $createCodeNode, $isCodeNode, CodeNode } from '@lexical/code';
import type { MultilineElementTransformer } from '@lexical/markdown';
import { $createTextNode, $getState, $setState, createState } from 'lexical';

/** Marks the code block holding a document's leading YAML front matter. */
export const frontMatterState = createState('frontMatter', {
  parse: (value) => value === true,
});

const FENCE = /^---[ \t]*$/;
// The first line must look like a YAML key so a document that merely opens
// with a horizontal rule keeps it.
const YAML_KEY = /^[\w-]+[ \t]*:/;

/**
 * `---` fenced YAML at the very start of a document, kept verbatim in a yaml
 * code block and exported back between `---` fences. Without it the fences
 * import as horizontal rules and the YAML as escaped paragraph text.
 */
export const FRONT_MATTER: MultilineElementTransformer = {
  dependencies: [CodeNode],
  type: 'multiline-element',
  regExpStart: FENCE,
  regExpEnd: FENCE,
  export: (node) => {
    if (!$isCodeNode(node) || !$getState(node, frontMatterState)) return null;
    return `---\n${node.getTextContent()}\n---`;
  },
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    if (startLineIndex !== 0 || rootNode.getChildrenSize() > 0) return null;
    const end = lines.findIndex((line, index) => index > 0 && FENCE.test(line));
    if (end < 2 || !YAML_KEY.test(lines[1])) return null;
    const node = $createCodeNode('yaml');
    $setState(node, frontMatterState, true);
    node.append($createTextNode(lines.slice(1, end).join('\n')));
    rootNode.append(node);
    return [true, end];
  },
  // Front matter is only recognized when importing a whole document.
  replace: () => false,
};
