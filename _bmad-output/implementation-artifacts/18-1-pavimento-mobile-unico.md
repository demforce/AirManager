---
baseline_commit: 1f6ab3e
---

# Story 18.1: Un pavimento mobile unico

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e`). **Dev: Opus 5 xhigh** (UI; skill `design-taste-frontend` + `ui-ux-pro-max`, design system AirOps). Review: Opus 5 xhigh adversarial. **Ordine**: DOPO la 16.8 (riscrive l'`ArchiveSection` del velivolo; il pavimento d'insieme chiude il TD 16.8-f senza riga ancorata). L'altezza della topbar entra nel fold della 18.2. Le righe di `airops.css` qui sotto sono di HEAD: dopo il commit della 16.5 (+9 righe dopo `:2674`) e delle story successive vanno rilette.

## Story

As an **utente da telefono**,
I want toccare qualunque controllo con il pollice,
so that il pavimento dei 44 px valga in ogni pannello form, nella topbar e nelle pagine di autenticazione (ui M2, M10, M14) invece che in eccezioni per pagina.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.1»; `ui-review.md` M2, M10, M14; R-15.10-e (celle del calendario esentate); R-19-m (Archivia resta azione).

## Stato su HEAD (da codice; i numeri «da rimisurare» vanno presi col browser)

- **Nessuna regola d'insieme su `.so-body`** (solo `airops.css:1128` base e `:2026-2027` padding). Già a 44: frecce data `.date-input input`/`.date-input-btn` su tutto il ≤640 (`:3695-3696`, 15.10 `215ef49`), `.combo-option` (`:3711`), ✕ 44×44 (`:3704`), `.so-foot .btn` e `.so-actions .btn` (`:2040`, `:2035`), `.toggle` a ogni larghezza (`:1238`, 19.5), submit/conferma/annulla del fuori servizio via testid (`:3745`, `:3754`).
- **Sotto 44 a 375**: `.input` 36,84 (select 36, ora 38,84) dentro `.so-body` salvo 3 pannelli ancorati; `.btn` di sezione 34,84 (`return-to-service-button` `aircraft-editor.tsx:887`, Archivio velivolo `:1066/:1069/:1077` = TD 16.8-f, Archivio pilota `pilot-editor.tsx:1371-1382`); `.btn.mini` 24,67 («Reinvia invito» `pilot-editor.tsx:1282`, «Paga» nelle righe del ciclo pagamenti); checkbox native 13×13 dentro `<label>` senza pavimento (`pilot-editor.tsx:707, :1131, :1148, :1307`); pillole documento `.expiry-chip` 27,94 (`:761`; css `:809`); `.segmented` della nuova prenotazione 27,39; topbar tema `.iconbtn` 32×32 (`:262`) e `.mobile-avatar-btn` 32×32 (`:1835`); `.date-nav .iconbtn` 26×26 (`:1360`).
- **Il baseline «123 eccezioni» non vale più** (erano le righe con «44px», commenti inclusi, a `b7b8d13`). Su HEAD: 108 righe, **67 dichiarazioni** (66 nel media ≤640 + `.toggle` globale); una regola su `.so-body` ne rende ridondanti **5** (`.scadenze-filter-panel .input` `:2945`, `.billing-filter-panel .input` `:3198`, `.transaction-form .input` `:3235`, regole 10 e 11 del fuori servizio `:3745`, `:3754`); le altre 62 stanno su testate, sheet, portali, liste e restano.
- **M10** aperto: `:3704` senza `flex-shrink:0`, il blocco titolo di `.so-head` (`:1110`) senza `min-width:0`.
- **M14**: le tre pagine di accesso hanno solo `style` inline, nessuna classe (`login/page.tsx:33-54`, `forgot-password/page.tsx:22-43`, `set-password/page.tsx:24-45`); submit `.btn.primary` 34,84 (`login-form.tsx:87`, `forgot-password-form.tsx:71`, `set-password-form.tsx:103`), input 36,84; il link da 12,5 px eredita `a{color:var(--info)}` (`:357`) = 3,61:1; lo switch di lingua `.ppr-top-right a` proposto dall'audit non esiste più (19.1); la faccia «token mancante» di `/set-password` (`:69-71`) non ha nessun link (vicolo cieco); `/set-password` è misurabile via invito Mailpit (`mobile-self-public.spec.ts:72`).
- **Lo sweep dei pannelli non c'è**: in `mobile-ink-targets.spec.ts` l'helper `SMALL_TARGETS`/`smallTargets` (`:81-119`) è definito e mai usato; precedente per misurare una checkbox sulla sua label: `mobile-settings.spec.ts:143`.
- **Pin desktop esistenti**: ✕ 32×32 a 1280 (`mobile-ink-targets:251`), opzioni del typeahead < 43,5 a 1280 (`:289`), fuori servizio 34,84 (`aog-impact-email.spec.ts:593`, `aircraft-out-of-service-until.spec.ts:271-272`), altezze dell'editor movimento a 1280 (`mobile-billing.spec.ts:1110-1127`).

## Acceptance Criteria

1. **Pannelli**: *Given* 375×812 (e 320), due temi *When* apro le SlideOver — i 5 editor (volo, velivolo, pilota, istruttore, nuova prenotazione) in Nuovo e in Modifica (il pilota con Accesso aperto e pillole, il velivolo con Fuori servizio e Archivio armati), i 3 pannelli Filtri, Nuovo movimento, Paga, Ciclo pagamenti, Aggiungi istruttore, le due schede, Modifica prenotazione — e passo `smallTargets` su `.slideover.open` con min(l,a) < 43,5 (checkbox misurata sulla sua `<label>`; uniche esenzioni le 42 celle e l'input ora di `.cal-popover`, R-15.10-e) *Then* la lista è vuota. Pillole documento: §PO Q-18.1-b.
2. **✕**: con una persona run-unique il cui nome manda il titolo su 2 righe (misurate), ✕ ≥ 43,5×43,5 e `.so-head` senza overflow orizzontale a 320 e 375.
3. **Topbar**: su ogni route del registry, per i 4 ruoli, tema e profilo ≥ 44×44; altezza della barra dichiarata e asserita (decisione tecnica: resta 53); tab bar invariata.
4. **Frecce del giorno**: ≥ 44×44 a ≤ 640; testata di Pianificazione senza overflow a 320, 375 e 390.
5. **Accesso**: `/login`, `/forgot-password` (form e conferma), `/set-password` (form, successo, token mancante) a 375, due temi: input, submit e link ≥ 43,5; testo dei link ≥ 4,5:1 a 375 e 1280, due temi. Lingua e uscita dal vicolo cieco: §PO Q-18.1-c/d.
6. **CSS**: le 5 dichiarazioni ridondanti sono rimosse e non nasce nessun pavimento nuovo ancorato a una pagina; ogni dichiarazione nuova di dimensione sta nel media ≤ 640, verificato via CSSOM (lo stesso walker di `mobile-ink-targets.spec.ts`, blocco safe-area). Altri comandi piccoli fuori dai pannelli: §PO Q-18.1-a.
7. **Desktop**: i 5 editor a 1280, 900 e 641: box (x, y, l, a) e `min-height`/`height`/`padding` calcolati di ogni controllo identici al centesimo prima/dopo (snapshot, diff = 0); pagine di accesso a 1280 identiche salvo colore e sottolineatura del link.
8. **Gate**: `npm run gates` e suite completa via `scripts/e2e.sh` verdi; ogni pin aggiornato elencato nel record.

## Tasks / Subtasks

- [ ] Misura «prima» (script throwaway in /tmp con playwright-core, o direttamente e2e): 375×812 e 320 per gli overflow, 1280/900/641 per l'invarianza; due temi via cookie `am-theme`.
- [ ] Regola su `.so-body` (controlli, checkbox via `label:has(> input[type=checkbox])` idioma `:3451`, `.btn`, `.btn.mini`, frecce data) + topbar + `date-nav` + ✕ (`flex-shrink:0`, `min-width:0` e `overflow-wrap:anywhere` sul blocco titolo); rimozione delle 5 ridondanti.
- [ ] Pagine di accesso: una classe sul `<main>`, link `--ink` + sottolineatura a ogni larghezza (precedente R-15.10-i, `.billing-negative-row a` `:3643`); §PO.
- [ ] Sweep e2e pannelli/topbar/accesso in `mobile-ink-targets.spec.ts` (aggiornare il pin `:644-646` se cambia il padding); snapshot desktop; discriminanze; Dev Agent Record.

## Dev Notes

**Decisioni tecniche della sessione principale**: topbar con bottoni 44×44 e padding verticale da 10 a 4 px → la barra resta alta **53** (alternativa 65 = −12 px di fold su ogni pagina, peggiora la 18.2); link di accesso `--ink` + sottolineatura; sweep su min(l,a), non solo sull'altezza (come invece `mobile-billing:196`); tablet 641-900 è desktop (R1): nessuna regola in quella banda.

**Blast radius**: `airops.css`; le 3 `page.tsx` di accesso; se §PO Q-18.1-c = A uno switch di lingua e 2-4 chiavi in `messages/{it,en}.json` (etichette «English»/«Italiano»); `e2e/mobile-ink-targets.spec.ts`. **Pin da ribaltare solo se §PO Q-18.1-a = A**: `mobile-reports.spec.ts:322-331` e `mobile-expiries-movements.spec.ts:700-706` (asseriscono che i `.segmented` di Pianificazione, Scadenze e Panoramica sono sotto 44 a 375: la guardia anti-fuga della 15.8b, ribaltata per decisione PO come fece la 15.10 con `mobile-settings:795`). Da preservare: i pin desktop sopra; R-15.10-e; le regole `.so-actions`/`.so-foot` e la regola 4; i testid desktop. Sovrapposizioni: la 16.5 aggiunge `.mobile-row-static > .btn` (lista, non pannello: resta); il bottone Filtri di Pianificazione è della 18.4.

**Discriminanze** (rosse sul pre-fix; mutanti solo su copia isolata con sha256): lo sweep pannelli rosso su HEAD (≥ 60 voci attese con il DB e2e); tolto `flex-shrink:0` → guardia del ✕ rossa; una dichiarazione spostata fuori dal media → guardia CSSOM e snapshot a 1280 rossi; contrasto 3,61 del link di accesso rosso prima del fix.

**Trappole**: la checkbox resta 13×13 → lo sweep la misura sulla label (altrimenti falso rosso); `.so-body .btn` prende anche `.btn.mini` nelle righe e gli `a.btn` (voluto), ma fa crescere prefisso e suffisso di `.input-group` e c'è il `textarea`: verificarli; link standalone nei pannelli (es. `aog-impact-bookings-link` `aircraft-editor.tsx:873`): decidere 44 o esenzione «inline» (WCAG 2.5.8) ed elencarli; pannelli più lunghi = più scroll, e `fixed-popover.ts:198` chiude il popover a ogni scroll (TD 15.10): misurare un calendario aperto sotto il fold sui due editor lunghi; nessun testid nuovo per il CSS; lo switch di lingua è una superficie unica → nome nuovo senza suffisso, dopo `grep -rn 'data-testid\^=' e2e/` (prefissi vivi: `ac-card-`, `pilot-row-`, `mobile-fleet-`, `mobile-fleet-card-`, `flight-row-mobile`, `mobile-tail-chip-`, `reports-*`); mai Escape per chiudere un popup; pagine di accesso misurate da anonimo, un solo login per test (TD-6); i18n senza varianti `BANNED`, parità it/en.

**Dimensione**: ~10-14 file, +500/−60 (CSS ~60 righe, 3-5 tsx, 0-4 chiavi, e2e ~300) ≈ 1/4 della 19.7a. Nessuno split.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 18.1; `ui-review.md` M2/M10/M14; `15-10-sweep-finale-mobile.md` (R-15.10-e/f/i); `16-8-archivio-velivolo-tutele-aog.md` §R (TD 16.8-f)

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.1-a** = A: oltre a pannelli, topbar, frecce del giorno e pagine di accesso, a 44 px anche gli altri comandi piccoli del telefono — bottone della data e «Giorno/Settimana» in Pianificazione, «Esporta» dove è ancora piccolo, «Precedente/Successiva», «Vedi tutti» nella scheda persona, «Ore/Ricavo» in Statistiche; esclusi i giorni del calendario (R-15.10-e) e il bottone Filtri di Pianificazione (18.4). Si ribaltano per decisione PO i pin `mobile-reports.spec.ts:322-331` e `mobile-expiries-movements.spec.ts:700-706`.
- **Q-18.1-b** = A: pillole documento dell'editor pilota a 44 (il pannello cresce di ~16 px per riga di pillole).
- **Q-18.1-c** = A: switch «English/Italiano» in alto nelle pagine di accesso, password dimenticata e imposta password.
- **Q-18.1-d** = A: «Torna all'accesso» sulla faccia «token mancante o scaduto» di `/set-password`.


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
