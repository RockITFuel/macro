import type { ParseArgsConfig } from 'node:util';
import type { Macro } from '@macro-inc/sdk';

export type Options = NonNullable<ParseArgsConfig['options']>;

export type Values = Record<
  string,
  string | boolean | (string | boolean)[] | undefined
>;

/** What a command printed: `json` with `--json`, `text` otherwise. */
export interface Output {
  json: unknown;
  /** Human-readable output, ending in a newline unless empty. */
  text: string;
}

export interface Command {
  /** Words that select the command, e.g. `['docs', 'get']`. */
  path: string[];
  /** Arguments and options after the path, for help text. */
  args: string;
  summary: string;
  options?: Options;
  /** Number of positional arguments accepted. */
  positionals: { min: number; max: number };
  run(
    macro: Macro,
    input: { positionals: string[]; values: Values }
  ): Promise<Output>;
}

/** A mistake in the command line; exits with code 2. */
export class UsageError extends Error {}

/** A non-2xx response from a generated client call the SDK does not wrap. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown
  ) {
    super(`HTTP ${status}`);
  }
}

export function stringOption(values: Values, name: string): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

export function requiredOption(values: Values, name: string): string {
  const value = stringOption(values, name);
  if (value === undefined) throw new UsageError(`--${name} is required`);
  return value;
}

export function listOption(values: Values, name: string): string[] {
  const value = values[name];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

/** Text output: one line per entry, each ending in a newline. */
export function lines(entries: string[]): string {
  return entries.map((entry) => `${entry}\n`).join('');
}
