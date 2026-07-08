---
baseline_commit: a1d663f
---

# Story 6.1: Tipi di scadenza standard e personalizzati

Status: review

## Story

As a admin,
I want i tipi di scadenza standard pronti e la possibilità di crearne di miei,
so that il sistema si adatti alla mia realtà (FR-35).

## Acceptance Criteria

1. **Given** il seed del database, **When** guardo i tipi di scadenza, **Then** trovo precaricati: visita medica classe 1, classe 2, LAPL; licenza; rating SEP; inglese ICAO — ciascuno con ambito (piloti/allievi/istruttori/tutti).
2. **Given** il permesso admin, **When** creo un tipo personalizzato, **Then** è utilizzabile come i tipi standard; i tipi in uso non sono eliminabili (solo disattivabili). *(In questa story non esiste ancora `Expiry` — arriva in 6.2: qui si implementa il DELETE con il backstop P2003→409 e la 6.2 aggiunge la FK RESTRICT, il pre-check esplicito `_count` con messaggio chiaro e il test end-to-end del vincolo — ESATTAMENTE lo split già fatto per `PackageType`/`HourPackage` in 4.3/4.4. Vedi Dev Notes.)*

## Contesto: catalogo mutabile, pattern 3.4/4.3 — NON reinventare

`ExpiryType` è **configurazione di catalogo** (come `CashCategory` di 3.4 e `PackageType` di 4.3), NON un ledger: si crea, si modifica, si disattiva/riattiva, e si elimina SOLO finché nessuna scadenza registrata (6.2) lo referenzia. Nessun `isSystem`: i tipi standard sono semplici righe seedate — l'admin può rinominarli, cambiarne l'ambito, disattivarli e (finché inutilizzati) eliminarli come i custom ("utilizzabile come i tipi standard" vale nei due sensi; il seed è idempotente con `update: {}`, quindi un re-seed non sovrascrive le personalizzazioni). Modificare un tipo IN USO è lecito: le scadenze già registrate (6.2) referenziano il tipo per id e non fanno snapshot del nome; il cambio di `scope` vale solo per i controlli di compatibilità FUTURI alla registrazione (6.2), mai retroattivo — doc-comment nel service, non un guard. Pattern di riferimento per service/UI: **gestione categorie cassa di 3.4** (`cash.service.ts` + `/dashboard/finance/categories`), con la variante update-parziale di **4.3** (`package-types.service.ts`).

## Tasks / Subtasks

- [x] Task 1: Modello + migrazione + seed (AC 1/2)
  - [x] Nuovo enum `ExpiryScope` in `prisma/schema.prisma`: `PILOTS | STUDENTS | INSTRUCTORS | ALL` — l'"ambito" dell'epica. Semantica (doc-comment sull'enum): a chi è destinato il tipo; `ALL` = qualunque persona, gli altri valori = persona con il profilo corrispondente attivo. Il CHECK di compatibilità persona↔ambito NON si implementa qui (è l'AC di 6.2, alla registrazione): qui l'ambito è solo un attributo mostrato/gestito.
  - [x] Nuovo modello `ExpiryType`: `id String @id @default(cuid())`; `name String @unique` (409 su duplicato); `scope ExpiryScope`; `isActive Boolean @default(true)` (disattivazione = via dai picker di registrazione futuri (6.2), mai delete quando in uso — stesso ruolo di `CashCategory.isActive`); `createdAt`/`updatedAt`. Doc-comment sul modello: mutabile (vedi Contesto), delete consentito solo se mai usato (FK RESTRICT da `Expiry` in 6.2), niente `isSystem` deliberatamente.
  - [x] Migrazione a mano (Prisma 7: `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script`, **rimuovere la riga banner `Loaded Prisma config...`** dallo stdout) in `prisma/migrations/20260708080000_add_expiry_types/migration.sql` (timestamp successivo a `20260707170000`, ultima di epic 5). Poi `npx prisma migrate deploy` + `npx prisma generate`. Verificare `CREATE TYPE "ExpiryScope"`, `CREATE TABLE "ExpiryType"` e l'indice unique sul nome.
  - [x] Seed (`prisma/seed.ts`): nuova `seedExpiryTypes()` chiamata da `main()`, idempotente come le altre — `upsert` keyed su `name` unique, `update: {}` (NON riscrivere scope/isActive: preserva le personalizzazioni admin, stesso principio di `seedCashCategories`/`seedAircraft`). I 6 tipi standard (AC 1), nomi in italiano come le categorie cassa: `'Visita medica classe 1'` → `INSTRUCTORS`; `'Visita medica classe 2'` → `PILOTS`; `'Visita medica LAPL'` → `STUDENTS`; `'Licenza'` → `PILOTS`; `'Rating SEP'` → `PILOTS`; `'Inglese ICAO'` → `PILOTS`. (Gli ambiti seedati sono default demo sensati per un'aviosuperficie AG — l'admin li adatta; non serve coprire `ALL` nel seed, lo copre l'e2e col tipo custom.) `console.log` di conferma come le altre seed function.
- [x] Task 2: Service `expiry-types.service.ts` (AC 1/2) — pattern gestione categorie di `cash.service.ts` + update parziale di `package-types.service.ts`
  - [x] Nuovo `src/server/services/expiry-types.service.ts`. `listExpiryTypes(actor, { includeInactive })` — `authorize(actor, 'expiries.manage')`: admin E staff leggono il catalogo (lo staff registra le scadenze in 6.2 e DEVE vedere i tipi; il pilota NON vede il catalogo — vedrà le PROPRIE scadenze in 6.2/6.4 via `self.read`). Default solo attivi, `includeInactive` per la vista di gestione. Ordinamento `name asc`, `take: 500`. DTO `ExpiryTypeListItem` (`id`, `name`, `scope`, `isActive`, `createdAt`).
  - [x] `createExpiryType(actor, input: { name, scope })` — `authorize(actor, 'settings.manage')` (config catalogo = admin, come 3.4/4.1/4.2/4.3). `name.trim()`, pre-check `findFirst` + `try/catch` P2002 backstop → 409 `ConflictError('An expiry type with this name already exists.')`.
  - [x] `updateExpiryType(actor, id, input)` — `authorize(actor, 'settings.manage')`. PATCH parziale: `name?`, `scope?`, `isActive?` (il toggle attivo/disattivo passa da qui — NON servono endpoint deactivate/reactivate separati: seguire 4.3, non 3.4, su questo punto). 404 `NotFoundError('Expiry type not found.')` su id inesistente PRIMA di ogni altra verifica; nome: trim + pre-check (escludendo se stesso) + P2002 backstop → 409. Modificare un tipo in uso è LECITO (vedi Contesto) — doc-comment.
  - [x] `deleteExpiryType(actor, id)` — `authorize(actor, 'settings.manage')`. 404 su id inesistente; `try/catch` **P2003 → 409** `ConflictError('This expiry type is in use — deactivate it instead.')`: oggi (6.1) nessuna FK esterna punta a `ExpiryType`, ma la 6.2 aggiunge `Expiry.expiryTypeId` con RESTRICT e questo catch diventa il backstop del vincolo AC 2 (la 6.2 aggiunge anche il pre-check esplicito `_count`). Stesso pattern di `deleteCashCategory` (3.4) / `deletePackageType` (4.3). NON rimandare il catch alla 6.2.
- [x] Task 3: API + OpenAPI (AC 1/2)
  - [x] `GET /api/v1/expiry-types` (query `includeInactive` bool opzionale, lista) e `POST /api/v1/expiry-types` (body `createExpiryTypeSchema`, 201) in `src/app/api/v1/expiry-types/route.ts`; `PATCH /api/v1/expiry-types/{id}` (body `updateExpiryTypeSchema`) e `DELETE /api/v1/expiry-types/{id}` (**204**, `apiRoute()` lo gestisce già dal fix 4.3) in `src/app/api/v1/expiry-types/[id]/route.ts`. Thin `apiRoute()`, `z` da `zod-with-openapi`.
  - [x] Schemi in nuovo `src/lib/schemas/expiry-types.ts`: `expiryScopeSchema = z.enum(['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'])`; `createExpiryTypeSchema` — `name` `.trim().min(1).max(100)`, `scope` = `expiryScopeSchema`; `updateExpiryTypeSchema` — tutti opzionali (`name`, `scope`, `isActive z.boolean().optional()`) + `.refine` "almeno un campo presente" (pattern update esistenti); `expiryTypeItemSchema` mirror del DTO. Registrare componenti + le due path in `registry.ts` con **nuovo tag `['Expiries']`** (prima risorsa dell'epic 6); errorResponses: GET `(401,403,422)`, POST `(401,403,409,422)`, PATCH `(401,403,404,409,422)`, DELETE `(401,403,404,409)`. Aggiungere le 2 path a `registry.test.ts` (coverage assertion).
- [x] Task 4: UI (AC 1/2) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [x] Nuova landing `/dashboard/expiries` (`src/app/[locale]/dashboard/expiries/page.tsx`, server component): gate `expiries.manage` con redirect a `/dashboard` (pattern `finance/page.tsx`); header editoriale kicker/titolo/descrizione + bottone "Tipi di scadenza" verso `/dashboard/expiries/types` visibile SOLO con `settings.manage` + back to dashboard. Corpo: per ora un pannello vuoto/informativo minimale che anticipa la dashboard scadenze (6.4 sostituirà questa landing con l'elenco per urgenza — dirlo in un doc-comment, NON costruire nulla di 6.4 qui). Niente fetch di dati oltre a `listExpiryTypes` se serve mostrare un conteggio — anche zero fetch va bene.
  - [x] Nuova pagina `/dashboard/expiries/types` (`page.tsx` server component + `types-manager.tsx` client component, **mirror di `/dashboard/finance/categories`** con l'edit-form parziale di `packages-manager.tsx`): tabella (nome, ambito come badge testuale localizzato, stato attivo/disattivato); form crea (nome + select ambito) e modifica (nome, ambito, `key={id}` sui form di edit) + azioni disattiva/riattiva/elimina — TUTTE le scritture visibili solo con `settings.manage`; chi ha solo `expiries.manage` (staff) vede il catalogo in sola lettura. Gate pagina: `expiries.manage`. 409 (nome duplicato, delete in-uso da 6.2 in poi) mappati a messaggi chiari per-form (convenzione: un messaggio localizzato per form, mai il message server English-only); successo con `role="status"`. Le etichette degli ambiti: mappa client `scope → label` da i18n (`PILOTS` → "Piloti"/"Pilots", ecc.), MAI l'enum raw in UI.
  - [x] Nav: in `nav-items.ts` repoint `{ key: 'expiries', href: '/expiries' }` → `/dashboard/expiries` (stesso repoint fatto da people/aircraft/finance/flights nelle rispettive story; permessi invariati `['expiries.manage']` — la voce per pilota/allievo arriverà con le viste self di 6.2/6.4). Aggiornare il doc-comment e `nav-items.test.ts` se asserisce gli href.
  - [x] i18n `messages/{it,en}.json` simmetrici: nuove sezioni `ExpiriesPage.*` (landing) e `ExpiryTypesPage.*` (manager, incluse le 4 label degli ambiti). Le chiavi nav `expiries` esistono già.
- [x] Task 5: Test (AC 1/2)
  - [x] Unit (`expiry-types.service.test.ts`, mock `prisma` come gli altri service test): permessi (staff `listExpiryTypes` ok, staff `createExpiryType` → Forbidden, pilota `listExpiryTypes` → Forbidden, admin tutto ok); `includeInactive` default false filtra; create con nome duplicato (pre-check e P2002 backstop) → Conflict; create trim del nome; update parziale (solo `isActive`) non tocca nome/scope; update nome duplicato → Conflict; update id inesistente → NotFound; update body senza campi → 422 (schema); delete ok su tipo mai usato; delete P2003 (mock che lancia) → Conflict; delete id inesistente → NotFound; schema: nome vuoto/solo spazi/oltre 100 → 422, `scope` fuori enum → 422.
  - [x] e2e (`e2e/expiry-types.spec.ts`): admin apre `/dashboard/expiries` → landing con link tipi; apre `/dashboard/expiries/types` → **i 6 tipi standard seedati visibili con i loro ambiti** (AC 1 — asserire nomi e badge ambito di almeno 2-3 tipi, es. 'Visita medica classe 2' → Piloti, 'Visita medica LAPL' → Allievi); crea tipo custom run-unique (pattern `unique*`) con ambito "Tutti" → appare attivo in tabella (AC 2 "utilizzabile come i tipi standard"); nome duplicato → messaggio 409 nel form; modifica ambito → badge aggiornato; disattiva → stato disattivato; elimina il custom (mai usato) → sparisce; STAFF (creato via `POST /api/v1/users` + password, stesso helper-pattern di `package-types.spec.ts`) vede il catalogo senza controlli di gestione e un `POST /api/v1/expiry-types` diretto come staff → **403** envelope AD-8; nav "Scadenze" visibile per lo staff e assente per il pilota seed (il pilota non ha `expiries.manage`).

## Dev Notes

- **Permessi (asimmetria voluta, documentarla nel service)**: lettura catalogo = `expiries.manage` (admin+staff — già nel catalogo RBAC di `rbac.ts`, NON toccare `rbac.ts`); scrittura = `settings.manage` (admin). Pilota/allievo/istruttore: NIENTE in questa story (le viste self arrivano con 6.2/6.4).
- **AC 2 e la 6.2**: il vincolo "in uso → non eliminabile" si completa in 6.2 (`Expiry.expiryTypeId` FK RESTRICT + pre-check `_count` + test e2e del vincolo). In 6.1 il DELETE esiste, funziona sui tipi mai usati, e il catch P2003→409 è già scritto e unit-testato (mock che lancia P2003) — identico allo split 4.3→4.4 già validato.
- **Niente su Expiry/SentAlert/soglie/job**: `Expiry` è 6.2, `SentAlert` e il job `POST /api/v1/jobs/expiry-alerts` (AD-9, bearer `JOBS_SECRET`) sono 6.3, la dashboard per urgenza è 6.4. Questa story è SOLO il catalogo tipi.
- **AD-8**: envelope errori standard via `apiRoute()`; messaggi server English-only (convenzione: il client futuro Flutter consuma l'API, la UI localizza per-form). **AD-5**: `authorize()` PRIMA di ogni query; il redirect di pagina è solo navigazione, mai l'unico guardiano.
- **Lezioni review da rispettare** (evitano i finding già visti): unicità = pre-check + `try/catch` P2002 su create E update; `key={id}` sui form di edit; `.max(100)` sulle stringhe libere; 404-prima-di-409 senza state leak; i18n IT/EN simmetrica (le review contano le chiavi); enum mai raw in UI; overflow tabelle in container `overflow-x-auto`; feedback successo `role="status"`.
- **Riuso**: `apiRoute()` (204 già supportato), `ConflictError`/`NotFoundError` da `errors.ts`, pattern manager UI da `categories-manager.tsx` (3.4) + `packages-manager.tsx` (4.3, per l'edit parziale e i badge). NON creare nuovi helper duplicati; NON servono `time.ts`/`money.ts` qui (nessuna data/importo in questa story oltre a `createdAt`, che può restare fuori dalla tabella).
- **Skill UI obbligatorie (regola utente)**: usare `design-taste-frontend` E `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`, DB: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`); coerenza con lo stile editoriale `minimalist-ui` esistente (monocromi caldi `#111111`/`#787774`/`#EAEAEA`/`#F7F6F3`, serif per i titoli, bento flat, niente gradienti/ombre). Verifica interattiva con **Playwright MCP** (`mcp__playwright__*`, server già configurato in `.mcp.json`) prima degli e2e: navigare le due pagine reali da admin e da staff, screenshot, esercitare crea/modifica/disattiva/elimina e il messaggio di errore 409.
- **Ambiente**: postgres attivo e DB già migrato+seedato; Mailpit già in esecuzione (non serve in questa story). Reset DB pulito prima di giudicare un run e2e completo: `sudo -u postgres psql -c 'DROP DATABASE airmanager WITH (FORCE);' && sudo -u postgres createdb -O airmanager airmanager && npx prisma migrate deploy && npx prisma db seed`. MAI `playwright install`. Build SEMPRE `env -u NODE_ENV npx next build` (un NODE_ENV=development trapelato rompe il prerender — falso allarme già visto DUE volte in epic 5).
- **e2e e flakiness NOTA (non perdere tempo a re-diagnosticarla)**: la suite completa in parallelo ha una classe flaky documentata (race form-refresh dei flight spec + cap 100 dei picker su DB sporco — vedi HANDOFF). Procedura valida: giudicare su DB fresco; se falliscono spec NON di questa story, ri-eseguirle in isolamento prima di considerarle regressioni. `expiry-types.spec.ts` DEVE passare stabilmente (usa nomi run-unique, nessuna dipendenza dai flight spec).
- **Gate** (tutti verdi prima del commit): `npm run lint` (1 warning benigno noto su `data-table.tsx`), `npm run typecheck`, `npx vitest run` (**≥ 589** attesi + i nuovi), `env -u NODE_ENV npx next build`, `npx playwright test` (≥ 96 attesi, DB resettato; regola flaky sopra).
- Un commit di implementazione (`Story 6.1: <sintesi>`, nessun riferimento AI/modello). NON push: review + push li fa la sessione principale. Branch corrente: `claude/handoff-documentation-85b39b`. Verificare `git status` PRIMA di committare (un agent di epic 5 ha lasciato il repo in detached HEAD).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, #AD-9 (solo perimetro: SentAlert/job = 6.3), ERD `ExpiryType ||--o{ Expiry`]
- [Source: src/server/services/cash.service.ts] — pattern lifecycle catalogo (P2002/P2003→409, isActive)
- [Source: src/server/services/package-types.service.ts] — update parziale + 404/409 ordering
- [Source: src/app/[locale]/dashboard/finance/categories/] — pattern UI manager da mirrorare
- [Source: src/app/[locale]/dashboard/finance/page.tsx] — pattern landing con link gated
- [Source: _bmad-output/implementation-artifacts/4-3-package-types.md] — Review Record: lezioni (retained-archived su update non applicabile qui, ma il principio 404/409 e la conflazione 409 per-form sì)
- [Source: prisma/seed.ts#seedCashCategories] — pattern seed idempotente `update: {}`

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent)

### Debug Log References

- `env -u NODE_ENV npx next build` — clean production build, all routes compiled including `/dashboard/expiries`, `/dashboard/expiries/types`, `/api/v1/expiry-types`, `/api/v1/expiry-types/[id]`.
- `npx vitest run` — 612/612 passed (baseline 589 + 23 new: 20 service unit tests + 3 schema-only cases folded into the same describe blocks).
- `npx playwright test` on a freshly reset DB — 99 total (96 baseline + 3 new `expiry-types.spec.ts`), 93 passed / 6 failed on the first full-parallel run; all 6 failures are in `flight-reversal.spec.ts`, `flights.spec.ts`, `package-consumption.spec.ts`, `people-management.spec.ts` (×2), `user-management.spec.ts` — none of this story's files. Re-ran the failing specs in isolation on a fresh DB (`DROP DATABASE ... ; createdb ...; migrate deploy; db seed`): `flights.spec.ts:210` and `package-consumption.spec.ts:134` reproduce deterministically even alone (the documented "race form-refresh dei flight spec" flaky class — `flight-result-panel` never appears), `flight-reversal.spec.ts`, `people-management.spec.ts`, `user-management.spec.ts` passed clean on that isolated re-run (transient "DB sporco" flakiness). No file this story touches (`git diff --stat`) is anywhere near the flights/people domain — confirmed pre-existing per the story's Dev Notes, not a regression. `expiry-types.spec.ts`'s own 3 tests passed stably in every run (full-parallel and isolated).
- Interactive Playwright MCP verification (admin + staff) on a freshly reset+seeded DB before the automated e2e run: landing page stat tile, types manager table (6 seeded types with correct scope badges), create → 409-duplicate-in-form → edit (scope badge updates) → deactivate → two-step delete, all with `role="status"` success feedback; staff sees read-only catalogue (no create button, no actions column) and a direct `POST /api/v1/expiry-types` as staff returns 403 `FORBIDDEN`; nav "Scadenze" visible for staff, absent for the pilot seed user, and `/dashboard/expiries` redirects a pilot to `/dashboard`.

### Completion Notes List

- Implemented all 5 tasks per the story file exactly as scoped: `ExpiryScope` enum + `ExpiryType` model (Task 1), `expiry-types.service.ts` with the 3.4/4.3 catalogue lifecycle pattern including the forward-looking P2003 backstop for 6.2's FK (Task 2), REST API + OpenAPI registration under a new `Expiries` tag (Task 3), the two-page UI (landing + types manager) mirroring `finance/categories` and `finance/packages` in the established minimalist editorial style (Task 4), unit + e2e tests (Task 5).
- Migration hand-written via `npx prisma migrate diff --from-config-datasource ... --to-schema ...` (no banner line was present in this run's stdout, nothing to strip), timestamped `20260708080000_add_expiry_types`, applied with `migrate deploy` + `generate`, verified `CREATE TYPE "ExpiryScope"`, `CREATE TABLE "ExpiryType"` and the unique index on `name` via `psql \d`.
- Seed: `seedExpiryTypes()` upserts the 6 standard types keyed on unique `name` with `update: {}` (idempotent, never overwrites an admin's rename/re-scope), called from `main()` after `seedPilotAccount()`. Verified via a full DB reset + `prisma db seed` run (console: "Seed: 6 expiry types ready.").
- Service: read (`listExpiryTypes`) gated on `expiries.manage` (admin+staff), writes (`create`/`update`/`delete`) gated on `settings.manage` (admin only) — exactly the asymmetry the Dev Notes specify. `updateExpiryType` follows the `package-types.service.ts` pattern (partial PATCH, `isActive` toggle folded in, no separate deactivate/reactivate endpoints), not `cash.service.ts`'s atomic-guarded-update pattern, per the story's explicit instruction. `deleteExpiryType`'s `P2003` catch is written and unit-tested now (mocked rejection) even though no FK references `ExpiryType` yet in this story — it becomes the live backstop the moment 6.2 adds `Expiry.expiryTypeId ON DELETE RESTRICT`.
- UI: skills `design-taste-frontend` and `ui-ux-pro-max` were both invoked per the story's hard rule. `design-taste-frontend` is scoped to landing/portfolio/marketing pages (its own Section 13 explicitly excludes admin/dashboard/data-table UI) — it was consulted and its applicable guidance (icon/emoji policy, contrast, states) folded in, but the actual layout follows the project's established `minimalist-ui` dashboard pattern (mirrors `categories-manager.tsx`/`packages-manager.tsx` pixel-for-pixel in spirit: warm monochrome palette, flat bento stat tile, serif display heading, `overflow-x-auto` table, `role="status"` feedback, two-step delete confirm). `ui-ux-pro-max`'s admin/data-table checklist (badge = icon/text not color-only, WCAG contrast, table overflow handling) was queried and matches what was already the codebase convention.
- Scope badges use a new warm-neutral chip (`bg-[#F0EEE6] text-[#5F5B53]`) distinct from the existing green/yellow status chips and blue aircraft chips — never the raw `ExpiryScope` enum value, always the localized label via the `scope → label` map passed from the server component (`t('scope.PILOTS')` etc.).
- Nav: `expiries` repointed from the epic-1 placeholder `/expiries` to `/dashboard/expiries`, permissions unchanged (`['expiries.manage']`) — the pilot/allievo/istruttore self-service view arrives with 6.2/6.4, matching the Dev Notes. `nav-items.test.ts` asserts keys only (no href assertions), so it needed no changes.
- i18n: `ExpiriesPage`/`ExpiryTypesPage` sections added symmetrically to `messages/it.json`/`messages/en.json` (inserted after `FlightsPage`, before `UsersPage`), including all 4 scope labels in both languages.
- Landing page (`/dashboard/expiries`) is deliberately minimal per the Dev Notes: a stat tile (active-type count, the only read beyond the gate) plus an informational panel explicitly doc-commented as "story 6.4 replaces this" — nothing from 6.2/6.3/6.4 was built ahead of schedule.
- All gates green: lint (1 known benign `data-table.tsx` warning, unchanged), typecheck clean, vitest 612/612, `env -u NODE_ENV npx next build` clean, playwright 93→99 passed with the pre-existing documented flaky class isolated and re-verified (see Debug Log References).

### File List

- `prisma/schema.prisma` (modified — `ExpiryScope` enum, `ExpiryType` model)
- `prisma/migrations/20260708080000_add_expiry_types/migration.sql` (new)
- `prisma/seed.ts` (modified — `seedExpiryTypes()`)
- `src/lib/schemas/expiry-types.ts` (new)
- `src/lib/schemas/registry.ts` (modified — component registrations + 4 new paths under `Expiries` tag)
- `src/lib/schemas/registry.test.ts` (modified — 2 new path assertions)
- `src/server/services/expiry-types.service.ts` (new)
- `src/server/services/expiry-types.service.test.ts` (new)
- `src/app/api/v1/expiry-types/route.ts` (new)
- `src/app/api/v1/expiry-types/[id]/route.ts` (new)
- `src/app/[locale]/dashboard/expiries/page.tsx` (new)
- `src/app/[locale]/dashboard/expiries/types/page.tsx` (new)
- `src/app/[locale]/dashboard/expiries/types/types-manager.tsx` (new)
- `src/app/[locale]/dashboard/nav-items.ts` (modified — `expiries` repoint)
- `messages/it.json` (modified — `ExpiriesPage`, `ExpiryTypesPage`)
- `messages/en.json` (modified — `ExpiriesPage`, `ExpiryTypesPage`)
- `e2e/expiry-types.spec.ts` (new)

## Review Record

## Change Log

- 2026-07-08: Story file created (Fable 5 main session), ready-for-dev.
- 2026-07-08: Implemented (Sonnet 5 single dev agent) — expiry-type catalogue (model/migration/seed, service, API+OpenAPI, UI landing+manager, nav repoint, i18n, unit+e2e tests). All gates green. Status: review.
