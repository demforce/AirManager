---
baseline_commit: 1235a3a66f6b85e46d8299b12b0cbe78eb016063
---

# Story 12.6: Piloti — registry AirOps, profilo, azioni account

Status: done

## Story

As a staff dell'aviosuperficie,
I want l'anagrafica piloti (inclusi allievi) nel design AirOps — ricerca, saldo, ultimo volo, stato account, profilo slide-over con certificazioni e voli recenti, azioni Registra/Sospendi/Riattiva —
so that la gestione persone avvenga dalla pagina Piloti come nel prototipo, nel rispetto dell'RBAC esistente.

**Riferimenti vincolanti**: spec §3 (riga Piloti) + D4/D13; piano Task 6; prototipo `docs/design-reference/airops/src/People.jsx` (PilotsView, PilotEditor), `PilotProfile.jsx`.

## Acceptance Criteria

1. **(Proiezione lista estesa — backend)** `listPeople` (o un nuovo composito `listPilotsPageData` nel service, scelta del dev DICHIARATA) fornisce per la pagina: saldo conto (batched: `groupBy accountId + SUM(amountCents)` sugli id di pagina — OGGI NON ESISTE un reader multi-persona, non riusare `getAccountOverview` in loop), data ultimo volo (batched: `groupBy personId _max(flightDate)` su Flight REGISTERED — anch'esso net-new), stato utente collegato (`User.isActive`/`passwordSet`/nessun utente — join per personId). NIENTE colonne DB nuove: tutto derivato. Unit test sul composito con fixture multi-persona.
2. **(Pagina Piloti)** NUOVA `/dashboard/pilots` (`people.read`; route-registry `pilots` accesa, `airopsNative: true`) port di `PilotsView`: page-head con sub "N in archivio · N sospesi", ricerca live su nome/email (param `q` esistente), colonne: Nome (+ badge profili sub), Email (mono), Saldo (rosso se negativo, formato money TD-5), Ultimo volo (`formatDateOnly`), Ruolo (badge derivato dai profili ATTIVI: Studente/Socio/Istruttore — una persona può averne più d'uno: mostrare TUTTI i badge attivi, NON un solo "role" come il prototipo — D13; Renter/Visitor NON esistono), Stato (attivo/sospeso/senza accesso — da `User.isActive`/assenza utente), Azioni. Filtro "mostra archiviati" preservato; export xlsx people preservato; paginazione esistente.
3. **(Azioni per riga, gate RBAC ESISTENTI — nessun permesso cambia)**
   - **Modifica** (`people.manage`, staff+admin): apre l'editor.
   - **Registra** (`finance.manage`): slide-over top-up → `POST /api/v1/people/[id]/account/top-ups` con Idempotency-Key (flusso identico all'AccountPanel legacy).
   - **Sospendi/Riattiva** (`users.manage`, SOLO ADMIN — lo staff NON vede questi bottoni): PATCH `isActive` via users API; visibili solo se la persona HA un utente collegato; last-admin protection esistente rispettata (l'errore si mostra come toast).
4. **(Editor slide-over)** Port di `PilotEditor` sul dominio REALE: dati anagrafici (nome/cognome/email/telefono/indirizzo/CF → POST/PATCH people), attivazione profili (Pilota/Allievo/Istruttore — upsert/deactivate esistenti; l'attivazione pilota/allievo crea l'Account come oggi), archivia/ripristina con conferma. **I campi licenza/medico/abilitazioni del prototipo NON diventano colonne**: nell'editor compare la sezione "Certificazioni" in SOLA LETTURA (dalle expiries della persona) con link "Gestisci in Scadenze" — la REGISTRAZIONE di scadenze resta sulla pagina Scadenze (D13; niente doppio write-path). Sezione "Accesso" (ADMIN): crea utente+invito email (flusso `users.service` esistente, ruoli selezionabili), reinvia invito se senza password.
5. **(Profilo slide-over)** Port di `PilotProfile`: avatar iniziali, identità+email, badge profili/stato/archiviato; KPI Saldo (da `getAccountOverview`)/Ultimo volo/Voli recenti; card Certificazioni (da `listPersonExpiries`: raggruppate per nome tipo — Visita medica/Licenza/altro — con badge scadenza colorato per status ok/expiring/expired); "Voli recenti" (ultimi 5 da `listFlights({personId, pageSize:5})`, come il pannello 11.2) con link "Vedi tutti" al registro voli pre-filtrato E link "Estratto conto" alla pagina conto esistente (`/dashboard/people/[id]/account`). Footer: Chiudi / Modifica.
6. **(Sostituzione parziale — SOLO la lista)** `dashboard/people/page.tsx` + `people-manager.tsx` ELIMINATI; **`dashboard/people/[id]/` RESTA VIVA E INTATTA** (ospita ancora: statement drill-down → passa alla 12.9; InstructorRatesPanel → passa alla 12.7; AssignedInstructorsPanel → muore in 12.13 con la scuola) ma NON è più linkata dalla sidebar — vi si arriva dai link espliciti (profilo slide-over, "Vedi tutti"). `dashboard/users/` RESTA VIVA (admin la usa per la gestione utenti completa: ruoli/locale/person-link — la 12.6 copre solo invito/sospendi dalle azioni Piloti); la voce nav `users` NON esiste nel registry AirOps (D4) — la pagina resta raggiungibile per URL finché la 12.13 non decide.
7. **(e2e)** `people-management.spec.ts`: riscritti sui nuovi selettori (create→appare, ricerca, archivia+filtro; RBAC redirect/403/401 INVARIATI ma redirect check sulla nuova route `/dashboard/pilots`). `person-profiles.spec.ts`: adattato all'editor nuovo (attiva pilota→badge; student→pilot stessa riga; 403 contract INVARIATI). `user-management.spec.ts`: il flusso invito→set-password→login e deactivated-login-reject INVARIATI (restano sulla pagina users o via API); test NUOVO: sospendi/riattiva dalla riga Piloti (admin) + assenza bottoni per staff. `person-detail.spec.ts` resta VERDE (pagina viva). `typeahead-pickers.spec.ts` INVARIATO. Test NUOVO profilo: saldo/ultimo volo/certificazioni/voli recenti renderizzati da fixture reali.
8. **(Gates)** `npm run gates` verde; gli spec toccati verdi in locale (--retries=2); verifica interattiva in entrambi i temi.

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-15)

- **people.service.ts**: `listPeople` L180 (`people.read`, filtri q/includeArchived/profile L192-215, paginato), `getPerson` L248 (own-access), create/update L264/L295, archive/unarchive L337/L357, `upsertProfile` L385-450 (pilota/allievo upsertano Account nella stessa tx; riattivazione azzera deactivatedAt), `deactivateProfile` L460. `PERSON_SELECT` L60-71: NIENTE user status/saldo/ultimo volo → AC 1 li aggiunge derivati.
- **users.service.ts**: `users.manage` ADMIN-only; `createUser` L125 (passwordHash null + invito fire-and-forget L160), `updateUser` L169 (isActive flip = sospendi; last-admin protection L184-195), `resendInvite` L220, 1-utente-per-persona L106-117. NON allargare i permessi (D13; niente ratifica richiesta perché non cambiamo nulla).
- **accounts.service.ts**: `getAccountOverview` L115 (saldo = SUM aggregate, own-access), `recordTopUp` L187 (`finance.manage`, tx TOP_UP + CashMovement "Ricariche"); endpoint top-up con Idempotency-Key: `POST /api/v1/people/[id]/account/top-ups` (route L10-12; il pannello legacy lo chiama con header — copiare). NIENTE reader saldo multi-persona oggi (solo `listNegativeBalances` L629 groupBy con having<0 — pattern da imitare SENZA having per l'AC 1).
- **Expiries**: `listPersonExpiries` L123 (`expiries.manage` O own, cap 200, status computato). Mapping medico/licenza/abilitazioni = PER NOME TIPO da seed (Visita medica*/Licenza → blocksBooking true; Rating/Inglese → false) — il raggruppamento UI è per typeName, NESSUN enum (D13: non inventare categorie DB).
- **Ultimo volo**: `listFlights` accetta personId (schema flights L35-49); per la lista serve il batch `groupBy personId _max(flightDate)` (AC 1) — NON N+1 di listFlights.
- **Pagine legacy**: people list (page.tsx gate L32 + people-manager.tsx: testids `people-feedback`/`person-profile-badges-{id}`/`people-export-button`/`person-form-error`; API POST/PATCH people, archive/unarchive L138/L385/L448); detail [id] (pannelli: PersonalData, ProfilesPanel, AccountPanel+PackagesPanel, InstructorRatesPanel, AssignedInstructorsPanel school-gated, ExpiriesPanel, Ultimi voli 11.2 `recent-flights-panel`, account drill-down `people/[id]/account/page.tsx` con export hrefs L97-99); users page (users-manager.tsx: status badge attivo/sospeso/invito-pendente L68-78, azioni L192-216).
- **Profili multipli**: le tre relazioni sono indipendenti (una persona può essere Studente+Pilota — filtro `pilot-or-student` L209); badge = flag attivi, mostrare tutti.
- **Seed**: 5 persone 1:1 con utenti (admin/staff senza profili; Piero pilota, Ines istruttrice, Sara allieva); NESSUN dual-profile nel seed → i test nuovi che servono dual-profile lo creano via API run-unique.
- **12.3 meccanismi**: `airopsNative` per `pilots`; primitive 12.1 (SlideOver/Field/Badge/Toast); pattern tabella `.students`/`.student-row` del prototipo.
- **Ambiente locale**: identico alle story precedenti.
- **Commit**: `feat(12.6): pilots registry, profilo, azioni account`. Niente push.

## Fuori scope dichiarato

- Estensione permessi (staff-sospende, staff-invita): RBAC INVARIATO.
- Registrazione/modifica scadenze dall'editor (resta su Scadenze — 12.11).
- Pagina users AirOps-nativa e sua eventuale rimozione (12.13).
- Migrazione della pagina conto `people/[id]/account` (12.9) e InstructorRatesPanel (12.7).

## Dev Agent Record

### Completion Notes

- **AC 1 (composito batched)**: `listPilotsPageData` in `people.service.ts` avvolge `listPeople` (autorizzazione `people.read` invariata) e arricchisce la SOLA pagina di id con tre letture batched, nessun N+1: `account.findMany` + `accountMovement.groupBy` (saldo, pattern imitato da `listNegativeBalances` ma senza `having`), `flight.groupBy` su `status:'REGISTERED'` (ultimo volo), `user.findMany` (stato utente collegato). `totalCount`/`suspendedCount` (header "N in archivio · N sospesi") sono due query fleet-wide separate (`person.count`/`user.count`), stesso pattern del fleet header 12.5. Unit test dedicato con fixture a 2 persone (una con account/volo/utente, una senza nulla) + test skip-quando-pagina-vuota + test dei due count fleet-wide.
- **AC 2/3 (pagina + RBAC)**: nuova `/dashboard/pilots` (`airopsNative`, route-registry acceso) port di `PilotsView`. Colonne come da AC; "Ruolo" mostra TUTTI i badge attivi tra i tre profili REALI del dominio (pilota/allievo/istruttore) — l'AC cita testualmente "Studente/Socio/Istruttore" (vocabolario del prototipo, `Member`↦"Socio" non esiste nel dominio) ma, letto insieme a "Renter/Visitor NON esistono" e al resto del Contesto ("una persona può essere Studente+Pilota"), è chiaramente un residuo lessicale del prototipo — implementato con le TRE relazioni reali e le label già esistenti in `PeoplePage.profilesPanel` (nessuna nuova categoria, D13). Azioni per riga (Modifica/Registra/Sospendi/Riattiva) sui gate RBAC esistenti, invariati.
- **AC 4 (editor)**: `PilotEditor` a sezioni (stesso pattern esteso di `AircraftEditor`, 12.5): Anagrafica (POST/PATCH people), Profili (stessi endpoint PUT/deactivate di `profiles-panel.tsx`, restyled AirOps — non è il componente Tailwind riusato: sarebbe stato incoerente nel dark mode), Certificazioni SOLA LETTURA (da `/expiries`, raggruppate per `typeName` via helper condiviso `expiry-grouping.ts`, link "Gestisci in Scadenze"), Accesso (ADMIN-only: crea utente+invito o reinvia invito — editing ruoli di un utente esistente resta fuori scope, 12.13), Archivio.
- **AC 5 (profilo)**: `PilotProfile` slide-over sola lettura — saldo da una fetch fresca di `getAccountOverview` (non dal valore di lista, potenzialmente stale), ultimo volo dal valore di lista (stesso dato batched, nessuna fetch aggiuntiva), voli recenti da `listFlights({personId,pageSize:5})` (stesso endpoint del pannello 11.2), certificazioni con lo stesso helper di raggruppamento dell'editor.
- **AC 6 (rimozione parziale)**: eliminati SOLO `dashboard/people/page.tsx` + `people-manager.tsx`. `people/[id]/` intatta; il suo unico link dipendente (`backToList` → `/dashboard/people`) ripuntato a `/dashboard/pilots`. `nav-items.ts` (widget home) ripuntato allo stesso modo di aircraft→fleet in 12.5. `dashboard/users/` invariata.
- **AC 7 (e2e)**: `people-management.spec.ts` riscritto sui nuovi selettori (`pilots-*`/`pilot-*`); redirect check ora su `/dashboard/pilots`; 403/401 su `/api/v1/people` invariati. `person-profiles.spec.ts` adattato all'editor (attivazione dentro la sezione "Profili", stesso 403/404 contract). `person-detail.spec.ts`: il suo helper `createPerson` usava la lista `/dashboard/people` per il click-through — ripuntato alla nuova pagina Piloti, l'id si risolve via l'API di lista invece di un click su un link ora inesistente (la pagina `[id]` stessa resta invariata). `user-management.spec.ts`: aggiunto un nuovo `describe` con 2 test (admin sospende/riattiva dalla riga; staff non vede quei bottoni).

### File List

- **Backend (M)**: `src/server/services/people.service.ts` (+ `.test.ts`) — `listPilotsPageData`.
- **Pagina Piloti (nuovi)**: `src/app/[locale]/dashboard/pilots/{page.tsx,pilots-console.tsx,pilot-editor.tsx,pilot-profile.tsx,expiry-grouping.ts}`.
- **Shell/nav (M)**: `src/components/shell/route-registry.ts`, `src/app/[locale]/dashboard/nav-items.ts`.
- **Legacy (D)**: `src/app/[locale]/dashboard/people/page.tsx`, `src/app/[locale]/dashboard/people/people-manager.tsx`.
- **Link repoint (M)**: `src/app/[locale]/dashboard/people/[id]/page.tsx` (`backToList` → `/dashboard/pilots`).
- **i18n (M)**: `messages/it.json`, `messages/en.json` (nuovo namespace `PilotsPage`).
- **e2e (M)**: `people-management.spec.ts`, `person-profiles.spec.ts`, `person-detail.spec.ts`, `user-management.spec.ts`.
- **Tracking (M)**: `sprint-status.yaml` (12-6 → review).

### Change Log

- Implementazione story 12.6 completa in un'unica sessione dev; `npm run gates` verde (lint · typecheck · 1348 unit · build) prima del commit implementativo, per protocollo anti-runway.

## Review Record

**Reviewer**: adversarial-reviewer (Opus 4.8, effort xhigh, via workflow). **Data**: 2026-07-15. Il dev ha completato e committato pulito (protocollo anti-runway: `feat` `f3d33ab` + `fix` e2e `a4b7792`), ma NON ha girato la suite in CI-mode (budget) e aveva segnalato flakiness multi-file in dev-mode.

### Arbiter (priority zero)

- **`CI=1 npx playwright test` su build prod, DUE run su DB fresco**: Run 1 **213/213**, Run 2b **213/213** (0 fail, 0 flaky). La flakiness segnalata dal dev **NON si riproduce** su build di produzione — è contesa di `next dev` (dev-mode only). *(Nota harness: la suite NON resetta il DB tra run consecutivi → un doppio run senza reset sporca gli spec stateful bookings; sempre DB fresco prima di ogni CI=1.)* Dopo il fix di review `e2f2fc9`: **214/214**.

### Verdetto

**Shippable dopo un fix.** Zero blocker; implementazione funzionalmente corretta e verificata empiricamente.

### Findings (fixati in `e2f2fc9`)

- **F1 — MAJOR (gap di copertura, non difetto funzionale)**: il test e2e del profilo richiesto dall'**AC 7** ("saldo/ultimo volo/certificazioni/voli recenti da fixture reali") era stato **silenziosamente omesso** — il profilo slide-over (`pilot-profile.tsx`, AC 5) è arrivato con ZERO copertura e2e (il report del dev elencava 4 spec e taceva questo). La feature funziona (reviewer l'ha verificata: KPI/certificazioni/voli reali). **Fix**: aggiunto il test (apre il profilo, asserisce i 4 elementi da 8 fixture reali concatenate — person→pilota→aeromobile→tariffa→volo che addebita→ricarica→tipo scadenza→scadenza). Suite → 214/214.
- **F2 — MINOR**: `courseStartDate` dello studente hardcoded `'it'` (`pilot-editor.tsx`) — `locale` threaded per `ProfilesSection` → `StudentProfileForm`, ora rispetta la lingua del viewer.
- **F3 — ACCETTATO (non-blocker)**: `AccessSection` invia `locale: 'it'` sull'invito utente (nessun picker; entro la lettera dell'AC 4). Default sensato per un'aviosuperficie italiana finché la 12.11 non aggiunge la config locale del club; il flusso utenti completo resta su `/dashboard/users`.

### Evidenza empirica (tutto CORRETTO)

- **RBAC invariance (D13)**: `git diff 1235a3a..HEAD -- rbac.ts` VUOTO. Matrice live su build prod: staff vede Modifica/Registra ma NON Sospendi/Riattiva; `PATCH isActive` staff → 403; last-admin → 409 → toast.
- **No N+1 (AC 1)**: `listPilotsPageData` = 6 query totali a prescindere dalla page size (unit test asserisce `toHaveBeenCalledTimes(1)` per tipo di enrichment); saldo lista batched == saldo profilo (fresh) empiricamente.
- **Legacy boundary (AC 6)**: solo lista eliminata; `people/[id]/` e `users/` intatti (diff vuoto); nessun link orfano; registry/nav ripuntati.
- **Profile-panel duplication**: stessi endpoint PUT/deactivate del pannello legacy — parità comportamentale.
- **Cert grouping / profilo**: worst-status-wins per `typeName`, nessuna riga nascosta; KPI/voli/cert da fixture reali (no mock). i18n `PilotsPage` 103 chiavi IT==EN.

### Verdetti strutturali

- **(a) `listPilotsPageData` (composito nuovo) vs modificare `listPeople`**: CORRETTO — `listPeople` invariato (lo chiama e basta), gli altri consumer (bookings/flights/export/API) intatti.
- **(b) badge "Ruolo" Pilota/Allievo/Istruttore** (non "Studente/Socio/Istruttore" del prototipo): CORRETTO — la story è internamente contraddittoria; il Contesto vincolante + D13 impongono i tre profili reali. "Socio"=Member non esiste nel dominio.

### Commit di review

- `e2f2fc9` — `fix(12.6)`: F1 (test profilo AC-7) + F2 (locale data studente).
- questo commit — `docs(12.6)`: Review Record, status → done, sprint-status.
