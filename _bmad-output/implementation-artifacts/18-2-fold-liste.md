---
baseline_commit: 1f6ab3e
---

# Story 18.2: Il fold torna alle liste

Status: **in-progress** — 18.2a (AC 1–5, 7–8) verificata sul ramo locale `story/18-2a` e pronta per la revisione indipendente; 18.2b (AC 6) resta da sviluppare. L'umbrella 18.2 non è done. File creato il 2026-11-03 con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e`. Dev/review secondo la sostituzione permanente autorizzata dal PO: GPT 6 Sol per lo sviluppo ordinario e revisore indipendente separato. **Ordine**: DOPO 16.6a, 16.6b, 17.3 e 18.1. Split: v. §PO.

## Story

As an **utente da telefono che apre una lista**,
I want vedere subito i dati,
so that la testata non mangi 262-572 px (ui M1) e uno stato vuoto non spenda centinaia di px di cromo (M9).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.2»; `ui-review.md` M1, M9.

## Stato su HEAD

- **Pagine-lista: 8** (Movimenti/transiti e PPR rimossi dalla 19.1): Panoramica, Pianificazione, Piloti, Istruttori, Velivoli, Scadenze, Registro voli, Contabilità; più Estratto conto, I miei compensi, Statistiche.
- **(a) Titolo duplicato**: su HEAD `shell.pageTitle.*` = `*Page.title` su **12 pagine su 12, IT ed EN** (le due eccezioni dell'audit chiuse dalla 19.12b). Facce diverse per ruolo/pagina: Panoramica dei ruoli non admin (saluto, `dashboard/page.tsx:151`), Scadenze personali (`titleOwn`, `expiries/page.tsx:274`), scheda persona (nome). `.sr-only` esiste già (`airops.css:95`), nessuna testata lo usa.
- **(b) Scadenze**: 4 riquadri 2×2 non tappabili (`scadenze-console.tsx:439-444`; `.kpi-row-grid` `:2167`) e 5 pillole di finestra (`:610-628`). ⚠️ I riquadri contano fasce **esclusive e globali** che ignorano i filtri (`expiries.service.ts:606-633`); le pillole sono finestre **cumulative** (comprendono gli scaduti) e si combinano con categoria, tipo e persona (`windowSql` `:478-484`) → spostare i numeri dei riquadri sulle pillole sarebbe sbagliato; serve un conteggio per finestra sui filtri correnti (una `COUNT … FILTER` sulla stessa CTE `registryRows` con `registryWhereSql` senza la finestra).
- **Contabilità**: 3 riquadri-bottone (Risultato, Disponibile, Acconti; `billing-panels-mobile.tsx:57-59, :119-132`, 1+2 da `:3090-3100`) che aprono uno sheet; **non** ripetono le pillole di tipo libro (`billing-console.tsx:951-975`).
- **(c) Testate**: Scadenze = ricerca, Filtri, Esporta, Quota associativa, Invia promemoria (`:452-540`); Contabilità = ricerca, Filtri, Esporta, «Nuova transazione»; Registro voli = ricerca, Filtri, Esporta, Registra volo. Nessuno sheet «azioni».
- **Baseline 625 / 563 / 487 px: da rimisurare** (Scadenze strutturalmente invariata salvo il filtro Categoria 19.7b nel pannello Filtri; budget e2e «testata + pillole ≤ 261,5» verde `mobile-expiries-movements.spec.ts:333`).
- **M9**: le «3 chip di stato» del registro sono sparite con la 19.6 (baseline 425 px non vale più). Stati vuoti mobile: **15** nodi `.mobile-card-empty`, solo testo, senza azione, con riquadri e filtri sempre visibili (`billing-console:988`, `bookings-table:829`, `schedule:758`, `my-expiries:93`, `scadenze-console:635`, `fleet-console:248`, `instructors-console:192`, `logbook-console:730`, `mobile-booking-list:84`, `mobile-pending-bookings:216`, `account-section:559`, `pilots-console:503`, `cash-categories-card:242`, `ratings-card:383`, `mobile-alerts-card:63`).

## Acceptance Criteria

1. **Titolo**: su ≤ 640, dove il titolo della pagina coincide con quello della topbar, diventa `sr-only` (resta per `getByRole('heading')`; sottotitolo visibile; facce per ruolo invariate; a 1280 niente cambia). Una classe di pagina, non una regola globale sull'`h1`.
2. **Scadenze**: ogni pillola porta il numero di §PO Q-18.2-a; i riquadri spariscono a ≤ 640 via CSS (i testid `scadenze-stat-*` restano a 1280); test: per ogni pillola il numero = totale della lista dopo il tap, **filtrando per una persona run-unique** (mai uguaglianza su un aggregato globale sotto `fullyParallel`). Unit sul pattern SQL (come `expiries.service.test.ts:568`).
3. **Azioni secondarie**: §PO Q-18.2-b su Scadenze, Contabilità e Registro voli; sheet costruito su `MobileSheet`.
4. **Contabilità**: §PO Q-18.2-c.
5. **Fold** a 375×812, IT ed EN, due temi: primo elemento di contenuto di Scadenze ≤ 320 px; di Contabilità e Registro voli ≤ 350; le altre 5 pagine mai peggio del «prima»; nessun overflow a 320. Misura: offset di documento (`getBoundingClientRect().top + scrollY`, metodo dell'audit §1), ruoli admin/pilota/allievo.
6. **Stato vuoto**: lista vuota senza filtri → testata minima (niente riquadri né filtri), una frase e l'azione se il ruolo la può fare (mappa di §PO Q-18.2-d); con filtri attivi → «Nessun risultato con questi filtri» e «Azzera filtri»; altezza sopra il messaggio dichiarata.
7. **Desktop**: a 1280 box delle testate invariati al centesimo sulle 8 pagine.
8. **Gate**: `npm run gates` verde; e2e via `scripts/e2e.sh`.

## Tasks / Subtasks

- [x] Misura «prima» su `ba1ffdedd46fef8e3757b0d970cc01cd7e47ca7e` (dopo 18.1).
- [x] 18.2a: titolo `sr-only` (AC 1), conteggi per finestra (AC 2), sheet azioni (AC 3), Contabilità (AC 4), fold (AC 5), desktop (AC 7).
- [ ] 18.2b: stati vuoti (AC 6), azioni e i18n della mappa PO.
- [x] 18.2a: gate, browser finale, benchmark ed evidenze (AC 8); stato review.
- [ ] 18.2a: revisione indipendente e risoluzione degli eventuali rilievi.

## Dev Notes

**Blast radius**: `airops.css`; 8-11 testate (classe sul blocco titolo); `scadenze-console.tsx`, `expiries/page.tsx`, `expiries.service.ts` (+ unit); `billing-console.tsx`, `billing-panels-mobile.tsx`, `logbook-console.tsx`; fino a 15 stati vuoti; `messages/{it,en}`. **e2e da toccare**: `mobile-ink-targets.spec.ts:445` (4 riquadri visibili a 375 → 0); `mobile-billing.spec.ts:602-634`; `mobile-logbook.spec.ts:1121-1126`; `mobile-self-public` (17 riferimenti ai riquadri) e `mobile-overview` (23); i budget «≤» restano verdi (`:333`, `mobile-billing:1009`, `mobile-registries:615`, `mobile-reports:307`).

**Discriminanze**: l'e2e del fold rosso su HEAD; mutante su copia isolata (fasce globali al posto dei conteggi per finestra) → test «numero = lista» rosso; sha256 prima del commit.

**Trappole**: un box `sr-only` 1×1 «clip» per Playwright è visibile → asserire box o classe, non `toBeVisible`; numeri nel nome accessibile delle pillole mettono a rischio `exact:true` e `hasText` non ancorati («Scaduti 29» contiene «Scaduti 2», lezione 11.2): grep degli usi; testid: le pillole `mobile-scadenze-window-chip-<v>` invariate, il bottone che apre lo sheet è solo mobile → prefisso `mobile-`, le voci che duplicano un controllo desktop → suffisso `-mobile`; evitare `mobile-fleet-` (`mobile-registries.spec.ts:899` conta 0 nodi con quel prefisso in Panoramica); ExportMenu è già uno sheet a ≤ 640 e uno sheet ne caccia un altro (`openSheet`, `mobile-sheet.tsx:61`) → nello sheet azioni le voci di Esporta vanno direttamente; niente switch JS di larghezza (CSS, non smontaggio); i18n «Azzera filtri» (`BANNED` vieta `\breset\b`), «…», plurali ICU, parità.

**Dimensione**: ~20-30 file, +900/1 400 −250 (≈ 1/2 della 19.7a). Split: v. §PO.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 18.2; `ui-review.md` M1/M9; `19-7b-registro-scadenze-unificato.md`

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.2-a** = A: ogni pillola mostra quante scadenze si vedono toccandola, con i filtri correnti (finestra cumulativa: «≤30g» comprende scadute ed entro 7 giorni); i riquadri spariscono a ≤ 640.
- **Q-18.2-b** = A: a vista ricerca, Filtri e azione principale (Invia promemoria, Nuova transazione, Registra volo); Esporta (e in Scadenze Quota associativa) sotto «Altre azioni», pannello dal basso.
- **Q-18.2-c** = A: in Contabilità i tre riquadri diventano una striscia su una riga, scorrevole come nel Registro voli (~−70 px).
- **Q-18.2-d** = A: mappa degli stati vuoti — Registro voli «Prenota un volo» (pilota/allievo) / «Registra volo» (admin); Pianificazione «Prenota un volo» (pilota/allievo); Velivoli, Piloti, Istruttori «Aggiungi…» (admin); Estratto conto e Scadenze personali solo la frase; resto invariato; con filtri attivi «Nessun risultato con questi filtri» + «Azzera filtri».
- **Split** = sì: **18.2a** (AC 1-5, 7-8: titolo, pillole, sheet azioni, Contabilità, fold) e **18.2b** (AC 6: stati vuoti, ruoli, azioni, i18n).


## Dev Agent Record

### Agent Model Used

- Codex Sol, singolo agente di sviluppo. Revisione indipendente ancora da eseguire in contesto separato.

### Completion Notes List

- Base locale `ba1ffdedd46fef8e3757b0d970cc01cd7e47ca7e`; ramo `story/18-2a`. Scope solo AC 1–5, 7–8. L'AC 6 non è implementata né dichiarata completa.
- AC 1: i titoli che duplicano la topbar restano `h1` accessibili e diventano visivamente nascosti solo a ≤640 px. Le facce personali con saluto/titolo diverso restano visibili. Sonde storiche di overflow aggiornate a escludere esplicitamente il solo titolo nascosto.
- AC 2: `getExpiryWindowCounts` usa `registryRowsSql` e `registryWhereSql` con categoria, tipo e persona correnti, senza finestra selezionata né paginazione; `COUNT FILTER` restituisce finestre cumulative includendo gli scaduti. Le quattro stat card globali restano sul desktop e sono nascoste sul telefono.
- AC 3–4: «Altre azioni» usa il `MobileSheet` esistente con PDF/Excel diretti e, solo su Scadenze, Quota associativa. Ricerca, Filtri e azione primaria restano visibili. I tre KPI Contabilità mantengono gli sheet e stanno su una striscia orizzontale a riga singola.
- Benchmark su 375×812, offset documento del primo contenuto, base IT chiaro → candidato (massimo IT/EN, chiaro/scuro): Scadenze 609,28 → 289,84 px (budget 320); Contabilità 563,41 → 348,33 px (budget 350); Registro voli 423,41 → 310,81 px (budget 350); Velivoli/Piloti 324,44 → 291,84 px; Istruttori 388,25 → 355,66 px (EN 336,81). Panoramica/Pianificazione: test di non regressione confrontando il medesimo DOM col titolo visibile; pilota/allievo: titoli personali e registro in sola lettura verificati. Nessun overflow documento a 320 nelle otto pagine provate.
- Riscontro manuale aggiuntivo, Chromium locale e seed sintetico, 375×812 IT/EN nei due temi: primo blocco dopo `.page-head` pilota Panoramica 264,44 px, Scadenze personali 148,44, Registro voli 101,84; allievo rispettivamente 212,44 / 148,44 / 101,84. I titoli personali restano visibili, quello del Registro voli misura 1 px; overflow del documento pari a 0 anche a 320 su tutte e sei le combinazioni ruolo/pagina. Comando Playwright read-only exit 0.
- Desktop 1280: sulle otto pagine admin il box `.page-head` resta `[x 260, y 85,84, larghezza 992, altezza 51,44]` px in IT/EN; le nuove regole di layout sono limitate a ≤640 px.
- Discriminante difensiva sul conteggio in copia isolata `/tmp/airmanager-mutant-18-2a-6rvaiiqk`: tolto il where filtrato, unit exit 1 (1 failed, 1 passed, 89 skipped), fallimento sulla mancanza di `r."category" = ?`; sorgente originale passa. Nessuna ACL modificata. Un browser rosso contro il vecchio HEAD non è stato eseguito; la suite nuova verifica il comportamento sul candidato.
- `npm run gates` sull'albero finale: lint exit 0 (36 s), typecheck exit 0 (7 s), Vitest 2.322/2.322 exit 0 (21 s), build exit 0 (55 s). `git diff --check` exit 0.
- Prima suite completa del candidato: `scripts/e2e.sh start` exit 1, 663 passati, 3 METAR saltati, 1 fallito (`e2e/picker-cap.spec.ts:49`: Scadenze desktop 53 opzioni native, limite 50). La causa era il nuovo fixture 18.2a, che creava cinque tipi di scadenza globali; il test ora riusa cinque tipi attivi del seed e conserva persona/date run-unique. Controprova mirata `scripts/e2e.sh start --no-deps e2e/fold-18-2a.spec.ts`: 3/3 passati, exit 0. Nel browser finale il picker cap è passato al primo tentativo.
- Browser integrato finale su DB resettato e riseminato, SMTP su `localhost`: `scripts/e2e.sh start`, `E2E_EXIT=0`, 662 passati, 3 segnalati flaky e 2 saltati, 667 test in totale. Le tre prove 18.2a, l'ordine/cap della Panoramica, i due casi Pianificazione fuori dalla fascia 23:40–00:20 Roma, export PDF, geometria mobile e picker cap sono passati. Nessun deploy, email reale o accesso a dati di produzione.
- Flaky separati: `account-adjustments.spec.ts:94` è passato al retry #1 dopo 15 s di attesa Mailpit di un messaggio sintetico; `expiry-alerts.spec.ts:186` è passato al retry #1 dopo timeout di 30 s sulla POST locale del job; `mobile-metar.spec.ts:167` ha fallito il login iniziale (rimasto su `/it/login` per 5 s) e al retry è stato saltato per assenza di `raw` nella risposta METAR. Anche `mobile-metar.spec.ts:61` e `:208` sono saltati per assenza di `raw`. Il comportamento METAR di quei tre casi **non è attestato**; il motivo esatto della risposta senza `raw` non è stato verificato oltre alla condizione di skip del test. Il gate Playwright resta exit 0.
- Revisione indipendente ancora pendente. Nessun push di `dev` o modifica di `main`; 18.2b è la prossima parte dell'umbrella dopo la review.

### File List

- Servizio Scadenze e unit: `src/server/services/expiries.service.ts`, `src/server/services/expiries.service.test.ts`.
- Testate, console e menu: `src/app/[locale]/dashboard/{page.tsx,bookings,expiries,billing,logbook,fleet,pilots,instructors,my-account,my-compensation,reports}`, `src/components/ui/export-menu.tsx`, `src/styles/airops.css`, `messages/{it,en}.json`.
- Browser: `e2e/fold-18-2a.spec.ts` e aggiornamenti mirati a `e2e/{home-dashboard,mobile-billing,mobile-expiries-movements,mobile-ink-targets,mobile-logbook,mobile-membership-fee,mobile-registries,mobile-reports,mobile-self-public,pdf-exports,picker-cap}.spec.ts`.
