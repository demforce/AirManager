import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import it_ from '../../messages/it.json';

// Story 19.12a — the two catalogues compared key by key and argument by
// argument (AD-2), the `t.raw` × ICU guard (AD-3) and the rendering of every
// plural the story converted (AC 5). The glossary these copies follow is
// `docs/i18n/glossario-it.md`.

type Catalogue = { [key: string]: unknown };

function flatten(node: Catalogue, prefix = '', into = new Map<string, unknown>()): Map<string, unknown> {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') flatten(value as Catalogue, full, into);
    else into.set(full, value);
  }
  return into;
}

const catalogues = { it: flatten(it_), en: flatten(en) };
type Lang = keyof typeof catalogues;
const LANGS: Lang[] = ['it', 'en'];

/** Parsed ASTs; `null` for a value that is not a non-empty string or does not parse (check 2 reports why). */
const asts: Record<Lang, Map<string, MessageFormatElement[] | null>> = { it: new Map(), en: new Map() };
const parseErrors: string[] = [];
for (const lang of LANGS) {
  for (const [key, value] of catalogues[lang]) {
    if (typeof value !== 'string' || value.trim() === '') {
      parseErrors.push(`${lang} ${key}: not a non-empty string (${JSON.stringify(value)})`);
      asts[lang].set(key, null);
      continue;
    }
    try {
      asts[lang].set(key, parse(value));
    } catch (error) {
      parseErrors.push(`${lang} ${key}: ${(error as Error).message}`);
      asts[lang].set(key, null);
    }
  }
}

type ArgumentKind = 'simple' | 'number' | 'date' | 'time' | 'plural' | 'selectordinal' | 'select' | 'tag';
type Branching = { name: string; kind: 'plural' | 'selectordinal' | 'select'; options: string[] };

/** Every argument name with the kinds it is used as, nested plural/select branches and tag children included. */
function walk(elements: MessageFormatElement[], args = new Map<string, Set<ArgumentKind>>(), branchings: Branching[] = []) {
  const record = (name: string, kind: ArgumentKind) => args.set(name, (args.get(name) ?? new Set()).add(kind));
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        record(element.value, 'simple');
        break;
      case TYPE.number:
        record(element.value, 'number');
        break;
      case TYPE.date:
        record(element.value, 'date');
        break;
      case TYPE.time:
        record(element.value, 'time');
        break;
      case TYPE.plural:
      case TYPE.select: {
        const kind = element.type === TYPE.select ? 'select' : element.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
        record(element.value, kind);
        branchings.push({ name: element.value, kind, options: Object.keys(element.options) });
        for (const option of Object.values(element.options)) walk(option.value, args, branchings);
        break;
      }
      case TYPE.tag:
        record(element.value, 'tag');
        walk(element.children, args, branchings);
        break;
      default:
        break;
    }
  }
  return { args, branchings };
}

function sharedParsedKeys(): string[] {
  return [...catalogues.it.keys()].filter((key) => asts.it.get(key) && asts.en.get(key));
}

describe('messages/it.json and messages/en.json (story 19.12a, AD-2)', () => {
  it('have the same keys', () => {
    const missingInEn = [...catalogues.it.keys()].filter((key) => !catalogues.en.has(key));
    const missingInIt = [...catalogues.en.keys()].filter((key) => !catalogues.it.has(key));
    expect({ missingInEn, missingInIt }, 'keys present in one catalogue only').toEqual({ missingInEn: [], missingInIt: [] });
  });

  it('every value is a non-empty string that parses as ICU, in both languages', () => {
    expect(parseErrors, 'values that are empty or do not parse').toEqual([]);
  });

  it('every key has the same argument names in both languages, nested plural/select branches included', () => {
    const mismatches: string[] = [];
    for (const key of sharedParsedKeys()) {
      const itNames = [...walk(asts.it.get(key)!).args.keys()].sort();
      const enNames = [...walk(asts.en.get(key)!).args.keys()].sort();
      if (itNames.join() !== enNames.join()) mismatches.push(`${key}: it {${itNames.join(', ')}} / en {${enNames.join(', ')}}`);
    }
    expect(mismatches, 'keys whose arguments differ between it and en (an apostrophe before `{` in Italian swallows the argument)').toEqual([]);
  });

  it('every plural/select has an `other` branch, and every Italian plural a `one` or `=1` one', () => {
    const missing: string[] = [];
    for (const lang of LANGS) {
      for (const [key, ast] of asts[lang]) {
        if (!ast) continue;
        for (const branching of walk(ast).branchings) {
          if (!branching.options.includes('other')) missing.push(`${lang} ${key}: {${branching.name}, ${branching.kind}} has no \`other\``);
          if (lang === 'it' && branching.kind === 'plural' && !branching.options.includes('one') && !branching.options.includes('=1')) {
            missing.push(`it ${key}: {${branching.name}, plural} has neither \`one\` nor \`=1\``);
          }
        }
      }
    }
    expect(missing, 'plural/select branches that are missing').toEqual([]);
  });

  it('an argument is never a plural in one language and a select in the other (simple <-> plural is fine)', () => {
    const clashes: string[] = [];
    for (const key of sharedParsedKeys()) {
      const itArgs = walk(asts.it.get(key)!).args;
      const enArgs = walk(asts.en.get(key)!).args;
      for (const [name, itKinds] of itArgs) {
        const kinds = new Set([...itKinds, ...(enArgs.get(name) ?? [])]);
        if (kinds.has('select') && (kinds.has('plural') || kinds.has('selectordinal'))) {
          clashes.push(`${key}: {${name}} is ${[...itKinds].join('/')} in it, ${[...(enArgs.get(name) ?? [])].join('/')} in en`);
        }
      }
    }
    expect(clashes, 'arguments that are a plural in one language and a select in the other').toEqual([]);
  });
});

// AD-3: `t.raw` hands the client the message as written, so on a plural or a
// select it prints `{count, plural, …}` on screen and no typecheck sees it. A
// heuristic: the namespace of the translator is not resolved, so a call is
// matched against every key that ENDS with its path. A false positive is
// narrowed with the namespace declared in the file, never switched off.
describe('t.raw never reads a message with plural/select (story 19.12a, AD-3)', () => {
  it('no source file reads an ICU plural or select with t.raw', () => {
    const srcRoot = path.resolve(__dirname, '..');
    const sources = readdirSync(srcRoot, { recursive: true, encoding: 'utf8' }).filter(
      (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file),
    );
    const branchingKeys = new Set<string>();
    for (const lang of LANGS) {
      for (const [key, ast] of asts[lang]) {
        if (ast && walk(ast).branchings.length > 0) branchingKeys.add(key);
      }
    }
    const offending: string[] = [];
    for (const file of sources) {
      const source = readFileSync(path.join(srcRoot, file), 'utf8');
      for (const match of source.matchAll(/\.raw\(\s*['"]([\w.]+)['"]/g)) {
        const read = match[1]!;
        const line = source.slice(0, match.index).split('\n').length;
        for (const key of branchingKeys) {
          if (key === read || key.endsWith(`.${read}`)) offending.push(`src/${file}:${line} t.raw('${read}') -> ${key}`);
        }
      }
    }
    expect(offending, 't.raw calls on a plural/select message (format it with t(key, values) or useTranslations instead)').toEqual([]);
  });
});

// AC 5: every key story 19.12a turned into an Italian plural, rendered with 0,
// 1 and 2 (the `=0` branch included where there is one) through the same
// formatter the app uses, against copy written out by hand.
describe('the plurals converted by story 19.12a render in Italian (AC 5)', () => {
  const t = createTranslator({ locale: 'it', messages: it_ });
  type Key = Parameters<typeof t>[0];
  type Values = Parameters<typeof t>[1];
  const cases: Array<{ key: Key; values: (n: number) => Values; expected: [string, string, string] }> = [
    {
      key: 'PilotsPage.sub',
      values: (n) => ({ total: n, suspended: n }),
      expected: ['0 piloti · 0 sospesi', '1 pilota · 1 sospeso', '2 piloti · 2 sospesi'],
    },
    {
      key: 'InstructorsPage.sub',
      values: (n) => ({ active: n, owed: '120,00 €' }),
      expected: ['0 attivi · 120,00 € da liquidare', '1 attivo · 120,00 € da liquidare', '2 attivi · 120,00 € da liquidare'],
    },
    {
      key: 'AircraftPage.sub',
      values: (n) => ({ total: n, available: n, aog: n }),
      expected: ['0 velivoli · 0 disponibili · 0 fuori servizio', '1 velivolo · 1 disponibile · 1 fuori servizio', '2 velivoli · 2 disponibili · 2 fuori servizio'],
    },
    {
      key: 'DashboardPage.fleetCard.summary',
      values: (n) => ({ total: n, available: n, aog: n }),
      expected: ['0 velivoli · 0 disponibili · 0 fuori servizio', '1 velivolo · 1 disponibile · 1 fuori servizio', '2 velivoli · 2 disponibili · 2 fuori servizio'],
    },
    {
      key: 'DashboardPage.instructorLanding.sub',
      values: (n) => ({ flightsToday: n, owed: '80,00 €' }),
      expected: ['0 voli oggi · 80,00 € dovuti nel mese', '1 volo oggi · 80,00 € dovuti nel mese', '2 voli oggi · 80,00 € dovuti nel mese'],
    },
    {
      key: 'DashboardPage.overview.mobile.alerts.seeAll',
      values: (n) => ({ count: n }),
      expected: ['+0 altri avvisi · Vedi tutti', '+1 altro avviso · Vedi tutti', '+2 altri avvisi · Vedi tutti'],
    },
    {
      key: 'DashboardPage.scadenzeWidget.seeAll',
      values: (n) => ({ count: n }),
      expected: ['+0 altre · Vedi tutte', '+1 altra · Vedi tutte', '+2 altre · Vedi tutte'],
    },
    { key: 'ExpiriesPage.registry.shown', values: (n) => ({ count: n }), expected: ['0 mostrate', '1 mostrata', '2 mostrate'] },
    { key: 'BookingsPage.schedule.weekBookingsCount', values: (n) => ({ count: n }), expected: ['0 prenotazioni', '1 prenotazione', '2 prenotazioni'] },
    { key: 'BookingsPage.schedule.mobile.agendaCount', values: (n) => ({ count: n }), expected: ['0 prenotazioni', '1 prenotazione', '2 prenotazioni'] },
    { key: 'BookingsPage.list.filteredSummary', values: (n) => ({ total: n }), expected: ['0 prenotazioni', '1 prenotazione', '2 prenotazioni'] },
    {
      key: 'BookingsPage.form.schedulingWindow.advance',
      values: (n) => ({ days: n }),
      expected: ['prenotabile fino a 0 giorni prima', 'prenotabile fino a 1 giorno prima', 'prenotabile fino a 2 giorni prima'],
    },
    { key: 'SettingsPage.cashCategories.mobile.movementsCount', values: (n) => ({ count: n }), expected: ['0 movimenti', '1 movimento', '2 movimenti'] },
    {
      key: 'SettingsPage.scheduling.hint',
      values: (n) => ({ open: '08:00', close: '20:00', slot: n, days: n }),
      expected: [
        'I velivoli si possono prenotare tra le 08:00 e le 20:00 (ora locale), a passi di 0 minuti, fino a 0 giorni prima. Durata minima e tempo tra prenotazioni sono indicativi: non impediscono di salvare una prenotazione.',
        'I velivoli si possono prenotare tra le 08:00 e le 20:00 (ora locale), a passi di 1 minuto, fino a 1 giorno prima. Durata minima e tempo tra prenotazioni sono indicativi: non impediscono di salvare una prenotazione.',
        'I velivoli si possono prenotare tra le 08:00 e le 20:00 (ora locale), a passi di 2 minuti, fino a 2 giorni prima. Durata minima e tempo tra prenotazioni sono indicativi: non impediscono di salvare una prenotazione.',
      ],
    },
    {
      key: 'AircraftPage.editor.availability.confirmQuestion',
      values: (n) => ({ count: n }),
      expected: [
        'Mettere fuori servizio? Nessuna prenotazione coinvolta',
        'Mettere fuori servizio? 1 prenotazione coinvolta',
        'Mettere fuori servizio? 2 prenotazioni coinvolte',
      ],
    },
    {
      key: 'AircraftPage.editor.availability.impactPreview',
      values: (n) => ({ count: n }),
      expected: ['Nessuna prenotazione coinvolta', 'Interessa 1 prenotazione.', 'Interessa 2 prenotazioni.'],
    },
    {
      key: 'AircraftPage.editor.availability.impactBanner',
      values: (n) => ({ count: n }),
      expected: ['Fuori servizio registrato: 0 prenotazioni coinvolte.', 'Fuori servizio registrato: 1 prenotazione coinvolta.', 'Fuori servizio registrato: 2 prenotazioni coinvolte.'],
    },
    {
      key: 'AircraftPage.editor.availability.impactRow',
      values: (n) => ({ count: n }),
      expected: ['0 prenotazioni nel periodo', '1 prenotazione nel periodo', '2 prenotazioni nel periodo'],
    },
    {
      key: 'Requirements.failure.currency',
      values: (n) => ({ flightsInWindow: 1, windowDays: n, minFlights: 2, date: '01/07/2026', days: 92 }),
      expected: [
        'Currency scaduta: 1 volo negli ultimi 0 giorni (minimo 2); ultimo volo il 01/07/2026, 92 giorni fa',
        "Currency scaduta: 1 volo nell'ultimo giorno (minimo 2); ultimo volo il 01/07/2026, 92 giorni fa",
        'Currency scaduta: 1 volo negli ultimi 2 giorni (minimo 2); ultimo volo il 01/07/2026, 92 giorni fa',
      ],
    },
    {
      key: 'Requirements.failure.currencyNever',
      values: (n) => ({ minFlights: 1, windowDays: n }),
      expected: [
        'Currency scaduta: nessun volo registrato (minimo 1 volo negli ultimi 0 giorni)',
        "Currency scaduta: nessun volo registrato (minimo 1 volo nell'ultimo giorno)",
        'Currency scaduta: nessun volo registrato (minimo 1 volo negli ultimi 2 giorni)',
      ],
    },
    { key: 'ReportsPage.charts.revenue.sub', values: (n) => ({ count: n }), expected: ['ultimi 0 mesi · €', 'ultimo mese · €', 'ultimi 2 mesi · €'] },
    { key: 'ReportsPage.charts.hours.sub', values: (n) => ({ count: n }), expected: ['ultimi 0 mesi · h', 'ultimo mese · h', 'ultimi 2 mesi · h'] },
    { key: 'LogbookPage.sub', values: (n) => ({ count: n }), expected: ['0 voli registrati', '1 volo registrato', '2 voli registrati'] },
    {
      key: 'LogbookPage.subOwn',
      values: (n) => ({ count: n }),
      expected: ['0 voli · solo i tuoi voli', '1 volo · solo i tuoi voli', '2 voli · solo i tuoi voli'],
    },
  ];

  it.each(cases)('$key', ({ key, values, expected }) => {
    expect([0, 1, 2].map((n) => t(key, values(n)))).toEqual(expected);
  });

  it('the keys AircraftPage.editor.availability.*One/*Many/*None are gone from both catalogues (D-14)', () => {
    for (const lang of LANGS) {
      expect([...catalogues[lang].keys()].filter((key) => /^AircraftPage\.editor\.availability\..+(One|Many|None)$/.test(key))).toEqual([]);
    }
  });
});
