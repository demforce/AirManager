---
baseline_commit: de2149b
---

# Story TD-4: Logout affidabile su build di produzione (race signOut vs refresh JWT)

Status: done

## Story

As a utente autenticato (qualsiasi ruolo),
I want che il click su "Esci" termini la sessione in modo affidabile anche in produzione,
so that nessuna sessione "risorga" dopo il logout (finding prioritario HANDOFF 2026-07-09, scoperto dalla CI e2e su build di produzione — impatta utenti reali, non solo i test).

## Acceptance Criteria

1. **Given** l'app su build di produzione (`env -u NODE_ENV npx next build` + `npm run start`), **When** un utente loggato clicca "Esci" a pagina idratata e poi rinaviga a `/it/dashboard`, **Then** viene SEMPRE rediretto a `/it/login?callbackUrl=…` — provato empiricamente con cicli ripetuti login→logout→verifica (≥10 cicli consecutivi verdi su `next start`; il repro dell'handoff sopravviveva anche a 4 click su "Esci").
2. **Given** una qualunque richiesta di navigazione ordinaria (pagina dashboard O `/api/v1/*`) con sessione valida su `next start`, **Then** la risposta NON contiene alcun `Set-Cookie` del session token (`authjs.session-token` o variante `__Secure-`) — provato con `curl -i` sugli header di risposta. Gli unici emettitori di cookie di sessione restano gli endpoint `/api/auth/*` (signin/signout/csrf).
3. Il gate delle route è invariato byte-per-byte nel comportamento osservabile: non autenticato → 401 envelope su `/api/v1/*` e redirect a `/login?callbackUrl=` sulle pagine; autenticato → passa; `PUBLIC_WEB_PATHS`/`PUBLIC_API_PATHS`/`AUTH_API_PREFIX` invariati. La suite e2e esistente è il canarino.
4. La CI e2e torna sulla build di produzione: `playwright.config.ts` `webServer.command` CI-condizionale ripristinato a `env -u NODE_ENV npm run build && npm run start` (locale resta `npm run dev`) e `AUTH_TRUST_HOST: "true"` riaggiunto all'env del job `e2e` in `.github/workflows/ci.yml` — è il revert mirato di `b95c066`, reinstaurando lo stato di `6c7f1d2` + `b15fd37` (vedi quei commit per i commenti già scritti).
5. Il trade-off del fix è documentato nel codice (doc-comment): la sessione NON ha più sliding expiration — scade in modo assoluto a `maxAge` (30 giorni, default Auth.js) dal login, qualunque sia l'attività. Decisione accettata per l'MVP.
6. Gates verdi: lint, typecheck, unit, build; e2e mirati logout/login su `next start` in modalità CI (`CI=1`) verdi + nessun fail nuovo sulla suite in modalità dev.

## Contesto e decisioni di design (vincolanti)

- **Root cause (ricognizione 2026-07-09, confermata su node_modules)**: in JWT strategy `@auth/core@0.41.2` riemette il session cookie a OGNI lettura di sessione — `node_modules/@auth/core/lib/actions/session.js:34-53` ri-firma il JWT e pusha il cookie con scadenza +30gg SENZA alcun throttle (`updateAge` esiste solo nel ramo database-session, `:77-92`, mai eseguito qui). Le letture RSC via `auth()` SCARTANO i Set-Cookie (`node_modules/next-auth/lib/index.js:42-49`), ma il **middleware wrapper li PROPAGA** (`index.js:166-169`). Il nostro `src/proxy.ts:62` usa `authEdge((req) => …)` con matcher larghissimo (`:104`): ogni navigazione emette quindi un cookie di refresh che può vincere la race contro il Set-Cookie di cancellazione dello `signOut` (server action `logoutAction`, `src/app/[locale]/dashboard/page.tsx:98-101`) → sessione "risorta". In dev non si manifesta; su `next start` sì.
- **Fix (decisione vincolante): eliminare la sorgente, non mitigare la race** — il middleware NON deve emettere Set-Cookie di sessione. In `src/proxy.ts` sostituire il wrapper `authEdge(...)` con un middleware normale (`export default function proxy(req: NextRequest)`) che legge il token con **`getToken` da `'next-auth/jwt'`** (decodifica pura, zero side effect, edge-safe) e riusa la logica di gate esistente sostituendo `req.auth?.user` con `token != null`. Attenzioni:
  - `getToken({ req, secret: env.AUTH_SECRET, ... })` in v5 beta richiede anche il **`salt`** = nome del cookie, che varia con `secureCookie` (`authjs.session-token` su http, `__Secure-authjs.session-token` su https). Gestire la coppia nome/salt in modo coerente (derivarla da `x-forwarded-proto`/URL o passare `secureCookie` esplicito) — verificare la firma esatta esportata da `next-auth@5.0.0-beta.31` (`node_modules/next-auth/jwt.d.ts`) e NON fidarsi della memoria: in localhost e2e siamo su http.
  - Il wrapper edge oggi NON fa il recheck DB (`auth-edge.ts` usa `authConfig` base, senza `applyActiveRecheck` che vive solo nell'istanza Node `auth.ts:32-46`): passare a `getToken` è quindi **equivalente** come forza del gate — la disattivazione utente resta applicata dalle letture Node nelle pagine (`getSessionActor`, `src/server/auth/session.ts:19`). Dichiararlo nel doc-comment del proxy.
  - `src/server/auth/auth-edge.ts` resta senza consumer → **rimuoverlo** (modifica chirurgica: niente codice morto). `auth.config.ts` resta condiviso dall'istanza Node.
  - NON tentare la strada "strippare i Set-Cookie dalla response del wrapper": next-auth li appende DOPO il return della user-middleware — non intercettabile. Documentata qui perché il reviewer non la riproponga.
- **Perché questo chiude la race**: dopo il fix nessuna richiesta ordinaria emette cookie di sessione (RSC li scarta già, il middleware non li produce più, `grep` confermato: zero `useSession`/`SessionProvider` client-side). Il Set-Cookie di cancellazione dello `signOut` non ha più concorrenti: qualunque risposta in-flight arrivi dopo, non porta cookie.
- **Sliding session persa (AC 5)**: oggi di fatto ogni navigazione estendeva la scadenza a +30gg; col fix il JWT scade 30 giorni dopo il login. Accettato (MVP, utenti interni che ri-loggano). Nessun `maxAge` custom: restare sul default. Documentare in `auth.config.ts:19` accanto a `strategy: 'jwt'`.
- **Ripristino CI (AC 4)**: revert mirato di `b95c066` su `playwright.config.ts` (command CI-condizionale + timeout 240_000 come in `6c7f1d2`) e `.github/workflows/ci.yml` (`AUTH_TRUST_HOST: "true"` con il commento di `b15fd37`). Aggiornare il commento stantio in `playwright.config.ts:34-38` che rimanda a questo fix.
- **Test**: l'e2e regression guard ESISTE già — `e2e/login.spec.ts:68-82` ('logs out and returns to the login page, invalidating the session') passava in dev e fallisce sul bug in produzione: con la CI su build+start diventa efficace da solo. Estenderlo con un SECONDO ciclo logout→verify nello stesso test (login di nuovo, Esci di nuovo, assert redirect) per coprire il repro "sopravvive a click ripetuti" senza aggiungere spec nuovi. La prova ≥10 cicli (AC 1) e la prova curl (AC 2) sono verifiche empiriche del dev (Debug Log), non test automatici.
- **NIENTE altro cambia**: nessuna migrazione, nessun cambio schema/API/UI/i18n. `logoutAction` resta com'è (il problema non è mai stato lì).

## Tasks / Subtasks

- [x] **T1 (AC 2, 3)** — `src/proxy.ts`: middleware senza wrapper, gate via `getToken` (nome/salt cookie corretti per http/https), doc-comment aggiornato (root cause, equivalenza del gate, no-sliding); rimozione `auth-edge.ts`; unit test del proxy se esistono (verificare) o gate coperto dagli e2e.
- [x] **T2 (AC 5)** — doc-comment trade-off in `auth.config.ts`.
- [x] **T3 (AC 4)** — revert mirato `b95c066`: `playwright.config.ts` webServer CI → build+start (timeout 240s), `ci.yml` + `AUTH_TRUST_HOST`.
- [x] **T4 (AC 1, 6)** — estensione `e2e/login.spec.ts` (secondo ciclo logout); prova empirica ≥10 cicli su `next start` + prova curl no-Set-Cookie (Debug Log con output reali).
- [x] **T5 (AC 6)** — `npm run gates`; e2e login/logout in modalità CI su build locale (`CI=1 npx playwright test login` con build fatta); full suite dev-mode senza fail nuovi; story file (Dev Agent Record) + sprint-status.yaml (td-4 → review).

## Dev Notes

- Leggere e seguire la skill `karpathy-guidelines` (`.claude/skills/karpathy-guidelines/SKILL.md`): modifiche chirurgiche, assunzioni esplicitate, criteri verificabili.
- Ambiente: DB fresco fornito dalla sessione principale (il dev NON resetta); Mailpit attivo; `curl localhost:3000` deve FALLIRE prima di ogni run e2e (`fuser -k 3000/tcp` se serve); build SEMPRE `env -u NODE_ENV`; MAI `playwright install`. Per la prova su next start: buildare, `npm run start` in background, ricordarsi di killarlo prima dei run e2e successivi.
- UN commit di implementazione (`Story TD-4: ...`). Nessuna stringa UI nuova.
- Il middleware gira in Edge runtime: import solo edge-safe in `proxy.ts` (`getToken` di `next-auth/jwt` lo è; NON importare `auth.ts`/argon2/prisma).
- Attenzione a `env.AUTH_SECRET` in edge: `src/lib/env.ts` è già importato oggi via `auth.config.ts`→`auth-edge.ts`? Verificare cosa importa il proxy DOPO la rimozione del wrapper e che il bundle edge resti pulito (il build lo dice).

### References

- [Source: docs/handoffs/HANDOFF.md:5 — finding prioritario, repro, istruzioni di ripristino CI]
- [Source: src/proxy.ts:53-96 — gate attuale; src/server/auth/auth-edge.ts; src/server/auth/auth.config.ts:18-24]
- [Source: src/app/[locale]/dashboard/page.tsx:98-117 — logoutAction + form Esci]
- [Source: node_modules/@auth/core/lib/actions/session.js:34-53; node_modules/next-auth/lib/index.js:127-170 — meccanica del refresh]
- [Source: e2e/login.spec.ts:68-82 — regression guard; commit 6c7f1d2, b15fd37, b95c066 — storia CI build+start]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

**Empirical investigation (before coding) — root cause confirmation and `secureCookie` derivation.**

Started `npm run dev` and used curl to see what the *actual* login flow does on plain HTTP, since the story explicitly warned not to trust memory on this:

```
$ curl -s -i http://localhost:3000/api/auth/csrf
HTTP/1.1 200 OK
set-cookie: authjs.csrf-token=...; Path=/; HttpOnly; SameSite=Lax
set-cookie: authjs.callback-url=...; Path=/; HttpOnly; SameSite=Lax
```
Unprefixed cookie names on http://localhost — confirms `secureCookie` resolves to `false` for the route handler that actually issues the cookie (it derives from the literal request protocol Next.js sees, `req.url`/`req.nextUrl.protocol`, not from `x-forwarded-proto`; traced in `node_modules/@auth/core/lib/init.js:69` vs. the route handler's direct `Auth(request, config)` call in `src/app/api/auth/[...nextauth]/route.ts`).

Reproduced the pre-fix bug directly (still on the old `authEdge` middleware at this point): an **unauthenticated** GET to `/it/dashboard` (redirect to login) still carried `Set-Cookie: authjs.csrf-token=...` / `authjs.callback-url=...` — proof the wrapper propagates whatever `Set-Cookie` its internal `getSession()` call produces regardless of the response it's wrapping. A curl-based login (CSRF token → `POST /api/auth/callback/credentials`) followed by a plain `GET /it/dashboard` with the session cookie showed the session-refresh bug directly: `Set-Cookie: authjs.session-token=...` reissued on an ordinary authenticated navigation.

**Post-fix verification on `next start` (production build), AUTH_TRUST_HOST=true (matches the restored CI env var):**

Build: `env -u NODE_ENV npx next build` — succeeded, Edge (Proxy/Middleware) bundle stayed clean (no Prisma/argon2 leakage — `getToken` + `env.ts` are edge-safe, confirmed by the build not erroring).

AC 2 — no session `Set-Cookie` on ordinary navigation, authenticated:
```
$ curl -s -i -b cookies.txt http://localhost:3000/it/dashboard
HTTP/1.1 200 OK
set-cookie: NEXT_LOCALE=it; Path=/; SameSite=lax
... (no authjs.session-token Set-Cookie)

$ curl -s -i -b cookies.txt http://localhost:3000/api/v1/flights
HTTP/1.1 200 OK
... (no authjs.session-token Set-Cookie)
```
grep for `set-cookie.*session-token` on both responses: NONE (correct) — previously (pre-fix, on `next start`) the same navigation always re-issued it.

AC 3 — gate unchanged for unauthenticated requests:
```
$ curl -s -i http://localhost:3000/it/dashboard        # 307 -> /it/login?callbackUrl=%2Fit%2Fdashboard, no stray Set-Cookie
$ curl -s -i http://localhost:3000/api/v1/flights      # 401 {"error":{"code":"UNAUTHENTICATED",...}}
$ curl -s -o /dev/null -w "%{http_code}" .../api/v1/health   # 200
$ curl -s -o /dev/null -w "%{http_code}" .../it/ppr           # 200 (public)
```

AC 1 — ≥10 consecutive login→(2 ordinary navigations)→logout→verify cycles on `next start`, via curl (CSRF-protected `POST /api/auth/callback/credentials` then `POST /api/auth/signout`, verifying the post-logout `GET /it/dashboard` is a 307 to `/it/login`):
```
cycle 1: PASS (logged-in=200, post-logout=307 location: /it/login?callbackUrl=%2Fit%2Fdashboard)
...
cycle 12: PASS (logged-in=200, post-logout=307 location: /it/login?callbackUrl=%2Fit%2Fdashboard)
=== TOTAL: 12 passed, 0 failed (of 12) ===
```
(script: `/tmp/.../scratchpad/logout_cycles.sh`, not committed — throwaway verification tool)

**Browser-driven e2e on the production build (AC 1/6, real `logoutAction` server-action flow, not raw curl):**
```
$ CI=1 npx playwright test login
7 passed (40.6s)
```
Includes the extended `e2e/login.spec.ts` test with the second login/logout cycle (T4). Re-ran once more for reproducibility — 7/7 again.

**Full e2e suite, dev mode — contention flakiness, not a regression (two full runs compared).** `npx playwright test` (`fullyParallel: true`, `next dev`) was run twice, back to back, same DB, same code:
- Run 1 (cold dev-server cache): 90 passed, 61 failed.
- Run 2 (warmer cache, right after): 141 passed, 10 failed.
- Total collected both times: 151 (matches the session's established baseline count) — no test ever failed to be collected, only pass/fail assignment shifted.
- The two failure sets are almost entirely **disjoint** (only 1 test, `bookings.spec.ts:406`, appears in both, out of 71 combined failure instances) and span unrelated business-logic specs (accounts, bookings, flights, aircraft-*, package-*, instructor-rates, idempotency, person-profiles...) — never `login.spec.ts`, never a 401/403/session-shaped assertion. Symptoms are 404s and body-shape mismatches consistent with a route not yet compiled when a parallel worker hits it.
- Isolated re-run of 2 of run-1's failing spec files (`account-statement.spec.ts`, `accounts-topups.spec.ts`) against an already-warm server: 10/10 passed, 0 failed.

This is the project's own previously-documented flaky class (commit `6c7f1d2`: "next dev's on-demand compilation under CI-runner contention causes timeout flakiness and hangs — known cold-compile flaky class") — the disjoint failure sets across two identical runs are the signature of resource contention (this sandbox runs Postgres, Mailpit, the dev server, and the Playwright browser workers together), not a deterministic bug: a real regression from this change would fail the *same* auth-shaped assertions every time. `login.spec.ts` — the only spec this story's business logic touches — was green in every single run, including inside both full-suite attempts. Treating the CI-mode production-build e2e run (below) as the authoritative AC 6 signal for this reason; flagged for the reviewer in `notesForReview`.

### Completion Notes List

- T1: `src/proxy.ts` no longer wraps `authEdge`/`NextAuth(authConfig).auth` — plain `async function proxy(req: NextRequest)` reading the session with `getToken` (`next-auth/jwt`), which only decrypts the JWT and never appends `Set-Cookie`. `secureCookie` is derived from `req.nextUrl.protocol === 'https:'`, mirroring how the `/api/auth/*` route handler (the actual cookie issuer) derives it — verified empirically to match on `http://localhost` (unprefixed `authjs.session-token`). `src/server/auth/auth-edge.ts` deleted (no remaining consumer). Doc-comment on `proxy.ts` documents the root cause, the fix, gate-equivalence (no DB active-user recheck either before or after — that only ever ran in the Node instance), and the no-sliding-session trade-off. No proxy unit test existed before or was warranted here (Karpathy: no speculative test infra) — the gate is exercised by the e2e suite, which is the existing pattern for this file.
- T2: added a trade-off doc-comment in `auth.config.ts` next to `session: { strategy: 'jwt' }` explaining the loss of de-facto sliding expiration and why it's accepted for the MVP.
- T3: targeted revert of `b95c066` — `playwright.config.ts` and `.github/workflows/ci.yml` are now byte-identical to the pre-`b95c066` state (`git diff 6c7f1d2 -- playwright.config.ts` and `git diff b15fd37 -- .github/workflows/ci.yml` both empty). `docs/handoffs/HANDOFF.md` was deliberately left untouched — the finding-prioritario paragraph there is owned by the `/handoff` skill at epic close, not by this story.
- T4: `e2e/login.spec.ts`'s existing logout test extended with a second full login→"Esci"→verify cycle in the same test, covering the handoff's "survives repeated clicks" repro without adding a new spec file. Empirical proof (≥10 cycles, curl no-Set-Cookie) recorded in the Debug Log above.
- T5: gates green (see below). `CI=1 npx playwright test login` green twice in a row against the real production build. Full dev-mode suite run twice: 61 then 10 failures, almost entirely disjoint sets, none auth-related, `login.spec.ts` always green — see Debug Log for the full analysis. This is pre-existing sandbox contention flakiness (documented in the project's own commit history), not a regression from this story; could not get a fully clean dev-mode `fullyParallel` run in this session and am flagging it honestly rather than omitting it.
- Stale `auth-edge.ts` references cleaned up in the same commit (surgical, caused directly by the file's removal): `src/server/auth/README.md`, `src/server/auth/auth.config.ts` (two comments), `src/server/auth/auth.ts`, `src/server/auth/jwt-active-check.ts`.

### File List

- `src/proxy.ts` — modified (middleware rewritten: `getToken` instead of `authEdge` wrapper; doc-comment)
- `src/server/auth/auth-edge.ts` — deleted
- `src/server/auth/auth.config.ts` — modified (trade-off doc-comment; stale `auth-edge.ts` references updated)
- `src/server/auth/auth.ts` — modified (stale `auth-edge.ts` comment reference updated)
- `src/server/auth/jwt-active-check.ts` — modified (stale `auth-edge.ts` comment reference updated)
- `src/server/auth/README.md` — modified (stale `auth-edge.ts` references updated)
- `playwright.config.ts` — modified (targeted revert of `b95c066`: CI webServer command + timeout)
- `.github/workflows/ci.yml` — modified (targeted revert of `b95c066`: `AUTH_TRUST_HOST`)
- `e2e/login.spec.ts` — modified (second login/logout cycle added to the existing logout test)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: clean-pass — zero finding mandatory.** 1 nit documentale (TD4-N1) applicato dalla sessione principale nel commit di review.

- **Priorità zero (a) — full suite e2e dev-mode su DB fresco**: `npx playwright test` → **151/151 passed, run singolo pulito** (10.0m, exit 0), 33 file. Chiude il gap dichiarato dal dev (61 poi 10 fail disgiunti nei suoi run): l'ipotesi contention è corroborata — stesso codice+DB, sandbox meno carica, run completamente verde. Zero fail auth/session-shaped in qualunque run.
- **Priorità zero (b) — CI-mode su build di produzione**: `CI=1 npx playwright test login` (build+start self-hosted dal webServer, `AUTH_TRUST_HOST`) → 7/7 in 41.9s, incluso il test logout esteso col secondo ciclo.
- **Priorità zero (c) — morte della race provata viva**: 15/15 cicli curl login→2 navigazioni→signout→verify su `next start` (post-logout SEMPRE 307 → `/it/login`, zero sessioni risorte); AC 2 provato con grep sugli header: NESSUN `Set-Cookie` del session token su `/it/dashboard` né su `/api/v1/flights` autenticate; token manomesso/spazzatura/vuoto → 401/redirect, MAI 500.
- **Priorità zero (d) — secureCookie**: tracciato in node_modules (emittente `Auth(reqWithEnvURL(req))` → `useSecureCookies = url.protocol === 'https:'`; lettore `getToken` con salt dal nome cookie): emittente e lettore concordano su entrambe le topologie provate empiricamente — http diretto (cookie unprefixed, 200/200) e reverse proxy TLS-terminating uniforme simulato con `X-Forwarded-Proto: https` su emissione E lettura (`__Secure-`, 200/200). L'unico mismatch costruibile è un caso misto artificiale che un proxy uniforme non produce.
- **Gate matrix invariata**: unauth → 401 envelope su `/api/v1/*` e 307 con `callbackUrl` sulle pagine; `PUBLIC_API_PATHS`/`PUBLIC_WEB_PATHS`/`/api/auth/*` tutti passanti; equivalenza del recheck utente disattivato confermata per ispezione (solo Node, invariato); File List = diff reale; bundle Edge pulito (no argon2/prisma); `env.ci-sync.test.ts` verde senza `AUTH_TRUST_HOST` in `.env.example` (var raw @auth/core, mai nel Zod envSchema — claim del dev verificato).
- **TD4-N1 (nit, fixato)** — il doc-comment di `proxy.ts` motivava la correttezza di `secureCookie` con "not from x-forwarded-proto": empiricamente FALSO (l'emittente con `X-Forwarded-Proto: https` setta `__Secure-`; Next.js risolve il protocollo forwarded in `req.nextUrl.protocol` per ENTRAMBI, ed è proprio per questo che il codice è corretto). Riformulato il commento; nessun cambio di codice.

### Final gates (review run, DB fresco)

`npm run gates` exit 0 (lint/typecheck/1078 unit/build); build di produzione con bundle Edge pulito; e2e full suite **151/151**; CI-mode login 7/7; 15/15 cicli logout. Server killati, porta 3000 libera a fine review.

## Change Log

- 2026-07-09: Story file created (Fable 5 main session) — finding prioritario dell'handoff post-Epic 8, ciclo dev+review completo come da regola utente.
- 2026-07-09: Implemented (Sonnet 5 dev subagent, xhigh) — `src/proxy.ts` reads the session with `getToken` instead of the `authEdge` wrapper, eliminating the Set-Cookie source of the race; `auth-edge.ts` removed; sliding-session trade-off documented in `auth.config.ts`; targeted revert of `b95c066` (CI e2e back on production build + `AUTH_TRUST_HOST`); `e2e/login.spec.ts` extended with a second login/logout cycle. Status → review.
- 2026-07-09: Review Opus 4.8 xhigh — clean pass, zero mandatory. Full suite 151/151 su DB fresco (chiude il gap del dev), 7/7 CI-mode su build di produzione, 15/15 cicli logout, secureCookie provato coerente su http e dietro proxy TLS uniforme. TD4-N1 (doc-comment) fixato dalla sessione principale. Status → done.
