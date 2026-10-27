/**
 * The saved document's chip, without the storage service behind it. The
 * other exports keep modules that share the import loadable; this fixture
 * never renders them.
 */
export function ItemPreview(props: {
  id: string;
  type: string;
  class?: string;
}) {
  return (
    <span class={props.class} data-item-preview={props.id}>
      <span class="truncate text-ink-muted">Q3 revenue by region.html</span>
    </span>
  );
}

export function InlineItemPreview() {
  return null;
}

export function useItemPreviewData(): never {
  throw new Error('Item previews are not available in this fixture');
}
