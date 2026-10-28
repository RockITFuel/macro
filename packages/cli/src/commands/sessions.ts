import type { FoldedAgentSessionLog, Macro } from '@macro-inc/sdk';
import {
  type Command,
  HttpError,
  lines,
  stringOption,
  UsageError,
} from '../command';
import { readText } from '../input';
import { resolveAgentId } from '../resolve';

type FoldedMessage = FoldedAgentSessionLog['messages'][number];

/** How `sessions wait` ended. */
type WaitResult =
  | { state: 'idle' | 'waiting' | 'disconnected'; last?: FoldedMessage }
  | { state: 'timeout' };

const POLL_INTERVAL_MS = 2000;

/**
 * Wait until the session's agent has finished its turn (`idle`), needs an
 * answer from a person (`waiting`), or the session disconnected.
 *
 * Polls because the SDK has no `session.wait` yet; replace this body with
 * `session.wait({ timeoutMs })` once it exists.
 */
async function waitForSession(
  macro: Macro,
  id: string,
  timeoutMs: number
): Promise<WaitResult> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // A fresh handle per poll: handles cache their detail record.
    const session = macro.agentSessions.byId(id);
    const [status, log, queue] = await Promise.all([
      session.status(),
      session.foldedLog(),
      session.queue(),
    ]);
    const last = log.messages.at(-1);
    if (status.kind === 'disconnected') return { state: 'disconnected', last };
    if (last?.author.kind === 'agent' && queue.length === 0) {
      if (last.stop) return { state: 'idle', last };
      if (last.phase === 'waiting') return { state: 'waiting', last };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { state: 'timeout' };
    await Bun.sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
}

function messageText(message: FoldedMessage): string {
  return message.parts
    .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
    .join('\n');
}

export const sessionsCommands: Command[] = [
  {
    path: ['sessions', 'start'],
    args: '<agent id|name> <prompt|->',
    summary: 'Start an agent session with a first prompt and print its id',
    positionals: { min: 2, max: 2 },
    async run(macro, { positionals: [agent, prompt] }) {
      const botId = await resolveAgentId(macro, agent);
      // AgentSession.createManaged cannot choose the agent yet, so this calls
      // the generated client it wraps; switch once the SDK takes a bot.
      const result = await macro._client.agentHarness.createAgentSession({
        body: { botId, prompt: await readText(prompt) },
      });
      if (result.error !== undefined)
        throw new HttpError(result.response?.status ?? 0, result.error);
      const { session } = result.data;
      return { json: session, text: `${session.id}\n` };
    },
  },
  {
    path: ['sessions', 'send'],
    args: '<session id> <text|->',
    summary: 'Send a prompt to an agent session',
    positionals: { min: 2, max: 2 },
    async run(macro, { positionals: [id, text] }) {
      const response = await macro.agentSessions
        .byId(id)
        .prompt(await readText(text));
      return {
        json: response,
        text: `${response.actionId} ${response.status}\n`,
      };
    },
  },
  {
    path: ['sessions', 'wait'],
    args: '<session id> [--timeout <seconds>]',
    summary:
      'Wait until the agent finishes its turn (default timeout 600 s; exit 4 on timeout)',
    options: { timeout: { type: 'string' } },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [id], values }) {
      const seconds = Number(stringOption(values, 'timeout') ?? '600');
      if (!Number.isFinite(seconds) || seconds < 0)
        throw new UsageError('--timeout takes a number of seconds');
      const result = await waitForSession(macro, id, seconds * 1000);
      if (result.state === 'timeout') throw new WaitTimeoutError(id, seconds);
      return {
        json: result,
        text: lines([
          result.state,
          ...(result.last ? [messageText(result.last)] : []),
        ]),
      };
    },
  },
  {
    path: ['sessions', 'read'],
    args: '<session id> [--limit <n>]',
    summary: 'Print the latest conversation messages (default 10)',
    options: { limit: { type: 'string' } },
    positionals: { min: 1, max: 1 },
    async run(macro, { positionals: [id], values }) {
      const limit = Number(stringOption(values, 'limit') ?? '10');
      if (!Number.isInteger(limit) || limit < 1)
        throw new UsageError('--limit takes a positive whole number');
      const { messages } = await macro.agentSessions.byId(id).foldedLog();
      const latest = messages.slice(-limit);
      return {
        json: latest,
        text: latest
          .map(
            (message) =>
              `## ${message.author.kind}\n\n${messageText(message)}\n`
          )
          .join('\n'),
      };
    },
  },
];

/** `sessions wait` ran out of time; exits with code 4. */
export class WaitTimeoutError extends Error {
  constructor(id: string, seconds: number) {
    super(`Session ${id} was still working after ${seconds} s.`);
  }
}
