# Story 1.3: Ruoli e permessi applicati nel service layer

Status: ready-for-dev

## Story

As a gestore,
I want che ogni azione sia autorizzata in base ai ruoli dell'utente,
so that nessuno veda o modifichi dati fuori dal proprio perimetro (FR-2).

## Acceptance Criteria

1. **Given** la mappa permessi→ruoli centralizzata in `src/server/auth/rbac.ts`, **When** un service viene invocato da un attore privo del permesso richiesto, **Then** viene sollevato `ForbiddenError` mappato in HTTP 403 (envelope AD-8 `{"error":{"code":"FORBIDDEN",...}}`) sia dalle pagine sia dalle API.
2. **Given** un utente con più ruoli (es. pilota+istruttore), **When** accede, **Then** i suoi permessi sono l'unione dei ruoli e la navigazione della dashboard mostra l'unione delle voci.
3. I test unitari coprono la matrice permessi per almeno: staff che legge tutti, pilota che legge solo sé stesso (403 sull'altrui), unione multi-ruolo.

## Tasks / Subtasks

- [ ] Task 1: Errori di dominio (AC: 1)
  - [ ] `src/server/services/errors.ts`: gerarchia `DomainError` (`ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`) con `code` stabile SCREAMING_SNAKE — base che la story 1.5 riuserà per l'envelope completo
- [ ] Task 2: RBAC centrale (AC: 1, 2)
  - [ ] `src/server/auth/rbac.ts`: tipo `Permission` (stringhe union, set iniziale: `people.read`, `people.manage`, `aircraft.manage`, `finance.manage`, `flights.manage`, `bookings.manage.own`, `bookings.manage.any`, `school.manage.own`, `expiries.manage`, `settings.manage`, `users.manage`, `self.read`), mappa `ROLE_PERMISSIONS: Record<Role, Permission[]>` conforme al PRD §4.1 (admin tutto; staff gestione operativa; istruttore propri allievi; pilota/allievo self-service)
  - [ ] `authorize(actor, permission)` che lancia `ForbiddenError`; `hasPermission(actor, permission)` puro per la UI; `Actor` = `{ userId, personId, roles }` da `getSessionActor()`
- [ ] Task 3: Primo consumo reale (AC: 1, 2)
  - [ ] Service `src/server/services/me.service.ts`: `getMe(actor)` (dati utente + persona collegata; permesso `self.read`) — primo service reale che rispetta AD-1/AD-5
  - [ ] Endpoint `GET /api/v1/me` (route sottile → service; 401 già gestito dal proxy; DomainError → risposta AD-8 con mapping minimale locale, l'helper completo arriva in 1.5)
  - [ ] Dashboard: navigazione per ruolo (voci placeholder: Persone/Velivoli/Voli/Prenotazioni/Finanze/Scuola/Scadenze/PPR/Impostazioni filtrate con `hasPermission`; per un multi-ruolo si vede l'unione) — skill `minimalist-ui`, stringhe nei cataloghi IT/EN
- [ ] Task 4: Test (AC: 3)
  - [ ] Unit sulla matrice: admin ha tutto; staff non ha `users.manage` né `settings.manage`(solo admin); pilota ha `self.read`+`bookings.manage.own` ma non `people.read`; unione pilota+istruttore; `authorize` lancia `ForbiddenError`
  - [ ] e2e: `GET /api/v1/me` con sessione → 200 con i propri dati; dashboard mostra voci diverse per admin vs (se seedato) utente pilota di test

## Dev Notes

- **AD-5 vincolante**: la sicurezza sta nel service layer — ogni futuro service riceverà `Actor` e chiamerà `authorize()`. La UI usa `hasPermission` SOLO per nascondere la navigazione.
- La mappa permessi iniziale copre gli epic futuri: tienila piatta e semplice, niente framework RBAC esterni, niente permessi su risorsa (il filtro "own" si implementa nei service con `actor.personId`).
- Seed: aggiungi al seed un utente di test `pilot@airmanager.local` (ruolo PILOT, password da `SEED_ADMIN_PASSWORD`) con Person collegata — serve per i test della matrice e per gli e2e; idempotente.
- Pattern esistenti da seguire: `getSessionActor()` in `src/server/auth/session.ts` (estendi se serve per esporre `Actor`), envelope AD-8 già usato nel proxy, struttura route `src/app/api/v1/health` come riferimento.
- **Gate**: lint, typecheck, test, build, test:e2e verdi.

### Project Structure Notes

- Nuovi file: `src/server/services/errors.ts`, `src/server/auth/rbac.ts`, `src/server/services/me.service.ts`, `src/app/api/v1/me/route.ts`; dashboard aggiornata in `src/app/[locale]/dashboard/`.
- Non toccare `_bmad/`, `.claude/`, `docs/`; in `_bmad-output/` solo questo file e `sprint-status.yaml`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#4.1] — perimetri dei ruoli
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, Consistency Conventions]
- [Source: _bmad-output/implementation-artifacts/1-2-login.md#Dev Agent Record] — pattern auth/session esistenti

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
