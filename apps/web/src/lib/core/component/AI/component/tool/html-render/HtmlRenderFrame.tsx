/**
 * An agent's HTML page inline in the conversation, in a sandboxed frame.
 *
 * See `document.ts` for the security model. This component adds the parts
 * that need the live frame: it reads messages from its own frame's window
 * only, keeps the page's theme in step with the app's, opens a clicked link
 * only while the reader is interacting with the page, and puts the page back
 * if it ever navigates its frame elsewhere.
 */

import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import {
  buildHtmlRenderDocument,
  HTML_RENDER_CSP,
  HTML_RENDER_SANDBOX,
  type HtmlRenderTheme,
  htmlRenderFrameHeight,
  htmlRenderThemeMessage,
  readHtmlRenderMessage,
  readHtmlRenderTheme,
} from './document';

/** The app theme as `element` sees it, following light/dark switches. */
function createHtmlRenderTheme(element: () => Element | undefined) {
  const read = () => {
    const current = element();
    return current ? readHtmlRenderTheme(current) : undefined;
  };
  const [theme, setTheme] = createSignal<HtmlRenderTheme | undefined>();
  onMount(() => {
    setTheme(read());
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const next = read();
      const current = theme();
      if (
        next &&
        (!current ||
          next.scheme !== current.scheme ||
          JSON.stringify(next.variables) !== JSON.stringify(current.variables))
      ) {
        setTheme(next);
      }
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme-light', 'style', 'class'],
    });
    onCleanup(() => observer.disconnect());
  });
  return theme;
}

/** How often a page that navigated its frame away is put back. */
const MAX_RESTORES = 2;

export function HtmlRenderFrame(props: {
  html: string;
  title: string;
  /** The agent's frame height, the cap the page's own height fits under. */
  height: number;
}) {
  let box: HTMLDivElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  const theme = createHtmlRenderTheme(() => box);
  const [contentHeight, setContentHeight] = createSignal<number>();
  // Bumped when the page navigated its frame away, to put the page back.
  const [generation, setGeneration] = createSignal(0);
  // Set when the page keeps navigating away: it is removed rather than put
  // back again, so it cannot reload itself (and send requests) in a loop.
  const [stopped, setStopped] = createSignal(false);
  // The document is built from the first theme; later themes are posted in,
  // so a theme switch does not reload the page. A new object per generation
  // remounts the frame.
  const page = createMemo(
    on(
      () =>
        [props.html, generation(), theme() !== undefined, stopped()] as const,
      ([html, generation, , stopped]) => {
        const initial = theme();
        return initial && !stopped
          ? { generation, srcdoc: buildHtmlRenderDocument(html, initial) }
          : undefined;
      }
    )
  );
  const height = () => htmlRenderFrameHeight(props.height, contentHeight());

  createEffect(
    on(theme, (current) => {
      if (current) {
        frame?.contentWindow?.postMessage(htmlRenderThemeMessage(current), '*');
      }
    })
  );

  onMount(() => {
    const listen = (event: MessageEvent) => {
      if (!frame || event.source !== frame.contentWindow) return;
      const message = readHtmlRenderMessage(event.data);
      if (!message) return;
      if (message.kind === 'size') {
        setContentHeight(message.height);
        return;
      }
      // A page can post at any time; a tab opens only for a reader who is
      // using the page right now.
      if (
        document.activeElement === frame &&
        navigator.userActivation?.isActive !== false
      ) {
        window.open(message.url, '_blank', 'noopener,noreferrer');
      }
    };
    window.addEventListener('message', listen);
    onCleanup(() => window.removeEventListener('message', listen));
  });

  // The first load is the page; any later one means it navigated its frame
  // (a script setting `location`), so the page is put back.
  let loads = 0;
  const onLoad = () => {
    loads += 1;
    if (loads > 1) {
      loads = 0;
      setContentHeight(undefined);
      if (generation() >= MAX_RESTORES) {
        setStopped(true);
        return;
      }
      setGeneration((value) => value + 1);
      return;
    }
    const current = theme();
    if (current) {
      frame?.contentWindow?.postMessage(htmlRenderThemeMessage(current), '*');
    }
  };

  return (
    <div
      ref={box}
      class="relative w-full overflow-hidden"
      style={{ height: `${height()}px` }}
      data-html-render
    >
      <Show when={stopped()}>
        <p class="py-2 text-xs text-ink-muted" role="status">
          This page kept leaving its frame and was stopped.
        </p>
      </Show>
      <Show when={page()} keyed>
        {(current) => (
          <iframe
            ref={frame}
            title={props.title}
            class="block size-full border-0 bg-transparent"
            sandbox={HTML_RENDER_SANDBOX}
            // Chromium also enforces the policy on anything the frame loads.
            {...{ csp: HTML_RENDER_CSP }}
            referrerPolicy="no-referrer"
            srcdoc={current.srcdoc}
            // A frame whose color scheme differs from the app's paints an
            // opaque canvas; matching it keeps the page on the reply's
            // background.
            style={{ 'color-scheme': theme()?.scheme ?? 'normal' }}
            onLoad={onLoad}
          />
        )}
      </Show>
    </div>
  );
}
