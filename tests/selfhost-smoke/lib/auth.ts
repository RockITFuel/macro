import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { env } from './env';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The newest six-digit code mailed to `email` after `since` (ms epoch). */
export async function mailpitCode(email: string, since: number): Promise<string> {
  if (!env.mailpit) throw new Error('SMOKE_MAILPIT_URL is not set; sign in with `bun run login` first');
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`${env.mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const fresh = (list.messages ?? []).filter((m) => Date.parse(m.Created) >= since - 2000);
    if (fresh.length) {
      const msg = (await (await fetch(`${env.mailpit}/api/v1/message/${fresh[0].ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const code = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await sleep(1000);
  }
  throw new Error(`no login code for ${email} in Mailpit`);
}

/** Email-code sign-in from the login screen. `code` defaults to Mailpit. */
export async function signIn(page: Page, email: string, code?: () => Promise<string>) {
  await page.goto(`${env.app}/`);
  const start = page.getByRole('button', { name: 'Continue with email' });
  await start.click({ timeout: 90_000 });
  await page.getByRole('textbox').first().fill(email);
  let since = Date.now();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  // Login codes are rate limited per address; a rerun soon after another one
  // gets "rate limit exceeded" and has to wait.
  for (let i = 0; i < 4; i++) {
    const limited = await page.getByText(/rate limit/i).waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (!limited) break;
    await page.waitForTimeout(65_000);
    since = Date.now();
    await page.getByRole('button', { name: /^Continue$/ }).click();
  }
  const value = code ? await code() : await mailpitCode(email, since);
  await page.waitForTimeout(500);
  await page.keyboard.type(value, { delay: 40 });
  await page.waitForURL(/\/app\/(welcome|onboarding|home)/, { timeout: 60_000 });
}

/**
 * Walk onboarding with its defaults: no billing step may block it. Accepts a
 * pending team invite ("Continue" on the team step); skips creating a team
 * (that step offers only "Skip for now").
 * Returns the headings seen, for the report.
 */
export async function completeOnboarding(page: Page): Promise<string[]> {
  const seen: string[] = [];
  if (!/welcome|onboarding/.test(page.url())) await page.goto(`${env.app}/onboarding`);
  await page.waitForTimeout(2000);
  for (let step = 0; step < 15 && /welcome|onboarding/.test(page.url()); step++) {
    const heading = (await page.locator('h1:visible').first().innerText().catch(() => '')).trim();
    seen.push(heading);
    expect(heading, 'onboarding must not ask for payment').not.toMatch(/payment|billing|credit card|subscribe/i);
    let clicked = false;
    for (const name of [/^Get started$/, /^(Join|Accept)\b/, /^Continue$/, /^Skip for now$/, /^Skip$/, /^Not now$/, /^Done$/]) {
      const b = page.getByRole('button', { name }).first();
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) throw new Error(`onboarding stuck at "${heading}"`);
    await page.waitForTimeout(2000);
  }
  await expect(page).toHaveURL(/\/app\/home/, { timeout: 30_000 });
  return seen;
}
