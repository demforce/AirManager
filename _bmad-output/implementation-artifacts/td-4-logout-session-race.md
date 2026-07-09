---
baseline_commit: de2149b
---

# Story TD-4: Logout affidabile su build di produzione (race signOut vs refresh JWT)

Status: ready-for-dev

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

- [ ] **T1 (AC 2, 3)** — `src/proxy.ts`: middleware senza wrapper, gate via `getToken` (nome/salt cookie corretti per http/https), doc-comment aggiornato (root cause, equivalenza del gate, no-sliding); rimozione `auth-edge.ts`; unit test del proxy se esistono (verificare) o gate coperto dagli e2e.
- [ ] **T2 (AC 5)** — doc-comment trade-off in `auth.config.ts`.
- [ ] **T3 (AC 4)** — revert mirato `b95c066`: `playwright.config.ts` webServer CI → build+start (timeout 240s), `ci.yml` + `AUTH_TRUST_HOST`.
- [ ] **T4 (AC 1, 6)** — estensione `e2e/login.spec.ts` (secondo ciclo logout); prova empirica ≥10 cicli su `next start` + prova curl no-Set-Cookie (Debug Log con output reali).
- [ ] **T5 (AC 6)** — `npm run gates`; e2e login/logout in modalità CI su build locale (`CI=1 npx playwright test login` con build fatta); full suite dev-mode senza fail nuovi; story file (Dev Agent Record) + sprint-status.yaml (td-4 → review).

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

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-09: Story file created (Fable 5 main session) — finding prioritario dell'handoff post-Epic 8, ciclo dev+review completo come da regola utente.
