/**
 * The document model stores no trailing newline, and files and piped text end
 * with one; drop exactly one so `docs get` → `docs put` is byte-stable.
 */
export function withoutTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/** The contents of a file, or of standard input for `-`. */
export async function readSource(source: string): Promise<string> {
  const text =
    source === '-' ? await Bun.stdin.text() : await Bun.file(source).text();
  return withoutTrailingNewline(text);
}

/** A literal text argument, or standard input for `-`. */
export async function readText(argument: string): Promise<string> {
  return argument === '-'
    ? withoutTrailingNewline(await Bun.stdin.text())
    : argument;
}
