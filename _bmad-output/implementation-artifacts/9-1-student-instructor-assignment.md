---
baseline_commit: ec8ba7f
---

# Story 9.1: Assegnazione allievi–istruttori

Status: ready-for-dev

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

- [ ] **T1 (AC 1, 5)** — Modello `StudentInstructorAssignment` + migrazione (timestamp dopo l'ultima, ordinamento verificato) + seed istruttore/allievo.
- [ ] **T2 (AC 1, 2, 4)** — Permesso `school.manage.any` (rbac + test); `school.service.ts` con le 4 funzioni, error mapping completo (401/403/404/409/422) e query batched.
- [ ] **T3 (AC 5)** — Route `people/{id}/instructors[/{instructorPersonId}]` + `school/students`, schema Zod `school.ts`, registrazione OpenAPI + test registry.
- [ ] **T4 (AC 1, 2)** — Panel `assigned-instructors-panel.tsx` nella scheda persona (gated, add/remove, i18n IT/EN).
- [ ] **T5 (AC 3)** — Pagina `/dashboard/school` (tabella quadro essenziale, empty state, badge scadenze condiviso, ore batched) + fix href nav; verifica Playwright MCP desktop+mobile.
- [ ] **T6 (AC tutti)** — Unit (service: matrice permessi, duplicato, doppia rimozione, profili non attivi, aggregazione ore con volo stornato escluso) + e2e (staff assegna/rimuove dalla scheda persona; istruttore vede SOLO i propri allievi con ore e badge; istruttore→403 sulle API people/{id}/instructors; pilota→403 su school/students); osservabili run-unique.
- [ ] **T7** — `npm run gates`; e2e nuovi + regressione mirata; story file (Dev Agent Record) + sprint-status.yaml (9-1 → review).

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

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-09: Story file created (Fable 5 main session) — prima story dell'Epic 9, ricognizione Explore completata (epics/PRD/spine/schema/rbac/UI/seed).
