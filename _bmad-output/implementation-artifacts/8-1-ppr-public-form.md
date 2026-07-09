---
baseline_commit: 355547b
---

# Story 8.1: Form PPR pubblico con email di ricevuta

Status: done

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

Sonnet 5 (single dev subagent, extra-high effort, via `bmad-dev-story`).

### Debug Log References

- **Interactive Playwright MCP verification, before the automated e2e run** (mandatory UI-skill instruction): drove the real dev server unauthenticated. Desktop (1280×900): filled and submitted the IT form end-to-end -> `role="status"` confirmation view, `PprRequest` row confirmed in psql (`status='PENDING'`, `locale='it'`, `submitterIp` = the real connection IP), Mailpit receipt with subject `Richiesta PPR ricevuta: I-XYZW` and ETA correctly presented in Europe/Rome (`01/08/2026, 12:00` for a 10:00 UTC input in August = CEST +2h), body plural "2 persone a bordo" correct. Same flow on `/en/ppr` -> Mailpit subject `PPR request received: G-ABCD`, singular "1 person on board" correct (ICU plural `one` branch). Honeypot: filled every visible field, then set the hidden `website` input via the native `HTMLInputElement.prototype.value` setter + a dispatched `input` event (bypassing React's own value tracker, the standard technique for a programmatic value change to be observed by a controlled/RHF-registered input) and submitted -> confirmation view shown (byte-identical to success), Mailpit search for that address returned 0 messages, DB row count unchanged. Verified via `document.querySelectorAll(...).tabIndex` that only the honeypot has `tabIndex={-1}` (excluded from the Tab order) and that the actual DOM node has `aria-hidden="true"` on its wrapper (confirmed the real rendered attributes, not just the JSX). Direct `curl`: 6 sequential POSTs with the same fake `x-forwarded-for` -> 1st-5th `201`, 6th `429 {"error":{"code":"RATE_LIMITED", ...}}`; psql confirmed exactly 5 rows for that IP (the 429 did not create a 6th). `ETA_IN_PAST` and `ETD_NOT_AFTER_ETA` (boundary `etd === eta`) both reproduced via direct `curl`. Mobile 375×812 screenshot: single-column, no horizontal overflow, header row (kicker + locale switch) stays on one line. Keyboard: Tab order reaches "Nome" first (after the locale-switch link) with a visible focus ring; empty-submit shows all nine "Campo obbligatorio." inline errors, red on white, matching the app's existing error palette.
- **e2e honeypot test bug found and fixed during this session**: the first draft of `ppr-public.spec.ts`'s honeypot test set `el.value = '...'` directly inside `page.evaluate` before dispatching `input` — this goes through React's own tracked value setter (installed on the DOM node to detect out-of-band changes), which keeps React's internal tracker in sync and makes the subsequent `input` event look like a no-op to react-hook-form, so the honeypot value never reached the submitted body and the "negative" assertion (no email) failed loudly (an email WAS sent). Fixed by using the native prototype setter (`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set`) before dispatching the event — the same technique already verified working in the interactive MCP pass above. Left a inline comment explaining the trick so a future editor does not "simplify" it back into the broken form.
- Migration `20260709130000_add_ppr_requests` generated via `prisma migrate dev --create-only` (renamed to the project's fixed-hour-timestamp convention) then applied with `migrate deploy`; verified column-for-column against the Contesto via `psql \d "PprRequest"`.

### Completion Notes List

- **Model + migration (Task 1)**: `PprStatus` enum declared COMPLETE now (`PENDING/APPROVED/REJECTED/COMPLETED/CANCELLED`, doc-commented that only `PENDING` is used until 8.2/8.3) to avoid a repeated enum-alter migration; `PprRequest` has no `actorUserId`/`Actor` FK at all (first such model) and no FK to `CashMovement` (arrives 8.3). Index `(submitterIp, createdAt)` backs the rate-limit count query.
- **Service (Task 2)**: `ppr.service.ts#createPprRequest` takes `(input, meta: { ip })`, no `Actor` — doc-commented as a deliberate, narrow AD-5 deroga (no session to authorize against). Order exactly as prescribed: honeypot (return the identical `{status:'PENDING'}` with zero side effects) -> rate limit (count `submitterIp` rows with `createdAt` in the last hour, `>=5` throws `RateLimitError`) -> `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` (instant comparisons, `Date.getTime()`, never string comparisons — N1 lesson) -> create -> best-effort email (try/catch, `console.error`, never rethrows). `extractSubmitterIp` takes the first CSV value of `x-forwarded-for`, trimmed; `null` (no header, or header present-but-empty) skips the rate-limit query entirely rather than blocking or exempting silently — logged with `console.warn` for the empty-but-present case.
- **Errors/handler/registry (Task 2/3)**: new `RateLimitError` (`code: 'RATE_LIMITED'`) in `errors.ts`; `statusForDomainError` gets a `429` branch in `handler.ts`; `registry.ts`'s `errorResponses` helper's status union now includes `429`, `ERROR_DESCRIPTIONS[429]` added. `POST /api/v1/ppr-requests` registered with `security: []` (explicit empty array, per Contesto — the codebase's OTHER public routes, e.g. `auth/set-password`, simply omit the `security` key since there is no global default requiring it either way; both render identically in the generated document, `security: []` was used here because the story asked for it explicitly).
- **Schemas (Task 3)**: `src/lib/schemas/ppr.ts` — `createPprRequestSchema` (every free-text field `trim()` + `.max()`; `email` via the `z.string().trim().toLowerCase().pipe(z.email())` pattern from `auth-tokens.ts`; `eta`/`etd` as `z.iso.datetime()`, deliberately NO cross-field refine at the schema level — `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` are service-level stable codes, same reasoning as `createBookingSchema`'s "startsAt in the past" living service-side) and `pprRequestCreatedResponseSchema = { status: z.literal('PENDING') }`.
- **Route + proxy (Task 3)**: `POST /api/v1/ppr-requests` via `apiRoute({ auth: 'public', successStatus: 201, ... })` — no `idempotency` option (would throw at module load for a public route per `handler.ts`'s own guard; not needed anyway, anti-abuse is honeypot+rate-limit). `src/proxy.ts`: `'/ppr'` added to `PUBLIC_WEB_PATHS`, `'/api/v1/ppr-requests'` added to `PUBLIC_API_PATHS` — no other proxy change (the existing matcher already covers both).
- **Email (Task 4)**: `buildPprReceiptEmail` in `templates.ts` reuses `formatDateTime(date, locale)` from `src/lib/time.ts` (Europe/Rome, date+time — explicitly NOT the date-only UTC `formatExpiryDate` helper in the same file) rather than hand-rolling a new formatter; `locale` is `input.locale` (the form's own language), never a `User`/`Person` lookup (there usually is none — the submitter is a stranger to the anagrafica).
- **Page/form (Task 5)**: `src/app/[locale]/ppr/{page.tsx,ppr-form.tsx}` — `page.tsx` is the FIRST page in the codebase with its own `generateMetadata` (doc-commented as a new, deliberate pattern: the first public, potentially-indexed page). `ppr-form.tsx`: react-hook-form + a dedicated client-side Zod schema (plain strings, `superRefine` producing `requiredField`/`invalidEmail`/`invalidRange`/`invalidPersons` message codes, same pattern as `new-booking-form.tsx`'s `buildFormSchema`) — NOT the server schema directly (datetime-local strings and a `personsOnBoard` text input need different shapes client-side). datetime-local -> UTC ISO via `new Date(value).toISOString()`. Honeypot: off-screen via inline `style` (not a Tailwind utility, so it can never be dropped by a class-purge/ordering change), `aria-hidden="true"`, `tabIndex={-1}`, `autoComplete="off"`, no `<label>`. IT/EN switcher via `Link` from `@/i18n/navigation`, same pattern as `HomePage`. Visual language: kept strictly within the existing `minimalist-ui` system already established by `HomePage`/`SetPasswordPage` (Geist + serif display, warm monochrome `#fbfbfa/#2f3437/#787774/#EAEAEA`, `bg-[#111111]` buttons, uppercase kicker pill, zero gradients/shadows) — this is a "redesign-preserve" extension of an established system, not a greenfield landing page, so `design-taste-frontend`'s generic marketing-page defaults (large imagery, bento grids, heavy motion) were deliberately NOT reached for; the skill's universal hygiene rules (no em-dash in visible copy, WCAG contrast, no icon-library dependency since none exists anywhere else in this codebase, real functional copy with no invented brand/facts) were applied.
- **Tests (Task 6)**: `ppr.service.test.ts` (16 tests) covers the happy path (row + email with correct locale/IP), honeypot (no create/email/count, runs before rate limit even at the limit, whitespace-only `website` is NOT treated as filled), rate-limit boundary (5th allowed, 6th rejected) and window query shape, null-IP skip, both domain-validation codes with the `etd === eta` boundary, and SMTP-failure-does-not-fail-the-request. `registry.test.ts` +2 tests (`201/422/429/500` + `security: []` on the path; honeypot/locale fields present on the registered component schema). `e2e/ppr-public.spec.ts` (5 tests, all NOT authenticated): IT happy path with Mailpit assertion, EN happy path with Mailpit assertion (form locale drives email locale, not browser locale), honeypot negative (~3s wait, per Dev Notes — not the full 15s positive-poll timeout), rate-limit 6-POST boundary, `ETA_IN_PAST`. Every test uses a run-unique fake `x-forwarded-for` (`e2e-ppr-<timestamp>-<random>`, set via a per-test `browser.newContext({ extraHTTPHeaders, timezoneId: 'UTC' })` so both the page's own `fetch` calls AND `page.request.post` direct calls in the same test carry it) — the DB is never reset between runs, so this is the only way to keep the rate-limit test independent of every other test and of prior runs. `timezoneId: 'UTC'` pins the datetime-local -> UTC conversion so the test is deterministic regardless of the host's local timezone.

### File List

- `prisma/schema.prisma`
- `prisma/migrations/20260709130000_add_ppr_requests/migration.sql`
- `src/server/services/errors.ts`
- `src/lib/api/handler.ts`
- `src/lib/schemas/registry.ts`
- `src/lib/schemas/registry.test.ts`
- `src/lib/schemas/ppr.ts`
- `src/server/services/ppr.service.ts`
- `src/server/services/ppr.service.test.ts`
- `src/app/api/v1/ppr-requests/route.ts`
- `src/proxy.ts`
- `src/server/adapters/mail/templates.ts`
- `src/app/[locale]/ppr/page.tsx`
- `src/app/[locale]/ppr/ppr-form.tsx`
- `messages/it.json`
- `messages/en.json`
- `e2e/ppr-public.spec.ts`
- `_bmad-output/implementation-artifacts/8-1-ppr-public-form.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial via `bmad-code-review`, priorità zero sul full-suite e2e su DB fresco. **Verdict: clean-pass — zero must-fix/should-fix.** Tutti e 5 i gate ri-eseguiti dal reviewer in proprio: lint 0 errori, typecheck pulito, **986/986 unit**, build verde, **e2e 141/141** su DB fresco (0 flake nel run, 5/5 superfici story verdi).

- **Honeypot end-to-end provato dal vivo**: 201 byte-identico al successo, zero righe (psql), zero email (Mailpit), non conta nel rate limit; campo davvero off-screen/`aria-hidden`/fuori dal tab order (NON `display:none`); la tecnica e2e col setter nativo esercita davvero il path RHF.
- **Rate limit sequenziale**: 5×201 poi 429 `RATE_LIMITED`; il 429 non crea righe; IP diverso isolato; header assente → skip documentato.
- **Email**: locale segue il form (IT/EN dal vivo via Mailpit); ETA in ora di Roma corretta ANCHE su attraversamento di mezzanotte DST (22:30Z → 00:30 del giorno dopo); plurali ICU corretti; send fallita non fallisce la richiesta; **header injection via marche con CRLF+Bcc neutralizzata** (nodemailer folda il CRLF, nessun destinatario iniettato).
- **Esposizione pubblica chirurgica**: `/it|en/ppr` 200 e POST 201 senza cookie; GET sullo stesso path 405 (nessuna lettura pubblica); spot-check users/people/bookings ancora 401; OpenAPI col solo nuovo path `security: []`, nessuna modifica collaterale alle altre route.
- **Modello/migrazione zero drift** (`migrate diff` pulito), enum 5 valori, indice `(submitterIp, createdAt)`; risposta 201 esattamente `{"status":"PENDING"}` su ogni path; i18n simmetrica (key-diff rieseguito: 0 asimmetrie); confronti su istanti lato server, early-out client legittimo.
- Entrambe le judgment call del dev ratificate (migrazione generata con zero drift; riuso `formatDateTime` = davvero data+ora Europe/Rome).

**Finding (non bloccanti):**
- **N1 (deferred-candidate)**: TOCTOU del rate limit — 20 POST concorrenti dallo stesso IP → 14 righe (solo 6 429): sotto burst l'overshoot scala con la concorrenza, e `x-forwarded-for` è client-trusted senza proxy davanti. ACCETTATO per contratto di story ("controllo soft, zero infrastruttura, honeypot = difesa primaria") — da riportare nel handoff come limite noto della postura anti-abuso PPR.
- **N2 (nit)**: hero senza NOME dell'aviosuperficie (il claim c'è) — nessun nome configurato esiste nel progetto; inventarlo sarebbe stato peggio (anti-slop). Da rivisitare quando nascerà una config di sito.

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
- 2026-07-09: Implemented (Sonnet 5 single dev subagent via `bmad-dev-story`): PprRequest model + migration, honeypot + DB-backed per-IP rate limit (`RateLimitError` -> 429), public `POST /api/v1/ppr-requests`, public `/[locale]/ppr` page + form, localized receipt email, full test coverage (unit + registry + e2e). All gates green: lint 0 errors, typecheck clean, vitest 986/986, `next build` clean, `playwright test` 141/141 (136 baseline + 5 new, zero regressions, zero flakes this run). Status -> review.
- 2026-07-09: Review Opus 4.8 xhigh via `bmad-code-review` su DB fresco — clean pass, zero must/should-fix; honeypot, rate limit, locale email, DST, header injection e esposizione pubblica provati empiricamente dal vivo. N1 TOCTOU rate limit deferred (accettato da story), N2 nome aviosuperficie nit. Status -> done.
