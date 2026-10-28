import {
  type Command,
  lines,
  type Output,
  requiredOption,
  stringOption,
} from '../command';
import { readSource } from '../input';
import {
  type Document,
  documentItems,
  resolveDocument,
  resolveProject,
} from '../resolve';

/** Print a document's markdown with the trailing newline the model omits. */
export async function getMarkdown(document: Document): Promise<Output> {
  const [{ markdown, versionId }, name] = await Promise.all([
    document.markdown(),
    document.name(),
  ]);
  return {
    json: { id: document.id, name, markdown, versionId },
    text: `${markdown}\n`,
  };
}

/** Replace a document's markdown with a file or standard input. */
export async function putMarkdown(
  document: Document,
  source: string,
  baseVersionId: string | undefined
): Promise<Output> {
  const markdown = await readSource(source);
  const result = await document.setMarkdown(markdown, { baseVersionId });
  return {
    json: { id: document.id, ...result },
    text: `${result.changed ? 'Updated' : 'Unchanged'} ${document.id} (version ${result.versionId})\n`,
  };
}

export const docsCommands: Command[] = [
  {
    path: ['docs', 'get'],
    args: '<id|name> [--project <id|name>]',
    summary: 'Print a document as markdown',
    options: { project: { type: 'string' } },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [reference], values }) {
      const document = await resolveDocument(macro, reference, {
        project: stringOption(values, 'project'),
      });
      return getMarkdown(document);
    },
  },
  {
    path: ['docs', 'put'],
    args: '<id> <file|-> [--base <versionId>]',
    summary: "Replace a document's markdown; --base refuses stale writes",
    options: { base: { type: 'string' } },
    positionals: { min: 2, max: 2 },
    async run(macro, { positionals: [id, source], values }) {
      return putMarkdown(
        macro.documents.byId(id),
        source,
        stringOption(values, 'base')
      );
    },
  },
  {
    path: ['docs', 'create'],
    args: '--name <name> --project <id|name> [--skill] <file|->',
    summary: 'Create a markdown document (or a skill) and print its id',
    options: {
      name: { type: 'string' },
      project: { type: 'string' },
      skill: { type: 'boolean' },
    },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [source], values }) {
      const name = requiredOption(values, 'name');
      const project = await resolveProject(
        macro,
        requiredOption(values, 'project')
      );
      const markdown = await readSource(source);
      const options = { name, markdown, project };
      const document = values.skill
        ? await macro.documents.createSkill(options)
        : await macro.documents.create(options);
      return { json: { id: document.id }, text: `${document.id}\n` };
    },
  },
  {
    path: ['docs', 'list'],
    args: '--project <id|name>',
    summary: 'List the documents in a project',
    options: { project: { type: 'string' } },
    positionals: { min: 0, max: 0 },
    async run(macro, { values }) {
      const project = await resolveProject(
        macro,
        requiredOption(values, 'project')
      );
      const items = await documentItems(macro, { project });
      return {
        json: items,
        text: lines(
          items.map(
            (item) =>
              `${item.id}  ${item.subType ?? item.fileType ?? ''}  ${item.name}`
          )
        ),
      };
    },
  },
];
