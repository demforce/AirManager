---
baseline_commit: e951960
---

# Story 17.8: L'alert job a lotti

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Opus 5 xhigh** (Q-17.8-e = A ratificata: la UI del bottone «Invia promemoria» cambia). Review: Opus 5 xhigh adversarial. **Ordine**: il dev parte **DOPO la 16.8** (che rinomina e generalizza il fan-out `sendAircraftGroundedEmails` e lo chiama anche dall'archiviazione) **e la 16.9** (che porta `expiry-alerts.service.ts:110` su Europe/Rome e riscrive le fixture di `expiry-alerts.service.test.ts:58-293`, cancellando `todayDateOnlyUtc`): ogni `file:riga` qui sotto va **riletto su HEAD** al momento del dev.

## Story

As an **operatore del job scadenze**,
I want che il job scali coi candidati,
so that 1 000 destinatari non scadano il tempo della richiesta con `SentAlert` già consumate (ops cap #3, TD fan-out AOG-1b).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.8»; `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` cap #3; decisione PO AOG-1b 1b-5 (`aog-1b-avviso-prenotazioni-email.md:524`: «TD verso la 17.8, invii fuori richiesta per alert e AOG insieme; nessun cap ora»); TD-19.9-a (`19-9-…md:452,617`: il filtro archiviati/tipi disattivati del job è assegnato alla 17.8; R-16-c è già ratificata). Sovrapposizioni con l'audit 2026-11-02 (untracked): BL-10, P7, O1 (nessun cron), S-15 (`socketTimeout`).

## Stato su HEAD (misurato il 2026-11-03)

- **Ingressi**: rotta cron `src/app/api/v1/jobs/expiry-alerts/route.ts:32-49` (scritta a mano senza `apiRoute`; `JOBS_SECRET` assente → 500 `:33-37`; Bearer timing-safe `src/server/auth/jobs-bearer.ts:41`; PUBLIC in `src/proxy.ts:38`); trigger di sessione `src/app/api/v1/expiry-alerts/trigger/route.ts:19-24` (`settings.manage`) = bottone «Invia promemoria» (`scadenze-console.tsx:363-375`, legge solo `holderEmailsSent`/`digestEmailsSent`). **Il cron non esiste** (nessuno scheduler: audit 11-02 `engineering.md` O1; lo spine AD-9 dice «cron esterno»). Nessun `maxDuration`; in Node self-hosted il timeout lato client NON interrompe l'handler.
- **Algoritmo** (`src/server/services/expiry-alerts.service.ts`): `:110` oggi (UTC fino alla 16.9), `:111` orizzonte = oggi + 60; `:113-116` un solo `findMany` **senza `take`**, `where: { expiresAt: { lte: horizon } }` che non filtra persone archiviate, tipi disattivati né righe già consumate; ciclo seriale `:123-189`: soglie dovute meno consumate (`:124-126`), **`sentAlert.createMany` PRIMA dell'invio** (`:132-145`, P2002 ignorato, ogni altro errore rilanciato — anche P2003 se la scadenza è stata cancellata a metà run), `user.findUnique` per candidato (`:159`, N+1), template, `send` (`:167`); invio fallito → `SEND_FAILED` con soglie **già consumate** (`:170-176`); senza email → consumate, `NO_EMAIL` (`:177-180`); `:191-208` un digest per admin attivo con tutti gli item del run. L'ordine «inserimento prima dell'invio» è la scelta documentata AD-9 (`:32-44`: «mai più di un avviso per soglia» prevale su «mai perderne uno»).
- **Adattatore mail** (`src/server/adapters/mail/smtp-mail-sender.ts:18-53`): per OGNI invio una lettura `getSmtpSettingsForMailer()` (1 query + decrittazione, `app-settings.service.ts:283-304`) e un **nuovo transport** nodemailer (TCP + handshake, nessun pool); `connectionTimeout`/`greetingTimeout` 10 s, **nessun `socketTimeout`** (default nodemailer 10 min, audit S-15).
- **Fan-out AOG-1b** (`aircraft.service.ts`): `:421` `await sendAircraftGroundedEmails(...)` DENTRO la richiesta, dopo il commit (il doc `:455` dice «fire-and-forget»: falso); letture a lotto (`:483-528`, 2 `findMany`), invio seriale. Misura storica: 21 destinatari = 1 517-1 615 ms contro 16-27 ms a zero (≈ 71-76 ms per destinatario su Mailpit locale, review AOG-1b §3.8).
- `prisma.ts:43` `transactionOptions { maxWait: 2000, timeout: 5000 }` (17.1): una transazione non può contenere un lotto di invii.

**Conteggi su `airmanager_load`** (2026-11-03): `Expiry` 10 804, `SentAlert` 6 763; persone 5 007 (250 archiviate); tipi 6 (0 disattivati); admin attivi 4. La query attuale carica 4 300 righe, di cui 2 182 senza nulla da consumare (rilette a ogni run, P7). **Candidati con almeno una soglia da consumare: 2 118** (1 809 persone, 6 619 `SentAlert` da scrivere), di cui 105 su persone archiviate → **2 013** col filtro R-16-c. A regime ≈ 81 nuovi avvisi al giorno (max 99). Costo della query 2 ms: il costo vero sono gli invii. Stima pre-fix: un run ≈ 2 118 email + 4 digest da ~2 118 righe ≈ **160 s in una richiesta**.

## Acceptance Criteria

1. **Candidati nel `where`**: *Given* il job *When* legge i candidati *Then* il `where` contiene l'`OR` su `EXPIRY_ALERT_THRESHOLDS` di `{ expiresAt ≤ oggi+T, sentAlerts: { none: { threshold: T } } }`, `person: { archivedAt: null }` e `expiryType: { isActive: true }` (R-16-c, TD-19.9-a); ordine `(expiresAt asc, id asc)`; pagine a **keyset** (mai offset: le righe processate escono dall'insieme). Parità: sulla copia del load DB l'insieme in attesa = **2 013**, uguale alla SQL di controllo riportata nel record; righe completamente consumate rilette = 0.
2. **Tetto per run**: *Given* più di `CAP` candidati in attesa *When* il run finisce *Then* ne ha processati esattamente `CAP`, i più urgenti, e la risposta riporta `remaining`; il run successivo riprende dai successivi; dopo ⌈2 013/`CAP`⌉ run `remaining` = 0 e un run ulteriore è a vuoto (0 email, 0 `SentAlert`, nessun digest). Nessuna tabella cursore: lo stato è l'insieme in attesa. Valore di `CAP`: §PO Q-17.8-a.
3. **Invio fallito**: comportamento da §PO Q-17.8-b/c. `NO_EMAIL` resta consumato come oggi (`:45-49`).
4. **Concorrenza**: *Given* due run concorrenti (cron e «Invia promemoria») *Then* ogni soglia produce al massimo un'email al titolare; unit con P2002 su `createMany` → nessun `send`.
5. **N+1 eliminato**: una sola `user.findMany` per pagina per le lingue (modello AOG `:501-503`); `user.findUnique` mai chiamato.
6. **Costo misurato**: *Given* una **copia isolata** del load DB e un **Mailpit dedicato** *When* misuro un run pre-fix e i run post-fix *Then* registro nel Dev Agent Record e in `docs/operations/load-testing.md` durata del run, ms per destinatario (settings + transport + invio + template separati) e query per destinatario; ogni run post-fix sta sotto un tetto di tempo dichiarato (≈ `CAP` × costo misurato).
7. **Contratto**: `expiryAlertsJobResultSchema` (`src/lib/schemas/expiry-alerts.ts:8-14`) aggiunge `remaining`; descrizioni in `registry.ts:1547-1556` e `:1818-1826`; fixture `RESULT` di `route.test.ts:34`. Cambia il significato di `candidates` (da «righe ispezionate» a «processate in questo run»): dichiararlo nella descrizione.
8. **Fan-out velivolo** (§PO Q-17.8-d): se A, *Given* un fermo con 21 titolari APPROVED *When* `POST /out-of-service` *Then* la risposta non dipende da N (< 100 ms contro 1 517-1 615 ms), le email arrivano comunque (`aog-impact-email.spec.ts` verde) e restano best-effort; idem per l'archiviazione della 16.8.
9. **Invarianti**: `@@unique([expiryId, threshold])` invariato; un digest per admin per run con solo gli item di quel run; unit ed e2e esistenti verdi salvo i pin elencati in §Dev Notes; nessuna migrazione con D-T2 (iii).
10. **Gate**: `npm run gates` verde; e2e via `scripts/e2e.sh` (baseline al momento del dev, oggi 606); ogni guardia nuova nasce con una discriminanza rossa sul pre-fix (D1-D7), provata **solo su copia isolata** con sha256.

## Tasks / Subtasks

- [ ] Rileggere su HEAD (dopo 16.8/16.9) le righe citate; ri-misurare i conteggi sulla copia del load DB (AC 1, 6).
- [ ] Riscrivere la query candidati (AC 1) e il ciclo a pagine keyset con tetto (AC 2), `remaining` (AC 7), lingue a lotto (AC 5).
- [ ] Meccanismo dell'invio fallito secondo §PO (AC 3, 4), stop dopo K fallimenti di trasporto consecutivi e P2003 → saltato (D-T6).
- [ ] Fan-out velivolo secondo §PO Q-17.8-d (AC 8).
- [ ] UI del bottone secondo §PO Q-17.8-e; copy `Emails.expiryDigest.sendFailedFlag` riscritta se il ritentativo diventa automatico (glossario + `messages.test.ts`).
- [ ] Unit D1-D7 (sotto) e adeguamento dei pin; misura AC 6; Dev Agent Record.

## Dev Notes

**Decisioni tecniche della sessione principale** (non sottoposte al PO):
- **D-T1** ripresa senza cursore persistito: l'insieme in attesa si descrive da sé (AC 1); pagine keyset di dimensione ≤ `CAP`.
- **D-T2** con Q-17.8-c = B: (iii) prenotazione via `createMany` prima dell'invio (P2002 invariato), poi **rilascio** delle sole soglie di questo run se `send` fallisce (`deleteMany` mirato: è un nuovo scrittore su una tabella che l'ops-audit verifica append-only `ops-audit.md:74` — dichiararlo). Con Q-17.8-c = A: inserimento dopo l'invio + lease di run (tabella o advisory lock), con migrazione.
- **D-T3** `CAP` = costante esportata `EXPIRY_ALERTS_MAX_PER_RUN`, parametro iniettabile negli unit; niente env (un `.default` è invisibile a `env.ci-sync.test.ts`) né AppSetting (trascinerebbe `@/server/crypto` + `@/lib/env` negli unit).
- **D-T4** risultato: solo `remaining` in più. **D-T5** lingue con una `findMany` per pagina; transport riusato per run (`pool`) solo se la misura mostra che domina. **D-T6** stop del run dopo 3 fallimenti di trasporto consecutivi (il resto resta in coda); P2003 → saltato. **D-T7** fan-out fuori richiesta col precedente `void …catch` (`auth-tokens.service.ts:170`), service indipendente da Next; `socketTimeout` (S-15) fuori perimetro (tocca tutti i mittenti).

**Blast radius**: `expiry-alerts.service.ts` (doc AD-9 `:15-60`, tipo del risultato `:61-72`, `CANDIDATE_SELECT` `:88-102`, query `:113-116`, ciclo `:123-189`); `expiry-alerts.service.test.ts` (337 righe, 22 casi — si rompono `:87-96` che legge `where.expiresAt.lte`, `:225-244` «SMTP fails → thresholds still consumed» che si ribalta con Q-17.8-b = A, i mock `user.findUnique` `:35/:79`; restano validi P2002 `:190-206`, nessun digest a zero `:291-301`, lingue `:246-266`); `src/lib/schemas/expiry-alerts.ts`; `registry.ts`; `route.test.ts:34`; `templates.ts:173-183` (doc del digest); `messages/{it,en}.json` `Emails.expiryDigest.sendFailedFlag` (oggi «verificare l'indirizzo o riprovare»); se UI: `scadenze-console.tsx:373-375` e la chiave `reminders.sent`; se fan-out fuori richiesta: `aircraft.service.ts:421` + doc `:455-482` e `aircraft.service.test.ts:836-990` (l'ordine `['tx-start','updateMany','booking.findMany','tx-end']` resta, le asserzioni su `sendMock` `:908/:958/:979` vanno attese dopo il ritorno); `docs/operations/load-testing.md`. Nessun file di produzione nuovo.

**e2e che fissano il comportamento attuale**: `e2e/expiry-alerts.spec.ts:132-217` (email al titolare, idempotenza via conteggio Mailpit per destinatario univoco, digest «senza email»), `:221-264` (trigger e 403), helper Mailpit `:49-102` (attesa 15 s); `e2e/mobile-expiries-movements.spec.ts:444-456` (bottone + toast 30 s); `e2e/aog-impact-email.spec.ts:163-288/:331/:559` (catena serializzata; l'asserzione negativa sul PENDING `:285-286` viene dopo le due attese positive). Il primo run di un test raggiunge la scadenza univoca solo se `CAP` ≥ i candidati accumulati dalla suite fra due chiamate: verificarlo; il tetto si prova solo negli unit.

**Misura (AC 6)**: copia isolata `pg_dump airmanager_load | psql airmanager_load_178` (`createdb -T` fallisce se qualcuno è connesso al template); **MAI lanciare il job su `airmanager_load`**: consumerebbe 6 619 `SentAlert` in modo permanente sul gemello di tutto l'Epic 17. Server su porta libera (3100) con `JOBS_SECRET` reale e `SMTP_PORT` verso un **Mailpit dedicato** (porte ≠ 1025/8025: il Mailpit condiviso tiene 500 messaggi e 2 000 invii cancellerebbero quelli di un e2e in corso). `scripts/perf/bench.mjs` supporta `method: POST` (`:140`). Copia nuova per ogni serie. Il DB gemello lo crea/cancella la sessione principale se il classifier blocca il subagent.

**Discriminanze** (rosse sul pre-fix simulato, solo su copia isolata `cp src messages config`, `node_modules` in symlink, sha256 prima/dopo): D1 3 in attesa e `CAP`=2 → 2 `send` (pre-fix 3); D2 `send` che lancia → nessuna `SentAlert` resta (se Q-17.8-b = A); D3 forma del `where` (OR per soglia, `archivedAt` null, `isActive`); D4 seconda pagina con cursore `(expiresAt, id)`; D5 `user.findUnique` mai chiamato; D6 P2003 → saltata (pre-fix: 500); D7 (fan-out fuori richiesta) `send` che non si risolve mai, `setOutOfService` si risolve lo stesso.

**Trappole**: validazione eager dell'env (lo unit mocka `prisma`, `@/server/adapters/mail`, `templates` `:4-28`; verifica `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`); due run concorrenti con «invio poi inserimento» senza lock mandano lo stesso lotto due volte (`pg_advisory_xact_lock` dentro una transazione ha il tetto di 5 s; l'advisory di sessione non è affidabile col pool); gare con chi azzera/cancella `SentAlert` (`updateExpiry` `expiries.service.ts:314`, rinnovo quota `membership.service.ts:155`, `deleteExpiry` cascade); SMTP irraggiungibile = 10 s per invio × `CAP` (D-T6); col cron orario il bordo 00:00-02:00 Roma diventa frequente (dopo la 16.9 vale Roma). `registry.ts` e altri file condivisi: commit SEMPRE con pathspec, mai `git stash`.

**Fuori scope**: BL-10 (visita medica già coperta da un'altra visita valida, 14 casi su 858 sul DB di carico) → TD; il cron stesso (story di deploy, audit O1); `socketTimeout` globale (S-15); `JOBS_SECRET` solo `min(1)` (M4 residuo); la currency senza email (CR A8).

**Dimensione**: ~8-12 file, +450/+750 −120 (quasi tutto unit), ≈ 1/4-1/5 della 19.7a. Nessuno split.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.8, §Architettura e vincoli, §Regole di processo
- `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` cap #3; `aog-1b-avviso-prenotazioni-email.md:524`; `19-9-avviso-deroga-voli.md:452,617`
- `scripts/perf/README.md`, `docs/operations/load-testing.md`

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Q-17.8-a — promemoria per giro** = A: `CAP` = **200** (≈ 15 s a 76 ms), i più urgenti prima (scadenza crescente), gli altri al giro successivo; un giro ogni ora, da configurare nella story di deploy (oggi il cron non esiste, O1); un riepilogo agli amministratori per giro.
- **Q-17.8-b — invio fallito** = A: si ritenta al giro dopo finché non parte; il riepilogo lo segnala a ogni tentativo (riscrivere `Emails.expiryDigest.sendFailedFlag`).
- **Q-17.8-c — crash durante un invio** = B: può perdersi quel solo promemoria (come oggi), mai un doppio → AC 3 riformulato «la soglia resta consumata solo se l'invio è riuscito», meccanismo D-T2 (iii), nessuna migrazione.
- **Q-17.8-d — email «velivolo fuori servizio/archiviato»** = A: partono dopo la risposta (best-effort, `void …catch`, D-T7); AC 8 in perimetro.
- **Q-17.8-e — dopo «Invia promemoria»** = A: l'admin vede «altri N in coda, partiranno al prossimo giro» → la story tocca UI: **dev Opus 5 xhigh**.
- BL-10 (visita medica già coperta da un'altra visita valida) = fuori scope, TD (decisione della sessione principale).


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
