import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetar, parseMetarEntry } from './metar.service';

/**
 * TDD (story 12.11, AC 5) — `parseMetarEntry` is tested SOLELY on offline
 * fixtures (Dev Notes: "MAI rete nei test"); `getMetar`'s cache/degrade
 * behavior mocks `global.fetch` (never a real network call).
 */

/** Verified real `aviationweather.gov` response shape (WebFetch against the live API, story 12.11 recon) — the KJFK example. */
const REAL_ENTRY = {
  icaoId: 'KJFK',
  temp: 29.4,
  dewp: 13.9,
  wdir: 240,
  wspd: 5,
  visib: '10+',
  altim: 1017.7,
  metarType: 'METAR',
  rawOb: 'METAR KJFK 171651Z 24005KT 10SM BKN250 29/14 A3005 RMK AO2 SLP176 T02940139 $',
  clouds: [{ cover: 'BKN', base: 25000 }],
  fltCat: 'VFR',
};

describe('parseMetarEntry (Story 12.11, AC 5)', () => {
  it('parses a real aviationweather.gov entry', () => {
    expect(parseMetarEntry(REAL_ENTRY)).toEqual({
      raw: REAL_ENTRY.rawOb,
      tempC: 29.4,
      windDir: 240,
      windKt: 5,
      visM: Math.round(10 * 1609.344),
      qnh: 1017.7,
      category: 'VFR',
    });
  });

  it.each([null, undefined, 'x', 42, []])('a non-object entry %p returns null', (entry) => {
    expect(parseMetarEntry(entry)).toBeNull();
  });

  it.each(['rawOb', 'temp', 'wspd', 'altim'])('missing the required field %s returns null', (field) => {
    const entry = { ...REAL_ENTRY };
    delete (entry as Record<string, unknown>)[field];
    expect(parseMetarEntry(entry)).toBeNull();
  });

  it('a variable wind ("VRB", wdir not a number) degrades windDir to 0 rather than nulling the whole reading', () => {
    const result = parseMetarEntry({ ...REAL_ENTRY, wdir: 'VRB' });
    expect(result?.windDir).toBe(0);
    expect(result?.raw).toBe(REAL_ENTRY.rawOb);
  });

  it('an unparsed visibility degrades visM to 0 rather than nulling the whole reading', () => {
    const result = parseMetarEntry({ ...REAL_ENTRY, visib: '1/2' });
    expect(result?.visM).toBe(0);
  });

  it('a plain numeric visib is accepted directly', () => {
    const result = parseMetarEntry({ ...REAL_ENTRY, visib: 5 });
    expect(result?.visM).toBe(Math.round(5 * 1609.344));
  });

  it('fltCat is used verbatim when it is one of VFR/MVFR/IFR', () => {
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: 'MVFR' })?.category).toBe('MVFR');
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: 'IFR' })?.category).toBe('IFR');
  });

  it('fltCat LIFR is bucketed into our narrower IFR category', () => {
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: 'LIFR' })?.category).toBe('IFR');
  });

  it('an absent/unrecognized fltCat derives the category from visibility/ceiling', () => {
    // vis 10SM, no BKN/OVC layer -> VFR.
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: undefined, clouds: [{ cover: 'SCT', base: 2000 }] })?.category).toBe('VFR');
    // vis 4SM -> MVFR (<=5, not <3).
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: undefined, visib: '4', clouds: [] })?.category).toBe('MVFR');
    // vis 2SM -> IFR (<3).
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: undefined, visib: '2', clouds: [] })?.category).toBe('IFR');
    // ceiling 800ft (BKN) -> IFR, regardless of good visibility.
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: undefined, clouds: [{ cover: 'BKN', base: 800 }] })?.category).toBe('IFR');
    // ceiling 2000ft (OVC) -> MVFR.
    expect(parseMetarEntry({ ...REAL_ENTRY, fltCat: undefined, clouds: [{ cover: 'OVC', base: 2000 }] })?.category).toBe('MVFR');
  });
});

describe('getMetar (Story 12.11, AC 5) — cache + degrade-to-null, mocked fetch (never real network)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('an empty/blank station short-circuits to null with NO fetch at all', async () => {
    await expect(getMetar('')).resolves.toBeNull();
    await expect(getMetar('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches, parses, and caches a successful response — a second call within the TTL does NOT re-fetch', async () => {
    const station = `TEST_${Math.random()}`; // unique key per test — the module-level cache persists across tests otherwise.
    fetchMock.mockResolvedValue({ ok: true, json: async () => [REAL_ENTRY] });

    const first = await getMetar(station);
    expect(first?.category).toBe('VFR');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await getMetar(station);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cache hit, no second fetch.
  });

  it('a non-ok HTTP response degrades to null, never throws', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(getMetar(`TEST_${Math.random()}`)).resolves.toBeNull();
  });

  it('an empty result array degrades to null', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await expect(getMetar(`TEST_${Math.random()}`)).resolves.toBeNull();
  });

  it('a thrown network error degrades to null, never throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(getMetar(`TEST_${Math.random()}`)).resolves.toBeNull();
  });

  it('malformed JSON (json() throws) degrades to null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    });
    await expect(getMetar(`TEST_${Math.random()}`)).resolves.toBeNull();
  });
});
