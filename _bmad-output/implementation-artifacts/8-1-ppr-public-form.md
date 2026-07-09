---
baseline_commit: 355547b
---

# Story 8.1: Form PPR pubblico con email di ricevuta

Status: ready-for-dev

## Story

As a pilota esterno,
I want chiedere il permesso di atterraggio online,
so that non debba telefonare e abbia una conferma scritta (FR-22).

## Acceptance Criteria

1. **Given** la pagina pubblica `/[locale]/ppr` (design curato — skill design-taste-frontend, IT/EN), **When** invio il form (nome, email, telefono, marche, tipo aeromobile, provenienza, destinazione, ETA, ETD opzionale, persone a bordo, note), **Then** la richiesta nasce in stato `in attesa`, vedo una pagina di conferma e ricevo una email di ricevuta nella lingua del form.
2. **Given** il campo honeypot compilato o più di N invii dallo stesso IP in un'ora, **When** invio, **Then** la richiesta è respinta silenziosamente (honeypot) o con 429 (rate limit) — nessun CAPTCHA di terze parti.

## Contesto e decisioni di design (vincolanti)

- **Prima superficie pubblica oltre auth**: la pagina `/[locale]/ppr` e la POST API sono NON autenticate. Il gate vive in `src/proxy.ts` (Next 16 single-proxy): aggiungere `'/ppr'` a `PUBLIC_WEB_PATHS` (riga ~11 — il commento del file annuncia ESATTAMENTE questa aggiunta) e `'/api/v1/ppr-requests'` a `PUBLIC_API_PATHS` (riga ~31). Il matcher esistente copre già tutto; NESSUN'altra modifica al proxy.
- **Modello `PprRequest`** (ERD spine; NON esiste ancora): `id cuid`, `status PprStatus @default(PENDING)`, `firstName`/`lastName` (PRD "nome e cognome" — due campi come `Person`), `email`, `phone`, `aircraftRegistration` (marche), `aircraftType`, `origin`, `destination`, `eta DateTime`, `etd DateTime?`, `personsOnBoard Int`, `notes String?`, `locale String` (convenzione `User.locale`: `'it' | 'en'` — serve alle email di ESITO di 8.2, va persistita ORA), `submitterIp String?` (anti-abuso, doc-comment GDPR/NFR-3: dato tecnico per rate limiting, nessun altro uso), `createdAt`, `updatedAt`. **Enum `PprStatus` COMPLETO fin d'ora**: `PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED` (stati del glossario PRD; evita migrazioni-enum ripetute in 8.2/8.3 — doc-comment che 8.1 usa solo PENDING). Migrazione `add_ppr_requests` + indice su `(submitterIp, createdAt)` per la query di rate limit. NIENTE FK verso `CashMovement` qui (arriva in 8.3 sul lato CashMovement, come da ERD).
- **Endpoint pubblico**: `POST /api/v1/ppr-requests` via `apiRoute({ auth: 'public', bodySchema, successStatus: 201 })`. **VIETATO** usare l'opzione `idempotency` (il costruttore di `handler.ts` la BLOCCA per le route pubbliche — richiede userId): anti-abuso = honeypot + rate limit, punto. Service NUOVO `src/server/services/ppr.service.ts#createPprRequest(input, meta: { ip: string | null })` — non riceve Actor (pubblico per contratto; doc-comment che spiega la deroga ad AD-5).
- **Risposta 201 deliberatamente minimale: `{ status: 'PENDING' }`** — NIENTE id, niente echo dei dati (il richiedente non ne fa nulla: l'esito arriva via email in 8.2; non si regala un identificatore enumerabile a un endpoint pubblico). La pagina di conferma è lato client.
- **Honeypot (AC 2)**: campo `website` nel body schema (`z.string().max(200).optional()` — nome innocuo; sì, comparirà nell'OpenAPI: tradeoff accettato e dichiarato, i bot compilano l'HTML non la spec). Nel service, PRIMA di ogni altra cosa: se `website` è non-vuoto → return del MEDESIMO body di successo `{ status: 'PENDING' }` SENZA riga in DB, SENZA email, SENZA contare ai fini del rate limit ("respinta silenziosamente" = indistinguibile dal successo per il bot). Nel form il campo è visivamente nascosto (posizionamento off-screen via CSS, `aria-hidden`, `tabIndex={-1}`, `autoComplete="off"` — MAI `display:none` puro, alcuni bot lo saltano) e senza label leggibile da screen reader.
- **Rate limit applicativo (AC 2, deferred spine "basta il rate limit applicativo sul form PPR")**: DB-backed, ZERO infrastruttura nuova — `count` delle `PprRequest` con lo stesso `submitterIp` e `createdAt > now − 1h`; se `>= PPR_RATE_LIMIT_MAX` (costante del service, **5**, doc-comment) → **NUOVO `RateLimitError` in `errors.ts`** (`code: 'RATE_LIMITED'`) mappato **429** con un nuovo branch in `statusForDomainError` (`handler.ts`) + `ERROR_DESCRIPTIONS[429]`/supporto in `errorResponses` nel registry. IP = primo valore di `x-forwarded-for` (trim, split su virgola), fallback `null` (nessun header → niente rate limit ma logga; doc-comment: in produzione il reverse proxy imposta l'header, in dev/e2e lo imposta il client — assunzione di trust dichiarata). Le righe honeypot non esistono → non contano; le richieste 429 NON creano righe → non estendono la finestra.
- **Ordine nel service** (stesso rigore di 7.4): honeypot → rate limit (429) → validazioni dominio → create → email best-effort. Validazioni dominio con codici stabili AD-8: `eta` nel passato → 422 `ETA_IN_PAST`; `etd` presente e `<= eta` → 422 `ETD_NOT_AFTER_ETA`. **Confronti su ISTANTI (Date), MAI su stringhe ISO** (lezione N1 7.1). Wire format: ISO 8601 UTC (AD-8), stesso pattern schema di `bookings.ts` 7.1.
- **Email di ricevuta (AC 1)**: nuovo builder `buildPprReceiptEmail(locale, params)` in `src/server/adapters/mail/templates.ts` col pattern ESISTENTE `createTranslator({ locale, messages, namespace: 'Emails.pprReceipt' })`; subject con le marche; body con riepilogo (nome, marche/tipo, provenienza→destinazione, ETA — formattata **data+ora Europe/Rome** via `Intl.DateTimeFormat` con `timeZone: APP_TIMEZONE`, NON il formatter date-only UTC esistente — persone a bordo) + promemoria "riceverai una email di esito". Invio **best-effort col pattern di `accounts.service.ts#sendNegativeBalanceAlert`**: try/catch che logga e NON fallisce la richiesta (la riga è già creata). La lingua è `input.locale` (la lingua del FORM, NFR-1), non una lookup utente. **NIENTE coda/retry email (NFR-7)**: non esiste nel codebase, resta deferral dichiarato di progetto — non costruirla qui.
- **Pagina pubblica `/[locale]/ppr`**: `src/app/[locale]/ppr/{page.tsx,ppr-form.tsx}` — **FUORI dal route group `(auth)`**. `page.tsx` server: `setRequestLocale`, `getTranslations('PprPage')`, labels al client come in `set-password/page.tsx`; **`generateMetadata` di pagina** (titolo/description localizzati `PprPage.metadata.*` — primo caso di metadata per-pagina, pattern nuovo dichiarato: è la prima pagina pubblica indicizzabile). `ppr-form.tsx` client: react-hook-form + zodResolver sullo schema condiviso, `fetch('/api/v1/ppr-requests')` diretto (NON esiste api-client), ETA/ETD con `<input type="datetime-local">` → conversione a UTC ISO col pattern di `new-booking-form.tsx` (7.1), `locale` nel body = locale della pagina. Successo → swap alla vista di conferma in-page (`role="status"`, promemoria email di esito, questa È la "pagina di conferma" dell'AC); 422/429/500 → alert inline `role="alert"` coi pattern colore esistenti. **Switcher IT/EN** sulla pagina (Link di `src/i18n/navigation.ts` alla stessa route nell'altra locale — NFR-1 "lingua per richiedente PPR").
- **Design (regola utente, PIENAMENTE in scope: è una landing pubblica, non una vista dashboard)**: skill `design-taste-frontend` E `ui-ux-pro-max` OBBLIGATORIE; stile editoriale `minimalist-ui` esistente (Geist + serif display `--font-serif`, monocromi caldi `#fbfbfa/#2f3437/#787774/#EAEAEA`, bottoni `bg-[#111111]`, kicker uppercase, zero gradienti/ombre); la pagina deve reggere come biglietto da visita dell'aviosuperficie (hero sobrio con nome/claim, form curato, footer minimale) restando coerente con l'app. Accessibilità WCAG base (label esplicite, focus visibile, tastiera). Verifica interattiva Playwright MCP (desktop E mobile 375×812) PRIMA degli e2e.
- **Schemi + OpenAPI**: `src/lib/schemas/ppr.ts` (import da `./zod-with-openapi`, regola ESLint): `createPprRequestSchema` (campi con `trim`/`min`/`max` — nome/marche/tipo/località `max` ragionevoli, `email` `z.email()`, `phone` `max(30)`, `personsOnBoard` `int().min(1).max(99)`, `notes` `max(1000)`, `eta`/`etd` datetime ISO come bookings, `locale z.enum(['it','en'])`, `website` honeypot) + `pprRequestCreatedResponseSchema = z.object({ status: z.literal('PENDING') })`. Registry: componenti `CreatePprRequestRequest`/`PprRequestCreatedResponse`, `registerPath` POST `/ppr-requests` con `security: []` (pubblico), responses 201 + `errorResponses(422, 429)`. `registry.test.ts` aggiornato.
- **RBAC: NESSUNA modifica in 8.1.** Il form pubblico non ha permessi; `ppr.manage` e la voce nav `/ppr-queue` (oggi proxy su `bookings.manage.any`, TODO già annotato in `nav-items.ts`) arrivano con la coda staff in 8.2. Non anticipare nulla.

## Tasks / Subtasks

- [x] Task 1: Modello + migrazione (AC 1)
  - [x] `prisma/schema.prisma`: enum `PprStatus` completo + modello `PprRequest` coi campi/doc-comment del Contesto + indice `(submitterIp, createdAt)`; migrazione `add_ppr_requests`; `npx prisma migrate deploy` + `generate`.
- [x] Task 2: Errori + service (AC 1, 2)
  - [x] `errors.ts`: `RateLimitError` (`code 'RATE_LIMITED'`); `handler.ts`: branch 429 in `statusForDomainError`; registry: `ERROR_DESCRIPTIONS[429]` + `errorResponses` esteso.
  - [x] `ppr.service.ts#createPprRequest`: ordine honeypot → rate limit → `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` (istanti) → create (con `submitterIp`, `locale`) → email best-effort; costante `PPR_RATE_LIMIT_MAX = 5`; helper estrazione IP da `x-forwarded-for`.
- [x] Task 3: Schemi + API + OpenAPI (AC 1, 2)
  - [x] `schemas/ppr.ts` + registrazione registry (POST `/ppr-requests`, `security: []`, 201/422/429) + `registry.test.ts`.
  - [x] Route `src/app/api/v1/ppr-requests/route.ts` con `apiRoute({ auth: 'public', ... })`; `proxy.ts`: `PUBLIC_WEB_PATHS` + `'/ppr'`, `PUBLIC_API_PATHS` + `'/api/v1/ppr-requests'`.
- [x] Task 4: Email di ricevuta (AC 1)
  - [x] `templates.ts#buildPprReceiptEmail` (ETA Europe/Rome data+ora); invio best-effort nel service; namespace `Emails.pprReceipt` in `messages/{it,en}.json`.
- [x] Task 5: Pagina pubblica (AC 1, 2) — skill obbligatorie, vedi Contesto/Dev Notes
  - [x] `src/app/[locale]/ppr/page.tsx` (server, labels, `generateMetadata`) + `ppr-form.tsx` (client: rhf+zodResolver, datetime-local→UTC, honeypot nascosto, vista conferma, alert 422/429, switcher locale); i18n `PprPage.*` simmetrica IT/EN.
  - [x] Verifica interattiva Playwright MCP: happy path IT e EN (email in Mailpit nella lingua giusta), honeypot via JS, 429, mobile 375×812, tastiera/focus.
- [x] Task 6: Test (AC 1, 2)
  - [x] Unit `ppr.service.test.ts` (mock Prisma pattern `cash.service.test.ts` + mock `getMailSender`): happy path (riga creata con locale/IP, email inviata con locale del form); honeypot → successo finto senza create/email/count; rate limit boundary (5ª passa, 6ª → `RateLimitError` 429) e finestra (righe più vecchie di 1h non contano); IP `null` → niente rate limit; `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` (inclusi boundary `etd === eta` → 422); fallimento `send` → la richiesta riesce comunque; ordine honeypot-prima-del-rate-limit.
  - [x] Unit schema/registry: honeypot opzionale, locale enum, 429 nel path OpenAPI.
  - [x] e2e NUOVO `e2e/ppr-public.spec.ts` (run-unique; **ogni test usa un IP finto run-unique via `x-forwarded-for`** — `test.use({ extraHTTPHeaders })` o context dedicato: il rate limit è per-IP e il DB dev non si resetta, IP unici = zero cross-talk tra test e tra run): form IT completo da NON autenticato → vista conferma + email Mailpit con subject IT (helper `waitForMailpitMessage` copiato dal pattern esistente); form EN → email EN; honeypot compilato via JS → conferma mostrata MA nessuna email per quel destinatario (attesa negativa breve); 6 POST API dirette stesso IP finto → la 6ª risponde 429 envelope `RATE_LIMITED`; POST con ETA passata → 422 `ETA_IN_PAST`.
- [x] Task 7: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `8-1-ppr-public-form: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: SOLO form pubblico + ricevuta. NIENTE coda staff/approvazione/numero PPR (8.2), NIENTE tassa/cassa (8.3), NIENTE `ppr.manage`/nav (8.2), NIENTE coda retry email (deferral NFR-7), NIENTE lettura pubblica delle richieste.
- **AD-1**: la UI consuma la stessa API pubblica. **AD-7**: ogni stringa via next-intl, email nella lingua del form. **AD-8**: codici stabili `ETA_IN_PAST`, `ETD_NOT_AFTER_ETA`, `RATE_LIMITED`; envelope errori standard; ISO UTC sul wire.
- **`apiRoute` pubblica**: precedente `auth/set-password/route.ts` (`auth: 'public'`); l'`actor` arriva `null` e NON va usato.
- **Categoria cassa "PPR"**: già nel seed (3.4) — NON toccarla, serve solo in 8.3.
- **e2e**: NIENTE login nei test del form (è il punto della story); helper Mailpit inline come da convenzione (nessun modulo condiviso e2e); attesa NEGATIVA honeypot corta (~3s) per non gonfiare la suite; il dev NON può resettare il DB; PRIMA del run di gate: `curl localhost:3000` DEVE fallire (altrimenti `fuser -k 3000/tcp`).
- **Lezioni review da rispettare**: confronti su istanti (N1 7.1); bound sugli input stringa (`.max()` ovunque); i18n simmetrica contata; nessun `console.log` residuo; run-unique visibile in ogni assert e2e.
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query utili: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "public landing form conversion trust"`, `"form validation error state accessibility"`); coerenza `minimalist-ui`; Playwright MCP interattivo prima degli e2e.
- **Ambiente**: Mailpit :8025/:1025 attivo; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`.
- **Gate**: lint 0 errori (warning benigno noto), typecheck, `npx vitest run` (≥ 927 + nuovi), build, `npx playwright test` (baseline 129 + nuovi; classi flaky baseline note — vedi handoff — da NON confondere con regressioni: fuori dal diff = baseline).
- Un commit di implementazione (`Story 8.1: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-documentation-yjqssv`) prima del commit.

### Project Structure Notes

- Nuovi: `prisma/migrations/*_add_ppr_requests/`, `src/server/services/ppr.service.ts`(+test), `src/lib/schemas/ppr.ts`, `src/app/api/v1/ppr-requests/route.ts`, `src/app/[locale]/ppr/{page.tsx,ppr-form.tsx}`, `e2e/ppr-public.spec.ts`.
- Modificati: `prisma/schema.prisma`, `src/proxy.ts`, `src/server/services/errors.ts`, `src/lib/api/handler.ts`, `src/lib/schemas/registry.ts`(+test), `src/server/adapters/mail/templates.ts`, `messages/{it,en}.json`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.1]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-22, UJ-3, NFR-1/-3/-7/-8, §380 assumption honeypot+rate-limit]
- [Source: _bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md#AD-1/5/7/8, ERD PprRequest, Deferred rate-limiting]
- [Source: src/proxy.ts#PUBLIC_WEB_PATHS/PUBLIC_API_PATHS] — punti esatti di estensione
- [Source: src/lib/api/handler.ts#ApiRouteConfig] — `auth: 'public'`, guard anti-idempotency pubblica, mappa errori
- [Source: src/server/adapters/mail/templates.ts#createTranslator] — pattern email localizzate
- [Source: src/server/services/accounts.service.ts#sendNegativeBalanceAlert] — invio best-effort
- [Source: src/app/[locale]/(auth)/set-password/*] — pattern pagina pubblica + form client
- [Source: src/app/[locale]/dashboard/bookings/new-booking-form.tsx] — datetime-local→UTC ISO
- [Source: e2e/user-management.spec.ts#waitForMailpitMessage] — helper Mailpit
- [Source: _bmad-output/implementation-artifacts/7-4-booking-expiry-block.md#Review Record] — lezioni correnti

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
