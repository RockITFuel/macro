import { go, message, openDm, replyInThread, sendMention, sendMessage } from '../lib/app';
import { env, uniq } from '../lib/env';
import { expect, test } from '../lib/fixtures';

test('channel: create a team channel and post', async ({ a: page }) => {
  await go(page, '/channels');
  await page.locator('[aria-label="Create channel"]').first().click();
  const name = `smoke-${env.label}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByPlaceholder('e.g. Feature Requests').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText(/^Team — anyone on your team/).click();
  await page.getByRole('button', { name: /^Create$/ }).click();
  // Step 3 (add people) is optional; team channels auto-add teammates.
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForURL(/\/app\/channels\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await sendMessage(page, uniq('hello channel'));
});

test('DM: message, thread reply and mention reach the other user', async ({ a, b }) => {
  const dm = await openDm(a, env.userB);
  const text = uniq('dm message');
  await sendMessage(a, text);
  const dmUrl = a.url();
  expect(dmUrl).toMatch(/\/app\/channels\//);

  // Thread reply and a mention of B, from A.
  const reply = uniq('thread reply');
  await replyInThread(a, text, reply);
  await a.goto(dmUrl);
  const mention = uniq('mention');
  await sendMention(a, env.userB, mention);
  await expect(message(a, mention)).toContainText(env.userB.split('@')[0]);

  // B sees all three after opening the DM.
  await b.goto(dmUrl);
  await expect(message(b, text)).toBeVisible({ timeout: 30_000 });
  await expect(message(b, mention)).toBeVisible();
  await expect(b.getByText(reply).or(b.getByText(/1 repl(y|ies)/)).first()).toBeVisible();
  expect(dm).toBeTruthy();
});
