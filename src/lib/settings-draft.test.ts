import { describe, expect, it } from 'vitest';
import {
  buildSettingsPatch,
  dirtySections,
  expiryTypeRowState,
  mapSaveError,
  NO_SETTINGS_ERRORS,
  testEmailBlocked,
  toDraft,
  validateDraft,
  type SettingsDraft,
  type SettingsPatchIndex,
  type SettingsSnapshotData,
} from './settings-draft';

/** A fresh install: nothing saved but the factory defaults (scheduling and SMTP all `null`). */
function freshSnapshot(): SettingsSnapshotData {
  return {
    airfield: { name: 'AirManager' },
    club: { icao: '', contactEmail: '' },
    metarStation: { station: '' },
    membershipFee: { annualFeeCents: 0 },
    currency: { minFlights: 1, windowDays: 90 },
    scheduling: { openTime: null, closeTime: null, minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null },
    smtp: { host: null, port: null, security: null, user: null, from: null, hasPassword: false },
    treasury: { openingCashCents: 0, openingBankCents: 0, openingDate: null },
    expiryTypes: [],
    cashCategories: [],
  };
}

function configuredSnapshot(): SettingsSnapshotData {
  return {
    ...freshSnapshot(),
    club: { icao: 'LIRB', contactEmail: 'ops@example.com' },
    membershipFee: { annualFeeCents: 6000 },
    scheduling: { openTime: '08:00', closeTime: '20:00', minSlotMinutes: 30, turnaroundMinutes: 10, maxAdvanceDays: 45 },
    smtp: { host: 'smtp.example.com', port: 587, security: 'STARTTLS', user: 'ops', from: 'Club <ops@example.com>', hasPassword: true },
    treasury: { openingCashCents: 12345, openingBankCents: -500, openingDate: '2026-01-01' },
    expiryTypes: [
      { id: 'et_r', name: 'Notturna', scope: 'PILOTS', kind: 'RATING', isActive: true, blocksBooking: false, validityMonths: 24 },
      { id: 'et_m', name: 'Visita classe 2', scope: 'ALL', kind: 'MEDICAL', isActive: true, blocksBooking: true, validityMonths: 60 },
    ],
    cashCategories: [
      { id: 'cc_1', name: 'Carburante', isActive: true, movementCount: 4, isSystem: false },
      { id: 'cc_sys', name: 'Ricariche', isActive: true, movementCount: 9, isSystem: true },
    ],
  };
}

function edit(draft: SettingsDraft, change: (draft: SettingsDraft) => void): SettingsDraft {
  const next = structuredClone(draft);
  change(next);
  return next;
}

describe('toDraft (AD-9)', () => {
  it('shows the defaults of an unconfigured install, and that page is CLEAN (trap 3: the first Salva never writes them)', () => {
    const baseline = toDraft(freshSnapshot());
    expect(baseline.scheduling).toEqual({ openTime: '07:00', closeTime: '21:00', minSlotMinutes: '60', turnaroundMinutes: '15', maxAdvanceDays: '30' });
    expect(baseline.smtp).toMatchObject({ port: '587', security: 'STARTTLS', host: '' });
    expect(baseline.treasury).toEqual({ cash: '0.00', bank: '0.00', date: '' });

    const draft = toDraft(freshSnapshot());
    expect(buildSettingsPatch(baseline, draft)).toBeNull();
    expect(dirtySections(baseline, draft)).toEqual([]);
  });

  it('splits the expiry types by kind and keeps amounts at two decimals', () => {
    const draft = toDraft(configuredSnapshot());
    expect(draft.ratings.map((item) => item.name)).toEqual(['Notturna']);
    expect(draft.medical.map((item) => item.name)).toEqual(['Visita classe 2']);
    expect(draft.membership.fee).toBe('60.00');
    expect(draft.treasury.bank).toBe('-5.00');
  });
});

describe('buildSettingsPatch — only what changed (D-3, AC 10)', () => {
  const baseline = toDraft(configuredSnapshot());

  it('one field of a block sends the WHOLE block, and nothing else', () => {
    const patch = buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.scheduling.closeTime = '21:00')));
    expect(patch?.body).toEqual({ scheduling: { openTime: '08:00', closeTime: '21:00', minSlotMinutes: 30, turnaroundMinutes: 10, maxAdvanceDays: 45 } });
  });

  it('"60" and "60.00" are the same amount — retyping the saved value is clean again (trap 4)', () => {
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.membership.fee = '60')))).toBeNull();
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.membership.fee = '60,00')))).toBeNull();
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.membership.fee = '65')))?.body).toEqual({ membershipFee: { annualFeeCents: 6500 } });
  });

  it('a value that does not parse is a change (so the Salva enables and the check names it)', () => {
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.membership.fee = 'abc')))?.body).toHaveProperty('membershipFee');
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.currency.minFlights = '1.5')))?.body).toHaveProperty('currency');
  });

  it('ICAO and email compare as they save (upper-cased, trimmed, lower-cased)', () => {
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.club.icao = ' lirb ')))).toBeNull();
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.club.contactEmail = 'OPS@example.com')))).toBeNull();
  });

  it('the Club section is three blocks: the name alone sends only airfield', () => {
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.club.name = 'Campo Volo')))?.body).toEqual({ airfield: { name: 'Campo Volo' } });
    expect(buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.club.metarStation = 'liml')))?.body).toEqual({ metarStation: { station: 'LIML' } });
  });

  it('SMTP password: empty → not sent and the block stays clean; typed → the block is sent WITH pass (P5)', () => {
    expect(buildSettingsPatch(baseline, baseline)).toBeNull();
    const withFrom = buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.smtp.from = 'New <new@example.com>')));
    expect(withFrom?.body.smtp).not.toHaveProperty('pass');
    const withPass = buildSettingsPatch(baseline, edit(baseline, (draft) => (draft.smtp.pass = 'secret')));
    expect(withPass?.body).toEqual({ smtp: { host: 'smtp.example.com', port: 587, security: 'STARTTLS', user: 'ops', from: 'Club <ops@example.com>', pass: 'secret' } });
  });

  it('lists: a new rating sends kind RATING with scope and flag, a new visit kind MEDICAL WITHOUT them', () => {
    const draft = edit(baseline, (next) => {
      next.ratings.unshift({ rowKey: 'new:1', kind: 'RATING', name: ' Montagna ', scope: 'ALL', validityMonths: '0', blocksBooking: true, isActive: true, removed: false });
      next.medical.unshift({ rowKey: 'new:2', kind: 'MEDICAL', name: 'Visita LAPL', scope: 'ALL', validityMonths: '24', blocksBooking: true, isActive: true, removed: false });
    });
    const patch = buildSettingsPatch(baseline, draft);
    expect(patch?.body).toEqual({
      expiryTypes: {
        create: [
          { name: 'Montagna', kind: 'RATING', scope: 'ALL', blocksBooking: true, validityMonths: null },
          { name: 'Visita LAPL', kind: 'MEDICAL', validityMonths: 24 },
        ],
      },
    });
    expect(patch?.index.expiryTypes.create).toEqual(['new:1', 'new:2']);
  });

  it('lists: an update carries only the changed fields; a visit never sends scope/blocksBooking; a removal is a delete', () => {
    const draft = edit(baseline, (next) => {
      next.ratings[0]!.scope = 'STUDENTS';
      next.medical[0]!.isActive = false;
      next.cashCategories[0]!.removed = true;
      next.cashCategories[1]!.isActive = false;
    });
    const patch = buildSettingsPatch(baseline, draft);
    expect(patch?.body).toEqual({
      expiryTypes: { update: [{ id: 'et_r', scope: 'STUDENTS' }, { id: 'et_m', isActive: false }] },
      cashCategories: { update: [{ id: 'cc_sys', isActive: false }], delete: ['cc_1'] },
    });
    expect(patch?.index).toEqual<SettingsPatchIndex>({
      expiryTypes: { create: [], update: ['et_r', 'et_m'], delete: [] },
      cashCategories: { create: [], update: ['cc_sys'], delete: ['cc_1'] },
    });
  });

  it('touching only a list sends only that list (the condition that keeps expiry-types.spec outside the serialized chain, AC 20)', () => {
    const patch = buildSettingsPatch(baseline, edit(baseline, (next) => (next.ratings[0]!.validityMonths = '12')));
    expect(Object.keys(patch?.body ?? {})).toEqual(['expiryTypes']);
  });

  it('a change undone by hand is clean again, also on a row', () => {
    const draft = edit(baseline, (next) => {
      next.ratings[0]!.name = 'Notturna ';
      next.ratings[0]!.validityMonths = '24';
    });
    expect(buildSettingsPatch(baseline, draft)).toBeNull();
    expect(expiryTypeRowState(draft.ratings[0]!, baseline.ratings[0])).toBe('saved');
  });
});

describe('dirtySections and row states (D-4, D-7)', () => {
  const baseline = toDraft(configuredSnapshot());

  it('lists the touched sections in page order', () => {
    const draft = edit(baseline, (next) => {
      next.cashCategories[0]!.name = 'Benzina';
      next.club.icao = 'LIML';
      next.currency.windowDays = '60';
    });
    expect(dirtySections(baseline, draft)).toEqual(['club', 'currency', 'cashCategories']);
  });

  it('new / changed / removed / saved', () => {
    const draft = edit(baseline, (next) => {
      next.ratings[0]!.removed = true;
      next.medical[0]!.validityMonths = '36';
    });
    expect(expiryTypeRowState(draft.ratings[0]!, baseline.ratings[0])).toBe('removed');
    expect(expiryTypeRowState(draft.medical[0]!, baseline.medical[0])).toBe('changed');
    expect(expiryTypeRowState({ ...draft.ratings[0]!, id: undefined, rowKey: 'new:1' }, undefined)).toBe('new');
  });
});

describe('testEmailBlocked (D-9)', () => {
  const baseline = toDraft(configuredSnapshot());

  it('blocked while SMTP or the contact email have unsaved changes, free otherwise', () => {
    expect(testEmailBlocked(baseline, baseline)).toBe(false);
    expect(testEmailBlocked(baseline, edit(baseline, (draft) => (draft.smtp.host = 'other.example.com')))).toBe(true);
    expect(testEmailBlocked(baseline, edit(baseline, (draft) => (draft.smtp.pass = 'x')))).toBe(true);
    expect(testEmailBlocked(baseline, edit(baseline, (draft) => (draft.club.contactEmail = 'new@example.com')))).toBe(true);
    // The ICAO is not the test email's business.
    expect(testEmailBlocked(baseline, edit(baseline, (draft) => (draft.club.icao = 'LIML')))).toBe(false);
  });
});

describe('validateDraft — the client mirror (AD-9)', () => {
  const baseline = toDraft(configuredSnapshot());

  function errorsOf(draft: SettingsDraft) {
    const patch = buildSettingsPatch(baseline, draft);
    expect(patch).not.toBeNull();
    return validateDraft(baseline, draft, patch!);
  }

  it('a valid change has no errors', () => {
    expect(errorsOf(edit(baseline, (draft) => (draft.club.icao = 'LIML')))).toEqual(NO_SETTINGS_ERRORS);
  });

  it('the airfield name is required; the contact email empty or valid', () => {
    expect(errorsOf(edit(baseline, (draft) => (draft.club.name = '  '))).fields).toEqual({ 'airfield.name': { key: 'required' } });
    expect(errorsOf(edit(baseline, (draft) => (draft.club.contactEmail = 'not-an-email'))).fields).toEqual({ 'club.contactEmail': { key: 'invalidEmail' } });
    expect(errorsOf(edit(baseline, (draft) => (draft.club.contactEmail = ''))).fields).toEqual({});
  });

  it('amounts: the fee is >= 0, a treasury balance may be negative, both must parse; the date is required', () => {
    expect(errorsOf(edit(baseline, (draft) => (draft.membership.fee = '-1'))).fields).toEqual({ 'membershipFee.annualFeeCents': { key: 'invalidAmount' } });
    expect(errorsOf(edit(baseline, (draft) => (draft.treasury.bank = '-10'))).fields).toEqual({});
    expect(
      errorsOf(
        edit(baseline, (draft) => {
          draft.treasury.cash = 'non-un-numero';
          draft.treasury.date = '';
        }),
      ).fields,
    ).toEqual({ 'treasury.openingCashCents': { key: 'invalidAmount' }, 'treasury.openingDate': { key: 'requiredDate' } });
  });

  it('currency: X an integer 1..99, Y an integer 1..3650 (the 19.7a limits)', () => {
    expect(
      errorsOf(
        edit(baseline, (draft) => {
          draft.currency.minFlights = '0';
          draft.currency.windowDays = '3651';
        }),
      ).fields,
    ).toEqual({ 'currency.minFlights': { key: 'integerRange', min: 1, max: 99 }, 'currency.windowDays': { key: 'integerRange', min: 1, max: 3650 } });
    expect(errorsOf(edit(baseline, (draft) => (draft.currency.minFlights = '99'))).fields).toEqual({});
  });

  it('scheduling: the close after the open', () => {
    expect(errorsOf(edit(baseline, (draft) => (draft.scheduling.closeTime = '08:00'))).fields).toEqual({ 'scheduling.closeTime': { key: 'invalidRange' } });
  });

  it('SMTP: host and from required, port 1..65535 — checked only when the block is being saved', () => {
    expect(
      errorsOf(
        edit(baseline, (draft) => {
          draft.smtp.host = '';
          draft.smtp.port = '70000';
        }),
      ).fields,
    ).toEqual({ 'smtp.host': { key: 'required' }, 'smtp.port': { key: 'integerRange', min: 1, max: 65535 } });

    // A fresh install has an EMPTY host on screen — not a problem until SMTP itself is touched.
    const fresh = toDraft(freshSnapshot());
    const draft = edit(fresh, (next) => (next.club.icao = 'LIRB'));
    expect(validateDraft(fresh, draft, buildSettingsPatch(fresh, draft)!).fields).toEqual({});
  });

  it('lists: a name is required and unique across the final list (ratings and visits share it), validity an integer 0..600', () => {
    const errors = errorsOf(
      edit(baseline, (draft) => {
        draft.ratings.unshift({ rowKey: 'new:1', kind: 'RATING', name: '', scope: 'ALL', validityMonths: '0', blocksBooking: false, isActive: true, removed: false });
        draft.medical.unshift({ rowKey: 'new:2', kind: 'MEDICAL', name: 'Notturna', scope: 'ALL', validityMonths: '0', blocksBooking: true, isActive: true, removed: false });
        draft.cashCategories.unshift({ rowKey: 'new:3', name: 'Nuova', isActive: true, removed: false, movementCount: 0, isSystem: false });
        draft.medical[1]!.validityMonths = '601';
      }),
    );
    expect(errors.items).toEqual({
      'new:1': { field: 'name', message: { key: 'required' } },
      // The visit takes the name of a RATING: the duplicate is in the OTHER list (review 19.8 F6).
      'new:2': { field: 'name', message: { key: 'duplicateNameOtherList' } },
      et_m: { field: 'validity', message: { key: 'integerRange', min: 0, max: 600 } },
    });
    expect(errors.bar).toBe('checkFields');
  });

  it('a duplicate inside the SAME list says "in this list" (review 19.8 F6)', () => {
    const errors = errorsOf(
      edit(baseline, (draft) => {
        draft.ratings.unshift({ rowKey: 'new:1', kind: 'RATING', name: 'Notturna', scope: 'ALL', validityMonths: '0', blocksBooking: false, isActive: true, removed: false });
        draft.cashCategories.unshift({ rowKey: 'new:2', name: 'Carburante', isActive: true, removed: false, movementCount: 0, isSystem: false });
      }),
    );
    expect(errors.items).toEqual({
      'new:1': { field: 'name', message: { key: 'duplicateName' } },
      'new:2': { field: 'name', message: { key: 'duplicateName' } },
    });
  });

  it('a row removed in the draft frees its name for a new row', () => {
    const errors = errorsOf(
      edit(baseline, (draft) => {
        draft.cashCategories[0]!.removed = true;
        draft.cashCategories.unshift({ rowKey: 'new:1', name: 'Carburante', isActive: true, removed: false, movementCount: 0, isSystem: false });
      }),
    );
    expect(errors.items).toEqual({});
  });
});

describe('mapSaveError (AD-5)', () => {
  const index: SettingsPatchIndex = {
    expiryTypes: { create: ['new:1', 'new:2'], update: ['et_r'], delete: [] },
    cashCategories: { create: [], update: [], delete: ['cc_1'] },
  };

  it('a shape 422 lands on the field of its dotted key, with that field\'s own message', () => {
    const errors = mapSaveError(422, { error: { code: 'VALIDATION_ERROR', details: { fieldErrors: { 'smtp.host': ['x'], 'club.contactEmail': ['y'] } } } }, index);
    expect(errors).toEqual({ fields: { 'smtp.host': { key: 'invalidHost' }, 'club.contactEmail': { key: 'invalidEmail' } }, items: {}, bar: 'checkFields' });
  });

  it('a shape 422 on a list entry lands on the row the array index came from', () => {
    const errors = mapSaveError(422, { error: { code: 'VALIDATION_ERROR', details: { fieldErrors: { 'expiryTypes.create.1.name': ['x'] } } } }, index);
    expect(errors.items).toEqual({ 'new:2': { field: 'name', message: { key: 'invalidItem' } } });
  });

  it.each([
    ['NAME_TAKEN', { field: 'name', message: { key: 'nameTaken' } }],
    ['NAME_RESERVED', { field: 'name', message: { key: 'nameReserved' } }],
    ['IN_USE', { field: null, message: { key: 'inUse' } }],
    ['SYSTEM_CATEGORY', { field: null, message: { key: 'systemCategory' } }],
    ['NOT_FOUND', { field: null, message: { key: 'stale' } }],
  ])('a 409 %s lands on its row', (reason, expected) => {
    const errors = mapSaveError(409, { error: { code: 'CONFLICT', details: { reason, item: { list: 'cashCategories', op: 'delete', index: 0, id: 'cc_1' } } } }, index);
    expect(errors).toEqual({ fields: {}, items: { cc_1: expected }, bar: 'checkFields' });
  });

  it('a 19.7a code with details.item lands on its row with the generic row message', () => {
    const errors = mapSaveError(422, { error: { code: 'MEDICAL_TYPE_FIELDS', details: { item: { list: 'expiryTypes', op: 'create', index: 0 } } } }, index);
    expect(errors.items).toEqual({ 'new:1': { field: null, message: { key: 'invalidItem' } } });
  });

  it('403 → the bar says so; a 500, a network failure or a body that is no envelope → the generic bar message', () => {
    expect(mapSaveError(403, { error: { code: 'FORBIDDEN' } }, index)).toEqual({ ...NO_SETTINGS_ERRORS, bar: 'forbidden' });
    expect(mapSaveError(500, { error: { code: 'INTERNAL_ERROR' } }, index).bar).toBe('generic');
    // Two saves aborted by Postgres (review 19.8 F2): no row to name, "try again" is the whole message.
    expect(mapSaveError(409, { error: { code: 'CONFLICT', details: { reason: 'CONCURRENT_SAVE' } } }, index)).toEqual({ ...NO_SETTINGS_ERRORS, bar: 'generic' });
    expect(mapSaveError(0, null, index).bar).toBe('generic');
  });

  it('a key the page does not know (the root, an unmapped row) is never dropped silently: generic bar', () => {
    expect(mapSaveError(422, { error: { code: 'VALIDATION_ERROR', details: { fieldErrors: { '': ['empty'] } } } }, index).bar).toBe('generic');
    expect(mapSaveError(409, { error: { code: 'CONFLICT', details: { reason: 'IN_USE', item: { list: 'cashCategories', op: 'delete', index: 5 } } } }, index).bar).toBe('generic');
  });
});
