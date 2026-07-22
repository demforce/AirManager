---
baseline_commit: eab82c8
---

# Story 13.1: Piloti backend — separazione ratings/visite mediche + creazione persona one-step

Status: review

## Story

As a admin/staff dell'aviosuperficie,
I want che le abilitazioni (ratings) e le visite mediche siano due categorie distinte del catalogo scadenze, e che una persona possa essere creata in UN SOLO passaggio (anagrafica + profili + accesso/ruoli + ratings e visita medica con relative scadenze),
so that il flusso "Aggiungi pilota" non richieda più il doppio step creazione→modifica e i ratings non siano mai testo libero.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 1). Story SOLO backend + card Impostazioni: il form unico UI arriva con la 13.2 — l'editor pilota esistente e le e2e correnti devono restare verdi.

**Ratifiche PO (AskUserQuestion 2026-07-22)**:
- **R-13.1-a**: visite mediche = card SEPARATA in Impostazioni ("Visite mediche", stesso CRUD della card Abilitazioni), voci esistenti e scadenze già registrate MIGRATE automaticamente, nessuna perdita dati.
- **R-13.1-b**: le abilitazioni d'insegnamento dell'istruttore usano lo STESSO catalogo (ambito ISTRUTTORI) CON scadenze come i piloti; il campo free-text `InstructorProfile.ratings` sparisce.
- **R-13.1-c**: nel form/API di creazione one-step, la data di scadenza è OBBLIGATORIA per ogni rating/visita medica selezionati.

## Acceptance Criteria

1. **(Modello kind)** `ExpiryType` guadagna `kind ExpiryTypeKind @default(RATING)` con `enum ExpiryTypeKind { RATING MEDICAL }`. Migrazione hand-written (pattern TD-2, doc-comment in testa al SQL): ADD enum + colonna con default, poi `UPDATE` data-migration che marca `kind='MEDICAL'` le voci mediche esistenti (match sui nomi del seed "Visita medica…" — verificare i nomi ESATTI in `prisma/seed.ts` e usare un match robusto documentato nel SQL). Le righe `Expiry` collegate NON si toccano (referenziano gli stessi type id — R-13.1-a). `prisma/seed.ts` aggiornato: le voci mediche nascono `kind: 'MEDICAL'` sui DB freschi.
2. **(Catalogo filtrabile)** `expiry-types.service.ts` e `GET /api/v1/expiry-types` accettano un filtro `kind` opzionale; default = TUTTI (nessuna rottura dei consumer esistenti — inventariarli: pagina scadenze, editor, seed/fixtures e2e). Zod + registrazione OpenAPI aggiornate in `src/lib/schemas/` + `registry.ts`.
3. **(Card Impostazioni)** La card "Abilitazioni" (`settings/ratings-card.tsx`) mostra e crea SOLO `kind=RATING`; nuova card "Visite mediche" (stesso pattern UI, stesso servizio con `kind=MEDICAL`) accanto ad essa in `/dashboard/settings`. i18n IT/EN speculari nello stesso commit.
4. **(Instructor ratings dal catalogo)** `InstructorProfile.ratings` (free-text) viene RIMOSSO: migrazione drop-column (il testo libero esistente NON è migrato automaticamente — decisione R-13.1-b: il parsing dei nomi sarebbe inaffidabile; le abilitazioni si riassegnano dai chip. Dichiararlo nel doc-comment della migrazione). Le abilitazioni istruttore vivono come righe `Expiry` su tipi con ambito ISTRUTTORI (già supportato da `ExpiryScope`). Sweep dei consumer del campo free-text (editor/pagina istruttori, schemi, OpenAPI, seed, test) — inventario PRIMA della rimozione (lezione 12.12/12.13).
5. **(API creazione one-step)** `POST /api/v1/people` esteso con blocchi opzionali:
   - `profiles`: attivazione pilot/student/instructor coi campi già previsti dalle route `profiles/*` esistenti;
   - `expiries`: array `{ expiryTypeId, expiresAt }` con `expiresAt` OBBLIGATORIA per ogni voce (R-13.1-c), tipi validati (esistenti, attivi, ambito coerente coi profili attivati);
   - `access`: `{ email, roles }` — crea l'utente e invia l'invito (riuso del flusso `POST /api/v1/users`); richiede `users.manage`: attore senza permesso che passa `access` → 403 (il blocco NON è ignorato silenziosamente).
   Tutto in UNA transazione atomica (fallimento di qualunque blocco → nessuna persona creata); l'email di invito parte SOLO post-commit (pattern fire-and-forget esistente). Il comportamento del create SENZA blocchi nuovi resta identico a oggi (retro-compatibilità: l'editor esistente continua a funzionare). OpenAPI aggiornata.
6. **(Rename Certifications→Ratings)** Stringhe utente: EN "Certifications"→"Ratings", IT resta "Abilitazioni" dove già corretto; rename cheap degli identificatori direttamente toccati (es. `CertificationsSection`). NESSUN redesign dell'editor (13.2).
7. **(Test)** Unit: composite create (atomicità: fallimento user-create → rollback persona; expiresAt mancante → 422; tipo inesistente/inattivo → 422; access senza `users.manage` → 403; create semplice invariato), filtro `kind`, marcatura seed. e2e API-level in `e2e/api-v1.spec.ts`: one-step create completo (persona+profilo+expiry+utente, invito visibile in Mailpit); suite esistente resta verde.
8. **(Gates)** `npm run gates` verde; migrazioni applicate su DB fresco senza errori; e2e locali toccate verdi.

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-22)

- **Modelli**: `ExpiryType` `prisma/schema.prisma:1250-1278` (name/scope/isActive/blocksBooking/validityMonths), `Expiry` `:1314-1346` (`@@unique(personId, expiryTypeId)`, stato derivato via `computeExpiryStatus` — NON persistito), `InstructorProfile.ratings` `:125` (string free-text). Le visite mediche del seed sono ExpiryType normali (commento `schema.prisma:1238-1239`).
- **Catalogo**: card `src/app/[locale]/dashboard/settings/ratings-card.tsx` (pattern da replicare per la card medical), service `expiry-types.service.ts`, route `/api/v1/expiry-types`.
- **Creazione oggi**: `POST /api/v1/people` = solo anagrafica (`pilot-editor.tsx:202-313` mode `new`); profili via `PUT/POST /api/v1/people/{id}/profiles/{tipo}`; accesso via `POST /api/v1/users` `{email, roles, personId}` (`pilot-editor.tsx:897-901`), ADMIN-only (`canManageUsers`). Il composite deve DELEGARE alla logica esistente (estrazione di helper condivisi se le service function aprono transazioni proprie — pattern `getFlightTotals` 12.8: helper condivisi, mai duplicazione).
- **Migrazioni**: pattern hand-written con doc-comment; l'`UPDATE` data-migration nello stesso file della colonna è sicuro (nessun valore enum appena aggiunto viene usato in default — la trappola PG16 della 12.2 non si applica qui, ma VERIFICARE su DB fresco, non assumerlo).
- **RBAC INVARIATO**: nessun permesso nuovo; il composite riusa `people.manage`-equivalente esistente (verificare il permesso esatto sulla route people) + `users.manage` per il blocco access.
- **Ambiente locale**: macchina Fedora dell'utente — Postgres+Mailpit via `docker compose` del repo (Mailpit API `http://localhost:8025/api/v1/messages`); lockfile SOLO via `npx -y npm@10` (questa story non tocca dipendenze); MAI `playwright install`; porta 3000 libera prima delle e2e (`fuser -k 3000/tcp`); e2e SOLO in foreground; commit APPENA i gates passano (lezione runway 12.3/12.5). Utenti seed admin@/staff@/… (password in `SEED_ADMIN_PASSWORD` di `.env`).
- **Skill obbligatorie**: leggere e seguire `.claude/skills/karpathy-guidelines/SKILL.md` (assunzioni esplicite, semplicità, modifiche chirurgiche, criteri verificabili).
- **Commit**: `feat(13.1): ratings/medical split + one-step person create API`. Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>. Niente push.

## Fuori scope dichiarato

- Form unico UI e chips (13.2); editor scadenze inline (13.2); pagine people/{id} (13.3).
- Qualunque cambiamento alla logica `blocksBooking`/stati derivati delle scadenze (funziona identica per entrambi i kind).
- Migrazione automatica del testo libero instructor ratings (R-13.1-b: riassegnazione manuale).

## Dev Agent Record

**Stato**: implementazione completa, tutti gli AC soddisfatti, `npm run gates` verde, e2e locali toccate verdi (verificate serialmente `--workers=1` per il noto flake da cold-compile di `next dev` in parallelo, documentato in `playwright.config.ts`).

### Note di completamento per AC

- **AC 1 (kind)**: `ExpiryTypeKind` (`RATING`/`MEDICAL`) aggiunto a `ExpiryType` con default `RATING`. Due migrazioni hand-written separate (pattern TD-2): `20260722190000_add_expiry_type_kind` (CREATE TYPE + ADD COLUMN DEFAULT + UPDATE di backfill sulle 3 "Visita medica…" esatte del seed — nessuna trappola PG16: è un CREATE TYPE nuovo, non un ADD VALUE) e `20260722190100_drop_instructor_profile_ratings` (DROP COLUMN, separata per concern). Applicate su DB fresco via `prisma migrate deploy` senza errori (verificato con psql: 7 ExpiryType con kind corretto, InstructorProfile senza colonna ratings). `prisma/seed.ts` aggiornato (le 3 voci mediche nascono `kind: 'MEDICAL'`).
- **AC 2 (filtro kind)**: `listExpiryTypesQuerySchema`/`expiryTypeItemSchema`/`createExpiryTypeSchema` estesi con `kind` (query opzionale, default = tutti; create default `RATING`). `expiry-types.service.ts#listExpiryTypes` applica il filtro preservando `where: undefined` quando né `includeInactive` né `kind` sono passati (retro-compat con test esistenti). Inventario consumer: pagina scadenze/editor/seed/fixtures e2e — nessuno rotto (nessuno passava `kind`, tutti continuano a vedere l'intero catalogo).
- **AC 3 (card Impostazioni)**: `ratings-card.tsx` reso generico (props opzionali `kind`/`testIds`, default = comportamento/testid IDENTICI alla card "Abilitazioni" pre-13.1 — zero duplicazione di ~250 righe, un solo componente serve entrambe le card) invece di un file duplicato — deviazione dal "pattern da replicare" letterale del Dev Notes, motivata nella sezione Deviazioni sotto. `settings/page.tsx` fa UNA sola `listExpiryTypes` e splitta client-side per `kind` (nessuna query aggiuntiva). i18n IT/EN nuovo blocco `SettingsPage.medical.*` nello stesso commit.
- **AC 4 (instructor ratings dal catalogo)**: colonna droppata (migrazione sopra). Sweep completo dei consumer free-text: `people.service.ts` (`InstructorProfileInput`→`Record<string, never>`, `InstructorProfileDto` senza `ratings`, `upsertInstructorProfileCore` è ora pura activate/reactivate), `instructor-compensation.service.ts` (rimosso da `InstructorRow`/`InstructorCompensationSummaryItem` e dalle due read), `exports.service.ts` (colonna Excel rimossa), `instructors-console.tsx`/`instructor-editor.tsx`/`instructor-profile.tsx` (form/badge/sottotitolo ratings rimossi — NESSUNA nuova UI chip-based per le abilitazioni istruttore, deliberatamente fuori scope, vedi Deviazioni), `people/profiles-panel.tsx` + `pilots/pilot-editor.tsx` (le rispettive sotto-form istruttore perdono il campo, restano solo activate/deactivate — legacy people/{id} NON redisegnata, solo tenuta compilante), seed.ts/seed-demo.ts, tutti i test (unit + fixture) aggiornati. i18n: rimosse le chiavi diventate orfane (`InstructorsPage.editor.ratings.*`, `.addInstructor.ratings`, `.toast.ratingsSaved`, `.table.ratings`, `PeoplePage.profilesPanel.instructor.ratings`).
- **AC 5 (API one-step)**: `createPersonSchema` esteso con `profiles`/`expiries`/`access` opzionali (riusa `pilotProfileRequestSchema`/`studentProfileRequestSchema`/`instructorProfileRequestSchema` e un nuovo `roleSchema`-based `access`). `people.service.ts#createPerson` è la STESSA funzione (nessun endpoint nuovo), estesa: helper `*Core(tx, ...)` estratti da `createPerson`/`upsertProfile`/`createUser` (pattern `readOverview`/`registerFlightCore`) così ogni scrittura (persona, profili, expiry, utente) condivide LA STESSA `prisma.$transaction`; `users.manage` verificato PRIMA di ogni lettura/scrittura se `access` è presente (403 se assente, mai silenziosamente ignorato); validazione tipi scadenza (esistenza/attivo/ambito) PRIMA della transazione, 422 uniforme (non 404/409 come `registerExpiry` — scelta deliberata per un batch di request body); invito inviato SOLO dopo che la transazione si risolve. Create senza blocchi = comportamento identico a prima (verificato sia da unit test dedicato sia dal fatto che i 5 test `createPerson` pre-esistenti passano invariati).
- **AC 6 (rename)**: EN "Certifications"→"Ratings" in `pilot-editor.tsx`/`pilot-profile.tsx` (sezione scadenze READ-ONLY del pilota) + identificatori diretti (`CertificationsSection`→`RatingsSection`, `certGroups`→`ratingGroups`, chiave i18n `certifications`→`ratings`); IT invariato ("Certificazioni", come da ratifica — non è la stessa stringa già "Abilitazioni" della card Impostazioni, che infatti resta intatta). Nessun redesign dell'editor.
- **AC 7 (test)**: unit — `people.service.test.ts` (nuovo describe "createPerson — one-step composite": happy path pilot+student+instructor+expiry+access in una transazione, access senza `users.manage`→403, email già in uso→409, expiryType inesistente/inattivo/scope-mismatch→422, atomicità via fallimento dentro la transazione→l'invito non parte mai, create senza blocchi→zero query nuove); nuovo `src/lib/schemas/people.test.ts` (shape-level: expiresAt mancante, expiryTypeId duplicato, access senza ruoli/email invalida); `expiry-types.service.test.ts` (filtro kind, kind su create); fixture instructor sweep aggiornate ovunque. e2e — `e2e/api-v1.spec.ts`: nuovo describe "one-step composite create" (persona+profilo pilota+expiry+utente invitato, verificato in Mailpit; expiresAt mancante→422); `e2e/expiry-types.spec.ts` adattato allo split RATING/MEDICAL (le 3 "Visita medica…" ora nella card `medical-*`, non più `rating-*`).
- **AC 8 (gates)**: `npm run gates` verde (lint/typecheck/test 1438 passed/build). Migrazioni verificate su DB fresco (docker compose, migrate deploy + seed) senza errori. e2e toccate verdi con `--workers=1` (il fallimento con worker di default è il flake noto da cold-compile di `next dev` sotto concorrenza, documentato in `playwright.config.ts` — non una regressione: le stesse suite passano 100% in modalità seriale).

### Deviazioni dal file di story (da verificare in review)

1. **Card "Visite mediche" — componente condiviso, non file duplicato.** Il Dev Notes diceva "pattern da replicare" per la card medical; ho invece parametrizzato `RatingsCard` (props `kind`/`testIds` opzionali, default = comportamento pre-13.1 immutato) invece di duplicare ~250 righe in un secondo file. Zero rischio per `ratings-settings-card`/`rating-*` esistenti (default identico); la card medical usa `kind="MEDICAL"` + testid namespace `medical-*` nuovo. Motivazione: "helper condivisi, mai duplicazione" (karpathy guidelines + precedente esplicito del Dev Notes stesso per il composite create).
2. **`issuedAt` delle expiries nel create one-step = "oggi" (server clock UTC), non richiesto al chiamante.** Lo schema AC 5 elenca solo `{ expiryTypeId, expiresAt }` (mai `issuedAt`), ma `Expiry.issuedAt` è NOT NULL a DB. Ho usato `todayDateOnlyUtc()` come default per l'intero batch — la lettura più naturale per un flusso "quick create", ma è un'assunzione di dominio non esplicitamente ratificata: **da confermare in review/con l'utente**, non decisa unilateralmente come politica permanente.
3. **Nessuna UI di sostituzione per le abilitazioni istruttore (free-text rimosso).** R-13.1-b sposta le abilitazioni istruttore su `Expiry` scope INSTRUCTORS, ma costruire una visualizzazione/selezione chip-based per `instructors-console.tsx`/`instructor-editor.tsx` non è mai stato esplicitamente assegnato a nessuna story (13.2 copre solo le chips PILOTA). Ho rimosso il campo free-text ovunque (compila, nessun riferimento pendente) SENZA aggiungere una nuova UI di lettura/scrittura per le abilitazioni istruttore — il dato resta gestibile/visibile dalla pagina Scadenze generale. Segnalo il gap per eventuale story futura (13.2 o successiva) invece di espandere lo scope di questa.
4. **Legacy `people/{id}` (profiles-panel.tsx, pilot-editor.tsx) toccati solo per compilare.** Esplicitamente fuori scope per redesign (13.3), ma la rimozione del campo `ratings` a livello di schema/DB si propaga lì; ho fatto la modifica MINIMA (rimosso solo l'input, lasciato struttura/stile identici) senza alcun redesign.
5. **AC6 rename limitato a EN**: come da ratifica, l'IT del pilot-editor/profile resta "Certificazioni" (non "Abilitazioni") — sono stringhe distinte dalla card Impostazioni, la ratifica non chiedeva di unificarle.

### File List

Vedi il campo `filesChanged` del report strutturato del dev agent (elenco completo, ~45 file).

## Review Record

_(compilato dopo la review adversarial)_
