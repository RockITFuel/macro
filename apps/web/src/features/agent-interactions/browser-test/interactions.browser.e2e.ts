import { expect, test } from '@playwright/test';

/** Set to save screenshots of each theme and viewport there. */
const SHOTS = process.env.AGENT_INTERACTIONS_SHOTS_DIR;

for (const theme of ['light', 'dark'] as const) {
  test(`an agent page and question render inline (${theme})`, async ({
    page,
  }, info) => {
    await page.goto(`/?theme=${theme}`);
    const frame = page.locator('iframe[title="Q3 revenue by region"]');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    const content = page.frameLocator('iframe[title="Q3 revenue by region"]');
    await expect(content.getByText('Q3 revenue, +12% QoQ')).toBeVisible();
    await expect(content.locator('#bars rect')).toHaveCount(4);

    // The frame fits the page under the requested 600px cap.
    await expect
      .poll(async () => (await frame.boundingBox())?.height ?? 0)
      .toBeLessThanOrEqual(600);
    if (info.project.name === 'desktop') {
      await expect
        .poll(async () => (await frame.boundingBox())?.height ?? 0)
        .toBeLessThan(560);
    }
    await expect
      .poll(async () => (await frame.boundingBox())?.height ?? 0)
      .toBeGreaterThan(300);

    // The page follows the app theme.
    const scheme = await content
      .locator('html')
      .evaluate((root) => getComputedStyle(root).colorScheme);
    expect(scheme).toBe(theme);

    // Previews follow the option being looked at.
    const question = page.getByRole('region', { name: 'Agent question' });
    // Scroll the reply's container first so the click cannot land on the
    // frame above while it moves.
    await question.scrollIntoViewIfNeeded();
    await question.getByRole('radio', { name: /Sidebar/ }).click();
    await expect(page.locator('[data-option-preview]')).toContainText(
      '| Inbox  |'
    );
    await question.getByRole('radio', { name: /Top tabs/ }).hover();
    await expect(page.locator('[data-option-preview]')).toContainText(
      '[ Inbox ][ Tasks ]'
    );

    if (SHOTS) {
      // The app shell scrolls inside <main>; a tall viewport shows it whole.
      const width = page.viewportSize()?.width ?? 1280;
      await page.setViewportSize({ width, height: 1500 });
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `${SHOTS}/chat-ui-${info.project.name}-${theme}.png`,
      });
    }

    await question.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('answer')).toHaveText(
      JSON.stringify({ action: 'accept', content: { answer: 'Sidebar' } })
    );
  });
}

test('typing Other answers under the companion key', async ({ page }) => {
  await page.goto('/');
  const question = page.getByRole('region', { name: 'Agent question' });
  await question.scrollIntoViewIfNeeded();
  await question
    .getByPlaceholder('Type your own answer')
    .fill('Split view with a pinned chart');
  await question.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('answer')).toHaveText(
    JSON.stringify({
      action: 'accept',
      content: { answer_custom: 'Split view with a pinned chart' },
    })
  );
});

test('a clicked link opens in a new tab, never inside the reply', async ({
  page,
}) => {
  await page.route('https://example.com/**', (route) =>
    route.fulfill({ status: 200, body: 'ok' })
  );
  await page.goto('/');
  const content = page.frameLocator('iframe[title="Q3 revenue by region"]');
  const popup = page.waitForEvent('popup');
  await content.getByRole('link', { name: 'Full Q3 report' }).click();
  expect((await popup).url()).toBe('https://example.com/q3-report');
  await expect(content.getByText('Q3 revenue, +12% QoQ')).toBeVisible();
});

test('the page is sandboxed away from the app and the network', async ({
  page,
}) => {
  // Requests that reach the network stage; a load the CSP blocks never does
  // (Playwright still reports it as a `request` event, so count routes).
  const sent: string[] = [];
  await page.route('https://example.com/**', (route) => {
    sent.push(route.request().url());
    return route.fulfill({ status: 200, body: 'elsewhere' });
  });
  await page.goto('/?case=probe');
  const probe = page.frameLocator('iframe[title="Sandbox probe"]');
  const results = probe.locator('#results');
  await expect(results).toContainText('"fetch"');
  await expect(results).toContainText('"image"');
  const read = JSON.parse((await results.textContent()) ?? '{}');

  expect(read.origin).toBe('null');
  expect(read.cookie).toMatch(/^blocked/);
  expect(read.localStorage).toMatch(/^blocked/);
  expect(read.parentDocument).toMatch(/^blocked/);
  expect(read.fetch).toMatch(/^blocked/);
  expect(read.image).toBe('blocked');
  expect(read.windowOpen).toBe('null');
  expect(read.violations).toEqual(
    expect.arrayContaining(['connect-src', 'img-src'])
  );
  // The app is still here, not navigated by the page.
  expect(new URL(page.url()).host).toBe('127.0.0.1:3096');
  expect(sent).toEqual([]);

  // A page that navigates its frame is put back. (The navigation request
  // itself can still leave the browser: no sandbox flag or CSP directive
  // stops a frame navigating itself.)
  await probe.getByRole('button', { name: 'Navigate away' }).click();
  await expect(probe.locator('#heading')).toHaveText('Sandbox probe');
  await expect(probe.locator('#results')).toContainText('"fetch"');
});
