---
baseline_commit: 869c9cf
---

# Story 19.7b: Registro Scadenze unificato — currency, quote e visite «Mancante» in ogni vista

Status: **done** — 2026-11-02 (review SHIPPABLE; decisione PO in review: VIA le righe «Mancante» ovunque (Q-19.7-b/c ribaltate) → fix `0f338e1` + docs `c8c6db9` (anche F1 archiviati esclusi, F2 plurale); arbitro finale della sessione principale su DB fresco **555/555, 0 flaky, exit 0**). Storico — **review** — dev 2026-11-02 (Dev Agent Record in fondo); review SHIPPABLE e fix `0f338e1` con la decisione PO del 2026-11-02 (Review Record in fondo); story scritta il 2026-11-01. Seconda metà della 19.7, **divisa dalla sessione principale**: la **19.7a** (`19-7a-scadenze-modello-regole-quota-currency.md`) consegna modello, regole e funzioni di valutazione; questa costruisce il **registro unificato** (documenti ∪ righe derivate) con filtro Categoria, contatori, ricadute su Panoramica/Avvisi/export/API e la guardia di prestazioni. **Nessuna domanda PO aperta.** **Modello dev: Opus 5 xhigh (UI)**: registro Scadenze desktop + faccia mobile con il pannello Filtri, widget Scadenze della Panoramica e feed Avvisi mobile, oltre a SQL grezzo, DTO, OpenAPI, export ed e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-7b-registro-scadenze-unificato`. Taglia: L.

> ⚠️ **Dipendenza dura**: il dev parte **DOPO il commit della 19.7a** (e quindi di 19.1…19.6). Consuma da lei, **senza rinominarli** (19.7a §5.12): `computeCurrency` e `CURRENCY_DEFAULTS` (`src/lib/currency.ts`), `getCurrencySettings`, `loadOnBoardFlightDates`/`listCurrencyByPerson` (`currency.service.ts`), `evaluateMedicalRequirement`/`getMedicalRequirementFailure`, `ExpiryTypeKind.MEMBERSHIP`, il campo `category` degli item di `GET /api/v1/expiries`, le chiavi `ExpiriesPage.registry.category.{MEDICAL,RATING,MEMBERSHIP}`, gli helper e2e `ensureValidSeedExpiries` (una visita sola) e `registerFlightOn`. Al T0: leggere il **codice committato** della 19.7a (non questo file) e correggere qui ogni nome o riga che non torna.
>
> Ogni `file:riga` è misurato su **`869c9cf`** con `git show HEAD:<file>`; la 19.7a e le story precedenti li spostano: rieseguire i censimenti di §3.
>
> **Da leggere PRIMA**: `CLAUDE.md` (substring di `getByLabel`/`hasText`, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, env eager negli unit, **aggregati globali sotto `fullyParallel`**, catena serializzata); `sprint-change-proposal-2026-11-01.md` §4.5, §4.6, §4.10 A8/A16; `19-7a-*.md` (D-4, D-6, D-8, AD-3, AD-5); `15-7-*.md` (faccia mobile Scadenze, pannello Filtri a navigazione unica, AD-4 del debounce, R-15.7-k), `15-3-*.md` (feed Avvisi, R-15.3-e, review F7), `12-11-*.md` (registro e contatori). Skill: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max`.

### Decisioni PO (2026-11-01) — tutte chiuse

- **Q-19.7-a = B** (contro la raccomandazione A): le righe **currency** compaiono **mescolate ai documenti in ogni vista del registro, contatori inclusi**; il filtro Categoria resta per restringere.
- **Q-19.7-b = A**: chi è tenuto alla quota (non archiviato, con profilo pilota, allievo o istruttore attivo) e non l'ha mai pagata compare come **«Mancante»**.
- **Q-19.7-c = Sì**: anche le **visite mediche mancanti** diventano righe «Mancante», contate come scadute, con lo stesso ordinamento delle quote mancanti. Regola contro i doppioni: D-22.
- ⚠️ **Q-19.7-b e Q-19.7-c RIBALTATE dal PO il 2026-11-02** — testo del PO: «dietro front, eliminiamo il "mancante": se manca la currency o la visita medica o i ratings etc non esce nulla sul widget e nella tabella delle scadenze». Applicazione (sessione principale): **nessuna riga «Mancante» in nessun punto del registro** — tabella Scadenze desktop e mobile, contatori, widget Scadenze e Avvisi della Panoramica, export, `GET /api/v1/expiries` —: né quota mai pagata, né visita mai registrata, né currency senza data (meno di X voli a bordo in tutta la storia). **Restano** i documenti registrati e le righe currency **con una data reale** (valide, in scadenza o scadute): Q-19.7-a = B resta valida. **Invariati**: i check bloccanti di voli e prenotazioni (19.9/19.10), il badge «Non current» delle righe Piloti e le funzioni di servizio della 19.7a. Superati: D-19, D-20 (l'ordinamento torna `expiresAt, id`), D-22, i rami «quota mancante» e «visita mancante» di AD-1, lo stato `missing` e i campi nullabili di data di AD-2, le «Mancante» di AD-3/AD-4 e degli AC 3, 4, 5, 6, 7, 8; TD 19.7b-b decade. Applicato col fix di review (Review Record in fondo).
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

- [x] **T0 — Riallineamento**: `git log`; codice committato della 19.7a (nomi e righe dei contratti di §5.12 della 19.7a); censimenti di §3 su HEAD.
- [x] **T1 — Registro unificato** (AC 1, 2, 8): frammento SQL, lista, totale, contatori, DTO, OpenAPI.
- [x] **T2 — Guardia di prestazioni** (AC 14), subito dopo T1 e prima della UI: se la soglia non regge, ci si ferma prima di costruire sopra.
- [x] **T3 — Scadenze UI** (AC 3-5, 9-10).
- [x] **T4 — Panoramica, Avvisi, export** (AC 6-7).
- [x] **T5 — e2e** (AC 11-13, 17): spec a rischio, helper, spec nuovo.
- [x] **T6 — Residui, i18n, gate, verifica UI** (AC 15-19).

---

## Dev Agent Record

### Agent Model Used

Opus 5.5 (`claude-opus-5-5`), dev subagent unico della story (`dev-19-7b`), skill `bmad-dev-story` + `karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max`. Implementazione: commit `450a0f6` su `dev`. HEAD di partenza `f4c1e6a` (19.7a chiusa, fix `b2314e8` incluso); il `baseline_commit: 869c9cf` del frontmatter resta quello delle misure della story.

### §A — Riallineamento sul HEAD e sulla 19.7a (T0)

Censimenti di §3 rieseguiti con `git show HEAD:` su `f4c1e6a`. Scostamenti rispetto a `869c9cf` (il disegno non cambia):

| Punto | Story (`869c9cf`) | HEAD `f4c1e6a` |
|---|---|---|
| `expiries.service.ts` `ExpiryDashboardItem` / `DASHBOARD_SELECT` / `toDashboardItem` | `:320` / `:341` / `:361` | `:343` / `:366` / `:386` |
| `expiresAtRangeForStatus` / `…ForWindow` | `:394` / `:415` | `:420` / `:441` |
| `listAllExpiries` / `getExpiryTierCounts` | `:441` / `:504` | `:467` / `:530` |
| `exports.service.ts` xlsx / colore PDF / pdf | `:415` / `:662` / `:664` | `:409` / `:651` / `:653` |
| `dashboard/page.tsx` scan limit / `listAllExpiries` / `buildOverviewAlerts` / `<ScadenzeWidget` | `:81` / `:304` / `:485` / `:719` | `:79` / `:300` / `:475` / `:709` |
| `scadenze-widget.tsx` `iconToneOf` / `badgeToneOf` / finestra / `dayLabel` / sottoriga | `:28` / `:33` / `:67` / `:71` / `:106` | invariati |
| `overview-alerts.ts` `typeName` / `daysUntil` / `rankOf` / `weightOf` / salto tier 4 | `:41` / `:43` / `:107` / `:122` / `:137` | invariati |
| `schemas/expiries.ts` stato / query / item | `:16-20` / `:142-150` / `:160-174` | `:18` / `:144` / `:162` |
| `registry.ts` `GET /expiries` / `/pdf` | `:1310` / — | `:1313` / `:1331` |
| `expiries/page.tsx` `sanitizeWindow` / `typeOptions` / `exportFilterQuery` | `:28` / — / `:110` | `:28` / `:83` / `:110` |
| `scadenze-console.tsx` `handleReset` / `panelActiveCount` / sheet / select tipo | `:269` / `:310` / `:362` / `:412` | `:272` / `:313` / `:365` / `:420` |
| e2e `helpers.ts` lettura registro / `expiry-dashboard.spec.ts` stat card / `mobile-overview.spec.ts` locator | `:63` / `:144` / `:442` | `:63` / `:144` / `:442` |
| chiavi i18n | — | 1653 per lingua |

**Contratti 19.7a consumati** (codice committato, nomi invariati): `getCurrencySettings()` (`app-settings.service.ts:404`, letto una volta per chiamata del registro), la regola di `computeCurrency` (`src/lib/currency.ts`) e la definizione «a bordo» di `loadOnBoardFlightDates` (`currency.service.ts`) **con il fix F2** — `f."isSolo" = false` sul ramo istruttore —, `ExpiryTypeKind.MEMBERSHIP`, la regola D-4 (la partizione «scaduta / mancante» con «almeno un tipo MEDICAL attivo»), le chiavi `ExpiriesPage.registry.category.*`, gli helper e2e `ensureValidSeedExpiries` e `registerFlightOn` (con `isSolo`). `listCurrencyByPerson` e `getMedicalRequirementFailure` non servono al registro (la SQL li rispecchia, D-15): la parità si prova sulla pagina Piloti.

**Censimento e2e §3.6 ripetuto** (`grep -rnE "scadenze-stat-|scadenze-row|scadenze-widget|mobile-overview-alert|/api/v1/expiries|expiries/pdf" e2e` più gli spec che chiamano `ensureValidSeedExpiries`): oltre ai punti della story è emerso **`expiry-rules-currency.spec.ts:322`** (19.7a: `window=all&personQuery=<persona>` con `toHaveCount(1)` — la persona ha ora anche la sua currency e la visita «Mancante»), ristretto con `category=MEMBERSHIP` (§G D-g). Nessun altro spec conta righe del registro senza `expiryTypeId`.

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 | ✅ | Unit `expiries.service.test.ts` (riscritti su `$queryRaw`): quattro rami dell'unione, soggetti currency senza istruttore e membri con istruttore, gemella SQL di `computeCurrency` (due sedili, `isSolo = false` e `<>` sul ramo istruttore, X e Y legati dalle impostazioni, `today` come stringa), parametri legati per ogni filtro (`category` ×4, `expiryTypeId`, `scope`, `personId`, `personQuery` `50%_x\` → `%50\%\_x\\%` con `ESCAPE '\'`, `window` ×4 con le `NULL`, `status` ×4 incluso `missing`, AND e precedenza della finestra), mappatura documento / currency con e senza data / quota «Mancante» / visita «Mancante» (validata anche contro `expiryDashboardItemSchema`), `getCurrencySettings` letto una volta, «oggi» di Roma con fake timer alle 23:30Z del 14/03 → `2026-03-15`, ieri `2026-03-14`, `daysUntil 0`. |
| 2 | ✅ | Unit: una sola query `COUNT(*) FILTER`, `expired` = `IS NULL OR < oggi`. Sonda §D su DB demo: contatori della pagina 14/0/5/2 = conteggio a mano, sottotitolo «21 da gestire» = somma. Nessun e2e confronta un contatore globale per uguaglianza (AC 11). |
| 3 | ✅ | e2e `expiries-registry.spec.ts` «currency rows in every view» (fixture 19.7a AC 15 + solista G/H): vista `window=all` = 20 righe di pagina 1 con documenti, currency e «Mancante» insieme, B prima di C prima di A; `category=CURRENCY` = A, B, C, D, F, G, H con celle esatte (A `oggi`/«0 g»/«≤ 7 giorni»/«1 volo negli ultimi 90 giorni»; B ieri/«1g fa»/«Scaduto»; C e G «—»/«—»/«Mancante»; D +80 «Valido»; H +70), E assente; `window=expired` B e C sì, A e D no; finestra predefinita A sì, D no; 375 px card e sheet di A («Ambito» e «Note» = «—»); **stessi A-D, G, H sulla pagina Piloti** con i badge della 19.7a AC 15. Sonde §E (a) e (c). |
| 4 | ✅ | e2e «membership fee in the registry»: F quota addebitata → documento con la data restituita dall'addebito, «Valido»; G istruttore → «Mancante», data e giorni «—»; H archiviata e I senza profili → nessuna riga; `category=MEMBERSHIP` e `expiryTypeId=<tipo quota>` → le sole due righe quota. |
| 5 | ✅ | e2e «medical visits in the registry»: J → una riga «Visita medica / Visita medica / — / — / Mancante»; K (sola classe 2 scaduta) → la sua riga «Scaduto» e nient'altro; L (visita valida) → solo il documento; `expiryTypeId=<classe 2>` → K e L, non J. Unit: la guardia `EXISTS (… "kind" = 'MEDICAL' AND "isActive")` sul ramo; sonda SQL reale §E (nessun tipo attivo → 3 → 0 righe). Sonda §E (d). |
| 6 | ✅ | Unit `overview-alerts.test.ts` (+3: rango scaduto e peso −1 fra una scaduta da 10 giorni e una in scadenza, tie con «scaduta ieri», mai saltata, tetto che nasconde le «Mancante» dopo i documenti più vecchi); `registryTierOf` unit (`expiry-status.test.ts`); widget: helper puro condiviso + verifica UI (scelta motivata in §G D-e) — screenshot widget «7g» con «Volante Piero · Currency · Mancante» in rosso. `mobile-overview.spec.ts:416-447` verde 3/3 col locator ristretto. |
| 7 | ✅ | Unit `exports.service.test.ts` (+3: xlsx IT/EN e PDF con currency, quota e visita «Mancante»: tipo = categoria, ambito «—», scadenza «—», «Mancante»/«Missing», rosso `#9F2F2D`); e2e: xlsx di `category=CURRENCY&personQuery=<suffisso>` = A, B, C, D, F, G, H e nessun documento; `export-menu-xls`/`-pdf` con `category=CURRENCY`. |
| 8 | ✅ | e2e: item di A `{ id: currency:<A>, source: DERIVED, category: CURRENCY, expiryTypeId: null, typeName: null, expiresAt: oggi, status: expiring, daysUntil: 0, currency: { lastFlightDate: oggi−90, flightsInWindow: 1, minFlights: 1, windowDays: 90 } }`, totale 7; `status=missing` → solo righe senza data; `PATCH /api/v1/expiries/currency:<A>` → 404; pilota → 403 già provato da `expiry-dashboard.spec.ts:189` (§G D-k). OpenAPI: descrizioni di `GET /expiries`, `/pdf`, `PATCH`, `DELETE` aggiornate, schemi nuovi `registryStatusSchema`/`registryCategorySchema`, item con `source`, `category` a 4, campi nullabili, `currency`; `registry.test.ts` verde senza path nuovi. |
| 9 | ✅ | e2e desktop: `scadenze-filter-category` naviga con `category=…`, «Visite mediche» offre solo visite (letto dopo la pagina, inattivi inclusi, contro le corse), cambiare categoria toglie `expiryTypeId`, «Currency» toglie il select dei tipi, export presente in ogni vista; e2e 375: categoria + ricerca digitata in **una** navigazione, «Filtri (1)», «Filtri (2)» con il tipo, «Azzera filtri» toglie la categoria. `mobile-expiries-movements.spec.ts:333` (budget testata) verde nelle serie. |
| 10 | ✅ | e2e su `/en/dashboard/expiries`: A «Currency / 1 flight in the last 90 days / 02/11/2026 / 0 d / ≤ 7 days», C «0 flights … / — / — / Missing». |
| 11 | ✅ | `expiry-dashboard.spec.ts:144` riscritto a **forbice** (non filtrato → filtrato → non filtrato, il filtrato uguale a uno dei due, `> 0` sul primo) dentro `toPass`; resta nel project parallelo (§G D-j). 3 run mirati consecutivi `--retries=0` insieme a `mobile-overview` e allo spec nuovo che crea persone: 27/27 ×3. |
| 12 | ✅ | `mobile-overview.spec.ts:442` → `filter({ hasText: pilot.lastName }).filter({ hasText: '· <tipo registrato>' })`: 3/3 (stessi run di AC 11). |
| 13 | ✅ | `ensureValidSeedExpiries` filtra `source === 'DOCUMENT'` (AD-5); i 21 spec che lo usano nella serie 2: verdi. |
| 14 | ✅ | §C: `airmanager_load` in `BEGIN READ ONLY`, (a) 150-170 ms, (b) 163-176 ms, (c) 128-140 ms, (d) 122-134 ms — tutte ≤ 300 ms. (e) totali 11 141 e 19 061 contro i tetti: TD 19.7b-a. |
| 15 | ✅ | 12 chiavi per lingua (1653 → 1665), parità 0/0, tutte lette (`expiries/page.tsx`, `dashboard/page.tsx`, `exports.service.ts` per `registry.category.*` e `registry.status.missing`). |
| 16 | ✅ | `npm run gates` verde (§I); suite intera con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run`: 76 file / 1966 test. |
| 17 | ⏳ arbitro | Serie mirate verdi (§F). Arbitro completo su DB fresco alla sessione principale: **delta atteso 549 → 555** (+6 dello spec nuovo, nessun test rimosso; `npx playwright test --list` → «Total: 555 tests in 65 files»). |
| 18 | ✅ | `grep -rn "expiresAtRangeFor\|DASHBOARD_SELECT\|toDashboardItem" src` → nessun risultato. |
| 19 | ✅ | §H. |

### §C — Guardia di prestazioni (AC 14): database, adattamenti, piani, tempi, totali vs tetti

- **Database**: `SELECT current_database(), current_setting('transaction_read_only')` → `airmanager_load|on`, ogni misura dentro `BEGIN READ ONLY; … EXPLAIN (ANALYZE, BUFFERS) <SELECT>; ROLLBACK;` (docker exec, `psql -At`). Nessuna scrittura, nessun indice, nessuna migrazione su quel DB. Volumi: 5 007 persone, 60 487 voli, 13 612 `Expiry`, 4 044 soggetti currency, 4 364 membri.
- **SQL misurata** = quella emessa dal service: generata dal codice (`listAllExpiries`/`getExpiryTierCounts` con `$queryRaw` mockato in un test temporaneo, `?` sostituiti dai valori legati, oggi `2026-11-02`, X=1, Y=90), poi un solo adattamento letterale perché lo schema di `airmanager_load` precede la 19.7a: `"kind" = 'MEMBERSHIP'` → `"name" = 'Quota associativa'` (l'enum lì è `{RATING,MEDICAL}`). Su quel DB restano righe Licenza e la colonna `Flight.status`: contate come righe (la volumetria è quella che conta).
- **Tempi** (`Execution Time`, tre giri a caldo, poi un quarto per i piani salvati):

| Query | Giri | Righe |
|---|---|---|
| (a) vista predefinita `window=60`, pagina 1 (righe + totale in **una** query, `COUNT(*) OVER ()`) | 154.7 / 149.7 / 167.3 / 170.2 ms | totale 11 141 |
| (b) `window=all`, pagina 1 | 166.0 / 168.2 / 175.6 / 163.0 ms | totale 19 061 |
| (c) contatori (una `COUNT … FILTER`) | 130.1 / 127.6 / 139.9 / 136.1 ms | — |
| (d) `category=CURRENCY`, pagina 1 | 133.7 / 128.3 / 121.8 / 133.7 ms | totale 4 044 |

  **Soglia 300 ms: rispettata da tutte.** Il JIT del server pesa ~45 ms di ogni giro (stima di costo sopra `jit_above_cost`); non toccato.
- **Piano** (a): `Bitmap Index Scan on "Expiry_expiresAt_idx"` per i documenti; la currency è un `HashAggregate` sui 74 091 posti a bordo (`Seq Scan on "Flight"` 60 487 + `Index Scan using "Flight_instructorProfileId_idx"` 13 605) seguito da un sort per persona dell'array (4 590 gruppi) e un `Hash Left Join` sui 4 044 soggetti; `top-N heapsort` finale per la chiave D-20.
- **Forma scelta misurando** (prima della UI, T2): la forma di riferimento di AD-1 (`UNION` + `ROW_NUMBER()` su tutti i posti) misurava 358 ms a freddo e 250 ms a caldo sulla pagina 1; `UNION ALL` con `ip."personId" <> f."personId"` (equivalente, §G D-b) 219 ms; aggregazione senza il join coi soggetti 203 ms; X-esima data presa dall'array aggregato per persona (`HashAggregate` al posto del sort globale di 74 000 cuid su collation) **145 ms**. Nessun bisogno di `LATERAL` né di indici nuovi.
- **(e) Totali contro i tetti**: (a) 11 141 > 2 000 (PDF) **e > 10 000 (xlsx)**; (b) 19 061 > entrambi. Prima della story la vista predefinita aveva 5 692 righe (xlsx sotto il tetto) e «Tutte» 13 612 (xlsx già sopra). Su un club da 5 000 persone l'export della vista predefinita risponde quindi `EXPORT_TOO_LARGE` finché non si restringe un filtro: comportamento esistente del tetto, tetti invariati per §6 — **TD 19.7b-a** da decidere col PO.

### §D — Sonda dei contatori (AC 2) e righe derivate del DB demo (§3.4)

Gemello `airmanager_demo197b` = `migrate deploy` + `db seed` + `seed:demo` su HEAD; build di produzione della story su :3000. SQL a mano, scritta **indipendentemente** dal frammento del service (la currency con `UNION` + `ROW_NUMBER()`, la forma TS della 19.7a; soggetti e membri con `IN` sui profili attivi; oggi `2026-11-02`, X=1, Y=90):

```sql
WITH subj AS (SELECT p.id FROM "Person" p WHERE p."archivedAt" IS NULL AND (p.id IN (SELECT "personId" FROM "PilotProfile" WHERE "deactivatedAt" IS NULL) OR p.id IN (SELECT "personId" FROM "StudentProfile" WHERE "deactivatedAt" IS NULL))),
memb AS (… + OR p.id IN (SELECT "personId" FROM "InstructorProfile" WHERE "deactivatedAt" IS NULL)),
seats AS (SELECT f.id, f."personId" pid, f."flightDate" d FROM "Flight" f WHERE f."flightDate" <= '2026-11-02'
          UNION SELECT f.id, ip."personId", f."flightDate" FROM "Flight" f JOIN "InstructorProfile" ip ON ip.id = f."instructorProfileId" WHERE NOT f."isSolo" AND f."flightDate" <= '2026-11-02'),
nth AS (SELECT pid, d FROM (SELECT pid, d, ROW_NUMBER() OVER (PARTITION BY pid ORDER BY d DESC, id DESC) rn FROM seats) x WHERE rn = 1),
cur AS (SELECT s.id, n.d + 90 exp FROM subj s LEFT JOIN nth n ON n.pid = s.id),
fee_missing AS (SELECT m.id FROM memb m WHERE NOT EXISTS (SELECT 1 FROM "Expiry" e JOIN "ExpiryType" t ON t.id = e."expiryTypeId" WHERE e."personId" = m.id AND t.kind = 'MEMBERSHIP')),
visit_missing AS (SELECT m.id FROM memb m WHERE EXISTS (SELECT 1 FROM "ExpiryType" WHERE kind = 'MEDICAL' AND "isActive") AND NOT EXISTS (SELECT 1 FROM "Expiry" e JOIN "ExpiryType" t ON t.id = e."expiryTypeId" WHERE e."personId" = m.id AND t.kind = 'MEDICAL'))
SELECT src, count(*) FILTER (WHERE exp IS NULL OR exp < :today) expired, … w7, w30, w60, beyond, missing, total
FROM (documents ∪ cur ∪ fee_missing ∪ visit_missing) GROUP BY ROLLUP (src);
```

| sorgente | scaduti | ≤ 7 | ≤ 30 | ≤ 60 | oltre | di cui «Mancante» | totale |
|---|---|---|---|---|---|---|---|
| documenti | 4 | 0 | 4 | 2 | 13 | 0 | 23 |
| currency | 2 | 0 | 1 | 0 | 6 | 2 | 9 |
| quota mai pagata | 5 | 0 | 0 | 0 | 0 | 5 | 5 |
| visita mancante | 3 | 0 | 0 | 0 | 0 | 3 | 3 |
| **totale** | **14** | **0** | **5** | **2** | 19 | 10 | 40 |

Pagina (playwright-core, build di produzione): `scadenze-stat-*` = **14 / 0 / 5 / 2** = il conteggio a mano; sottotitolo «Scadenze certificati e Ratings · **21** da gestire» = 14 + 0 + 5 + 2. **Righe derivate del demo** (effetto atteso di B): 9 currency (Volante Piero e Allieva Sara «Mancante», Colombo Stefano a 26 giorni, sei oltre i 60), 5 quote mai pagate (Volante, Istruttrice Ines, Allieva Sara, Rinaldi, Colombo), 3 visite mancanti (Volante, Istruttrice Ines, Allieva Sara) — i tre soggetti del seed base senza visite. Ordine della vista predefinita (D-20): i quattro documenti scaduti dal più vecchio (−63, −33, −10, −2 giorni), poi le dieci «Mancante», poi i documenti e la currency in scadenza.

### §E — Sonde e discriminanze §4.3 (a)-(d)

Mutanti del service costruiti e serviti su :3000 contro il gemello e2e, uno per volta per (c2) e insieme per (a)+(b)+(d) (toccano test diversi); ripristino con sha256 verificato (`expiries.service.ts` `56cb7b0d…18d8`, spec `9f83240d…02ab` e `9c234c2d…5569`), build reale ricostruita e serie di controllo verde (19 passed).

- **(a) Ordinamento D-20** — `ORDER BY r."expiresAt" ASC NULLS FIRST` al posto di `COALESCE(…, ieri)`: AC 3 **rosso** a `expiries-registry.spec.ts:167` (`indexOf(b) < indexOf(c)`: C, «Mancante», all'indice 0; B all'11). Con la chiave D-20: verde.
- **(b) Escape di `personQuery`** — build della story: `personQuery=%` → `total 0`, `_` → 0; mutante senza `escapeLikePattern`: `%` → **2 832**, `_` → **2 832** = il totale non filtrato 2 832.
- **(c) Parità SQL/TS (D-15)** — (c1) mutante dello **spec** (A a oggi−91, B spostato a −92 per non sovrapporsi): **entrambi rossi** — registro (SQL) a `expiries-registry.spec.ts:168` (A ora scaduta ieri finisce prima di C) e 19.7a AC 15 (Piloti, TS) a `expiry-rules-currency.spec.ts:414` `Expected "Currency 0gg" / Received "Non current"`. (c2) mutante della **SQL** `c."xthFlightDate" + Y - 1`: **solo** il registro rosso (`:168`), la 19.7a AC 15 **verde** — l'e2e del registro sorveglia l'implementazione SQL.
- **(d) Doppioni medici (D-22)** — ramo «visita mancante» scritto su «nessuna visita **valida**» (`AND x."expiresAt" >= oggi`): AC 5 **rosso** a `:354`, K ha una seconda riga `Visita medica / — / — / Mancante`.
- **Requisito spento** (Q-19.7-c) — sul gemello demo, in una transazione poi annullata: righe «visita mancante» 3; `UPDATE "ExpiryType" SET "isActive" = false WHERE "kind" = 'MEDICAL'` → **0** (quote 5 e currency 9 invariate); `ROLLBACK`.

### §F — Delta test (unit ed e2e, prima/dopo)

**Unit**: HEAD `f4c1e6a` 1943 → **1966** (+23): `expiries.service.test.ts` 78 → 90 (blocchi `listAllExpiries`/`getExpiryTierCounts` riscritti su `$queryRaw`), `exports.service.test.ts` 30 → 33, `overview-alerts.test.ts` 14 → 17, `expiry-status.test.ts` 13 → 15, `mobile-expiries.test.ts` 7 → 10. `people.service.test.ts` invariato nel numero (solo il mock della catena env, §G D-f). Nessun test eliminato senza sostituto: quelli che asserivano il `where` Prisma ora asseriscono il frammento SQL equivalente.

**e2e** (gemello `airmanager_e2e197b` = `migrate deploy` + `db seed` su HEAD, build di produzione una volta, `E2E_REUSE_SERVER=1 scripts/e2e.sh`, `CI=1` → retries 2 salvo dove detto):
1. spec nuovo da solo: 6/6 (un primo giro rosso per un errore dello spec — `window=all` passato all'API, che non lo accetta: «Tutte» è l'assenza del filtro — corretto);
2. serie `--project=chromium` su 33 spec (lo spec nuovo, i 20 che usano `ensureValidSeedExpiries`, i consumatori del registro: home-dashboard, mobile-ink-targets, mobile-expiries-movements, expiry-dashboard, expiry-registration, expiry-types, expiry-alerts, membership-fee, mobile-registries, mobile-overview, bookings, mobile-a11y-sweep, mobile-shell): **352 passed, 1 flaky** (`flights.spec.ts:1027` E5, il flaky noto TD 16.2-g, spec non toccato), 8.5 min;
3. catena serializzata con `--no-deps --workers=1` (reports, mobile-metar, mobile-membership-fee, mobile-settings) sullo stesso DB: 22 passed;
4. AC 11/12: `expiry-dashboard` + `mobile-overview` + spec nuovo, `--retries=0`, tre volte di fila: 27/27, 27/27, 27/27;
5. dopo le sonde, build reale ricostruita: spec nuovo + `expiry-rules-currency` + `expiry-dashboard` 19 passed.

Test e2e nuovi: `e2e/expiries-registry.spec.ts` (6). Cambiati: `expiry-dashboard.spec.ts` (1 test, AC 11), `mobile-overview.spec.ts` (1 test, AC 12), `expiry-rules-currency.spec.ts` (1 test, URL), `helpers.ts` (`ensureValidSeedExpiries`). **Delta arbitro atteso: 549 → 555.**

### §G — Deviazioni motivate

- **D-a (AD-1, lista + totale)** — l'alternativa che AD-1 consente: righe e totale nella **stessa** query con `COUNT(*) OVER ()`; solo una pagina oltre la fine (nessuna riga che porti il totale) esegue un conteggio a parte con gli stessi filtri. Niente transazione interattiva: una query sola nel caso normale (misurato: il `WindowAgg` costa ~1 ms in più della pagina sola).
- **D-b (AD-1, forma della currency)** — invece di `UNION` + `ROW_NUMBER()`: `UNION ALL` con `ip."personId" <> f."personId"` sul ramo istruttore (le sole coppie (volo, persona) che `UNION` potrebbe fondere sono quelle in cui il pilota è anche l'istruttore del volo — vietato dal service, `INSTRUCTOR_SAME_AS_PILOT` —, così l'equivalenza col `UNION` della TS vale per costruzione) e l'X-esima data presa per persona dall'array aggregato (`unnest(array_agg(…)) ORDER BY d DESC OFFSET X−1 LIMIT 1`). Stessa semantica di D-6/D-7 della 19.7a (più F2), misurata 358/250 → 145 ms (§C) e sorvegliata dalla parità e2e (§E c).
- **D-c (AD-3, card mobile)** — la card nomina una riga senza tipo con la sua **categoria** («Currency · 02/11/2026 · 0 g», «Visita medica»), non col dettaglio della currency: a 375 px «3 voli negli ultimi 90 giorni» riempiva da solo la riga e l'ellissi mangiava la data (misurato sul demo). Il dettaglio resta nella colonna «Certificato» della tabella e nella sovrariga dello sheet («Currency · 1 volo negli ultimi 90 giorni»).
- **D-d (AD-3, tono del badge Currency)** — neutro (`''`, come la quota): l'unico tono libero è `ok`, e un «Currency» verde accanto a uno stato rosso si leggerebbe «current»; una categoria è una classificazione, mai uno stato (skill `ui-ux-pro-max`: colore mai unico portatore di significato).
- **D-e (AD-4/AC 6, widget)** — `registryTierOf(daysUntil | null)` in `src/lib/expiry-status.ts` (puro, unit) usato da tabella, card, sheet, widget e Avvisi, invece di ripetere `null → tier 0` in cinque punti; il widget non ha un helper estratto in più: la sua sola logica nuova è `daysUntil === null ||` nel filtro della finestra, provata dalla verifica UI (screenshot «7g» con le due currency «Mancante» rosse).
- **D-f (§3.7)** — `people.service.test.ts` mocka `./app-settings.service`: `people.service.ts` importa `expiries.service.ts`, che ora trascina la catena env (rosso con `env -u DATABASE_URL -u AUTH_SECRET` senza il mock). Fuori dall'elenco di §3.7, stessa causa.
- **D-g (§3.6)** — `expiry-rules-currency.spec.ts:322` (test 19.7a del badge quota) ristretto con `category=MEMBERSHIP`: la persona di fixture ha ora anche la currency e la visita «Mancante».
- **D-h (AD-4)** — `OverviewAlertExpiry` riceve `category` (il chiamante nomina con essa la riga senza tipo nel titolo dell'avviso: «Volante Piero · Currency»).
- **D-i (AC 3)** — fixture estesa con F (allievo di D), G (pilota+istruttore il cui unico volo è il **solista** supervisionato di H) e H: `category=CURRENCY` mostra A, B, C, D, F, G, H (E assente), G «Mancante» anche nel registro (F2 della 19.7a nella SQL).
- **D-j (AC 11)** — scelta la forbice, non la catena serializzata: lo spec resta nel project parallelo (nessuna scrittura di settings), e la forbice è dentro `toPass` (20 s) per il caso improbabile di due cambi concorrenti nella stessa forbice; verde 3/3 con `--retries=0` accanto a uno spec che crea persone.
- **D-k (AC 8)** — «pilota → 403» non duplicato: `expiry-dashboard.spec.ts:189` lo asserisce già (verde nelle serie).
- **D-l (AC 3)** — l'etichetta dei giorni a zero è «0 g» (il suffisso esistente `registry.daysSuffix` è « g»), non «0g» come scritto nell'AC.

**TD aperti**
- **TD 19.7b-a** (→ **epic 17, story 17.7**; totali rimisurati dopo il fix nel Review Record) — tetti degli export: con 5 000 persone la vista predefinita conta 11 141 righe (§C e) e l'export risponde `EXPORT_TOO_LARGE` sia in xlsx (10 000) sia in PDF (2 000) finché non si restringe un filtro; prima della story l'xlsx della vista predefinita (5 692) passava. Tetti invariati per §6: da decidere (alzare il tetto xlsx, oppure esportare i soli documenti nella vista predefinita).
- ~~**TD 19.7b-b**~~ — **decaduto** (2026-11-02): la riga «quota mai pagata» non esiste più (Q-19.7-b ribaltata), quindi nessuna riga dipende dall'esistenza del tipo `MEMBERSHIP`. Era: su un'installazione senza seed (il tipo nasce al primo addebito, 19.7a F4) nessuno compariva «Mancante» prima del primo addebito.
- **TD 19.7b-c** — la pagina Scadenze calcola l'unione due volte per caricamento (righe+totale, contatori): 170 + 136 ms sul DB di carico, sotto soglia; fondibili in una query se il volume crescesse.
- **TD 19.7b-d** — testata desktop della card: 106.8 px a 1280 (due righe, come prima) e 149.8 px a 1024 (tre righe) col select Categoria in più; nessun trabocco orizzontale.

### §H — Verifica UI (screenshot)

Script throwaway `playwright-core` su Chromium locale (`~/.cache/ms-playwright/chromium-1228`, nessun Playwright MCP su questa macchina) contro la build di produzione su gemello demo; screenshot e script in `scratchpad/s197b/shots/`.
- **Registro 1280 chiaro e scuro, vista predefinita**: documenti scaduti, dieci «Mancante» (badge Currency/Visita medica/Quota associativa, «—» in data e giorni, «Mancante» rosso col punto), poi i documenti e la currency in scadenza; tinta e inchiostro del tier 0 sulle «Mancante»; paginazione 1 / 2 (21 righe). Badge di categoria interi nella colonna da 132 px a 1280 e 1024 (`badgesFit: true`), nessun overflow orizzontale.
- **Viste Currency, Quota associativa, Visite mediche** a 1280 e 375: «Currency» con il dettaglio ICU («0 voli / 2 voli / 3 voli negli ultimi 90 giorni»), select dei tipi assente con Currency.
- **375**: card currency (`Currency · data · giorni`, «Mancante» per chi non ha voli), sheet di una «Mancante» (`CURRENCY · 0 VOLI NEGLI ULTIMI 90 GIORNI`, Scadenza/Giorni/Ambito/Note «—», Stato «Mancante») e di Colombo Stefano (28/11/2026, 26 g, ≤ 30 giorni); pannello Filtri aperto con Categoria e Tipo (44 px), «Filtri (1)» con la sola categoria.
- **Panoramica**: widget desktop «7g» → 14 voci, le due currency «Mancante» rosse dopo i documenti scaduti; Avvisi mobile: i quattro documenti scaduti, poi «Volante Piero · Currency — Mancante».
- **EN** (e2e): «1 flight in the last 90 days», «Missing», «≤ 7 days».

### §I — Gate ed esiti verbatim

```
$ npm run gates
PASS  lint (24s)
PASS  typecheck (3s)
PASS  test (9s) — Tests  1966 passed (1966)
PASS  build (30s)
$ env -u DATABASE_URL -u AUTH_SECRET npx vitest run
 Test Files  76 passed (76)
      Tests  1966 passed (1966)
$ grep -rn "expiresAtRangeFor\|DASHBOARD_SELECT\|toDashboardItem" src
(nessun risultato)
$ npx playwright test --list | tail -1
Total: 555 tests in 65 files
```

Gemelli `airmanager_e2e197b` e `airmanager_demo197b` **eliminati**; `airmanager` mai scritto, `airmanager_load` solo letto in `BEGIN READ ONLY`. Server fermati per PID, :3000 libera; `scripts/e2e.sh status` = DONE `E2E_EXIT=0`. `.next` = build dei gate sul contenuto committato. Il container `wonderful_curie` (Playwright) trovato attivo non è di questa sessione: lasciato com'era.

### Completion Notes List

- Registro unificato in SQL grezzo sopra un solo frammento (`registryRowsSql`): documenti ∪ currency (gemella SQL di `computeCurrency`, con F2) ∪ quota mai pagata ∪ visita mancante (D-22); lista + totale in una query (`COUNT(*) OVER ()`), contatori in una `COUNT … FILTER`; filtri legati con `Prisma.sql`, `personQuery` escapato; un solo «oggi» di Roma; ordinamento D-20.
- DTO e OpenAPI: `source`, `category` a 4, campi nullabili, `status: missing`, `currency`; query `category` e `status=missing`.
- UI: filtro Categoria (desktop e pannello mobile), select dei tipi limitato alla categoria e assente per la currency, export con la categoria, righe «Mancante» col tier 0, dettaglio currency risolto nel server; widget e Avvisi della Panoramica, export xlsx/PDF con le righe derivate.
- e2e: spec nuovo (6 test), tre spec a rischio riscritti/ristretti, helper AD-5. Prestazioni sotto soglia senza indici nuovi.

### File List

Nuovi:
- `e2e/expiries-registry.spec.ts`

Modificati:
- `src/server/services/expiries.service.ts`, `src/server/services/expiries.service.test.ts`
- `src/server/services/exports.service.ts`, `src/server/services/exports.service.test.ts`
- `src/server/services/people.service.test.ts`
- `src/lib/schemas/expiries.ts`, `src/lib/schemas/registry.ts`
- `src/lib/expiry-status.ts`, `src/lib/expiry-status.test.ts`
- `src/lib/mobile-expiries.ts`, `src/lib/mobile-expiries.test.ts`
- `src/lib/overview-alerts.ts`, `src/lib/overview-alerts.test.ts`
- `src/app/[locale]/dashboard/expiries/page.tsx`, `src/app/[locale]/dashboard/expiries/scadenze-console.tsx`
- `src/app/[locale]/dashboard/page.tsx`, `src/components/dashboard/scadenze-widget.tsx`
- `messages/it.json`, `messages/en.json`
- `e2e/helpers.ts`, `e2e/expiry-dashboard.spec.ts`, `e2e/mobile-overview.spec.ts`, `e2e/expiry-rules-currency.spec.ts`
- `_bmad-output/implementation-artifacts/19-7b-registro-scadenze-unificato.md` (questo record, Status → review)

### Change Log

- 2026-11-02 — `450a0f6` feat(19.7b): implementazione completa (19 AC); questo commit docs: Dev Agent Record e Status → review.
- 2026-11-02 — `0f338e1` fix(19.7b): decisione PO (Q-19.7-b/c ribaltate, nessuna riga «Mancante») + review F1/F2; docs: Review Record, report di review, addendum CR. Status resta review.

---

## Review Record

### Review

- **Reviewer**: `review-19-7b` (Opus 5.5), report `19-7b-review-report.md` (committato con questo record). Commit sotto review `450a0f6` + `cb06ff2`.
- **Verdetto**: **SHIPPABLE** — arbitro completo su DB fresco **553 passed + 2 flaky = 555, `E2E_EXIT=0`**; i 2 flaky (`settings.spec.ts:127`, `mobile-metar.spec.ts:61`) sono la classe METAR, fuori dalla story (TD sotto). Finding: F1 LOW, F2 LOW; decisioni PO: DP-1 (Panoramica «affamata» dalle derivate), DP-2 (tetti export).
- **Fix**: `fix-19-7b` (Opus 5.5), commit `0f338e1` su `cb06ff2`.

### Decisione PO del 2026-11-02 applicata (Q-19.7-b/c ribaltate — testo in testa al file)

| Punto | Prima (`450a0f6`) | Dopo (`0f338e1`) |
|---|---|---|
| SQL `registryRowsSql` | 4 rami: documenti ∪ currency di ogni soggetto (`LEFT JOIN`, `NULL` sotto X voli) ∪ quota mai pagata ∪ visita mancante; CTE `members` | 2 rami: documenti di persone non archiviate ∪ currency `JOIN "currency"` con `xthFlightDate IS NOT NULL`; `members` e i rami `membership:`/`medical:` tolti |
| Ordinamento | `COALESCE(expiresAt, ieri), id` (D-20) | `expiresAt, id` (D-20 superata: nessuna `NULL`) |
| Finestre, `Scaduti`, contatori | `expiresAt IS NULL OR …` | solo la data |
| DTO/OpenAPI | `status` con `missing`, `expiresAt`/`daysUntil`/`currency.lastFlightDate` nullabili, `registryStatusSchema` | `status = expiryStatusSchema` (`status=missing` → 422), i tre campi obbligatori; `source` e `category` a 4 restano (la currency è ancora `DERIVED`, `expiryTypeId`/`typeName`/`typeScope` restano nullabili per lei) |
| UI e consumatori | `registryTierOf(null) = 0`, «—» e «Mancante» in tabella/card/sheet, widget e Avvisi con il ramo `null`, export «—»/«Mancante» e rosso PDF dedicato | `registryTierOf` rimosso (tutti su `tierOf`), widget/Avvisi/console/export di nuovo su date sempre presenti; resta solo «la riga senza tipo è la currency» (`typeName ?? Currency`). `OverviewAlertExpiry.category` (D-h) tolto: serviva solo a distinguere currency e visita mancante |
| i18n | 1665 chiavi per lingua | **1662**: tolte `ExpiriesPage.registry.status.missing`, `DashboardPage.scadenzeWidget.{missing,medical}`; parità 0/0 |

Invariati per costruzione (nessun file toccato): check bloccanti di voli e prenotazioni (`bookings.service.ts`, `flights.service.ts`, 19.9/19.10), `getMedicalRequirementFailure`/`evaluateMedicalRequirement`, `listCurrencyByPerson`, badge «Non current» dei Piloti (l'e2e AC 3 lo asserisce ancora per C e G). Unica riga toccata fuori dal registro: il doc-comment di `src/lib/medical-requirement.ts`, che nominava il registro fra i giudici della regola D-4 (non lo è più).

### Finding

- **F1 (LOW) — corretto.** Ramo documenti `JOIN "Person" pd … WHERE pd."archivedAt" IS NULL`: un archiviato esce **intero** da lista, contatori, Panoramica, export e API (le derivate lo escludevano già). Guardie: unit `ONE query: documents ∪ dated currency rows` (frammento del ramo documenti) e `getExpiryTierCounts` (stesso frammento nei contatori), rossi sul pre-fix; e2e «membership fee» — H, pilota archiviato con una visita **scaduta** registrata prima dell'archiviazione: sul pre-fix la riga `H · Visita medica classe 2 · 03/10/2026 · Scaduto` compare nella vista (log rosso, sotto), sul fix la vista è esattamente la sola quota pagata di F.
  - **Tipi disattivati (TD-19.9-a, seconda metà) — rivalutato, NON applicato**: togliere le «Mancante» non rende sicuro il filtro, perché la trappola non stava solo nelle «Mancante»: i check leggono ancora i documenti dei tipi disattivati — `findBlockingExpiredDocuments` (`bookings.service.ts:486-498`) blocca su ogni rating scaduto con `blocksBooking` **senza** filtro `isActive`, e D-4 (`medical-requirement.ts`) è soddisfatta o fallita da visite di **qualsiasi** tipo, riportando come motivo la visita scaduta più recente anche se di un tipo spento — nasconderle dal registro nasconderebbe un blocco vivo. TD-19.9-a resta aperto per i tipi disattivati (casa da assegnare); la metà «archiviati» è chiusa qui.
- **F2 (LOW) — corretto.** `ExpiriesPage.registry.currency.detail`: IT `{count, plural, one {# volo} other {# voli}} {days, plural, one {nell'ultimo giorno} other {negli ultimi # giorni}}`, EN `… {days, plural, one {in the last day} other {in the last # days}}`. Deviazione dalla forma indicata (`{days, plural, one {# giorno} other {# giorni}}`): «negli ultimi 1 giorno» resta sgrammaticato (aggettivo plurale), la forma scelta no. Sonda `createTranslator` di next-intl: HEAD `0 voli negli ultimi 1 giorni` / `0 flights in the last 1 days`; fix `0 voli nell'ultimo giorno`, `1 volo nell'ultimo giorno`, `1 volo negli ultimi 90 giorni`, `3 voli negli ultimi 30 giorni` / `0 flights in the last day`, `1 flight in the last 90 days`. Risolto ancora nel server con `t(…)` (`expiries/page.tsx`), nessun `t.raw`; gli e2e (Y = 90) invariati.

### Decisioni PO della review

- **DP-1 (Panoramica affamata) — risolta dalla decisione PO.** Sonda sul gemello demo (`seed` + `seed:demo`, build del fix): Avvisi a 375 px = `Marchetti · Rating SEP · 63g fa`, `Greco · Rating SEP · 33g fa`, `Colombo · Visita medica classe 2 · 10g fa`, `Romano · Inglese ICAO · 2g fa`, **`Marchetti Davide · Saldo -94,25 €`** (+7 altri) — il saldo negativo è di nuovo nel feed; widget desktop 30 g = i 4 documenti scaduti + **`Esposito · Visita medica classe 2 · tra 12g`** e **`Rinaldi · Visita medica classe 1 · tra 20g`** (prima del fix le tre finestre mostravano le stesse 6 righe). Nessun testo «Mancante» in pagina.
- **DP-2 → TD 19.7b-a, assegnato all'epic 17 (story 17.7).** Totali rimisurati sul DB di carico dopo il fix: vista predefinita **9 411** (prima 11 141; sotto il tetto xlsx 10 000, sopra il PDF 2 000), «Tutte» **16 946** (prima 19 061; sopra entrambi).

### TD registrati

- **TD 19.7b-e (priorità ALTA, fuori perimetro)** — METAR senza timeout: `getMetar` (`src/server/services/metar.service.ts` ~111) fa `fetch` verso aviationweather.gov senza `AbortSignal.timeout`, e `dashboard/layout.tsx` (~94) lo attende: una stazione inesistente risponde in ~16 s (misura del reviewer: `LIQZ` 16,13 s contro 0,28 s di `LIRF`) e blocca il render della Panoramica oltre i 5 s del login degli e2e. È la causa dei 2 flaky dell'arbitro (classe METAR); colpisce anche un utente reale dopo un ICAO sbagliato nelle impostazioni.
- **TD 19.7b-a** → epic 17, story 17.7 (sopra).
- **TD 19.7b-b** — decaduto (nessuna riga dipende più dal tipo `MEMBERSHIP`).
- **TD 19.7b-c** — invariato nella sostanza, tempi più bassi (sotto).
- **TD-19.9-a** — metà «archiviati» chiusa da F1; metà «tipi disattivati» aperta (motivo sopra).

### Prove

**Unit** — `npm run gates`: lint PASS, typecheck PASS, **test 1956/1956** PASS, build PASS. 1966 → 1956 (−10): `expiries.service.test.ts` 90 → 87 (tolti il ramo visita, `status=missing`, le tre mappature «Mancante»; aggiunti «nulla di derivato per ciò che manca» e lo schema senza righe senza data), `exports.service.test.ts` 33 → 33 (le tre derivate sostituite dalla riga currency datata: tipo «Currency», ambito «—», data, «In scadenza», `#956400`), `overview-alerts.test.ts` 17 → 14, `expiry-status.test.ts` 15 → 13, `mobile-expiries.test.ts` 10 → 8 (tolti i test del ramo `null`; resta quello del dettaglio currency nello sheet). **Pre-fix** (service e schema di `cb06ff2` rimessi in loco sotto i test nuovi, poi ripristinati con sha256 verificato): **12 rossi / 75** in `expiries.service.test.ts`. `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 6 file toccati: 246/246.

**e2e** (gemello `airmanager_fix197b` = `migrate deploy` + `db seed`, `next start` su :3000, `E2E_REUSE_SERVER=1 scripts/e2e.sh`):
1. **Pre-fix** (build di `cb06ff2`, spec nuovo, `--retries=0`): **4 failed, 2 passed** — `:160` (righe senza data nella vista di A-H), `:243` (`total` currency 7 ≠ 5), `:327` (quota: H archiviato con la sua visita scaduta, G «Mancante», F currency e visita «Mancante»), `:349` (J «Mancante»). I due test del filtro Categoria passano su entrambi (non dipendono dalle «Mancante»).
2. **Fix**, `--project=chromium` sui 16 spec che leggono il registro (`expiries-registry`, `expiry-alerts`, `expiry-rules-currency`, `expiry-types`, `expiry-dashboard`, `home-dashboard`, `membership-fee`, `mobile-ink-targets`, `mobile-expiries-movements`, `bookings`, `mobile-registries`, `expiry-registration`, `mobile-overview`, `people-management`, `mobile-reports`, `pdf-exports`): **178 passed**, 0 flaky, 4,0 min.
3. Catena serializzata `--project=mobile-metar --project=mobile-membership-fee --project=mobile-settings --no-deps --workers=1`: **17 passed**.
4. Spec nuovo `--repeat-each=3 --retries=0`: **18/18**.

Test e2e cambiati: `e2e/expiries-registry.spec.ts` (tutti e 6 adattati, nessuno aggiunto né tolto: C e G senza riga currency, nessuna riga senza data in ogni vista, `status=missing` → 422, M del test mobile con un volo per avere la sua currency, H archiviato con una visita); commenti allineati in `expiry-dashboard.spec.ts`, `expiry-rules-currency.spec.ts`, `mobile-overview.spec.ts`, `helpers.ts` (nessuna asserzione cambiata). **Delta arbitro atteso: 555 → 555** (`npx playwright test --list` → «Total: 555 tests in 65 files»).

**Contatori sul demo** (gemello `airmanager_fix197b_demo`, oggi 2026-11-02, X = 1, Y = 90): conteggio a mano con SQL indipendente (currency in forma `UNION` + `ROW_NUMBER()` con `JOIN` sui soggetti, documenti di non archiviati) — documenti 4/0/4/2 (23 righe), currency 0/0/1/0 (7 righe, nessuna senza data) → **4/0/5/2**; pagina: `scadenze-stat-*` = **4 / 0 / 5 / 2**, sottotitolo «Scadenze certificati e Ratings · **11** da gestire», 0 testi «Mancante», nessun overflow orizzontale a 1280 e a 375.

**Prestazioni** (`airmanager_load`, `BEGIN READ ONLY` → `airmanager_load|on`, solo `EXPLAIN`/`SELECT`, poi `ROLLBACK`; SQL generata dal codice del fix con `$queryRaw` mockato in un test temporaneo poi cancellato, nessun adattamento di letterali — il ramo `MEMBERSHIP` non c'è più): (a) vista predefinita pagina 1 + totale **126.7 / 132.3 / 135.1 ms** (prima 150-170); (c) contatori **98.4 / 105.8 / 112.3 ms** (prima 128-140). Macchina scarica (load 2,2 su 4 CPU, nessun e2e in corso).

**Verifica UI** (playwright-core, Chromium 1228, build del fix su :3001 contro il gemello demo; screenshot in `scratchpad/shots/`): registro 1280 chiaro e scuro (4 scaduti rossi, poi ≤ 30 e ≤ 60 giorni con la currency di Colombo a 26 g fra i documenti), vista Currency (7 righe datate, «3 voli negli ultimi 90 giorni»), Panoramica 1280 (widget) e 375 (Avvisi con il saldo), registro 375 (11 card, tutte con data e giorni).

### Stato della macchina

Gemelli `airmanager_fix197b` e `airmanager_fix197b_demo` **eliminati** (`pg_database` = `airmanager`, `airmanager_load`); `airmanager` mai toccato; `airmanager_load` solo letto. Server su :3000 e :3001 fermati per PID; `scripts/e2e.sh status` = DONE `E2E_EXIT=0` (l'ultima serie, `--repeat-each=3`). `.next` = build di `npm run gates` sul contenuto di `0f338e1`.

### Chiusura (sessione principale, 2026-11-02)

- **Decisione PO in review (DP-1)**: «dietro front, eliminiamo il "mancante": se manca la currency o la visita medica o i ratings etc non esce nulla sul widget e nella tabella delle scadenze». Applicazione della sessione principale: niente righe «Mancante» (quota mai pagata, visita assente, currency senza data) in registro, contatori, Panoramica, export, API; restano documenti registrati e currency con data reale (Q-19.7-a = B invariata); i check bloccanti 19.9/19.10 e il badge «Non current» non cambiano.
- **Arbitro finale**: DB `airmanager` resettato, `CI=1 scripts/e2e.sh start` su HEAD `c8c6db9`: **555 passed, 0 flaky, 0 failed, E2E_EXIT=0** (19,3 min).
- **TD 19.7b-e (alta priorità, fuori perimetro)**: `getMetar` senza timeout blocca la Panoramica fino a ~16 s quando aviationweather.gov è lento (causa dei 2 flaky METAR dell'arbitro del reviewer). TD 19.7b-a (tetti di export sul DB di carico) → 17.7.

