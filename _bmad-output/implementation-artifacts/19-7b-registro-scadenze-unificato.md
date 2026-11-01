---
baseline_commit: 869c9cf
---

# Story 19.7b: Registro Scadenze unificato — currency, quote e visite «Mancante» in ogni vista

Status: **ready-for-dev** — 2026-11-01. Seconda metà della 19.7, **divisa dalla sessione principale**: la **19.7a** (`19-7a-scadenze-modello-regole-quota-currency.md`) consegna modello, regole e funzioni di valutazione; questa costruisce il **registro unificato** (documenti ∪ righe derivate) con filtro Categoria, contatori, ricadute su Panoramica/Avvisi/export/API e la guardia di prestazioni. **Nessuna domanda PO aperta.** **Modello dev: Opus 5 xhigh (UI)**: registro Scadenze desktop + faccia mobile con il pannello Filtri, widget Scadenze della Panoramica e feed Avvisi mobile, oltre a SQL grezzo, DTO, OpenAPI, export ed e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-7b-registro-scadenze-unificato`. Taglia: L.

> ⚠️ **Dipendenza dura**: il dev parte **DOPO il commit della 19.7a** (e quindi di 19.1…19.6). Consuma da lei, **senza rinominarli** (19.7a §5.12): `computeCurrency` e `CURRENCY_DEFAULTS` (`src/lib/currency.ts`), `getCurrencySettings`, `loadOnBoardFlightDates`/`listCurrencyByPerson` (`currency.service.ts`), `evaluateMedicalRequirement`/`getMedicalRequirementFailure`, `ExpiryTypeKind.MEMBERSHIP`, il campo `category` degli item di `GET /api/v1/expiries`, le chiavi `ExpiriesPage.registry.category.{MEDICAL,RATING,MEMBERSHIP}`, gli helper e2e `ensureValidSeedExpiries` (una visita sola) e `registerFlightOn`. Al T0: leggere il **codice committato** della 19.7a (non questo file) e correggere qui ogni nome o riga che non torna.
>
> Ogni `file:riga` è misurato su **`869c9cf`** con `git show HEAD:<file>`; la 19.7a e le story precedenti li spostano: rieseguire i censimenti di §3.
>
> **Da leggere PRIMA**: `CLAUDE.md` (substring di `getByLabel`/`hasText`, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, env eager negli unit, **aggregati globali sotto `fullyParallel`**, catena serializzata); `sprint-change-proposal-2026-11-01.md` §4.5, §4.6, §4.10 A8/A16; `19-7a-*.md` (D-4, D-6, D-8, AD-3, AD-5); `15-7-*.md` (faccia mobile Scadenze, pannello Filtri a navigazione unica, AD-4 del debounce, R-15.7-k), `15-3-*.md` (feed Avvisi, R-15.3-e, review F7), `12-11-*.md` (registro e contatori). Skill: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max`.

### Decisioni PO (2026-11-01) — tutte chiuse

- **Q-19.7-a = B** (contro la raccomandazione A): le righe **currency** compaiono **mescolate ai documenti in ogni vista del registro, contatori inclusi**; il filtro Categoria resta per restringere.
- **Q-19.7-b = A**: chi è tenuto alla quota (non archiviato, con profilo pilota, allievo o istruttore attivo) e non l'ha mai pagata compare come **«Mancante»**.
- **Q-19.7-c = Sì**: anche le **visite mediche mancanti** diventano righe «Mancante», contate come scadute, con lo stesso ordinamento delle quote mancanti. Regola contro i doppioni: D-22.
- **Split** (sessione principale): 19.7a prima, 19.7b dopo.

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che la pagina Scadenze (e i riepiloghi che la riusano) elenchi in **un solo registro** i documenti registrati, la **currency** di ogni pilota e allievo, e le righe **«Mancante»** di chi non ha mai pagato la quota o non ha nessuna visita medica, con un filtro per categoria,

so that veda in un posto solo tutto ciò che impedirebbe a qualcuno di volare (Q-19.7-a/b/c), prima che lo blocchino i check della 19.9/19.10.

### Fatti misurati che vincolano il design (su `869c9cf`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| `listAllExpiries` ha **quattro** consumatori | pagina Scadenze (`expiries/page.tsx:95-100`); Panoramica (`dashboard/page.tsx:304`, `pageSize: EXPIRIES_WIDGET_SCAN_LIMIT` = 60, `:81`) che alimenta `ScadenzeWidget` (`:719`) **e** il feed Avvisi (`buildOverviewAlerts`, `:485-505`); export xlsx/pdf (`exports.service.ts:415-432`, `:664-687`); API `GET /api/v1/expiries` | il registro unificato (AD-1) passa da sé a tutti (le ricadute erano scritte nel «Contro» dell'opzione B); ogni consumatore deve saper rendere una riga **senza tipo** e **senza data** (AD-4) |
| Oggi ogni consumatore assume righe con tipo e data | `ScadenzeWidget` filtra `item.daysUntil <= win` e stampa `item.typeName` (`scadenze-widget.tsx:67`, `:106`); `overview-alerts.ts` tipizza `typeName: string`, `daysUntil: number` (`:41`, `:43`) e li usa in `rankOf`/`weightOf` (`:107`, `:122`); gli export stampano `typeName`, `tScope(typeScope)`, `formatDateOnly(expiresAt)` (`exports.service.ts:425-429`) | DTO con campi nullabili + gestione esplicita in ogni consumatore; il typecheck li trova tutti |
| Un consumatore con tetto dipende dall'**ordine** | il feed Avvisi prende le prime 60 righe e ne mostra 5; l'e2e che lo prova registra una scadenza vecchia di dieci anni perché «ordina prima dentro il rango 0 e il tetto non può mai nasconderla» (`mobile-overview.spec.ts:408-415`) | le righe senza data **non** vanno in testa: sul DB e2e (centinaia di persone di fixture senza voli, quota o visite) e in un club vero nasconderebbero ogni documento scaduto. Chiave `COALESCE(expiresAt, ieri)` (D-20) |
| Gli export hanno un tetto sul totale | `EXPORT_MAX_ROWS = 10_000`, `PDF_EXPORT_MAX_ROWS = 2_000` (`exports.service.ts:61`, `:64`), controllati su `result.total` | il totale cresce di una riga currency per pilota/allievo e delle righe «Mancante»: misura in AC 14 |
| Volumi di carico | 5 000 persone, 60 000 voli (`seed-load.ts:220-223`); piloti/allievi non archiviati ~4 000 | l'unione calcola l'X-esimo volo di ~4 000 persone a ogni pagina e a ogni conteggio: guardia di prestazioni (AC 14, stima §3.9) |
| Il registro calcola «oggi» in UTC | `listAllExpiries`/`getExpiryTierCounts` usano `todayDateOnlyUtc()` (`expiries.service.ts:444`, `:507`); la currency della 19.7a usa Roma | un'unione con due «oggi» darebbe `daysUntil` diversi a righe con la stessa data fra le 00:00 e le 02:00: **un** oggi, quello di Roma (D-21) |
| Un e2e confronta un contatore globale per uguaglianza | `expiry-dashboard.spec.ts:144-158` legge «≤ 7 giorni» su due caricamenti e pretende lo stesso numero | con B il contatore cambia ogni volta che un altro spec crea una persona con un profilo o registra un volo nella finestra: flake per costruzione (lezione Billing-2 F4) → riscrittura (§3.6) |
| Un e2e cerca le righe Avvisi per cognome | `mobile-overview.spec.ts:442` `filter({ hasText: pilot.lastName })` con `toHaveCount(1)` | il pilota di fixture ha ora righe derivate proprie (currency, quota, visita): il locator va ristretto al nome del tipo (§3.6) |
| L'helper e2e legge il registro | `ensureValidSeedExpiries` legge `GET /api/v1/expiries?personId=…` (`e2e/helpers.ts:63`) | con le righe derivate deve considerare solo `source === 'DOCUMENT'` (AD-5) |

---

## §0 — Requisiti e ratifiche

### §0.1 Contratto

| # | Requisito |
|---|---|
| **P1** | Il registro Scadenze elenca, **in ogni vista**, documenti + righe currency (una per soggetto 19.7a D-8) + quote «Mancante» + visite mediche «Mancante», con paginazione comune (Q-19.7-a/b/c). |
| **P2** | I quattro contatori e il sottotitolo contano tutte le righe; una «Mancante» conta come scaduta (Q-19.7-c, D-19). |
| **P3** | Filtro **Categoria** (Visite mediche · Ratings · Quota associativa · Currency) per restringere; export in ogni vista con gli stessi filtri. |
| **P4** | Panoramica (widget e feed Avvisi), export e API mostrano le righe derivate in modo corretto. |
| **P5** | Le prestazioni dell'unione sono misurate sul DB di carico in sola lettura, con una soglia (AC 14). |
| **P6** | L'implementazione SQL della currency è controllata contro quella TS della 19.7a sulla stessa fixture (D-15). |

### §0.2 Ratifiche vincolanti

| R | Effetto qui |
|---|---|
| **Q-19.7-a = B** | P1, P2, AD-1, AD-3, AD-4. |
| **Q-19.7-b = A** | ramo «quota mancante» di AD-1. |
| **Q-19.7-c = Sì** | ramo «visita mancante» di AD-1, D-22. |
| **§4.5** (currency derivata, mai salvata) | nessuna materializzazione né cache: la currency si calcola a ogni lettura. |
| **§4.6** («mancante o scaduta = check fallito») | D-19. |
| **A8** | le righe derivate non entrano nel job dei promemoria (legge solo `Expiry`). |
| **A16** | D-21. |

**Superati**: story 6.4 per «il registro elenca solo righe `Expiry`»; story 12.11 AC 3 per «i contatori contano le scadenze registrate».

### §0.3 Scelte prese su delega

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-11** | Pagina Scadenze: **una sola sorgente** (il registro unificato) per ogni vista; filtro **Categoria** (URL `category`: `MEDICAL`/`RATING`/`MEMBERSHIP`/`CURRENCY`); export in **ogni** vista con gli stessi filtri dello schermo. | Q-19.7-a = B; R-15.7-k(1) | — |
| **D-15** | **Due implementazioni della regola currency, dichiarate**: `computeCurrency` (19.7a, valutazioni per persona e righe Piloti) e l'espressione SQL dell'unione (`data dell'X-esimo volo + Y`), necessaria per ordinare, filtrare e paginare nel DB insieme ai documenti. Si tengono d'accordo con doc-comment incrociati e con **la stessa fixture** letta dal registro e dalla pagina Piloti (AC 3 e sonda 4.3-c). | B: paginazione comune | tutto in memoria (con «Tutte» caricherebbe l'intero registro a ogni pagina); SQL anche per i check (perde i test unitari della regola) |
| **D-16** | Le visite **scadute ma superate** da una valida restano righe «Scaduto» (documenti). | il registro elenca documenti, e quel documento è scaduto | nasconderle |
| **D-17** | La currency compare nel registro, nella Panoramica (widget e Avvisi: leggono lo stesso registro), negli export e nell'API; **non** in «Le mie scadenze», scheda persona, landing pilota, email (A8). | B (le ricadute su Panoramica ed export erano scritte nel «Contro» dell'opzione) | — |
| **D-19** | Le righe **«Mancante»** (quota mai pagata, visita medica assente, currency mai acquisita = meno di X voli registrati in tutto) entrano in ogni vista e contano come **scadute**: finestre «Scaduti» e «≤ 7/30/60» (senza limite inferiore, `expiries.service.ts:415-421`) e contatore «Scaduti». | B + Q-b = A + Q-c = Sì + §4.6 | un quinto KPI «Mancanti»: non chiesto, e la striscia 2×2 mobile è misurata (15.7 R-15.7-h) |
| **D-20** | **Ordinamento**: `COALESCE(expiresAt, ieri) ASC, id ASC` — una «Mancante» si ordina come «scaduta ieri»: dopo i documenti scaduti da più tempo, prima di quelli in scadenza. `daysUntil` resta `null`. | il fatto misurato sui consumatori con tetto (Panoramica 60, Avvisi 5); conserva l'ordine di oggi fra i documenti | `NULLS FIRST`: allaga i consumatori con tetto; `NULLS LAST`: una riga scaduta dopo quelle valide fra un anno |
| **D-21** | Il registro unificato usa **un** «oggi», quello di Roma (`todayDateOnlyInZone(APP_TIMEZONE)`), per documenti e derivate. Il resto del modulo scadenze resta su UTC (16.9). | un'unione con due «oggi» è incoerente; A16 | allineare tutto il modulo: 16.9 |
| **D-22** | **Visita medica «Mancante»** (Q-19.7-c): una riga per chi è non archiviato con profilo pilota, allievo **o** istruttore attivo e **nessuna** riga `Expiry` di tipo MEDICAL registrata, e solo se esiste almeno un tipo MEDICAL attivo. Chi ha **solo visite scadute** **non** ha la riga «Mancante»: la sua visita scaduta è già una riga rossa del registro (contata in «Scaduti»), e una seconda riga per lo stesso requisito fallito sarebbe un doppione. Chi ha una visita valida non ha nulla di derivato. | R-19-j e la 19.7a D-4, che già distingue «scaduta» (riporta la visita più recente) da «mancante» (nessuna visita): il registro rispecchia la stessa partizione, un segnale rosso per requisito fallito. «Almeno un tipo attivo» come in D-4 | la «Mancante» anche per chi ha solo visite scadute: lo stesso requisito contato due volte nel contatore «Scaduti»; la «Mancante» per «nessuna visita **valida**» al posto della scaduta: nasconderebbe il documento scaduto, che è un fatto (D-16) |

---

## §1 — Decisioni architetturali

### AD-1 — Registro unificato (server): `listAllExpiries` e `getExpiryTierCounts`

Le due funzioni (`expiries.service.ts:441-482`, `:504-517`) diventano SQL grezzo sopra **un solo** frammento condiviso (es. `registryRowsSql(today, settings): Prisma.Sql`), costruito con `Prisma.sql` e parametri legati — **mai** concatenazione di input. Forma di riferimento (nomi indicativi, semantica vincolante):

```sql
WITH "currencySubjects" AS (            -- 19.7a D-8: non archiviati, pilota o allievo attivo
  SELECT p."id" FROM "Person" p WHERE p."archivedAt" IS NULL AND (EXISTS (…PilotProfile attivo…) OR EXISTS (…StudentProfile attivo…))
), "members" AS (                       -- quota e visite: + istruttore attivo
  SELECT p."id" FROM "Person" p WHERE p."archivedAt" IS NULL AND (… pilota OR allievo OR istruttore attivo …)
), "onBoard" AS (                       -- 19.7a D-7
  SELECT f."id" AS "flightId", f."personId", f."flightDate" FROM "Flight" f WHERE f."flightDate" <= ${today}::date
  UNION
  SELECT f."id", ip."personId", f."flightDate" FROM "Flight" f JOIN "InstructorProfile" ip ON ip."id" = f."instructorProfileId" WHERE f."flightDate" <= ${today}::date
), "ranked" AS (
  SELECT ob."personId", ob."flightDate", ROW_NUMBER() OVER (PARTITION BY ob."personId" ORDER BY ob."flightDate" DESC, ob."flightId" DESC) AS "rn"
  FROM "onBoard" ob JOIN "currencySubjects" s ON s."id" = ob."personId"
), "currencyAgg" AS (
  SELECT ob."personId", MAX(ob."flightDate") AS "lastFlightDate",
         (COUNT(*) FILTER (WHERE ob."flightDate" >= ${today}::date - ${windowDays}::int))::int AS "flightsInWindow"
  FROM "onBoard" ob JOIN "currencySubjects" s ON s."id" = ob."personId" GROUP BY ob."personId"
), "rows" AS (
  SELECT e."id", 'DOCUMENT' AS "source", t."kind"::text AS "category", e."personId", e."expiryTypeId", t."name" AS "typeName",
         t."scope"::text AS "typeScope", e."expiresAt", e."notes", NULL::date AS "lastFlightDate", NULL::int AS "flightsInWindow"
  FROM "Expiry" e JOIN "ExpiryType" t ON t."id" = e."expiryTypeId"
  UNION ALL                             -- currency: 19.7a D-6 in SQL, gemella di computeCurrency (D-15)
  SELECT 'currency:' || s."id", 'DERIVED', 'CURRENCY', s."id", NULL, NULL, NULL,
         r."flightDate" + ${windowDays}::int, NULL, a."lastFlightDate", COALESCE(a."flightsInWindow", 0)
  FROM "currencySubjects" s
  LEFT JOIN "ranked" r ON r."personId" = s."id" AND r."rn" = ${minFlights}
  LEFT JOIN "currencyAgg" a ON a."personId" = s."id"
  UNION ALL                             -- quota mancante (Q-19.7-b = A)
  SELECT 'membership:' || m."id", 'DERIVED', 'MEMBERSHIP', m."id", mt."id", mt."name", mt."scope"::text, NULL, NULL, NULL, NULL
  FROM "members" m CROSS JOIN (SELECT "id", "name", "scope" FROM "ExpiryType" WHERE "kind" = 'MEMBERSHIP') mt
  WHERE NOT EXISTS (SELECT 1 FROM "Expiry" x WHERE x."personId" = m."id" AND x."expiryTypeId" = mt."id")
  UNION ALL                             -- visita medica mancante (Q-19.7-c = Sì, D-22)
  SELECT 'medical:' || m."id", 'DERIVED', 'MEDICAL', m."id", NULL, NULL, NULL, NULL, NULL, NULL, NULL
  FROM "members" m
  WHERE EXISTS (SELECT 1 FROM "ExpiryType" WHERE "kind" = 'MEDICAL' AND "isActive")
    AND NOT EXISTS (SELECT 1 FROM "Expiry" x JOIN "ExpiryType" xt ON xt."id" = x."expiryTypeId" WHERE x."personId" = m."id" AND xt."kind" = 'MEDICAL')
)
```

- **Lista**: `SELECT r.*, p."firstName", p."lastName" FROM "rows" r JOIN "Person" p ON p."id" = r."personId" WHERE <filtri> ORDER BY COALESCE(r."expiresAt", ${yesterday}::date), r."id" LIMIT … OFFSET …` + il totale con gli **stessi** filtri (due query nella stessa transazione interattiva come oggi, `:466-475`, oppure `COUNT(*) OVER ()` gestendo la pagina vuota).
- **Filtri** (AND, frammenti `Prisma.sql`): `category` → `r."category" = …` (`MEDICAL` include le visite «Mancante»); `expiryTypeId` → `r."expiryTypeId" = …` (esclude currency e visite «Mancante», include le quote «Mancante»: hanno il tipo MEMBERSHIP); `personId`; `personQuery` → `p."firstName" ILIKE … ESCAPE '\' OR p."lastName" ILIKE …` con `%`, `_`, `\` **escapati** (§5.1); `scope` → `r."typeScope" = …` (esclude le righe senza tipo); `window` `'7'|'30'|'60'` → `(r."expiresAt" IS NULL OR r."expiresAt" <= oggi + N)`, `'expired'` → `(r."expiresAt" IS NULL OR r."expiresAt" < oggi)` (D-19); `status` `ok`/`expiring`/`expired` sulle fasce di oggi (`:394-404`) e il nuovo `missing` → `r."expiresAt" IS NULL`.
- **Contatori**: una query `COUNT(*) FILTER (…)::int` sopra `"rows"` senza filtri — `expired` = `expiresAt IS NULL OR expiresAt < oggi` (D-19), le altre fasce come oggi (`:510-515`).
- **Mappatura**: `status` = `'missing'` se `expiresAt` è `null`, altrimenti `computeExpiryStatus(expiresAt, oggi)`; `daysUntil` = `null` o `daysUntilUtc`; `currency` solo sulle righe `CURRENCY`; date via `toDateOnlyString`. `oggi`/`ieri` di Roma come stringhe `YYYY-MM-DD` con cast `::date`.
- **Impostazioni**: `getCurrencySettings()` (19.7a) letto **una volta** per richiesta.
- `expiresAtRangeForStatus`/`expiresAtRangeForWindow` (`:394-421`) e `DASHBOARD_SELECT`/`toDashboardItem` (`:341-375`) spariscono se restano senza uso.

### AD-2 — Contratto API (futura app Flutter)

`GET /api/v1/expiries` (+ `/pdf`) restituisce le **righe del registro unificato** (cambio di contratto, scritto nella descrizione OpenAPI). Item:

`{ id, source: 'DOCUMENT' | 'DERIVED', category: 'MEDICAL' | 'RATING' | 'MEMBERSHIP' | 'CURRENCY', personId, personFirstName, personLastName, expiryTypeId: string | null, typeName: string | null, typeScope: ExpiryScope | null, expiresAt: date | null, notes: string | null, status: 'ok' | 'expiring' | 'expired' | 'missing', daysUntil: int | null, currency: { lastFlightDate: date | null, flightsInWindow: int, minFlights: int, windowDays: int } | null }`

- `id` delle derivate: `currency:<personId>`, `membership:<personId>`, `medical:<personId>` (nessun endpoint li accetta: `PATCH/DELETE /expiries/{id}` restano per i documenti → 404);
- `expiryTypeId`/`typeName`/`typeScope` `null` sulla currency e sulla visita «Mancante»; `expiresAt` `null` = «Mancante»;
- query: `category` a 4 valori (la 19.7a l'ha introdotto a 3 nell'item), `status` accetta `missing`.

Schemi in `src/lib/schemas/expiries.ts` (`:16-20` stato del registro con `missing` — schema nuovo, `expiryStatusSchema` resta per le scadenze di persona —, `:142-150`, `:160-174`) e `registry.ts` (`:1310-1370`). Nessun path nuovo (`registry.test.ts:20-21` invariato).

### AD-3 — UI: pagina Scadenze (`expiries/page.tsx`, `scadenze-console.tsx`)

- **Una sorgente**: `listAllExpiries` per ogni vista; contatori e sottotitolo da `getExpiryTierCounts`.
- **Filtro Categoria**: URL `category` ∈ `MEDICAL | RATING | MEMBERSHIP | CURRENCY` (sanificato come `sanitizeWindow`, `page.tsx:28-30`). Desktop: `<select data-testid="scadenze-filter-category" className="input scadenze-filter-inpanel">` **prima** del select dei tipi, «Tutte le categorie» + le quattro. Telefono: nel pannello Filtri (`scadenze-filter-category-mobile`, sulla bozza, una navigazione all'«Applica» — 15.7 AD-4); `panelActiveCount` (`:310`) conta categoria **e** tipo; «Azzera filtri» (`:269-274`) svuota anche la categoria. Cambiare categoria svuota `expiryTypeId`.
- **Select dei tipi**: opzioni (`typeOptions` con `kind`) limitate alla categoria; con `CURRENCY` il select **non si renderizza**.
- **Export**: in ogni vista, con `category` (`exportFilterQuery`, `:110`).
- **Righe** (tabella, card mobile, sheet — view-model unico): **Categoria** = badge da `category` (etichette `ExpiriesPage.registry.category.*`, + `CURRENCY` qui); **Certificato** = `typeName`; per la currency l'etichetta `t('registry.currency.detail', { count: flightsInWindow, days: windowDays })` **costruita nel server** (plurale ICU) e passata alla console accanto agli item (es. mappa `id → etichetta`); per la visita «Mancante» l'etichetta di categoria («Visita medica»); **Scadenza**/**Giorni** = «—» se `null`; **Stato** = badge `tierOf` come oggi oppure «Mancante» (`registry.status.missing`, tono `bad`); tinta della riga e tono della cella giorni delle «Mancante» = quelli del tier 0 (stesse classi: le misure di `mobile-ink-targets.spec.ts:435-441` restano valide). Sheet: «Ambito» e «Note» = «—» dove mancano. Unica azione di ogni riga: la scheda persona (`personId`).
- **testid**: righe e card riusano `scadenze-row`/`scadenze-row-mobile`; nessun testid desktop esistente cambia (`mobile-expiries-movements.spec.ts:516`); prima di scegliere i nomi `grep -rn 'data-testid\^=' e2e/`.
- **Budget della testata mobile**: ≤ 261,5 px a 375 px (`mobile-expiries-movements.spec.ts:333`).

### AD-4 — Panoramica, Avvisi, export

- **`ScadenzeWidget`** (`src/components/dashboard/scadenze-widget.tsx`): finestra (`:67`) che tiene `daysUntil === null`; `iconToneOf`/`badgeToneOf`/`dayLabel` (`:28`, `:33`, `:71`) con `null` = tier 0 ed etichetta «Mancante»; sottoriga (`:106`) = `typeName ?? etichetta di categoria` (label nuove da `dashboard/page.tsx:719-730`).
- **`overview-alerts.ts`**: `typeName: string | null`, `daysUntil: number | null` (`:41`, `:43`); `rankOf` (`:107`) → rango «scaduto» per `null`; `weightOf` (`:122`) → `-1` per `null` (stessa posizione di D-20); il salto del tier 4 (`:137`) non scatta su `null`; chiave `expiry:${id}` invariata. Chiamante `dashboard/page.tsx:496-505`: titolo con `typeName ?? etichetta di categoria`, sottoriga «Mancante» per `null`.
- **Export** (`exports.service.ts:415-432`, `:664-687`): tipo = `typeName ?? t('registry.category.<category>')`; ambito = `typeScope ? tScope(…) : '—'`; scadenza = data o «—»; stato = `t('registry.status.missing')` per `missing`; colore PDF di `missing` = quello di `expired` (`:662`). Tetti invariati (§3.9).

### AD-5 — Helper e2e

`ensureValidSeedExpiries` (`e2e/helpers.ts`, nella forma lasciata dalla 19.7a): dalla lettura di `GET /api/v1/expiries?personId=…` (`:63` su HEAD) considera **solo** `source === 'DOCUMENT'`.

---

## §2 — Acceptance Criteria

### Registro unificato

1. **Service** (unit con `$queryRaw` mockato): parametri legati e frammenti per ogni filtro (`category` sui 4 valori, `expiryTypeId`, `scope`, `personId`, `personQuery` con `50%_x\` escapato, `window` con le `NULL` incluse, `status` incluso `missing`); mappatura riga → DTO per documento, currency con e senza data, quota «Mancante», visita «Mancante» (`source`, `category`, campi `null`, `status`, `daysUntil`, `currency`); `getCurrencySettings` letto una volta per chiamata; `oggi` di Roma (fake timer alle 00:30 di Roma = 23:30Z del giorno prima → `oggi` è il giorno di Roma).
2. **Contatori** (D-19): unit — la query conta le `NULL` in `expired`; **sonda nel record** su DB fresco dopo `seed` + `seed:demo`: `getExpiryTierCounts` = conteggio a mano con SQL scritto nel record (documenti + currency + quote e visite «Mancante» per fascia), e il sottotitolo della pagina = la somma. Nessun e2e con uguaglianza su un contatore globale.
3. **Currency nel registro** (e2e; fixture come la 19.7a AC 15, con `registerFlightOn` e date di Roma): A pilota con un volo a oggi−90 → riga currency con scadenza **oggi**, «0g», «≤ 7 giorni»; B allievo con un volo in doppio a oggi−91 → «Scaduto», «1g fa»; C pilota senza voli → «Mancante», «—»; D pilota+istruttore con un solo volo **da istruttore** a oggi−10 → scadenza oggi+80, «Valido»; E istruttore senza profilo pilota → nessuna riga currency. Vista predefinita con `window=all&personQuery=<suffisso>`: le righe currency compaiono **insieme** ai documenti di A-E e alle loro righe «Mancante», nell'ordine di D-20 (B prima di C, C prima di A); `category=CURRENCY` lascia solo A-D; `window=expired` mostra B e C (più le «Mancante»), non A né D; finestra predefinita (60) mostra A e non D. Desktop e 375 px (card + sheet di A con «Ambito» e «Note» = «—»). **Gli stessi A-D sulla pagina Piloti** mostrano i badge della 19.7a AC 15 (parità delle due implementazioni, D-15).
4. **Quota nel registro** (e2e): F con quota addebitata via API → riga documento «Quota associativa» con la sua data; G istruttore senza quota → riga «Mancante» (badge «Quota associativa», data e giorni «—»); H archiviata e I senza profili, entrambe senza quota → **nessuna** riga quota. `category=MEMBERSHIP` e `expiryTypeId=<tipo quota>` mostrano F e G e nient'altro di quelle persone.
5. **Visite nel registro** (e2e, D-22): J pilota **senza** visite (helper **non** chiamato) → **una** riga «Visita medica — Mancante» (badge «Visita medica», data «—», stato «Mancante»); K pilota con **sola** classe 2 scaduta → la riga documento «Scaduto» e **nessuna** riga «Mancante»; L pilota con una visita valida → nessuna riga derivata medica. `category=MEDICAL` mostra la riga di J; `expiryTypeId=<classe 2>` mostra K e non J. Unit: con **nessun** tipo MEDICAL attivo il ramo non produce righe.
6. **Panoramica e Avvisi**: unit su `buildOverviewAlerts` con righe `daysUntil: null`/`typeName: null` (rango scaduto, peso −1, mai saltate; dopo una scaduta da 10 giorni, prima di una in scadenza); `ScadenzeWidget`: la finestra «7» include una riga `null` e la rende «Mancante» in rosso (unit su un helper puro estratto se serve, o verifica UI di AC 19 — scelta motivata). `mobile-overview.spec.ts:416-445` verde col locator ristretto di §3.6.
7. **Export**: unit su `exportExpiriesXlsx`/`exportExpiriesPdf` con una riga currency senza data, una quota «Mancante» e una visita «Mancante» (tipo = etichetta di categoria, ambito «—», scadenza «—», stato «Mancante», colore PDF di scaduto); e2e: xlsx di `category=CURRENCY&personQuery=<suffisso>&window=all` con le righe A-D e nessun documento; l'href dell'export in pagina porta `category`.
8. **API**: `GET /api/v1/expiries?personQuery=<suffisso>&category=CURRENCY` → item di A con `source: 'DERIVED'`, `category: 'CURRENCY'`, `expiryTypeId: null`, `currency.flightsInWindow = 1`, `minFlights = 1`, `windowDays = 90`; `status=missing` → solo righe senza data; `PATCH /api/v1/expiries/currency:<id>` → 404; pilota → 403 come oggi. OpenAPI aggiornato, `registry.test.ts` verde senza path nuovi.

### UI del filtro e badge

9. **Filtro Categoria** (e2e desktop e 375 px): `scadenze-filter-category` / `scadenze-filter-category-mobile` navigano con `category=…` (il telefono in **una** navigazione all'«Applica», insieme alla ricerca digitata — schema di `mobile-expiries-movements.spec.ts:355-391`); «Filtri (1)» con la sola categoria, «Filtri (2)» con categoria + tipo; «Azzera filtri» la toglie; «Visite mediche» → il select dei tipi offre solo visite; «Currency» → il select dei tipi non c'è; l'export c'è in ogni vista; testata mobile nel budget (`:333` verde).
10. Badge «Currency» tradotto in IT ed EN (e2e su `/en/dashboard/expiries` con la riga di A).

### e2e a rischio, helper

11. `expiry-dashboard.spec.ts:144-158` riscritto **senza** uguaglianza fra due caricamenti di un contatore globale (lettura a forbice: non filtrato → filtrato → non filtrato, il filtrato uguale a uno dei due; **oppure** spostato nella catena serializzata — scelta motivata nel record) e verde in 3 run mirati consecutivi.
12. `mobile-overview.spec.ts:442` ristretto al nome del tipo registrato; verde in 3 run mirati consecutivi.
13. `ensureValidSeedExpiries` considera solo `source === 'DOCUMENT'` (AD-5); gli spec che lo usano restano verdi.

### Prestazioni

14. **Guardia di prestazioni** sul DB di carico **in sola lettura** (`airmanager_load` o il nome dell'HANDOFF; prima di tutto `SELECT current_database()` nel record): **solo** `EXPLAIN (ANALYZE, BUFFERS)` di `SELECT` — mai migrazioni, seed, `INSERT`/`UPDATE`/`DELETE`, `VACUUM`, `CREATE INDEX` su quel DB. Dove lo schema di quel DB è più vecchio (enum `MEMBERSHIP` assente, colonne di 19.2-19.6), adattare **solo** i letterali (es. `t."kind"::text = 'MEMBERSHIP'`, quota per nome) e dichiararlo. Misure (`Execution Time`) nel record: (a) pagina 1 della vista predefinita (`window=60`, 20 righe) + totale; (b) pagina 1 con `window=all`; (c) contatori; (d) `category=CURRENCY` pagina 1; (e) totali di (a) e (b) contro i tetti di export (2 000 PDF, 10 000 xlsx). **Soglia: ognuna di (a)-(d) ≤ 300 ms.** Se una la supera: forma `LATERAL … ORDER BY "flightDate" DESC OFFSET X−1 LIMIT 1` per persona e, se il piano indica il sort sui voli come costo dominante, indici `Flight(personId, flightDate)` / `Flight(instructorProfileId, flightDate)` — misurati su una **copia scrivibile chiesta alla sessione principale**, mai creati sul DB di carico; con la conferma, entrano in una migrazione di questa story dichiarati in `schema.prisma` al posto dei due indici a colonna singola. Se resta sopra soglia: **fermarsi** e riportarlo alla sessione principale con i piani.

### Residui, gate

15. i18n: chiavi di §3.8 in entrambi i file, parità verde, nessuna orfana.
16. `npm run gates` verde; i file di test nuovi o toccati passano con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.
17. Arbitro e2e completo verde su DB fresco via `scripts/e2e.sh` (conteggio prima/dopo, test nuovi/cambiati elencati).
18. Nessun residuo delle funzioni Prisma rimaste senza uso (`grep -n "expiresAtRangeFor\|DASHBOARD_SELECT\|toDashboardItem" src -r` → 0, o motivato).
19. **Verifica UI** (Playwright MCP o script throwaway): screenshot desktop e 375 px della vista predefinita (documenti, currency, quote e visite «Mancante» mescolati), di «Currency», «Quota associativa» e «Visite mediche», della Panoramica (widget desktop e Avvisi mobile con una «Mancante»), del pannello Filtri aperto; tema chiaro e scuro per il registro.

---

## §3 — Dev Notes: blast radius (misurato su `869c9cf` con `git show HEAD:`; rieseguire dopo 19.7a)

### 3.1 — Server
`expiries.service.ts`: `ExpiryDashboardItem` `:320`, `DASHBOARD_SELECT` `:341-349`, `toDashboardItem` `:361-375`, `expiresAtRange*` `:394-421`, `listAllExpiries` `:441-482`, `getExpiryTierCounts` `:504-517`; `exports.service.ts:415-432`, `:662-687`.

### 3.2 — Zod e OpenAPI
`src/lib/schemas/expiries.ts:16-20`, `:142-150`, `:160-174`; `registry.ts:1310-1370`.

### 3.3 — UI
- `expiries/page.tsx:14-22`, `:28-30`, `:81-82`, `:88-112`, `:114`, label nuove (+ mappa delle etichette currency).
- `expiries/scadenze-console.tsx:37-42`, `:77-127`, `:235-241`, `:269-274`, `:310`, `:362-370`, `:412-425`, `:486-523`, `:563-591`, `:664-684`, `:691-717`.
- `components/dashboard/scadenze-widget.tsx:28-74`, `:98-110`; `dashboard/page.tsx:485-505`, `:719-730`.
- `src/lib/overview-alerts.ts:37-44`, `:107-145`.

### 3.4 — Seed
Nessuna modifica attesa. Nel record: quante righe derivate produce il DB demo per categoria e stato (è l'effetto atteso di B, da descrivere col numero).

### 3.5 — Contratti consumati dalla 19.7a
`computeCurrency`/`CURRENCY_DEFAULTS` (riferimento della regola, D-15), `getCurrencySettings` (X e Y per l'SQL), `ExpiryTypeKind.MEMBERSHIP` (ramo quota), la regola D-4 (ramo visita: «almeno un tipo MEDICAL attivo»), il campo `category` a 3 valori (qui a 4), le etichette `ExpiriesPage.registry.category.*`, gli helper e2e `ensureValidSeedExpiries`/`registerFlightOn` e le fixture A-E della 19.7a AC 15 (riprodotte qui, non condivise a runtime).

### 3.6 — Blast radius e2e (comando: `grep -rnE "scadenze-stat-|scadenze-row|scadenze-widget|mobile-overview-alert|/api/v1/expiries|expiries/pdf" e2e`)

| Spec | Punto (HEAD) | Destino |
|---|---|---|
| **`expiry-dashboard.spec.ts`** | `:144-158` | AC 11 |
| `expiry-dashboard.spec.ts` | altri test | filtrano per `expiryTypeId` run-unique: le derivate restano fuori — verdi senza modifiche, da verificare |
| **`mobile-overview.spec.ts`** | `:416-445` | AC 12 |
| `mobile-expiries-movements.spec.ts` | navigano con `expiryTypeId` (`gotoScadenze`, `:79-80`) | verdi senza modifiche; + AC 9 |
| `mobile-ink-targets.spec.ts` | `:435-441` | le celle «—» col tono del tier 0 (AD-3): verde |
| `home-dashboard.spec.ts:146`, `mobile-overview.spec.ts:215`, `:230` | widget visibile/nascosto | verdi |
| `pdf-exports.spec.ts` | `:189` (filtrato per tipo), `:259`, `:277` (403/401) | verdi |
| `helpers.ts` | `:63` | AD-5 |
| **nuovo** `e2e/expiries-registry.spec.ts` (nome indicativo) | AC 3-5, 7-10 | fixture run-unique, nessuna scrittura di AppSettings |

### 3.7 — Unit esistenti che cambiano
`expiries.service.test.ts` (**36** riferimenti a `listAllExpiries`/`getExpiryTierCounts` mockano `prisma.expiry.findMany/count`: con l'SQL grezzo vanno riscritti su `$queryRaw` — la parte più lunga), `exports.service.test.ts` (7 riferimenti), `overview-alerts.test.ts`. `expiries.service.ts` legge ora le impostazioni currency (→ `app-settings.service.ts` → env eager): i test che lo importano (anche `bookings.service.test.ts`, `flights.service.test.ts`) mockano la catena.

### 3.8 — Chiavi i18n (entrambi i file; copy definitiva della 19.12)
- `ExpiriesPage.registry.filters.category.{all,MEDICAL,RATING,MEMBERSHIP,CURRENCY}` — «Tutte le categorie», «Visite mediche», «Ratings», «Quota associativa», «Currency» / «All categories», «Medical visits», «Ratings», «Membership fee», «Currency»; `…filters.categoryLabel` — «Categoria» / «Category».
- `ExpiriesPage.registry.category.CURRENCY` — «Currency» / «Currency» (le altre tre sono della 19.7a).
- `ExpiriesPage.registry.status.missing` — «Mancante» / «Missing» (anche negli export).
- `ExpiriesPage.registry.currency.detail` — «{count, plural, one {# volo} other {# voli}} negli ultimi {days} giorni» / «{count, plural, one {# flight} other {# flights}} in the last {days} days».
- `DashboardPage.scadenzeWidget.{currency,medical,missing}` — «Currency», «Visita medica», «Mancante» / «Currency», «Medical», «Missing».

### 3.9 — Stima (prestazioni)
L'unione calcola l'X-esimo volo di **tutti** i soggetti currency (sul DB di carico ~4 000 persone; ~60 000 voli più le righe da istruttore → 80-90 000 righe «a bordo» da partizionare e ordinare), la affianca alle ~10 000 righe `Expiry` e alle righe «Mancante», poi ordina tutto per la chiave di D-20. La finestra filtra **dopo** il calcolo, quindi anche la vista predefinita paga l'intero. Stima a tavolino: 50-200 ms per query; la pagina Scadenze ne esegue 3 (righe, totale, contatori), la Panoramica 1 → soglia di AC 14 e leve già indicate (righe + totale con `COUNT(*) OVER ()`; `LATERAL` + indici). Nessuna cache: la currency resta derivata. Con 5 000 persone la vista predefinita supera verosimilmente il tetto PDF di 2 000 righe: l'export PDF risponde col suo errore di tetto finché non si restringe il filtro — comportamento esistente del tetto, misurato in AC 14(e) e riportato.

---

## §4 — Piano di test

### 4.1 — Unit
`expiries.service.test.ts` (AC 1, 2, 5), `overview-alerts.test.ts` (AC 6), `exports.service.test.ts` (AC 7).

### 4.2 — e2e (`fullyParallel`, fixture run-unique, `scripts/e2e.sh`)
Fixture: persone via API con suffisso unico; visite **prima**, **poi** `ensureValidSeedExpiries` (19.7a AD-9); per J l'helper non si chiama; voli con `registerFlightOn` e `seedAircraftRate`; date da `todayRome()`/`addDaysIso()`. Righe raggiunte con la ricerca per suffisso; celle asserite in modo esatto (mai `hasText` con date o «0g»). **Nessuna** uguaglianza sui contatori globali.

### 4.3 — Discriminanza e sonde (nel Dev Agent Record)
(a) **Ordinamento D-20**: con `NULLS FIRST` al posto della chiave `COALESCE`, l'ordine B → C → A di AC 3 si rompe (C in testa) — output prima/dopo. (b) **Escape di `personQuery`**: una ricerca `%` senza escape restituisce tutte le righe; con l'escape nessuna. (c) **Parità SQL/TS (D-15)**: con il volo di A spostato a oggi−91, AC 3 (registro, SQL) **e** la 19.7a AC 15 (Piloti, TS) falliscono entrambi; con un `+ windowDays - 1` introdotto di proposito nell'SQL, solo AC 3 fallisce — prova che l'e2e del registro sorveglia l'implementazione SQL. (d) **Doppioni medici (D-22)**: con il ramo «visita mancante» scritto su «nessuna visita **valida**», AC 5 (K) fallisce perché compare una seconda riga.

### 4.4 — Gate
`npm run gates`; arbitro e2e completo su DB fresco (`scripts/e2e.sh`, esito solo da `status`; `E2E_REUSE_SERVER=1` per i run mirati). Prima del primo reset DB controllare i processi vivi su :3000.

---

## §5 — Trappole note

1. **SQL grezzo al posto di Prisma**: (a) `personQuery` escapato (`%`, `_`, `\`) con `ILIKE … ESCAPE '\'` — Prisma `contains` lo faceva da sé (parità di comportamento con oggi); (b) solo `Prisma.sql`/`Prisma.join`/`Prisma.empty`, mai stringhe interpolate; (c) `COUNT(*)` torna `bigint` → `BigInt` non serializzabile in JSON: cast `::int`; (d) gli enum tornano stringhe solo con `::text`.
2. **Date**: stringhe `YYYY-MM-DD` di Roma con cast `::date` (un `Date` JS legato diventa `timestamptz` e può spostare il giorno); niente `new Date(string)` grezzo.
3. **Ordinamento e tetti**: D-20 non è estetica — è ciò che tiene i documenti scaduti dentro i 60 della Panoramica e i 5 degli Avvisi (sonda 4.3-a).
4. **Id derivati**: `currency:`/`membership:`/`medical:` + `personId` non sono id di `Expiry`; nessun consumatore li usa per azioni.
5. **Aggregati globali negli e2e**: con B i contatori cambiano a ogni persona creata da qualunque spec; nessun test nuovo li confronta per uguaglianza (CLAUDE.md, lezione Billing-2 F4).
6. **`t.raw` e plurali**: `registry.currency.detail` è ICU con plurale → si risolve nel server.
7. **Env eager**: `expiries.service.ts` → `getCurrencySettings` → `app-settings.service.ts` → `@/server/crypto/secret-box` → `@/lib/env` (§3.7).
8. **Confine con la 19.7a**: nessuna regola nuova qui — currency, visite e quota si valutano con le sue definizioni (D-4, D-6, D-8); se il dev trova una differenza fra la sua regola TS e l'SQL di questa story, vince la 19.7a e l'SQL si corregge.

---

## §6 — Fuori scope DICHIARATO

- Regole, catalogo, quota `MEMBERSHIP`, impostazioni e servizio currency, righe Piloti → **19.7a**.
- Avviso con deroga e check di currency, quota, saldo, visite su voli e prenotazioni → **19.9/19.10**.
- Currency in «Le mie scadenze», scheda persona, landing pilota, email (D-17, A8).
- «Oggi» di Roma nel resto del modulo scadenze → **16.9**.
- Tetti degli export: invariati (§3.9).

---

## §7 — Riferimenti

- Decisioni PO 2026-11-01 su Q-19.7-a/b/c (sopra); CR §4.5, §4.6, §4.10 (A8, A16).
- Story: `19-7a-scadenze-modello-regole-quota-currency.md`; `15-3-*.md`, `15-7-*.md`, `12-11-*.md`.
- Codice: `src/server/services/{expiries,exports}.service.ts`; `src/lib/{overview-alerts,expiry-status,mobile-expiries}.ts`; `src/components/dashboard/scadenze-widget.tsx`; `src/app/[locale]/dashboard/expiries/`, `dashboard/page.tsx`; `src/lib/schemas/{expiries,registry}.ts`.

---

## Tasks / Subtasks

- [ ] **T0 — Riallineamento**: `git log`; codice committato della 19.7a (nomi e righe dei contratti di §5.12 della 19.7a); censimenti di §3 su HEAD.
- [ ] **T1 — Registro unificato** (AC 1, 2, 8): frammento SQL, lista, totale, contatori, DTO, OpenAPI.
- [ ] **T2 — Guardia di prestazioni** (AC 14), subito dopo T1 e prima della UI: se la soglia non regge, ci si ferma prima di costruire sopra.
- [ ] **T3 — Scadenze UI** (AC 3-5, 9-10).
- [ ] **T4 — Panoramica, Avvisi, export** (AC 6-7).
- [ ] **T5 — e2e** (AC 11-13, 17): spec a rischio, helper, spec nuovo.
- [ ] **T6 — Residui, i18n, gate, verifica UI** (AC 15-19).

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD e sulla 19.7a (T0)

### §B — Riepilogo per AC con le prove

### §C — Guardia di prestazioni (AC 14): database, adattamenti, piani, tempi, totali vs tetti

### §D — Sonda dei contatori (AC 2) e righe derivate del DB demo (§3.4)

### §E — Sonde e discriminanze §4.3 (a)-(d)

### §F — Delta test (unit ed e2e, prima/dopo)

### §G — Deviazioni motivate

### §H — Verifica UI (screenshot)

### §I — Gate ed esiti verbatim

### Completion Notes List

### File List
