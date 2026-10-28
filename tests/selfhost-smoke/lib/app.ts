import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { env } from './env';

/** Wait until the app shell has rendered (the Settings rail button). */
export async function ready(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).first().waitFor({ timeout: 60_000 });
}

export async function go(page: Page, route: string) {
  await page.goto(`${env.app}${route}`);
  await ready(page);
}

/** Open (or create) the direct message with `email`; returns its URL. */
export async function openDm(page: Page, email: string): Promise<string> {
  await go(page, '/channels');
  await page.locator('[aria-label="Start direct message"]').first().click();
  await page.keyboard.type(email, { delay: 20 });
  await page.locator('[role=option]:visible').filter({ hasText: email }).first().click();
  await page.waitForURL(/\/app\/(channels\/[0-9a-f-]{36}|component\/channel-compose)/);
  return page.url();
}

/**
 * The channel/DM composer: "Type @ to share with …" in a conversation, "Send
 * message …" on the draft page of a DM that has no messages yet.
 */
export const composer = (page: Page) =>
  page.locator('[contenteditable=true][aria-label^="Type @"]:visible, [contenteditable=true][aria-label^="Send message"]:visible').last();

/** Reply in the thread of message `parent` (inline thread composer "Send a reply"). */
export async function replyInThread(page: Page, parent: string, text: string) {
  await message(page, parent).hover();
  await page.getByRole('button', { name: 'Reply' }).last().click();
  const box = page.locator('[contenteditable=true][aria-label="Send a reply"]:visible').last();
  await box.click();
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press('Enter');
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
}

/** Post a message that @mentions `email` (picked from the mention popup). */
export async function sendMention(page: Page, email: string, text: string) {
  await composer(page).click();
  await page.keyboard.type(`@${email.split('@')[0]}`, { delay: 40 });
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await page.keyboard.type(` ${text}`, { delay: 5 });
  await page.keyboard.press('Enter');
  await expect(message(page, text)).toBeVisible({ timeout: 20_000 });
}

export async function sendMessage(page: Page, text: string) {
  await composer(page).click();
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/app\/channels\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(message(page, text)).toBeVisible({ timeout: 20_000 });
}

export const message = (page: Page, text: string) => page.locator('[data-message-content]').filter({ hasText: text }).last();

const TASKS_LIST = '/tasks?s0.tasks.layout=list&s0.tasks.groupBy=status';
const TASKS_BOARD = '/tasks?s0.tasks.layout=board&s0.tasks.groupBy=status';
export const tasksList = (page: Page) => go(page, TASKS_LIST);
export const tasksBoard = (page: Page) => go(page, TASKS_BOARD);

/** Create a task from the Tasks page; optionally add `assignee` (an email). */
export async function createTask(page: Page, title: string, assignee?: string) {
  if (!/\/app\/tasks/.test(page.url())) await tasksList(page);
  await page.getByRole('button', { name: 'New task, subtask, project, or tag' }).first().click();
  await page.getByText('Track a standalone piece of work.').click();
  const dialog = page.locator('[role=dialog]:visible').last();
  await dialog.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type(title, { delay: 5 });
  if (assignee) {
    await dialog.getByRole('button', { name: /gate-|people|Assignee/i }).first().click();
    await page.getByPlaceholder('Add assignees...').fill(assignee.split('@')[0]);
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('button', { name: /2 people/ })).toBeVisible();
  }
  await dialog.getByRole('button', { name: /Create Task/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** A task row/card on the Tasks page. */
export const taskItem = (page: Page, title: string) => page.getByText(title, { exact: true }).first();

/** Board column whose header names `status`. */
export function boardColumn(page: Page, status: string): Locator {
  return page.locator('[data-board-column], [data-column-id], [role=group]').filter({ has: page.getByText(status, { exact: true }) }).first();
}

/**
 * Drag a board card into another status column. Moves slowly with pauses: the
 * board ignores fast travel and activates a column after ~100 ms of rest.
 */
export async function dragCard(page: Page, title: string, toStatus: string) {
  const from = (await taskItem(page, title).boundingBox())!;
  const header = (await page.getByText(toStatus, { exact: true }).first().boundingBox())!;
  const [x0, y0, x1, y1] = [from.x + 20, from.y + 8, header.x + 60, header.y + 70];
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / 30, y0 + ((y1 - y0) * i) / 30);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(500);
  await page.mouse.move(x1 + 25, y1 + 3, { steps: 3 });
  await page.waitForTimeout(500);
  await page.mouse.up();
}

/** The status column a board card sits in (the nearest column header to its left). */
export async function cardColumn(page: Page, title: string, statuses: string[]): Promise<string | undefined> {
  const card = (await taskItem(page, title).boundingBox())!;
  let best: [string, number] | undefined;
  for (const s of statuses) {
    const h = await page.getByText(s, { exact: true }).first().boundingBox().catch(() => null);
    if (!h) continue;
    const dx = card.x - h.x;
    if (dx > -60 && (!best || dx < best[1])) best = [s, dx];
  }
  return best?.[0];
}

/** Open a task's detail page from the Tasks page; returns its URL. */
export async function openTask(page: Page, title: string): Promise<string> {
  await taskItem(page, title).click();
  await page.waitForURL(/\/app\/tasks\/[0-9a-f-]{36}/);
  return page.url();
}

export const commentBox = (page: Page) => page.locator('[contenteditable=true][aria-label="Leave a comment..."]:visible').last();

export async function comment(page: Page, text: string) {
  await commentBox(page).click();
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press('Enter');
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
}

/** Set the status of the open task through its status pill. */
export async function setStatus(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: from, exact: true }).first().click();
  // The status menu (role=menu) lists plain rows: "Not Started 1", "In Progress 2", ...
  await page.locator('[role=menu]:visible').last().getByText(to, { exact: true }).first().click();
  await expect(page.getByRole('button', { name: to, exact: true }).first()).toBeVisible();
}

/** Upload a file through Drive > New > Upload files. */
export async function uploadToDrive(page: Page, file: string) {
  await go(page, '/drive');
  await page.getByRole('button', { name: /^New/ }).last().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload files', { exact: true }).click();
  await (await chooser).setFiles(file);
}
