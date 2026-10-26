import { describe, expect, it } from 'vitest';
import { MOBILE_TAB_COUNT, mobileNavLayout, visibleNavItems } from './route-registry';

/**
 * Story 15.1 (AC 2): the mobile tab bar / "Altro" split. Pure registry logic
 * — no React, no services, so no `@/lib/env` chain to mock (see CLAUDE.md's
 * eager-env note).
 */
describe('mobileNavLayout', () => {
  it('puts every item in the tab bar when a role sees at most 5 (no "Altro")', () => {
    for (const roles of [['INSTRUCTOR'], ['PILOT'], ['STUDENT']] as const) {
      const items = visibleNavItems(roles);
      expect(items.length).toBeLessThanOrEqual(MOBILE_TAB_COUNT);

      const layout = mobileNavLayout(items);
      expect(layout.tabs.map((item) => item.id)).toEqual(items.map((item) => item.id));
      expect(layout.more).toEqual([]);
    }
  });

  it("gives ADMIN the template's own 4 slots plus the remaining sections behind 'Altro', in registry order", () => {
    const items = visibleNavItems(['ADMIN']);
    expect(items.length).toBeGreaterThan(MOBILE_TAB_COUNT);

    const layout = mobileNavLayout(items);
    expect(layout.tabs.map((item) => item.id)).toEqual(['overview', 'schedule', 'ppr', 'fleet']);
    expect(layout.more.map((item) => item.id)).toEqual(['visiting', 'pilots', 'instructors', 'scadenze', 'logbook', 'billing', 'reports', 'settings']);
    // Every visible item stays reachable: 4 tabs + the sheet cover them all.
    expect(layout.tabs.length + layout.more.length).toBe(items.length);
  });

  it('keeps the filtering the caller already did (an instructor without an active profile loses "I miei compensi")', () => {
    // `dashboard/layout.tsx` drops that ONE item before calling in (story 14.7, AC 4).
    const filtered = visibleNavItems(['INSTRUCTOR']).filter((item) => item.id !== 'myCompensation');

    const layout = mobileNavLayout(filtered);
    expect(layout.tabs.map((item) => item.id)).toEqual(['overview', 'schedule', 'scadenze', 'logbook']);
    expect(layout.more).toEqual([]);
  });

  /**
   * Review 15.1 F1 (measured defect): this actor sees 6 items, and before the
   * fix only two of them carried a slot — the bar came out with 2 tabs and
   * four sections buried. PO ratification R-15.1-a (2026-07-30): the two
   * self-service pages take the free columns, ahead of Scadenze/Registro voli.
   */
  it('gives an instructor who also flies as a pilot a FULL bar, self-service pages first (F1, R-15.1-a)', () => {
    const items = visibleNavItems(['INSTRUCTOR', 'PILOT']);
    expect(items.length).toBe(MOBILE_TAB_COUNT + 1);

    const layout = mobileNavLayout(items);
    expect(layout.tabs.map((item) => item.id)).toEqual(['overview', 'schedule', 'myAccount', 'myCompensation']);
    expect(layout.more.map((item) => item.id)).toEqual(['scadenze', 'logbook']);
  });

  it('never returns a short bar: unslotted items fill the free columns in registry order (F1, class guard)', () => {
    // A hypothetical future role list — no actor sees exactly this today; the
    // point is that widening a `roles` array (as story 12.12 did) can never
    // again leave the bar with empty columns while items sit behind "Altro".
    const items = visibleNavItems(['ADMIN']).filter((item) => !['ppr', 'fleet'].includes(item.id));
    const slotted = items.filter((item) => item.mobileSlot !== undefined);
    expect(slotted.length).toBeLessThan(MOBILE_TAB_COUNT - 1);

    const layout = mobileNavLayout(items);
    expect(layout.tabs).toHaveLength(MOBILE_TAB_COUNT - 1);
    expect(layout.tabs.map((item) => item.id)).toEqual(['overview', 'schedule', 'visiting', 'pilots']);
    // Still a partition: nothing duplicated, nothing lost.
    expect(layout.tabs.length + layout.more.length).toBe(items.length);
    expect(layout.more.some((item) => layout.tabs.includes(item))).toBe(false);
  });
});
