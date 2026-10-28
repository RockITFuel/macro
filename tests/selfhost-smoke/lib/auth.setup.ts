import fs from 'node:fs';
import path from 'node:path';

import { type Browser, expect, type Page, test as setup } from '@playwright/test';

import { completeOnboarding, signIn } from './auth';
import { env, statePath } from './env';

// Signs in users A and B (Mailpit codes) and makes sure they share a team, so
// B can see A's tasks and channels. Without Mailpit the saved states from
// `bun run login <email>` are used as they are.
setup.describe.configure({ mode: 'serial' });

const signedIn = async (file: string, browser: Browser) => {
  if (!fs.existsSync(file)) return false;
  const ctx = await browser.newContext({ storageState: file, ignoreHTTPSErrors: env.ignoreHttpsErrors });
  const page = await ctx.newPage();
  await page.goto(`${env.app}/home`);
  const ok = await page
    .getByRole('button', { name: 'Settings' })
    .first()
    .waitFor({ timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  await ctx.close();
  return ok;
};

for (const who of ['a', 'b'] as const) {
  setup(`sign in user ${who.toUpperCase()}`, async ({ browser }) => {
    const email = who === 'a' ? env.userA : env.userB;
    fs.mkdirSync(env.stateDir, { recursive: true });
    if (await signedIn(statePath(who), browser)) return;
    expect(env.mailpit, `no saved sign-in for ${email}: run \`bun run login ${email}\``).toBeTruthy();
    const ctx = await browser.newContext({ ignoreHTTPSErrors: env.ignoreHttpsErrors });
    const page = await ctx.newPage();
    await signIn(page, email);
    await completeOnboarding(page);
    await ctx.storageState({ path: statePath(who) });
    await ctx.close();
  });
}

async function openTeam(browser: Browser, who: 'a' | 'b') {
  const ctx = await browser.newContext({ storageState: statePath(who), ignoreHTTPSErrors: env.ignoreHttpsErrors });
  const page = await ctx.newPage();
  await page.goto(`${env.app}/settings/team`);
  const state = await Promise.race([
    // A matching "Members" button exists even without a team; use the page body.
    page.getByText('GitHub autolink').first().waitFor({ timeout: 45_000 }).then(() => 'team' as const),
    page.getByText('No team yet').first().waitFor({ timeout: 45_000 }).then(() => 'none' as const),
    page.getByText("You've been invited to join a team").first().waitFor({ timeout: 45_000 }).then(() => 'invited' as const),
  ]);
  return { ctx, page, state };
}

async function members(page: Page) {
  await page.getByRole('button', { name: 'Members' }).last().click();
  await page.waitForTimeout(1500);
  return page.locator('main').innerText();
}

/** The newest team-invite link mailed to `email`. */
async function inviteLink(email: string): Promise<string | undefined> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${env.mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:invited`)}`);
    const list = (await res.json()) as { messages?: { ID: string }[] };
    const msg = list.messages?.[0];
    if (msg) {
      const body = (await (await fetch(`${env.mailpit}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
      const link = body.Text.match(/https?:\/\/\S+team-invite\?id=[\w-]+/)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return undefined;
}

setup('A and B share a team', async ({ browser }) => {
  const b = await openTeam(browser, 'b');
  if (b.state === 'team' && (await members(b.page)).includes(env.userA)) {
    await b.ctx.close();
    return;
  }
  expect(env.mailpit, 'A and B do not share a team; set one up by hand').toBeTruthy();

  // A owns the team and invites B.
  const a = await openTeam(browser, 'a');
  if (a.state === 'none') {
    await a.page.getByRole('button', { name: 'Create Team' }).last().click();
    await a.page.getByPlaceholder('My Team').fill('Smoke Team');
    await a.page.getByPlaceholder('Enter email address').fill(env.userB);
    await a.page.getByRole('button', { name: 'Create Team' }).last().click();
    await expect(a.page.getByRole('button', { name: 'Members' })).toBeVisible({ timeout: 30_000 });
  }
  await a.ctx.close();

  // B accepts in Settings > Team (01-account.spec.ts checks the mail's link).
  await inviteLink(env.userB);
  await b.page.goto(`${env.app}/settings/team`);
  await b.page.getByRole('button', { name: 'Join', exact: true }).first().click({ timeout: 45_000 });
  await b.page.waitForTimeout(3000);
  await b.page.goto(`${env.app}/settings/team`);
  await b.page.getByText('GitHub autolink').first().waitFor({ timeout: 45_000 });
  expect(await members(b.page)).toContain(env.userA);
  fs.mkdirSync(env.out, { recursive: true });
  fs.writeFileSync(path.join(env.out, 'accounts.txt'), `${env.userA}\n${env.userB}\n`);
  await b.ctx.close();
});
