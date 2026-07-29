---
baseline_commit: 8281149
---

# Story 14.9: Rimozione del ruolo STAFF — resta ADMIN come unica figura amministrativa

Status: ready-for-dev (branch `dev`, epic 14)

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

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
