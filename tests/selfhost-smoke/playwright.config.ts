import { defineConfig, devices } from '@playwright/test';

import { env } from './lib/env';

// Self-host smoke suite: runs against any Macro origin (local staging or
// production) with two test accounts. See README.md.
export default defineConfig({
  testDir: './specs',
  outputDir: `${env.out}/artifacts`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: `${env.out}/results.json` }],
    ['html', { outputFolder: `${env.out}/html`, open: 'never' }],
  ],
  use: {
    baseURL: env.baseUrl,
    ignoreHTTPSErrors: env.ignoreHttpsErrors,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
    permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, testDir: './lib' },
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
      dependencies: ['setup'],
    },
  ],
});
