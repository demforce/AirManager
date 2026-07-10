import { describe, expect, it } from 'vitest';
import { buildExportHref } from './export-href';

describe('buildExportHref (story 10.1, AC 1/5)', () => {
  it('appends format=xlsx and the given locale', () => {
    expect(buildExportHref('/api/v1/people', {}, 'it')).toBe('/api/v1/people?format=xlsx&locale=it');
  });

  it('includes every non-empty filter, omitting undefined/empty ones', () => {
    const href = buildExportHref('/api/v1/flights', { dateFrom: '2026-01-01', dateTo: '', aircraftId: undefined, status: 'CANCELLED' }, 'en');
    const url = new URL(href, 'http://localhost');
    expect(url.searchParams.get('dateFrom')).toBe('2026-01-01');
    expect(url.searchParams.get('dateTo')).toBeNull();
    expect(url.searchParams.get('aircraftId')).toBeNull();
    expect(url.searchParams.get('status')).toBe('CANCELLED');
    expect(url.searchParams.get('format')).toBe('xlsx');
    expect(url.searchParams.get('locale')).toBe('en');
  });
});
