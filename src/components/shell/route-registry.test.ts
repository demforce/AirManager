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
});
