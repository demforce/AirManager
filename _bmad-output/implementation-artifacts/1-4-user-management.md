# Story 1.4: Gestione utenti con invito e reset password

Status: ready-for-dev

## Story

As a admin,
I want creare, disattivare e modificare utenti con inviti e reset via email,
so that controlli chi accede al sistema (FR-3).

## Acceptance Criteria

1. **Given** l'elenco utenti (solo admin, permesso `users.manage`), **When** creo un utente scegliendo ruoli, email, lingua e Persona collegata (opzionale), **Then** parte una email di invito (visibile in Mailpit, nella lingua scelta) con link a token monouso a scadenza per impostare la password, **And** finché non la imposta l'utente non può accedere.
2. **Given** un utente disattivato, **When** tenta il login o usa una sessione esistente, **Then** il login è rifiutato e la sessione decade entro 15 minuti (ricontrollo `isActive` lato JWT).
3. **Given** la pagina "password dimenticata", **When** inserisco una email, **Then** ricevo (se l'account esiste ed è attivo) una email di reset con token monouso, senza che la UI riveli l'esistenza dell'account.

## Tasks / Subtasks

- [ ] Task 1: Adapter email (AC: 1, 3)
  - [ ] `src/server/adapters/mail/`: interfaccia `MailSender` (`send({to, subject, text, html?})`) + implementazione SMTP via `nodemailer` verso Mailpit (host/port da env `SMTP_HOST`/`SMTP_PORT`, default localhost:1025); factory che le stories future riuseranno (AD Deferred: provider prod dietro la stessa interfaccia)
  - [ ] Template email invito e reset in IT e EN (testo semplice va bene; oggetto+corpo dai cataloghi o file dedicati — nessuna stringa hardcoded)
- [ ] Task 2: Modelli e token (AC: 1, 3)
  - [ ] Prisma: `User.locale` (enum o string 'it'|'en', default 'it'); modello `AuthToken { id, tokenHash unique, type INVITE|PASSWORD_RESET, userId FK, expiresAt, usedAt? , createdAt }`; migrazione
  - [ ] Token: valore random ≥32 byte, salvato SOLO come hash (sha256); scadenza invito 7 giorni, reset 2 ore; monouso (usedAt)
  - [ ] `User.passwordHash` diventa nullable: l'utente invitato non ha password finché non la imposta; `authorize()` rifiuta utenti senza password (con dummy-verify per il timing, come il fix 1.2)
- [ ] Task 3: Service + API utenti (AC: 1, 2)
  - [ ] `src/server/services/users.service.ts` con `authorize(actor,'users.manage')`: list (paginata), create (invia invito), update (ruoli, lingua, persona, isActive), resendInvite; niente delete fisico
  - [ ] Route API `/api/v1/users` (GET, POST) e `/api/v1/users/[id]` (GET, PATCH) sottili con envelope AD-8
  - [ ] Service `auth-tokens.service.ts`: `setPasswordWithToken(token, newPassword)` e `requestPasswordReset(email)` (silenzioso se email inesistente/inattiva)
- [ ] Task 4: Ricontrollo isActive nel JWT (AC: 2)
  - [ ] Nel callback `jwt`: ogni ≥15 minuti (timestamp `lastActiveCheck` nel token) rileggi `isActive` dal DB (solo runtime node — non nel proxy edge); se inattivo il token viene invalidato e la richiesta successiva finisce al login
  - [ ] Test unit sul comportamento (mock del tempo)
- [ ] Task 5: UI (AC: 1, 2, 3)
  - [ ] `/{locale}/dashboard/users`: tabella utenti (email, ruoli, stato, persona, lingua) + form crea/modifica + disattiva/riattiva + reinvia invito — solo `users.manage`, skill `minimalist-ui`, TanStack Table NON necessaria (tabella semplice per ora)
  - [ ] Pagine pubbliche `/{locale}/set-password?token=...` (imposta password: min 10 char; poi redirect login) e `/{locale}/forgot-password` (sempre messaggio neutro di conferma) — aggiungile a `PUBLIC_WEB_PATHS` nel proxy
- [ ] Task 6: Test (AC: tutti)
  - [ ] Unit: token hash/scadenza/monouso; create user → invito; requestPasswordReset silenzioso su email ignota; authorize rifiuta passwordHash null; ricontrollo isActive
  - [ ] e2e: admin crea utente → email in Mailpit (API http://localhost:8025/api/v1/messages) → set-password col token → login col nuovo utente; utente disattivato → login rifiutato; forgot-password → email reset → nuova password funziona; pilota su /dashboard/users → 403/redirect

## Dev Notes

- **Mailpit**: gira in locale (docker-compose in prod dev; in questo sandbox avvia il binario o usa il container se già attivo — se Mailpit non è disponibile, installa/avvia `axllent/mailpit` da binario GitHub releases, oppure in extremis un fake SMTP nodemailer JSON transport per i test unit e verifica e2e via API Mailpit solo se raggiungibile; documenta cosa hai fatto). SMTP: localhost:1025, UI/API: localhost:8025.
- **Sicurezza**: mai salvare token in chiaro; risposta di forgot-password identica per email esistente/inesistente (timing: esegui comunque lavoro equivalente); i link email usano `APP_URL` da env (aggiungi a env.ts/.env.example, default http://localhost:3000).
- **AD-5**: tutta l'autorizzazione nei service; le route restano sottili.
- **Pattern esistenti**: rbac/authorize (1.3), envelope AD-8 locale (route `me`), dummy-hash timing (authorize.ts, fix 1.2 — estendilo al caso passwordHash null), seed idempotente.
- **Non fare**: OpenAPI registry (1.5), gestione Persone completa (2.x — qui solo select di Person esistenti per il collegamento).
- **Gate**: lint, typecheck, test, build, test:e2e verdi.

### Project Structure Notes

- Nuovi: `src/server/adapters/mail/*`, `src/server/services/users.service.ts`, `src/server/services/auth-tokens.service.ts`, route `/api/v1/users*`, pagine `dashboard/users`, `set-password`, `forgot-password`; migrazione Prisma.
- Aggiornati: `prisma/schema.prisma`, `src/server/auth/{auth.config,authorize}.ts`, `src/proxy.ts` (public paths), `messages/{it,en}.json`, `src/lib/env.ts`, `.env.example`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, Deferred (MailSender)]
- [Source: _bmad-output/implementation-artifacts/1-3-rbac.md#Review Record] — pattern e vincoli correnti
- [Source: _bmad-output/implementation-artifacts/1-2-login.md#Review Record] — timing dummy-hash da preservare

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
