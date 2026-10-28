import type { Macro } from '@macro-inc/sdk';
import {
  type Command,
  lines,
  listOption,
  requiredOption,
  stringOption,
  UsageError,
  type Values,
} from '../command';
import { readSource, readText } from '../input';
import { allOf, resolveProject } from '../resolve';

type Task = ReturnType<Macro['tasks']['byId']>;
type PropertyDefinition = ReturnType<Macro['properties']['definition']>;
type PropertyOption = Awaited<
  ReturnType<PropertyDefinition['options']>
>[number];
type EntityProperty = Awaited<ReturnType<Task['properties']>>[number];

/**
 * System task property definitions. The ids are fixed by the backend; see the
 * SetEntityProperty tool description in
 * `crates/properties/src/inbound/toolset/set_entity_property.rs`.
 */
const ASSIGNEES = '00000001-0000-0000-0000-000000000001';
const STATUS = '00000001-0000-0000-0000-000000000002';
const PRIORITY = '00000001-0000-0000-0000-000000000003';

const fieldOptions = {
  status: { type: 'string' },
  priority: { type: 'string' },
  assignee: { type: 'string', multiple: true },
  label: { type: 'string', multiple: true },
} as const;

const fieldArgs =
  '[--status <name>] [--priority <name>] [--assignee <email|me>]... [--label <tag>]...';

/** The option of a select property whose label matches, ignoring case. */
async function optionByLabel(
  macro: Macro,
  propertyId: string,
  kind: string,
  label: string
): Promise<PropertyOption> {
  const options = await macro.properties.definition(propertyId).options();
  const labels = options.flatMap((option) =>
    option.value.type === 'string' ? [option.value.value] : []
  );
  const index = labels.findIndex(
    (candidate) => candidate.toLowerCase() === label.toLowerCase()
  );
  const match = options[index];
  if (index < 0 || !match)
    throw new UsageError(
      `Unknown ${kind} "${label}". Choose one of: ${labels.join(', ')}.`
    );
  return match;
}

/** A Macro principal id: `me`, an email address, or `macro|…` / `bot|…`. */
async function principal(macro: Macro, assignee: string): Promise<string> {
  if (assignee === 'me') return macro.myPrincipalId();
  if (assignee.includes('|')) return assignee;
  if (assignee.includes('@')) return `macro|${assignee}`;
  throw new UsageError(
    `--assignee takes an email address, "me", or a principal id like macro|name@example.com; got "${assignee}".`
  );
}

/** Tag options by label across the caller's personal and team tag sets. */
async function tagsByLabel(
  macro: Macro,
  labels: string[]
): Promise<Map<PropertyDefinition, PropertyOption[]>> {
  const sets = await macro.properties.tags();
  const available = (
    await Promise.all(
      sets.flatMap((set) => {
        if (!set.definition) return [];
        const property = macro.properties.definition(set.definition.id);
        return [
          property
            .options()
            .then((options) => options.map((option) => ({ property, option }))),
        ];
      })
    )
  ).flat();
  const byProperty = new Map<PropertyDefinition, PropertyOption[]>();
  for (const label of labels) {
    const matches = available.filter(
      ({ option }) =>
        option.value.type === 'string' &&
        option.value.value.toLowerCase() === label.toLowerCase()
    );
    const [match, ...others] = matches;
    if (!match)
      throw new UsageError(
        `Unknown label "${label}". Available labels: ${available.map(({ option }) => option.value.value).join(', ')}.`
      );
    if (others.length > 0)
      throw new UsageError(
        `Label "${label}" exists in both your personal and your team tags.`
      );
    byProperty.set(match.property, [
      ...(byProperty.get(match.property) ?? []),
      match.option,
    ]);
  }
  return byProperty;
}

/**
 * Resolve every field flag before anything is written, so a typo fails the
 * command instead of leaving a half-updated (or freshly created) task.
 */
async function resolveFields(macro: Macro, values: Values) {
  const status = stringOption(values, 'status');
  const priority = stringOption(values, 'priority');
  const assignees = listOption(values, 'assignee');
  const labels = listOption(values, 'label');
  return {
    status: status
      ? await optionByLabel(macro, STATUS, 'status', status)
      : undefined,
    priority: priority
      ? await optionByLabel(macro, PRIORITY, 'priority', priority)
      : undefined,
    assignees: await Promise.all(
      assignees.map((assignee) => principal(macro, assignee))
    ),
    tags: labels.length > 0 ? await tagsByLabel(macro, labels) : undefined,
  };
}

/** Write resolved fields. Assignees replace the current set; labels are added. */
async function applyFields(
  macro: Macro,
  task: Task,
  fields: Awaited<ReturnType<typeof resolveFields>>
): Promise<void> {
  if (fields.status)
    await task.setProperty(macro.properties.definition(STATUS), {
      type: 'select_option',
      option_id: fields.status.id,
    });
  if (fields.priority)
    await task.setProperty(macro.properties.definition(PRIORITY), {
      type: 'select_option',
      option_id: fields.priority.id,
    });
  if (fields.assignees.length > 0)
    await task.setProperty(macro.properties.definition(ASSIGNEES), {
      type: 'multi_entity_reference',
      references: fields.assignees.map((entity_id) => ({
        entity_type: 'USER',
        entity_id,
      })),
    });
  if (fields.tags)
    await task.updatePropertyOptions(
      [...fields.tags].map(([property, add]) => ({ property, add }))
    );
}

function formatValue(property: EntityProperty): string | undefined {
  const value = property.value;
  if (!value) return undefined;
  switch (value.type) {
    case 'SelectOption':
      return value.value
        .map((id) => {
          const option = property.options?.find(
            (candidate) => candidate.id === id
          );
          return option ? String(option.value.value) : id;
        })
        .join(', ');
    case 'EntityReference':
      return value.value.map((reference) => reference.entity_id).join(', ');
    case 'Link':
      return value.value.join(', ');
    default:
      return String(value.value);
  }
}

export const tasksCommands: Command[] = [
  {
    path: ['tasks', 'list'],
    args: '[--project <id|name>] [--status <name>] [--assignee <email|me>] [--limit <n>]',
    summary: 'List tasks, most recently updated first (default limit 100)',
    options: {
      project: { type: 'string' },
      status: { type: 'string' },
      assignee: { type: 'string' },
      limit: { type: 'string' },
    },
    positionals: { min: 0, max: 0 },
    async run(macro, { values }) {
      const limit = Number(stringOption(values, 'limit') ?? '100');
      if (!Number.isInteger(limit) || limit < 1)
        throw new UsageError('--limit takes a positive whole number');
      const projectReference = stringOption(values, 'project');
      const status = stringOption(values, 'status');
      const assignee = stringOption(values, 'assignee');
      const project = projectReference
        ? await resolveProject(macro, projectReference)
        : undefined;
      const statusOption = status
        ? await optionByLabel(macro, STATUS, 'status', status)
        : undefined;
      const assigneeId = assignee
        ? await principal(macro, assignee)
        : undefined;
      const items = [];
      for await (const item of macro.workspace.list({
        includeTypes: ['document'],
        df: allOf([{ dst: 'task' }, project ? { pid: project.id } : undefined]),
        propf: allOf([
          statusOption
            ? { pd: STATUS, et: 'TASK', v: { so: statusOption.id } }
            : undefined,
          assigneeId
            ? { pd: ASSIGNEES, et: 'TASK', v: { er: assigneeId } }
            : undefined,
        ]),
        limit: Math.min(limit, 500),
      })) {
        if (item.type === 'document') items.push(item);
        if (items.length === limit) break;
      }
      return {
        json: items,
        text: lines(items.map((item) => `${item.id}  ${item.name}`)),
      };
    },
  },
  {
    path: ['tasks', 'get'],
    args: '<id>',
    summary: "Print a task's fields and description",
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [id] }) {
      const task = macro.tasks.byId(id);
      const [name, markdown, properties] = await Promise.all([
        task.name(),
        task.content(),
        task.properties(),
      ]);
      const fields = properties.flatMap((property) => {
        const value = formatValue(property);
        return value === undefined || value === ''
          ? []
          : [`${property.definition.display_name}: ${value}`];
      });
      return {
        json: { id, name, markdown, properties },
        text: lines([name, ...fields, '', markdown]),
      };
    },
  },
  {
    path: ['tasks', 'create'],
    args: `--title <title> [--project <id|name>] ${fieldArgs} [--body <file|->]`,
    summary: 'Create a task and print its id',
    options: {
      ...fieldOptions,
      title: { type: 'string' },
      project: { type: 'string' },
      body: { type: 'string' },
    },
    positionals: { min: 0, max: 0 },
    async run(macro, { values }) {
      const title = requiredOption(values, 'title');
      const projectReference = stringOption(values, 'project');
      const body = stringOption(values, 'body');
      const project = projectReference
        ? await resolveProject(macro, projectReference)
        : undefined;
      const markdown = body ? await readSource(body) : undefined;
      const fields = await resolveFields(macro, values);
      const task = await macro.tasks.create({ name: title, markdown, project });
      try {
        await applyFields(macro, task, fields);
      } catch (error) {
        throw new Error(
          `Created task ${task.id}, but setting its fields failed; retry with \`macro tasks update ${task.id}\`.`,
          { cause: error }
        );
      }
      return { json: { id: task.id }, text: `${task.id}\n` };
    },
  },
  {
    path: ['tasks', 'update'],
    args: `<id> [--title <title>] ${fieldArgs}`,
    summary:
      'Change a task (assignees replace the current ones, labels are added)',
    options: { ...fieldOptions, title: { type: 'string' } },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [id], values }) {
      const title = stringOption(values, 'title');
      const fields = await resolveFields(macro, values);
      if (
        !title &&
        !fields.status &&
        !fields.priority &&
        fields.assignees.length === 0 &&
        !fields.tags
      )
        throw new UsageError('Nothing to update; pass at least one field.');
      const task = macro.tasks.byId(id);
      if (title) await task.rename(title);
      await applyFields(macro, task, fields);
      return { json: { id }, text: `Updated ${id}\n` };
    },
  },
  {
    path: ['tasks', 'move'],
    args: '<id> --project <id|name>',
    summary: 'Move a task into a project',
    options: { project: { type: 'string' } },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [id], values }) {
      const project = await resolveProject(
        macro,
        requiredOption(values, 'project')
      );
      await macro.tasks.byId(id).move(project);
      return {
        json: { id, projectId: project.id },
        text: `Moved ${id} to project ${project.id}\n`,
      };
    },
  },
  {
    path: ['tasks', 'comment'],
    args: '<id> <text|->',
    summary: 'Comment on a task',
    positionals: { min: 2, max: 2 },
    async run(macro, { positionals: [id, text] }) {
      const comment = await macro.tasks.byId(id).comment(await readText(text));
      return { json: { id: comment.id, taskId: id }, text: `${comment.id}\n` };
    },
  },
];
