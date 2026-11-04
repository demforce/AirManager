---
baseline_commit: 1f6ab3e
---

# Story 18.4: I filtri di Pianificazione nella grammatica mobile

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e` con modelli statici). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Dipende da 17.2** (gruppo Velivolo = link `?aircraft=` sui velivoli del periodo + quello scelto, Q-17.2-c) **e 17.6** (ricerche «opzioni di prenotazione»: velivolo `self.read`, istruttore `bookings.read.names`; `SearchCombobox` con soglia 2, 20 risultati, riga «Altri risultati», label nascondibile). Va rimisurata e riletta su HEAD dopo che entrambe sono atterrate.

## Story

As an **utente da telefono che filtra la Pianificazione**,
I want uno sheet con ricerca,
so that l'ultimo popover desktop con centinaia di chip (ui M3) diventi un pannello con ricerca.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.4»; `ui-review.md` M3; `17-2-timeline-pianificazione-scala.md` e `17-6-typeahead-server-cap-dichiarati.md` §PO.

## Stato su HEAD

- Il filtro è il popover desktop anche a 375 (`bookings/schedule.tsx`): trigger `schedule-filter-toggle` `:455-464`; popover `position:fixed` largo `FILTER_POPOVER_WIDTH=320` (`:220`, `:471-497`); gruppo Velivolo = un `<button>` per velivolo (`:500-521`, `schedule-filter-aircraft-{id}`); gruppo Istruttore solo se `instructors.length>0` (`:524-547`); Reimposta/Fatto `:549-558`; stato client `useState('all')` `:274-275`; nessuna regola CSS ≤ 640 per il popover; targhette mobile `mobile-tail-chips` `:729-753` (un bottone per velivolo, sempre nel DOM).
- Elenchi: velivoli da `listBookableAircraft` (`bookings/page.tsx:143`, `bookings.service.ts:1691-1699`); istruttori da `listActiveInstructors` (`:1721`, solo con `bookings.read.names`, `page.tsx:158`; secondo chiamante la Panoramica `dashboard/page.tsx:302`, che incorpora lo stesso `Schedule`).
- Gli altri filtri mobile sono `SlideOver` a tutto schermo con bozza + «Applica»: Registro voli (`logbook-console.tsx:870-965`, trigger solo telefono `mobile-flight-filters-button` `:579-586`, CSS `airops.css:2766-2767`, `:2807`), Scadenze (`scadenze-console.tsx:719`), Contabilità (`billing-console.tsx:1304`).
- Baseline: «227 chip / 5 057 px» erano sul DB di lavoro (214 velivoli); su HEAD col DB di carico 1 460 velivoli + 374 istruttori + 2 «Tutti» = **1 836 bottoni** da 27,4 px. Dopo la 17.2 il gruppo Velivolo scende a ~208 nel giorno più pieno (fino a ~712 in settimana); dopo la 17.6 il gruppo Istruttori ha un tetto dichiarato. La story serve ancora.

## Acceptance Criteria

1. *Given* admin a 375×812 su Pianificazione *When* tocco «Filtri» *Then* si apre un pannello a tutto schermo (dialogo con trap) con campo di ricerca Velivolo, campo Istruttore, Reimposta e Applica; 0 `.segmented`; ogni controllo ≥ 44 px. Rosso su HEAD.
2. *Given* ≥ 21 velivoli che corrispondono alla stessa query (precondizione costruita dal test) *When* digito 1 carattere *Then* nessuna richiesta; *When* 2 *Then* una sola richiesta all'endpoint della 17.6, ≤ 20 opzioni e la riga «Altri risultati».
3. *Given* un velivolo run-unique senza prenotazioni nel giorno *When* lo cerco, lo scelgo e premo Applica *Then* l'URL ha `?aircraft=<id>` e conserva gli altri parametri; agenda e timeline mostrano solo quella riga (17.2 AC 4); riaprendo il pannello trovo le marche come etichetta. Applicazione: §PO Q-18.4-c.
4. *Given* pilota o allievo *Then* nessun campo Istruttore nel DOM e nessun elenco istruttori nel payload RSC (sostituisce la guardia `bookings.spec.ts:1998-1999`, che diventerebbe vacua).
5. Reimposta azzera entrambi i filtri; il trigger mostra il conteggio dei filtri attivi (ICU plural).
6. Con il popup della ricerca aperto il primo Escape chiude solo il popup, il pannello resta.
7. Desktop a 1280: §PO Q-18.4-a. Fila di targhette: §PO Q-18.4-b.
8. Non regressione: gli 8 testid desktop restano 1 nodo a 375/390/1280 (`mobile-planning.spec.ts:46-58`); nessuno sfondamento a 375/390; popover del calendario invariato (clamp 13.10); `scroll:false`; conservazione dei parametri negli href (17.2 AC 4); `mobile-booking-sheet` a un nodo; `grep listActiveInstructors` = 0 chiamanti in `bookings.service.ts` (rimuoverla se orfana, con la sua parte di unit `bookings.service.test.ts:2665-2690`; **non toccare** l'omonima in `instructor-compensation.service.ts:115`).
9. Misure a 375 e 1280, due temi, admin/istruttore/pilota: bottoni nella UI filtri prima/dopo; sweep dei bersagli esteso al pannello; KB del payload RSC di `/bookings` e `/dashboard` su `airmanager_load` (`render.mjs`; il roster istruttori pesa ~42 KB). `npm run gates` + e2e via `scripts/e2e.sh` verdi.

## Dev Notes

**Decisioni tecniche della sessione principale**: `SlideOver` a tutto schermo (precedente dei tre filtri; con la tastiera aperta un bottom sheet non ha spazio per i risultati); velivolo nell'URL (17.2), istruttore resta stato client (17.2 AC 4); trigger desktop `schedule-filter-toggle` resta 1 nodo a ogni larghezza, nascosto via CSS a ≤ 640 come nel Registro voli (mai `matchMedia`); i test che lo cliccano a 375 si spostano sul trigger mobile.

**Blast radius**: `schedule.tsx`; `bookings/page.tsx` e `dashboard/page.tsx` (niente roster, etichetta della selezione); `airops.css` (blocco pianificazione mobile `:2301-2432`); `messages/{it,en}.json` (`BookingsPage.schedule.*`); `bookings.service.ts`. **e2e che pinnano**: `mobile-planning.spec.ts:339`, `:367-428` (relazione «targhette = voci del popover + 1» `:382-386`, click su `schedule-filter-toggle` a 375 `:383`, `:397`), `:757`; `bookings.spec.ts:801-805`, `:808-858` (popover alto con 6 velivoli: la premessa sparisce), `:908-930` (clamp del popover filtri a 375), `:1998-1999`; lo spec della 17.2 (`schedule-rows.spec.ts`).

**Discriminanze** (rosse sul pre-fix; mutanti solo su copia isolata con sha256): 0 chip e tutto ≥ 44 nel pannello; velivolo fuori dalle righe del giorno trovato e applicato; pilota senza campo Istruttore; mutanti soglia 2→1, gate del campo Istruttore rimosso, Applica che non scrive `aircraft`.

**Trappole**: prefissi `^=` vivi `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-tail-chip-` → nessun testid nuovo può usarli (`schedule-filter-aircraft-search` è illegale anche con `-mobile`); nomi proposti: trigger `mobile-schedule-filters-button`, campi `schedule-aircraft-search` e `schedule-instructor-search` con i gemelli del pannello in `-mobile` (verifica `grep -rn 'data-testid\^=' e2e/`); mai Escape per chiudere il popup della ricerca nei test; il trap del `SlideOver` comprende i portali; `getByLabel('Velivolo')` compare in 41 punti limitati al form: tenere il label del pannello fuori dalla loro portata; i18n «…», `BANNED` («timeline», «aeromobil*», «AOG», «fermo», «reset»), contatore ICU plural; se la 18.4 precede la 18.1, il pannello si garantisce i 44 px da solo.

**Dimensione**: ~12-15 file, +600-900/−250-350 (≈ 0,3 della 19.7a). Nessuno split.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.4-a** = A: anche al computer il riquadro «Filtri» di Pianificazione e Panoramica diventa un campo di ricerca (stessa ricerca della 17.6).
- **Q-18.4-b** = A: la fila di targhette sopra l'agenda resta, con i soli velivoli del giorno, come scorciatoia a un tocco.
- **Q-18.4-c** = A: sul telefono il filtro si applica con «Applica» (bozza nel pannello), come nel Registro voli.


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
