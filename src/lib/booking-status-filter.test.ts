import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS_VALUES, sanitizeBookingStatusFilter } from './booking-status-filter';

/**
 * Story 15.4 (ratifica R-15.4-e): same contract as `?view`/`?date` — a
 * hand-edited value NEVER errors and NEVER narrows the list to nothing; it
 * falls back to "every status".
 */
describe('sanitizeBookingStatusFilter', () => {
  it('defaults to every status when the param is absent', () => {
    expect(sanitizeBookingStatusFilter(undefined)).toEqual({ statuses: [...BOOKING_STATUS_VALUES], param: null });
  });

  it('defaults to every status on an empty string', () => {
    expect(sanitizeBookingStatusFilter('')).toEqual({ statuses: [...BOOKING_STATUS_VALUES], param: null });
  });

  it('keeps a single known status and echoes it back canonically', () => {
    expect(sanitizeBookingStatusFilter('PENDING')).toEqual({ statuses: ['PENDING'], param: 'PENDING' });
  });

  it('accepts a lowercase value (a hand-typed URL still filters)', () => {
    expect(sanitizeBookingStatusFilter('pending')).toEqual({ statuses: ['PENDING'], param: 'PENDING' });
  });

  it('accepts a comma-separated list, in canonical order and de-duplicated', () => {
    expect(sanitizeBookingStatusFilter('APPROVED, PENDING ,APPROVED')).toEqual({ statuses: ['PENDING', 'APPROVED'], param: 'PENDING,APPROVED' });
  });

  it('drops the unknown values of a mixed list and keeps the rest', () => {
    expect(sanitizeBookingStatusFilter('NOPE,FLOWN')).toEqual({ statuses: ['FLOWN'], param: 'FLOWN' });
  });

  it('falls back to every status when NOTHING is recognized (never an empty list, never an error)', () => {
    expect(sanitizeBookingStatusFilter('DROP TABLE;')).toEqual({ statuses: [...BOOKING_STATUS_VALUES], param: null });
  });

  it('treats "all six statuses" as no filter at all, so the URL stays clean', () => {
    expect(sanitizeBookingStatusFilter(BOOKING_STATUS_VALUES.join(','))).toEqual({ statuses: [...BOOKING_STATUS_VALUES], param: null });
  });

  // Review 15.4 F2: a REPEATED `?status=PENDING&status=APPROVED` reaches this
  // function as an ARRAY (App Router `searchParams`), which used to throw
  // `raw.split is not a function` and answer 500 — measured on the production
  // build. Same result as the comma-separated form, by construction.
  it('accepts a repeated param (an ARRAY) exactly like the comma-separated list', () => {
    expect(sanitizeBookingStatusFilter(['PENDING', 'APPROVED'])).toEqual({ statuses: ['PENDING', 'APPROVED'], param: 'PENDING,APPROVED' });
  });

  it('sanitizes an array the same way it sanitizes a string (unknown values dropped, case-insensitive)', () => {
    expect(sanitizeBookingStatusFilter(['nope', 'flown'])).toEqual({ statuses: ['FLOWN'], param: 'FLOWN' });
  });

  it('falls back to every status on an EMPTY array, never an error', () => {
    expect(sanitizeBookingStatusFilter([])).toEqual({ statuses: [...BOOKING_STATUS_VALUES], param: null });
  });
});
