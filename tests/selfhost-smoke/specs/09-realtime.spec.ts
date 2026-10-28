import { comment, composer, createTask, message, openDm, openTask, replyInThread, sendMessage, setStatus, taskItem, tasksBoard, tasksList } from '../lib/app';
import { env, uniq } from '../lib/env';
import { expect, test, within } from '../lib/fixtures';

// Two signed-in users. A changes something; B's already-open page must show it
// without a reload within SMOKE_REALTIME_MS. Every test title carries @realtime
// so report.py lists them separately. Latencies go into the annotations.
const budget = env.realtimeMs;
const note = (what: string, ms: number) => test.info().annotations.push({ type: 'latency', description: `${what}: ${ms} ms` });

for (const view of ['list', 'board'] as const) {
  test(`@realtime task created by A appears in B's ${view} view`, async ({ a, b }) => {
    await (view === 'list' ? tasksList(b) : tasksBoard(b));
    await tasksList(a);
    const title = uniq(`RT create ${view}`);
    await createTask(a, title, env.userB);
    note('create', await within(budget, `new task in B's ${view}`, () => expect(taskItem(b, title)).toBeVisible({ timeout: budget })));
  });

  test(`@realtime task moved by A changes column/status in B's ${view} view`, async ({ a, b }) => {
    const title = uniq(`RT move ${view}`);
    await tasksList(a);
    await createTask(a, title, env.userB);
    await (view === 'list' ? tasksList(b) : tasksBoard(b));
    await expect(taskItem(b, title)).toBeVisible({ timeout: 20_000 });
    const before = (await taskItem(b, title).boundingBox())!;
    await openTask(a, title);
    await setStatus(a, 'Not Started', 'In Progress');
    note('move', await within(budget, `status change in B's ${view}`, () =>
      expect.poll(async () => {
        const box = await taskItem(b, title).boundingBox({ timeout: 250 }).catch(() => null);
        return !!box && (Math.abs(box.x - before.x) > 50 || Math.abs(box.y - before.y) > 10);
      }, { timeout: budget, intervals: [100] }).toBe(true)));
  });

  test(`@realtime task renamed by A updates in B's ${view} view`, async ({ a, b }) => {
    const title = uniq(`RT edit ${view}`);
    await tasksList(a);
    await createTask(a, title, env.userB);
    await (view === 'list' ? tasksList(b) : tasksBoard(b));
    await expect(taskItem(b, title)).toBeVisible({ timeout: 20_000 });
    await openTask(a, title);
    const renamed = `${title} renamed`;
    await a.locator('[contenteditable="true"]:visible').first().click();
    await a.keyboard.press('End');
    await a.keyboard.type(' renamed', { delay: 5 });
    await a.keyboard.press('Tab');
    note('edit', await within(budget, `renamed task in B's ${view}`, () => expect(taskItem(b, renamed)).toBeVisible({ timeout: budget })));
  });
}

test('@realtime task comment by A appears on B\'s open task', async ({ a, b }) => {
  const title = uniq('RT comment');
  await tasksList(a);
  await createTask(a, title, env.userB);
  const url = await openTask(a, title);
  await b.goto(url);
  await expect(b.locator('[contenteditable="true"]').first()).toContainText(title, { timeout: 30_000 });
  const text = uniq('rt comment');
  await comment(a, text);
  note('comment', await within(budget, 'comment on B\'s open task', () => expect(b.getByText(text).first()).toBeVisible({ timeout: budget })));
});

test('@realtime channel message and thread reply by A appear for B', async ({ a, b }) => {
  await openDm(a, env.userB);
  await sendMessage(a, uniq('rt warmup'));
  const url = a.url();
  await b.goto(url);
  await expect(composer(b)).toBeVisible({ timeout: 30_000 });
  const text = uniq('rt message');
  await sendMessage(a, text);
  note('message', await within(budget, 'DM message for B', () => expect(message(b, text)).toBeVisible({ timeout: budget })));

  const reply = uniq('rt reply');
  await replyInThread(a, text, reply);
  note('thread', await within(budget, 'thread reply indicator for B', () =>
    expect(b.getByText(reply).or(b.getByText(/1 repl(y|ies)/)).first()).toBeVisible({ timeout: budget })));
});
