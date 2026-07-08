---
baseline_commit: 8982579
---

# Story TD-3: Picker ricercabili oltre il cap di 100 opzioni

Status: ready-for-dev

## Story

As a staff,
I want che i picker velivolo/persona trovino QUALSIASI voce anche oltre le prime 100,
so that con un'anagrafica reale (centinaia di persone) nessuna voce manchi silenziosamente dai menu (finding 5.4 D1, causa radice del flake `flights.spec:210` su DB sporco).

## Acceptance Criteria

1. **Given** più di 100 persone (o velivoli) a sistema, **When** cerco una voce oltre la centesima nei picker della pagina voli (form registrazione E barra filtri), **Then** la trovo digitando (typeahead con ricerca server-side `q`), e la selezione compila il campo esattamente come prima.
2. Il typeahead è accessibile: input con label sibling `htmlFor` (lezione 5.4 — MAI label-wrap), pattern combobox (`role="combobox"`, `aria-expanded`, listbox con opzioni raggiungibili da tastiera: frecce + Enter + Esc), min-h 44px, stile editoriale esistente (niente componenti pesanti nuovi).
3. I vincoli di dominio dei picker restano ESATTI: form → solo attivi, persona = pilota/allievo, istruttore = profilo istruttore attivo; barra filtri → include archiviati. Il server RESTA il guardiano (AD-5): il typeahead è solo affordance.
4. La checkbox-list velivoli del form tipi-pacchetto (`finance/packages`) non tronca più a 100: carica TUTTE le pagine server-side (flotta reale piccola; loop documentato).
5. **Given** un DB con >100 persone create ad hoc, **Then** un e2e prova che una persona oltre il cap è selezionabile nel form voli via typeahead e il volo si registra (il test di regressione VERO del finding).
6. Gli e2e esistenti su quei picker restano verdi (o vengono adattati al nuovo pattern di interazione SENZA indebolire le assert).

## Contesto e decisioni di design (vincolanti)

- **Un solo componente client riusabile** `SearchCombobox` (posizione a giudizio del dev, es. `src/app/[locale]/dashboard/_components/` se esiste una convenzione, altrimenti accanto ai consumer — dichiarare): props = `id`, `label` (reso dal CHIAMANTE come label sibling), `value`/`onChange` (id selezionato), `fetchOptions(q) => Promise<{id, label, meta?}[]>`, `initialOptions` (le prime N già server-rendered: il caso ≤100 funziona SENZA fetch aggiuntive, zero regressione UX), `placeholder`, `emptyText`, `disabled`. Debounce ~250ms, annulla le fetch stale (AbortController o confronto di sequenza), mostra le `initialOptions` filtrate client-side finché la ricerca server non risponde. NIENTE librerie nuove.
- **Ricerca server-side via API esistenti**: `GET /api/v1/people?q=...&includeArchived=...` e `GET /api/v1/aircraft?q=...&includeArchived=...` (già esistenti, `q` già supportato, cap 100 per pagina — più che sufficiente come rosa di risultati di una ricerca). Il filtro PROFILO per persona/istruttore del form: estendere `ListPeopleQuery`/schema con `profile?: 'pilot-or-student' | 'instructor'` (additivo, opzionale, OpenAPI aggiornato + coverage; filtro Prisma sui profili attivi — stessa semantica del filtro client-side attuale di `flights/page.tsx:125-129`). La barra filtri non filtra per profilo (com'è oggi).
- **Consumer da migrare** (tutti in `flights-manager.tsx` / pagina voli): form registrazione — Velivolo, Pilota o allievo, Istruttore; barra filtri — Velivolo, Persona (l'eventuale filtro Istruttore segue lo stesso pattern se esiste). Le `initialOptions` restano quelle server-passed di `flights/page.tsx` (che smette di doverle considerare complete — aggiornare i commenti). I `data-testid` e le label visibili NON cambiano; l'interazione e2e passa da `selectOption` a type+click (adattare gli spec, assert invariate).
- **`finance/packages/page.tsx:45` (AC 4)**: sostituire la singola chiamata `pageSize: 100` con un loop di pagine fino a `total` (helper locale con commento; niente typeahead qui — è una checkbox-list di associazione, la flotta è piccola per natura; il loop elimina il troncamento silenzioso in ogni caso).
- **Niente altri consumer**: cash-register (categorie), expiry (tipi) hanno cataloghi piccoli per natura e caricati integralmente (`includeInactive` senza cap di pagina) — NON toccarli; documentare nel Completion Notes che sono stati verificati.
- **e2e (AC 5)**: creare le >100 persone via API in un beforeAll dedicato (run-unique, lezione 6.3 F1), NON via UI; il test seleziona una persona con cognome run-unique ordinato oltre il cap (es. prefisso `Zz<suffix>`) e registra un volo reale. Attenzione al VOLUME: questo spec sporca il DB per i run successivi — girarlo e documentarlo; se destabilizza la full suite, valutare (e dichiarare) tag/progetto Playwright separato, MA il default resta: incluso nella suite.
- **Flake follow-up**: dopo la migrazione dei picker, ri-verificare `flights.spec.ts` in isolamento con `--repeat-each=5` (il typeahead cambia le interazioni che flakavano — l'hardening TD-1 T0 non deve regredire).

## Tasks / Subtasks

- [ ] **T1 (AC 2)** — `SearchCombobox` accessibile + verifica interattiva Playwright MCP (tastiera: frecce/Enter/Esc; focus states).
- [ ] **T2 (AC 3)** — Param `profile` su listPeople/schema/OpenAPI + unit test del filtro.
- [ ] **T3 (AC 1/3)** — Migrazione dei 5 picker della pagina voli + adattamento spec esistenti.
- [ ] **T4 (AC 4)** — Loop full-fetch per la checkbox-list velivoli dei tipi-pacchetto.
- [ ] **T5 (AC 5)** — e2e >100 persone typeahead + registrazione volo.
- [ ] **T6 (AC 6)** — Re-run `--repeat-each=5` flights.spec isolato; gates completi; story file (Dev Agent Record) + sprint-status.yaml (td-3 → review).

## Dev Notes

- **Story con UI**: usare le skill `design-taste-frontend` E `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "combobox autocomplete accessibility"`) per il combobox; stile `minimalist-ui` esistente (monocromi caldi, flat, focus `#2F3437`, niente ombre pesanti); verifica interattiva Playwright MCP PRIMA degli e2e.
- Ambiente e regole identiche a TD-1/TD-2 (Mailpit, DB fresco dalla sessione principale, `curl localhost:3000` deve fallire, build `env -u NODE_ENV`, MAI `playwright install`, UN commit `Story TD-3: ...`).
- i18n IT/EN simmetrica per le stringhe nuove (placeholder, emptyText, aria-label eventuali).

### References

- [Source: _bmad-output/implementation-artifacts/5-4-flight-log-filters.md#Review Record — D1 + lezione label-wrap]
- [Source: src/app/[locale]/dashboard/flights/page.tsx:100-137 — derivazione opzioni attuale]
- [Source: src/lib/schemas/people.ts:45, src/lib/schemas/aircraft.ts:108 — `q`; src/lib/api/pagination.ts — cap 100]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-08: Story file created (Fable 5 main session) — scioglie il deferral 5.4 D1 su decisione utente ("fix everything before epic 7").
