import type { Result } from 'neverthrow';
import { match } from 'ts-pattern';
import type { FlowLanguage } from '../language';
import type { FlowGraph, FlowParseError } from './graph';
import { parseFlow } from './parse-flow';
import { parseMermaid } from './parse-mermaid';

export function parseFlowSource(
  language: FlowLanguage,
  source: string
): Result<FlowGraph, FlowParseError> {
  return match(language)
    .with('mermaid', () => parseMermaid(source))
    .with('flow', () => parseFlow(source))
    .exhaustive();
}

export function describeParseError(error: FlowParseError): string {
  return match(error)
    .with({ kind: 'empty' }, () => 'This flowchart is empty.')
    .with({ kind: 'too-large' }, (e) => e.message)
    .with({ kind: 'syntax' }, (e) => `Line ${e.line}: ${e.message}`)
    .exhaustive();
}
