import { openDm, sendMessage } from '../lib/app';
import { env, uniq } from '../lib/env';
import { expect, test } from '../lib/fixtures';

// Two browsers with fake camera/microphone join a call in the A–B DM.
test('call: two users join and receive each other\'s media', async ({ a, b }) => {
  await openDm(a, env.userB);
  await sendMessage(a, uniq('call setup'));
  const dmUrl = a.url();

  await a.getByRole('button', { name: 'Call', exact: true }).first().click();
  await b.goto(dmUrl);
  const join = b.getByRole('button', { name: /^Join/ }).first();
  await join.click({ timeout: 45_000 });

  // Both sides end up with a playing remote video/audio track.
  const media = (p: typeof a) =>
    p.evaluate(() =>
      [...document.querySelectorAll('video, audio')].filter(
        (m) => (m as HTMLMediaElement).srcObject && !(m as HTMLMediaElement).paused,
      ).length,
    );
  await expect.poll(() => media(a), { timeout: 60_000, message: 'A receives media' }).toBeGreaterThan(0);
  await expect.poll(() => media(b), { timeout: 60_000, message: 'B receives media' }).toBeGreaterThan(0);
  await expect(a.getByText(/2 (people|participants)|gate-b/i).first()).toBeVisible({ timeout: 30_000 });

  const leave = a.getByRole('button', { name: /^(Leave|Hang up|End call)/ }).first();
  if (await leave.isVisible().catch(() => false)) await leave.click();
});
