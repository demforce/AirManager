'use client';

/**
 * "Estratto conto" section of the scheda persona (story 13.3, AC 2,
 * R-13.3-a/b) — AirOps rebuild that MERGES the legacy `AccountPanel`
 * (balance + "Registra ricarica", story 3.1) and the legacy
 * `account/page.tsx` + `AccountStatementTable` (full paginated statement +
 * "Registra rettifica", story 3.2/3.3) into ONE embedded card, so both their
 * `DataTable`/`ExportButton`/Tailwind consumers disappear. Movements are
 * server-fetched by the parent page (`listAccountMovements`, `?page=`
 * pagination on the SAME `/people/{id}` URL — no more standalone `/account`
 * route) and passed down as `rows`; this component only owns the
 * interactive bits (top-up/rettifica panels, `router.refresh()` on success —
 * same eventually-consistent-via-refresh pattern the legacy
 * `AccountStatementTable#handleSuccess` already used, not an optimistic
 * local merge). RBAC is unchanged: the parent page's `getAccountOverview`/
 * `listAccountMovements` calls re-check the same permission the legacy pages
 * did (AD-5) — this component only decides what to SHOW.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { DateInput } from '@/components/ui/date-input';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { accountMovementSheetSub, accountMovementSubLine, linkedBadgeText } from '@/lib/mobile-self';
import { formatCents, formatSignedCents, parseCents } from '@/lib/money';
import type { AccountMovementTypeDto } from '@/lib/schemas/accounts';
import { formatDateOnly } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

export type AccountMovementRow = {
  id: string;
  type: AccountMovementTypeDto;
  amountCents: number;
  effectiveDate: string;
  description: string | null;
  actorEmail?: string;
  /** Story 3.3, AC 1: the original movement this ADJUSTMENT corrects — drives the "rettifica di ..." badge. */
  reversalOfId: string | null;
  /** Story 3.3: true when a linked adjustment already exists — hides the row's "Rettifica questo movimento" action. */
  hasReversal: boolean;
};

export type AccountSectionLabels = {
  heading: string;
  balanceLabel: string;
  noAccount: string;
  empty: string;
  pagination: { prev: string; next: string };
  /**
   * `recordedBy`/`actions` are the headers of the two CONDITIONAL columns
   * (`showActor` / `showActions`): optional for the same reason `topUp` and
   * `adjustments` are (review 14.6 F6) — the self-service page renders
   * neither column, so it must not have to ship dead strings across the
   * Server→Client boundary.
   */
  table: { date: string; type: string; description: string; amount: string; recordedBy?: string; actions?: string; noValue: string };
  movementType: { topUp: string; adjustment: string; packagePurchase: string; flightCharge: string; flightChargeReversal: string };
  adjustmentBadge: { ofDate: string; linked: string };
  reversalBadge: { ofDate: string; linked: string };
  /**
   * Strings the PHONE face needs and the desktop one has no place for (story
   * 15.9). `empty` is deliberately NOT `table.empty`: the two trees are both
   * in the DOM at every width, and `table.empty` is read page-level by
   * `accounts-topups.spec.ts`'s own family of guards — a repeated string
   * would give two matches at 1280px (AC 10).
   */
  mobile: { empty: string; openDetail: string; close: string };
  /**
   * Present only when `canManageFinance` is true — the two toggle buttons
   * that open these forms are themselves gated on the SAME prop (story
   * 14.6's self-service "Le mie transazioni" page passes `canManageFinance:
   * false` and omits both: a pilot can never top up their own account,
   * `accounts.service.ts#recordTopUp`'s own doc-comment).
   */
  topUp?: {
    action: string;
    title: string;
    amount: string;
    paymentMethod: string;
    paymentMethods: { cash: string; bankTransfer: string; pos: string };
    effectiveDate: string;
    description: string;
    submit: string;
    cancel: string;
    invalidAmount: string;
    requiredField: string;
    genericError: string;
  };
  /** Same "only when `canManageFinance`" contract as {@link AccountSectionLabels.topUp} above. */
  adjustments?: {
    action: string;
    rowAction: string;
    title: string;
    linkedTo: string;
    amount: string;
    amountHint: string;
    reason: string;
    submit: string;
    cancel: string;
    invalidAmount: string;
    requiredReason: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
};

type AccountSectionProps = {
  personId: string;
  locale: AppLocale;
  moneyLocale: 'it' | 'en';
  hasAccount: boolean;
  balanceCents: number;
  rows: AccountMovementRow[];
  page: number;
  totalPages: number;
  showActor: boolean;
  canManageFinance: boolean;
  /** Absent (staff scheda persona, e.g. an actor with no account at all) omits the menu entirely — `ExportMenu` already treats a missing href that way. */
  exportHref?: string;
  exportPdfHref?: string;
  exportLabels: { label: string; xls: string; pdf: string };
  /**
   * Overrides the statement pagination `Link`'s target pathname (default:
   * the staff-facing scheda persona this component was built for,
   * `/dashboard/people/{personId}`). A plain string, not a function — a
   * Client Component prop crossing the Server→Client boundary must be
   * serializable. Story 14.6's self-service page passes `/dashboard/my-account`
   * here instead — same table/pagination chrome, different URL, no logic
   * duplicated.
   */
  statementBasePath?: string;
  /**
   * Story 15.10 (ratifica R-15.10-h): true on the ONE face whose `.page-head`
   * already names this section — `/dashboard/my-account`, whose `<h1>` is "Le
   * mie transazioni" and whose card title says "Estratto conto" 20px lower.
   * The same name twice cost 101.3px of head above the first movement at
   * 375px, so the title is hidden there at <=640px (and only there, and only
   * at that width: the desktop keeps both).
   *
   * The ratifica names `showActor === false` as the discriminator; MEASURED,
   * it is not one — `showActor` is also false for a pilota opening their OWN
   * scheda persona (`hasPermission(actor, 'people.read')`), where `.page-head`
   * carries the person's name and this title is the section's only name. The
   * intent of the ratifica ("scheda persona INTATTA") is what this prop
   * implements.
   */
  headingRepeatsPageHead?: boolean;
  labels: AccountSectionLabels;
};

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function movementTypeLabel(type: AccountMovementTypeDto, labels: AccountSectionLabels['movementType']): string {
  switch (type) {
    case 'TOP_UP':
      return labels.topUp;
    case 'ADJUSTMENT':
      return labels.adjustment;
    case 'PACKAGE_PURCHASE':
      return labels.packagePurchase;
    case 'FLIGHT_CHARGE':
      return labels.flightCharge;
    case 'FLIGHT_CHARGE_REVERSAL':
      return labels.flightChargeReversal;
    default:
      return type;
  }
}

export function AccountSection({
  personId,
  locale,
  moneyLocale,
  hasAccount,
  balanceCents,
  rows,
  page,
  totalPages,
  showActor,
  canManageFinance,
  exportHref,
  exportPdfHref,
  exportLabels,
  statementBasePath,
  headingRepeatsPageHead = false,
  labels,
}: AccountSectionProps) {
  const router = useRouter();
  const toast = useToast();
  const [topUpOpen, setTopUpOpen] = useState(false);
  // `originalMovement: null` = standalone rettifica opened from the header
  // action. `inSheet` (story 15.9) says WHERE the form is rendered: the
  // desktop's inline riquadro, or the phone sheet's second step — never both,
  // so `account-adjustment-form` stays ONE node at every width.
  const [adjustPanel, setAdjustPanel] = useState<{ originalMovement: AccountMovementRow | null; inSheet: boolean } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  /** Row-detail sheet of the phone face (story 15.9) — by id, so it survives the `router.refresh()` of a write. */
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);

  const rowById = new Map(rows.map((row) => [row.id, row]));
  // AD-3, MEASURED: neither consumer passes a `key`, so this component never
  // remounts — a sheet opened on page 1 would still be open over page 2's
  // rows. It is DERIVED from the rows currently rendered instead of being
  // synchronised: a statement page that no longer contains the row closes the
  // sheet by construction, with no effect to keep in step.
  const sheetRow = sheetRowId === null ? null : (rowById.get(sheetRowId) ?? null);

  /** Referentially stable: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback(() => {
    setSheetRowId(null);
    setAdjustPanel((current) => (current?.inSheet ? null : current));
  }, []);

  /** Opening a row's detail drops a rettifica left hanging in a PREVIOUS sheet (the same non-remount as above); an inline riquadro of the header is not row-bound and stays. */
  function openSheet(rowId: string): void {
    setSheetRowId(rowId);
    setAdjustPanel((current) => (current?.inSheet ? null : current));
  }

  /** The date of the movement this one corrects, but ONLY when that original is on the SAME statement page (`rowById`) — the pagination-dependent behaviour, unchanged. */
  function originalDateLabel(row: AccountMovementRow): string | null {
    const original = row.reversalOfId ? rowById.get(row.reversalOfId) : undefined;
    return original ? formatDateOnly(original.effectiveDate, moneyLocale) : null;
  }

  function adjustmentBadgeText(row: AccountMovementRow): string {
    return linkedBadgeText(labels.adjustmentBadge, originalDateLabel(row));
  }

  function reversalBadgeText(row: AccountMovementRow): string {
    return linkedBadgeText(labels.reversalBadge, originalDateLabel(row));
  }

  /** Story 3.3: the row action is absent on an already-corrected movement and on a package purchase — the same gate on both faces. */
  function rowIsAdjustable(row: AccountMovementRow): boolean {
    return !row.hasReversal && row.type !== 'PACKAGE_PURCHASE';
  }

  /** `--ok`/`--bad` as TEXT are 2.73:1 / 3.96:1 in the light theme (measured): `.stat-tone-*` is the ratified medicine (story 15.8a), and it replaces the inline colour rather than being added next to it — an inline style wins over any class rule. */
  function amountToneClass(amountCents: number): string {
    return amountCents >= 0 ? 'stat-tone-ok' : 'stat-tone-bad';
  }

  /** The sheet's key/value lines: every column the desktop row shows, in the same order, with the description at FULL length (the 0px-wide cell of the phone table). */
  function sheetDetailRows(row: AccountMovementRow): BottomSheetRow[] {
    return [
      { k: labels.table.date, v: formatDateOnly(row.effectiveDate, moneyLocale) },
      { k: labels.table.description, v: row.description ?? labels.table.noValue },
      { k: labels.table.amount, v: <span className={`mono ${amountToneClass(row.amountCents)}`}>{formatSignedCents(row.amountCents, moneyLocale)}</span> },
      ...(showActor && labels.table.recordedBy ? [{ k: labels.table.recordedBy, v: row.actorEmail ?? labels.table.noValue }] : []),
    ];
  }

  function pageHref(targetPage: number) {
    return { pathname: statementBasePath ?? `/dashboard/people/${personId}`, query: { page: targetPage } };
  }

  function handleTopUpSuccess(): void {
    setTopUpOpen(false);
    router.refresh();
  }

  /**
   * The caller decides WHERE the outcome is announced (the 15.8a grammar,
   * R-15.9-j): the inline riquadro announces in its own `role="status"`
   * paragraph, which sits right above it; the phone sheet closes and
   * announces in a toast, because that paragraph is then far above the fold.
   * One channel per action, never two.
   */
  function handleAdjustmentSuccess(fromSheet: boolean): void {
    setAdjustPanel(null);
    if (fromSheet) setSheetRowId(null);
    // `adjustPanel` (hence this callback) can only ever fire from the
    // `AdjustmentForm` rendered below, which itself requires `labels.adjustments`
    // — reachable only when `canManageFinance` is true, so it is always defined here.
    if (labels.adjustments) {
      if (fromSheet) toast.show(labels.adjustments.success, 'ok');
      else setFeedback(labels.adjustments.success);
    }
    router.refresh();
  }

  // Review 14.6 F7: ONE condition for the Actions column — `labels.adjustments`
  // is optional since 14.6, so `canManageFinance` alone could produce a header
  // column whose row cells never render.
  const showActions = canManageFinance && labels.adjustments !== undefined;
  const cols = ['104px', '150px', '1fr', '120px', ...(showActor ? ['170px'] : []), ...(showActions ? ['170px'] : [])].join(' ');

  return (
    <div className="card" data-testid="account-section">
      {/* `account-head`: the phone rules of this story hang off a class this
          card OWNS (never `.card-head`, shared by every console) — lesson 15.3 F1.
          `account-head-self` (story 15.10, R-15.10-h) marks the ONE face whose
          page head already names this section. */}
      <div className={`card-head account-head${headingRepeatsPageHead ? ' account-head-self' : ''}`}>
        <h2 className="card-title">{labels.heading}</h2>
        <div className="spacer" />
        {/* `feedback` only ever carries the rettifica CONFIRMATION
            (`handleAdjustmentSuccess` is its only writer), so the tone is
            green by construction. It is the class, not an inline colour:
            `--ok` as text measures 2.73:1 in the light theme (review 15.9
            MINOR-1) and this paragraph is — by deviazione 1 (R-15.9-j) — the
            phone's ONLY announcement on the inline path. */}
        {feedback ? (
          <p role="status" data-testid="adjustment-feedback" className="card-sub stat-tone-ok">
            {feedback}
          </p>
        ) : null}
        <ExportMenu label={exportLabels.label} xlsLabel={exportLabels.xls} xlsHref={exportHref} pdfLabel={exportLabels.pdf} pdfHref={exportPdfHref} />
        {canManageFinance && labels.topUp ? (
          <button type="button" className="btn" onClick={() => setTopUpOpen((current) => !current)} data-testid="account-topup-toggle">
            {labels.topUp.action}
          </button>
        ) : null}
        {canManageFinance && labels.adjustments ? (
          <button type="button" className="btn" onClick={() => setAdjustPanel({ originalMovement: null, inSheet: false })} data-testid="account-adjustment-toggle">
            {labels.adjustments.action}
          </button>
        ) : null}
      </div>

      <div className="card-body">
        <div style={{ marginBottom: 18 }}>
          <div className="kpi-label">{labels.balanceLabel}</div>
          {/* Same rule as before (rosso SOLO su `hasAccount && balance < 0`), same
              testid, same two strings — only the red comes from `.stat-tone-bad`
              now: `var(--bad)` as text measured 3.96:1 on `--panel` in the light
              theme. The neutral branch drops its inline `var(--ink)` because
              `.kpi-value` already declares exactly that colour. */}
          <div className={`kpi-value${hasAccount && balanceCents < 0 ? ' stat-tone-bad' : ''}`} data-testid="account-balance">
            {hasAccount ? formatCents(balanceCents, moneyLocale) : labels.noAccount}
          </div>
        </div>

        {topUpOpen && labels.topUp ? (
          <div className="account-topup-panel" style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
            <TopUpForm personId={personId} labels={labels.topUp} onCancel={() => setTopUpOpen(false)} onSuccess={handleTopUpSuccess} />
          </div>
        ) : null}

        {/* `!inSheet`: the phone renders the SAME form as the sheet's second
            step instead (AD-6/AD-8 — never a z-50 panel stacked on a z-40
            sheet), so `account-adjustment-form` is ONE node at every width. */}
        {adjustPanel && !adjustPanel.inSheet && labels.adjustments ? (
          <div className="account-adjust-panel" style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
            <AdjustmentForm
              // Remount when the target changes (header ↔ row A ↔ row B):
              // react-hook-form reads defaultValues only at mount.
              key={adjustPanel.originalMovement?.id ?? 'standalone'}
              personId={personId}
              originalMovement={adjustPanel.originalMovement}
              moneyLocale={moneyLocale}
              labels={labels.adjustments}
              onCancel={() => setAdjustPanel(null)}
              onSuccess={() => handleAdjustmentSuccess(false)}
            />
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="fld-label account-desktop-body" data-testid="account-statement-empty" style={{ textTransform: 'none' }}>
            {labels.empty}
          </p>
        ) : (
          <div className="students account-desktop-body">
            <div className="student-row header" data-testid="account-statement-header-row" style={{ gridTemplateColumns: cols }}>
              <div>{labels.table.date}</div>
              <div>{labels.table.type}</div>
              <div>{labels.table.description}</div>
              <div style={{ textAlign: 'right' }}>{labels.table.amount}</div>
              {showActor && labels.table.recordedBy ? <div>{labels.table.recordedBy}</div> : null}
              {showActions ? <div>{labels.table.actions}</div> : null}
            </div>
            {rows.map((row) => (
              <div key={row.id} className="student-row" data-testid="account-movement-row" style={{ gridTemplateColumns: cols }}>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                  {formatDateOnly(row.effectiveDate, moneyLocale)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <span>{movementTypeLabel(row.type, labels.movementType)}</span>
                  {row.type === 'ADJUSTMENT' && row.reversalOfId ? (
                    <span className="badge warn" data-testid="adjustment-badge">
                      {adjustmentBadgeText(row)}
                    </span>
                  ) : null}
                  {row.type === 'FLIGHT_CHARGE_REVERSAL' && row.reversalOfId ? (
                    <span className="badge bad" data-testid="reversal-badge">
                      {reversalBadgeText(row)}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.description ?? labels.table.noValue}
                </div>
                <div className={`mono num ${amountToneClass(row.amountCents)}`} style={{ fontWeight: 600, textAlign: 'right' }}>
                  {formatSignedCents(row.amountCents, moneyLocale)}
                </div>
                {showActor ? (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.actorEmail ?? labels.table.noValue}
                  </div>
                ) : null}
                {showActions && labels.adjustments ? (
                  <div>
                    {rowIsAdjustable(row) ? (
                      <button
                        type="button"
                        className="btn mini"
                        onClick={() => setAdjustPanel({ originalMovement: row, inSheet: false })}
                        data-testid={`account-adjustment-row-${row.id}`}
                      >
                        {labels.adjustments.rowAction}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* --- the phone face of the statement (story 15.9, R3/R4) ------------
            One card per movement in the template's own language (`AirOps
            Mobile` 325-334, already implemented as `.mobile-row` +
            `.mobile-row-amount` by 15.8a): the type on the left, `data ·
            descrizione [· registrato da]` under it, the signed amount on the
            right. The DESCRIPTION is what the desktop grid annihilates to 0px
            here, so the card carries as much of it as fits and the sheet
            carries it whole — the sheet is the cure, not decoration. The tree
            is in the DOM at every width and `display: none` above 640px, so no
            desktop guard ever sees two nodes. */}
        <div className="account-mobile" data-testid="mobile-account-list">
          {rows.length === 0 ? (
            <p className="mobile-card-empty" data-testid="mobile-account-empty">
              {labels.mobile.empty}
            </p>
          ) : (
            rows.map((row) => {
              const typeLabel = movementTypeLabel(row.type, labels.movementType);
              const amountText = formatSignedCents(row.amountCents, moneyLocale);
              const dateLabel = formatDateOnly(row.effectiveDate, moneyLocale);
              return (
                <button
                  key={row.id}
                  type="button"
                  className="mobile-row mobile-row-movement"
                  // A speaking name (AC 1): type, date and amount — the three
                  // things the row IS. The card carries no nested control
                  // (R-15.2-b), so there is nothing for a reader to get stuck on.
                  aria-label={`${labels.mobile.openDetail}: ${typeLabel} · ${dateLabel} · ${amountText}`}
                  onClick={() => openSheet(row.id)}
                  data-testid="account-movement-row-mobile"
                >
                  <span className="mobile-row-main">
                    <span className="mobile-row-title">
                      <span className="mobile-row-name">{typeLabel}</span>
                    </span>
                    <span className="mobile-row-sub">
                      {accountMovementSubLine({ dateLabel, description: row.description, actorEmail: showActor ? row.actorEmail : null })}
                    </span>
                  </span>
                  <span className="mobile-row-side">
                    <span className={`mobile-row-amount ${amountToneClass(row.amountCents)}`}>{amountText}</span>
                  </span>
                  {/* Only when the movement is NOT ordinary (idiom 15.6/15.8a),
                      and on its own line: a badge beside the type on a 281px
                      card eats the type. Same TEXT as the desktop badge,
                      including the `linked` fallback; a DIFFERENT testid,
                      because `adjustment-badge` is read page-level with
                      `toHaveText` by `account-adjustments.spec.ts`. */}
                  {row.type === 'ADJUSTMENT' && row.reversalOfId ? (
                    <span className="mobile-row-flag">
                      <span className="badge warn" data-testid="adjustment-badge-mobile">
                        {adjustmentBadgeText(row)}
                      </span>
                    </span>
                  ) : null}
                  {row.type === 'FLIGHT_CHARGE_REVERSAL' && row.reversalOfId ? (
                    <span className="mobile-row-flag">
                      <span className="badge bad" data-testid="reversal-badge-mobile">
                        {reversalBadgeText(row)}
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* AD-4: the SAME two links and the same `?page=` contract; the inline
            style moves into `.account-pagination` (declared OUTSIDE the phone
            query with today's values, desktop measured identical) because a
            media query can never override an inline declaration — the move
            R-15.8a-f had to make for `.billing-split`. */}
        {totalPages > 1 ? (
          <div className="registry-pagination account-pagination">
            <Link
              href={pageHref(page - 1)}
              locale={locale}
              aria-disabled={page <= 1}
              data-testid="account-statement-page-prev"
              className="btn"
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="account-statement-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale}
              aria-disabled={page >= totalPages}
              data-testid="account-statement-page-next"
              className="btn"
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      {/* The row-detail sheet (AD-7: rendered conditionally, so
          `mobile-account-sheet` is ONE node). It carries the parity the card
          cannot: the description in full, "registrato da" on the admin face,
          and the rettifica of THIS movement as a second step INSIDE the sheet
          (R-15.9-c) — the decision stays where the finger started it. */}
      {sheetRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-account-sheet"
          sub={accountMovementSheetSub({
            dateLabel: formatDateOnly(sheetRow.effectiveDate, moneyLocale),
            actorEmail: showActor ? sheetRow.actorEmail : null,
          })}
          title={movementTypeLabel(sheetRow.type, labels.movementType)}
          badge={
            sheetRow.reversalOfId && sheetRow.type === 'ADJUSTMENT' ? (
              <span className="badge warn">{adjustmentBadgeText(sheetRow)}</span>
            ) : sheetRow.reversalOfId && sheetRow.type === 'FLIGHT_CHARGE_REVERSAL' ? (
              <span className="badge bad">{reversalBadgeText(sheetRow)}</span>
            ) : undefined
          }
          rows={sheetDetailRows(sheetRow)}
          closeLabel={labels.mobile.close}
          actions={
            showActions && labels.adjustments && rowIsAdjustable(sheetRow) ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => setAdjustPanel({ originalMovement: sheetRow, inSheet: true })}
                data-testid="mobile-account-adjust-action"
              >
                {labels.adjustments.rowAction}
              </button>
            ) : undefined
          }
          secondStep={
            adjustPanel?.inSheet && labels.adjustments ? (
              <div className="bottom-sheet-step account-sheet-step">
                <AdjustmentForm
                  // The SAME remount contract as the inline riquadro above:
                  // react-hook-form reads defaultValues only at mount.
                  key={adjustPanel.originalMovement?.id ?? 'standalone'}
                  personId={personId}
                  originalMovement={adjustPanel.originalMovement}
                  moneyLocale={moneyLocale}
                  labels={labels.adjustments}
                  onCancel={() => setAdjustPanel(null)}
                  onSuccess={() => handleAdjustmentSuccess(true)}
                />
              </div>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}

// --- "Registra ricarica" (story 3.1, AC 2) ----------------------------------

const topUpFormSchema = z
  .object({
    amount: z.string().trim().min(1),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'POS']),
    effectiveDate: z.string().trim().min(1),
    description: z.string(),
  })
  .refine(
    (values) => {
      try {
        const cents = parseCents(values.amount);
        return cents > 0 && cents <= 2_147_483_647;
      } catch {
        return false;
      }
    },
    { message: 'invalidAmount', path: ['amount'] },
  );

type TopUpFormValues = z.infer<typeof topUpFormSchema>;

function TopUpForm({
  personId,
  labels,
  onCancel,
  onSuccess,
}: {
  personId: string;
  // `NonNullable`: the caller only ever mounts this form when `labels.topUp`
  // is defined (guarded at the render site) — `AccountSectionLabels.topUp`
  // itself is optional only because a self-service, non-`canManageFinance`
  // caller (story 14.6) never provides it.
  labels: NonNullable<AccountSectionLabels['topUp']>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TopUpFormValues>({
    resolver: zodResolver(topUpFormSchema),
    defaultValues: { amount: '', paymentMethod: 'CASH', effectiveDate: todayDateOnly(), description: '' },
  });

  async function onSubmit(values: TopUpFormValues): Promise<void> {
    setFormError(null);
    const amountCents = parseCents(values.amount);

    let response: Response;
    try {
      response = await fetch(`/api/v1/people/${personId}/account/top-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          amountCents,
          paymentMethod: values.paymentMethod,
          effectiveDate: values.effectiveDate,
          description: values.description.trim() === '' ? null : values.description.trim(),
        }),
      });
    } catch {
      setFormError(labels.genericError);
      return;
    }
    regenerateIdempotencyKey();

    if (!response.ok) {
      setFormError(labels.genericError);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="account-topup-form">
      <div className="form-grid">
        <Field label={labels.amount} error={errors.amount ? labels.requiredField : undefined}>
          <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.amount)} {...register('amount')} />
        </Field>
        <Field label={labels.paymentMethod}>
          <Select {...register('paymentMethod')}>
            <option value="CASH">{labels.paymentMethods.cash}</option>
            <option value="BANK_TRANSFER">{labels.paymentMethods.bankTransfer}</option>
            <option value="POS">{labels.paymentMethods.pos}</option>
          </Select>
        </Field>
        <Field label={labels.effectiveDate} error={errors.effectiveDate ? labels.requiredField : undefined}>
          <DateInput aria-invalid={Boolean(errors.effectiveDate)} {...register('effectiveDate')} />
        </Field>
        <Field label={labels.description} wide>
          <Input {...register('description')} />
        </Field>
      </div>
      {/* `.fld-error`, the app's own inline-error primitive, NOT
          `fld-label stat-tone-bad`: measured on the real node, `.stat-tone-bad`
          (airops.css:734) LOSES the cascade to `.fld-label` (1114, same
          specificity, declared later) and the message would come out --ink-3
          GREY. `.fld-error` (1174) carries the SAME ratified literal —
          9.82:1 light, `--bad` in dark — and wins. */}
      {formError ? (
        <p role="alert" className="fld-error" style={{ marginTop: 10 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="account-topup-submit">
          {labels.submit}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

// --- "Registra rettifica" (story 3.3, AC 1) ---------------------------------

const adjustmentFormSchema = z
  .object({
    amount: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (values) => {
      let cents: number;
      try {
        cents = parseCents(values.amount);
      } catch {
        return false;
      }
      return cents !== 0 && Math.abs(cents) <= 2_147_483_647;
    },
    { message: 'invalidAmount', path: ['amount'] },
  );

type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

function AdjustmentForm({
  personId,
  originalMovement,
  moneyLocale,
  labels,
  onCancel,
  onSuccess,
}: {
  personId: string;
  originalMovement: AccountMovementRow | null;
  moneyLocale: 'it' | 'en';
  // Same `NonNullable` rationale as `TopUpForm`'s `labels` above.
  labels: NonNullable<AccountSectionLabels['adjustments']>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: { amount: '', reason: '' },
  });

  async function onSubmit(values: AdjustmentFormValues): Promise<void> {
    setFormError(null);
    const amountCents = parseCents(values.amount);
    let response: Response;
    try {
      response = await fetch(`/api/v1/people/${personId}/account/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({
          amountCents,
          reason: values.reason.trim(),
          originalMovementId: originalMovement?.id ?? null,
        }),
      });
    } catch {
      setFormError(labels.genericError);
      return;
    }
    regenerateIdempotencyKey();

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="account-adjustment-form">
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', textTransform: 'none' }}>
        {labels.title}
      </div>
      {originalMovement ? (
        <p className="fld-label" style={{ textTransform: 'none', marginTop: 4 }}>
          {labels.linkedTo.replace('{date}', formatDateOnly(originalMovement.effectiveDate, moneyLocale))}
        </p>
      ) : null}
      <div className="form-grid" style={{ marginTop: 10 }}>
        <Field label={labels.amount} error={errors.amount ? labels.invalidAmount : undefined}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <Input inputMode="decimal" placeholder="-0,00" aria-invalid={Boolean(errors.amount)} {...register('amount')} />
            <p className="fld-label" style={{ textTransform: 'none' }}>
              {labels.amountHint}
            </p>
          </div>
        </Field>
        <Field label={labels.reason} wide error={errors.reason ? labels.requiredReason : undefined}>
          <Input aria-invalid={Boolean(errors.reason)} {...register('reason')} />
        </Field>
      </div>
      {/* Same medicine and same reason as `TopUpForm`'s above — and this is
          the paragraph AC 3 (f) shows at 375px INSIDE the sheet (the 409). */}
      {formError ? (
        <p role="alert" className="fld-error" style={{ marginTop: 6 }}>
          {formError}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="account-adjustment-submit">
          {labels.submit}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
