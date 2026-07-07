---
baseline_commit: 79cb9a7
---

# Story 4.3: Definizione tipi di pacchetto ore

Status: ready-for-dev

## Story

As a admin,
I want definire pacchetti ore scontati,
so that i piloti possano comprare blocchi di ore a prezzo ridotto (FR-12).

## Acceptance Criteria

1. **Given** il permesso admin, **When** creo un `PackageType` con nome, minuti inclusi, prezzo in centesimi, insieme di velivoli idonei, validità opzionale in mesi, **Then** il tipo appare nel listino.
2. **And** i tipi con pacchetti venduti non sono eliminabili (solo disattivabili). *(In questa story non esiste ancora `HourPackage` — arriva in 4.4: qui si implementa il DELETE con il backstop P2003→409 e la 4.4 aggiunge il pre-check esplicito con messaggio chiaro + test end-to-end del vincolo. Vedi Dev Notes.)*

## Contesto: catalogo/listino mutabile, NON ledger

`PackageType` è **configurazione di listino** (come `CashCategory` di 3.4), NON un ledger append-only: si crea, si modifica, si disattiva, e si elimina SOLO finché nessun pacchetto è stato venduto. Il motivo per cui la modifica è lecita: la vendita (4.4) farà **snapshot** di prezzo e minuti sul `HourPackage`/`AccountMovement` al momento della vendita (AD-4, stesso principio delle tariffe storicizzate) — cambiare il listino dopo non riscrive mai la storia. Il pattern di riferimento per service/UI è la **gestione categorie cassa di 3.4** (`cash.service.ts` + `/dashboard/finance/categories`), non i rate service di 4.1/4.2.

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/2)
  - [ ] Nuovo modello `PackageType` in `prisma/schema.prisma`: `id String @id @default(cuid())`; `name String @unique` (409 su duplicato); `includedMinutes Int` (AD-2: MINUTI interi, mai ore decimali — stessa regola di `Aircraft.hourMeterMinutes`); `priceCents Int` (AD-2: centesimi interi, > 0 al boundary Zod/service); `validityMonths Int?` (validità opzionale in mesi, > 0 quando presente, `null` = nessuna scadenza); `isActive Boolean @default(true)` (disattivazione = via dal picker vendita futuro, mai delete quando venduto — stesso ruolo di `CashCategory.isActive`); `createdAt`/`updatedAt`. Doc-comment sul modello: mutabile perché la vendita fa snapshot (vedi Contesto), delete consentito solo se mai venduto (FK RESTRICT da `HourPackage` in 4.4).
  - [ ] Insieme di velivoli idonei: **join table esplicita** `PackageTypeAircraft` (`id`, `packageTypeId` + FK, `aircraftId` + FK, `@@unique([packageTypeId, aircraftId])`, `@@index([aircraftId])`) — esplicita e non m-n implicita Prisma, coerente con lo stile del repo (tutti i modelli espliciti e documentati) e con le migrazioni a mano. Back-relations: `PackageType.eligibleAircraft PackageTypeAircraft[]`, `Aircraft.packageTypes PackageTypeAircraft[]`. Un velivolo **archiviato dopo** l'associazione resta nell'insieme (storico consultabile); il blocco d'uso reale è del consumo (epic 5), non del listino.
  - [ ] Migrazione a mano (Prisma 7: `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script`, **rimuovere la riga banner `Loaded Prisma config...`** dallo stdout) in `prisma/migrations/<YYYYMMDDHHMMSS>_add_package_types/migration.sql`, timestamp successivo a `20260707120000` (4.2). Poi `npx prisma migrate deploy` + `npx prisma generate`. Verificare le due `CREATE TABLE`, le FK e gli indici unique.
- [ ] Task 2: Service `package-types.service.ts` (AC 1/2) — pattern gestione categorie di `cash.service.ts`
  - [ ] `listPackageTypes(actor, { includeInactive })` — `authorize(actor, 'finance.manage')`: lo staff DEVE leggere il listino (in 4.4 vende da qui); la scrittura resta admin. Ordinamento `name asc`, include gli `eligibleAircraft` (id + registration, via join) e i campi del tipo. DTO `PackageTypeListItem` (`id`, `name`, `includedMinutes`, `priceCents`, `validityMonths`, `isActive`, `eligibleAircraft: { id, registration }[]`, `createdAt`). `take: 500`.
  - [ ] `createPackageType(actor, input)` — `authorize(actor, 'settings.manage')` (config listino = admin, come le tariffe 4.1/4.2). Validare gli `aircraftIds` (deduplicati): TUTTI devono esistere → altrimenti **404** `NotFoundError('Aircraft not found.')`; un velivolo **archiviato** all'atto dell'associazione → **409** `ConflictError` (stato sbagliato, stessa forma di "archived aircraft → 409" di 4.1). Nome: `trim()`, pre-check `findFirst` + `try/catch` P2002 backstop → 409. Creazione tipo + righe join in **una** `prisma.$transaction` (o nested create).
  - [ ] `updatePackageType(actor, id, input)` — `authorize(actor, 'settings.manage')`. PATCH parziale: ogni campo opzionale (`name`, `includedMinutes`, `priceCents`, `validityMonths` — nullable esplicito per AZZERARE la validità, distinguere `undefined` da `null`, `isActive`, `aircraftIds`). `aircraftIds`, se presente, è la **sostituzione integrale** dell'insieme (deleteMany + createMany nella stessa transazione), con le stesse validazioni del create. 404 su id inesistente; P2002 sul nome → 409. Modificare un tipo con pacchetti già venduti è LECITO (snapshot alla vendita, vedi Contesto) — doc-comment nel service, non un guard.
  - [ ] `deletePackageType(actor, id)` — `authorize(actor, 'settings.manage')`. 404 su id inesistente; delete righe join + tipo nella stessa transazione; `try/catch` **P2003 → 409** `ConflictError('This package type has sold packages — deactivate it instead.')`: oggi (4.3) nessuna FK esterna punta a `PackageType`, ma la 4.4 aggiunge `HourPackage.packageTypeId` con RESTRICT e questo catch diventa il backstop del vincolo AC 2 (la 4.4 aggiunge anche il pre-check esplicito `_count`). Stesso pattern di `deleteCashCategory` (3.4).
- [ ] Task 3: API + OpenAPI (AC 1/2)
  - [ ] `GET /api/v1/package-types` (query `includeInactive` bool opzionale, lista) e `POST /api/v1/package-types` (body `createPackageTypeSchema`, 201); `PATCH /api/v1/package-types/{id}` (body `updatePackageTypeSchema`) e `DELETE /api/v1/package-types/{id}` (204). Thin `apiRoute()`, `z` da `zod-with-openapi`.
  - [ ] Schemi in nuovo `src/lib/schemas/package-types.ts`: `createPackageTypeSchema` — `name` `.trim().min(1).max(100)`; `includedMinutes` `.int().positive().max(2_147_483_647)`; `priceCents` `.int().positive().max(2_147_483_647)`; `validityMonths` `.int().positive().max(600).nullable().optional()`; `aircraftIds` `z.array(z.string().min(1)).max(100)` (default `[]`; dedup nel service). `updatePackageTypeSchema`: tutti opzionali + `.refine` "almeno un campo presente" (pattern degli update esistenti); `isActive z.boolean().optional()`. `packageTypeItemSchema` mirror del DTO. Registrare componenti + le due path in `registry.ts` (tag `['Finance']` come cash; POST `errorResponses(401,403,404,409,422)`, PATCH idem, GET `(401,403,422)`, DELETE `(401,403,404,409)`), e aggiungere le path a `registry.test.ts` (coverage assertion).
- [ ] Task 4: UI (AC 1) — stile `minimalist-ui`
  - [ ] Nuova pagina `/dashboard/finance/packages` (`page.tsx` server component + `packages-manager.tsx` client component, **mirror di `/dashboard/finance/categories`**): tabella listino (nome, ore incluse formattate `H:MM` via `formatMinutes` di `src/lib/time.ts`, prezzo `formatCents` locale-aware M1, **prezzo orario effettivo derivato** `round(priceCents * 60 / includedMinutes)` mostrato come colonna informativa calcolata client/server-side ma MAI persistita, velivoli idonei come badge di marche, validità in mesi o "—", stato attivo/disattivo). Form crea/modifica (nome, ore incluse input `H:MM` con `parseMinutes`, prezzo € con `parseCents`, validità mesi opzionale, multi-selezione velivoli attivi non archiviati — checkbox list, niente librerie nuove) + azioni disattiva/riattiva/elimina, TUTTE visibili solo con `settings.manage`; `finance.manage`-only (staff) vede il listino in sola lettura. 409 delete (venduto — da 4.4 in poi) e 409 nome duplicato mappati a messaggi chiari; `key={id}` sui form di edit.
  - [ ] Link "Listino pacchetti" dalla landing finance (`/dashboard/finance/page.tsx`), visibile a `finance.manage` (a differenza di "Gestisci categorie" che è solo admin: lo staff consulta il listino).
  - [ ] i18n `messages/{it,en}.json` simmetrici (nuova sezione `PackagesPage.*`).
- [ ] Task 5: Test (AC 1/2)
  - [ ] Unit (`package-types.service.test.ts`, mock `prisma` come gli altri service test): permessi (staff `listPackageTypes` ok, staff `createPackageType` → Forbidden, pilota list → Forbidden); create con nome duplicato P2002 → Conflict; `aircraftIds` con id inesistente → NotFound; con velivolo archiviato → Conflict; dedup degli `aircraftIds`; update parziale (solo prezzo) non tocca l'insieme velivoli; update con `aircraftIds` sostituisce integralmente; `validityMonths: null` azzera; update id inesistente → NotFound; delete ok su tipo mai venduto; delete P2003 → Conflict; schema: minuti/prezzo 0/negativi/overflow → 422, `validityMonths` 0 → 422, nome vuoto/oltre max → 422, update body vuoto → 422.
  - [ ] e2e (`e2e/package-types.spec.ts`): admin crea un tipo (es. "Pacchetto 10 ore", 10:00, 1.400 €, velivolo I-ABCD idoneo, 12 mesi) → appare nel listino con ore `10:00` e prezzo formattato; nome duplicato → 409 mostrato; modifica prezzo → aggiornato in tabella; disattiva → badge disattivo; elimina (mai venduto) → sparisce; staff (login staff esistente o creato via API) vede il listino ma NON i controlli di gestione; `POST /api/v1/package-types` come staff → **403** envelope. Nomi run-unique (pattern `unique*` degli e2e esistenti) per il DB sporco.

## Dev Notes

- **AD-2 (cardine)**: minuti interi e centesimi interi OVUNQUE (`includedMinutes`, `priceCents`); il "prezzo orario effettivo" in UI è derivato al volo e mai persistito. **AD-3**: qui NON si applica l'append-only (vedi Contesto) — non costruire storni/storicizzazione sul listino. **AD-4**: la coerenza storica è garantita dallo snapshot in 4.4, citarlo nei doc-comment.
- **AC 2 e la 4.4**: il vincolo "venduto → non eliminabile" si completa in 4.4 (`HourPackage.packageTypeId` FK RESTRICT + pre-check `_count` + test). In 4.3 il DELETE esiste, funziona sui tipi mai venduti, e il catch P2003→409 è già scritto e unit-testato (mock che lancia P2003). NON rimandare il catch alla 4.4.
- **Permessi (asimmetria voluta, documentarla)**: lettura listino = `finance.manage` (staff vende in 4.4 e consulta ora); scrittura = `settings.manage` (admin, come tariffe 4.1/4.2 e categorie 3.4). Nessuna vista pilota in questa story (il pilota vedrà i PROPRI pacchetti in 4.4 nell'estratto conto, non il listino).
- **Lezioni review da rispettare** (evitano i F* già visti): unicità = pre-check + `try/catch` P2002; `key={id}` sui form di edit; `.positive()`/`.max()` sui numeri e `.max(100/500)` sulle stringhe libere; `authorize()` PRIMA di ogni query; ownership/esistenza check PRIMA di rivelare stato (404 vs 409); envelope errori AD-8; i18n IT/EN simmetrica; denaro locale-aware (M1); niente `Date` JS in raw SQL (qui non servono query raw: usare SOLO query tipizzate Prisma).
- **Riuso**: `formatMinutes`/`parseMinutes` (`src/lib/time.ts`) per le ore `H:MM`; `formatCents`/`parseCents` (`src/lib/money.ts`); pattern manager UI e service lifecycle da 3.4 (categorie). NON creare nuovi helper duplicati.
- **Ambiente**: postgres attivo; Mailpit già in esecuzione (se serve: Bash `run_in_background: true`, mai `&`); reset DB pulito prima di giudicare un run e2e completo (`sudo -u postgres psql -c 'DROP DATABASE airmanager;' && sudo -u postgres createdb -O airmanager airmanager && npx prisma migrate deploy && npx prisma db seed`). MAI `playwright install`.
- **Gate** (tutti verdi prima del commit): `npm run lint` (1 warning benigno noto su `data-table.tsx`), `npm run typecheck`, `npx vitest run` (>= 412 attesi), `npx next build`, `npx playwright test` (>= 79 attesi, DB resettato + Mailpit up).
- Un commit di implementazione (`Story 4.3: <sintesi>`, nessun riferimento AI/modello). NON push: review + push li fa la sessione principale. Branch corrente: `claude/epic-4-resume-pr-5-ambmfd` (sarà pushato anche su `claude/epic-4-rates-packages`, PR #5).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #AD-5, #AD-8]
- [Source: src/server/services/cash.service.ts] — pattern lifecycle catalogo (create/rename/deactivate/reactivate/delete, P2003→409, isActive)
- [Source: src/app/[locale]/dashboard/finance/categories/] — pattern UI manager da mirrorare
- [Source: _bmad-output/implementation-artifacts/4-1-aircraft-rates.md, 4-2-instructor-rates.md] — Review Record: lezioni su 409/404, permessi, TZ
- [Source: prisma/schema.prisma#CashCategory, #Aircraft] — isActive lifecycle e soft-archive velivoli

## Dev Agent Record

### Agent Model Used

_(da compilare dal dev agent)_

### Debug Log References

### Completion Notes List

### File List

## Review Record

_(da compilare in review)_

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
