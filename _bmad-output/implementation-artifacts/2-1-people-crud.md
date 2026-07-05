# Story 2.1: CRUD persone con archiviazione

Status: ready-for-dev

## Story

As a staff,
I want creare, modificare e archiviare le persone,
so that l'anagrafica sia unica e senza duplicati (FR-4).

## Acceptance Criteria

1. **Given** il permesso staff (`people.manage`), **When** creo una Persona con nome, cognome, email, telefono, indirizzo, codice fiscale opzionale, **Then** la persona appare nell'elenco paginato e ricercabile (nome/cognome/email).
2. **Given** una persona con dati collegati (utente, e in futuro voli/movimenti), **When** la archivio, **Then** non è proposta nelle nuove operazioni ma resta consultabile con tutto lo storico; **And** non esiste alcuna API di cancellazione fisica.
3. **Given** un `pilota` (senza `people.read`), **When** chiama `GET /api/v1/people`, **Then** riceve 403 con envelope AD-8.

## Tasks / Subtasks

- [ ] Task 1: Modello e migrazione (AC: 1, 2)
  - [ ] Estendere `Person` esistente: `email` (già esiste, unique opzionale), aggiungere `phone?`, `address?`, `fiscalCode?` (unique opzionale), `archivedAt DateTime?`; migrazione
- [ ] Task 2: Service + API (AC: tutte)
  - [ ] `people.service.ts`: `listPeople` (paginato con helper 1.5, ricerca `q` su nome/cognome/email case-insensitive, filtro `includeArchived` default false), `getPerson`, `createPerson`, `updatePerson`, `archivePerson`/`unarchivePerson` — lettura con `people.read`, scritture con `people.manage`; email/fiscalCode duplicati → `ConflictError` (+ mapping P2002 come in users.service)
  - [ ] Route sottili con `apiRoute()`: `GET/POST /api/v1/people`, `GET/PATCH /api/v1/people/[id]`, `POST /api/v1/people/[id]/archive` e `/unarchive`; schemi Zod in `src/lib/schemas/people.ts` (import da `zod-with-openapi`!) registrati nel registry OpenAPI con paths
- [ ] Task 3: UI elenco + form (AC: 1, 2)
  - [ ] `/{locale}/dashboard/people`: **TanStack Table** (`@tanstack/react-table` 8.21.x — prima adozione: crea un componente tabella riusabile `src/components/data-table.tsx` che le prossime stories riuseranno) con colonne nome, email, telefono, stato (attiva/archiviata), ricerca server-side, paginazione; voce nav "Persone" già esistente
  - [ ] Form crea/modifica (react-hook-form + zodResolver come in users) + azioni archivia/ripristina con conferma; badge "archiviata"; filtro per includere le archiviate
  - [ ] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json`
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit service: ricerca, filtro archiviate, conflitti email/CF, permessi (pilota → ForbiddenError su list/create)
  - [ ] e2e: staff crea persona → appare in elenco; ricerca; archivia → sparisce dall'elenco default, appare con filtro; pilota su /dashboard/people → redirect/403; `GET /api/v1/people` da pilota → 403 envelope

## Dev Notes

- **Pattern consolidati da seguire** (non reinventare): `users.service.ts` (authorize, paginate, P2002→Conflict, toListItem), `apiRoute()` wrapper (1.5), registry OpenAPI (`registerPath` + component schemas con `z` da `zod-with-openapi` — regola ESLint attiva), pagine dashboard esistenti (users) per layout/form.
- **Permessi esistenti**: `people.read` (staff/admin), `people.manage` (staff/admin) già in `ROLE_PERMISSIONS` (1.3) — verifica e usa quelli.
- **Person esistente** (da 1.2): id cuid, firstName, lastName, email unique opzionale, relazione 1-0/1 con User; NON rompere il collegamento utenti (seed admin/pilot hanno Person collegate).
- **Archiviazione**: `archivedAt` timestamp (non boolean) — dice anche quando; una persona archiviata con User attivo: lascia l'accesso invariato (fuori scope disattivare l'utente qui, si fa da gestione utenti).
- Il dettaglio persona completo è la story 2.3: qui basta il form di modifica; non costruire la scheda.
- Ambiente: `service postgresql start`; Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &` (serve agli e2e esistenti); Chromium preinstallato, MAI `playwright install`.
- **Gate**: lint, typecheck, test (135+ attesi), build, test:e2e (25+ attesi) tutti verdi.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-1, #AD-5, #AD-8, #AD-11]
- [Source: _bmad-output/implementation-artifacts/1-5-api-openapi.md#Review Record] — wrapper, registry, regola ESLint zod
- [Source: docs/handoffs/HANDOFF.md] — stato ambiente e convenzioni

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
