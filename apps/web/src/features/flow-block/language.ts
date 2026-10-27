/** Fenced code languages that render as an interactive flowchart. */
export const FLOW_LANGUAGES = ['mermaid', 'flow'] as const;

export type FlowLanguage = (typeof FLOW_LANGUAGES)[number];

/** Case-insensitive: the fence's info string is kept as written. */
export function flowLanguage(
  language: string | null | undefined
): FlowLanguage | null {
  const lower = language?.trim().toLowerCase();
  return FLOW_LANGUAGES.find((candidate) => candidate === lower) ?? null;
}

export function isFlowLanguage(language: string | null | undefined): boolean {
  return flowLanguage(language) !== null;
}
