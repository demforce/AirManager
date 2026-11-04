---
baseline_commit: 1f6ab3e
---

# Story 18.5: Righe, tab e lessico (riperimetrata il 2026-11-03: il lessico è passato alla 19.12b)

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e` con modelli statici calibrati sulle misure documentate). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Split** (v. §PO): **18.5a** (M4, M6, M13d, TD-19.12b-a, card Piloti) indipendente dall'Epic 17, può partire subito dopo l'Epic 16; **18.5b** (M11) DOPO la 18.4 (condivide `schedule.tsx`, la pagina e il filtro) e coordinata con la 18.2 (stessa testata di Pianificazione).

## Story

As an **utente da telefono**,
I want righe che mostrano il dato che distingue, tab che stanno su una riga e una Pianificazione pensata per chi prenota,
so that il nome non sia troncato mentre la marca occupa lo spazio (ui M4), la tab bar non vada a capo (M6), la seconda tab del pilota non sia la console admin (M11) e lo sheet prenotazione abbia un'azione primaria (M13d).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.5» (riperimetrazione 2026-11-03); `ui-review.md` M4, M6, M11, M13; review 19.12b I2 e L3 (TD-19.12b-a); 19.12b domanda PO 1 (card «Anagrafica piloti»).

## Stato su HEAD

- **M4**: righe di Pianificazione `bookings-table.tsx:833-857` (chip marche, poi nome); CSS `airops.css:2227-2234` `.mobile-row-tail{flex-shrink:0}`, `.mobile-row-name` (`:2235`) è l'unico che si accorcia; nessun limite di lunghezza sulle marche (`schemas/aircraft.ts:61`); la baseline «52/133 px» veniva da marche di fixture lunghe: difetto nel codice, mascherato dai dati → rimisurare con fixture dichiarata. Grammatica già giusta altrove: coda in attesa della Panoramica (`dashboard/page.tsx:464-470`, nome come titolo, «marche · data» sotto) e agenda (`schedule.tsx:323-339`). Stessa grammatica difettosa in «In corso ora» (`dashboard/page.tsx:450-452` via `mobile-booking-list.tsx:107`) e nelle card voli del Registro (`logbook-console.tsx:748`).
- **M6**: etichetta `shell.nav.*` (`mobile-nav.tsx:81`), font 9,5 px (`airops.css:1874`, MOB-2). Il lessico l'ha già risolto la 19.12b: in IT a 375 la barra del pilota sta su una riga. A 9,5 px vanno ancora a capo: EN «Account statement» a 320-414 (barra 77,8 contro 66,9); IT «I miei compensi» dell'istruttore a ≤ 360; IT «Estratto conto» solo a 320. Con font più grande e le parole attuali tornano a capo (10,5 px: «I miei compensi» a 360-390, «Estratto conto» a 360; 11 px: «Estratto conto» a 360-390) → **«più grande e su una riga» non si ottiene con le parole attuali**. Con etichette brevi («Conto», «Compensi», «Statement», «Payouts») una riga a 360-414 fino a 11 px; a 320 va a capo solo «Registro voli» (+ «My payouts» a 11 px).
- **M11**: pilota e allievo vedono la pagina dell'admin (`bookings/page.tsx:419-484`); sottotitolo unico (`it.json:1260`, «Calendario dei velivoli e prenotazioni da approvare.») che descrive il lavoro dello staff; righe fuori servizio in testa all'agenda; prenotazioni altrui come «Occupato»; CTA di prenotazione sotto l'agenda. Chip della flotta e popover li chiudono 17.2 e 18.4; resta il «cosa è mio» (audit: «L, story propria, con ratifiche»).
- **M13d**: sheet prenotazione (`bookings-table.tsx:518-631`): APPROVED staff = Modifica, Effettuato, Assente, Annulla tutti secondari; PENDING ha già «Approva» primario; «Effettuato» prima dell'inizio risponde 422 `BOOKING_NOT_STARTED` (`bookings.service.ts:1561`, 16.3) ma il bottone c'è comunque (anche desktop `:768`); il focus di ritorno `sheetPrimaryRef` (`:230`, `:267`) va al **primo bottone in DOM**, non al primario.
- **TD-19.12b-a — la diagnosi registrata è sbagliata**: la causa è della 19.12b, non preesistente. Le due `<span class="sr-only">` aggiunte nell'intestazione (`logbook-console.tsx:608-615`, 0 occorrenze su `66fd139^`) sono `position:absolute` (`airops.css:95-101`) senza antenato posizionato: il loro blocco contenitore è il documento, né `.logbook{overflow-x:auto}` (`:1052`) né `.card{overflow:hidden}` le ritagliano, e allargano lo scroll del documento. Sul modello: con le span torna esattamente la tabella L3 (99/175/131/263/390); senza, sfondamento 0 a ogni larghezza. **Fix verificato**: `.lb-row > *{position:relative}` → 0 da 641 a 1280 (il contenitore interno nasconde ancora 404 px a 1280, ma è D2 della 18.7). L'audit 11-02 confermava che prima non c'era.
- **Card «Anagrafica piloti»** (`it.json:281`, EN «Pilots directory») elenca tutte le persone.

## Acceptance Criteria

### 18.5a

1. **M4**: *Given* una prenotazione run-unique con marche da 20 caratteri e una persona con nome da 20 *When* la lista rende a 375 e 390 *Then* il nome non è troncato (`scrollWidth ≤ clientWidth` sul nome) e la riga contiene ancora le marche. Grammatica e perimetro: §PO Q-18.5-a. Rosso su HEAD.
2. **M6**: *Given* i 4 ruoli, IT ed EN, a 360/375/390/414 *Then* ogni etichetta della tab bar è su una riga, la barra ha la stessa altezza per tutti i ruoli, il font è ≥ quello deciso; il 320 dichiarato a parte. Etichette: §PO Q-18.5-b. Rosso su HEAD (EN pilota 77,8). Se l'etichetta visibile si accorcia, il nome accessibile contiene il testo visibile (WCAG 2.5.3: `aria-label` col nome intero; «Conto» è contenuto in «Estratto conto»). `BANNED` vieta «il mio conto» e «le mie transazioni» (`messages.test.ts:237-238`).
3. **M13d**: nello sheet c'è esattamente un `.btn.primary` secondo §PO Q-18.5-c; il focus di ritorno dal secondo passo va riallineato al primario. Rosso su HEAD (0 primari su APPROVED).
4. **TD-19.12b-a**: *Given* ≥ 1 volo su `/it/dashboard/logbook` a 641/768/900/1024/1100/1280 *Then* `documentElement.scrollWidth ≤ clientWidth`. Rosso su HEAD. Correggere la diagnosi nel record (non preesistente: 19.12b).
5. **Card Piloti**: §PO Q-18.5-d.

### 18.5b (M11) — AC da completare dopo la 18.4, sull'ossatura ratificata in §PO Q-18.5-e

6. A 375, per pilota e allievo, le proprie prossime prenotazioni stanno nella prima schermata; il sottotitolo è per ruolo; la CTA di prenotazione è nella prima schermata; per l'admin nulla cambia (invarianza misurata). Coordinare la testata con la 18.2.

Per entrambe: misure M4 a 375/390 due temi; M6 a 320-414 × IT/EN × 4 ruoli × due temi; M13d uno screenshot per stato; TD a 641-1280. `npm run gates` + e2e via `scripts/e2e.sh` verdi.

## Dev Notes

**Blast radius (18.5a)**: `bookings-table.tsx` (righe mobile e sheet); eventualmente `dashboard/page.tsx:450` e `logbook-console.tsx:748` secondo §PO; `mobile-nav.tsx` + `dashboard/layout.tsx` (`toMobileItem`) + `messages` (chiavi brevi solo per la barra, parità it/en); `airops.css` (`:1874`, `:1053`, commento «67/78» `:1803-1807`). **e2e che pinnano**: `mobile-ink-targets.spec.ts:139-172` (5 colonne, h ≥ 44); `mobile-shell.spec.ts:185-241` (geometria della barra); `my-account.spec.ts:143-145` (cerca il link «Estratto conto» nel landmark «Aree operative», che **a 375 è la tab bar**); `mobile-planning.spec.ts:246`, `:658`, `booking-requirements.spec.ts:576`, `mobile-overview-overflow.spec.ts:148` (filtrano per testo/badge: reggono se le marche restano nel testo della riga). I testid restano invariati.

**Mutanti** (solo su copia isolata con sha256): via `position:relative` → TD rosso; ritorno a `flex-shrink:0` senza tetto → M4 rosso.

**Dimensione**: 18.5a ~10-12 file, +350-500; 18.5b ~10-14 file, +600-900.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.5-a** = A: righe come la coda della Panoramica — nome in prima riga, «marche · data · ora» sotto — su Pianificazione e «In corso ora»; le card del Registro voli restano invariate.
- **Q-18.5-b** = A: etichette brevi solo nella barra («Conto», «Compensi»; EN «Statement», «Payouts»), nome intero nel menu e nel titolo, testo un po' più grande (font deciso dal dev con la misura, ≥ 10,5 px, su una riga a 360-414).
- **Q-18.5-c** = A: primario «Effettuato» se la prenotazione approvata è già iniziata, altrimenti «Modifica»; gli altri restano; PENDING → «Approva» invariato.
- **Q-18.5-d** = B: «Anagrafica piloti» → «Anagrafica» (EN «Directory»).
- **Q-18.5-e (18.5b)** = A: per pilota e allievo in cima «Le mie prossime prenotazioni» e «Prenota», poi il calendario con gli altri «Occupato».
- **Split** = sì: **18.5a** (AC 1-5) e **18.5b** (AC 6, dopo la 18.4, coordinata con la 18.2).


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
