---
baseline_commit: d9dbc8c
---

# Story 19.1: Rimozione del dominio PPR

Status: **done** — 2026-11-01 (review SHIPPABLE-WITH-FIXES, arbitro 492/492 exit 0, fix F1-F3 della sessione principale). Storico — **review** — 2026-11-01 (dev completato; ready-for-dev 2026-11-01). **Modello dev: Opus 5 xhigh (UI)**: la story tocca codice UI su sei superfici (Panoramica desktop e mobile, Statistiche, Impostazioni, shell con sidebar, tab bar e sheet «Altro», CSS AirOps), oltre a backend, DB, seed ed e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Un solo dev subagent.

> ⚠️ **Baseline**: ogni `file:riga` di questo file è misurato su **`d9dbc8c`**, cioè `5ca0be6` (CR approvata) più la chiusura docs-only della 16.3 (`d9dbc8c` tocca solo story file, `sprint-status.yaml` e `HANDOFF.md`: nessuna riga di codice si è spostata). Prima di scrivere una riga: `git log --oneline -3`, rileggere sul HEAD corrente le righe citate e **correggere questo file** dove sono slittate.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§4.0 ratifiche **R-19-a**, R-19-p; §4.2 riga 19.1; §4.10 **A1-A4**, A14), `CLAUDE.md` per intero (convenzioni e2e, catena serializzata, testid, unit + env eager, gates, `scripts/e2e.sh`), `docs/handoffs/HANDOFF.md` §«Ciclo per story su QUESTA macchina» e §«Ambiente / regole macchina locale» (reset del DB, `JOBS_SECRET`, fallback `playwright-core` per i subagent). Precedenti di rimozione da cui imparare: `12-13-rimozioni-cleanup-sweep.md` (AC1/AC7/AC8: il 404 si prova **dopo** il login, gli spec sopravvissuti che chiamavano endpoint rimossi) e `14-9-rimozione-ruolo-staff.md` (migrazione provata su DB gemello, `migrate diff` vuoto, `prisma generate`). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

---

## ❓ Domande PO aperte (da ratificare PRIMA del dispatch — la sessione principale registra qui l'esito)

**Q-19.1-a — `/ppr` aperto da un visitatore NON autenticato: 404 o pagina di login?** → ✅ **RATIFICATA dal PO il 2026-11-01: opzione B** («Pagina non trovata» anche per l'anonimo). AC 2 tiene `'/ppr'` in `PUBLIC_WEB_PATHS` con un commento di una riga (lapide: «route removed in 19.1, kept public so anonymous visitors get a 404, not the login page»); AC 15 ammette come unica eccezione aggiuntiva quella riga di `src/proxy.ts`; la sonda di AC 1 verifica 404 per l'anonimo su `/it/ppr` e `/en/ppr`. `'/api/v1/ppr-requests'` esce comunque da `PUBLIC_API_PATHS` (anonimo → 401, come ogni API sconosciuta). Testo originale della domanda sotto, per storia.

A1 dice: `/ppr`, `/dashboard/ppr`, `/dashboard/movements` rispondono **404**, «nessun redirect», sul precedente di `ppr/register`. Sul HEAD il gate di `src/proxy.ts` manda al login **ogni** path che non sta in `PUBLIC_WEB_PATHS` (`proxy.ts:14`, `:123-127`), comprese le pagine che non esistono: il 404 di Next arriva solo dopo il login. Per `/dashboard/*` è indifferente: i suoi utenti sono sempre autenticati. Il precedente dice lo stesso: lo spec 404 di `ppr/register` è fallito al primo run perché navigava senza login (story 12.13 AC8). Ma `/ppr` era l'**unica pagina pubblica**: i suoi utenti erano piloti esterni **senza account**. Togliendo `'/ppr'` da `PUBLIC_WEB_PATHS` (che è quello che significa «nessun residuo»), un vecchio link a `/it/ppr` porta un esterno su `/it/login?callbackUrl=/it/ppr`: un redirect, non un 404. Stessa cosa per l'API: un `POST /api/v1/ppr-requests` anonimo risponde **401** `UNAUTHENTICATED` (gate di `/api/v1`, `proxy.ts:103-110`), non 404.

| Opzione | Cosa | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | Via `'/ppr'` e `'/api/v1/ppr-requests'` da `PUBLIC_WEB_PATHS`/`PUBLIC_API_PATHS`. Autenticato: **404** sulle tre pagine e sulle API. Anonimo: login (pagine) e 401 (API), come per qualunque URL che l'app non conosce | zero residui, zero casi speciali; `/ppr` si comporta come ogni altro path; è il comportamento già ratificato per `ppr/register` | un pilota esterno con un vecchio link vede la pagina di login di un'app in cui non ha un account |
| B | Si lascia `'/ppr'` in `PUBLIC_WEB_PATHS` come «lapide», così anche l'anonimo prende il 404 | 404 letterale per tutti | un path pubblico dichiarato per una pagina che non esiste; è l'unico residuo PPR nel codice vivo (eccezione da scrivere nell'AC 15); il caso speciale resta per sempre |
| C | 404 per qualunque path sconosciuto anche da anonimo (il gate verifica che la route esista) | 404 uniforme | il proxy non conosce le route di Next: va scritto e mantenuto un elenco, cioè una superficie nuova. Fuori perimetro di una story di rimozione |

*Raccomandazione A (NON scelta dal PO — vale B, v. sopra)*: A1 voleva escludere un redirect **dedicato** (verso Panoramica o altrove), non il gate di autenticazione che vale per tutta l'app. Gli AC erano scritti su **A**; il PO ha scelto **B**, quindi si applica: AC 2 tiene `'/ppr'` in `PUBLIC_WEB_PATHS` con un commento di una riga, e AC 15 aggiunge `src/proxy.ts` (quella sola riga) alle eccezioni.

> **DECISIONE PO (2026-11-01)**: **B** — v. la ratifica in testa a questa domanda (fix review F3).

Nessun'altra assunzione di dominio nuova: tutte le scelte qui sotto o sono coperte da R-19-a/A1-A4, o sono decisioni tecniche/UI dichiarate in §1 (la sessione principale può portarle al PO se lo ritiene).

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che l'app non contenga **più nulla** del dominio PPR: le «Richieste PPR», i «Voli in transito», il modulo pubblico, le API, le email, il permesso, le tabelle e i loro dati, i movimenti di cassa delle tasse e la loro categoria, le impostazioni «tassa PPR» e «istruzioni operative PPR», il KPI e gli avvisi della Panoramica, le serie delle Statistiche e gli export,

so that il prodotto descriva il modo in cui l'aviosuperficie lavora davvero (PO, 2026-11-01: «cancella tutto, siamo ancora in dev, il db è di test»), con una superficie da mantenere più piccola, e le story 19.2-19.12 partano da una base senza codice morto.

### Il perché: due pagine, un solo dominio, nessun utente

«Richieste PPR» (`/dashboard/ppr`) e «Voli in transito» (`/dashboard/movements`) sono **due viste sulla stessa tabella** `PprRequest`: la prima va da PENDING ad APPROVED (approva/rifiuta), la seconda da APPROVED a COMPLETED/CANCELLED (chiusura con tassa, annullo). Il modulo pubblico `/ppr` alimenta la prima, la chiusura scrive un `CashMovement` nella categoria «PPR». Il dominio ha radici in undici superfici: shell, Panoramica (KPI, sottotitolo, avvisi mobile), Statistiche (KPI, grafico, composizione), Impostazioni (card Club), cassa (categoria di sistema, riferimento in Contabilità), OpenAPI, email, permessi, proxy, seed, harness di carico. Si toglie **tutto insieme**: togliere una sola pagina lascerebbe l'altra vista orfana di metà del ciclo di vita.

### Fatti misurati che vincolano il design (su `d9dbc8c`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| File dedicati al dominio | **26 file in `src/`** (9 route API comprese) **+ 3 spec e2e**, 7.215 righe in tutto (§3.1) | si cancellano interi; nessuno ha consumer fuori dal dominio (censimento degli import, §3.1) |
| Residui nei file che restano | il grep A ∪ il grep B di AC 15 trovano **91 file** fuori dai 29 da cancellare (più `package-lock.json`, falso positivo negli hash `integrity`) | ognuno è nella tabella di §3.2; target **0** |
| Il parser della tassa PPR serve alla quota | `parseStoredLandingFeeCents` e `MAX_LANDING_FEE_CENTS` (`app-settings.service.ts:41`, `:105-111`) sono chiamati anche da `getMembershipFeeCents` (`:465`) | si **rinominano**, non si cancellano (AD-2) |
| …e i suoi casi limite sono testati solo sul ramo PPR | i 6 valori corrotti (`'abc'`, `'-100'`, `'12.5'`, `' 100'`, `'100 '`, `'99999999999'`) stanno in `app-settings.service.test.ts:174-184` (describe della tassa PPR); il describe della quota (`:541-574`) non ne ha nessuno | la copertura del parser **si sposta** sulla quota, non si perde (AD-2, AC 16) |
| `RateLimitError` ha un solo chiamante | i 3 `throw` di `ppr.service.ts:114/121/138`; mappato su 429 da `handler.ts:35`; il 429 di `registry.ts:356/365` serve solo a `POST /ppr-requests` (`:1602`) | orfani creati dalla rimozione: si tolgono (A4) |
| L'icona `doc` | `NavIconKey 'doc'` serve solo alla voce `ppr` (`route-registry.ts:40/94`); **`Icon.doc` è usata da `export-menu.tsx:51`** | si toglie la chiave dall'union, **non** la glifo |
| Tab bar admin | slot: `overview` 1, `schedule` 2, `ppr` 3, `fleet` 4. Dopo: 3 voci con slot su 4 colonne → il riempimento di `mobileNavLayout` (`route-registry.ts:165-180`) aggiunge la prima voce senza slot in ordine di registry | tab = `overview, schedule, fleet, pilots`; «Altro» passa da 8 a **6** voci (A2: riempimento predefinito, nessuno slot nuovo) |
| KPI della Panoramica | 5 card nel `.kpi-row` base (`airops.css:367-370`, `repeat(5, 1fr)`); Istruttori e Registro voli ne mettono **già 4** nello stesso `.kpi-row` | 4 KPI senza CSS nuovo (AD-6) |
| Statistiche | 5 KPI (4 se `fleetUtilization` è `null`), 3 grafici SVG, 4 `.split` | 4 KPI (o 3), 2 SVG, 3 `.split` (AD-7); il contratto `/api/v1/stats` perde 3 campi (A3) |
| Dati PPR nella cassa | FK `CashMovement_pprRequestId_fkey` `ON DELETE SET NULL` (`20260709150000_add_ppr_closure_fee:13`); lo storno eredita la categoria (`cash.service.ts:413`); `reversalOfId` `ON DELETE SET NULL`; `categoryId` `ON DELETE RESTRICT` (`20260705190000_add_accounts_topups:90/99`) | la migrazione cancella i movimenti **prima** della categoria e **prima** di togliere la colonna (AD-1) |
| Chiavi di idempotenza del dominio | `ppr-manual-create`, `ppr-approve`, `ppr-reject`, `ppr-complete`, `ppr-cancel` (route `ppr-requests/**`) | le righe `IdempotencyRecord` relative si cancellano in migrazione (R-19-a: «cancella tutto») |
| i18n | **1.989 chiavi** per file, parità **0/0**, righe identiche nei due file; le chiavi da togliere sono **229** per file | 1.760 per file a fine story, parità 0/0 (AC 11) |
| Typecheck e tipi di route generati | `tsconfig.json:29-30` include `.next/types/**` e `.next/dev/types/**`; `scripts/gates.sh:27` esegue il typecheck **prima** della build (`:30`) | dopo aver cancellato le route i tipi generati vecchi puntano a moduli che non esistono più, e `npm run gates` fallisce prima di arrivare alla build (§5) |
| Baseline dei test | unit **1.923** (gate di chiusura della 16.3); e2e **543** (arbitro della 16.3: 542 + 1 flaky); i 4 file unit da cancellare contengono ~105 test, i 3 spec e2e 27 | conteggi prima/dopo dichiarati nel record |

---

## §0 — Requisiti FISSI (contratto: CR 2026-11-01, story 19.1)

| # | Requisito (dalla CR, **AC di record**) |
|---|---|
| **P1** (R-19-a) | **DROP totale** del dominio PPR/transiti, dati compresi: tabelle, enum, FK, movimenti di cassa delle tasse PPR, categoria di cassa «PPR». Nessun dato storico da conservare. |
| **P2** (§4.2) | Via «Richieste PPR», «Voli in transito», modulo pubblico `/ppr`, API, service, email, permesso, modelli/enum/FK, AppSetting `ppr.*`, movimenti e categoria «PPR», KPI e avvisi della Panoramica, serie delle Statistiche, export, CSS dedicato (**chirurgico**: blocco condiviso con Scadenze), voci del route-registry e della tab bar mobile, orfani (`RateLimitError`/429, icona `doc`), docs (`CLAUDE.md`, `README.md`). |
| **P3** (§4.2) | **Nessun riferimento residuo** (grep limitato a storico e migrazioni), suite verde. |
| **A1** | `/ppr`, `/dashboard/ppr`, `/dashboard/movements` → **404**, nessun redirect dedicato *(lettura per l'anonimo: Q-19.1-a)*. |
| **A2** | Panoramica: via il KPI «PPR in attesa» (la riga passa a **4 KPI**) e gli avvisi PPR mobile; la tab bar ridistribuisce lo slot liberato col **riempimento predefinito**. |
| **A3** | Statistiche: «Movimenti» = **solo voli**; spariscono «Quota transiti», «Movimenti in transito», «Transiti». |
| **A4** | Si tolgono gli **orfani creati dalla rimozione** (`RateLimitError`/429, icona nav `doc`). |
| **A14** | La modifica di `prisma/seed-demo.ts` (date relative delle visite mediche) è **già** committata a parte (`6de977d`): niente da fare qui, ma il file si tocca sopra quella versione. |

| # | Invariante |
|---|---|
| **[a] Chirurgia** | Nessun comportamento **non PPR** cambia. Ogni riga toccata serve alla rimozione; quello che resta (Scadenze, «Le mie scadenze», quota associativa, BottomSheet, SlideOver, `.info-row` della scheda persona, primitive) resta **byte-identico** nel comportamento, misurato dove serve (AC 12, AC 17). |
| **[b] Migrazioni** | **Una** migrazione nuova, forward. **Mai** toccare le 4 migrazioni storiche del dominio (`20260709130000_add_ppr_requests`, `20260709140000_add_ppr_decision`, `20260709150000_add_ppr_closure_fee`, `20260715160000_add_ppr_manual_create`) né nessun'altra. |
| **[c] Contratti** | I contratti che restano mantengono la loro **forma**: `transactionRowSchema.reference` resta (le righe `CASH` lo hanno `null`); `/api/v1/stats` cambia **solo** per i 3 campi che A3 elimina. |
| **[d] Guardie sopravvissute** | Uno spec che usava una pagina PPR solo come **ospite** di una regola che sopravvive (primitive condivise: SlideOver, CalendarPopover/`useFixedPopover`, focus trap, `inert`, pavimento 44px) viene **spostato** su un'altra superficie con la stessa proprietà, mai cancellato (AD-9). |

---

## §1 — Decisioni tecniche (vincoli per il dev)

### AD-1 — Una migrazione forward: prima i dati, poi lo schema

Cartella nuova `prisma/migrations/<timestamp>_remove_ppr_domain/migration.sql` (timestamp reale, successivo a `20260807074113`). Contenuto, nell'ordine (il dev può limarne la forma, non l'ordine):

```sql
-- Story 19.1 (R-19-a, CR PO 2026-11-01): the PPR / transit domain is dropped,
-- data included — test database, nothing to preserve.

-- 1. Data, while "pprRequestId" still exists. A storno inherits its original's
--    category, so the category filter catches the reversals too.
DELETE FROM "CashMovement"
WHERE "pprRequestId" IS NOT NULL
   OR "categoryId" IN (SELECT "id" FROM "CashCategory" WHERE "name" = 'PPR');
DELETE FROM "CashCategory" WHERE "name" = 'PPR';
DELETE FROM "AppSetting" WHERE "key" IN ('ppr.landingFeeCents', 'ppr.operatingInstructions.it', 'ppr.operatingInstructions.en');
DELETE FROM "IdempotencyRecord" WHERE "endpoint" IN ('ppr-manual-create', 'ppr-approve', 'ppr-reject', 'ppr-complete', 'ppr-cancel');

-- 2. Schema.
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_pprRequestId_fkey";
DROP INDEX "CashMovement_pprRequestId_idx";
ALTER TABLE "CashMovement" DROP COLUMN "pprRequestId";
DROP TABLE "PprRequest";
DROP TABLE "PprCounter";
DROP TYPE "PprStatus";
```

Perché quest'ordine: `CashCategory` ← `CashMovement` è `RESTRICT`, quindi la categoria si cancella solo dopo i suoi movimenti. Il filtro per `pprRequestId` serve prima del `DROP COLUMN`. Lo storno di un movimento PPR sta nella stessa categoria, quindi esce con lui; un eventuale `reversalOfId` verso una riga cancellata va a `NULL` da solo (`SET NULL`). Le FK di `PprRequest` verso `User` (`decidedBy`/`closedBy`/`createdBy`) cadono col `DROP TABLE`. Su un DB fresco (senza categoria «PPR») i `DELETE` non fanno niente: la migrazione è sicura anche lì.

`schema.prisma`: via `enum PprStatus`, `model PprRequest`, `model PprCounter` (`:1612-1788`), il campo `pprRequestId`/`pprRequest` e `@@index([pprRequestId])` di `CashMovement` (`:733-740`, `:750`), le tre back-relation di `User` (`:490-495`); doc-comment riscritti dove citano il dominio (`:548-549` `LoginAttempt.ip`, `:719` `CashMovement.paymentMethod`). Poi **`npx prisma generate`**: `npm run gates` non si accorge di un client Prisma vecchio (lezione 14.4).

### AD-2 — Le funzioni della tassa PPR riusate dalla quota: si rinominano, e i loro test si spostano

In `app-settings.service.ts` si cancellano le quattro funzioni PPR (`getPprOperatingInstructions`, `setPprOperatingInstructions`, `getPprLandingFeeDefaultCents`, `setPprLandingFeeDefaultCents`, `:43-164`) e le tre chiavi (`:30-32`). **Restano, rinominate**, le due che la quota usa: `parseStoredLandingFeeCents` → **`parseStoredCents`** e `MAX_LANDING_FEE_CENTS` → **`MAX_STORED_CENTS`**, con doc-comment che non citano più il dominio (il tetto è l'`Int` di AD-2 dell'architettura). Il doc di `getMembershipFeeCents` (`:450-455`) smette di rimandare a `getPprLandingFeeDefaultCents` e dice da sé la regola: chiave assente → `0`, valore corrotto → `0` con `console.warn`. Il commento di `schemas/settings.ts:194` («Same `Int` ceiling as `pprLandingFeeDefaultSchema`») diventa autonomo.

**Copertura**: l'`it.each` dei 6 valori corrotti (`app-settings.service.test.ts:174-184`) si sposta sul describe della quota, invariato nei casi e nell'atteso (`getMembershipFeeCents` → `0`). È la sola copertura del ramo «valore corrotto» del parser: cancellarla col describe della tassa PPR farebbe perdere un test a una funzione viva.

### AD-3 — Orfani: cosa esce e cosa resta (A4)

| Elemento | Unico consumer oggi | Decisione |
|---|---|---|
| `RateLimitError` (`errors.ts:76-86`), `if (error instanceof RateLimitError) return 429` (`handler.ts:35` + import `:7`), `ERROR_DESCRIPTIONS[429]` e `429` nell'union di `errorResponses` (`registry.ts:356`, `:365`) | `ppr.service.ts` | **via** (A4) |
| `NavIconKey 'doc'` (`route-registry.ts:40`) | voce `ppr` | **via** (A4) |
| `Icon.doc` (`icons.tsx:78`) | `export-menu.tsx:51` | **resta** |
| `.flow-bar-info` (`airops.css:782`) | `MIX_TONES.TRANSIT` (`reports-console.tsx:31`) | **via** |
| `.info-card*` (`airops.css:1590-1591`, `:1596-1597`), `.req` (`:1598`) | `/ppr` | **via** |
| `.mobile-row-model` (`airops.css:3073-3077`) | `movements-table.tsx:515` | **via** |
| `.ppr-week`, `.ppr-day*`, `.ppr-empty`, `.ppr-chip*` (`airops.css:1495-1520`) | nessuno (già morte sul HEAD: porting del prototipo) | **via**: CSS col nome del dominio, che la CR chiede di togliere e che il grep A vede |
| `.info-row*` (`airops.css:1592-1595`) | `/ppr` **e** scheda persona (`people/[id]/page.tsx`) | **resta** |
| `.btn.big`, `.btn.accent`, `.btn.accent:hover`, `html[data-theme="dark"] .btn.accent` (`airops.css:1579-1588`) | solo `ppr-form.tsx:283/462` | **restano**: sono varianti del design system **documentate** in `.design-sync/conventions.md:19` (il vocabolario che l'agente Claude Design usa); non sono codice del dominio. Si riscrive solo il commento `:1582-1587`, che cita «the public PPR page's "Invia richiesta" CTA» come esempio (TD 19.1-b) |
| `airfield.contactEmail` (campo «Email di contatto» della card Club) | **nessuno**: non lo leggeva neanche `/ppr` (`ppr/page.tsx:49` legge solo nome e ICAO) | **resta**: è codice morto **preesistente**, non creato da questa rimozione (karpathy: lo si segnala, non lo si toglie). TD 19.1-a per la 19.8 |

Nessuna glifo, nessun helper di `src/lib` e nessun componente di `src/components/ui` resta orfano: il censimento degli import dei 26 file (`formatTimeOfDay`, `joinSegments`, `zonedMidnightUtc`, `todayDateOnlyInZone`, `currentMonthRange`, `useIdempotencyKey`, `parseCents`, `Icon.check|logo|plus`, namespace i18n `Export`) trova per ognuno almeno un consumer che resta.

### AD-4 — CSS: rimozione chirurgica dei blocchi misti

`airops.css` ha **sette** zone che riguardano il dominio. In tre i selettori PPR sono **mescolati** a regole che restano, a volte nello stesso elenco di selettori: lì si toglie il **selettore**, non il blocco.

| Zona (righe) | Esce | Resta, identico |
|---|---|---|
| `:1495-1520` «PPR week strip» | tutto (morto, AD-3) | — |
| `:1547-1617` modulo pubblico | `.ppr-*` (anche `html[data-theme="dark"] .ppr-mark`, `@media (max-width:820px)`), `.info-card*`, `.req`, i commenti del blocco | `.btn.big`, `.btn.accent*` (AD-3), `.info-row*` |
| `:1649-1658` | il blocco `.ppr-form-grid` a ≤640 | — |
| `:1933-2016` (15.2) | `.ppr-queue-mobile` fuori dalla query (`:1933-1936`), `.ppr-queue-desktop/-mobile` e `.ppr-card*` dentro (`:1990-2016`) | **tutte** le regole `.bottom-sheet-*`, `.mobile-sheet-list*`, `.slideover-panel` dello stesso blocco: servono a ogni BottomSheet/SlideOver dell'app |
| `:2882-3095` (15.7, «scadenze + transiti mobile») | `.movements-*` (anche dentro gli elenchi misti: `:2921/2924`, `:2932`, `:2941/2944`, `:3005-3027`, `:3034`, `:3041`), `.ppr-complete-*` (`:2933-2935`), `.mobile-row-transit` dagli elenchi misti (`:3056`, `:3060`, `:3065`), `.mobile-row-model` (`:3073-3077`), `.mobile-complete-step*` (`:3084-3095`) | `.scadenze-*`, `.my-expiries-*`, `.mobile-row-expiry*`, `.membership-fee-*`, `.scadenze-filter-panel*`; il commento d'apertura si riscrive per le sole Scadenze |
| `:3600-3615` + `:3707-3723` (15.9) | `.ppr-top-right a`, `.ppr-brand-block`, `.ppr-brand-name`, `.ppr-form-grid .input`, `.ppr-actions*` e i loro commenti | `.account-*`, `.compensation-*`, `.mobile-row-payout*`, `.account-sheet-step*` |
| `:3857-3870` (15.10, punto 8) | `.ppr-head-actions`, `.ppr-queue-head`, `.manual-ppr-form` e il loro commento | i punti (4)-(7) e (9) |

Commenti che citano il dominio senza contenere regole (`:71`, `:1118`, `:1710`, `:1951`, `:2148-2152`, `:2220`, `:2348`, `:2459`, `:2487`, `:2751`, `:3168`, `:3344`, `:3489`, `:3565-3579`, `:3702`, `:3738-3739`, `:3819-3820`): si riscrivono togliendo il riferimento e tenendo la lezione (AD-8). `:3168` conta «4 more instances» di `.split` su `/dashboard/reports`: dopo AD-7 sono **3**.

**Vietato**: aggiungere regole, cambiare token, toccare `.kpi-row`, `.split`, `.segmented`, `.date-input`, `.students`, `.card-head`. È una story che **toglie** CSS.

### AD-5 — Shell: nessuno slot nuovo, e la tab bar si riempie da sola (A2)

`NAV_ITEMS` perde `ppr` e `visiting` (`route-registry.ts:94-95`), `NavItemId` perde i due id (`:23-24`). **Nessun `mobileSlot` nuovo** e nessuna rinumerazione: `fleet` tiene `mobileSlot: 4` (gli slot sono un ordine di priorità globale, un buco al 3 è lecito per costruzione, `:67-71`), e `mobileNavLayout` riempie la quarta colonna con la prima voce senza slot in ordine di registry, cioè `pilots`. Risultato per ADMIN: tab `overview, schedule, fleet, pilots`; «Altro» `instructors, scadenze, logbook, billing, reports, settings`. Gli altri ruoli non cambiano (non vedevano le due voci). Il gruppo «Operazioni» resta con due voci. Commenti da allineare: `:5-8` (elenco delle route accese dalla 12.1), `:68-69` («1-4 are the template's admin bar»), `:89-91` (la barra del template «Panoramica / Pianificazione / PPR / Aeromobili»), `:101-102` («same small-aircraft glyph as `visiting`»).

### AD-6 — Panoramica: 4 KPI nel `.kpi-row` base, sottotitolo, avvisi

- **KPI**: via `kpi-ppr-pending` (`dashboard/page.tsx:565-567`). Restano `kpi-flights-today`, `kpi-fleet-available`, `kpi-bookings-pending`, `kpi-revenue`. **Nessun CSS nuovo**: a ≥1200px il `.kpi-row` base è a 5 colonne e la quinta resta vuota, **come già oggi** su Istruttori (`instructors/page.tsx:80`) e Registro voli (`logbook/page.tsx:233`), che hanno 4 KPI nello stesso `.kpi-row`. A ≤640 resta la **striscia** scorrevole (non la griglia 2×2 di R-15.3-c, ratificata per le landing personali): 4 card da `min-width: 146px` + 3 gap da 10 = 614px > 375, quindi la striscia scorre ancora e la guardia (v) di `mobile-primitives.spec.ts` resta discriminante (§3.4). TD 19.1-d per l'eventuale `.kpi-row` a 4 colonne.
- **Sottotitolo**: `subParts` = `[ICAO, N AOG]` (`:353-358`); via `PPR_GROUND_SCAN_LIMIT` (`:71-72`), le due chiamate `listPprRequests` dal `Promise.all` (`:276-277`, `:296-297`), `onGroundCount` (`:352`) e gli import (`:19`, `:42`). La Panoramica fa **due query in meno**.
- **Avvisi mobile**: `OverviewAlertKind` = `'expiry' | 'negativeBalance'` (`overview-alerts.ts:32`); via `pprPendingCount` dall'input (`:58`), il ramo dell'union (`:72`), `PPR_HREF` (`:101`, `:108`), i `case` di `rankOf`/`weightOf` (`:123`, `:135`), il push (`:166-167`). L'**ordine ratificato** (R-15.3-e) resta per le fonti che restano: scaduto → saldo negativo → ≤7g → ≤30g → ≤60g. Il buco al rango 3 è lecito (i ranghi sono un ordine, non un indice), quindi nessuna rinumerazione. Il doc-comment (`:1-24`) passa da tre fonti a due. In `dashboard/page.tsx` via `pprPendingCount` (`:499`) e il `case 'pprPending'` (`:525-526`); in `mobile-alerts-card.tsx` via `pprPending: Icon.plane` (`:55`).

### AD-7 — Statistiche: il contratto `/api/v1/stats` perde tre campi (A3), «Utilizzo flotta» va a tutta riga

- **Servizio** (`stats.service.ts`): via le due query su `pprRequest` (`:181`, `:186`), `seriesTransitRows`/`kpiTransitCount` (`:163`, `:168`), `etaWindow` (`:104-108`, resta senza chiamanti), il bucket mensile dei transiti (`:224-228`), `transitShare` (`:216`), la voce `TRANSIT` di `movementMix` (`:259`), `transitMovements` (`:289`). `movements = flightsCount` (`:215`). Import che restano senza uso (es. `dateOnlyInZone`, `zonedMidnightUtc`, `addDaysDateOnly`, `APP_TIMEZONE`): via, secondo lint e typecheck. Doc-comment `:14-17` e `:35-38`, commento `:247` («always all 4 keys» → 3).
- **Schema** (`schemas/stats.ts`): `statsKpisSchema` senza `transitShare` (`:47`), `statsSeriesSchema` senza `transitMovements` (`:63`), `statsMovementMixKeySchema` = `['SCHOOL', 'TOURISM', 'AERIAL_WORK']` (`:80-81`); doc-comment `:24-31`, `:80`. `AERIAL_WORK` **resta**: lo toglie la 19.5.
- **Contratto per la futura app Flutter**: risposta = `kpis {revenueCents, flightMinutes, movements, fleetUtilization}`, `series {months, revenueCents, flightMinutes}`, `movementMix` con **3** chiavi in ordine fisso. Ratificato da A3; oggi nessun client esterno lo consuma. La descrizione OpenAPI di `/api/v1/stats` (`registry.ts:2082`) smette di dire «flights/PPR/ledger»; lo schema registrato `Stats` segue da sé.
- **UI** (`reports/page.tsx`, `reports-console.tsx`): via il KPI «Quota transiti» (`page.tsx:64`, `:143`), la card del grafico «Movimenti in transito» (`reports-console.tsx:130-138` e `transitsData` `:72`), le label `charts.transits` (`page.tsx:70`, tipo `:38`), `movementMix.keys.TRANSIT` (`page.tsx:80`), `MixKey`/`MIX_TONES.TRANSIT` (`reports-console.tsx:12`, `:31`).
- **Layout (decisione UI della story, non di dominio)**: senza il grafico, la seconda `.split` (`2fr 1fr`, `airops.css:873-877`) resterebbe con la sola card «Utilizzo flotta» nella colonna `2fr` e un terzo di riga vuoto a ≥1200px. La card «Utilizzo flotta» (`reports-console.tsx:139-171`) **esce dalla `.split`** (`:129`/`:172`, il wrapper sparisce) e diventa una riga a sé, figlia diretta di `.page` come le altre (gap 22px, `airops.css:302`). Sotto i 1200px la `.split` è già a una colonna (`:1525`), quindi telefono e tablet **non cambiano**. Effetti misurabili: `.split` su `/dashboard/reports` da 4 a **3** (guardia «vicini» di `mobile-billing.spec.ts:1132`: `[319, 319, 319]`), SVG da 3 a **2** (`mobile-reports.spec.ts:343-368`: desktop `[612.66, 287.34]`).

### AD-8 — I commenti che citano il dominio: si riscrivono, la lezione resta

Circa 35 file vivi citano `ppr.service.ts`, `ppr-console.tsx`, `/ppr`, `.ppr-page`, `ppr-public.spec.ts`… come precedente o come esempio (§3.2, colonna «solo commento»). Dopo la rimozione sono **riferimenti a niente**. Regola: si toglie il riferimento e si tiene il contenuto tecnico. Esempio, `field.tsx:58-64`: la regola «l'errore sta fuori dalla `<label>`, altrimenti entra nel nome accessibile del controllo» resta; «(caught by `e2e/ppr-public.spec.ts`'s own AC 1/2 guard)» esce. Dove il commento esisteva **solo** per spiegare una dipendenza dal dominio (es. `client-ip.ts:4-9`, «keep the two extractors in sync»), si riduce a ciò che resta vero. **Mai** introdurre in un commento un'altra parola che il grep di AC 15 vede.

### AD-9 — e2e: tre classi di trattamento

| Classe | Criterio | Azione |
|---|---|---|
| **Cancella** | la regola sotto test muore col dominio (comportamento PPR, `.ppr-*`, `ManualPprForm`, modulo pubblico, coda/registro transiti) | test (o spec) cancellato, helper rimasti orfani cancellati |
| **Ri-ospita** | la regola sopravvive su una primitiva condivisa e la pagina PPR era solo l'ospite | **stesse asserzioni** su un'altra superficie con la stessa proprietà geometrica o strutturale; il record nomina l'ospite nuovo e dimostra che ha la proprietà (es. «il corpo scorre a 375×812: `scrollHeight` X > `clientHeight` Y»). Le cifre di discriminanza scritte nei commenti (es. «11 / 17» in `mobile-a11y-sweep.spec.ts:425-434`) vanno **rimisurate** sull'ospite nuovo e corrette, mai lasciate false |
| **Adatta** | spec misti (Scadenze + Transiti, Panoramica, Statistiche, Impostazioni, shell) | si toglie la metà PPR; le asserzioni sul resto restano **byte-identiche** salvo i valori che cambiano **per costruzione** (conteggi di KPI, tab, PUT, SVG, `.split`), corretti al valore nuovo e spiegati nel record |

La tabella completa per test sta in §3.4. La catena serializzata di `playwright.config.ts` **non cambia**: nessun project della catena è dedicato al dominio. `settings.spec.ts`, `reports.spec.ts`, `billing-global.spec.ts` e `mobile-settings.spec.ts` restano dove sono e cambiano solo nel contenuto (`git diff -- playwright.config.ts` vuoto).

### AD-10 — Il 404 si prova con una sonda nel record, non con uno spec

Uno spec che asserisce «`/it/ppr` → 404» dovrebbe contenere `/ppr`, cioè il residuo che AC 15 vieta. Le rotte cancellate non tornano da sole. La prova del 404 (A1) si fa quindi con una **sonda HTTP** sulla build di produzione, riportata verbatim nel record (AC 1), non con uno spec. Le **guardie strutturali** restano committate: `route-registry.test.ts` (ADMIN vede esattamente le voci nuove), `registry.test.ts` (elenco dei path), e2e di shell e Panoramica (testid esatti).

### AD-11 — `.design-sync`: testo allineato, sincronizzazione remota fuori scope

`.design-sync/conventions.md:3` descrive il prodotto («pilots, fleet, bookings, PPR, expiries, billing») e `.design-sync/previews/KPI.tsx:3-11` riproduce la riga KPI della Panoramica («five KPIs», «PPR in attesa»). Sono il materiale che l'agente Claude Design legge: dopo la story descriverebbero un prodotto che non esiste più. Si correggono nel repo: via «PPR» dalla descrizione, preview a **quattro** KPI come la Panoramica vera. La **sincronizzazione** col progetto remoto (skill design-sync, `.design-sync/NOTES.md` §«Re-sync recipe») resta **fuori scope**: TD 19.1-c per la sessione principale. Anche `airops.css` cambia, e `NOTES.md` chiede di rivalidare `conventions.md` dopo ogni refactor del CSS.

---

## §2 — Acceptance Criteria

> «**misurato**» = un numero nel Dev Agent Record. «**verbatim**» = output del comando incollato nel record. Le verifiche UI si fanno a **1280×900** e **375×812**, IT ed EN, tema chiaro e scuro dove l'AC lo dice.

### Rimozioni

**AC 1 — Le tre pagine e le API non esistono più: 404 (A1), verificato con una sonda.**
Cancellati: `src/app/[locale]/dashboard/ppr/**` (3 file), `src/app/[locale]/dashboard/movements/**` (3), `src/app/[locale]/ppr/**` (2), `src/components/ppr/manual-ppr-form.tsx`, `src/app/api/v1/ppr-requests/**` (7 route), `src/app/api/v1/settings/ppr-landing-fee/route.ts`, `src/app/api/v1/settings/ppr-operating-instructions/route.ts`. **Sonda verbatim** (curl o script `playwright-core`) sulla **build di produzione**, con la sessione admin: `GET /it/dashboard/ppr`, `/en/dashboard/ppr`, `/it/dashboard/movements`, `/it/ppr`, `/en/ppr` → **404**; `GET /api/v1/ppr-requests`, `POST /api/v1/ppr-requests/manual`, `GET /api/v1/ppr-requests/pdf`, `POST /api/v1/ppr-requests/x/approve`, `GET /api/v1/settings/ppr-landing-fee`, `GET /api/v1/settings/ppr-operating-instructions` → **404**. Senza sessione (Q-19.1-a ratificata **B** — testo corretto in review F3): `/it/ppr` e `/en/ppr` → **404**, `POST /api/v1/ppr-requests` → **401** `UNAUTHENTICATED`. Nessuna pagina di redirect dedicata.

**AC 2 — Dominio server e gate: nessun codice PPR resta.**
Cancellati `src/server/services/ppr.service.ts` (+test), `src/lib/schemas/ppr.ts` (+test), `src/lib/ppr-movement-status.ts` (+test), `src/lib/mobile-movements.ts` (+test). `templates.ts`: via i tre tipi (`:25-27`) e i tre builder con i loro doc (`:204-315`); il doc di `buildBookingDeniedEmail` (`:325`) smette di rimandare a `buildPprRejectionEmail`. `rbac.ts`: `'ppr.manage'` via dall'union (`:33`) e da `ALL_PERMISSIONS` (`:75`). `proxy.ts`: via `'/ppr'` (`:14`) e `'/api/v1/ppr-requests'` (`:44`) e i commenti relativi (`:11-13`, `:34-37`). Orfani di AD-3 via: `RateLimitError`, il suo mapping 429, il 429 del registry. `errors.ts:52-63`: il doc di `ConflictError` cita come primi chiamanti con codice proprio quelli che esistono davvero (`PERSON_BUSY`/`INSTRUCTOR_BUSY`, `bookings.service.ts:432-433`).

**AC 3 — Una migrazione forward, provata su un DB gemello popolato (misurato).**
AD-1. `git diff --stat d9dbc8c -- prisma/migrations` → **solo** la cartella nuova (le migrazioni esistenti non cambiano di un byte). `schema.prisma` come in AD-1; `npx prisma generate` eseguito. Prova su un **DB gemello proprio** (es. `createdb am_19_1` nel container; **mai** il DB `airmanager` mentre l'arbitro o la sessione principale lo usano, **mai** `docker compose down -v`): (1) gemello migrato fino alla baseline e popolato con almeno una richiesta COMPLETED con tassa > 0 (e il suo `CashMovement` collegato), **uno storno** di quel movimento, una richiesta APPROVED e una PENDING, un `CashMovement` manuale (via SQL) nella categoria «PPR», le 3 chiavi `ppr.*` in `AppSetting`, una riga `IdempotencyRecord` `ppr-approve`, più movimenti di cassa **non** PPR; (2) `npx prisma migrate deploy` → la migrazione nuova passa senza errori; (3) conteggi verbatim prima/dopo: `CashMovement` della categoria «PPR» → 0, categoria «PPR» → 0, `to_regclass('"PprRequest"')` e `to_regclass('"PprCounter"')` → `NULL`, `pg_type` `PprStatus` → 0 righe, le 3 chiavi → 0, `IdempotencyRecord ppr-*` → 0, `CashMovement` **non** PPR → **identico** a prima; (4) `migrate diff` dalle migrazioni allo schema → **vuoto** (zero drift; sintassi Prisma 7 da `npx prisma migrate diff --help`). Il gemello si elimina alla fine.

**AC 4 — Cassa: la categoria «PPR» non esiste più, nemmeno come categoria di sistema.**
`SYSTEM_CASH_CATEGORY_NAMES` = `{'Ricariche', 'Compensi istruttori'}` (`cash.service.ts:54`); doc `:37-53` e `:440-441` riscritti. Via «PPR» da `CASH_CATEGORY_NAMES` in `prisma/seed.ts:230` e `prisma/seed-demo.ts:106`. `transactions.service.ts`: via `pprRequest: { select: { pprNumber: true } }` (`:90`), la riga `CASH` ha `reference: null` (`:317`, forma del DTO invariata, invariante [c]); doc `:297`, `:301`, `:436` e `schemas/transactions.ts:50` riscritti. Commenti «tre categorie di sistema» → due: `mobile-settings.ts:51`, `cash-categories-card.tsx:269-270`, `schemas/cash.ts:112`. La guardia «niente movimenti manuali / rinomina / cancellazione su una categoria di sistema» resta **identica** per le due che restano (unit di `cash.service.test.ts` verdi).

**AC 5 — Impostazioni: la card Club perde la tassa PPR e le istruzioni operative.**
`club-card.tsx`: via le label `landingFee`, `landingFeeHint`, `operatingInstructionsIt`, `operatingInstructionsEn` (`:18-21`), le props `landingFeeCents`, `operatingInstructions` (`:36-37`, `:55`), lo stato (`:59-61`), il parsing della tassa (`:72-78`, `:84`: resta quello della quota), i due PUT (`:101-110`), il campo (`:176-178`), l'hint (`:186-188`), il blocco istruzioni (`:193-212`); doc `:42-54` riscritto. La card salva con **3** PUT (`settings/club`, `settings/metar-station`, `settings/membership-fee`) e il resto del comportamento (422 su `contactEmail` marcato sul campo, feedback) resta identico. `settings/page.tsx`: via import (`:11-12`), doc (`:114-115`), le due letture (`:152-153` e la destrutturazione `:146`), le props (`:190-191`), le label (`:208-211`). `app-settings.service.ts` come in AD-2. Copy ritoccate (AC 11): `club.sub`, `smtp.sub`. Verifica UI (AC 18): la griglia della card a 1280 e 375 non lascia celle vuote orfane (4 campi: ICAO, email di contatto, stazione METAR, quota associativa).

**AC 6 — Panoramica: 4 KPI, sottotitolo a due parti, avvisi a due fonti.**
AD-6. e2e: `kpi-ppr-pending` **count 0** a 375 e 1280; i 4 testid restanti **un solo nodo** ciascuno; `.kpi-value` = **4**. Il sottotitolo non contiene più i due conteggi (asserito per **struttura**, cioè numero di parti, non cercando la parola). Unit `overview-alerts.test.ts`: l'ordine dell'intero risultato (lezione 15.3 F8) sulle due fonti rimaste è quello ratificato; i test «omits/collapses the PPR voice» e «points at PPR» si cancellano, quello del `moreHref` resta per le fonti rimaste. Misurato: query della Panoramica admin prima/dopo (le due `listPprRequests` in meno, per lettura del `Promise.all`).

**AC 7 — Shell: sidebar, tab bar e «Altro» senza le due voci.**
AD-5. `route-registry.test.ts` con `toEqual` **esatti**: ADMIN `tabs` = `['overview', 'schedule', 'fleet', 'pilots']`, `more` = `['instructors', 'scadenze', 'logbook', 'billing', 'reports', 'settings']`; il test del riempimento (`:56-70`) ricostruito su un elenco che ha ancora meno voci con slot delle colonne (es. ADMIN senza `fleet`), con il suo atteso esatto. Gli altri tre test **invariati**. `NavIconKey` senza `'doc'`. i18n `shell.nav.ppr|visiting` e `shell.pageTitle.ppr|visiting` via. e2e `mobile-shell.spec.ts`: 4 tab visibili con quegli id, `mobile-more-sheet` con **6** link; la navigazione dallo sheet usa una voce che ci sta ancora (es. `mobile-more-instructors` → `/dashboard/instructors`), perché `pilots` ora è un tab. La negazione per il pilota (`:138`) usa un id che esiste davvero per l'admin (es. `mobile-tab-fleet`), non uno che non può più esistere.

**AC 8 — Statistiche e contratto `/api/v1/stats` (A3).**
AD-7. Unit `stats.service.test.ts`: `Object.keys(result.kpis).sort()`, `Object.keys(result.series).sort()` e `result.movementMix.map((m) => m.key)` asseriti **esatti** (le chiavi della risposta, senza nominare quelle tolte); `movements` = numero di voli REGISTERED; il mock di `prisma` **non** ha più `pprRequest` (se un `findMany`/`count` su quella tabella restasse nel servizio, il test cadrebbe su `undefined`). e2e `reports.spec.ts`: fixture senza transito; delta ricavi = **solo** i voli (via `+ 2500`); delta movimenti = **2**; righe del mix solo SCHOOL/TOURISM/AERIAL_WORK; KPI = **4** (`:362`); tipo `StatsDto` allineato. UI: «Utilizzo flotta» a tutta riga a 1280 (screenshot), identica a 375. JSON OpenAPI generato riportato per lo schema `Stats` (le chiavi esatte).

**AC 9 — Export: niente xlsx/pdf PPR.**
`exports.service.ts`: via import (`:16`, `:30`), `PPR_STATUS_KEYS` e `exportPprRequestsXlsx` (`:308-335`), `exportPprRequestsPdf` (`:721-749`). Nessun consumer del namespace `MovementsPage` resta (`git grep -n "MovementsPage" -- src` → 0). `exports.service.test.ts`: via mock e import di `./ppr.service` (`:21`, `:41`), `exportPprRequestsPdf` (`:61`), `listPprRequestsMock` (`:73`, `:104`), il describe (`:812-912`). Gli altri export **invariati**.

**AC 10 — OpenAPI: nessun path, schema, tag o parametro PPR (verificato a lettura).**
`registry.ts`: via import (`:111-121`), le 8 `register` (`:317-324`), `pprRequestIdParams` (`:348`), il 429 (AD-3), i path da `:1585` a `:1778` (7 path PPR + 2 di impostazioni, tag `Ppr`). `registry.test.ts`: via le 8 voci dall'elenco `arrayContaining` (`:76-83`), i test `:184-197`, il describe `:199-247`, la voce `'/api/v1/ppr-requests/pdf'` (`:263`) e il titolo `:258`. ⚠️ `registry.test.ts` usa `arrayContaining`, quindi **non** vede un path rimasto: nel record, numero di path del JSON generato prima/dopo e `curl -s …/api/v1/openapi.json | grep -ci ppr` → **0**.

**AC 11 — i18n: chiavi via dai due file, parità 0/0, tre copy ritoccate.**
Via, in `it.json` **e** `en.json` (righe identiche): namespace `PprPage` (`:1771-1837`, 45 chiavi), `PprQueuePage` (`:1838-1931`, 66), `MovementsPage` (`:1932-2056`, 95); `shell.nav.ppr|visiting` (`:17-18`), `shell.pageTitle.ppr|visiting` (`:33-34`); `DashboardPage.overview.pprPendingCount`, `onGroundCount`, `kpis.pprPending`, `mobile.alerts.pprSub` (`:119-120`, `:125`, `:147`); `SettingsPage.club.landingFee`, `landingFeeHint`, `operatingInstructionsIt|En` (`:2076-2079`); `Emails.pprReceipt|pprApproval|pprRejection` (`:2370-2382`, 7 chiavi); `ReportsPage.kpi.transitShare` (`:2611`), `charts.transits` (`:2623-2626`), `movementMix.keys.TRANSIT` (`:2640`). Totale **229** per file → **1.760** (se il numero reale è diverso, il record dice quale chiave e perché). Parità **0/0** col comando verbatim di 16.3 AC 10. Copy (testo **indicativo**, il dev può affinarlo restando nel lessico dell'app; la 19.12 le rilegge):

| Chiave | IT | EN |
|---|---|---|
| `DashboardPage.overview.mobile.alerts.empty` | Nessun avviso: scadenze e saldi sono in regola. | No alerts: expiries and balances are all in order. |
| `SettingsPage.smtp.sub` | Posta in uscita per inviti, promemoria e avvisi | Outgoing mail for invitations, reminders and alerts |
| `SettingsPage.club.sub` | Identità usata nella console e nei PDF esportati | Identity used across the console and exported PDFs |

**AC 12 — CSS: rimozione chirurgica, il resto identico (misurato).**
AD-4. `grep -cE "\.ppr-|\.movements-|manual-ppr|mobile-row-transit|mobile-complete-step|mobile-row-model|\.info-card|\.flow-bar-info|^\.req\b" src/styles/airops.css` → **0**. Le regole elencate come «Resta» in AD-4 sono byte-identiche (`git diff -U0` del file nel record: ogni riga `-` appartiene a un selettore della colonna «Esce» o a un commento riscritto). **Misura**: `getComputedStyle` di un campione fisso di nodi delle superfici che condividevano i blocchi (testata e card mobile di Scadenze, `my-expiry-row-mobile`, il pannello «Quota associativa», un `BottomSheet` aperto, un `SlideOver` aperto, la scheda persona `.info-row .v`) a 375 e 1280, **prima e dopo**: identico. Il campione e il diff stanno nel record.

**AC 13 — Seed: nessun seed scrive o importa il dominio.**
`seed.ts`: via «PPR» (`:230`), commento `:270-272` riscritto. `seed-demo.ts`: via l'import (`:24`), il blocco del traffico PPR (`:495-515`), «PPR» dalle categorie (`:106`) e dal commento d'apertura (`:7`, `:11`). `seed-load.ts`: via la Phase 8 (`:1227-1357`) e le fasi successive rinumerate (9 → 8, 10 → 9, commenti compresi), `PprStatus` (`:61`), `VOL.pprRequests` (`:228`, `:251`), il volume nel commento d'apertura (`:17`, `:37`), «PPR» dalle categorie della Phase 5 (`:1030`) e dal suo commento (`:1016-1018`), `pprRequest.count()` e il suo log (`:1502`, `:1511`, `:1523`). **Misurato**: `npx prisma db seed` **e** `npx tsx prisma/seed-demo.ts` eseguiti su DB gemello appena migrato (anche quello di AC 3, ricreato) → exit 0, conteggi stampati riportati. `seed-load.ts`: passa il typecheck (`tsconfig` include `**/*.ts`); eseguirlo a `LOAD_SCALE` ridotto su un gemello è facoltativo e va dichiarato.

**AC 14 — Docs e harness allineati.**
`CLAUDE.md:3` (descrizione senza PPR) e `:33` (route map senza `ppr` e `movements`; «Fuori registry» senza `/ppr`); `README.md:3`; `docs/operations/load-testing.md:146` (riga `pdf ppr` via dalla tabella di baseline); `scripts/perf/targets.json` (via le 6 voci `:22-23`, `:31`, `:36-37`, `:48`, JSON valido: la virgola finale di `:47` va tolta); `scripts/perf/targets-hot.json:8`; `scripts/e2e.sh:18` (esempio con uno spec che esiste, es. `e2e/bookings.spec.ts`); `.design-sync/conventions.md:3` e `.design-sync/previews/KPI.tsx` (AD-11). `node -e "JSON.parse(require('fs').readFileSync('scripts/perf/targets.json'))"` e lo stesso per `targets-hot.json` → nessun errore.

### Nessun residuo

**AC 15 — Due grep, zero righe (verbatim).**
Eccezioni ammesse, e solo queste: `_bmad-output/` (storico BMAD, story file compresi), `docs/handoffs/`, `docs/superpowers/`, `docs/security/`, `docs/design-reference/` (storico e prototipo), `prisma/migrations/` (storiche **e** quella nuova, che deve nominare gli oggetti che droppa), `.claude/skills/` (skill generiche: «transit» compare nei dati di design di `ui-ux-pro-max`), `package-lock.json` (hash).

```bash
EX=(':(exclude)_bmad-output' ':(exclude)docs/handoffs' ':(exclude)docs/superpowers' ':(exclude)docs/security' \
    ':(exclude)docs/design-reference' ':(exclude)prisma/migrations' ':(exclude).claude/skills' ':(exclude)package-lock.json')
# A — the domain token, case-sensitive so "APPROVED"/"approve" never match, camelCase included
git grep -nIP '(?<![A-Za-z])[Pp][Pp][Rr]|[a-z]Ppr|[a-z]PPR' -- . "${EX[@]}"
# B — the transit view and the two PPR settings
git grep -nIiP "transit(?!ion|iv)|landing.?fee|operating.?instructions|/dashboard/movements|MovementsPage|['\"]visiting['\"]|onGround|in transito" -- . "${EX[@]}"
```

Entrambi → **nessuna riga**. Sul HEAD di baseline A e B trovano insieme 120 file (91 da modificare + 29 da cancellare, §3). Se il PO sceglie Q-19.1-a **B**, l'unica eccezione aggiuntiva è la riga `'/ppr'` di `src/proxy.ts`, da riportare nel record. Il file `e2e/mobile-expiries-movements.spec.ts` **conserva il nome** (§6): i grep guardano il contenuto, non i nomi dei file.

### Test e verifica

**AC 16 — Unit: cancellati, aggiornati, in shell pulita.**
Cancellati: `ppr.service.test.ts`, `schemas/ppr.test.ts`, `ppr-movement-status.test.ts`, `mobile-movements.test.ts`. Aggiornati come in §3.3. La copertura del parser si sposta (AD-2): l'`it.each` dei 6 valori corrotti gira su `getMembershipFeeCents`. `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` **verde** su ogni file unit toccato (lista nel record). Conteggio unit prima (1.923) / dopo, spiegato: test cancellati con i file, test cancellati dentro i file modificati, test spostati.

**AC 17 — e2e: cancellati, ri-ospitati, adattati, catena intatta.**
AD-9 e tabella §3.4. Cancellati `e2e/ppr-public.spec.ts`, `e2e/ppr-queue.spec.ts`, `e2e/movements.spec.ts`. Ogni test **ri-ospitato** mantiene le asserzioni; il record nomina l'ospite e dimostra la proprietà. Ogni test **adattato** mantiene byte-identiche le asserzioni sulle superfici che restano; i valori cambiati per costruzione sono elencati con la causa. `git diff -- playwright.config.ts` → vuoto. Testid nuovi: **nessuno** previsto; se servisse, audit `grep -rn 'data-testid\^=' e2e/` prima di sceglierlo (CLAUDE.md). Selettori scoped o `exact: true`, mai `hasText` con date o `H:MM` (lezione 11.2).

**AC 18 — Verifica UI interattiva (screenshot nel record).**
Con Playwright MCP o, dal subagent, lo script `playwright-core` throwaway (HANDOFF): Panoramica admin 1280 e 375 (4 KPI, sottotitolo, feed Avvisi, tab bar `Panoramica · Pianificazione · Flotta · Piloti · Altro` e sheet «Altro» a 6 voci); Statistiche 1280 («Utilizzo flotta» a tutta riga, 4 KPI, mix a 3 righe) e 375; Impostazioni, card Club, 1280 e 375; sidebar a 1280 (gruppo «Operazioni» con 2 voci). IT **ed** EN su Panoramica e Impostazioni, tema chiaro **e** scuro sulla Panoramica. Overflow orizzontale **0** a 320, 375 e 390 su Panoramica, Statistiche e Impostazioni (misurato). Console del browser senza errori su queste pagine.

**AC 19 — Gate.**
`npm run gates` verde (output compatto; prima, la rigenerazione dei tipi di route di §5). Suite e2e completa su build di produzione e **DB fresco**: solo con `scripts/e2e.sh start` + `scripts/e2e.sh status` (mai `playwright test` in foreground; `export JOBS_SECRET=<non-placeholder>` prima di ogni run con `CI=1`), **coordinata con la sessione principale** (arbitro, porta 3000, reset del DB). Conteggio e2e prima (543) / dopo nel record: test cancellati con gli spec, test cancellati dentro gli spec misti, test ri-ospitati (stesso numero).

---

## §3 — Dev Notes: ricognizione su `d9dbc8c`

### 3.1 — File da cancellare (29) — nessun consumer fuori dal dominio

| Area | File (righe) |
|---|---|
| Pagine | `src/app/[locale]/dashboard/ppr/{page.tsx (240), ppr-console.tsx (561), manual-ppr-launch-button.tsx (48)}`; `src/app/[locale]/dashboard/movements/{page.tsx (353), movements-table.tsx (852), log-arrival-launch-button.tsx (46)}`; `src/app/[locale]/ppr/{page.tsx (162), ppr-form.tsx (470)}`; `src/components/ppr/manual-ppr-form.tsx (377)` |
| API | `src/app/api/v1/ppr-requests/{route.ts, manual/route.ts, pdf/route.ts, [id]/approve/route.ts, [id]/reject/route.ts, [id]/complete/route.ts, [id]/cancel/route.ts}`; `src/app/api/v1/settings/{ppr-landing-fee,ppr-operating-instructions}/route.ts` |
| Dominio | `src/server/services/ppr.service.ts (721)` + `.test.ts (1100)`; `src/lib/schemas/ppr.ts (289)` + `.test.ts (81)`; `src/lib/ppr-movement-status.ts (41)` + `.test.ts (80)`; `src/lib/mobile-movements.ts (64)` + `.test.ts (69)` |
| e2e | `e2e/ppr-public.spec.ts (384, 6 test)`, `e2e/ppr-queue.spec.ts (556, 9)`, `e2e/movements.spec.ts (524, 12)` |

Consumer esterni di questi file sul HEAD (tutti trattati in 3.2): `dashboard/page.tsx:19,42` (`deriveApprovedPprMovementStatus`, `listPprRequests`), `exports.service.ts:16,30`, `app-settings.service.ts:2` (tipo `PprOperatingInstructionsDto`), `registry.ts:111-121`, `prisma/seed-demo.ts:24` (`createManualPprRequest`, `completePprRequest`: **il seed demo chiama il service**), `exports.service.test.ts:21,41`. `src/generated/prisma/**` è gitignored e si rigenera (AD-1).

### 3.2 — File da modificare (91 + `mobile-reports.spec.ts`)

Righe sul HEAD di baseline. «C» = solo commento o doc (AD-8).

**Dominio, contratti, server**

| File | Cosa |
|---|---|
| `prisma/schema.prisma` | AD-1 (`:490-495`, `:548-549` C, `:719` C, `:733-740`, `:750`, `:1612-1788`) |
| `src/server/services/app-settings.service.ts` | AD-2 (`:2`, `:17-28` C, `:30-32`, `:40-41`, `:43-164`, `:450-455` C, `:465`) |
| `src/server/services/stats.service.ts` | AD-7 (`:16` C, `:35-38` C, `:104-108`, `:163`, `:168`, `:181`, `:186`, `:215-216`, `:224-228`, `:247` C, `:259`, `:284`, `:289`) |
| `src/server/services/exports.service.ts` | AC 9 (`:16`, `:30`, `:308-335`, `:721-749`) |
| `src/server/services/cash.service.ts` | AC 4 (`:37-53` C, `:54`, `:440-441` C) |
| `src/server/services/transactions.service.ts` | AC 4 (`:90`, `:297` C, `:301` C, `:317`, `:436` C) |
| `src/server/services/errors.ts` | AD-3 (`:52-63` C, `:76-86`) |
| `src/server/adapters/mail/templates.ts` | AC 2 (`:25-27`, `:204-315`, `:325` C) |
| `src/server/auth/rbac.ts` | AC 2 (`:33`, `:75`) |
| `src/proxy.ts` | AC 2 (`:11-13` C, `:14`, `:34-37` C, `:44`) |
| `src/lib/api/handler.ts` | AD-3 (`:7`, `:35`) |
| `src/lib/schemas/registry.ts` | AC 10 (`:111-121`, `:317-324`, `:348`, `:356`, `:365`, `:1585-1778`, `:2082`) |
| `src/lib/schemas/stats.ts` | AD-7 (`:24-31` C, `:47`, `:63`, `:80-81`) |
| `src/lib/schemas/transactions.ts`, `schemas/cash.ts`, `schemas/settings.ts` | C (`:50`; `:112`; `:14`, `:194`) |
| `src/server/services/bookings.service.ts` | C (`:1267`, «`ppr.service.ts#lockPprRequest`»: la 16.3 è chiusa, il file è libero) |
| `src/server/auth/auth.ts`, `auth/login-throttle.ts`, `services/auth-tokens.service.ts`, `lib/api/client-ip.ts`, `lib/zoned-time.ts`, `lib/use-idempotency-key.ts`, `server/adapters/excel/workbook.ts`, `app/api/v1/auth/forgot-password/route.ts`, `app/api/v1/bookings/pdf/route.ts` | C (`:32`; `:7`, `:89-92`; `:15`, `:29`; `:4-9`; `:205`; `:36`; `:27`; `:14`; `:8`) |

**UI**

| File | Cosa |
|---|---|
| `src/components/shell/route-registry.ts` | AD-5 (`:5-8` C, `:23-24`, `:40`, `:68-69` C, `:89-91` C, `:94-95`, `:101-102` C) |
| `src/app/[locale]/dashboard/page.tsx` | AD-6 (`:19`, `:42`, `:71-72`, `:196` C, `:276-277`, `:296-297`, `:331` C, `:352-357`, `:493-494` C, `:499`, `:525-526`, `:565-567`) |
| `src/lib/overview-alerts.ts`, `components/dashboard/mobile-alerts-card.tsx` | AD-6 |
| `src/app/[locale]/dashboard/reports/page.tsx`, `reports/reports-console.tsx` | AD-7 |
| `src/app/[locale]/dashboard/settings/club-card.tsx`, `settings/page.tsx` | AC 5 |
| `src/app/[locale]/dashboard/settings/cash-categories-card.tsx`, `lib/mobile-settings.ts` | C, AC 4 (`:269-270`; `:51`) |
| `src/styles/airops.css` | AD-4, AD-3 (`:782`) |
| `src/app/globals.css`, `app/[locale]/layout.tsx` | C (`:15`; `:90-91`: rimandano al commento `flex-shrink:0` di `.ppr-page`, che non esiste più. La regola `body{display:flex…}` **resta**) |
| `src/components/ui/{bottom-sheet.tsx, calendar-popover.tsx, date-input.tsx, field.tsx, fixed-popover.ts, mobile-sheet.tsx}` | C (`:5`, `:22`, `:41`; `:160`; `:26`; `:64`; `:9`; `:108`): primitive del design system, solo i commenti |
| `src/app/[locale]/dashboard/{mobile-booking-list.tsx, mobile-pending-bookings.tsx, fleet/fleet-console.tsx, fleet/aircraft-editor.tsx, people/[id]/page.tsx}` | C (`:17`, `:72`; `:16`, `:102`; `:24`; `:368`; `:308`) |

**i18n, seed, docs**: `messages/it.json`, `messages/en.json` (AC 11); `prisma/seed.ts`, `seed-demo.ts`, `seed-load.ts` (AC 13); `CLAUDE.md`, `README.md`, `docs/operations/load-testing.md`, `scripts/e2e.sh`, `scripts/perf/targets.json`, `scripts/perf/targets-hot.json`, `.design-sync/conventions.md`, `.design-sync/previews/KPI.tsx` (AC 14).

**Test**: gli unit di 3.3, gli e2e di 3.4.

### 3.3 — Unit esistenti che cambiano

| File | Cambio |
|---|---|
| `src/lib/schemas/registry.test.ts` | AC 10 (`:76-83`, `:184-197`, `:199-247`, `:258`, `:263`). Il describe «Idempotency-Key header» (`:324-350`) copre altri path: **invariato** |
| `src/server/services/app-settings.service.test.ts` | import `:24-28`; describe `:73-138` e `:139-221` via; `it.each` dei valori corrotti spostato su `:541-574` (AD-2) |
| `src/server/services/exports.service.test.ts` | AC 9 |
| `src/server/services/stats.service.test.ts` | mock `pprRequest` (`:30`, `:55-56`, `:78-79`) via; `:126-135` («buckets a PPR transit») e `:163-167` («transitShare is 0») via; `:137-161` riscritto senza transiti, con le chiavi esatte di AC 8 |
| `src/lib/overview-alerts.test.ts` | `EMPTY` (`:12`) senza `pprPendingCount`; ordine (`:15-35`) sulle fonti rimaste; `:61-71` e `:125-134` via |
| `src/server/services/cash.service.test.ts` | `it.each(['Ricariche', 'PPR', 'Compensi istruttori'])` (`:142`) senza 'PPR'; `it.each(['PPR', 'Compensi istruttori'])` (`:196`, `:318`, `:346`): «PPR» sostituito con «Ricariche» (resta una guardia sulle due categorie di sistema vere). Le fixture con `category: { name: 'PPR' }` (`:381`, `:415`, `:522`, `:572`, `:693`, `:718`, `:812`, `:819`) vanno lette una per una: dove «PPR» era **la categoria di sistema** si usa «Ricariche» o «Compensi istruttori»; dove era **una categoria qualunque** con movimenti (report, ripartizione) un nome qualunque non di sistema (es. «Carburante»), atteso invariato |
| `src/server/auth/rbac.test.ts` | `:19`, `:47-48`, `:53`, `:90-91` |
| `src/components/shell/route-registry.test.ts` | AC 7 |
| `src/server/services/errors.test.ts` | `:20-25`: esempio con un codice reale (`PERSON_BUSY`) |
| `src/server/services/transactions.service.test.ts` | `:103` (`pprRequest: null` nella fixture) via |
| `src/server/services/bookings.service.test.ts` | `:1499` C |

**Non devono cambiare** (sentinelle di non regressione, verdi senza modifiche): `mobile-settings.test.ts`, `mobile-sub-line.test.ts`, `handler.test.ts`, `templates.test.ts`, `aog-impact.test.ts`, `booking-transition.test.ts`, `period-presets.test.ts`, `zoned-time.test.ts`.

### 3.4 — e2e: tabella per test (AD-9)

| Spec | Test / riga | Classe | Note |
|---|---|---|---|
| `ppr-public`, `ppr-queue`, `movements` | tutti | Cancella | |
| `mobile-expiries-movements.spec.ts` | `:361` AC1, `:495` AC3 scadenza, `:712` AC5, `:751` AC5/12, `:942` AC8 | **Invariati** | solo Scadenze |
| | `:388`, `:411`, `:530`, `:574`, `:630`, `:661`, `:684`, `:788`, `:824`, `:1324` | Cancella | transiti e `ManualPprForm` |
| | `:451`, `:470`, `:888`, `:960`, `:1034`, `:1166`, `:1215`, `:1258` | Adatta | metà transiti via: in `:888` le due `goto('/it/dashboard/movements')` + redirect (`:922-923`, `:933-934`); in `:1034` i testid `ppr-register-*` (`:1057`). Helper orfani via (`createPendingRequest`, `createApprovedRequest`, `gotoMovementsFor`, `createManualApproved`, `movementCards`, `pprCategoryId`, `pprMovementsWithDescription`, `UI_MOVEMENTS_PAGE_SIZE` e ogni costante rimasta senza uso). Il file **non** si rinomina (§6) |
| `mobile-self-public.spec.ts` | describe `:905-1053` (modulo pubblico), `:1055-fine` (deep link coda↔transiti); helper `createApprovedPpr` `:195-222` | Cancella | doc d'apertura `:4-8`; import `Browser` se resta senza uso |
| `mobile-primitives.spec.ts` | `:55-73` (alberi della coda PPR) | Cancella | regole (i)/(ii) morte col CSS |
| | `:89-243` (SlideOver a tutto schermo, piede fuori dal corpo, popover) | **Ri-ospita** | requisiti dell'ospite: form in `SlideOver` col `footer`, corpo che **scorre** a 375×812, una `.date-input-btn` nel pannello. Suggerito: editor volo (`flight-editor.tsx`, `footer` `:871`) da `/it/dashboard` (`dispatch-flight-button`) o dal Registro voli; testid del submit dell'ospite al posto di `manual-ppr-submit` |
| | `:271-272` (striscia KPI, regola (v)) | Adatta | `cardCount >= 5` → `>= 4`; «ultima card non raggiungibile a scrollLeft 0» resta vera e va **misurata** (AD-6) |
| | doc `:7-12` | C | |
| `mobile-a11y-sweep.spec.ts` | consumer «shared form panel» `:210-216` | **Ri-ospita** | AC 2 della 15.10 chiede **tre grammatiche diverse**: la terza dev'essere distinta da «simple form panel» (`new-booking-button`) e «multi-form editor via bottom sheet» (Flotta). Suggerito: editor volo (`dispatch-flight-button`) |
| | `:440` elenco URL del pannello chiuso `inert` | **Ri-ospita** | `/it/dashboard/ppr` → una pagina con uno `SlideOver` chiuso nel DOM (es. `/it/dashboard/logbook`); cifre di discriminanza del commento `:425-434` (11/17) **rimisurate** |
| | `:388`, `:427-428` | C | |
| `mobile-ink-targets.spec.ts` | `:300-345` | Adatta | URL `/dashboard/movements` e `/dashboard/ppr` via dall'elenco; misura di controllo su `/it/ppr` (`:333-344`) via; titolo e commento `:294-299` |
| | describe `:509-620` | Cancella | `.ppr-head-actions`, `.ppr-queue-head`, `.manual-ppr-form` morti |
| | `:712` | C | |
| `datetime-picker.spec.ts` | `:152` (invio reale da `/ppr`) | Cancella | l'invio reale guidato dal picker è già coperto da `:127` (prenotazione) |
| | `:237` (375: campo e popover dentro il viewport, conferma colpibile) | **Ri-ospita** | su un `DateTimeInput` vivo a 375 (es. form Nuova prenotazione, campo Fine); stesse asserzioni |
| | `:269` (TD7-F1: trigger vicino al fondo, aperto **senza** scrollIntoView → flip/clamp) | **Ri-ospita** | **unica** guardia di TD7-F1; il flip/clamp di `fixed-popover.ts` dipende dal viewport, non dall'ospite. Precondizione **asserita** prima del click: il fondo del trigger sta entro ~80px dal fondo del viewport (scrollando `.so-body` o riducendo l'altezza del viewport); click raw sul DOM come oggi |
| | doc `:4-11`, `:75-84` | C | |
| `mobile-registries.spec.ts` | `:935-944` (`.info-row` di `/ppr` non raggiunta) | Cancella | dopo la story `.info-row` ha un solo consumer: non resta un'altra superficie da proteggere |
| `shell-misc.spec.ts` | `:62-75` (icona Flotta = icona Movimenti) | Cancella | il requisito 13.8 AC 2 accoppiava due voci, una non esiste più; `fleet → 'plane'` resta nel registry |
| `mobile-shell.spec.ts` | `:50-57`, `:71-75`, `:138` | Adatta | AC 7 |
| `home-dashboard.spec.ts` | `:131`, titolo `:136` («5 real KPIs») | Adatta | AC 6 |
| `mobile-overview.spec.ts` | `:47`, `:254` (`5` → `4`), `:398` C | Adatta | AC 6 |
| `reports.spec.ts` | `:152-187` helper, `:190-193` tipo, `:236-272`, `:348` titolo («the 5th KPI card» → 4th), `:362` | Adatta | AC 8 (project `reports` della catena: resta lì) |
| `mobile-reports.spec.ts` | `:343-368` (3 SVG → 2; desktop `[612.66, 287.34]`) | Adatta | AD-7 |
| `mobile-billing.spec.ts` | `:1132` (`splits` di reports → `[319, 319, 319]`), `:1134` (voce `/dashboard/movements` via) | Adatta | AD-7 |
| `settings.spec.ts` | `:100-131` (Club: 3 PUT, via tassa e istruzioni), `:206` C | Adatta | AC 5 (project `settings` della catena) |
| `mobile-settings.spec.ts` | `:335-347` (5 PUT → 3), `:683-684` (3 testid via), `:807` (`/dashboard/movements` → `/it/dashboard/bookings`, che ha `.date-input`: le tre pagine restano tre, come dice il commento `:799-806`) | Adatta | AC 5 |
| `pdf-exports.spec.ts` | `:141-171` helper, `:180` titolo («6 report PDFs» → 5), `:201`, `:226`, `:276` titolo, `:299-300`, `:318`, `:338-340`, `:173-176` C | Adatta | AC 9 |
| `billing-global.spec.ts` `:88`, `bookings.spec.ts` `:371` | C | |

### 3.5 — Contesto di dominio utile al dev

- **Una tabella, due viste**: `PprRequest` con stati `PENDING → APPROVED → COMPLETED|CANCELLED` (`REJECTED` dalla coda). La Panoramica derivava «al suolo» da `deriveApprovedPprMovementStatus` sulle APPROVED con `eta ≤ oggi`.
- **Revenue delle Statistiche**: viene da `getLedgerRevenueCents` (`transactions.service.ts`), cioè dal ledger. Le tasse PPR erano `CashMovement` positivi e contavano nei ricavi: dopo la migrazione i ricavi storici del DB di test **scendono**. È voluto (R-19-a) e non va «compensato».
- **Contabilità**: le righe `CASH` mostravano `pprNumber` come `reference` (sheet mobile, `billing-console.tsx:706`, campo «Riferimento»). Dopo la story le `CASH` hanno `reference: null` e lo sheet mostra il «nessun valore» che già usa (`labels.table.noValue`): nessuna modifica a `billing-console.tsx`.
- **Il seed demo** (`npm run seed:demo`, usato dal PO per guardare l'app) passa dai service veri: con il blocco PPR rimosso non crea più traffico in transito e non ha bisogno di sostituti.

### 3.6 — Intelligence dai cicli precedenti

- **12.13** (rimozione di pagine e API): il 404 di una pagina sotto `/dashboard` si vede **solo dopo il login** (il gate del proxy agisce prima del routing di Next). Gli spec sopravvissuti che chiamavano endpoint rimossi sono emersi solo alla suite completa: censimento esplicito (§3.4) **prima** di lanciarla. Se `chromium` fallisce, i project della catena saltano tutti a cascata.
- **14.9** (rimozione di un ruolo con migrazione): catena delle migrazioni rieseguita su DB gemello, `migrate diff` vuoto, `prisma generate`. Censimento iniziale corretto dal dev («~20 file di unit, non ~15»): **correggere questo file** se la ricognizione è sbagliata.
- **16.3** (chiusura): arbitro 542 + 1 flaky (`bookings.spec.ts:1128`, classe «pagina 1», TD 16.3-h). DB da resettare **prima** di ogni run che conta; flake da login ripetuti = lock anti-brute-force (TD-6), da verificare su `LoginAttempt` prima di chiamarla flake.
- **AOG-1b / 16.x**: il record riporta **numeri**, non aggettivi; le guardie ri-ospitate dichiarano la proprietà dell'ospite.

---

## §4 — Piano di test

1. **Prima di toccare il codice**: `npm run gates` sul HEAD (baseline verde, conteggio unit); `grep` A e B di AC 15 sul HEAD salvati nello scratchpad (120 file); campione `getComputedStyle` di AC 12 **prima** (serve la build di baseline: coordinarsi con la sessione principale per il server).
2. **Cancellazioni + server + schema** → `npx prisma generate` → rigenerazione dei tipi di route (§5) → `npm run typecheck`: gli errori che restano sono la mappa dei consumer da sistemare.
3. **Migrazione**: DB gemello di AC 3.
4. **UI, CSS, i18n, seed, docs**.
5. **Unit** (AC 16) in shell pulita, file per file.
6. **e2e** mirati sugli spec di §3.4 (su una build sola: `env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start <spec…>`). Attenzione al lock anti-brute-force sui run ripetuti.
7. **Grep di AC 15** → zero. **Sonda 404** di AC 1. **Campione CSS** di AC 12 dopo. **Screenshot** di AC 18.
8. `npm run gates` → suite completa su DB fresco, coordinata con la sessione principale (AC 19).

---

## §5 — Trappole note

- **Tipi di route generati vecchi**: `tsconfig.json` include `.next/types/**` e `.next/dev/types/**`, e `scripts/gates.sh` esegue il typecheck **prima** della build. Dopo aver cancellato le route, i `validator.ts` generati dall'ultima build puntano a `dashboard/ppr/page.js`, `ppr-requests/route.js`… e `tsc` fallisce con «Cannot find module» su file che non sono sorgente. Si rigenerano (`npx next typegen` se disponibile su Next 16.2, altrimenti una build), oppure si sposta nello scratchpad il file generato vecchio come ha fatto la 16.3, **mai** cancellandolo alla cieca. ⚠️ Una build mentre l'arbitro serve da `.next` lo corrompe («builds under a live arbiter»): **chiedere alla sessione principale** prima di qualunque build o typegen.
- **Il seed demo importa il service**: `prisma/seed-demo.ts:24` importa da `ppr.service`. Cancellato il service senza toccare il seed, il typecheck cade su un file che non sembra «della story».
- **Il parser della quota** (AD-2): cancellare in blocco le righe `:96-164` di `app-settings.service.ts` rompe `getMembershipFeeCents`; cancellare in blocco il describe `:139-221` del test fa perdere l'unica copertura dei valori corrotti.
- **Blocchi CSS misti** (AD-4): gli elenchi di selettori `.scadenze-mobile, .movements-mobile, .my-expiries-mobile{…}` e `.mobile-row-transit, .mobile-row-expiry{…}` si **accorciano**, non si cancellano. Cancellare la regola intera rompe Scadenze e «Le mie scadenze» solo a ≤640px: un e2e desktop non se ne accorgerebbe.
- **Il blocco 15.2 non è della coda PPR**: in `airops.css:1938-2100` le regole `.bottom-sheet-*` e `.slideover-panel` servono a tutta l'app. Escono **solo** `.ppr-queue-*` e `.ppr-card*`.
- **`.btn.accent`/`.btn.big` restano** (AD-3): sono documentati come vocabolario del design system. Il grep di AC 12 **non** li cerca.
- **Tab bar**: dopo la story `pilots` è un **tab**, non sta più nello sheet. Ogni test che apre «Altro» per andare su Piloti fallisce in modo deterministico (`mobile-shell.spec.ts:73`).
- **`registry.test.ts` usa `arrayContaining`**: togliere le voci dall'elenco atteso non prova che i path siano spariti. La prova è nel JSON generato (AC 10).
- **Statistiche, KPI condizionale**: `fleetUtilization` è omesso quando lo scheduling non è configurato. Il test `reports.spec.ts:350-363` configura lo scheduling e conta **4**; un conteggio senza quella precondizione darebbe 3.
- **Catena serializzata**: `settings.spec.ts`, `reports.spec.ts`, `billing-global.spec.ts`, `mobile-settings.spec.ts` sono nella catena di `playwright.config.ts`. Si modificano **dentro**, non si spostano. Run locale singolo con `--no-deps`.
- **`Escape` nei pannelli** (CLAUDE.md): negli spec ri-ospitati su uno `SlideOver`, mai `Escape` per chiudere un popover e poi asserire sul pannello.
- **Nessun residuo nei commenti nuovi**: riscrivendo un commento (AD-8) è facile scrivere «transito», «PPR» o «landing fee» come spiegazione storica. Il grep di AC 15 li vede. La storia sta nei story file, non nel codice.
- **Porta 3000 e DB**: la sessione principale può avere un arbitro in corso. Mai avviare server, build o reset del DB senza chiedere; il reset si fa solo con la ricetta di HANDOFF (`DROP DATABASE … WITH (FORCE)` + `createdb` + migrate + seed), **mai** `docker compose down -v` (distruggerebbe `airmanager_load`).

---

## §6 — Fuori scope DICHIARATO

- **`AERIAL_WORK`** nel tipo di volo, nelle statistiche e negli export: lo toglie la **19.5**.
- **Il campo «Email di contatto»** della card Club (`airfield.contactEmail`): codice morto preesistente (AD-3), TD 19.1-a verso la **19.8** (Impostazioni a Salva unico).
- **Il Salva unico** della card Club e delle Impostazioni (5 card, `Promise.all` non atomico): è la **19.8**. Qui la card perde due PUT e nient'altro.
- **Un `.kpi-row` a 4 colonne** per Panoramica e Statistiche: TD 19.1-d (stessa situazione di Istruttori e Registro voli).
- **La sincronizzazione del progetto Claude Design**: TD 19.1-c.
- **Rinominare `e2e/mobile-expiries-movements.spec.ts`**: il nome resta (due rimandi in `mobile-membership-fee.spec.ts:99,128`); rinominarlo non serve alla rimozione.
- **Rinumerare gli slot** di `NAV_ITEMS` o i ranghi di `overview-alerts.ts`: un buco è lecito per costruzione (AD-5, AD-6).
- **Le story file ready-for-dev che citano il dominio** (16.7 rate limit PPR, già tolto dalla CR; 17.4 transiti; 17.7 PDF PPR): le rilegge la sessione principale quando partono (TD 19.1-e).
- **Uno spec e2e che pinni il 404** delle rotte cancellate: la prova è la sonda del record (AD-10).

---

## §7 — Riferimenti

- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` — §4.0 (R-19-a, R-19-p), §4.2 (19.1), §4.10 (A1-A4, A14), §2.3 (impatto tecnico PPR).
- `_bmad-output/implementation-artifacts/12-13-rimozioni-cleanup-sweep.md` — AC1, AC7, AC8 e Change Log (404 dopo il login, spec residui).
- `_bmad-output/implementation-artifacts/14-9-rimozione-ruolo-staff.md` — migrazione su DB gemello, `migrate diff`, censimento corretto dal dev.
- `_bmad-output/implementation-artifacts/15-2-*.md`, `15-7-*.md`, `15-9-*.md`, `15-10-*.md` — origine dei blocchi CSS di AD-4 e delle guardie e2e di §3.4 (il dev legge solo le sezioni dei test che ri-ospita).
- `_bmad-output/implementation-artifacts/16-3-prenotazioni-persona-istruttore-approvazione.md` — formato del record, comando di parità i18n (AC 10), stato dell'arbitro alla chiusura.
- `CLAUDE.md` — testid `-mobile`/`mobile-` e regola `^=`, `scripts/e2e.sh`, catena serializzata, unit + env eager, gates, `Escape`/`SlideOver`, TD-6.
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, reset del DB, `JOBS_SECRET`, fallback `playwright-core`.
- `.design-sync/NOTES.md` — ricetta di re-sync (TD 19.1-c).
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (Q-19.1-a), semplicità (nessun CSS nuovo, nessuno slot nuovo), chirurgia (AD-4, AD-8), criteri verificabili (AC 15, AC 3).

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 19.1-a** | `airfield.contactEmail` («Email di contatto» nella card Club) non ha consumer: non lo leggeva neppure il modulo `/ppr`. Da decidere nella 19.8 (tenerlo e dargli un uso, o toglierlo). |
| **TD 19.1-b** | `.btn.accent` e `.btn.big` restano senza consumer nell'app: sono vocabolario del design system documentato in `.design-sync/conventions.md`. Da rivalutare al prossimo design-sync. |
| **TD 19.1-c** | Progetto Claude Design non risincronizzato dopo la 19.1 (`airops.css`, `conventions.md`, preview `KPI`): eseguire la ricetta di `.design-sync/NOTES.md`. |
| **TD 19.1-d** | Panoramica e Statistiche hanno 4 KPI nel `.kpi-row` base a 5 colonne (quinta colonna vuota a ≥1200px), come Istruttori e Registro voli; e fra **901 e 1200 px** la regola `repeat(3, 1fr)` (`airops.css` `@media (max-width: 1200px)`) dispone le 4 card **3+1**, con una card orfana su una seconda riga (misura della review, F2): candidata per una story desktop dell'epic 18. |
| **TD 19.1-e** | Story file ready-for-dev che citano il dominio rimosso (16.7, 17.4, 17.7): da rileggere quando partono. |
| **TD 19.1-f** | (dal dev) `mobile-a11y-sweep.spec.ts:111/:164` aprono «la prima `flight-row-mobile`» del Registro voli senza creare un volo: su un DB fresco, lanciati da soli, falliscono; nella suite completa passano perché altri spec registrano voli prima. Preesistente: dare ai due test una fixture propria. |
| **TD 19.1-h** | (dalla review, F4 — preesistente e trasversale) Un path sconosciuto risponde con la pagina 404 **di default di Next, in inglese** anche sotto `/it/…`, e le API rimosse/sconosciute rispondono in **HTML** invece che con l'envelope d'errore AD-8 `{error:{code,message}}`: `not-found` localizzato + catch-all API JSON. Nessuna azione nella 19.1. |
| **TD 19.1-g** | (dal dev) `mobile-billing.spec.ts` AC 12 viii/ix confronta `utilBarWidths` di Statistiche come Set ORDINATO (`[281, 0]`): su un DB post-suite il primo velivolo per marca non è fra i top-8 per minuti e l'ordine si inverte (`[0, 281]`). Verde su DB fresco; da confrontare come insieme. |

---

## Dev Agent Record

### Agent Model Used

Opus 5.5 (`claude-opus-5-5`) — un solo dev subagent (`dev-19-1`), 2026-11-01.

### §A — Verifica della ricognizione sul HEAD corrente

- HEAD di partenza `72e7e1b` (= `d9dbc8c` + i due story file 19.1/19.2, docs-only): nessuna riga di codice slittata rispetto a §3. Grep A ∪ B sul HEAD: **120 file**, esattamente come §3 (2.075 righe A, 529 righe B; salvati nello scratchpad).
- Correzioni alla ricognizione: (a) unit nei 4 file cancellati = **111**, non ~105 (77 `ppr.service` + 15 `schemas/ppr` + 11 `ppr-movement-status` + 8 `mobile-movements`); (b) i test cancellati DENTRO file misti sono 29 (v. §L); (c) `mobile-ink-targets.spec.ts` describe «/dashboard/ppr» = 4 test (3 viewport + «shared ManualPprForm»), `mobile-self-public` = 7 test (5 modulo pubblico + 2 deep link); (d) `cash.service.ts:52`, citato nel commento di `cash-categories-card.tsx`, era già sfasato (oggi la Set è a `:53`) — preesistente, non toccato.
- Lettura di AC 1 per l'anonimo: il testo di AC 1 descrive l'opzione A; si applica la **ratifica B** (sezione in testa): `/ppr` resta in `PUBLIC_WEB_PATHS` (riga byte-identica) con una riga di commento-lapide sopra la costante, `'/api/v1/ppr-requests'` esce da `PUBLIC_API_PATHS`.

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 | ✅ | 29 file cancellati (`git rm`); sonda §D: 13/13 → 404 con sessione admin; anonimo `/it/ppr` e `/en/ppr` → **404** (B), `POST /api/v1/ppr-requests` → **401** `UNAUTHENTICATED` |
| 2 | ✅ | service/schemi/lib cancellati; `templates.ts` −3 tipi −3 builder; `rbac.ts` senza `ppr.manage`; `proxy.ts` come §A; `RateLimitError` + mapping 429 + `ERROR_DESCRIPTIONS[429]` + `429` nell'union via; doc di `ConflictError` sui codici reali `PERSON_BUSY`/`INSTRUCTOR_BUSY` |
| 3 | ✅ | §C (gemello popolato, conteggi verbatim, `migrate diff` vuoto in due modi); `git diff --stat d9dbc8c -- prisma/migrations` → vuoto sulle storiche, unica aggiunta la cartella nuova `20261101193941_remove_ppr_domain`; `npx prisma generate` eseguito |
| 4 | ✅ | `SYSTEM_CASH_CATEGORY_NAMES = {Ricariche, Compensi istruttori}`; «PPR» via da `seed.ts`/`seed-demo.ts`; riga `CASH` con `reference: null` (DTO invariato); 3 commenti «tre categorie» → due; unit `cash.service.test.ts` 72/72 |
| 5 | ✅ | `club-card.tsx` −2 campi −2 PUT (3 PUT: club, metar-station, membership-fee); `settings/page.tsx` −2 letture; griglia 2×2 senza celle orfane (§K); copy `club.sub`/`smtp.sub` |
| 6 | ✅ | 4 KPI; sottotitolo `[ICAO, N AOG]` (Promise.all −2 query `listPprRequests`: da 19 a 17 elementi); avvisi a 2 fonti; unit `overview-alerts` 14/14 con ordine intero; e2e `mobile-overview` asserisce la lista ESATTA dei testid della `.kpi-row` + struttura del sottotitolo (v. §I-1) |
| 7 | ✅ | `route-registry.test.ts` `toEqual` esatti (ADMIN tabs `overview, schedule, fleet, pilots`; more 6 voci; riempimento ricostruito su ADMIN senza `fleet` → `overview, schedule, pilots, instructors`); e2e `mobile-shell` 4 tab, sheet 6, navigazione via `mobile-more-instructors`, negazione pilota su `mobile-tab-fleet` |
| 8 | ✅ | unit chiavi esatte + mock senza `pprRequest`; e2e `reports` delta ricavi = solo voli, movimenti +2, mix a 3 chiavi, KPI 4; JSON OpenAPI `Stats` §D; «Utilizzo flotta» figlia diretta di `.page` (larghezza 992 = contenuto della pagina, §K) |
| 9 | ✅ | `exportPprRequestsXlsx/Pdf` + `PPR_STATUS_KEYS` via; `git grep -n MovementsPage -- src` → 0; `exports.service.test.ts` 29/29 |
| 10 | ✅ | registry: −8 `register`, −`pprRequestIdParams`, −429, −9 path (tag `Ppr` sparito); path del JSON servito **84 → 75**, schemi **94 → 86**, grep A sul JSON **99 → 0**, grep B **55 → 0** |
| 11 | ✅ | §H: 1.989 → **1.760** chiavi per file, parità 0/0, 3 copy |
| 12 | ✅ | grep di AC 12 → **0**; §F: 0 differenze di computed style su 21 nodi campione × tutte le proprietà |
| 13 | ✅ | `npx prisma db seed` exit 0 e `npx tsx prisma/seed-demo.ts` exit 0 su gemello appena migrato (§C); `seed-load.ts` passa il typecheck (Phase 8 via, 9→8, 10→9); NON eseguito a `LOAD_SCALE` ridotto (facoltativo, dichiarato) |
| 14 | ✅ | `CLAUDE.md:3` e route map, `README.md:3`, `load-testing.md` (riga `pdf ppr`), `targets.json` (−6, JSON valido), `targets-hot.json` (−1), `e2e.sh:18` (`e2e/bookings.spec.ts`), `.design-sync` (descrizione + preview a 4 KPI); `node -e JSON.parse` OK su entrambi |
| 15 | ✅ | §E: A → 1 riga (l'eccezione ammessa di `src/proxy.ts`), B → 0 righe |
| 16 | ✅ | §L: 1.923 → **1.783**; `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` verde su tutti i 71 file (run completo in shell senza env) |
| 17 | ✅ | §G; `git diff -- playwright.config.ts` vuoto; nessun testid nuovo |
| 18 | ✅ | §K (screenshot, overflow 0 a 320/375/390, console senza errori) |
| 19 | ✅ dev / ⏳ arbitro | `npm run gates` verde (§L); suite completa = arbitro della sessione principale |

### §C — Migrazione: fixture, conteggi prima/dopo, `migrate diff` (AC 3)

Gemello `am_19_1` nel container: migrato fino a `20260807074113` (cartella nuova spostata temporaneamente nello scratchpad), `db seed` della baseline, poi fixture SQL: richiesta COMPLETED con tassa 2500 + `CashMovement` collegato (`pprRequestId`), **storno** di quel movimento (stessa categoria, `reversalOfId`), una APPROVED e una PENDING, `PprCounter`, un movimento manuale nella categoria «PPR» senza collegamento, 3 chiavi `ppr.*`, `IdempotencyRecord` `ppr-approve` + uno `booking-create`, una categoria non PPR con movimento + storno. Poi `npx prisma migrate deploy` → «All migrations have been successfully applied».

```
                                           PRIMA                              DOPO
CashMovement categoria PPR                 3                                  0   (per id: twin_cm_fee/_storno/_manual_ppr → 0)
CashMovement non PPR                       4                                  4
checksum non PPR (id:importo:reversalOf)   b070c1655b4ce4e7fb1bf8681d36e513   b070c1655b4ce4e7fb1bf8681d36e513
CashCategory PPR / totale                  1 / 9                              0 / 8
to_regclass PprRequest / PprCounter        "PprRequest" / "PprCounter"        NULL / NULL
pg_type PprStatus                          1                                  0
AppSetting ppr.*                           3                                  0
IdempotencyRecord ppr-* / altri            1 / 1                              0 / 1
colonna CashMovement.pprRequestId          1                                  0
```

`migrate diff` (Prisma 7.8): `--from-config-datasource --to-schema prisma/schema.prisma --script` sul gemello migrato → `-- This is an empty migration.`; `--from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` (config temporanea con `shadowDatabaseUrl` su `am_19_1_shadow`, cancellata subito) → `-- This is an empty migration.`.

AC 13 sul gemello ricreato da zero (`DROP` + `createdb` + `migrate deploy` con tutte le migrazioni): `npx prisma db seed` exit 0 («7 cash categories ready»), `npx tsx prisma/seed-demo.ts` exit 0 («24 flights registered», «6 bookings ready», nessuna riga PPR); categorie = `Altro, Assicurazione, Carburante, Compensi istruttori, Manutenzione, Ricariche, Utenze`, `to_regclass('"PprRequest"')` = NULL. Gemelli `am_19_1`/`am_19_1_shadow` eliminati; `airmanager_load` mai toccato.

DB `airmanager`: migrazione applicata con `migrate deploy` (prima: 72 `PprRequest`, 190 `CashMovement` di cui 6 PPR; dopo: 184, tutto a zero), poi **resettato** con la ricetta di HANDOFF (mandato PO) prima del secondo run mirato.

### §D — Sonda 404 verbatim (AC 1) e JSON OpenAPI (AC 10)

Build di produzione (`npm run gates` → `next start`), script `playwright-core` throwaway:

```
--- admin session
GET /it/dashboard/ppr -> 404
GET /en/dashboard/ppr -> 404
GET /it/dashboard/movements -> 404
GET /en/dashboard/movements -> 404
GET /it/ppr -> 404
GET /en/ppr -> 404
GET /api/v1/ppr-requests -> 404
POST /api/v1/ppr-requests -> 404
POST /api/v1/ppr-requests/manual -> 404
GET /api/v1/ppr-requests/pdf -> 404
POST /api/v1/ppr-requests/x/approve -> 404
GET /api/v1/settings/ppr-landing-fee -> 404
GET /api/v1/settings/ppr-operating-instructions -> 404
--- anonymous (no cookies)
GET /it/ppr -> 404
GET /en/ppr -> 404
POST /api/v1/ppr-requests -> 401 {"error":{"code":"UNAUTHENTICATED","message":"Authentication required."}}
GET /it/dashboard/ppr -> 307 location=/it/login?callbackUrl=%2Fit%2Fdashboard%2Fppr
GET /it/dashboard/movements -> 307 location=/it/login?callbackUrl=%2Fit%2Fdashboard%2Fmovements
```

OpenAPI servito (`GET /api/v1/openapi.json`, 200): path **84 → 75** (−9: i 7 PPR + i 2 di impostazioni), schemi **94 → 86** (−8 `Ppr*`/`*PprRequest*`), tag senza `Ppr`, stati di risposta documentati `200,201,204,401,403,404,409,422,500` (niente 429). Grep A (pattern di AC 15) sul JSON 99 → **0**, grep B 55 → **0** (`grep -ci ppr` darebbe 1 riga/35 occorrenze: sono tutte dentro `APPROVED`/`approved`, falsi positivi del case-insensitive). Schema `Stats`: `kpis` = `["revenueCents","flightMinutes","movements","fleetUtilization"]`, `series` = `["months","revenueCents","flightMinutes"]`, `movementMix.key` = `{"type":"string","enum":["SCHOOL","TOURISM","AERIAL_WORK"]}`; descrizione «Read-only aggregation over flights/ledger/compensation…».

### §E — Grep di AC 15 verbatim (baseline e finale)

Baseline (`72e7e1b`): A 2.075 righe + B 529 righe, **120 file** (= 91 + 29 di §3). Finale (working tree, comandi di AC 15 identici):

```
$ git grep -nIP '(?<![A-Za-z])[Pp][Pp][Rr]|[a-z]Ppr|[a-z]PPR' -- . "${EX[@]}"
src/proxy.ts:13:const PUBLIC_WEB_PATHS = new Set(['', '/login', '/set-password', '/forgot-password', '/ppr']);
$ git grep -nIiP "transit(?!ion|iv)|landing.?fee|operating.?instructions|/dashboard/movements|MovementsPage|['\"]visiting['\"]|onGround|in transito" -- . "${EX[@]}"
$
```

L'unica riga è l'eccezione ratificata (Q-19.1-a = B), byte-identica al HEAD; la lapide è la riga di commento sopra (`// Last entry: route removed in story 19.1, kept public so anonymous visitors get a 404, not the login page.`), che il grep non vede. La migrazione nuova nomina gli oggetti che droppa (eccezione `prisma/migrations/`).

### §F — CSS: diff e campione `getComputedStyle` prima/dopo (AC 12)

- `grep -cE "\.ppr-|\.movements-|manual-ppr|mobile-row-transit|mobile-complete-step|mobile-row-model|\.info-card|\.flow-bar-info|^\.req\b" src/styles/airops.css` → **0**.
- `git diff -U0 src/styles/airops.css`: 65 righe `+` / 328 righe `-`. Audit: ogni riga `-` che non è commento appartiene a un selettore della colonna «Esce» di AD-4 (`.ppr-*`, `.movements-*`, `.info-card*`, `.req`, `.mobile-row-transit`, `.mobile-row-model`, `.mobile-complete-step*`, `.flow-bar-info`) o è un elenco di selettori ACCORCIATO (`.scadenze-mobile, .my-expiries-mobile{…}`, `.mobile-row-expiry{…}`, `.scadenze-filter-panel{…}`, `.scadenze-head > .scadenze-filters-trigger{display:none}`) o è la chiusura del blocco `@media` della sola `.ppr-form-grid`. Restano identiche: `.btn.big`, `.btn.accent*` (commento 13.9 riscritto senza l'esempio), `.info-row*`, tutto `.bottom-sheet-*`/`.mobile-sheet-list*`/`.slideover-panel`, `.scadenze-*`, `.my-expiries-*`, `.mobile-row-expiry*`, `.membership-fee-*`, `.account-*`. Commenti riscritti per AD-8 (lezione conservata): `:71`, `:1118`, il commento `.flow-bar-*` («All five tones» → «Every tone», `--info` non c'è più), `:1710`, `:1951`, `:2148-2152`, `:2220`, `:2348`, `:2459`, `:2487`, `:2751`, apertura del blocco 15.7 (sole Scadenze), `:3168` (**3** `.split`), `:3344`, `:3489`, apertura 15.9, `:3702`, `:3738-3739`, `:3820`; il punto (8) di 15.10 esce intero.
- **Campione** (`css-sample.mjs`, ogni proprietà di `getComputedStyle` del nodo e dei primi 60 discendenti, stesso DB con la sola differenza delle righe PPR), 21 chiavi: a 1280 e 375 `.scadenze-head`, `.scadenze-kpi-row`, `.scadenze-mobile`, `.scadenze-desktop-body`, `membership-fee-panel` aperto, `.info-row` e `.info-row .v` della scheda persona; a 375 `BottomSheet` aperto (`:has(> .bottom-sheet-head)` della card scadenza), `mobile-scadenze-filter-panel` aperto, `.slideover-panel:not([inert])` aperto; pilota a 1280 e 375 `my-expiries`, `my-expiry-row-mobile`. Prima = build di baseline (`72e7e1b`, server fermato dopo la presa), dopo = build della story. Ripetibilità provata due volte sulla baseline (0 differenze), poi baseline vs story: **`TOTAL DIFFS: 0`**.

### §G — e2e: cancellati / ri-ospitati / adattati

`npx playwright test --list` (CI=1): baseline **543 test in 64 file** → dopo **492 test in 61 file** = **−51**.

| Spec | Prima → dopo | Classe | Dettaglio |
|---|---|---|---|
| `ppr-public` / `ppr-queue` / `movements` | 6 / 9 / 12 → file cancellati | Cancella | −27 |
| `mobile-expiries-movements` | 23 → 13 | Cancella 10, Adatta 8, invariati 5 | via `:388 :411 :530 :574 :630 :661 :684 :788 :824 :1324`; adattati `:451` (metà card transito), `:470` (empty state movimenti), `:888` (i due redirect `/movements`), `:960` (paginazione movimenti), `:1034` (testid del registro/overlay/marche), `:1166` (URL movimenti), `:1215` **ri-ospitato su Scadenze** (v. §I-3), `:1258` (titolo e commento: il pavimento 44 è ora solo in `.scadenze-filter-panel`); helper orfani via (`createPendingRequest`, `createApprovedRequest`, `gotoMovementsFor`, `createManualApproved`, `movementCards`, `pprCategoryId`, `pprMovementsWithDescription`, `UI_MOVEMENTS_PAGE_SIZE`, `romeDateOnly`, `uniqueRegistration`, `futureIso`, import `Locator`) |
| `mobile-self-public` | 21 → 14 | Cancella 7 | describe modulo pubblico (5) e deep link (2), helper `createApprovedPpr`, import `Browser`; l'esclusione «honeypot» di `hiddenScrollers` (codice morto) tolta: lo sweep resta quello canonico |
| `mobile-primitives` | 3 → 2 | Cancella 1, **Ri-ospita** 1, Adatta 1 | via gli alberi della coda; SlideOver a tutto schermo **ri-ospitato** sull'editor volo da `/it/dashboard` (`dispatch-flight-button`): stesse asserzioni, probe scoped a `.slideover.open` (la Panoramica monta più SlideOver), submit preso per struttura `.slideover.open .so-foot button[type="submit"]` (nessun testid nuovo). Proprietà dell'ospite **asserite nel test stesso**: `anchored.scrollable === true` (corpo che scorre a 375×812), submit dentro `.so-foot`, `.date-input-btn` nel pannello (il popover si apre dentro il viewport). Striscia KPI: `cardCount >= 4`; «ultima card non raggiungibile a `scrollLeft 0`» resta asserita e passa (4×146 + 3×10 = 614 > 375) |
| `mobile-a11y-sweep` | 9 → 9 | **Ri-ospita** 2 | «shared form panel» → editor volo (`dispatch-flight-button`, condiviso col Registro voli): grammatica distinta dalle altre due; pannello chiuso `inert`: `/it/dashboard/ppr` → `/it/dashboard/logbook`. **Discriminanza rimisurata** togliendo `inert` in pagina: bookings 11/11 candidati prendono il focus, pilots 1/1, logbook **18/18** a 375 e a 1280 → commento «11 / 18» |
| `mobile-ink-targets` | 23 → 19 | Cancella 4, Adatta 1 | describe «/dashboard/ppr» (3 viewport + ManualPprForm); calendar trigger: URL `/movements` e `/dashboard/ppr` via, misura di controllo su `/it/ppr` via |
| `datetime-picker` | 6 → 5 | Cancella 1, **Ri-ospita** 2 | invio reale da `/ppr` via (coperto da `:126`); 375 → campo «Fine» della nuova prenotazione, stesse asserzioni; TD7-F1 → «Fine» nel pannello nuova prenotazione a 1440: precondizione **asserita** prima del click raw (`innerHeight − bottom` ∈ [60, 100], ottenuta tagliando il viewport a `bottom + 80`), poi due rAF perché il `resize` arrivi PRIMA del click (`useFixedPopover` chiude il popover su resize — misurato: senza, 1 flaky al primo run) |
| `mobile-registries` | invariato (1 test, −1 blocco) | Cancella (blocco) | il controllo `.info-row` su `/it/ppr` dentro il test della scheda persona |
| `shell-misc` | 3 → 2 | Cancella 1 | icona Flotta = icona Movimenti |
| `mobile-shell` | invariato | Adatta | 4 tab `overview, schedule, fleet, pilots`; sheet **6**; `mobile-more-instructors`; negazione pilota `mobile-tab-fleet` |
| `home-dashboard` | invariato | Adatta | lista KPI a 4, titolo «4 real KPIs» |
| `mobile-overview` | invariato | Adatta | `kpi-value` 5 → **4**; lista esatta dei testid della `.kpi-row`; sottotitolo ≤ 2 parti con `N AOG` in coda |
| `reports` (catena) | invariato | Adatta | helper transito e tipo `StatsDto` allineati; delta ricavi = solo voli, movimenti **+2**, mix a 3 chiavi esatte, KPI **4** |
| `mobile-reports` | invariato | Adatta | SVG 3 → **2** (desktop `[612.66, 287.34]`); AC 7: `.chart-label` 36 → **24** (12 etichette × 2 grafici), bande del mix ≥ 8 → **≥ 6** (3 bande + 3 pallini), selettore senza `.flow-bar-info` |
| `mobile-billing` | invariato | Adatta | `.split` di reports `[319, 319, 319]`, voce `/movements` via |
| `settings` (catena) | invariato | Adatta | Club: via tassa/istruzioni, attese le risposte di `club` e `membership-fee` |
| `mobile-settings` (catena) | invariato | Adatta | 5 PUT → **3**; 3 testid via dalla matrice; `/movements` → `/it/dashboard/bookings` (2 `.date-input` resi a 375) |
| `pdf-exports` | invariato | Adatta | 6 → **5** PDF; righe/asserzioni `ppr-requests/pdf` via in 4 test |
| `billing-global`, `bookings` | invariato | C | solo commenti |

**Run mirati** (build di produzione unica, `E2E_REUSE_SERVER=1 scripts/e2e.sh start`, log copiati nello scratchpad):
1. 15 spec del project `chromium` sul DB **sporco** dell'arbitro 16.3 (216 velivoli attivi): 180 passed, 11 failed, 1 flaky. I fallimenti sono la classe «DB post-suite» (prenotazioni 422 e picker `Pilota o allievo` oltre `OPTIONS_PAGE_SIZE`, card prenotazione assente, ordine del Set `utilBarWidths`) + **2 miei**, corretti: `mobile-reports` AC 7 (conteggi per costruzione) e il flaky del TD7-F1 ri-ospitato (resize).
2. Stessi 15 spec dopo il **reset del DB**: **189 passed, 1 flaky** (`mobile-billing:969`, «guardie DISCRIMINANTI», verde al retry, non toccato), **2 failed** = `mobile-a11y-sweep:111/:164`, che aprono «la prima `flight-row-mobile`» del Registro voli e su un DB fresco senza voli non la trovano (dipendenza da dati creati da altri spec nella suite completa — preesistente, TD 19.1-f). Rilanciati dopo che il DB aveva voli: **3/3 passed** (insieme a `mobile-billing:969`).
3. Catena con `--project=settings --project=reports --project=billing-global --project=mobile-settings --no-deps --workers=1`: **26 passed**, exit 0.
4. Guardie ri-ospitate `--repeat-each=5 --retries=0` (datetime `:214` e `:255`, primitives `:66`, a11y `:235` ×3 consumer e `:436` ×2 viewport, scadenze AC 11 `:615`): **45/45 passed**.

**Delta atteso per l'arbitro**: 543 − 51 = **492 test** (−27 coi 3 spec cancellati, −24 dentro gli spec misti: 10 + 7 + 4 + 1 + 1 + 1; ri-ospitati e adattati a numero invariato).

### §H — i18n: conteggio chiavi prima/dopo, parità verbatim

Chiavi via, identiche nei due file: `PprPage` 45, `PprQueuePage` 66, `MovementsPage` 95, `shell.nav.ppr|visiting` + `shell.pageTitle.ppr|visiting` 4, `DashboardPage.overview.pprPendingCount|onGroundCount|kpis.pprPending|mobile.alerts.pprSub` 4, `SettingsPage.club.landingFee|landingFeeHint|operatingInstructionsIt|En` 4, `Emails.pprReceipt|pprApproval|pprRejection` 7, `ReportsPage.kpi.transitShare|charts.transits.*|movementMix.keys.TRANSIT` 4 = **229** per file. Rimozione via parse+dump JSON (roundtrip byte-identico verificato prima sui due file), copy con sostituzione puntuale.

```
python3 -c "…k(…)…"   →   it-only: 0 en-only: 0 it: 1760 en: 1760
```

Copy: `overview.mobile.alerts.empty` «Nessun avviso: scadenze e saldi sono in regola.» / «No alerts: expiries and balances are all in order.»; `smtp.sub` «Posta in uscita per inviti, promemoria e avvisi» / «Outgoing mail for invitations, reminders and alerts»; `club.sub` «Identità usata nella console e nei PDF esportati» / «Identity used across the console and exported PDFs» (testi indicativi della story, adottati tali e quali).

### §I — Deviazioni motivate e decisioni non ovvie

1. **AC 6 «`kpi-ppr-pending` count 0» non è scritto in uno spec**: lo spec conterrebbe `ppr`, cioè il residuo che AC 15 vieta (stessa logica di AD-10). L'assenza è asserita per **struttura** (lista esatta dei testid figli della `.kpi-row` a 375 e 1280 in `mobile-overview`) e il count 0 è misurato nella verifica UI (§K: 0 a 1280, 0 a 375).
2. `settings.spec.ts` aspetta le risposte di `club` e `membership-fee` (come prima aspettava 4 dei 5 PUT, senza `metar-station`); il conteggio dei 3 PUT è asserito in `mobile-settings.spec.ts`.
3. `mobile-expiries-movements :1215` («lo sheet copre la tab bar…») era interamente sul registro transiti: togliere la metà transiti l'avrebbe svuotato. È **ri-ospitato su Scadenze** (sheet `mobile-scadenze-sheet` e pannello `mobile-scadenze-filter-panel`, stesse asserzioni `elementFromPoint` sulla tab bar) invece che adattato.
4. `seed-load.ts`: la stima del commento d'apertura passa da «~28000-32000 cash movements» a **«~29500-30500»**: top-up 25.000 (uno a uno col gemello di cassa) + operativi 2.500 + payout 2.000-3.000; le tasse PPR erano ≈ 5.000 × 0,55 × 0,7 × 5/6 ≈ 1.600 righe.
5. Commenti fuori dall'elenco di §3.2 corretti perché sarebbero diventati falsi: `stats.ts` («5th KPI» → 4th, «three data arrays» → two), il commento `.flow-bar-*` di `airops.css`, `client-ip.ts` ridotto al vero (non c'è più un estrattore gemello), `errors.ts` (primo chiamante con codice proprio = `PERSON_BUSY`/`INSTRUCTOR_BUSY`).
6. `cash.service.test.ts`: dove «PPR» era categoria di SISTEMA → «Ricariche» (come prescritto; l'`it.each` duplica così il test singolo «Ricariche» già presente — scelta della story, conteggio invariato); dove era una categoria qualunque → «Carburante»; nel report a due categorie la prima diventa «Hangar»/`cat_hangar` (la seconda era già «Carburante»).
7. Panoramica: le 2 query in meno del `Promise.all` sono misurate a lettura (19 → 17 elementi destrutturati); `PPR_GROUND_SCAN_LIMIT` e i due import via.

### §J — TD e note per la review

- TD 19.1-a..e di §7 **confermati** così come sono scritti (aggiunti f e g in §7).
- Nota per la review: «Utilizzo flotta» a tutta riga mostra a 1280 la colonna `90px` delle marche troncata sulle marche lunghe delle fixture e2e (`I-BK1793560912523-8Z`): è la griglia inline `90px 1fr 80px` preesistente (stessa resa di prima dentro la `.split`, AD-7 non la tocca), invisibile con marche reali (`I-ABCD`).
- Nota: a 1280 la quinta colonna del `.kpi-row` resta vuota su Panoramica e Statistiche (TD 19.1-d, voluto).
- Nota: l'ordine del Set `utilBarWidths` in `mobile-billing` AC 12 viii/ix dipende da quale velivolo è primo per marca e se è fra i top-8 per minuti — su DB sporco si inverte (TD 19.1-g); verde su DB fresco.

### §K — Verifica UI (screenshot)

Script `ui-verify.mjs` + `shot-top.mjs` (playwright-core, Chromium in cache), build di produzione, DB post-run. Screenshot in `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/shots/`: `overview-it-1280-light`, `overview-en-1280-light`, `overview-it-375-light`, `overview-en-375-light`, `overview-it-1280-dark`, `overview-it-375-dark`, `overview-it-375-more-sheet`, `sidebar-1280`, `reports-it-1280-top`, `reports-it-1280-mix`, `reports-it-1280` (pagina intera), `reports-it-375(-top)`, `settings-club-{it,en}-{1280,375}`.

Misure: KPI Panoramica = `kpi-flights-today, kpi-fleet-available, kpi-bookings-pending, kpi-revenue` (EN «Flights today, Fleet available, Bookings pending, Revenue this month»), `kpi-ppr-pending` **0** nodi a 1280 e a 375, `.kpi-value` = 4 a 375; sottotitolo «LIM1 · 2 AOG»; sidebar: gruppo Operazioni = Panoramica, Pianificazione; tab bar `overview, schedule, fleet, pilots, more`; sheet «Altro» = `instructors, scadenze, logbook, billing, reports, settings` (griglia 3×2 senza celle vuote); feed Avvisi presente (scadenze, «+26 altri · Vedi tutte»). Statistiche: KPI 4, `.split` 3, SVG `[612.66, 287.34]`, card «Utilizzo flotta» figlia diretta di `.page`, larghezza 992 = larghezza utile della pagina; mix 6 nodi (3 bande + 3 pallini). Impostazioni: griglia Club `468px 468px` con 4 celle a 2×2 (ICAO | email, METAR | quota), nessuna cella orfana; `club.sub` nuovo. Overflow orizzontale **0** su Panoramica, Statistiche, Impostazioni a 320, 375 e 390. Console: **nessun errore** (`console.error` + `pageerror`) su tutte le pagine visitate.

### §L — Gate ed esiti verbatim (unit prima/dopo, e2e prima/dopo)

```
Baseline (72e7e1b):            PASS lint (21s) · PASS typecheck (5s) · PASS test (8s) — Tests 1923 passed (1923) · PASS build (32s)
Story (prima del commit):      PASS lint (20s) · PASS typecheck (4s) · PASS test (7s) — Tests 1783 passed (1783) · PASS build (29s)
```

Lint: 0 errori, 302 warning identici alla baseline (stessi file). Tipi di route generati: rigenerati con `npx next typegen` (nessun file spostato). Unit **1.923 → 1.783 (−140)**: −111 coi 4 file cancellati; −29 dentro file modificati (`app-settings` 67 → 54: −19 dei due describe PPR, +6 dell'`it.each` spostato sulla quota; `registry` 38 → 30; `overview-alerts` 17 → 14; `exports` 31 → 29; `stats` 17 → 15; `cash` 73 → 72). Shell pulita: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` → 71 file, 1.783 test, verdi. e2e: §G (delta −51 → 492).

### Completion Notes List

- Dominio PPR/transiti rimosso per intero (29 file, 7.215 righe) con migrazione forward unica provata su gemello popolato; nessun residuo salvo l'eccezione ratificata di `src/proxy.ts`.
- Contratto `/api/v1/stats` ridotto ai soli campi di A3; parser dei cents rinominato (`parseStoredCents`/`MAX_STORED_CENTS`) con la copertura dei 6 valori corrotti spostata sulla quota.
- UI: Panoramica a 4 KPI e sottotitolo a 2 parti, avvisi a 2 fonti, tab bar `overview, schedule, fleet, pilots` col riempimento predefinito, Statistiche con «Utilizzo flotta» a tutta riga, card Club a 4 campi; CSS rimosso chirurgicamente con 0 differenze di computed style sulle superfici condivise.
- e2e: −51 test (27 con gli spec cancellati, 24 dentro gli spec misti), 6 guardie ri-ospitate con proprietà dell'ospite asserite/misurate, catena serializzata invariata.

### File List

Cancellati (29): `src/app/[locale]/dashboard/ppr/{page.tsx,ppr-console.tsx,manual-ppr-launch-button.tsx}`, `src/app/[locale]/dashboard/movements/{page.tsx,movements-table.tsx,log-arrival-launch-button.tsx}`, `src/app/[locale]/ppr/{page.tsx,ppr-form.tsx}`, `src/components/ppr/manual-ppr-form.tsx`, `src/app/api/v1/ppr-requests/{route.ts,manual/route.ts,pdf/route.ts,[id]/approve/route.ts,[id]/reject/route.ts,[id]/complete/route.ts,[id]/cancel/route.ts}`, `src/app/api/v1/settings/{ppr-landing-fee,ppr-operating-instructions}/route.ts`, `src/server/services/ppr.service{,.test}.ts`, `src/lib/schemas/ppr{,.test}.ts`, `src/lib/ppr-movement-status{,.test}.ts`, `src/lib/mobile-movements{,.test}.ts`, `e2e/{ppr-public,ppr-queue,movements}.spec.ts`.

Nuovo: `prisma/migrations/20261101193941_remove_ppr_domain/migration.sql`.

Modificati — dominio/server: `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/seed-demo.ts`, `prisma/seed-load.ts`, `src/proxy.ts`, `src/server/auth/{rbac.ts,rbac.test.ts,auth.ts,login-throttle.ts}`, `src/server/adapters/mail/templates.ts`, `src/server/adapters/excel/workbook.ts`, `src/server/services/{app-settings.service.ts,app-settings.service.test.ts,stats.service.ts,stats.service.test.ts,exports.service.ts,exports.service.test.ts,cash.service.ts,cash.service.test.ts,transactions.service.ts,transactions.service.test.ts,errors.ts,errors.test.ts,auth-tokens.service.ts,bookings.service.ts,bookings.service.test.ts}`, `src/lib/api/{handler.ts,client-ip.ts}`, `src/lib/schemas/{registry.ts,registry.test.ts,stats.ts,transactions.ts,cash.ts,settings.ts}`, `src/lib/{overview-alerts.ts,overview-alerts.test.ts,mobile-settings.ts,use-idempotency-key.ts,zoned-time.ts}`, `src/app/api/v1/auth/forgot-password/route.ts`, `src/app/api/v1/bookings/pdf/route.ts`.

Modificati — UI: `src/components/shell/{route-registry.ts,route-registry.test.ts}`, `src/components/dashboard/mobile-alerts-card.tsx`, `src/components/ui/{bottom-sheet.tsx,calendar-popover.tsx,date-input.tsx,field.tsx,fixed-popover.ts,mobile-sheet.tsx}`, `src/app/[locale]/dashboard/{page.tsx,mobile-booking-list.tsx,mobile-pending-bookings.tsx}`, `src/app/[locale]/dashboard/reports/{page.tsx,reports-console.tsx}`, `src/app/[locale]/dashboard/settings/{club-card.tsx,page.tsx,cash-categories-card.tsx}`, `src/app/[locale]/dashboard/fleet/{fleet-console.tsx,aircraft-editor.tsx}`, `src/app/[locale]/dashboard/people/[id]/page.tsx`, `src/app/[locale]/layout.tsx`, `src/app/globals.css`, `src/styles/airops.css`, `messages/it.json`, `messages/en.json`.

Modificati — e2e: `e2e/{billing-global,bookings,datetime-picker,home-dashboard,mobile-a11y-sweep,mobile-billing,mobile-expiries-movements,mobile-ink-targets,mobile-overview,mobile-primitives,mobile-registries,mobile-reports,mobile-self-public,mobile-settings,mobile-shell,pdf-exports,reports,settings,shell-misc}.spec.ts`.

Modificati — docs/harness: `CLAUDE.md`, `README.md`, `docs/operations/load-testing.md`, `scripts/e2e.sh`, `scripts/perf/targets.json`, `scripts/perf/targets-hot.json`, `.design-sync/conventions.md`, `.design-sync/previews/KPI.tsx`; BMAD: questo file, `_bmad-output/implementation-artifacts/sprint-status.yaml`.

### Change Log

- 2026-11-01 — Implementazione completa (dev Opus 5.5): rimozione del dominio PPR/transiti (codice, API, email, permesso, DB con migrazione forward, seed, i18n, CSS, OpenAPI, docs, e2e). Gates verdi (unit 1.923 → 1.783), e2e mirati verdi su DB fresco (salvo 2 test dipendenti da dati di altri spec, verdi quando i dati ci sono), delta atteso dell'arbitro 543 → 492. Status → review. Commit implementazione `08eb558` (`feat(19.1)`), gates rieseguiti verdi subito prima del commit (1.783 unit, build OK).

## Review Record — 19.1

- **Review adversarial** (Opus, 2026-11-01): **SHIPPABLE-WITH-FIXES** — 0 major, 1 minor, 3 low. Report: `19-1-review-report.md`.
- **Arbitro del reviewer** (DB fresco, `CI=1` build di produzione): **492 passed, 0 flaky, 0 skipped, E2E_EXIT=0** — delta 543 → 492 confermato. Gates rieseguiti in shell senza env: verdi, 1783 unit.
- **F1 (minor) — corretto** dalla sessione principale: in `e2e/mobile-primitives.spec.ts` la guardia «SlideOver a tutto schermo» ri-ospitata sull'editor volo ora scorre SEMPRE `.so-body` fino a poco sopra il trigger della data (`scrollTop = max(1, offset − 8)`) e asserisce `scrollTop > 0` prima di aprire il popover; commento riscritto con le misure del nuovo ospite (via «scrollTop 0 -> 314»). Verifica: `mobile-primitives.spec.ts --repeat-each=5 --retries=0` → **10/10** su build di produzione e DB fresco; `npm run gates` verde (1783 unit).
- **F2 (low)** → testo del **TD 19.1-d** esteso alla fascia 901-1200 px (riga KPI 3+1). Nessun CSS nella 19.1 (AD della story).
- **F3 (low) — corretto**: riga «DECISIONE PO: da registrare» e clausola dell'anonimo in AC 1 allineate alla ratifica B.
- **F4 (low, preesistente)** → **TD 19.1-h** (404 di default inglese di Next e API sconosciute in HTML invece dell'envelope AD-8).
- Nessuna decisione PO aperta.

