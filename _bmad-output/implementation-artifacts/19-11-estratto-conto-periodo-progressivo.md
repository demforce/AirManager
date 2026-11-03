---
baseline_commit: eef77ef
---

# Story 19.11: Estratto conto a periodo con saldo progressivo

Status: **review** — dev 2026-11-03 (`feat` `0556850`); story file del 2026-11-01. **Q-19.11-a RATIFICATA dal PO = A** (sotto): se il PO sceglie B o C cambiano solo la direzione dell'`ORDER BY` di pagina/export e la posizione della riga «Saldo iniziale» (nota sotto la tabella della domanda). **Modello dev: Opus 5 xhigh (UI)**: la story scrive codice UI su due pagine (scheda persona, «Il mio conto») con due facce ciascuna (tabella desktop, card + sheet mobile), un form di periodo nuovo, una colonna nuova, una riga nuova e una variante della primitiva `ExportMenu`, oltre a SQL, migrazione, service, Zod, OpenAPI ed e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-11-estratto-conto-periodo-progressivo`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` è misurato su **`eef77ef`** (19.1 e 19.2 committate; 19.3-19.10 solo come story file). L'epic si esegue in ordine 19.1 → 19.12, quindi il dev della 19.11 parte **dopo** il commit della 19.10. **Dipendenza funzionale: nessuna**, salvo la 19.6. Prima di scrivere codice vanno riletti questi punti, che le story precedenti toccano:
> - **19.6** (la sola dipendenza vera): il `FLIGHT_CHARGE` si **aggiorna in place** con la modifica del volo (`effectiveDate` = nuova data del volo, `createdAt` invariato, D-13 della 19.6) e si **cancella** col volo. Toglie `FLIGHT_CHARGE_REVERSAL` dall'enum e da `account-section.tsx` (`:64-66`, `:173-174`, `:240-241`, `:396-400`, `:488-494`, `:549-553`), dai due mapper delle etichette (`people/[id]/page.tsx:216`, `:222`; `my-account/page.tsx:110`, `:115`) e da `ACCOUNT_MOVEMENT_TYPE_KEYS` (`exports.service.ts:311-317`); riscrive `flight-reversal.spec.ts` come `flight-delete-update.spec.ts` e la fixture di storno di `mobile-self-public.spec.ts`. Per questa story **non serve codice in più**: il saldo progressivo si calcola alla lettura, quindi un addebito modificato o cancellato si riflette da sé. Va solo verificato (AC 4, e2e su un volo modificato) e dichiarato.
> - **19.3**: aggiunge `minDate` a `CalendarPopover` letto dal `min` di `DateInput` (19.3 AD-7), gli helper e2e `todayRome()`/`addDaysIso()` in `e2e/helpers.ts` e il modulo `e2e/db-fixtures.ts` (pool `pg` per gli insert diretti). Questa story li **riusa**: leggerne l'API reale prima di scrivere.
> - **19.7a/19.9/19.10/19.12**: toccano `messages/*.json` (conteggi i18n diversi da quelli di qui) e alcuni seed/e2e in comune.
>
> **Prima di scrivere una riga**: `git log --oneline -12`, `scripts/e2e.sh status`, `ss -ltnp | grep :3000`; poi rieseguire i **censimenti di §3** (sono comandi, non elenchi di cui fidarsi) e correggere in questo file le righe slittate (T0).
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (convenzioni e2e: `getByLabel`/`hasText` sono substring, testid `-mobile`/`mobile-` e il divieto `^=`, suite solo via `scripts/e2e.sh`, unit ed env eager, manutenzione del file); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §1 («Domanda del punto 3 — risposta fattuale»), §2.1 (riga epic 17), §4.0 **R-19-n**, §4.2 riga **19.11**, §4.7 **FR-26**, §4.8 **AD-3**, §4.10 **A13**; `ARCHITECTURE-SPINE.md` §AD-3 (`:47-51`); `15-9-aree-self-pubblico-mobile.md` (card, sheet, due alberi nel DOM, `headingRepeatsPageHead`); `12-9-contabilita.md` AC 5 (perché `from`/`to` esistono già sul PDF); `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.5 e §Story 17.7. Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

### ❓ Domande PO aperte

**Q-19.11-a — In che ordine si leggono i movimenti dell'estratto conto?**

> ✅ **DECISIONE PO (2026-11-01): A — più recenti in alto ovunque** (schermo, Excel, PDF), riepilogo saldo iniziale/finale sempre visibile, riga «Saldo iniziale» in fondo all'ultima pagina. La story resta com'è.

La CR dice «ordinamento per data valuta» (§4.2) ma non la direzione. Oggi lo schermo mostra **i più recenti in alto** (per data di inserimento); tutte le altre liste dell'app fanno lo stesso (registro voli, Contabilità: `transactions.service.ts:335,353` ordina per `effectiveDate desc`). L'estratto conto bancario su carta fa il contrario: saldo iniziale in testa, movimenti dal più vecchio, saldo finale in fondo.

| Opzione | Effetto | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | **Più recenti in alto, ovunque** (schermo, Excel, PDF). Il saldo progressivo di una riga è il saldo **dopo** quel movimento. La riga «Saldo iniziale» chiude l'elenco (ultima riga dell'ultima pagina, ultima riga del file); saldo iniziale e finale del periodo sono sempre visibili in un riepilogo sopra l'elenco. | Continuità con lo schermo di oggi e con ogni altra lista dell'app; la domanda più frequente («cosa mi è stato addebitato ultimamente?») ha risposta in pagina 1; un solo ordine, quindi il file scaricato coincide con quello che si è visto. | Su carta il saldo «scorre all'indietro» rispetto a un estratto bancario. |
| B | **Cronologico ovunque** (dal più vecchio): «Saldo iniziale» in testa alla prima pagina, saldo finale in fondo all'ultima. | È l'estratto bancario classico. | Con 12 mesi di movimenti, i più recenti stanno nell'ultima pagina: chi apre il conto vede per primi i movimenti di un anno fa. |
| C | **Schermo più recenti in alto, documenti (Excel/PDF) cronologici.** | Ognuno nel suo formato abituale. | Due ordini da spiegare: il file scaricato non coincide con lo schermo. |

> Se il PO sceglie **B**: l'`ORDER BY` di pagina diventa `ASC` (AD-3), la riga «Saldo iniziale» va **in testa alla prima pagina** (AD-6) e degli export (AD-7); il saldo progressivo non cambia. Se sceglie **C**: come A sullo schermo, come B negli export (un parametro di direzione interno al service, `listAccountMovements(..., { order })`, usato solo dagli export). Gli AC 3, 18, 24 e 25 si adattano di conseguenza; il resto della story non cambia.

Le altre scelte (§0.3) non sono assunzioni di dominio nuove: discendono da una ratifica chiusa (A13, R-19-n) o da un vincolo tecnico misurato, e la sessione principale può riaprirle col PO senza toccare il resto.

---

## Story

As **un pilota o un allievo che controlla il proprio conto, e l'amministratore che lo gestisce**,

I want vedere l'estratto conto **di un periodo** (di default gli ultimi 12 mesi) **ordinato per data valuta**, con il **saldo iniziale** del periodo, il **saldo dopo ogni movimento** e il **saldo finale**, ed esportare in Excel e PDF **esattamente quel periodo**,

so that un conto con migliaia di movimenti resti leggibile ed esportabile (punto PO 3, R-19-n), e ogni riga dica quanto restava sul conto in quel momento.

### Il perché

La risposta fattuale della CR (§1) elenca cinque limiti misurati: paginazione a 20 righe con solo precedente/successiva, nessun filtro per periodo (il backend lo supporta dalla 12.9, ma la UI passa `{}`), nessun saldo progressivo, ordinamento per data di **inserimento** invece che per data valuta, export dell'**intero** conto con un tetto di 2.000 righe sul PDF: **un conto lungo non si esporta più e non si può restringere il periodo**. Il PO ha ratificato filtro per periodo + saldo progressivo (R-19-n), periodo predefinito di 12 mesi e saldo progressivo calcolato in SQL (A13).

### Fatti misurati che vincolano il design (su `eef77ef`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Il servizio filtra già per periodo, ma **nessun chiamante passa il periodo** | `listAccountMovements` accetta `from`/`to` inclusivi su `effectiveDate` (`accounts.service.ts:354-382`, story 12.9); scheda persona `people/[id]/page.tsx:106`, `:112`, «Il mio conto» `my-account/page.tsx:72`, `:77` passano solo `page`/`pageSize`; gli href di export passano `{}` (`people/[id]/page.tsx:260-261`, `my-account/page.tsx:83-84`) | il filtro arriva al DB senza codice nuovo di filtro: serve la UI, il saldo e l'ordine |
| Lo schema JSON/XLSX **non ha** `from`/`to`; quello del PDF sì | `listAccountMovementsQuerySchema` = paginazione + export (`accounts.ts:118`); `accountStatementPdfQuerySchema` ha `from`/`to` senza controllo d'ordine (`accounts.ts:132-135`) | i due schemi vanno allineati, con `from ≤ to` (precedente: `cashReportQuerySchema`, `cash.ts:189-192`) |
| Ordine per data di **inserimento**, pagina con `skip/take`, totale con una seconda query, dentro una **transazione interattiva** | `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` + `count` in `prisma.$transaction(async (tx) => …)` (`accounts.service.ts:385-396`) | la 17.5 elenca le letture interattive da eliminare: questa story ne **toglie una** e non ne aggiunge (AD-3) |
| Il saldo esiste **solo** come saldo attuale | `aggregate _sum` in `readOverview` (`accounts.service.ts:155-158`, `:173`); KPI `account-balance` (`account-section.tsx:340-342`) | il saldo progressivo è nuovo, e AD-3 dello spine vuole il saldo **sempre** `SUM(amountCents)`, mai memorizzato: una `SUM` cumulativa calcolata alla lettura è la stessa regola |
| L'indice è solo su `accountId` | `@@index([accountId])` (`schema.prisma:627`) | ordinare e filtrare per data valuta su un conto da migliaia di righe richiede un indice composto (AD-4) |
| Il badge «Rettifica del movimento del {date}» dipende dalla **pagina** | `originalDateLabel` cerca l'originale in `rowById`, cioè nelle 20 righe renderizzate (`account-section.tsx:230-234`); fuori pagina cade sul testo `linked` «Rettifica di un movimento precedente» (`mobile-self.ts:40-50`); col periodo l'originale può anche stare **fuori dal periodo** | la data dell'originale va letta in SQL (AD-3), e il ramo `linked` diventa irraggiungibile (D-9) |
| Il PDF stampa il **saldo attuale** anche quando ha un periodo | totals `[{ label: hasPeriod ? currentBalance : balance, value: overview.balanceCents }]` con una lettura `getAccountOverview` in più (`exports.service.ts:502`, `:533`) | con saldo iniziale e finale del periodo la lettura del saldo attuale non serve più (AD-7) |
| Gli export **rifiutano** oltre il tetto, e la UI apre il JSON grezzo | `EXPORT_MAX_ROWS = 10_000`, `PDF_EXPORT_MAX_ROWS = 2_000` (`exports.service.ts:60-64`), 422 `EXPORT_TOO_LARGE` (`:73-77`); `ExportMenu` = due `<a target="_blank">` (`export-menu.tsx:63-94`) | la pagina conosce già il totale del periodo: può dire **prima** del click che l'export non è disponibile (AD-8), senza riscrivere il download |
| Il motore PDF costa **16-70 ms per riga** | audit perf F5 (`perf-load-report.md:174-178`); `GET /people/{id}/account/pdf` 1,5 s sul DB piccolo (`:87`) | un PDF di 12 mesi di un conto attivo resta lento: è la 17.7. Qui si misura e si dichiara (AC 10), non si cambia il motore né il tetto |
| **Nessun conto da migliaia di righe è mai stato misurato** | `airmanager_load` ha ~20-35 movimenti per conto (104 612 su ~5 000 persone, HANDOFF) | la prova di prestazioni si fa su un **DB gemello** con un conto da ≥ 5 000 movimenti (AC 10); `airmanager_load` non si tocca |
| Gli id sono **cuid v1**, ordinati per tempo solo per costruzione del generatore | Prisma 7.8 genera `"c" + Date.now().toString(36) + contatore + …` (`node_modules/@prisma/client/runtime/client.js`, classe `Jn`, `t === 1`) | `id` da solo come spareggio tiene l'ordine di inserimento **per caso**; `createdAt` lo tiene **per definizione** ed è lo spareggio già usato dal libro contabile (D-3) |
| L'SQL grezzo sulle date ha un precedente e una trappola nota | `getCashReport` lega `from`/`to` come **testo** con `::date` (`cash.service.ts:559-566`, `:594`): una `Date` JS si lega come `timestamptz` e sposta il confine col fuso della sessione (review 3.5 F1, doc di `date-only.ts:10-16`) | stessa tecnica qui, e lettura delle date con `to_char` (AD-3) |
| Gli e2e che leggono l'estratto **dipendono da date fisse** | `my-account.spec.ts:122-125` crea ricariche fra **2020 e 2021** (`uniquePastDateOnly`), letto a `:211`; `'2026-07-01'` in `account-statement.spec.ts:54`, `accounts-topups.spec.ts:122,135`, `account-adjustments.spec.ts:58`, `people-management.spec.ts:197`; `'2026-01-15'` default di `mobile-self-public.spec.ts:102` | con un default di 12 mesi il test della paginazione di «Il mio conto» si rompe **subito**, gli altri a una data di calendario: vanno resi indipendenti dalla data (D-15, AC 34) |
| i18n | 1 720 chiavi per file su `eef77ef`, parità 0/0 (19.3-19.10 cambiano il conteggio) | questa story: **15 nuove, 2 rimosse** per file (§3.6) |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.11)

| # | Requisito |
|---|---|
| **P1** | Filtro per periodo sull'estratto conto, **predefinito gli ultimi 12 mesi** (A13). |
| **P2** | **Riga di saldo iniziale** del periodo. |
| **P3** | **Saldo progressivo per riga**, calcolato in SQL (A13). |
| **P4** | **Ordinamento per data valuta**. |
| **P5** | **Export Excel e PDF sul periodo** (cade il muro delle 2.000 righe sul conto intero). |
| **P6** | `from`/`to` anche sullo schema JSON/XLSX. |
| **P7** | Indice per conto e data valuta (CR: `(accountId, effectiveDate, id)`; qui `(accountId, effectiveDate, createdAt, id)`, D-3). |
| **P8** | Scheda persona **e** «Il mio conto», desktop e mobile. |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-n** | Estratto conto: filtro per periodo + saldo progressivo in questa CR. | P1-P3. |
| **A13** | Periodo predefinito ultimi 12 mesi; saldo progressivo calcolato in SQL. | AD-2, AD-3. |
| **FR-26** emendato | + periodo, saldo iniziale e progressivo, ordinamento per data valuta, export sul periodo (`prd.md:414`). | Tutto il §2. |
| **AD-3** spine (+ emendamento CR) | Saldo = `SUM(amountCents)`, mai memorizzato; il `FLIGHT_CHARGE` si aggiorna/cancella col volo. | Il saldo progressivo è una `SUM` cumulativa alla lettura: **nessun emendamento** allo spine. Un addebito modificato dalla 19.6 si sposta alla sua nuova data e i saldi si ricalcolano da soli. |
| **16.1** | Ogni «oggi» si calcola su Europe/Rome con gli helper esistenti. | Il default del periodo usa la data di Roma (AD-2). |

**Story collegate** (coordinamento dichiarato, nessuna dipendenza bloccante):
- **17.5** (letture senza transazione interattiva): `listAccountMovements` **perde** la sua `$transaction` interattiva (AD-3) e `exportAccountStatementPdf` perde la lettura `getAccountOverview` (AD-7): il perimetro della 17.5 si riduce di una lettura, senza toccarne altre. `readOverview`/`buildOverview` restano alla 17.5.
- **17.7** (PDF a stream): tetto e motore **invariati** qui; la misura di AC 10 è il suo dato d'ingresso.
- **17.4** (indice `AccountMovement(effectiveDate)` per le serie globali): indice diverso (nessun `accountId` in testa), nessuna sovrapposizione.
- **16.6a** (rifiuto delle date valuta future, dopo l'epic 19): finché non c'è, una ricarica datata nel futuro esce dal periodo predefinito (D-2).

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | **API senza `from`/`to` = storico completo** (saldo iniziale 0, saldo finale = saldo attuale), come oggi. Il default di 12 mesi vive **nelle pagine**, che passano sempre il periodo esplicito, anche agli href di export. | Contratto additivo (stessa scelta della 12.9 sul PDF); 9 e2e e i target perf (`scripts/perf/targets.json:24,29`) chiamano l'API senza periodo; la futura app Flutter sceglie da sé | default di 12 mesi nell'API: un client che non manda il periodo perderebbe in silenzio i movimenti più vecchi |
| **D-2** | Periodo predefinito: **`to` = oggi (Roma), `from` = lo stesso giorno 12 mesi prima** (fine mese limitata: 29/02 → 28/02), estremi inclusi. Una ricarica datata dopo `to` (possibile finché la 16.6a non le rifiuta) non è nel periodo né nel saldo finale, ma è nel KPI «Saldo attuale»: le due etichette lo dicono con le loro date. | A13; «oggi» di Roma (16.1); `addMonthsClampUtc` esiste già (`date-only.ts:61-77`) | `to` aperto: il periodo mostrato non avrebbe una data di fine da leggere né da stampare |
| **D-3** | Chiave d'ordine **`(effectiveDate, createdAt, id)`** e indice **`(accountId, effectiveDate, createdAt, id)`**, che **sostituisce** `@@index([accountId])` (il prefisso `accountId` serve ancora `readOverview`, `listNegativeBalances` e la FK). **Deviazione dichiarata** dalla lettera della CR (`(accountId, effectiveDate, id)`). | Stessa chiave del libro contabile (`transactions.service.ts:335,353`): lo stesso movimento ha la stessa posizione in Contabilità e in estratto conto; `createdAt` tiene l'ordine d'inserimento per definizione, `id` solo per come Prisma oggi genera i cuid (fatto misurato); con l'indice uguale alla chiave la finestra legge le righe già ordinate | `(accountId, effectiveDate, id)`: l'ordine fra due movimenti dello stesso giorno dipenderebbe dal generatore di id, e la finestra ordinata per `createdAt` richiederebbe un sort |
| **D-4** | **Una sola istruzione SQL** (`$queryRaw`) restituisce pagina, saldo iniziale, totale e somma del periodo; **nessuna** transazione. Date legate come testo `::date`, lette con `to_char`. | A13 («in SQL»); un'istruzione = un'unica fotografia del DB (il saldo della prima riga coincide col saldo finale anche sotto scritture concorrenti); 17.5 (via le letture interattive); precedente `cash.service.ts:594` | due query (riepilogo + pagina): sotto una ricarica concorrente il riepilogo e le righe potrebbero non tornare. Una `$transaction` interattiva: è ciò che la 17.5 toglie |
| **D-5** | Il periodo si applica col bottone **«Applica»**, non a ogni modifica come i filtri del registro voli e della Contabilità (`logbook-console.tsx:312-316`). | Con due date, applicare a ogni cambio passa per stati transitori invertiti (`from` spostato oltre `to` prima di spostare `to`); un bottone permette di validare prima di navigare | applicazione a ogni cambio: la pagina riceverebbe periodi invertiti che sta all'utente correggere a metà |
| **D-6** | **Un solo form** per le due larghezze (riflusso CSS), non un pannello «Filtri» mobile separato. | L'idioma della card (15.9: un nodo che cambia forma); niente testid doppi né stato in bozza | il pannello `MobileSheet` del registro voli: un secondo albero e una bozza per due soli campi |
| **D-7** | **Riepilogo del periodo** («Saldo iniziale al {from} · Saldo finale al {to}») sopra l'elenco, su ogni pagina; la **riga** «Saldo iniziale» nella sua posizione cronologica [Q-a = A: in fondo all'ultima pagina]. | P2 chiede la riga; con i più recenti in alto la riga sta a molte pagine di distanza, e il riepilogo rende leggibili i due saldi da qualunque pagina | solo la riga: un conto da 80 pagine mostrerebbe il saldo iniziale solo all'ottantesima |
| **D-8** | Export oltre il tetto: la **pagina** (che conosce il totale del periodo) passa a `ExportMenu` un **messaggio di non disponibilità** al posto del link; il 422 del server resta l'ultima linea, invariato. | Il JSON grezzo in una nuova scheda è il difetto; la pagina sa già il totale, quindi nessuna richiesta in più | scaricare via `fetch` + blob per intercettare il 422: cambia il meccanismo di download dei 9 consumatori di `ExportMenu` |
| **D-9** | La data dell'originale di una rettifica arriva dall'SQL (`reversalOfEffectiveDate`); il testo di ripiego `linked` e `linkedBadgeText` **si eliminano**. | `reversalOfId` ha una FK `SET NULL`: se è valorizzato, l'originale esiste, quindi la data c'è sempre. Karpathy: si toglie ciò che la propria modifica rende irraggiungibile | tenere il ripiego «per sicurezza»: un ramo che nessun dato può più raggiungere, con il suo test |
| **D-10** | **Niente preset** oltre al ritorno a «Ultimi 12 mesi»; niente link prima/ultima pagina; pagina sempre da 20. | Karpathy (nulla oltre il richiesto); il riepilogo copre il bisogno di vedere i saldi senza scorrere le pagine | preset «anno in corso / anno scorso / tutto»: utili, non chiesti (§6) |
| **D-11** | PDF: totali = **saldo iniziale e saldo finale del periodo**; via la riga «Saldo attuale del conto» e la lettura `getAccountOverview`. | Un estratto a periodo stampa i saldi del periodo; la riga «saldo attuale» rietichettata (12.9 F2) esisteva solo perché un saldo del periodo non c'era | tenere anche il saldo attuale: un terzo numero che con il periodo predefinito coincide col saldo finale |
| **D-12** | L'anteprima `recentMovements` di `GET /people/{id}/account` resta ordinata per inserimento. | Non è l'estratto conto e non ha consumatori in pagina (grep: solo l'API) | riordinarla: tocca un contratto fuori perimetro |
| **D-13** | Testi di elenco vuoto **nuovi per il periodo vuoto** (`table.emptyPeriod`, `mobile.emptyPeriod`); quelli di oggi restano per la persona **senza conto**. | «Nessun movimento in questo conto» è falso per un conto che ha movimenti fuori dal periodo | cambiare i testi esistenti: sbagliati per la persona senza conto, e tre e2e cambierebbero senza motivo |
| **D-14** | SQL grezzo in deroga alla regola di `date-only.ts:10-16` («mai raw SQL» per le date). | La window function non esiste in Prisma; la deroga ha già un precedente con la stessa protezione (`cash.service.ts:559-566`) | due query Prisma + somma cumulativa in JS: contraddice A13 («in SQL») |
| **D-15** | Gli e2e esistenti che leggono l'estratto con fixture a data fissa navigano con un **periodo esplicito largo** (helper unico); nessuna fixture viene spostata nei mesi recenti. | Indipendenza dalla data di esecuzione; le date passate di `my-account.spec.ts` servono a non sporcare gli aggregati del mese (lezione Billing-2 F4) | spostare le fixture a «oggi − N giorni»: inquina i KPI del mese corrente che altri spec asseriscono |
| **D-16** | `seed-demo.ts`: **una** ricarica di Marco De Santis datata 400 giorni fa, così il PO vede un saldo iniziale diverso da zero nel periodo predefinito. | Criterio di successo della CR §5 (richieste verificabili sull'app reale); oggi ogni movimento demo ha ≤ 74 giorni (`seed-demo.ts:157-171`, `:187-210`) | nessun dato demo: la riga «Saldo iniziale» varrebbe sempre 0,00 € sui dati del PO |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Contratto API (futura app Flutter)

`GET /api/v1/people/{id}/account/movements?page&pageSize&from&to[&format=xlsx&locale]`
`GET /api/v1/people/{id}/account/pdf?from&to&locale`

| Elemento | Dopo |
|---|---|
| `from`, `to` | `z.iso.date().optional()` su **entrambi** gli schemi; `.refine(v => !v.from \|\| !v.to \|\| v.from <= v.to, { message: 'from must not be after to', path: ['to'] })` → **422 `VALIDATION_ERROR`** (stesso testo e `path` di `cash.ts:189-192`). Uno shape condiviso estende `paginationQuerySchema`/`pdfQuerySchema` **prima** del refine (lo stesso «extend before refine» di `common.ts:29-33`). |
| Risposta JSON | busta AD-8 `{ items, total, page, pageSize }` **più** `from: date \| null`, `to: date \| null` (eco dei limiti applicati), `openingBalanceCents: int` (`SUM` dei movimenti con data valuta `< from`; 0 senza `from`), `closingBalanceCents: int` (`openingBalanceCents` + somma del periodo). `total` = movimenti del periodo. |
| Voce | i campi di oggi **più** `balanceAfterCents: int` (saldo dopo questo movimento, nell'ordine della chiave) e `reversalOfEffectiveDate: date \| null` (data valuta dell'originale; `null` ⇔ `reversalOfId` `null`). |
| Ordine | `effectiveDate DESC, createdAt DESC, id DESC` [Q-a = A]. |
| Senza conto | `{ items: [], total: 0, page, pageSize, from, to, openingBalanceCents: 0, closingBalanceCents: 0 }`, **senza** query sui movimenti (come oggi, `accounts.service.ts:366-369`). |
| Accesso | invariato: `assertReadAccess` prima di ogni query; `actorEmail` solo con `people.read`. |

`listAccountMovements(actor, personId, query)` resta l'unico punto d'ingresso (JSON, XLSX, PDF, le due pagine); `AccountStatementResult` diventa `PaginatedResult<AccountStatementItem> & { from; to; openingBalanceCents; closingBalanceCents }`. Le due pagine e i due export leggono solo da qui: **una** definizione del saldo progressivo.

### AD-2 — Il periodo nelle pagine

- **`lastTwelveMonthsRange(now = new Date()): DateRange`** in `src/lib/period-presets.ts` (accanto a `currentMonthRange` & co., stesso `romeDateParts`): `to` = oggi Roma, `from` = `to` meno 12 mesi con fine mese limitata. Pura, testabile con `now` iniettato.
- **`resolveStatementPeriod(searchParams: { from?: string | string[]; to?: string | string[] }, now?: Date): { from: string; to: string; explicit: boolean }`** in un modulo nuovo `src/lib/statement-period.ts` (due chiamanti: le due pagine). `explicit = true` solo se **entrambi** sono stringhe (non array), validi per `z.iso.date()` e con `from ≤ to`; in **ogni** altro caso (mancante, invalido, invertito, ripetuto) → il default, `explicit = false`. Una URL scritta a mano non produce mai un errore: produce il periodo predefinito, e il form mostra i limiti realmente applicati.
- Le due pagine: `searchParams` con `from`/`to`; `listAccountMovements` / `listOwnAccountMovements` con `{ page, pageSize: 20, from, to }`; clamp della pagina invariato (seconda chiamata solo fuori intervallo, `people/[id]/page.tsx:107-113`, `my-account/page.tsx:73-78`) ma sul totale **del periodo**.
- La redirect `people/[id]/account/page.tsx:21-26` inoltra anche `from`/`to` (stringhe), oltre a `page`.

### AD-3 — L'SQL dell'estratto (una istruzione, una fotografia)

Requisiti (il dev possiede la forma finale):
1. `prisma.$queryRaw(Prisma.sql\`…\`)` — `Prisma` come **valore** da `@/generated/prisma/client` (`Prisma.sql`, `Prisma.empty`: `internal/prismaNamespace.ts:50-51`). I limiti opzionali come frammenti (`Prisma.sql\`AND m."effectiveDate" >= ${from}::date\`` oppure `Prisma.empty`), **non** `(${from}::date IS NULL OR …)`: un predicato «opzionale» costringe il planner a un piano generico che non usa il range sull'indice.
2. Date legate **come testo** con `::date`; lette con `to_char(…, 'YYYY-MM-DD')`. Somme e conteggi `::bigint`, convertiti con `Number()` (un saldo resta molto sotto 2^53; `::int` andrebbe in overflow su dati assurdi invece di restituirli).
3. Saldo progressivo = `SUM("amountCents") OVER (ORDER BY "effectiveDate", "createdAt", "id" ROWS UNBOUNDED PRECEDING)` sulle **righe del periodo** (non della pagina), più il saldo iniziale. `ROWS` esplicito (la chiave è unica, ma `RANGE` è il default e confonde chi legge).
4. Pagina: `ORDER BY "effectiveDate" DESC, "createdAt" DESC, "id" DESC LIMIT ${take} OFFSET ${skip}` sulle righe del periodo già finestrate.
5. Il riepilogo (saldo iniziale, totale, somma del periodo) torna **anche** con pagina vuota (periodo vuoto, pagina oltre l'ultima): ad esempio una riga di riepilogo `LEFT JOIN` la pagina.
6. I dettagli si uniscono **solo** alle righe della pagina: `User.email` (attore), l'originale (`reversalOfEffectiveDate`) e l'esistenza di una rettifica collegata (`hasReversal`, via l'indice unico su `reversalOfId`). `actorEmail` si scarta nel mapper senza `people.read`, come oggi.
7. Nell'`ORDER BY` esterno si ordina per le **colonne** qualificate (`p."effectiveDate"`), mai per l'alias testuale di `to_char`, che ordinerebbe stringhe.

Schizzo di riferimento (non vincolante nella forma):

```sql
WITH period AS (
  SELECT m."id", m."effectiveDate", m."createdAt", m."amountCents",
         SUM(m."amountCents") OVER (ORDER BY m."effectiveDate", m."createdAt", m."id" ROWS UNBOUNDED PRECEDING) AS "cumulativeCents"
  FROM "AccountMovement" m
  WHERE m."accountId" = ${accountId} ${fromClause} ${toClause}
),
summary AS (
  SELECT (SELECT COALESCE(SUM(o."amountCents"), 0) FROM "AccountMovement" o
            WHERE o."accountId" = ${accountId} ${openingClause})::bigint AS "openingCents",  -- openingClause: AND o."effectiveDate" < from::date | AND FALSE
         (SELECT COUNT(*) FROM period)::bigint AS "total",
         (SELECT COALESCE(SUM("amountCents"), 0) FROM period)::bigint AS "periodCents"
),
page AS (SELECT * FROM period ORDER BY "effectiveDate" DESC, "createdAt" DESC, "id" DESC LIMIT ${take} OFFSET ${skip})
SELECT s.*, p."id", to_char(p."effectiveDate", 'YYYY-MM-DD') AS "effectiveDateText", p."createdAt", p."amountCents", p."cumulativeCents"::bigint,
       m."type", m."description", m."reversalOfId",
       to_char(orig."effectiveDate", 'YYYY-MM-DD') AS "reversalOfEffectiveDate",
       (rev."id" IS NOT NULL) AS "hasReversal", u."email" AS "actorEmail"
FROM summary s
LEFT JOIN page p ON TRUE
LEFT JOIN "AccountMovement" m ON m."id" = p."id"
LEFT JOIN "AccountMovement" orig ON orig."id" = m."reversalOfId"
LEFT JOIN "AccountMovement" rev ON rev."reversalOfId" = m."id"
LEFT JOIN "User" u ON u."id" = m."actorUserId"
ORDER BY p."effectiveDate" DESC, p."createdAt" DESC, p."id" DESC
```

(`period` è citata due volte, quindi Postgres la materializza una volta sola: su un periodo da migliaia di righe è il costo atteso, da misurare in AC 10.) Il doc-comment di `listAccountMovements` dice perché una istruzione (D-4), perché testo `::date` (D-14) e perché questa chiave (D-3).

### AD-4 — Indice e migrazione

`schema.prisma:627`: `@@index([accountId])` → `@@index([accountId, effectiveDate, createdAt, id])`, con una riga di doc che cita la story e la chiave. Migrazione `prisma/migrations/<timestamp>_account_movement_statement_index/migration.sql` generata con `prisma migrate dev --create-only` (attesa: `DROP INDEX "AccountMovement_accountId_idx"; CREATE INDEX "AccountMovement_accountId_effectiveDate_createdAt_id_idx" ON "AccountMovement"("accountId", "effectiveDate", "createdAt", "id");`, nome di 56 caratteri, sotto il limite di 63), commento in testa con story e motivo. Nessun `CONCURRENTLY` (DB di test, migrazioni in transazione). Verifica su un DB gemello, **mai** su `airmanager` mentre un arbitro è vivo: catena `migrate deploy` da zero verde; `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <gemello> --script` **vuoto**; `npx prisma generate`. Anche il doc-comment del modello (`schema.prisma:582-591`) va riletto: non cita l'ordine, quindi probabilmente resta.

### AD-5 — UI: form del periodo e riepilogo

In `account-section.tsx`, nel `card-body`, **dopo** i due riquadri in linea (ricarica, rettifica) e **sopra** l'elenco; **solo se `hasAccount`** (la persona senza conto resta com'è oggi).
- `<form>` con `aria-label` «Periodo» (`data-testid="account-period-form"`): due `DateInput` (`account-period-from`, `account-period-to`) con nome accessibile «Dal» / «Al» e testo visibile almeno sotto 640 px; **senza** `min`/`max` (19.3 AC 24 dichiara proprio questo filtro come esempio di `DateInput` senza `min`); bottone submit **«Applica»** (`account-period-apply`); bottone **«Ultimi 12 mesi»** (`account-period-reset`) **solo** quando `period.explicit`.
- Validazione all'invio: entrambi obbligatori (`period.required`), `from ≤ to` (`period.invalidRange`); errore in `<p role="alert" className="fld-error" data-testid="account-period-error">`, **nessuna** navigazione. Valido → `router.push(\`${basePath}?from=…&to=…\`, { scroll: false })` (la pagina riparte da 1; stringa costruita con `URLSearchParams` come `logbook-console.tsx:306-310`; `scroll: false` perché la card è a metà della scheda persona). «Ultimi 12 mesi» → `router.push(basePath, { scroll: false })`.
- ⚠️ `AccountSection` **non si rimonta mai** (nessun consumatore passa una `key`, `account-section.tsx:211-216`): lo stato locale dei due campi va legato al periodo applicato con una `key` del sotto-componente (`key={\`${from}:${to}\`}`), altrimenti dopo «Ultimi 12 mesi» i campi mostrerebbero ancora le date digitate prima.
- Riepilogo `data-testid="account-period-summary"`, su **ogni** pagina con conto: «Saldo iniziale al {from}» + importo (`account-period-opening`) · «Saldo finale al {to}» + importo (`account-period-closing`); `formatCents`, rosso (`stat-tone-bad`) solo se negativo, come il KPI.
- Classi proprie (`.account-period`, `.account-period-summary`), regole nuove in un blocco della story in `airops.css`: sopra 640 px una riga; sotto, una colonna, campi e bottoni ≥ 44 px (il bottone calendario a 44 è già la regola globale della 15.10). Nessun token nuovo, nessun colore letterale. Coerenza visiva con `.filter-date-range` (stessa coppia di `DateInput` in linea con il trattino), non una grafica nuova.

### AD-6 — UI: colonna «Saldo», riga «Saldo iniziale», badge, paginazione

- **Desktop**: colonna **«Saldo»** subito dopo «Importo» (`cols` a `account-section.tsx:297`: un `120px` in più dopo l'importo), cella `data-testid="account-movement-balance"`, `mono num`, allineata a destra, rossa solo se negativa. Va verificato a 1280 e a 800 px (binario 641-900) sulla faccia admin (con «Registrato da» e «Azioni»): nessuna colonna tagliata, la descrizione assorbe.
- **Mobile**: nella card, sotto l'importo, `<span className="mobile-row-note" data-testid="account-movement-balance-mobile">Saldo {x}</span>` (`.mobile-row-note` esiste già, `airops.css:2573`); l'`aria-label` della card aggiunge il saldo; lo sheet aggiunge la riga «Saldo» dopo «Importo» (`sheetDetailRows`, `:255-262`).
- **Riga «Saldo iniziale»** [Q-a = A]: **ultima riga dell'ultima pagina** quando `total > 0` (anche su una pagina sola); desktop `data-testid="account-opening-row"` (data = `from`, tipo «Saldo iniziale», descrizione e importo «—», saldo = saldo iniziale); mobile `data-testid="account-opening-row-mobile"`, un elemento **non interattivo** (non un `<button>`, fuori dall'ordine di tabulazione, senza la grafica «premibile» di `.mobile-row`: un modificatore come `.mobile-row-payout`, `airops.css:3449-3450`). Testid **diversi** da `account-movement-row(-mobile)`: nessun `toHaveCount` esistente cambia. Con `total = 0`: niente riga, il messaggio di periodo vuoto e il riepilogo.
- **Badge rettifica**: testo sempre `adjustmentBadge.ofDate` con `reversalOfEffectiveDate` (desktop `:391-395`, card `:481-487`, sheet `:549-550`); via `originalDateLabel`, il ramo `linked`, `linkedBadgeText` (`mobile-self.ts:40-50`) e i suoi test (`mobile-self.test.ts:36-46`). `rowById` resta per lo sheet.
- **Paginazione**: `pageHref` (`:264-266`) porta `{ page, from, to }` — `page` **per primo** — quando `period.explicit`, solo `{ page }` altrimenti (le URL di oggi restano identiche nel caso predefinito).
- **Vuoti** (D-13): con conto e periodo vuoto, `account-statement-empty` mostra `table.emptyPeriod` e `mobile-account-empty` mostra `mobile.emptyPeriod` (due stringhe diverse, perché i due alberi sono nel DOM a ogni larghezza, `account-section.tsx:67-74`); senza conto, i testi di oggi.

### AD-7 — Export sul periodo

- **Href** (le due pagine): `buildExportHref(\`/api/v1/people/${id}/account/movements\`, { from, to }, locale)` e `buildPdfExportHref(\`…/pdf\`, { from, to }, locale)` con il periodo **effettivo** (anche quello predefinito: l'API senza periodo restituisce lo storico, D-1).
- **Righe condivise**: un helper (es. `buildStatementExportRows(result, t, locale)`) produce righe piatte `{ date, typeLabel, description, amountCents | null, balanceCents, actorEmail }` nell'ordine dello schermo [Q-a = A] e **aggiunge in coda** la riga «Saldo iniziale» quando `from` c'è; XLSX e PDF lo usano entrambi (due chiamanti: un solo posto dove le due carte possono divergere).
- **XLSX** (`exports.service.ts:319-341`): colonne Data, Tipo, Descrizione, Importo, **Saldo**, [Registrato da]; Importo e Saldo numerici con `MONEY_NUM_FMT`; nella riga iniziale Importo vuoto.
- **PDF** (`:495-535`): stesse colonne (Saldo con `formatCents`), stessa riga iniziale; sottotitolo invariato (nome · periodo con entrambi i limiti); totali `[{ label: t('period.openingAt', { date }), value: opening }, { label: t('period.closingAt', { date }), value: closing }]`; senza `from` niente totale iniziale; senza `to` il totale finale si chiama `pdf.balance` («Saldo finale»). Via `getAccountOverview` dal `Promise.all` (`:502`), via `pdf.currentBalance`.
- Commenti da riscrivere: `:309`, `:485-493` (12.9: «il saldo è SEMPRE il saldo attuale»), `accounts.ts:122-131`, `registry.ts:620`.

### AD-8 — Export oltre il tetto: un messaggio, non un JSON

- I due tetti si spostano in **`src/lib/export-caps.ts`** (nuovo, nessun import): `EXPORT_MAX_ROWS = 10_000`, `PDF_EXPORT_MAX_ROWS = 2_000`, valori **invariati**. `exports.service.ts` li importa e li ri-esporta (gli unit di `exports.service.test.ts:46-47` restano com'erano). Motivo: la pagina server deve confrontarli col totale **senza** importare `exports.service.ts`, che trascina `@react-pdf/renderer` ed `exceljs` nel grafo della pagina.
- `ExportMenu` (`export-menu.tsx:35-41`) guadagna due prop opzionali: `pdfUnavailable?: string`, `xlsUnavailable?: string`. Valorizzata → al posto del link `<a>` un paragrafo non interattivo (`data-testid="export-menu-pdf-unavailable"` / `export-menu-xls-unavailable`) con l'etichetta (PDF/XLS) e il messaggio; nessun `href`. Prop omessa → render **identico** per gli altri consumatori (8 file in `src/app`). Una regola CSS nuova accanto a `.export-menu-panel` (`airops.css:2994`), leggibile anche nel bottom sheet a 375 px.
- Le pagine: `total > PDF_EXPORT_MAX_ROWS` → `pdfUnavailable = tExport('pdfTooLarge', { max: PDF_EXPORT_MAX_ROWS })`; `total > EXPORT_MAX_ROWS` → `xlsUnavailable = tExport('xlsTooLarge', { max: EXPORT_MAX_ROWS })` (ICU `{max, number}`: «2.000» in italiano).

---

## §2 — Acceptance Criteria

### A — Contratto API e servizio

1. **Schemi**: `listAccountMovementsQuerySchema` e `accountStatementPdfQuerySchema` accettano `from`/`to` opzionali (`z.iso.date()`); `from > to` → **422 `VALIDATION_ERROR`** con l'errore su `to`; una data invalida → 422 (unit sui due schemi; e2e: `GET …/movements?from=2026-02-01&to=2026-01-01` e `GET …/pdf` con gli stessi limiti → 422).
2. **Risposta** (AD-1): busta AD-8 più `from`, `to`, `openingBalanceCents`, `closingBalanceCents`; voci con `balanceAfterCents` e `reversalOfEffectiveDate`. **Senza** periodo: `from`/`to` `null`, `openingBalanceCents = 0`, `closingBalanceCents` = saldo attuale di `GET /people/{id}/account` (e2e). Persona senza conto: forma vuota con i due saldi a 0 e **nessuna** chiamata `$queryRaw` (unit).
3. **Ordine** [Q-a = A]: `effectiveDate DESC, createdAt DESC, id DESC`. e2e su un conto run-unique: percorrendo **tutte** le pagine con `pageSize=2`, l'unione degli id è esattamente l'insieme dei movimenti del periodo (nessun duplicato, nessuna omissione) e due movimenti con la **stessa** data valuta escono in ordine di inserimento inverso.
4. **Saldo progressivo**, e2e sullo stesso conto: per **ogni** voce, `balanceAfterCents` = `openingBalanceCents` + somma dei movimenti del periodo fino a quella voce compresa, nell'ordine crescente della chiave (calcolato dal test); la prima voce della pagina 1 ha `balanceAfterCents === closingBalanceCents`; l'ultima voce dell'ultima pagina ha `balanceAfterCents === openingBalanceCents + amountCents`. Dopo una **modifica in place** di un volo della persona (19.6: nuova data e nuova durata), il suo addebito sta alla nuova data e tutti i saldi tornano (stessa verifica, ripetuta).
5. **Limiti inclusivi**: fixture con un movimento su `from − 1`, uno su `from`, uno su `to`, uno su `to + 1`: i due interni sono nel periodo, quello su `from − 1` è nel saldo iniziale, quello su `to + 1` non è né nel periodo né nel saldo finale (e2e; date in una finestra passata run-unique, mai nel mese corrente).
6. **Una istruzione, nessuna transazione** (D-4): unit — `listAccountMovements` chiama `$queryRaw` **una** volta (dopo le due `findUnique` di persona e conto) e **mai** `$transaction`; i valori legati contengono `from`/`to` come stringhe `YYYY-MM-DD`, `take` e `skip`. e2e — `GET …/movements?page=999&from&to` risponde 200 con `items: []` e `total`, `openingBalanceCents`, `closingBalanceCents` corretti.
7. **Accesso invariato**: 403 prima di ogni query per lo statement di un altro (unit: `$queryRaw` mai chiamato); accesso proprio e staff come oggi; `actorEmail` presente solo con `people.read` (unit; il controllo «raw» di `my-account.spec.ts:191-194` resta verde).
8. **Data dell'originale**: una rettifica collegata a un movimento che sta su un'altra pagina **e** una collegata a un movimento **fuori dal periodo** portano entrambe `reversalOfEffectiveDate` = data valuta dell'originale (e2e API).

### B — Indice, migrazione, prestazioni

9. **Schema e migrazione** (AD-4): `@@index([accountId, effectiveDate, createdAt, id])` al posto di `@@index([accountId])`; una sola migrazione forward; su un gemello catena da zero verde e `migrate diff` **vuoto**; output verbatim nel Dev Agent Record.
10. **Prestazioni su un DB gemello** (§4.3): dataset ≥ 100 000 movimenti su ≥ 1 000 conti più **un conto con ≥ 5 000 movimenti** distribuiti su ≥ 3 anni (con ≥ 10 giorni da ≥ 3 movimenti nello stesso giorno e qualche rettifica collegata), `ANALYZE` eseguito. Verbatim nel record:
    - `EXPLAIN (ANALYZE, BUFFERS)` dell'istruzione di AD-3 per quattro sonde sul conto pesante — periodo predefinito pagina 1 e ultima pagina, storico completo pagina 1 e ultima pagina — **prima** (indice su `accountId`) e **dopo** l'indice nuovo; dopo: la lettura del periodo e la somma del saldo iniziale usano `AccountMovement_accountId_effectiveDate_createdAt_id_idx`, **Execution Time ≤ 50 ms** in ciascuna sonda;
    - tempo di servizio di `listAccountMovements` (script `tsx` sul gemello, 20 esecuzioni per sonda): **p95 ≤ 150 ms**;
    - XLSX dello storico completo del conto pesante (≥ 5 000 righe): generazione **≤ 3 s**;
    - PDF a ~100, ~500 e ~1 600 righe: tempi e ms/riga **riportati** (nessuna soglia: dato d'ingresso della 17.7);
    - correttezza in psql: il saldo progressivo dell'istruzione confrontato con un ricalcolo ingenuo (`SUM` correlata) su tutte le righe del conto pesante → **0** differenze.
    Se una soglia non regge: il dev si ferma, riporta `EXPLAIN` e una proposta, e **non** allenta la soglia da sé.
11. `airmanager_load` **mai scritto**; il gemello si elimina a fine misura (o si dichiara nel record che resta, con il nome).

### C — Il periodo nella UI

12. **Default** (AD-2): senza parametri, il periodo è `lastTwelveMonthsRange()`; unit con `now` iniettato: a mezzanotte di Roma in CET e in CEST (es. `2026-03-31T22:30:00Z` → `to` = `2026-04-01`, `from` = `2025-04-01`), il 29/02 (`2028-02-29` → `from` = `2027-02-28`), un giorno qualunque.
13. **Lettura dei parametri**: `resolveStatementPeriod` — coppia valida → `explicit: true`; mancante, invalida, invertita, solo un limite, array → default con `explicit: false` (unit, un caso per ramo). Le due pagine lo usano; la redirect `people/{id}/account` inoltra `from`/`to` (e2e: `/people/{id}/account?from=…&to=…` atterra su `/people/{id}?…` con lo stesso periodo).
14. **Form** (AD-5): «Dal», «Al», «Applica», e «Ultimi 12 mesi» solo con periodo esplicito. Una data vuota o `from > to` → messaggio `account-period-error` (`role="alert"`) e **nessuna** navigazione (e2e: l'URL non cambia). Un periodo valido → URL `?from=…&to=…` senza `page`, elenco e riepilogo del nuovo periodo; «Ultimi 12 mesi» → URL senza parametri e i due campi mostrano di nuovo il default (la `key` di AD-5).
15. **Paginazione col periodo**: con periodo esplicito i link portano `?page=N&from=…&to=…` (`page` per primo), senza periodo esplicito `?page=N` come oggi; una pagina fuori intervallo si riporta all'ultima **del periodo** (e2e).
16. **Riepilogo**: `account-period-summary` presente su **ogni** pagina di un conto, con i valori di `openingBalanceCents`/`closingBalanceCents` del periodo (e2e su valori noti).
17. **Saldo per riga**: colonna «Saldo» desktop (`account-movement-balance`), nota della card (`account-movement-balance-mobile`), riga «Saldo» nello sheet, con il valore di `balanceAfterCents` (e2e su valori noti, entrambe le facce).
18. **Riga «Saldo iniziale»** [Q-a = A]: compare come **ultima** riga dell'**ultima** pagina, desktop e mobile, con data `from` e il saldo iniziale; non c'è sulle altre pagine; non è contata da `account-movement-row(-mobile)`; la versione mobile non è focalizzabile (e2e: il Tab non la raggiunge); con periodo vuoto non c'è (e2e).
19. **Elenco vuoto** (D-13): conto con movimenti solo fuori dal periodo → `table.emptyPeriod` / `mobile.emptyPeriod` più il riepilogo; persona senza conto → testi di oggi e **nessun** form di periodo (gli e2e di `mobile-self-public.spec.ts:360-392` restano verdi senza modifiche ai testi).
20. **Badge robusto** (D-9): la rettifica il cui originale sta su un'altra pagina, o fuori dal periodo, mostra «Rettifica del movimento del {data dell'originale}» su desktop, card e sheet (riscrittura del test di `mobile-self-public.spec.ts:543`, già ridotto dalla 19.6); `grep -rn "linkedBadgeText" src` = 0.
21. **Due pagine, stesso comportamento**: scheda persona (staff e accesso proprio) e «Il mio conto» (base `/dashboard/my-account`, pilota e allievo) hanno form, riepilogo, colonna, riga iniziale ed export uguali (e2e su entrambe).

### D — Export

22. **Href**: sulle due pagine gli href di `export-menu-xls` e `export-menu-pdf` contengono il periodo effettivo (`from=…&to=…`), anche nel caso predefinito (e2e; le regex di `mobile-self-public.spec.ts:447-449` aggiornate).
23. **XLSX** (e2e con `exceljs`, come `exports.spec.ts:98-100`, + unit): righe = movimenti del periodo nell'ordine dello schermo + **una** riga finale «Saldo iniziale»; colonne Data, Tipo, Descrizione, Importo, Saldo, [Registrato da]; Saldo numerico con il formato monetario; nella riga iniziale Importo vuoto e Saldo = saldo iniziale.
24. **PDF** (unit su `renderReportPdf` mockato, + e2e 200 col periodo): colonne con Saldo, riga iniziale in coda, sottotitolo nome · periodo, totali «Saldo iniziale al {from}» e «Saldo finale al {to}» con i valori del periodo; `getAccountOverview` **non** chiamato (unit); senza `from` niente totale iniziale e il finale si chiama «Saldo finale».
25. **Tetto leggibile** (AD-8): su un conto run-unique con **2 001** movimenti nel periodo (fixture SQL via `e2e/db-fixtures.ts` della 19.3: `ADJUSTMENT` da +1/−1 centesimo, date in una finestra del 2010, periodo esplicito), il menu Export mostra `export-menu-pdf-unavailable` con il messaggio e **nessun** `export-menu-pdf`, mentre `export-menu-xls` resta un link; con 20 movimenti entrambi i link ci sono. Gli altri consumatori di `ExportMenu` non cambiano render (e2e esistenti di `exports`, `pdf-exports`, `cash-report` verdi).
26. **Tetti spostati**: `src/lib/export-caps.ts` senza import, valori 10 000 / 2 000; il 422 `EXPORT_TOO_LARGE` del server invariato (unit esistenti verdi).

### E — Responsive e accessibilità

27. **375 e 320 px**: form in una colonna, ogni controllo ≥ 44 px (campi, bottoni calendario, «Applica», «Ultimi 12 mesi»), nessun overflow orizzontale della pagina, `cardOverflows` vuoto sulle card con la nota del saldo e sulla card iniziale; il messaggio di non disponibilità leggibile nello sheet di Export. **1280 e 800 px**: form in una riga, griglia dell'estratto senza colonne tagliate sulla faccia admin.
28. **Tastiera e lettori**: il form ha nome accessibile «Periodo»; l'errore è annunciato (`role="alert"`) e il focus resta nel form; la card iniziale non è nell'ordine di tabulazione; le card dei movimenti dicono anche il saldo.

### F — i18n, seed, OpenAPI, residui, gate

29. **i18n** (§3.6): le 15 chiavi nuove in **entrambi** i file, le 2 rimosse assenti da entrambi; parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/en.json | sort)` vuoto); conteggio prima/dopo nel record.
30. **Seed** (D-16): `seed-demo.ts` con una ricarica di Marco De Santis a 400 giorni; `npx prisma db seed` e `npm run seed:demo` verdi su DB fresco; sulla scheda di Marco, nel periodo predefinito, il saldo iniziale è diverso da 0,00 € (screenshot). `seed.ts` e `seed-load.ts` invariati.
31. **OpenAPI servito**: `GET /api/v1/openapi.json` sull'app reale documenta `from`/`to` su `/movements` (oltre a `/pdf`), `openingBalanceCents`/`closingBalanceCents`/`from`/`to` nella risposta, `balanceAfterCents`/`reversalOfEffectiveDate` nella voce, l'ordine per data valuta (summary di `registry.ts:600` senza «most recent first» per inserimento) e, sul PDF, i totali del periodo (via la frase «always shows the account's CURRENT balance», `registry.ts:620`). `registry.test.ts` asserisce i due parametri e i due saldi.
32. **Residui**, tutti **0 righe** (esclusi `src/generated/`, `prisma/migrations/`, `_bmad-output/`, `docs/`):
    - `grep -rn "linkedBadgeText\|adjustmentBadge\.linked\|currentBalance" src messages e2e`
    - `grep -n "orderBy: \[{ createdAt: 'desc' }, { id: 'desc' }\]" src/server/services/accounts.service.ts` → resta **solo** quello di `readOverview` (D-12): esattamente 1 riga;
    - `grep -n "\$transaction" src/server/services/accounts.service.ts` → nessuna occorrenza dentro `listAccountMovements` (il record riporta le righe rimaste: `buildOverview`, `recordTopUp`, `recordAdjustment`).
33. **Doc-comment** riscritti dove diventano falsi: `account-section.tsx:3-19` (paginazione per periodo), `:230-234`, `mobile-self.ts:40-47`, `accounts.service.ts:279-302` e `:342-353`, `listOwnAccountMovements` (`:427-434`), `exports.service.ts:485-493`, `accounts.ts:113-137`, `my-account/page.tsx:15-44`, la redirect `people/[id]/account/page.tsx:9-20`. `ARCHITECTURE-SPINE.md` **invariato** (AD-3 già copre una `SUM` cumulativa: verificarlo e dirlo nel record); `CLAUDE.md` invariato salvo drift trovato.
34. **e2e indipendenti dalla data** (D-15): ogni spec che legge l'estratto in UI con fixture a data fissa naviga con il periodo esplicito largo (un solo helper in `e2e/helpers.ts`, es. `ALL_TIME_STATEMENT = { from: '2000-01-01', to: FAR_FUTURE_DATE }`); nessuna fixture spostata nel mese corrente. Elenco degli spec toccati nel record, ricavato dai comandi di §3.5.
35. **Gate**: `npm run gates` verde; e2e mirati verdi via `scripts/e2e.sh start <spec…>` (§4.2) su DB fresco; l'arbitro full-suite lo esegue la sessione principale (delta dei test dichiarato nel record).
36. **Verifica UI interattiva** (Playwright MCP o script throwaway, v. CLAUDE.md), screenshot a **1280**, **800** e **375** di: scheda persona admin con periodo predefinito (form, riepilogo, colonna Saldo), ultima pagina con la riga «Saldo iniziale» (desktop e card), errore di periodo invertito, «Il mio conto» del pilota a 375 (card con la nota del saldo, sheet con la riga Saldo), menu Export con il PDF non disponibile (sul gemello col conto pesante a storico completo, o sulla fixture di AC 25), scheda demo di Marco col saldo iniziale non nullo.

---

## §3 — Dev Notes: blast radius (misurato su `eef77ef`; rieseguire dopo 19.3-19.10)

### 3.1 — Schema e migrazione
- `prisma/schema.prisma`: doc del modello `:582-591`, `@@index([accountId])` `:627`. Ultime migrazioni su `eef77ef`: `20261101193941_remove_ppr_domain`, `20261101223000_remove_fiscal_code_aircraft_fields_hour_meter` (19.3-19.10 ne aggiungono: la nuova va **dopo l'ultima presente**).

### 3.2 — Server
- `src/server/services/accounts.service.ts`: tipi e select dello statement `:279-340` (al posto di `ACCOUNT_STATEMENT_SELECT`/`toStatementItem` un tipo di riga grezza e un mapper), doc + corpo di `listAccountMovements` `:342-403` (via la `$transaction` `:383-396`), `listOwnAccountMovements` `:427-444` (firma con `from`/`to` già presente; forma vuota con i due saldi). **Non** toccare `readOverview`/`buildOverview` (`:147-182`, 17.5) né i writer.
- `src/server/services/exports.service.ts`: tetti `:60-64` (→ `src/lib/export-caps.ts`), `ACCOUNT_MOVEMENT_TYPE_KEYS` `:311-317` (dopo la 19.6 senza `FLIGHT_CHARGE_REVERSAL`), XLSX `:319-341`, `periodSubtitle` `:481-483` (riuso), PDF `:485-535`.
- Route: `src/app/api/v1/people/[id]/account/movements/route.ts` e `…/pdf/route.ts` **invariate** nella forma (il periodo passa dallo schema); solo i commenti se citano il saldo attuale.

### 3.3 — Zod e OpenAPI
- `src/lib/schemas/accounts.ts`: query `:113-120`, PDF `:122-137`, voce `:139-170`, risposta `:172-175` (lo statement non è più solo `paginatedResponseSchema(item)`: `.extend` con i quattro campi).
- `src/lib/schemas/registry.ts`: `/movements` `:597-613`, `/pdf` `:615-626`. `registry.test.ts`: `:37`, `:75`, `:220-224`.

### 3.4 — UI
| File | Righe | Cosa |
|---|---|---|
| `people/[id]/page.tsx` | `searchParams` `:20-23`; `:72-125` (periodo, chiamate, clamp); label `:196-258` (nuove chiavi, `adjustmentBadge` senza `linked`); href `:260-261`; props `:388-403` | AD-2, AD-6, AD-7, AD-8 |
| `people/[id]/account/page.tsx` | `:4-7`, `:21-26` | inoltro di `from`/`to` |
| `my-account/page.tsx` | `:10-13`, `:70-84`, label `:86-121`, props `:132-149` | come la scheda persona |
| `people/[id]/account-section.tsx` | tipi `:37-48` (`balanceAfterCents`, `reversalOfEffectiveDate`), label `:50-113`, props `:115-157` (periodo, saldi, messaggi di export); badge `:230-242`; `sheetDetailRows` `:255-262`; `pageHref` `:264-266`; `cols` `:297`; `ExportMenu` `:319`; corpo `:332-531` (form e riepilogo dopo i riquadri `:345-368`, vuoti `:370-374` e `:443-446`, colonna `:376-428`, card `:448-497`, riga iniziale dopo l'ultima riga di ciascun albero); sheet `:538-587` | AD-5, AD-6 |
| `src/lib/mobile-self.ts` (+ `.test.ts`) | `:40-50`; test `:36-46` | via `linkedBadgeText` |
| `src/components/ui/export-menu.tsx` | props `:35-41`, voci `:63-94` | AD-8 |
| `src/styles/airops.css` | blocco 15.9 `:3342-3468` (riferimento); `.mobile-row-note` `:2573`; `.export-menu-panel` `:2994`, `:3187-3192` | blocco nuovo della story |
| `src/lib/period-presets.ts` (+ test) | dopo `currentYearRange` | `lastTwelveMonthsRange` |
| `src/lib/statement-period.ts` (+ test) | nuovo | `resolveStatementPeriod` |
| `src/lib/export-caps.ts` | nuovo | i due tetti |

### 3.5 — Blast radius e2e
Censimenti (da rieseguire dopo la 19.10):
- `grep -rln "account-movement-row\|account-statement-\|mobile-account-\|adjustment-badge\|account-balance" e2e` — su `eef77ef`: `account-adjustments`, `account-statement`, `accounts-topups`, `flight-reversal` (dalla 19.6 `flight-delete-update`), `flights`, `mobile-ink-targets`, `mobile-registries`, `mobile-self-public`, `my-account`, `people-management`.
- `grep -rn "effectiveDate" e2e/account-*.spec.ts e2e/accounts-topups.spec.ts e2e/my-account.spec.ts e2e/mobile-self-public.spec.ts e2e/people-management.spec.ts` — ogni data fissa letta poi in UI → periodo esplicito largo (AC 34).
- `grep -rn "account/movements\|account/pdf" e2e` — i chiamanti API senza periodo restano verdi per D-1 (`account-adjustments:176`, `membership-fee:90,161,206,231`, `mobile-membership-fee:150,181`, `billing:428`, `idempotency:54`, `my-account:191,270`, `mobile-self-public:175`, `exports:258,262`, `pdf-exports:186,225,249,252`, `account-statement:125`).
- `grep -rn 'data-testid\^=' e2e/` — nessun selettore `^=` su `account-*`/`export-menu-*` su `eef77ef`; rifarlo prima di fissare i testid nuovi.

Punti noti:
- **`my-account.spec.ts:197-223`** (paginazione): 21 ricariche datate 2020-2021 → con il default di 12 mesi **0 righe**: navigare col periodo largo; la regex `my-account\?page=2` regge perché `page` è il primo parametro.
- **`mobile-self-public.spec.ts`**: `:395-424` (paginazione: periodo largo, le regex `\?page=2` reggono), `:440-449` (href di export: aggiungere il periodo), `:543` (badge: AC 20), `:597-630` (sheet e pagina 2: periodo largo); `:360-392` invariato (persona senza conto).
- **`account-statement.spec.ts:60-88`**: l'ordine atteso (+50 prima di +100, stessa data `2026-07-01`) resta vero per `createdAt DESC`; periodo largo contro la data fissa.
- **`accounts-topups.spec.ts:62`**: il conto nuovo e vuoto mostra ora `table.emptyPeriod` (D-13) → asserzione aggiornata al testo nuovo.
- **`account-adjustments.spec.ts:109-113`**: la rettifica (oggi) resta prima della ricarica (`2026-07-01`); periodo largo contro la data fissa.
- **`flights.spec.ts:278-281`**: volo registrato da UI con la data di oggi → nel periodo predefinito, nessuna modifica attesa; `toContainText` sulla riga regge anche con il saldo che ripete le cifre dell'importo.
- **Nuovo `e2e/account-statement-period.spec.ts`** (project `chromium` `fullyParallel`, fixture run-unique, fuori dalla catena serializzata: non muta AppSettings e non asserisce aggregati globali): AC 1-6, 8, 13-18, 20-25, 27, 28. Il caso del periodo predefinito usa date relative a Roma (`todayRome()`/`addDaysIso()` della 19.3): una ricarica a −13 mesi (deve stare nel saldo iniziale) e una a −11 mesi (nel periodo), mai nel mese corrente.

### 3.6 — Chiavi i18n (in **entrambi** `messages/it.json` e `messages/en.json`)
- **Nuove (15)** — `AccountStatementPage.table.balance` («Saldo» / «Balance»); `AccountStatementPage.table.emptyPeriod` («Nessun movimento nel periodo selezionato.» / «No movements in the selected period.»); `AccountStatementPage.mobile.emptyPeriod` («Nessun movimento in questo periodo.» / «No movements in this period.»); `AccountStatementPage.openingRow` («Saldo iniziale» / «Opening balance»); `AccountStatementPage.period.label` («Periodo» / «Period»); `.period.from` («Dal» / «From»); `.period.to` («Al» / «To»); `.period.apply` («Applica» / «Apply»); `.period.reset` («Ultimi 12 mesi» / «Last 12 months»); `.period.required` («Inserisci entrambe le date.» / «Enter both dates.»); `.period.invalidRange` («La data iniziale non può essere successiva a quella finale.» / «The start date cannot be after the end date.»); `.period.openingAt` («Saldo iniziale al {date}» / «Opening balance on {date}»; `t.raw` sul client, `t(…, { date })` nel PDF); `.period.closingAt` («Saldo finale al {date}» / «Closing balance on {date}»); `Export.pdfTooLarge` («PDF non disponibile: il periodo ha più di {max, number} movimenti. Restringi il periodo o usa l'export Excel.» / «PDF not available: the period has more than {max, number} movements. Narrow the period or use the Excel export.»); `Export.xlsTooLarge` («Excel non disponibile: il periodo ha più di {max, number} movimenti. Restringi il periodo.» / «Excel not available: the period has more than {max, number} movements. Narrow the period.»).
- **Rimosse (2)** — `AccountStatementPage.adjustmentBadge.linked` (D-9), `AccountStatementPage.pdf.currentBalance` (D-11). `pdf.balance` **resta** (finale senza `to`). Le chiavi `reversalBadge.*` e `movementType.flightChargeReversal` sono della 19.6.
- Copy definitiva: 19.12 (glossario A20, «Estratto conto»).

---

## §4 — Piano di test

### 4.1 — Unit
- `accounts.service.test.ts` `:279-510`: `describe` di `listAccountMovements`/`listOwnAccountMovements` riscritti su `$queryRaw` (AC 2, 6, 7): accesso prima della query, 404, forma vuota senza query, mapping (`bigint` → `number`, date testuali, `actorEmail` scartato senza `people.read`, `hasReversal`, `reversalOfEffectiveDate`, `balanceAfterCents` = iniziale + cumulata), valori legati, nessuna `$transaction`. Il commento `:111-122` sul `mockTransaction` va aggiornato (non vale più per questa lettura).
- `exports.service.test.ts` `:519-640`: PDF (colonne, riga iniziale in coda, totali del periodo, nessuna `getAccountOverview`, cap); **nuovo** `describe` per `exportAccountMovementsXlsx` (non esiste oggi: colonne, Saldo numerico, riga iniziale, cap). I mock di `listAccountMovements` portano i quattro campi nuovi.
- `period-presets.test.ts` (AC 12), `statement-period.test.ts` (AC 13), schemi Zod (AC 1), `registry.test.ts` (AC 31), `mobile-self.test.ts` (via `linkedBadgeText`).
- **Env eager** (CLAUDE.md): `accounts.service.test.ts` mocka già mail e template; un `import { Prisma }` valore dal client generato non tocca `@/lib/env`, ma va verificato con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/accounts.service.test.ts src/server/services/exports.service.test.ts src/lib/statement-period.test.ts src/lib/period-presets.test.ts`.

### 4.2 — e2e (via `scripts/e2e.sh`, mai `playwright test` in foreground)
Mirati prima della consegna: `account-statement-period` (nuovo), `account-statement`, `accounts-topups`, `account-adjustments`, `my-account`, `mobile-self-public`, `people-management`, `person-detail`, `flights`, `flight-delete-update` (19.6), `exports`, `pdf-exports`, `cash-report`, `mobile-ink-targets`, `mobile-registries`, `membership-fee`, `idempotency`, `api-v1`. Run mirati ripetuti sullo stesso DB fanno scattare il lock anti-brute-force (CLAUDE.md, TD-6): prima di attribuire un rosso alla flake di login, la query su `LoginAttempt` e, se serve, il reset del DB (mandato R-19-p della sessione principale).

### 4.3 — Il DB gemello delle prestazioni (AC 9-11)
- Creazione nel container: `docker compose exec -T postgres createdb -U airmanager am_1911_perf`; `DATABASE_URL` da `.env` (`set -a; . ./.env; set +a`) con il solo nome del DB cambiato; `npx prisma migrate deploy` + `npx prisma db seed`. Se il classifier nega la creazione, chiedere alla sessione principale (HANDOFF: il reset del DB e2e richiede mandato; un gemello va chiesto allo stesso modo). **Mai** `airmanager_load` in scrittura, **mai** `docker compose down -v`.
- Dataset (AC 10) generato in SQL con `generate_series` (persone, conti, movimenti con `actorUserId` dell'admin del seed, id `'perf_' || g`), poi `ANALYZE "AccountMovement"`. «Prima» = indice su `accountId` (misurare prima di aggiungere la migrazione, oppure ricreare a mano l'indice vecchio sul gemello e poi ripristinare); «dopo» = migrazione applicata.
- Tempi di servizio, XLSX e PDF: script throwaway `tsx` dalla root del repo con `DATABASE_URL` del gemello che chiama i service veri (precedente: 19.6 §4.3); niente server, niente porta 3000.
- Screenshot di AC 36 sul conto pesante: solo se si può avviare l'app sul gemello **senza** toccare `.next` dell'arbitro (`next dev` su un'altra porta, dopo aver verificato che Next 16 scriva in una cartella separata); altrimenti la fixture di AC 25 sul DB e2e basta.

### 4.4 — Discriminanza (obbligatoria nel record, con sha256 del file prima/dopo)
- **(a) Ordine**: rimuovere `"createdAt"` dalla chiave dell'ordine (finestra e pagina) → l'e2e di AC 3 sulle date uguali **rosso** o instabile su ripetizione; ripristino byte-identico.
- **(b) Finestra sulla pagina**: calcolare la `SUM` cumulativa sulle righe della **pagina** invece che del periodo → l'e2e di AC 4 **rosso** dalla pagina 2; ripristino.
- **(c) Confini**: legare `from` come `Date` JS invece che testo `::date` ed eseguire la sonda di AC 5 con `TZ` di sessione non UTC sul gemello (`SET TIME ZONE 'Europe/Rome'` via `options` della connessione) → un movimento su `from` esce dal periodo; ripristino. Se il driver non permette di riprodurlo, dichiararlo e lasciare la prova al psql.
- **(d) Badge**: tornare a `rowById` → l'e2e di AC 20 **rosso**; ripristino.
- **(e) Tetto**: togliere `pdfUnavailable` dalla pagina → l'e2e di AC 25 **rosso** (il link PDF ricompare); ripristino.

### 4.5 — Gate
`npm run gates` (mai i quattro comandi verbosi separati) + i grep di AC 32 + la parità di AC 29 + gli e2e mirati. **Prima** di gates, build ed e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` (mai una build sotto un arbitro vivo, incidente AOG-1b in HANDOFF).

---

## §5 — Trappole note

1. **Date in SQL grezzo**: una `Date` JS si lega come `timestamptz` e sposta il confine col fuso della sessione: sempre testo `::date` in ingresso e `to_char` in uscita (D-14, `cash.service.ts:559-566`).
2. **Alias che oscura la colonna**: se `effectiveDate` esce come testo con lo stesso nome, un `ORDER BY "effectiveDate"` non qualificato nella SELECT esterna ordina stringhe; qualificare (`p."effectiveDate"`) o usare un alias diverso.
3. **`SUM`/`COUNT` tornano `bigint`** e Prisma li dà come `BigInt`: `Number()` nel mapper, mai un `BigInt` nel JSON (`JSON.stringify` lancia).
4. **Pagina vuota senza riepilogo**: con `LIMIT/OFFSET` oltre la fine una query «solo righe» restituisce zero righe e perde saldo iniziale e totale; il riepilogo deve tornare comunque (AC 6).
5. **`AccountSection` non si rimonta**: senza la `key` del form, dopo «Ultimi 12 mesi» i campi mostrano ancora le date vecchie (AD-5).
6. **Due alberi nel DOM**: ogni testo nuovo che compare su entrambe le facce va scelto con testid diversi o stringhe diverse (`account-section.tsx:67-74`); `emptyPeriod` desktop e mobile sono **due** stringhe.
7. **Selettori substring** (CLAUDE.md): «Al» è contenuto in «Saldo», «Totale», «Applica»…: negli e2e i campi del periodo si prendono per testid, mai con `getByLabel('Al')`. Dentro una riga il saldo può ripetere le cifre dell'importo («-200,00 €» due volte): `toContainText` regge, un `getByText(importo)` nella riga va in strict mode; per i valori, i testid delle celle.
8. **`page` per primo nell'URL**: le regex esistenti `\?page=2` reggono solo se il periodo viene dopo.
9. **Href di export col periodo**: `buildExportHref` mette i filtri **prima** di `format`/`locale` (`export-href.ts:11-19`): le regex che si aspettano `movements\?format=xlsx` vanno aggiornate (AC 22).
10. **Fixture e aggregati globali**: le fixture nuove stanno in finestre passate o run-unique, mai nel mese corrente (lezione Billing-2 F4, CLAUDE.md); quelle di AC 25 sono rettifiche da ±1 centesimo nel 2010 e non creano movimenti di cassa.
11. **`ExportMenu` ha 8 consumatori**: con le prop nuove omesse il render deve restare identico (gli e2e `exports`, `pdf-exports`, `cash-report`, `movements` leggono un solo link per voce).
12. **`src/generated/prisma`** è gitignored: `npx prisma generate` dopo lo schema.
13. **File in comune con 19.3-19.10** (banner): rifare i censimenti; in particolare le righe di `account-section.tsx` cambiano con la 19.6.
14. **Commenti storici** che dicono «most recent first» per inserimento o «il PDF stampa il saldo attuale»: il grep non li prende tutti; vanno riletti uno per uno (AC 33, lezione 13.4).

---

## §6 — Fuori scope DICHIARATO

- Motore PDF a stream e revisione dei tetti (2 000 / 10 000): **17.7** (qui solo misura, AC 10).
- `readOverview`/`buildOverview` e le altre letture interattive: **17.5** (qui se ne toglie una sola, dichiarata).
- Indice `AccountMovement(effectiveDate)` per le serie globali: **17.4**.
- Rifiuto delle date valuta future: **16.6a**.
- Preset di periodo («anno in corso», «anno scorso», «tutto lo storico»), link prima/ultima pagina, dimensione di pagina configurabile, memoria del periodo fra una visita e l'altra (D-10).
- Riordino dell'anteprima `recentMovements` (D-12).
- Revisione delle copy nuove: **19.12**.
- Migrare o ri-seminare `airmanager_load` (epic 17); aggiungere ai target perf (`scripts/perf/targets.json`) una sonda a periodo (facoltativo, da proporre alla 17.x).

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§1 punto 3, §2.1 riga 17, §4.0 R-19-n, §4.2 riga 19.11, §4.7 FR-26, §4.8 AD-3, §4.10 A13).
- PRD: `prds/prd-AirManager-2026-07-04/prd.md` (FR-26 `:241-242`, emendamento `:414`).
- Architettura: `ARCHITECTURE-SPINE.md` §AD-3 (`:47-51`).
- Piano epic 16-18: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.4, 17.5, 17.7; audit perf `_bmad-output/planning-artifacts/audit-2026-09-10/perf-load-report.md` F5 (`:174-178`), tabella `:87`.
- Precedenti: `3-2-account-statement.md` (statement e paginazione), `12-9-contabilita.md` AC 5 (`from`/`to` sul PDF), `14-6-area-personale-transazioni-profili.md` («Il mio conto»), `15-9-aree-self-pubblico-mobile.md` (card, sheet, due alberi), `19-3-*` AD-7 e §3.6 (`minDate`, `db-fixtures.ts`, `todayRome`), `19-6-*` D-13 e AD-3 (addebito in place), `cash.service.ts#getCashReport` (SQL grezzo con date testuali).
- `CLAUDE.md` (convenzioni e2e, gates, env eager, manutenzione); `docs/handoffs/HANDOFF.md` (ambiente, DB, gemelli, arbitro).

---

## Tasks / Subtasks

- [x] **T0 — Riallineamento** (tutti gli AC): `git log --oneline -12` (19.1-19.10 committate), `scripts/e2e.sh status`, `:3000` libero; leggere `account-section.tsx` e `exports.service.ts` dopo la 19.6, l'API di `DateInput`/`CalendarPopover` e `e2e/db-fixtures.ts`/`e2e/helpers.ts` dopo la 19.3; rieseguire i censimenti di §3.5 e correggere qui le righe slittate; esito di Q-19.11-a dalla sessione principale.
- [x] **T1 — Gemello e misura «prima»** (AC 10, 11): §4.3; `EXPLAIN` delle quattro sonde con l'indice vecchio (si può scrivere la query di AD-3 prima di toccare il codice dell'app).
- [x] **T2 — Schema e migrazione** (AC 9): AD-4; verifica sul gemello; `npx prisma generate`.
- [x] **T3 — Service e Zod** (AC 1-8): AD-1, AD-3; `accounts.ts`, `accounts.service.ts`; unit di §4.1.
- [x] **T4 — Export** (AC 22-26): `export-caps.ts`, helper delle righe, XLSX, PDF; unit.
- [x] **T5 — Periodo nelle pagine** (AC 12-13, 15, 21): `period-presets.ts`, `statement-period.ts`, le due pagine, la redirect; unit.
- [x] **T6 — UI** (AC 14, 16-20, 27-28): `account-section.tsx` (form, riepilogo, colonna, riga iniziale, badge, vuoti, paginazione), `ExportMenu`, `mobile-self.ts`, CSS.
- [x] **T7 — i18n** (AC 29): §3.6 su entrambi i file; parità misurata.
- [x] **T8 — OpenAPI e documenti** (AC 31, 33): `registry.ts`, `registry.test.ts`, doc-comment; verifica spine/CLAUDE.md.
- [x] **T9 — Seed** (AC 30): `seed-demo.ts`; `db seed` + `seed:demo` su DB fresco.
- [x] **T10 — e2e** (AC 34 e §3.5): spec nuovo, helper del periodo largo, spec esistenti; delta dei test.
- [x] **T11 — Misura «dopo» e discriminanze** (AC 10, §4.4): sonde, tempi, correttezza psql, (a)-(e) con sha256; eliminazione del gemello.
- [x] **T12 — Verifica** (AC 32, 35, 36): grep, `npm run gates`, e2e mirati via `scripts/e2e.sh`, screenshot 1280/800/375; Dev Agent Record compilato.

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), dev subagent `dev-19-11`, unico dev della story, 2026-11-03. Skill usate: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` e `ui-ux-pro-max`. Il brief è UI di prodotto dentro il design system AirOps, quindi della skill di design valgono solo coerenza, contrasto, target ≥ 44 px ed errori annunciati; nessun linguaggio visivo nuovo. Query `search.py "date range filter form validation inline error" --domain ux` e `"running balance ledger table tabular numbers"`: errore sotto il campo con `role=alert`, label visibili, tabella che non sfora a 375.

### §A — Riallineamento sul HEAD (T0) e righe slittate

- HEAD di partenza `53738a4` (19.1-19.10 committate, 19.12a/b come story file). `scripts/e2e.sh status` dava DONE `E2E_EXIT=0` (arbitro 19.10). `:3000` era libero. `.next/dev/types/validator.ts` non c'era, quindi nulla da spostare.
- **Q-19.11-a = A**, già ratificata nel file.
- Il corpo della story non è stato corretto (sezioni non modificabili dal dev). Le righe slittate rispetto a `eef77ef`, lette su `53738a4` prima di ogni modifica:
  - `schema.prisma` `@@index([accountId])` stava a `:626`, non `:627`;
  - `accounts.service.ts` tipi dello statement `:279-340` → `:280-340`, `listAccountMovements` `:342-403` → `:342-404`, `$transaction` `:383-396` → `:383-396`;
  - `exports.service.ts` tetti `:60-64` → `:60-64`, `ACCOUNT_MOVEMENT_TYPE_KEYS` `:311-317` → `:302-307` (la 19.6 ha già tolto `FLIGHT_CHARGE_REVERSAL`), PDF `:485-535` → `:495-545`;
  - `accounts.ts` query `:113-120` → `:113-119`, PDF `:122-137` → `:121-136`;
  - `registry.ts` `/movements` `:597-613` → `:626-642`, `/pdf` `:615-626` → `:644-657`;
  - `account-section.tsx` (dopo la 19.6): `cols` a `:293`, badge `:230-238`, `pageHref` `:260-262`, `ExportMenu` `:315`, `sheetDetailRows` `:251-258`;
  - `mobile-self.ts` `linkedBadgeText` `:40-50`, test `:36-46`;
  - `people/[id]/page.tsx` chiamate `:106`, `:112`, label `:196-257`, href `:259-260`;
  - `my-account/page.tsx` `:72`, `:77`, `:83-84`.
- Censimenti di §3.5 rieseguiti su HEAD:
  - (1) `account-movement-row|…` → `people-management`, `mobile-self-public`, `flight-no-charge`, `flight-delete-update`, `accounts-topups`, `account-statement`, `flights`, `account-adjustments`, `my-account`. `flight-reversal` non esiste più: la 19.6 l'ha sostituito con `flight-delete-update` e ha aggiunto `flight-no-charge`. `mobile-ink-targets` e `mobile-registries` non leggono più le righe, ma visitano le due pagine.
  - (2) date fisse lette in UI: `'2026-07-01'` (account-statement, accounts-topups, account-adjustments, people-management), `'2026-01-15'` (mobile-self-public, flight-delete-update), 2020-2021 (my-account, flight-no-charge, flight-delete-update).
  - (3) i chiamanti API senza periodo sono ancora 9 file e restano verdi per D-1.
  - (4) `data-testid^=` non tocca `account-*`, `export-menu-*` né i testid nuovi (`account-period-*`, `account-opening-row(-mobile)`, `account-movement-balance(-mobile)`, `account-opening-balance`, `export-menu-{pdf,xls}-unavailable`).
- API reali rilette: `DateInput` (prop trasparenti verso l'input, `min` → `minDate`, qui assente come da 19.3 AC 24); `e2e/helpers.ts` (`todayRome`, `addDaysIso`, `FAR_FUTURE_DATE`); `e2e/db-fixtures.ts` (pool `pg`, `ADMIN_USER`).

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 | ✅ | unit `src/lib/schemas/accounts.test.ts`: i 2 schemi × 4 casi, più i parametri della lista. e2e `account-statement-period:191`: 422 `VALIDATION_ERROR` su `movements` e `pdf` invertiti e su `2026-02-30`. |
| 2 | ✅ | unit: forma con `from/to` null, opening 0, `bigint`→number; persona senza conto → `$queryRaw` mai chiamato. e2e: senza periodo `closingBalanceCents` = `GET /account.balanceCents`, `total` 7. |
| 3 | ✅ | e2e: percorso di tutte le pagine da 2. Gli id sono **in ordine esatto** rispetto al ricalcolo del test (più forte dell'insieme), e i due movimenti del 15/03 escono in ordine di inserimento inverso. |
| 4 | ✅ | e2e: ogni `balanceAfterCents` è uguale al ricalcolo; prima voce = `closing`; ultima = `opening + amount`. **Volo modificato in place** (20/03 60' → 05/03 30'): stesso id di addebito, −120 € → −60 €, nuova data, tutti i saldi ricalcolati e riverificati. |
| 5 | ✅ | e2e: fixture su `from−1` (29/02), `from`, `to`, `to+1` (01/04, nel 2012). Opening = solo `from−1`, `total` 5, `to+1` escluso dal finale. |
| 6 | ✅ | unit: una sola `$queryRaw` dopo le due `findUnique`, mai `$transaction`; valori legati `['account_1','2026-07-01','2026-07-31','account_1','2026-07-01',10,20]`; testo `$2::date`/`$3::date`/`$5::date`, nessun `IS NULL OR`. e2e: `page=999` → 200, `items: []`, stesso riepilogo. |
| 7 | ✅ | unit: 403 prima di ogni query (`$queryRaw` mai chiamato), `actorEmail` solo con `people.read`. `my-account.spec.ts:189-194` verde. |
| 8 | ✅ | e2e: rettifica collegata a un originale **prima del periodo** (29/02) e a uno su **un'altra pagina** (01/03, pageSize 2): `reversalOfEffectiveDate` = data dell'originale. |
| 9 | ✅ | §C |
| 10 | ✅ | §D: tutte le soglie rispettate |
| 11 | ✅ | `airmanager_load` mai aperto in scrittura (nessun comando lo nomina se non il `\l`); gemelli eliminati (§J). |
| 12 | ✅ | unit `period-presets.test.ts`: 4 casi (giorno qualunque, CEST 2026-03-31T22:30Z, CET 2026-01-31T23:30Z, 29/02/2028). e2e `:436`: −13 mesi nel saldo iniziale, −11 mesi in elenco, href col periodo predefinito esatto. |
| 13 | ✅ | unit `statement-period.test.ts`: 7 casi, uno per ramo. e2e: `/people/{id}/account?from&to` atterra su `/people/{id}?from&to` con i campi valorizzati (`:302`), più `account-statement.spec.ts` (it ed en). |
| 14 | ✅ | e2e `:302`: periodo invertito e data vuota → messaggio `role=alert`, `aria-invalid` su «Al», URL invariato, focus nel form; periodo valido → `?from&to` senza `page`; «Ultimi 12 mesi» → URL nudo e campi di nuovo al default (la `key`). |
| 15 | ✅ | e2e: `?page=2&from=…&to=…` (`page` per primo); `page=999` → `2 / 2`; senza periodo esplicito il link resta `?page=N` (`mobile-self-public`, `my-account`). |
| 16 | ✅ | e2e: riepilogo su pagina 1, pagina 2 e periodo vuoto, con valori calcolati dal test. |
| 17 | ✅ | e2e: colonna desktop su 22 righe (20 + 2), nota della card a 375, riga «Saldo» nello sheet. |
| 18 | ✅ | e2e: ultima riga dell'ultima pagina (`nextElementSibling === null`), assente a pagina 1 e a periodo vuoto. La card mobile è un `DIV` senza focusabili e 40 Tab non la raggiungono mai. |
| 19 | ✅ | e2e: conto con movimenti solo nel 2012 nel periodo predefinito → «Nessun movimento nel periodo selezionato.» / «Nessun movimento in questo periodo.» + riepilogo; persona senza conto: testi di oggi, nessun form (`mobile-self-public` empty states verde senza modifiche). |
| 20 | ✅ | `mobile-self-public.spec.ts:513` riscritto: originale su pagina 2 (14/01) e in pagina (15/01) → card, desktop e **sheet** dicono la data; `grep linkedBadgeText src` = 0. |
| 21 | ✅ | e2e `:590`: «Il mio conto» con form, URL proprio, riepilogo, colonna, riga iniziale, export sull'id proprio, paginazione `my-account?page=2&from&to`, reset. |
| 22 | ✅ | e2e: href esatti col periodo esplicito e con quello predefinito; regex di `mobile-self-public` aggiornate. |
| 23 | ✅ | unit (exceljs): colonne, numeri, `numFmt`, riga iniziale in coda con Importo `null`. e2e: download vero (24 righe = intestazione + 22 + iniziale, ultima riga 50 € numerica). |
| 24 | ✅ | unit su `renderReportPdf` mockato: colonne con Saldo, righe nell'ordine dello schermo + iniziale, sottotitolo, totali «Saldo iniziale al» / «Saldo finale al», `getAccountOverview` mai chiamato; con `from` solo → «Saldo finale». e2e: 200 `%PDF-`. |
| 25 | ✅ | e2e `:539`: 2 001 rettifiche ±1 cent nel 2010 (netto +1) → `export-menu-pdf-unavailable` con il messaggio, nessun `export-menu-pdf`, XLS ancora link, 422 `EXPORT_TOO_LARGE` del server invariato, messaggio dentro lo sheet a 375; con 20 movimenti entrambi i link. `exports`, `pdf-exports`, `cash-report` verdi. |
| 26 | ✅ | `src/lib/export-caps.ts` senza import, 10 000 / 2 000; re-export da `exports.service.ts`; unit esistenti dei tetti verdi. |
| 27 | ✅ | e2e a 375 e 320: form in colonna, `targetsUnderFloor(form)=[]`, overflow 0, nessuno sbordo di card, card iniziale e riepilogo. Misura a 800: `.account-desktop-body` scrollWidth − clientWidth ≤ 1 (era **+160 px già prima** della colonna, +294 con la colonna: D-a). |
| 28 | ✅ | `getByRole('form', { name: 'Periodo', exact: true })` = 1; `role=alert`; focus nel form dopo «Applica» a 1280 e a 375; card col saldo nell'`aria-label`; card iniziale fuori dal Tab. |
| 29 | ✅ | §F |
| 30 | ✅ con deviazione | `db seed` e `seed:demo` verdi su gemello fresco **dopo** aver riparato una rottura della 19.10 (D-c); sulla scheda di Marco il saldo iniziale al 03/11/2025 è 250,00 € (§I). `seed.ts` e `seed-load.ts` invariati. |
| 31 | ✅ | `GET /api/v1/openapi.json` sull'app reale: query `[page, pageSize, format, locale, from, to]` su `/movements` e `[locale, from, to]` su `/pdf`; `AccountStatement` con `from, to, openingBalanceCents, closingBalanceCents`; voce con `balanceAfterCents, reversalOfEffectiveDate`; la frase «CURRENT balance» non c'è più. `registry.test.ts`: 2 test nuovi. |
| 32 | ✅ | §F |
| 33 | ✅ | doc-comment riscritti: `account-section.tsx` (testata, badge, `statementBasePath`, `cols`), `mobile-self.ts` (helper rimosso), `accounts.service.ts` (statement, `statementSql`, `listAccountMovements`, `listOwnAccountMovements`), `exports.service.ts` (tetti, blocco PDF), `accounts.ts` (query, voce, risposta), `my-account/page.tsx`, redirect, `registry.ts`. `ARCHITECTURE-SPINE.md` AD-3 **invariato**: «Il saldo è sempre `SUM(amountCents)` — mai un campo saldo mantenuto a mano» copre una `SUM` cumulativa calcolata alla lettura. `CLAUDE.md` invariato: nessun drift trovato. |
| 34 | ✅ | helper unico in `e2e/helpers.ts`: `ALL_TIME_STATEMENT = { from: '2000-01-01', to: FAR_FUTURE_DATE }` + `allTimeStatement(path, page?)`. Elenco degli spec in §G. |
| 35 | ✅ | §J |
| 36 | ✅ | §I |

### §C — Migrazione: catena da zero, `migrate diff`, psql

- File `prisma/migrations/20261103101004_account_movement_statement_index/migration.sql`, generato con `prisma migrate dev --create-only` sul gemello `am_1911_perf`; commento in testa (story, R-19-n, A13, D-3). È la 57ª migrazione, dopo `20261103100000_booking_drop_force_reason`:
  ```sql
  DROP INDEX "AccountMovement_accountId_idx";
  CREATE INDEX "AccountMovement_accountId_effectiveDate_createdAt_id_idx" ON "AccountMovement"("accountId", "effectiveDate", "createdAt", "id");
  ```
- Gemello fresco `am_1911_e2e` (`createdb` nel container): `npx prisma migrate deploy` da zero → «All migrations have been successfully applied.», poi `db seed` verde.
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` → `-- This is an empty migration.`, **exit=0**. `migrate status` → «Database schema is up to date!».
- `\d "AccountMovement"` → `"AccountMovement_accountId_effectiveDate_createdAt_id_idx" btree ("accountId", "effectiveDate", "createdAt", id)`. Il vecchio `_accountId_idx` non c'è più; restano `_flightId_key` e `_reversalOfId_key` (quest'ultimo serve il join `rev`).
- `npx prisma generate` fatto. Il flag `--shadow-database-url` di Prisma 6 non esiste in Prisma 7, quindi si è usato `--from-config-datasource` come la 19.10.

### §D — Prestazioni sul gemello `am_1911_perf`: dataset, EXPLAIN prima/dopo, tempi, correttezza

**Dataset** (SQL `generate_series`, poi `ANALYZE`): 1 199 conti × 90 movimenti dal 2023-05 + il conto pesante `perf_a_heavy`.
- Il conto pesante ha 6 000 movimenti dal 2023-05-01 al 2026-11-04 (~4,65 al giorno), con `createdAt` casuale dentro il giorno (non segue l'id), più 60 rettifiche collegate a 40 giorni dall'originale. Totale 6 060.
- Verbatim: `movements 113970 | accounts 1200`; `heavy 6060 | 2023-05-01 | 2026-11-30 | days_ge3 1282 | adjustments 60`.
- Periodo predefinito (2025-11-03..2026-11-03): 1 726 righe; ultima pagina OFFSET 1720 (pag. 87); storico OFFSET 6040 (pag. 303).

**EXPLAIN (ANALYZE, BUFFERS)** dell'istruzione di AD-3 (forma finale, `::text` sul tipo a parte), righe chiave verbatim:

| Sonda | Prima (`AccountMovement_accountId_idx`) | Dopo (`…_accountId_effectiveDate_createdAt_id_idx`) |
|---|---|---|
| 1 predefinito pag. 1 | `Bitmap Index Scan on "AccountMovement_accountId_idx" … rows=6060` (periodo) e di nuovo `rows=6060` (saldo iniziale) — **Execution Time: 6.365 ms** | `Bitmap Index Scan on "AccountMovement_accountId_effectiveDate_createdAt_id_idx" … rows=1726`, `Index Cond: (("accountId" = 'perf_a_heavy'::text) AND ("effectiveDate" >= '2025-11-03'::date) AND ("effectiveDate" <= '2026-11-03'::date))`; saldo iniziale `rows=4332`, `Index Cond: (("accountId" = …) AND ("effectiveDate" < '2025-11-03'::date))` — **Execution Time: 4.974 ms** |
| 2 predefinito ultima | idem — **6.268 ms** | idem — **4.764 ms** |
| 3 storico pag. 1 | `… rows=6060`, `Sort Method: quicksort Memory: 895kB` — **16.129 ms** | `Bitmap Index Scan on "…_accountId_effectiveDate_createdAt_id_idx" … rows=6060` — **12.735 ms** |
| 4 storico ultima | **15.010 ms** | **12.769 ms** |

Dopo, sia la lettura del periodo sia la somma del saldo iniziale usano l'indice nuovo, col range su `effectiveDate` nell'`Index Cond`. Tutte le sonde stanno ≤ 50 ms.

Il planner sceglie *bitmap heap scan + sort in memoria* (251 kB / 895 kB) invece di leggere l'indice in ordine: D-e.

**Tempi di servizio** (`listAccountMovements` vero, script `tsx` sul gemello, 20 esecuzioni per sonda dopo un warm-up, macchina scarica):

| Sonda | p50 | p95 | max |
|---|---|---|---|
| predefinito pag. 1 | 19,2 ms | 24,8 ms | 25,3 ms |
| predefinito ultima | 13,4 ms | 16,7 ms | 17,7 ms |
| storico pag. 1 | 23,3 ms | 25,3 ms | 29,2 ms |
| storico ultima | 19,2 ms | 23,7 ms | 27,4 ms |

Tutti con p95 ≤ 150 ms. Una prima misura con la suite e2e in parallelo dava un p95 massimo di 54,0 ms.

**XLSX** dello storico completo (6 060 righe + intestazione): **1 345 ms**, sotto i 3 s. Sotto carico e2e parallelo la misura era 2 803 ms.

**PDF** (dato d'ingresso della 17.7, nessuna soglia):

| Righe | Tempo | ms/riga |
|---|---|---|
| 99 + 1 iniziale | 1 438 ms | 14,4 |
| 510 + 1 | 7 632 ms | 14,9 |
| 1 632 + 1 | 48 635 ms | 29,8 |

Sotto carico: 27,1 / 29,6 / 45,9 ms/riga. Il costo per riga cresce con la lunghezza: TD-19.11-a.

**Correttezza in psql** (`correctness.sql`): l'istruzione di AD-3 su tutto lo storico del conto pesante, confrontata con una `SUM` correlata ingenua sulla stessa chiave → `rows_compared 6060 | differences 0`. Stessa prova sul periodo predefinito, col saldo iniziale → `1726 | 0`.

### §E — Discriminanze §4.4 (a)-(e) con sha256

sha256 prima dei mutanti e dopo il ripristino, **identici** (`diff` vuoto):
```
d8e8fc5ca80c6229db375933d762f3fb8205b1bf2edc94167c76dc8484ede3c4  src/server/services/accounts.service.ts
2f5e6a3e319ee5cf1274d7615c6c915743eff535d6479875b0a6412b602f283a  src/app/[locale]/dashboard/people/[id]/account-section.tsx
bbd23ec721bde93cbcfe456d6adf8b24314281212f98139310137be1ca83422e  src/app/[locale]/dashboard/people/[id]/page.tsx
```
Due build mutanti di produzione (M1 = a+d, M2 = b+e), ciascuna eseguita col server sul gemello e2e e `E2E_REUSE_SERVER=1`. Mutanti in test diversi, così ogni rosso ha una causa sola.

- **(a)** `"createdAt"` tolto dalla chiave (finestra, pagina, `ORDER BY` esterno) → `account-statement-period:191` **rosso 3/3** (`--repeat-each=3`), riga `:254`: due righe del 15/03 scambiate.
- **(b)** `SUM` cumulativa calcolata sulle righe della **pagina** → `:191` **rosso**: 4 saldi su 5 sbagliati (atteso `-6200`, ricevuto `-10500`…).
- **(c)** `from` legato come `Date` JS al posto del testo `::date`, sessione `TimeZone=Europe/Rome` (`options=-c TimeZone=Europe/Rome` nell'URL del gemello perf, via `tsx`): **non riproducibile col driver**. Corretto e mutante danno entrambi `total=1726`: l'adapter `pg` lega la `Date` in modo che Postgres la tratti come `date`. Prova lasciata al psql, come la story prevede: con la sessione su `Europe/Rome`, `"effectiveDate" >= '2025-11-03'::date` → **1726**, `>= '2025-11-03T00:00:00Z'::timestamptz` → **1721**. Le 5 righe del giorno `from` spariscono: è la trappola che il testo `::date` evita qualunque cosa faccia il driver.
- **(d)** badge di nuovo su `rowById` → `mobile-self-public:513` **rosso**: `adjustment-badge-mobile` atteso 2, ricevuto 1, perché l'originale sta su pagina 2.
- **(e)** `exportPdfUnavailable` tolto dalla scheda persona → `account-statement-period:539` **rosso** alla riga `:561`: `export-menu-pdf-unavailable` non trovato, il link PDF ricompare.

### §F — Grep di AC 32 e parità i18n (verbatim)

```
$ grep -rn "linkedBadgeText\|adjustmentBadge\.linked\|currentBalance" src messages e2e   (escluso src/generated)
(nessuna riga)
$ grep -n "orderBy: \[{ createdAt: 'desc' }, { id: 'desc' }\]" src/server/services/accounts.service.ts
164:    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],          ← readOverview (D-12), l'unico rimasto
$ grep -n '\$transaction' src/server/services/accounts.service.ts
181:  return prisma.$transaction((tx) => readOverview(tx, account));     ← buildOverview
232:  return prisma.$transaction(async (tx) => {                         ← recordTopUp
698:  const { balanceBeforeCents, balanceAfterCents } = await prisma.$transaction(async (tx) => {   ← recordAdjustment
```
Nessuna di queste è in `listAccountMovements`, `:453-497`. **Per la 17.5**: `listAccountMovements` non ha più la sua `$transaction` interattiva (una `$queryRaw`), ed `exportAccountStatementPdf` non legge più `getAccountOverview`. Restano alla 17.5 `buildOverview`/`readOverview` e i due writer.

i18n: 1 616 chiavi per file prima, **1 629** dopo (+15 −2 = +13).
- Nuove: `AccountStatementPage.table.{balance, emptyPeriod}`, `.mobile.emptyPeriod`, `.openingRow`, `.period.{label, from, to, apply, reset, required, invalidRange, openingAt, closingAt}`, `Export.{pdfTooLarge, xlsTooLarge}`.
- Rimosse: `adjustmentBadge.linked`, `pdf.currentBalance`.
- Parità: `diff <(jq … it.json | sort) <(jq … en.json | sort)` → **vuoto**.
- Round-trip JSON byte-identico verificato prima dell'edit (`json.dumps(indent=2)+'\n' == raw`).

### §G — Delta test (unit ed e2e, prima/dopo; spec toccati per AC 34)

- **Unit**: 2 153 → **2 178** (+25).
  - `accounts.service.test.ts`: statement riscritto su `$queryRaw` (11 test al posto di 10) e `listOwn` (2 riscritti).
  - `exports.service.test.ts`: PDF (6 al posto di 5), describe nuovo XLSX (3).
  - `schemas/accounts.test.ts` nuovo (9), `statement-period.test.ts` nuovo (7), `period-presets.test.ts` +4, `registry.test.ts` +2, `mobile-self.test.ts` −2 (`linkedBadgeText`).
  - Senza env: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 5 file del §4.1 → verdi. L'import valore `Prisma` del client generato non trascina `@/lib/env`.
- **e2e**: 598 → **604 atteso** (+6, tutti in `e2e/account-statement-period.spec.ts`, project `chromium`, fuori dalla catena). `npx playwright test --list` → `Total: 604 tests in 68 files`. Nessun test esistente aggiunto o rimosso: `mobile-self-public:513` è riscritto, non nuovo.
- **Spec toccati per AC 34 (periodo largo)**: `my-account` (3 navigazioni + `page=999`), `account-statement` (redirect it/en e «Il mio conto»), `account-adjustments` (badge), `mobile-self-public` (9 navigazioni + test del badge), `flight-no-charge` (1), `flight-delete-update` (4).
- **Altri spec toccati**: `accounts-topups` (testo nuovo del periodo vuoto, D-13); `mobile-self-public` (regex href AC 22; scrim cliccato in alto sullo sheet admin; `coveredControlsAtBottom` che esenta la top bar sticky, D-d).
- **Invariati e verificati**: `flights.spec.ts:282` (volo di oggi), `people-management` (solo KPI).

### §H — Deviazioni motivate

- **D-a — Griglia dell'estratto riprogettata nelle larghezze (AC 27).** Misurato sulla faccia admin, prima della correzione:
  - a 1280 la colonna «Saldo» lasciava alla Descrizione **0 px**;
  - a 800 (fascia 641-900) la griglia sforava di 294 px, ma sforava di **160 px già prima della story**: descrizione a 0, «Registrato da» e «Azioni» oltre il bordo.

  Cosa ho cambiato:
  - **tracce** rimisurate: 88/128/1fr/100/100/150/164 px invece di 104/150/1fr/120/(120)/170/170, `column-gap` 10 su questa griglia. A 1280 la descrizione è ~140 px;
  - il **template** passa da `grid-template-columns` inline per riga a una custom property `--account-cols` sul contenitore, perché una media query non può battere uno stile inline (lezione R-15.8a-f);
  - **nella fascia 641-900** la faccia admin diventa due righe sugli stessi nodi: data, tipo, importo, saldo e azione sopra, descrizione e «registrato da» sotto (`grid-template-areas`, figli per posizione). A 800 lo sforo è ≤ 1 px. La faccia self, con 4 colonne fisse, ci sta e non cambia forma.

  È UI della story, non un'assunzione di dominio.
- **D-b — `{max, number}` in italiano dà «2000», non «2.000».** CLDR `it` raggruppa da 5 cifre, quindi il tetto Excel è «10.000» e quello PDF «2000». L'aspettativa «2.000» del §AD-8 non regge. Chiave e ICU sono quelli di §3.6; il test e2e asserisce «2000».
- **D-c — `seed:demo` rotto dalla 19.10 (AC 30).** Su DB fresco falliva a `book(admin, 'francesca.romano…')` con `REQUIREMENTS_NOT_MET` `BALANCE` (2 850 contro 13 800 cent); poi, con l'admin in deroga, sulle due richieste pilota di Chiara (13 900 contro 19 800) e Davide (−9 425 contro 20 700).

  Correzione minima in `prisma/seed-demo.ts`:
  - `force: true` sulle 3 prenotazioni dell'admin, lo stesso idioma dei voli demo (19.9 D-15);
  - due ricariche a −3 giorni (Chiara +200 €, Davide +500 €), così le loro richieste nascono `PENDING` passando i controlli.

  Dopo: «Seed: 16 top-ups recorded … 6 bookings ready (3 approved, 2 pending, 1 denied) … Demo seed complete», exit 0. Causa: la 19.10 (requisiti delle prenotazioni, controllo del saldo) ha reso le prenotazioni del seed demo soggette al saldo e non ha rieseguito `seed:demo`, quindi la rottura le è sfuggita. Opzione A **approvata dal team lead** (2026-11-03): deroga solo sulle prenotazioni admin; le due auto-prenotazioni dei piloti, che non possono derogare, passano grazie a una ricarica minima e non con `force`.
- **D-d — Guardia `coveredControlsAtBottom` di `mobile-self-public`.** Con il form del periodo la pagina è più alta e, scrollata in fondo, un controllo (`export-menu-trigger`, `account-period-to`) può finire **sotto la top bar sticky** (misurato: `account-period-to top=13..57 covered by <DIV class="mobile-topbar-sub">`). È la normale sovrapposizione di un header sticky, che si annulla scrollando; la guardia esiste per la tab bar in basso. Ora esenta solo un `hit` dentro `.mobile-topbar`, col motivo scritto nel doc-comment.
- **D-e — Ordine della finestra.** D-3 prevedeva che «la finestra legge le righe già ordinate». Misurato, il planner preferisce *bitmap index scan + sort in memoria* (quicksort 251-895 kB, 3-4 ms) a una scansione ordinata dell'indice; il range sull'indice nuovo c'è comunque e i tempi sono sotto le soglie. Nessun hint aggiunto.
- **D-f — Riga iniziale negli export.** Va in coda **quando c'è `from`** (AD-7 alla lettera), anche con 0 movimenti nel periodo; sullo schermo la riga appare solo con `total > 0` (AD-6). Il file di un periodo vuoto dice comunque il saldo.
- **D-g — Testid e helper non nominati dalla story:**
  - `account-opening-balance`, la cella saldo della riga iniziale, distinta da `account-movement-balance`, così i conteggi per riga non la vedono;
  - `seedAccountAdjustments` in `e2e/db-fixtures.ts`: `ADJUSTMENT` su date qualunque, `createdAt` in ordine d'array;
  - `ALL_TIME_STATEMENT` + `allTimeStatement()`, un solo helper.
- **D-h — Redirect `/account`.** Inoltra `from`/`to` solo se stringhe; un parametro ripetuto si perde e la destinazione applica il default, come farebbe sul proprio URL.
- **D-i — Nota «non disponibile».** Tiene il tag mono `PDF`/`XLS` delle voci-link per coerenza visiva, quindi si legge «PDF · PDF non disponibile: …». Ripetizione accettata a favore dell'allineamento con le voci; da rivedere nella 19.12 (copy).

### §I — Verifica UI (screenshot)

Niente Playwright MCP: script `playwright-core` su `~/.cache/ms-playwright/chromium-1228`, app di produzione su `localhost:3000` puntata ai gemelli (`am_1911_e2e`, poi `am_1911_demo`). Persona con 23 movimenti (1 a febbraio 2012, 22 a marzo), una ricarica di ottobre 2026 e una rettifica collegata di oggi.

- **1280**:
  - periodo predefinito: form in una riga, riepilogo, periodo vuoto;
  - periodo esplicito pagina 1: colonna Saldo e descrizione visibile;
  - ultima pagina: la riga «Saldo iniziale» chiude la tabella;
  - periodo invertito: bordo rosso su «Al» e messaggio sotto;
  - tema scuro: contrasti dei toni ok/bad di `stat-tone-*`.
- **800**: griglia admin su due righe, nessuna colonna oltre il bordo (`scrollWidth 642 = clientWidth 642`; prima della correzione 936/642).
- **375**:
  - form in colonna (Dal, Al, Applica + Ultimi 12 mesi a 44 px), riepilogo chiave/valore;
  - card con «Saldo 315,73 €» sotto l'importo, card «Saldo iniziale» in fondo;
  - sheet con la riga «Saldo» dopo «Importo»;
  - errore annunciato;
  - **320**: overflow 0.
- **Menu Export col PDF non disponibile** (fixture di AC 25, desktop e sheet a 375): coperto dall'e2e `:539`, con riquadro nel viewport e nessuno sbordo.
- **Demo di Marco De Santis** (`am_1911_demo`, `db seed` + `seed:demo`): nel periodo predefinito, «Saldo iniziale al 03/11/2025 **250,00 €**», «Saldo finale al 03/11/2026 394,25 €» uguale al saldo attuale, riga iniziale in fondo; href XLS `…?from=2025-11-03&to=2026-11-03&format=xlsx&locale=it`.

Gli screenshot erano nello scratchpad di sessione (`shots/`), non committati.

### §J — Gate ed esiti verbatim

- `npm run gates` (ultimo, sul codice committato): `PASS lint (44s)`, `PASS typecheck (8s)`, `PASS test (18s) — Tests 2178 passed (2178)`, `PASS build (50s)`. Prima di ogni build: `:3000` libero o mio, nessun run e2e vivo.
- **Serie e2e finale** (`scripts/e2e.sh start` con `E2E_REUSE_SERVER=1`, `CI=1` dello script, gemello `am_1911_e2e` **ricreato fresco**, build del codice committato), project `chromium`, 19 spec: `account-statement-period`, `account-statement`, `accounts-topups`, `account-adjustments`, `my-account`, `mobile-self-public`, `people-management`, `person-detail`, `flights`, `flight-delete-update`, `flight-no-charge`, `exports`, `pdf-exports`, `cash-report`, `mobile-ink-targets`, `mobile-registries`, `membership-fee`, `idempotency`, `api-v1` → **178 passed (5.3m)**, `E2E_EXIT=0`.
- **Catena**: `mobile-membership-fee.spec.ts --no-deps --workers=1 --retries=0` → **2 passed**.
- **Serie precedente** (stesso elenco, gemello non fresco, prima di D-d): 175 passed, 2 failed e 1 flaky.
  - I 2 failed erano la guardia di D-d, poi corretta e riverificata (`mobile-self-public` + `accounts-topups`: 20 passed).
  - Il flaky era `accounts-topups:130`, con `apiRequestContext.post: read ECONNRESET` su `POST /api/v1/people`: l'ECONNRESET infrastrutturale noto (TD-19.10-g), non attribuibile.
- **Stato della macchina a fine lavoro**:
  - gemelli `am_1911_perf`, `am_1911_e2e` e `am_1911_demo` **eliminati**; `pg_database` = `airmanager`, `airmanager_audit`, `airmanager_load`, `postgres`, template;
  - `airmanager` non toccato (nessuna migrazione applicata lì: la nuova la applicherà il reset dell'arbitro); `airmanager_load` e `airmanager_audit` mai toccati;
  - `:3000` libero (server fermati per PID);
  - `.next` = build dell'ultimo `npm run gates`;
  - scratchpad: un `record.md` presente lì apparteneva a un'altra sessione (19.6) ed è stato lasciato com'è.
- **Atteso all'arbitro**: **604**.

### TD (§7)

- **TD-19.11-a** — motore PDF: 14-30 ms/riga a macchina scarica (45,9 sotto carico), crescente con la lunghezza; un periodo di 12 mesi di un conto attivo (1 600 righe) costa ~49 s. Dato d'ingresso della 17.7 (stream, tetto).
- **TD-19.11-b** — il badge «Rettifica del movimento del …» resta tagliato nella cella Tipo del desktop (128 px; tagliato anche a 150 px prima della story) e si legge intero solo nello sheet. Pre-esistente, non allargato.
- **TD-19.11-c** — `prisma/seed-demo.ts`: le date delle prenotazioni e delle ricariche demo sono relative a oggi, quindi i saldi dei piloti demo dipendono dal giorno di esecuzione. La correzione di D-c regge con margine (Davide da −94 € a +406 € contro i 207 € della richiesta più cara), ma non è una garanzia formale.
- **TD-19.11-d** — la regex di AC 22 in `mobile-self-public` accetta qualsiasi coppia di date nel periodo predefinito; il valore esatto è asserito solo in `account-statement-period:436`, che lo ricalcola dalla data di Roma. Tra le 00:00 e le ~00:01 di Roma test e server possono vedere giorni diversi: è la fascia nota TD-19.10-a/b.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `eef77ef`).
- 2026-11-03 (dev 19.11): implementati tutti i 36 AC (T0-T12). Contratto API additivo (D-1); una `$queryRaw` per pagina, saldi e totale, nessuna transazione; indice (accountId, effectiveDate, createdAt, id); UI delle due pagine su due facce; export sul periodo; messaggio sul tetto; OpenAPI; i18n +15/−2; seed demo (più la riparazione della 19.10, D-c); 6 e2e nuovi e 6 spec resi indipendenti dalla data. Gate verdi, serie mirata 178/178 su gemello fresco, discriminanze (a)(b)(d)(e) rosse e (c) dimostrata in psql.

### File List

- `prisma/schema.prisma` — indice dello statement (D-3)
- `prisma/migrations/20261103101004_account_movement_statement_index/migration.sql` — nuovo
- `prisma/seed-demo.ts` — ricarica di Marco a 400 giorni (D-16); deroga sulle prenotazioni admin e 2 ricariche (D-c)
- `src/server/services/accounts.service.ts` — statement su una `$queryRaw`, tipi, forma vuota
- `src/server/services/accounts.service.test.ts`
- `src/server/services/exports.service.ts` — tetti re-esportati, righe condivise, XLSX e PDF sul periodo
- `src/server/services/exports.service.test.ts`
- `src/lib/export-caps.ts` — nuovo
- `src/lib/statement-period.ts`, `src/lib/statement-period.test.ts` — nuovi
- `src/lib/period-presets.ts`, `src/lib/period-presets.test.ts` — `lastTwelveMonthsRange`
- `src/lib/schemas/accounts.ts`, `src/lib/schemas/accounts.test.ts` (nuovo)
- `src/lib/schemas/registry.ts`, `src/lib/schemas/registry.test.ts`
- `src/lib/mobile-self.ts`, `src/lib/mobile-self.test.ts` — via `linkedBadgeText`
- `src/components/ui/export-menu.tsx` — `pdfUnavailable`/`xlsUnavailable`
- `src/app/[locale]/dashboard/people/[id]/account-section.tsx` — form, riepilogo, colonna, riga iniziale, badge, vuoti, paginazione, griglia
- `src/app/[locale]/dashboard/people/[id]/page.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx` — inoltro del periodo
- `src/app/[locale]/dashboard/my-account/page.tsx`
- `src/styles/airops.css` — blocco 19.11
- `messages/it.json`, `messages/en.json`
- `e2e/account-statement-period.spec.ts` — nuovo
- `e2e/helpers.ts` — `ALL_TIME_STATEMENT`, `allTimeStatement`
- `e2e/db-fixtures.ts` — `seedAccountAdjustments`
- `e2e/my-account.spec.ts`, `e2e/account-statement.spec.ts`, `e2e/account-adjustments.spec.ts`, `e2e/accounts-topups.spec.ts`, `e2e/mobile-self-public.spec.ts`, `e2e/flight-no-charge.spec.ts`, `e2e/flight-delete-update.spec.ts`
- `_bmad-output/implementation-artifacts/19-11-estratto-conto-periodo-progressivo.md` — questo record

### Change Log

- 2026-11-03 — dev 19.11: implementazione completa, `feat` `0556850` (SQL, migrazione, service, Zod, OpenAPI, export, UI desktop/mobile delle due pagine, i18n, seed, unit, e2e); Status → review.
