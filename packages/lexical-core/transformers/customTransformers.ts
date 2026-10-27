import { $isListItemNode, $isListNode, type ListNode } from '@lexical/list';
import {
  CHECK_LIST,
  type ElementTransformer,
  ORDERED_LIST,
  TRANSFORMERS,
  type Transformer,
  UNORDERED_LIST,
} from '@lexical/markdown';
import { $isHeadingNode } from '@lexical/rich-text';
import { $isElementNode, type ElementNode, type LexicalNode } from 'lexical';
import { HTML_TEXT_FORMAT_TRANSFORMERS } from './htmlTextFormats';

const customTransformer = (
  original: ElementTransformer
): ElementTransformer => {
  return {
    ...original,
    replace: (
      parentNode: ElementNode,
      children: LexicalNode[],
      match: string[],
      isImport: boolean
    ): false | void => {
      if (
        parentNode &&
        $isElementNode(parentNode) &&
        $isHeadingNode(parentNode)
      ) {
        return false;
      }
      if (original === ORDERED_LIST) {
        const nextNode = parentNode.getNextSibling();
        const start = Number(match[2]);

        if (
          Number.isFinite(start) &&
          $isListNode(nextNode) &&
          nextNode.getListType() === 'number'
        ) {
          nextNode.setStart(start);
        }
      }
      const previous = parentNode.getPreviousSibling();
      original.replace(parentNode, children, match, isImport);
      // Lexical only nests an indented item into a list of its own type, so
      // a bullet under a numbered item would start a new top-level list.
      const created = previous?.getNextSibling();
      if (
        isImport &&
        match[1] &&
        $isListNode(previous) &&
        $isListNode(created) &&
        previous.getListType() !== created.getListType()
      ) {
        for (const item of created.getChildren())
          $mergeListItem(previous, item);
        created.remove();
      }
    },
  };
};

/** The list nested in `item` when it is only a wrapper for one. */
function $nestedList(item: LexicalNode | null): ListNode | null {
  if (!$isListItemNode(item) || item.getChildrenSize() !== 1) return null;
  const child = item.getFirstChild();
  return $isListNode(child) ? child : null;
}

/** Append `item` to `list`, joining nested lists of the same type. */
function $mergeListItem(list: ListNode, item: LexicalNode) {
  const incoming = $nestedList(item);
  const last = $nestedList(list.getLastChild());
  if (incoming && last && last.getListType() === incoming.getListType()) {
    for (const child of incoming.getChildren()) $mergeListItem(last, child);
    return;
  }
  list.append(item);
}

export const CUSTOM_TRANSFORMERS: Transformer[] = [
  ...HTML_TEXT_FORMAT_TRANSFORMERS,
  ...TRANSFORMERS.filter((t) => {
    return t !== CHECK_LIST && t !== ORDERED_LIST && t !== UNORDERED_LIST;
  }),
  customTransformer(ORDERED_LIST),
  customTransformer(CHECK_LIST),
  customTransformer(UNORDERED_LIST),
];
