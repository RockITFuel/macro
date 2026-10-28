import { type Command, lines } from '../command';
import { readText } from '../input';
import { resolveChannel } from '../resolve';

export const channelsCommands: Command[] = [
  {
    path: ['channels', 'list'],
    args: '',
    summary: 'List the channels you are a member of',
    positionals: { min: 0, max: 0 },
    async run(macro) {
      const channels = await macro.channels.list();
      const rows = await Promise.all(
        channels.map(async (channel) => {
          const [name, type] = await Promise.all([
            channel.name(),
            channel.type(),
          ]);
          return { channel, name, type };
        })
      );
      return {
        json: channels,
        text: lines(
          rows.map(({ channel, name, type }) =>
            `${channel.id}  ${type}  ${name ?? ''}`.trimEnd()
          )
        ),
      };
    },
  },
  {
    path: ['channels', 'post'],
    args: '<channel id|name> <text|->',
    summary: 'Post a message to a channel',
    positionals: { min: 2, max: 2 },
    async run(macro, { positionals: [reference, text] }) {
      const channel = await resolveChannel(macro, reference);
      const message = await channel.send(await readText(text));
      return {
        json: { id: message.id, channelId: channel.id },
        text: `${message.id}\n`,
      };
    },
  },
];
