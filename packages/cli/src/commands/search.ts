import { type Command, lines, stringOption, UsageError } from '../command';
import type { Document } from '../resolve';

export const searchCommands: Command[] = [
  {
    path: ['search'],
    args: '<query> [--limit <n>]',
    summary: 'Search documents and tasks by name and content (default 20)',
    options: { limit: { type: 'string' } },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [query], values }) {
      const limit = Number(stringOption(values, 'limit') ?? '20');
      if (!Number.isInteger(limit) || limit < 1)
        throw new UsageError('--limit takes a positive whole number');
      const documents: Document[] = [];
      for await (const document of macro.documents.search(query, {
        pageSize: limit,
      })) {
        documents.push(document);
        if (documents.length === limit) break;
      }
      const names = await Promise.all(
        documents.map((document) => document.name())
      );
      return {
        json: documents,
        text: lines(
          documents.map((document, index) => `${document.id}  ${names[index]}`)
        ),
      };
    },
  },
];
