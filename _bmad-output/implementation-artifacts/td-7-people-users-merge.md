---
baseline_commit: 1350dd6
---

# TD-7: Fusione Piloti + Utenti — una sola pagina, un solo form (change request utente 2026-07-13)

Status: ready-for-dev

## Story

As a gestore dell'aviosuperficie,
I want gestire anagrafica, profili E accesso all'app di una persona da UNA sola pagina con UN solo form,
so that non esistano più due "profili" separati (Piloti e Utenti) per la stessa persona (change request utente 2026-07-13; ratifiche in questa sessione: form unico con i campi attuali; accesso con toggle nel form; **un solo campo email** — l'anagrafica è anche il login).

## Acceptance Criteria

1. **Via la pagina Utenti** — **Given** la dashboard, **Then** la voce "Utenti" SPARISCE dalla sidebar (`nav-items.ts`: entry `users` rimossa, `NavItemKey` aggiornato; chiave i18n `nav.users` rimossa da it/en) e la route `/dashboard/users` è ELIMINATA (directory `src/app/[locale]/dashboard/users/` cancellata — page.tsx + users-manager.tsx). Le API `/api/v1/users*` RESTANO INVARIATE nei loro contratti attuali salvo AC 4 (API-first: saranno consumate dall'app mobile); `hasPermission(actor,'users.manage')` resta la porta delle scritture account.
2. **Colonna Accesso nella lista Piloti** — **Given** `/dashboard/people`, **Then** la lista mostra per ogni persona lo stato accesso come StatusPill: "Attivo" (ok) / "Invitato" (warning — account senza password) / "Disattivato" (danger — `isActive: false`) / `noValue` "—" (nessun account). `listPersons` (people.service) include il `user` collegato nel select (`id`, `isActive`, `passwordHash` → esposto come `passwordSet`, `roles`) — NESSUNA migrazione (la relazione `Person.user` esiste già). `PersonRow` guadagna `access: { userId: string; isActive: boolean; passwordSet: boolean; roles: RoleKey[]; locale: string } | null`.
3. **Form unico (create E edit)** — **Given** "Nuovo pilota" o l'azione riga "Modifica", **Then** si apre LO STESSO form (un solo componente, dialog — il create dialog 12.3 si estende e assorbe l'edit inline) con tre sezioni:
   - **(a) Anagrafica** — i campi attuali invariati: nome, cognome, email, telefono, indirizzo, codice fiscale.
   - **(b) Profili** — pilota / allievo / istruttore attivabili ciascuno con uno Switch, con i campi condizionali ATTUALI quando attivo (pilota: n. licenza + tipo; allievo: data inizio corso con `DatePicker`; istruttore: ratings). Sostituisce SIA il role-select singolo del create dialog (12.3 AC 4) SIA l'azione riga "Profili"/pannello `ProfilesPanel` inline della lista (rimossi da `people-manager.tsx`). La scheda persona `[id]` NON cambia (il suo `ProfilesPanel` embedded resta — fuori scope).
   - **(c) Accesso all'app** — Switch "Può accedere all'app"; acceso → compaiono i 5 Switch ruolo ATTUALI (ADMIN/STAFF/INSTRUCTOR/PILOT/STUDENT — ruoli MANUALI, ratifica: nessuna derivazione dai profili) e la select lingua (it/en). **L'email è quella anagrafica** (ratifica: campo unico, niente email di login separata): con accesso attivo l'email anagrafica diventa obbligatoria (validazione client con messaggio dedicato). In edit con account esistente: StatusPill di stato + azione "Reinvia invito" se `passwordSet: false`; toggle OFF = `isActive: false` (DISATTIVA, reversibile — MAI delete: `actorUserId` e FK varie referenziano lo User).
   - **Visibilità RBAC**: la sezione (c) esiste SOLO per chi ha `users.manage` (admin); uno staff (`people.manage` senza `users.manage`) vede il form con (a)+(b) e NESSUNA chiamata users viene emessa. La UI nasconde; le API restano il vero guardiano (AD-5).
4. **Un solo campo email → `updateUser` impara `email`** — **Given** il modello a email unica, **Then** `updateUserSchema`/`updateUser` accettano `email` opzionale (trim/lowercase/z.email come `createUserSchema`; unique check → `ConflictError` 409; OpenAPI e unit test aggiornati — modifica ADDITIVA, nessun campo esistente cambia). Il form, quando l'email anagrafica cambia e l'account esiste, la propaga nello stesso submit (AC 5).
5. **Orchestrazione a un solo submit** — **Given** il form unico, **Then** il submit orchestra le API esistenti client-side (pattern dichiarato 12.3 — niente endpoint aggregato nuovo):
   - create: `POST /api/v1/people` → per ogni profilo attivo `PUT /api/v1/people/{id}/profiles/{type}` → se accesso attivo `POST /api/v1/users` (`email` = anagrafica, `personId`, `roles`, `locale`).
   - edit: `PATCH /api/v1/people/{id}` → `PUT`/`DELETE profiles/{type}` per i profili cambiati (attivato/campi modificati → PUT; disattivato → DELETE/deactivate secondo l'API attuale) → accesso: `POST /users` (nuovo account) o `PATCH /users/{id}` (roles/locale/isActive/email cambiati).
   - **Partial failure dichiarato**: il form resta aperto, l'errore nomina la parte fallita (es. "Persona salvata, attivazione accesso fallita"), NESSUN rollback; retry del solo pezzo mancante possibile ripremendo submit (le PUT profili sono idempotenti; per l'account il form ricontrolla cosa esiste già).
6. **i18n** — le chiavi `UsersPage.*` ancora utili migrano sotto `PeoplePage.form.access.*` (+ colonna lista sotto `PeoplePage.table`); le altre (title/description/tabella utenti) SPARISCONO da it/en insieme a `nav.users`. Nessuna chiave orfana (grep finale dichiarato). **Terminologia allineata al titolo «Piloti»** (finding NIT della review audit 2026-07-13): `PeoplePage.newPerson` → «Nuovo pilota»/«New pilot», `feedback.created` e titoli form coerenti («Nuovo pilota»/«Modifica pilota»); il placeholder della command palette («Cerca comandi, persone o velivoli») e gli usi cross-dominio di "persona" (voli, prenotazioni) restano INVARIATI.
7. **e2e** — `user-management.spec.ts` riscritto sul form unico: (i) admin crea una persona con accesso attivo → invito in Mailpit → set password → login OK (il flusso AC 1 attuale, via `/dashboard/people`); (ii) invited-cannot-login e (iii) deactivated-rejected restano (toccano solo login — aggiornare il setup che oggi passa dalla UI utenti); (iv) forgot-password INVARIATO; (v) i test API 401/403 su `/api/v1/users` INVARIATI; (vi) NUOVO: uno staff non vede la sezione Accesso nel form. `people-management.spec.ts`/`person-profiles.spec.ts` aggiornati dove usano il role-select del create dialog o l'azione riga "Profili" (censimento in Dev Notes). Selettori: landmark-scoped/`exact: true` come da convenzione; il vecchio spec che naviga `/dashboard/users` non deve sopravvivere in nessun file.
8. **Given** la suite, **Then** `npm run gates` passa e gli e2e (lista chiusa sopra) sono verdi su DB fresco.
9. **Given** la verifica visiva (Playwright MCP, build di produzione), **Then** screenshot di: lista Piloti con colonna Accesso, form unico con le tre sezioni (accesso acceso, profili con campi condizionali visibili), sidebar SENZA "Utenti"; giudizio contro `DESIGN.md` (+ Addendum Palette v2 "Celeste").

## Contesto e decisioni di design (vincolanti)

- **Ratifiche utente 2026-07-13**: (1) form unico in una sola pagina, "i form attuali mi piacciono ma sono divisi" → i CAMPI attuali si conservano, cambia solo dove vivono; (2) accesso con toggle NEL form unico, che contiene anche ruoli/rating/ecc.; (3) email: UN SOLO campo (anagrafica = login).
- **Modello dati INVARIATO**: `User.personId` nullable resta (nessuna migrazione); dal punto di vista UI un account senza persona non è più creabile (la pagina utenti sparisce) — gli utenti seed sono tutti collegati a una persona; account orfani legacy restano raggiungibili solo via API (dichiarato, nessuna UI).
- **Recon su HEAD `1350dd6`**:
  - Nav: `src/app/[locale]/dashboard/nav-items.ts:64` (entry `users`), tipo `NavItemKey:13`; sidebar rende da `NAV_ITEMS` con label `nav.<key>`.
  - Pagina utenti: `src/app/[locale]/dashboard/users/page.tsx` (gate `users.manage`:33, `hrefBuilder` paginazione:137) + `users-manager.tsx` (tabella, CreateUserForm/EditUserForm con RHF+zodResolver, `RoleCheckboxes` già a Switch, `PersonSelect`, resend-invite:106, toggle attivo:92).
  - People: `people-manager.tsx` (PersonRow:21, Panel 'edit'|'profiles':92, azioni riga:288-342), `person-create-dialog.tsx` (role-select `PersonRole`:16, `ProfileFields`:19 plain-state, orchestrazione POST people → PUT profiles con `profileError`/`completeProfile`), `profiles-panel.tsx` (sezioni Pilot/Student/Instructor con PUT/DELETE `profiles/{type}` — riusare la LOGICA per la sezione (b), il componente resta per la scheda `[id]`).
  - Services: `people.service.ts` (`PERSON_SELECT`, `listPersons` — aggiungere il join `user`), `users.service.ts` (`createUser`:125, `updateUser`:169 — SENZA email oggi, `resendInvite`:220, `listAvailablePersons`:242 — resta per l'API anche se la UI non la usa più).
  - Schemi: `src/lib/schemas/users.ts` (`updateUserSchema`:33 — aggiungere `email` opzionale con la stessa pipe di `createUserSchema`:17), `people.ts` invariato.
  - RBAC: `rbac.ts` — `users.manage` è ADMIN-only via `ALL_PERMISSIONS` (staff NON ce l'ha: FR-3); nessun cambio permessi.
  - Command palette: NESSUN riferimento a users (verificato) — il deep-link `?new=1` su people apre il form unico (già cablato via `initialCreateOpen`).
  - e2e: `user-management.spec.ts` (206 righe — flussi censiti in AC 7); "Utenti"/`dashboard/users` NON compare in altri spec (verificato); `people-management.spec.ts:56` (create via dialog), `person-profiles.spec.ts` (azione riga Profili → pannello: da ripuntare al form unico o alla scheda `[id]`).
  - i18n: blocchi `UsersPage` e chiave `nav.users` in `messages/{it,en}.json`.
- **Un componente form**: estendere `person-create-dialog.tsx` a `person-form-dialog.tsx` (o nome analogo) con `mode: 'create' | 'edit'`; l'edit inline `Panel 'edit'` di people-manager sparisce a favore del dialog (coerenza "un solo form"). I profili in edit si precaricano da `GET /api/v1/people/{id}` (già usato da ProfilesPanel).
- **Sequenza submit robusta**: le chiamate sono sequenziali e ognuna reporta il proprio errore; niente Promise.all cieco. La disattivazione profilo usa l'endpoint ESISTENTE del ProfilesPanel (censire il metodo esatto in implementazione — PUT con `deactivate` o DELETE — e riusarlo identico).
- **Fuori scope (dichiarato)**: scheda persona `[id]` e i suoi pannelli (Profili/Conto/Pacchetti/Scadenze/Tariffe istruttore — INVARIATI); derivazione automatica ruoli↔profili (ratifica: ruoli manuali); migrazioni/nuovi endpoint aggregati; account senza persona (solo API); 121-N1 (pendente altra decisione utente).

## Tasks / Subtasks

- [ ] **T1 (AC 2)** — `listPersons` + join `user` (select minimale, `passwordSet` derivato); `PersonRow.access`; colonna "Accesso" con StatusPill + `noValue`; i18n colonna.
- [ ] **T2 (AC 3, 5)** — Form unico `mode create|edit`: sezione profili (3 Switch + campi condizionali attuali, precarico da GET people/{id} in edit), sezione accesso (`users.manage` only: toggle + 5 Switch ruoli + lingua + stato/reinvia in edit), orchestrazione sequenziale con partial-failure; rimozione Panel 'edit' inline e azione riga "Profili"; email obbligatoria se accesso attivo.
- [ ] **T3 (AC 4)** — `updateUserSchema.email` + `users.service.updateUser` (unique check → 409) + OpenAPI + unit test (`users.service.test.ts`).
- [ ] **T4 (AC 1, 6)** — Rimozione nav entry + route `/dashboard/users` + `users-manager.tsx`; migrazione chiavi i18n (grep finale anti-orfani dichiarato).
- [ ] **T5 (AC 7, 8)** — Riscrittura `user-management.spec.ts` + aggiornamenti `people-management`/`person-profiles`; scenario staff-senza-sezione-accesso; `npm run gates`; run e2e mirati (user-management, people-management, person-profiles, rbac, app-shell) su DB fresco.
- [ ] **T6 (AC 9)** — Verifica visiva MCP (3 screenshot, mai committati) con giudizio DESIGN.md; Dev Agent Record + File List; sprint-status `td-7` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE `impeccable`, `design-taste-frontend`, `ui-ux-pro-max` (query utili: "progressive disclosure form sections", "toggle switch settings"); contratto `DESIGN.md` + Addendum Palette v2 "Celeste" (accent #1d4ed8; Ember SOLO destructive/error; semaforo stati invariato).
- Il rischio n.1 è l'orchestrazione edit (diff profili + account): tenere lo stato del form come snapshot iniziale vs corrente e derivare le chiamate dal DIFF, non da flag sparsi. Il rischio n.2 sono gli e2e di login (invite/password): il setup oggi passa dalla UI utenti — riscrivere il setup via form unico UNA volta e riusarlo (helper nel file spec).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`; MAI stash; MAI `git add -A` (add espliciti); niente screenshot committati; commit separati: story file → implementazione.
- Password seed: SOLO da env (`set -a && . ./.env && set +a`), mai stampata/digitata in chiaro.
- Baseline: `1350dd6` (full UI audit 3/3), 30 migrazioni, **221 e2e / 1278 unit** su DB fresco (2 failed noti e deferred: bookings:636 isolamento, command-palette:95 TD6-N1; 8 flaky da retry noti). NOTA: se la review Opus dell'audit UI farà atterrare fix prima del dispatch, la baseline effettiva sarà il commit di quei fix — verificare `git log` all'avvio.

### Project Structure Notes

- Nuovi/rinominati: `person-form-dialog.tsx` (evoluzione di `person-create-dialog.tsx`). Eliminati: `src/app/[locale]/dashboard/users/` (page + manager). Modifiche: `people-manager.tsx`, `people.service.ts` (+ test), `users.service.ts` (+ test), `src/lib/schemas/users.ts`, `nav-items.ts`, `messages/{it,en}.json`, `e2e/user-management.spec.ts`, `e2e/people-management.spec.ts`, `e2e/person-profiles.spec.ts`. NESSUNA migrazione, env var o dipendenza nuova.

### References

- [Source: change request utente 2026-07-13 («piloti e utenti … voglio una sola pagina ed un solo form») + 3 ratifiche AskUserQuestion (form unico coi campi attuali; toggle accesso nel form con ruoli/rating; email unica)]
- [Source: recon in sessione su HEAD 1350dd6 — censimenti nav/pagina utenti/people/services/schemi/e2e/i18n (righe nel Contesto)]
- [Source: story 12.3 (PersonCreateDialog, orchestrazione multi-call con partial failure), story 1.4 (invite flow), TD-6 (Switch, icone riga, Review Record)]

## Dev Agent Record

### Agent Model Used

_(dev subagent)_

### Debug Log References

### Completion Notes List

### File List

## Change Log
