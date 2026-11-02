import { describe, expect, it } from 'vitest';
import { computeExpiryStatus, daysUntilUtc, EXPIRY_ALERT_THRESHOLDS, EXPIRY_WARNING_DAYS } from './expiry-status';

/** Same UTC-midnight convention as `date-only.ts` — every test date is explicit, never `new Date()`. */
function utcDate(isoDateOnly: string): Date {
  const [year, month, day] = isoDateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

describe('computeExpiryStatus (story 6.2, AC 1 — the shared ok/expiring/expired boundary)', () => {
  const today = utcDate('2026-07-08');

  it('EXPIRY_WARNING_DAYS is 60 (Contesto)', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(60);
  });

  it('61 days remaining -> ok (just past the warning window)', () => {
    expect(computeExpiryStatus(addDaysUtc(today, 61), today)).toBe('ok');
  });

  it('60 days remaining -> expiring (the warning-window boundary, inclusive)', () => {
    expect(computeExpiryStatus(addDaysUtc(today, 60), today)).toBe('expiring');
  });

  it('59 days remaining -> expiring', () => {
    expect(computeExpiryStatus(addDaysUtc(today, 59), today)).toBe('expiring');
  });

  it('1 day remaining -> expiring', () => {
    expect(computeExpiryStatus(addDaysUtc(today, 1), today)).toBe('expiring');
  });

  it('0 days remaining (expires today) -> expiring, NOT expired (the expiry day itself is still valid)', () => {
    expect(computeExpiryStatus(today, today)).toBe('expiring');
  });

  it('-1 day remaining (expired yesterday) -> expired', () => {
    expect(computeExpiryStatus(addDaysUtc(today, -1), today)).toBe('expired');
  });

  it('far in the past -> expired', () => {
    expect(computeExpiryStatus(utcDate('2020-01-01'), today)).toBe('expired');
  });

  it('far in the future -> ok', () => {
    expect(computeExpiryStatus(utcDate('2030-01-01'), today)).toBe('ok');
  });
});

describe('daysUntilUtc (story 6.3 — the shared day-boundary arithmetic, extracted for the alert job)', () => {
  const today = utcDate('2026-07-08');

  it('positive when expiresAt is ahead of today', () => {
    expect(daysUntilUtc(addDaysUtc(today, 7), today)).toBe(7);
  });

  it('0 when expiresAt is today', () => {
    expect(daysUntilUtc(today, today)).toBe(0);
  });

  it('negative when expiresAt is in the past', () => {
    expect(daysUntilUtc(addDaysUtc(today, -3), today)).toBe(-3);
  });
});

describe('EXPIRY_ALERT_THRESHOLDS (story 6.3, Contesto)', () => {
  it('is exactly [60, 30, 7, 0], in that order', () => {
    expect(EXPIRY_ALERT_THRESHOLDS).toEqual([60, 30, 7, 0]);
  });
});
