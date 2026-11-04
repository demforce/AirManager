---
baseline_commit: 1f6ab3e
---

# Story 18.3: Indietro chiude, la navigazione risponde

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e`). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Split** in **18.3a «Indietro chiude»** e **18.3b «La navigazione risponde»** (due meccanismi indipendenti con rischi diversi, ognuno col suo arbitro sulla suite completa): v. §PO. La 18.3b va dopo l'Epic 17 (che cambia i tempi delle stesse pagine).

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

- [ ] 18.3a: NEW `src/components/ui/history-layer.ts` (gemello di `focus-trap.ts`), UPDATE `slide-over.tsx` e `mobile-sheet.tsx`, i 3 «Applica», i 6 link con `close`, i 2 passaggi sheet → pannello; e2e nuovo; aggiornare la riga «Escape e i pannelli» di CLAUDE.md.
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

### Completion Notes List

### File List
