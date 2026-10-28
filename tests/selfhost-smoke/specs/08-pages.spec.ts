import { go } from '../lib/app';
import { expect, test } from '../lib/fixtures';

test('CRM view loads', async ({ a: page }) => {
  await go(page, '/home');
  await page.getByRole('button', { name: 'Customers' }).first().click();
  await expect(page).toHaveURL(/\/app\/(crm|customers|companies|people|component\/crm)/, { timeout: 30_000 });
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.getByText(/Something went wrong|Unexpected error/i)).toHaveCount(0);
});

// Settings sections as listed in the settings rail; each must render without
// an error boundary, console errors or 5xx.
const SETTINGS = [
  'General', 'Email', 'Calendar', 'Agents', 'CRM', 'Account', 'Appearance', 'Notifications',
  'Keyboard shortcuts', 'Usage', 'Mobile App', 'Tags', 'Integrations', 'Runtimes', 'MCP server', 'API Keys', 'Bots',
];

test('settings pages load', async ({ a: page }) => {
  await go(page, '/settings/team');
  for (const name of SETTINGS) {
    await test.step(name, async () => {
      await page.getByRole('button', { name, exact: true }).last().click();
      await page.waitForTimeout(1500);
      await expect(page.getByText(/Something went wrong|Unexpected error/i)).toHaveCount(0);
    });
  }
});
