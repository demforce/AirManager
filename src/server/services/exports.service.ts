import { createTranslator } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { buildWorkbook, type ExportColumn } from '@/server/adapters/excel/workbook';
import { renderReportPdf, type PdfColumn, type PdfTotal } from '@/server/adapters/pdf/document';
import { flightPicPerson } from '@/lib/flight-pic';
import { formatCents, formatSignedCents } from '@/lib/money';
import { APP_TIMEZONE, formatDateOnly, formatDateTime, formatMinutes, formatTimeOfDay } from '@/lib/time';
import type { AccountStatementPdfQuery, ListAccountMovementsQuery } from '@/lib/schemas/accounts';
import type { ListAircraftQuery } from '@/lib/schemas/aircraft';
import type { ListBookingsQuery } from '@/lib/schemas/bookings';
import type { CashReportPdfQuery, ListCashMovementsQuery } from '@/lib/schemas/cash';
import type { ListAllExpiriesQuery } from '@/lib/schemas/expiries';
import type { ListFlightsQuery } from '@/lib/schemas/flights';
import type { InstructorCompensationQuery } from '@/lib/schemas/instructor-compensation';
import type { ListPeopleQuery } from '@/lib/schemas/people';
import type { ListPprRequestsQuery } from '@/lib/schemas/ppr';
import type { ListTransactionsQuery } from '@/lib/schemas/transactions';
import { dateOnlyInZone, todayDateOnlyInZone } from '@/lib/zoned-time';
import { hasPermission, type Actor } from '@/server/auth/rbac';
import { getAccountOverview, listAccountMovements } from './accounts.service';
import { listAircraft } from './aircraft.service';
import { getAirfieldBranding } from './app-settings.service';
import { listBookings } from './bookings.service';
import { getCashReport, listCashMovements } from './cash.service';
import { ValidationError } from './errors';
import { listAllExpiries } from './expiries.service';
import { listFlights } from './flights.service';
import { getCompensationSummary } from './instructor-compensation.service';
import { getPerson, listPeople } from './people.service';
import { listPprRequests } from './ppr.service';
import { listTransactions } from './transactions.service';

/**
 * Excel export service (story 10.1, AC 1/2/3/4; FR-39; spine :227) — one
 * `export<View>Xlsx` function per covered list endpoint. Every function
 * follows the SAME three-step shape:
 *
 * 1. Re-run the EXISTING list service with the SAME `actor` and filters,
 *    only overriding `page`/`pageSize` to fetch every filtered row in one
 *    go, capped at {@link EXPORT_MAX_ROWS} (AC 1: "TUTTE le pagine",
 *    `page`/`pageSize` ignored). Reusing the list service — never
 *    duplicating its `where`/scoping — IS the guarantee of AC 3's
 *    permission parity with the JSON branch: an own-access actor gets
 *    exactly the rows they'd see in the UI, a staff-only view still throws
 *    the SAME `ForbiddenError` before any row is read.
 * 2. Reject with `EXPORT_TOO_LARGE` (AC 4) if the filtered total exceeds
 *    the cap — never a silently truncated file.
 * 3. Map the DTOs to LOCALIZED columns (`createTranslator`, the same
 *    off-request-locale pattern as `mail/templates.ts#loadMessages` — the
 *    query's `locale` param, never the actor's browsing locale, since
 *    `/api/v1` routes have no `[locale]` path segment) and return the
 *    workbook `{ buffer, filename }` — the ROUTE wraps it in `xlsxResponse`
 *    (kept out of this service so a unit test can inspect the buffer/
 *    filename directly, without unwrapping a `NextResponse` body stream).
 *
 * Column sets mirror each dashboard view's own table EXACTLY (Dev Notes: no
 * invented columns) — see each function's doc-comment for the one column a
 * view shows that this export deliberately omits, when the UI derives it
 * from a SEPARATE read the exported endpoint's own DTO doesn't carry.
 */

/** Above this many filtered rows, every export rejects with 422 `EXPORT_TOO_LARGE` (AC 4) rather than silently truncating. */
export const EXPORT_MAX_ROWS = 10_000;

/** Story 10.2 (AC 4): a PDF is not a data tool — its cap is far tighter than the xlsx one; above it, use the Excel export instead. */
export const PDF_EXPORT_MAX_ROWS = 2_000;

type Messages = typeof import('../../../messages/it.json');

async function loadMessages(locale: AppLocale): Promise<Messages> {
  return (await import(`../../../messages/${locale}.json`)).default as Messages;
}

/** Shared by both caps below — a plain, directly testable predicate (unit T2/T4) rather than duplicated inline per export function. */
function assertWithinCap(total: number, cap: number): void {
  if (total > cap) {
    throw new ValidationError('Too many rows match the current filters for an export — narrow them and try again.', undefined, 'EXPORT_TOO_LARGE');
  }
}

/** AC 4 guard for every `export<View>Xlsx` function. */
export function assertWithinExportCap(total: number): void {
  assertWithinCap(total, EXPORT_MAX_ROWS);
}

/** AC 4 guard for every `export<Report>Pdf` function (story 10.2) — same `EXPORT_TOO_LARGE` code, tighter cap. */
export function assertWithinPdfExportCap(total: number): void {
  assertWithinCap(total, PDF_EXPORT_MAX_ROWS);
}

/** `airmanager-<vista>-<YYYY-MM-DD>.xlsx` (AC 1) — the date is "today" in `APP_TIMEZONE`, matching the app's own calendar-day convention (`zoned-time.ts`) rather than a raw UTC date that could be off by one near midnight. */
function exportFilename(view: string): string {
  return `airmanager-${view}-${todayDateOnlyInZone(APP_TIMEZONE)}.xlsx`;
}

/** Same convention as {@link exportFilename}, `.pdf` extension (story 10.2, AC 2). */
function pdfFilename(view: string): string {
  return `airmanager-${view}-${todayDateOnlyInZone(APP_TIMEZONE)}.pdf`;
}

/** `locale`'s `'it'` default (AC 2) — applied here, not in the schema, see `exportQuerySchema`'s doc-comment. */
function resolveLocale(query: { locale?: AppLocale }): AppLocale {
  return query.locale ?? 'it';
}

export type XlsxExport = { buffer: Buffer; filename: string };

async function toXlsxExport<T>(view: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]): Promise<XlsxExport> {
  const buffer = await buildWorkbook({ sheetName, columns, rows });
  return { buffer, filename: exportFilename(view) };
}

const MONEY_NUM_FMT = '#,##0.00 "€"';

export type PdfExport = { buffer: Buffer; filename: string };

/**
 * Shared by every `export<Report>Pdf` function (story 10.2, AC 2): resolves
 * the `PdfExport.generatedAt`/`.page` footer labels from the SAME
 * off-request `locale` as the report's own columns (never a second,
 * independent translator instance per report), renders the document, and
 * wraps it with the `.pdf` filename — the PDF counterpart of
 * {@link toXlsxExport}.
 */
async function toPdfExport<T>(
  view: string,
  locale: AppLocale,
  branding: { name: string },
  title: string,
  subtitle: string | null,
  columns: PdfColumn<T>[],
  rows: T[],
  totals: PdfTotal[] | undefined,
): Promise<PdfExport> {
  const messages = await loadMessages(locale);
  const tPdf = createTranslator({ locale, messages, namespace: 'PdfExport' });

  const buffer = await renderReportPdf({
    branding,
    title,
    subtitle,
    columns,
    rows,
    totals,
    generatedAtLabel: tPdf('generatedAt', { date: formatDateTime(new Date(), locale) }),
    pageLabel: (pageNumber: number, totalPages: number) => tPdf('page', { page: pageNumber, total: totalPages }),
  });

  return { buffer, filename: pdfFilename(view) };
}

// --- People (`GET /api/v1/people`) -----------------------------------------

export async function exportPeopleXlsx(actor: Actor, query: ListPeopleQuery): Promise<XlsxExport> {
  const result = await listPeople(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'PeoplePage' });

  function profilesLabel(profiles: { pilot: boolean; student: boolean; instructor: boolean }): string | null {
    const badges: string[] = [];
    if (profiles.pilot) badges.push(t('profilesPanel.badges.pilot'));
    if (profiles.student) badges.push(t('profilesPanel.badges.student'));
    if (profiles.instructor) badges.push(t('profilesPanel.badges.instructor'));
    return badges.length > 0 ? badges.join(', ') : null;
  }

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('table.name'), value: (row) => `${row.lastName} ${row.firstName}` },
    { header: t('table.email'), value: (row) => row.email },
    { header: t('table.phone'), value: (row) => row.phone },
    { header: t('table.status'), value: (row) => (row.archivedAt ? t('status.archived') : t('status.active')) },
    { header: t('table.profiles'), value: (row) => profilesLabel(row.profiles) },
  ];

  return toXlsxExport('people', t('title'), columns, result.items);
}

// --- Aircraft (`GET /api/v1/aircraft`) --------------------------------------
// Deviation (Dev Notes' "annotarlo in notesForReview"): the fleet card's
// "Tariffa" is NOT exported — `dashboard/fleet/page.tsx` (story 12.5, the
// `dashboard/aircraft` page's replacement) joins it in from a SEPARATE
// batched `getEffectiveRates` call (`rates.service.ts`), it is not part of
// `AircraftListItem`/`GET /api/v1/aircraft`'s own DTO (verified:
// `aircraft.service.ts#AircraftListItem` has no such field).

export async function exportAircraftXlsx(actor: Actor, query: ListAircraftQuery): Promise<XlsxExport> {
  const result = await listAircraft(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'AircraftPage' });

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('table.registration'), value: (row) => row.registration },
    { header: t('table.type'), value: (row) => row.type },
    { header: t('table.model'), value: (row) => row.model },
    { header: t('table.hourMeter'), value: (row) => formatMinutes(row.hourMeterMinutes) },
    { header: t('table.status'), value: (row) => (row.archivedAt ? t('status.archived') : t('status.active')) },
    {
      header: t('table.operationalStatus'),
      value: (row) => (row.status === 'OUT_OF_SERVICE' ? t('operationalStatus.outOfService') : t('operationalStatus.operational')),
    },
  ];

  return toXlsxExport('aircraft', t('title'), columns, result.items);
}

// --- Flights (`GET /api/v1/flights`) ----------------------------------------

function flightTypeLabel(
  flightType: 'TOURISM' | 'SCHOOL' | 'AERIAL_WORK',
  labels: { private: string; school: string; other: string },
): string {
  if (flightType === 'TOURISM') return labels.private;
  if (flightType === 'SCHOOL') return labels.school;
  return labels.other;
}

export async function exportFlightsXlsx(actor: Actor, query: ListFlightsQuery): Promise<XlsxExport> {
  const result = await listFlights(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'FlightsPage' });
  const flightTypeLabels = { private: t('form.flightTypes.private'), school: t('form.flightTypes.school'), other: t('form.flightTypes.other') };

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('list.table.date'), value: (row) => formatDateOnly(row.flightDate, locale) },
    { header: t('list.table.aircraft'), value: (row) => row.aircraft.registration },
    { header: t('list.table.person'), value: (row) => `${row.person.lastName} ${row.person.firstName}` },
    { header: t('list.table.instructor'), value: (row) => (row.instructor ? `${row.instructor.lastName} ${row.instructor.firstName}` : null) },
    {
      header: t('list.table.type'),
      value: (row) => flightTypeLabel(row.flightType, flightTypeLabels) + (row.isSolo ? ` — ${t('list.table.soloSuffix')}` : ''),
    },
    // Story 11.3 (AC 2): partenza/arrivo/orari as SEPARATE columns (unlike
    // the PDF's compact `tratta`/`orari`) — `null` on a historical
    // (pre-11.1) flight, same as the DTO itself.
    { header: t('list.table.departure'), value: (row) => row.departureAirfield },
    { header: t('list.table.arrival'), value: (row) => row.arrivalAirfield },
    { header: t('list.table.takeoffTime'), value: (row) => (row.takeoffAt ? formatTimeOfDay(row.takeoffAt, locale) : null) },
    { header: t('list.table.landingTime'), value: (row) => (row.landingAt ? formatTimeOfDay(row.landingAt, locale) : null) },
    { header: t('list.table.duration'), value: (row) => formatMinutes(row.minutes) },
    { header: t('list.table.takeoffs'), value: (row) => row.takeoffs },
    { header: t('list.table.landings'), value: (row) => row.landings },
    {
      // Story 11.3 (AC 4): the SAME shared `flightPicPerson` derivation as
      // the registry (story 11.2) — `null` on the anomalous historical
      // fallback (a dual SCHOOL flight with no instructor on record).
      header: t('list.table.pic'),
      value: (row) => {
        const pic = flightPicPerson(row);
        return pic ? `${pic.lastName} ${pic.firstName}` : null;
      },
    },
    { header: t('list.table.amount'), value: (row) => row.breakdown.totalAmountCents / 100, numFmt: MONEY_NUM_FMT },
    {
      header: t('list.table.status'),
      value: (row) => (row.status === 'CANCELLED' ? t('filters.statusOptions.cancelled') : t('filters.statusOptions.registered')),
    },
  ];

  return toXlsxExport('flights', t('title'), columns, result.items);
}

// --- Bookings (`GET /api/v1/bookings`) --------------------------------------
// Domain note ratified in-story (AC 3): the list is deliberately shared
// (calendar comune, `self.read`) — this export applies NO restriction beyond
// what `listBookings` already enforces for every role.

export async function exportBookingsXlsx(actor: Actor, query: ListBookingsQuery): Promise<XlsxExport> {
  const result = await listBookings(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'BookingsPage' });

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('list.table.aircraft'), value: (row) => row.aircraftRegistration },
    { header: t('list.table.pilot'), value: (row) => row.personName },
    // `list.table.instructor` (story 12.3, AC 3): the UI table itself only
    // shows the instructor name as a sub-line under the pilot's, with no
    // dedicated column header — this key exists solely for this export's own
    // dedicated column, kept for spreadsheet usability.
    { header: t('list.table.instructor'), value: (row) => row.instructorName },
    { header: t('list.table.startsAt'), value: (row) => formatDateTime(row.startsAt, locale) },
    { header: t('list.table.endsAt'), value: (row) => formatDateTime(row.endsAt, locale) },
    // Story 12.3, AC 4: the export lists every status the new UI shows (not
    // just APPROVED/PENDING), so a status column is now necessary to read
    // the rows meaningfully.
    { header: t('list.table.status'), value: (row) => t(`list.status.${row.status}`) },
  ];

  return toXlsxExport('bookings', t('list.cardTitle'), columns, result.items);
}

// --- PPR requests (`GET /api/v1/ppr-requests`, `GET /api/v1/ppr-requests/pdf`) ---
// Column set mirrors the MOVEMENTS view (`dashboard/movements`, epic 12
// story 12.4 — replaces the pre-12.4 `dashboard/ppr/register`, filterable by
// stato/periodo); the approval console (`dashboard/ppr`, a PENDING-default
// action list) reuses the SAME two export functions with its own status
// filter (story 13.6, AC 5) rather than a second, dedicated column set.

const PPR_STATUS_KEYS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', COMPLETED: 'completed', CANCELLED: 'cancelled' } as const;

export async function exportPprRequestsXlsx(actor: Actor, query: ListPprRequestsQuery): Promise<XlsxExport> {
  const result = await listPprRequests(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'MovementsPage' });

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('export.pprNumber'), value: (row) => row.pprNumber },
    { header: t('table.requester'), value: (row) => `${row.firstName} ${row.lastName}` },
    { header: t('table.aircraft'), value: (row) => row.aircraftRegistration },
    { header: t('table.eta'), value: (row) => formatDateTime(row.eta, locale) },
    { header: t('table.status'), value: (row) => t(`filters.statusOptions.${PPR_STATUS_KEYS[row.status]}`) },
    { header: t('table.fee'), value: (row) => (row.landingFeeCents === null ? null : row.landingFeeCents / 100), numFmt: MONEY_NUM_FMT },
  ];

  return toXlsxExport('ppr-requests', t('card.title'), columns, result.items);
}

// --- Account statement (`GET /api/v1/people/{id}/account/movements`) -------

const ACCOUNT_MOVEMENT_TYPE_KEYS = {
  TOP_UP: 'topUp',
  ADJUSTMENT: 'adjustment',
  PACKAGE_PURCHASE: 'packagePurchase',
  FLIGHT_CHARGE: 'flightCharge',
  FLIGHT_CHARGE_REVERSAL: 'flightChargeReversal',
} as const;

export async function exportAccountMovementsXlsx(actor: Actor, personId: string, query: ListAccountMovementsQuery): Promise<XlsxExport> {
  const result = await listAccountMovements(actor, personId, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'AccountStatementPage' });
  // Same conditional column as `showActor` in `people/[id]/account-section.tsx`
  // (story 13.3) — the service already omits `actorEmail` from the DTO for a
  // non-`people.read` actor (AD-5); the export additionally drops the whole
  // COLUMN for them.
  const includeActor = hasPermission(actor, 'people.read');

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('table.date'), value: (row) => formatDateOnly(row.effectiveDate, locale) },
    { header: t('table.type'), value: (row) => t(`movementType.${ACCOUNT_MOVEMENT_TYPE_KEYS[row.type]}`) },
    { header: t('table.description'), value: (row) => row.description },
    { header: t('table.amount'), value: (row) => row.amountCents / 100, numFmt: MONEY_NUM_FMT },
    ...(includeActor ? [{ header: t('table.recordedBy'), value: (row) => row.actorEmail ?? null } satisfies ExportColumn<(typeof result.items)[number]>] : []),
  ];

  return toXlsxExport('account-movements', t('kicker'), columns, result.items);
}

// --- Cash register (`GET /api/v1/cash-movements`) ---------------------------

export async function exportCashMovementsXlsx(actor: Actor, query: ListCashMovementsQuery): Promise<XlsxExport> {
  const result = await listCashMovements(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'FinancePage.cashRegister' });

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('table.date'), value: (row) => formatDateOnly(row.effectiveDate, locale) },
    { header: t('table.category'), value: (row) => row.categoryName },
    { header: t('table.description'), value: (row) => row.description },
    { header: t('table.amount'), value: (row) => row.amountCents / 100, numFmt: MONEY_NUM_FMT },
    { header: t('table.recordedBy'), value: (row) => row.actorEmail },
  ];

  return toXlsxExport('cash-movements', t('heading'), columns, result.items);
}

// --- Unified billing ledger (`GET /api/v1/transactions`) -------------------
// Epic 12, story 12.9, AC 2: "Transazioni (Excel)" — ADDITIVE beyond the
// piano's file-list, required by the prototype's own ExportMenu. Same
// three-step shape as every other export here; `t`/`tType` are TWO
// translators on purpose — `BillingPage` for the columns' own headers/status
// labels, `AccountStatementPage` for the 5 `AccountMovementType` labels
// (reused verbatim, same mapping the account statement's own export uses —
// `ACCOUNT_MOVEMENT_TYPE_KEYS` above). A `CASH` row's `kind` is already the
// human `CashCategory.name`, no translation needed.

export async function exportTransactionsXlsx(actor: Actor, query: ListTransactionsQuery): Promise<XlsxExport> {
  const result = await listTransactions(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'BillingPage' });
  const tType = createTranslator({ locale, messages, namespace: 'AccountStatementPage' });

  function statusLabel(row: (typeof result.items)[number]): string {
    if (row.reversed) return t('table.statusOptions.reversed');
    if (row.reversal) return t('table.statusOptions.reversal');
    return t('table.statusOptions.registered');
  }

  function methodLabel(row: (typeof result.items)[number]): string | null {
    if (!row.method) return null;
    if (row.method === 'BANK_TRANSFER') return t('table.methods.BANK_TRANSFER');
    if (row.method === 'POS') return t('table.methods.POS');
    return t('table.methods.CASH');
  }

  /** The granular label (raw AccountMovementType or CashCategory name) — folded into Descrizione (story Billing-2), same as the console's own `kindLabel`: Tipo now carries the coarse bookType instead. */
  function kindText(row: (typeof result.items)[number]): string {
    return row.source === 'ACCOUNT' ? tType(`movementType.${ACCOUNT_MOVEMENT_TYPE_KEYS[row.kind as keyof typeof ACCOUNT_MOVEMENT_TYPE_KEYS]}`) : row.kind;
  }

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('table.date'), value: (row) => formatDateOnly(row.date, locale) },
    { header: t('table.pilot'), value: (row) => row.personName },
    { header: t('table.type'), value: (row) => t(`table.bookTypes.${row.bookType}`) },
    { header: t('table.description'), value: (row) => (row.description ? `${kindText(row)} — ${row.description}` : kindText(row)) },
    { header: t('table.method'), value: methodLabel },
    { header: t('table.entrate'), value: (row) => (row.amountCents > 0 ? row.amountCents / 100 : null), numFmt: MONEY_NUM_FMT },
    { header: t('table.uscite'), value: (row) => (row.amountCents < 0 ? -row.amountCents / 100 : null), numFmt: MONEY_NUM_FMT },
    { header: t('table.status'), value: statusLabel },
  ];

  return toXlsxExport('transactions', t('table.cardTitle'), columns, result.items);
}

// --- Expiries dashboard (`GET /api/v1/expiries`) ----------------------------

export async function exportExpiriesXlsx(actor: Actor, query: ListAllExpiriesQuery): Promise<XlsxExport> {
  const result = await listAllExpiries(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'ExpiriesPage' });
  const tScope = createTranslator({ locale, messages, namespace: 'ExpiryTypesPage' });

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('dashboard.table.person'), value: (row) => `${row.personLastName} ${row.personFirstName}` },
    { header: t('dashboard.table.type'), value: (row) => row.typeName },
    { header: t('dashboard.table.scope'), value: (row) => tScope(`scope.${row.typeScope}`) },
    { header: t('dashboard.table.expiresAt'), value: (row) => formatDateOnly(row.expiresAt, locale) },
    { header: t('dashboard.table.status'), value: (row) => t(`own.table.status.${row.status}`) },
  ];

  return toXlsxExport('expiries', t('dashboard.heading'), columns, result.items);
}

// --- Instructor compensation (`GET /api/v1/instructor-compensation`) -------
// Story 12.7, AC 3 — the summary only (never the `?personId=` detail, which
// has nothing to export, it's a slide-over). Same unpaginated-array shape as
// the school summaries above (`assertWithinExportCap` on `.length`).

export async function exportInstructorCompensationXlsx(actor: Actor, query: InstructorCompensationQuery): Promise<XlsxExport> {
  const items = await getCompensationSummary(actor);
  assertWithinExportCap(items.length);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'InstructorsPage' });

  const columns: ExportColumn<(typeof items)[number]>[] = [
    { header: t('table.name'), value: (row) => `${row.lastName} ${row.firstName}` },
    { header: t('table.rate'), value: (row) => (row.payoutRateCents === null ? null : row.payoutRateCents / 100), numFmt: MONEY_NUM_FMT },
    { header: t('table.hours'), value: (row) => formatMinutes(row.totalMinutes) },
    { header: t('table.owed'), value: (row) => (row.owedTotalCents === null ? null : row.owedTotalCents / 100), numFmt: MONEY_NUM_FMT },
  ];

  return toXlsxExport('instructor-compensation', t('cardTitle'), columns, items);
}

// =============================================================================
// PDF exports (story 10.2, AC 1-6; FR-40; `adapters/pdf` — spine :227). One
// `export<Report>Pdf` function per covered report — the SAME three-step
// shape as the xlsx exports above (reuse the list/aggregate service with the
// SAME actor/filters -> reject over `PDF_EXPORT_MAX_ROWS` -> map to
// LOCALIZED `PdfColumn`s), plus two things no xlsx export needs: the
// admin-configured airfield branding (`getAirfieldBranding`) for the
// header, and a `totals` line where the report has one. Only 4 reports are
// covered (Dev Notes, deliberately NOT every xlsx-covered view): the
// account statement, the period financial report, the flight log, and the
// expiry dashboard.
// =============================================================================

/**
 * Localizes a mandatory `from`/`to` period into the report subtitle (AC 2:
 * "periodo/filtri applicati") — shared by every PDF report that has one
 * (cash report, flights when both bounds are given). `formatDateOnly` keeps
 * the SAME `DD/MM/YYYY` presentation as every other date-only field in the
 * domain.
 */
function periodSubtitle(from: string, to: string, locale: AppLocale): string {
  return `${formatDateOnly(from, locale)} – ${formatDateOnly(to, locale)}`;
}

// --- Account statement (`GET /api/v1/people/{id}/account/pdf`) -------------
// Epic 12, story 12.9, AC 5: `from`/`to` are now ADDITIVE optional bounds
// (`accountStatementPdfQuerySchema`) — absent means the SAME "estratto
// COMPLETO" as before (Dev Notes' original rationale, still true by
// default); present narrows the rows to the billing "Estratti conto"
// period. The balance line is ALWAYS the account's CURRENT balance (Dev
// Notes: "semantica infra esistente" — `getAccountOverview` never took a
// period), just RE-LABELED when a period is applied so it never reads as a
// period-end balance it is not.

export async function exportAccountStatementPdf(actor: Actor, personId: string, query: AccountStatementPdfQuery): Promise<PdfExport> {
  const movements = await listAccountMovements(actor, personId, { page: 1, pageSize: PDF_EXPORT_MAX_ROWS, from: query.from, to: query.to });
  assertWithinPdfExportCap(movements.total);

  // Same own-access rule as `listAccountMovements` (`accounts.service.ts#assertReadAccess`)
  // — already enforced above; these two reads never widen access, only add
  // the person's name (title) and final balance (totals) to the PDF.
  const [overview, person, branding] = await Promise.all([getAccountOverview(actor, personId), getPerson(actor, personId), getAirfieldBranding()]);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'AccountStatementPage' });
  // Same conditional column as the xlsx export / `account-section.tsx`'s `showActor`.
  const includeActor = hasPermission(actor, 'people.read');
  const hasPeriod = Boolean(query.from || query.to);

  const columns: PdfColumn<(typeof movements.items)[number]>[] = [
    { header: t('table.date'), value: (row) => formatDateOnly(row.effectiveDate, locale) },
    { header: t('table.type'), value: (row) => t(`movementType.${ACCOUNT_MOVEMENT_TYPE_KEYS[row.type]}`) },
    { header: t('table.description'), value: (row) => row.description ?? '' },
    { header: t('table.amount'), value: (row) => formatSignedCents(row.amountCents, locale) },
    ...(includeActor ? [{ header: t('table.recordedBy'), value: (row) => row.actorEmail ?? '' } satisfies PdfColumn<(typeof movements.items)[number]>] : []),
  ];

  // Both bounds present (the billing "Estratti conto" dialog always sends
  // both) -> a period subtitle; a hand-crafted single-sided query falls back
  // to the plain name (Dev Notes: no invented open-ended range text).
  const period = query.from && query.to ? periodSubtitle(query.from, query.to, locale) : null;
  const subtitle = period ? `${person.lastName} ${person.firstName} · ${period}` : `${person.lastName} ${person.firstName}`;

  return toPdfExport(
    'account-statement',
    locale,
    branding,
    t('kicker'),
    subtitle,
    columns,
    movements.items,
    [{ label: hasPeriod ? t('pdf.currentBalance') : t('pdf.balance'), value: formatCents(overview.balanceCents, locale) }],
  );
}

// --- Period financial report (`GET /api/v1/cash-report/pdf`) ---------------

export async function exportCashReportPdf(actor: Actor, query: CashReportPdfQuery): Promise<PdfExport> {
  // `getCashReport` is a read-only aggregation with no pagination/cap of its
  // own (story 3.5) — its `categories` array is bounded by the number of
  // cash categories in the system (never a filtered row count), so there is
  // no `assertWithinPdfExportCap` call here, same as the xlsx exports never
  // cap the (also unpaginated) school summaries by anything but `.length`.
  const report = await getCashReport(actor, query);
  const branding = await getAirfieldBranding();

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'CashReportPage' });

  const columns: PdfColumn<(typeof report.categories)[number]>[] = [
    { header: t('categories.name'), value: (row) => row.categoryName },
    { header: t('categories.in'), value: (row) => formatCents(row.inCents, locale) },
    { header: t('categories.out'), value: (row) => formatCents(row.outCents, locale) },
    { header: t('categories.net'), value: (row) => formatSignedCents(row.netCents, locale) },
  ];

  return toPdfExport('cash-report', locale, branding, t('title'), periodSubtitle(report.from, report.to, locale), columns, report.categories, [
    { label: t('summary.totalIn'), value: formatCents(report.totalInCents, locale) },
    { label: t('summary.totalOut'), value: formatCents(report.totalOutCents, locale) },
    { label: t('summary.net'), value: formatSignedCents(report.netCents, locale) },
  ]);
}

// --- Flight log (`GET /api/v1/flights/pdf`) ---------------------------------

export async function exportFlightsPdf(actor: Actor, query: ListFlightsQuery): Promise<PdfExport> {
  const result = await listFlights(actor, { ...query, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
  assertWithinPdfExportCap(result.total);
  const branding = await getAirfieldBranding();

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'FlightsPage' });
  const flightTypeLabels = { private: t('form.flightTypes.private'), school: t('form.flightTypes.school'), other: t('form.flightTypes.other') };

  // Story 11.3 (AC 3): relative `width` weights, NOT equal `flex:1` anymore —
  // found via the real-PDF render check (Dev Notes, T3): with 12 equal
  // columns (up from 9 pre-11.3) an unbreakable token wider than its column
  // — a bare `DD/MM/YYYY` date, an aircraft registration, react-pdf cannot
  // hyphenate either — silently overflows into the next column instead of
  // wrapping. Weights below give the widest content (date, aircraft, route,
  // person/instructor/PIC names) more room, borrowed from columns that are
  // always short (duration `H:MM`, movements `N / N`); declared deviation
  // from equal-flex (Dev Notes explicitly allows this "SOLO se la verifica
  // leggibilità lo impone").
  const columns: PdfColumn<(typeof result.items)[number]>[] = [
    { header: t('list.table.date'), value: (row) => formatDateOnly(row.flightDate, locale), width: 1.4 },
    { header: t('list.table.aircraft'), value: (row) => row.aircraft.registration, width: 1.3 },
    { header: t('list.table.person'), value: (row) => `${row.person.lastName} ${row.person.firstName}`, width: 1.1 },
    {
      header: t('list.table.instructor'),
      value: (row) => (row.instructor ? `${row.instructor.lastName} ${row.instructor.firstName}` : ''),
      width: 1.1,
    },
    {
      header: t('list.table.type'),
      value: (row) => flightTypeLabel(row.flightType, flightTypeLabels) + (row.isSolo ? ` — ${t('list.table.soloSuffix')}` : ''),
    },
    // Compact columns (equal-flex A4 columns leave no room for the xlsx
    // export's separate partenza/arrivo/orari) — SAME keys/format as the
    // registry's own compact columns (story 11.2), EXCEPT the separator:
    // the registry's `→` (U+2192) is outside the PDF's built-in Helvetica /
    // WinAnsiEncoding repertoire (story 10.2: no `Font.register`, no new
    // assets) — verified on a real render it comes out as a stray `'`, not
    // an arrow. `->` is plain ASCII, renders correctly in any Latin-1 font.
    // Empty string, never `null` (a PDF cell is always plain text) on a
    // historical flight with no logbook data.
    {
      header: t('list.table.route'),
      value: (row) => (row.departureAirfield && row.arrivalAirfield ? `${row.departureAirfield} -> ${row.arrivalAirfield}` : ''),
      width: 1.3,
    },
    {
      // Space around the en-dash (unlike the registry's bare `–`, story 11.2's
      // format): "11:00–12:00" has no wrap point and overflowed the column
      // even at the increased `width` — the space gives react-pdf's
      // word-wrap a break point.
      header: t('list.table.times'),
      value: (row) =>
        row.takeoffAt && row.landingAt ? `${formatTimeOfDay(row.takeoffAt, locale)} – ${formatTimeOfDay(row.landingAt, locale)}` : '',
      width: 1.1,
    },
    { header: t('list.table.duration'), value: (row) => formatMinutes(row.minutes), width: 0.6 },
    // `takeoffs`/`landings` are NEVER null on the wire (story 11.1) — replaces the old `landings`-only column.
    { header: t('list.table.movements'), value: (row) => `${row.takeoffs} / ${row.landings}`, width: 0.7 },
    {
      // Story 11.3 (AC 4): SAME shared `flightPicPerson` derivation as the xlsx export/registry.
      header: t('list.table.pic'),
      value: (row) => {
        const pic = flightPicPerson(row);
        return pic ? `${pic.lastName} ${pic.firstName}` : '';
      },
      width: 1.1,
    },
    { header: t('list.table.amount'), value: (row) => formatCents(row.breakdown.totalAmountCents, locale), width: 1.1 },
    {
      header: t('list.table.status'),
      value: (row) => (row.status === 'CANCELLED' ? t('filters.statusOptions.cancelled') : t('filters.statusOptions.registered')),
      width: 0.9,
    },
  ];

  // Totals over EVERY row this export actually carries (AC 2, Dev Notes:
  // "totali NUOVI calcolati nell'export service") — computed here, never in
  // `flights.service.ts` (Dev Notes: "NON toccare flights.service").
  const totalMinutes = result.items.reduce((sum, row) => sum + row.minutes, 0);
  const totalAmountCents = result.items.reduce((sum, row) => sum + row.breakdown.totalAmountCents, 0);

  const subtitle = query.dateFrom && query.dateTo ? periodSubtitle(query.dateFrom, query.dateTo, locale) : null;

  return toPdfExport('flights', locale, branding, t('title'), subtitle, columns, result.items, [
    { label: t('pdf.totalDuration'), value: formatMinutes(totalMinutes) },
    { label: t('pdf.totalAmount'), value: formatCents(totalAmountCents, locale) },
  ]);
}

// --- Expiry dashboard (`GET /api/v1/expiries/pdf`) --------------------------
// Same palette as `expiries/expiry-status-badge.tsx`'s `EXPIRY_STATUS_BADGE_CLASSES` —
// duplicated as plain hex constants (rather than imported) since that
// module is `'use client'` and this service must stay server-only; 3
// constants, low churn, kept in exact sync by hand (Dev Notes: "riusando
// ESATTAMENTE la palette").
const EXPIRY_STATUS_PDF_COLOR = { ok: '#346538', expiring: '#956400', expired: '#9F2F2D' } as const;

export async function exportExpiriesPdf(actor: Actor, query: ListAllExpiriesQuery): Promise<PdfExport> {
  const result = await listAllExpiries(actor, { ...query, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
  assertWithinPdfExportCap(result.total);
  const branding = await getAirfieldBranding();

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'ExpiriesPage' });
  const tScope = createTranslator({ locale, messages, namespace: 'ExpiryTypesPage' });

  const columns: PdfColumn<(typeof result.items)[number]>[] = [
    { header: t('dashboard.table.person'), value: (row) => `${row.personLastName} ${row.personFirstName}` },
    { header: t('dashboard.table.type'), value: (row) => row.typeName },
    { header: t('dashboard.table.scope'), value: (row) => tScope(`scope.${row.typeScope}`) },
    { header: t('dashboard.table.expiresAt'), value: (row) => formatDateOnly(row.expiresAt, locale) },
    {
      header: t('dashboard.table.status'),
      value: (row) => t(`own.table.status.${row.status}`),
      color: (row) => EXPIRY_STATUS_PDF_COLOR[row.status],
    },
  ];

  // No `totals` (Dev Notes: "nessun totale, non pertinente" — a status list has nothing summable).
  return toPdfExport('expiries', locale, branding, t('dashboard.heading'), null, columns, result.items, undefined);
}

// --- PPR queue/register (`GET /api/v1/ppr-requests/pdf`) -------------------
// Story 13.6, AC 4/5 — dedicated PDF route (spine :105), same filters
// (status/from/to) and SAME columns as `exportPprRequestsXlsx` above. Wired
// from both the movements view (Voli in transito) and the PPR approval
// console's own new export menu.

export async function exportPprRequestsPdf(actor: Actor, query: ListPprRequestsQuery): Promise<PdfExport> {
  const result = await listPprRequests(actor, { ...query, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
  assertWithinPdfExportCap(result.total);
  const branding = await getAirfieldBranding();

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'MovementsPage' });

  const columns: PdfColumn<(typeof result.items)[number]>[] = [
    { header: t('export.pprNumber'), value: (row) => row.pprNumber ?? '' },
    { header: t('table.requester'), value: (row) => `${row.firstName} ${row.lastName}` },
    { header: t('table.aircraft'), value: (row) => row.aircraftRegistration },
    { header: t('table.eta'), value: (row) => formatDateTime(row.eta, locale) },
    { header: t('table.status'), value: (row) => t(`filters.statusOptions.${PPR_STATUS_KEYS[row.status]}`) },
    { header: t('table.fee'), value: (row) => (row.landingFeeCents === null ? '' : formatCents(row.landingFeeCents, locale)) },
  ];

  // Both bounds present (same rule as `exportFlightsPdf`) -> a period subtitle.
  const subtitle = query.from && query.to ? periodSubtitle(query.from, query.to, locale) : null;

  return toPdfExport('ppr-requests', locale, branding, t('card.title'), subtitle, columns, result.items, undefined);
}

// --- Bookings (`GET /api/v1/bookings/pdf`) ----------------------------------
// Story 13.7, AC 2 — dedicated PDF route (spine :105), SAME filters and SAME
// columns as `exportBookingsXlsx` above (domain note ratified in-story: the
// list is shared, `self.read` — no restriction beyond what `listBookings`
// already enforces for every role).

export async function exportBookingsPdf(actor: Actor, query: ListBookingsQuery): Promise<PdfExport> {
  const result = await listBookings(actor, { ...query, page: 1, pageSize: PDF_EXPORT_MAX_ROWS });
  assertWithinPdfExportCap(result.total);
  const branding = await getAirfieldBranding();

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'BookingsPage' });

  const columns: PdfColumn<(typeof result.items)[number]>[] = [
    { header: t('list.table.aircraft'), value: (row) => row.aircraftRegistration },
    { header: t('list.table.pilot'), value: (row) => row.personName },
    { header: t('list.table.instructor'), value: (row) => row.instructorName ?? '' },
    { header: t('list.table.startsAt'), value: (row) => formatDateTime(row.startsAt, locale) },
    { header: t('list.table.endsAt'), value: (row) => formatDateTime(row.endsAt, locale) },
    { header: t('list.table.status'), value: (row) => t(`list.status.${row.status}`) },
  ];

  // Review fix (PO decision 2026-07-25, F7): unlike every other PDF report's
  // `periodSubtitle`, which needs BOTH bounds, the bookings UI only ever
  // sends `from` (never `to` — this list has no `to` filter), so the
  // two-bound-only pattern would always have produced `null` here (the
  // dev's original, correct observation). Open-ended variant covering
  // from-only/to-only too — SAME `periodSubtitle`/`formatDateOnly`
  // presentation, reused verbatim below; `from`/`to` are full ISO instants
  // here (`z.iso.datetime()`, unlike the date-only `z.iso.date()` bounds
  // the other PDF reports filter by), so `dateOnlyInZone` (already used for
  // `todayDateOnlyInZone` above) reads the calendar date they fall on in
  // `APP_TIMEZONE` before handing off to the existing date-only helpers —
  // no date-formatting logic duplicated.
  const fromDateOnly = query.from ? dateOnlyInZone(new Date(query.from), APP_TIMEZONE) : null;
  const toDateOnly = query.to ? dateOnlyInZone(new Date(query.to), APP_TIMEZONE) : null;
  const subtitle =
    fromDateOnly && toDateOnly
      ? periodSubtitle(fromDateOnly, toDateOnly, locale)
      : fromDateOnly
        ? t('list.periodFrom', { date: formatDateOnly(fromDateOnly, locale) })
        : toDateOnly
          ? t('list.periodUntil', { date: formatDateOnly(toDateOnly, locale) })
          : null;

  // No `totals` (same as `exportExpiriesPdf`: a status list has nothing summable).
  return toPdfExport('bookings', locale, branding, t('list.cardTitle'), subtitle, columns, result.items, undefined);
}
