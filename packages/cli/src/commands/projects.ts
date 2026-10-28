import { type Command, lines } from '../command';
import { projectItems } from '../resolve';

export const projectsCommands: Command[] = [
  {
    path: ['projects', 'list'],
    args: '',
    summary: 'List projects',
    positionals: { min: 0, max: 0 },
    async run(macro) {
      const items = await projectItems(macro);
      return {
        json: items,
        text: lines(items.map((item) => `${item.id}  ${item.name}`)),
      };
    },
  },
];
