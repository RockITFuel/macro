#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { type Command, UsageError } from './command';
import { channelsCommands } from './commands/channels';
import { docsCommands } from './commands/docs';
import { projectsCommands } from './commands/projects';
import { searchCommands } from './commands/search';
import { sessionsCommands, WaitTimeoutError } from './commands/sessions';
import { skillsCommands } from './commands/skills';
import { tasksCommands } from './commands/tasks';
import { createMacro } from './macro';

const commands: Command[] = [
  ...docsCommands,
  ...skillsCommands,
  ...projectsCommands,
  ...tasksCommands,
  ...channelsCommands,
  ...sessionsCommands,
  ...searchCommands,
];

const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_CONFLICT = 3;
const EXIT_TIMEOUT = 4;

const globalHelp = `Options for every command:
  --json        Print the result objects as JSON instead of text
  -h, --help    Show help

Arguments written <file|-> or <text|-> read standard input for "-".

Environment:
  MACRO_API_KEY    API key (Settings → API Keys) or bearer token
  MACRO_BOT_TOKEN  Bot token, instead of MACRO_API_KEY
  MACRO_BASE_URL   Origin of a self-hosted instance, e.g. https://macro.alphamonitoring.app
                   (default: macro.com)

Exit codes: 0 ok, 1 error, 2 usage error, 3 conflict (HTTP 409), 4 wait timed out.
`;

function usageLine(command: Command): string {
  return `macro ${[...command.path, command.args].join(' ').trim()}`;
}

/** Usages longer than this put their summary on the next line. */
const USAGE_WIDTH = 60;

function commandList(list: Command[]): string {
  const width = Math.min(
    USAGE_WIDTH,
    Math.max(...list.map((command) => usageLine(command).length))
  );
  return list
    .map((command) => {
      const usage = usageLine(command);
      return usage.length > width
        ? `  ${usage}\n  ${' '.repeat(width)}  ${command.summary}\n`
        : `  ${usage.padEnd(width)}  ${command.summary}\n`;
    })
    .join('');
}

function help(list: Command[]): string {
  return `Usage:\n${commandList(list)}\n${globalHelp}`;
}

function describeData(data: unknown): string {
  if (typeof data === 'string') return data;
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
  )
    return data.message;
  return JSON.stringify(data);
}

/** The message and exit code for a failed command. */
function describeError(error: unknown): { message: string; code: number } {
  if (error instanceof UsageError)
    return { message: error.message, code: EXIT_USAGE };
  // parseArgs rejects unknown or malformed options with these codes.
  if (
    error instanceof TypeError &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('ERR_PARSE_ARGS')
  )
    return { message: error.message, code: EXIT_USAGE };
  if (error instanceof WaitTimeoutError)
    return { message: error.message, code: EXIT_TIMEOUT };
  // The SDK's MacroApiError (not exported) and HttpError share this shape.
  if (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    const detail = 'data' in error ? describeData(error.data) : '';
    if (error.status === 409)
      return {
        message: `Conflict (HTTP 409): ${detail || 'the resource changed'}. Read it again and retry against the new version.`,
        code: EXIT_CONFLICT,
      };
    return {
      message: `HTTP ${error.status}${detail ? `: ${detail}` : ''}`,
      code: EXIT_ERROR,
    };
  }
  if (error instanceof Error) {
    const cause =
      error.cause === undefined
        ? ''
        : `\n${describeError(error.cause).message}`;
    return { message: `${error.message}${cause}`, code: EXIT_ERROR };
  }
  return { message: String(error), code: EXIT_ERROR };
}

export async function run(argv: string[]): Promise<number> {
  const [first] = argv;
  if (first === undefined || first === '--help' || first === '-h') {
    (first === undefined ? process.stderr : process.stdout).write(
      help(commands)
    );
    return first === undefined ? EXIT_USAGE : 0;
  }
  const command = commands.find((candidate) =>
    candidate.path.every((word, index) => argv[index] === word)
  );
  if (!command) {
    const group = commands.filter((candidate) => candidate.path[0] === first);
    const wantsHelp = argv.includes('--help') || argv.includes('-h');
    if (group.length > 0 && wantsHelp) {
      process.stdout.write(help(group));
      return 0;
    }
    process.stderr.write(
      group.length > 0
        ? `Unknown ${first} command "${argv[1] ?? ''}".\n\n${help(group)}`
        : `Unknown command "${first}". Run macro --help.\n`
    );
    return EXIT_USAGE;
  }

  try {
    const { values, positionals } = parseArgs({
      args: argv.slice(command.path.length),
      options: {
        ...command.options,
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    });
    if (values.help) {
      process.stdout.write(help([command]));
      return 0;
    }
    const { min, max } = command.positionals;
    if (positionals.length < min || positionals.length > max)
      throw new UsageError(`Usage: ${usageLine(command)}`);
    const output = await command.run(createMacro(process.env.MACRO_BASE_URL), {
      positionals,
      values,
    });
    process.stdout.write(
      values.json ? `${JSON.stringify(output.json, null, 2)}\n` : output.text
    );
    return 0;
  } catch (error) {
    const { message, code } = describeError(error);
    process.stderr.write(`macro: ${message}\n`);
    return code;
  }
}

if (import.meta.main) process.exitCode = await run(process.argv.slice(2));
