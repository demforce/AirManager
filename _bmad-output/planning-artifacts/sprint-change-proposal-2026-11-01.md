# Sprint Change Proposal — Change request PO del 2026-11-01

**Stato**: ✅ APPROVATA dal PO il 2026-11-01 (dopo la revisione della currency: X voli negli ultimi Y giorni)
**Data**: 2026-11-01 · **Autore**: sessione principale (workflow `bmad-correct-course`, modalità Batch) · **PO**: Enrico
**Baseline**: HEAD `6bf1488` (branch `dev`), Epic 16 in corso (16.1/16.2 done, 16.3 in fix cycle), epic 17-18 in backlog
**Ricognizione**: 4 subagent in sola lettura (PPR/transiti · form anagrafiche e tariffe · voli/scadenze/check · estratto conto/form/impostazioni/i18n), report citati per path e riga
**Ratifiche**: 17 decisioni PO raccolte con AskUserQuestion il 2026-11-01 (§4.0); le assunzioni minori in §4.10 si ratificano con l'approvazione di questo documento

---

## 1. Issue Summary

**Tipo**: nuovo requisito dagli stakeholder (revisione di prodotto del PO dopo l'uso dell'app con i dati demo).

Il PO ha consegnato 15 richieste che semplificano il prodotto (via PPR e transiti, via campi inutilizzati,
via il contaore), cambiano regole di dominio (tariffe allievo/pilota, profili esclusivi, volo senza addebito,
cancellazione definitiva dei voli, currency, quota associativa a sé, visite mediche universali), introducono un
modello uniforme di **avviso con «procedi comunque»** per l'admin su voli e prenotazioni, impongono **un solo
Salva per form**, chiedono un estratto conto che regga migliaia di righe e una revisione completa dell'italiano.

**Contesto**: siamo in sviluppo, il DB è di test (dichiarazione PO): le migrazioni possono essere distruttive e
nessun dato storico va preservato.

**Domanda del punto 3 (estratto conto) — risposta fattuale**: paginazione server-side a 20 righe con solo
precedente/successiva; nessun filtro per periodo (il backend lo supporta già, `accounts.service.ts:357,372-382`,
ma la UI passa `{}`); nessun saldo progressivo; ordinamento per data di inserimento, non per data valuta; export
PDF con tetto 2.000 righe e Excel 10.000 (`exports.service.ts:63,66`) → **un conto lungo non è più esportabile**
e non si può restringere il periodo. Nessuna story dell'epic 17 lo copre. → diventa la story 19.11.

---

## 2. Impact Analysis

### 2.1 Epic Impact

| Epic | Impatto |
|---|---|
| **16 Correttezza del dominio** (in corso) | 16.3: si chiude il fix cycle (review già fatta) PRIMA della CR. **16.4 assorbita** da 19.9/19.10 (le funzioni di scansione bloccante vengono riscritte). **16.5** resta, dopo 19.6 (la correzione diventa un aggiornamento in place: «la correzione eredita lo snapshot» R-16-j va riletta; volo gratuito = compenso dovuto). **16.6a** resta senza la parte «voli annullati fuori dal PDF» (non esisteranno più). **16.6b** riperimetrata: R-16-g («una quota per anno civile») **superata** dalla quota a 12 mesi; restano Idempotency-Key stabile, 422 sulla rettifica di un FLIGHT_CHARGE, classificatore. **16.7** perde l'AC del rate limit PPR. **16.8** resta (le azioni Archivia/Fuori servizio restano bottoni a parte nel Salva unico). **16.9** resta (le copie client di `todayDateOnly`; le story 19.3/19.4 usano già la data di Roma per il loro codice nuovo). |
| **17 Scalabilità** (backlog) | 17.4: le statistiche perdono i transiti. 17.5: `listAccountMovements` viene toccato da 19.11 (coordinare: 19.11 non introduce nuove transazioni interattive). 17.7: sparisce l'export PDF PPR. Harness `scripts/perf/targets*.json`: i target PPR si tolgono in 19.1. |
| **18 Mobile 2 e desktop** (backlog) | Le superfici mobile PPR/Transiti spariscono (19.1). 18.5 «righe, tab, lessico» si sovrappone a 19.12 per il lessico: 19.12 fissa il glossario, 18.5 lo applica alle superfici mobile restanti. |
| **19 — NUOVO**: «Semplificazione e regole operative (CR PO 2026-11-01)» | 12 story, §4.2. Eseguito **subito dopo la chiusura della 16.3**, prima di riprendere 16.5+. |

### 2.2 Artefatti in conflitto

- **PRD**: FR-22/23/24 (PPR) eliminati; FR-7, FR-9 (contaore) modificati/eliminati; FR-10, FR-11 (tariffe) modificati;
  FR-16 (annullamento con storno) sostituito; FR-21 (blocco prenotazione) esteso a voli/prenotazioni con quattro check
  e deroga admin; FR-26 (estratto conto) esteso; FR-29 (movimenti cassa da PPR) modificato; FR-35 (tipi scadenza)
  modificato; FR nuovi: FR-46 currency, FR-47 volo senza addebito, FR-48 Salva unico, FR-49 profili pilota/allievo
  esclusivi; NFR-1 perde «form PPR». Dettaglio in §4.7.
- **Architettura** (`ARCHITECTURE-SPINE.md`): **AD-3** (ledger append-only) riceve un'eccezione esplicita per il
  `FLIGHT_CHARGE`: si cancella col volo e si aggiorna con la modifica del volo; **AD-4** (tariffe) cambia: due prezzi
  per velivolo scelti dal profilo, `validFrom ≥ oggi`, riscrittura delle righe con `validFrom ≥ oggi`. Dettaglio §4.8.
- **UX**: nessun documento UX formale; vincoli UI = design system AirOps. Nuova primitiva `Toggle` (bottone on/off)
  in `src/components/ui`.
- **Altri artefatti**: `CLAUDE.md` (route map: via `ppr`, `movements`, `/ppr`), `README.md`, seed (`seed.ts`,
  `seed-demo.ts`, `seed-load.ts`), `scripts/perf/targets*.json`, OpenAPI (`registry.ts`), e2e (≈40 spec toccati in
  totale), CI invariata (nessuna env var nuova prevista).

### 2.3 Impatto tecnico (sintesi della ricognizione)

- **PPR + Voli in transito sono UN solo dominio**: `/dashboard/movements` è una seconda vista sulla stessa tabella
  `PprRequest` (PENDING→APPROVED in «Richieste PPR», APPROVED→COMPLETED/CANCELLED in «Voli in transito»). Si elimina
  l'intero dominio: 2 pagine dashboard + form pubblico `/ppr`, 7 route API, `ppr.service.ts`, 3 template email,
  permesso `ppr.manage`, 2 modelli + 1 enum + FK `CashMovement.pprRequestId`, 3 chiavi AppSetting, KPI Panoramica,
  serie/quote Statistiche (contratto `/api/v1/stats` cambia), export xlsx/pdf PPR.
- **Contaore**: `Aircraft.hourMeterMinutes` (NOT NULL), tabella `HourMeterAdjustment`, `Flight.hourMeterStart/End`.
  Nessuna logica di manutenzione dipende dalle ore; la durata del volo viene da decollo/atterraggio dall'11.1.
  ⚠️ Il lock `FOR UPDATE` sull'`Aircraft` in registrazione volo serializza anche la guardia `FLIGHT_OVERLAP` (16.2):
  **resta** anche senza contaore.
- **Tariffe**: oggi si fattura solo `priceCentsPerHour` (wet); `dryHourlyRateCents` è solo informativo.
- **Cancellazione volo**: `AccountMovement.flightId` è `ON DELETE SET NULL` (cancellare il volo orfanerebbe in silenzio
  i movimenti → vanno cancellati esplicitamente), `PackageConsumption.flightId` è `RESTRICT` (righe storiche
  pre-12.13 da eliminare in migrazione), `loadRegisteredFlightForReversal` lancia se manca il FLIGHT_CHARGE (un volo
  gratuito deve avere un FLIGHT_CHARGE a 0).
- **Visite mediche «per tutti»**: impostare semplicemente `scope = ALL` sulle 3 visite bloccherebbe OGNI volo
  (`findMissingBlockingDocuments` richiederebbe tutte e tre le classi a tutti) → serve la regola nuova «almeno una
  visita valida di qualsiasi classe».
- **Due pattern di deroga** oggi: `force`+`forceReason` (voli, prenotazioni) e `override` senza motivo (quota). La CR li
  unifica in un solo pattern (§4.4).
- **Salva unico**: i pannelli Pilota (6 form), Istruttore (3 + scadenze), Velivolo (3 + comandi) e le Impostazioni
  (5 salvataggi per card + 3 CRUD) chiamano endpoint separati; la R-15.10-f («i submit di sezione restano dove sono»)
  viene **superata**. Il precedente `club-card.tsx:90-116` (5 PUT in `Promise.all`) è NON atomico: non va replicato.

---

## 3. Recommended Approach

**Direct Adjustment con un epic nuovo (Epic 19)** + riperimetrazione delle story 16.x/17.x/18.x toccate.
Rollback: non viable/non utile (nulla di quanto fatto va annullato: si rimuove codice vivo con story dedicate).
MVP review: non serve (la CR riduce il perimetro, non lo allarga, salvo currency/deroga che sono regole operative).

- **Classificazione**: **Moderate** — riorganizzazione del backlog con un epic nuovo; il PO ha già ratificato le
  regole di dominio; architettura toccata in due AD (emendamenti puntuali, non un replan).
- **Effort**: alto (12 story, tutte con UI → dev Opus 5 xhigh, review Opus 5 xhigh adversarial).
- **Rischio**: medio. Le aree a rischio sono i check con deroga (19.9/19.10: toccano registrazione voli e tre
  percorsi di scrittura delle prenotazioni coi lock della 16.3) e il Salva unico atomico (19.3/19.4/19.8).
- **Ordine**: chiusura 16.3 → 19.1 … 19.12 → 16.5, 16.6a, 16.6b, 16.7, 16.8, 16.9 (riperimetrate) → epic 17 → epic 18.

---

## 4. Detailed Change Proposals

### 4.0 Decisioni PO ratificate (2026-11-01)

| ID | Decisione |
|---|---|
| R-19-a | Eliminazioni PPR/transiti, codice fiscale, campi velivolo: **DROP totale**, inclusi i movimenti di cassa delle tasse PPR («siamo ancora in dev, il db è di test»). |
| R-19-b | Contaore: **eliminato tutto** (contaore velivolo, rettifiche, contatori sul volo — UI+API+DB). Le ore del velivolo, dove mostrate, sono la somma dei voli registrati. |
| R-19-c | Annullare un volo = **cancellare volo + suo addebito** (sparisce anche dall'estratto conto, saldo ricalcolato); la **modifica** di un volo diventa un aggiornamento in place (niente righe «annullato»); i voli già annullati vengono eliminati in migrazione. |
| R-19-d | Volo **senza addebito** (solo admin): il compenso dell'istruttore **matura comunque**; in estratto conto il volo compare a 0 € con la dicitura «senza addebito». |
| R-19-e | Prezzo del velivolo **dal profilo della persona**: allievo → prezzo allievo, pilota → prezzo pilota (anche su un volo Scuola). I profili **pilota e allievo sono mutuamente esclusivi** (un allievo non ha licenza); il profilo istruttore resta combinabile col pilota. |
| R-19-f | Decorrenza tariffe **uguale per velivolo e istruttore**: «In vigore da» predefinito oggi, minimo oggi; il campo mostra la tariffa attuale come placeholder; vuoto = invariata; una tariffa con data ≥ oggi si può riscrivere (i voli registrati hanno il prezzo congelato). Nessuno storico visibile. |
| R-19-g | Saldo insufficiente = **il saldo non copre il costo del volo** (prenotazione: costo stimato). |
| R-19-h | Deroga: **un solo avviso con l'elenco dei check falliti + conferma**, **senza motivazione e senza badge**. Possono derogare SOLO gli admin; piloti che si prenotano da soli e istruttori **no**. |
| R-19-i | Currency: vale per **piloti e allievi**; si è current con **almeno X voli negli ultimi Y giorni, X e Y configurabili dall'admin in Impostazioni** (revisione PO in approvazione); chi non è current deve volare con un istruttore prima di tornare a volare da solo. |
| R-19-j | Visite mediche senza ambito: **basta una visita valida di qualsiasi classe**, per chiunque sia a bordo (pilota, allievo, istruttore). |
| R-19-k | Quota associativa: **12 mesi dal pagamento, per tutti** (piloti, allievi, istruttori); deve comparire nella pagina Scadenze e nei suoi filtri (oggi non c'è). Licenza: tipo di scadenza eliminato. |
| R-19-l | Prenotazioni: **gli utenti (piloti/allievi) non prenotano voli con istruttore o in doppio comando** (non conoscono la disponibilità degli istruttori) → ogni auto-prenotazione è un volo solista; le prenotazioni con istruttore le creano admin e istruttori. |
| R-19-m | Salva unico: **tutti i dati** passano dal Salva unico, nelle Impostazioni anche le liste (ratings, visite mediche, categorie di cassa); restano bottoni a parte solo le azioni con effetti propri (Archivia, Fuori servizio/Rientro, Invia/Reinvia invito, Email di prova). |
| R-19-n | Estratto conto: **filtro per periodo + saldo progressivo** in questa CR. |
| R-19-o | 16.3 PO-1: la stessa persona come istruttore su un velivolo e pilota su un altro nello stesso orario **si blocca**, nella story dei check prenotazioni (19.10), riusando i codici esistenti. |
| R-19-p | Modalità di revisione Batch; la CR si esegue dopo la chiusura della 16.3; mandato di sessione per il reset del DB e2e. |

### 4.1 Nuovo Epic 19 — «Semplificazione e regole operative (CR PO 2026-11-01)»

Obiettivo: un'app più snella (via PPR, transiti, contaore e campi inutili), con regole operative esplicite
(tariffe per profilo, currency, quota, visite mediche) e un solo modello di avviso con deroga admin, form a Salva
unico e un italiano coerente.

### 4.2 Story

Tutte le story hanno UI → **dev Opus 5 xhigh** (un solo subagent per story), **review Opus 5 xhigh adversarial**.
Ogni story aggiorna i seed (`seed.ts`, `seed-demo.ts`, `seed-load.ts`), l'OpenAPI e gli e2e che tocca, nello stesso commit.

| Story | Titolo | Punti PO | Contenuto essenziale |
|---|---|---|---|
| **19.1** | Rimozione del dominio PPR | 1, 2, 12 (tassa/istruzioni PPR) | Elimina «Richieste PPR», «Voli in transito», form pubblico `/ppr` (→ 404), API, service, email, permesso, modelli/enum/FK, AppSetting `ppr.*`, movimenti di cassa PPR e categoria «PPR» (R-19-a), KPI/avvisi Panoramica, serie Statistiche, export, CSS dedicato (chirurgico: blocco condiviso con Scadenze), voci del route-registry e tab bar mobile, `RateLimitError`/429 e icona `doc` rimasti orfani, docs (`CLAUDE.md`, `README.md`). AC: nessun riferimento residuo (`grep -ri ppr` limitato a storico/migrazioni), suite verde. |
| **19.2** | Via codice fiscale, campi velivolo, contaore e note volo | 4, 5, 10 (contatori/note) | Drop `Person.fiscalCode` (+indice unico, conflitto email-o-CF diventa solo email), `Aircraft.seats/fuelType/based/notes`, `Aircraft.hourMeterMinutes`, `HourMeterAdjustment` (+API), `Flight.hourMeterStart/End/notes`. Il lock `FOR UPDATE` sull'Aircraft in registrazione/annullamento volo **resta** (serializza `FLIGHT_OVERLAP`). |
| **19.3** | Tariffe allievo/pilota ed editor velivolo a Salva unico | 6, 7 (velivolo), 14 (backend) | `AircraftRate`: `studentPriceCents` + `pilotPriceCents` al posto di wet/dry (migrazione: wet → entrambi). Prezzo scelto dal profilo (R-19-e) e congelato sul volo; profili pilota/allievo esclusivi (422 nuovo sul profilo; seed riallineati). Tariffe velivolo e istruttore: `validFrom ≥ oggi` (data di Roma) lato API, riscrittura delle righe con `validFrom ≥ oggi`. Editor velivolo: due campi prezzo con placeholder = tariffa attuale, «In vigore da», niente storico né diciture wet/dry; identità + tariffe in un solo Salva (endpoint composito atomico); Fuori servizio/Rientro/Archivia restano azioni. |
| **19.4** | Editor pilota e istruttore a Salva unico | 7 (persone), 14 (UI) | Endpoint composito atomico per la persona (anagrafica, profili attivi/disattivi, scadenze, tariffa istruttore e compenso) sul modello transazionale di `createPerson`; un solo Salva nel piede del pannello; Invia/Reinvia invito e Archivia restano azioni. Tariffa istruttore: placeholder = attuale, «In vigore da» ≥ oggi, nessuno storico. Supera R-15.10-f. |
| **19.5** | Form volo: due tipi, dropdown uniformi, bottone doppio comando/solista | 10 | `FlightType` = `TOURISM`, `SCHOOL` (migrazione `AERIAL_WORK` → `TOURISM`, statistiche/export/filtri senza il terzo valore). Velivolo, pilota, istruttore e tipo di volo con lo stesso componente (`SearchCombobox`); stessa uniformazione nei form prenotazione (§4.10 A18). Nuova primitiva AirOps `Toggle` (bottone on/off grande, accessibile: `role="switch"`, `aria-checked`) per doppio comando/solista. |
| **19.6** | Volo senza addebito e cancellazione definitiva | 9 | Flag admin «senza addebito» (FLIGHT_CHARGE a 0 €, dicitura in estratto conto, compenso istruttore dovuto — R-19-d). Annulla = elimina volo + suoi movimenti (R-19-c), modifica = aggiornamento in place con ricalcolo dell'addebito; migrazione che elimina i voli già annullati, i loro movimenti, le catene di correzione e le `PackageConsumption` residue; via stato/filtri/badge «Annullato». Emendamento AD-3. |
| **19.7** | Scadenze: licenza, visite mediche, quota associativa, currency | 8, 12 (ambito mediche) | Elimina il tipo «Licenza» e le sue righe (e la categoria Scadenze). Visite mediche senza ambito con regola «almeno una valida di qualsiasi classe» (R-19-j). Quota associativa come elemento a sé, 12 mesi dal pagamento, per tutti, visibile in Scadenze con il suo filtro (R-19-k). Currency: stato **derivato** (almeno X voli registrati a bordo negli ultimi Y giorni), X e Y in AppSetting (predefiniti X=1, Y=90), visibile in Scadenze (con filtro) e sulle righe pilota/allievo. |
| **19.8** | Impostazioni a Salva unico | 7, 12 | Una sola pagina con un solo Salva in fondo: Club, Pianificazione, Email, Tesoreria, **Quota associativa** (importo), **Currency** (X voli negli ultimi Y giorni), liste Ratings / Visite mediche (senza «ambito») / Categorie di cassa con modifiche in bozza fino al Salva (R-19-m); endpoint composito atomico; «Email di prova» resta azione. |
| **19.9** | Avviso con deroga admin — registrazione voli | 11 | Servizio unico di valutazione dei check: scadenze bloccanti (scadute e mancanti, persona e istruttore, regola mediche R-19-j), currency (solo voli solisti: senza istruttore, o Scuola con «solista»), saldo che non copre il costo (R-19-g; saltato per volo senza addebito), quota associativa. Un solo avviso con l'elenco + conferma; deroga solo admin (R-19-h); rimozione di `forceReason` e del badge «Forzato». Assorbe la 16.4 (tipo disattivato non blocca). |
| **19.10** | Avviso con deroga admin — prenotazioni | 15, 16.3 PO-1 | Stessi check su creazione, modifica e approvazione; costo stimato = prezzo per profilo × durata + istruttore × durata; auto-prenotazioni di piloti/allievi = sempre solista, nessun istruttore selezionabile (R-19-l), blocco senza deroga; prenotazioni di istruttori per i loro allievi: blocco senza deroga; admin: avviso + conferma. Blocco «stessa persona in due ruoli» (R-19-o) nei lock della 16.3. |
| **19.11** | Estratto conto a periodo con saldo progressivo | 3 | Filtro periodo (predefinito ultimi 12 mesi), riga di saldo iniziale, saldo progressivo per riga, ordinamento per data valuta, export Excel/PDF sul periodo (via il muro delle 2.000 righe sul conto intero), `from`/`to` anche sullo schema JSON/XLSX, indice `(accountId, effectiveDate, id)`. Persona e «Il mio conto». |
| **19.12** | Revisione completa dell'italiano | 13 | Glossario (§4.10 A20) ratificato, passata completa delle ~1.990 chiavi IT in contesto, plurali ICU, test di parità it/en, e2e allineati ai testi. Ultima dell'epic: tutte le copy nuove delle story precedenti sono già nel file. |

### 4.3 Story esistenti riperimetrate

```
Story: 16.4 — Tipo di scadenza disattivato
OLD: ready-for-dev
NEW: superseded → assorbita da 19.9 (voli) e 19.10 (prenotazioni)
Rationale: le funzioni findBlockingExpiredDocuments / scanBlockingDocuments vengono riscritte dal servizio unico dei check.

Story: 16.5 — Compensi istruttori snapshot
NEW: resta ready-for-dev, eseguita dopo 19.6; la correzione «eredita lo snapshot» diventa «la modifica in place conserva lo snapshot salvo cambio istruttore/durata»; volo senza addebito → compenso dovuto (R-19-d).

Story: 16.6a — Data valuta e totali
NEW: via la parte «voli annullati fuori dal PDF» (non esistono più dopo 19.6).

Story: 16.6b — Quota, rettifiche, catene
NEW: R-16-g (una quota per anno civile) SUPERATA da R-19-k (12 mesi, rinnovo cumulativo come oggi); restano Idempotency-Key stabile lato client, 422 sulla rettifica di un FLIGHT_CHARGE, classificatore del tipo radice; da rileggere dopo 19.6/19.7.

Story: 16.7 — Dati sessioni rate limit
NEW: via l'AC del rate limit PPR atomico (il dominio non esiste più).

Story: 16.8 — Archivio velivolo e tutele AOG
NEW: resta; lavora sull'editor velivolo a Salva unico di 19.3 (Archivia resta azione separata).
```

### 4.4 Pattern unico di avviso e deroga (19.9/19.10)

- Il server valuta **tutti** i check e, se qualcuno fallisce, risponde 422 con un codice unico (es.
  `REQUIREMENTS_NOT_MET`) e `details.failures[]` (tipo: `EXPIRY` | `CURRENCY` | `BALANCE` | `MEMBERSHIP`, con i dati per
  il messaggio: documento e scadenza, giorni dall'ultimo volo, saldo e costo, scadenza della quota).
- L'admin vede **un solo avviso** con l'elenco e un bottone «Procedi comunque»: rimanda la stessa richiesta con
  `force: true` (nessuna motivazione). Senza il permesso di deroga (`force` da non-admin) → 403 prima di qualunque query
  (come oggi).
- Restano **non derogabili**: sovrapposizioni (velivolo, persona, istruttore, stessa persona in due ruoli — 409),
  velivolo fuori servizio sulle prenotazioni (come oggi).
- Sul volo/prenotazione resta solo il timbro silenzioso `forcedAt`/`forcedByUserId` (già esistente, non mostrato in UI)
  — §4.10 A10.

### 4.5 Currency (19.7 + 19.9/19.10)

- Stato **derivato**, mai salvato: la persona è current se ha **almeno X voli registrati negli ultimi Y giorni** in cui
  è a bordo (come pilota/allievo o come istruttore). X e Y sono AppSetting configurabili dall'admin in Impostazioni
  (predefiniti X=1, Y=90: con X=1 equivale a «Y giorni dall'ultimo volo»). Il giorno di scadenza mostrato è quello in
  cui l'X-esimo volo più recente esce dalla finestra.
- **Volo solista** = volo senza istruttore, oppure volo Scuola con «solista» attivo. Un volo solista di chi ha la
  currency scaduta fa scattare l'avviso. Un volo con istruttore (doppio comando) è sempre ammesso e conta nei voli della finestra: chi non è current vola in
  doppio comando finché non torna ad avere X voli negli ultimi Y giorni.
- Si applica a piloti e allievi (R-19-i). Auto-prenotazioni = sempre soliste (R-19-l).
- Visibile in Scadenze (riga derivata con filtro) e sulle righe dei piloti/allievi. Nessuna email di alert in questa
  CR (§4.10 A8).

### 4.6 Quota associativa (19.7/19.8)

- Validità 12 mesi dal pagamento, rinnovo cumulativo `max(oggi, scadenza) + 12 mesi` (come oggi), dovuta da piloti,
  allievi e istruttori; mancante o scaduta = check fallito (avviso/deroga).
- Fuori dalla card Ratings: sezione propria in Impostazioni (importo) e categoria propria in Scadenze con filtro.
- L'`override` senza motivo dell'addebito quota (saldo insufficiente) si allinea al pattern unico di §4.4.

### 4.7 PRD — modifiche (`prds/prd-AirManager-2026-07-04/prd.md` + `epics.md` Requirements Inventory)

| FR | OLD | NEW |
|---|---|---|
| FR-7 | CRUD Velivoli (marche univoche, tipo, contaore iniziale) | CRUD Velivoli (marche univoche, tipo) |
| FR-9 | Contaore progressivo aggiornato dai voli, rettifiche motivate | **Eliminato** (R-19-b) |
| FR-10 | Tariffe velivolo storicizzate (validFrom, tariffa in vigore per data) | Tariffe velivolo con **prezzo allievo e prezzo pilota**, applicato in base al profilo della persona; decorrenza `validFrom ≥ oggi`; storico non mostrato |
| FR-11 | Tariffe istruttore storicizzate | Tariffe istruttore con decorrenza `validFrom ≥ oggi`; storico non mostrato |
| FR-16 | Correzione/annullamento volo con storno tracciato | Annullamento = **cancellazione** del volo e del suo addebito; modifica = aggiornamento in place con ricalcolo dell'addebito |
| FR-21 | Blocco prenotazione per medica/licenza scadute (staff può forzare, tracciato) | Voli e prenotazioni controllano **scadenze, currency, saldo, quota associativa**; l'admin riceve un avviso con l'elenco e può procedere consapevolmente; piloti e istruttori non possono derogare |
| FR-22/23/24 | PPR (form pubblico, coda, chiusura con tassa) | **Eliminati** (R-19-a) |
| FR-26 | Estratto conto (titolare i propri; staff tutti; export PDF/Excel) | + filtro per periodo, saldo iniziale e progressivo, ordinamento per data valuta, export sul periodo |
| FR-29 | Movimenti di cassa manuali + automatici (ricariche, pacchetti, PPR) | Movimenti di cassa manuali + automatici (ricariche) |
| FR-35 | Tipi di scadenza standard precaricati + custom | Tipi di scadenza (ratings con ambito; visite mediche senza ambito, ne basta una valida); licenza non è una scadenza; quota associativa a sé |
| FR-46 (nuovo) | — | Currency: current con almeno X voli negli ultimi Y giorni (X e Y configurabili dall'admin); non current = niente voli solisti, solo voli con istruttore finché non si torna current |
| FR-47 (nuovo) | — | Volo senza addebito (solo admin) |
| FR-48 (nuovo) | — | Ogni form ha un solo Salva in fondo; le azioni con effetti propri restano separate |
| FR-49 (nuovo) | — | Profili pilota e allievo mutuamente esclusivi |
| NFR-1 | UI, email e form PPR bilingui | UI ed email bilingui IT/EN |

### 4.8 Architettura — emendamenti (`ARCHITECTURE-SPINE.md`)

```
AD-3 — Ledger append-only con storno
NEW (aggiunta): Eccezione FLIGHT_CHARGE (R-19-c, CR 2026-11-01): il movimento di addebito di un volo vive e muore
col volo — si cancella quando il volo viene cancellato e si ricalcola quando il volo viene modificato. Tutti gli altri
movimenti (ricariche, rettifiche, quota, cassa) restano append-only con storno. Il saldo resta SUM(amountCents).

AD-4 — Tariffe storicizzate + snapshot sul volo
NEW: AircraftRate porta due prezzi (allievo, pilota); il prezzo applicato è quello del profilo della persona
(pilota XOR allievo) e viene congelato sul volo con la categoria applicata. Le nuove tariffe hanno validFrom ≥ oggi
(Europe/Rome); una riga con validFrom ≥ oggi si può riscrivere (i voli registrati restano congelati). Lo storico resta
nel DB ma non è mostrato in UI.

AD-6 — Consumo pacchetti: già storico dalla 12.13; le PackageConsumption residue si eliminano in 19.6.
```

### 4.9 Altri artefatti

`CLAUDE.md` (descrizione prodotto, route map senza `ppr`/`movements`/`/ppr`), `README.md`,
`docs/operations/load-testing.md`, `scripts/perf/targets*.json`, `sprint-status.yaml` (epic 19 + stati 16.x),
`docs/handoffs/HANDOFF.md`, `epics.md` (Epic 8 marcato rimosso + Epic 19).

### 4.10 Assunzioni minori (ratificate con l'approvazione di questo documento)

- **A1** `/ppr`, `/dashboard/ppr`, `/dashboard/movements` rispondono 404 (precedente `ppr/register`), nessun redirect.
- **A2** Panoramica: via il KPI «PPR in attesa» (la riga passa a 4 KPI) e gli avvisi PPR mobile; la tab bar mobile
  ridistribuisce lo slot liberato col riempimento predefinito.
- **A3** Statistiche: «Movimenti» = solo voli; spariscono «Quota transiti», «Movimenti in transito», «Transiti».
- **A4** Si tolgono gli orfani creati dalla rimozione (`RateLimitError`/429, icona nav `doc`).
- **A5** Volo Turismo con istruttore (es. checkride) resta ammesso e conta come doppio comando per la currency.
- **A6** Migrazione tariffe: il prezzo wet attuale diventa sia prezzo allievo sia prezzo pilota; il dry si scarta.
- **A7** Profili esclusivi: nei dati di test le persone con entrambi i profili vengono riallineate nei seed (DB di test).
- **A8** Currency senza email di alert in questa CR (solo stato e avviso).
- **A9** Costo stimato della prenotazione = prezzo per profilo × durata dello slot + tariffa istruttore × durata se c'è
  l'istruttore; il volo senza addebito salta il check sul saldo.
- **A10** Deroga: sparisce `forceReason` e il badge «Forzato»; resta il timbro silenzioso `forcedAt`/`forcedByUserId`
  (non mostrato) come minimo di audit.
- **A11** Disattivare un profilo diventa un dato del Salva unico, non più un'azione separata.
- **A12** Primo istruttore: con «In vigore da» ≥ oggi, i voli datati prima della sua prima tariffa non si possono
  registrare (`NO_INSTRUCTOR_RATE`) — conseguenza accettata della regola R-19-f.
- **A13** Estratto conto: periodo predefinito ultimi 12 mesi; saldo progressivo calcolato in SQL.
- **A14** La modifica non committata di `prisma/seed-demo.ts` (date relative delle visite mediche) viene committata
  così com'è in un commit `chore` prima della 19.1, per non mescolarla al lavoro delle story.
- **A15** Unicità dropdown estesa ai form prenotazione (nuova/modifica) per coerenza col form volo.
- **A16** Le date «oggi» nuove (tariffe, currency) usano la data di Europe/Rome lato server e client.
- **A17** Endpoint compositi per il Salva unico: atomici (una transazione), non orchestrazione client di N richieste.
- **A18** Lo stesso componente dropdown (`SearchCombobox`) per velivolo, pilota, istruttore e tipo di volo.
- **A19** Il bottone doppio comando/solista compare, come oggi, solo sui voli Scuola.
- **A20** Glossario per la 19.12: «velivolo» (mai «aeromobile»/«aereo»), «rating» singolare maschile (etichetta «Ratings»
  della R5 invariata, grammatica corretta), «compenso istruttore» (mai «payout»), «fuori servizio» (mai «fermo»/«AOG»
  in UI), stati prenotazione al femminile, plurali ICU, terminologia unica per «Estratto conto».

---

## 5. Implementation Handoff

- **Scope**: **Moderate** → backlog riorganizzato dalla sessione principale (PO/DEV); nessuna escalation PM/Architect
  oltre agli emendamenti AD-3/AD-4 già descritti.
- **Esecuzione**: ciclo per story invariato (CLAUDE.md): story file (ricognizione su HEAD, AC verificabili) → UN dev
  subagent Opus 5 xhigh → review adversarial Opus 5 xhigh → fix → commit; nel `docs(N)` di chiusura aggiornare
  `HANDOFF.md` e `sprint-status.yaml`. A epic finito: `/handoff`, push e stop.
- **Primo passo dopo l'approvazione**: aggiornare `sprint-status.yaml` (epic 19 + 12 story in backlog, 16.4
  superseded, note di riperimetrazione 16.5/16.6a/16.6b/16.7), PRD/epics/architettura come §4.7-4.8, commit
  `docs(cr-2026-11-01)`; poi la chiusura della 16.3 (fix cycle già in corso) e la story 19.1.
- **Criteri di successo**: le 15 richieste del PO verificabili una per una sull'app reale (verifica interattiva su
  ogni story con UI), `npm run gates` verde e arbitro e2e completo verde su DB fresco a ogni story, nessun riferimento
  residuo al dominio PPR, ai campi eliminati e al contaore.

---

## Addendum — ratifiche emerse dai file story (2026-11-01)

| ID | Story | Decisione |
|---|---|---|
| Q-19.1-a | 19.1 | `/ppr` resta pubblico solo per rispondere «pagina non trovata» anche all'anonimo (opzione B). |
| Q-19.3-a | 19.3 | Le card (Flotta desktop, widget Panoramica, card e sheet mobile) **non mostrano più la tariffa**: si vede solo nell'editor velivolo. |
| Q-19.3-b | 19.3 | Correzione/modifica di un volo: categoria di prezzo congelata se la persona non cambia (sessione principale, principio AD-4). |
| Q-19.3-c | 19.3/19.4 | **Il profilo allievo esclude sia il pilota sia l'istruttore** (estende R-19-e e FR-49). |
| Q-19.3-d / Q-19.4-b | 19.3/19.4 | Una riga sotto i campi tariffa con la sola prossima variazione programmata. |
| Q-19.4-a | 19.4 | Il compenso istruttore resta precompilato (non ha decorrenza; vuoto = nessun compenso). |
| Q-19.6-a | 19.6 | Il volo senza addebito **richiede comunque le tariffe** (velivolo e, se c'è, istruttore): congelate sul volo come informazione, importi e addebito a 0. |
| Q-19.7-a | 19.7 | Le righe currency compaiono **mescolate ai documenti** nella pagina Scadenze, contatori inclusi (contro la raccomandazione). |
| Q-19.7-b | 19.7 | Chi non ha mai pagato la quota compare come «Mancante» (una riga per persona tenuta alla quota). |
| Q-19.7-c | 19.7 | Anche chi non ha **nessuna** visita medica registrata compare come «Mancante» (conta come scaduta). |
| Split | 19.7 | La 19.7 è divisa in **19.7a** (modello, regole, quota, currency) e **19.7b** (registro Scadenze unificato) — decisione della sessione principale per dimensione. |

