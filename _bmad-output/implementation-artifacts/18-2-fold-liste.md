---
baseline_commit: 1f6ab3e
---

# Story 18.2: Il fold torna alle liste

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e`). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Ordine**: DOPO 16.6a, 16.6b, 17.3 (cambiano Contabilità e Registro voli) e 18.1 (altezza della topbar); la misura «prima» si fa su quel HEAD. 18.5 e 18.7 dopo. Split: v. §PO.

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

- [ ] Misura «prima» sul HEAD di partenza (dopo 16.6a/16.6b/17.3/18.1).
- [ ] Titolo `sr-only` (AC 1); conteggi per finestra (AC 2); sheet azioni (AC 3); Contabilità (AC 4); stati vuoti (AC 6).
- [ ] e2e fold e pillole, adeguamento dei pin, discriminanze, Dev Agent Record.

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

### Completion Notes List

### File List
