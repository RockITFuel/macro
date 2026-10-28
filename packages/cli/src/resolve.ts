import type { Macro, WorkspaceItem } from '@macro-inc/sdk';
import { UsageError } from './command';

export type Document = ReturnType<Macro['documents']['byId']>;
export type Project = ReturnType<Macro['projects']['byId']>;
export type Channel = ReturnType<Macro['channels']['byId']>;

type DocumentItem = Extract<WorkspaceItem, { type: 'document' }>;
type ProjectItem = Extract<WorkspaceItem, { type: 'project' }>;

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace pages are capped at 500 items; ask for full pages. */
const PAGE_SIZE = 500;

export function isId(reference: string): boolean {
  return ID_PATTERN.test(reference);
}

/** Join workspace filter literals with `&`; undefined entries are skipped. */
export function allOf(
  literals: Array<Record<string, unknown> | undefined>
): unknown {
  return literals
    .filter((literal) => literal !== undefined)
    .map((literal) => ({ l: literal }))
    .reduce<unknown>(
      (left, right) => (left === undefined ? right : { '&': [left, right] }),
      undefined
    );
}

function single<T extends { id: string }>(
  kind: string,
  name: string,
  matches: T[]
): T {
  const [first, ...rest] = matches;
  if (!first) throw new UsageError(`No ${kind} is named "${name}".`);
  if (rest.length > 0)
    throw new UsageError(
      `${matches.length} ${kind}s are named "${name}"; pass an id instead:\n${matches.map((match) => `  ${match.id}`).join('\n')}`
    );
  return first;
}

export async function projectItems(macro: Macro): Promise<ProjectItem[]> {
  const items = await Array.fromAsync(
    macro.workspace.list({ includeTypes: ['project'], limit: PAGE_SIZE })
  );
  return items.filter((item) => item.type === 'project');
}

export async function documentItems(
  macro: Macro,
  filter: {
    project?: Project;
    subType?: 'skill' | 'task';
    nameContains?: string;
  }
): Promise<DocumentItem[]> {
  const items = await Array.fromAsync(
    macro.workspace.list({
      includeTypes: ['document'],
      df: allOf([
        filter.subType ? { dst: filter.subType } : undefined,
        filter.project ? { pid: filter.project.id } : undefined,
        filter.nameContains ? { nc: filter.nameContains } : undefined,
      ]),
      limit: PAGE_SIZE,
    })
  );
  return items.filter((item) => item.type === 'document');
}

/** A project by id, or by exact name among the caller's projects. */
export async function resolveProject(
  macro: Macro,
  reference: string
): Promise<Project> {
  if (isId(reference)) return macro.projects.byId(reference);
  const matches = (await projectItems(macro)).filter(
    (item) => item.name === reference
  );
  return single('project', reference, matches).entity;
}

/** A document by id, or by exact name, optionally within a project. */
export async function resolveDocument(
  macro: Macro,
  reference: string,
  scope: { project?: string; subType?: 'skill' } = {}
): Promise<Document> {
  if (isId(reference)) return macro.documents.byId(reference);
  const project = scope.project
    ? await resolveProject(macro, scope.project)
    : undefined;
  const matches = (
    await documentItems(macro, {
      project,
      subType: scope.subType,
      nameContains: reference,
    })
  ).filter((item) => item.name === reference);
  return single(scope.subType ?? 'document', reference, matches).entity;
}

/** A channel by id, or by exact name (a leading `#` is ignored). */
export async function resolveChannel(
  macro: Macro,
  reference: string
): Promise<Channel> {
  if (isId(reference)) return macro.channels.byId(reference);
  const name = reference.replace(/^#/, '');
  const candidates = await Array.fromAsync(macro.channels.search(name));
  const names = await Promise.all(candidates.map((channel) => channel.name()));
  const matches = candidates.filter((_, index) => names[index] === name);
  return single('channel', name, matches);
}

/** An agent's bot id, by id or by exact agent name. */
export async function resolveAgentId(
  macro: Macro,
  reference: string
): Promise<string> {
  if (isId(reference)) return reference;
  const agents = await macro.agents.list();
  const names = await Promise.all(agents.map((agent) => agent.name()));
  const matches = agents.filter((_, index) => names[index] === reference);
  return single('agent', reference, matches).id;
}
