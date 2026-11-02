import { describe, expect, it } from 'vitest';
import { evaluateMedicalRequirement } from './medical-requirement';

const ACTIVE = ['Visita medica classe 2', 'Visita medica LAPL', 'Visita medica classe 1'];
const DAY = '2026-06-15';

describe('evaluateMedicalRequirement (story 19.7a, R-19-j, D-4)', () => {
  it('(a) no active MEDICAL type: the requirement is off, even with only expired visits', () => {
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: [], medicals: [{ typeName: 'Visita medica classe 2', expiresAt: '2020-01-01' }] }, DAY)).toBeNull();
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: [], medicals: [] }, DAY)).toBeNull();
  });

  it('(b) one valid visit beside an expired one satisfies the requirement — any class counts', () => {
    const medicals = [
      { typeName: 'Visita medica classe 2', expiresAt: '2026-01-01' },
      { typeName: 'Visita medica classe 1', expiresAt: '2027-01-01' },
    ];
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals }, DAY)).toBeNull();
  });

  it('(c) a visit expiring ON the date is still valid', () => {
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals: [{ typeName: 'Visita medica LAPL', expiresAt: DAY }] }, DAY)).toBeNull();
  });

  it('(d) a visit expired the day before fails, with that visit as the document', () => {
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals: [{ typeName: 'Visita medica LAPL', expiresAt: '2026-06-14' }] }, DAY)).toEqual({
      typeName: 'Visita medica LAPL',
      expiresAt: '2026-06-14',
    });
  });

  it('(e) only expired visits: ONE document, the most recently expired', () => {
    const medicals = [
      { typeName: 'Visita medica classe 2', expiresAt: '2026-03-01' },
      { typeName: 'Visita medica LAPL', expiresAt: '2026-05-20' },
      { typeName: 'Visita medica classe 1', expiresAt: '2025-12-31' },
    ];
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals }, DAY)).toEqual({ typeName: 'Visita medica LAPL', expiresAt: '2026-05-20' });
  });

  it('(e) on a tie of dates, the alphabetically smaller name — whatever the input order', () => {
    const medicals = [
      { typeName: 'Visita medica classe 2', expiresAt: '2026-05-20' },
      { typeName: 'Visita medica classe 1', expiresAt: '2026-05-20' },
    ];
    const expected = { typeName: 'Visita medica classe 1', expiresAt: '2026-05-20' };
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals }, DAY)).toEqual(expected);
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals: [...medicals].reverse() }, DAY)).toEqual(expected);
  });

  it('(f) no visit at all: ONE "missing" document naming the active types, alphabetical, joined by " / "', () => {
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ACTIVE, medicals: [] }, DAY)).toEqual({
      typeName: 'Visita medica classe 1 / Visita medica classe 2 / Visita medica LAPL',
      expiresAt: null,
    });
  });

  it('a visit of a DEACTIVATED type still satisfies the requirement (only the active types name the missing document)', () => {
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ['Visita medica classe 2'], medicals: [{ typeName: 'Visita storica', expiresAt: '2030-01-01' }] }, DAY)).toBeNull();
    expect(evaluateMedicalRequirement({ activeMedicalTypeNames: ['Visita medica classe 2'], medicals: [] }, DAY)).toEqual({ typeName: 'Visita medica classe 2', expiresAt: null });
  });
});
