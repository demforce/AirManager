---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/change-request-flight-log-2026-07-10.md
  - _bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/brainstorm-intent.md
  - _bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/DESIGN.md
---

# AirManager - Epic Breakdown

## Overview

Questo documento fornisce la scomposizione completa in epics e stories di AirManager, a partire dal PRD e dallo spine di architettura. I file story individuali con il contesto completo per il dev agent vengono creati just-in-time con `bmad-create-story` prima dello sviluppo di ciascuna story.

## Requirements Inventory

### Functional Requirements

- FR-1: Login e sessione (email+password, logout, 401 su API non autenticate)
- FR-2: RBAC — ruoli admin/staff/istruttore/pilota/allievo, permessi cumulativi
- FR-3: Gestione utenti (admin): creazione, disattivazione, ruoli, invito e reset via email
- FR-4: CRUD Persone (anagrafica unica, archiviazione non distruttiva)
- FR-5: Profili multipli Pilota/Allievo/Istruttore su una Persona
- FR-6: Scheda dettaglio persona (profili, scadenze, saldo, pacchetti, voli, prenotazioni)
- FR-7: CRUD Velivoli (marche univoche, tipo, contaore iniziale)
- FR-8: Stato operativo velivolo (operativo/fuori servizio, blocco prenotazioni)
- FR-9: Contaore progressivo aggiornato dai voli, rettifiche motivate
- FR-10: Tariffe velivolo storicizzate (validFrom, tariffa in vigore per data)
- FR-11: Tariffe istruttore storicizzate
- FR-12: Definizione pacchetti ore (ore, prezzo scontato, velivoli idonei, scadenza opzionale)
- FR-13: Vendita e consumo pacchetti (più vecchio prima, eccedenza a tariffa piena, solo velivolo)
- FR-14: Registrazione volo — solo staff/admin
- FR-15: Calcolo costo (centesimi, pro-rata minuti) e addebito automatico con scomposizione
- FR-16: Correzione/annullamento volo con storno tracciato (nessuna chiusura mese)
- FR-17: Registro voli con filtri; il pilota vede solo i propri
- FR-18: Creazione prenotazione (pilota per sé, istruttore con allievo, staff per tutti; no sovrapposizioni)
- FR-19: Vista calendario giorno/settimana per velivolo
- FR-20: Modifica/cancellazione prenotazione (prenotante fino all'inizio; staff sempre)
- FR-21: Blocco prenotazione per medica/licenza scadute (staff può forzare, tracciato)
- FR-22: Form PPR pubblico bilingue con anti-spam ed email di ricevuta
- FR-23: Coda PPR staff: approva (numero PPR + email) / rifiuta (motivo + email)
- FR-24: Chiusura PPR: completato (tassa atterraggio configurabile → cassa) / annullato; registro esportabile
- FR-25: Ricariche conto (contanti/bonifico/POS) con movimento cassa automatico
- FR-26: Estratto conto (titolare i propri; staff tutti; export PDF/Excel)
- FR-27: Saldo negativo consentito con evidenza e alert email (soglia configurabile)
- FR-28: Rettifiche motivate e tracciate
- FR-29: Movimenti di cassa manuali + automatici (ricariche, pacchetti, PPR)
- FR-30: Categorie di entrata/uscita gestite dall'admin
- FR-31: Report finanziario per periodo con totali per categoria, export PDF/Excel
- FR-32: Assegnazione allievi a istruttori
- FR-33: Annotazioni di avanzamento didattico (istruttore scrive, allievo legge)
- FR-34: Riepilogo ore allievo (dc/solo) e ore istruttore per periodo, esportabile
- FR-35: Tipi di scadenza standard precaricati + tipi custom (admin)
- FR-36: Registrazione scadenze per persona (staff; titolare propone, staff valida)
- FR-37: Alert email automatici a 60/30/7/0 giorni, one-shot per soglia
- FR-38: Dashboard scadenze con stato colore, filtri, export
- FR-39: Export Excel di tutte le viste elenco (rispetta i filtri)
- FR-40: Export PDF (estratto conto, report finanziario, registro voli, scadenze) con intestazione configurabile
- FR-41: Dashboard per ruolo (staff/pilota-allievo/istruttore)
- FR-42: API REST /api/v1 con Zod + spec OpenAPI pubblicata
- FR-43: Campi logbook sul volo — aeroporto di partenza/arrivo, orario di decollo/atterraggio, n. decolli/atterraggi; durata DERIVATA (atterraggio−decollo); obbligatori per i voli nuovi (change request 2026-07-10)
- FR-44: Registro voli in formato logbook con PIC derivato; export Excel/PDF aggiornati coi nuovi campi (change request 2026-07-10)
- FR-45: Date in formato italiano (DD/MM/YYYY) su tutte le superfici UI; accesso diretto ai voli di una persona dalla sua scheda (change request 2026-07-10)
- FR-46: Design system Refero "Ui" su tutta l'app: token `DESIGN.md` come fonte unica del tema (monocromo clinico, Geist, radius 18 interattivi / 24 card, densità compact), stack superfici a 3 toni (canvas `#f5f5f5` / sidebar `#fafafa` / card `#ffffff`), componenti base conformi — niente gradienti né ombre oltre `--shadow-subtle` (brainstorm 2026-07-12)
- FR-47: Regola Ember — `#e7000b` SOLO per azioni distruttive ed error-state veri (es. visita medica SCADUTA); mai decorativo. Gli stati semantici non-error mantengono un accento colore minimo (deroga al monocromo ratificata 2026-07-12)
- FR-48: App shell desktop-like: sidebar e topbar persistenti mai ricaricate, naviga solo il pannello contenuto con scroll indipendente; loading granulare per sezione con skeleton pulse piatto (niente shimmer) (brainstorm 2026-07-12)
- FR-49: Creazione entità in dialog modale e dettaglio/modifica in sheet laterale; bersagli prioritari: volo (keyboard-first, durata derivata live) e persona (progressive disclosure) (brainstorm 2026-07-12)
- FR-50: Registro voli ripensato: tabella in card paper, riga compatta tratta/velivolo/durata/costo/PIC (data solo nei contesti flat cross-giorno), raggruppamento per giorno Europe/Rome con header di giornata e load-more "carica giorni precedenti"; costo in riga gated per ruolo (brainstorm 2026-07-12)
- FR-51: Igiene dettagli su tutte le superfici: date picker custom DD/MM/YYYY, ellipsis deliberata + tooltip sui testi lunghi, row height fissa, tabelle mai nude sul canvas, export in menu overflow singolo (brainstorm 2026-07-12)
- FR-52: Command palette ⌘K: navigazione alle sezioni, azioni di creazione, ricerca cross-entity nel rispetto dei permessi per-oggetto (brainstorm 2026-07-12)

### NonFunctional Requirements

- NFR-1: UI, email e form PPR bilingui IT/EN (next-intl)
- NFR-2: API-first — nessuna funzionalità solo-UI (AD-1)
- NFR-3: GDPR — dati medici minimizzati (solo classe+scadenza), accesso per ruolo, HTTPS
- NFR-4: Movimenti finanziari immutabili, correzioni solo per storno (AD-3)
- NFR-5: Importi in centesimi Int, minuti Int, fuso Europe/Rome, valuta EUR (AD-2)
- NFR-6: Elenchi paginati, API p95 < 500ms con ~50k voli
- NFR-7: Backup DB documentato; email fallite ritentate e visibili
- NFR-8: WCAG 2.1 AA di base
- NFR-9: Test unitari sui calcoli, e2e sui flussi critici
- NFR-10: Sicurezza per-oggetto su ogni nuova superficie UI (sheet, ⌘K, modali, liste): pilota/allievo vede SOLO i propri voli/transazioni/prenotazioni e nessuna risorsa altrui è raggiungibile per ID diretto (anti-IDOR); autorizzazione sempre server-side per oggetto, mai solo filtro client (ratificata 2026-07-12)

### Additional Requirements (dall'architettura)

- Scaffold greenfield: create-next-app (Next.js 16.2, TS, Tailwind 4, App Router) + Prisma 7 + docker-compose (postgres 16 + mailpit) — impatta la Story 1.1
- Paradigma a strati: route sottili → services → Prisma; RBAC nel service layer (AD-5)
- Zod schemas in src/lib/schemas come fonte unica per validazione + OpenAPI (AD-1/AD-8)
- Ledger append-only con reversalOfId (AD-3); snapshot tariffe sul volo (AD-4)
- Consumo pacchetti deterministico con PackageConsumption (AD-6)
- Job idempotenti /api/v1/jobs/* + SentAlert (AD-9)
- Auth.js v5 beta Credentials + Argon2id + @auth/prisma-adapter, JWT (AD-10)
- Persona unica con profili 1-a-0/1 (AD-11)
- Email dietro MailSender (dev: Mailpit); PDF @react-pdf/renderer; Excel exceljs
- Errori DomainError → envelope {error:{code,message}} (AD-8)

### UX Design Requirements

Epics 1–11 (storico): nessun documento UX formale; vincoli UI per i dev agent: skill `minimalist-ui` per dashboard/tabelle/form interni; skill `design-taste-frontend` per il form PPR pubblico; shadcn/ui + TanStack Table; responsive mobile-first per le viste pilota/allievo.

Dall'Epic 12 (refactor UI, brainstorm 2026-07-12) il contratto di design vincolante è `_bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/DESIGN.md` (token Refero "Ui") + le decisioni ratificate nell'intent doc nella stessa cartella. Vincolo di processo (by user): ogni story UI si sviluppa con le skill `impeccable`, `design-taste-frontend` e `ui-ux-pro-max`. Il refactor è web desktop-first: niente cantiere mobile dedicato (il mobile sarà un'app Flutter nativa su API v1, v2).

### FR Coverage Map

| FR | Epic | Note |
| --- | --- | --- |
| FR-1, FR-2, FR-3, FR-42 | Epic 1 | Auth, RBAC, utenti, infrastruttura API/OpenAPI |
| FR-4, FR-5, FR-6, FR-7, FR-8, FR-9 | Epic 2 | Anagrafiche (aggiornamento automatico contaore in Epic 5) |
| FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-31 | Epic 3 | Conti + cassa (export PDF/Excel completati in Epic 10) |
| FR-10, FR-11, FR-12, FR-13 (definizione/vendita) | Epic 4 | Tariffe e pacchetti |
| FR-13 (consumo), FR-14, FR-15, FR-16, FR-17 | Epic 5 | Voli e addebiti |
| FR-35, FR-36, FR-37, FR-38 | Epic 6 | Scadenze e alert (export in Epic 10) |
| FR-18, FR-19, FR-20, FR-21 | Epic 7 | Prenotazioni (usa scadenze di Epic 6 per FR-21) |
| FR-22, FR-23, FR-24 | Epic 8 | PPR (tassa → cassa di Epic 3; export registro in Epic 10) |
| FR-32, FR-33, FR-34 | Epic 9 | Scuola volo (export riepiloghi in Epic 10) |
| FR-39, FR-40, FR-41 | Epic 10 | Export completi + dashboard per ruolo |
| FR-43, FR-44, FR-45 | Epic 11 | Registro voli logbook (change request post-MVP 2026-07-10) |
| FR-46, FR-47, FR-48, FR-49, FR-50, FR-51, FR-52 | Epic 12 | Refactor UI "infra-grade" (brainstorm post-MVP 2026-07-12); NFR-10 vincola ogni story con nuove superfici |

NFR trasversali: NFR-1/2/5/8 vincolano ogni story con UI/API; NFR-3 Epic 1/2/6; NFR-4 Epic 3/5; NFR-6 ogni lista; NFR-7 ogni story con email; NFR-9 nella Definition of Done di ogni story.

## Epic List

### Epic 1: Fondazione e accesso
Gli utenti invitati accedono con il proprio ruolo e vedono una dashboard localizzata IT/EN; l'admin gestisce gli utenti. Scaffold e infrastruttura API v1 + OpenAPI per tutti gli epic successivi.
**FRs covered:** FR-1, FR-2, FR-3, FR-42

### Epic 2: Anagrafiche persone e velivoli
Lo staff censisce persone (con profili pilota/allievo/istruttore) e flotta; schede di dettaglio complete.
**FRs covered:** FR-4, FR-5, FR-6, FR-7, FR-8, FR-9

### Epic 3: Finanze — conti prepagati e cassa
Lo staff registra ricariche, rettifiche e spese; ogni persona vede il proprio estratto conto; report di cassa per periodo.
**FRs covered:** FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-31

### Epic 4: Tariffe e pacchetti ore
L'admin definisce i prezzi orari storicizzati di velivoli e istruttori e i tipi di pacchetto; lo staff vende pacchetti che movimentano conto e cassa.
**FRs covered:** FR-10, FR-11, FR-12, FR-13 (definizione e vendita)

### Epic 5: Voli e addebiti automatici
Lo staff registra i voli; il sistema calcola i costi (tariffe storicizzate, pacchetti, istruttore) e addebita i conti; registro voli filtrabile.
**FRs covered:** FR-14, FR-15, FR-16, FR-17, FR-13 (consumo)

### Epic 6: Scadenze e alert
Visite mediche, licenze e rating tracciati con alert automatici e dashboard a colori.
**FRs covered:** FR-35, FR-36, FR-37, FR-38

### Epic 7: Prenotazioni velivoli
I piloti prenotano in autonomia dal calendario; blocchi per scadenze critiche e velivoli fuori servizio.
**FRs covered:** FR-18, FR-19, FR-20, FR-21

### Epic 8: PPR piloti esterni
Form pubblico bilingue, coda di approvazione staff, email di esito, tassa di atterraggio in cassa.
**FRs covered:** FR-22, FR-23, FR-24

### Epic 9: Scuola volo
Assegnazione allievi-istruttori, annotazioni di avanzamento, riepiloghi ore.
**FRs covered:** FR-32, FR-33, FR-34

### Epic 10: Export e dashboard
Export Excel/PDF su tutte le viste e i report; dashboard per ruolo complete.
**FRs covered:** FR-39, FR-40, FR-41

### Epic 11: Registro voli logbook (post-MVP, change request 2026-07-10)
Il volo registra aeroporti e orari reali con durata derivata; il registro diventa un logbook completo (PIC incluso), raggiungibile in un click dalla scheda persona; date italiane ovunque.
**FRs covered:** FR-43, FR-44, FR-45

### Epic 12: Refactor UI "infra-grade" (post-MVP, brainstorm 2026-07-12)
L'app passa da "sito web" a desktop-app nel browser: design system Refero "Ui" monocromo, app shell persistente, form a comparsa, registro voli da logbook e command palette — la credibilità di Linear/Vercel/Cal.com per piloti e staff.
**FRs covered:** FR-46, FR-47, FR-48, FR-49, FR-50, FR-51, FR-52 (+ NFR-10 trasversale)

**Dipendenze tra epics:** 1 → 2 → 3 → 4 → 5; 6 dopo 2; 7 dopo 6 e 2; 8 dopo 3; 9 dopo 5; 10 per ultimo; 12 dopo tutti (refactor su app completa). Ogni epic consegna valore completo senza richiedere epic futuri.

## Epic 1: Fondazione e accesso

Gli utenti invitati accedono in modo sicuro con il proprio ruolo e vedono una dashboard localizzata; l'admin gestisce gli utenti. Le fondamenta (scaffold, DB, API v1, OpenAPI, i18n) nascono qui e servono tutti gli epic successivi.

### Story 1.1: Scaffold del progetto e ambiente di sviluppo

As a sviluppatore del team,
I want un progetto Next.js 16 avviabile con database, i18n e strumenti di qualità configurati,
So that ogni story successiva parta da fondamenta funzionanti e verificabili.

**Acceptance Criteria:**

**Given** un checkout pulito del repository
**When** eseguo `docker compose up -d` e `npm run dev`
**Then** l'app si avvia su localhost con una pagina di benvenuto servita su `/it` e `/en` tramite next-intl (routing `[locale]`)
**And** PostgreSQL 16 e Mailpit girano via docker-compose e `prisma migrate dev` applica una migrazione iniziale vuota o minima

**Given** il progetto scaffoldato
**When** eseguo `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
**Then** tutti e quattro i comandi terminano con successo (Vitest configurato con almeno un test di fumo; Playwright configurato con un e2e di fumo)
**And** la struttura delle cartelle rispecchia il Structural Seed dello spine (src/app, src/server/services, src/server/db, src/server/adapters, src/lib/schemas, messages/)

### Story 1.2: Login con email e password

As a utente registrato,
I want autenticarmi con email e password e uscire con logout,
So that acceda solo io ai miei dati (FR-1).

**Acceptance Criteria:**

**Given** un utente attivo seedato (admin demo) con password nota
**When** invio credenziali corrette dalla pagina di login localizzata
**Then** ottengo una sessione JWT (Auth.js v5, password Argon2id) e vengo rediretto alla dashboard
**And** il logout invalida la sessione e riporta al login

**Given** credenziali errate o utente inesistente
**When** tento il login
**Then** vedo un errore generico che non rivela se l'email esiste

**Given** una route web protetta o un endpoint `/api/v1/*` protetto
**When** li richiedo senza sessione
**Then** la web reindirizza al login e l'API risponde 401 con envelope `{error:{code:"UNAUTHENTICATED",...}}`

### Story 1.3: Ruoli e permessi applicati nel service layer

As a gestore,
I want che ogni azione sia autorizzata in base ai ruoli dell'utente,
So that nessuno veda o modifichi dati fuori dal proprio perimetro (FR-2).

**Acceptance Criteria:**

**Given** la mappa permessi→ruoli centralizzata in `src/server/auth/rbac.ts`
**When** un service viene invocato da un attore privo del permesso richiesto
**Then** viene sollevato `ForbiddenError` mappato in HTTP 403, sia dalla UI sia dall'API

**Given** un utente con più ruoli (es. pilota+istruttore)
**When** accede
**Then** i suoi permessi sono l'unione dei ruoli e la navigazione mostra l'unione delle voci

**And** i test unitari coprono la matrice permessi per almeno: staff che legge tutti, pilota che legge solo sé stesso (403 sull'altrui)

### Story 1.4: Gestione utenti con invito e reset password

As a admin,
I want creare, disattivare e modificare utenti con inviti e reset via email,
So that controlli chi accede al sistema (FR-3).

**Acceptance Criteria:**

**Given** l'elenco utenti (solo admin)
**When** creo un utente scegliendo ruoli ed email
**Then** parte una email di invito (visibile in Mailpit, bilingue in base alla lingua scelta) con link a token monouso a scadenza per impostare la password

**Given** un utente disattivato
**When** tenta il login o usa una sessione esistente
**Then** il login è rifiutato e la sessione decade entro 15 minuti (verifica `isActive` nel callback JWT)

**Given** la pagina "password dimenticata"
**When** inserisco una email
**Then** ricevo (se l'account esiste) una email di reset con token monouso, senza che la UI riveli l'esistenza dell'account

### Story 1.5: Infrastruttura API v1 con OpenAPI

As a sviluppatore del futuro client Flutter,
I want API REST versionate, validate e documentate,
So that il mobile consumi le stesse funzionalità del web (FR-42).

**Acceptance Criteria:**

**Given** gli schemi Zod registrati nel registry OpenAPI
**When** richiedo `GET /api/v1/openapi.json`
**Then** ricevo la spec OpenAPI 3.x generata dal codice, che include gli endpoint auth/utenti esistenti

**Given** un input non valido su un endpoint `/api/v1/*`
**When** lo invio
**Then** ricevo 422 con envelope `{error:{code:"VALIDATION_ERROR",details}}` conforme ad AD-8

**And** un helper di paginazione standard `{items,total,page,pageSize}` è disponibile e testato; date in ISO 8601 UTC

## Epic 2: Anagrafiche persone e velivoli

Lo staff censisce persone e flotta: anagrafica unica con profili multipli, schede complete, velivoli con stato operativo e contaore.

### Story 2.1: CRUD persone con archiviazione

As a staff,
I want creare, modificare e archiviare le persone,
So that l'anagrafica sia unica e senza duplicati (FR-4).

**Acceptance Criteria:**

**Given** il permesso staff
**When** creo una Persona con nome, cognome, email, telefono, indirizzo, codice fiscale opzionale
**Then** la persona appare nell'elenco paginato e ricercabile (nome/cognome/email)

**Given** una persona con voli o movimenti
**When** la archivio
**Then** non è proposta nelle nuove operazioni ma resta consultabile con tutto lo storico; l'API di cancellazione fisica non esiste

**And** un pilota (non staff) che chiama `GET /api/v1/people` riceve 403

### Story 2.2: Profili pilota, allievo, istruttore

As a staff,
I want attivare più profili sulla stessa persona con i dati specifici,
So that una persona possa essere insieme pilota e istruttore, o passare da allievo a pilota senza perdere nulla (FR-5).

**Acceptance Criteria:**

**Given** una Persona esistente
**When** attivo il profilo Pilota (numero/tipo licenza) o Allievo (data inizio corso) o Istruttore (abilitazioni)
**Then** i dati del profilo sono salvati in tabelle profilo separate 1-a-0/1 (AD-11) e la scheda persona li mostra

**Given** un Allievo che consegue la licenza
**When** disattivo il profilo Allievo e attivo il profilo Pilota
**Then** la persona mantiene lo stesso id, lo storico e (quando esisterà) lo stesso conto

### Story 2.3: Scheda dettaglio persona

As a staff,
I want una scheda persona con tutto il quadro,
So that trovi profili, contatti e storico in un colpo d'occhio (FR-6).

**Acceptance Criteria:**

**Given** una persona con profili attivi
**When** apro la sua scheda
**Then** vedo sezioni per: dati anagrafici, profili, e segnaposto pronti per scadenze/saldo/pacchetti/voli/prenotazioni che si popoleranno negli epic successivi senza cambiare struttura

**And** un pilota autenticato vede la propria scheda in sola lettura; 403 su schede altrui

### Story 2.4: CRUD velivoli

As a staff,
I want gestire la flotta,
So that i velivoli siano pronti per tariffe, voli e prenotazioni (FR-7).

**Acceptance Criteria:**

**Given** il permesso staff
**When** creo un Velivolo con marche (es. I-ABCD), tipo, modello, contaore iniziale in minuti, note
**Then** le marche sono univoche (errore 409 su duplicato) e il velivolo appare nell'elenco

**And** archiviazione non distruttiva come per le persone

### Story 2.5: Stato operativo e rettifica contaore

As a staff,
I want mettere un velivolo fuori servizio e correggere il contaore,
So that la flotta rifletta la realtà operativa (FR-8, FR-9).

**Acceptance Criteria:**

**Given** un velivolo operativo
**When** lo marco `fuori servizio` con motivo
**Then** lo stato e il motivo sono visibili in elenco e scheda; il flag è pronto per bloccare le prenotazioni (Epic 7)

**Given** un contaore errato
**When** registro una rettifica con motivo obbligatorio
**Then** il contaore cambia e la rettifica resta tracciata (chi, quando, delta, motivo)

## Epic 3: Finanze — conti prepagati e cassa

Ogni pilota/allievo ha un conto prepagato: lo staff registra ricariche e rettifiche, il titolare vede l'estratto conto, la cassa dell'aviosuperficie traccia entrate e uscite con report per periodo.

### Story 3.1: Conto prepagato e ricariche

As a staff,
I want registrare ricariche sul conto di una persona,
So that il credito sia aggiornato e tracciato (FR-25).

**Acceptance Criteria:**

**Given** una Persona con profilo pilota o allievo
**When** viene attivato il profilo
**Then** la persona ha un Conto (uno solo per persona, AD-11) con saldo calcolato come SUM dei movimenti — mai un campo saldo scritto a mano (AD-3)

**Given** il permesso staff
**When** registro una ricarica (importo in centesimi, metodo contanti/bonifico/POS, data, note)
**Then** nasce un AccountMovement immutabile di tipo TOP_UP e un CashMovement automatico in entrata con categoria "Ricariche" (seed)

**And** i movimenti non hanno API di update/delete; il saldo della scheda persona si aggiorna

### Story 3.2: Estratto conto

As a pilota o allievo,
I want vedere il mio estratto conto,
So that sappia quanto credito ho e da cosa deriva (FR-26).

**Acceptance Criteria:**

**Given** un titolare autenticato
**When** apre "Il mio conto"
**Then** vede saldo corrente e movimenti paginati in ordine cronologico inverso con tipo, data, importo firmato e descrizione; 403 sui conti altrui

**Given** il permesso staff
**When** apre il conto di chiunque
**Then** vede lo stesso estratto più i dettagli operativi (chi ha registrato, note)

### Story 3.3: Rettifiche e alert saldo negativo

As a staff,
I want correggere errori con rettifiche motivate e vedere subito i saldi negativi,
So that la contabilità resti pulita e i debiti visibili (FR-27, FR-28).

**Acceptance Criteria:**

**Given** un movimento errato
**When** registro una rettifica (positiva o negativa) con motivo obbligatorio
**Then** nasce un movimento ADJUSTMENT collegato con autore e timestamp; il movimento originale resta intatto (AD-3)

**Given** un conto che scende sotto zero o sotto la soglia configurabile (default −200 €)
**When** il movimento che causa il passaggio viene registrato
**Then** il titolare riceve una email (Mailpit in dev) e il conto è evidenziato nella lista "saldi negativi" dello staff
**And** l'email non viene reinviata a ogni movimento successivo se il saldo resta nella stessa fascia

### Story 3.4: Cassa — categorie e movimenti manuali

As a staff,
I want registrare entrate e uscite di cassa categorizzate,
So that le finanze dell'aviosuperficie siano tracciate (FR-29, FR-30).

**Acceptance Criteria:**

**Given** l'admin
**When** gestisce le categorie (CRUD, con seed: Ricariche, Pacchetti, PPR, Carburante, Assicurazione, Manutenzione, Utenze, Altro)
**Then** le categorie in uso non sono eliminabili (solo disattivabili)

**Given** il permesso staff
**When** registro un movimento manuale (entrata o uscita, categoria, importo, data, descrizione)
**Then** appare nel registro cassa paginato e filtrabile per periodo/categoria/segno; niente update/delete, correzioni via storno (AD-3)

### Story 3.5: Report finanziario per periodo

As a gestore,
I want un report entrate/uscite per periodo,
So that veda come sta economicamente l'aviosuperficie (FR-31).

**Acceptance Criteria:**

**Given** movimenti di cassa in date diverse
**When** scelgo un periodo (mese/trimestre/anno/intervallo libero)
**Then** vedo totali per categoria, totale entrate, totale uscite e saldo del periodo, con dettaglio movimenti
**And** la somma dei movimenti mostrati coincide con il saldo del periodo (test automatico)

## Epic 4: Tariffe e pacchetti ore

L'admin definisce prezzi orari storicizzati e tipi di pacchetto; lo staff vende pacchetti che movimentano conto e cassa.

### Story 4.1: Tariffe velivolo storicizzate

As a admin,
I want cambiare il prezzo orario di un velivolo con decorrenza,
So that i voli usino sempre la tariffa giusta per la loro data (FR-10).

**Acceptance Criteria:**

**Given** un velivolo con tariffa 150 €/h da gennaio
**When** inserisco una nuova tariffa 160 €/h con validFrom oggi
**Then** la tariffa in vigore per una data D è quella con il massimo validFrom ≤ D (AD-4), lo storico resta consultabile e non esistono update sulle tariffe passate

**And** due tariffe con lo stesso validFrom per lo stesso velivolo → 409

### Story 4.2: Tariffe istruttore storicizzate

As a admin,
I want gestire il prezzo orario di ogni istruttore con decorrenza,
So that i voli scuola addebitino il costo istruttore corretto (FR-11).

**Acceptance Criteria:**

**Given** un istruttore attivo
**When** inserisco tariffe con validFrom diversi
**Then** valgono le stesse regole di storicizzazione e test della Story 4.1

### Story 4.3: Definizione tipi di pacchetto ore

As a admin,
I want definire pacchetti ore scontati,
So that i piloti possano comprare blocchi di ore a prezzo ridotto (FR-12).

**Acceptance Criteria:**

**Given** il permesso admin
**When** creo un PackageType con nome, minuti inclusi, prezzo in centesimi, insieme di velivoli idonei, validità opzionale in mesi
**Then** il tipo appare nel listino; i tipi con pacchetti venduti non sono eliminabili (solo disattivabili)

### Story 4.4: Vendita pacchetti e residui

As a staff,
I want vendere un pacchetto a una persona,
So that il pagamento e il residuo ore siano tracciati (FR-13 vendita).

**Acceptance Criteria:**

**Given** un PackageType attivo e una persona con conto
**When** registro la vendita (metodo di pagamento come per le ricariche)
**Then** nascono: un HourPackage con residuo = minuti inclusi e scadenza calcolata (se prevista), un AccountMovement PACKAGE_PURCHASE, un CashMovement in entrata categoria "Pacchetti"

**And** il titolare vede i propri pacchetti con residuo e scadenza nell'estratto conto; lo staff li vede nella scheda persona

## Epic 5: Voli e addebiti automatici

Lo staff registra i voli; il sistema calcola i costi con tariffe storicizzate e pacchetti, addebita i conti, aggiorna i contaore; le correzioni passano da storni tracciati.

### Story 5.1: Registrazione volo con calcolo costo e addebito

As a staff,
I want registrare un volo e vedere l'addebito generato automaticamente,
So that nessun volo resti non contabilizzato (FR-14, FR-15).

**Acceptance Criteria:**

**Given** un velivolo con tariffa in vigore e una persona con conto
**When** registro un volo (velivolo, pilota/allievo, istruttore opzionale, data, contaore iniziale/finale oppure minuti, tipo, note, atterraggi)
**Then** il costo velivolo è `round(rate_cents × minuti / 60)` alla tariffa in vigore alla data del volo; se c'è istruttore si aggiunge il suo addebito alla sua tariffa in vigore
**And** nascono AccountMovement FLIGHT_CHARGE con snapshot della scomposizione (minuti, tariffa, importi — AD-4) e il contaore del velivolo avanza dei minuti (FR-9)

**Given** contaore finale < iniziale, o velivolo/persona archiviati
**When** provo a registrare
**Then** 422 con codice errore specifico

**Given** un utente non staff
**When** chiama `POST /api/v1/flights`
**Then** 403 (FR-14: solo staff)

### Story 5.2: Consumo pacchetti nel calcolo del volo

As a pilota con un pacchetto ore,
I want che i miei voli scalino prima dal pacchetto,
So that lo sconto acquistato venga applicato da solo (FR-13 consumo).

**Acceptance Criteria:**

**Given** una persona con un pacchetto valido per il velivolo, residuo 60'
**When** lo staff registra un volo di 70' su quel velivolo
**Then** 60' vengono scalati dal pacchetto (PackageConsumption per-volo, AD-6), 10' addebitati a tariffa piena pro-rata, e la scomposizione è leggibile nel movimento

**Given** due pacchetti idonei non esauriti
**When** registro un volo
**Then** scala prima quello con acquisto più vecchio; i pacchetti scaduti o per altri velivoli non vengono toccati

**And** la tariffa istruttore non è mai coperta dal pacchetto; test unitari coprono: pacchetto esatto, eccedenza, multi-pacchetto, pacchetto scaduto, velivolo non idoneo

### Story 5.3: Correzione e annullamento volo con storno

As a staff,
I want correggere o annullare un volo sbagliato,
So that la contabilità si sistemi senza cancellare la storia (FR-16).

**Acceptance Criteria:**

**Given** un volo registrato con addebiti e consumo pacchetto
**When** lo annullo
**Then** nascono movimenti di storno collegati (`reversalOfId`, AD-3), i minuti tornano sul pacchetto, il contaore del velivolo viene ridotto, il volo resta visibile come ANNULLATO

**Given** un volo con dati errati (minuti, persona, istruttore)
**When** lo correggo
**Then** il sistema esegue storno + nuova registrazione in un'unica transazione e le due operazioni restano collegate

### Story 5.4: Registro voli con filtri e permessi

As a pilota,
I want vedere i miei voli (e lo staff tutti),
So that ognuno abbia il proprio storico (FR-17).

**Acceptance Criteria:**

**Given** voli di persone diverse
**When** un pilota apre il registro
**Then** vede solo i propri voli; lo staff vede tutto con filtri per periodo/velivolo/persona/tipo/stato; elenco paginato (NFR-6)

**And** l'istruttore vede anche i voli scuola in cui è istruttore

## Epic 6: Scadenze e alert

Visite mediche, licenze e rating con date di scadenza tracciate, alert automatici via email e dashboard a colori.

### Story 6.1: Tipi di scadenza standard e personalizzati

As a admin,
I want i tipi di scadenza standard pronti e la possibilità di crearne di miei,
So that il sistema si adatti alla mia realtà (FR-35).

**Acceptance Criteria:**

**Given** il seed del database
**When** guardo i tipi di scadenza
**Then** trovo precaricati: visita medica classe 1, classe 2, LAPL; licenza; rating SEP; inglese ICAO — ciascuno con ambito (piloti/allievi/istruttori/tutti)

**Given** il permesso admin
**When** creo un tipo personalizzato
**Then** è utilizzabile come i tipi standard; i tipi in uso non sono eliminabili (solo disattivabili)

### Story 6.2: Registrazione scadenze per persona

As a staff,
I want registrare e aggiornare le scadenze delle persone,
So that il quadro abilitazioni sia sempre corretto (FR-36).

**Acceptance Criteria:**

**Given** una persona e un tipo di scadenza compatibile con il suo ambito
**When** registro tipo, data rilascio, data scadenza, note
**Then** la scadenza appare nella scheda persona con stato calcolato (ok/in scadenza ≤60gg/scaduta)

**Given** un pilota autenticato
**When** aggiorna una propria scadenza (es. nuova visita medica)
**Then** la modifica nasce in stato "da validare" e diventa effettiva solo quando lo staff la conferma; lo staff vede la coda delle proposte

### Story 6.3: Alert automatici via email

As a pilota,
I want ricevere promemoria prima delle scadenze,
So that non voli mai con documenti scaduti (FR-37).

**Acceptance Criteria:**

**Given** scadenze a 60/30/7/0 giorni dalla data odierna
**When** il job `POST /api/v1/jobs/expiry-alerts` (bearer JOBS_SECRET, AD-9) viene invocato
**Then** ogni titolare riceve una email nella propria lingua per ogni soglia raggiunta, e lo staff un riepilogo unico

**Given** il job invocato due volte nello stesso giorno
**When** rigira
**Then** nessuna email duplicata: SentAlert ha vincolo unico (scadenza, soglia) — test automatico

### Story 6.4: Dashboard scadenze

As a gestore,
I want vedere tutte le scadenze ordinate per urgenza,
So that intervenga prima che diventino un problema (FR-38).

**Acceptance Criteria:**

**Given** scadenze in stati diversi
**When** apro la dashboard scadenze (staff)
**Then** vedo l'elenco ordinato per prossimità con badge colore (verde >60gg, giallo ≤60gg, rosso scaduto) e filtri per tipo/ambito/stato

**And** ogni pilota/allievo vede le proprie scadenze con gli stessi colori nella propria home

## Epic 7: Prenotazioni velivoli

I piloti prenotano in autonomia dal calendario; il sistema impedisce sovrapposizioni e blocca chi ha documenti critici scaduti.

### Story 7.1: Creazione prenotazione con regole

As a pilota,
I want prenotare un velivolo per un intervallo,
So that lo trovi disponibile quando arrivo in campo (FR-18).

**Acceptance Criteria:**

**Given** un velivolo operativo e un intervallo futuro libero
**When** un pilota prenota per sé
**Then** la prenotazione è creata; un istruttore può prenotare indicando un allievo; lo staff per chiunque; un allievo che tenta da solo riceve 403

**Given** un intervallo sovrapposto a una prenotazione esistente sullo stesso velivolo
**When** provo a prenotare
**Then** 409 con messaggio chiaro; il controllo è transazionale (niente doppie prenotazioni con richieste concorrenti — test)

**Given** un velivolo fuori servizio
**When** provo a prenotare
**Then** 422 con motivo

### Story 7.2: Vista calendario

As a pilota,
I want vedere il calendario dei velivoli,
So that scelga un buco libero (FR-19).

**Acceptance Criteria:**

**Given** prenotazioni esistenti
**When** apro il calendario in vista giorno o settimana
**Then** vedo le colonne per velivolo con i blocchi prenotati (nome prenotante visibile agli autenticati) e posso navigare tra le date; la vista è usabile da mobile

### Story 7.3: Modifica e cancellazione

As a pilota,
I want spostare o cancellare la mia prenotazione,
So that liberi il velivolo se i piani cambiano (FR-20).

**Acceptance Criteria:**

**Given** una mia prenotazione futura
**When** la modifico o cancello prima dell'orario di inizio
**Then** l'operazione riesce (con le stesse regole di conflitto); dopo l'inizio ricevo 422; lo staff può sempre modificare/cancellare qualunque prenotazione

**And** ogni modifica/cancellazione è tracciata (chi, quando)

### Story 7.4: Blocco prenotazione per scadenze critiche

As a gestore,
I want che chi ha medica o licenza scadute non possa prenotare,
So that nessuno voli irregolare (FR-21).

**Acceptance Criteria:**

**Given** un pilota con visita medica o licenza scaduta
**When** tenta di prenotare
**Then** 422 con messaggio che indica il documento scaduto; con rating scaduto (es. SEP) la prenotazione passa ma mostra un warning

**Given** il permesso staff
**When** forza una prenotazione bloccata
**Then** la forzatura riesce e resta tracciata (chi, quando, motivo)

## Epic 8: PPR piloti esterni

Un form pubblico bilingue raccoglie le richieste di atterraggio; lo staff approva o rifiuta con email di esito; la chiusura incassa la tassa di atterraggio.

### Story 8.1: Form PPR pubblico con email di ricevuta

As a pilota esterno,
I want chiedere il permesso di atterraggio online,
So that non debba telefonare e abbia una conferma scritta (FR-22).

**Acceptance Criteria:**

**Given** la pagina pubblica `/[locale]/ppr` (design curato — skill design-taste-frontend, IT/EN)
**When** invio il form (nome, email, telefono, marche, tipo aeromobile, provenienza, destinazione, ETA, ETD opzionale, persone a bordo, note)
**Then** la richiesta nasce in stato `in attesa`, vedo una pagina di conferma e ricevo una email di ricevuta nella lingua del form

**Given** il campo honeypot compilato o più di N invii dallo stesso IP in un'ora
**When** invio
**Then** la richiesta è respinta silenziosamente (honeypot) o con 429 (rate limit) — nessun CAPTCHA di terze parti

### Story 8.2: Coda di approvazione con email di esito

As a staff,
I want approvare o rifiutare le richieste PPR,
So that il traffico in arrivo sia sotto controllo (FR-23).

**Acceptance Criteria:**

**Given** richieste `in attesa`
**When** ne approvo una
**Then** il sistema assegna un numero PPR univoco progressivo (es. PPR-2026-0042), lo stato diventa `approvato` e il richiedente riceve email con numero, data/ora e istruzioni operative configurabili dall'admin

**Given** una richiesta da rifiutare
**When** la rifiuto con motivo obbligatorio
**Then** stato `rifiutato` ed email con il motivo; la coda PPR in attesa è in evidenza nella dashboard staff

### Story 8.3: Chiusura PPR e tassa di atterraggio

As a staff,
I want chiudere i PPR e incassare la tassa,
So that il registro e la cassa siano completi (FR-24).

**Acceptance Criteria:**

**Given** un PPR approvato
**When** lo marco `completato` confermando la tassa di atterraggio (default configurabile dall'admin, importo modificabile)
**Then** nasce un CashMovement in entrata categoria "PPR" collegato al PPR; con tassa zero nessun movimento

**Given** un PPR approvato mai arrivato
**When** lo marco `annullato`
**Then** nessun movimento di cassa; il registro PPR è filtrabile per stato/periodo

## Epic 9: Scuola volo

Assegnazione allievi-istruttori, diario di avanzamento didattico e riepiloghi ore per allievi e istruttori.

### Story 9.1: Assegnazione allievi a istruttori

As a staff,
I want assegnare gli allievi ai loro istruttori,
So that ognuno veda i propri (FR-32).

**Acceptance Criteria:**

**Given** allievi e istruttori attivi
**When** assegno uno o più istruttori a un allievo
**Then** l'istruttore vede l'elenco dei propri allievi con il quadro essenziale (ore totali, ultima annotazione, scadenze); 403 sugli allievi altrui

### Story 9.2: Annotazioni di avanzamento

As a istruttore,
I want annotare l'avanzamento dei miei allievi,
So that il percorso didattico sia documentato (FR-33).

**Acceptance Criteria:**

**Given** un mio allievo
**When** scrivo un'annotazione (data, volo collegato opzionale, esercizi, giudizio, prossimi passi)
**Then** l'annotazione appare nel diario dell'allievo in ordine cronologico; l'allievo la legge in sola lettura; solo l'autore o l'admin possono modificarla entro 7 giorni, poi diventa immutabile

### Story 9.3: Riepiloghi ore scuola

As a gestore,
I want i totali ore di allievi e istruttori,
So that monitori il percorso degli allievi e le ore da retribuire (FR-34).

**Acceptance Criteria:**

**Given** voli scuola registrati (Epic 5)
**When** apro il riepilogo di un allievo
**Then** vedo ore doppio comando e solista separate, totali e per periodo

**Given** un periodo scelto
**When** apro il riepilogo istruttori
**Then** vedo per ogni istruttore le ore di volo scuola erogate nel periodo, con drill-down sui voli

## Epic 10: Export e dashboard

Tutte le viste esportano in Excel, i report chiave in PDF intestato; le dashboard per ruolo completano l'esperienza.

### Story 10.1: Export Excel delle viste elenco

As a staff,
I want scaricare in Excel qualsiasi elenco filtrato,
So that possa rielaborare i dati fuori dal sistema (FR-39).

**Acceptance Criteria:**

**Given** una vista elenco con filtri attivi (persone, velivoli, voli, prenotazioni, PPR, movimenti conto, movimenti cassa, scadenze, riepiloghi scuola)
**When** clicco "Esporta Excel" (endpoint `?format=xlsx`)
**Then** scarico un `.xlsx` (exceljs) con le stesse righe filtrate, intestazioni localizzate, date in Europe/Rome e importi in euro con due decimali

**And** l'export rispetta i permessi (un pilota esporta solo i propri dati)

### Story 10.2: Export PDF dei report

As a gestore,
I want PDF impaginati dei report principali,
So that li archivi e li giri a soci e commercialista (FR-40).

**Acceptance Criteria:**

**Given** le impostazioni con nome/logo dell'aviosuperficie (admin)
**When** esporto estratto conto, report finanziario di periodo, registro voli o lista scadenze
**Then** ricevo un PDF (@react-pdf/renderer) con intestazione configurata, titolo, periodo, tabella dati e totali dove pertinenti, nella lingua dell'utente

### Story 10.3: Dashboard per ruolo complete

As a utente,
I want una home che mostri subito ciò che conta per il mio ruolo,
So that il sistema mi anticipi invece di farmi cercare (FR-41).

**Acceptance Criteria:**

**Given** un utente staff/admin
**When** apre la home
**Then** vede: PPR in attesa, saldi negativi, scadenze entro 60 giorni, prenotazioni di oggi/domani, velivoli fuori servizio — ogni widget linka alla vista completa

**Given** un pilota o allievo
**When** apre la home
**Then** vede: saldo e residuo pacchetti, prossime prenotazioni, proprie scadenze con colori, ultimi voli

**Given** un istruttore
**When** apre la home
**Then** vede: i propri allievi, i voli scuola recenti, le ore del mese

## Epic 11: Registro voli logbook (post-MVP, change request 2026-07-10)

Il volo registra aeroporti di partenza/arrivo e orari reali di decollo/atterraggio; la durata è derivata (atterraggio−decollo) e resta la base dell'addebito. Il registro voli diventa un logbook completo con PIC derivato, raggiungibile in un click dalla scheda persona; le date sono in formato italiano su tutte le superfici. Decisioni vincolanti in `change-request-flight-log-2026-07-10.md`.

### Story 11.1: Campi logbook e durata derivata

As a staff,
I want registrare per ogni volo aeroporti e orari reali di decollo e atterraggio,
So that il registro sia un logbook fedele e la durata non sia più un dato battuto a mano (FR-43).

**Acceptance Criteria:**

**Given** il form di registrazione volo
**When** lo apro
**Then** partenza e arrivo sono precompilati col nome dell'aviosuperficie (settings `airfield.name`, fallback stringa vuota) e decolli/atterraggi valgono 1

**Given** data del volo, orario di decollo e orario di atterraggio (HH:MM, Europe/Rome)
**When** compilo il form
**Then** la durata hh:mm è calcolata automaticamente come atterraggio−decollo (atterraggio ≤ decollo → giorno successivo) e l'addebito usa ESATTAMENTE quella durata (pro-rata e pacchetti invariati)

**Given** un volo nuovo
**When** lo registro via API o UI
**Then** aeroporti e orari sono OBBLIGATORI (422 se mancanti); sul wire gli orari sono `takeoffAt`/`landingAt` ISO 8601 UTC (AD-8); `flightDate` e `minutes` diventano DERIVATI lato server (giorno di decollo in Europe/Rome; differenza in minuti, minimo 1) e non sono più input

**Given** i voli registrati prima della migrazione
**When** la migrazione gira
**Then** restano validi senza aeroporti/orari (colonne nullable); `landings` NULL è backfillato a 1 e la colonna diventa NOT NULL; nasce `takeoffs` NOT NULL default 1

**Given** un volo annullato
**When** lo correggo (`correctFlight`)
**Then** il form/API di correzione richiede gli stessi campi logbook, prefillati dall'originale quando presenti

### Story 11.2: Registro logbook, PIC e voli dalla scheda persona

As a gestore o pilota,
I want vedere nel registro tutti i campi logbook col PIC e raggiungere i voli di una persona in un click,
So that consultare il logbook di chiunque sia immediato (FR-44, FR-45).

**Acceptance Criteria:**

**Given** il registro voli
**When** lo apro
**Then** le colonne includono: data (DD/MM/YYYY), partenza, arrivo, decollo e atterraggio (HH:MM Europe/Rome), durata hh:mm, decolli, atterraggi, PIC, istruttore (solo voli scuola); i voli storici senza dati logbook mostrano "—"

**Given** un volo
**When** ne derivo il PIC
**Then** vale: volo non scuola → la persona del volo; volo scuola solista → l'allievo; volo scuola doppio comando → l'istruttore (regola già codificata su `isSolo`, story 9.4 — MAI memorizzata)

**Given** la scheda di una persona (`people/[id]`)
**When** la apro con permesso di vedere i voli
**Then** un link/pannello "Voli" porta al registro pre-filtrato su quella persona; per il titolare senza `flights.manage` porta al proprio registro

### Story 11.3: Date italiane ovunque ed export logbook

As a utente,
I want date in formato italiano su ogni schermata ed export allineati al logbook,
So that il sistema parli la lingua del campo volo (FR-44, FR-45).

**Acceptance Criteria:**

**Given** ogni superficie UI che oggi mostra date-only ISO raw (registro voli, estratto conto, scadenze — audit completo nella story)
**When** la apro
**Then** le date sono DD/MM/YYYY via `formatDateOnly`/`formatDateTime` (nessun nuovo formatter)

**Given** l'export Excel e PDF del registro voli
**When** lo scarico
**Then** contiene le nuove colonne logbook (partenza, arrivo, decollo, atterraggio, decolli, atterraggi, PIC) con date DD/MM/YYYY e orari HH:MM Europe/Rome, intestazioni localizzate IT/EN

## Epic 12: Refactor UI "infra-grade" (post-MVP, brainstorm 2026-07-12)

L'app passa da "sito web" a desktop-app nel browser con lo stile Refero "Ui" (monocromo clinico shadcn-like): token e componenti dal contratto `DESIGN.md`, app shell persistente, form a comparsa, registro voli ripensato da logbook, igiene dei dettagli e command palette ⌘K. Contratto di design e decisioni vincolanti in `_bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/` (intent doc + DESIGN.md), integrati dalle ratifiche utente del 2026-07-12 in questa sessione:

- **Paginazione registro**: load-more per giorni (header di giornata, "carica giorni precedenti") — né pager né infinite scroll.
- **Regola Ember ratificata; vocabolario status acromatico NO**: `#e7000b` solo distruttivo/error-state veri, mai decorativo; gli stati semantici non-error MANTENGONO un accento colore minimo (es. semaforo scadenze) — niente conversione acromatica forzata.
- **Form a comparsa**: modale volo keyboard-first (autocomplete, parsing orari "1430", durata live), creazione persona con progressive disclosure, decolli/atterraggi fuori riga → sheet dettaglio.
- **Un solo epic** con 6 stories in ordine A→B→C→D→E→F (una PR).

Trasversali a ogni story: NFR-10 (sicurezza per-oggetto anti-IDOR su ogni nuova superficie, server-side); vincolo di processo skill `impeccable` + `design-taste-frontend` + `ui-ux-pro-max` per il dev; WON'T: dark mode, redesign per-pagina delle sezioni non citate (ricevono solo il nuovo sistema), mobile dedicato (futura app Flutter su API v1). COULD (solo se economico, mai a scapito del MUST): batch-entry "Invio e ripeti" nel modale volo; jump-to-date via ⌘K. Nessun cambiamento di API, permessi o logica di dominio: il refactor è UI-only salvo i nuovi endpoint richiesti da ⌘K e dal load-more.

### Story 12.1: Fondamenta del design system

As a pilota o membro dello staff,
I want un'interfaccia con un linguaggio visivo coerente e professionale in ogni schermata,
So that l'app trasmetta la credibilità di uno strumento infra-grade, non di un sito web (FR-46, FR-47).

**Acceptance Criteria:**

**Given** il tema dell'applicazione
**When** una qualunque pagina è renderizzata
**Then** i token di `DESIGN.md` sono la fonte unica del tema Tailwind: palette monocroma (canvas `#f5f5f5`, paper `#ffffff`, surface-alt `#fafafa`, ink `#0a0a0a`, mid-gray `#737373`, hairline `#e5e5e5`), font Geist (fallback Inter), radius 18px sugli elementi interattivi e 24px sui contenitori, densità compact — e nessuna superficie usa gradienti, colori brand extra o ombre oltre `--shadow-subtle`

**Given** i componenti base condivisi (button, card, badge, input, select, tabella)
**When** compaiono in una pagina esistente
**Then** sono conformi alle spec `DESIGN.md`: bottoni pill (filled `#0a0a0a`, ghost `#f5f5f5`, outline hairline), card `#ffffff` radius 24 con bordo hairline + shadow subtle, input fill `#f5f5f5` con ring hairline al focus, badge capsula solid/soft/outline

**Given** le superfici della pagina
**When** convivono sidebar, contenuto e card
**Then** lo stack a 3 toni (canvas → surface-alt → paper) crea la gerarchia senza bordi aggiuntivi

**Given** un'azione distruttiva o un error-state vero (es. visita medica SCADUTA, errore di validazione)
**When** è mostrato
**Then** usa Ember `#e7000b`; nessun uso decorativo di Ember sopravvive; gli stati semantici non-error (es. "in scadenza", stati PPR) mantengono il loro accento colore minimo attuale

**Given** le pagine esistenti e la suite e2e
**When** il tema e i componenti base cambiano
**Then** comportamento, route, API e testi restano invariati (refactor visivo puro) e `npm run gates` + e2e passano

### Story 12.2: App shell desktop-like

As a utente autenticato,
I want una shell di navigazione persistente che non si ricarica mai,
So that l'app risponda come un'applicazione desktop e non come un sito di pagine (FR-48).

**Acceptance Criteria:**

**Given** l'area autenticata
**When** navigo tra le sezioni
**Then** sidebar (`#fafafa`, full-height) e topbar NON vengono ricaricate: cambia solo il pannello contenuto (layout persistente App Router), con la voce di navigazione attiva evidenziata

**Given** contenuto più alto del viewport
**When** scorro
**Then** scrolla SOLO il pannello contenuto: sidebar e topbar restano fisse (scroll indipendente)

**Given** una sezione che carica dati
**When** la apro
**Then** il loading è granulare per-sezione/per-card: skeleton pulse piatto su `#f5f5f5` dentro card hairline (niente shimmer, niente blocco dell'intera pagina)

**Given** i landmark di accessibilità e i selettori scoped degli e2e esistenti
**When** la shell cambia
**Then** i landmark di navigazione restano stabili (gli e2e scoped al landmark continuano a passare) e la navigazione da tastiera resta completa

### Story 12.3: Form a comparsa — dialog di creazione e sheet di dettaglio

As a membro dello staff,
I want creare voli e persone in un modale e consultarne il dettaglio in uno sheet laterale senza lasciare la tabella,
So that l'inserimento dati sia rapido e il contesto non vada mai perso (FR-49).

**Acceptance Criteria:**

**Given** la pagina del registro voli
**When** clicco "Registra volo"
**Then** il form si apre in un dialog modale (card paper radius 24) keyboard-first: autocomplete pilota/velivolo, parsing orari rapido ("1430" → 14:30), durata derivata mostrata live come pill — e il form sempre visibile in testa alla pagina non esiste più

**Given** la pagina persone
**When** clicco "Nuova persona"
**Then** si apre un modale minimo con progressive disclosure (nome, ruolo, contatto) che crea subito; il resto dell'anagrafica (profili, visite, ratings) si completa nello sheet/scheda persona

**Given** una riga di una tabella (voli in primis)
**When** apro il dettaglio o la modifica
**Then** si apre uno sheet laterale sopra la tabella senza perderla; per il volo lo sheet mostra anche i campi logbook completi, inclusi decolli/atterraggi (che escono dalla riga)

**Given** un pilota/allievo autenticato
**When** tenta di aprire via sheet/dialog una risorsa non sua (anche per ID diretto)
**Then** l'autorizzazione per-oggetto server-side la nega (403/404) — NFR-10; nessun dato altrui transita nel client

**Given** dialog e sheet
**When** li uso da tastiera
**Then** focus trap, Esc per chiudere e ritorno del focus all'elemento di origine funzionano (WCAG 2.1 AA)

### Story 12.4: Registro voli ripensato — la story chiave di volta

As a gestore o pilota,
I want un registro voli che si legga come un logbook professionale,
So that la pagina più usata (e oggi più "sito web") diventi la prova che il refactor funziona (FR-50, FR-51 per le regole applicate qui).

**Acceptance Criteria:**

**Given** il registro voli
**When** lo apro
**Then** la tabella vive in una card paper con header/footer nested (mai nuda sul canvas), righe compatte ad altezza fissa con colonne: tratta (partenza→arrivo), velivolo, durata, costo, PIC; decolli/atterraggi e gli altri dettagli vivono nello sheet (da 12.3)

**Given** i voli di più giornate
**When** scorro il registro
**Then** sono raggruppati per giorno (bucket Europe/Rome esistente) con header di giornata (data DD/MM/YYYY scritta una sola volta) e un'azione "carica giorni precedenti" estende il registro — niente pager numerato, niente infinite scroll

**Given** un contesto flat cross-giorno (risultati di ricerca/filtri, voli sulla scheda persona)
**When** la stessa tabella è mostrata
**Then** la colonna data È presente in riga e il raggruppamento per giorno non si applica

**Given** il costo in riga
**When** l'utente è staff/admin
**Then** vede il costo di tutti i voli; un pilota/allievo lo vede SOLO sui propri (coerente coi permessi finanze esistenti, verificato server-side)

**Given** i filtri e gli export del registro
**When** uso la pagina
**Then** i filtri sono una toolbar compatta (non un form enorme sempre aperto in testa) e i bottoni export Excel/PDF sono raccolti in un unico menu overflow

**Given** testi lunghi (tratta, persona)
**When** superano lo spazio colonna
**Then** max-width + ellipsis deliberata + tooltip col valore completo — mai overflow o troncamento casuale

### Story 12.5: Igiene dei dettagli su tutte le superfici

As a utente,
I want che ogni sezione dell'app riceva le stesse regole di qualità dei dettagli,
So that nessuna schermata tradisca il nuovo sistema (FR-51).

**Acceptance Criteria:**

**Given** ogni input data dell'app
**When** inserisco una data
**Then** uso un date picker custom DD/MM/YYYY (stile DESIGN.md) — nessun input date nativo mm/dd/yyyy residuo

**Given** tutte le tabelle elenco (persone, velivoli, conti, cassa, scadenze, prenotazioni, PPR, scuola)
**When** le apro
**Then** vivono in card paper con row height fissa da spec compact, testi lunghi con ellipsis + tooltip, e la paginazione esistente è restylata e leggibile (il load-more per giorni resta esclusivo del registro voli)

**Given** ogni vista con doppio bottone export Excel/PDF
**When** la apro
**Then** gli export sono in un unico menu overflow (pattern di 12.4 esteso ovunque)

**Given** le sezioni non citate dai cantieri
**When** il pass di igiene le tocca
**Then** ricevono SOLO l'applicazione del sistema (token, card, picker, ellipsis, export) — nessun redesign per-pagina (WON'T ratificato)

### Story 12.6: Command palette ⌘K

As a utente autenticato,
I want una command palette per navigare, creare e cercare da tastiera,
So that l'app abbia la spina dorsale di navigazione di un vero strumento desktop (FR-52).

**Acceptance Criteria:**

**Given** l'area autenticata
**When** premo ⌘K/Ctrl+K o clicco il search trigger in topbar (stile DESIGN.md, scorciatoia visibile)
**Then** si apre la palette con navigazione a tutte le sezioni permesse al mio ruolo, bilingue IT/EN e utilizzabile solo da tastiera

**Given** la palette aperta
**When** scelgo un'azione di creazione (es. "Registra volo", "Nuova persona")
**Then** si apre il dialog corrispondente (da 12.3), nel rispetto dei permessi di ruolo

**Given** una query di ricerca
**When** cerco cross-entity (persone, velivoli, voli, prenotazioni, PPR)
**Then** i risultati sono filtrati per-oggetto server-side (NFR-10): un pilota/allievo trova SOLO le proprie risorse; nessun endpoint di ricerca espone dati altrui

**Given** un ruolo senza permesso su una sezione o azione
**When** apre la palette
**Then** le voci non permesse NON compaiono (e il server rifiuta comunque le chiamate dirette)
