import { cardColumn, comment, createTask, dragCard, openTask, taskItem, tasksBoard, tasksList } from '../lib/app';
import { env, uniq } from '../lib/env';
import { expect, test } from '../lib/fixtures';

test('tasks: create, assign, move across board columns, comment', async ({ a: page }) => {
  const title = uniq('Smoke task');
  await tasksList(page);
  await createTask(page, title, env.userB);
  await expect(taskItem(page, title)).toBeVisible({ timeout: 20_000 });

  await tasksBoard(page);
  await expect(taskItem(page, title)).toBeVisible({ timeout: 20_000 });
  await dragCard(page, title, 'In Progress');
  // After a reload the card is still in the new column.
  await tasksBoard(page);
  await expect(taskItem(page, title)).toBeVisible({ timeout: 20_000 });
  expect(await cardColumn(page, title, ['Not Started', 'In Progress', 'In Review'])).toBe('In Progress');

  await openTask(page, title);
  await expect(page.getByRole('button', { name: /2 people/ }).first()).toBeVisible();
  const text = uniq('task comment');
  await comment(page, text);
  await page.reload();
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
});
