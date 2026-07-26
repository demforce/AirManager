# Design — Rework della pagina Contabilità: risultato, tesoreria, acconti

**Data**: 2026-07-26 · **Stato**: approvato dal PO (brainstorming 2026-07-26) · **Attuazione**: 2 story (v. §7)

## 1. Il problema

La pagina Contabilità risponde a tre domande diverse con un'unica colonna firmata, e nessuna convenzione di segno può servirle tutte e tre.

Oggi `transactions.service.ts#toAccountRow` capovolge il segno di ogni movimento di conto (`amountCents: -row.amountCents`) per renderlo "club-centrico": il bonifico del pilota, positivo nel DB perché è un suo credito, appare **negativo** a schermo (ma in verde, perché è un incasso); l'addebito del volo, negativo nel DB, appare **positivo**. I movimenti di denaro (`CashMovement`) passano invece senza capovolgimento. Il KPI "Ricavi" somma tutti i positivi.

Conseguenza: il versamento del pilota è costretto a "fingere" di essere un costo, e non si distingue cosa è ricavo, cosa è costo e quanto l'aviosuperficie deve ai piloti.

**Terminologia ratificata**: le somme versate in anticipo dai piloti sono un **debito verso i piloti** — in contabilità italiana **acconti (o anticipi) da clienti**, voce del passivo. Dal lato del pilota è un credito. Un debito alto non è un segnale negativo: indica volato futuro già finanziato.

## 2. Il principio

Tre libri distinti, non tre significati nella stessa colonna:

| Libro | Domanda | La ricarica del pilota |
|---|---|---|
| **Risultato economico** | Come sta andando l'attività? | **Non compare** |
| **Tesoreria** | Dove sono i soldi e quanti sono? | Entrata di denaro |
| **Acconti** | Quanto di quei soldi non è mio? | Aumenta il debito |

Un movimento può comparire in più libri con ruoli diversi. Il ricavo nasce quando il volo viene registrato e addebitato, non quando il pilota versa.

**Classificazione ricavo/costo — regola risolutiva**: la categoria dice *di cosa* si tratta, il singolo movimento dice *in che direzione* va. Non si etichetta la categoria (il carburante si compra **e** si rivende: nessuna etichetta binaria regge). Per ogni categoria si tengono due totali, entrate e uscite, e il netto — come una prima nota:

```
Carburante    uscite 1.240,00 €   entrate 310,00 €   netto −930,00 €
Manutenzione  uscite   480,00 €   entrate   0,00 €   netto −480,00 €
PPR           uscite     0,00 €   entrate 225,00 €   netto +225,00 €
```

Questo modello **esiste già**: `cash.service.ts#getCashReport` (story 3.5) lo calcola in SQL per categoria, è testato ed è esposto via API e PDF. Va portato in primo piano, non reinventato.

## 3. Aggiunte al modello dati

1. **`CashMovement.paymentMethod`** (`CASH | BANK_TRANSFER | POS`, nullable per lo storico). Obbligatorio sulle nuove registrazioni. Backfill deterministico: i gemelli delle ricariche ereditano il metodo dal loro `AccountMovement` (che lo possiede già); i movimenti manuali storici restano `null` e vengono mostrati come "non attribuiti" finché un admin non li assegna.
2. **Saldi di apertura** in `AppSetting`: importo cassa, importo banca, data di apertura. È ciò che rende il numero un saldo confrontabile con l'estratto conto invece di un netto dei soli movimenti registrati.
3. **Il compenso istruttore genera il suo movimento di denaro.** Oggi `recordPayout` crea solo un `InstructorPayout` (con il suo `method`) e non tocca `CashMovement`: il pagamento all'istruttore non appare né tra i costi né tra le uscite. Va creato il gemello — stesso pattern già usato da `recordTopUp` per la ricarica — sotto una categoria dedicata, con il link di tracciabilità.

## 4. Regole di calcolo (scritte per non contare due volte lo stesso euro)

- **Ricavi** = addebiti sui conti dei piloti (`FLIGHT_CHARGE`, `ADJUSTMENT` a debito, al netto degli storni `FLIGHT_CHARGE_REVERSAL`) **+** entrate di denaro che **non** sono il gemello di un movimento di conto (`accountMovementId IS NULL`): PPR pagato in contanti da un transito, rivendita di carburante.
- **Costi** = uscite di denaro per categoria, compensi istruttori inclusi (una volta creato il gemello del punto 3.3).
- **Risultato** = ricavi − costi.
- **Saldo cassa** = apertura cassa + Σ movimenti con metodo `CASH` dalla data di apertura.
- **Saldo banca** = apertura banca + Σ movimenti con metodo `BANK_TRANSFER` o `POS`.
- **Acconti piloti** = Σ dei saldi **positivi** dei conti. A fianco, l'**esposizione** = Σ dei saldi negativi (chi ha volato senza copertura).
- **Disponibile** = cassa + banca − acconti piloti.

L'anti-doppio-conteggio poggia su un fatto già nel modello: un `CashMovement` con `accountMovementId` valorizzato è il gemello di un movimento di conto, quindi il suo euro è già contato dal lato conto.

## 5. La pagina

Tre riquadri in alto che non si mescolano, e sotto un registro unico:

```
RISULTATO LUGLIO        LIQUIDITÀ                 ACCONTI PILOTI
Ricavi     4.820 €      Cassa         2.150 €     Totale      8.150 €
Costi     −2.310 €      Banca        10.250 €     Esposizione  −180 €
= Utile    2.510 €      di cui acconti 8.150 €    In rosso        2
                        Disponibile   4.250 €     → dettaglio

REGISTRO                    ENTRATE     USCITE   TIPO
26/07  Volo I-B412                 —    132,00   ricavo
26/07  Ricarica Rossi        500,00         —    acconto ▸ non incide sul risultato
25/07  Carburante                  —    240,00   costo
```

- Colonne **Entrate/Uscite** separate al posto dell'importo firmato: sparisce l'ambiguità del segno.
- Colonna **tipo** (ricavo · costo · acconto · giroconto), che è anche filtro.
- Le righe di acconto restano visibili ma marcate come non incidenti sul risultato.
- Il dettaglio per categoria (entrate/uscite/netto) resta disponibile come oggi, alimentato da `getCashReport`.

## 6. Cosa NON cambia

- Il modello dei conti pilota e degli addebiti volo: invariati, questo lavoro non tocca come nascono i movimenti.
- L'estratto conto della scheda persona: resta pilota-centrico (il pilota vede il **suo** credito), che è la prospettiva giusta per lui.
- Gli export esistenti e le loro route.

## 7. Suddivisione in story

**Story 1 — Fondamenta (invisibile all'utente).** Migrazione `CashMovement.paymentMethod` + backfill dai gemelli; saldi di apertura in Impostazioni; gemello di denaro per i compensi istruttori; servizio di calcolo dei tre blocchi con le regole del §4, coperto da unit test. Nessun cambiamento di UI oltre al campo metodo nei form di registrazione.

**Story 2 — Pagina.** I tre riquadri, il registro a due colonne con la colonna tipo e i suoi filtri, il secchiello dei movimenti "non attribuiti", la coerenza AirOps e gli e2e.

La prima rende la seconda quasi banale: quando i numeri esistono e sono testati, la pagina è presentazione.

## 8. Rischi e punti di attenzione

- **Doppio conteggio**: è il rischio principale; la regola del gemello (§4) va coperta da unit test espliciti, incluso il caso di uno storno.
- **Storico non attribuito**: finché i movimenti manuali vecchi non hanno un metodo, cassa e banca non quadrano con l'estratto conto. Il secchiello "non attribuiti" deve essere visibile, non nascosto.
- **`getBillingKpis` attuale** definisce "Ricavi" come Σ dei positivi e "Costi" come la stessa cifra con sotto-etichetta diversa (era una ratifica dell'epoca): va sostituito, non affiancato, altrimenti convivono due definizioni di ricavo.
- **Statistiche**: `stats.service` riusa `getLedgerRevenueCents` per non divergere dai KPI di Contabilità (ratifica utente 4, "MAI reimplementarle"). Cambiando la definizione di ricavo va aggiornato insieme, o le due pagine divergono.
