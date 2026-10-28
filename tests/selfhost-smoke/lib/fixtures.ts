import fs from 'node:fs';

import { type BrowserContext, type Page, test as base, expect } from '@playwright/test';

import { env, statePath } from './env';

/**
 * Noise that is not a regression on a self-hosted stack. Every entry says why.
 * Anything else that logs a console error or answers 5xx fails the test.
 * Entries with `known` are real defects that predate the fork's changes; they
 * do not fail a test but every hit is reported as a `known-issue` annotation.
 */
const IGNORED: { re: RegExp; why: string; known?: boolean }[] = [
  { re: /NoGmailGrant|email\/init/, why: 'no Google account linked on test users' },
  { re: /pipedream/i, why: 'Pipedream integrations are not configured on self-host' },
  { re: /github\/status/, why: 'GitHub app not configured' },
  { re: /crm\/settings/, why: 'CRM settings 404 until CRM is set up' },
  {
    re: /^console: Failed to load resource: the server responded with a status of \d\d\d/,
    why: 'carries no URL; 4xx are expected app flow (absence checks) and 5xx are caught, with their URL, from the response',
  },
  { re: /analytics|posthog|\/i\/v0\/e|sentry/i, why: 'telemetry is off on self-host' },
  { re: /ResizeObserver loop/, why: 'benign browser warning' },
  {
    re: /Lexical error #343/,
    known: true,
    why: 'Lexical #343 (update listeners loop) when the home composer wraps to a second line; reproduced on cec20b7b77, before PRs #1-#4 (upstream)',
  },
  {
    re: /^500 POST \S+\/dss\/documents\/similarity_search$/,
    known: true,
    why: 'task duplicate detection calls OpenAI embeddings; self-host has no OPENAI_API_KEY (production neither)',
  },
  {
    // The self-host websocket-service is the upstream Bun stub: it answers every
    // message with the plain text `ping`, which the storage websocket client
    // JSON.parses (apps/web/src/lib/service-clients/service-storage/websocket.ts).
    re: /^pageerror: Unexpected token 'p', "ping" is not valid JSON$/,
    known: true,
    why: 'websocket-service stub (upstream Bun) answers `ping`, which the storage websocket client JSON.parses',
  },
];

export type Problem = { page: string; what: string };

/**
 * Records console errors, page errors and 5xx responses of every page in a
 * context. Ignored known issues go into `problems.known`.
 */
export function watch(context: BrowserContext, who: string) {
  const problems = Object.assign([] as Problem[], { known: new Set<string>() });
  const add = (page: Page, what: string) => {
    const hit = IGNORED.find((i) => i.re.test(what));
    if (hit?.known) problems.known.add(hit.why);
    if (hit) return;
    problems.push({ page: `${who} ${page.url().replace(env.baseUrl, '')}`, what: what.slice(0, 300) });
  };
  const hook = (page: Page) => {
    page.on('console', (m) => m.type() === 'error' && add(page, `console: ${m.text()}`));
    page.on('pageerror', (e) => add(page, `pageerror: ${e.message}`));
    page.on('response', (r) => r.status() >= 500 && add(page, `${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`));
  };
  context.pages().forEach(hook);
  context.on('page', hook);
  return problems;
}

/** Report the known issues a watcher saw on the current test. */
export function noteKnown(known: Iterable<string>) {
  for (const why of known) {
    if (!test.info().annotations.some((a) => a.type === 'known-issue' && a.description === why)) {
      test.info().annotations.push({ type: 'known-issue', description: why });
    }
  }
}

type Fixtures = {
  /** User A's page, signed in, watched. */
  a: Page;
  /** User B's page in a separate browser context, signed in, watched. */
  b: Page;
  problems: Problem[];
};

export const test = base.extend<Fixtures>({
  problems: async ({}, use, testInfo) => {
    const problems: Problem[] = [];
    await use(problems);
    if (problems.length) {
      await testInfo.attach('console-and-5xx.json', { body: JSON.stringify(problems, null, 2), contentType: 'application/json' });
    }
    if (!testInfo.title.includes('@allow-noise')) {
      expect(problems, 'unexpected console errors or 5xx responses').toEqual([]);
    }
  },
  a: async ({ browser, problems }, use) => {
    const context = await browser.newContext({ storageState: statePath('a'), ignoreHTTPSErrors: env.ignoreHttpsErrors, viewport: { width: 1400, height: 900 }, permissions: ['camera', 'microphone'] });
    const found = watch(context, 'A');
    await use(await context.newPage());
    problems.push(...found);
    noteKnown(found.known);
    await context.close();
  },
  b: async ({ browser, problems }, use) => {
    if (!fs.existsSync(statePath('b'))) throw new Error('user B is not signed in');
    const context = await browser.newContext({ storageState: statePath('b'), ignoreHTTPSErrors: env.ignoreHttpsErrors, viewport: { width: 1400, height: 900 }, permissions: ['camera', 'microphone'] });
    const found = watch(context, 'B');
    await use(await context.newPage());
    problems.push(...found);
    noteKnown(found.known);
    await context.close();
  },
});

export { expect };

/** Time (ms) until `check` passes, or throws after `budget` ms with a clear message. */
export async function within(budget: number, what: string, check: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  try {
    await check();
  } catch {
    throw new Error(`realtime: ${what} not visible within ${budget} ms without reload`);
  }
  return Date.now() - start;
}
