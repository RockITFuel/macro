import { type Command, lines, stringOption } from '../command';
import { documentItems, resolveDocument, resolveProject } from '../resolve';
import { getMarkdown, putMarkdown } from './docs';

/** Skills are markdown documents with the `skill` sub-type. */
export const skillsCommands: Command[] = [
  {
    path: ['skills', 'list'],
    args: '[--project <id|name>]',
    summary: 'List skill documents',
    options: { project: { type: 'string' } },
    positionals: { min: 0, max: 0 },
    async run(macro, { values }) {
      const reference = stringOption(values, 'project');
      const project = reference
        ? await resolveProject(macro, reference)
        : undefined;
      const items = await documentItems(macro, { project, subType: 'skill' });
      return {
        json: items,
        text: lines(items.map((item) => `${item.id}  ${item.name}`)),
      };
    },
  },
  {
    path: ['skills', 'get'],
    args: '<id|name>',
    summary: 'Print a skill as markdown',
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [reference] }) {
      return getMarkdown(
        await resolveDocument(macro, reference, { subType: 'skill' })
      );
    },
  },
  {
    path: ['skills', 'put'],
    args: '<id|name> <file|-> [--base <versionId>]',
    summary: "Replace a skill's markdown",
    options: { base: { type: 'string' } },
    positionals: { min: 2, max: 2 },
    async run(macro, { positionals: [reference, source], values }) {
      return putMarkdown(
        await resolveDocument(macro, reference, { subType: 'skill' }),
        source,
        stringOption(values, 'base')
      );
    },
  },
];
