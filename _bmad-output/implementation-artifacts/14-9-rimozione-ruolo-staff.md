---
baseline_commit: 8281149
---

# Story 14.9: Rimozione del ruolo STAFF — resta ADMIN come unica figura amministrativa

Status: review (branch `dev`, epic 14)

## Story

As a gestore dell'aviosuperficie,
I want che esista UNA sola figura amministrativa (ADMIN) invece della coppia ADMIN/STAFF mai usata davvero,
so that permessi, UI e seed riflettano l'organizzazione reale senza un ruolo fantasma da mantenere.

**Riferimenti vincolanti**: piano epic 14, **ratifica R2**: siamo in dev, il DB viene ripulito di continuo, l'app non è MAI stata deployata → **niente migrazione difensiva**: si elimina il ruolo (enum, permessi, UI) e si rifà il seed senza `staff@airmanager.local`. Resta ADMIN come unica figura amministrativa. La story è stata tenuta per ULTIMA proprio perché trasversale (tocca RBAC, seed, UI e i test di quasi ogni story).

**Ricognizione (2026-07-29, censimento grep della sessione principale — il dev verifichi e mi corregga se sbaglio, come da prassi premiata 14.3/14.4/14.6/14.8)**:
- **Enum**: `prisma/schema.prisma:24-30` (`enum Role`). Su Postgres rimuovere un valore enum richiede la ricreazione del tipo nella migrazione — accettabile perché per R2 nessun dato va preservato e ogni DB (dev e CI) riparte da zero con la catena migrazioni + seed nuovo.
- **Seed**: `prisma/seed.ts:14` (`STAFF_EMAIL`) + blocco di creazione utente.
- **RBAC**: `src/server/auth/rbac.ts:102-119` (`ROLE_PERMISSIONS.STAFF`) + doc-comment che citano STAFF (`:40`, `:47`, `:53-56` e altri). Il permesso `flights.forceExpiry` resta un permesso SEPARATO (la 14.4 l'ha scritto sul permesso apposta: qui non va toccato nulla di suo).
- **Route registry**: `src/components/shell/route-registry.ts:62-63` — `ALL_ROLES` e `STAFF_ROLES` (usata da 8 NAV_ITEMS). `STAFF_ROLES` va rinominata in qualcosa di veritiero (es. `ADMIN_ROLES`) — dopo la rimozione conterrebbe solo ADMIN e il nome mentirebbe.
- **UI**: `dashboard/layout.tsx:33,37` (`ROLE_PRIORITY`, tone map badge); `pilots/pilot-editor.tsx:337,1297` (lista ruoli e z.enum del form utente); `pilots/pilot-editor-labels.ts:105`; chiavi i18n `"STAFF"` in `messages/it.json:58,1582` e `messages/en.json:58,1582` (due namespace).
- **Servizi**: `expiry-alerts.service.ts:194` — il digest scadenze va a `roles: { hasSome: ['ADMIN','STAFF'] }` → solo ADMIN (`:51` doc). Doc-comment/perimetri "STAFF+ADMIN" da aggiornare in `flights.service.ts:448,449,637,883`, `app-settings.service.ts:448,554`, `stats.service.ts:17`, `api/v1/settings/membership-fee/route.ts:7`, `billing/page.tsx:40`, `reports/page.tsx:28`.
- **OpenAPI**: `src/lib/schemas/registry.ts:1551,1915` (description che citano ADMIN/STAFF) + eventuali z.enum di ruolo negli schemi utente (censire `src/lib/schemas/`).
- **Unit test**: ~15 file di service test usano attori STAFF/`staff@airmanager.local` (aircraft, cash, me, membership, rates, stats, bookings, instructor-rates, expiry-types, flights, expiry-alerts, accounts, people, rbac.test).
- **e2e**: 10 spec fanno login come `staff@airmanager.local` (home-dashboard, movements, pdf-exports, treasury-settings, user-management, settings, my-account, membership-fee, my-compensation, ppr-queue), 33 occorrenze STAFF totali in `e2e/`. ATTENZIONE: alcuni test hanno come SOGGETTO proprio la differenza ADMIN/STAFF (es. il test 14.4 "STAFF bloccato senza affordance di forzatura" in `flights.spec.ts`, o asserzioni `payouts.manage` ADMIN-only in `rbac.test.ts`) — quel soggetto sparisce con il ruolo.
- **Generated**: `src/generated/prisma/*` si rigenera da solo (`prisma generate`) — mai editarlo a mano.

## Acceptance Criteria

1. **(Enum e migrazione — R2)** `Role` non contiene più STAFF: migrazione Prisma che ricrea l'enum senza il valore (nessuna migrazione difensiva dei dati: R2). La catena migrazioni resta rieseguibile da zero (`prisma migrate reset` + `deploy` su DB vuoto e in CI); il client Prisma è rigenerato.
2. **(RBAC)** `ROLE_PERMISSIONS` non ha più la entry STAFF; i permessi degli altri ruoli sono INVARIATI riga per riga. `flights.forceExpiry` resta un permesso distinto concesso solo ad ADMIN (ora anche "per costruzione": nessun altro ruolo ha `flights.manage`) — non si elimina, protegge eventuali ruoli futuri come da design 14.4. I doc-comment non citano più STAFF come ruolo vivo.
3. **(Seed)** `prisma/seed.ts` non crea più `staff@airmanager.local` né riferimenti a STAFF; il seed gira pulito su DB vuoto.
4. **(UI e i18n)** Il form utente (pilot-editor) non offre più STAFF tra i ruoli; badge/tone map/priorità in layout.tsx senza STAFF; `STAFF_ROLES` del route-registry rinominata (es. `ADMIN_ROLES`) con le 8 voci di nav invariate nel comportamento per i ruoli restanti; chiavi i18n STAFF rimosse da entrambi i locale. `grep -rE '\bSTAFF\b' src/ --include='*.ts*'` (esclusi `src/generated/`) → **zero occorrenze vive** (vale anche per i commenti: aggiornarli, non lasciarli mentire).
5. **(Servizi e OpenAPI)** Digest scadenze solo agli ADMIN attivi (`expiry-alerts.service.ts`); description OpenAPI e doc-comment di perimetro aggiornati ("ADMIN" al posto di "STAFF+ADMIN"); nessuno schema Zod espone più STAFF.
6. **(Test migrati preservando l'INTENTO)** Unit e e2e che usavano STAFF migrano ad ADMIN dove il test copriva il perimetro amministrativo; i test il cui SOGGETTO era la differenza ADMIN/STAFF vengono rimossi o riformulati CON MOTIVAZIONE nel Dev Agent Record (es. il test 14.4 "STAFF senza affordance di forzatura": l'equivalente più vicino resta il 403 API per non-admin, che va mantenuto). Nessun indebolimento di copertura non dichiarato.
7. **(Invarianti)** Comportamento INVARIATO per ADMIN, INSTRUCTOR, PILOT, STUDENT su ogni superficie (nav, permessi, API): la story RIMUOVE un ruolo, non ridisegna nulla. Full suite `CI=1` verde su build prod; unit in shell PULITA (`env -u DATABASE_URL -u AUTH_SECRET`); `npm run gates` verde.

## Contesto (puntatori)

- Piano epic 14 (ratifica R2): `docs/superpowers/plans/2026-07-28-epic-14-demo-feedback.md`.
- La 14.5 ha introdotto `bookings.read.names` citando esplicitamente STAFF (rbac.ts:116-118): la entry sparisce con la rimozione, il permesso resta ad ADMIN/INSTRUCTOR.
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`; reset DB SOLO dalla sessione principale (consenso utente). e2e: MAI `Escape` per chiudere popup dentro SlideOver; `t.raw` per i18n con segnaposto client-side; gate vero = full suite CI=1 prod; `e2e/helpers.ts#ensureValidSeedExpiries` (story 14.4) è il pattern fixture per le persone fresche che volano. Commit su `dev`: `feat(14.9): rimozione ruolo STAFF — ADMIN unica figura amministrativa` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- TD-8 (indagine lentezza salvataggi).
- Qualunque ridisegno di permessi dei ruoli restanti (solo rimozione).
- I 2 TD e2e "stato globale" aperti dalla review 14.4 (describe guard-rail e PUT scheduling di reports.spec.ts in catena serializzata) — restano TD separati.

## Dev Agent Record

### Verifica ricognizione

Il censimento del story file è stato riverificato con grep mirati prima di implementare. Riscontri:

- **Corretto**: enum (`prisma/schema.prisma:24-30`), seed (`prisma/seed.ts:14` + blocco), RBAC (`rbac.ts:102-119` + doc-comment), route-registry (`STAFF_ROLES` → 8 `NAV_ITEMS`), UI (`layout.tsx`, `pilot-editor.tsx:337,1297`, `pilot-editor-labels.ts:105`), i18n (`it.json`/`en.json` righe 58 e 1582), digest scadenze (`expiry-alerts.service.ts:194`), OpenAPI (`registry.ts:1551,1915`), la lista dei 10 spec e2e che fanno login `staff@airmanager.local` (verificata esatta via grep).
- **Mancanti, aggiunti in ricognizione**:
  - `prisma/seed-demo.ts:62` — un membro demo (Giulia Ferraro) con `role: 'STAFF'`, non citato nel censimento. Migrato a `role: 'ADMIN'` (seconda figura amministrativa, owner+operations); commento del modulo aggiornato ("2 admin + 9 members" invece di "1 admin + 10 members").
  - Due service non citati nella lista "Servizi": `billing-summary.service.ts:154` e `membership.service.ts:65,72` (doc-comment "STAFF+ADMIN"/"non-STAFF actor").
  - **7 e2e spec aggiuntivi** oltre ai 10 col login diretto, che referenziano STAFF SOLO per creare un utente ad hoc via API (`roles: ['STAFF']`), mai col login `staff@airmanager.local`: `aircraft-rates.spec.ts`, `expiry-alerts.spec.ts`, `expiry-registration.spec.ts`, `expiry-types.spec.ts`, `flights.spec.ts`, `instructor-compensation.spec.ts`, `instructor-rates.spec.ts` — totale reale **17 file e2e** toccati, non 10. Il conteggio "33 occorrenze STAFF totali in e2e/" era sottostimato: la conta reale (grep case-sensitive `STAFF`, token esatto) è **44 occorrenze** in 16 file (+ `treasury-settings.spec.ts` che usa solo l'email minuscola `staff@airmanager.local`, quindi non contata da un grep `STAFF` maiuscolo).
  - **~20 file di unit test**, non ~15: verificato con grep, i file reali sono `accounts`, `app-settings`, `expiries`, `expiry-alerts`, `instructor-compensation`, `ppr`, `flights-expiry-boundary.integration`, `aircraft`, `transactions`, `instructor-rates`, `cash`, `membership`, `expiry-types`, `rates`, `flights`, `me`, `people`, `bookings`, `stats`, `rbac.test` = 20.
- **Scoperta strutturale non anticipata dal censimento** (impatto maggiore sul lavoro effettivo): la rimozione di STAFF rende **ADMIN l'unico titolare** di `aircraft.manage`, `people.manage`, `finance.manage`, `expiries.manage`, `ppr.manage`, `bookings.manage.any` — permessi che STAFF condivideva con ADMIN restando SEMPRE privo di `settings.manage`/`users.manage`/`payouts.manage`. Di conseguenza, ogni test (unit o e2e) il cui soggetto era "un attore con il permesso largo MA non quello stretto ottiene comunque 403" perde il suo attore: nessun ruolo residuo può più incarnare quello scenario. Il censimento del story file citava solo 2 esempi di questa classe (flights.spec.ts "STAFF bloccato", rbac.test.ts payouts.manage); la classe reale è **~15 test** sparsi su 6 file unit e 6 file e2e (ledger sotto).

### Riepilogo per AC

1. **Enum/migrazione**: `Role` senza STAFF; migrazione `20260729144406_remove_staff_role` (ricreazione tipo, pattern standard Prisma `AlterEnum`). Nessuna riga con STAFF sopravvissuta nel DB dev (l'unica, `staff@airmanager.local`, cancellata prima della migrazione — R2, nessun dato da preservare). Client rigenerato (`prisma generate`). Catena rieseguibile da zero verificata SENZA toccare il DB dev: DB temporaneo `airmanager_migtest` creato ad hoc nello stesso Postgres, `prisma migrate deploy` (46/46 migrazioni) + `npx tsx prisma/seed.ts` puliti, poi droppato.
2. **RBAC**: entry `STAFF` rimossa da `ROLE_PERMISSIONS`; permessi di ADMIN/INSTRUCTOR/PILOT/STUDENT INVARIATI riga per riga (diff su `rbac.ts` verificato: solo l'entry STAFF sparisce, nessun'altra riga tocca). `flights.forceExpiry` intatto (solo commento riformulato, "story 14.9's STAFF removal" → tempo passato). Doc-comment del modulo aggiornato.
3. **Seed**: `seedStaffUser`/`STAFF_EMAIL` rimossi da `seed.ts`; `seed-demo.ts` migrato (v. ricognizione). Seed verificato pulito su DB vuoto (staging + dev).
4. **UI/i18n**: `pilot-editor.tsx` (ALL_ROLES + z.enum del form utente), `pilot-editor-labels.ts`, `layout.tsx` (ROLE_PRIORITY, AVATAR_COLOR_BY_ROLE), `route-registry.ts` (`STAFF_ROLES` → `ADMIN_ROLES`, 8 NAV_ITEMS invariati nel comportamento), `it.json`/`en.json` (2 namespace). Verifica interattiva (screenshot + estrazione testo pagina): il form "Nuovo pilota" → Accesso mostra ESATTAMENTE 4 checkbox ruolo (Admin/Istruttore/Pilota/Allievo), nessuna occorrenza testuale "Staff" in pagina. `grep -rE '\bSTAFF\b' src/ --include='*.ts*'` (esclusi generated) → **zero**.
5. **Servizi/OpenAPI**: digest scadenze (`expiry-alerts.service.ts`) da `roles: { hasSome: ['ADMIN','STAFF'] }` a `roles: { has: 'ADMIN' }`; descrizioni OpenAPI aggiornate; `roleSchema = z.enum(Role)` (`src/lib/schemas/users.ts`) deriva DIRETTAMENTE dall'enum Prisma — nessuno schema Zod hardcodava STAFF separatamente, quindi si è auto-aggiornato con la migrazione. Doc-comment di perimetro aggiornati in `flights.service.ts`, `app-settings.service.ts`, `stats.service.ts`, `billing-summary.service.ts`, `membership.service.ts`, le 3 route/page citate dal censimento.
6. **Test migrati preservando l'intento**: v. ledger sotto.
7. **Invarianti**: nessuna riga di `ROLE_PERMISSIONS` per ADMIN/INSTRUCTOR/PILOT/STUDENT toccata. `npm run gates` verde (lint/typecheck/1600 unit/build). Full suite e2e `CI=1` su build prod: **297 passed + 1 flaky (ultimately passed) = 298/298, exit 0** — il flaky (`flights.spec.ts:602`, "Correggi volo" tipo invariato) è la classe nota pre-esistente (story 14.3/CLAUDE.md, nulla a che fare con ruoli/STAFF), passato al retry #1.

### Ledger migrazione test (AC 6)

**Unit test — 8 rimossi, motivazione per ciascuno:**

| File | Test rimosso | Motivazione |
|---|---|---|
| `rbac.test.ts` | `lets staff read/manage operational data...` | Soggetto = permessi di STAFF stesso; sparisce col ruolo. |
| `app-settings.service.test.ts` | 3× `staff (X.manage, not settings.manage) CAN read` (ppr operating instructions, ppr landing fee, membership fee) | Provavano che il permesso LARGO (non `settings.manage`) bastava per leggere; ridondanti con l'happy-path ADMIN adiacente una volta che nessun altro ruolo ha quel permesso largo. |
| `aircraft.service.test.ts` | `rejects a 'rate' block from an actor without settings.manage...` | `aircraft.manage` ora è ADMIN-esclusivo: nessun attore può più superare il gate largo restando sotto quello stretto. Il 403 generico resta coperto dal test pilota adiacente (che fallisce PRIMA, sul gate largo). |
| `people.service.test.ts` | `access without users.manage → 403...` | Stessa classe: `people.manage` ora ADMIN-esclusivo, `createPerson` fallisce sul gate largo prima di raggiungere quello dell'`access` block. Coperto dal test pilota adiacente. |
| `membership.service.test.ts` | `a STAFF override is forbidden (403)...` | `finance.manage` ora ADMIN-esclusivo: stessa classe. |
| `flights.service.test.ts` | `force: true without flights.forceExpiry (a non-admin STAFF actor) -> 403...` | `flights.manage` ora ADMIN-esclusivo: l'attore non può più avere `flights.manage` senza `flights.forceExpiry`. |

**Unit test — migrati con MOTIVAZIONE (non rimossi), pattern "403 per non-admin" più vicino (AC6):**
- 12 test in `app-settings.service.test.ts` (`set*`/`get*` gated `settings.manage`): attore `staffActor()` → `pilotActor()`, titoli riformulati da "staff (X.manage only) is forbidden" a "a non-admin actor is forbidden" (la distinzione fine "ha X.manage ma non settings.manage" non ha più un abitante; resta la copertura "un attore senza alcun permesso viene rifiutato").
- `instructor-compensation.service.test.ts`: 2 test `recordPayout`/`setPayoutRate` rejects → migrati a `pilotActor()`.
- `cash.service.test.ts`: 5 test `create/rename/deactivate/reactivate/deleteCashCategory` rejects → migrati a `pilotActor()`.
- `expiry-types.service.test.ts`: 3 test `create/updateExpiryType`/`deleteExpiryType` rejects → migrati a `pilotActor()`.
- `rates.service.test.ts`, `instructor-rates.service.test.ts`: 1 ciascuno (`createAircraftRate`/`createInstructorRate` rejects) → migrati a `pilotActor()`.

**Unit test — rename meccanico `staffActor()`→`adminActor()` (nessun cambio di intento, STAFF era solo "un attore col permesso", ADMIN è l'unico rimasto)**: `accounts`, `expiries`, `transactions`, `bookings`, `stats`, `ppr`, `flights-expiry-boundary.integration`, `aircraft` (resto), `people` (resto), `flights` (resto), `instructor-compensation` (resto), `membership` (resto), `expiry-types` (resto), `rates` (resto), `instructor-rates` (resto), `cash` (resto), `me.service.test.ts`, `expiry-alerts.service.test.ts` (query `hasSome:['ADMIN','STAFF']`→`has:'ADMIN'`).

**e2e — 6 rimossi, motivazione:**

| File | Test rimosso | Motivazione |
|---|---|---|
| `aircraft-rates.spec.ts` | `a STAFF actor (aircraft.manage but not settings.manage) gets a 403...` | Ridondante col test pilota adiacente (stesso gate, ordine di check confermato in `aircraft.service.ts`). |
| `aircraft-rates.spec.ts` | `a STAFF actor ... sees no "Tariffe" block on the create form...` | Un pilota non può nemmeno raggiungere il form (nessun `aircraft.manage`) — copertura equivalente già in `aircraft-management.spec.ts` (redirect + 403 GET). |
| `instructor-rates.spec.ts` | `a STAFF actor (people.read but not settings.manage) gets a 403...` | Ridondante col test pilota adiacente. |
| `flights.spec.ts` | `STAFF: a pilot with a BLOCKING expired document ... NO override affordance` | Nessun ruolo non-admin ha più `flights.manage`: nessuno può più raggiungere il form e vedere l'errore-senza-force-section. L'equivalente API "un attore non-admin non può forzare" resta (migrato a pilota, v. sotto). |
| `user-management.spec.ts` | `staff sees Modifica/Registra but no Sospendi/Riattiva...` | `people.manage` ADMIN-esclusivo: nessun attore raggiunge la pagina Piloti con `people.manage` ma senza `users.manage`. Il 403 API su `users.manage` resta coperto (`a pilot gets 403 creating a user`). |
| `home-dashboard.spec.ts` | `staff sees the SAME AdminOverview console as admin` | `finance.manage` ADMIN-esclusivo: duplicava l'assert ADMIN adiacente. |

**e2e — migrati con MOTIVAZIONE (403-per-non-admin più vicino, AC6):**
- `flights.spec.ts`: `a non-admin actor cannot force even via a direct API call` → attore riusa il pilota già creato nel test (stesso pattern degli altri test del describe).
- `expiry-alerts.spec.ts`: `the session trigger is gated settings.manage — a STAFF actor...` → `a non-admin actor gets 403`, migrato a `PILOT_EMAIL`.
- `expiry-types.spec.ts`: `a STAFF actor (expiries.manage, NOT settings.manage) is redirected...` → trimmed a `a POST to expiry-types by a non-admin actor gets a 403` (la visibilità nav/redirect era già ridondante col test pilota adiacente, mantenuta SOLO l'asserzione 403 sull'endpoint, non coperta altrove).
- `settings.spec.ts`, `treasury-settings.spec.ts`: unico test redirect-da-settings di ciascun file, migrato da staff a pilota (nessun altro attore testato lì).
- `instructor-compensation.spec.ts`: `RBAC: staff sees the summary but NOT "Paga"...` → trimmed a `RBAC: POST payout / PUT rate answer 403 for a non-admin actor` (solo le 2 assert API, migrate a pilota; le assert UI "vede il riepilogo ma non Paga" non hanno più abitante).
- `instructor-compensation.spec.ts`: `the compensation summary export answers xlsx 200 for both staff and admin` → trimmed a solo ADMIN (il "for both" perde senso).

**e2e — migrazione semplice attore (feature test, non permission-split), STAFF→ADMIN o rimozione del blocco di creazione utente STAFF ad-hoc**: `movements.spec.ts` (2 test), `membership-fee.spec.ts` (1, blocco STAFF nel test rimosso), `pdf-exports.spec.ts` (1, loop ridotto da [STAFF,PILOT] a [PILOT]), `ppr-queue.spec.ts` (3), `my-account.spec.ts`/`my-compensation.spec.ts` (1 blocco di login rimosso da un test multi-ruolo ciascuno), `expiry-registration.spec.ts` (1, l'intero blocco di creazione utente STAFF ad-hoc eliminato, il test prosegue come ADMIN).

Nessun test è stato indebolito in silenzio: ogni rimozione ha un pari (redundant-with) o un'assenza strutturale di abitante documentata sopra.

### File List

**Schema/migrazione**: `prisma/schema.prisma`, `prisma/migrations/20260729144406_remove_staff_role/migration.sql` (nuovo), `prisma/seed.ts`, `prisma/seed-demo.ts`.

**RBAC/route/UI**: `src/server/auth/rbac.ts`, `src/components/shell/route-registry.ts`, `src/app/[locale]/dashboard/layout.tsx`, `src/app/[locale]/dashboard/pilots/pilot-editor.tsx`, `src/app/[locale]/dashboard/pilots/pilot-editor-labels.ts`, `messages/it.json`, `messages/en.json`.

**Servizi/OpenAPI**: `src/server/services/expiry-alerts.service.ts`, `src/server/services/flights.service.ts`, `src/server/services/app-settings.service.ts`, `src/server/services/stats.service.ts`, `src/server/services/billing-summary.service.ts`, `src/server/services/membership.service.ts`, `src/app/api/v1/settings/membership-fee/route.ts`, `src/app/[locale]/dashboard/billing/page.tsx`, `src/app/[locale]/dashboard/reports/page.tsx`, `src/lib/schemas/registry.ts`.

**Unit test** (20): `src/server/auth/rbac.test.ts`, `src/server/services/{accounts,app-settings,aircraft,bookings,cash,expiries,expiry-alerts,expiry-types,flights,flights-expiry-boundary.integration,instructor-compensation,instructor-rates,me,membership,people,ppr,rates,stats,transactions}.service.test.ts`.

**e2e** (17): `e2e/{aircraft-rates,expiry-alerts,expiry-registration,expiry-types,flights,home-dashboard,instructor-compensation,instructor-rates,membership-fee,movements,my-account,my-compensation,pdf-exports,ppr-queue,settings,treasury-settings,user-management}.spec.ts`.

### Deviazioni dallo story file

- **Ricognizione corretta** (v. sopra): `prisma/seed-demo.ts`, `billing-summary.service.ts`, `membership.service.ts` (non citati); 7 e2e spec aggiuntivi oltre ai 10; conteggio unit test 20 non ~15; conteggio occorrenze e2e 44 non 33. Nessuna di queste correzioni ha cambiato l'approccio, solo l'estensione del lavoro.
- **Scoperta non anticipata**: la classe "test il cui soggetto era permesso-largo-ma-non-stretto" è molto più ampia (~15 test) di quanto il censimento suggerisse (2 esempi). Applicato sistematicamente lo stesso principio AC6 già esemplificato dalla story per ogni istanza: rimozione con motivazione se ridondante con un test pilota adiacente o strutturalmente impossibile da riformulare (l'attore non raggiunge nemmeno la superficie), altrimenti migrazione a pilota/ADMIN con titolo riformulato.
- **`prisma/seed-demo.ts`**: Giulia Ferraro (era STAFF) migrata a un SECONDO utente ADMIN (owner+operations) anziché eliminata — coerente con "resta ADMIN come unica figura amministrativa" (non "un solo ADMIN"). Deviazione minima, non prevista esplicitamente dallo story file ma implicita in R2.
- Nessuna migrazione difensiva dei dati (R2 rispettata): l'unica riga STAFF nel DB dev (`staff@airmanager.local`) è stata cancellata prima di applicare la migrazione enum, non trasformata.

## Review Record

_(compilato dopo la review adversarial)_
