# Test di carico e performance — AirManager

**Data**: 2026-09-10 · **Sessione**: principale (Fable 5.1) · **Codice**: `dev` @ `b7b8d13` (chiusura AOG-1b in review) · **Macchina**: Fedora locale dell'utente, 4 CPU, Postgres 16 e Mailpit in Docker (`docker-compose.yml` del repo, configurazione Postgres di default).

Richiesta del PO: «create a plausible db seed with thousands users and planes and flights and transactions to test the app under a strong workload. After that seed test the app and find ways to improve the speed and usability».

## 0. In una pagina

- **Il seed c'è**: `prisma/seed-load.ts` (`npm run seed:load`), 3,2 minuti per 5 000 persone, 2 500 utenti, 1 500 velivoli, 60 000 voli, 40 000 prenotazioni, 105 000 movimenti conto, 31 000 movimenti cassa, 5 000 PPR, 13 600 scadenze. Tutti i controlli di coerenza a zero (§1.2). Gira SOLO su un DB che si dichiara esplicitamente (`LOAD_SEED_TARGET_DB`), quindi non può colpire il DB e2e per sbaglio. È stato eseguito su un DB separato `airmanager_load`, lasciato popolato.
- **Le API paginate reggono benissimo**: liste di persone, velivoli, voli, prenotazioni e scadenze rispondono in 15–50 ms con 60 000 voli e 111 000 movimenti. Login, sessione, calendario settimanale, scheda persona, flotta, piloti, registro voli: tutto sotto i 300 ms server-side e senza long task nel browser.
- **Quattro pagine NON reggono** e sono le pagine più importanti per l'admin: **Panoramica**, **Pianificazione**, **Contabilità**, **Statistiche**. La causa non è il database ma il fatto che rendono *tutto*: la timeline disegna una riga per ognuno dei 1 447 velivoli (43 000 nodi DOM, 2,6 MB di HTML, 7,9 s per diventare interattiva, scroll a 14 fps), Contabilità stampa tutti i 3 996 saldi negativi, Statistiche tutte le 1 374 righe di classifica.
- **A 10 utenti concorrenti l'app va in errore** su Panoramica, Statistiche e Contabilità: pool di 10 connessioni Postgres (default del driver), transazioni interattive anche nelle letture, 15 query in parallelo per ogni Panoramica → `P2028 Unable to start a transaction`. In più il container Postgres del repo ha 64 MB di `/dev/shm`: le query parallele di Statistiche muoiono con `could not resize shared memory segment` (HTTP 500 al 100 %) finché non si aggiunge `shm_size` al compose.
- **Gli export PDF sono lenti per costruzione** (react-pdf: 16–70 ms per riga): 40 s per 559 scadenze già sul DB piccolo; sotto carico i PDF di voli, prenotazioni e scadenze rispondono 422 (tetto 2 000 righe) — la funzione è di fatto inutilizzabile senza filtri stretti.
- Il piano d'azione ordinato per valore/costo è al §5: le prime quattro voci (cap alla timeline, saldi negativi aggregati, classifiche cappate, una query per le serie mensili) chiudono da sole il 90 % del problema e sono interventi da S a M.

## 1. Metodo

### 1.1 Ambiente e strumenti

| Elemento | Valore |
|---|---|
| App | build di produzione (`next build` + `next start`), Node 24, Next.js 16, Prisma 7.8 con `@prisma/adapter-pg` |
| DB di riferimento | `airmanager` (seed e2e + residui: 214 velivoli, 400 persone, 140 prenotazioni, 124 voli) — server su :3000 |
| DB di carico | `airmanager_load` (base seed + `seed-load.ts`) — server su :3001, stesso build |
| Postgres | 16 in Docker, **configurazione di default**: `shared_buffers` 128 MB, `work_mem` 4 MB, `effective_cache_size` 4 GB, `max_parallel_workers_per_gather` 2, **`/dev/shm` 64 MB** (default Docker, nessun `shm_size` nel compose) |
| Harness API/pagine | script `bench.mjs` (scratchpad di sessione): login Auth.js via `/api/auth/callback/credentials` come admin, per ogni target 1 richiesta di warm-up + **5 sequenziali** (p50/p95/max) + per i target marcati un **burst di 10 richieste parallele** (wall time, errori) |
| Query lente | `log_min_duration_statement = 100ms` sul container, aggregazione delle statement normalizzate per tempo totale |
| Browser | Chromium di Playwright, 1280×900 e 375×812: nodi DOM, `domInteractive`, long task (PerformanceObserver), fps di un campione di scroll di 600 ms |
| Piani | `EXPLAIN (ANALYZE, BUFFERS)` sul DB di carico, con e senza indice temporaneo e con `work_mem` 64 MB |

**Rumore dichiarato**: durante tutte le misure girava in parallelo sulla stessa macchina la review UI (un altro Chromium che faceva screenshot) e per parte del tempo gli audit di dominio. I valori assoluti sono quindi **pessimistici del 20–40 %**; l'ordine delle voci e gli ordini di grandezza sono robusti (due run a distanza di 15 minuti hanno dato lo stesso quadro).

### 1.2 Il seed di carico

`prisma/seed-load.ts` (nuovo, ~70 KB) + script `seed:load` in `package.json` (unica riga toccata in un file esistente). Additivo sul seed base (`prisma db seed` deve essere già passato). PRNG deterministico: due run producono gli stessi dati. `LOAD_SCALE` (default 1) moltiplica i volumi.

```
DATABASE_URL='postgresql://…/airmanager_load?schema=public' LOAD_SEED_TARGET_DB=airmanager_load npm run seed:load
```

| Modello | Righe | Note |
|---|---|---|
| Person | 5 007 | 3 000 piloti, 400 istruttori (60 anche piloti), 1 250 allievi, 250 archiviati |
| User | 2 507 | email prevedibili `load.pilot.0001@example.test`, `load.instructor.…`, `load.student.…`, `load.admin.000{1..3}`; UN solo hash password (= `SEED_ADMIN_PASSWORD`) |
| Aircraft | 1 501 | marche I-XXXX uniche, modelli plausibili, 92 % operativi / 5 % AOG (metà con `outOfServiceUntil`) / 3 % archiviati; AircraftRate 2 992, InstructorRate 400 |
| Flight | 60 487 | 36 mesi con stagionalità e fascia diurna; 493 correzioni, 1 200 annullati; contaore strettamente monotoni |
| Booking | 40 000 | 70 % passate in stati terminali coerenti coi voli, 30 % nei prossimi 60 giorni; ZERO sovrapposizioni APPROVED |
| AccountMovement | 104 612 | FLIGHT_CHARGE+REVERSAL 61 687, TOP_UP 25 000, ADJUSTMENT 14 925, PACKAGE_PURCHASE 3 000 |
| CashMovement | 31 421 | gemelli delle ricariche, PPR, compensi, spese |
| PprRequest | 5 000 | PprCounter coerente per anno |
| Expiry / SentAlert | 13 612 / 8 444 | mix valide/in scadenza/scadute |
| InstructorPayout / HourPackage | 2 254 / 3 000 | payout ≤ maturato per ogni istruttore |

Durata: **192 s**. Controlli SQL post-run, tutti a zero violazioni: nessuna coppia APPROVED sovrapposta sullo stesso velivolo; `hourMeterEnd == hourMeterStart + minuti` su ogni volo e contaore monotono per velivolo; ogni volo SCHOOL ha un istruttore; `PprCounter ≥ max` per anno; nessun User senza Person; marche uniche; payout ≤ maturato. `npm run lint` e `tsc --noEmit` puliti (zero warning nel file nuovo).

**Assunzioni del seed da ratificare** (dichiarate dal dev subagent, non deducibili dal codice):
1. AccountMovement a ~105 k invece dei ~150 k chiesti: ogni TOP_UP/PPR/payout ha un gemello CashMovement obbligato dallo schema, quindi alzare i TOP_UP avrebbe portato la cassa a 2–3× i 30 k richiesti; il resto è stato riempito con ADJUSTMENT. Volumi interni coerenti.
2. I voli ANNULLATI non riportano indietro il contaore (il servizio reale fa `max(0, corrente − minuti)`): a inserimento massivo la monotonia sarebbe dipesa dalla scelta degli annullati.
3. Le correzioni sono datate dopo l'ultimo volo del velivolo (più stretto di quanto `correctFlight` permetta).
4. HourPackage/PackageConsumption sono storici/decorativi: la consumazione pacchetti è stata ritirata dalla 12.13, non è stata reimplementata la logica morta.
5. `Person.email` e `User.email` sono due indirizzi diversi per la stessa persona di carico.
6. Finestra di prenotazione 07–20 e 60 giorni cablata nello script, NON scritta in `AppSetting`.
7. Tutto attribuito all'unico admin base come attore.
8. Ogni volo parte e arriva sul campo base.
9. La quota associativa pluriennale è rappresentata da più ADJUSTMENT su UN solo `Expiry` (vincolo unico persona+tipo).
10. Stagionalità e giorno della settimana calcolati in UTC, non in Europe/Rome (spostamento di un giorno possibile ai bordi DST — irrilevante per il carico).

## 2. Risultati

### 2.1 API (admin, p50 su 5 richieste; burst = 10 parallele)

| Endpoint | Baseline (DB piccolo) | Carico | Burst 10 al carico | Note |
|---|---|---|---|---|
| `GET /people?page=1` (4 757 attive) | 97 ms | **26 ms** | 256 ms, 0 err | paginato: regge |
| `GET /aircraft` (1 447) | 72 ms | **16 ms** | 107 ms, 0 err | idem |
| `GET /bookings` (7 141) | 119 ms | **42 ms** | 183 ms, 0 err | idem |
| `GET /flights` (60 487) | 122 ms | **42 ms** | 149 ms, 0 err | idem |
| `GET /expiries` (13 612) | 78 ms | **20 ms** | 111 ms, 0 err | idem |
| `GET /bookings/calendar` settimana (372) | 179 ms | 92 ms | — | 189 KB; `take: 1000` non paginato (v. ops-audit) |
| `GET /stats?period=month` | 233 ms | **754 ms** | 4,4 s, **10/10 errori** | run 1: 500 al 100 % (shm) |
| `GET /stats?period=year` | 277 ms | **2 086 ms** (cold 5,3 s) | — | carica 20 k righe di volo grezze |
| `GET /transactions` (111 033) | 123 ms | **463 ms** (cold 1,8 s) | — | COUNT con LEFT JOIN su 111 k |
| `GET /accounts/negative-balances` | 96 ms | 287 ms | — | **3 996 righe, 643 KB, nessuna paginazione** |
| `GET /instructor-compensation` (374) | 94 ms | 109 ms | — | 88 KB |
| `GET /ppr-requests/pdf` (478 righe) | 1,4 s (15 righe) | **3,5–7,7 s** | — | react-pdf |
| `GET /flights/pdf`, `/bookings/pdf`, `/expiries/pdf` | 13,7 s / 11,5 s / **40 s** | **422** (oltre 2 000 righe) | — | funzione non disponibile senza filtri |
| `GET /people/{id}/account/pdf` | 1,5 s | 0,7 s | — | |

### 2.2 Pagine (HTML server-side, admin)

| Pagina | Baseline | Carico p50 | HTML al carico | Burst 10 | Errori server |
|---|---|---|---|---|---|
| Panoramica `/dashboard` | 818 ms, 761 KB | 651 ms (run 1: **500**) | **2 634 KB** | 5,8 s | P2028 (run 1 e 2), 53100 (run 1) |
| Pianificazione `/bookings` | 710 ms, 629 KB | 270 ms (cold 8,3 s) | **2 584 KB** | 2,3 s | — |
| Contabilità `/billing` | 359 ms, 245 KB | **830 ms** | **2 131 KB** | 6,9 s | — |
| Statistiche `/reports` | 330 ms, 247 KB | **877 ms** (run 1: **500**) | 1 225 KB | 6,4 s, **10/10 errori** | P2028 |
| Istruttori | 311 ms | 169 ms | 858 KB | — | 374 istruttori con compensi |
| Flotta / Piloti / Registro voli / Scadenze / Movimenti / PPR / Scheda persona / Impostazioni | 250–600 ms | **110–300 ms** | 145–240 KB | 0,8–1,6 s, 0 err | paginati: reggono |

### 2.3 Browser (Chromium, DB di carico)

| Pagina | Larghezza | Nodi DOM | domInteractive | Long task (n / totale) | Scroll |
|---|---|---|---|---|---|
| Panoramica | 1280 | **43 417** | **7 917 ms** | 19 / **5 724 ms** | **14 fps** |
| Panoramica | 375 | 43 417 | 5 048 ms | 9 / 1 377 ms | 54 fps |
| Pianificazione | 1280 | **42 754** | 2 714 ms | 28 / 4 200 ms | 29 fps |
| Pianificazione | 375 | 42 754 | 1 975 ms | 14 / 2 000 ms | 58 fps |
| Contabilità | 1280 | 15 202 | 3 081 ms | 42 / **6 603 ms** | 50 fps |
| Contabilità | 375 | 15 202 | **4 824 ms** | 33 / 6 402 ms | 48 fps |
| Statistiche | 1280 | 16 158 | 2 703 ms | 40 / 3 892 ms | 61 fps |
| Flotta / Piloti / Registro voli | 1280 e 375 | 730–1 086 | **177–502 ms** | 0–14 / ≤ 945 ms | 55–62 fps |

Per confronto: sul DB piccolo la Panoramica ha 9 031 nodi e 761 KB. Il DOM cresce linearmente coi velivoli (25 `grid-line` + ~10 nodi per riga di timeline).

### 2.4 Le query più costose (log ≥ 100 ms, finestra del run 2 sui soli target caldi)

| Chiamate | Tempo totale | Media | Statement |
|---|---|---|---|
| 382 | 109,6 s | 287 ms | `SUM(amountCents)` su AccountMovement con **4 LEFT JOIN su se stesso** (`reversalOf` a catena) e filtro `effectiveDate` — `computeRevenueCents` |
| 292 | 62,1 s | 213 ms | `SUM(amountCents)` su CashMovement con LEFT JOIN AccountMovement — `computeCostCents` / cassa |
| 26 | 4,8 s | 185 ms | `SELECT id, flightDate, minutes FROM Flight WHERE status AND flightDate …` — serie mensile di `getStats` (righe grezze) |
| 26 | 4,7 s | 181 ms | `SUM(minutes) GROUP BY instructorProfileId` con `IN (374 id)` — compensi istruttori |
| 24 | 3,7 s | 156 ms | `SUM(amountCents), MAX(createdAt) GROUP BY accountId` su tutta la tabella — saldi negativi |
| 14 / 11 | 2,9 s / 2,4 s | ~210 ms | `COUNT(*)` con LEFT JOIN fra CashMovement e AccountMovement — paginazione transazioni |

`EXPLAIN ANALYZE` della prima (mese di agosto, 3 700 movimenti nel mese): **50 ms in isolamento**. Il piano fa un **seq scan completo di AccountMovement (104 612 righe) per il join `j0`** (hash right join) e un secondo seq scan per il filtro data (nessun indice su `effectiveDate`). Un indice su `effectiveDate` porta il filtro da 15 a 7 ms ma non tocca il join; `work_mem` a 64 MB non aiuta (il planner passa a hash join anche su `j3`, 90–105 ms). La media di 287 ms sotto carico è concorrenza + cache fredda: **il problema non è la singola query ma le 24–26 volte che gira per ogni pagina** (12 mesi × ricavi e costi, più il mese corrente per Contabilità).

### 2.5 Run arbitro a macchina quieta (tutti gli agent fermi, stesso server, stesso DB)

| Target | Run 2 (rumore) p50 | Run 3 (quieto) p50 | Burst 10 run 3 |
|---|---|---|---|
| `stats?period=month` | 754 ms | **822 ms** | 5,5 s, 1 errore |
| `stats?period=year` | 2 086 ms | **1 125 ms** | — |
| `transactions` | 463 ms | **210 ms** | — |
| `negative-balances` | 287 ms | 172 ms | — |
| PDF PPR (478 righe) | 3,5 s | **3,8 s** | — |
| Panoramica | 651 ms | **926 ms** | 5,6 s, **9 errori** |
| Pianificazione | 270 ms | **463 ms** | 4,1 s, 0 errori |
| Contabilità | 830 ms | **1 693 ms** | **14,7 s**, 0 errori |
| Statistiche | 877 ms | **1 570 ms** | 10,9 s, **10 errori** |
| Registro voli | 240 ms | 586 ms | — |
| Scheda persona | 207 ms | 190 ms | — |

Il run quieto NON è più veloce: il rumore degli agent pesava meno dello stato delle cache (Node e Postgres) e della contesa sul pool. La lettura corretta è **un intervallo**: Panoramica 0,65–0,93 s, Contabilità 0,8–1,7 s, Statistiche 0,9–1,6 s server-side per una sola richiesta, e fallimenti sistematici a 10 richieste concorrenti su Panoramica e Statistiche in tutti e tre i run. I 5–15 s di wall time dei burst dicono che dieci admin che aprono Contabilità insieme aspettano un quarto di minuto.

## 3. Findings, ordinati per impatto

### F1 — La timeline di Pianificazione rende UNA riga per ogni velivolo non archiviato, senza cap, su Panoramica E Pianificazione (BLOCCANTE sotto carico)

- **Dove**: `bookings.service.ts:1248-1256` `listBookableAircraft` (`findMany` senza `take`), consumato da `schedule.tsx:606-623` (`visibleAircraft.map` → `.sched-row` con 25 `grid-line` ciascuna) e dalla Panoramica (`page.tsx:285/673/704` `scheduleAircraftOptions`).
- **Misura**: 1 447 righe → 24 599 div `grid-line`, 43 417 nodi, 2,6 MB, `domInteractive` 7,9 s, 5,7 s di long task, scroll a 14 fps a 1280. Il filtro per velivolo è **client-side** (`schedule.tsx:292`): il DOM contiene sempre tutto. Lo stesso elenco alimenta il `<select>` velivolo del form prenotazione: **1 448 `<option>`** in un select nativo.
- **Perché conta**: sono le due pagine di atterraggio dell'admin. Già a 185 velivoli (DB e2e) la timeline ha 185 righe e la Panoramica pesa 761 KB: il difetto è visibile prima del carico.
- **Rimedio**: (a) la timeline mostra per default solo i velivoli **con prenotazioni o AOG nel giorno** più un contatore «altri N velivoli liberi» (una query sui booking del giorno, poi `aircraft.findMany({ where: { id: { in } } })`), con filtro/ricerca velivolo **server-side** via query string; (b) le 25 linee della griglia diventano un `background-image: repeating-linear-gradient` sulla `.sched-track` (−24 599 nodi a costo zero di design); (c) il picker velivolo del form diventa un typeahead con ricerca server (`GET /aircraft?q=`) come già fa `GET /people?q=`. Effort: (a) M, (b) S, (c) M.

### F2 — Contabilità stampa tutti i saldi negativi (3 996 righe), e la Panoramica li incorpora

- **Dove**: `accounts.service.ts:740-760` `listNegativeBalances` (groupBy su TUTTA `AccountMovement`, nessun `take`), consumato da `billing/page.tsx:93` e `dashboard/page.tsx` (Promise.all).
- **Misura**: API 643 KB / 3 996 elementi; pagina Contabilità 2,1 MB, 15 202 nodi, 6,6 s di long task, `domInteractive` 4,8 s a 375 px. Nessun controllo di paginazione nel DOM (`billing-negative-row` ×3 996).
- **Rimedio**: il servizio restituisce **aggregato + top N** (conteggio in rosso, esposizione totale, i 20 peggiori) e la lista completa vive in una vista paginata dedicata con ricerca; la Panoramica riceve solo l'aggregato. Effort S/M. Indice: nessuno risolve un groupBy su tutta la tabella; è il perimetro della query che va cambiato.

### F3 — Statistiche: serie mensili calcolate in JS su righe grezze, e classifiche rese per intero

- **Dove**: `stats.service.ts:180-185` (`flight.findMany` di TUTTI i voli REGISTERED del periodo con `select { flightDate, minutes }`, poi aggregazione per mese in JS; per `year` ~20 000 righe) + 4 `groupBy` sulla stessa finestra; `reports/page.tsx` rende 3 154 `util-row` (1 374 velivoli + 400 istruttori + …) con il cap «Prime 8 · Mostra tutte» applicato **solo in CSS/stato client** (15.8b).
- **Misura**: `stats?period=year` 2,1 s p50 (cold 5,3 s); pagina 1,2 MB, 16 158 nodi, 3,9 s di long task; burst 10 → 10/10 errori P2028.
- **Rimedio**: la serie mensile diventa **una** query `GROUP BY date_trunc('month', flightDate AT TIME ZONE 'Europe/Rome')` (`$queryRaw`, o un `groupBy` Prisma su una colonna mese derivata); le classifiche vengono cappate **dal server** (top N + link a una pagina paginata) — il cap client-side dichiarato della 15.8b nasconde le righe ma le paga tutte. Effort M.

### F4 — Dieci utenti concorrenti bastano a far fallire Panoramica, Statistiche e Contabilità

- **Dove**: pool = **10 connessioni** (default `pg.Pool`: `PrismaPg(env.DATABASE_URL)` non passa `max`, `prisma.ts:19`); `listPeople` (`people.service.ts:231`) e `listExpiries` (`expiries.service.ts:470`) aprono una **transazione interattiva per una lettura** (items + total, TD-1 AC 3); la Panoramica lancia **~15 query in `Promise.all`** per richiesta (`page.tsx:290`) dopo due liste sequenziali «perché ognuna ha la sua transazione» (`page.tsx:261-263`); Contabilità e Statistiche lanciano 12–26 aggregati in parallelo.
- **Misura**: burst di 10 → `P2028 Transaction API error: Unable to start a transaction in the given time` (attesa default 2 s) 10/10 su Statistiche e 2/10 su Panoramica già sul **DB piccolo**; 10/10 su Panoramica al carico nel run 1.
- **In più, ambiente**: il container Postgres del repo ha `/dev/shm` = **64 MB** (default Docker): le query parallele (hash join paralleli di Statistiche/Panoramica) falliscono con `53100 could not resize shared memory segment` → **HTTP 500 al 100 %** nel run 1. Il run 2 è stato fatto con `max_parallel_workers_per_gather = 0` sul DB di carico per poter misurare il resto. Chiunque deploy con questo `docker-compose.yml` e questi volumi lo incontra.
- **Rimedio**: `shm_size: '256m'` (o più) nel servizio postgres del compose (S, una riga); `max` esplicito nel pool (via `new PrismaPg({ connectionString, max })`) dimensionato con `max_connections`; sostituire le transazioni interattive di sola lettura con un `$transaction([count, findMany])` batch o con una singola query con `COUNT(*) OVER ()`; ridurre il fan-out della Panoramica (F1–F3 lo fanno da soli; i settings (`getAirfieldIcao/Branding/Scheduling`) sono 3 query per richiesta che si possono leggere in una). Effort S–M.

### F5 — Export PDF: 16–70 ms per riga con react-pdf, e sotto carico i tre report principali non si scaricano

- **Dove**: `adapters/pdf/document.tsx` (`@react-pdf/renderer`, layout Yoga per ogni `Text`), `exports.service.ts:66` `PDF_EXPORT_MAX_ROWS = 2000`, `:63` `EXPORT_MAX_ROWS = 10000` (xlsx).
- **Misura**: DB piccolo — voli (124 righe) 13,7 s, prenotazioni 11,5 s, **scadenze (559 righe) 40 s**; al carico — PPR (478 righe) 3,5–7,7 s, voli/prenotazioni/scadenze **422** perché oltre 2 000 righe. Ogni PDF occupa il processo Node per tutta la durata (CPU-bound): due export contemporanei si sommano.
- **Rimedio**: (a) sostituire il motore per i report tabellari con un generatore a stream (pdfkit/pdfmake: ~1 ms/riga) mantenendo `PdfColumn`/`PdfTotal` come contratto — l'adapter è isolato proprio per questo; (b) finché resta react-pdf, abbassare il tetto PDF a ~500 righe e dire all'utente di filtrare, e mandare l'export **fuori dalla richiesta** (job + download) oltre una soglia. Effort M (a), S (b).

### F6 — I cap silenziosi dei picker diventano bugie a 1 500 velivoli e 5 000 persone

- **Misura sul DOM della Panoramica al carico**: select velivolo 1 448 opzioni (F1), select persona **87 opzioni** (la prima pagina di 100 di `listPeople`, filtrata: 4 670 persone attive non selezionabili senza che nulla lo dica), select istruttore 375 opzioni, widget flotta **100 card su 1 447** (qui il totale è dichiarato: «1447» compare 4 volte nel markup). `OPTIONS_PAGE_SIZE = 100` è duplicato in 5 pagine (v. ops-audit §4).
- **Rimedio**: un solo idioma «typeahead con ricerca server» per persone e velivoli (l'endpoint `GET /people?q=` c'è già: 40 ms al carico), cap dichiarato ovunque resti un cap. Effort M (compone con F1c).

### F7 — Registro transazioni: COUNT con LEFT JOIN su 111 k righe a ogni pagina

- **Misura**: 463 ms p50, 1,8 s a freddo; le due `COUNT(*)` con join fra i due ledger costano 210–220 ms ciascuna.
- **Rimedio**: indici `AccountMovement(effectiveDate)` e `CashMovement(effectiveDate)` (mancano: gli unici indici sono su FK e `reversalOfId`); evitare il COUNT esatto a ogni pagina (`hasMore` con `take: pageSize + 1`, o conteggio solo alla prima pagina). Effort S.

### F8 — Le serie mensili di ricavi e costi sono 24 aggregati con self-join invece di una GROUP BY

- **Dove**: `transactions.service.ts:459-480` `computeRevenueCents` e `billing-summary.service.ts:84` `computeCostCents`, chiamati per mese.
- **Misura**: 382 + 292 esecuzioni nel run 2, 172 s di tempo DB cumulato su 14 target; 50 ms in isolamento per mese, 287 ms sotto carico.
- **Rimedio**: una query `GROUP BY date_trunc('month', effectiveDate)` con la stessa logica di classificazione espressa in SQL (`CASE`) o, se si vuole restare in Prisma, un `groupBy` su una colonna `effectiveMonth` derivata. Indice su `effectiveDate` in ogni caso. Effort M. Nota: la classificazione ricavi/costi è già stata oggetto di review contabile (Billing-1 F3/F5): ogni riscrittura va coperta dai test esistenti e da un confronto DB-side sul DB di carico.

### F9 — Payload HTML: i dati dei picker viaggiano nell'RSC payload E nel markup

- **Misura**: Panoramica al carico 482 KB di RSC payload (`registration` ×1 649, `statusReason` ×1 647: l'oggetto velivolo completo, con `hourMeterMinutes`, `wetRateCents`, `fuelType`, `seats`, per il picker) + 2,1 MB di markup che ripete gli stessi dati. Sul DB piccolo: 252 KB + 506 KB.
- **Rimedio**: i picker ricevono DTO minimi (`id`, `registration`, `model`, `status`) e i dati arrivano su richiesta (F1c/F6). Effort S una volta fatto F1.

### F10 — Postgres del compose è a configurazione di fabbrica

`shared_buffers` 128 MB, `work_mem` 4 MB, `effective_cache_size` 4 GB, `/dev/shm` 64 MB. Non è un difetto del codice, ma è il modo in cui l'app verrà quasi certamente deployata: `shm_size`, `shared_buffers` ≈ 25 % della RAM, `work_mem` 16–32 MB e `effective_cache_size` realistico vanno nel compose (o in un `postgresql.conf` montato) prima di qualunque test di carico ufficiale. Effort S.

## 4. Che cosa regge (e va preservato)

- **Tutte le liste paginate**: 15–50 ms server-side al carico, 0 errori nei burst, pagine da 110 a 300 ms, nessun long task. La scelta «pagina + count» con indici su FK è sufficiente per questi volumi.
- **Login e sessione** (JWT con controllo attivo): 23 ms.
- **Calendario settimanale** (`bookings/calendar`, 372 prenotazioni): 92 ms — ma `take: 1000` è un cap silenzioso che a più aviosuperfici/tempo si romperà (ops-audit).
- **Scheda persona, estratto conto, PDF estratto conto**: 0,2–0,7 s.
- **Il seed**: 3,2 minuti per l'intero volume, riproducibile, con guardia sul DB.

## 5. Piano proposto (valore/costo)

| # | Intervento | Chiude | Effort | Effetto atteso (misurabile sul DB di carico) |
|---|---|---|---|---|
| 1 | Timeline: righe = velivoli con prenotazioni/AOG del giorno + contatore; griglia in CSS; filtro server | F1, F9 | M | Panoramica/Pianificazione da 2,6 MB a < 300 KB, da 43 k a < 3 k nodi, `domInteractive` < 1 s, 60 fps |
| 2 | Saldi negativi: aggregato + top N; lista completa paginata altrove | F2 | S/M | Contabilità da 2,1 MB a < 300 KB; Panoramica −650 KB |
| 3 | Statistiche: serie in SQL (`GROUP BY` mese) + classifiche cappate dal server | F3 | M | `stats?period=year` da 2,1 s a < 200 ms; pagina < 400 KB |
| 4 | Ricavi/costi mensili in una query + indici `effectiveDate` | F8, F7 | M | Contabilità/Statistiche −20 query per richiesta; transazioni < 150 ms |
| 5 | `shm_size` + parametri Postgres nel compose; `max` del pool esplicito; `maxWait` dichiarato | F4, F10 | S | zero 500 da 53100; P2028 solo oltre il dimensionamento scelto |
| 6 | Letture senza transazione interattiva (`$transaction([...])` batch o `COUNT() OVER()`) | F4 | S | −1 connessione trattenuta per richiesta di lista |
| 7 | Typeahead server-side per persone e velivoli, cap dichiarato dove resta | F6, F1c | M | picker utilizzabili a 5 000 persone / 1 500 velivoli |
| 8 | Motore PDF a stream per i report tabellari (o export fuori richiesta) | F5 | M | PDF di 2 000 righe in < 3 s invece di 422/40 s |

Dopo 1–4 la Panoramica dovrebbe stare sotto i 300 ms server e sotto il secondo nel browser anche a 1 500 velivoli; il DB di carico e `bench.mjs`/`render.mjs` (nello scratchpad di sessione, copiabili in `scripts/perf/` se si vuole un gate) permettono di misurarlo prima/dopo per ogni story.

## 6. Stato lasciato

- **`airmanager_load`** popolato (base seed + carico). Per rifarlo da zero: `DROP DATABASE airmanager_load WITH (FORCE)` dentro il container, `createdb`, `prisma migrate deploy`, `prisma db seed`, `npm run seed:load` con `LOAD_SEED_TARGET_DB=airmanager_load`. Su questo DB è stato impostato `ALTER DATABASE airmanager_load SET max_parallel_workers_per_gather = 0` per aggirare i 64 MB di shm durante il run 2 — **rimosso a fine sessione** (v. sotto), quindi senza `shm_size` nel compose le Statistiche torneranno a dare 500 su questo DB: è il comportamento reale.
- Impostazioni Postgres di sessione (`log_min_duration_statement`, `log_line_prefix`) **ripristinate a fine sessione**; indice temporaneo `tmp_am_effdate` creato e rimosso durante l'EXPLAIN.
- Server di produzione su :3000 e :3001 **fermati a fine sessione**.
- DB `airmanager` (e2e): NON resettato; contiene i residui dichiarati dal reviewer 1b e dall'ops-audit (`audit_*`, `I-AUD%`, script di pulizia nel §7 di `ops-audit.md`). Prima della prossima suite: reset.
- File nel repo: `prisma/seed-load.ts` (nuovo), `package.json` (+1 script), questa cartella di report. Nessun commit.
- Scratchpad di sessione (`/tmp/claude-1000/…/scratchpad/perf/`): `bench.mjs`, `render.mjs`, `run-load-phase.sh`, risultati `baseline.md`, `load-1.md`, `load-2.md`, `load-2.slow.md`, dump HTML.
