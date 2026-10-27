/**
 * The document an agent's `RenderHtml` page runs as, and the messages it may
 * exchange with the app.
 *
 * The page is untrusted: the agent wrote it, possibly from content it read.
 * It runs in an `<iframe sandbox="allow-scripts" srcdoc>`, so it has an
 * opaque origin - no Macro cookies, storage, or same-origin API access - and
 * cannot navigate the app, open windows, or submit forms. On top of that the
 * document starts with a Content-Security-Policy that blocks every network
 * request except scripts from three public CDNs: a page can draw, but it
 * cannot send what it shows anywhere.
 *
 * The page talks to the app only by `postMessage`, and the app reads just two
 * shapes from it (its content height and a link the reader clicked), each
 * checked here, from the frame's own window only.
 */

import { CHART_PALETTE } from '@app/features/database-query/core/chart-palette';

/** The sandbox flags: scripts, and nothing else. Never `allow-same-origin`. */
export const HTML_RENDER_SANDBOX = 'allow-scripts';

/** CDNs a page may load scripts from, such as a chart library. */
export const HTML_RENDER_SCRIPT_HOSTS = [
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://cdnjs.cloudflare.com',
] as const;

/**
 * The page's Content-Security-Policy. `connect-src 'none'` and image, font
 * and media sources limited to inline data keep the page from sending
 * anything out; `form-action` and `base-uri` close the remaining doors.
 */
export const HTML_RENDER_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${HTML_RENDER_SCRIPT_HOSTS.join(' ')}`,
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  'worker-src blob:',
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** Smallest frame, in CSS pixels; matches the tool's bound. */
export const HTML_RENDER_MIN_HEIGHT = 80;
/** Largest frame, in CSS pixels; matches the tool's bound. */
export const HTML_RENDER_MAX_HEIGHT = 2000;

/** The key every message between the app and a page carries. */
const CHANNEL = 'macro-html-render';

/** The theme a page gets: CSS custom properties and light or dark. */
export type HtmlRenderTheme = {
  scheme: 'light' | 'dark';
  /** `--name` to a CSS value. */
  variables: Record<string, string>;
};

/**
 * Page variables and the app tokens they read, resolved per theme. The page
 * sees short, conventional names; the app's own token names stay internal.
 */
const THEME_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--background', '--color-page'],
  ['--foreground', '--color-ink'],
  ['--muted-foreground', '--color-ink-muted'],
  ['--subtle-foreground', '--color-ink-extra-muted'],
  ['--placeholder', '--color-ink-placeholder'],
  ['--card', '--color-panel'],
  ['--muted', '--color-surface-2'],
  ['--hover', '--color-hover'],
  ['--border', '--color-edge'],
  ['--border-muted', '--color-edge-muted'],
  ['--accent', '--color-accent'],
  ['--accent-foreground', '--color-accent-contrast'],
  ['--accent-surface', '--color-accent-bg'],
  ['--link', '--color-link'],
  ['--success', '--color-success'],
  ['--warning', '--color-warning'],
  ['--failure', '--color-failure'],
  ['--code-background', '--color-inline-code'],
  // Macro's chart series, in the app's order (`chart-palette.ts`).
  ...CHART_PALETTE.map(
    (color, index) =>
      [`--chart-${index + 1}`, color.slice('var('.length, -1)] as const
  ),
];

/**
 * Macro's type, radius and spacing scale, the same in both themes.
 */
const STATIC_TOKENS: Readonly<Record<string, string>> = {
  '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  '--text-xs': '12px',
  '--text-sm': '13px',
  '--text-base': '14px',
  '--text-lg': '16px',
  '--text-xl': '20px',
  '--text-2xl': '24px',
  '--radius-sm': '4px',
  '--radius': '8px',
  '--radius-lg': '12px',
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-6': '24px',
  '--space-8': '32px',
};

const FALLBACK_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * A CSS value that cannot end its declaration or rule, or close the style
 * element it is written into.
 */
function safeValue(value: string): string {
  return value.replace(/[;{}<>]/g, '').trim();
}

/**
 * The theme as `element` sees it. Custom properties compute with their
 * `var()` references resolved, so the page gets self-contained values. The
 * app's webfont cannot load in the sandbox, so the font stack falls back to
 * the system UI font after it.
 */
export function readHtmlRenderTheme(element: Element): HtmlRenderTheme {
  const style = getComputedStyle(element);
  const variables: Record<string, string> = { ...STATIC_TOKENS };
  for (const [name, token] of THEME_TOKENS) {
    const value = safeValue(style.getPropertyValue(token));
    if (value) variables[name] = value;
  }
  const family = safeValue(style.fontFamily);
  variables['--font-sans'] = family
    ? `${family}, ${FALLBACK_SANS}`
    : FALLBACK_SANS;
  const light =
    element.ownerDocument.documentElement.dataset.themeLight === 'true';
  return { scheme: light ? 'light' : 'dark', variables };
}

function rootRule(theme: HtmlRenderTheme): string {
  const declarations = Object.entries(theme.variables)
    .filter(([name]) => /^--[a-z0-9-]+$/.test(name))
    .map(([name, value]) => `${name}:${safeValue(value)};`)
    .join('');
  return `:root{color-scheme:${theme.scheme === 'light' ? 'light' : 'dark'};${declarations}}`;
}

/**
 * The page's base look, so plain markup already reads as Macro: transparent
 * on the conversation's background, the app's text color, font and sizes,
 * quiet tables, links and code, and no scrollbar inside the reply. Low
 * specificity (`:where`), so a page's own rules always win.
 */
const BASE_CSS = [
  'html{background:transparent;color:var(--foreground);font-family:var(--font-sans);font-size:var(--text-base);line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;scrollbar-width:none}',
  'html::-webkit-scrollbar{display:none}body{margin:0}',
  ':where(h1,h2,h3,h4){margin:0 0 var(--space-2);font-weight:600;line-height:1.3;color:var(--foreground)}',
  ':where(h1){font-size:var(--text-xl)}:where(h2){font-size:var(--text-lg)}:where(h3,h4){font-size:var(--text-base)}',
  ':where(p,ul,ol){margin:0 0 var(--space-3)}:where(small){font-size:var(--text-xs);color:var(--muted-foreground)}',
  ':where(a){color:var(--link,var(--accent));text-decoration:none}:where(a:hover){text-decoration:underline}',
  ':where(hr){border:0;border-top:1px solid var(--border-muted,var(--border));margin:var(--space-4) 0}',
  ':where(table){width:100%;border-collapse:collapse;font-size:var(--text-sm);font-variant-numeric:tabular-nums}',
  ':where(th){text-align:left;font-weight:500;color:var(--muted-foreground)}',
  ':where(th,td){padding:var(--space-2) var(--space-2);border-bottom:1px solid var(--border-muted,var(--border))}',
  ':where(code,kbd,pre,samp){font-family:var(--font-mono);font-size:var(--text-sm)}',
  ':where(code){background:var(--code-background);border-radius:var(--radius-sm);padding:1px 4px}',
  ':where(pre){background:var(--card);border:1px solid var(--border-muted,var(--border));border-radius:var(--radius);padding:var(--space-3);overflow:auto}',
  ':where(pre code){background:none;padding:0}',
  ':where(button){font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:999px;padding:var(--space-1) var(--space-3);cursor:pointer}',
  ':where(button:hover){background:var(--hover)}',
].join('');

/**
 * Runs before the page's own code. It reports the page's content height
 * whenever it changes, applies theme updates the app posts, and turns a
 * clicked http(s) link into a request the app may open in a new tab - a link
 * never replaces the page inside the conversation.
 */
const BOOTSTRAP = `(function(){var P=window.parent,C=${JSON.stringify(CHANNEL)},h=-1,s=document.getElementById("macro-theme");
function size(){var r=document.documentElement,v=Math.ceil(r.scrollHeight>r.clientHeight?r.scrollHeight:r.getBoundingClientRect().height);if(v!==h){h=v;P.postMessage({channel:C,kind:"size",height:v},"*");}}
function theme(t){if(!s||!t||typeof t!=="object"||!t.variables)return;var c=":root{color-scheme:"+(t.scheme==="light"?"light":"dark")+";";for(var k in t.variables){if(/^--[a-z0-9-]+$/.test(k))c+=k+":"+String(t.variables[k]).replace(/[;{}<>]/g,"")+";";}s.textContent=c+"}";}
window.addEventListener("message",function(e){var d=e.data;if(e.source===P&&d&&d.channel===C&&d.kind==="theme")theme(d.theme);});
document.addEventListener("click",function(e){if(!e.isTrusted||!e.target||!e.target.closest)return;var a=e.target.closest("a[href]"),u;if(!a)return;try{u=new URL(a.getAttribute("href"),document.baseURI);}catch(x){return;}if(u.protocol==="about:"&&u.hash)return;e.preventDefault();if(/^https?:$/.test(u.protocol))P.postMessage({channel:C,kind:"open",url:u.href},"*");},true);
if(window.ResizeObserver){var o=new ResizeObserver(size);o.observe(document.documentElement);document.addEventListener("DOMContentLoaded",function(){if(document.body)o.observe(document.body);});}
document.addEventListener("DOMContentLoaded",size);window.addEventListener("load",size);})();`;

/**
 * The full `srcdoc` for a page: our head first - charset, the CSP, viewport,
 * theme, base styles, bootstrap - then the agent's markup. The policy is the
 * first thing parsed, so it governs every script and request after it; a
 * page's own `<html>`/`<head>` tags merge into ours.
 */
export function buildHtmlRenderDocument(
  html: string,
  theme: HtmlRenderTheme
): string {
  return [
    '<!doctype html><html><head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${HTML_RENDER_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    `<style id="macro-theme">${rootRule(theme)}</style>`,
    `<style>${BASE_CSS}</style>`,
    `<script>${BOOTSTRAP}</script>`,
    '</head>',
    html,
  ].join('');
}

/** The theme update the app posts into a mounted page. */
export function htmlRenderThemeMessage(theme: HtmlRenderTheme) {
  return { channel: CHANNEL, kind: 'theme', theme } as const;
}

/** A message a page may send. */
export type HtmlRenderMessage =
  | { kind: 'size'; height: number }
  | { kind: 'open'; url: string };

/** `data` as a page message, or undefined for anything else. */
export function readHtmlRenderMessage(
  data: unknown
): HtmlRenderMessage | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const message = data as Record<string, unknown>;
  if (message.channel !== CHANNEL) return undefined;
  if (message.kind === 'size') {
    const height = message.height;
    return typeof height === 'number' && Number.isFinite(height) && height > 0
      ? { kind: 'size', height }
      : undefined;
  }
  if (message.kind === 'open' && typeof message.url === 'string') {
    try {
      const url = new URL(message.url);
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? { kind: 'open', url: url.href }
        : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * The frame's height: the page's own content height once it reported one,
 * else the agent's requested height, never past the agent's cap or the
 * bounds.
 */
export function htmlRenderFrameHeight(
  requested: number,
  contentHeight: number | undefined
): number {
  const cap = Math.min(
    Math.max(Math.round(requested), HTML_RENDER_MIN_HEIGHT),
    HTML_RENDER_MAX_HEIGHT
  );
  if (contentHeight === undefined) return cap;
  return Math.min(
    Math.max(Math.ceil(contentHeight), HTML_RENDER_MIN_HEIGHT),
    cap
  );
}
