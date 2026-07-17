---
baseline_commit: f9d518f
---

# Story 12.11: Scadenze + Impostazioni + METAR (+ quota associativa, KPI utilizzo flotta)

Status: ready-for-dev

## Story

As a admin dell'aviosuperficie (e staff per le scadenze),
I want le pagine Scadenze e Impostazioni nel design AirOps — registro scadenze a finestre 7/30/60 con promemoria, settings reali (club, pianificazione, SMTP con email di prova, catalogo abilitazioni, stazione METAR, quota associativa) e il widget meteo live in sidebar — più il KPI "Utilizzo flotta" rinviato dalla 12.10,
so that la configurazione dell'aviosuperficie e il presidio delle scadenze vivano nel nuovo linguaggio su dati e servizi reali, senza perdere il job di alert esistente.

**Riferimenti vincolanti**: spec §3 (righe Scadenze + Impostazioni + widget meteo) + §5.5 (METAR) + §5.7 (SMTP) + §6 (rimozione pagina `expiries/types`) + D11/D13; piano Task 11; prototipo `docs/design-reference/airops/src/ScadenzeView.jsx` + `SettingsView.jsx` + `Sidebar.jsx:57-72` (weather-card) + `data.jsx:184-190` (RATING_TYPES); story 12.10 (ratifica 2: KPI utilizzo qui) e richiesta PO 2026-07-17 (quota associativa).

## Ratifiche utente (2026-07-17, AskUserQuestion pre-dispatch — regola AI-2)

1. **Quota associativa = setting + azione per-pilota, tracciata nelle SCADENZE.** Ratificata la proposta base (chiave settings `membership.annualFeeCents` in card Club + azione per-pilota "Addebita quota associativa"), con precisazione PO: "è annuale quindi andrà a far parte delle scadenze" → due follow-up ratificati: **(1a)** l'azione fa **addebito + rinnovo scadenza in un solo gesto** (movimento `ADJUSTMENT` sul conto E create/renew della Expiry "Quota associativa"; il tipo viene creato automaticamente se assente); **(1b)** validità **+12 mesi dal pagamento** (rolling: base = `max(oggi, expiresAt corrente)` — il rinnovo anticipato estende dalla scadenza corrente, non da oggi). NIENTE azione batch. Nota verificata in recon: come scadenza, la quota eredita i promemoria automatici ai titolari del job 6.3 — nessuna email nuova da costruire.
2. **Validità (mesi) sul catalogo: migrazione ADDITIVA.** `validityMonths Int?` su ExpiryType, usata per PRECOMPILARE `expiresAt` alla registrazione (editabile; 0/null = senza scadenza, nessun ricalcolo retroattivo). Unica migrazione della story.
3. **`BOOKING_OUTSIDE_WINDOW`: 422 SOLO per orario open–close e anticipo max.** `minSlot`/`turnaround` restano ADVISORY (default/validazioni UI, nessun rifiuto server). Settings assenti = nessun vincolo nuovo (backward-safe).
4. **"Invia promemoria": SOLO ADMIN** (gate `settings.manage`; bottone visibile solo ad ADMIN). Il desiderio espresso contestualmente dal PO ("vorrei una mail automatica ai piloti riguardo le loro scadenze") è GIÀ soddisfatto: `runExpiryAlertsJob` manda già l'email al titolare a 60/30/7/0 giorni + digest staff (story 6.3, verificato in `expiry-alerts.service.ts` in questa sessione) — nessuno scope nuovo; il trigger manuale è un re-run idempotente dello stesso job.

## Acceptance Criteria

1. **(Settings keys + servizi — TDD, NESSUNA env nuova)** Estendere `app-settings.service.ts` col pattern get/set narrow esistente (upsert per chiave, write `settings.manage`): `sched.{openTime,closeTime,minSlotMinutes,turnaroundMinutes,maxAdvanceDays}`, `smtp.{host,port,security,user,pass,from}` (**pass WRITE-ONLY**: mai restituita da GET — placeholder in UI), `metar.station` (default = `airfield.icao`), `membership.annualFeeCents` (ratifica 1). **Mailer settings-first**: `SmtpMailSender` legge le chiavi settings con FALLBACK alle env attuali (`SMTP_HOST/SMTP_PORT/MAIL_FROM`) quando assenti; `security` mappa none/STARTTLS/SSL-TLS su `secure`/`requireTLS`; auth solo se user+pass presenti. NIENTE nuove env var → env contract/CI INVARIATI (`env.ci-sync.test.ts` verde senza modifiche). Route settings nuove thin (`PUT /api/v1/settings/...`) coerenti con `settings/airfield`. Unit test: get/set per chiave, write-only della password, fallback mailer, bound importi.
2. **(Pagina Impostazioni — port `SettingsView.jsx`)** Riscrittura completa `/dashboard/settings` (ADMIN, `settings.manage`, registry `settings` → `airopsNative:true`): card **Club** (nome, ICAO, email di contatto + i controlli esistenti tassa PPR e istruzioni operative — piano — + quota associativa, ratifica 1), card **Pianificazione** (5 campi con `.hint`), card **Email (SMTP)** con **"Invia email di prova" REALE** (invia via mailer corrente all'email di contatto; feedback esito; e2e via Mailpit), card **Abilitazioni** = CRUD `expiry-types` esistente (name, scope, `blocksBooking` PRESERVATO, validità secondo ratifica 2; 0/vuoto = senza scadenza con badge come prototipo). Markup/classi 1:1 (`form-grid`, `Field`, `input-group`, `.hint`); formatter D11; "Salvato" badge client-side. La pagina legacy settings (solo branding) è sostituita; `PUT settings/airfield` resta.
3. **(Pagina Scadenze — port `ScadenzeView.jsx`)** `/dashboard/expiries` AirOps-native (registry `scadenze` → `airopsNative:true`), preservando le DUE facce RBAC attuali: staff/admin = registro completo; altri ruoli = "Le mie scadenze" (own-face, `listPersonExpiries`, "Proponi aggiornamento" INTATTO fino alla 12.13). Staff: 4 stat card tier (Scaduti / ≤7 / ≤30 / ≤60 — derivati da `daysUntilUtc`, stesse soglie del job 60/30/7/0), `.segmented` finestre (≤60/≤30/≤7/Scaduti/Tutte, default ≤60), filtri tipo+pilota, tabella `.students` con righe tinte per tier e colonne prototipo (Pilota/Tipo/Certificato/Scadenza `formatDateOnly`/Giorni/Stato), empty state. **"Invia promemoria"** = NUOVO endpoint session-auth (ratifica 4: gate `settings.manage`, SOLO ADMIN — bottone visibile solo ad ADMIN) che invoca `runExpiryAlertsJob()` (idempotente — l'endpoint cron bearer resta INTATTO), con feedback conteggi. ExportMenu = export xlsx/pdf esistenti. **RIMOSSA la pagina `expiries/types`** (catalogo → Impostazioni; API `expiry-types` resta); repoint/rimozione del link "Gestisci tipi".
4. **(Booking window — ratifica 3)** `createBooking` + `transitionBooking(APPROVE)` rifiutano 422 `BOOKING_OUTSIDE_WINDOW` per inizio/fine fuori dall'orario `openTime–closeTime` (Europe/Rome) o inizio oltre `maxAdvanceDays`; `minSlot`/`turnaround` advisory UI. Chiavi assenti → NESSUN vincolo (comportamento attuale, backward-safe). La timeline 06–22 della Pianificazione legge l'asse orario dalle settings quando presenti. Unit test bordi (mezzanotte, cross-window, chiavi assenti); e2e del 422.
5. **(METAR)** NUOVO `metar.service.ts`: fetch server-side `aviationweather.gov/api/data/metar?ids=<staz>&format=json`, cache in-memory 10 min, parsing minimo `{raw, tempC, windDir, windKt, visM, qnh, category}` (categoria da `fltCat`, fallback derivato VFR/MVFR/IFR), QUALUNQUE errore → `null`. `GET /api/v1/metar` (autenticata) + wiring del prop `metar` della sidebar dal layout (card nascosta se null/non configurata — comportamento attuale preservato). Unit test SOLO su fixture offline (MAI rete nei test); il fetch runtime degrada in silenzio.
6. **(KPI Utilizzo flotta — chiusura ratifica 2 della 12.10)** Estendere `stats.service.ts` + `schemas/stats.ts` + pagina `/dashboard/reports` col 5° KPI `fleetUtilization` = ore volate del periodo / ((closeTime−openTime) ore × giorni del periodo × aeromobili OPERATIONAL non archiviati). Chiavi sched assenti → campo `null` e KPI OMESSO in UI (niente dati finti). Tocco cross-story DICHIARATO (la 12.10 l'ha rinviato qui); suite 12.10 resta verde, e2e reports adattato.
7. **(Azione quota associativa — ratifiche 1a/1b)** NUOVO `chargeMembershipFee` in service (TDD) + endpoint session-auth thin (gate `finance.manage`, **Idempotency-Key obbligatoria a livello route** — pattern 12.7/12.9): in UNA transazione (i) addebito `ADJUSTMENT` sul conto della persona via writer esistente (`recordAdjustment`), importo di default dalla setting `membership.annualFeeCents` (precompilato, editabile in UI), motivo "Quota associativa {anno del pagamento}"; (ii) upsert PER NOME del tipo `ExpiryType` "Quota associativa" (scope `ALL`, `blocksBooking` false, `validityMonths` 12) se assente; (iii) renew della Expiry "Quota associativa" più recente della persona — `expiresAt = max(oggi, expiresAt corrente) + 12 mesi`, `issuedAt = oggi`, **wipe dei `SentAlert` NELLA STESSA transazione** (stessa regola "renewal re-earns its alert cycle" di `updateExpiry` — senza wipe i promemoria dell'anno dopo non partirebbero MAI, unique `[expiryId, threshold]`) — o create se la persona non ne ha. UI: azione sulla pagina Scadenze (staff face) — bottone "Quota associativa" con picker persona + importo precompilato + feedback esito (nuovo saldo + nuova scadenza). Setting assente/0 → azione disabilitata con hint. Unit test: rolling anticipato, wipe SentAlert, prima quota (create), setting assente, idempotenza a livello DB della route.
8. **(e2e)** `expiry-dashboard.spec.ts` RISCRITTO (stat card, segmented, tinte, own-face); `expiry-types.spec.ts` ADATTATO (catalogo via Impostazioni); `expiry-registration.spec.ts` ADATTATO (precompilazione validità, ratifica 2); `expiry-alerts.spec.ts` VERDE INTATTO (endpoint cron invariato) + test del nuovo trigger session (conteggi + idempotenza + 403 per non-ADMIN); NUOVO `settings.spec.ts` (salvataggi per card, SMTP write-only + email di prova via Mailpit API, catalogo abilitazioni); e2e quota associativa (azione → movimento ADJUSTMENT visibile in billing E scadenza creata/rinnovata nel registro); e2e `BOOKING_OUTSIDE_WINDOW`; reports adattato (KPI 5). Selettori scoped/exact (103-F1), MAI hasText su date/valori (11.2).
9. **(Gates)** Migrazioni: SOLO l'additiva `validityMonths` (ratifica 2) — nient'altro (il tipo "Quota associativa" nasce via upsert nel service + seed, NON via migrazione dati). `npm run gates` verde; spec toccati verdi in locale (`--retries=2`); verifica interattiva entrambi i temi.

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-17)

- **Prototipo Scadenze**: tier 0-4 (`tierOf`, `ScadenzeView.jsx:12-20`), stat card = `.kpi` con `borderLeft:3px`, tabella grid `minmax(140px,1.4fr) 110px minmax(150px,1.5fr) 130px 120px 120px`, righe `background:t.tint`, giorni `mono num` colorati (`{d}g` / `{|d|}g fa`), badge cat (Medico=info, Licenza="", Abilitazione=warn). `ScadenzeWidget` (righe 125-174) è della 12.12, NON di questa story.
- **Prototipo Impostazioni**: `defaults` righe 5-12; card e campi come da AC 2; nel prototipo la persistenza è localStorage → qui settings reali. La stazione METAR NON ha campo nel prototipo → aggiungerla dove naturale (card Club o sezione dedicata) mantenendo il linguaggio.
- **Scadenze oggi**: `expiries/page.tsx` (legacy, 2 facce via `expiries.manage`), `expiries.service.ts` (`listAllExpiries`/`listPersonExpiries`/`listExpiryProposals` — proposte VIVE fino a 12.13), `expiry-status.ts` (3 bande + `EXPIRY_ALERT_THRESHOLDS=[60,30,7,0]`, `daysUntilUtc`) — i 4 conteggi tier si DERIVANO, non esistono nel DTO.
- **Job promemoria**: `expiry-alerts.service.ts#runExpiryAlertsJob()` (niente Actor, idempotente via `SentAlert`, ritorna conteggi); endpoint cron `POST /api/v1/jobs/expiry-alerts` bearer `JOBS_SECRET` — INTATTO. Il nuovo trigger session è un endpoint separato che riusa il service.
- **Settings oggi**: `app-settings.service.ts` pattern narrow get/set (`ppr.landingFeeCents` è il modello per importi: parse stringa, bound `MAX_LANDING_FEE_CENTS`); `AppSetting` K/V — chiavi nuove SENZA migrazione. Gate write `settings.manage` (solo ADMIN — registry `settings.roles=['ADMIN']` coerente, il prototipo non filtra ma il dominio sì).
- **Mailer**: `smtp-mail-sender.ts` legge `env.SMTP_HOST/PORT/MAIL_FROM` (tutte con default, NON required → CI invariata), `secure:false` hardcoded, niente auth — il refactor settings-first mantiene l'interfaccia `MailSender` (nessun impatto sugli altri call-site email).
- **Booking**: `createBooking` (`bookings.service.ts:277`) e `transitionBooking` (:933) — oggi NESSUN vincolo orario (06–22 è solo l'asse display della timeline, `schedule.tsx:128-133`). Il 422 nuovo si aggiunge ai check esistenti (PERSON_NOT_BOOKABLE, EXPIRED_DOCUMENTS, BOOKING_IN_PAST, overlap).
- **METAR**: zero infrastruttura esistente (nessun egress HTTP nel backend oggi); sidebar GIÀ pronta (`sidebar.tsx:91-114` rende `.weather-card` solo se prop `metar` presente — oggi nessun caller). Cache module-level (pattern nuovo, semplice); i test NON toccano MAI la rete.
- **Quota associativa** (superfici esistenti): `recordAdjustment` (`accounts.service.ts:514`, DB sign negativo=addebito), ramo ADJUSTMENT di `recordTransaction` (`transactions.service.ts:337-343`). `AccountMovementType.ADJUSTMENT` copre l'addebito senza migrazione. Il renew scadenza segue il pattern di `updateExpiry` (`expiries.service.ts:283-288`): quando `expiresAt` cambia i `SentAlert` vanno cancellati NELLA STESSA transazione (unique `[expiryId, threshold]` — senza wipe, niente promemoria l'anno dopo). Tipo "Quota associativa" via upsert per nome nel service; aggiungerlo anche al prisma seed per install freschi (così l'e2e lo trova nel catalogo).
- **KPI utilizzo**: story file 12.10 ratifica 2 + AC1 (schema SENZA fleetUtilization, da estendere qui); "operativo" = `status=OPERATIONAL` non archiviato.
- **Dipendenza**: dispatch SOLO dopo il close-out della 12.10 (tocca stats service/schema/pagina).
- **Ambiente locale**: identico alle story precedenti (DB fresco al dispatch, port 3000, `--retries=2`, Playwright MCP rotto → script /tmp, MAI `playwright install`, gates SOLO `npm run gates`, lockfile `npx -y npm@10`). L'e2e della email di prova usa Mailpit API (`localhost:8025/api/v1/messages`).
- **Commit**: `feat(12.11): scadenze + impostazioni + metar` (adattare se il piano Step dice diversamente). Staging esplicito, niente push.

## Fuori scope dichiarato

- Rimozione flusso expiry-proposals e API relative (12.13, D10); `ScadenzeWidget` della Panoramica (12.12).
- Scheduling automatico della quota associativa (nessun cron nuovo); azione batch "addebita a tutti" (ratifica 1: esplicitamente esclusa); concetto "socio" nel dominio.
- Fatture/ricevute per la quota (D9: nessun motore fatture).
- Modifiche al job cron `jobs/expiry-alerts` (resta bearer-only) e alle env SMTP esistenti.
- Qualunque migrazione oltre l'eventuale `validityMonths` additiva (ratifica 2).

## Dev Agent Record

### Completion Notes

_(a cura del dev agent)_

### File List

_(a cura del dev agent)_

### Change Log

_(a cura del dev agent)_

## Review Record

_(a cura della review adversarial)_
