import fs from 'node:fs';
import path from 'node:path';

import { go, uploadToDrive } from '../lib/app';
import { env } from '../lib/env';
import { expect, test } from '../lib/fixtures';

// Each upload gets a unique name so a run never opens an older file.
function copyFixture(name: string): string {
  const ext = path.extname(name);
  const dir = path.join(env.out, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `smoke-${env.label}-${Math.random().toString(36).slice(2, 6)}${ext}`);
  fs.copyFileSync(path.join(env.fixtures, name), file);
  return file;
}

for (const [fixture, kind] of [
  ['smoke.pdf', 'pdf'],
  ['smoke.png', 'image'],
] as const) {
  test(`upload and open a ${kind} (object storage)`, async ({ a: page }) => {
    const storage: string[] = [];
    let cors = '';
    page.on('response', (r) => {
      if (/r2\.cloudflarestorage\.com|\/local-storage\//.test(r.url())) storage.push(`${r.status()} ${r.request().method()}`);
    });
    page.on('console', (m) => {
      if (/blocked by CORS policy/.test(m.text())) cors ||= m.text().match(/https:\/\/[^/'"]+/)?.[0] ?? 'object storage';
    });
    const file = copyFixture(fixture);
    const name = path.basename(file, path.extname(file));
    await uploadToDrive(page, file);
    await expect
      .poll(() => cors || storage.filter((s) => /^2\d\d (PUT|POST)/.test(s)).length, { message: `upload PUT to object storage (seen: ${storage.join(', ') || 'none'})`, timeout: 60_000 })
      .toBeTruthy();
    // A bucket whose CORS rules lack this origin is configuration, not code:
    // the gate reports it as not verified rather than as a regression.
    if (cors) {
      throw new Error(`ENVIRONMENT: ${cors} refuses CORS for ${env.baseUrl}; add the origin to the bucket's CORS rules`);
    }

    await go(page, '/drive');
    const item = page.getByText(name, { exact: false }).first();
    await expect(item).toBeVisible({ timeout: 60_000 });
    await item.dblclick();
    await page.waitForURL((u) => !u.pathname.endsWith('/drive'), { timeout: 30_000 });
    if (kind === 'pdf') {
      // The PDF viewer renders pages to canvas (or a text layer with our text).
      await expect(page.locator('canvas:visible, .textLayer:visible').first()).toBeVisible({ timeout: 60_000 });
    } else {
      const img = page.locator('main img:visible, img:visible').filter({ hasNot: page.locator('[aria-hidden=true]') }).last();
      await expect(img).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    }
    expect(storage.filter((s) => /^[45]\d\d/.test(s)), 'object storage errors').toEqual([]);
  });
}
