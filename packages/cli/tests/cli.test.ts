import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * Runs the real CLI in a subprocess against a fake Macro instance. The fake
 * listens at one origin, so every request also exercises the MACRO_BASE_URL
 * mapping (storage and properties under `/dss`).
 */

type Handler = (request: Request) => Response | Promise<Response>;

const documentId = '0198a4cc-e138-7670-a308-a6b766602701';
const projectId = '0198a4cc-e138-7670-a308-a6b766602702';
const channelId = '0198a4cc-e138-7670-a308-a6b766602703';
const messageId = '0198a4cc-e138-7670-a308-a6b766602704';
const taskId = '0198a4cc-e138-7670-a308-a6b766602705';
const statusProperty = '00000001-0000-0000-0000-000000000002';
const priorityProperty = '00000001-0000-0000-0000-000000000003';
const assigneesProperty = '00000001-0000-0000-0000-000000000001';
const inProgress = '00000001-0000-0000-0002-000000000002';
const high = '00000001-0000-0000-0003-000000000003';

let routes: Record<string, Handler> = {};
let requests: { route: string; body: unknown }[] = [];

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const text = await request.clone().text();
    requests.push({ route, body: text ? JSON.parse(text) : undefined });
    const handler = routes[route];
    return handler
      ? handler(request)
      : Response.json({ message: `no fake for ${route}` }, { status: 404 });
  },
});

afterAll(() => server.stop(true));

beforeEach(() => {
  routes = {};
  requests = [];
});

async function macro(args: string[], stdin?: string) {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, '../src/main.ts'), ...args],
    {
      env: {
        PATH: process.env.PATH,
        MACRO_API_KEY: 'mak_test',
        MACRO_BASE_URL: server.url.origin,
      },
      stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

function documentMetadata(name: string) {
  return {
    data: {
      documentMetadata: {
        documentId,
        documentName: name,
        fileType: 'md',
        owner: 'macro|owner@example.com',
      },
    },
  };
}

function option(id: string, definition: string, label: string) {
  return {
    id,
    property_definition_id: definition,
    value: { type: 'string', value: label },
    display_order: 0,
    color: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };
}

describe('docs', () => {
  test('get prints the markdown with one trailing newline', async () => {
    routes[`GET /dss/documents/${documentId}/markdown`] = () =>
      Response.json({ markdown: '# Plan\n\n- ship', versionId: 'v1' });
    routes[`GET /dss/documents/${documentId}`] = () =>
      Response.json(documentMetadata('Plan'));

    const result = await macro(['docs', 'get', documentId]);

    expect(result).toEqual({
      code: 0,
      stdout: '# Plan\n\n- ship\n',
      stderr: '',
    });
  });

  test('get --json prints id, name, markdown and version', async () => {
    routes[`GET /dss/documents/${documentId}/markdown`] = () =>
      Response.json({ markdown: '# Plan', versionId: 'v1' });
    routes[`GET /dss/documents/${documentId}`] = () =>
      Response.json(documentMetadata('Plan'));

    const result = await macro(['docs', 'get', documentId, '--json']);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: documentId,
      name: 'Plan',
      markdown: '# Plan',
      versionId: 'v1',
    });
  });

  test('get resolves an exact name inside a project', async () => {
    routes['POST /dss/items/soup/ast'] = () =>
      Response.json({
        items: [
          { tag: 'document', data: { id: documentId, name: 'Plan' } },
          { tag: 'document', data: { id: taskId, name: 'Plan B' } },
        ],
        next_cursor: null,
      });
    routes[`GET /dss/documents/${documentId}/markdown`] = () =>
      Response.json({ markdown: 'body', versionId: 'v1' });
    routes[`GET /dss/documents/${documentId}`] = () =>
      Response.json(documentMetadata('Plan'));

    const result = await macro(['docs', 'get', 'Plan', '--project', projectId]);

    expect(result.stdout).toBe('body\n');
    const search = requests.find((r) => r.route === 'POST /dss/items/soup/ast');
    expect(search?.body).toMatchObject({
      df: { '&': [{ l: { pid: projectId } }, { l: { nc: 'Plan' } }] },
    });
  });

  test('get lists the candidates when a name is ambiguous', async () => {
    routes['POST /dss/items/soup/ast'] = () =>
      Response.json({
        items: [
          { tag: 'document', data: { id: documentId, name: 'Plan' } },
          { tag: 'document', data: { id: taskId, name: 'Plan' } },
        ],
        next_cursor: null,
      });

    const result = await macro(['docs', 'get', 'Plan']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain(documentId);
    expect(result.stderr).toContain(taskId);
  });

  test('put strips exactly one trailing newline and sends the base version', async () => {
    routes[`PUT /dss/documents/${documentId}/markdown`] = () =>
      Response.json({ versionId: 'v2', changed: true });

    const result = await macro(
      ['docs', 'put', documentId, '-', '--base', 'v1', '--json'],
      '# Plan\n\n'
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: documentId,
      versionId: 'v2',
      changed: true,
    });
    const put = requests.find((r) => r.route.startsWith('PUT'));
    expect(put?.body).toMatchObject({
      markdown: '# Plan\n',
      baseVersionId: 'v1',
    });
  });

  test('put exits 3 on a stale base version', async () => {
    routes[`PUT /dss/documents/${documentId}/markdown`] = () =>
      Response.json({ message: 'version is stale' }, { status: 409 });

    const result = await macro(
      ['docs', 'put', documentId, '-', '--base', 'v0'],
      'text\n'
    );

    expect(result.code).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Conflict (HTTP 409): version is stale');
  });

  test('create makes a skill in the project and prints its id', async () => {
    routes['POST /dss/documents/create_skill'] = () =>
      Response.json({ documentId });

    const result = await macro(
      [
        'docs',
        'create',
        '--name',
        'Review',
        '--project',
        projectId,
        '--skill',
        '-',
      ],
      'Check the tests.\n'
    );

    expect(result).toEqual({ code: 0, stdout: `${documentId}\n`, stderr: '' });
    expect(requests.at(-1)?.body).toEqual({
      skillName: 'Review',
      markdown: 'Check the tests.',
      projectId,
    });
  });
});

describe('tasks', () => {
  test('create sets status, priority and assignee after creating', async () => {
    routes['POST /dss/documents/create_task'] = () =>
      Response.json({ documentId: taskId });
    routes[`GET /dss/properties/definitions/${statusProperty}/options`] = () =>
      Response.json([option(inProgress, statusProperty, 'In Progress')]);
    routes[`GET /dss/properties/definitions/${priorityProperty}/options`] =
      () => Response.json([option(high, priorityProperty, 'High')]);
    for (const property of [
      statusProperty,
      priorityProperty,
      assigneesProperty,
    ])
      routes[`PUT /dss/properties/entities/DOCUMENT/${taskId}/${property}`] =
        () => new Response(null, { status: 204 });

    const result = await macro([
      'tasks',
      'create',
      '--title',
      'Fix login',
      '--status',
      'in progress',
      '--priority',
      'High',
      '--assignee',
      'ada@example.com',
    ]);

    expect(result).toEqual({ code: 0, stdout: `${taskId}\n`, stderr: '' });
    const body = (property: string) =>
      requests.find((r) => r.route.endsWith(`/${taskId}/${property}`))?.body;
    expect(
      requests.find((r) => r.route.endsWith('create_task'))?.body
    ).toMatchObject({
      taskName: 'Fix login',
    });
    expect(body(statusProperty)).toEqual({
      value: { type: 'select_option', option_id: inProgress },
    });
    expect(body(priorityProperty)).toEqual({
      value: { type: 'select_option', option_id: high },
    });
    expect(body(assigneesProperty)).toEqual({
      value: {
        type: 'multi_entity_reference',
        references: [
          { entity_type: 'USER', entity_id: 'macro|ada@example.com' },
        ],
      },
    });
  });

  test('create refuses an unknown status before creating anything', async () => {
    routes[`GET /dss/properties/definitions/${statusProperty}/options`] = () =>
      Response.json([option(inProgress, statusProperty, 'In Progress')]);

    const result = await macro([
      'tasks',
      'create',
      '--title',
      'X',
      '--status',
      'Doing',
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Choose one of: In Progress');
    expect(requests.some((r) => r.route.endsWith('create_task'))).toBe(false);
  });

  test('update renames the task and sets its priority', async () => {
    routes[`PATCH /dss/documents/${taskId}`] = () => Response.json({});
    routes[`GET /dss/properties/definitions/${priorityProperty}/options`] =
      () => Response.json([option(high, priorityProperty, 'High')]);
    routes[
      `PUT /dss/properties/entities/DOCUMENT/${taskId}/${priorityProperty}`
    ] = () => new Response(null, { status: 204 });

    const result = await macro([
      'tasks',
      'update',
      taskId,
      '--title',
      'Fix login on iOS',
      '--priority',
      'high',
    ]);

    expect(result).toEqual({
      code: 0,
      stdout: `Updated ${taskId}\n`,
      stderr: '',
    });
    expect(requests.find((r) => r.route.startsWith('PATCH'))?.body).toEqual({
      documentName: 'Fix login on iOS',
    });
  });
});

describe('channels', () => {
  test('post sends standard input to the channel', async () => {
    routes[`POST /dss/messages/channel/${channelId}`] = () =>
      Response.json({ id: messageId });

    const result = await macro(
      ['channels', 'post', channelId, '-'],
      'Deployed.\n'
    );

    expect(result).toEqual({ code: 0, stdout: `${messageId}\n`, stderr: '' });
    expect(requests.at(-1)?.body).toMatchObject({ content: 'Deployed.' });
  });
});

describe('search', () => {
  test('prints matching documents with their names', async () => {
    routes['POST /dss/search'] = () =>
      Response.json({
        results: [{ type: 'document', document_id: documentId }],
        next_cursor: null,
      });
    routes[`GET /dss/documents/${documentId}`] = () =>
      Response.json(documentMetadata('Plan'));

    const result = await macro(['search', 'plan']);

    expect(result).toEqual({
      code: 0,
      stdout: `${documentId}  Plan\n`,
      stderr: '',
    });
    expect(requests[0]?.body).toMatchObject({ query: 'plan' });
  });

  test('--json prints the loaded documents', async () => {
    routes['POST /dss/search'] = () =>
      Response.json({
        results: [{ type: 'document', document_id: documentId }],
        next_cursor: null,
      });
    routes[`GET /dss/documents/${documentId}`] = () =>
      Response.json(documentMetadata('Plan'));

    const result = await macro(['search', 'plan', '--json']);

    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: documentId,
        detail: documentMetadata('Plan').data.documentMetadata,
      },
    ]);
  });
});

describe('usage', () => {
  test('unknown options exit 2 without calling the API', async () => {
    const result = await macro(['docs', 'get', documentId, '--bogus']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--bogus');
    expect(requests).toEqual([]);
  });

  test('group help lists the group commands', async () => {
    const result = await macro(['tasks', '--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('macro tasks create --title <title>');
    expect(result.stdout).not.toContain('macro docs get');
  });
});
