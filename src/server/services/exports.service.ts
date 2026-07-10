import { createTranslator } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { buildWorkbook, type ExportColumn } from '@/server/adapters/excel/workbook';
import { APP_TIMEZONE, formatDateOnly, formatDateTime, formatMinutes, formatTimeOfDay } from '@/lib/time';
import type { ListAccountMovementsQuery } from '@/lib/schemas/accounts';
import type { ListAircraftQuery } from '@/lib/schemas/aircraft';
import type { ListBookingsQuery } from '@/lib/schemas/bookings';
import type { ListCashMovementsQuery } from '@/lib/schemas/cash';
import type { ListAllExpiriesQuery } from '@/lib/schemas/expiries';
import type { ListFlightsQuery } from '@/lib/schemas/flights';
import type { ListPeopleQuery } from '@/lib/schemas/people';
import type { ListPprRequestsQuery } from '@/lib/schemas/ppr';
import type { SchoolSummaryQuery } from '@/lib/schemas/school';
import { todayDateOnlyInZone } from '@/lib/zoned-time';
import { hasPermission, type Actor } from '@/server/auth/rbac';
import { listAccountMovements } from './accounts.service';
import { listAircraft } from './aircraft.service';
import { listBookings } from './bookings.service';
import { listCashMovements } from './cash.service';
import { ValidationError } from './errors';
import { listAllExpiries } from './expiries.service';
import { listFlights } from './flights.service';
import { listPeople } from './people.service';
import { listPprRequests } from './ppr.service';
import { getInstructorHourSummaries, getStudentHourSummaries } from './school.service';

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

type Messages = typeof import('../../../messages/it.json');

async function loadMessages(locale: AppLocale): Promise<Messages> {
  return (await import(`../../../messages/${locale}.json`)).default as Messages;
}

/** Shared AC 4 guard — a plain, directly testable predicate (unit T2) rather than duplicated inline per export function. */
export function assertWithinExportCap(total: number): void {
  if (total > EXPORT_MAX_ROWS) {
    throw new ValidationError('Too many rows match the current filters for an export — narrow them and try again.', undefined, 'EXPORT_TOO_LARGE');
  }
}

/** `airmanager-<vista>-<YYYY-MM-DD>.xlsx` (AC 1) — the date is "today" in `APP_TIMEZONE`, matching the app's own calendar-day convention (`zoned-time.ts`) rather than a raw UTC date that could be off by one near midnight. */
function exportFilename(view: string): string {
  return `airmanager-${view}-${todayDateOnlyInZone(APP_TIMEZONE)}.xlsx`;
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
// Deviation (Dev Notes' "annotarlo in notesForReview"): the fleet table's
// "Tariffa attuale" column is NOT exported — `dashboard/aircraft/page.tsx`
// joins it in from a SEPARATE per-aircraft `getEffectiveRate` call
// (`rates.service.ts`), it is not part of `AircraftListItem`/`GET
// /api/v1/aircraft`'s own DTO (verified: `aircraft.service.ts#AircraftListItem`
// has no such field).

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
    { header: t('list.table.duration'), value: (row) => formatMinutes(row.minutes) },
    { header: t('list.table.amount'), value: (row) => row.breakdown.totalAmountCents / 100, numFmt: MONEY_NUM_FMT },
    { header: t('list.table.landings'), value: (row) => row.landings },
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
    // Same "date portion of a locale-formatted datetime" split as `bookings-list.tsx` (formatDateTime is "DD/MM/YYYY, HH:MM").
    { header: t('list.table.date'), value: (row) => formatDateTime(row.startsAt, locale).split(',')[0] },
    { header: t('list.table.time'), value: (row) => `${formatTimeOfDay(row.startsAt, locale)}–${formatTimeOfDay(row.endsAt, locale)}` },
    { header: t('list.table.person'), value: (row) => row.personName },
    { header: t('list.table.instructor'), value: (row) => row.instructorName },
  ];

  return toXlsxExport('bookings', t('title'), columns, result.items);
}

// --- PPR requests (`GET /api/v1/ppr-requests`) ------------------------------
// Wired from the PPR REGISTER view (`dashboard/ppr/register`, filterable by
// stato/periodo) rather than the approval queue (`dashboard/ppr`, a fixed
// PENDING action list) — see `export-button.tsx`'s callers; both read the
// SAME endpoint, this is which page's table shape the columns mirror.

const PPR_STATUS_KEYS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', COMPLETED: 'completed', CANCELLED: 'cancelled' } as const;

export async function exportPprRequestsXlsx(actor: Actor, query: ListPprRequestsQuery): Promise<XlsxExport> {
  const result = await listPprRequests(actor, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS });
  assertWithinExportCap(result.total);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'PprRegisterPage' });

  const columns: ExportColumn<(typeof result.items)[number]>[] = [
    { header: t('table.pprNumber'), value: (row) => row.pprNumber },
    { header: t('table.requester'), value: (row) => `${row.firstName} ${row.lastName}` },
    { header: t('table.aircraft'), value: (row) => row.aircraftRegistration },
    { header: t('table.eta'), value: (row) => formatDateTime(row.eta, locale) },
    { header: t('table.status'), value: (row) => t(`filters.statusOptions.${PPR_STATUS_KEYS[row.status]}`) },
    { header: t('table.fee'), value: (row) => (row.landingFeeCents === null ? null : row.landingFeeCents / 100), numFmt: MONEY_NUM_FMT },
  ];

  return toXlsxExport('ppr-requests', t('title'), columns, result.items);
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
  // Same conditional column as `showActor` in `account-statement-table.tsx` — the
  // service already omits `actorEmail` from the DTO for a non-`people.read`
  // actor (AD-5); the export additionally drops the whole COLUMN for them.
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
    { header: t('dashboard.table.issuedAt'), value: (row) => formatDateOnly(row.issuedAt, locale) },
    { header: t('dashboard.table.expiresAt'), value: (row) => formatDateOnly(row.expiresAt, locale) },
    { header: t('dashboard.table.status'), value: (row) => t(`own.table.status.${row.status}`) },
  ];

  return toXlsxExport('expiries', t('dashboard.heading'), columns, result.items);
}

// --- School summaries (`GET /api/v1/school/summaries/*`) -------------------
// Both endpoints return a plain, UNPAGINATED array (Dev Notes: "volumi
// piccoli") — the row cap is checked on `.length`, not on a service-reported
// `total`, and `page`/`pageSize` are never part of `SchoolSummaryQuery` to
// begin with (nothing to override).

export async function exportStudentHourSummariesXlsx(actor: Actor, query: SchoolSummaryQuery): Promise<XlsxExport> {
  const items = await getStudentHourSummaries(actor, query);
  assertWithinExportCap(items.length);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'SchoolPage.summaries.students' });

  const columns: ExportColumn<(typeof items)[number]>[] = [
    { header: t('table.name'), value: (row) => `${row.lastName} ${row.firstName}` },
    { header: t('table.dual'), value: (row) => formatMinutes(row.dualMinutes) },
    { header: t('table.solo'), value: (row) => formatMinutes(row.soloMinutes) },
    { header: t('table.totalPeriod'), value: (row) => formatMinutes(row.totalMinutes) },
    { header: t('table.totalAllTime'), value: (row) => formatMinutes(row.totalMinutesAllTime) },
  ];

  return toXlsxExport('school-summaries-students', t('heading'), columns, items);
}

export async function exportInstructorHourSummariesXlsx(actor: Actor, query: SchoolSummaryQuery): Promise<XlsxExport> {
  const items = await getInstructorHourSummaries(actor, query);
  assertWithinExportCap(items.length);

  const locale = resolveLocale(query);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'SchoolPage.summaries.instructors' });

  const columns: ExportColumn<(typeof items)[number]>[] = [
    { header: t('table.name'), value: (row) => `${row.lastName} ${row.firstName}` },
    { header: t('table.hours'), value: (row) => formatMinutes(row.minutes) },
  ];

  return toXlsxExport('school-summaries-instructors', t('heading'), columns, items);
}
