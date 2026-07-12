/**
 * Joins conditional class-name fragments. The project's only className-merge
 * helper (story 12.1 Dev Notes: no new dependency for these stateless
 * primitives — no clsx/tailwind-merge).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
