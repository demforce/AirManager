# Audit 2026-09-10 — UI, logica di dominio, carico

Sessione principale (Fable 5.1) su richiesta del PO: «Take a look at the UI both computer screen and mobile screen (…) Assess also the business logic of the ledgers (financial, scheduling/flights/planes etc) make sure there is no logic flaws. Finally (…) create a plausible db seed with thousands users and planes and flights and transactions (…) test the app and find ways to improve the speed and usability». Codice auditato: `dev` @ `b7b8d13` (AOG-1b in review). Nessuna correzione applicata: questa cartella contiene solo diagnosi, misure e proposte — il lavoro entra nel ciclo BMAD come story dopo le ratifiche del PO.

| Report | Autore | Esito |
|---|---|---|
| [`ui-review.md`](ui-review.md) | subagent Opus 5 (UI, 116 screenshot, 2 viewport + tablet, 2 temi, 4 ruoli) | **15 findings mobile, 4 desktop, 1 tablet, 1 a11y** + 8 proposte trasversali |
| [`ledger-audit.md`](ledger-audit.md) | subagent Opus 5 adversarial (ledger finanziario) | 0 BLOCKER · **6 MAJOR** · 6 MINOR · 7 LOW · 4 domande PO — nessun residuo |
| [`ops-audit.md`](ops-audit.md) | subagent Opus 5 adversarial (prenotazioni, voli, velivoli, PPR, scadenze) | 0 BLOCKER · **8 MAJOR** (tutti riprodotti) · 5 MINOR · 4 LOW · tabella dei cap · residui `audit_*` con script di pulizia |
| [`perf-load-report.md`](perf-load-report.md) | sessione principale + seed del subagent Sonnet 5 | seed `prisma/seed-load.ts` (60 k voli, 105 k movimenti, 1 500 velivoli, 5 000 persone in 3,2 min); **10 findings**, piano in 8 mosse |

## Il quadro in dieci righe

1. **Il nucleo contabile è sano per costruzione**: saldo mai denormalizzato (sempre `SUM`), ledger append-only senza un solo update/delete, RBAC monetario tutto su ADMIN, idempotenza esatta sul `POST /flights`, lock `FOR UPDATE` sul velivolo che regge la corsa su entrambi i percorsi, numerazione PPR atomica. Le liste paginate reggono 60 000 voli a 15–50 ms.
2. **Le quattro pagine dell'admin non scalano** (Panoramica, Pianificazione, Contabilità, Statistiche): rendono *tutto* — 1 447 righe di timeline (43 000 nodi DOM, 2,6 MB, 7,9 s, 14 fps), 3 996 saldi negativi, 1 374 righe di classifica — e a 10 utenti concorrenti vanno in errore (pool da 10, transazioni interattive in lettura, 15 query in parallelo per richiesta, 64 MB di `/dev/shm` nel compose).
3. **Due calendari nel dominio**: la data del volo è Roma, il «oggi» che la giudica è UTC (ops F1), e cinque writer datano i movimenti in UTC contro due in Roma (ledger MAJOR-3): fra mezzanotte e le 02:00 un volo appena atterrato è rifiutato e una rettifica finisce nel mese sbagliato. Stessa radice, due report.
4. **Il denaro dovuto agli istruttori è fragile**: tariffa payout non storicizzata e applicata retroattivamente (ledger MAJOR-1), istruttore disattivato che sparisce dal «Totale dovuto» (MAJOR-2).
5. **Il registro voli non ha guardie di sovrapposizione né di duplicato** (ops F3: stesso volo due volte = due addebiti, contaore avanzato due volte) e la persona può essere APPROVED su due velivoli nello stesso istante (F2); l'approvazione non ri-verifica persona/profilo/data (F4).
6. **Cap silenziosi ovunque**: `OPTIONS_PAGE_SIZE` in 5 pagine, `take: 1000` sul calendario, select velivolo da 1 448 opzioni, persone selezionabili 87 su 4 757 senza avviso, PDF a 422 oltre 2 000 righe.
7. **PDF con react-pdf**: 16–70 ms per riga, 40 s per 559 scadenze già oggi.
8. **Mobile**: la testata mangia 262–572 px del fold, 60+ bersagli sotto i 44 px nei pannelli form e nella topbar, Filtri di Pianificazione ancora popover desktop con 227 chip, Indietro che esce dall'app, 3,4 s senza feedback al cambio tab su 3G, tema che ignora `prefers-color-scheme`.
9. **Desktop**: Panoramica alta 33 313 px (37 schermate), Registro voli con la colonna Azioni fuori schermo a 1280, intestazioni non sticky, classifiche senza il cap che hanno su mobile.
10. **Ambiente**: il `docker-compose.yml` del repo lascia Postgres a configurazione di fabbrica (`shm` 64 MB, `work_mem` 4 MB): con questi volumi le Statistiche rispondono 500 al 100 %.

## Priorità trasversali (valore/costo), da trasformare in story

| # | Intervento | Fonte | Effort |
|---|---|---|---|
| 1 | Guardie mancanti sul registro voli e sulle prenotazioni: duplicato/sovrapposizione volo, persona e istruttore su due velivoli, ri-verifica in approvazione | ops F2, F3, F4 | M |
| 2 | Un solo calendario Europe/Rome per «oggi» e per `effectiveDate` (con test ai bordi 00:00–02:00 e DST) | ops F1 + ledger MAJOR-3 | S/M |
| 3 | Timeline Pianificazione cappata dal server (velivoli del giorno + contatore), griglia in CSS, filtro server | perf F1, F9 · ui D1 | M |
| 4 | Saldi negativi aggregati + top N; lista completa paginata | perf F2 | S/M |
| 5 | Statistiche: serie mensili in SQL, classifiche cappate dal server anche su desktop | perf F3, F8 · ui D4 | M |
| 6 | `shm_size` + parametri Postgres nel compose; `max` del pool; letture senza transazione interattiva | perf F4, F10 | S |
| 7 | Compensi istruttori: storicizzare `payoutRateCents`, non nascondere il dovuto degli archiviati | ledger MAJOR-1, MAJOR-2 | M |
| 8 | Data valuta futura rifiutata/segregata; PDF registro voli che esclude gli annullati come il KPI; Idempotency-Key stabile sulla quota associativa | ledger MAJOR-4, 5, 6 | S ciascuno |
| 9 | Tipo di scadenza disattivato che smette di bloccare; `personId` mascherato ai piloti; archivio velivolo con le tutele dell'AOG; `personId` rinfrescato nel JWT | ops F5, F6, F7, F8 | S–M |
| 10 | Pavimento mobile unico (44 px) + fold delle liste + Indietro che chiude + feedback di navigazione + tema di sistema | ui M1, M2, M5, M7, M12 | M complessivo |
| 11 | Typeahead server-side per persone e velivoli; cap dichiarato ovunque resti | perf F6 · ops §4 · ui M3 | M |
| 12 | Motore PDF a stream (o export fuori richiesta) | perf F5 | M |

## Decisioni che spettano al PO prima di aprire le story

- Le **4 domande** del ledger-audit (§5) e le domande dell'ops-audit (§6): fra queste, se il dovuto istruttore debba essere ricalcolato o congelato a tariffa storica; se una data valuta futura sia legittima; se un pilota possa essere prenotato su due velivoli nello stesso intervallo.
- Le **10 assunzioni del seed** (perf §1.2) — nessuna blocca l'uso del seed per i test di carico, ma la 2 (contaore degli annullati) e la 4 (pacchetti decorativi) descrivono un mondo leggermente diverso dal servizio.
- **Perimetro e ordine** delle story: la proposta è tre epic — *Correttezza del dominio* (righe 1, 2, 7, 8, 9), *Scalabilità* (3, 4, 5, 6, 11, 12), *Mobile 2* (10 + il resto della ui-review) — con la Scalabilità misurata prima/dopo sul DB `airmanager_load` e l'harness dello scratchpad promosso a `scripts/perf/`.

## Che cosa NON è stato fatto

- Nessuna correzione al codice: tutto è diagnosi. L'unico codice nuovo è `prisma/seed-load.ts` + lo script `seed:load` (non committati).
- Nessun run della suite e2e; nessun reset del DB `airmanager` (contiene i residui dichiarati del reviewer 1b e dell'ops-audit).
- Il ciclo di fix di **AOG-1b** è **parcheggiato**: review SHIPPABLE-WITH-FIXES (2 MAJOR, 2 MINOR, 4 LOW, report in `implementation-artifacts/aog-1b-review-report.md`, non committato); decisione PO 1 presa (MAJOR-1: frase **dedicata** per il bound scaduto, finestra effettiva nel DTO da `computeAogImpact`); decisioni 2–5 aperte (doppio click sul doppio passo, fold a 1280, link del banner, TD costo fan-out).
