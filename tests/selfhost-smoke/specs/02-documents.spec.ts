import { go } from '../lib/app';
import { uniq } from '../lib/env';
import { expect, test } from '../lib/fixtures';

test('create and edit a document with a mermaid flow block, reload keeps it', async ({ a: page }) => {
  await go(page, '/drive');
  await page.getByRole('button', { name: /^New/ }).last().click();
  await page.getByRole('menuitem', { name: /^Document/ }).first().click();
  await page.waitForURL(/\/app\/drive\/md\/[0-9a-f-]{36}/);
  const url = page.url();

  const title = uniq('Smoke doc');
  await page.locator('[contenteditable="true"]:visible').first().click();
  await page.keyboard.type(title);
  const body = page.getByLabel('Document content');
  await body.click();
  await page.keyboard.type('First paragraph from the smoke suite.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```mermaid');
  await page.keyboard.press('Enter');
  for (const line of ['flowchart TD', 'A[Start] --> B{Healthy?}', 'B -->|yes| C[Done]', 'B -->|no| D[Page on-call]']) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('code').filter({ hasText: 'flowchart TD' }).first()).toBeVisible();

  // Edit: a second paragraph after the block.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Edited after the diagram.');
  await page.waitForTimeout(3000); // let sync flush

  await page.goto(url);
  await expect(body).toContainText('First paragraph from the smoke suite.', { timeout: 30_000 });
  await expect(page.locator('[contenteditable="true"]').first()).toContainText(title);
  // A non-empty mermaid block opens as a diagram after reload.
  const flow = page.locator('[data-flow-block]').first();
  await expect(flow).toBeVisible({ timeout: 20_000 });
  await expect(flow.locator('.flow-block__empty')).toHaveCount(0);
  await expect(page.locator('[data-flow-block] [aria-label^="Flowchart with"], [data-flow-block] svg').first()).toBeVisible();
  await expect(body).toContainText('Edited after the diagram.');
});
