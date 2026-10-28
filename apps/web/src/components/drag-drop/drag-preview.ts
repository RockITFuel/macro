/**
 * A snapshot of `node` at its exact size, inert and hidden from assistive technology.
 * `lift` raises it off the page with a deeper shadow while it follows the pointer.
 */
export function cloneDragPreview(
  node: HTMLElement,
  marker: string,
  options?: { lift?: boolean }
) {
  const bounds = node.getBoundingClientRect();
  const copy = node.cloneNode(true);
  if (!(copy instanceof HTMLElement))
    throw new Error('A drag preview clones an HTML element');
  copy.removeAttribute('id');
  copy
    .querySelectorAll('[id]')
    .forEach((element) => element.removeAttribute('id'));
  copy.style.width = `${bounds.width}px`;
  copy.style.height = `${bounds.height}px`;
  copy.style.margin = '0';
  copy.style.opacity = '1';
  copy.style.transform = 'none';
  copy.style.boxSizing = 'border-box';
  if (options?.lift) {
    copy.style.boxShadow =
      '0 14px 28px -10px rgb(0 0 0 / 0.28), 0 4px 10px -4px rgb(0 0 0 / 0.14)';
  }
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute(marker, '');
  return copy;
}
