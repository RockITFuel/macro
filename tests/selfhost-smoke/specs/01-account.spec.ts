import { go } from '../lib/app';
import { completeOnboarding, signIn } from '../lib/auth';
import { env } from '../lib/env';
import { expect, noteKnown, test, watch } from '../lib/fixtures';

test('sign in with an email code and finish onboarding without billing', async ({ browser }) => {
  test.skip(!env.freshSignup, 'needs Mailpit (SMOKE_FRESH_SIGNUP=1) to create a fresh account');
  const ctx = await browser.newContext({ ignoreHTTPSErrors: env.ignoreHttpsErrors });
  const problems = watch(ctx, 'new');
  const page = await ctx.newPage();
  const email = `gate-new-${env.label}-${Math.random().toString(36).slice(2, 6)}@d2d.cloud`;
  await signIn(page, email);
  const steps = await completeOnboarding(page);
  test.info().annotations.push({ type: 'onboarding', description: steps.join(' → ') });
  await expect(page.getByRole('heading', { name: 'Home' }).first()).toBeVisible();
  noteKnown(problems.known);
  expect([...problems]).toEqual([]);
  await ctx.close();
});

test('signup refuses a domain outside the allowlist', async ({ browser }) => {
  test.skip(!env.mailpit, 'only where Mailpit shows whether a code was sent');
  const ctx = await browser.newContext({ ignoreHTTPSErrors: env.ignoreHttpsErrors });
  const page = await ctx.newPage();
  await page.goto(`${env.app}/`);
  await page.getByRole('button', { name: 'Continue with email' }).click({ timeout: 90_000 });
  const email = `gate-outsider-${env.label}@example.org`;
  await page.getByRole('textbox').first().fill(email);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(8000);
  const res = await fetch(`${env.mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const list = (await res.json()) as { messages?: unknown[] };
  expect(list.messages ?? [], 'no login code may be mailed to a non-allowlisted domain').toHaveLength(0);
  await ctx.close();
});

// A invites a throwaway address each run, so the mail comes from this build.
test('team invite email links to the public origin', async ({ a: page }) => {
  test.skip(!env.mailpit, 'needs Mailpit to read the invite mail');
  const invitee = `gate-invitee-${env.label}-${Math.random().toString(36).slice(2, 6)}@d2d.cloud`;
  await go(page, '/settings/team-members');
  await page.getByRole('button', { name: 'Invite', exact: true }).last().click();
  await page.getByPlaceholder('Enter email address').last().fill(invitee);
  await page.getByRole('button', { name: 'Send Invite' }).click();
  let link: string | undefined;
  await expect
    .poll(async () => {
      const res = await fetch(`${env.mailpit}/api/v1/search?query=${encodeURIComponent(`to:${invitee}`)}`);
      const id = ((await res.json()) as { messages?: { ID: string }[] }).messages?.[0]?.ID;
      if (!id) return false;
      const body = (await (await fetch(`${env.mailpit}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      link = `${body.Text ?? ''} ${body.HTML ?? ''}`.match(/https?:\/\/[^\s"'<>]+team-invite\?id=[\w-]+/)?.[0];
      return !!link;
    }, { timeout: 60_000, message: `invite mail with a team-invite link for ${invitee}` })
    .toBe(true);
  test.info().annotations.push({ type: 'invite-link', description: link! });
  expect(link!.startsWith(`${env.baseUrl}/`), `invite link ${link} must start with the public origin ${env.baseUrl}`).toBe(true);
});
