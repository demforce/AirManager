import { z } from './zod-with-openapi';

// Reject controls before normalization, including CR/LF at either end.
export const singleMailbox = z.string().max(254).refine(value => !/\p{Cc}/u.test(value))
  .transform(value => value.trim().toLowerCase()).pipe(z.email());

export function formMailbox(form: FormData): string | null {
  const entries = Array.from(form.entries());
  if (entries.length !== 1 || entries[0][0] !== 'email') return null;
  const result = singleMailbox.safeParse(entries[0][1]);
  return result.success ? result.data : null;
}
