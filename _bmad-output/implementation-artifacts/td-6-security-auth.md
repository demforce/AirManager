---
baseline_commit: a1bbfb9
---

# Story TD-6: Security findings post-Epic 13 — revoca sessioni al reset password (F1) + login-lock atomico (F2)

Status: ready-for-dev

## Story

As a titolare di un account AirManager,
I want che il reset della password sfratti davvero ogni sessione esistente e che il tetto di tentativi di login regga anche sotto burst concorrenti,
so that la rotazione delle credenziali sia un rimedio efficace e il brute-force resti limitato al cap configurato.

**Riferimenti vincolanti**: report Claude Security `CLAUDE-SECURITY-20260723-073138/CLAUDE-SECURITY-RESULTS.md` (findings F1/F2, verificati 3/3 dal panel — il report PRESCRIVE i fix, seguirlo); decisione utente 2026-07-24 (fix in coda post-Epic 13) + mandato "procedi" 2026-07-26.

## Acceptance Criteria

1. **(F1 — MEDIUM CWE-613: revoca sessioni al set-password)** `User` guadagna un watermark di versione sessione: **`tokenVersion Int @default(0)`** (migrazione Prisma; scelto l'intero rispetto a `sessionsValidFrom` per evitare semantiche di clock — il report ammette entrambi). Flusso: (a) al sign-in il valore corrente viene STAMPATO nel JWT (callback `jwt`, dove oggi si stampano `userId`/`roles` — v. `auth.config.ts`/`auth.ts`); (b) `applyActiveRecheck` (`src/server/auth/jwt-active-check.ts:23` — già seleziona la riga User) seleziona anche `tokenVersion` e ritorna **`null`** (= fine sessione, stesso percorso di eviction dei disattivati) se il claim del token NON coincide col DB; un claim MANCANTE (JWT emesso prima della migrazione) = stale → eviction (logout una-tantum al deploy, accettato e da documentare); (c) `setPasswordWithToken` (`auth-tokens.service.ts:185-209`) BUMPA `tokenVersion` DENTRO la transazione esistente (stessa atomicità del claim del token) — copre sia INVITE sia PASSWORD_RESET, esattamente il gap del report ("anche il re-invito admin non chiude le sessioni"). Semantica accettata: la sessione dell'attaccante muore al PRIMO recheck utile, **grace ≤15 min** (`ACTIVE_RECHECK_INTERVAL_MS` — coerente con la regola "max 15 min di grazia" di story 1.4; NON accorciare l'intervallo). La NUOVA sessione post-reset porta il valore bumpato e vive normalmente.
2. **(F2 — LOW CWE-367: check-and-count atomico sul login-lock)** In `authorizeCredentials` (`src/server/auth/authorize.ts`) la finestra check→verify→record non è atomica: un burst concorrente supera il cap di 10 verify Argon2/finestra. Fix: rendere atomico il check-and-count in `login-throttle.ts`. Due opzioni ammesse (il dev sceglie e MOTIVA nel Dev Agent Record): **(a) prenotazione atomica** — in UNA transazione (advisory lock `pg_advisory_xact_lock` sull'hash dell'identifier, o equivalente) contare e inserire SUBITO la riga failed "pessimista" se sotto cap, PRIMA del verify; su successo `recordSuccessfulLogin` già cancella le failed dell'identifier (pulizia gratis, semantica esistente); su fallimento la riga c'è già; sopra cap → NESSUN insert (preservata la proprietà anti-DoS "un flood non ri-estende la finestra di lockout", doc-comment `login-throttle.ts:66-74`); **(b) advisory lock per-identifier** attorno a check+verify+record (serializza il verify: più semplice ma tiene il lock durante Argon2). Vincoli INVARIANTI: stessa postura anti-enumeration (nessuna differenza di risposta/timing tra identifier esistente e no — oggi le failed si registrano per QUALUNQUE identifier), cap per-IP invariato, errore generico invariato.
3. **(Test)** Unit: `applyActiveRecheck` (funzione pura con `now` iniettabile — perfettamente testabile) su match→token, mismatch→null, claim mancante→null; `setPasswordWithToken` bumpa la versione nella stessa transazione (spy/DB); throttle atomico (la prenotazione è condizionale-atomica; se opzione (a): sopra cap nessun insert). e2e: flusso reset completo via Mailpit ANCORA verde (spec esistenti `login.spec.ts`/`expiry-types.spec.ts` usano invite/reset — non indebolirli); un e2e nuovo SOLO se economico e robusto (l'eviction a 15 min NON si e2e-izza con un wait — la copertura del recheck è unit, con `now` iniettato). La FULL SUITE CI=1 su build prod è l'arbitro.
4. **(Perimetro)** Nessun cambio di API pubblica/OpenAPI (nessuna route nuova); nessuna env var nuova (altrimenti: `.env.example`+ci.yml+hook nello stesso commit, test `env.ci-sync` lo impone); UX di login/reset INVARIATA (stessi messaggi generici). `src/proxy.ts` (edge, solo `getToken`) NON fa recheck — invariato per design, documentarlo se toccato da vicino.

## Contesto (puntatori — ricognizione 2026-07-26)

- Report: `CLAUDE-SECURITY-20260723-073138/CLAUDE-SECURITY-RESULTS.md` §Findings (testo integrale dei 2 findings, exploit scenario, fix prescritto).
- F1: `auth-tokens.service.ts:185-209` (`setPasswordWithToken`, transazione esistente con claim atomico del token); `jwt-active-check.ts` (`applyActiveRecheck`, select `isActive`+`roles`, watermark `lastActiveCheck`, contratto null=fine sessione); callback jwt in `auth.config.ts`/`auth.ts` (dove nasce il token con `userId`/`roles` — trovare il punto esatto e il type-augmentation del JWT per il claim nuovo).
- F2: `authorize.ts` (`authorizeCredentials`: isLoginLocked → verify → recordFailedLoginAttempt/recordSuccessfulLogin); `login-throttle.ts` (cap 10/identifier + 30/IP, finestra 15 min, doc-comment anti-DoS sul non-ri-estendere la finestra).
- Migrazione: pattern delle migrazioni recenti in `prisma/migrations/` (es. `20260723120000` drop issuedAt). Seed: nessun impatto atteso (default 0).
- **Ambiente**: ciclo e regole macchina IDENTICI all'Epic 13 — v. `docs/handoffs/HANDOFF.md` (DB fresco al dispatch, gates prima del commit, `export JOBS_SECRET=<non-placeholder>` per la suite CI=1, e2e foreground su file, MAI push, MAI playwright install, NON toccare package.json, git add file-by-file, churn untracked intoccabile). Commit: `feat(td-6): security — revoca sessioni al set-password (tokenVersion) + login-lock atomico` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Session store server-side / refresh token / logout globale UI: il meccanismo resta JWT stateless + recheck (il watermark è il fix minimo prescritto).
- Cambi all'intervallo di recheck (15 min) o ai cap del throttle (10/30): sono ratificati da story precedenti.
- Gli altri 13 candidate findings scartati dal panel: NON riaprirli.

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
