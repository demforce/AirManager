'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Cross-panel refresh signal for the scheda persona (story TD-1, AC 8):
 * selling a package (`PackagesPanel`) must make the sibling `AccountPanel`'s
 * movements/balance preview update WITHOUT a full page reload, even though
 * both panels are independent client components mounted separately by the
 * SAME server component (`people/[id]/page.tsx`) — neither can see the
 * other's state directly. `version` is a plain counter `bump()` increments;
 * `AccountPanel` adds it to its fetch effect's dependency array, so bumping
 * it re-runs that effect and re-fetches the overview.
 *
 * Default context is a NO-OP (`version: 0`, `bump` a function that does
 * nothing) — deliberately so this hook works with no throw when a panel is
 * used OUTSIDE this provider (e.g. `PackagesPanel` read-only on the account
 * statement page, `AccountPanel` on any future surface that doesn't need
 * cross-panel refresh): those call sites simply never observe a version
 * change, which is exactly "no-op" behavior, not an error.
 */
const AccountRefreshContext = createContext<{ version: number; bump: () => void }>({
  version: 0,
  bump: () => {},
});

/**
 * Wraps the scheda persona's `AccountPanel` + `PackagesPanel` sections (both
 * SERVER-rendered children — a client component may receive RSC children as
 * `ReactNode` without turning them into client components themselves, so
 * this provider adds no client-boundary cost to the rest of the page).
 */
export function AccountRefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const value = useMemo(() => ({ version, bump: () => setVersion((current) => current + 1) }), [version]);

  return <AccountRefreshContext.Provider value={value}>{children}</AccountRefreshContext.Provider>;
}

/** Reads the current refresh version and the `bump()` trigger — see `AccountRefreshProvider`'s doc-comment for the no-op-without-a-provider contract. */
export function useAccountRefresh(): { version: number; bump: () => void } {
  return useContext(AccountRefreshContext);
}
