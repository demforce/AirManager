---
baseline_commit: 0d4e008
---

# Story TD-2: Idempotenza delle richieste sui POST monetari

Status: ready-for-dev

## Story

As a staff,
I want che un retry di rete di una registrazione monetaria non possa MAI registrarla due volte,
so that ricariche, rettifiche, vendite pacchetto, voli e movimenti cassa restino corretti anche su connessioni instabili (finding 3.1 O2, valutato epic-wide come promesso).

## Acceptance Criteria

1. **Given** due POST identici con lo stesso header `Idempotency-Key` (retry di rete), **When** il primo è andato a buon fine, **Then** il secondo NON riesegue la mutazione e riceve la STESSA risposta (stesso status, stesso body) con header `Idempotency-Replayed: true`.
2. **Given** due POST CONCORRENTI con lo stesso key, **Then** esattamente UNO esegue; l'altro riceve 409 `IDEMPOTENCY_IN_PROGRESS` (se il primo non ha ancora finito) o il replay (se ha finito). Provato con richieste parallele reali.
3. **Given** un POST senza header, **Then** comportamento invariato (il key è opt-in: i client esistenti e gli e2e attuali non si rompono).
4. **Given** un POST fallito con errore 4xx, **Then** il key torna riutilizzabile (il record viene rimosso): l'utente corregge e re-invia con lo stesso key senza restare bloccato.
5. Gli endpoint coperti sono TUTTI i POST monetari: top-up, rettifica, vendita pacchetto, registrazione volo, movimento cassa manuale. (Gli storni/correzioni restano protetti dai loro unique `reversalOfId` esistenti — documentare, non duplicare la protezione.)
6. Le form UI dei 5 endpoint inviano il key (`crypto.randomUUID()`), rigenerato a ogni risposta ricevuta dal server (successo O errore applicativo) e CONSERVATO quando la fetch fallisce a livello di rete — è esattamente il caso che protegge.
7. OpenAPI documenta l'header sui 5 endpoint; migrazione pulita su DB fresco; unit + e2e (replay, concorrenza, opt-out).

## Contesto e decisioni di design (vincolanti)

- **Nuovo modello Prisma `IdempotencyRecord`**: `id` cuid, `userId` (FK RESTRICT a `User`), `endpoint` String, `key` String, `responseStatus Int?`, `responseBody Json?`, `createdAt`, `completedAt DateTime?`; `@@unique([userId, endpoint, key])`. Il record è per-UTENTE: lo stesso key da utenti diversi non collide (niente cross-user replay/DoS). Migrazione hand-written col pattern consolidato (`migrate diff`, banner strippato). NESSUN job di cleanup in questa story (crescita lenta, tabella piccola — decisione documentata nel doc-comment del modello).
- **Integrazione nel layer API, NON nei service** (AD-5 resta intatto: i service non sanno nulla di HTTP): nuova opzione `idempotency?: { endpoint: string }` di `apiRoute` (`src/lib/api/handler.ts`). Quando presente E l'header `Idempotency-Key` c'è (validato: 1–200 char, altrimenti 422 envelope `VALIDATION_ERROR`):
  1. `create` del record con `responseStatus: null` (PENDING). Su P2002 → rileggere: se `responseStatus != null` → **replay** (`NextResponse.json(responseBody, { status: responseStatus, headers: { 'Idempotency-Replayed': 'true' } })`); se ancora PENDING → 409 envelope `IDEMPOTENCY_IN_PROGRESS` ('The same request is still being processed — retry in a moment.').
  2. Eseguire `handle` normalmente. Successo → update del record con status+body serializzato, POI risposta. Errore (DomainError O sconosciuto) → `delete` del record nel `catch`/prima del re-throw (i service sono transazionali: un errore = nessuna scrittura avvenuta, il key DEVE tornare libero — AC 4).
  3. `auth: 'public'` + `idempotency` insieme = errore di programmazione: lanciare in fase di costruzione della route (il record richiede `userId`).
- **Crash window documentata (stesso trade-off di AD-9)**: un crash del processo TRA il commit della mutazione e l'update del record lascia un PENDING orfano → i retry con quel key ricevono 409 per sempre. Accettato e documentato nel doc-comment: il client risolve inviando un nuovo key dopo verifica manuale; NESSUNA auto-scadenza dei PENDING (auto-scadenza = rischio di doppia esecuzione, peggio del blocco).
- **`responseBody` è il JSON già serializzabile che `handle` ritorna** — attenzione ai 204: nessuno dei 5 endpoint coperti risponde 204 (tutti ritornano un DTO), quindi il caso non esiste; mettere comunque un guard esplicito (se `successStatus === 204` e `idempotency` configurata → throw in costruzione, con commento).
- **Endpoint coperti e nomi `endpoint`** (stringhe stabili, usate nell'unique): `account-topup` (POST `/people/{id}/account/top-ups`), `account-adjustment` (POST `/people/{id}/account/adjustments`), `package-sale` (POST `/people/{id}/packages`), `flight-register` (POST `/flights`), `cash-movement` (POST `/cash-movements`). Verificare i path reali nelle route file (i nomi qui sono descrittivi). NON coprire: storni/correzioni/decide (già idempotenti via unique `reversalOfId`/guard esistenti — aggiungere una riga di doc-comment su ciascuno che lo dice), job route (bearer, fuori sessione), CRUD cataloghi (non monetari, unique naturali sui nomi).
- **Nota bene**: l'header attraversa `src/proxy.ts`? Verificare che il middleware non strippi header custom (non dovrebbe — è solo un gate). Niente entry in `PUBLIC_API_PATHS`.
- **UI (AC 6)**: nelle 5 form (top-up in `account-panel.tsx`, rettifica in `account-statement-table.tsx`, vendita in `packages-panel.tsx`, volo in `flights-manager.tsx`, cassa in `cash-register.tsx`): stato locale `idempotencyKey` inizializzato `crypto.randomUUID()`; la fetch di submit aggiunge l'header; al ritorno di QUALSIASI risposta HTTP (ok o errore applicativo) si rigenera; se la fetch LANCIA (network error) il key resta. Pattern identico nei 5 punti (nessuna astrazione nuova se non un piccolo hook condiviso `useIdempotencyKey()` in `src/lib/` client-side, se riduce la duplicazione — a giudizio del dev, dichiararlo).
- **OpenAPI**: header param opzionale riusabile (componente `IdempotencyKey` header) registrato sui 5 path; aggiornare il coverage test del registry se conta i componenti.
- **Test**: unit sul wrapper (replay con body identico, PENDING→409, errore-libera-il-key, senza header = pass-through, header su route senza config = ignorato); e2e su UN endpoint rappresentativo (top-up): stesso key sequenziale → un solo `AccountMovement` e risposta replay identica + header `Idempotency-Replayed`; due POST PARALLELI stesso key → esattamente un movimento (lezione 6.2: race provate con richieste parallele reali); key diversi → due movimenti. Osservabili run-unique (lezione 6.3 F1).

## Tasks / Subtasks

- [ ] **T1 (AC 7)** — Modello `IdempotencyRecord` + migrazione hand-written + verifica su DB fresco.
- [ ] **T2 (AC 1-4)** — Opzione `idempotency` in `apiRoute` + envelope `IDEMPOTENCY_IN_PROGRESS` + unit test completi del wrapper.
- [ ] **T3 (AC 5)** — Config sui 5 endpoint + doc-comment sugli endpoint già naturalmente idempotenti + OpenAPI header + coverage.
- [ ] **T4 (AC 6)** — Wiring UI nelle 5 form (+ eventuale hook condiviso, dichiarato).
- [ ] **T5 (AC 1-2)** — e2e: replay sequenziale, race parallela, opt-out; su osservabili run-unique.
- [ ] **T6** — Gates: lint/typecheck/unit/build/e2e su DB fresco; aggiornare story file (Dev Agent Record) e sprint-status.yaml (td-2 → review).

## Dev Notes

- Ambiente come TD-1 (Mailpit attivo, DB fresco fornito dalla sessione principale; il dev NON resetta il DB; `curl localhost:3000` deve fallire prima di ogni run e2e; build `env -u NODE_ENV npx next build`; MAI `playwright install`).
- UN commit di implementazione (`Story TD-2: ...`). Messaggi server English-only; niente stringhe UI nuove salvo eventuali errori form (IT/EN simmetrici).
- Il wrapper NON deve alterare di un byte il comportamento delle route senza header (AC 3): gli e2e esistenti sono il canarino.

### References

- [Source: _bmad-output/implementation-artifacts/3-1-accounts-topups.md#Review Record — O2]
- [Source: src/lib/api/handler.ts — apiRoute; src/lib/api/pagination.ts]
- [Source: docs/handoffs/HANDOFF.md — lezioni operative; AD-8 envelope; AD-9 trade-off crash-window]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-08: Story file created (Fable 5 main session) — scioglie il deferral 3.1 O2 su decisione utente ("fix everything before epic 7").
