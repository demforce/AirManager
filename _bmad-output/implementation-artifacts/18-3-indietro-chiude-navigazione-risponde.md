---
baseline_commit: 1f6ab3e
---

# Story 18.3: Indietro chiude, la navigazione risponde

Status: **in-progress** — 18.3a «Indietro chiude» done dopo riesame indipendente; 18.3b «La navigazione risponde» resta ready-for-dev. File creato il 2026-11-03 con `bmad-create-story` e ricognizione su `1f6ab3e`. Per la 18.3a, Dev e revisore indipendente: GPT 6 Sol secondo la sostituzione permanente approvata da Enrico. **Split** in due meccanismi indipendenti con gate separati: v. §PO.

## Story

As an **utente da telefono**,
I want che il tasto Indietro chiuda lo sheet e che un tap sulla tab mostri subito qualcosa,
so that un form compilato non si perda (ui M5) e la rete lenta non sia muta (M7).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.3»; `ui-review.md` M5, M7.

## Stato su HEAD

- **History**: zero `history.pushState`/`back`, `popstate`, `goBack` in `src/` e `e2e/`. `SlideOver` (`slide-over.tsx:46-102`) e `MobileSheet` (`mobile-sheet.tsx:91-135`) si chiudono solo con ✕, scrim, Escape o Chiudi. Consumatori: SlideOver 15 usi in 13 file (3 pannelli Filtri montati solo da aperti: `logbook-console.tsx:876`, `billing-console.tsx:1304`, `scadenze-console.tsx:719`); BottomSheet ~14; ExportMenu 8 (popover anche a 1280, `mobile-sheet.tsx:72-80`); shell 2. Fuori dalle primitive: `MiniModal` (`bookings-table.tsx:889, :924`, solo desktop) e il modale della quota (`.mini-modal`, `scadenze-console.tsx:980`).
- **Next 16.2.10** (sorgenti): l'App Router patcha `history.pushState` (`node_modules/next/dist/client/components/app-router.js:252-262`) copiando `__NA` e l'albero nello stato; **se si passa un URL** dispatcha un restore; il popstate (`:284-300`) ignora uno stato null, ricarica se manca `__NA`, altrimenti fa un traverse. ⚠️ `app-router-instance.js:143-150`: un RESTORE (Indietro o `history.back()`) **scarta l'azione pendente** (navigate o refresh).
- **Siti esposti alla corsa**: «Applica» dei 3 Filtri = chiusura + `router.push` (`logbook-console.tsx:428-434` → `:292-296` e gemelli); link dentro uno sheet con `onClick={close}` (`mobile-nav.tsx:109-116`, `mobile-top-bar.tsx:118` lingua, `billing-panels-mobile.tsx:108`, `scadenze-console.tsx:811`, `pilots-console.tsx:665`, `instructors-console.tsx:407`, i link «Scheda persona» dei BottomSheet); passaggio sheet → pannello nello stesso handler (`fleet-console.tsx:340-344`, `pilots-console.tsx:630`); salvataggio = `onClose()` + `router.refresh()` (49 refresh in `src/app`); sostituzione di uno sheet con un altro (`mobile-sheet.tsx:97-100`).
- **Loading**: zero `loading.tsx` e zero `Suspense` in `src/app`; `useLinkStatus` è esportato (`next/dist/client/app-dir/link.d.ts:200`); le tab sono `Link` di next-intl (`mobile-nav.tsx:73-84`); `scripts/perf/render.mjs` non fa throttling; il baseline «3,4 s» non è rimisurabile senza browser e l'Epic 17 cambierà i tempi (l'AC dei 100 ms non ne dipende). Niente jsdom (vitest `node`): le guardie della history sono solo e2e.

## Acceptance Criteria

### 18.3a — Indietro chiude

1. Sheet o pannello aperto (sheet di un volo; «Nuova voce» compilata) + `page.goBack()` → si chiude **come con ✕**, l'URL non cambia, il secondo Indietro naviga. Vale anche a desktop per pannelli ed Esporta secondo §PO Q-18.3-a.
2. Chiusura con ✕, scrim, Escape o Chiudi, poi Indietro → esce dalla pagina in **una** pressione.
3. «Applica» dei Filtri → **una** navigazione verso l'URL filtrato (`mobile-billing.spec.ts:701-711` verde: conta ogni navigazione del frame principale senza filtro sull'URL, è la discriminanza naturale); poi Indietro torna all'URL senza filtri in una pressione.
4. Link in uno sheet (Altro → Impostazioni, lingua, «Vedi…» di Contabilità) → si arriva a destinazione; Indietro torna alla pagina di partenza in una pressione.
5. Sheet → «Modifica» (Velivoli, Piloti) → il pannello resta aperto; Indietro lo chiude, il successivo esce.
6. Salvataggio di una Nuova voce → la riga nuova compare (il refresh non è scartato); Indietro esce in una pressione.
7. Escape, ritorno del focus e focus trap invariati (`mobile-a11y-sweep` verde); i popup di combobox e calendario consumano ancora il primo Escape. `MiniModal` e il modale della quota restano fuori, dichiarati; comportamento di Avanti dopo una chiusura dichiarato.

### 18.3b — La navigazione risponde

8. Fast 3G + CPU 4× via CDP (`Network.emulateNetworkConditions` 150 ms / 1,6 Mbps, `Emulation.setCPUThrottlingRate(4)`), tocco di una tab → entro 100 ms (misurati in pagina, dal pointerdown al marker, MutationObserver + `performance.now`) la tab è «in corso» (indicatore di §PO Q-18.3-c); appena il prefetch è disponibile l'area della pagina mostra lo scheletro con `aria-busy="true"`; topbar e tab bar restano ferme. In CI si asserisce l'**ordine** (marker prima del contenuto nuovo); i 100 ms nel record. Rosso su HEAD.
9. Due temi, 375 e 1280 (perimetro di §PO Q-18.3-b): scheletro solo con token AirOps; con `prefers-reduced-motion` nessuna pulsazione.
10. Suite completa verde; richieste di prefetch in più per pagina vista misurate con `scripts/perf` sul DB di carico e dichiarate.

## Tasks / Subtasks

- [x] 18.3a: NEW `src/components/ui/history-layer.ts` (gemello di `focus-trap.ts`), UPDATE `slide-over.tsx` e `mobile-sheet.tsx`, i 3 «Applica», i link con `close`, i passaggi sheet → pannello; e2e nuovo; aggiornare la riga «Escape e i pannelli» di CLAUDE.md. Implementazione, gate e riesame indipendente completati; 18.3a done.
- [ ] 18.3b: NEW `src/app/[locale]/dashboard/loading.tsx` + CSS dello scheletro; `mobile-nav.tsx` (indicatore in un figlio del `Link` con `useLinkStatus`); `sidebar.tsx` se §PO Q-18.3-b = A; 1-2 chiavi «Caricamento…»; e2e con throttling; audit dei 195 `toHaveURL`.

## Dev Notes

**Decisioni tecniche della sessione principale**: modulo `history-layer` — le chiusure da interfaccia passano da `back()` e si completano sul popstate; le chiusure da navigazione o da refresh **non fanno mai `back()`** (`<Link replace>` / `router.replace` quando la navigazione parte da un layer aperto, oppure voce lasciata «consumata» e saltata al prossimo Indietro); il passaggio da un layer all'altro fa `replaceState` sulla stessa voce; **mai un URL nel pushState** (195 `toHaveURL` e il dispatch di un restore); token per istanza (come `openSheet`) e controllo di `history.state?.<token>` prima di ogni `back()`; Escape sul pannello segue la via di ✕ (`back` → popstate → `onClose`); i popup che consumano il primo Escape non toccano la history; il ritorno del focus diventa asincrono (i `toBeFocused` auto-attendono; il trap su `document` `focus-trap.ts:171` non cambia). Un solo `dashboard/loading.tsx` per tutte le route figlie. Misura con throttling in uno script throwaway, senza allargare `scripts/perf`.

**Mutanti** (solo su copia isolata, sha256): (i) `back()` alla chiusura da «Applica» → AC 3 rosso; (ii) `back()` + push nel passaggio sheet → pannello → AC 5 rosso (il pannello si richiude); (iii) `back()` dopo un salvataggio → AC 6 rosso (la riga non compare); (iv) push con URL → `toHaveURL` esatti rossi. iOS swipe-back e Indietro di Android non sono verificabili headless: `goBack` è l'equivalente programmatico, dichiararlo.

**Trappole**: i pannelli Filtri si smontano alla chiusura e la console si rimonta a ogni navigazione (`key` in `logbook/page.tsx:230`) → nessun `back()` da un cleanup che parte durante una navigazione; il popover Esporta a 1280 passa da `MobileSheet` (se §PO Q-18.3-a = B serve un gate `matchMedia`); con un loading boundary Next prefetcha le route dinamiche di ogni Link visibile (5 tab, ~12 voci di sidebar, link nelle righe) = carico in più sulle pagine che l'Epic 17 ottimizza: misurarlo; `people/[id]/page.tsx:121` chiama `notFound()` — sotto un boundary il caricamento diretto potrebbe rispondere 200 con l'interfaccia di not-found: verificarlo (la 404 di `error-pages.spec.ts:52` passa dal catch-all fuori dal layout dashboard); con lo scheletro l'URL cambia **prima** del contenuto: un `toHaveURL` seguito da una lettura non ritentata (`evaluate`, `count`) diventa una corsa → audit dei 195 `toHaveURL`; lo scheletro non usa `.page`, `.card`, `.page-head` né testid usati come segnale (30 `waitForSelector('.page')` in 5 file); scheletro unico a ogni larghezza → nome nuovo senza suffisso; l'indicatore è un attributo sulla tab esistente (nessun testid nuovo `mobile-tab-*`, famiglia `mobile-tab-<navItemId>`); i18n «Caricamento…» con «…» (`BANNED` vieta `\.\.\.`), voce di glossario da proporre.

**Dimensione**: 18.3a ~10-15 file, +600/900; 18.3b ~6-10 file, +300/500 + l'audit della suite. Insieme ≈ 1/2 della 19.7a.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 18.3; `ui-review.md` M5/M7; `15-10-sweep-finale-mobile.md` (focus trap, portali)

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.3-a** = A: anche sul computer Indietro chiude pannello laterale e menu Esporta (nessun gate `matchMedia`).
- **Q-18.3-b** = A: un solo scheletro per tutte le pagine, telefono e computer (blocchi grigi a forma di titolo e righe; topbar e tab ferme).
- **Q-18.3-c** = A: la tab toccata si accende subito con un puntino che pulsa finché arriva la pagina.
- **Split** = sì: **18.3a** «Indietro chiude» (AC 1-7) e **18.3b** «La navigazione risponde» (AC 8-10, dopo l'Epic 17).


## Dev Agent Record

### Agent Model Used

GPT 6 Sol (sviluppo, un solo agente). Riesame indipendente GPT 6 Sol xhigh approvato sul commit `55c8601a7a2daef03550357589da34fb34028e80` (tree `08b4baba631f6e629b936a37f4fada36d0153d2a`); nessun rilievo bloccante residuo.

### Completion Notes List

- AC 1/2/7: `SlideOver` e `MobileSheet` creano una voce history allo stesso URL; Indietro, ✕, scrim, Escape e Chiudi convergono sulla stessa chiusura. Il focus torna al trigger e il focus trap rimane nella primitiva. Il comportamento vale anche per il pannello desktop e il menu Esporta desktop. `MiniModal` e il modale Quota associativa restano esclusi.
- AC 3/4/5: i tre pannelli Filtri applicano con `router.replace` dalla voce del layer; i link interni usano `replace` e preparano la navigazione; sheet → editor trasferisce la voce al pannello. I test contano le navigazioni del frame principale e verificano il secondo Indietro.
- AC 6: la chiusura dopo salvataggio non invoca `back()` prima del `router.refresh()`. Next può rimpiazzare il custom `history.state` nel refresh: il cleanup riconosce la stessa URL e il token attivo, marca la voce consumata e la salta al prossimo Indietro. Una prova diagnostica su build precedente mostrava token presente all'apertura e assente dopo il refresh, con Back bloccato sulla stessa URL; dopo la correzione `e2e/flights.spec.ts` passa 8/8 ripetizioni seriali senza retry (`scripts/e2e.sh start e2e/flights.spec.ts -g 'admin registers a flight with takeoff/landing times' --repeat-each=8 --workers=1`, `E2E_EXIT=0`).
- Handoff 18.2a: su database sintetico con quota annuale positiva, da Panoramica si entra in Scadenze e si apre Altre azioni → Quota associativa. Il test verifica sheet chiuso, modale aperto e focalizzato allo stesso URL, annullamento senza POST di addebito, poi un solo Indietro verso Panoramica. Il modale non riceve alcun comportamento Back.
- Browser headless usa `page.goBack()`; il gesto iOS e il tasto hardware Android non sono verificati direttamente. Avanti dopo una chiusura può rivisitare lo stesso URL senza riaprire il layer né ripristinare i campi del form: comportamento dichiarato in `CLAUDE.md`.
- Gate sul primo candidato `c90c93d`: `npm run gates` exit 0 — lint 41 s, typecheck 5 s, 2.329 unit test in 16 s, build 53 s. Preflight `.env`: DB `localhost`, SMTP `localhost:1025`; ricreazione DB, 60 migrazioni e seed sintetico exit 0. `scripts/e2e.sh start` sul DB nuovo: `E2E_EXIT=0`, 676 passed, 2 flaky, 2 skipped in 26,4 min. I 9 test `history-layers.spec.ts`, il salvataggio di `flights.spec.ts:227` e l'handoff quota sono passati al primo tentativo.
- Misura AC 3: nel test Registro voli l'URL filtrato è raggiunto con al massimo un evento `framenavigated` del frame principale; la prova Scadenze esistente ne richiede esattamente uno e quella Contabilità al massimo uno. Un Indietro torna all'URL non filtrato. La soglia di latenza 100 ms e il costo di prefetch appartengono alla 18.3b (AC 8–10), non sono dichiarati verificati qui.
- Flaky del primo candidato fuori 18.3a: `e2e/mobile-reports.spec.ts:422` ha visto 0 invece di 1 riga classificata per 5 s, poi è passato al retry #1. `e2e/mobile-metar.spec.ts:167` è rimasto su `/it/login` per 5 s al primo tentativo; al retry #1 è stato **saltato** perché il METAR upstream era nullo, quindi la sua UI non è verificata. Anche `mobile-metar.spec.ts:61` e `:208` sono saltati per risposta nulla di `aviationweather.gov`; nessuno dei tre casi METAR viene contato come prova positiva. Nel primo run integrato, prima della correzione del refresh, AC 6 era fallito due volte (URL ancora `/it/dashboard/logbook`) e il test Mailpit locale aveva atteso invano 1 messaggio sintetico per 15 s; il run finale di quel candidato non ha riprodotto il timeout Mailpit.
- Mutanti del primo candidato, solo su quattro copie isolate `/tmp`: SHA-256 di `history-layer.ts` originale e copia baseline `d25aca7c47bbe6f3d9e6e8a8a7aef95e2a079ca6c8a5d1db87e37c26deb29f99`. Baseline sulla copia: 10/10 test pertinenti verdi, exit 0. `back()` in Applica → AC 3 rosso, URL `/it/dashboard` anziché `?flightType=TOURISM`, test exit 1; `back()` nel trasferimento → AC 5 rosso, `identity-form` assente, exit 1; `back()` dopo save → AC 6 rosso già sul pannello risultato assente (prima della verifica della riga), exit 1; `pushState` con `?__history_mutant=1` → AC 1 rosso sull'URL identico all'apertura, exit 1. Ogni mutante è stato provato separatamente contro la stessa baseline.
- Harness mutanti: il primo `CI=1 npx playwright test` nella copia è uscito 1 durante il build Turbopack (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`), senza eseguire test. Il build isolato `next build --webpack` ha poi richiesto `typescript.ignoreBuildErrors` **solo nella configurazione della copia** per un errore di tipo preesistente su `negative-balances/route.ts`; i cinque build webpack baseline/mutanti e i test browser indicati sopra sono stati eseguiti. Il gate canonico ha verificato typecheck e build senza queste deroghe. Nessuna modifica del harness è stata copiata nel repository.
- Correzione dei rilievi bloccanti della revisione iniziale e del riesame, poi approvata dal revisore indipendente: le voci consumate si attraversano nella direzione corretta anche con Avanti; una chiave della voce browser le riconosce quando Next perde il marker durante `router.refresh()`. Il salto pendente ora appartiene alla voce che è stata consumata, così un nuovo sheet su una pagina B non riusa la voce di A. «Applica» invariato e un link Altro già attivo senza query chiudono il layer come dismiss; con query il link Altro cancella i filtri tramite navigazione. «Azzera filtri» su URL già pulito azzera anche la ricerca digitata ma non applicata, senza riarmare il debounce; ✕/Escape mantengono il cancel. Il test di Registro voli crea una propria fixture sintetica perché il seed minimo contiene zero voli e nasconde Filtri nell'empty state.
- Prove rosse prima della correzione: `scripts/e2e.sh start e2e/history-layers.spec.ts -g '18.3a review:' --no-deps` → `E2E_EXIT=1`, «Applica» invariato lasciava Indietro su `/it/dashboard/logbook`; la prima sonda Avanti conteneva un errore di test (URL letto prima dell'attesa) ed è stata sostituita. La sonda corretta AC 6 save → Fleet → Indietro → Avanti → `E2E_EXIT=1`, Avanti restava su Billing anziché Fleet, 3/3 tentativi. Il test aggiunto save → Fleet → dettaglio → Indietro → `E2E_EXIT=1`, usciva da Fleet verso Billing, 3/3 tentativi. Dopo i fix, `scripts/e2e.sh start e2e/history-layers.spec.ts e2e/mobile-membership-fee.spec.ts --no-deps` → `E2E_EXIT=0`, 17/17 al primo tentativo (prima della fixture indipendente).
- Discriminanti corretti su copia isolata `/tmp/airmanager-18-3a-mutants`: SHA-256 finale di `history-layer.ts` canonico e copia `c5aebd40f71ec37f931d1c96d37c1a211c9d1124a1af4797833756b568c4956b`, di `mobile-nav.tsx` canonico e copia `f0e656b9223dec090659cf38a8f0a3a7b7011b5321d15bd7751b7ff306a2529c`. Baseline Webpack isolata 4/4, exit 0. Cinque mutanti separati, ognuno con build exit 0 e test browser exit 1 sull'asserzione prevista: direzione Avanti rimane Billing; riuso globale fa uscire dal dettaglio Fleet verso Billing; no-op «Applica» lascia Indietro su Logbook; senza handler di reset il testo `PendingReviewSearch` rimane; guard del link attivo senza search lascia `?flightType=TOURISM`. Script `/tmp/airmanager-18-3a-review-mutants.py`, riepilogo `/tmp/airmanager-18-3a-review-mutants-summary.log` (`MUTANTS_EXIT=0`). La prima esecuzione della baseline su DB davvero vuoto fallì prima delle asserzioni history per Filtri nascosto; dopo la fixture sintetica la baseline passa. Un avvio isolato senza `AUTH_TRUST_HOST=true` fallì al login con `UntrustedHost`; la copia corretta è stata riavviata con fiducia del solo localhost. Nessuna deroga né mutazione è stata portata nel repository.
- Gate della correzione: `npm run gates` exit 0 — lint 37 s, typecheck 13 s, 2.329 unit test in 15 s, build 47 s (`/tmp/airmanager-18-3a-review-gates-final.log`). Preflight exit 0: DB `localhost`, SMTP `localhost:1025`; `npm run db:reset` exit 1 soltanto perché `sudo` non è installato (`scripts/reset-db.sh: line 13: sudo: command not found`). Reset equivalente sul container Postgres locale, 60 migrazioni e seed sintetico exit 0 (`/tmp/airmanager-18-3a-review-db-reset-final.log`). `scripts/e2e.sh start` sull'albero finale e DB nuovo: `E2E_EXIT=0`, 682 passed, 1 flaky, 2 skipped in 26,4 min (`/tmp/airmanager-18-3a-review-e2e-final.log`). Tutti i 14 test `history-layers.spec.ts`, il percorso quota `mobile-membership-fee.spec.ts:78` e `mobile-reports.spec.ts:422` passano al primo tentativo. Il caso METAR `:167` fallisce prima della UI: login rimasto su `/it/login` per 5 s, poi retry #1 saltato per METAR upstream nullo; `:61` e `:208` saltati per upstream nullo. Tutte e tre le UI METAR restano **non verificate**. Nessun timeout Mailpit nel run finale. Gesti iOS e tasto hardware Android non verificati direttamente.

### File List

- `src/components/ui/history-layer.ts`, `slide-over.tsx`, `mobile-sheet.tsx`, `bottom-sheet.tsx`
- `src/components/shell/mobile-nav.tsx`, `mobile-top-bar.tsx`
- console/editor in `src/app/[locale]/dashboard/{billing,bookings,expiries,fleet,instructors,logbook,pilots}`
- `e2e/history-layers.spec.ts`, `e2e/flights.spec.ts`, `e2e/mobile-membership-fee.spec.ts`
- `CLAUDE.md`, questo record, `sprint-status.yaml`, piano `docs/superpowers/plans/2026-11-26-story-18-3a-history.md`
