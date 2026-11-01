---
baseline_commit: 3876e72
---

# Story 19.6: Volo senza addebito e cancellazione definitiva

Status: **ready-for-dev** — 2026-11-01. **Q-19.6-a RATIFICATA dal PO = B** (tariffe obbligatorie anche senza addebito — v. decisione sotto la domanda); la story era scritta con la raccomandazione **A**; l'alternativa B tocca solo AD-5 punto 3, AC 19 e il doc dello schema `flightBreakdownSchema`. **Modello dev: Opus 5 xhigh (UI)**: la story scrive codice UI su sei superfici (form volo con il nuovo `Toggle`, conferma di cancellazione desktop, secondo passo dello sheet mobile, riga e card del registro, sheet di dettaglio, scheda persona) oltre a schema, migrazione distruttiva, service, route, OpenAPI, seed ed e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Chiave sprint-status: `19-6-volo-senza-addebito-cancellazione-definitiva`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` di questo file è misurato su **`3876e72`** (HEAD al 2026-11-01: 19.1 committata, 19.2-19.5 solo come story file). Il dev della 19.6 parte **DOPO il commit di 19.1, 19.2, 19.3, 19.4 e 19.5**, che toccano **gli stessi file**:
> - **19.2** toglie da `flights.service.ts` il contaore (`decreaseHourMeterForReversal` `:1046-1073`, il parametro `aircraftHourMeterMinutes` del core, l'ultimo `tx.aircraft.update`) e `notes`/`hourMeterStart`/`hourMeterEnd`; il lock `Aircraft` resta ma seleziona `"id"`; cancella 5 e2e (fra cui `flights.spec.ts` **E7**, che conteneva una chiamata a `/cancel`); riscrive `seed-load.ts` nelle stesse fasi di questa story.
> - **19.3** aggiunge `Flight.aircraftPriceCategory` (NOT NULL), `OriginalFlightIdentity.aircraftPriceCategory` e la regola **Q-19.3-b** dentro `correctFlight`/`resolveFlightInput`, oltre a una sua migrazione.
> - **19.5** riduce `FlightType` a `TOURISM`/`SCHOOL`, porta velivolo/pilota/istruttore/tipo su `SearchCombobox` e introduce la primitiva **`Toggle`** (`src/components/ui/`, `role="switch"`, `aria-checked`) che questa story riusa per «Senza addebito». Prima di scrivere il toggle va letta la **sua API reale** (props, inoltro di `data-testid`).
> - 19.4 non tocca i voli, ma tocca seed ed e2e delle persone.
>
> Effetto atteso: righe slittate e alcuni blocchi già spariti. **Prima di scrivere una riga**: `git log --oneline -8`, poi rieseguire i **censimenti di §3** (sono comandi, non elenchi di cui fidarsi) e correggere in questo file le righe slittate (T0).
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (convenzioni e2e: `getByLabel`/`hasText` sono substring, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, unit ed env eager, manutenzione del file); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §2.3 «Cancellazione volo», §4.0 **R-19-a/c/d/h**, §4.2 riga 19.6, §4.3 (16.5, 16.6a, 16.6b), §4.8 (AD-3, AD-6), §4.10 **A9/A10/A12**, Addendum **Q-19.3-b**; `ARCHITECTURE-SPINE.md` §AD-3 (emendamento già scritto, `:51`); `16-2-guardie-registro-voli.md` §1 (perché il lock `Aircraft` serializza `FLIGHT_OVERLAP`, ri-lettura LOW-1); `15-6-*.md` (sheet mobile del registro, secondo passo, focus). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

### ❓ Domande PO aperte

**Q-19.6-a — Un volo «senza addebito» richiede comunque una tariffa configurata?**

> ✅ **DECISIONE PO (2026-11-01): B — le tariffe RESTANO OBBLIGATORIE** anche per il volo senza addebito (contro la raccomandazione). Si applica la nota sotto la tabella: in AD-5 il punto 3 diventa «ricerca tariffe invariata (422 `NO_AIRCRAFT_RATE`/`NO_INSTRUCTOR_RATE` come per ogni volo), tariffe congelate sul volo come informazione, importi e addebito forzati a 0 nel helper di scrittura»; l'AC 19 si riscrive di conseguenza (e2e discriminante: su un velivolo senza tariffa il volo con il flag risponde **422 `NO_AIRCRAFT_RATE`** come senza flag; con tariffa: `aircraftRateCentsPerHour` = tariffa, `aircraftAmountCents = 0`, istruttore idem, `FLIGHT_CHARGE` = 0); `flightBreakdownSchema` resta con le tariffe `positive()`. I punti marcati [Q-19.6-a = A] qui sotto vanno letti con B.

Oggi `resolveFlightInput` rifiuta un volo se a `flightDate` non c'è una tariffa velivolo in vigore (422 `NO_AIRCRAFT_RATE`, `flights.service.ts:892-895`) e, con istruttore a bordo, una tariffa istruttore (422 `NO_INSTRUCTOR_RATE`, `:897-903`). Un volo senza addebito non applica nessun prezzo. La CR (R-19-d) non dice se la tariffa serve lo stesso.

| Opzione | Effetto | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | Con «senza addebito» **nessuna tariffa è richiesta** (nessuna ricerca tariffa): sul volo prezzo e importi valgono 0. La categoria di prezzo della 19.3 resta registrata dal profilo. | Niente vicoli ciechi: velivolo appena entrato in flotta e ancora senza tariffa, volo datato prima della prima tariffa (la conseguenza accettata con A12), istruttore senza tariffa. Il gesto dell'admin («questo volo non costa nulla») non dipende da un dato che non usa. | Sul volo non resta scritto «quanto sarebbe costato». |
| B | Le tariffe **restano obbligatorie**: si congelano sul volo come informazione, importi e addebito a 0. | Il valore del volo regalato resta leggibile nel dettaglio. | Un volo che non costa nulla può essere bloccato da una tariffa mancante, e la via d'uscita (creare una tariffa con `validFrom ≥ oggi`, R-19-f) non copre un volo nel passato. |

> Se il PO sceglie B: in AD-5 il punto 3 diventa «ricerca tariffe invariata, importi forzati a 0 nel helper di scrittura»; l'AC 19 cambia di conseguenza; `flightBreakdownSchema` resta con le tariffe `positive()`. Il resto della story non cambia.

Le altre scelte (§0.3) non sono assunzioni di dominio nuove: ognuna discende da una ratifica chiusa o da un vincolo tecnico, e la sessione principale può riaprirle col PO prima del dispatch senza toccare il resto.

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want poter registrare un volo **senza addebito** (il pilota non paga, l'istruttore matura comunque il compenso), **annullare un volo cancellandolo davvero** (sparisce dal registro e dall'estratto conto, il saldo si ricalcola) e **modificare un volo aggiornandolo** invece di produrre una riga «annullato» e un volo nuovo,

so that il registro e l'estratto conto mostrino solo ciò che è successo davvero (punto PO 9, R-19-c), e i voli offerti dal club si possano registrare senza inventare un addebito da stornare a mano (R-19-d).

### Il perché

Dalla story 5.3 un volo **non si cancella mai**: «annullare» lo porta a `CANCELLED` con uno storno `FLIGHT_CHARGE_REVERSAL`, e «modificare» è uno storno più un volo nuovo legato da `correctionOfId`. Il risultato, misurato sull'app, è che ogni modifica lascia una riga «Annullato» nel registro e **due righe in più** nell'estratto conto (l'addebito e il suo storno). Il PO ha ratificato il contrario (R-19-c): annullare = cancellare volo e addebito, modificare = aggiornare sul posto, i voli già annullati spariscono in migrazione. L'architettura è già emendata (AD-3, `ARCHITECTURE-SPINE.md:51`): il `FLIGHT_CHARGE` è l'unico movimento che **vive e muore col volo**. Ogni altro movimento resta append-only con storno.

Il volo senza addebito (R-19-d) non esiste in nessuna forma: oggi un volo offerto si registra a pagamento e poi si compensa con una rettifica a mano.

### Fatti misurati che vincolano il design (su `3876e72`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Cancellare un `Flight` oggi **orfanerebbe in silenzio** i suoi movimenti | `AccountMovement_flightId_fkey` è `ON DELETE SET NULL` (`20260707150000_add_flights/migration.sql:56`) | la cancellazione elimina **esplicitamente** l'addebito nella stessa transazione, e la FK diventa `RESTRICT` (AD-7): un volo con addebito non si può più cancellare per sbaglio |
| `PackageConsumption.flightId` è `RESTRICT` e la tabella **non ha più lettori né scrittori** dalla 12.13 | `20260707160000_add_package_consumption/migration.sql:24`; grep: solo doc-comment in `flights.service.ts:46-53`, `registry.ts:969`, e lo scrittore del seed di carico `seed-load.ts:1137-1198` | una riga storica bloccherebbe la cancellazione di quel volo → la tabella si elimina (D-4) |
| Dopo la migrazione **solo** i `FLIGHT_CHARGE` portano `flightId` | `FLIGHT_CHARGE_REVERSAL` è creato solo da `cancelFlight`/`correctFlight` (`flights.service.ts:1519-1533`, `:1689-1700`), sempre col `flightId` di un volo che diventa `CANCELLED`; nessun volo è mai stato cancellato fisicamente | `AccountMovement.flightId @unique` diventa esprimibile: **un addebito per volo, garantito dal DB** (AD-7). La migrazione stessa fa da verifica: l'indice unico fallisce se l'invariante non regge |
| Un volo annullato ha `charge + storno = 0` | storno = `0 - originalMovement.amountCents` (`:1526`) | cancellare in migrazione addebito e storno dei voli `CANCELLED` **non cambia nessun saldo**: prova netta (AC 2) |
| Il lock attuale presuppone che un volo, una volta letto, non cambi più | `cancelFlight`/`correctFlight` leggono il volo **fuori** dalla transazione e bloccano l'`Aircraft` letto lì (`:1495-1500`, `:1609-1639`); regge perché `CANCELLED` è terminale, più la ri-lettura LOW-1 dello stato (`:1645-1654`) | con la modifica in place un volo può **cambiare velivolo**: senza un lock sulla riga `Flight` una cancellazione concorrente bloccherebbe il velivolo sbagliato → AD-2 |
| Solo l'ADMIN registra voli | `flights.manage` è solo in `ALL_PERMISSIONS` (`rbac.ts:64-79`, `:101-107`) | «solo admin» per il senza addebito è **strutturale**: nessun permesso nuovo (D-11) |
| Il compenso istruttore non legge né le tariffe né gli importi del volo | `sumMinutesByProfile` = Σ `minutes` dei voli `SCHOOL` non annullati × `payoutRateCents` (`instructor-compensation.service.ts:121-139`, `:400`) | R-19-d («il compenso matura comunque») è soddisfatta **senza scrivere codice**: basta che il volo resti un volo Scuola registrato. Via solo il filtro `status` |
| Le entrate derivano dagli importi del volo e dal `FLIGHT_CHARGE` | `getFlightTotals` somma `aircraftAmountCents + instructorAmountCents` (`flights.service.ts:1954-1967`); `stats.service.ts:173-174` idem per velivolo/persona; il libro contabile classifica `FLIGHT_CHARGE` come ricavo (`transactions.service.ts:130`, `:181`) | snapshot a 0 + addebito a 0 ⇒ un volo senza addebito vale **0 di ricavo ovunque**, senza toccare i lettori |
| L'estratto conto mostra la **descrizione** generata del movimento, anche sulla card mobile | colonna descrizione (`account-section.tsx:401-403`); sottoriga della card con `description` (`:466-469`), troncata con ellissi a 375px | la dicitura «senza addebito» va **in testa** alla descrizione, così sopravvive al troncamento (AD-5) |
| Il replay idempotente non ha TTL | `IdempotencyRecord` senza scadenza (`schema.prisma:1580-1593`); `flight-register` restituisce la response memorizzata | dopo una cancellazione, un retry con la stessa chiave rigioca il 201 originale **senza ricreare il volo** (D-9, AC 34) |
| L'API ha una sola convenzione per DELETE | `DELETE /expiry-types/{id}` e `/expiries/{id}` → **204** (`expiry-types/[id]/route.ts:19-25`, `expiries/[id]/route.ts:13-20`); PATCH ovunque è **parziale** (`bookings`, `aircraft`, `people`) | `DELETE /flights/{id}` → 204; la modifica, che rivalida l'**intero** volo, è un `PUT` (AD-6) |
| i18n | 1 760 chiavi per file dopo la 19.1, parità 0/0 (19.2-19.5 la cambiano) | questa story: **47 rimosse, 8 nuove, 6 testi cambiati** per file (§3.8) |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.6)

| # | Requisito |
|---|---|
| **P1** | Flag admin **«senza addebito»** sul volo: `FLIGHT_CHARGE` a 0 €, dicitura «senza addebito» nell'estratto conto, compenso istruttore dovuto (R-19-d). |
| **P2** | **Annulla = elimina** il volo e il suo addebito: sparisce dal registro e dall'estratto conto, il saldo si ricalcola (R-19-c). |
| **P3** | **Modifica = aggiornamento in place** con ricalcolo dell'addebito nella stessa transazione: niente righe «annullato», niente catene (R-19-c, AD-3 emendato). |
| **P4** | **Migrazione**: elimina i voli già annullati, i loro movimenti, le catene di correzione e le `PackageConsumption` residue (R-19-c, AD-6). |
| **P5** | Via **stato, filtri e badge «Annullato»** da UI, API, export. |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-a** | DB di test, migrazioni distruttive ammesse. | AD-1: `DELETE` dei voli annullati, `DROP` di colonne, enum valori e tabella, senza backfill. |
| **R-19-c** | Annullare = cancellare volo + addebito; modifica in place; voli annullati eliminati in migrazione. | P2-P4, AD-3, AD-4. |
| **R-19-d** | Senza addebito, solo admin; compenso istruttore matura; estratto conto a 0 € con la dicitura. | P1, AD-5. |
| **R-19-h** | Deroga senza motivazione. | Conferma la direzione «nessuna motivazione»: anche cancellazione e modifica perdono il motivo (D-1). |
| **A9** | Il volo senza addebito salta il check sul saldo. | **Confine**: il check sul saldo è della **19.9**; qui `noCharge` esiste e viaggia nell'input, così che la 19.9 lo possa leggere. Nessun check sul saldo in questa story. |
| **A10** | Resta il timbro silenzioso `forcedAt`/`forcedByUserId` come minimo di audit. | D-7: una modifica che non deroga non cancella il timbro esistente. |
| **Q-19.3-b** | Correzione/modifica: categoria di prezzo congelata se la persona non cambia. | AD-4: la modifica in place eredita la regola che la 19.3 avrà messo in `correctFlight`. |
| PRD FR-16 | «Nessuna chiusura del mese contabile» (utente 2026-07-04, `prd.md:365`). | D-12: modificare o cancellare un volo vecchio cambia le entrate del suo mese. È atteso. |

**Ratifiche/AC storici SUPERATI da questa story** (da non «ripristinare»): story 5.3 (storno con `FLIGHT_CHARGE_REVERSAL`, catena `correctionOfId`, motivo obbligatorio, 409 al secondo annullo); story 5.4 AC 1 per la parte «i voli annullati restano visibili nel registro del titolare»; review 12.8 Ratifica 3 («un volo annullato resta in tabella e non conta nei totali»: non esistono più voli annullati); story 15.6 R-15.6-b/R-15.6-d per le parti «chip Annullato», «motivo dello storno nel secondo passo», «chip di stato in testa»; story 16.2 per la parte «solo `REGISTERED` occupa un intervallo» (ora ogni volo esistente lo occupa) e per la ri-lettura LOW-1 (sostituita dal lock sulla riga `Flight`, AD-2); story 16.6a per la parte «voli annullati fuori dal PDF» (la CR la fa già decadere).

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | Cancellazione e modifica **non chiedono più un motivo**: via `reason` dal body, via il campo dal form e dallo sheet. | R-19-c: il volo e l'addebito spariscono, quindi non resta nessuna riga dove scriverlo; R-19-h: il PO ha già tolto le motivazioni dalla deroga | tenere il motivo in un log di audit nuovo: una tabella che nessuno ha chiesto |
| **D-2** | `updateFlight`/`deleteFlight` aprono la transazione con `SELECT … FROM "Flight" WHERE "id" = … FOR UPDATE`. L'ordine dei lock diventa **Flight → Aircraft → Account**; `registerFlight` resta Aircraft → Account. | Vincolo tecnico: con la modifica in place un volo cambia velivolo (fatto misurato) | ri-lettura LOW-1 + 409 «modificato nel frattempo»: un ramo in più e un codice d'errore nuovo per un caso che il lock chiude per costruzione |
| **D-3** | Contratto API: `PUT /api/v1/flights/{id}` (body = quello di `POST /flights`, sostituzione completa, 200) e `DELETE /api/v1/flights/{id}` (204). `POST …/cancel` e `POST …/correct` **spariscono** (404). | API-first per la futura app Flutter: i due verbi dicono esattamente ciò che succede; i vecchi nomi descriverebbero uno storno e una catena che non esistono più. Nessun consumatore esterno oggi | tenere `POST /cancel` e `/correct` con la semantica nuova: nomi bugiardi in un contratto pensato per durare |
| **D-4** | La tabella `PackageConsumption` si **elimina** (`DROP TABLE`), con le relazioni `Flight.packageConsumptions` e `HourPackage.consumptions`. `HourPackage` resta (gemello storico dei `PACKAGE_PURCHASE`), come pure `Flight.packageCoveredMinutes`, a cui si riscrive solo il doc. | P4 + AD-6 emendato («le residue si eliminano»): dopo il `DELETE` la tabella potrebbe solo restare vuota, e la sua FK `RESTRICT` è l'unico oggetto del DB che può bloccare la cancellazione di un volo | `DELETE` delle righe e tabella tenuta: schema morto più una trappola che resta disinnescata solo per convenzione. Il seed di carico la ripopola sui voli `REGISTERED` (`seed-load.ts:1146-1181`) |
| **D-5** | Il valore `FLIGHT_CHARGE_REVERSAL` esce dall'enum `AccountMovementType`, con tutto ciò che lo leggeva (classificazione contabile, etichette, badge «Storno del movimento», export, i18n). | Karpathy: «rimuovi ciò che la tua modifica ha reso inutile». Dopo questa story nessun codice lo crea e la migrazione cancella tutte le righe esistenti | lasciarlo: un tipo di movimento che il ledger non può più contenere, con UI e test che lo trattano come vivo |
| **D-6** | `AccountMovement.flightId` diventa `@unique` con `onDelete: Restrict`. Su `Flight` la relazione passa da `movements AccountMovement[]` a `charge AccountMovement?`. | «Nessun movimento orfano» garantito dal DB, non da una convenzione: un addebito per volo, e un volo si cancella solo dopo il suo addebito | `CASCADE`: cancellerebbe righe di ledger in modo implicito. Resta l'eccezione di AD-3, ma non è più leggibile nel codice |
| **D-7** | Su una modifica, `forcedAt`/`forcedByUserId`/`forceReason` si **sovrascrivono solo** se la modifica stessa deroga (`resolved.forceStamp` non nullo); altrimenti restano come sono. | A10 (il timbro è il minimo di audit). La 19.9 riscrive comunque quest'area | azzerarli a ogni modifica: un cambio di atterraggi cancellerebbe la traccia di una deroga reale |
| **D-8** | Un volo il cui addebito ha già una **rettifica manuale** collegata (`reversalOfId`) resta **non cancellabile e non modificabile**: 409, con lo stesso messaggio di oggi (`flights.service.ts:1440`). | Comportamento invariato. Cancellare l'addebito lascerebbe la rettifica come credito orfano (`reversalOfId` andrebbe a `NULL` per la FK `SET NULL`), un saldo falso; la porta verso questo stato la chiude la **16.6b** (422 sulla rettifica di un `FLIGHT_CHARGE`). Sul DB di carico i casi sono 0 (misura 16.6b) | cancellare anche la rettifica: violerebbe AD-3, che fa eccezione solo per il `FLIGHT_CHARGE` |
| **D-9** | Il replay idempotente di `POST /flights` dopo una cancellazione **rigioca il 201 originale** (`Idempotency-Replayed: true`) e **non ricrea** il volo. Nessuna modifica a `IdempotencyRecord`. | Semantica standard dell'idempotenza (la risposta descrive l'esito della prima richiesta). Il client rigenera la chiave dopo ogni risposta HTTP (`use-idempotency-key.ts`), quindi il caso richiede un retry dopo un guasto di rete | cancellare i record collegati: un retry **ricreerebbe** il volo, il difetto peggiore possibile |
| **D-10** | «Senza addebito» compare (a) in testa alla descrizione del `FLIGHT_CHARGE` (estratto conto ed export dell'estratto conto), (b) nel registro: sottoriga della cella Costo su desktop, al posto dell'importo sulla card mobile, accanto all'importo nella riga «Costo» dello sheet, (c) nel riepilogo del form dopo il salvataggio. Nessuna colonna nuova negli export del registro (l'importo è 0). | R-19-d chiede la dicitura nell'estratto conto; nel registro un «0,00 €» senza spiegazione sembrerebbe un errore, e il toggle del form la mostra già in modifica | una colonna «Senza addebito» negli export xlsx/pdf: rompe le intestazioni per un'informazione che l'estratto conto porta già |
| **D-11** | Nessun permesso nuovo: il flag è accettato da chiunque abbia `flights.manage` (solo ADMIN). | Fatto misurato (rbac); lezione 14.9 F4: un permesso distinto oggi sarebbe un ramo irraggiungibile | `flights.noCharge`: speculativo |
| **D-12** | Modificare o cancellare un volo di un mese passato **cambia le entrate di quel mese** (statistiche, registro contabile). Prima lo storno cadeva nel mese corrente. | Conseguenza diretta di R-19-c + PRD FR-16 «nessuna chiusura del mese» | — (da dichiarare nel record, non da impedire) |
| **D-13** | Sulla modifica `Flight.actorUserId` e `AccountMovement.actorUserId` **restano quelli di chi ha registrato**; cambia `Flight.updatedAt`. Il `createdAt` del movimento non cambia (resta la sua posizione nell'estratto conto finché la 19.11 non ordina per data valuta). | Nessun requisito di audit sulla modifica; `actorUserId` è documentato come «chi ha registrato» (`schema.prisma:1035-1038`) | un `updatedByUserId` nuovo: non chiesto |
| **D-14** | L'azione di riga resta **«Annulla»** (lessico del PO, R-19-c: «annullare un volo = cancellarlo»). La conferma dice cosa succede: «Elimina volo» più l'avviso. Testid invariati (`flight-cancel-*`, `flight-correct-*`), come pure i nomi interni `isCorrecting`/`correctingFlight` («correggere sul posto» è ancora correggere). | Modifiche chirurgiche: meno churn negli e2e e nessun rename senza cambio di comportamento. Copy definitiva: 19.12 | rinominare tutto in `delete`/`edit`: decine di righe toccate senza alcun effetto |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA migrazione forward, distruttiva, dopo quella della 19.5 (o dell'ultima presente)

`prisma/migrations/<timestamp>_flight_delete_in_place_no_charge/migration.sql`, con un commento in testa che cita la story e R-19-a/R-19-c/R-19-d (pattern TD-2, precedente `20261101193941_remove_ppr_domain`). L'**ordine degli statement è portante** (i `DELETE` vanno prima del DDL che toglie `status`, e la tabella `RESTRICT` va eliminata prima dei voli):

```sql
-- 1. Package consumption, retired by story 12.13 (D-4): its RESTRICT FK would block step 3.
DROP TABLE "PackageConsumption";
-- 2. Movements of cancelled flights: the charge and its FLIGHT_CHARGE_REVERSAL (they net to 0, so no balance moves).
--    A manual ADJUSTMENT pointing at one of them keeps its row; its reversalOfId goes NULL (existing SET NULL FK) — count it (AC 2).
DELETE FROM "AccountMovement" WHERE "flightId" IN (SELECT "id" FROM "Flight" WHERE "status" = 'CANCELLED');
-- 3. Cancelled flights (correction chains included: a surviving correction's correctionOfId goes NULL via its SET NULL FK,
--    a TrainingNote's flightId too).
DELETE FROM "Flight" WHERE "status" = 'CANCELLED';
-- 4. Flight: no status, no cancellation, no chain; the no-charge flag (R-19-d).
--    (+ drop of Flight_correctionOfId_fkey / Flight_correctionOfId_key, as generated by Prisma)
ALTER TABLE "Flight" DROP COLUMN "status", DROP COLUMN "cancelledAt", DROP COLUMN "cancelReason", DROP COLUMN "correctionOfId",
  ADD COLUMN "noCharge" BOOLEAN NOT NULL DEFAULT false;
DROP TYPE "FlightStatus";
-- 5. AccountMovementType without FLIGHT_CHARGE_REVERSAL (Prisma's create-new/cast/rename/drop pattern):
--    the cast FAILS LOUDLY if any row still carries the value — that failure is the verification.
-- 6. One charge per flight, and no flight deletable while its charge exists (D-6):
--    drop AccountMovement_flightId_idx, CREATE UNIQUE INDEX "AccountMovement_flightId_key",
--    re-create AccountMovement_flightId_fkey ON DELETE RESTRICT ON UPDATE CASCADE.
```

Si genera con `prisma migrate dev --create-only` (il DDL dei punti 4-6) e si **aggiungono a mano** i punti 1-3 in testa (Prisma non genera i `DELETE` di dati). **Verifica obbligatoria su un DB gemello** (precedenti 14.9 `am_rev149`, 19.2 AD-1), **mai** su `airmanager` mentre un arbitro e2e è vivo:

1. gemello migrato fino alla migrazione **precedente** + `seed` + `seed:demo`, poi **fixture SQL** che riproducono ciò che la migrazione deve ripulire: (a) un volo `CANCELLED` con il suo `FLIGHT_CHARGE` e il `FLIGHT_CHARGE_REVERSAL` (importi opposti); (b) una catena: originale `CANCELLED` con addebito e storno, più una correzione `REGISTERED` con `correctionOfId` verso l'originale e il proprio addebito; (c) un `HourPackage` con il suo `PACKAGE_PURCHASE` e una `PackageConsumption` su un volo **`REGISTERED`**; (d) una `TrainingNote` con `flightId` del volo annullato (a);
2. **prima**: `SELECT "accountId", SUM("amountCents") FROM "AccountMovement" GROUP BY 1 ORDER BY 1` salvato su file, i conteggi (`Flight` per stato, `AccountMovement` per tipo, `PackageConsumption`) e il conteggio delle rettifiche che puntano a movimenti di voli annullati (atteso 0);
3. `migrate deploy`; **dopo**: la stessa SUM per conto, `diff` **vuoto** (la migrazione non sposta un centesimo); 0 voli senza addebito (`LEFT JOIN … WHERE m.id IS NULL`); 0 `FLIGHT_CHARGE` con `flightId` NULL; 0 movimenti con `flightId` di tipo diverso da `FLIGHT_CHARGE`; la correzione (b) sopravvive senza colonna di catena; la `TrainingNote` (d) esiste con `flightId` NULL; `\dt "PackageConsumption"` → nessuna relazione; `\d "Flight"`, `\d "AccountMovement"` (indice `AccountMovement_flightId_key` UNIQUE, FK `ON DELETE RESTRICT`), `\dT+ "AccountMovementType"`;
4. catena completa `migrate deploy` **da zero** su un secondo gemello vuoto → verde; `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <gemello> --script` = **vuoto**; poi `npx prisma generate`.

**`airmanager_load` NON si tocca** (DB di misura dell'epic 17): resta indietro di una migrazione in più.

### AD-2 — Ordine dei lock: Flight → Aircraft → Account

| Percorso | Lock, in ordine, dentro `prisma.$transaction` | Perché |
|---|---|---|
| `registerFlight` | Aircraft (`FOR UPDATE`) → Account | **invariato** (16.2: serializza `FLIGHT_OVERLAP`) |
| `updateFlight` | **Flight**(id) `FOR UPDATE` → Aircraft `IN (velivolo attuale, velivolo nuovo) ORDER BY "id" FOR UPDATE` → Account `IN (conto dell'addebito, conto della persona nuova) ORDER BY "id" FOR UPDATE` | il lock sulla riga `Flight` restituisce il velivolo **attuale** (non uno letto fuori dalla transazione), e serializza modifica‖modifica e modifica‖cancellazione dello stesso volo |
| `deleteFlight` | **Flight**(id) `FOR UPDATE` → Aircraft (velivolo attuale) `FOR UPDATE` → Account (conto dell'addebito) `FOR UPDATE` | stesso ordine di `updateFlight`. Il lock `Aircraft` resta (CR riga 19.2: «resta in registrazione/annullamento»), per l'ordine macro |

Assenza di cicli (da riscrivere nel doc-comment del modulo, `flights.service.ts:95-111`): nessun percorso blocca prima un `Aircraft` e poi un `Flight`. `registerFlight` legge i voli del velivolo nella guardia di sovrapposizione **senza** lock (MVCC: non attende), e le prenotazioni (`Booking → Aircraft → Person → InstructorProfile`, 16.3 AD-2) non toccano `Flight`. Il `SELECT … FOR UPDATE` sulla riga `Flight` che restituisce 0 righe ⇒ `NotFoundError('Flight not found.')`: una cancellazione concorrente vinta dall'altro risponde **404, mai 500**.

### AD-3 — `deleteFlight(actor, flightId): Promise<void>`

`authorize(actor, 'flights.manage')` per primo (403 prima di qualunque query). Poi, in **una** transazione: lock `Flight` (→ 404) → lock `Aircraft` → lettura dell'addebito via `flightId` (unico per D-6) con `reversal: { select: { id } }`: assente ⇒ `throw new Error(…)` (invariante rotto, mai un'eliminazione «a metà»); con rettifica ⇒ `ConflictError` col messaggio di oggi (D-8) → lock `Account` → **`tx.accountMovement.delete` PRIMA di `tx.flight.delete`** (con la FK `RESTRICT` l'ordine inverso fallisce: è voluto). Sempre lecita: nessuna rivalidazione di persona o velivolo archiviati, velivolo fuori servizio, data (come `cancelFlight` oggi, `:1460-1464`). Nessun alert di saldo (la cancellazione restituisce soldi). `TrainingNote.flightId` va a NULL da solo (FK `SET NULL`), ed è dichiarato.

Sostituisce `cancelFlight` (`:1456-1565`) e `loadRegisteredFlightForReversal` (`:1376-1454`), che spariscono insieme al tipo `OriginalChargeMovement`.

### AD-4 — `updateFlight(actor, flightId, input: RegisterFlightInput): Promise<RegisterFlightResult>`

1. `authorize(actor, 'flights.manage')`.
2. **Pre-lettura** fuori dalla transazione (404 se manca): l'identità che servirà alle esenzioni, cioè `aircraftId`, `personId`, `instructorPersonId`, `flightDate`, `flightType` e, dopo la 19.3, `aircraftPriceCategory`. È ciò che oggi carica `loadRegisteredFlightForReversal`, senza il controllo `CANCELLED`.
3. `resolveFlightInput(actor, input, original.flightType, originalIdentity)`: **invariata** nelle esenzioni R-14.3-a (tipo), R-14.4-b (identità), AOG (stesso velivolo) e Q-19.3-b (categoria). Tutti i 404/422 della registrazione si applicano ai dati nuovi.
4. Soglia di saldo letta prima della transazione (come oggi).
5. Transazione: lock `Flight` (→ 404) → lock `Aircraft` sui due id ordinati, con controllo di esistenza (→ 404) → `assertNoOverlappingFlight(tx, { aircraftId: resolved.aircraft.id, …, excludeFlightId: flightId })` → lettura dell'addebito (assente ⇒ errore d'invariante; con rettifica ⇒ 409, D-8) → upsert del conto della persona nuova → lock `Account` ordinato → `balanceBefore` = SUM del conto **nuovo** → `tx.flight.update` (tutte le colonne di input e di snapshot, `noCharge`, categoria; i campi deroga solo secondo D-7) → `tx.accountMovement.update` sull'addebito **esistente** (stesso id): `accountId` = conto nuovo, `amountCents` = `0 - totale`, `description` rigenerata, `effectiveDate` = nuova `flightDate` → `balanceAfter` = SUM del conto nuovo, **riletta** (read-your-own-writes).
6. Fuori dalla transazione: `getAccountOverview` della persona nuova; email se la fascia è peggiorata (`bandWorsened`, invariato); `balanceAlert = hasNegativeBalanceAlert(balanceBefore, balanceAfter)`. Con la persona invariata `balanceBefore` contiene già il vecchio addebito: si confronta il saldo reale prima e dopo la modifica (più preciso del «saldo con lo storno» di oggi).

**Nessuna creazione**: né `flight.create` né `accountMovement.create` in questo percorso. **Un solo posto** trasforma l'input risolto in colonne di snapshot, totale e descrizione: un helper puro (es. `buildFlightWrite(resolved, input)` → `{ flightData, totalAmountCents, description }`) usato da `registerFlightCore` e da `updateFlight`, così che creazione e modifica non possano divergere (due chiamanti: l'astrazione è giustificata). Il saldo-prima resta dentro `registerFlightCore` per la registrazione.

Sostituisce `correctFlight` (`:1567-1785`). Spariscono il parametro `correctionOfId` del core (`:1110-1111`, `:1184`) e ogni scrittura di `status`/`cancelledAt`/`cancelReason`. La **16.5** (dopo) aggiungerà lo snapshot del compenso con la regola «la modifica in place conserva lo snapshot salvo cambio di istruttore o durata»: qui **nessun** campo di compenso.

### AD-5 — Senza addebito (`Flight.noCharge`)

1. **Schema**: `noCharge Boolean @default(false)` con doc-comment (R-19-d: addebito a 0, compenso dovuto, nessuna tariffa richiesta [Q-19.6-a]; il check sul saldo che lo salta è della 19.9).
2. **Input**: `noCharge: z.boolean().optional().default(false)` in `registerFlightSchema` (stesso idioma di `isSolo`, `flights.ts:103`). Vale per `POST` e `PUT`: con `PUT` (sostituzione completa) un client che lo omette lo **riporta a false**, ed è scritto nell'OpenAPI.
3. **[Q-19.6-a = A] Tariffe**: in `resolveFlightInput`, con `input.noCharge` **non** si chiamano `getEffectiveRate`/`getEffectiveInstructorRate` (`:890-905`): `aircraftRateCentsPerHour = 0`, e con istruttore `instructorRateCentsPerHour = 0` e `instructorAmountCents = 0` (non `null`: il volo ha un istruttore, e `toListItem` lo riconosce da `!== null`, `:285`). La categoria di prezzo (19.3) si calcola comunque. Tutte le altre guardie sono invariate.
4. **Importi e addebito**: il helper di AD-4 ottiene `aircraftAmountCents = round(0 × minuti / 60) = 0`, totale 0, `FLIGHT_CHARGE.amountCents = 0 - 0` (zero positivo: `Object.is(amount, 0)`). L'addebito **esiste sempre**, anche a 0: serve all'estratto conto (R-19-d) e all'invariante «un addebito per volo» (D-6).
5. **Descrizione**: `Volo senza addebito ${marche} ${data} — ${H:MM}`, con la dicitura **in testa** (fatto misurato: la card mobile tronca la coda). Il volo normale resta byte-identico: `Volo ${marche} ${data} — ${H:MM}` (`:1160`). Testo italiano generato lato server come ogni descrizione di movimento di oggi (nessuna i18n server-side nuova).
6. **Compenso istruttore**: nessuna riga di codice. AC 21 lo prova (volo Scuola senza addebito ⇒ il compenso conta i suoi minuti).
7. **Ricavi**: nessuna riga di codice (snapshot e addebito a 0). AC 22.
8. **Alert saldo**: regola invariata (con addebito 0 la fascia non peggiora; il segnale in-app resta «saldo già rosso o rosso dopo», come per ogni registrazione).
9. **Confine dichiarato**: il check sul saldo (R-19-g) e il suo salto per il senza addebito (A9) sono della **19.9**.

### AD-6 — Contratto API (futura app Flutter)

| Prima | Dopo |
|---|---|
| `POST /api/v1/flights/{id}/cancel` `{reason}` → 200 `RegisterFlightResponse`; 409 al secondo annullo | **`DELETE /api/v1/flights/{id}`** (nessun body) → **204**; secondo DELETE → **404**; 409 solo per D-8; 403 non admin |
| `POST /api/v1/flights/{id}/correct` `{…registrazione, reason}` → **201** con un volo **nuovo** | **`PUT /api/v1/flights/{id}`** `{…registrazione}` (lo stesso `RegisterFlightRequest`) → **200** `RegisterFlightResponse`, **stesso** `flight.id`; 404 / 409 `FLIGHT_OVERLAP` / 409 D-8 / tutti i 422 della registrazione |
| `GET /flights?status=` | parametro **rimosso** (un `?status=` residuo viene scartato da Zod, nessun 422) |
| DTO `Flight`: `status`, `cancelledAt`, `cancelReason`, `correctionOfId`, `correctedByFlightId` | **rimossi**; **aggiunto** `noCharge: boolean` |
| `AccountMovementType` con `FLIGHT_CHARGE_REVERSAL` | senza (D-5) |

Route: **una** cartella nuova `src/app/api/v1/flights/[id]/route.ts` con `PUT` e `DELETE` (thin route, AD-1 del progetto; `DELETE` col pattern `successStatus: 204` + `return undefined`). Le cartelle `[id]/cancel` e `[id]/correct` si **cancellano**. `GET /flights/{id}` non esiste (→ 405); `/flights/pdf` è un segmento statico e ha la precedenza su `[id]` (il suo `PUT` → 405). **Nessun `Idempotency-Key`** su `PUT`/`DELETE`: sono idempotenti per semantica HTTP (un secondo `PUT` identico riscrive gli stessi valori, un secondo `DELETE` → 404), e il commento di `flights/route.ts:22-28` che motivava l'esclusione col `reversalOfId` si riscrive.

### AD-7 — Invarianti dello schema

`Flight`: via `status`, `cancelledAt`, `cancelReason`, `correctionOfId`, `correctionOf`, `correctedBy`, `packageConsumptions`; `movements AccountMovement[]` → `charge AccountMovement?`; più `noCharge`. Enum `FlightStatus` eliminato. `AccountMovement.flightId`: `@unique`, `onDelete: Restrict`, via `@@index([flightId])` (ridondante con l'unico). `AccountMovementType` senza `FLIGHT_CHARGE_REVERSAL`. Modello `PackageConsumption` eliminato, e con esso `HourPackage.consumptions`.

**Doc-comment che diventano falsi** e vanno riscritti nello stesso commit:
- `Flight` (`schema.prisma:896-944`): «never physically deleted… no edit-in-place API… correction is a CHAIN» → l'eccezione AD-3 (si cancella col suo addebito, si modifica sul posto), più il paragrafo sui pacchetti;
- `AccountMovement` (`:627-636`): «There is deliberately no update/delete API» → l'eccezione `FLIGHT_CHARGE` (un movimento collegato a un volo è aggiornato/cancellato solo da `updateFlight`/`deleteFlight`); doc di `flightId` (`:665-671`): «NOT unique: … 5.3's storno» → unico, `RESTRICT`, solo `FLIGHT_CHARGE`;
- `FlightStatus` (`:885-894`) e campi (`:967-990`): spariscono col codice;
- `Booking` (`:1110`): «same `FlightStatus` pattern as `Flight`» → togliere il paragone;
- `HourPackage` (`:809-814`, `:861-865`): il residuo calcolato su una tabella che non esiste più → una riga storica (consumo ritirato dalla 12.13, dettaglio eliminato dalla 19.6);
- `Flight.packageCoveredMinutes` (`:1026-1032`) e la relazione `:1061-1064`.

### AD-8 — UI

**Desktop (`logbook-console.tsx`)**
- Riga: **«Annulla»** e **«Modifica»** su **ogni** volo per `canManage` (via il gate `flight.status === 'REGISTERED'`, `:795`). Via badge «Annullato» + dettaglio data/motivo e catena («Correzione di…», «Corretto da…») da `statusBadgeAndLineage` (`:356-401`): resta solo il blocco deroga (che la 19.9 toglierà), e la funzione si rinomina o si riduce di conseguenza.
- Cella Costo (`:785-787`): importo + sottoriga **«Senza addebito»** (`data-testid="flight-no-charge"`) quando `flight.noCharge`, con le classi esistenti (es. `student-sub`): nessun CSS nuovo se non serve.
- Conferma (`.mini-modal`, `:981-1029`), che è il **secondo passo**: titolo «Annulla volo» e sottotitolo marche — data — importo invariati; **via** la textarea del motivo; **nuovo** paragrafo d'avviso (`data-testid="flight-cancel-warning"`) col nome della persona: *«Il volo verrà eliminato definitivamente insieme al suo addebito: sparirà dal registro voli e dall'estratto conto di {persona} e il saldo verrà ricalcolato. L'operazione non si può annullare.»*; bottoni «Chiudi» / **«Elimina volo»** (`flight-cancel-confirm`, stile distruttivo come nello sheet). Errori: 404 → `notFoundError`, 409 → `conflictError` (D-8), altro → `genericError`. Successo: `flight-cancel-feedback` «Volo eliminato.» + `router.refresh()`.
- Testata: **via** la select Stato (`:699-707`, `flight-filter-status`). `LogbookFilters.status`, `buildFilterQuery` e il reset perdono `status`. Verificare a 1280 che la barra filtri non lasci un buco.

**Mobile (stesso file)**
- Via la strip dei chip di stato (`:852-886`, `mobile-flight-status-chips`, `mobile-flight-status-chip-*`) e `statusChipHref` (`:493-501`); il conteggio del pannello «Filtri» non cambia (non contava lo stato).
- Card (`:922-926`): la nota mostra **«Senza addebito»** al posto dell'importo quando `noCharge` (`data-testid="flight-no-charge-mobile"`). Badge di riga: solo «Deroga» (`flightBadgeKind` → `'forced' | null`).
- Sheet: azioni «Modifica» / «Annulla» su ogni volo (via il gate `:1158`). Righe: via «Annullato» e «Storico» (`:469-479`); la riga «Costo» diventa `0,00 € · Senza addebito` per un volo senza addebito. **Secondo passo** (`:1191-1232`): via textarea e messaggio «obbligatorio»; avviso (`flight-cancel-warning-mobile`, stesso testo del desktop); «Indietro» / «Elimina volo». **Focus**: entrando nel passo va su **«Indietro»** (`flight-cancel-dismiss-mobile`), mai sul bottone distruttivo (stessa regola di `:1173-1175`); uscendone torna su «Modifica» (invariato, `:290-293`). Successo: chiude lo sheet + toast «Volo eliminato.».

**Form volo (`flight-editor.tsx`)**, nuovo e modifica, desktop e pannello mobile
- **Toggle «Senza addebito»** (la primitiva `Toggle` della 19.5) sempre visibile, con hint (`editor.fields.noChargeHint`). Precompilato da `correctingFlight.noCharge` in modifica, inviato come `noCharge` nel body (anche nel reinvio con deroga, `onForceSubmit`). Il form è già montato solo per `canManage` (`logbook-console.tsx:965`, `dashboard/page.tsx:539`): nessun gate in più (D-11).
- Modifica: **via** il campo «Motivo della correzione» (`:1071-1083`), `reason`/`reasonError` (`:350-351`, `:570-572`, `:627`, `:646`); endpoint `PUT /api/v1/flights/{id}` nei due submit (`:651-658`, `:801-808`); nessuna chiave di idempotenza in modifica (invariato); `isCorrecting && 404` → `notFoundError`; `isCorrecting && 409` (dopo il ramo `FLIGHT_OVERLAP`) → `conflictError` (D-8). Submit «Salva modifiche».
- Riepilogo dopo il salvataggio (`flight-result-panel`): titolo «Addebito aggiornato» in modifica (era «Addebito generato», falso per un aggiornamento); con `noCharge` la riga del totale porta «Senza addebito» accanto a `0,00 €`.
- Header doc (`:3-21`) e i commenti che citano «storno»/«nuova riga»/«già stato annullato» si riscrivono.

**Scheda persona (`people/[id]/page.tsx:449-451`)**: via lo stato a destra delle righe «Voli recenti».

**Estratto conto (`account-section.tsx`)**: via il caso `FLIGHT_CHARGE_REVERSAL` dell'etichetta (`:173-174`), il badge «Storno del movimento» desktop/mobile/sheet (`:396-400`, `:488-494`, `:551-552`), `reversalBadgeText` (`:240-241`) e la label `reversalBadge`/`flightChargeReversal` dal tipo (`:64-66`) e dai due mapper (`people/[id]/page.tsx:218`, `:224`; `my-account/page.tsx:110`, `:115`). Il badge della **rettifica** (`adjustment-badge`) resta identico.

### AD-9 — I lettori che filtravano lo stato

Ogni volo esistente è ora un volo registrato: i filtri **si tolgono**, non si sostituiscono.

| Lettore | Riga | Dopo |
|---|---|---|
| guardia di sovrapposizione | `flights.service.ts:987` | via `status: 'REGISTERED'` (doc `:944-954` riscritto: un volo cancellato **non esiste più**, quindi libera l'intervallo per costruzione) |
| `getFlightTotals` | `:1939-1940`, `:1952` | `where = buildFlightsWhere(...)` e basta |
| `buildFlightsWhere` / `listFlights` doc | `:1839`, `:1856-1858`, `:1877` | via il filtro `status` e la frase sui voli annullati visibili |
| statistiche | `stats.service.ts:150`, `:171` | via `status` |
| ore velivolo | `aircraft.service.ts:721`, `:740` | via `status` (+ doc) |
| ultimo volo della persona | `people.service.ts:258`, `:293` | via `status` (+ doc) |
| compensi | `instructor-compensation.service.ts:20`, `:121`, `:129`, `:400` | via `status: { not: 'CANCELLED' }` (+ doc) |
| Panoramica | `dashboard/page.tsx:292`, `:885` | via `status: 'REGISTERED'` dalle due `getFlightTotals` |
| export registro | `exports.service.ts:260-263`, `:635-639` | via la colonna Stato (xlsx e pdf) |
| commenti | `dashboard/page.tsx:455`, `src/lib/booking-day-phase.ts:10-11`, `src/lib/schemas/stats.ts:25` | riformulati senza `FlightStatus`/`REGISTERED` |

---

## §2 — Acceptance Criteria

### Schema e migrazione

1. **Schema** (AD-7): `Flight` senza `status`/`cancelledAt`/`cancelReason`/`correctionOfId`/`correctionOf`/`correctedBy`/`packageConsumptions`, con `noCharge Boolean @default(false)` documentato e `charge AccountMovement?`; enum `FlightStatus` assente; `AccountMovementType` = `TOP_UP | ADJUSTMENT | PACKAGE_PURCHASE | FLIGHT_CHARGE`; `AccountMovement.flightId` `@unique` + `onDelete: Restrict`; modello `PackageConsumption` assente; i doc-comment di AD-7 riscritti (nessuno afferma più «never physically deleted», «no update/delete API» senza eccezione, «NOT unique», «same `FlightStatus` pattern»).
2. **Migrazione** (AD-1): una sola, forward, successiva all'ultima presente; sul gemello popolato con le quattro fixture le **SUM per conto prima/dopo sono identiche** (`diff` vuoto, riportato nel record); dopo: 0 voli senza addebito, 0 `FLIGHT_CHARGE` con `flightId` NULL, 0 movimenti con `flightId` non `FLIGHT_CHARGE`, la correzione della catena sopravvive, la `TrainingNote` sopravvive con `flightId` NULL, `PackageConsumption` non esiste; catena da zero verde; `migrate diff` vuoto; output psql (`\d`, `\dT+`, conteggi prima/dopo, conteggio delle rettifiche orfanate = 0) verbatim nel Dev Agent Record.

### Cancellazione (P2)

3. **`DELETE /api/v1/flights/{id}`** (admin) → **204** senza body; poi il volo non c'è in `GET /flights`, l'estratto conto della persona non ha più la riga del suo addebito, e il saldo è tornato al valore di prima del volo (e2e su pilota run-unique: saldo `0,00 €`, 0 righe `FLIGHT_CHARGE`).
4. **Errori**: id inesistente o già cancellato → **404** `Flight not found.` (il secondo `DELETE` dello stesso volo → 404); non admin → **403** prima di qualunque query (unit: `$transaction` mai chiamato); addebito con rettifica manuale collegata → **409** col messaggio di oggi e **niente** cancellato (unit + psql opzionale).
5. **Sempre lecita**: si cancella il volo di una persona archiviata, di un velivolo archiviato o fuori servizio, di qualunque data, e un volo senza addebito (addebito 0). Un e2e copre almeno il velivolo fuori servizio (è l'AC 573 di `aircraft-out-of-service-until.spec.ts` riscritto, AC 26).
6. **Atomicità sul DB reale** (sonda §4.3-a): con un trigger sul gemello che fa fallire il `DELETE` della riga `Flight` della sonda, `deleteFlight` lancia e l'addebito **è ancora lì** (stesso id, stesso importo); prova di discriminanza: spostando la cancellazione del movimento **fuori** dalla transazione la sonda trova l'addebito sparito. Ripristino byte-identico (sha256).
7. **Nessun orfano, per costruzione**: unit, `tx.accountMovement.delete` invocato **prima** di `tx.flight.delete` (`invocationCallOrder`), entrambi sul `tx`; psql sul gemello, un `DELETE FROM "Flight"` di un volo con addebito → `ERROR … violates foreign key constraint "AccountMovement_flightId_fkey"` (verbatim nel record).
8. **Ordine dei lock** (AD-2): unit, i `$queryRaw` di `deleteFlight` sono nell'ordine `"Flight" … FOR UPDATE` → `"Aircraft" … FOR UPDATE` → `"Account" … FOR UPDATE`; un lock `Flight` con 0 righe ⇒ `NotFoundError` e **nessuna** scrittura.

### Modifica in place (P3)

9. **`PUT /api/v1/flights/{id}`** col body di registrazione → **200** `{ flight, account, balanceAlert }` con **lo stesso** `flight.id`; nel DB resta **un** volo e **un** `FLIGHT_CHARGE` per quel volo (**stesso** id di movimento di prima), con `amountCents = -(nuovo totale)`, `effectiveDate` = nuova `flightDate`, descrizione rigenerata; **nessun** volo e **nessun** movimento creati (unit: `flight.create`/`accountMovement.create` mai chiamati; e2e: l'estratto conto del pilota ha esattamente 1 riga di volo, con il nuovo importo).
10. **Guardie ed esenzioni invariate**: tutti i 404/422 della registrazione sui dati nuovi; esenzioni R-14.3-a, R-14.4-b, AOG (stesso velivolo) e Q-19.3-b (categoria congelata con persona invariata, profilo attuale con persona cambiata) provate da unit **portati** da `correctFlight` a `updateFlight` uno per uno (elenco nel record: titolo vecchio → titolo nuovo).
11. **Sovrapposizione**: una modifica che resta nel proprio intervallo passa (esclusione per id); una che si sposta su un intervallo occupato → **409 `FLIGHT_OVERLAP`** col volo in conflitto in `details`, e volo e addebito restano **identici** (e2e E5 riscritto: stessi minuti, stesso importo, stessa riga in estratto conto).
12. **Cambio persona**: il conto vecchio sale di |vecchio addebito|, quello nuovo scende del nuovo totale; il movimento è **lo stesso** (id invariato, `accountId` aggiornato); i due conti sono bloccati in **un** `SELECT … IN (…) ORDER BY "id" FOR UPDATE` (unit).
13. **Ordine dei lock** (AD-2): unit, `"Flight"` → `"Aircraft" … IN (…) ORDER BY "id"` → `"Account" … IN (…) ORDER BY "id"`; una cancellazione concorrente (lock `Flight` con 0 righe) ⇒ 404, **nessuna** scrittura; un velivolo sparito ⇒ 404.
14. **Alert**: `balanceBefore`/`balanceAfter` letti sul conto **nuovo** prima e dopo le scritture; email solo se la fascia peggiora (unit: un aumento di minuti che porta oltre la soglia invia; una modifica che lascia l'importo invariato non invia); `balanceAlert = hasNegativeBalanceAlert(before, after)`.
15. **Deroga** (D-7): una modifica senza deroga **non** passa campi `forced*` a `flight.update` (il timbro esistente resta); una modifica che deroga li sovrascrive (unit, due casi).
16. **Atomicità sul DB reale** (sonda §4.3-b): con un trigger che fa fallire l'`UPDATE` del movimento della sonda, `updateFlight` lancia e il volo ha **ancora** i valori di prima (minuti, orari, importi); discriminanza: scrivendo l'update del volo fuori dalla transazione, la sonda trova il volo cambiato. Ripristino byte-identico (sha256).
17. **Concorrenza** (e2e nuovo, deterministico): `DELETE` e `PUT` **in parallelo** sullo stesso volo ⇒ `DELETE` = 204, `PUT` ∈ {200, 404} (mai 500); alla fine il volo non esiste, l'estratto conto del pilota non ha righe di volo, il saldo è `0,00 €`.

### Senza addebito (P1)

18. **Contratto**: `noCharge` (booleano, predefinito `false`) nel body di `POST`/`PUT` e nel DTO `Flight`; nell'OpenAPI la descrizione di `PUT` dice che l'omissione lo riporta a `false`.
19. **[Q-19.6-a = A] Registrazione**: con `noCharge: true` il volo ha `aircraftRateCentsPerHour = 0`, `aircraftAmountCents = 0` e, con istruttore, `instructorRateCentsPerHour = 0` / `instructorAmountCents = 0`; il `FLIGHT_CHARGE` vale **0** (`Object.is(amount, 0)`) con descrizione `Volo senza addebito {marche} {data} — {H:MM}`; `getEffectiveRate`/`getEffectiveInstructorRate` **non** sono chiamati (unit). e2e discriminante: su un velivolo **senza tariffa** lo stesso volo risponde **422 `NO_AIRCRAFT_RATE`** senza il flag e **201** con il flag. La categoria di prezzo (19.3) è valorizzata dal profilo anche qui.
20. **Modifica del flag**: un `PUT` che accende `noCharge` porta l'addebito a 0 e rende al conto l'importo di prima; uno che lo spegne lo ricalcola dalla tariffa a `flightDate` (e2e su saldo ed estratto conto).
21. **Compenso dovuto** (R-19-d): un volo Scuola senza addebito con istruttore aumenta i minuti e il dovuto del compenso di quell'istruttore di `round(minuti × payoutRate / 60)` (e2e su istruttore run-unique con tariffa payout impostata, letto dall'API dei compensi); unit di `instructor-compensation`: il `where` non ha più clausole di stato.
22. **Ricavi a zero**: `getFlightTotals` di un intervallo che contiene solo il volo senza addebito → `count 1`, `revenueCents 0` (unit o e2e sul KPI filtrato per velivolo run-unique).
23. **UI**: il toggle «Senza addebito» è nel form nuovo e in modifica (desktop e pannello mobile), precompilato in modifica, con `role="switch"` e `aria-checked` coerente; dopo il salvataggio il riepilogo mostra `0,00 €` con «Senza addebito»; nel registro la sottoriga `flight-no-charge` (desktop) e la nota `flight-no-charge-mobile` (card) compaiono **solo** sui voli senza addebito; l'estratto conto mostra `0,00 €` con la descrizione che **inizia** con «Volo senza addebito», sulla riga desktop e nella sottoriga della card mobile (e2e).
24. **Solo admin**: il flag passa solo da `POST`/`PUT /flights`, già `flights.manage` (i 403 esistenti per pilota restano verdi, uno con `noCharge: true` nel payload); nessun permesso nuovo.

### Via stato, filtri, badge (P5)

25. **API e lettori** (AD-9): `listFlightsQuerySchema` senza `status` (`GET /flights?status=CANCELLED` → 200 con **tutti** i voli del filtro, unit sullo schema: la chiave è scartata); DTO senza i cinque campi; `getFlightTotals` senza stato forzato (gli unit `:2781-2795` riscritti); nessun lettore di §AD-9 filtra lo stato (grep di AC 29).
26. **UI**: nessuna select Stato, nessun chip di stato, nessun badge «Annullato», nessuna riga di catena, nessuna riga «Annullato»/«Storico» nello sheet, nessuno stato nelle righe «Voli recenti» della scheda persona; «Annulla» e «Modifica» su ogni riga per l'admin; nessuna azione per pilota/allievo/istruttore (invariato). e2e riscritti di §3.6.
27. **Export**: xlsx e pdf del registro **senza** colonna Stato (`exports.spec.ts:129-146` senza `'Stato'`; i valori di riga allineati; lo spec pdf, se asserisce le colonne, idem).
28. **`FLIGHT_CHARGE_REVERSAL` assente** (D-5): enum Zod (`accounts.ts:22`), classificazione contabile (`transactions.service.ts:131`, `:181`, doc `:103-106`, `:270`, `:434-443`, `:469`), etichette del registro contabile (`billing/page.tsx:238`, `billing-console.tsx:224`), estratto conto (AD-8), chiavi export (`exports.service.ts:313`), OpenAPI. Gli unit di `transactions.service.test.ts` che lo usavano sono tolti o riscritti su un `ADJUSTMENT`, senza perdere i casi di segno che coprivano.

### Residui, contratti, seed, gate

29. **Nessun residuo**: tutti a **0 righe** (esclusi `src/generated/`, `prisma/migrations/`, `_bmad-output/`, `docs/`):
    - `grep -rnE "FlightStatus|flightStatusSchema|FlightStatusDto|cancelFlight|correctFlight|CancelFlight|CorrectFlight|loadRegisteredFlightForReversal|OriginalChargeMovement|correctionOf|correctedBy|cancelReason|FLIGHT_CHARGE_REVERSAL|flightChargeReversal|PackageConsumption|packageConsumption" src e2e messages scripts prisma/schema.prisma prisma/seed.ts prisma/seed-demo.ts prisma/seed-load.ts --exclude-dir=generated`
    - `grep -nE "cancelledAt|'CANCELLED'|\"CANCELLED\"|'REGISTERED'" src/server/services/flights.service.ts src/lib/schemas/flights.ts src/lib/mobile-logbook.ts 'src/app/[locale]/dashboard/logbook/'*.tsx`
    - `grep -nE "status: 'REGISTERED'|status: \{ not: 'CANCELLED' \}" src/server/services/stats.service.ts src/server/services/aircraft.service.ts src/server/services/people.service.ts src/server/services/instructor-compensation.service.ts 'src/app/[locale]/dashboard/page.tsx'`
    - `grep -rnE "flights/[^ ]*/(cancel|correct)" src e2e`
    - `grep -rnE "flight-status-badge|flight-filter-status|mobile-flight-status-chip|flight-cancel-reason|flight-cancel-required" src e2e`
    - `grep -nE "statusCancelled|cancelledDetail|correctReason|cancelPanel|correctPanel|reversalBadge|correctionBadge|statusAll" messages/it.json messages/en.json`
30. **i18n**: le chiavi di §3.8 rimosse da **entrambi** i file, le nuove presenti in entrambi, i testi cambiati; parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq … messages/en.json | sort)` vuoto) e conteggio riportato nel record.
31. **Seed**: `seed.ts` invariato (nessun volo); `seed-demo.ts` con **un** volo Scuola senza addebito (`FlightPlan.noCharge?`, `:179-189`, passato a `registerFlight`, `:439-453`), così che il PO veda la dicitura nell'estratto conto demo; `seed-load.ts` senza annullamenti, correzioni, storni e consumi di pacchetto (fasi di §3.5), con `noCharge` predefinito e i conteggi finali aggiornati. `npx prisma db seed` e `npm run seed:demo` verdi su DB fresco; `seed-load.ts` passa il typecheck (**NON** eseguirlo).
32. **OpenAPI servito**: `GET /api/v1/openapi.json` sull'app reale contiene `put` e `delete` su `/api/v1/flights/{id}` (risposte 200/204/403/404/409/422 documentate) e `noCharge`; non contiene `/flights/{id}/cancel`, `/flights/{id}/correct`, `CancelFlightRequest`, `CorrectFlightRequest`, `FLIGHT_CHARGE_REVERSAL`, `cancelReason`, `correctionOfId`, il parametro `status` di `GET /flights`. `registry.test.ts:52-53`, `:268-269` aggiornati, con un'asserzione di **assenza** dei due path vecchi. Descrizioni riscritte: `registry.ts:921` (filtri), `:954` (POST: «cancel or correct», «Only REGISTERED flights occupy…», «NOT /cancel//correct»), `:1515` (cancel prenotazione: il paragone con `/flights/{id}/cancel`).
33. **Route rimosse**: per l'admin `POST /api/v1/flights/{id}/cancel` e `/correct` → **404** (e2e, sullo stesso modello della sonda 404 della 19.1).
34. **Replay dopo cancellazione** (D-9, e2e): `POST /flights` con `Idempotency-Key: K` → 201; `DELETE` → 204; `POST` identico con `K` → **201** con `Idempotency-Replayed: true` e lo stesso `flight.id`, e `GET /flights?aircraftId=…` → **0** voli.
35. **Documenti**: `ARCHITECTURE-SPINE.md` §AD-6 (`:64-67`): la regola dice ancora «per rendere reversibile lo storno (AD-3)» → emendamento CR 2026-11-01 (consumo ritirato dalla 12.13, tabella eliminata dalla 19.6), sullo stile dell'emendamento di AD-3 (`:51`), che si verifica e non si riscrive. Nessun aggiornamento a `CLAUDE.md` atteso (verificare: nessun riferimento a storni o annullamenti di volo).
36. **Gate**: `npm run gates` verde; e2e mirati verdi via `scripts/e2e.sh start <spec…>` (§4.2) su DB fresco; l'arbitro full-suite lo esegue la sessione principale (delta dei test dichiarato nel record).
37. **Verifica UI interattiva** (Playwright MCP o script throwaway, v. CLAUDE.md), screenshot a **1280** e **375** di: form volo nuovo con toggle spento/acceso, form in modifica con toggle acceso precompilato, riepilogo di un volo senza addebito, conferma di cancellazione desktop, secondo passo dello sheet mobile (focus su «Indietro»), riga e card di un volo senza addebito, testata desktop senza la select Stato, testata mobile senza chip, estratto conto con la riga a 0 € (desktop e card); nessun buco di griglia, nessun overflow orizzontale, `.so-foot` invariato.

---

## §3 — Dev Notes: blast radius (misurato su `3876e72`; rieseguire dopo 19.2-19.5)

### 3.1 — Schema e migrazione
- `prisma/schema.prisma`: enum `AccountMovementType` `:594-600`; `AccountMovement` doc `:627-636`, `flightId` `:665-671`, `@@index([flightId])` `:674`; `HourPackage` doc `:809-814`, relazione `:861-865`; `FlightStatus` `:885-894`; `Flight` doc `:896-944`, `status` `:967`, `cancelledAt`/`cancelReason`/`correctionOf*` `:968-990`, `packageCoveredMinutes` doc `:1026-1033`, `movements` `:1056-1060`, `packageConsumptions` `:1060-1064`; `Booking` doc `:1110`; `PackageConsumption` `:1246-1281`. ⚠️ Gli altri `status`/`cancelledAt` del file (`Booking`, `Aircraft`, `ExpiryUpdateProposal`) **non** si toccano.
- Migrazioni d'origine (storiche, immutabili): `20260707150000_add_flights` (FK `SET NULL` `:56`), `20260707160000_add_package_consumption`, `20260707170000_add_flight_reversal` (catena), `20260709235408_add_training_notes`.

### 3.2 — Server
- `src/server/services/flights.service.ts`: modulo doc `:24-126` (paragrafi pacchetti `:45-53`, storno `:55-72`, sovrapposizione `:74-81`, core `:83-93`, lock `:95-111`, alert `:113-125`); `FlightListItem` `:139-179` (via `status` `:146`, `:168-174`; più `noCharge`); `RegisterFlightResult` doc `:186-195`; `FLIGHT_SELECT` `:199-235`; `SelectedFlight` `:237-268`; `toListItem` `:270-335`; `OriginalFlightIdentity` `:355-360`; `resolveFlightInput` doc `:532-611` + tariffe `:890-905` (AD-5.3); guardia `:926-1012`; `RegisterFlightCoreInput` `:1075-1114`; core doc `:1122-1146` + corpo `:1147-1222` (helper di AD-4); `registerFlight` `:1229-1374`; via `:1376-1785` (`OriginalChargeMovement`, `loadRegisteredFlightForReversal`, `cancelFlight`, `correctFlight`), al loro posto `deleteFlight`/`updateFlight`; `buildFlightsWhere` `:1839`; `listFlights` doc `:1843-1881`; `getFlightTotals` `:1931-1969`.
- `src/server/services/transactions.service.ts`: `:103-106`, `:131`, `:181`, `:270`, `:434-443`, `:469` (D-5).
- `src/server/services/exports.service.ts`: colonna Stato xlsx `:260-263` e pdf `:635-639`; `ACCOUNT_MOVEMENT_TYPE_KEYS` `:308-314`.
- `instructor-compensation.service.ts` `:20`, `:121`, `:129`, `:400`; `stats.service.ts` `:150`, `:171`; `aircraft.service.ts` `:721`, `:740`; `people.service.ts` `:258`, `:293`.
- Route: **nuova** `src/app/api/v1/flights/[id]/route.ts` (PUT, DELETE); **cancellate** `src/app/api/v1/flights/[id]/cancel/` e `[id]/correct/`; commento `src/app/api/v1/flights/route.ts:22-28`.

### 3.3 — Zod e OpenAPI
- `src/lib/schemas/flights.ts`: via `flightStatusSchema`/`FlightStatusDto` (`:13-16`) e `status` dal query schema (`:18-58`); `registerFlightFields` + `refine` (`:60-129`): **più** `noCharge`; lo split base/refine esisteva solo perché `correctFlightSchema` potesse estenderlo (doc `:83-90`) → si collassa in uno schema solo; `flightBreakdownSchema` (`:130-146`): tariffe `nonnegative()` [Q-a = A] + doc; `flightListItemSchema` (`:148-195`): via i cinque campi, più `noCharge`; via `cancelFlightSchema`/`correctFlightSchema` (`:222-253`).
- `src/lib/schemas/accounts.ts:18-22` (D-5); `src/lib/schemas/transactions.ts:93` (doc).
- `src/lib/schemas/registry.ts`: import `:77-78`, register `:281-282`, `:921`, `:954`, path `:964-990` (al loro posto `PUT`/`DELETE` `/api/v1/flights/{id}` con `flightIdParams` `:326`), `:1515`. `registry.test.ts:52-53`, `:268-269`.

### 3.4 — UI
| File | Righe | Cosa |
|---|---|---|
| `logbook/logbook-console.tsx` | import `:39`; `LogbookFilters` `:58`; labels `:101-127` (via 4 chiavi table, più `noCharge`), `:128-142` (via status), `:151-170` (via `lineage`/`correctionBadge`/`statusAll`), `:171-180` (via `reason`/`requiredReason`, più `warning`/`notFoundError`); stato del motivo `:252-257`, `:259-281`; focus `:290-293`; `buildFilterQuery` `:296-306`; reset `:330`; `statusBadgeAndLineage` `:356-401`; `statusChip` `:408-424`; `sheetRows` `:426-482`; `openSheet` `:485-491`; `statusChipHref` `:493-501`; commento `:512`; `postCancel`/`submitCancel`/`submitSheetCancel` `:545-606` (→ `DELETE`, nessun motivo, mappa 404/409); select Stato `:699-707`; riga `:751-819` (gate `:795`, cella Costo `:785-787`); chip `:852-886`; card `:895-931`; modal `:981-1029`; sheet `:1133-1234` | AD-8 |
| `logbook/page.tsx` | `:7`, `:28`, `:40`, `:51-52`, `:95`, `:143`, `:165`, `:179`, `:189`, labels `:282-287`, `:302-304`, `:311-317`, `:418-420`, `:428-436` | via status, nuove label |
| `logbook/flight-editor.tsx` | header `:3-21`; `FlightEditorTarget` `:38` (invariato, D-14); labels `:46-56`; `:306-307`; `:350-351`; `:570-572`; `:627`; `:646`; submit `:649-663`; errori `:693-700`; `:779-781`; force `:799-815`; titolo/sottotitolo `:848-849`; submit label `:872`; riepilogo `:879-948`; motivo `:1071-1083`; fieldset DC/solista `:1086-1099` (già `Toggle` dopo la 19.5: il toggle «Senza addebito» va accanto, fuori dal ramo `SCHOOL`) | AD-8 |
| `dashboard/page.tsx` | `buildFlightEditorLabels` `:761-776` (stesse chiavi del form); `:292`, `:885`; commento `:455` | label, AD-9 |
| `people/[id]/page.tsx` | `:218`, `:224`, `:449-451` | AD-8 |
| `my-account/page.tsx` | `:110`, `:115` | D-5 |
| `people/[id]/account-section.tsx` | `:64-66`, `:163-178`, `:240-241`, `:396-400`, `:488-494`, `:549-553` | D-5 |
| `billing/page.tsx` `:238`, `billing/billing-console.tsx` `:224` | etichetta del tipo | D-5 |
| `src/lib/mobile-logbook.ts` | `:13-35` | `FlightBadgeKind = 'forced'`, input senza `status`/`correction*` |
| `src/lib/mobile-self.ts` | `:42` | solo commento |

### 3.5 — Seed
- `prisma/seed-demo.ts`: `FlightPlan` `:179-189` (`noCharge?: boolean`), un volo Scuola con istruttore marcato `noCharge: true`, `registerFlight` `:439-453` (`noCharge: f.noCharge ?? false`).
- `prisma/seed-load.ts` (19.2 lo riscrive negli stessi punti, quindi va ricensito): `CANCEL_REASONS` `:202`; titolo di fase `:533`; tipo `FlightRow` `:566-575`; `:672-674`; blocco annullamenti/correzioni `:693-760` (via); `:778-780`; movimenti `:800-851` (via gli storni; `flightChargeMovementIdByFlightId` se resta senza uso); consumi `:1137-1198` (via le righe di consumo, i pacchetti storici restano); conteggi `:1372-1390`.

### 3.6 — Blast radius e2e (comando: `grep -rnE "flights/[^ ]*/(cancel|correct)|flight-cancel|flight-correct|flight-status-badge|status-chip|flight-filter-status|reversal-badge|FLIGHT_CHARGE_REVERSAL|correctionOf|cancelReason|status=(REGISTERED|CANCELLED)" e2e`)
- **`flight-reversal.spec.ts`** → riscritto come **`e2e/flight-delete-update.spec.ts`** (`git mv`: il nome vecchio descrive un meccanismo che non esiste più). `:161` diventa due test (cancellazione desktop: conferma con avviso → riga sparita, estratto conto senza riga, saldo `0,00 €`, secondo `DELETE` → 404; modifica desktop: stesso id, una sola riga in estratto conto col nuovo importo, nessun «Annullato»); `:320` diventa «pilota: 403 su `PUT` e `DELETE`».
- **`flight-log.spec.ts`**: `:195` senza la parte del volo annullato (`:214`, il commento del titolo); `:279` (filtro Stato) via; `:243-244` invariati.
- **`flights.spec.ts`**: `:610` (correzione con allievo-solo → modifica in place: `:696-697` cercano per **stesso id**, non per `correctionOfId`); E5 `:1063` (AC 11); E6 `:1120` e E8 `:1192` (in modifica il 409 nomina il volo in conflitto; il titolo perde «già stato annullato»); `:1108` via `status=REGISTERED`; E7 `:1271` già cancellato dalla 19.2.
- **`aircraft-out-of-service-until.spec.ts:573`**: `PUT` che tiene il velivolo fermo passa, `PUT` che sposta su un velivolo fermo → 422, `DELETE` mai bloccato.
- **`mobile-logbook.spec.ts`**: helper `cancelFlight` `:183-186` → `deleteFlight` (`DELETE`, 204), `readFlight` `:189-196` (senza `status`/`cancelReason`; serve un «il volo non c'è»); `:381` (badge: niente annullato, resta solo «Deroga» su riga non ordinaria); `:589` (l'admin ha le due azioni su **ogni** riga); `:624` → «cancellazione nello sheet»: avviso visibile, nessuna textarea, focus su «Indietro», **1** richiesta `DELETE` contata con `page.route('**/api/v1/flights/*', …)` filtrando `request.method() === 'DELETE'`, toast «Volo eliminato», volo assente via API, riga assente su entrambi gli alberi; `:814` (chip di stato) **cancellato**; `:837`, `:881` (click sul chip REGISTERED) riscritti senza chip; `:1060` (in modifica nessun `Idempotency-Key`, metodo `PUT`); lista testid desktop `:72` senza `flight-filter-status`.
- **`mobile-self-public.spec.ts`**: fixture di storno `:126-165` via; `:543` tiene solo la metà del badge della rettifica (titolo riscritto).
- **`exports.spec.ts:129-146`** (AC 27); `pdf-exports.spec.ts` se asserisce le colonne.
- `mobile-a11y-sweep.spec.ts:100`: solo commento (lo sheet ha ancora due azioni, il percorso del Tab non cambia).
- **Nuovi**: in `flight-delete-update.spec.ts` AC 17 (parallelo), AC 33 (404), AC 34 (replay); **`e2e/flight-no-charge.spec.ts`** con AC 19 (422 contro 201 senza tariffa), AC 20, AC 21 (compenso), AC 23 (UI: toggle, riepilogo, registro, estratto conto). Nessuno spec nuovo entra nella catena serializzata: nessuno muta AppSettings né asserisce aggregati globali (tutti filtrati su fixture run-unique).
- **Delta test**: dichiarare alla sessione principale il conteggio prima/dopo (−1 di `:814`, + i nuovi).

### 3.7 — Unit esistenti che cambiano
- `flights.service.test.ts`: import `:4-5`; fixture `:242`, `:274`; `:1348-1360` (`correctFlightSchema` via: il caso resta su `registerFlightSchema`); `describe` `cancelFlight` `:1563-1718` → `deleteFlight` (AC 4, 7, 8); `describe` `correctFlight` `:1719-2160` → `updateFlight` (AC 9-15, portati uno per uno); `:2114` e `:2227` (guardia e volo annullato: via, un volo cancellato non esiste); `describe` `:2342-2465` → «updateFlight — la guardia di sovrapposizione»; `listFlights` `:2607-2621` (filtro `status` via); `getFlightTotals` `:2781-2830` (stato forzato via); schema `:2856+`, `:2936+` (`noCharge`, `status` scartato). Casi nuovi: senza addebito (AC 19), ordine dei lock (AC 8, 13).
- `transactions.service.test.ts` (5 righe `FLIGHT_CHARGE_REVERSAL`), `exports.service.test.ts` (15: fixture senza `status`/`cancel*`/`correction*`, colonna Stato via), `instructor-compensation.service.test.ts:361-371`, `:465`, `people.service.test.ts:980`, `aircraft.service.test.ts` (il `where` di `sumFlightMinutesByAircraft`), `stats.service.test.ts` (se asserisce `status`), `flights-expiry-boundary.integration.test.ts` (4 righe), `mobile-logbook.test.ts` (6), `export-href.test.ts:10-15` (l'esempio `status: 'CANCELLED'` → un filtro vivo, es. `flightType: 'SCHOOL'`), `registry.test.ts`.
- **Env eager** (CLAUDE.md): nessun import nuovo verso mail/crypto; se un test nuovo importa un service «grosso», mockare la catena e verificare con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

### 3.8 — Chiavi i18n (in **entrambi** `messages/it.json` e `messages/en.json`)
- **Rimosse (47)**: `LogbookPage.table.{statusCancelled,cancelledDetail,correctionOf,correctedBy}`; `LogbookPage.filters.{status,allStatuses,statusOptions.registered,statusOptions.cancelled}`; `LogbookPage.mobile.{lineage,correctionBadge,statusAll}`; `LogbookPage.cancelModal.{reason,requiredReason}`; `LogbookPage.editor.{correctReason,requiredReason}`; `FlightsPage.cancelPanel.*` (8) e `FlightsPage.correctPanel.*` (6), orfani legati al concetto rimosso; `FlightsPage.list.table.{status,statusCancelled,cancelledDetail,correctionOf,correctedBy,cancelAction,correctAction}`; `FlightsPage.filters.{status,allStatuses,statusOptions.registered,statusOptions.cancelled}`; `PersonDetailPage.recentFlightsPanel.status.{registered,cancelled}`; `PersonDetailPage.accountPanel.movementType.flightChargeReversal`; `AccountStatementPage.movementType.flightChargeReversal`; `AccountStatementPage.reversalBadge.{ofDate,linked}`; `BillingPage.table.kinds.FLIGHT_CHARGE_REVERSAL`. ⚠️ `BillingPage.table.statusOptions.{reversed,reversal}` **restano** (storni di ricariche, rettifiche, cassa); le chiavi `*.confirmCancel` e quelle delle prenotazioni non c'entrano.
- **Nuove (8)**: `LogbookPage.table.noCharge` («Senza addebito» / «No charge»); `LogbookPage.editor.fields.noCharge` (idem); `LogbookPage.editor.fields.noChargeHint` («Il volo non viene addebitato: in estratto conto compare a 0 €. Il compenso dell'istruttore matura comunque.» / «The flight is not charged: it shows at €0 in the account statement. The instructor's compensation still accrues.»); `LogbookPage.editor.notFoundError` («Questo volo non esiste più: è stato eliminato.» / «This flight no longer exists: it has been deleted.»); `LogbookPage.editor.result.updatedTitle` («Addebito aggiornato» / «Charge updated»); `LogbookPage.editor.result.noCharge` («Senza addebito» / «No charge»); `LogbookPage.cancelModal.warning` (`t.raw`, segnaposto `{person}`; testo di AD-8 / «The flight and its charge will be permanently deleted: it will disappear from the flight log and from {person}'s account statement, and the balance will be recalculated. This cannot be undone.»); `LogbookPage.cancelModal.notFoundError` («Questo volo non esiste più: è già stato eliminato.» / «This flight no longer exists: it has already been deleted.»).
- **Testo cambiato (6)**: `cancelModal.submit` → «Elimina volo» / «Delete flight»; `cancelModal.success` → «Volo eliminato.» / «Flight deleted.»; `cancelModal.genericError` → «Impossibile eliminare il volo. Riprova.» / «Could not delete the flight. Please try again.»; `cancelModal.conflictError` → «L'addebito di questo volo è stato rettificato a mano: il volo non si può eliminare.» / «This flight's charge was adjusted by hand: the flight cannot be deleted.»; `editor.correctSubmit` → «Salva modifiche» / «Save changes»; `editor.conflictError` → «L'addebito di questo volo è stato rettificato a mano: il volo non si può modificare.» / «This flight's charge was adjusted by hand: the flight cannot be edited.». Copy definitiva: la 19.12 (glossario).

---

## §4 — Piano di test

### 4.1 — Unit
Come §3.7. Le prove nuove: (a) `deleteFlight`: 403 prima di ogni query, 404 dal lock, 409 con rettifica, ordine dei lock, movimento cancellato prima del volo e sul `tx` (AC 4, 7, 8); (b) `updateFlight`: nessuna creazione, `update` del volo e del movimento con i dati esatti, cambio persona, lock, 404 concorrente, sovrapposizione, alert, deroga (AC 9-15); (c) senza addebito: nessuna ricerca tariffa, snapshot e addebito a 0 con `Object.is`, descrizione (AC 19); (d) schema: `noCharge` predefinito `false`, `status`/`reason` scartati; (e) lettori senza stato (AC 21, 25).

### 4.2 — e2e (project `chromium` `fullyParallel`, fixture run-unique, via `scripts/e2e.sh`)
Mirati da far girare prima della consegna: `flight-delete-update`, `flight-no-charge`, `flights`, `flight-log`, `mobile-logbook`, `mobile-self-public`, `aircraft-out-of-service-until`, `exports`, `pdf-exports`, `account-adjustments`, `billing`, `instructor-compensation` (se tocca i minuti), `api-v1`, `person-detail`. Ripetere run mirati sullo stesso DB fa scattare il lock anti-brute-force (CLAUDE.md, TD-6): resettare il DB prima di attribuire un rosso alla flake di login.

### 4.3 — Discriminanza e sonde (obbligatorie nel Dev Agent Record)
- **(a) Atomicità della cancellazione, DB reale**: sul gemello, `CREATE FUNCTION … RAISE EXCEPTION` + `CREATE TRIGGER … BEFORE DELETE ON "Flight" FOR EACH ROW WHEN (OLD."id" = '<id sonda>')`; uno script throwaway eseguito con `tsx` dalla root del repo (precedente: `seed-demo.ts` chiama i service veri; `set -a; . ./.env; set +a` e poi `DATABASE_URL=<gemello>`) chiama `deleteFlight(admin, id)` → deve lanciare; psql: l'addebito c'è ancora. Poi la discriminanza: spostare `accountMovement.delete` su `prisma` fuori dal `tx` → la sonda trova l'addebito **sparito** (rosso); ripristino byte-identico, sha256 del file prima/dopo.
- **(b) Atomicità della modifica, DB reale**: trigger `BEFORE UPDATE ON "AccountMovement"` sull'addebito della sonda; `updateFlight` con minuti diversi → lancia; il volo ha i valori di prima. Discriminanza: `flight.update` fuori dal `tx` → il volo risulta cambiato (rosso); ripristino byte-identico.
- **(c) Lock `Flight`**: togliere il `SELECT … "Flight" … FOR UPDATE` da `updateFlight` → l'unit dell'ordine dei lock (AC 13) **rosso**; ripristino byte-identico.
- **(d) `RESTRICT`**: psql di AC 7 (errore 23503 verbatim).
- **(e) Senza addebito**: togliere il salto delle tariffe → l'e2e/unit «velivolo senza tariffa + `noCharge` → 201» **rosso** (422); ripristino byte-identico.
- **(f) Migrazione**: `diff` delle SUM per conto (AC 2), output verbatim.

### 4.4 — Gate
`npm run gates` (mai i quattro comandi verbosi separati) + i grep di AC 29 + la parità di AC 30 + gli e2e mirati. **Prima** di gates, build ed e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` (mai una build sotto un arbitro vivo, incidente AOG-1b in HANDOFF); trigger e script delle sonde **solo** sul gemello, mai su `airmanager`.

---

## §5 — Trappole note

1. **Ordine nella migrazione**: `PackageConsumption` (RESTRICT) va eliminata **prima** dei voli; i `DELETE` vanno **prima** del `DROP COLUMN "status"`, che servirebbe a selezionarli. Prisma non genera i `DELETE`: vanno scritti a mano in testa.
2. **`@unique` su `flightId` fallisce se restano storni**: è voluto (verifica gratuita). Se fallisce sul gemello, la causa è nei dati, non nella migrazione.
3. **Ordine delle due cancellazioni**: con `RESTRICT` cancellare il volo prima dell'addebito fallisce. È l'esito giusto, non un errore da aggirare con `CASCADE`.
4. **`FOR UPDATE` sulla riga `Flight` con 0 righe**: va tradotto in `NotFoundError`, mai lasciato proseguire. Senza, il primo `update` dà P2025 → 500.
5. **`instructorAmountCents` a 0 e non `null`** sul volo senza addebito con istruttore: `toListItem` riconosce l'istruttore da `!== null` (`:285`), e un `null` farebbe sparire la componente istruttore dal riepilogo.
6. **`0 - 0` e non `-0`**: stessa lezione di `:1198-1203`; asserire con `Object.is` o `toBe(0)`.
7. **`PUT` = sostituzione completa**: il form invia **sempre** `noCharge` (anche `false`), altrimenti una modifica dal web spegnerebbe il flag in silenzio.
8. **`getByLabel`/`hasText` sono substring** (CLAUDE.md): «Senza addebito» compare nel toggle, nella sottoriga e nell'hint → selettori per testid o `{ exact: true }`; mai `hasText` con valori monetari o `H:MM` per scegliere una riga.
9. **Mai `Escape` dentro lo `SlideOver`** per chiudere un combobox del form in modifica: si chiude interagendo col campo successivo.
10. **Il secondo passo dello sheet perde il suo campo focalizzabile** (la textarea): senza un target esplicito il focus cade su `<body>` (review 15.2 F1). Va su «Indietro».
11. **Testid duplicati**: `flight-no-charge` (desktop) e `flight-no-charge-mobile` (card) non collidono con selettori `^=` (verificato: l'unico `^=` del registro è `flight-row-mobile`); rifare `grep -rn 'data-testid\^=' e2e/` prima di scegliere altri nomi.
12. **File in comune con 19.2-19.5** (banner): rifare i censimenti; in particolare `correctFlight` dopo la 19.3 contiene la regola della categoria, che va **portata** in `updateFlight`, non persa.
13. **`src/generated/prisma`** è gitignored: `npx prisma generate` dopo lo schema, altrimenti typecheck e build girano su un client stantio.
14. **Commenti storici** che nominano `cancelFlight`, `correctionOfId` o `FLIGHT_CHARGE_REVERSAL` come se esistessero: il grep di AC 29 li prende; vanno riformulati anche quando raccontano il passato (lezione 13.4).

---

## §6 — Fuori scope DICHIARATO

- Check sul saldo e suo salto per il senza addebito, rimozione di `forceReason` e del badge «Deroga», pattern unico di avviso: **19.9** (qui `noCharge` è solo un dato che la 19.9 leggerà).
- Snapshot del compenso istruttore sul volo e sua conservazione nella modifica in place: **16.5** (dopo questa story).
- 422 sulla rettifica manuale di un `FLIGHT_CHARGE` (che chiude la porta di D-8): **16.6b**.
- Estratto conto ordinato per data valuta, con saldo progressivo: **19.11**.
- Revisione delle copy nuove: **19.12**.
- Un permesso dedicato al senza addebito (D-11), un log di audit di cancellazioni e modifiche (D-1), un `updatedByUserId` (D-13), una colonna «Senza addebito» negli export del registro (D-10).
- Il drop di `HourPackage` e di `Flight.packageCoveredMinutes` (schema morto dalla 12.13, non reso morto da questa story): si segnala, non si tocca.
- Migrare o ri-seminare `airmanager_load` (epic 17).

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§2.3, §4.0 R-19-a/c/d/h, §4.2 riga 19.6, §4.3, §4.8, §4.10 A9/A10/A12, Addendum Q-19.3-b).
- PRD: `prds/prd-AirManager-2026-07-04/prd.md` (change record FR-16 `:411`, FR-47 `:418`; «nessuna chiusura del mese» `:365`).
- Architettura: `ARCHITECTURE-SPINE.md` §AD-3 (`:47-51`, emendamento già scritto), §AD-6 (`:64-67`, da emendare, AC 35).
- Precedenti: `5-3-*` (storno e catena che questa story sostituisce), `16-2-guardie-registro-voli.md` (lock, `FLIGHT_OVERLAP`, LOW-1), `15-6-*` (sheet mobile, secondo passo, focus), `14-9-rimozione-ruolo-staff.md` e `19-2-*` (migrazione distruttiva su DB gemello), `19-3-*` (Q-19.3-b in `correctFlight`), `19-5-*` (primitiva `Toggle`).
- `CLAUDE.md` (convenzioni e2e, gates, env eager, manutenzione); `docs/handoffs/HANDOFF.md` (ambiente, reset DB, arbitro).

---

## Tasks / Subtasks

- [ ] **T0 — Riallineamento** (tutti gli AC): `git log --oneline -8` (19.1-19.5 committate), `scripts/e2e.sh status`, `:3000` libero; leggere l'API reale del `Toggle` (19.5) e la forma di `correctFlight` dopo la 19.3; rieseguire i comandi di §3.6 e i grep di AC 29 sul HEAD e annotare nel record gli scostamenti di riga.
- [ ] **T1 — Schema e migrazione** (AC 1, 2): `schema.prisma` (AD-7 con i doc-comment); migrazione AD-1 con i `DELETE` in testa; verifica sul gemello con le quattro fixture (SUM prima/dopo, post-condizioni, catena da zero, `migrate diff` vuoto, psql); `npx prisma generate`.
- [ ] **T2 — Service** (AC 3-22, 25, 28): `deleteFlight` (AD-3), `updateFlight` (AD-4) col helper di scrittura condiviso, `noCharge` in `resolveFlightInput`/core (AD-5), lock (AD-2), lettori di AD-9, D-5 in `transactions.service.ts` ed `exports.service.ts`; doc-comment del modulo riscritti.
- [ ] **T3 — Route, Zod, OpenAPI** (AC 18, 25, 32, 33): `flights/[id]/route.ts` (PUT/DELETE), cancellare `cancel/` e `correct/`; `flights.ts`, `accounts.ts`, `registry.ts`, `registry.test.ts`.
- [ ] **T4 — UI registro** (AC 23, 26): `logbook-console.tsx`, `logbook/page.tsx`, `mobile-logbook.ts` (AD-8 desktop e mobile).
- [ ] **T5 — UI form** (AC 20, 23): `flight-editor.tsx` (toggle, `PUT`, via motivo, errori, riepilogo), label in `logbook/page.tsx` e `dashboard/page.tsx`.
- [ ] **T6 — UI conti e scheda persona** (AC 26, 28): `account-section.tsx`, `people/[id]/page.tsx`, `my-account/page.tsx`, `billing/page.tsx`, `billing-console.tsx`, `mobile-self.ts`.
- [ ] **T7 — i18n** (AC 30): §3.8 su entrambi i file; parità misurata.
- [ ] **T8 — Seed** (AC 31): `seed-demo.ts` (un volo senza addebito), `seed-load.ts` (§3.5), `db seed` + `seed:demo` su DB fresco, `seed-load.ts` solo typecheck.
- [ ] **T9 — Unit** (§4.1): §3.7 + le prove nuove; sonde e discriminanze §4.3 (a)-(f) con sha256.
- [ ] **T10 — e2e** (§3.6): `git mv` + riscrittura di `flight-reversal.spec.ts`, `flight-no-charge.spec.ts` nuovo, gli spec riscritti; delta dei test.
- [ ] **T11 — Documenti** (AC 35): emendamento di AD-6 in `ARCHITECTURE-SPINE.md`; verifica che `CLAUDE.md` non citi storni o annullamenti di volo.
- [ ] **T12 — Verifica** (AC 29, 32, 36, 37): grep a zero, OpenAPI servito, `npm run gates`, e2e mirati via `scripts/e2e.sh`, screenshot 1280/375; Dev Agent Record compilato.

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD (T0)

### §B — Riepilogo per AC con le prove

### §C — Migrazione: fixture, SUM per conto prima/dopo, post-condizioni, `migrate diff`, psql

### §D — Sonde e discriminanze §4.3 (a)-(f) con sha256

### §E — Grep di AC 29 e parità i18n (verbatim)

### §F — Delta test (unit ed e2e, prima/dopo; mappa `correctFlight` → `updateFlight`)

### §G — Deviazioni motivate

### §H — Verifica UI (screenshot)

### §I — Gate ed esiti verbatim

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `3876e72`).

### File List
