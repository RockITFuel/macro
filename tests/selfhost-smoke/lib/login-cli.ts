// bun run login <email> [a|b]: sign in by hand (code typed on stdin) and save
// the browser state the suite uses when there is no Mailpit (production).
import fs from 'node:fs';
import readline from 'node:readline/promises';

import { chromium } from '@playwright/test';

import { completeOnboarding, signIn } from './auth';
import { env, statePath } from './env';

const [email, who = email === env.userB ? 'b' : 'a'] = process.argv.slice(2);
if (!email) throw new Error('usage: bun run login <email> [a|b]');
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: env.ignoreHttpsErrors });
const page = await ctx.newPage();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await signIn(page, email, env.mailpit ? undefined : () => rl.question(`code mailed to ${email}: `));
rl.close();
if (/welcome|onboarding/.test(page.url())) await completeOnboarding(page);
fs.mkdirSync(env.stateDir, { recursive: true });
await ctx.storageState({ path: statePath(who as 'a' | 'b') });
console.log(`saved ${statePath(who as 'a' | 'b')}`);
await browser.close();
