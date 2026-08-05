import { describe, expect, it } from 'vitest';
import { RANKED_MOBILE_LIMIT, rankedCap } from './mobile-reports';

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
