/** jsdom lacks the browser APIs solid-flow reads while mounting. */
export function installCanvasDom() {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof window.DOMMatrixReadOnly !== 'function') {
    // xyflow reads the zoom (m22) of the viewport transform.
    window.DOMMatrixReadOnly = class {
      m22 = 1;
    } as unknown as typeof DOMMatrixReadOnly;
  }
  if (typeof globalThis.ResizeObserver !== 'function') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}
