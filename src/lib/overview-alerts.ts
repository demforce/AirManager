/**
 * "Avvisi" feed of the mobile Panoramica (story 15.3, AC 4, ratifica
 * R-15.3-e) — PURE merge + urgency ordering + cap over the three sources the
 * app really has:
 *
 * 1. **scadenze** — `listAllExpiries(actor, {window:'60'})`, already fetched by
 *    the Panoramica for `ScadenzeWidget` (no new query);
 * 2. **saldi negativi** — `listNegativeBalances(actor)` (`finance.manage`), the
 *    ONE query ratifica R-15.3-e accepted as new on the home;
 * 3. **PPR in attesa** — already counted for the KPI and the sub-line.
 *
 * It lives here, pure, because the ORDER and the CAP are the two things an
 * e2e cannot prove: fabricating 40 negative balances and a dozen overdue
 * scadenze inside a spec would poison every other spec's counts on a shared
 * DB (lesson 12.11 F1). So the ordering and the truncation are unit-tested
 * here, and the e2e only proves that a real fixture reaches the card.
 *
 * Ratified order (R-15.3-e), read as ranks: scaduto -> saldo negativo -> in
 * scadenza <=7g -> PPR in attesa. The two remaining scadenza tiers (<=30g,
 * <=60g) rank BELOW the PPR line rather than being dropped: on mobile this
 * feed REPLACES `ScadenzeWidget` (ratifica R-15.3-d), whose default window is
 * 30 days, so dropping them would make the phone show strictly less than the
 * desktop — the opposite of the epic's parity rule. The cap then hides them
 * first, which is exactly the intent of the ratified order.
 *
 * No i18n, no formatting, no `Date`: the caller renders. `tierOf` is imported
 * rather than re-derived (single implementation of the day boundaries).
 */
import { tierOf } from './expiry-status';

/** Every voice is verifiable at its source (AC 4): the kind says which source produced it. */
export type OverviewAlertKind = 'expiry' | 'negativeBalance' | 'pprPending';

/** Reuses `.list-icon`'s calibrated tones (13.9) — no new colour is introduced for this feed. */
export type OverviewAlertTone = 'red' | 'amber';

export type OverviewAlertExpiry = {
  id: string;
  personId: string;
  personFirstName: string;
  personLastName: string;
  typeName: string;
  /** Calendar days to `expiresAt`; negative = already expired (`ExpiryDashboardItemDto.daysUntil`). */
  daysUntil: number;
};

export type OverviewAlertNegativeBalance = {
  personId: string;
  firstName: string;
  lastName: string;
  /** Always < 0 (`listNegativeBalances` filters on the aggregate). */
  balanceCents: number;
};

export type OverviewAlertsInput = {
  expiries: readonly OverviewAlertExpiry[];
  negativeBalances: readonly OverviewAlertNegativeBalance[];
  pprPendingCount: number;
};

export type OverviewAlert =
  | { key: string; kind: 'expiry'; tone: OverviewAlertTone; href: string; expiry: OverviewAlertExpiry }
  | { key: string; kind: 'negativeBalance'; tone: 'red'; href: string; balance: OverviewAlertNegativeBalance }
  | { key: string; kind: 'pprPending'; tone: 'amber'; href: string; count: number };

export type OverviewAlerts = {
  /** At most `limit` voices, most urgent first. */
  items: OverviewAlert[];
  /** How many voices the cap hid (0 when nothing was truncated). */
  hiddenCount: number;
  /**
   * Destination of the "Vedi tutte" row, shown only when `hiddenCount > 0`:
   * the page of competence of the most urgent voice the reader is NOT seeing
   * (R-15.3-e: "verso la pagina di competenza quando tronca"). `null` when
   * nothing is hidden.
   */
  moreHref: string | null;
};

/** Ratifica R-15.3-e: five voices, then "Vedi tutte". */
export const OVERVIEW_ALERTS_LIMIT = 5;

const EXPIRIES_HREF = '/dashboard/expiries';
const PPR_HREF = '/dashboard/ppr';
/** Where the negative-balance LIST lives (`listNegativeBalances`' only other caller today). A single voice deep-links to its person instead. */
const BALANCES_HREF = '/dashboard/billing';

const DOMAIN_HREF: Record<OverviewAlertKind, string> = {
  expiry: EXPIRIES_HREF,
  negativeBalance: BALANCES_HREF,
  pprPending: PPR_HREF,
};

/** Lower = more urgent. See the ratified order in the module doc-comment. */
function rankOf(alert: OverviewAlert): number {
  switch (alert.kind) {
    case 'expiry': {
      const tier = tierOf(alert.expiry.daysUntil);
      if (tier === 0) return 0;
      if (tier === 1) return 2;
      if (tier === 2) return 4;
      return 5;
    }
    case 'negativeBalance':
      return 1;
    case 'pprPending':
      return 3;
  }
}

/** Tiebreak INSIDE a rank; lower first. Most overdue scadenza / deepest red first. */
function weightOf(alert: OverviewAlert): number {
  switch (alert.kind) {
    case 'expiry':
      return alert.expiry.daysUntil;
    case 'negativeBalance':
      return alert.balance.balanceCents;
    case 'pprPending':
      return 0;
  }
}

export function buildOverviewAlerts(input: OverviewAlertsInput, limit: number = OVERVIEW_ALERTS_LIMIT): OverviewAlerts {
  const all: OverviewAlert[] = [];

  for (const expiry of input.expiries) {
    // Beyond 60 days a scadenza is `ok`, not an avviso — the 60-day fetch
    // window should not contain one, this is the defensive half of the tier.
    if (tierOf(expiry.daysUntil) === 4) continue;
    all.push({
      key: `expiry:${expiry.id}`,
      kind: 'expiry',
      tone: tierOf(expiry.daysUntil) <= 1 ? 'red' : 'amber',
      href: EXPIRIES_HREF,
      expiry,
    });
  }

  for (const balance of input.negativeBalances) {
    all.push({
      key: `balance:${balance.personId}`,
      kind: 'negativeBalance',
      tone: 'red',
      href: `/dashboard/people/${balance.personId}`,
      balance,
    });
  }

  if (input.pprPendingCount > 0) {
    all.push({ key: 'ppr:pending', kind: 'pprPending', tone: 'amber', href: PPR_HREF, count: input.pprPendingCount });
  }

  // `key` as the final tiebreak: two scadenze of the same person on the same
  // day would otherwise depend on `Array.prototype.sort`'s stability alone.
  const ordered = all.sort((a, b) => rankOf(a) - rankOf(b) || weightOf(a) - weightOf(b) || a.key.localeCompare(b.key));

  const items = ordered.slice(0, Math.max(0, limit));
  const hidden = ordered.slice(items.length);

  return {
    items,
    hiddenCount: hidden.length,
    moreHref: hidden.length > 0 ? DOMAIN_HREF[hidden[0]!.kind] : null,
  };
}
