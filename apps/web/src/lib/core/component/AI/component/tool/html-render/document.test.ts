/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
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

const theme: HtmlRenderTheme = {
  scheme: 'dark',
  variables: { '--foreground': '#eee', '--accent': 'oklch(0.7 0.1 250)' },
};

describe('the sandbox', () => {
  it('allows scripts and nothing else', () => {
    expect(HTML_RENDER_SANDBOX).toBe('allow-scripts');
    expect(HTML_RENDER_SANDBOX).not.toContain('same-origin');
  });

  it('blocks every request but CDN scripts and inline data', () => {
    expect(HTML_RENDER_CSP).toContain("default-src 'none'");
    expect(HTML_RENDER_CSP).toContain("connect-src 'none'");
    expect(HTML_RENDER_CSP).toContain("form-action 'none'");
    expect(HTML_RENDER_CSP).toContain('img-src data: blob:');
    expect(HTML_RENDER_CSP).not.toMatch(/img-src[^;]*https/);
  });
});

describe('buildHtmlRenderDocument', () => {
  it('puts the policy before the page so it governs everything after it', () => {
    const page =
      '<html><head><script>alert(1)</script></head><body>hi</body></html>';
    const document = buildHtmlRenderDocument(page, theme);
    const policy = document.indexOf('http-equiv="Content-Security-Policy"');
    expect(policy).toBeGreaterThan(-1);
    expect(policy).toBeLessThan(document.indexOf('<script>alert(1)'));
    expect(document).toContain(`content="${HTML_RENDER_CSP}"`);
    expect(document.endsWith(page)).toBe(true);
  });

  it('parses into one document whose head starts with the policy', () => {
    const parsed = new DOMParser().parseFromString(
      buildHtmlRenderDocument(
        '<!doctype html><html lang="nl"><head><style>p{}</style></head><body><p>x</p></body></html>',
        theme
      ),
      'text/html'
    );
    expect(parsed.head.firstElementChild?.getAttribute('charset')).toBe(
      'utf-8'
    );
    expect(parsed.head.children[1]?.getAttribute('http-equiv')).toBe(
      'Content-Security-Policy'
    );
    expect(parsed.documentElement.lang).toBe('nl');
    expect(parsed.body.textContent).toBe('x');
  });

  it('writes the theme as root variables and strips values that could break out', () => {
    const document = buildHtmlRenderDocument('<p>x</p>', {
      scheme: 'light',
      variables: {
        '--foreground': 'red;}</style><script>bad()</script>',
        'not-a-var': 'blue',
      },
    });
    const style = /<style id="macro-theme">(.*?)<\/style>/.exec(document)?.[1];
    expect(style).toBe(
      ':root{color-scheme:light;--foreground:red/stylescriptbad()/script;}'
    );
  });
});

describe('readHtmlRenderMessage', () => {
  it('reads a content height', () => {
    expect(
      readHtmlRenderMessage({
        channel: 'macro-html-render',
        kind: 'size',
        height: 412,
      })
    ).toEqual({ kind: 'size', height: 412 });
  });

  it('reads an http(s) link and refuses other schemes', () => {
    expect(
      readHtmlRenderMessage({
        channel: 'macro-html-render',
        kind: 'open',
        url: 'https://example.com/a?b=1',
      })
    ).toEqual({ kind: 'open', url: 'https://example.com/a?b=1' });
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'not a url',
    ]) {
      expect(
        readHtmlRenderMessage({
          channel: 'macro-html-render',
          kind: 'open',
          url,
        })
      ).toBeUndefined();
    }
  });

  it('ignores anything else', () => {
    for (const data of [
      null,
      'size',
      { kind: 'size', height: 10 },
      { channel: 'macro-html-render', kind: 'size', height: -1 },
      { channel: 'macro-html-render', kind: 'size', height: Number.NaN },
      { channel: 'macro-html-render', kind: 'navigate', url: 'https://x.y' },
    ]) {
      expect(readHtmlRenderMessage(data)).toBeUndefined();
    }
  });
});

describe('htmlRenderFrameHeight', () => {
  it('uses the requested height until the page reports its own', () => {
    expect(htmlRenderFrameHeight(420, undefined)).toBe(420);
    expect(htmlRenderFrameHeight(420, 300)).toBe(300);
  });

  it('caps a taller page at the requested height and keeps the bounds', () => {
    expect(htmlRenderFrameHeight(420, 900)).toBe(420);
    expect(htmlRenderFrameHeight(10, undefined)).toBe(80);
    expect(htmlRenderFrameHeight(5000, 4000)).toBe(2000);
    expect(htmlRenderFrameHeight(420, 12)).toBe(80);
  });
});

describe('the theme', () => {
  it('reads app tokens under the page names and follows light mode', () => {
    const element = document.createElement('div');
    element.style.setProperty('--color-ink', '#111');
    element.style.setProperty('--color-accent', 'rgb(1, 2, 3)');
    element.style.setProperty('--color-blue', 'rgb(4, 5, 6)');
    document.body.append(element);
    document.documentElement.dataset.themeLight = 'true';

    const read = readHtmlRenderTheme(element);

    expect(read.scheme).toBe('light');
    expect(read.variables['--foreground']).toBe('#111');
    expect(read.variables['--accent']).toBe('rgb(1, 2, 3)');
    expect(read.variables['--chart-1']).toBe('rgb(4, 5, 6)');
    expect(read.variables['--radius']).toBe('8px');
    expect(read.variables['--space-4']).toBe('16px');
    expect(read.variables['--font-mono']).toContain('monospace');
    expect(htmlRenderThemeMessage(read)).toEqual({
      channel: 'macro-html-render',
      kind: 'theme',
      theme: read,
    });
    delete document.documentElement.dataset.themeLight;
    element.remove();
  });
});
