/**
 * Zod issues → `fieldErrors` keyed by the FULL dotted path (story 19.8,
 * AD-1). `z.flattenError` (`handler.ts#validationErrorResponse`) groups by
 * the FIRST key only, which is right for a flat body but says `smtp` instead
 * of `smtp.host` for a body of nested blocks: here an issue at
 * `['expiryTypes', 'create', 0, 'name']` lands under
 * `'expiryTypes.create.0.name'`, and one on the root object under `''`.
 */
export function flattenIssuesByPath(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}
