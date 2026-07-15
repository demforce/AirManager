import { describe, expect, it } from 'vitest';
import { deriveApprovedPprMovementStatus } from './ppr-movement-status';

/**
 * TDD (epic 12, story 12.4, AC 3): written BEFORE
 * `deriveApprovedPprMovementStatus` exists — mirrors `zoned-time.test.ts`'s
 * own edge-case shape (Rome-day boundary at 22-24 UTC, PR #17 lesson) since
 * this helper composes `dateOnlyInZone`.
 */

describe('deriveApprovedPprMovementStatus (epic 12, story 12.4, AC 3)', () => {
  it('eta already passed (same instant as now) -> AL_SUOLO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    expect(deriveApprovedPprMovementStatus(now, now)).toBe('AL_SUOLO');
  });

  it('eta 1ms in the past -> AL_SUOLO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const eta = new Date('2026-07-15T09:59:59.999Z');
    expect(deriveApprovedPprMovementStatus(eta, now)).toBe('AL_SUOLO');
  });

  it('eta a full day in the past (still APPROVED, never closed) -> AL_SUOLO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const eta = new Date('2026-07-10T08:00:00.000Z');
    expect(deriveApprovedPprMovementStatus(eta, now)).toBe('AL_SUOLO');
  });

  it('eta 1ms in the future, same Rome day -> IN_ARRIVO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const eta = new Date('2026-07-15T10:00:00.001Z');
    expect(deriveApprovedPprMovementStatus(eta, now)).toBe('IN_ARRIVO');
  });

  it('eta later today, same Rome day -> IN_ARRIVO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const eta = new Date('2026-07-15T20:00:00.000Z');
    expect(deriveApprovedPprMovementStatus(eta, now)).toBe('IN_ARRIVO');
  });

  it('eta tomorrow -> ATTESO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const eta = new Date('2026-07-16T08:00:00.000Z');
    expect(deriveApprovedPprMovementStatus(eta, now)).toBe('ATTESO');
  });

  it('eta far in the future -> ATTESO', () => {
    const now = new Date('2026-07-15T10:00:00.000Z');
    const eta = new Date('2026-09-01T08:00:00.000Z');
    expect(deriveApprovedPprMovementStatus(eta, now)).toBe('ATTESO');
  });

  describe('Rome-day boundary, CEST (July, UTC+2) — 22:00-24:00 UTC is already tomorrow in Rome (PR #17 lesson)', () => {
    it('now at 21:59 UTC (23:59 Rome, still "today"): an eta at 22:00 UTC the SAME UTC day is already Rome-tomorrow -> ATTESO, not IN_ARRIVO', () => {
      const now = new Date('2026-07-15T21:59:00.000Z');
      const eta = new Date('2026-07-15T22:00:00.000Z');
      expect(deriveApprovedPprMovementStatus(eta, now)).toBe('ATTESO');
    });

    it('now at 22:30 UTC (00:30 Rome, already "tomorrow"): an eta later the SAME UTC day (23:30 UTC) is the SAME Rome day as now -> IN_ARRIVO', () => {
      const now = new Date('2026-07-15T22:30:00.000Z');
      const eta = new Date('2026-07-15T23:30:00.000Z');
      expect(deriveApprovedPprMovementStatus(eta, now)).toBe('IN_ARRIVO');
    });
  });

  describe('Rome-day boundary, CET (January, UTC+1) — 23:00-24:00 UTC is already tomorrow in Rome', () => {
    it('now at 22:59 UTC (23:59 Rome, still "today"): an eta at 23:00 UTC the SAME UTC day is already Rome-tomorrow -> ATTESO', () => {
      const now = new Date('2026-01-15T22:59:00.000Z');
      const eta = new Date('2026-01-15T23:00:00.000Z');
      expect(deriveApprovedPprMovementStatus(eta, now)).toBe('ATTESO');
    });

    it('now at 23:30 UTC (00:30 Rome, already "tomorrow"): an eta later the SAME UTC day is the SAME Rome day as now -> IN_ARRIVO', () => {
      const now = new Date('2026-01-15T23:30:00.000Z');
      const eta = new Date('2026-01-15T23:45:00.000Z');
      expect(deriveApprovedPprMovementStatus(eta, now)).toBe('IN_ARRIVO');
    });
  });
});
