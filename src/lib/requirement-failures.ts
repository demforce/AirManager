/**
 * One failed requirement of the shared warning (story 19.9, AD-6) — the
 * `Requirements.failure.*` key it reads with and the values it fills, so the
 * component only translates. Shared by the flight form and, from story
 * 19.10, by the booking forms and the membership fee.
 *
 * Pure: no service and no `next-intl` import (unit-tested, CLAUDE.md's
 * eager-env rule). Dates and money come in already formatted by the caller's
 * locale; the counts stay NUMBERS, because the ICU plurals of the currency
 * messages ("1 volo" / "2 voli") read them.
 */
import type { RequirementFailure } from '@/lib/schemas/requirements';

export type RequirementFailureKey =
  | 'expiryExpired'
  | 'expiryMissing'
  | 'membershipExpired'
  | 'membershipMissing'
  | 'currency'
  | 'currencyNever'
  | 'balance'
  | 'outOfService'
  | 'outOfServiceUntil';

export type DescribedRequirementFailure = {
  /** Whose requirement it is; `null` for the aircraft out of service. */
  who: { name: string; role: 'person' | 'instructor' } | null;
  key: RequirementFailureKey;
  values: Record<string, string | number>;
};

export function describeRequirementFailure(
  failure: RequirementFailure,
  format: { formatDate: (dateOnly: string) => string; formatMoney: (cents: number) => string },
): DescribedRequirementFailure {
  switch (failure.type) {
    case 'EXPIRY':
      return {
        who: { name: failure.personName, role: failure.role },
        ...(failure.expiresAt === null
          ? { key: 'expiryMissing' as const, values: { typeName: failure.typeName } }
          : { key: 'expiryExpired' as const, values: { typeName: failure.typeName, date: format.formatDate(failure.expiresAt) } }),
      };
    case 'MEMBERSHIP':
      return {
        who: { name: failure.personName, role: failure.role },
        ...(failure.expiresAt === null
          ? { key: 'membershipMissing' as const, values: {} }
          : { key: 'membershipExpired' as const, values: { date: format.formatDate(failure.expiresAt) } }),
      };
    case 'CURRENCY':
      return {
        who: { name: failure.personName, role: failure.role },
        ...(failure.lastFlightDate === null || failure.daysSinceLastFlight === null
          ? { key: 'currencyNever' as const, values: { minFlights: failure.minFlights, windowDays: failure.windowDays } }
          : {
              key: 'currency' as const,
              values: {
                flightsInWindow: failure.flightsInWindow,
                windowDays: failure.windowDays,
                minFlights: failure.minFlights,
                date: format.formatDate(failure.lastFlightDate),
                days: failure.daysSinceLastFlight,
              },
            }),
      };
    case 'BALANCE':
      return {
        who: { name: failure.personName, role: failure.role },
        key: 'balance',
        values: { balance: format.formatMoney(failure.balanceCents), cost: format.formatMoney(failure.costCents) },
      };
    case 'AIRCRAFT_OUT_OF_SERVICE':
      return {
        who: null,
        ...(failure.outOfServiceUntil === null
          ? { key: 'outOfService' as const, values: { registration: failure.registration, reason: failure.reason ?? '' } }
          : {
              key: 'outOfServiceUntil' as const,
              values: { registration: failure.registration, reason: failure.reason ?? '', date: format.formatDate(failure.outOfServiceUntil) },
            }),
      };
  }
}
