import { describe, expect, it } from 'vitest';
import { flattenIssuesByPath } from './issues-by-path';

describe('flattenIssuesByPath (story 19.8, AD-1)', () => {
  it('keys a nested block issue by its full dotted path, not by the first key', () => {
    expect(flattenIssuesByPath([{ path: ['smtp', 'host'], message: 'bad host' }])).toEqual({ 'smtp.host': ['bad host'] });
  });

  it('keeps array indexes in the path', () => {
    expect(flattenIssuesByPath([{ path: ['expiryTypes', 'create', 0, 'name'], message: 'too short' }])).toEqual({ 'expiryTypes.create.0.name': ['too short'] });
  });

  it('puts a root issue under the empty key', () => {
    expect(flattenIssuesByPath([{ path: [], message: 'At least one block must be provided.' }])).toEqual({ '': ['At least one block must be provided.'] });
  });

  it('groups several issues on the same path', () => {
    expect(
      flattenIssuesByPath([
        { path: ['club', 'contactEmail'], message: 'a' },
        { path: ['club', 'contactEmail'], message: 'b' },
        { path: ['scheduling', 'closeTime'], message: 'c' },
      ]),
    ).toEqual({ 'club.contactEmail': ['a', 'b'], 'scheduling.closeTime': ['c'] });
  });
});
