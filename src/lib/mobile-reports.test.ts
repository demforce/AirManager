import { describe, expect, it } from 'vitest';
import { RANKED_MOBILE_LIMIT, rankedCap, rankedTopIndexes } from './mobile-reports';

describe('rankedCap', () => {
  it('caps a long list at the limit and says exactly how many are left out', () => {
    expect(rankedCap(145, 8)).toEqual({ visibleCount: 8, hiddenCount: 137, capped: true });
  });

  it('does NOT cap a list that fits — a "Mostra tutte" that reveals nothing would be a lie', () => {
    expect(rankedCap(3, 8)).toEqual({ visibleCount: 3, hiddenCount: 0, capped: false });
    expect(rankedCap(0, 8)).toEqual({ visibleCount: 0, hiddenCount: 0, capped: false });
  });

  it('does not cap at the boundary either: total === limit hides nothing', () => {
    expect(rankedCap(8, 8)).toEqual({ visibleCount: 8, hiddenCount: 0, capped: false });
    expect(rankedCap(9, 8)).toEqual({ visibleCount: 8, hiddenCount: 1, capped: true });
  });

  it('a non-positive limit caps nothing — showing zero rows is never better than showing the list', () => {
    expect(rankedCap(20, 0)).toEqual({ visibleCount: 20, hiddenCount: 0, capped: false });
    expect(rankedCap(20, -1)).toEqual({ visibleCount: 20, hiddenCount: 0, capped: false });
  });

  it('defaults to the story\'s measured limit', () => {
    expect(RANKED_MOBILE_LIMIT).toBe(8);
    expect(rankedCap(145)).toEqual({ visibleCount: 8, hiddenCount: 137, capped: true });
  });
});

describe('rankedTopIndexes', () => {
  it('keeps the best rows BY THE METRIC, not the first ones in render order (review MAJOR-1)', () => {
    // The defect, in miniature: the list is alphabetical, the flown aircraft is last.
    expect(rankedTopIndexes([0, 0, 0, 120], 2)).toEqual(new Set([3, 0]));
  });

  it('returns ranks, never an order — the caller keeps rendering in its own order', () => {
    const top = rankedTopIndexes([5, 40, 10, 30], 2);
    expect([...top].sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it('breaks ties by position, so the same rows win every render', () => {
    expect(rankedTopIndexes([0, 0, 0, 0], 2)).toEqual(new Set([0, 1]));
    expect(rankedTopIndexes([7, 7, 9, 7], 2)).toEqual(new Set([2, 0]));
  });

  it('keeps everything when there is nothing to hide (same boundaries as `rankedCap`)', () => {
    expect(rankedTopIndexes([3, 1, 2], 3)).toEqual(new Set([0, 1, 2]));
    expect(rankedTopIndexes([3, 1, 2], 0)).toEqual(new Set([0, 1, 2]));
    expect(rankedTopIndexes([], 8)).toEqual(new Set());
  });

  it('defaults to the same limit the cap is written from', () => {
    expect(rankedTopIndexes(Array.from({ length: 20 }, (_, i) => i)).size).toBe(RANKED_MOBILE_LIMIT);
    expect(rankedTopIndexes(Array.from({ length: 20 }, (_, i) => i))).toEqual(new Set([19, 18, 17, 16, 15, 14, 13, 12]));
  });
});
