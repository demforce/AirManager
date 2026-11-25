/** `%`, `_` and `\` matched literally by `ILIKE … ESCAPE '\'` — the parity with Prisma's `contains`, which escaped them on its own. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
