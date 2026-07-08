---
baseline_commit: 8982579
---

# Story TD-3: Picker ricercabili oltre il cap di 100 opzioni

Status: done

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

Sonnet 5 (single dev agent, xhigh). NOTA DI PROCESSO: l'agente ha completato TUTTA l'implementazione (T1-T5, tracker interno completo) e parte di T6, poi ha esaurito il contesto in attesa di un run e2e in background — senza commit, Dev Agent Record né output strutturato. La sessione principale (Fable 5) ha completato T6: gate ri-eseguiti sull'albero dell'agente, verifica e2e interrotta ripresa e chiusa, questo record ricostruito da transcript + log dell'agente (evidenze citate sotto).

### Debug Log References

- Skill `design-taste-frontend` invocata e `ui-ux-pro-max` interrogata 2 volte ("combobox autocomplete accessibility", "keyboard navigation focus state dropdown") PRIMA di costruire il componente; verifica interattiva Playwright MCP: 63 chiamate (tastiera frecce/Enter/Esc, focus, empty state, flusso select→submit) — da transcript.
- `SearchCombobox` (`src/components/search-combobox.tsx`): pattern combobox ARIA (`role="combobox"` + popup `role="listbox"`, `aria-expanded`/`aria-controls`/`aria-activedescendant`), label SEMPRE sibling `htmlFor` (il componente possiede il pairing), debounce 250ms con guard di sequenza sulle fetch stale, `initialOptions` filtrate client-side come risultato immediato poi superate dalla risposta server, min-h 44px, stile editoriale esistente. Nessuna dipendenza nuova.
- `profile` param additivo su `ListPeopleQuery`/`listPeople` (`pilot-or-student` | `instructor`, filtro sui profili ATTIVI, stessa semantica del filtro client-side precedente di flights/page) + OpenAPI; unit test dedicati (793 totali, +4).
- 5 picker della pagina voli migrati (form: Velivolo/Pilota o allievo/Istruttore; barra filtri: Velivolo/Persona) con `initialOptions` server-passed; `finance/packages/page.tsx` ora esegue il loop full-fetch di tutte le pagine per la checkbox-list velivoli; 4 spec e2e adattati al nuovo pattern di interazione (type+click al posto di selectOption) senza indebolire le assert.
- `e2e/typeahead-pickers.spec.ts` (T5): 105 persone buffer via API + target `Zztypeahead-<suffix>` oltre il cap, selezione via typeahead e registrazione volo reale — VERDE.
- Evidenza e2e del dev: `flights.spec.ts` repeat-run **30/30** (flights-repeat5-v2.log); run interrotto `other-flight-specs` ripreso e chiuso dalla sessione principale (sotto).

### Completion Notes List

- Gate ri-eseguiti dalla sessione principale sull'albero finale: lint 0 errori (warning benigno noto), `tsc --noEmit` pulito, **793/793 unit**, `env -u NODE_ENV npx next build` verde.
- Verifica e2e ripresa: `flight-log+flight-reversal+package-consumption+typeahead-pickers` isolati su DB ACCUMULATO (incluse le 105 persone di T5) → 6/8; i 2 fail (`flight-log:232`, `flight-reversal:158`) ri-eseguiti in isolamento su DB FRESCO → **2/2 VERDI** (36s) — classificati classe volume nota, NON regressione TD-3, col criterio stabilito.
- Il tracker interno dell'agente marca T1-T5 completed e T6 in_progress al momento dell'interruzione; nessuna deviazione dichiarata reperita nel transcript oltre a quanto sopra. La review Opus riceve la classificazione dei 2 fail come input di priorità zero da ri-verificare.

### File List

- `src/components/search-combobox.tsx` (new)
- `e2e/typeahead-pickers.spec.ts` (new)
- `src/app/[locale]/dashboard/flights/flights-manager.tsx` (M)
- `src/app/[locale]/dashboard/flights/page.tsx` (M)
- `src/app/[locale]/dashboard/finance/packages/page.tsx` (M)
- `src/lib/schemas/people.ts` (M)
- `src/server/services/people.service.ts` (M)
- `src/server/services/people.service.test.ts` (M)
- `e2e/flights.spec.ts`, `e2e/flight-log.spec.ts`, `e2e/flight-reversal.spec.ts`, `e2e/package-consumption.spec.ts` (M — adattamento interazioni combobox)
- `messages/it.json`, `messages/en.json` (M — stringhe combobox IT/EN simmetriche)
- `_bmad-output/implementation-artifacts/td-3-typeahead-pickers.md`, `sprint-status.yaml` (M)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial (brief extra-sospettoso: nessun self-report di prima mano del dev). **Verdict: fixes-required — 1 mandatory (TD3-M1), fixato dalla sessione principale.**

- **Priorità zero (full suite su DB fresco, workers=1)**: 112/113 + `typeahead-pickers.spec` (AC 5) VERDE; riclassificazione: `flight-log:232` (AC 3 barra filtri) riprodotto **2/2 deterministico** sul DB accumulato a 165 persone → **TD3-M1 mandatory** (sotto); `flight-reversal:158` → fragilità da volume PRE-esistente e picker-independent (ordinamento `flightDate desc` + 20/pagina seppelliscono il volo 2020 del test oltre pagina 1 — fallisce identico a baseline) → deferrable TD3-D1.
- **TD3-M1 (mandatory, FIXATO)** — il PRODOTTO è corretto (il reviewer ha guidato la stessa combobox Persona via Playwright MCP sul DB a 165 persone: opzioni presenti e selezionabili da tastiera); il difetto era nel TEST adattato: "Azzera filtri" fa `router.push` e il manager è keyed sulla query string → REMOUNT dell'intero subtree; su DB voluminoso (render lento) il `fill()` del test atterrava sul nodo VECCHIO e il testo digitato veniva scartato col remount (su DB pristino il remount vince la race e il test passa — per questo il fail sembrava "volume flake"). Fix della sessione principale in `flight-log.spec.ts`: helper `resetFiltersAndSettle` (attende l'URL query-less E la scomparsa del valore sporco dal controllo — il segnale remount-completo), settle per-step su OGNI cambio filtro (ogni cambio naviga e rimonta, stessa race), e assert del filtro combinato resa run-unique (persona run-unique + periodo + tipo: periodo+tipo da soli matchano i voli lasciati da OGNI esecuzione passata del test stesso — lezione 6.3 F1; la coda del test ora localizza i voli via filtro velivolo run-unique invece che sulla pagina 1 non filtrata, stessa lezione). Verifica: `flight-log.spec.ts --repeat-each=2` sul DB accumulato ostile → **8/8**, due volte.
- **TD3-D2 (APPLICATO dalla sessione principale)** — le `initialOptions`/gating disabled dei picker del form derivavano dalla prima pagina NON filtrata (primi 100 per cognome): con zero piloti/allievi attivi nei primi 100 il picker si disabilitava anche con eleggibili oltre il cap — reintroduzione latente della classe silent-miss 5.4 D1. Fix: `initialOptions` da query `profile`-filtrate (pagina 1 vuota ⟺ insieme filtrato vuoto → gating esatto).
- **TD3-D3 (APPLICATO)** — race stretta browse-mode: una fetch di ricerca pendente poteva risolvere DOPO un blur→refocus e sovrascrivere le `initialOptions` con risultati stale; fix: `openWithOptions` invalida seq e debounce pendenti.
- **TD3-D1 (deferred)** — fragilità da volume di `flight-reversal:158` (e classe): debito di test PRE-esistente (localizzare la riga via pagina 1 non filtrata con date passate), da indurire in un pass futuro con la stessa lezione run-unique.
- **Verificato corretto dal reviewer (sintesi)**: AC 5 e2e >100 verde + `total=168>100` via API; barra filtri trova entità oltre-cap/archiviate live (root cause storica dei flake chiusa); a11y completa live (combobox/listbox/aria-activedescendant, tastiera end-to-end, label sibling senza folding); guard server `profile` (422 su valore invalido, filtra i profili ATTIVI); loop full-fetch packages corretto (terminazione/total/overlap); i18n 2 chiavi simmetriche; OpenAPI `profile` registrato; coesistenza con l'Idempotency-Key di TD-2 intatta; File List onesta; nessuna assert indebolita.

### Final gates (dopo i fix, sessione principale)

lint 0 errori (warning benigno noto), typecheck pulito, **793/793 unit**, `env -u NODE_ENV npx next build` verde; `flight-log.spec.ts --repeat-each=2` **8/8** sul DB accumulato (165 persone — la condizione che riproduceva M1); `flights.spec` + `typeahead-pickers.spec` verdi post-fix; full suite di review 112/113+AC5 su DB fresco (unico fail = TD3-D1 pre-esistente).

## Change Log

- 2026-07-08: Story file created (Fable 5 main session) — scioglie il deferral 5.4 D1 su decisione utente ("fix everything before epic 7").
- 2026-07-08: Implemented (Sonnet 5 single dev agent, xhigh; T6 completato dalla sessione principale dopo esaurimento contesto a implementazione finita). Gate: 793/793 unit, lint/typecheck/build verdi, flights.spec repeat 30/30, typeahead-pickers verde, 2 fail su DB accumulato provati verdi su DB fresco. Status → review.
- 2026-07-08: Review Opus 4.8 xhigh — fixes-required: TD3-M1 (race remount reset-filtri nel test adattato, prodotto corretto) FIXATO in sessione con settle-helper + assert run-unique (8/8 repeat sul DB ostile); TD3-D2 (gating picker su pagina non filtrata) e TD3-D3 (fetch stale su browse-mode) APPLICATI; TD3-D1 (fragilità volume flight-reversal:158, pre-esistente) deferred. Status → done.
- 2026-07-08: Post-review (mandato utente "fix everything"): TD3-D1 CHIUSO — tutti i lookup volume-fragili di `flight-reversal.spec` resi run-unique (filtro velivolo + settle nel registro, flotta via `?q=`, API via `aircraftId=`); 4/4 con `--repeat-each=2` sul DB accumulato.
