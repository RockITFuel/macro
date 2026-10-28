import { go } from '../lib/app';
import { env } from '../lib/env';
import { expect, test } from '../lib/fixtures';

async function ask(page: import('@playwright/test').Page, prompt: string) {
  await go(page, '/home');
  await page.locator('[contenteditable="true"]:visible').first().click();
  await page.keyboard.type(prompt, { delay: 2 });
  await page.getByRole('button', { name: 'Send' }).click();
}

test('agent chat replies', async ({ a: page }) => {
  const word = `smoke${env.label.slice(-6)}`;
  await ask(page, `Reply with exactly this word and nothing else: ${word}`);
  // The prompt itself contains the word once; the reply adds another.
  await expect.poll(async () => (await page.locator('main').innerText()).split(word).length - 1, { timeout: 120_000 }).toBeGreaterThan(1);
});

test('agent renders an HTML page (RenderHtml)', async ({ a: page }) => {
  const title = `Smoke page ${env.label.slice(-6)}`;
  await ask(page, `Use your RenderHtml tool now to render a small HTML page titled "${title}" containing an <h1> that says Hello smoke. Do not ask questions.`);
  const frame = page.locator(`figure iframe[title="${title}"], iframe[title="${title}"]`).first();
  await expect(frame).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/Could not render/)).toHaveCount(0);
});

test('agent asks a question with an AskUser card', async ({ a: page }) => {
  await ask(page, 'Use your AskUser tool to ask me which color I prefer, with exactly two options: Red and Blue. Do nothing else until I answer.');
  const red = page.getByRole('radio', { name: /Red/ }).first();
  await expect(red).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole('radio', { name: /Blue/ }).first()).toBeVisible();
  await red.click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  // The card collapses to "Answered"; the agent then goes on with the answer.
  await expect(page.getByText('Answered', { exact: true }).last()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => /\bred\b/i.test((await page.locator('main').innerText()).split('Answered').pop() ?? ''), {
      timeout: 120_000,
      message: 'the agent continues with the answer (mentions Red)',
    })
    .toBe(true);
});
