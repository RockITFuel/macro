import path from 'node:path';

/**
 * Settings, all from the environment:
 *
 * SMOKE_BASE_URL     origin, e.g. https://localhost:43009 or https://macro.alphamonitoring.app
 * SMOKE_MAILPIT_URL  Mailpit base URL to read login codes from (local stacks).
 *                    Unset: the accounts must already be signed in, see
 *                    SMOKE_STATE_DIR and `bun run login <email>`.
 * SMOKE_USER_A/B     the two test accounts (default gate-a/gate-b@d2d.cloud)
 * SMOKE_FRESH_SIGNUP 1 = also sign up a brand-new account and walk onboarding
 *                    (default 1 with Mailpit, 0 without)
 * SMOKE_STATE_DIR    where signed-in browser state is kept (default .auth/<host>)
 * SMOKE_OUT          report, traces and screenshots (default ./out)
 * SMOKE_LABEL        tag put into everything the suite creates (default: time)
 * SMOKE_REALTIME_MS  realtime budget in ms (default 3000: "about 2 s" + slack)
 */
const baseUrl = (process.env.SMOKE_BASE_URL ?? 'https://localhost:43009').replace(/\/$/, '');
const host = new URL(baseUrl).host.replace(/[^a-z0-9.-]/gi, '_');
const mailpit = process.env.SMOKE_MAILPIT_URL?.replace(/\/$/, '');

export const env = {
  baseUrl,
  app: `${baseUrl}/app`,
  mailpit,
  ignoreHttpsErrors: /localhost|127\.0\.0\.1/.test(baseUrl),
  userA: process.env.SMOKE_USER_A ?? 'gate-a@d2d.cloud',
  userB: process.env.SMOKE_USER_B ?? 'gate-b@d2d.cloud',
  freshSignup: (process.env.SMOKE_FRESH_SIGNUP ?? (mailpit ? '1' : '0')) === '1',
  stateDir: process.env.SMOKE_STATE_DIR ?? path.resolve(import.meta.dirname, '..', '.auth', host),
  out: path.resolve(process.env.SMOKE_OUT ?? path.resolve(import.meta.dirname, '..', 'out')),
  label: process.env.SMOKE_LABEL ?? new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12),
  realtimeMs: Number(process.env.SMOKE_REALTIME_MS ?? 3000),
  fixtures: path.resolve(import.meta.dirname, '..', 'fixtures'),
};

export const statePath = (who: 'a' | 'b') => path.join(env.stateDir, `${who}.json`);

/** A unique name for something this run creates. */
export const uniq = (what: string) => `${what} [smoke ${env.label}-${Math.random().toString(36).slice(2, 6)}]`;
