# Story 1.2: Login con email e password

Status: ready-for-dev

## Story

As a utente registrato,
I want autenticarmi con email e password e uscire con logout,
so that acceda solo io ai miei dati (FR-1).

## Acceptance Criteria

1. **Given** un utente attivo seedato (admin demo) con password nota, **When** invio credenziali corrette dalla pagina di login localizzata, **Then** ottengo una sessione JWT (Auth.js v5, password hash Argon2id) e vengo rediretto alla dashboard, **And** il logout invalida la sessione e riporta al login.
2. **Given** credenziali errate o utente inesistente, **When** tento il login, **Then** vedo un errore generico localizzato che non rivela se l'email esiste.
3. **Given** una route web protetta o un endpoint `/api/v1/*` protetto, **When** li richiedo senza sessione, **Then** la web reindirizza al login e l'API risponde 401 con envelope `{"error":{"code":"UNAUTHENTICATED","message":...}}`.

## Tasks / Subtasks

- [ ] Task 1: Modelli Prisma minimi per l'auth (AC: 1)
  - [ ] `Person` minimale (id cuid, firstName, lastName, email unique opzionale, createdAt/updatedAt) — AD-11: anagrafica unica; la story 2.1 la estenderà
  - [ ] `User` (id, email unique, passwordHash, isActive default true, roles Role[], personId unique FK opzionale verso Person) + enum `Role { ADMIN, STAFF, INSTRUCTOR, PILOT, STUDENT }`
  - [ ] Migrazione + `prisma/seed.ts`: admin demo (email `admin@airmanager.local`, password da env `SEED_ADMIN_PASSWORD`, default dev nota nel README) con Person collegata
- [ ] Task 2: Auth.js v5 (AC: 1, 2)
  - [ ] next-auth `5.0.0-beta.31` (esatta) + `@auth/prisma-adapter`; Credentials provider con verifica Argon2id (`@node-rs/argon2`); strategia sessione JWT (obbligatoria con Credentials)
  - [ ] `src/server/auth/auth.ts` esporta `auth`, `signIn`, `signOut`, handlers; route `src/app/api/auth/[...nextauth]/route.ts`
  - [ ] Nel JWT: userId, roles, personId; helper `getSessionActor()` in `src/server/auth/` che le stories future useranno
- [ ] Task 3: UI login/logout (AC: 1, 2)
  - [ ] Pagina `src/app/[locale]/(auth)/login/page.tsx` localizzata IT/EN (skill `minimalist-ui`), form email+password con errori generici localizzati
  - [ ] Dashboard placeholder protetta `src/app/[locale]/(dashboard)/page.tsx` che mostra nome utente e pulsante logout; dopo login redirect lì
- [ ] Task 4: Protezione route (AC: 3)
  - [ ] **Comporre dentro `src/proxy.ts`** (Next 16 ammette UN solo file proxy — nota vincolante dalla review 1.1): next-intl `createMiddleware` + controllo sessione Auth.js; web non autenticata → redirect a `/{locale}/login`; `/api/v1/*` non autenticata → 401 JSON con envelope AD-8 (scrivi l'envelope a mano, l'helper completo arriva in 1.5)
  - [ ] `/api/v1/health` (esistente o creala) resta pubblica; pagina di benvenuto `/` e `/login` pubbliche
- [ ] Task 5: Test (AC: tutti)
  - [ ] Unit: verifica hash Argon2id round-trip; authorize() del provider (utente inattivo/inesistente/password errata → null)
  - [ ] e2e Playwright: login ok → dashboard; login errato → errore generico; route protetta senza sessione → redirect login; `/api/v1/*` senza sessione → 401 envelope; logout → di nuovo login

## Dev Notes

- **Versioni**: next-auth `5.0.0-beta.31` (dist-tag beta, verificato su npm 2026-07-04), `@auth/prisma-adapter` 2.11.x, `@node-rs/argon2` ultima stabile. Per l'API Auth.js v5 con Next App Router consulta la doc ufficiale via WebFetch su raw.githubusercontent.com (`nextauthjs/next-auth` → `docs/`), NON conoscenza pregressa: la v5 differisce molto dalla v4.
- **Attenzione Prisma 7**: il progetto usa driver adapter (`@prisma/adapter-pg`) e client generato in `src/generated/` — vedi `prisma.config.ts` e `src/server/db/prisma.ts` esistenti. L'adapter Prisma di Auth.js si usa SOLO per i modelli richiesti se servono; con Credentials+JWT l'adapter può anche essere omesso — valuta e documenta la scelta nel Dev Agent Record (meno tabelle inutili = meglio; niente tabelle Account/Session OAuth se non necessarie).
- **AD-5**: la mappa ruoli/permessi completa arriva in 1.3 — qui SOLO autenticazione; non anticipare authorize()/rbac.ts.
- **AD-8**: envelope errore esatto `{"error":{"code":"UNAUTHENTICATED","message":"..."}}` per le API.
- **i18n**: tutte le stringhe (login, errori, dashboard placeholder) nei cataloghi `messages/{it,en}.json`; il redirect al login deve preservare il locale corrente.
- **Env**: aggiungi `AUTH_SECRET` (e `SEED_ADMIN_PASSWORD`) a `src/lib/env.ts` e `.env.example`.
- **Playwright**: Chromium preinstallato (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), NON eseguire `playwright install`. Postgres locale già attivo (service postgresql); DB da migrare/seedare prima degli e2e.
- **Gate**: lint, typecheck, test, build, test:e2e tutti verdi prima di dichiarare done.

### Project Structure Notes

- Nuovi file in `src/server/auth/`, `src/app/[locale]/(auth)/login/`, `src/app/[locale]/(dashboard)/`, `src/app/api/auth/[...nextauth]/`.
- Non toccare `_bmad/`, `_bmad-output/` (tranne questo story file), `.claude/`, `docs/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, #AD-10, #AD-11]
- [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold.md#Review Record] — vincolo proxy unico Next 16
- [Source: CLAUDE.md#Convenzioni]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
