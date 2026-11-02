import type { ExpiryScope } from '@/generated/prisma/client';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { daysUntilUtc } from '@/lib/expiry-status';
import type { RequirementFailure } from '@/lib/schemas/requirements';
import { prisma } from '@/server/db/prisma';
import { getCurrencySettings } from './app-settings.service';
import { getCurrencyStatus } from './currency.service';
import { ValidationError } from './errors';
import { getMedicalRequirementFailure } from './expiries.service';
import { getMembershipStatus } from './membership.service';

/**
 * The ONE evaluation of the operational requirements of a flight or a
 * booking (story 19.9, CR §4.4, R-19-g/h/i/j/k) — reused by story 19.10 for
 * the create/update/approve paths of bookings. Read-only: no actor, no
 * transaction, no write; the caller runs it BEFORE its own transaction.
 *
 * The POLICY lives in the caller — which checks to ask for (a solo flight?
 * a no-charge one? an edit exempt from the documents?) and on which
 * reference day each is judged. This module only evaluates what it is asked
 * and returns the failures; a `null`/`false` block issues no query at all.
 *
 * The four checks:
 * - EXPIRY (`documents`) — for the person and, when given, the instructor:
 *   blocking RATINGs (`blocksBooking`, ACTIVE type — story 16.4, R-16-c: a
 *   deactivated type no longer blocks) registered and expired before
 *   `expiryDateOnly` (the expiry day itself is valid; NO scope filter, as the
 *   flights always did), then blocking RATINGs APPLICABLE by scope with no
 *   row at all (person: `ALL` + the scopes of `person.hasActive*`;
 *   instructor: `ALL` + `INSTRUCTORS`), then the ONE medical document of
 *   `getMedicalRequirementFailure` (story 19.7a, R-19-j). MEMBERSHIP rows
 *   never count here.
 * - MEMBERSHIP (`documents`) — `getMembershipStatus` at `membershipDateOnly`,
 *   for the person and the instructor (Q-19.9-a: the fee is due by everyone
 *   on board).
 * - CURRENCY (`currency`) — the person only, `getCurrencyStatus` at
 *   `currency.dateOnly`, leaving out `excludeFlightId` (the flight being
 *   edited never counts for itself).
 * - BALANCE (`balance`) — `SUM(amountCents)` of the person's account (0
 *   without one) plus `creditCents` (the operation's own current charge, on
 *   an edit) must cover `costCents`; equal is covered.
 *
 * Output order is CONTRACT (the e2e assert it): EXPIRY of the person, EXPIRY
 * of the instructor, MEMBERSHIP of the person, MEMBERSHIP of the instructor,
 * CURRENCY, BALANCE; inside one person's EXPIRY the expired by name, then the
 * missing by name, then the medical document. The three reference days are
 * all mandatory — no default can cover a caller that forgot one (story 19.10
 * judges currency and fee at today, documents at the flight day; flights pass
 * the flight day to all three).
 */
export type { RequirementFailure };

export type RequirementsInput = {
  /** `YYYY-MM-DD` (Rome): the day EXPIRY is judged on. */
  expiryDateOnly: string;
  /** `YYYY-MM-DD` (Rome): the day MEMBERSHIP is judged on. */
  membershipDateOnly: string;
  /** `hasActive*` = which scopes apply to the person's MISSING scan in THIS slot. */
  person: { id: string; name: string; hasActivePilot: boolean; hasActiveStudent: boolean; hasActiveInstructor: boolean };
  /** The instructor ON BOARD, or `null`. */
  instructor: { personId: string; name: string } | null;
  /** EXPIRY + MEMBERSHIP. */
  documents: boolean;
  /** `null` = not evaluated; `dateOnly` = the day CURRENCY is judged on. */
  currency: { dateOnly: string; excludeFlightId: string | null } | null;
  /** `null` = not evaluated. */
  balance: { costCents: number; creditCents: number } | null;
};

type Role = 'person' | 'instructor';

const compareNames = (left: string, right: string): number => left.localeCompare(right, 'it');

async function expiryFailures(personId: string, personName: string, role: Role, scopes: ExpiryScope[], dateOnly: string): Promise<RequirementFailure[]> {
  // The type filters are SQL (16.4 AD-1); the day is compared as a
  // `YYYY-MM-DD` string, the convention of every flight/booking scan.
  const registered = await prisma.expiry.findMany({
    where: { personId, expiryType: { kind: 'RATING', blocksBooking: true, isActive: true } },
    select: { expiresAt: true, expiryType: { select: { name: true } } },
  });
  const expired = registered.filter((expiry) => toDateOnlyString(expiry.expiresAt) < dateOnly);
  const missing = await prisma.expiryType.findMany({
    where: { kind: 'RATING', blocksBooking: true, isActive: true, scope: { in: scopes }, expiries: { none: { personId } } },
    select: { name: true },
  });
  const medical = await getMedicalRequirementFailure(personId, dateOnly);

  return [
    ...expired
      .map((expiry) => ({ typeName: expiry.expiryType.name, expiresAt: toDateOnlyString(expiry.expiresAt) }))
      .sort((left, right) => compareNames(left.typeName, right.typeName)),
    ...missing.map((type) => ({ typeName: type.name, expiresAt: null })).sort((left, right) => compareNames(left.typeName, right.typeName)),
    ...(medical === null ? [] : [medical]),
  ].map((document) => ({ type: 'EXPIRY' as const, role, personName, typeName: document.typeName, expiresAt: document.expiresAt }));
}

async function membershipFailure(personId: string, personName: string, role: Role, dateOnly: string): Promise<RequirementFailure[]> {
  const membership = await getMembershipStatus(personId, dateOnly);
  return membership.status === 'valid' ? [] : [{ type: 'MEMBERSHIP', role, personName, expiresAt: membership.expiresAt }];
}

export async function evaluateRequirements(input: RequirementsInput): Promise<RequirementFailure[]> {
  const { person, instructor } = input;
  const failures: RequirementFailure[] = [];

  if (input.documents) {
    const personScopes: ExpiryScope[] = ['ALL'];
    if (person.hasActivePilot) personScopes.push('PILOTS');
    if (person.hasActiveStudent) personScopes.push('STUDENTS');
    if (person.hasActiveInstructor) personScopes.push('INSTRUCTORS');

    failures.push(...(await expiryFailures(person.id, person.name, 'person', personScopes, input.expiryDateOnly)));
    if (instructor !== null) {
      failures.push(...(await expiryFailures(instructor.personId, instructor.name, 'instructor', ['ALL', 'INSTRUCTORS'], input.expiryDateOnly)));
    }
    failures.push(...(await membershipFailure(person.id, person.name, 'person', input.membershipDateOnly)));
    if (instructor !== null) {
      failures.push(...(await membershipFailure(instructor.personId, instructor.name, 'instructor', input.membershipDateOnly)));
    }
  }

  if (input.currency !== null) {
    const { dateOnly, excludeFlightId } = input.currency;
    const currency = await getCurrencyStatus(person.id, dateOnly, { excludeFlightId: excludeFlightId ?? undefined });
    if (!currency.current) {
      // Read only on a failure: the message quotes the X and Y it was judged with.
      const settings = await getCurrencySettings();
      failures.push({
        type: 'CURRENCY',
        role: 'person',
        personName: person.name,
        lastFlightDate: currency.lastFlightDate,
        daysSinceLastFlight: currency.lastFlightDate === null ? null : daysUntilUtc(parseDateOnlyUtc(dateOnly), parseDateOnlyUtc(currency.lastFlightDate)),
        flightsInWindow: currency.flightsInWindow,
        minFlights: settings.minFlights,
        windowDays: settings.windowDays,
      });
    }
  }

  if (input.balance !== null) {
    const aggregate = await prisma.accountMovement.aggregate({ where: { account: { personId: person.id } }, _sum: { amountCents: true } });
    const balanceCents = (aggregate._sum.amountCents ?? 0) + input.balance.creditCents;
    if (balanceCents < input.balance.costCents) {
      failures.push({ type: 'BALANCE', role: 'person', personName: person.name, balanceCents, costCents: input.balance.costCents });
    }
  }

  return failures;
}

/** The 422 of the shared contract (`schemas/requirements.ts`) — flights, bookings and the membership fee throw it the same way. */
export function throwRequirementsNotMet(failures: RequirementFailure[]): never {
  const types = Array.from(new Set(failures.map((failure) => failure.type))).join(', ');
  throw new ValidationError(`Requirements not met: ${types}.`, { failures }, 'REQUIREMENTS_NOT_MET');
}
