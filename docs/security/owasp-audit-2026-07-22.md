# AirManager — Security Audit (OWASP Top 10 / CWE / business logic)

- **Data:** 2026-07-22
- **Metodo:** 6 layer di audit adversarial paralleli (auth/sessione/token, RBAC/access-control, business-logic/finanza, injection/XSS/SSRF, secrets/crypto/config, superficie pubblica/DoS), capacità Fable 5. Triage con lettura del codice a ogni location per severità reale (consumatore = un aeroclub).
- **Scope:** intera codebase `src/**` (291 file, ~114k righe, 77 route API), `next.config.ts`, `docker-compose.yml`, CI, seed.
- **Esito sintetico:** nessun **critical**. **5 high**, **5 medium**, **7 low**, **1 informational**. Access control (OWASP A01) e injection/SQLi/XSS (A03) risultano **puliti**: query Prisma tutte parametrizzate, nessun sink HTML, ownership `actor.personId` applicato in ogni service, guardia open-redirect presente.

Severità = conseguenza reale per l'aeroclub, non lettura peggiore teorica.

---

## HIGH

### H1 — Login senza protezione brute-force / rate-limit (CWE-307, A07) — *anche DoS*
`src/server/auth/authorize.ts` — `authorizeCredentials` non ha contatore tentativi, lockout, delay o captcha; `User` non ha campi `failedLogin`/`lockedUntil`; `src/proxy.ts:93` lascia passare `/api/auth/*` senza gate.
**Exploit:** POST illimitati a `/api/auth/callback/credentials` → password-guessing e credential-stuffing a velocità di rete su qualsiasi email nota. Ogni tentativo forza un `verify` Argon2id lato server (incluso il dummy-hash per email sconosciute) → il flood è anche **CPU-exhaustion non autenticato** sull'intera app.
**Fix:** rate-limit per-(email, IP) + lockout progressivo prima di `verifyPassword`, riusando il pattern DB-counter già presente in `ppr.service.ts`; stesso `null` generico dopo il lockout per non introdurre enumeration. *(Richiede migrazione Prisma: modello attempt/lockout.)*

### H2 — I cambi di ruolo non vengono mai riverificati sulle sessioni attive (CWE-613, A07)
`src/server/auth/jwt-active-check.ts:26-29` seleziona **solo** `isActive`; `src/server/auth/auth.config.ts:33-44` scrive `token.roles` **solo** al sign-in (`if (user)`). Nessun path aggiorna mai `token.roles` dopo.
**Exploit:** admin declassa un utente compromesso da ADMIN a PILOTA lasciandolo attivo → il suo JWT continua a portare `roles:[ADMIN]` e RBAC concede i vecchi permessi fino allo scadere del `maxAge` (30 giorni) o al logout volontario. La revoca-ruolo (controllo di accesso primario oltre la disattivazione) **non fa nulla**.
**Fix:** in `applyActiveRecheck` selezionare anche `roles` e ri-stampare `token.roles` a ogni recheck (o annullare la sessione se i ruoli non autorizzano più); in alternativa `sessionsValidFrom`/token-version bumpato su ogni cambio ruolo.

### H3 — Chiave idempotente liberata dopo il commit → doppia esecuzione di addebito/accredito (CWE-362, A04)
`src/lib/api/handler.ts:365-370` (catch) chiama `freeIdempotencyRecord` **cancellando** il record PENDING su qualsiasi errore, incluso un errore **post-commit**. `recordTopUp` (`accounts.service.ts:255→260`), `recordAdjustment` (`:595`) e `registerFlight` (`flights.service.ts:728`) committano la `$transaction` del denaro e **poi** fanno una lettura (`buildOverview`/`getAccountOverview`) che può lanciare.
**Exploit:** POST `/api/v1/people/{id}/account/top-ups` con `Idempotency-Key: K` → transazione committa (accredito), poi `buildOverview` fallisce (timeout/errore transitorio) → il servizio lancia → l'handler **cancella** K → il client riprova con lo stesso K → nessun record trovato → **secondo accredito**. Nessun unique constraint naturale su `AccountMovement`/`Flight` ferma il duplicato: l'idempotenza era l'unica guardia, scartata proprio quando la mutazione è già avvenuta. Stesso su adjustment, `transactions`, voli.
**Fix:** scrivere il record COMPLETED **dentro** la stessa `$transaction` della mutazione, oppure liberare la chiave **solo** per errori pre-commit (validazione/lookup) e catturare il risultato committato prima di ogni lettura, così `handle` non può lanciare dopo il commit.

### H4 — `forgot-password` senza rate-limit → mail-bomb + churn dei token (CWE-799/307, A04)
`src/app/api/v1/auth/forgot-password/route.ts:13` — route `auth:'public'`, nessun throttle; `requestPasswordReset` (`auth-tokens.service.ts:85-108`) emette un token (2 write DB) e invia un'email per ogni account attivo, a ogni chiamata.
**Exploit:** POST ripetuti dell'email di una vittima → inbox mail-bombata, righe `AuthToken` illimitate, invalidazione ripetuta del link legittimo pendente della vittima, consumo/abuso della quota SMTP del club (rischio blacklist del dominio). Amplifica anche l'oracolo di timing (L5).
**Fix:** throttle per-email **e** per-IP (max ~3/ora/email) prima di emettere/inviare, mantenendo il 200 neutro per non aggiungere enumeration.

### H5 — Rate-limit PPR bypassabile (XFF assente/spoofabile) → righe illimitate + relay email (CWE-770, A04)
`src/server/services/ppr.service.ts`: `extractSubmitterIp` restituisce `null` se manca `x-forwarded-for` (righe 57-67) e `createPprRequest` fa `if (meta.ip) {...limit...}` (riga 78) → **IP null salta del tutto il limite**; con header presente la chiave è il primo valore XFF, **fornito dal client**. Ogni richiesta accettata crea una riga `PprRequest` e invia una receipt email all'indirizzo `input.email` **scelto dall'attaccante**. Deployment raggiungibile direttamente via IP (commit `8eac339`) → nessun proxy fidato inietta necessariamente XFF.
**Exploit:** (a) **omettere** XFF → `meta.ip` null → cap 5/ora mai eseguito → richieste illimitate; (b) ruotare `X-Forwarded-For: <random>` → ogni IP finto ottiene il suo budget. In entrambi i casi: righe illimitate (DB) **e** email illimitate verso indirizzo scelto (metti l'email della vittima nel form) con `firstName`/rotte interpolate nel corpo → **open relay** con la reputazione del club. Honeypot `website` ferma solo i bot naïf.
**Fix:** non trattare IP mancante/non verificabile come "nessun limite" — throttle di fallback globale per IP null + cap sulle righe PENDING; derivare l'IP client da un hop-count fidato o dall'IP di connessione della piattaforma, non dal primo XFF grezzo; CAPTCHA/proof-of-work o cap per-recipient sull'invio.

---

## MEDIUM

### M1 — Record idempotente non legato al payload → replay perde il secondo addebito (CWE-840, A04)
`src/lib/api/handler.ts:128-153`: la chiave è `[userId, endpoint, key]`; su conflitto P2002 il record COMPLETED viene rigiocato **senza** confrontare params/body correnti con quelli che l'hanno prodotto.
**Exploit:** top-up a persona A con `Key: K` → poi top-up a persona B (o importo corretto) riusando K → P2002 → viene rigiocata la risposta di A (`Idempotency-Replayed: true`) **senza** eseguire `recordTopUp` per B → **B non viene mai accreditato**, ma l'operatore vede un 200 plausibile. Idem su adjustment, membership-fee, transaction, payout.
**Fix:** persistere un fingerprint (sha256 di method+endpoint+params+body canonico) sul record; su mismatch restituire `422 IDEMPOTENCY_KEY_MISMATCH` invece di rigiocare. *(Richiede migrazione: colonna fingerprint.)*

### M2 — Password SMTP in chiaro nel DB (CWE-312, A02)
`src/server/services/app-settings.service.ts:368` scrive `input.pass` come stringa in `AppSetting.value`. *(L'API è corretta: la GET restituisce solo `hasPassword`; solo `getSmtpSettingsForMailer` la rilegge.)*
**Exploit:** una vera credenziale del provider mail del club è leggibile da qualsiasi dump/backup DB o `pg_dump` sul Postgres esposto in LAN (v. L4) → takeover mailbox / spam con l'identità del club.
**Fix:** cifrare con AES-256-GCM (`node:crypto`, IV 12 byte random, `iv||tag||ciphertext` base64) con chiave derivata via HKDF da `AUTH_SECRET` (o `APP_ENCRYPTION_KEY` dedicata); decifrare solo in `getSmtpSettingsForMailer`.

### M3 — Nessun security header (CWE-693/1021, A05)
`next.config.ts` non ha `headers()`: nessun CSP/`frame-ancestors`, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy; `X-Powered-By` abilitato.
**Exploit:** clickjacking della dashboard finanza/admin; nessun CSP a contenere un futuro XSS; MIME-sniffing; Referer completo (incl. `callbackUrl`) verso target esterni; fingerprint framework. Mitigato in parte da cookie SameSite=Lax → medium.
**Fix:** `headers()` per `/(.*)`: CSP con `frame-ancestors 'none'` + baseline `default-src 'self'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `poweredByHeader: false`. HSTS **solo** dietro reverse-proxy TLS (la modalità LAN plain-HTTP non deve cachare HSTS per l'IP LAN).

### M4 — Validazione segreti debole: `AUTH_SECRET min(1)` + placeholder che boota in prod (CWE-326/1188, A05)
`src/lib/env.ts:12` accetta un segreto di 1 carattere; `.env.example:11` distribuisce `AUTH_SECRET="replace-with-a-random-32-byte-secret"` (pubblico nel repo). Stessa classe per `JOBS_SECRET="dev-jobs-secret-change-me"`.
**Exploit:** un deployment che copia `.env.example` verbatim passa la validazione con `NODE_ENV=production` → il placeholder è pubblico → chiunque deriva la chiave JWE, forgia un token con `roles:['ADMIN']` e bypassa l'autenticazione. Con `JOBS_SECRET` noto → trigger arbitrario di `POST /api/v1/jobs/expiry-alerts`.
**Fix:** `AUTH_SECRET: z.string().min(32)` + `.refine` che rifiuta il placeholder noto (e `dev-jobs-secret-change-me` per `JOBS_SECRET`) almeno con `NODE_ENV === 'production'`. Aggiornare `.env.example`, `.github/workflows/ci.yml` e il test `env.ci-sync` nello stesso commit.

### M5 — Nessun limite sulla dimensione del body → DoS memoria (CWE-400, A04)
`src/lib/api/handler.ts:269` (`await request.json()`) bufferizza l'intero body prima di Zod; App Router non ha cap di default e `next.config` non ne imposta.
**Exploit:** POST di body da centinaia di MB / JSON profondamente annidato su qualsiasi route pubblica ripetuto → pressione di memoria / OOM sul processo Node, non autenticato.
**Fix:** in `apiRoute` rifiutare quando `Content-Length` supera un cap piccolo (~64 KB per questi schemi) e/o leggere lo stream con un tetto di byte.

---

## LOW

### L1 — SSRF via host SMTP configurabile (CWE-918, A03)
`src/server/adapters/mail/smtp-mail-sender.ts:33` usa `settings.host`/`port` (da `AppSetting`, validati solo `min(1).max(255)` / range porta) come target di connessione. Un admin imposta `host=169.254.169.254`/`127.0.0.1`/host interno e usa "Invia email di prova" → connessione TCP/SMTP verso il target interno → port-scan/probe cieco. **Solo admin, canale cieco** → low.
**Fix:** validare l'host al boundary settings (rifiutare IP privati/loopback/link-local/metadata; risolvere-e-ricontrollare se fattibile) + timeout di connessione.

### L2 — Formula/CSV injection nelle celle degli export Excel (CWE-1236, A03)
`src/server/adapters/excel/workbook.ts:40` scrive stringhe utente (incl. campi PPR **non autenticati**: `firstName` ecc., solo `trim().max(100)`) senza neutralizzare `= + - @`. **Mitigato:** ExcelJS 4.4.0 le serializza come shared-string (`t="s"`), inerti all'apertura; rischio residuo se il destinatario ri-salva come CSV.
**Fix:** prefissare `'` alle stringhe che iniziano con `= + - @ \t \r`, centralmente in `buildWorkbook`.

### L3 — Password admin di default nota `ChangeMe123!` (CWE-1188, A05)
`.env.example:15` + `prisma/seed.ts`/`seed-demo.ts` creano `admin@airmanager.local` (ADMIN, attivo) con quel valore; `env.ts:14` rende `SEED_ADMIN_PASSWORD` **richiesto** anche in prod, normalizzandone la presenza. Se un seed gira su un DB di produzione con il valore d'esempio → account admin noto (repo pubblico).
**Fix:** rendere `SEED_ADMIN_PASSWORD` opzionale in `envSchema` (validato dentro i seed, che già falliscono se assente) e far rifiutare ai seed l'esecuzione con `NODE_ENV === 'production'`.

### L4 — `docker-compose` espone Postgres su tutte le interfacce con credenziali deboli (CWE-1188, A05)
`docker-compose.yml:10` — `airmanager/airmanager` + `ports: - '5432:5432'` (bind 0.0.0.0). Sull'host LAN chiunque in rete legge l'intero DB (PII, scadenze mediche, finanze, e la `smtp.pass` in chiaro di M2). Dev-only → low.
**Fix:** bind su loopback `127.0.0.1:5432:5432` (idem Mailpit 1025/8025).

---

## DEFER (reali ma decisione di deployment/prodotto, o cambio di design più ampio — NON auto-applicati)

### D-A — Oracolo di timing su `forgot-password` (CWE-204, A07) [era L5]
Il ramo account-reale fa una write-transaction sul response path, quello sconosciuto solo una read → il 200 dell'account attivo è misurabilmente più lento. Già documentato come residuo accettato. **Mitigato** dal rate-limit di H4. Chiusura piena = spostare token+email fuori dal response path (background job) — cambio più ampio.

### D-B — Token reset/invite nella query string dell'URL (CWE-598, A07) [era L6]
`auth-tokens.service.ts:23` mette il token in `?token=` (log del proxy/CDN, history, Referer). **Mitiganti presenti:** token SHA-256 a riposo, single-use, TTL 2h; il `Referrer-Policy` di M3 riduce il leak via Referer. Chiusura piena (token nel fragment `#`) = cambio di flusso client/server.

### D-C — JWT 30 giorni su plain-HTTP senza flag Secure (CWE-614, A02) [era C5]
`proxy.ts:100` — in modalità LAN plain-HTTP il cookie non ha `Secure`; il logout non invalida un JWT rubato. **Decisione di prodotto accettata** per la demo LAN. Raccomandazione: documentare TLS come obbligatorio fuori dalla demo, valutare `maxAge` più corto + `sessionVersion` verificata in `jwt-active-check` per rendere logout/deattivazione revocanti.

### D-D — Residuo H1: CPU-exhaustion via rotazione identificativo in deployment senza proxy fidato (CWE-307) [review F2]
Il lockout H1 blocca il guessing focalizzato per-account (10 fail/identifier) e per-IP (30 fail/IP). Ma in deployment **direct-IP / senza reverse proxy fidato** (`meta.ip` null), un attaccante che ruota un'email casuale a ogni richiesta tiene ogni contatore per-identifier ~0 → ogni tentativo esegue comunque un `verifyPassword` Argon2id → CPU-exhaustion non autenticato + crescita illimitata di `LoginAttempt`. **Bounded in produzione dietro un reverse proxy TLS** (il cap per-IP 30/finestra si applica). Chiusura piena = rate-limit globale/proof-of-work o WAF davanti al login; non aggiunto qui per non introdurre un lockout-di-tutti sotto attacco. Raccomandazione: esporre il login solo dietro proxy fidato che imposta l'IP client reale.

---

## Esito review adversarial (Opus 4.8) + remediation

Review adversarial sull'intero batch (`77ee7a5..HEAD`):

- **Verificati corretti e completi**: H3 (tracciati tutti i 12 endpoint idempotenti, non solo i 3 patchati), M1 (fingerprint stabile, params include l'id URL), M2 (AES-GCM/HKDF, passthrough legacy sicuro), M4 (skip `NEXT_PHASE=phase-production-build` corretto, nessun buco prod), H2 (ruoli refreshati e cablati). CSV, docker bind, `method="post"` corretti.
- **Remediati in questo commit**:
  - **F1** (M5): il cap sul body non si fidava più del solo `Content-Length` (bypassabile via chunked/HTTP2) — ora `readJsonBodyCapped` legge lo stream con un tetto rigido di byte.
  - **F3** (H5): la rotazione `x-forwarded-for` permetteva ancora relay email illimitato verso un indirizzo scelto — aggiunto un cap **per-destinatario** (`PPR_PER_EMAIL_RATE_LIMIT_MAX`, case-insensitive), indipendente dall'IP.
  - **F4** (L1): la guardia SSRF ora rifiuta IPv4-mapped IPv6 (`::ffff:…`), loopback espanso, `::`, `0.0.0.0`, link-local `fe80::/10`, e i literal numerici decimale/hex (`2130706433`, `0x…`).
  - Corretto il commento H1 che sovra-dichiarava l'equivalenza di timing del path locked.
- **Residui documentati** (non difetti): D-D (F2 sopra); degrade-catch ampio in accounts/flights (accettato — l'attore vede già quei dati); CSP non contiene XSS di script (`'unsafe-inline'` necessario senza nonce — i veri guadagni sono clickjacking/nosniff/referrer); rotazione `AUTH_SECRET` invalida le password SMTP cifrate (fail-closed, nessun leak); guardia seed solo su `NODE_ENV`.

---

## DISMISS

### DIS-A — `next-auth` pinnato a `5.0.0-beta.31` (CWE-1104) [era config C7]
Canale standard di Auth.js v5 per Next 15/16, nessun CVE noto su beta.31 alla data. Informativo: seguire i rilasci e bumpare quando v5 stabilizza.

---

## Puliti / non-finding (verificati, per evitare falsi positivi)

- **A01 Access control:** ogni route `/api/v1` traccia proxy-gate → `apiRoute.auth` → `authorize()`/own-check; IDOR finanziari chiusi (`assertReadAccess`); PATCH strippano `personId`/`role`/`isActive`; nessun self-approval; mass-assignment solo dietro permessi admin/finance.
- **A03 SQLi/XSS:** tutti `$queryRaw` sono tagged-template parametrizzati; nessun `$queryRawUnsafe`/`Prisma.raw`; nessun `dangerouslySetInnerHTML`/`innerHTML`; email solo `text` (nessun corpo HTML); `orderBy` a campi hardcoded.
- **Open redirect:** guardia `callbackUrl` `/^\/(?![/\\])/` blocca `//host` e `/\host`.
- **Crypto:** Argon2id (default OWASP); token invite/reset 32 byte `randomBytes`, SHA-256 a riposo, single-use TOCTOU-safe; idempotency key `randomUUID`; bearer `JOBS_SECRET` timing-safe.
- **Money:** rate `.positive()`, segni corretti, mutazioni bilancio serializzate `SELECT ... FOR UPDATE`, reversal protetti da unique `reversalOfId`, numerazione PPR atomica, state machine booking/PPR/flight con guardie locked.
- **Data exposure:** `internalErrorResponse` non fa leak di stack; `passwordHash` mappato solo a booleano; GET SMTP omette la password; `.env` gitignored; CI usa segreti fittizi.
- **Pagination/DoS autenticato:** `pageSize.max(100)`; export/PDF tutti dietro auth.

---

## Piano di remediation (work-unit disgiunte)

| Unit | Finding | File principali | Migrazione |
|---|---|---|---|
| FIX-idempotency | H3, M1, M5 | `src/lib/api/handler.ts`, `schema.prisma`, servizi money | sì (fingerprint) |
| FIX-auth-antiabuse | H1, H4 | `authorize.ts`, forgot-password, `auth-tokens.service.ts`, `schema.prisma` | sì (attempt/throttle) |
| FIX-session-roles | H2 | `jwt-active-check.ts` (+ test) | no |
| FIX-ppr-ratelimit | H5 | `ppr.service.ts` (+ test) | no |
| FIX-smtp-crypto | M2, L1 | `app-settings.service.ts`, `smtp-mail-sender.ts`, schema settings, util crypto | no |
| FIX-security-headers | M3 | `next.config.ts` | no |
| FIX-env-hardening | M4, L3 | `env.ts`, `.env.example`, `ci.yml`, `env.ci-sync.test.ts`, seed | no |
| FIX-csv-injection | L2 | `excel/workbook.ts` (+ test) | no |
| FIX-docker-bind | L4 | `docker-compose.yml` | no |

Le unit con migrazione (`FIX-idempotency`, `FIX-auth-antiabuse`) vanno **serializzate** (una migrazione alla volta sul DB condiviso). Le altre toccano file disgiunti. D-A/D-B/D-C restano raccomandazioni (decisioni di prodotto). Ogni unit: `npm run gates` verde prima del commit; a valle, review adversarial (Opus) sulle modifiche.
