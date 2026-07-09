---
baseline_commit: ec8ba7f
---

# Story 9.1: Assegnazione allievi–istruttori

Status: done

## Story

As a staff,
I want assegnare uno o più istruttori a un allievo (e rimuovere l'assegnazione),
so that ogni istruttore veda l'elenco dei propri allievi con il quadro essenziale (FR-32).

## Acceptance Criteria

1. **Given** un allievo attivo e un istruttore attivo, **When** lo staff assegna l'istruttore all'allievo dalla scheda persona, **Then** l'assegnazione è creata (many-to-many: più istruttori per allievo, più allievi per istruttore); assegnazione duplicata → 409; persona senza profilo allievo ATTIVO o istruttore senza profilo ATTIVO → 422 con code specifico; ruoli senza il permesso nuovo `school.manage.any` (tutti tranne STAFF/ADMIN) → 403.
2. **Given** un'assegnazione esistente, **When** lo staff la rimuove, **Then** l'assegnazione è cancellata (hard delete, nessuno storico richiesto dal PRD); due DELETE concorrenti → un 204 + un 404, MAI 500 (pattern TD-1 P2025→404).
3. **Given** un istruttore loggato, **When** apre "Scuola" nella nav (`/dashboard/school`), **Then** vede l'elenco dei SOLI propri allievi con il quadro essenziale: nome (cognome nome), inizio corso, **ore scuola totali** (somma `minutes` dei voli `SCHOOL` non stornati dell'allievo — TUTTI i suoi voli scuola, non solo quelli con questo istruttore: sono le ore di avanzamento dell'allievo) e **badge scadenze** (stato peggiore tra le scadenze della persona, riuso del badge condiviso di 6.4). Un istruttore senza allievi vede l'empty state. La colonna "ultima annotazione" NON è in questa story: arriva con la 9.2 (`TrainingNote`) — deferral dichiarato qui, colonna aggiunta lì.
4. **Given** un istruttore (o pilota/allievo), **When** chiama le API di gestione assegnazioni di un'altra persona (`GET/POST/DELETE /api/v1/people/{id}/instructors*`), **Then** riceve 403 (richiedono `school.manage.any`); la lista `GET /api/v1/school/students` è SEMPRE self-scoped sull'istruttore chiamante (`school.manage.own`) — un istruttore non può enumerare gli allievi altrui per costruzione; per un utente con `school.manage.own` ma SENZA profilo istruttore attivo la risposta è 422 (non 500). Piloti/allievi → 403; la voce nav "Scuola" non appare a chi non ha il permesso (comportamento nav esistente).
5. Endpoint registrati in OpenAPI (tag e pattern esistenti); migrazione con timestamp DOPO `20260709150000`; seed idempotente di un utente istruttore (`instructor@airmanager.local`, ruolo INSTRUCTOR + `InstructorProfile` attivo) e di un allievo (`student@airmanager.local`, ruolo STUDENT + `StudentProfile` attivo, `courseStartDate` valorizzata) per login e2e; unit + e2e (assegna/duplica/rimuovi/403/vista istruttore).

## Contesto e decisioni di design (vincolanti)

- **Schema (AD-11: mai nuove tabelle-persona — si collega ai profili esistenti)**: nuovo modello `StudentInstructorAssignment`: `id` cuid, `studentProfileId` FK → `StudentProfile`, `instructorProfileId` FK → `InstructorProfile`, `@@unique([studentProfileId, instructorProfileId])`, `createdAt`, `assignedByUserId` FK → `User` (audit chi/quando, pattern tracking di 7.3); back-relations sui due profili. FK RESTRICT default Prisma. Migrazione `202607091600XX_add_student_instructor_assignments` — verificare l'ordinamento con `ls prisma/migrations | tail` PRIMA del commit (lezione 8.3 F1).
- **RBAC (`src/server/auth/rbac.ts`)**: nuovo permesso **`school.manage.any`** aggiunto al type union `Permission` (:24-38), a `ALL_PERMISSIONS` (:40-55) e a STAFF+ADMIN in `ROLE_PERMISSIONS` (:76-101). `school.manage.own` resta all'INSTRUCTOR, invariato. Convenzione own/any esistente: il check "è mio?" vive nel service via `actor.personId`, MAI in rbac.ts. Aggiornare `rbac.test.ts`.
- **Service NUOVO `src/server/services/school.service.ts`** (capability map dell'architettura, `ARCHITECTURE-SPINE.md:225`): `authorize()` SEMPRE per primo (pattern `instructor-rates.service.ts:120`). Funzioni:
  - `listStudentInstructors(actor, studentPersonId)` — `school.manage.any`; risolve Person→StudentProfile (404 persona inesistente; 422 se nessun profilo allievo attivo); ritorna DTO minimi degli istruttori assegnati (personId, nome, createdAt assegnazione).
  - `assignInstructor(actor, studentPersonId, { instructorPersonId })` — `school.manage.any`; profili ATTIVI obbligatori su entrambi i lati (422, riusare i code 422 esistenti dove ci sono — es. `INSTRUCTOR_NOT_FOUND` di 5.1/TD-1 — e aggiungere l'analogo per l'allievo se manca, stesso stile); duplicato → pre-check + catch P2002 → `ConflictError` (pattern `instructor-rates.service.ts:92-100`). Niente lock/tx speciali: l'unique constraint è la garanzia di concorrenza (nessun contatore, nessun FOR UPDATE necessario).
  - `unassignInstructor(actor, studentPersonId, instructorPersonId)` — `school.manage.any`; delete diretto, P2025→`NotFoundError` (pattern TD-1, MAI 500 su doppia rimozione).
  - `listOwnStudents(actor)` — `school.manage.own`; risolve il profilo istruttore dall'`actor.personId` (422 se assente/non attivo, riuso `resolveInstructorProfile`-style di `instructor-rates.service.ts:75-86`); ritorna gli allievi assegnati con il quadro essenziale. **Ore scuola: query BATCHED** (groupBy `personId` con SUM(`minutes`) su `Flight` `flightType=SCHOOL` filtrata sullo stato non-stornato — stesso filtro di stato usato dai residui pacchetto in 5.3, verificare l'enum `FlightStatus` reale) — MAI N+1 per riga (lezione 4.1). **Scadenze: stato peggiore** derivato con lo stesso `computeExpiryStatus`/soglie di 6.2/6.4 (stato MAI persistito) — anche qui batched sulle expiries delle persone della lista.
- **API** (route sottili, pattern `people/[id]/instructor-rates/route.ts`):
  - `GET/POST /api/v1/people/{id}/instructors` e `DELETE /api/v1/people/{id}/instructors/{instructorPersonId}` — `{id}` e `{instructorPersonId}` sono SEMPRE `Person.id` (convenzione API esistente: mai esporre gli id dei profili). POST body Zod `{ instructorPersonId: string }`, 201; DELETE 204.
  - `GET /api/v1/school/students` — self-scoped, nessun query param (l'istruttore è l'actor). Registrare tutto in `src/lib/schemas/registry.ts` (schema nuovo `src/lib/schemas/school.ts`, tag OpenAPI nuovo `School` per il path school + tag `People` per i path annidati, coerente col registry esistente).
- **UI**:
  - **Scheda persona** (`src/app/[locale]/dashboard/people/[id]/page.tsx`): nuovo panel client `assigned-instructors-panel.tsx` (pattern `instructor-rates-panel.tsx`: props `labels`, stile minimalist-ui `border-[#EAEAEA] bg-white rounded-[12px]`), renderizzato SOLO se `person.studentProfile !== null` e l'actor ha `school.manage.any` (stesso gating a flag `canManage*` della page, :73-76). Lista istruttori assegnati + rimozione two-step (conferma, pattern esistente) + form di aggiunta: select popolata da `GET /api/v1/people?profile=instructor` (query param di TD-3, riuso esatto — niente componenti nuovi; il numero di istruttori è piccolo, non serve SearchCombobox).
  - **Pagina istruttore** `/dashboard/school/page.tsx` (server component): guard `school.manage.own`, tabella "I miei allievi" (nome, inizio corso, ore totali formattate h:mm come le altre superfici voli, badge scadenze condiviso di 6.4) + empty state. **Fix della voce nav**: `nav-items.ts:48` ha `href: '/school'` (placeholder mai implementato) → correggerlo in `/dashboard/school`, permissions invariate `['school.manage.own']` (la pagina è la vista dell'istruttore; lo staff gestisce dalle schede persona). Aggiornare `nav-items.test.ts` se asserisce l'href.
  - i18n IT/EN simmetrici in `messages/*.json`; stile editoriale minimalista esistente; verifica interattiva Playwright MCP (desktop + mobile 375×812) — story con UI: leggere e applicare le skill `design-taste-frontend` e `ui-ux-pro-max` (regola utente in CLAUDE.md).
- **Seed (`prisma/seed.ts`)**: upsert idempotenti (pattern esistente, password `SEED_ADMIN_PASSWORD`): utente `instructor@airmanager.local` (INSTRUCTOR) con Person + `InstructorProfile` attivo; utente `student@airmanager.local` (STUDENT) con Person + `StudentProfile` attivo e `courseStartDate`. NESSUNA assegnazione seedata (la creano i test/lo staff).
- **Fuori scope (dichiarato)**: `TrainingNote` e colonna "ultima annotazione" (story 9.2); riepiloghi ore per istruttore/compensi (story 9.3, FR-34); visibilità degli istruttori assegnati all'ALLIEVO (il PRD non la richiede in FR-32); notifiche email.

## Tasks / Subtasks

- [x] **T1 (AC 1, 5)** — Modello `StudentInstructorAssignment` + migrazione (timestamp dopo l'ultima, ordinamento verificato) + seed istruttore/allievo.
- [x] **T2 (AC 1, 2, 4)** — Permesso `school.manage.any` (rbac + test); `school.service.ts` con le 4 funzioni, error mapping completo (401/403/404/409/422) e query batched.
- [x] **T3 (AC 5)** — Route `people/{id}/instructors[/{instructorPersonId}]` + `school/students`, schema Zod `school.ts`, registrazione OpenAPI + test registry.
- [x] **T4 (AC 1, 2)** — Panel `assigned-instructors-panel.tsx` nella scheda persona (gated, add/remove, i18n IT/EN).
- [x] **T5 (AC 3)** — Pagina `/dashboard/school` (tabella quadro essenziale, empty state, badge scadenze condiviso, ore batched) + fix href nav; verifica Playwright MCP desktop+mobile.
- [x] **T6 (AC tutti)** — Unit (service: matrice permessi, duplicato, doppia rimozione, profili non attivi, aggregazione ore con volo stornato escluso) + e2e (staff assegna/rimuove dalla scheda persona; istruttore vede SOLO i propri allievi con ore e badge; istruttore→403 sulle API people/{id}/instructors; pilota→403 su school/students); osservabili run-unique.
- [x] **T7** — `npm run gates`; e2e nuovi + regressione mirata; story file (Dev Agent Record) + sprint-status.yaml (9-1 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines` (`.claude/skills/karpathy-guidelines/SKILL.md`); story con UI → anche `design-taste-frontend` e `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` per consultarla).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); Mailpit attivo; prima di ogni run e2e `curl localhost:3000` deve FALLIRE; build SEMPRE `env -u NODE_ENV`; MAI `playwright install`. Baseline e2e attuale: **151 test** (flake noti da contention documentati nell'handoff: fuori dal diff + verde in isolamento = non-regressione).
- UN commit di implementazione (`Story 9.1: ...`). Codice/commenti/identificatori in inglese; UI IT/EN.
- Login e2e: `loginExpectingDashboard` (pattern `e2e/instructor-rates.spec.ts:15-21`) con gli utenti seed nuovi; fixture via API per persone aggiuntive (`uniquePerson`, `createInstructorPerson` come riferimento).
- Le ore in tabella: i voli hanno `minutes Int` — formattare come le superfici voli esistenti (verificare l'helper usato in `/dashboard/flights`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md:729-771 — Epic 9, story 9.1 AC; :102 mapping FR]
- [Source: _bmad-output/planning-artifacts/prds/**/prd.md:267-283, :382-383 — FR-32/33/34 e assumptions ratificate]
- [Source: ARCHITECTURE-SPINE.md:87-90 (AD-11), :191-192 (ERD TrainingNote), :225 (capability map services/school)]
- [Source: src/server/auth/rbac.ts:24-101 — pattern permessi; src/server/services/instructor-rates.service.ts — pattern service+resolve+unique]
- [Source: src/app/[locale]/dashboard/people/[id]/page.tsx:51-76,150-331 — gating e panel; nav-items.ts:48]
- [Source: prisma/schema.prisma:102-131 (profili), :642-653+:718-727+:750 (Flight SCHOOL/status/minutes); prisma/seed.ts:224-240]
- [Source: _bmad-output/implementation-artifacts/8-3-ppr-closure-fee.md — lezione timestamp migrazioni; td-3 — query param `profile=instructor`]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh).

### Debug Log References

- `npx prisma migrate dev --name add_student_instructor_assignments` → `20260709220221_add_student_instructor_assignments` (sorts after `20260709150000_add_ppr_closure_fee`, verified with `ls prisma/migrations | tail`), applied cleanly on the fresh DB, `npx prisma generate` regenerated the client.
- `npx prisma db seed` → instructor/student users + profiles created idempotently, no assignment seeded (per Dev Notes).
- Unit: `npx vitest run` → 1106/1106 (28 new: 27 in `school.service.test.ts` + 1 new `it()` in `nav-items.test.ts`; `rbac.test.ts`/`registry.test.ts` only got new assertions inside EXISTING tests, no new test count from those two).
- `npm run gates` (final, clean tree) → lint/typecheck/test/build all PASS.
- Interactive Playwright MCP verification (desktop + mobile 375×812) BEFORE writing e2e: staff assign/remove flow on the scheda persona (empty state → assign → feedback+row → two-step remove → feedback+empty state again), column-header nit fixed (was reusing the panel heading, now a dedicated "Istruttore" column label), instructor's own `/dashboard/school` view (nav tile → table → empty-cell "—" for hours/status pre-flight), mobile screenshots of both surfaces confirmed the editorial-minimalist styling holds (deleted the local screenshot files afterward — Artifact-only, not for commit).
- e2e: `e2e/school.spec.ts` (5 new tests) run in isolation on a fresh-enough DB → 5/5 green (workers=1, and again inside the full 156-test suite).
- Full e2e suite (`npx playwright test`, default parallel workers, DB accumulated by this session's own interactive testing): **152/156** — all 5 new tests green; 4 fails, ALL outside this story's diff (`account-adjustments.spec.ts`, `expiry-dashboard.spec.ts:156`, `expiry-registration.spec.ts:221`, `ppr-register.spec.ts:292`). Re-verified in isolation (single file/worker): `account-adjustments.spec.ts` 4/4 green alone; `expiry-dashboard`/`expiry-registration` green when re-run together with the others at workers=1. `ppr-register.spec.ts:292` reproduced red twice even alone — this is the PRE-EXISTING, HANDOFF.md-documented flaky test ("classe flaky nota da contention (`ppr-register` filtri, ~1 rosso ogni 2-3 run)", predates this story) — not a regression from this diff (no file in this story touches PPR). Baseline note for the reviewer: session baseline was 151 (pre-existing suite) + 5 new = 156, matching.

### Completion Notes List

- T1: `StudentInstructorAssignment` Prisma model (links `StudentProfile`/`InstructorProfile`, AD-11) + migration + seed (`instructor@airmanager.local`/`student@airmanager.local`, idempotent, no assignment seeded).
- T2: `school.manage.any` permission (STAFF+ADMIN via `ALL_PERMISSIONS`) added to `rbac.ts`/`rbac.test.ts`. New `school.service.ts`: `listStudentInstructors`/`assignInstructor`/`unassignInstructor` (`school.manage.any`) + `listOwnStudents` (`school.manage.own`, self-scoped on `actor.personId`). Error mapping: 404 unknown person; 422 `STUDENT_NOT_FOUND` (new code, same naming style) / `INSTRUCTOR_NOT_FOUND` (reused verbatim from `flights.service.ts`, folded unknown+inactive for the body-supplied instructor id) for inactive profiles; 409 on a repeat assignment (pre-check + `P2002` catch); 404 on `unassignInstructor` via pre-check + `P2025` catch (TD-1 double-DELETE pattern); 422 `INSTRUCTOR_PROFILE_REQUIRED` (new code) when `school.manage.own` has no linked/active instructor profile. `listOwnStudents`'s hours (`flight.groupBy`, one query) and worst-scadenza-status (`expiry.findMany`, one query, reduced in JS with the existing `computeExpiryStatus`) are BOTH batched — no N+1.
- T3: Routes `GET/POST /api/v1/people/{id}/instructors`, `DELETE /api/v1/people/{id}/instructors/{instructorPersonId}`, `GET /api/v1/school/students` (all thin, `apiRoute` pattern). New `src/lib/schemas/school.ts` (reuses `expiryStatusSchema` from `./expiries` rather than a second enum). OpenAPI: 4 paths registered (tag `People` for the nested paths, tag `School` for `school/students`), `registry.test.ts` path list updated.
- T4: `assigned-instructors-panel.tsx` — twin structure of `ExpiriesPanel` (two-step remove, conditionally-mounted add form). Deliberately NOT a `SearchCombobox` (Dev Notes: instructor roster is small) — a plain `<select>` populated from `GET /api/v1/people?profile=instructor` (TD-3's filter, reused verbatim). Wired into `people/[id]/page.tsx`, gated on `person.studentProfile !== null && hasPermission(actor, 'school.manage.any')` — no read-only mode (every endpoint 403s without that permission, so there is nothing for a lesser-privileged viewer to see).
- T5: `/dashboard/school/page.tsx` — server component, `school.manage.own` gated, degrades a `ValidationError` (422, no active instructor profile) to the same empty state rather than crashing. Nav fix: `nav-items.ts`'s `school` entry now points at `/dashboard/school` (was the never-implemented `/school` placeholder); added the missing href assertion to `nav-items.test.ts`.
- T6: 27 new unit tests in `school.service.test.ts` (permission matrix, duplicate, double-removal race, inactive-profile 422s on both sides, batched-hours groupBy shape, worst-status reduction, empty roster short-circuits before any batched query) + 5 new e2e in `school.spec.ts` (see Debug Log). All run-unique (timestamp+random suffixes, no shared seeded person mutated).
- T7: gates + e2e verified (see Debug Log); this record + sprint-status.yaml updated.

### File List

- `prisma/schema.prisma` (M — `StudentInstructorAssignment` model + back-relations on `StudentProfile`/`InstructorProfile`/`User`)
- `prisma/migrations/20260709220221_add_student_instructor_assignments/migration.sql` (new)
- `prisma/seed.ts` (M — instructor/student demo users + profiles)
- `src/server/auth/rbac.ts` (M — `school.manage.any` permission)
- `src/server/auth/rbac.test.ts` (M)
- `src/server/services/school.service.ts` (new)
- `src/server/services/school.service.test.ts` (new)
- `src/lib/schemas/school.ts` (new)
- `src/lib/schemas/registry.ts` (M — School/instructors paths + component schemas)
- `src/lib/schemas/registry.test.ts` (M — new paths in the expected-paths list)
- `src/app/api/v1/people/[id]/instructors/route.ts` (new)
- `src/app/api/v1/people/[id]/instructors/[instructorPersonId]/route.ts` (new)
- `src/app/api/v1/school/students/route.ts` (new)
- `src/app/[locale]/dashboard/people/assigned-instructors-panel.tsx` (new)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (M — wires the new panel)
- `src/app/[locale]/dashboard/school/page.tsx` (new)
- `src/app/[locale]/dashboard/nav-items.ts` (M — `school` href fix)
- `src/app/[locale]/dashboard/nav-items.test.ts` (M — new href assertion)
- `messages/it.json` / `messages/en.json` (M — `AssignedInstructorsPanel`, `SchoolPage`)
- `e2e/school.spec.ts` (new)
- `_bmad-output/implementation-artifacts/9-1-student-instructor-assignment.md` (M — this record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M — 9-1 → review)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: fixes-required → fixed** (1 finding mandatory 91-F1 + 1 minor non-mandatory 91-F2, entrambi applicati dalla sessione principale nel commit di review e ri-verificati).

- **Priorità zero — full suite e2e su DB fresco (gate autoritativo; il dev aveva girato su DB auto-sporcato)**: **156 test, 153/156** — tutti i 5 e2e nuovi di `school.spec.ts` verdi nel run completo; people-detail/nav/rbac verdi. I 3 fail tutti FUORI dal diff: `expiry-registration:221` e `package-sale:207` verdi in isolamento (contention), `ppr-register:292` = flake pre-esistente documentato nell'handoff (~1 rosso ogni 2-3 run, rosso anche isolato). Non-regressione per il criterio consolidato. Gates: lint/typecheck/1106 unit/build tutti PASS.
- **Matrice permessi LIVE (curl, 5 sessioni seed + unauth) su tutte le route nuove**: esiti esatti (401 unauth ovunque; instructor/pilot/student → 403 su GET/POST/**DELETE** `people/{id}/instructors*` — chiuso il gap (a) del dev: il DELETE 403 è ora provato live; staff/admin passano; `school/students`: instructor 200, staff 403, admin 422 profilo mancante, MAI 500; profilo istruttore disattivato → 422 `INSTRUCTOR_PROFILE_REQUIRED`). Error codes esatti: 404 persona ignota, 422 `STUDENT_NOT_FOUND`/`INSTRUCTOR_NOT_FOUND` (folded anti-enumeration coerente col precedente flights, nessun leak), 422 `VALIDATION_ERROR` su body vuoto.
- **Race provate vive**: doppio POST assign concorrente → un 201 + un 409, 1 sola riga a DB; doppio DELETE → un 204 + un 404, 0 righe; mai 500.
- **Ore e badge provati end-to-end**: volo SCHOOL 60' + PRIVATE 30' + SCHOOL 45' stornato → `totalMinutes=60` ("1:00" in UI): PRIVATE e CANCELLED esclusi, filtro identico alla convenzione storno; batching confermato (1 groupBy + 1 findMany per l'intero roster, short-circuit su roster vuoto); badge worst-status coerente con `computeExpiryStatus` (e2e "Scaduta"), em-dash senza scadenze.
- **Cross-tenant**: istruttore B non vede MAI gli allievi di A (self-scoped per costruzione, provato live). UI verificata con Playwright MCP (scheda persona add/remove two-step, `/dashboard/school` tabella + empty state, nav "Scuola volo" solo all'istruttore, mobile 375×812 usabile, stile minimalist-ui coerente). OpenAPI live con i 3 path nuovi; i18n 33/33 chiavi simmetriche IT/EN; churn `schema.prisma` = solo whitespace di prisma format; File List = diff esatto.
- **91-F1 (major, mandatory, FIXATO)** — persone ARCHIVIATE assegnabili e visibili nei roster: i resolver di `school.service.ts` controllavano solo `deactivatedAt` del profilo e MAI `Person.archivedAt`, contraddicendo il precedente `flights.service.ts:462-474` (TD-1/5.1 D1) che il doc-comment dichiarava di riusare "verbatim". Provato live dal reviewer (archived instructor → 201; archived student visibile in "I miei allievi"). **Fix applicato**: `archivedAt` nei select + reject folded negli stessi code 422 in entrambi i resolver (convenzione anti-enumeration), filtro `studentProfile.person.archivedAt: null` nella query roster di `listOwnStudents` (l'assignment row resta: `unassignInstructor` continua a funzionare), doc-comment corretti. +3 unit test (archived student→422, archived instructor→422, filtro roster). Ri-verificato live dalla sessione principale: 422/422 sui due lati, roster senza l'archiviato, unassign 204.
- **91-F2 (minor, non-mandatory, FIXATO)** — panel "Istruttori assegnati" montato su ESISTENZA del profilo allievo (letterale da story): su profilo disattivato il GET risponde 422 e il panel mostrava il loadError generico. Gating corretto a `deactivatedAt === null` in `page.tsx` (stessa semantica dell'API).

### Final gates (post-fix, sessione principale)

`npm run gates` PASS (lint 0 errori, typecheck pulito, **1109/1109 unit** (+3), build verde); e2e mirati `school` + `people-management` **11/11** in isolamento; fix F1 ri-provato live via curl su dev server (output nel commit di review).

## Change Log

- 2026-07-09: Story file created (Fable 5 main session) — prima story dell'Epic 9, ricognizione Explore completata (epics/PRD/spine/schema/rbac/UI/seed).
- 2026-07-09: Implemented (Sonnet 5 single dev agent, xhigh). Gates: lint/typecheck/build green, 1106/1106 unit (+28 new), e2e 152/156 on the session's own accumulated DB (5/5 new tests green; 4 fails outside the diff, re-verified as isolation-green or the pre-existing documented `ppr-register:292` flake). Status → review.
- 2026-07-09: Review Opus 4.8 xhigh — fixes-required: 91-F1 major (persone archiviate assegnabili/visibili nei roster — mancava il check `archivedAt` del precedente flights/TD-1) + 91-F2 minor (gating panel su esistenza anziché stato attivo del profilo). Full suite autoritativa su DB fresco 153/156 (3 fail fuori diff non-regressione); matrice permessi live completa (incluso DELETE 403), race 201+409/204+404, ore/badge provati end-to-end, UI Playwright MCP ok. Fix applicati dalla sessione principale (+3 unit, 1109/1109; e2e mirati 11/11; F1 ri-provato live). Status → done.
