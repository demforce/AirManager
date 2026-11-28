# Review adversarial — Story 15.10 «Sweep finale mobile»

**Reviewer**: subagent adversarial (Opus 5 xhigh) · **Data**: 2026-08-06 · **Macchina**: Fedora locale dell'utente
**Commit in review**: `215ef49` (feat) + `8ab7dbc` (record), su `dev` · **Baseline**: `79571c5`
**Verdetto**: **SHIPPABLE-WITH-FIXES** — 3 MAJOR (di cui uno rende ROSSO l'arbitro), 2 MINOR, 4 LOW.
La sostanza della story regge e l'ho verificata dal vivo su superfici che il dev NON ha campionato
(13 pagine x 2 larghezze per `inert`, 4 attori x 2 temi per l'inchiostro, 3 editor in NUOVO e in MODIFICA,
6 pagine + `/ppr` pubblico per i bersagli, banda METAR su tutte e quattro le facce). I tre MAJOR sono:
una guardia NUOVA scritta sul valore ottenuto che fa fallire l'arbitro su DB fresco, un buco REALE del
focus trap attraverso i popover portalati, e il `.so-foot` senza safe-area proprio nella story che ha
acceso `viewport-fit=cover`.

---

## 0. Arbitro — VERBATIM

Comando (DB fresco, seedato, come da consegna):

```
set -a && . ./.env && set +a && export JOBS_SECRET=review-15-10-arbiter
CI=1 scripts/e2e.sh start        # pid 3407765
scripts/e2e.sh status
```

```
log: /tmp/airmanager-e2e/last-run.log
args: <full suite>
state: DONE — E2E_EXIT=1
--- summary ---
  1 failed
  39 did not run
  467 passed (11.8m)
--- last lines ---
  1 failed
    [chromium] › e2e/mobile-ink-targets.spec.ts:484:9 › story 15.10 — /dashboard/ppr, the surface built
    before the primitives (AC 7) › no target under the floor at 320px, and the card is untouched
  39 did not run
  467 passed (11.8m)
```

Copia integrale del log: `/tmp/claude-1000/-home-admin-AirManager/756bf5df-6305-44ec-bd2f-d0e61f2d5e2e/scratchpad/arbiter1.log`.

**Il DB ERA fresco**: `datetime-picker.spec.ts:127` (il rosso ambientale da `OPTIONS_PAGE_SIZE` su DB post-suite,
§9 del record) è passato, e a fine run i conteggi coincidono al numero con quelli che il §1 della story
attribuisce a un DB post-suite (386 Person, 177 Aircraft, 72 PprRequest).

**I 39 «did not run»** sono l'INTERA catena serializzata: i 10 project con `dependencies` non partono se il
project `chromium` fallisce. Li ho eseguiti uno per uno con server riusato (`E2E_REUSE_SERVER=1`, `--no-deps`),
**tutti verdi**: `mobile-metar 3` (incluso il test NUOVO della banda 641-900) · `settings 7` · `booking-window 4` ·
`reports 5` · `treasury-settings 3` · `billing-global 2` · `mobile-overview-overflow 1` · `mobile-membership-fee 2` ·
`mobile-settings 12` = **39/39 passed, exit 0 ciascuno**.

Quindi il conto reale della suite è 467 + 39 + 1 = **507** test come dichiarato, ma **l'esito è exit 1**, non
«507/507, 0 flaky, exit 0».

`npm run gates`: **PASS** (lint 21s, typecheck 3s, vitest 1773 passed, build 30s).

---

## MAJOR-1 — La guardia nuova di AC 7 è scritta sul VALORE OTTENUTO e fa fallire l'arbitro su DB fresco

**File**: `e2e/mobile-ink-targets.spec.ts:507` (`expect(geometry.cardHeight).toBe(82.83)`)

**Fallimento** (3 tentativi su 3, quindi deterministico dentro il run, non flaky):

```
1) [chromium] › e2e/mobile-ink-targets.spec.ts:484:9 › … no target under the floor at 320px, and the card is untouched
   Error: expect(received).toBe(expected) // Object.is equality
   Expected: 82.83
   Received: 101.67
     505 |         expect(geometry.cardIsButton).toBe(true);
     506 |         expect(geometry.cardInteractiveChildren).toBe(0);
   > 507 |         expect(geometry.cardHeight).toBe(82.83);
```

**Causa misurata** (server di produzione, DB attuale, script `playwright-core` throwaway):

```
### /dashboard/ppr @320 — prime 6 card
distinct heights: [82.83, 101.67, 77.91]
### /dashboard/ppr @375 — prime 6 card
distinct heights: [82.83, 59.06]
```

L'altezza della card dipende dal CONTENUTO della prima riga della coda: i nomi che le fixture e2e scrivono
in `PprRequest` sono del tipo `Nega Test-1786045551936-hvgdm8` (30 caratteri) e a 320px **vanno a capo**
(`.ppr-card-name` alto 38 invece di 19) → 101,67 invece di 82,83. Sotto `fullyParallel`, quale riga sia la
prima quando questo test gira dipende da quali spec hanno già creato/deciso PPR (`ppr-queue`,
`mobile-expiries-movements`, `movements`, `mobile-self-public`…):

```
docker exec airmanager-postgres-1 psql -U airmanager -d airmanager \
  -c "select status, \"firstName\", \"lastName\" from \"PprRequest\" order by \"createdAt\" desc limit 4;"
 REJECTED | Nega    | Test-1786045551936-hvgdm8
 APPROVED | Mobile  | Test-1786045549644-4n9ozy
 PENDING  | Doppio  | Test-1786045547700-01exv9
 PENDING  | Manuale | Staff-1786045543732-25xqkm
```

È esattamente la classe che CLAUDE.md vieta («mai fotografia+uguaglianza» su aggregati/stati che altri spec
mutano) e la **lezione 4 citata dalla story stessa** («le guardie si scrivono sul REQUISITO, mai sul valore
ottenuto»). Il requisito di R-15.10-j è «card, sheet e testata INVARIATI»: si prova con `tagName === 'button'`,
`interactiveChildren === 0` e `height >= 44` (già asseriti nelle due righe sopra), non con `=== 82.83`.
Il costo del difetto non è solo il rosso: **ha impedito l'esecuzione dei 39 test della catena serializzata**,
cioè di tutte le guardie di stato globale dell'epic, compresa quella della banda METAR di questa story.

**Fix minimo**: sostituire `toBe(82.83)` con l'asserzione del requisito (o misurare una card scelta per
contenuto, non «la prima»). Il resto del test (sweep dei bersagli, `pageOverflow`) è sano e passa a 320/375/390.

---

## MAJOR-2 — Il focus trap NON tiene: dal popover portalato del calendario il Tab esce dietro lo scrim

**File**: `src/components/ui/focus-trap.ts:75-92` (listener sul PANNELLO) + `src/components/ui/slide-over.tsx:80`
(`aria-modal="true"`), con `src/components/ui/date-input.tsx:124` / `datetime-input.tsx:135` che portalano
`.cal-popover` su `document.body`.

**Riproduzione** (375x812, ADMIN, build di produzione):
`/it/dashboard/bookings` → «Nuova prenotazione» → click sul trigger calendario → Tab.

```
### 1a. focus after panel open      ASIDE[PrenotazioniNuova pren] @panel
### 1b. focus after calendar opens  INPUT[INPUT] @popover
### 1c. Tab x8 from inside the calendar popover
 [ "BUTTON[Oggi] @popover",
   "BUTTON[Conferma] @popover",
   "BODY[AirManagerAviosuperfic] >>OUT<<",
   "BUTTON[Cambia tema] >>OUT<<",
   "BUTTON[mobile-profile-button] >>OUT<<",
   "A[calendar-prev] >>OUT<<",
   "INPUT[INPUT] @panel",
   "INPUT[INPUT] @panel" ]
```

Quattro fermate consecutive FUORI dal pannello, su controlli reali della shell e della pagina dietro lo
scrim (`Cambia tema`, `mobile-profile-button`, `calendar-prev` della pianificazione). Il trap non può
intervenire per costruzione: il listener sta sul pannello (`panel.addEventListener('keydown', …)`,
`focus-trap.ts:90`) e il popover è portalato **fuori** dal pannello, quindi l'evento non passa mai da lì.

Contraddice **AC 2(c)** («`Tab`/`Shift+Tab` restano dentro») e **AC 1(d)** («lo sfondo non è raggiungibile da
tastiera») su un percorso quotidiano: ogni pannello dell'epic con un campo data (bookings, logbook,
movements, `/dashboard/ppr`, billing…). E rende falsa la promessa `aria-modal="true"` che la story ha
appena aggiunto — proprio il criterio che `mobile-sheet.tsx` citava per NON aggiungerlo prima
(«claiming modality without enforcing it is worse than not claiming it»).

Il typeahead **non** ha lo stesso problema (misurato: le opzioni sono `li[role=option]` non tabulabili, il
focus resta sull'input):

```
### 2b. Tab x6 with listbox open
 [ "INPUT[flight-person] @panel", "INPUT[flight-instructor] @panel", "SELECT[flight-type-select] @panel", … ]
```

La copertura nuova non vede il buco: `mobile-a11y-sweep.spec.ts:222` cammina 16 Tab **senza mai aprire un
popover**.

**Opzioni di fix** (decisione PO): (a) estendere `tabbableWithin` al popover attivo (il popover è
identificabile: `.cal-popover` con `z 66`) e agganciare il listener anche lì; (b) montare il popover DENTRO
il pannello quando il pannello è aperto (rompe TD-7: il `transform` del pannello intrappola i `fixed`);
(c) togliere `aria-modal` finché il buco resta e DICHIARARLO. La (c) è la sola coerente con la dottrina che
la story stessa ha scritto, se non si fa la (a).

---

## MAJOR-3 — `.so-foot` non ha la safe-area, e questa story ha appena acceso `viewport-fit=cover`

**File**: `src/styles/airops.css:1109-1112` (`.so-foot{ … padding: 12px 20px; }`) +
`src/app/[locale]/layout.tsx:41-45` (`viewportFit: 'cover'`) + i tre editor che ci hanno spostato dentro il
submit primario (`aircraft-editor.tsx:250`, `pilot-editor.tsx:158`, `instructor-editor.tsx:139`).

Misurato a 375 con il pannello dell'editor aeromobile aperto:

```
### .so-foot vs .so-actions safe-area
 footPaddingBottom: "12px"      footBottom: 812   submitBottom: 800   innerHeight: 812
 panelPaddingBottom: "0px"
 footRule: ".so-foot { border-top: …; background: var(--panel-2); align-items: center; gap: 8px; padding: 12px 20px; display: flex; }"
### .so-actions (la barra che ha sostituito)     paddingBottom: "12px"   → CSS: calc(12px + env(safe-area-inset-bottom))
### .mobile-sheet-panel (confronto)              paddingBottom: "24px"   → CSS: calc(24px + env(safe-area-inset-bottom))
```

Le sei righe `env(safe-area-inset-bottom)` dell'app (`airops.css:1773, 1775, 1810, 1851, 2024, 3082`) coprono
`.main`, `.toast-host`, `.mobile-tabbar`, `.mobile-sheet-panel`, `.so-actions`, `.membership-fee-modal`.
**`.so-foot` non è fra queste** — ed è la sola superficie ancorata al bordo inferiore che questa story ha
promosso ad **azione primaria** del pannello a tutto schermo (7 call-site prima, 10 adesso). Finché
`viewport-fit` non era dichiarato, l'omissione era inerte come tutte le altre; con `cover` acceso, su un
iPhone con home indicator (34px) il submit primario resta a 12px dal bordo FISICO, cioè ~22px dentro la
striscia di sistema, mentre la barra che ha sostituito ne teneva 12+34.

È letteralmente il difetto che R-15.10-l voleva evitare («`viewport-fit=cover` **senza** gli `env()` sarebbe
un difetto: contenuto sotto la tacca»), ed è invisibile al metodo di verifica dichiarato («a inset 0 ogni
valore identico al centesimo»): a inset 0 il valore È identico — il buco si vede solo nell'aritmetica.

**Fix**: una riga, dentro la query telefono per non toccare il desktop —
`.so-foot{ padding-bottom: calc(12px + env(safe-area-inset-bottom)); }`.
**Da decidere col PO**: con `cover` acceso valgono anche `-top`/`-left`/`-right`, che l'app non usa MAI
(`grep -rn "safe-area-inset-\(top\|left\|right\)" src/` → 0). `.mobile-topbar` è `position: sticky; top: 0`
con `padding: 10px 14px` (`airops.css:1778-1784`): in standalone/landscape su device con tacca il contenuto
ci finisce sotto. O si aggiungono, o si dichiara il limite con un numero.

---

## MINOR-1 — I tre editor cambiano anche il DESKTOP, e la prova di invarianza non poteva vederlo

**File**: `aircraft-editor.tsx:241-259`, `pilot-editor.tsx:151-166`, `instructor-editor.tsx:126-142`.

Misurato a **1280** (stesso probe dei 375):

| editor | `.so-foot` a 1280 | submit | `.so-actions` in body |
|---|---|---|---|
| aircraft | assente prima → **presente** | in `.so-foot` | 0 |
| pilot | **59,84px** | `pilot-identity-submit` 34,84 in `.so-foot`, `top 853,16 / bottom 888` | 0 |
| instructor | **59,84px** | idem | 0 |

Prima della story il submit dell'anagrafica era l'ultima riga del `<form>` dentro `.so-body` (scorreva via);
ora è una barra permanente in fondo al pannello a **tutte** le larghezze. L'AC 12 dichiara «desktop
invariato su tutte le pagine che rendono i componenti toccati», e il record afferma «geometria a 1280
identica al centesimo su tutte e 13 le pagine» — ma le grandezze citate (`docH`, `.page-head`, `.card-head`,
tab bar, weather card) sono **di pagina** e non possono vedere l'interno di un pannello. Il cambio è
coerente con la grammatica desktop già esistente (7 call-site usano `footer` da prima) e discende dalla
lettera di R-15.10-f, ma è una **modifica di design desktop non misurata e non dichiarata**: va ratificata
dal PO o ristretta a ≤640.

---

## MINOR-2 — Uno spec esistente modificato non è dichiarato da nessuna parte

`git diff 79571c5 215ef49 --stat` elenca **sei** spec esistenti modificati:
`mobile-overview.spec.ts`, `mobile-primitives.spec.ts`, `mobile-registries.spec.ts`, `mobile-self-public.spec.ts`,
`mobile-settings.spec.ts`, `mobile-metar.spec.ts`.
Il §7 del record ne dichiara **quattro** voci (settings x2, primitives, metar) e il §9 spiega le due
correzioni dell'arbitro #1 (overview:607, registries:774). **`mobile-self-public.spec.ts:387-394`**
(`[role="dialog"]` → `getByRole('dialog')`) non compare né in §7 né altrove. La modifica in sé è corretta e
non riduce copertura, ma la regola dell'epic è che ogni spec toccato sia dichiarato con la motivazione.

---

## LOW-1 — Se il nodo con il focus sparisce, il trap smette di esistere

`focus-trap.ts:63-69` gestisce il caso «zero fermate» rifocalizzando il pannello, ma il listener sta sul
pannello: se il focus cade su `body` (nodo focalizzato rimosso dal DOM), l'evento non passa più di lì e il
Tab riparte dall'inizio della pagina. Misurato in modo sintetico (rimuovendo i controlli dello sheet volo):

```
### 1c. ZERO focusables — Tab x3
 [ "A[mobile-tab-overview] >>OUT<<", "A[mobile-tab-schedule] >>OUT<<", "A[mobile-tab-ppr] >>OUT<<" ]
```

**Non riprodotto su nessun percorso reale**: entrambi i `secondStep` che cambiano i focusabili dentro lo
sheet autofocalizzano un controllo interno (misurato: `ppr-complete-fee-input-mobile` su movements,
`flight-cancel-reason-mobile` su logbook, e da lì il ciclo è chiuso e corretto). Resta una fragilità del
chassis: un futuro step senza autofocus lo espone.

## LOW-2 — `aria-modal="true"` mette FUORI dal modale i portali dell'app

Stessa radice del MAJOR-2, lato tecnologie assistive: con `aria-modal` sul pannello, tutto ciò che vive
fuori dal suo sottoalbero è non percepibile. Fuori ci sono `.cal-popover`, `.combo-listbox` e **il toast host**
(misurato: `hostExists: true, insidePanel: false`, figlio di `body`). Un annuncio di errore/successo emesso
mentre il pannello è aperto può non essere annunciato.

## LOW-3 — `.crumbs .sep` classificato «decorazione» è testo esposto

Censimento §3 voce 3: `.crumbs .sep` (3,66/4,14) è marcato DECORAZIONE (soglia 3, «RESTA»). Il nodo è
`<span className="sep">/</span>` (`src/components/shell/top-bar.tsx:76`), **senza** `aria-hidden`: è testo
renderizzato e letto. La classificazione lo toglie dalla coda dei TD residui (dove finiscono gli altri 11
consumatori dichiarati). Correzione di una riga nel censimento (o `aria-hidden="true"` sul separatore, che
sarebbe il fix giusto e costa quanto la riclassificazione).

## LOW-4 — Il trigger calendario di `ManualPprForm` è coperto dalla barra sticky al primo sguardo

Misurato su `/dashboard/ppr` → «Registra manualmente», `scrollTop 0`:

```
### 1. geometry of the ETA trigger vs the sticky bar (scrollTop 0)
 triggerTop 756.73  triggerBottom 800.73  barTop 743  covered: true  hitElement: "manual-ppr-submit"
### 2. after a REAL wheel scroll (250px)   triggerTop 506.73  covered: false
### 3. popover after the tap              popovers: 1 (visible)
### 4. popover after a scroll while open  0   ← chiusura su qualunque scroll, per progetto (TD 5)
```

Il dev lo dichiara (correzione 10 e TD 5) ed è raggiungibile dopo uno scroll, ma è lo **stesso difetto R3**
che i tre editor hanno appena curato col piede fuori dal corpo, su un form che questa story ha toccato:
il bersaglio da 44px c'è, la sua hit-testability al primo sguardo no. Da decidere se `ManualPprForm` prende
la stessa medicina (`footer` con `form="manual-ppr-form"`) o resta dichiarato.

---

## Quello che ho verificato ed è SOLIDO (con la misura)

1. **AC 3 — `inert` da chiuso**, esteso ben oltre le 3 pagine della guardia: **13 pagine x 2 larghezze**,
   fino a **4** wrapper `.slideover` per pagina (instructors 4, dashboard 3, bookings/pilots 2),
   `missingInert=0`, **`tookFocus=0` su 119 controlli candidati per larghezza**, `exposedDialogs=0` ovunque.
   Ciclo apri/chiudi/riapri/richiudi: `inert` torna, `aria-hidden` torna, il focus torna al trigger.
2. **AC 1 — trap sugli sheet** su consumatori NON campionati dal record: sheet prenotazione
   (`booking-move/flown/noshow/cancel/Chiudi`, 10 Tab e 6 Shift+Tab tutti `@sheet`), pannello Filtri Scadenze
   (14 Tab + 6 Shift+Tab tutti `@panel`), ExportMenu su **billing** (8 Tab tutti `@sheet`),
   sheet con UN solo focusabile (ciclo su sé stesso, corretto).
3. **AC 2 — nome accessibile**: pannello **senza** subtitle → `dialog "Attacker-… Istruttore"` (nessun
   separatore orfano); **con** subtitle → `dialog "Prenotazioni Nuova prenotazione"` (lo spazio lo mette il
   browser fra i due blocchi: `ariaSnapshot` verbatim). `aria-labelledby` risolve a un solo nodo.
4. **Focus di ritorno** anche sulla chiusura PROGRAMMATICA (non solo Escape/Chiudi): «Applica» del pannello
   Filtri su movements e billing → focus su `mobile-*-filters-button`. Su fleet, sheet→pannello→Escape il
   focus torna alla card (comportamento dichiarato).
5. **Deviazione 1 (`headingRepeatsPageHead`)** provata sulle DUE facce e con l'attore che l'ha motivata:
   PILOTA su `/my-account` → `.account-head-self` presente, titolo `display:none`, testata **73px**
   (101,3 → 73 = **−28,3** come dichiarato), prima riga a `top 295,41`; **PILOTA sulla PROPRIA scheda persona**
   (`/dashboard/people/{suo id}`) → `.account-head-self` ASSENTE, titolo «Estratto conto» visibile,
   testata **101,3 intatta**. La deviazione è giusta e la ratifica letterale (`showActor===false`) l'avrebbe rotta.
6. **Deviazione 2 (banda METAR)** su **tutti e quattro** gli attori a 640/641/768/900/901: nella banda il
   contenitore è `flex` ma **contH = 0** e OGNI figlio `display:none` (nessun varco, nessun salto di layout,
   `pageOverflow` 0); a 901 il contenitore torna `none`. Con stazione configurata il test in catena
   (`mobile-metar.spec.ts:167`) passa: la card è l'unico figlio visibile.
7. **Deviazione 3 (`.stat-tone-info`)**: il literal è **identico** a quello ratificato
   (`oklch(0.38 0.12 245)` = `.badge.info:713` = `.alert-box.info:789`); a runtime in chiaro il colore del KPI
   e quello del badge coincidono (`lab(27.5343 -4.36147 -38.6573)`).
8. **Deviazione 4 (`.date-input-btn`)**: 44x44 con input 44 e `padding-right 48px` su logbook, billing,
   settings, movements, bookings, `/dashboard/ppr` **e** `/ppr` pubblico, a **375 e a 640**; 24x24 con
   `padding-right 30px` su tutte e sette a **641 e a 1280**. Le sei regole ancorate rimosse: verificate
   (4 a 36px + 2 a 44px). `/ppr` pubblico invariato (44/48 sotto, 24/30 sopra, come lo aveva lasciato la 15.9).
9. **Deviazione 5 (piede dei tre editor)**, in MODIFICA a 375: submit in `.so-foot`, fuori da `.so-body`,
   `hit: true` sia a `scrollTop 0` sia a `scrollHeight` (aircraft 1699/659, pilot 2606/647, instructor 2568/647),
   44px, `.so-actions` in body = 0, azioni secondarie ancora in corpo e raggiungibili
   (`new-rate-submit`, `hour-meter-submit`, `pilot-access-create`, `instructor-payout-rate-submit`,
   `instructor-rates-submit`: tutte `hit: true`). In NUOVO: aircraft usa il piede, pilot resta con la barra
   sticky (unico form, ultimo figlio) e il submit è `hit: true` anche a fine scroll (2028/728).
   **`form="<id>"` COLLEGA davvero**: submit invalido dal piede → «Campo obbligatorio.» e **zero** richieste
   di rete; submit valido → `PATCH /api/v1/aircraft/{id}` + toast.
10. **Contrasti** rimisurati nei due temi: `.mobile-tab-label` **4,64 / 6,18** (attiva 17,99 / 17,00, item 47,92px
    invariato), `.so-sub` **4,85 / 5,72**, KPI expiries **9,82 / 9,78** (inline sparito, classe presente),
    «Giorni rimasti» **8,38 / 4,94** con la seconda fascia inline che passa (11,32 / 9,74), 62 link «Saldi
    negativi» **18,79 / 15,74** con `text-decoration: underline`. Gemelli `.stat-tone-*` su billing:
    ok 10,63/9,30 (31 nodi), bad 9,82/6,61 (85 nodi) — nessuno peggiorato.
11. **Multi-attore** (ADMIN/PILOTA/ISTRUTTORE/ALLIEVO x 2 temi x 3-4 pagine): 5 colonne di tab bar,
    ratios 4,64/17,99 e 6,18/17,00 ovunque, ogni `.slideover` chiuso `inert`, trigger data 44, `pageOverflow` 0.
12. **Censimento `--ink-4`**: 17 consumatori residui + i 2 spostati = **19** ✓; i tre blocchi dichiarati morti
    (`.syl-num`, `.nf-route .arrow`, `.ppr-empty`) hanno davvero **0** consumatori in `src/**/*.tsx`;
    `.wd-bar` è un `background` (grafico) e `.mobile-row-chev` è `aria-hidden="true"` (v. LOW-3 per il terzo).
13. **`/dashboard/ppr` e il form condiviso**: **0** bersagli sotto 43,5 a 320/375/390, `pageOverflow` 0,
    card `BUTTON` con 0 figli interattivi, sheet `role=dialog` + `aria-modal` + nome
    «Richiesta — I-PK2IY7EB · Cessna 172» con Approva/Rifiuta/Chiudi a 44; **0** bersagli anche nella
    `.manual-ppr-form` montata da `/dashboard/movements`. Prezzo dichiarato confermato:
    `.page-head` 115,44 (+9,16), `.card-head` 101,3 a 375 e 153,3 a 320, `docH` 1671.
14. **`viewport-fit`**: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`;
    a inset 0 i valori sono identici (`.main` 100px, `.mobile-tabbar` 12px, `.toast-host` 92px, `.so-actions` 12px,
    tab bar `bottom == innerHeight`).
15. **`scripts/e2e.sh` (R-15.10-m)**: `-g "aria-modal is set, Tab cycles inside"` → **1 passed, exit 0**
    (l'argomento arriva intero, spazi e virgola compresi); `-g "claims modality (AC 1)"` e
    `-g "nessun test con questo nome (test)"` → «No tests found» **con la sentinella `E2E_EXIT=1`** (pre-fix il run
    moriva senza sentinella). Lock e detach intatti: un secondo `start` durante l'arbitro ha risposto
    `ALREADY RUNNING (pid 3407765, 9m19s elapsed) — args: <full suite>` senza toccare log né args file.
16. **Consegna**: nessuna stringa i18n nuova (diff su `messages/` vuoto, nessun testo hardcoded nel diff);
    **7 testid aggiunti = 7 rimossi con nomi identici** (`identity-form`, `identity-submit`,
    `instructor-identity-form`, `instructor-identity-submit`, `manual-ppr-form`, `pilot-identity-form`,
    `pilot-identity-submit`) — claim verificato con `git diff | grep -o 'data-testid="[^"]*"'`;
    nessun suffisso `-mobile` nuovo; `sprint-status.yaml` a `review` (unica riga cambiata, atteso);
    17 usi di `SlideOver` in 15 file e 10 call-site del prop `footer` confermati; i 40 inline `--bad`/`--ok`
    sono ancora 40 (TD 3 accurato); AD-7 rispettato (nessun file sotto `src/app/api`, `src/server`, `prisma`).
17. **Spec esistenti modificati, copertura non ridotta**: `mobile-settings:795` stessi 3 URL, requisito
    ribaltato ≤36 → ≥44 **per decisione PO R-15.10-d**, più `expect(triggers.length).toBeGreaterThan(0)` e il
    filtro `getClientRects()` (che prima lasciava passare i nodi a 0px del pannello chiuso);
    `SMALL_TARGETS` con l'esclusione rimossa e il test verde; `mobile-primitives:131` aggiunge scroll reale +
    hit-test (copertura in più); `mobile-registries:786` sostituisce `actionsPosition==='sticky'` con
    `primaryInFoot/primaryInBody` e **aggiunge** l'hit-test a fondo scroll.

---

## Decisioni da sottoporre al PO

1. **MAJOR-2 (trap vs popover portalati)**: (a) estendere il trap ai portali attivi, (b) rinunciare a
   `aria-modal` finché il buco esiste, (c) dichiararlo TD post-epic. La (c) contraddice la dottrina scritta
   dalla story stessa.
2. **MAJOR-3 (safe-area)**: oltre alla riga su `.so-foot`, decidere se con `viewport-fit=cover` acceso vanno
   introdotti anche `env(safe-area-inset-top/left/right)` (oggi zero occorrenze) o se il limite si DICHIARA
   con il numero.
3. **MINOR-1**: ratificare il piede dei tre editor anche sul DESKTOP (com'è oggi) oppure restringerlo a ≤640.
4. **LOW-4**: `ManualPprForm` prende la stessa medicina R3 del piede o resta dichiarato.

---

## Stato lasciato dall'ambiente

- **DB**: POST-SUITE (386 Person, 177 Aircraft, 72 PprRequest, 15 PENDING). **Il prossimo arbitro richiede un
  reset** (`docker compose down -v` → `up -d` → `migrate deploy` → `db seed`), altrimenti
  `datetime-picker.spec.ts:127` fallisce per il tetto `OPTIONS_PAGE_SIZE` (rosso ambientale noto).
- **Scritture mie da dichiarare**: un `PATCH /api/v1/aircraft/{id}` sull'aeromobile `I-AAA1786044909757-Q`
  con i **valori originali ripristinati prima del submit** (serviva a provare che `form="identity-form"`
  collega davvero il piede al form). Nessun altro dato di seed toccato, nessun AppSetting scritto da me
  (i project di catena ripristinano in `afterAll` e sono passati).
- **Porta 3000**: LIBERA (server di produzione avviato per le sonde e ucciso, verificato con `ss -ltnp`).
- **Nessun run e2e in corso**: `scripts/e2e.sh status` → `DONE — E2E_EXIT=1`, ma quello nel log CORRENTE è
  l'ultimo run mirato di verifica del quoting (`-g "nessun test con questo nome (test)"` → «No tests found»,
  exit 1 atteso). Il log dell'ARBITRO è il file copiato qui sotto, non `last-run.log`.
- Log dell'arbitro copiato in
  `/tmp/claude-1000/-home-admin-AirManager/756bf5df-6305-44ec-bd2f-d0e61f2d5e2e/scratchpad/arbiter1.log`
  (i log dei 9 project di catena in `chain-<project>.log` nella stessa cartella); script di sonda in
  `.../scratchpad/probe/` — throwaway, non committati.
