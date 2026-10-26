---
baseline_commit: accfd2f
---

# Story 15.8a: Contabilità mobile + redesign dell'`ExportMenu` — i tre riquadri come KPI tappabili, il registro entrate/uscite come lista di card filtrabile, rettifica/storno/riclassifica dal telefono, e il menu di export che smette di uscire dallo schermo

Status: **approved — ratifiche PO R-15.8a-* TUTTE chiuse (2026-08-05), pronta per il dispatch al dev**

> **Split**: questa story nasce dallo SPLIT ratificato dal PO sulla Q1 del draft 15.8. La 15.8a possiede **Contabilità** (`/dashboard/billing`) e il **redesign dell'`ExportMenu`** (R-15.2-c, il TD dell'epic, che tocca **nove** superfici). Statistiche e Impostazioni sono nella story gemella **15.8b**, che si sviluppa **DOPO** questa e ne eredita due precedenti: il **KPI tappabile → sheet** (R-15.8a-c) e il **nuovo `ExportMenu`** già consegnato. Chi implementa la 15.8a **non deve** aprire la 15.8b.

## Ratifiche PO (chiuse 2026-08-05 — decisioni riportate VERBATIM; l'appendice in fondo porta il fatto misurato, le opzioni e la motivazione di ciascuna)

| R | Q | Decisione PO (verbatim) |
|---|---|---|
| R-15.8a-a | Q1 | **SPLIT**: 15.8a = Contabilita' + redesign ExportMenu; 15.8b = Statistiche + Impostazioni. |
| R-15.8a-b | Q2 | **A**: card rimappate sui numeri VERI del dominio (niente "Fatture" — gemello R-15.3-a). |
| R-15.8a-c | Q3 | **A**: i tre riquadri diventano KPI strip tappabile → sheet col dettaglio (−450px, R4 salva). |
| R-15.8a-d | Q4 | **A**: card transazione = template + Badge solo se anomala + sheet a parita' piena (prospettiva club). |
| R-15.8a-e | Q5 | **A**: testata registro = chip strip su bookType (5 valori) + ricerca full-width + [Filtri (N) \| Esporta] + CTA (~238px); categoria (21 valori) nel pannello; chip secchiello nella strip; feedback a toast; .segmented intoccabile. |
| R-15.8a-f | Q6 | **A (variante spostamento)**: l'inline '1fr 1fr' di billing-console.tsx:642 migra in una classe propria FUORI media query che tiene 1fr 1fr sul desktop (misurato invariato) e collassa ≤640px. |
| R-15.8a-g | Q7 | **A**: rettifica, storno E riclassifica in secondStep nello sheet — la riclassifica diventa ESPLICITA (scegli → conferma), niente select a scrittura immediata su mobile. Desktop invariato. |
| R-15.8a-h | Q11 | **A**: ExportMenu ≤640px = bottom sheet (MobileSheet 15.2), voci 44px, popover desktop identico; testid nuovi SENZA riscrivere i 5 spec verdi. |
| R-15.8a-i | Q12 (parte Contabilità) | **TUTTO ORA (non la raccomandazione)**: TUTTI e sette i contrasti si chiudono in queste story — i due testi con .stat-tone-\*, gli OGGETTI GRAFICI (barre categoria 2,47, .util-bar .seg, fasce mix 2,04-2,73) e .chart-label 3,66 con fix token-level MISURATI nei due temi. Assegna ogni contrasto alla story che possiede la superficie (byCat\*/negBalance/barre → 15.8a; fasce mix/.chart-label → 15.8b). ATTENZIONE: i fix token-level toccano i temi — l'AC deve imporre la misura dei GEMELLI su tutte le superfici che usano quei token (lezione 15.3), nei DUE temi, con desktop rimisurato. |
| R-15.8a-j | Q14 | **A**: esiti a toast su mobile, `<p>` al desktop, niente doppio annuncio. |

⚠️ **Lettura obbligata di R-15.8a-i** (dichiarata qui perché il dev non la restringa): "i due testi" sono le **due superfici** di testo sotto soglia della Contabilità — `billing-by-category-row` (che porta **due** valori: in **2,73**, out **3,96**) e `negative-balance-row` (**3,96**) — cioè **tre valori** in tutto; l'oggetto grafico di competenza di questa story è la **barra "in" di "Per categoria"** (**2,47**). `.util-bar .seg`, le fasce di "Composizione movimenti" e `.chart-label` vivono su `/dashboard/reports` ⇒ **15.8b**. Se una misura del dev contraddice questa ripartizione (per esempio: la barra di "Per categoria" usa davvero `.util-bar .seg`, e quindi il fix è **condiviso** con la 15.8b), la cosa va **dichiarata e portata**, mai risolta in silenzio: in quel caso il fix va scritto **una volta sola qui**, in forma additiva, e la 15.8b lo **riusa** (v. AC 9 e la nota di tensione in fondo).

## Story

As a amministratore che tiene la cassa del club dal telefono (piazzale, ufficio senza scrivania, hangar),
I want vedere il risultato del mese, la liquidità e gli acconti a colpo d'occhio, scorrere il registro entrate/uscite come una lista di card filtrabili invece di una tabella a nove colonne larga **988px in 317 visibili**, e poter **rettificare, stornare e riclassificare** una riga senza scorrere in orizzontale fino a bottoni da 24,7px,
so that l'ultima superficie contabile dell'app diventa usabile su un telefono **senza cambiare una sola regola** della contabilità: definizione unica di ricavo (Billing-1), prospettiva club sulla riga (Billing-2), storni nel loro mese, secchiello gated sul **conteggio**.

E, come debito d'epic: **chiudere il redesign dell'`ExportMenu`** (R-15.2-c) — il menu condiviso da **nove** superfici, il cui popover su Contabilità a 375px **esce dal viewport a sinistra di 29,1px** (misurato) e le cui voci restano a 35-53,7px in tutto l'epic (15.5 F4 → 15.7 LOW-2, terza occorrenza; decisione PO: si chiude qui).

---

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)`, **tranne** le due dichiarate: la riga `display:none` fuori-query dell'albero mobile e la classe `.billing-split` di R-15.8a-f), **R2** (il template è incompleto **by design, e su questa schermata lo è più che mai**: v. §a.0 — non ha filtri, export, paginazione, azioni di riga, form, CRUD, e per la Contabilità disegna **oggetti che nel dominio non esistono**), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e azione primaria fissa in basso), **R4** (si porta TUTTO: nessuna superficie resta "tabella desktop scrollabile in orizzontale" come stato finale — ed è lo stato di oggi, misurato in §a.1), **R5** (logout/lingua già nel menu profilo, 15.1 — non si toccano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (15.1, in CLAUDE.md): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**. ⚠️ **Regola AD-5 della 15.5**: il suffisso `-mobile` è **illegale** dove esiste un selettore `^=` sul nome desktop. **Verificato per questa story** (`grep -rn 'data-testid\^=' e2e/`, 2026-08-04 — **14 occorrenze**, 9 file): i prefissi in uso sono `ac-card-`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`. **Nessuno tocca `billing-`, `transaction-`, `negative-balance-`, `export-`** ⇒ il suffisso `-mobile` è **LEGALE** qui. La verifica va **rifatta dal dev** prima di scegliere ogni nome, e riportata nel record.

**Le lezioni fresche (15.5/15.6/15.7) che questa story può violare davvero**:

1. **L'asimmetria del remount decide la semantica dei controlli** (15.7 D1/LOW-1). **Misurata qui**: `billing/page.tsx:175` monta `BillingConsole` con `key={JSON.stringify({page, ...filterQuery})}` ⇒ **rimonta a ogni navigazione** (come i Movimenti: un pannello filtri lì DEVE applicare in una sola navigazione, e le chip possono essere `Link`). Il dev **rimisuri**, non deduca.
2. **Le guardie si scrivono sul REQUISITO, mai sul valore ottenuto** (15.7 MINOR-1: soglia 19.5 su un target da 20). Qui il pavimento è **44** e la soglia dello sweep è **43.5**, sempre, su ogni superficie nuova — e va scritta anche dove il valore ottenuto è più alto.
3. **Le fixture a bucket non sono isolate fra ri-run** (15.7 TD (m)) e **MAI asserzioni "riga in pagina 1"** su liste paginate (15.7, rosso del primo arbitro). Il registro Contabilità pagina a **20** e sul DB reale ha **12 pagine**: ogni test raggiunge la propria fixture **coi filtri**, mai per posizione.
4. **Il debounce è una porta di servizio del remount** (15.6 MINOR-1). La ricerca pilota della Contabilità ha lo stesso debounce da **400 ms** (`billing-console.tsx:272-279`) e la console **rimonta**: identico al Registro voli, stessa cura (`cancel()` all'apertura del pannello, riarmo alla chiusura senza applicare).
5. **`text-overflow: ellipsis` nasconde gli sfondamenti allo sweep** (15.5 F1/§12): serve una guardia di **CONTENIMENTO sul rect** per ogni oggetto che può crescere — qui l'importo (fino a `-1.216,22 €` misurato), il `Badge` di `bookType`, il `Badge` di stato, la chip del metodo.
6. **Parità informativa enumerata contro TUTTO ciò che il desktop apre dalla riga** (15.5 F2): la riga del registro apre **due** overlay (`transaction-adjust-panel`, `transaction-reverse-panel`) e contiene **un terzo controllo che scrive** (`transaction-reclassify-method`, un `<select>` inline che fa `PATCH` immediato) — più **nove** colonne.
7. **Il criterio "testata ≤ pre-fix mantenendo i 44px" va verificato con l'ARITMETICA prima di prometterlo** (15.6 R-15.6-e, 15.5 F3 con un caso IRRAGGIUNGIBILE accettato dal PO con la prova). Fatto qui: v. R-15.8a-e e l'appendice Q5 (**~238** contro **265,66**, contro i **~416** del riordino alla lettera).
8. **La prima card può SCENDERE se i KPI crescono** (15.7 osservazione 1: 567 → 609 con la 2×2). Qui il punto di partenza è **1041,6px** e i tre riquadri ne occupano **553,3** da soli: R-15.8a-c esiste per questo, e il guadagno stimato (**−450px**) va **misurato**, non promesso.

**Fonte visiva**: template `AirOps Mobile.dc.html` (+ `data.js`) — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/AirOps-Mobile.dc.html`. Lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de` (i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezione in scope: **righe 299-335 — `Admin · Contabilità`**.

---

## Ricognizione (2026-08-04, teammate story — verificata su file, righe e **misure a runtime** su build di produzione `npm run start`, DB reale post-suite: **~230 transazioni (12 pagine da 20), 21 categorie di cassa (20 attive), 61 saldi negativi, 35 istruttori con compenso, secchiello VUOTO**. Il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 15.1-15.7)

### a.0) Che cosa dice il template per la Contabilità — e quanto poco è (R2 al massimo grado)

| schermata | righe | cosa disegna | cosa NON disegna |
|---|---|---|---|
| **Admin · Contabilità** | 299-335 | testata (23px/600 + sub 12px `--ink-3`); **2 KPI in griglia 2×1** (`Da incassare` / `In ritardo`, valore 22px/600, il secondo in `--bad-ink`); card **"Fatture"** (righe `1fr auto auto`: nome 13px/600 ellissato + `id · età` mono 10.5, importo mono 12px/600, pill di stato); card **"Movimenti recenti"** (righe `1fr auto`: `desc` 12.5px/500 ellissato + sub mono 10.5, importo mono colorato). Meccanica (script 671): sub = `pilota · MM-DD · metodo`, colore = negativo `--ok-ink`, `overdue` `--bad-ink`, altrimenti `--ink`; **`slice(0,8)`** | ⚠️ **le "Fatture" non esistono nel dominio AirManager** (nessuna entità, nessuna API, nessuna pagina) — è il gemello di "In volo ora" della 15.3, chiuso da R-15.8a-b. E poi: **nessun filtro, nessun export, nessuna paginazione, nessuna riga tappabile, nessuna azione, nessun form, nessuna rettifica/storno/riclassifica, nessun riquadro Risultato/Liquidità/Acconti** |

**Conclusione onesta**: sulla Contabilità il template copre **una lista di sola lettura e due KPI**, cioè meno del 10% di quello che la pagina reale fa. Tutto il resto è R2, e va progettato nello stesso linguaggio riusando le primitive 15.2-15.7 (card+sheet, chip strip, pannello Filtri, KPI strip, `.registry-pagination`, toast).

### a.1 — Contabilità: tabella **988px** in 317 visibili, testata **265,66px**, prima riga a **1041,6px** (128% del viewport)

`src/app/[locale]/dashboard/billing/` — 4 file:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 321 | server: gate `finance.manage` (69-72, **ADMIN-only**, nessuna faccia self), **`OPTIONS_PAGE_SIZE = 100` (24)**, `TX_PAGE_SIZE = 20` (27), `sanitizeDateParam` (32-34), `BOOK_TYPES` (30), letture **sequenziali** (85-93: `listPeople` 1×100 → `personOptions`, `listCashCategories`, `getBillingSummary`, `getCompensationSummary`, `listNegativeBalances`), clamp pagina fuori range (96-102), `exportHref` + `cashReportPdfHref` (116-118), `periodLabel`/`monthLabel` (120-128), **`<BillingConsole key={JSON.stringify({page, ...filterQuery})}/>` (175)** |
| `billing-panels.tsx` | 143 | **server component**: i **tre riquadri** (`billing-panel-result` / `-treasury` / `-deposits`) dentro `.billing-panels`; `StatRow`/`TotalRow` con `.stat-tone-ok`/`-bad`; il link secchiello `billing-panel-unattributed-link` **gated sul COUNT** (104, review Billing-2 F1) e il link `billing-panel-deposits-link` gated su `inRedCount` |
| `billing-console.tsx` | 837 | client: `.card` + `.card-head` (420-522: **8 gruppi di controllo** + 3 `<p role="status">`), `.students`/`.student-row` a **9 colonne** (`COLS`, riga 170), paginazione (615-639), il `.split` **inline a due colonne** (642), la card `billing-negative-balances-card` (710-733), `TransactionEditor` (735-743) e **due `.mini-modal`** (745-834: rettifica e storno) |
| `transaction-editor.tsx` | 360 | il pannello "Nuova transazione" (`SlideOver`), 3 rami (`Pagamento` / `Addebito conto` / `Movimento cassa`) |

**Misure a 375×812** (admin, IT, nessun filtro; `.page` 375, card 319, contenuto 317):

| superficie | valore | nota |
|---|---|---|
| `.students` | `cw` **317** / `sw` **988** ⇒ **671px nascosti** | 9 colonne — il **peggiore delle liste a colonne dell'epic** dopo il Registro voli |
| `.card-head` del registro | **265,66** @375 **e** @390, **350,89** @320, **308,5** con un filtro attivo @375, **393,73** @320 col chip secchiello; **identica in EN** | contro **109,23** @1280, **152,23** @800, **180,53** @641 (⚠️ **IT@641 = 180,53 ma EN@641 = 152,23**: l'italiano manda a capo una riga in più — la baseline desktop è **sensibile al locale**, come la 15.7 C2 lo era ai dati) |
| **prima `transaction-row`** | `top` **1041,6** su 812 ⇒ **128% dello schermo**, cioè **completamente sotto il fold** (a 320: **1126,8** su 568 ⇒ **198%**) | il pre-fix peggiore dell'epic (Scadenze 70%, Movimenti 63%, Registro voli 68%) |
| `.billing-panels` (i 3 riquadri) | 1 colonna già ≤1200px, **553,3px** di altezza totale a 375 (163+190+176 + gap) | è la **metà** del ritardo della prima riga ⇒ R-15.8a-c |
| `.split` (Per categoria + Compensi istruttori) | ⚠️ **`151,5px + 151,5px` a 375px** e **`124px + 124px` a 320px** — due card affiancate larghe 150px, con scroll interno (`cw 150 / sw 298` e `cw 150 / sw 212`) | **difetto misurato**: `airops.css:1447` porta `.split{grid-template-columns:1fr}` a ≤1200px, ma `billing-console.tsx:642` scrive `style={{gridTemplateColumns:'1fr 1fr'}}` **inline**, e l'inline batte la media query. È l'**unico** `.split` dell'app che non collassa ⇒ R-15.8a-f |
| `.student-row` (riga dati) | 317×**63** | |
| `.page-head` | **51,44** a ogni larghezza (nessuna azione) | |
| paginazione | `1 / 12` — `billing-page-prev`/`next` **38,3×34,8** | sotto i 44px |
| controlli della testata (11 nodi) | periodo `filter-date-range` **271,9×37,4** (due `DateInput` da 128 + due `.date-input-btn` da **24×24**), `billing-filter-booktype` **120×35** (5 opzioni), `billing-filter-category` **250×35** (**21 opzioni** = "Tutte" + 20 categorie attive), `.search` **190×34,1** con l'`<input>` a **18,1px**, Esporta **103,9×34,8**, "Nuova transazione" **151,5×34,8** | ⚠️ i **18px** del campo pilota sono la **terza occorrenza** del difetto 15.5 correzione 8 / 15.6 / 15.7. **Nessun controllo raggiunge i 44px** |
| overflow orizzontale **di pagina** | **0** a 320/375/390/641/800/1280 | la tabella scrolla per conto suo ⇒ **una guardia sull'overflow di PAGINA sarebbe cieca** |
| controlli sotto la tab bar (dopo scroll a fondo) | **3 link** della card "Saldi negativi" hit-testati su `NAV.mobile-tabbar` / `SPAN.mobile-tab-label` / `svg` (barTop **745,08** in 812) | ⚠️ **misura ambigua e da rifare dal dev**: quella card ha `maxHeight: 220, overflowY: auto` (`billing-console.tsx:720`), quindi parte dei link è fuori dal proprio scroller. Va discriminato "coperto dalla tab bar" da "clippato dentro il proprio contenitore" — **non ignorato** |
| altezza documento | **3.897px** @375 (3.244 @1280) | |

⚠️ **Difetti PRE-esistenti misurati (contrasto, canvas→WCAG, tema chiaro, sfondo effettivo risalendo gli antenati)** — chiusi da **R-15.8a-i**, non più ereditabili né rimandabili:
- `[data-testid="billing-by-category-row"]` — il valore **in** (`var(--ok)`) misura **2,73:1** e il valore **out** (`var(--bad)`) **3,96:1**: entrambi **sotto il 4,5 del testo**;
- `[data-testid="negative-balance-row"] .mono.num` (`var(--bad)`) **3,96:1**;
- la **barra "in"** di "Per categoria" (oggetto grafico, `billing-console.tsx:671`): **2,47** ⇒ **sotto il 3:1** (la barra "out" misura **3,59**, sopra soglia).
- ⚠️ La medicina per i **testi** esiste **già in casa e non è applicata qui**: `.stat-tone-ok`/`.stat-tone-bad` (`airops.css:733-738`) sono nate esattamente per questo (i riquadri le usano: `billing-panel-net` **9,82**, `billing-panel-available` **10,63**), e le colonne Entrate/Uscite della tabella le usano già (**10,63** / **9,82**). Le superfici sopra usano il token grezzo inline.
- In **tema scuro** gli stessi oggetti stanno sopra soglia (byCatIn **9,3**, byCatOut **6,61**, negBalance **6,61**, barre 10,45/7,42): il difetto è **solo chiaro** ⇒ ogni fix va misurato **nei due temi**, perché il rischio è di rompere lo scuro per riparare il chiaro.

**Comportamenti di dominio della Contabilità che il mobile deve preservare IDENTICI** (con le righe):

| # | comportamento | dove | cosa deve restare vero su mobile |
|---|---|---|---|
| 1 | **Definizione UNICA di ricavo** (Billing-1): i tre riquadri arrivano da **una** `getBillingSummary`, mai ri-derivati dalla pagina filtrata | `billing/page.tsx:91`, `billing-summary.service.ts:158-175` (`getLedgerRevenueCents`, `:164`) | il mobile mostra **gli stessi numeri**, dallo stesso oggetto; **nessun ricalcolo client** |
| 2 | **Prospettiva CLUB su ogni riga** (ratifica PO 2026-07-27, review Billing-2 F7) | `lib/schemas/transactions.ts#ledgerClubAmountCents` (:105) — **una** regola condivisa fra tabella ed export xlsx | la card mobile chiama **la stessa funzione**, mai `row.amountCents` |
| 3 | **Storni nel loro mese** (il costo del mese conta lo storno di un'uscita, non lo storno di un'entrata) | `billing-summary.service.ts:76-81` | invariato: è server-side, il mobile non lo tocca |
| 4 | **Secchiello gated sul COUNT, non sulla somma** (review Billing-2 F1: due righe di segno opposto sommano 0 ma il secchiello è pieno) | `billing-panels.tsx:104` (`treasury.unattributedCount > 0`) | il link resta gated **sul conteggio** ovunque viva su mobile (⇒ anche dentro lo sheet di R-15.8a-c e nella chip strip di R-15.8a-e) |
| 5 | **Riclassifica di una riga CASH senza metodo** (`PATCH /cash-movements/{id}`) | `billing-console.tsx:396-413`, reso a `:563-579` | **stessa chiamata**, stesso esito, `router.refresh()`; su mobile diventa **esplicita** (R-15.8a-g), sul desktop resta il `<select>` a scrittura immediata |
| 6 | **Rettifica** solo su riga `ACCOUNT` `actionable`, **Storno** solo su riga `CASH` `actionable`; importo ≠ 0 e motivo obbligatorio; 409 distinto dal generico | `billing-console.tsx:598-607`, `313-350`, `367-393` | stesso gate, stessa validazione client, stessa mappatura 409/altro |
| 7 | **Le due azioni usano gli endpoint STORICI**, non `POST /transactions` | doc-comment `:36-40` (`account/adjustments` con `originalMovementId`; `cash-movements/{id}/reverse`) | invariato |
| 8 | **`.mini-modal` z 60** per rettifica/storno; `SlideOver` z 50 per "Nuova transazione" | `airops.css` mappa z-index | su mobile le due azioni vivono nello sheet (R-15.8a-g) e le `.mini-modal` restano **desktop-only**; la mutua esclusione va mantenuta (AD-9) |
| 9 | **`?unattributed=true` si dichiara con un chip dismissibile** (review Billing-2 F11) | `billing-console.tsx:499-512` | il chip non può sparire su mobile: è l'unico nome del filtro ⇒ R-15.8a-e lo mette **dentro la chip strip** |
| 10 | **Il registro pagina a 20 e il contratto URL è `?page&dateFrom&dateTo&bookType&categoryId&personQuery&unattributed`** | `page.tsx:74-79`, `billing-console.tsx:249-258` | invariato, sanificazione server-side compresa |

### a.2 — L'`ExportMenu`: il TD dell'epic, misurato (e peggiore di come era stato descritto)

`src/components/ui/export-menu.tsx` (69 righe) — **nessun `data-testid`**: il trigger si raggiunge solo con `getByRole('button', {name:'Esporta'})` e le voci con `getByRole('link', {name})`.

**Nove consumer**: `expiries/scadenze-console.tsx:424`, `bookings/bookings-table.tsx:560`, `ppr/ppr-console.tsx:290`, `billing/billing-console.tsx:518`, `people/[id]/account-section.tsx:222`, `fleet/fleet-console.tsx:194`, `instructors/instructors-console.tsx:128`, `logbook/logbook-console.tsx:724`, `movements/movements-table.tsx:344`. Tre di questi (fleet, instructors, pilots) passano `pdfLabel=""` **senza** `pdfHref` ⇒ rendono **una sola** voce.

**Misura a 375×812 su `/dashboard/billing`, menu APERTO**:

```json
{ "box": { "x": -29.1, "y": 429.3, "w": 180, "h": 141.4 }, "z": "20", "inside": false,
  "links": [ { "text": "PDFReport cassa (PDF)", "h": 53.7, "w": 150, "hit": "A.btn" },
             { "text": "XLSTransazioni (Excel)", "h": 53.7, "w": 150, "hit": "A.btn" } ] }
```

⇒ **il popover esce dal viewport a sinistra di 29,1px** (`.popover{position:absolute; right:0}` + un trigger che a 375px comincia a `x=47`), e le voci sono alte **53,7px** perché le etichette italiane vanno a capo — mentre sulle testate 15.7 le stesse voci misuravano **35px**. Cioè il TD ha **due facce**, non una: il target *e* il contenimento. Le voci restano hit-testabili (`hit: A.btn`), quindi l'export **funziona**: è ergonomia, non rottura.

⚠️ **Il vincolo che governa il redesign**: **cinque asserzioni page-level** leggono quel menu — `cash-report.spec.ts:76-77` (`'Esporta'` + `'Report cassa (PDF)'`, su billing), `exports.spec.ts:272-275` (`'Esporta'` + `'Voli (Excel)'`, su logbook), `pdf-exports.spec.ts:355-356` (`'Esporta'` + `'Voli (PDF)'`), `pdf-exports.spec.ts:225`, `movements.spec.ts:225`. Un **gemello mobile** del menu darebbe due nodi per lo stesso nome accessibile **a 1280px** e romperebbe tutte e cinque ⇒ il redesign deve stare **dentro l'unico componente**, mai in un secondo albero (AD-4). R-15.8a-h aggiunge: **testid nuovi SENZA riscrivere i 5 spec verdi**.

### a.3 — Le primitive 15.2-15.7 da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`** (86 righe): `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`; nome accessibile = `` `${sub} — ${title}` `` (riga 61); `onClose` **deve** essere referenzialmente stabile; uno sheet alla volta (fix 15.3 F4); `.bottom-sheet-sub` a `--ink-3` (4,85/5,72).
- **`src/components/ui/mobile-sheet.tsx`**: scrim `<testId>-scrim`, `Escape` da aperto, focus al pannello e ritorno al trigger, `role="dialog"`, z **40**. ⇒ è la primitiva che R-15.8a-h fa usare all'`ExportMenu`.
- **`src/lib/mobile-sub-line.ts#joinSegments`** (story 15.7): **il** compositore di sub-line/`sub` di sheet — omette i segmenti assenti invece di riempirli col segnaposto (lezione 15.5 F1). **Si riusa, non si riscrive.** Consumer attuali: `mobile-logbook.ts`, `mobile-expiries.ts`, `mobile-movements.ts`.
- **CSS già pronto, dentro `@media (max-width:640px)`**: `.mobile-card-head/-title/-count/-empty/-foot` (2099-2104), `.mobile-row` + figli (2111-2160, **UN solo `<button>` con figli `<span>`**), `.mobile-row-tail` (2143), `.mobile-row-name/-sub` ellissati (2151/2157), `.mobile-row-side/-amount/-note` (2592-2594), `.mobile-row-flag` (2607-2622) col pallino dipinto (2758), `.mobile-row-edge-*` (2291-2294), `.mobile-chip-strip > .btn` (2261-2269, pill 999px, mono 11px, ≥44px, scroll senza scrollbar), `a.mobile-row` (2327), `.registry-head`/`.registry-pagination` (2428-2491), `.logbook-head`/`.logbook-filter-panel` (2708-2766), `.scadenze-head`/`.movements-head`/`.membership-fee-modal` (2768-3018), `.kpi-row.kpi-row-grid` (2078-2093, la variante **2×2**).
- **Il pannello "Filtri" della 15.6/15.7 è il modello esatto** per R-15.8a-e: `logbook-console.tsx:270` (`filterDraft` locale), `:684` (semina + `cancel()` del debounce), `:718` (trigger col conteggio), `:1039-1130` (`SlideOver` reso condizionalmente), `:538-560` (applica in **UNA** navigazione).
- **Precedenti di "corpo desktop / albero mobile"**: `.scadenze-desktop-body` + `.scadenze-mobile` (`scadenze-console.tsx:450/501`), `.logbook-desktop-body` (`logbook-console.tsx:733/737`). Le classi di **testata** proprie: `.registry-head` (3 consumer), `.logbook-head`, `.scadenze-head`, `.movements-head`.
- **`secondStep` con effetto contabile**: il precedente vivo è `movements-table.tsx` (15.7, chiusura transito con tassa), verificato dal vivo dalla review su race/replay/409.

### a.4 — `airops.css`: dove va la roba nuova, cosa non toccare

- File di **3.018 righe**. Sezioni mobile: shell 15.1 **1666-1801**, primitive 15.2 **1802-2018**, panoramica 15.3 **2019-2216**, pianificazione 15.4 **2217-2350**, anagrafiche 15.5 **2351-2658**, registro voli 15.6 **2659-2767**, scadenze+transiti 15.7 **2768-3018**. Le regole nuove vanno **in coda**, in un blocco proprio `/* ---------- contabilità mobile + export menu (story 15.8a) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** (i) la riga `display:none` fuori-query per l'albero mobile (precedenti: `.ppr-queue-mobile` 1822, `.logbook-mobile` 2684, …) e (ii) la classe `.billing-split` di R-15.8a-f, che per costruzione vive **fuori** dalla media query (v. AC 6).
- **Mappa z-index in uso**: `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · **`.popover-scrim` 19 / `.popover` 20** · popover/typeahead 30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (≤640px sollevato).
- ⚠️ **Classi da NON usare come aggancio dello switch**: `.card`, `.card-head`, `.students`/`.student-row` (13 console), `.kpi-row`, `.mini-modal`, `.form-grid`, `.util-row`/`.util-bar`/`.util-value` (**4 consumer, tutti su `/dashboard/reports`** ⇒ superficie della **15.8b**), **`.split`** (`reports-console` ne ha 4, `billing-console` 1, e altre pagine), e soprattutto **`.segmented`**, che ha **6 consumer** (`scadenze-console.tsx:217`, `bookings/schedule.tsx:503/530/568`, `reports/page.tsx:110`, `charts/rank-bars.tsx:60`, `dashboard/scadenze-widget.tsx:83`, più `ui/segmented.tsx:32`): **due dei sei sono sulla pagina della 15.8b**, quindi una regola su `.segmented` che qui sembrasse innocua toccherebbe Pianificazione, Panoramica, Scadenze **e la story gemella**. Lo switch va su **classi di pagina proprie**, ancorate con `>` (lezione 15.3 F1, riconfermata 15.5 F5 e 15.7).
- **`.date-input`** è condivisa (contabilità, movimenti, registro voli, tesoreria, scheda persona): ogni regola nuova va ancorata alla testata che la ospita.
- `.page` = `padding: 22px 28px 60px` — asserita da `mobile-primitives.spec.ts:188`.

### b) e2e e unit — il campo minato preciso

**La catena serializzata** (`playwright.config.ts:47-125`), in ordine: `chromium` → **`settings`** → **`booking-window`** → **`treasury-settings`** → **`billing-global`** → `mobile-metar` → `mobile-overview-overflow` → `mobile-membership-fee`. Di questi, **`billing-global` (5°) vive sulla superficie di questa story**; `settings`/`booking-window`/`treasury-settings` sono della **15.8b** e questa story **non li tocca** (nessuna sua modifica deve arrivare a `/dashboard/settings`).

| file | project | test | cosa fa / cosa asserisce | rischio per questa story |
|---|---|---|---|---|
| `e2e/billing.spec.ts` | chromium | 13 | il file di dominio del registro: `transaction-row`, `billing-filter-*`, `billing-new-transaction-button`, `transaction-adjust-*`, `transaction-reverse-*`, i tre riquadri, la paginazione | ⚠️ **il più esposto**. Nessuna asserzione page-level su testo libero (verificato: solo login), ma **ogni testid duplicato lo rompe** |
| `e2e/billing-global.spec.ts` | **billing-global** (5° della catena) | 2 | i due casi che **non tollerano un writer concorrente**: l'invariante dei tre riquadri letto **prima/dopo** su aggregati ALL-TIME, e la riclassifica del **singolo** fixture non attribuito del seed (`prisma/seed.ts`) | ⚠️ se il mobile cambia il modo in cui il secchiello si raggiunge, questo spec è il primo a saperlo. E **la sua fixture è a consumo unico**: sul DB post-suite il secchiello è **vuoto** (misurato: `?unattributed=true` non ha righe) ⇒ un test mobile sul secchiello deve **crearsi la propria** riga non attribuita |
| `e2e/cash-report.spec.ts` | chromium | 4 | il report cassa; a **76-77** apre l'`ExportMenu` di billing **page-level** e legge il link `'Report cassa (PDF)'` | ⚠️ **blast radius n.1 dell'`ExportMenu`** |
| `e2e/exports.spec.ts` | chromium | 8 | a **272-275** apre l'`ExportMenu` del logbook page-level e clicca `'Voli (Excel)'` | idem (superficie **non** di questa story, ma **stesso componente**) |
| `e2e/pdf-exports.spec.ts` | chromium | 9 | a **355-356** `'Esporta'` + `'Voli (PDF)'` page-level; a **225** un altro `'Esporta'` | idem |
| `e2e/movements.spec.ts` | chromium | — | a **225** un `'Esporta'` page-level | idem |
| `e2e/cash-register.spec.ts` | chromium | 5 | il registro cassa e la creazione di movimenti; a **165-166/191** legge le `option` di `transaction-category` **e** di `billing-filter-category` con `option:has-text(...)` | ⚠️ i due `<select>` devono restare **un nodo ciascuno**, con le stesse option — anche se `billing-filter-category` finisce **dentro il pannello Filtri** su mobile (a 1280 resta dov'è) |
| `e2e/account-adjustments.spec.ts` | chromium | 4 | rettifiche dalla scheda persona **e** dalla Contabilità (a **120** naviga con `getByRole('navigation',{name:'Aree operative'})` — scoped, sicuro); usa `transaction-adjust-*` e `adjustment-badge` | ⚠️ la rettifica dal registro deve continuare a funzionare **identica** |
| `e2e/rbac.spec.ts` | chromium | 3 | i redirect dei non-admin | conferma: `/dashboard/billing` è ADMIN-only |
| `e2e/mobile-*.spec.ts` | vari | — | nessuno copre la Contabilità | la copertura di geometria/fondo pagina va **scritta qui** |

**Tutta la suite gira a viewport desktop** (1280×720, `playwright.config.ts:13-19`) tranne gli spec mobile dedicati: un albero mobile `display:none` non la tocca — **ma un testid, un TESTO o un nome accessibile duplicato la rompe a qualsiasi viewport**.

**Stato globale**: questa story **non deve scrivere `AppSettings`**. Uno spec che tocchi la Contabilità in lettura+scrittura di transazioni può restare in `chromium`, **ma non se asserisce aggregati globali con uguaglianza** (review Billing-2 F4; e il TD già registrato di `billing.spec.ts:296`, flaky nell'arbitro 15.7).

**Unit**: nessun test copre oggi `billing/page.tsx`, `billing-console.tsx`, `billing-panels.tsx`, `transaction-editor.tsx`, `export-menu.tsx`. Esistono e restano le guardie pure di `lib/schemas/transactions.ts` (`ledgerClubAmountCents`) e i test di `exports.service`. I test nuovi sono quelli di AD-6 (funzioni pure in `src/lib/`, che per costruzione non importano servizi e quindi non trascinano `@/lib/env` — verifica comunque `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`). Precedenti diretti: `src/lib/mobile-{logbook,registries,agenda,expiries,movements,sub-line}.ts`.

### c) Correzioni al brief (verificate sul codice)

1. **"card tesoreria" della Contabilità**: non esiste una card "tesoreria" *sulla Contabilità* — c'è il **riquadro Liquidità** (`billing-panel-treasury`, `billing-panels.tsx:94`), di sola lettura. La **card Tesoreria** (saldi di apertura, che scrive) è su **Impostazioni** ⇒ **15.8b**.
2. **"colonna Tipo filtrabile"**: la colonna Tipo mostra il `bookType` (ricavo/costo/acconto/giroconto) ed è filtrata da `billing-filter-booktype`; esiste **un secondo** filtro indipendente, `billing-filter-category` (21 categorie di cassa). Il vecchio `movementType` non ha più alcun controllo UI (doc-comment `billing-console.tsx:20-27`).
3. **"secchiello PATCH cash-movements"**: sono **due cose distinte** — il *secchiello* è il link `?unattributed=true` gated sul count (riquadro Liquidità), la *riclassifica* è il `<select>` inline nella colonna Metodo che fa `PATCH /cash-movements/{id}` **immediato, senza conferma** (`billing-console.tsx:396-413`). Il secchiello **è vuoto sul DB post-suite** (fixture a consumo unico di `billing-global.spec.ts`).
4. **La Statistiche non ha export** (nessun `ExportMenu`, nessun href): il redesign dell'export riguarda **Contabilità** più gli altri **otto** consumer — e **nessuna** delle superfici della 15.8b.
5. **`OPTIONS_PAGE_SIZE = 100` di `billing/page.tsx:24`** alimenta `personOptions`, che va **solo** al `TransactionEditor` (il picker persona dei rami "Pagamento"/"Addebito conto"), **non** al filtro pilota della testata — che è un `personQuery` a testo libero. È la **quarta faccia** del TD dei picker, e come quella della 15.7 **degrada la comodità, non la funzione** (il picker è un `SearchCombobox` col typeahead server-side).
6. **La pagina è ADMIN-only** (misurato: pilota → redirect a `/it/dashboard`) e **non** ha `mobileSlot` (`route-registry.ts:124-129`) ⇒ per l'admin vive nello sheet "Altro", a **due** tap.

### d) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (verificato: `BillingPage` **131/131**, parità piena, zero chiavi orfane); segnaposto riempiti lato client → **`t.raw`**; suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground (⚠️ TD (n) della 15.7: `scripts/e2e.sh start` **perde il quoting** degli argomenti — `-g "AC 9"` diventa `bash: AC: comando non trovato`); build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** negli e2e per chiudere un popover dentro uno `SlideOver` (chiude tutto il pannello, review 14.3 F1) — e qui i `DateInput` del filtro periodo sono esattamente quel caso; MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe; prima di attribuire un fallimento al lock TD-6, contare i `LoginAttempt` **falliti**.

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — L'albero mobile vive DENTRO il componente che possiede lo stato.** Per la Contabilità è `billing-console.tsx` (possiede `filters`, `personQueryInput` col debounce, `editorOpen`, `adjustingRow`, `reversingRow`, `reclassifyingId` e i tre feedback). Un componente di pagina parallelo o duplica quello stato o duplica la rete. I tre riquadri sono invece in un **server component** (`billing-panels.tsx`): la KPI strip tappabile di R-15.8a-c ha bisogno di stato (lo sheet aperto) ⇒ il dev dichiari **dove** lo mette (isola client dentro `billing-panels.tsx`, oppure i dati passati a `BillingConsole`), con la nota che i **numeri restano quelli di `getBillingSummary`** (comportamento 1) e che `billing-panels.tsx` **non deve** diventare un client component intero senza una misura che lo motivi.

**AD-2 — Si sostituisce il CORPO, non la card.** A ≤640px va a `display:none` **solo** la tabella desktop, tramite una **classe di pagina propria** (es. `.billing-desktop-body`), mai `.students`/`.student-row`, mai `.card-head`, mai `.split`, mai `.segmented`. La testata resta **un solo nodo** con i suoi testid e la sua logica: la sua RESA mobile è R-15.8a-e, ma i testid desktop non si duplicano — **salvo l'eccezione che il pannello Filtri introduce, che va dichiarata e misurata** (AD-5).

**AD-3 — `BillingConsole` RIMONTA a ogni navigazione** (`billing/page.tsx:175`, `key={JSON.stringify({page, ...filterQuery})}`) ⇒ (i) il pannello Filtri **deve** raccogliere i valori in stato locale e navigare **una volta sola** su "Applica"; (ii) le chip di `bookType` possono essere `Link` (semantica `aria-current`, come i Movimenti); (iii) il debounce da 400 ms della ricerca pilota (`billing-console.tsx:272`) va **annullato** all'apertura del pannello e **riarmato** alla chiusura senza applicare (fix 15.6 MINOR-1); (iv) qualunque stato locale nuovo (sheet aperto, pannello aperto) **muore** a ogni cambio di filtro o pagina — se ciò produce un effetto visibile (uno sheet che si chiude da solo dopo un'azione che naviga), va **dichiarato**, non subìto. **Va rimisurato**, non dedotto dal record.

**AD-4 — L'`ExportMenu` si ridisegna DENTRO l'unico componente: mai un gemello mobile.** Motivo dirimente e verificabile: cinque asserzioni page-level (§a.2) leggono **un** bottone "Esporta" e **un** link per voce; un secondo albero ne creerebbe due **a 1280px**. Nella forma ratificata (R-15.8a-h: bottom sheet ≤640px), il contenuto **è lo stesso markup** — gli stessi `<a>` — reso dentro `MobileSheet` invece che nel popover: **la stessa istanza React** che cambia contenitore. Il conteggio dei nodi va **asserito** a 375 **e** a 1280 su **tutti e nove** i consumer.

**AD-5 — I controlli che entrano nel pannello Filtri hanno un gemello `-mobile`; le chip hanno nomi NUOVI.** La 15.6 ha misurato che il "nodo unico" con `display: contents` **non è praticabile** quando il pannello deve applicare in una navigazione sola. Si adotta quindi il doppio albero **SOLO** per i controlli che entrano nel pannello, col suffisso `-mobile`, dichiarando il costo in testid; i filtri che diventano **chip** non hanno gemello (le chip navigano da sole, pattern 15.4/15.6/15.7) e prendono nomi **nuovi** col prefisso `mobile-`. ⚠️ `cash-register.spec.ts:165-166/191` legge le `option` di `billing-filter-category`: quel nodo deve restare **uno** a 1280px, e se ne nasce un gemello `-mobile` va verificato che a 1280 sia `display:none` **e** che lo spec continui a trovarne uno solo.

**AD-6 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test, e riusano `joinSegments`.** Valgono per: (i) la composizione della **sub-line** della card transazione (`pilota · data · metodo`, coi casi di confine reali: `personName` **nullable**, `method` **nullable** sulla riga non attribuita, `description` **nullable**) e del **`sub`** dello sheet — segmenti assenti **omessi**, mai `—` (lezione 15.5 F1); (ii) la scelta del **tono** del `Badge` di `bookType` e di stato, riusando `BOOK_TYPE_TONE`/`statusInfo` **senza una seconda implementazione**; (iii) l'importo di riga, che **deve** passare da `ledgerClubAmountCents` (comportamento 2) — la funzione pura decide solo *quale delle due colonne* mostrare, mai il segno. Restano pure ⇒ niente `@/lib/env`.

**AD-7 — Un solo sheet aperto, un solo nodo per testid di sheet.** Ogni `BottomSheet` si rende condizionalmente (`{openRow ? <BottomSheet …/> : null}`), così ciascun testid di sheet resta **un** nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). Vale anche per lo sheet dei tre riquadri (R-15.8a-c) e per il bottom sheet dell'export (R-15.8a-h). **Va asserito**, non assunto.

**AD-8 — Una sola logica di rete per i due alberi.** `submitAdjust`/`submitReverse`/`handleReclassify` (`billing-console.tsx:313/367/396`) **si riusano così come sono**: stessi endpoint, stessi header, stessa mappatura 409/422, stesso `router.refresh()`. Se una superficie mobile ha bisogno di un secondo punto d'ingresso, chiama **la stessa funzione**; cambia solo dove viene resa (R-15.8a-g).

**AD-9 — Un'azione che apre un secondo overlay CHIUDE prima lo sheet** (R-15.4-d, riconfermata in 15.6 e 15.7): niente pannello z50 o `.mini-modal` z60 impilati su uno sheet z40. Con R-15.8a-g le due `.mini-modal` **non si aprono affatto** su mobile (le azioni sono `secondStep` dentro lo sheet) — e questo va **asserito**, non assunto.

**AD-10 — `TransactionEditor` (Nuova transazione): R3 è GIÀ soddisfatta, il lavoro è di VERIFICA.** Misurato a 375×812: il pannello è `0,0 375×812`, `border-left: 0`, `.so-foot` a `y 743 h 69` (bottom = 812) e **copre la tab bar** (`elementFromPoint` sul centro della barra = `FOOTER.so-foot`), il submit `transaction-submit` misura **161,4×44**. ⚠️ Ma **otto controlli dentro il form restano sotto i 44px** (`transaction-kind` 36, `transaction-person` 36,8, `transaction-amount` 34,8, `transaction-method` 36, `transaction-date` 38,8, il trigger calendario **24×24**, `transaction-description` 36,8, la ✕ del pannello **32×32** = TD (k) già registrato). Se il dev conclude diversamente sulla geometria, deve portare la misura che smentisce **prima** di scrivere la riga; sugli otto target interni, v. AC 15 (b) — vanno **dichiarati**, e portarli a 44px è **ammesso e raccomandato** se non cambia il desktop (misura pre/post a 1280).

---

## Acceptance Criteria

> Ogni misura si intende a **375×812** e ripetuta a **390×844** e a **320×568**, tema **chiaro e scuro**.

1. **(Registro entrate/uscite a card — template 325-334, R-15.8a-b/R-15.8a-d)** A ≤640px la `.students` del registro è `display:none` **misurato** e al suo posto c'è una lista di card nel linguaggio del template: descrizione 12,5px/500 **ellissata** (`kindLabel — description`), sub mono 10,5 `--ink-3` **ellissato** (`pilota · data · metodo` via `joinSegments`, segmenti assenti **omessi**), e a destra l'**importo mono 12px/600** colorato secondo la **prospettiva club** (`ledgerClubAmountCents`: > 0 ⇒ entrata, < 0 ⇒ uscita), più il **`Badge` di stato solo quando la riga NON è "Registrato"** (idioma "badge solo se anomalo", 15.6) e il `bookType` reso come chip/segmento del sub (mai un secondo oggetto a destra). ⚠️ **La card "Fatture" del template NON si porta** (R-15.8a-b: nel dominio non esiste alcuna fatturazione; è il gemello di "In volo ora", R-15.3-a) e **nessun numero nuovo viene inventato**: i due KPI del template diventano numeri che il dominio ha (v. AC 4). Ogni card è **UN solo elemento interattivo** (`<button>`, figli `<span>`, **zero** elementi interattivi annidati, `min-height` ≥44px) con nome accessibile parlante che contiene **almeno la descrizione e l'importo**. Empty state mobile = **un solo nodo** con testid proprio e una stringa **distinta** da quella desktop (`billing-empty` resta un nodo). **Verifica misurata**: `display` di entrambi gli alberi a 375 **e** a 1280 (i due lati, mai uno solo); ispezione DOM `card.querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`; nessun testo della card con `scrollWidth > clientWidth` **e** `text-overflow !== 'ellipsis'` a 320px.

2. **(Sheet di dettaglio del registro — R3, parità enumerata)** Il tocco su una card apre il `BottomSheet` della 15.2 con parità informativa verso **TUTTO** ciò che il desktop mostra o apre da quella riga (lezione 15.5 F2), enumerata voce per voce nel record: le **nove** colonne (data, pilota, tipo `bookType` + la nota "non incide sul risultato" quando `DEPOSIT`/`TRANSFER`, descrizione = `kindLabel` + `description`, metodo **o** il controllo di riclassifica, entrate, uscite, stato, azioni) più ciò che il DTO ha e la tabella non mostra (`source`, `id`, `actionable`, `reversed`/`reversal`). **Verifica**: apertura **da tastiera** (Tab reali + Enter, mai `focus()`); ogni sheet = **un solo nodo** (AD-7); nome accessibile **ben formato** — guardia su una **proprietà** (`not.toMatch(/—\s*—/)`, nessun segmento vuoto, nessun segmento uguale al segnaposto), **mai** `split(' — ').length` (lezione 15.5 F1) — provata su una riga **senza `personName`**, su una **senza `method`** (la riga non attribuita) e su una **senza `description`**.

3. **(Rettifica, storno e riclassifica dal telefono — R-15.8a-g, comportamenti INVARIATI)** Su mobile le tre azioni vivono **nello sheet** come **`secondStep`** (focus al primo campo entrando, ritorno al bottone uscendo), e la **riclassifica diventa ESPLICITA**: si sceglie il metodo fra bottoni ≥44px e **poi** si conferma — **nessun `<select>` a scrittura immediata su una superficie mobile**. Le due `.mini-modal` e il `<select>` inline restano **desktop-only e invariati**. In ogni caso **tutti** i comportamenti di §a.1 restano identici, ciascuno esercitato a **375px** da un e2e o da una misura riportata nel record: (a) "Rettifica" **solo** su riga `ACCOUNT` `actionable`, "Storna" **solo** su riga `CASH` `actionable` — su ogni altra riga **zero azioni**; (b) importo non parsabile **o zero** ⇒ `fld-error` inline e **zero richieste di rete** (contate con `page.route`, non dedotte dall'assenza di toast); (c) motivo obbligatorio su entrambe; (d) **409 distinto dal generico** su entrambe; (e) effetto contabile letto **dall'API filtrata** (mai da un conteggio di righe in pagina): una rettifica crea **un** `AccountMovement` di tipo `ADJUSTMENT` collegato all'originale, uno storno crea **un** movimento di storno e marca l'originale; (f) la **riclassifica** fa **una** sola `PATCH /cash-movements/{id}` (verificata con `page.route`: una richiesta, non due) con lo stesso payload di oggi; (g) `router.refresh()` su ogni esito. **In più**: ogni target dell'azione è **≥44px** (pre-fix misurato: i due `.btn.mini` di riga a 24,7px, i due submit delle `.mini-modal`), il controllo si raggiunge **senza scorrere in orizzontale**, e **nessuna `.mini-modal` si apre a ≤640px** (asserito: `mini-modal` assente dal DOM o `display:none` durante il flusso mobile — AD-9).

4. **(I tre riquadri come KPI strip tappabile — R-15.8a-c)** A ≤640px i tre riquadri (`billing-panel-result` / `-treasury` / `-deposits`) diventano una **KPI strip** (primitiva 15.2/15.3, **`.kpi-row`**, un KPI per riquadro col solo **totale**: Risultato netto / Disponibile / Acconti totali) e **ogni KPI è tappabile** e apre uno **sheet col dettaglio completo** del riquadro corrispondente — parità enumerata voce per voce (Risultato: ricavi/costi/netto; Liquidità: cassa/banca/acconti/non attribuito/disponibile; Acconti: totale/esposizione/in rosso). In ogni caso: i numeri **arrivano dallo stesso `getBillingSummary`** (nessun ricalcolo client, comportamento 1); il link del **secchiello** resta gated sul **COUNT** (`treasury.unattributedCount > 0`) e resta raggiungibile con un target ≥44px (dentro lo sheet e/o come chip, v. AC 5); il link "Acconti in rosso" resta gated su `inRedCount`; i valori `.stat-tone-*` non cambiano classe; i testid desktop dei tredici valori (`billing-panel-{revenue,cost,net,cash,bank,deposits-note,available,unattributed,unattributed-link,deposits-total,deposits-exposure,deposits-inred,deposits-link}`) restano **un nodo ciascuno** a 1280px. **Verifica misurata**: altezza dei riquadri **pre/post** alle tre larghezze (pre-fix: **553,3px** complessivi a 375) e posizione della prima card del registro **pre/post** (pre-fix **1041,6** su 812; a 320: **1126,8** su 568) — il guadagno atteso è **~450px** e va **misurato**; con la nota onesta dell'osservazione 15.7 §3.1: se il risultato fa **scendere** qualcosa, va detto e quantificato, non nascosto. ⚠️ La strip non deve introdurre una seconda `.kpi-row` a 1280px (nessuno spec la conta **su questa pagina**, ma la regola dell'epic è un nodo per superficie): asserire il conteggio a 375 **e** a 1280.

5. **(Testata del registro in linguaggio mobile — R-15.8a-e, R2/R4)** A ≤640px la testata prende la forma ratificata: **chip strip su `bookType`** (5 valori: `Tutti/Ricavo/Costo/Acconto/Giroconto`, chip come `Link` — la console rimonta, AD-3) **+ ricerca pilota full-width + riga `[Filtri (N) | Esporta]` + CTA "Nuova transazione" full-width**; **la categoria (21 valori) va nel pannello Filtri**, insieme al periodo e ad "Azzera filtri"; il **chip secchiello** (`?unattributed=true`) vive **dentro la chip strip** come chip attiva; i **feedback diventano toast** (R-15.8a-j); il bottone "Filtri" **dichiara quanti filtri nasconde**. In ogni caso: **nessun filtro e nessuna azione scompaiono** a ≤640px (R4) e il **contratto URL è invariato** (`?page&dateFrom&dateTo&bookType&categoryId&personQuery&unattributed`, sanificazione server-side compresa); **ogni controllo ha `min-height` ≥44px** (incluso il campo pilota, oggi **18,1px**, e i due trigger del calendario, oggi **24×24**) e **nessuno finisce sotto la tab bar**; gli href di export restano quelli di oggi; il pannello applica in **UNA** navigazione e il debounce da 400 ms è **annullato** all'apertura (AD-3). ⚠️ **Nessuna regola può agganciarsi a `.segmented`** (6 consumer, **due dei quali sulla pagina della story gemella 15.8b**) né a `.date-input` fuori dalla testata della Contabilità. **Verifica misurata**: altezza della testata mobile **pre/post** alle tre larghezze, in **entrambi i locale** e nei **tre stati di filtro** (pre-fix: **265,66** @375/@390 IT e EN, **350,89** @320, **308,5** con un filtro attivo, **393,73** @320 col chip secchiello), col criterio ratificato in 15.5 F3 — **testata ≤ pre-fix mantenendo ogni target ≥44px** (la stima della ratifica è **~238** contro **265,66**); **se irraggiungibile, si porta l'ARITMETICA e si documenta**, mai si abbassa il pavimento dei 44px.

6. **(Le due card secondarie e "Saldi negativi" — R-15.8a-f, il `.split` inline)** L'inline `style={{gridTemplateColumns:'1fr 1fr'}}` di `billing-console.tsx:642` **migra in una classe propria** (es. `.billing-split`) dichiarata **FUORI** dalla media query con `grid-template-columns: 1fr 1fr` — così il desktop resta **misurato invariato a 488/488 @1280** (⚠️ la regola base di `.split` è `2fr 1fr`: togliere l'inline senza la classe porterebbe il desktop a ~660/326, cioè romperebbe ciò che questa story dichiara invariato) — e **dentro** `@media (max-width:640px)` la stessa classe collassa a `1fr`. A ≤640px "Per categoria" (7 righe) e "Compensi istruttori" (35 righe) sono impilate e **nessuna delle due ha scroll orizzontale interno** (pre-fix: `cw 150 / sw 298` e `cw 150 / sw 212`); "Saldi negativi" (61 righe, `maxHeight: 220, overflowY: auto` a `billing-console.tsx:720`) conserva il suo scroller ma con un'altezza sensata su mobile e i suoi link ≥44px **non coperti dalla tab bar** (v. AC 11, dove la misura ambigua va discriminata). ⚠️ Nessuna regola di questa story tocca `.split` **fuori** dalla Contabilità: misura pre/post su `/dashboard/reports` (4 `.split`) a 1280 e a 375. **Verifica misurata**: larghezza delle due card **pre/post** a 375/320/641/800/1280; `scrollWidth <= clientWidth + 1` su entrambe a 320px.

7. **(Paginazione in linguaggio mobile — R-15.5-j)** La paginazione del registro resta quella di oggi (stesso contratto `?page=`, stessi `Link`) resa in linguaggio mobile (`.registry-pagination` o equivalente **ancorato con `>`**), bottoni **≥44px** (pre-fix: `billing-page-prev`/`next` **38,3×34,8**), hit-testabili **sopra** la tab bar. **Verifica**: navigazione `1 / 12 → 2 / 12` a 375px con i filtri preservati; misura dei target; hit-test a fondo pagina.

8. **(Redesign dell'`ExportMenu` — R-15.8a-h, il TD dell'epic R-15.2-c)** A ≤640px il menu si apre come **bottom sheet** riusando `MobileSheet` (15.2, z 40), con le **stesse** voci (lo stesso markup `<a>`, gli **stessi href**) rese full-width a **≥44px**; a >640px il **popover è identico a oggi** (misura pre/post a 1280/800/641 su almeno tre consumer diversi). In ogni caso: (a) il menu resta **un solo componente**, con **un solo** nodo di trigger e **un solo** nodo per voce su **ogni** superficie, a 375 **e** a 1280 (AD-4) — asserito su **tutti e nove** i consumer (`billing`, `logbook`, `movements`, `expiries`, `bookings`, `ppr`, `fleet`, `instructors`, `people/{id}`), compresi i **tre** che rendono una sola voce (`pdfLabel=""` senza `pdfHref`: fleet, instructors, pilots); (b) a ≤640px il contenitore del menu è **interamente dentro il viewport** su ogni consumer (pre-fix misurato su Contabilità: `x = -29,1`, `inside: false`); (c) ogni voce è **≥44px** e **hit-testabile** (pre-fix: **53,7px** su Contabilità perché le etichette italiane vanno a capo, **35px** su Scadenze/Movimenti/Registro voli — quindi la guardia si scrive sul **requisito 43,5**, non sul valore ottenuto); (d) gli **href non cambiano** e il download continua a funzionare (⚠️ verifica misurabile: un `<a download>` dentro uno sheet con scrim **scarica davvero** — provato, non assunto); (e) il menu prende finalmente dei **testid** (`export-menu-trigger`, `export-menu-pdf`, `export-menu-xls` o equivalenti), **senza riscrivere i cinque spec verdi** che oggi lo leggono per nome accessibile (lezione 14.6). **Verifica**: le cinque asserzioni page-level di §a.2 (`cash-report.spec.ts:76-77`, `exports.spec.ts:272-275`, `pdf-exports.spec.ts:225` e `:355-356`, `movements.spec.ts:225`) restano verdi **senza essere modificate**; ⚠️ **quattro** consumer hanno già regole mobile sulla propria testata (`.registry-head > div:has(> .btn) > .btn`, `.logbook-head > div:has(> .btn)`, e i gemelli 15.7): vanno **rimisurate**, non assunte.

9. **(I contrasti della Contabilità: CHIUSI — R-15.8a-i)** I tre valori di testo e l'oggetto grafico misurati in §a.1 salgono sopra soglia **in tema chiaro**, senza scendere sotto soglia in tema **scuro**: `billing-by-category-row` in **2,73 → ≥4,5** e out **3,96 → ≥4,5** (medicina già in casa: `.stat-tone-ok`/`.stat-tone-bad`, `airops.css:733-738`, che sulle stesse coppie misurano **9,82/10,63**); `negative-balance-row` **3,96 → ≥4,5**; la **barra "in" di "Per categoria"** (oggetto grafico) **2,47 → ≥3,0**. **Vincoli non negoziabili**: (i) **nessun token esistente cambia valore** (regola di architettura dell'epic) ⇒ il fix è **additivo** — applicazione di una classe già esistente, oppure un **token nuovo** dedicato agli oggetti grafici; (ii) **nessun literal di colore nuovo** fuori dai token; (iii) il fix vale **desktop e mobile** (queste superfici esistono su entrambi) ⇒ **desktop rimisurato** a 1280 e dichiarato; (iv) ⚠️ **misura dei GEMELLI** (lezione 15.3): se il fix tocca un token o una classe **condivisa**, vanno enumerate e misurate **tutte** le superfici che la usano, **nei due temi** — e se una di quelle superfici vive su `/dashboard/reports` (`.util-bar .seg`, fasce "Composizione movimenti", `.chart-label`), il fix va scritto **una volta sola qui** in forma riusabile e la 15.8b lo eredita: **due decisioni per lo stesso token sono vietate**. **Verifica**: rapporto di contrasto misurato canvas→WCAG con lo sfondo effettivo risolto **risalendo gli antenati partendo dall'elemento** e l'alpha letta **prima** della composizione (una `paint()` che pre-riempie di bianco dà alpha 1 sempre e misura tutto contro il bianco, sbagliando il tema scuro), **prima e dopo**, nei due temi, su ogni esemplare enumerato.

10. **(Convenzione testid — nessun duplicato, e nessun TESTO duplicato)** Desktop **invariati**: `billing-panel-{result,treasury,deposits}`, `billing-panel-{revenue,cost,net,cash,bank,deposits-note,available,unattributed,unattributed-link,deposits-total,deposits-exposure,deposits-inred,deposits-link}`, `billing-{empty,new-transaction-button,page-prev,page-next,pagination-status,adjust-feedback,reverse-feedback,reclassify-feedback,by-category-row,by-category-empty,instructor-compensation-row,negative-balances-card}`, `billing-filter-{date-from,date-to,booktype,category,person,reset,unattributed-dismiss}`, `negative-balance-row`, `transaction-row`, `transaction-{adjust-action,adjust-panel,adjust-amount,adjust-reason,adjust-confirm,adjust-error,reverse-action,reverse-panel,reverse-reason,reverse-confirm,reverse-error,reclassify-method}`, `transaction-{form,form-error,submit,kind,person,category,amount,method,direction,date,reason,description,result-panel,result-balance,result-close}`. Le superfici mobile usano il **suffisso `-mobile`** dove duplicano una superficie desktop (i controlli che entrano nel pannello Filtri) e il **prefisso `mobile-`** dove esistono solo su mobile (`mobile-billing-list`, `mobile-billing-empty`, `mobile-transaction-sheet`, `mobile-billing-filters-button`, `mobile-billing-panel-sheet`, `mobile-booktype-chip-*`, …). ⚠️ **Nessun nome nuovo può cominciare per un prefisso `^=` in uso** (`ac-card-`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`). **Verifica obbligatoria prima di scegliere ogni nome**: `grep -rn 'data-testid\^=' e2e/`, col risultato riportato nel record. **Verifica finale**: un `page.getByTestId(id)` per **ciascuno** dei testid elencati restituisce il numero **atteso** di nodi (1 per i singleton, N per i per-riga) a 375px **e** a 1280px su `/dashboard/billing`; **e** il nome accessibile letto page-level dai cinque spec dell'export (`'Esporta'`) restituisce **un solo** nodo a 1280px **su tutti e nove i consumer**.

11. **(Geometria e layering, con la tab bar della 15.1 presente)** A 320, 375 e 390px su `/dashboard/billing`: **nessun overflow orizzontale di pagina**; **nessun contenitore interno con scroll orizzontale nascosto** (per ogni discendente di `.page`, `scrollWidth <= clientWidth + 1`), con l'elenco delle eccezioni **dichiarate** — la KPI strip e la chip strip sono scrollabili per progetto; la tabella desktop non conta perché è `display:none`; ⚠️ **il `SlideOver` CHIUSO di `TransactionEditor` è un discendente di `.page`**: va dichiarato come eccezione motivata o escluso misurando la visibilità, **mai** ignorato in silenzio; **nessun controllo finisce sotto la tab bar** (hit-test `elementFromPoint` su **ogni** `.page a, .page button, .page input, .page select, .page textarea` visibile a fondo pagina dopo uno scroll **reale**; baseline misurata: **3 link** della card "Saldi negativi" con hit su `NAV.mobile-tabbar`/`SPAN.mobile-tab-label`/`svg`, barTop **745,08** in 812 — il dev deve **discriminare** "coperto dalla tab bar" da "clippato nel proprio scroller `maxHeight:220`"); lo sheet (z 40) copre la tab bar con lo scrim; il pannello del form (z 50) la copre del tutto (misurato: `elementFromPoint` sul centro della barra = `FOOTER.so-foot`); le due `.mini-modal` (z 60) restano desktop-only; il **bottom sheet dell'export** (z 40) e i popover portalati dei picker (65/66) restano **dentro il viewport**; i toast (200) sopra tutto. **In più, la guardia di CONTENIMENTO** (lezione 15.5 F1): per ogni card, ogni figlio che può crescere (importo fino a `-1.216,22 €`, `Badge` di `bookType`, `Badge` di stato, chip del metodo) ha `child.right <= card.right`.

12. **(Ogni regola nuova ha la sua guardia, provata DISCRIMINANTE)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` del corpo desktop a ≤640px; (ii) `display:none` dell'albero mobile >640px; (iii) la testata di R-15.8a-e — la guardia va scritta sul **lato che la regola libera** (l'altezza misurata e i target ≥44px con soglia **43,5**, "il pannello applica in **una** navigazione" provata rossa navigando a ogni `onChange`, e "sopravvive a un debounce pendente" provata rossa senza il `cancel()`), **non** "il controllo esiste"; (iv) nessun testo clippato **senza ellissi** a 320px; (v) contenimento dei figli della card (AC 11); (vi) nome accessibile dello sheet ben formato, su **proprietà** e non su `split` (AC 2); (vii) empty state = **un solo** nodo per albero, con la simulazione DOM del pre-fix (`node.parentElement.appendChild(node.cloneNode(true))`, metodo review 15.6 LOW-3 — **non** "non iniettabile"); (viii) i selettori nuovi **non raggiungono** né il `SlideOver` di `TransactionEditor` né le due `.mini-modal` (lezione 15.3 F1: misura pre/post della larghezza dei loro bottoni **e** prova con una variante DISCENDENTE del selettore); (ix) **nessuna regola tocca `.segmented`** (misura pre/post su `/dashboard/bookings`, `/dashboard/expiries`, `/dashboard` **e `/dashboard/reports`** a 375px), né `.util-*` (che vive solo su `/dashboard/reports`), né `.split` fuori dalla Contabilità (misura su `/dashboard/reports`), né `.date-input` fuori dalla testata toccata (misura su `/dashboard/logbook` e `/dashboard/movements`); (x) l'`ExportMenu` su **un** consumer NON toccato da questa story (es. `/dashboard/fleet`, che rende una sola voce) — la regola nuova deve migliorarlo **senza** cambiarne il conteggio di nodi; (xi) i comportamenti di dominio dell'AC 3 che sono invisibili a occhio (il movimento contabile unico, il 409 distinto, la `PATCH` unica della riclassifica). Ognuna va **provata rossa** simulando il pre-fix col repo **intatto** (iniezione CSS/DOM/`addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2, o `git stash` del solo `src/` con lo spec al suo posto, metodo 15.5 §12). Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

13. **(Invarianti)** Desktop >640px **invariato** su **tutte** le pagine che rendono i componenti toccati (lezione 15.3 claim 3: "desktop invariato" ≠ "nient'altro è cambiato") — cioè `/dashboard/billing` **e**, per l'`ExportMenu`, le altre **otto** superfici che lo montano: misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) sui valori già rilevati come baseline — `.app` `grid-template-columns` `232px 1048px` / `64px 736px` / `64px 577px`; **Contabilità** `.card-head` **109,23 / 152,23 / 180,53 (IT) — 152,23 (EN@641)**, `.students` `cw/sw` **990/990 · 678/988 · 519/988**, `.billing-panels` **322,66×3** @1280 e 1 colonna sotto, `.split` **488/488** @1280, `.page-head` **51,44**, `docH` **3.244** @1280; `pageOverflow 0` ovunque; tab bar `display: none` a >640px. `npm run gates` verde; **nessuna dipendenza npm nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (metodo in AC 9) ≥**4,5:1** per il testo e ≥**3:1** per gli oggetti grafici, in tema **chiaro e scuro**, **enumerando tutti gli esemplari** (la 15.4 ha trovato un pallino a 1,76:1, la 15.3 un glifo a 1,24:1, la 15.6 uno sfondo `--ink-4` a 3,66:1: non fidarsi dell'elenco); gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

14. **(Multi-attore — lezione 15.1 F1)** `/dashboard/billing` è **ADMIN-only** (misurato: pilota → `/it/dashboard`). La verifica per attore **non è opzionale**: ADMIN, PILOTA, ALLIEVO, ISTRUTTORE a **375 e 1280px**, con `page.context().clearCookies()` fra un'identità e l'altra, asserendo che il **redirect regge anche a 375px** e che la voce non compare nella tab bar né nello sheet "Altro" dei tre non-admin. ⚠️ L'`ExportMenu` invece vive anche su superfici **non** admin (`people/{id}`, `logbook`, `bookings`): il redesign va verificato **almeno su un attore non-admin** su una di quelle superfici, a 375px.

15. **(Debito tecnico — dichiarato, non subìto in silenzio)** Il record dice per **ciascuno** dei TD che toccano questa pagina se la story lo **chiude**, lo **subisce** o lo **aggrava**, con la misura: (a) **`OPTIONS_PAGE_SIZE = 100` di `billing/page.tsx:24`** — quarta faccia del TD dei picker: alimenta `personOptions` del solo `TransactionEditor`, il cui picker ha il typeahead server-side ⇒ degrada la comodità, non la funzione (misurato: 100 opzioni iniziali) — **subìto e dichiarato**; (b) gli **otto controlli sotto i 44px dentro `TransactionEditor`** (`transaction-kind` 36, `transaction-person` 36,8, `transaction-amount` 34,8, `transaction-method` 36, `transaction-date` 38,8, trigger calendario **24×24**, `transaction-description` 36,8) + la ✕ di `SlideOver` a **32px** e le opzioni del typeahead a **36px** (TD (k) della 15.7) — il dev dichiara quali porta a 44px **con la misura desktop pre/post** e quali restano, mai in silenzio; (c) **le voci dell'`ExportMenu`** e (d) **il popover fuori dal viewport** (`x = -29,1`) — **CHIUSI qui** (R-15.8a-h), con la misura; (e) **`.split` inline** che scavalca la media query — **CHIUSO qui** (R-15.8a-f); (f) i **contrasti** di §a.1 — **CHIUSI qui** (R-15.8a-i); (g) **`.search` a 190px con `cw 188 / sw 190`** — terza occorrenza del TD (g) della 15.6; (h) il campo pilota **desktop** a 18,1px — fuori mandato, dichiarato; (i) **`.so-sub` a `--ink-4`** — ⚠️ `TransactionEditor` **PASSA** un sottotitolo ("Contabilità", misurato), quindi il TD (h) è **attivo** qui: dichiarato, e chiuso solo se il fix token-level dell'AC 9 lo copre senza allargare il mandato; (j) **`billing.spec.ts:296`** delta-assert su un aggregato globale, flaky nell'arbitro 15.7 — TD già registrato, e questa story tocca la stessa pagina: **non aggravarlo** (nessun test nuovo che crei denaro fuori dalla catena); (k) **`account-section.tsx`** non responsive sotto ~700px (TD 14.6 F4) — **fuori scope** (è superficie della 15.9), ma monta lo **stesso** `ExportMenu` ⇒ l'AC 8 lo tocca e va misurato lì; (l) `viewport-fit=cover` mai dichiarato ⇒ tutti gli `env(safe-area-inset-*)` valgono 0 (TD di epic, 15.10).

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):

1. ⚠️ **Le cinque asserzioni page-level dell'`ExportMenu`** (`cash-report.spec.ts:76-77`, `exports.spec.ts:272-275`, `pdf-exports.spec.ts:225` e `:355-356`, `movements.spec.ts:225`): AD-4 esiste per queste. **Nessuna va riscritta** (R-15.8a-h).
2. **`billing.spec.ts` (13 test)** — ogni testid del registro, dei filtri, delle due azioni e dei tre riquadri: un duplicato li rompe.
3. ⚠️ **`billing-global.spec.ts` (2 test, 5° project della catena)** — legge aggregati **ALL-TIME** prima/dopo e riclassifica il **singolo** fixture non attribuito del seed: nessun test nuovo deve creare denaro fuori dalla catena, e il test mobile sul secchiello **si crea la propria** riga non attribuita (il seed l'ha già consumata: misurato **vuoto** sul DB post-suite).
4. **`cash-register.spec.ts:165-166/191`** — `option:has-text(...)` dentro `transaction-category` **e** `billing-filter-category`: i due `<select>` restano un nodo ciascuno con le stesse option, anche quando il secondo finisce nel pannello Filtri mobile.
5. **`account-adjustments.spec.ts:99-129`** — la rettifica dalla Contabilità: stessa forma, stessi testid, stesso `adjustment-badge`.
6. **`pdf-exports.spec.ts` + `exports.spec.ts`** — gli href di export della Contabilità (`/api/v1/transactions?format=xlsx`, `/api/v1/cash-report/pdf?from&to`) **non cambiano**.
7. **Le otto superfici NON di questa story che montano l'`ExportMenu`** (`bookings`, `ppr`, `fleet`, `instructors`, `logbook`, `movements`, `expiries`, `people/{id}`): il redesign le tocca **tutte**, e quattro di esse hanno già regole mobile sulla propria testata (`.registry-head > div:has(> .btn) > .btn`, `.logbook-head > div:has(> .btn)`, e i gemelli 15.7) — vanno **rimisurate**, non assunte.
8. **`rbac.spec.ts`** — i redirect dei non-admin restano.

**Unit**: nessuno copre oggi queste superfici. I nuovi sono quelli di AD-6.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):
- la **fascia tablet 641-900px**: nessuna regola di questa story deve toccarla (R1) — misurare a 800 e 641px che nulla di nuovo compaia, che il rail resti 64px e che le baseline di §a.1 a quelle larghezze restino;
- il **tema scuro** delle superfici nuove — **enumerare gli esemplari, non fidarsi dell'elenco**;
- ⚠️ **la story gemella 15.8b**: `/dashboard/reports` usa `.segmented` (2 consumer), `.util-*` (4 consumer) e `.split` (4 istanze). Una regola non ancorata di questa story arriverebbe **lì**, e la 15.8b partirebbe da una baseline già spostata. Misura pre/post su `/dashboard/reports` a 375 e 1280 **obbligatoria** (AC 12 ix);
- **Pianificazione, Panoramica e Scadenze**, se una regola tocca `.segmented` senza ancorarla;
- il **registro voli**, i **movimenti**, la **tesoreria** e la **scheda persona**, se una regola tocca `.date-input` senza ancorarla;
- il **`key` di remount** di `BillingConsole` (`billing/page.tsx:175`): qualunque stato locale nuovo (pannello filtri aperto, sheet aperto) muore a ogni cambio di filtro o pagina — AD-3.

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-billing.spec.ts`** (project `chromium` `fullyParallel` — questa story **non scrive `AppSettings`**; `setViewportSize` **dentro il test**, pattern 13.10). Copre: la lista a card e il non-clipping, lo sheet e la parità, rettifica/storno/riclassifica in `secondStep`, i filtri di R-15.8a-e (chip strip + pannello a navigazione unica + debounce), la KPI strip tappabile e i suoi sheet, la paginazione, geometria/layering, il bottom sheet dell'`ExportMenu`.
- **Copertura dell'`ExportMenu` su più consumer**: almeno **un** consumer non toccato dalla story (es. `/dashboard/fleet`, una sola voce) e **uno** non-admin, dentro lo stesso spec o in uno spec dedicato — non è ammesso verificare il redesign solo su Contabilità.
- **Modifiche a spec esistenti**: da **evitare**; ogni modifica va motivata e non deve ridurre la copertura (lezione 14.6). Per l'`ExportMenu` la ratifica è esplicita: **i cinque spec verdi NON si riscrivono**.
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-6, verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**
- Ogni test crea le **proprie** fixture (persona con cognome run-unique, movimenti con descrizione run-unique, categoria di cassa run-unique se serve) e le raggiunge **tramite i filtri della pagina** o via API filtrata — **mai** assumendo "la mia fixture è a pagina 1" (il registro pagina a **20** e ha **12 pagine** sul DB reale).
- ⚠️ **Nessun test nuovo asserisce un aggregato GLOBALE con uguaglianza** (i tre riquadri): delta a finestra breve su una fixture run-unique, oppure niente — mai fotografia+uguaglianza (review Billing-2 F4; TD `billing.spec.ts:296`).
- ⚠️ **Nessun test nuovo scrive `AppSettings`** (se servisse, andrebbe nella catena serializzata: qui non serve, e se il dev pensa il contrario deve dichiararlo prima di scriverlo).
- Il test del **secchiello** crea la **propria** riga `CASH` senza metodo (la fixture di seed è a consumo unico e sul DB post-suite il secchiello è **vuoto**), e la riclassifica **la propria**, mai quella di `billing-global.spec.ts`.
- Le fixture create alimentano i TD di volume: il dev deve dire **quante ne crea per run**.
- Attori: la pagina è **ADMIN-only** ⇒ verifica multi-attore obbligatoria (AC 14), redirect incluso.

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)
- Sostituzione degli alberi: asserire **entrambi** i lati (tabella `none` + lista visibile a 375px; l'inverso a 1280px).
- Testata: **non** "il controllo esiste" — è l'**altezza misurata** contro il pre-fix (265,66 @375, 350,89 @320, 308,5 con un filtro, 393,73 @320 col chip) e la raggiungibilità di ogni filtro; per il pannello, la guardia è anche "applica in **una** navigazione" (AD-3), provata rossa navigando a ogni `onChange`, **e** "sopravvive a un debounce pendente", provata rossa senza il `cancel()`.
- KPI tappabile: la guardia è la **posizione della prima card del registro** (pre-fix 1041,6) e l'**altezza dei riquadri** (pre-fix 553,3), non "il KPI si apre".
- Target: soglia **43,5**, mai calibrata sul valore ottenuto (lezione 15.7 MINOR-1).
- Nome accessibile dello sheet: guardia su **proprietà**, non su `split` (lezione 15.5 F1), provata rossa su una riga senza `personName`, senza `method` e senza `description`.
- Contenimento: guardia sul **rect** dei figli della card, non solo lo sweep degli scroller (cieco sugli elementi ellissati).
- Effetti contabili: letti **dall'API filtrata** su una descrizione run-unique, **mai** da un conteggio di righe in pagina; la riclassifica conta le richieste con `page.route` (**una**).
- `ExportMenu`: la guardia è il **contenimento nel viewport** (`x >= 0` e `right <= innerWidth`) **e** l'altezza delle voci ≥43,5 **su più consumer**, più il **conteggio dei nodi** a 375 e 1280 su tutti e nove.
- Contrasti: misura canvas→WCAG **prima e dopo**, nei due temi, su ogni esemplare **enumerato**, compresi i gemelli del token/classe toccati.
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). **Baseline attesa: 405 test** (il totale verificato dall'arbitro della 15.7) più quelli nuovi. Se il dev non la completa, la **review la riesegue da arbitro** (prassi 13.9/13.11/15.2-15.7).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- **Story gemella**: `15-8b-statistiche-impostazioni-mobile.md` — si sviluppa **DOPO** questa e ne eredita il nuovo `ExportMenu` e il pattern "KPI tappabile → sheet". Non serve leggerla per implementare la 15.8a; serve **non invaderla** (nessuna regola che arrivi a `/dashboard/reports` o `/dashboard/settings`).
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index), `15-2-primitive-mobile.md` (API delle primitive, R-15.2-a..g, **R-15.2-c = il TD dell'export che questa story chiude**, guardia cieca, prova per rebuild), `15-3-panoramica-mobile.md` + review (selettore ancorato; **R-15.3-a = il numero che non deve mentire**, gemello della card "Fatture"; R-15.3-c sulla KPI 2×2), `15-4-pianificazione-mobile.md` + review (chip strip, fixture indipendenti dall'ora, guardia sul lato liberato), `15-5-anagrafiche-card-mobile.md` + review (**AD-5 sui selettori `^=`**, guardia cieca da `split`, ellissi che nasconde gli sfondamenti, parità enumerata, criterio testata ≤ pre-fix, **F4 = le voci dell'export**), `15-6-registro-voli-mobile.md` + review (**il modello più vicino**: pannello Filtri a navigazione unica, debounce vs pannello, chip strip, badge di riga), `15-7-scadenze-transiti-mobile.md` + review (asimmetria del remount, guardie sul requisito, **`secondStep` per un'azione con effetto contabile**, export riparato, toast vs `<p>`).
- Story di dominio da rileggere: `billing-1-fondamenta.md` e `billing-2-pagina.md` (i tre riquadri, la prospettiva club, il secchiello, la tesoreria), `3-4-cash-categories-movements.md`, `3-5-financial-report.md`, `10-1-excel-exports.md`/`10-2-pdf-exports.md` (gli href).
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/logbook/logbook-console.tsx` (albero mobile 15.6: chip strip + card + sheet + pannello Filtri + `secondStep`), `src/app/[locale]/dashboard/movements/movements-table.tsx` (15.7: `secondStep` con effetto contabile), `src/components/ui/{bottom-sheet,mobile-sheet,export-menu}.tsx`.
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale; ⚠️ `npm run start` **fallisce** con il `JOBS_SECRET` segnaposto di `.env`: serve `export JOBS_SECRET=<valore non-segnaposto>` anche solo per servire la build; MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway **con import per path assoluto** (`/home/admin/AirManager/node_modules/playwright-core/index.mjs`) e Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`; credenziali di seed `admin@airmanager.local` / `SEED_ADMIN_PASSWORD` di `.env`, più `pilot@`/`instructor@`/`student@airmanager.local` con la stessa password).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile ledger transaction list", "export menu mobile bottom sheet", "financial KPI mobile card").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.8a): contabilità mobile — registro a card con sheet, riquadri come KPI tappabili, azioni in secondStep, redesign dell'ExportMenu` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **Statistiche e Impostazioni** → **15.8b** (story gemella, sviluppata dopo). Qui non si tocca `/dashboard/reports` né `/dashboard/settings`: le uniche misure su quelle pagine sono le **guardie di non-regressione** dell'AC 12 (ix).
- **Aree self `my-account`/`my-compensation`/"le mie transazioni"** e il **modulo PPR pubblico `/ppr`** → **15.9**. ⚠️ `account-section.tsx` (l'estratto conto, TD 14.6 F4 sul responsive) è di quella story: qui si tocca **solo** perché monta l'`ExportMenu` (AC 8).
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover`, la riserva sticky di R-15.2-g → **15.10**.
- **Qualunque modifica alle API, agli schemi Zod o al dominio**: la definizione di ricavo, la prospettiva club, il calcolo dei riquadri, il ciclo di vita di `CashCategory` **non si toccano**. Nessuna modifica server è prevista da questa story.
- **La correzione dei difetti pre-esistenti misurati e non ratificati**: `.search` 188/190; il campo pilota a 18px del **desktop**; il taglio senza ellissi delle celle `.student-row`.
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/`SlideOver`/`joinSegments`: si **riusano**, non si reinventano.

---
---

# Appendice — le ratifiche in esteso (il fatto misurato, le opzioni, la decisione PO)

> Questa sezione conserva integralmente il ragionamento del draft 15.8: serve al dev per capire **perché** una decisione è quella, e quali alternative sono già state scartate. Le decisioni sono chiuse: non si riaprono.

### Q1 → **SPLIT** (R-15.8a-a)

**Il fatto, con i numeri.** Il piano assegnava alla 15.8 *"KPI, registro entrate/uscite con filtri, secchiello, bar chart orizzontali, card impostazioni; export/PDF raggiungibili da mobile"*. Le tre pagine reali misurano:

| | righe di codice della superficie | oggetti da portare | scritture | overlay | spec e2e che le guidano |
|---|---|---|---|---|---|
| **Contabilità** | 1.661 (`page` 321 + `console` 837 + `panels` 143 + `editor` 360) | tabella a 9 colonne (988px), 3 riquadri, 8 gruppi di controllo, 2 card secondarie, 1 card saldi, paginazione a 12 pagine | 3 (rettifica, storno, riclassifica) + 1 form a 3 rami | 2 `.mini-modal` + 1 `SlideOver` | `billing` (13), `billing-global` (2, catena), `cash-register` (5), `cash-report` (4), `account-adjustments` (4) |
| **Statistiche** | 363 (+ 249 di componenti grafici condivisi) | 5 KPI, 4 grafici, 4 liste, 2 toggle | **nessuna** | nessuno | `reports` (5) |
| **Impostazioni** | 1.825 (7 card) | 7 card, 3 tabelle CRUD, ~20 campi di form | **~15 endpoint** | nessuno (form inline) | `settings` (7, catena), `booking-window` (4, catena), `treasury-settings` (3, catena), `expiry-types` (6) |
| **totale** | **3.849** (+249) | | **~19 scritture** | 3 | **53 test in 10 file, 4 dei quali in catena serializzata** |

Per confronto la 15.7 toccava **1.647 righe** con **3** scritture e **nessuno** spec in catena alla creazione. Il perimetro pieno era **2,3×** in codice e **~6×** in scritture, e le tre pagine **non condividono né codice né pattern**.

**Decisione PO: SPLIT** — 15.8a = Contabilità + redesign `ExportMenu`; 15.8b = Statistiche + Impostazioni. Il taglio segue il **pattern**: la 15.8a è la quinta console-lista dell'epic e riusa alla lettera 15.6/15.7 (chip strip + pannello Filtri + card + sheet + `secondStep`), più il TD dell'export, che vive soprattutto qui (è la superficie dove il popover esce dal viewport).

### Q2 → **A** (R-15.8a-b) — "Fatture" e "Da incassare / In ritardo" non esistono nel dominio

**Il fatto**: il template (righe 305-325) apre la Contabilità con **due KPI** (`Da incassare`, `In ritardo`) e una card **"Fatture"** costruita su `INVOICES` (`data.js:137`, con `status: pending|paid|overdue`). In AirManager **non esiste nessuna fatturazione**: nessun modello Prisma, nessuna API, nessuna pagina, nessun concetto di "scaduto". È **esattamente** il caso della 15.3, dove il template diceva "In volo ora" e il dato non esisteva: il PO ha ratificato di **cambiare il titolo** perché *il numero non deve mentire* (R-15.3-a). Gli oggetti reali sono **tre riquadri** (Risultato del mese / Liquidità / Acconti piloti) e **un registro** entrate/uscite.

**Opzioni**: **A** si mappano sui numeri veri (i due KPI del template diventano numeri che il dominio ha; la card "Fatture" non si porta, al suo posto c'è il registro = la card "Movimenti recenti" del template) · **B** si porta la forma, non i nomi (la prima lista diventa "Saldi negativi", 61 righe, l'unica lista con una semantica di "da incassare") · **C** non si porta nessuno dei due KPI.

**Decisione PO: A**, da leggere **insieme a Q3** (i due oggetti competono per lo stesso spazio verticale). **B** promuoveva in cima una card oggi in fondo e gated (`negativeBalances.length > 0`), cambiando la gerarchia su una sola piattaforma.

### Q3 → **A** (R-15.8a-c) — i tre riquadri diventano KPI strip tappabile

**Il fatto misurato**: oggi i tre riquadri sono tre `.card` impilate (`.billing-panels` collassa già a 1 colonna sotto 1200px) e occupano **553,3px** — **il 68% di un viewport da 812** *prima* che cominci il registro, che infatti parte a **1041,6px** (a 320px: **1126,8** su 568). Ogni riquadro ha 3-4 righe chiave/valore più un totale in grassetto e, per Liquidità e Acconti, un link condizionale. La 15.7 ha misurato l'effetto opposto e lo ha dichiarato: la KPI 2×2 ha **fatto scendere** la prima card della Scadenze da 567 a 609.

**Opzioni**: **A** KPI strip 15.2 (un KPI per riquadro col solo totale) + **sheet** col dettaglio al tocco — guadagno stimato 553 → ~100px, cioè la prima card sale di **~450px** · **B** tre card collassabili (~200px chiusi) · **C** si lascia com'è (553px, prima card ~880px, ancora sotto il fold) · **D** solo i tre totali senza sheet (~90px, ma **perde informazione**: vietato da R4).

**Decisione PO: A** (−450px, R4 salva). È l'unica opzione che risolve il difetto di apertura della pagina (prima riga al **128%** dello schermo, il peggiore dell'epic) senza perdere nulla: il dettaglio è enumerato nello sheet (parità 15.5 F2), e il "KPI tappabile" non è un pattern nuovo — è la card+sheet dell'epic applicata a una card KPI, e `BottomSheet` non fa distinzione fra i due.

### Q4 → **A** (R-15.8a-d) — che cosa vive sulla card della transazione

**Il fatto**: il desktop mostra **nove** colonne — data, pilota, `bookType` come `Badge` (+ la nota "non incide sul risultato" su acconti/giroconti), descrizione (`kindLabel` + `description`), metodo **o** il `<select>` di riclassifica, **Entrate**, **Uscite**, stato come `Badge` con pallino, azioni. Il template mostra **tre** cose: `desc` (12,5px/500 ellissato), un sub mono `pilota · MM-DD · metodo`, e l'importo mono colorato. Le sue righe **non sono tappabili**. Misurato: sul DB reale un importo arriva a `-1.216,22 €`, i nomi pilota sono lunghi (`FiltroB-1785866380367-1gdi90 Billi`, clippato senza ellissi già a 1280px), e le colonne Entrate/Uscite usano `.stat-tone-*` (10,63 / 9,82 — **sopra soglia**).

**Opzioni**: **A** card = template + `Badge` di stato **solo se anomalo** (idioma 15.6), riga tappabile → sheet a parità piena, `bookType` nel sub o come chip mono a sinistra · **B** template alla lettera (riga muta, niente azioni) · **C** due oggetti a destra (importo + `Badge` di `bookType`), il più affollato su 317px.

**Decisione PO: A** — card = template + Badge solo se anomala + sheet a parità piena (**prospettiva club** sull'importo, `ledgerClubAmountCents`). Lo stato **cambia il significato** della riga (una riga stornata non è una riga registrata) e il pattern "badge solo se anomalo" è già misurato e ha già il pallino dipinto.

### Q5 → **A** (R-15.8a-e) — la testata del registro

**Il fatto, con l'aritmetica**: la testata contiene **periodo** (due `DateInput` con popover portalati), **tipo** (`bookType`, 5 opzioni), **categoria** (21 opzioni), **ricerca pilota** (debounced 400 ms), **Azzera** (condizionale), **chip secchiello** (condizionale), **Esporta**, **Nuova transazione** — più tre `<p role="status">` di feedback. Misura **265,66px** @375 (350,89 @320, **308,5** con un filtro attivo, **393,73** @320 col chip), contro i 109,23 di 1280px. Nessun controllo raggiunge i 44px (periodo 37,4 con trigger da **24×24**, tipo 35, categoria 35, ricerca **18,1**, azzera 35, esporta 34,8, CTA 34,8). Il riordino 15.5 alla lettera (tutto full-width, ogni target ≥44) darebbe: periodo 44 + tipo 44 + categoria 44 + ricerca 46 + azzera 44 + esporta 44 + CTA 44 = 310, più 6 gap da 8 = 48, più 24 di padding + 34 di chip/feedback ⇒ **~416px**, cioè **+150**.

**Opzioni**: **A** chip strip su `bookType` + ricerca full-width + `[Filtri (N) | Esporta]` + CTA full-width — stima strip 64 (fuori dalla testata) + ricerca 46 + riga 44 + CTA 44 + 2 gap 16 + padding 24 = testata **174** + strip **64** = **238** (< 265,66 ✓, e < 308,5 con filtri attivi) · **B** chip strip sulla **categoria** (21 valori: una strip che scorre per sempre) · **C** tutto nel pannello (~130 + CTA, ma la lista non dice più quale taglio mostra) · **D** riordino alla lettera (~416px: peggiora ciò che la story deve risolvere).

**Decisione PO: A**, con le tre precisazioni ratificate: (i) il bottone "Filtri" **dichiara quanti filtri nasconde**; (ii) il **chip secchiello** va **dentro la strip** (così ha un nome visibile) e i tre `<p role="status">` diventano **toast** (v. Q14); (iii) la chip strip è **markup nuovo**: **`.segmented` non si tocca** (6 consumer, **due dei quali sulla pagina Statistiche della story gemella**).

### Q6 → **A, variante spostamento** (R-15.8a-f) — il `.split` inline a due colonne

**Il fatto misurato, che nessuno aveva dichiarato**: `airops.css:1447` porta `.split{grid-template-columns:1fr}` sotto i 1200px, ma `billing-console.tsx:642` scrive `style={{gridTemplateColumns:'1fr 1fr'}}` **inline**, e l'inline batte la media query. Risultato: a 375px "Per categoria" e "Compensi istruttori" sono **due card larghe 151,5px affiancate** (a 320px: **124px**), ognuna con scroll orizzontale interno (`cw 150 / sw 298` e `cw 150 / sw 212`). È l'**unico** `.split` dell'app che non collassa — un difetto di **una parola**. In più: "Per categoria" ha **7 righe** con barre in/out (testo **2,73** e **3,96**, barra "in" **2,47** — v. Q12); "Compensi istruttori" ha **35 righe**; "Saldi negativi" ha **61 righe** dentro `maxHeight: 220, overflowY: auto` (la causa della misura ambigua sui link sotto la tab bar).

**Opzioni**: **A** si toglie l'inline e le due card si impilano · **B** si sovrascrive nel blocco mobile con una classe nuova (lascia in piedi la riga che causa il difetto: due fonti di verità) · **C** non si portano su mobile (vietato da R4).

**Decisione PO: A nella variante spostamento** — ⚠️ **la precisazione è parte della decisione, non un dettaglio**: la regola base di `.split` è **`2fr 1fr`**, quindi togliere e basta l'inline porterebbe il desktop da **488/488** a ~**660/326**. La forma corretta è **spostare** l'inline in una classe propria (`.billing-split{grid-template-columns:1fr 1fr}`) **fuori** dalla media query, e neutralizzarla **dentro** `@media (max-width:640px)`: desktop **misurato invariato**, mobile collassato.

### Q7 → **A** (R-15.8a-g) — rettifica, storno e riclassifica dal telefono

**Il fatto misurato**: le due azioni di riga sono `.btn.mini` **fuori dallo schermo** (la colonna Azioni è la nona di 988px in 317 visibili) e aprono due `.mini-modal` **z 60**; la riclassifica è un `<select>` **dentro** la cella Metodo (settima colonna) che fa una `PATCH` **immediata, senza conferma**. La rettifica ha due campi (importo con segno + motivo) e crea un `AccountMovement`; lo storno ha un solo campo (motivo, `<textarea>`) e crea un movimento di storno. Entrambe hanno un 409 distinto. Il precedente più vicino è la 15.7: la chiusura del transito, che ha **effetto contabile**, è diventata un **`secondStep` dentro lo stesso sheet**, verificata dal vivo (race/replay/409) senza un solo problema.

**Opzioni**: **A** tutt'e tre nello sheet — "Rettifica"/"Storna" come `secondStep`, e la **riclassifica** come terza azione con i metodi come bottoni ≥44px (scegli → conferma) · **B** le due azioni in `secondStep`, la riclassifica resta un `<select>` dentro lo sheet · **C** le `.mini-modal` anche su mobile (vietato da AD-9/R-15.4-d: modale z60 su sheet z40).

**Decisione PO: A** — la riclassifica diventa **ESPLICITA** (scegli → conferma): **niente select a scrittura immediata su mobile**. **Desktop invariato**. `submitAdjust`/`submitReverse`/`handleReclassify` si riusano **interi** (AD-8): cambia solo dove vengono resi, non il contratto (stessa `PATCH`, stesso feedback).

### Q11 → **A** (R-15.8a-h) — la forma del nuovo `ExportMenu`

**Il fatto misurato**: nove consumer; **nessun `data-testid`**; a 375px su Contabilità il popover sta a `x = -29,1` — **fuori dal viewport a sinistra** — e le sue voci misurano **53,7px** (le etichette italiane vanno a capo) contro i **35px** misurati sulle testate 15.5/15.6/15.7. Le voci **restano hit-testabili** (`hit: A.btn`), quindi l'export **funziona**: il difetto è ergonomico e di contenimento. Vincolo duro: **cinque asserzioni page-level** leggono un solo bottone "Esporta" e un solo link per voce (AD-4), su **quattro** spec diversi, e tre consumer rendono **una sola** voce.

**Opzioni**: **A** ≤640px il menu diventa un **bottom sheet** (`MobileSheet`, z 40) col **medesimo markup** reso in un contenitore diverso — voci 44px full-width, contenimento per costruzione; ⚠️ va verificato che un `<a download>` dentro uno sheet con scrim scarichi davvero · **B** popover clampato al viewport + voci 44px (2-3 dichiarazioni CSS, zero JS, ma resta un popover da 180px su 375: non chiude davvero R-15.2-c) · **C** due bottoni inline nella testata (sposta ~52px di costo sulla testata che Q5 sta facendo dimagrire) · **D** si lascia com'è (il PO ha già deciso in 15.7 LOW-2 che si chiude qui).

**Decisione PO: A** — ExportMenu ≤640px = **bottom sheet** (MobileSheet 15.2), **voci 44px**, **popover desktop identico**; **testid nuovi SENZA riscrivere i 5 spec verdi** (lezione 14.6: la modifica di uno spec verde va motivata — qui non c'è motivo, perché il conteggio dei nodi non cambia).

### Q12 → **TUTTO ORA** (R-15.8a-i) — i contrasti della Contabilità

**I fatti misurati** (canvas→WCAG, tema **chiaro**; in tema scuro sono tutti sopra soglia) — **la parte di competenza di questa story**:

| oggetto | dove | misura | soglia | tipo |
|---|---|---|---|---|
| valore "in" di `billing-by-category-row` | `billing-console.tsx:659` (`var(--ok)`) | **2,73** | 4,5 | testo |
| valore "out" di `billing-by-category-row` | `:662` (`var(--bad)`) | **3,96** | 4,5 | testo |
| importo di `negative-balance-row` | `:726` (`var(--bad)`) | **3,96** | 4,5 | testo |
| barra "in" di "Per categoria" | `:671` (`var(--ok)`) | **2,47** | 3 | oggetto grafico |

(Gli altri tre esemplari — `.util-bar .seg` **2,47**, fasce "Composizione movimenti" **2,73 / 2,04**, `.chart-label` **3,66** — vivono su `/dashboard/reports` ⇒ **15.8b**.)

⚠️ **La medicina per i testi esiste già in casa**: `.stat-tone-ok`/`.stat-tone-bad` (`airops.css:733-738`) sono nate esattamente per questo caso ("testo colorato a dimensione di corpo direttamente su `--panel`") e i riquadri e le colonne Entrate/Uscite le usano già, misurando **9,82-10,63**. Le superfici sopra usano il token grezzo inline.

**Opzioni offerte** (una per gruppo): chiudere i testi con `.stat-tone-*` / subirli; chiudere gli oggetti grafici (serve una scelta di colore o un bordo) / rimandarli alla 15.10 col mobile che non eredita la coppia; `.chart-label` col resto del TD (h) in 15.10 / qui.

**Decisione PO: TUTTO ORA** (non la raccomandazione, che era 1-A/2-B/3-A): tutti e sette i contrasti si chiudono nelle due story, con **fix token-level MISURATI nei due temi**, ripartiti per superficie posseduta, e con l'obbligo di **misurare i GEMELLI** su tutte le superfici che usano quei token (lezione 15.3), **desktop rimisurato**. Il vincolo di architettura resta: **nessun token esistente cambia valore** ⇒ il fix è additivo (v. AC 9).

### Q14 → **A** (R-15.8a-j) — i tre `<p role="status">` di feedback

**Il fatto**: `billing-console.tsx:424-438` rende **tre** `<p role="status">` **dentro la testata della card** (`billing-adjust-feedback`, `billing-reverse-feedback`, `billing-reclassify-feedback`). È **la stessa forma** che la 15.6 (R-15.6-d ii) e la 15.7 (R-15.7-g) hanno sostituito col **toast** su mobile, con la motivazione ratificata: *un conferma-e-poi-niente su un telefono è il modo più facile per far ripetere l'operazione a chi non l'ha vista andare a buon fine*. In più, qui i tre `<p>` **crescono dentro la testata**, cioè peggiorano la misura che Q5 deve migliorare. ⚠️ La review 15.7 (LOW-3) ha trovato che aggiungere il toast **anche al desktop** produce un **doppio annuncio** per uno screen reader (due live region con lo stesso testo).

**Opzioni**: **A** toast su mobile, `<p>` al desktop (i `<p>` a `display:none` sotto 640px, regola ancorata alla testata della Contabilità), **senza** aggiungere il toast al desktop · **B** toast su entrambe (ripete il doppio annuncio su tre feedback) · **C** i tre `<p>` restano ovunque.

**Decisione PO: A** — esiti a **toast su mobile**, `<p>` al **desktop**, **niente doppio annuncio**. Il toast serve dove l'azione avviene lontano dal feedback (dentro uno sheet); il `<p>` basta dove sono adiacenti.

---
---

# Dev Agent Record — story 15.8a (Opus 5 xhigh, 2026-08-05)

Status: **implementata, gates verdi, suite completa CI=1 su DB fresco eseguita** (esito in §9). Nessun commit: la consegna è il codice + questo record.

## 1. Verifica della ricognizione (conferme e correzioni, tutte MISURATE)

Baseline ricostruita su questa macchina (build di produzione, `npm run start`) dopo aver ripopolato il DB fresco con le fixture che riproducono le condizioni della ricognizione (26+21 movimenti di cassa del mese, 23 categorie, 10 saldi negativi, 2 pagine di registro). Script e JSON in `/tmp/.../scratchpad/158a-A-geom.mjs` + `158a-A-baseline.json`.

### Confermato alla cifra
| fatto della ricognizione | misura ripetuta |
|---|---|
| `.card-head` registro **265,66** @375 **e** @390, IT **e** EN | **265,66** in tutti e quattro i casi |
| **350,89** @320 | **350,89** |
| **308,5** con un filtro attivo @375 | **308,5** |
| **393,73** @320 col chip secchiello | **393,73** |
| **180,53** @641 IT vs **152,23** @641 EN (baseline sensibile al locale) | identico |
| **109,23** @1280 | **109,23** |
| `.students` `cw 317 / sw 988` @375; 990/990 @1280; 678/988 @800; 519/988 @641 | identico |
| `.split` inline: **151,5+151,5** @375, **124+124** @320, **488/488** @1280 | identico |
| paginazione `billing-page-prev/next` **38,3×34,8** | **38,34×34,84** |
| campo pilota **18,1px** | **18,13** |
| trigger calendario **24×24**, `filter-date-range` 271,9×37,4 | **24×24**, date input 128×37,39 |
| CTA 151,5×34,8, Esporta 103,9×34,8, bookType 120×35 | identico |
| overflow orizzontale **di pagina 0** a 320/375/390/641/800/1280 | **0** ovunque (⇒ una guardia sull'overflow di pagina è davvero CIECA qui) |
| `.search` `cw 188 / sw 190` (TD (g)) | identico |
| contrasti chiari: byCat in **2,73**, out **3,96**, negBalance **3,96**, barra in **2,47**, barra out **3,59** | identici alla seconda cifra |
| contrasti scuri: byCat **9,3 / 6,61**, barre **10,45 / 7,42** | identici |
| `ExportMenu` @375 su Contabilità: `x = -29,1`, `inside: false`, voci **53,7px**, z 20 | **x = −29,09**, inside false, voci **53,69**, z 20 |
| `TransactionEditor` @375: pannello `0,0 375×812`, `.so-foot` in basso, submit 161,4×44, otto controlli 34,84-38,84 + ✕ 32 + calendario 24 | identico |
| `BillingConsole` **rimonta** a ogni navigazione | **misurato**, non dedotto: `{"before":"ZZZ-remount-probe","after":"","remounted":true}` |
| la pagina è ADMIN-only | confermato per pilota/allievo/istruttore a 375 **e** 1280 (AC 14) |

### Correzioni / precisazioni
1. **`.billing-panels` non misura 553,3 ma 579,92** a 375: la ricognizione girava su un DB col **secchiello vuoto**, quindi senza la riga-link `billing-panel-unattributed-link` e senza `billing-panel-deposits-link`. Con entrambi i link presenti (il caso reale che la story vuole preservare) i tre riquadri costano **579,92**. Di conseguenza la prima riga non parte da 1041,6 ma da **1068,23** (131% di 812; a 320: **1153,47**, 203%). Il difetto è quindi **peggiore** di quanto dichiarato, non migliore.
2. **`billing-filter-category` non misura 250px in assoluto**: la larghezza dipende dal nome di categoria più lungo. Con 23 categorie qui misura **182×35**; è quella larghezza che fa mandare a capo una riga in più della testata. Chi rimisura con meno categorie ottiene **222,66** invece di 265,66: *la baseline della testata è sensibile ai DATI* (stessa classe della lezione 15.7 C2, qui su un `<select>`).
3. **La misura "3 link della card Saldi negativi sotto la tab bar" è ambigua e va discriminata**: riprodotta, il link colpevole risulta **contemporaneamente** `clipped: true` dentro il proprio scroller `maxHeight:220` **e** `coveredByBar: true`. Cioè la baseline non poteva distinguere le due cose. La discriminazione è stata implementata sia nello sweep di misura sia nella guardia e2e (si salta un controllo che è fuori dal rettangolo visibile del proprio scroller).
4. **La paginazione era coperta dalla top bar, non dalla tab bar**: allo scroll a fondo pagina i due `billing-page-*` colpivano `HEADER.mobile-topbar`. È l'eccezione dichiarata della 15.1 (barra sticky), non un difetto di questa story — ma la ricognizione non lo elencava.
5. **`bookings` è il SECONDO consumer col popover fuori dal viewport**: `x = −29,09` anche su `/dashboard/bookings` @375. La ricognizione citava solo la Contabilità.
6. **Nessun writer HTTP può creare una riga CASH non attribuita** (dal Billing-1 AC 2 + review F8/D2 su `completePprRequest` ogni percorso richiede `paymentMethod`). Il piano di test chiedeva che «il test del secchiello crei la propria riga»: **è impossibile**. V. §7 (deviazione 1).
7. **La barra di "Per categoria" NON usa `.util-bar .seg`**: è uno stile **inline** (`background: var(--ok)`) dentro `billing-console.tsx:671`. `.util-*` ha 4 consumer, **tutti** su `/dashboard/reports`. Il fix è quindi **locale per applicazione** ma **riusabile per forma**: v. §5 e la nota di tensione in §10.
8. **`.mini-modal` non conta 2 nodi a riposo**: le due modali sono rese condizionalmente, quindi il DOM ne ha **0** finché non si apre un'azione (verificato a 375 e 1280).
9. Il `<p role="status">` del desktop **non è raggiungibile a ≤640px**: i suoi unici innesco (le due `.mini-modal` e il `<select>` inline) vivono dentro il corpo desktop, che è `display:none`. La regola che li nasconde resta (è parte di R-15.8a-j) ma la sua guardia è per iniezione DOM, non per flusso — dichiarato in §6.

## 2. Che cosa è stato costruito, per AC

| AC | esito | prova (misura o test) |
|---|---|---|
| **1** registro a card | **fatto** | `.students` `display:none` @375 / `flex` @1280; `.billing-mobile` `block` @375 / `none` @1280 (misurato sui **due** lati). Card = **UN** `<button>`, `querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0` su tutte (misurato: `[0,0,0,0,0]`). `min-height` 44. Nome accessibile = `Apri dettaglio: <kindLabel — descrizione> · <importo>` (asserito: contiene descrizione **e** importo). Sub-line `pilota · data · metodo` via `joinSegments`. Chip `bookType` a sinistra del titolo, **mai** un secondo oggetto a destra. Badge di stato **solo** se `reversed`/`reversal`. Empty state `mobile-billing-empty`, stringa distinta da `billing-empty`. Nessun testo clippato senza ellissi a 320 (misurato `[]`). |
| **2** sheet a parità piena | **fatto** | 11 righe: Data, Pilota, Tipo (+ nota "non incide sul risultato" su DEPOSIT/TRANSFER), Descrizione, Metodo (o "Non attribuito"), Entrate, Uscite, Stato, Origine (`source`), Riferimento (`reference`), Identificativo (`id`) — asserite in ordine. `reversed`/`reversal` sono lo **Stato** (Stornato / Storno), `actionable` è il **gate delle azioni**, reso come presenza/assenza dei bottoni (dichiarato: renderlo anche come riga sarebbe rumore). Apertura **da tastiera** con Tab reali + Enter. `mobile-transaction-sheet` = **1 nodo**. Nome accessibile provato su riga senza `personName`, senza `description` e senza `method` (il secchiello), con guardie su **proprietà** (`/—\s*—/`, `/·\s*·/`, segmento vuoto, segmento uguale a "—"). |
| **3** rettifica, storno, riclassifica | **fatto** | (a) Rettifica solo su `ACCOUNT actionable`, Storna solo su `CASH actionable`, zero azioni altrove — asserito nei due sensi; (b) importo non parsabile **e** zero ⇒ `fld-error` e **0 richieste** contate con `page.route`; (c) motivo obbligatorio su entrambe (asserito anche sullo storno); (d) **409 distinto dal generico** (due `route.fulfill`, testi diversi); (e) effetto letto **dall'API filtrata**: la rettifica crea **1** `ADJUSTMENT` da −2500, lo storno crea **1** riga `reversal` e marca **1** riga `reversed`; (f) la riclassifica fa **UNA** `PATCH /cash-movements/{id}` con body `{"paymentMethod":"CASH"}` — e la SCELTA da sola non scrive (0 richieste dopo il tap sul metodo); (g) `router.refresh()` su ogni esito. Target: bottoni azione e metodi ≥44 (misurati). **Nessuna `.mini-modal` nel DOM** durante il flusso mobile (asserito `0`). |
| **4** KPI strip tappabile | **fatto** | `.billing-panels` `none` @375, `.billing-kpi-row` `grid` @375 / `none` @1280; **una sola** `.kpi-row` a 375 **e** a 1280. Riquadri **579,92 → strip 152,97** (**−426,95**); prima card del registro **1068,23 → 563,41** (**−504,82**; a 320: 1153,47 → 563,41, **−590,06**) — sopra la stima di −450. I tre valori sono confrontati col DOM desktop **nello stesso render** (i riquadri sono `display:none` ma il `textContent` c'è): mai due `page.goto` intorno a un aggregato globale (v. §7 deviazione 4). Secchiello **gated sul count** anche nello sheet, link ≥44px, `?unattributed=true` raggiunto e chip attiva presente. |
| **5** testata in linguaggio mobile | **fatto** | **175 + 64 di strip = 239** a 320/375/390, IT **e** EN, in **tutti** gli stati di filtro (nessuno, bookType, periodo, secchiello) — contro 265,66 / 308,5 / 350,89 / 393,73. Desktop **invariato**: 180,53 @641 IT, 152,23 @641 EN, 152,23 @800, 109,23 @1280. Ogni controllo ≥44 (ricerca 18,13 → **44**, Esporta 34,84 → **44**, CTA 34,84 → **44**, Filtri **44**, chip **44**). Contratto URL invariato (asserito: le sole chiavi prodotte dal pannello sono `categoryId` e `dateFrom`). Pannello applica in **UNA** navigazione (contate le `framenavigated`). Debounce **annullato** all'apertura (test dedicato: pannello ancora aperto dopo 900 ms) e **riarmato** alla chiusura. |
| **6** `.split` + Saldi negativi | **fatto** | `.billing-split` fuori query (`1fr 1fr`) ⇒ desktop **488/488 @1280** rimisurato; dentro la query `1fr` ⇒ **319/319 @375**, **264/264 @320**, impilate. `scrollWidth <= clientWidth + 1` su entrambe a 320 **dopo** due correzioni scoperte dalla guardia stessa (v. §4). Saldi negativi: scroller conservato, 220 → **320px**, righe **44px**, link ellissato. |
| **7** paginazione | **fatto** | `.registry-pagination` riusata: prev/next **34,84 → 44** (larghezza 103,66 @375). `1 / 2 → 2 / 2` con `?categoryId=` preservato. |
| **8** redesign `ExportMenu` | **fatto** | ≤640px: **bottom sheet** `MobileSheet` (z 40), `x = 0`, `w = 375`, `inside: true`, voci **44px** e tutte `own` all'hit-test, su **tutti e dieci** i consumer misurati (billing, logbook, movements, expiries, bookings, ppr, fleet, instructors, pilots, people/{id}) — compresi i **tre** a una sola voce. >640px: popover **identico** su tutti e dieci a **641/800/1280** (diff programmatico su x, y, w, h, z, position, padding, radius, display, gap: **nessuna differenza**). Testid nuovi (`export-menu-trigger|pdf|xls|sheet`), **nessuno** dei cinque spec verdi toccato. `<a target="_blank">` dentro lo sheet con scrim: il download **parte davvero** (asserita la richiesta `format=xlsx` emessa dalla nuova scheda). |
| **9** contrasti | **fatto** | v. §5: 2,73 → **10,63**; 3,96 → **9,82**; 3,96 → **9,82**; barra 2,47 → **4,56** (e la gemella out 3,59 → **6,10**); più due esemplari **non elencati** trovati e chiusi (PDF 3,96 → 9,82, XLS **2,73** → 10,63). Tema scuro rimisurato su tutto: nulla scende. |
| **10** testid | **fatto** | Matrice asserita a **375 e 1280**: 32 singleton a 1 nodo, 7 nomi assenti a menu/sheet/pannelli chiusi, `transaction-row` e `transaction-row-mobile` a N. `grep -rn 'data-testid\^=' e2e/` rieseguito: **14 occorrenze, 9 file**, prefissi `ac-card-`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-` — **nessuno** tocca `billing-`, `transaction-`, `negative-balance-`, `export-`, `mobile-billing-` ⇒ il suffisso `-mobile` è **legale** qui. |
| **11** geometria e layering | **fatto** | Overflow di pagina **0** a 320/375/390. Nessuno scroller nascosto (eccezioni dichiarate: chip strip e KPI strip, il corpo desktop `display:none`, lo `SlideOver` CHIUSO). Nessun testo clippato senza ellissi. Contenimento dei figli della card: **0** sconfinamenti (la guardia è sul **rect**, non sullo sweep). Nessun controllo coperto dalla tab bar (blocked `[]` a 375 e 390; a 320 resta solo un hit sulla **top bar** sticky, eccezione 15.1). Sheet z40 sopra la tab bar (asserito `hit.closest('.mobile-sheet')`), pannello z50 la copre del tutto, `.mini-modal` z60 desktop-only, bottom sheet export dentro il viewport. |
| **12** guardie discriminanti | **fatto** | Tabella in §6: ognuna provata **rossa** su una simulazione del pre-fix col repo intatto. |
| **13** invarianti | **fatto** | Desktop rimisurato a 641/800/1280 su Contabilità e sugli **altri nove** consumer dell'export; `.app` grid, `.card-head`, `.students`, `.split`, `.page-head`, `docH`, `pageOverflow` identici. Nessuna dipendenza npm nuova. **Nessun token esistente cambia valore**; nessun literal di colore nuovo (il fix grafico è `color-mix` sui token, la tecnica di `.mobile-row-edge-*`). Ogni stringa nuova nei **due** locale (24 chiavi, parità 155/155 verificata). |
| **14** multi-attore | **fatto** | PILOTA/ALLIEVO/ISTRUTTORE redirect a `/it/dashboard` a **375 e 1280**, con `clearCookies()` fra le identità; "Contabilità" assente dalla tab bar e dallo sheet "Altro"; ADMIN entra. Export verificato anche su un attore **non-admin** (pilota, `/dashboard/logbook`, 375). |
| **15** debito tecnico | **fatto** | §8. |

## 3. Decisioni non ovvie

**a) `ExportMenu`: un solo nodo che cambia forma, con `MobileSheet` come telaio.** AD-4 chiede "la stessa istanza React che cambia contenitore", ma l'architettura dell'epic vieta lo switch JS: due contenitori resi insieme raddoppierebbero i nodi (e AC 8 asserisce 1 nodo per voce a 375 **e** 1280). La forma implementata è quindi: **una** `MobileSheet` a ogni larghezza, che porta con sé le classi `.popover`/`.popover-scrim` — così il popover desktop **non è riscritto**, è lo stesso CSS di sempre (nessuna duplicazione di ombra/bordo/raggio, nessun literal nuovo), e `@media (max-width:640px)` gli mette sopra la forma sheet, che vince perché `.mobile-sheet-panel` è più avanti nel file. `MobileSheet` guadagna tre prop opzionali (`className`/`scrimClassName`/`panelClassName`). Il vantaggio non è estetico: il menu entra nella famiglia di sheet dove la 15.10 metterà il focus trap **una volta sola**, invece di restare un sesto pannello fatto a mano.

⚠️ **Il desktop resta identico nella GEOMETRIA, non nel COMPORTAMENTO** — dichiarazione che mancava alla consegna (review LOW-1). Misurato: il popover >640px è ancorato esattamente come prima (`panelRight == wrapperRight == triggerRight`, 6px sotto il wrapper, su tutti e dieci i consumer a 641/800/1280, diff programmatico su `x,y,w,h,z,position,padding,radius,display,gap` senza differenze). Ma il telaio `MobileSheet` gli porta **quattro comportamenti nuovi** che il vecchio `.popover` non aveva, e valgono su **dieci** superfici desktop: (i) è un `role="dialog"` con `aria-label="Esporta"`; (ii) all'apertura il **focus si sposta nel pannello** (prima restava sul trigger) — con `preventScroll`, che è ciò che tiene ferma la pagina (§3b); (iii) **Escape chiude** il menu (prima no); (iv) il menu entra nel **registro globale "un solo sheet alla volta"** (`mobile-sheet.tsx:55`), quindi aprirlo chiude uno sheet eventualmente aperto. È con ogni probabilità un **miglioramento** e non va annullato, ma è una scelta: `MobileSheet` non ha focus trap né `aria-modal` (rimandati alla 15.10), e spostare il focus dentro un dialog **non modale** su desktop non è un no-op. Dichiarato qui perché "popover desktop identico" da solo non lo diceva.

**b) `focus({ preventScroll: true })` in `MobileSheet`.** Misurato: senza, l'apertura del menu export **faceva scorrere `.main`** su desktop (logbook/ppr −46px, movements −44, scheda persona **−461**). Uno sheet è `position: fixed` in fondo al viewport, quindi per i cinque consumer esistenti la modifica è un no-op per costruzione; per il sesto è ciò che tiene fede a "desktop invariato".

**c) Dove vive lo stato della KPI strip (AD-1).** `billing-panels.tsx` **resta un server component**; la strip tappabile è un'isola client nuova (`billing-panels-mobile.tsx`) che riceve lo **stesso** oggetto `BillingSummary` e lo formatta con lo stesso `formatCents`. Nessun ricalcolo, nessun `'use client'` sul componente intero.

**d) La KPI strip è "hero + 2", non tre colonne.** Tre valori monetari in colonne da ~101px vanno a capo su due righe *clampate* su un registro reale (`-1.216,22 €` chiede ~99px a 15px mono). Il risultato del mese è il numero per cui questa pagina si apre: prende la riga intera, liquidità e acconti si dividono quella sotto. Nessuna cella vuota, nessuno swipe per il terzo numero (il difetto che R-15.3-c aveva già corretto per la 2×2). Guadagno misurato comunque **−426,95px** sui riquadri e **−504,82** sulla prima card.

**e) I tre `<p role="status">` sul mobile.** L'assenza di doppio annuncio non è ottenuta con un `if`, ma dal **punto d'ingresso**: le due `.mini-modal` e il `<select>` inline vivono dentro il corpo desktop (`display:none` a ≤640), quindi non possono impostare quei paragrafi; le tre scritture mobile passano da `submitSheet*` e annunciano con un toast. La regola `display:none` sui `<p>` resta perché fa parte dell'opzione A ratificata e perché protegge la testata da un paragrafo che la farebbe crescere — ma è dichiaratamente **irraggiungibile per flusso**, e la sua guardia è per **iniezione DOM** (§6, riga vii-bis).

**f) La riclassifica esplicita.** Tre bottoni `aria-pressed` + un "Conferma metodo" disabilitato finché non si sceglie. La rete è la **stessa** funzione (`postReclassify`) che il `<select>` desktop chiama: cambia solo chi la invoca e dove l'esito viene annunciato.

**g) `parseAdjustAmount` estratto.** Le due facce condividono il **gate** oltre che la rete: un importo non parsabile o zero non raggiunge la rete né dalla `.mini-modal` né dallo sheet, perché la funzione è una sola.

## 4. Due difetti trovati dalle guardie di questa story (e chiusi)

1. **"Per categoria" sfondava la propria card anche DOPO l'impilamento**: 259px di contenuto in 226 a 320px (293 in 281 a **375**), tagliati dall'`overflow:hidden` della `.card` — la colonna "Netto" spariva senza che nulla lo dicesse. Chiuso con `.billing-cat-line{flex-wrap:wrap}` + ellissi sul nome di categoria (che è testo libero).
2. **"Saldi negativi" sfondava a 320**: 282 in 226, per via del cognome, un token unico non spezzabile. Chiuso con ellissi sul link (`.billing-negative-row > a`).

Entrambi erano invisibili allo sweep dell'overflow **di pagina** (che resta 0) ed entrambi sono stati trovati dall'asserzione `scrollWidth <= clientWidth + 1` dell'AC 6 e dalla `HIDDEN_SCROLLERS` dell'AC 11: è esattamente il motivo per cui la story chiede quelle due e non la prima.

## 5. Contrasti — misure nei DUE temi, con i gemelli enumerati

Metodo: canvas→WCAG, sfondo effettivo risolto **risalendo gli antenati partendo dall'elemento**, alpha letta prima della composizione, tema pilotato dal **cookie `am-theme`** (la app non guarda `prefers-color-scheme`: misurare con `colorScheme` soltanto avrebbe dato numeri identici nei due temi — errore preso e corretto in corsa).

| esemplare | dove | chiaro pre → post | scuro pre → post | soglia |
|---|---|---|---|---|
| `billing-by-category-row` valore **in** | `.stat-tone-ok` (era `var(--ok)`) | **2,73 → 10,63** | 9,3 → **9,3** | 4,5 |
| `billing-by-category-row` valore **out** | `.stat-tone-bad` | **3,96 → 9,82** | 6,61 → **6,61** | 4,5 |
| `negative-balance-row` importo | `.stat-tone-bad` | **3,96 → 9,82** | 6,61 → **6,61** | 4,5 |
| barra "in" di "Per categoria" | `.flow-bar-in` | **2,47 → 4,56** | 10,45 → **12,36** | 3,0 |
| barra "out" (era già sopra) | `.flow-bar-out` | 3,59 → **6,10** | 7,42 → **9,87** | 3,0 |
| tag **PDF** dell'`ExportMenu` *(non elencato dalla story)* | `.stat-tone-bad` | **3,96 → 9,82** | 6,61 → **6,61** | 4,5 |
| tag **XLS** dell'`ExportMenu` *(non elencato)* | `.stat-tone-ok` | **2,73 → 10,63** | 9,3 → **9,3** | 4,5 |

**Gemelli.** Il fix dei testi **non cambia** `.stat-tone-*`: ne aggiunge consumer. Enumerati e rimisurati **tutti** gli esemplari renderizzati della classe su 13 pagine × 2 temi × 2 larghezze: **218 esemplari a 1280** (min **7,58** chiaro / **6,2** scuro) e **172 a 375** (min **9,82** / **6,61**). Nessuno scende. ⚠️ Nota metodologica: una prima passata segnalava 20 esemplari a **1,65:1** in tema scuro a 1280 — sono le card mobile dentro `.billing-mobile{display:none}`, dove `.mobile-row{background:transparent}` (che vive dentro la media query) non si applica e resta lo sfondo UA del `<button>`. È un **artefatto di misura su un sottoalbero non renderizzato**: filtrando per `getClientRects().length > 0` sparisce. Riportato perché la prossima misura lo incontrerà di nuovo.

Il fix grafico `.flow-bar-*` è **additivo** e **senza literal nuovi**: `color-mix(in oklch, var(--ok|--bad) 70%, var(--ink))`, la stessa tecnica (stessi token, stessa percentuale) che `.mobile-row-edge-*` usa dalla 15.4. Nominato per la **forma** (`flow-bar`), non per la pagina, così la 15.8b può riusarlo su `.util-bar .seg` invece di prendere una seconda decisione sugli stessi token.

**Difetto pre-esistente NON chiuso, dichiarato**: il link della riga `negative-balance-row` (nome della persona) misura **3,61:1** in chiaro — è il colore globale degli `<a>` (`var(--info)`), un TD sistemico dell'app, non una superficie nuova di questa story. Fuori mandato: chiuderlo qui vorrebbe dire cambiare il colore dei link ovunque.

## 6. Regola nuova → guardia → prova di discriminanza

Ogni guardia è stata provata **rossa** simulando il pre-fix **col repo intatto** (iniezione CSS/DOM in `mobile-billing.spec.ts`, test "AC 12: le guardie sono DISCRIMINANTI" + le prove inline degli altri test).

| # | regola introdotta (per un difetto misurato) | guardia | come è stata provata discriminante |
|---|---|---|---|
| i | `.billing-desktop-body{display:none}` ≤640 | `DISPLAY_PROBE('.students') === 'none'` @375 **e** `'flex'` @1280 | iniettato `.billing-desktop-body{display:flex!important}` ⇒ la prima asserzione cade |
| ii | `.billing-mobile{display:none}` >640 (+ `.billing-kpi-row`, trigger Filtri) | `DISPLAY_PROBE('.billing-mobile')` sui due lati; conteggio `transaction-row-mobile` a 1280 | iniettato `.billing-mobile{display:none!important}` a 375 ⇒ cade |
| iii | testata mobile (11 dichiarazioni su `.billing-head >`) | **altezza** `head+strip ≤ pre-fix` nei 3 stati × 2 locale × 3 larghezze, **più** `SMALL_TARGETS() === []` | ripristinato via `addStyleTag` il padding/gap desktop e riesposti i controlli nascosti ⇒ l'altezza supera il post; ridotto il trigger Filtri a 20px ⇒ lo sweep lo trova |
| iv | pannello Filtri con draft + `cancel()` del debounce | "applica in **UNA** navigazione" (conteggio `framenavigated`) **e** "sopravvive a un debounce pendente" (pannello ancora aperto dopo 900 ms) | la seconda è rossa per costruzione senza il `cancel()`: la navigazione del debounce rimonta la console (rimonto **misurato**, §1) |
| v | ellissi su `.mobile-row-name`/`-sub`, `.billing-cat-name`, link dei saldi | `CLIPPED_WITHOUT_ELLIPSIS() === []` | iniettato `text-overflow: clip` ⇒ la lista non è più vuota |
| vi | tracce `minmax(0,1fr)` + flag su riga propria | `CHILDREN_OUT_OF_CARD() === []` (guardia sul **rect**) | spostato `.mobile-row-side` di 80px ⇒ la lista non è più vuota |
| vii | empty state mobile = 1 nodo con stringa distinta | `toHaveCount(1)` sui due empty + testi diversi | clonato il nodo con `appendChild(cloneNode(true))` ⇒ il conteggio diventa 2 |
| vii-bis | `.billing-head > .billing-feedback{display:none}` | **IMPLEMENTATA** (correzione di review LOW-2, `mobile-billing.spec.ts` test AC 12): un `<p class="billing-feedback" role="status">` viene **iniettato** nella testata — a 375 deve restare `display:none` **e** lasciare la testata alla stessa altezza (175 → 175), a 1280 lo **stesso** nodo deve essere `display:block` | la mia motivazione originale ("guardia su uno stato che il codice non può produrre") era sbagliata: iniettare uno stato che il flusso non produce è **esattamente** lo scopo dell'iniezione DOM, la stessa tecnica che (vii) usa per l'empty state. La discriminanza è nel confronto 375 vs 1280 **sullo stesso nodo**: senza la regola il ramo a 375 leggerebbe `block`, come fa 1280 |
| viii | `.billing-filter-panel .input{min-height:44px}` e `.transaction-form .input{...}` | altezze desktop dei 7 controlli dell'editor a 1280 (tutte < 44) | iniettata la **variante DISCENDENTE** `.slideover .input{min-height:44px}` ⇒ `transaction-kind` sale a ≥44: la regola ancorata non ci arriva, quella discendente sì |
| ix | nessuna regola tocca `.segmented`/`.util-*`/`.split` fuori Contabilità/`.date-input` altrove | geometria di `/dashboard/reports`, `/logbook`, `/movements`, `/bookings` a 375 confrontata con la baseline pre-fix | i valori sono **dati misurati prima** della modifica; una regola non ancorata li sposterebbe (è il difetto che 15.3 F1 e 15.5 F5 hanno misurato) |
| x | `ExportMenu` su un consumer NON toccato (`/dashboard/fleet`, una sola voce) | contenimento nel viewport + voci ≥43,5 + 1 nodo per voce a 375 e 1280 | il pre-fix è la misura registrata (`158a-C-export-pre.json`): 34,84px e popover a 180px ancorato a destra |
| xi | comportamenti invisibili a occhio | 0 richieste sugli invalidi, 409 ≠ generico, 1 sola PATCH, 1 solo `ADJUSTMENT`, 1 `reversal` + 1 `reversed` | contati con `page.route`, letti dall'**API filtrata** |
| xii | soglia dei target | **43,5** ovunque, anche dove il valore ottenuto è 44 esatto | scritta sul requisito, mai sul risultato (lezione 15.7 MINOR-1) |

## 7. Deviazioni dalla story (con motivazione)

1. **Il test del secchiello non crea la propria riga: il seed ne semina una seconda.** Il piano di test lo chiedeva, ma **nessun endpoint HTTP** può produrre una `CashMovement` senza `paymentMethod` (verificato su tutti e quattro i writer: `recordCashMovement`, `top-ups`, `completePprRequest`, `recordPayout`). `prisma/seed.ts` semina ora **due** righe non attribuite con marcatori diversi, una per consumer: `billing-global.spec.ts` continua a guardare **solo** il proprio marcatore (`'Movimento storico pre-Billing-1 (seed)'`) e a filtrare le righe per `hasText: 'Movimento storico pre-Billing-1'`, quindi resta verde e non condivide fixture con nessuno. La nuova riga vale **700 cent** in categoria "Altro" al 2019-06-16, fuori da ogni finestra di isolamento; nessuno spec asserisce `unattributedCents`/`Count` in valore assoluto (verificato con grep). I due test mobile che la consumano hanno la stessa `test.skip` guardata sul proprio marcatore, con la stessa motivazione accettata dalla review Billing-2 F4/F5.
2. **Il fix dei contrasti tocca due esemplari non elencati** (i tag PDF/XLS dell'`ExportMenu`, 3,96 e **2,73** in chiaro). Sono testo su una superficie che questa story **trasforma in sheet**, e AC 13 chiede di enumerare gli esemplari delle superfici nuove senza fidarsi dell'elenco. Fix con la stessa classe già in casa; il nome accessibile dei link non cambia, quindi i cinque spec verdi non se ne accorgono (verificato: verdi).
3. **`MobileSheet` guadagna tre prop e un `preventScroll`.** È l'unica via per riusare davvero la primitiva (R-15.8a-h) senza JS switch e senza secondo albero; `preventScroll` è ciò che tiene il desktop invariato (§3b). I cinque consumer esistenti sono `position: fixed` a schermo pieno: la modifica è un no-op per costruzione e la suite completa lo conferma.
4. **La parità dei tre KPI è asserita nello STESSO render**, non fra due `page.goto`. Prima stesura: leggevo i riquadri a 1280 e i KPI a 375 — **flaky misurato** (8.215,17 → 8.138,17 fra i due caricamenti) perché `getBillingSummary` è un aggregato **globale** e sotto `fullyParallel` un altro worker scrive. È la trappola che il piano di test vieta esplicitamente; corretta leggendo entrambi dal DOM della stessa pagina (i riquadri sono `display:none` a 375 ma il `textContent` c'è).
5. **Otto controlli del `TransactionEditor` portati a 44px** (AC 15 b lo ammette e raccomanda): i sei `.input` del form e il trigger calendario a 36 (stessa scelta che la 15.7 ha fatto per i propri pannelli: il bottone vive **dentro** la casella da 44). Restano sotto soglia la ✕ dello `SlideOver` (32×32) e le opzioni del typeahead (36) — sono del **telaio** condiviso da 11 consumer, TD (k), dichiarati e non chiusi.
6. **Tre gruppi di dichiarazioni CSS fuori dalla media query** oltre alle due previste da R1: (i) i `display:none` dei due alberi mobile e del trigger Filtri; (ii) `.billing-split`; (iii) le tre dichiarazioni che erano **inline** (`.billing-filter-range`, `.billing-search`, `.billing-negative-list`) più `.export-menu-panel{min-width:180px}` e le due righe del telaio `ExportMenu`; (iv) `.flow-bar-*`, che è un fix di contrasto valido a **ogni** larghezza (AC 9 lo impone: «il fix vale desktop e mobile»). Tutte dichiarate qui, tutte con desktop rimisurato.

## 8. Debito tecnico — voce per voce

| TD | esito | misura |
|---|---|---|
| (a) `OPTIONS_PAGE_SIZE = 100` | **subìto e dichiarato** | 100 opzioni iniziali al solo picker persona del `TransactionEditor`, che ha il typeahead server-side: degrada la comodità, non la funzione |
| (b) otto controlli dell'editor sotto 44 | **chiuso per sei**, subìto per due | i sei `.input` a **44** e il trigger calendario a **36** su mobile; desktop rimisurato a 1280 (36 / 36,84 / 34,84 / 36 / 38,84 / 36,84 / 34,84, invariati). ✕ dello `SlideOver` **32×32** e opzioni typeahead **36**: TD (k), telaio condiviso, **non** chiusi |
| (c) voci dell'export a 53,7/35px | **CHIUSO** | 44px su tutti e dieci i consumer a 375 |
| (d) popover fuori dal viewport | **CHIUSO** | `x = −29,09 → 0` su Contabilità **e** su Prenotazioni (secondo caso, non elencato) |
| (e) `.split` inline | **CHIUSO** | `.billing-split`, desktop 488/488 invariato |
| (f) contrasti | **CHIUSO** (7 esemplari: 5 previsti + 2 trovati) | §5 |
| (g) `.search` `cw 188 / sw 190` | **subìto** sul desktop; su mobile la casella è full-width e il difetto non si presenta |
| (h) campo pilota desktop 18,13px | **subìto e dichiarato** (fuori mandato: è il desktop) |
| (i) `.so-sub` a `--ink-4` (3,66:1) | **subìto e dichiarato**: `TransactionEditor` passa un sottotitolo ("Contabilità"). Il fix dell'AC 9 non lo copre (è un token del telaio `SlideOver`, 11 consumer) e allargarlo sarebbe fuori mandato |
| (j) `billing.spec.ts:296` delta-assert globale | **aggravato IN POTENZA, dichiarato** — riga corretta dopo la review (MINOR-3). La dichiarazione precedente ("non aggravato") era vera su **metà** del requisito: nessun test nuovo **asserisce** un aggregato globale con uguaglianza (§7 deviazione 4), ma l'AC 15 (j) vieta anche di **CREARE denaro** fuori dalla catena, e questo spec ne crea — nel project `chromium` `fullyParallel`: **4 ricariche** (`recordTopUp` 15.000 + 9.000 + 12.000 + 20.000 = **56.000 cent**, che muovono `deposits.totalCents`, cioè **proprio** l'aggregato che `billing.spec.ts:341` confronta con uguaglianza), **10 chiamate `recordCashMovement`** (una da 21 righe per la paginazione: ~28 movimenti per run), **1 rettifica** (−2.500) e **1 storno**. **Causalità NON provata, e va detto**: nell'arbitro della review il flaky è caduto proprio lì (`depositsTotal` +5.000 invece di +10.000), ma quel test è documentato flaky **2 run su 2** in `billing.spec.ts:290-292`, ha già flakato nell'arbitro **15.7** (prima che questa story esistesse) e il delta mancante non corrisponde a nessuna fixture di `mobile-billing.spec.ts`. Rischio **residuo** accettato dal PO; il rimedio strutturale resta quello che il TD (j) registra (delta a finestra breve, o project serializzato), non preso qui. Il fix di review **non aggiunge una sola scrittura**: le tre asserzioni di focus di MINOR-2 vivono dentro test che quelle fixture le creavano già, e la guardia dei link "Saldi negativi" gira su una riga **iniettata nel DOM** proprio per non creare un saldo negativo vero |
| (k) `account-section.tsx` non responsive | **fuori scope** (15.9), ma monta lo stesso `ExportMenu`: misurato a 375 (sheet a x=0, voci 44, un nodo per voce) e a 1280 (popover identico) |
| (l) `viewport-fit=cover` mai dichiarato | **subìto** (TD di epic, 15.10): gli `env(safe-area-inset-*)` valgono 0 |
| **nuovo (m)** | il link `negative-balance-row > a` misura **3,61:1** in chiaro — colore globale degli `<a>`, TD sistemico, fuori mandato (§5) |
| **nuovo (n)** | la baseline della testata Contabilità è **sensibile ai dati** (il `<select>` categorie): chi la rimisura con poche categorie ottiene 222,66 invece di 265,66 (§1 correzione 2) |

## 9. Esito della suite (onesto)

- `npm run gates`: **PASS lint / PASS typecheck / PASS test (1739) / PASS build**, ripetuto a ogni passo intermedio; ultimo run verde prima della consegna.
- Unit nuovi: `src/lib/mobile-billing.test.ts`, **15 test**, verdi anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` (nessun `@/lib/env` trascinato).
- Spec nuovo `e2e/mobile-billing.spec.ts`: **26 test**. Ultimo run mirato su build di produzione: **24 passed, 2 skipped, exit 0** — i due skip sono i test del secchiello, la cui fixture di seed era stata consumata dal run precedente sullo stesso DB (modello di consumo dichiarato; su DB fresco girano, ed è successo al primo run).
- Blast radius mirato su DB fresco (`mobile-billing` + `billing` + `cash-register` + `cash-report` + `account-adjustments` + `exports` + `pdf-exports` + `movements`): **80 passed** più il solo fallimento di una mia asserzione troppo rigida (conteggio `.util-bar`, dipendente dai dati), corretta e riverificata verde.
- **Gate finale**: suite completa `CI=1` su build di produzione e **DB fresco** (`docker compose down -v` → `up` → `migrate deploy` → `db seed`), lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status`:

  ```
  1 flaky
    [chromium] › e2e/flights.spec.ts:602:7 › … ratifica R-14.3-a
  430 passed (10.5m)
  E2E_EXIT=0
  ```

  **430 passed + 1 flaky = 431**, cioè i **405** della baseline 15.7 più i **26** nuovi. Tutti e 26 i test di `mobile-billing.spec.ts` sono girati (nessuno skip: su DB fresco entrambe le fixture del secchiello ci sono) e `billing-global.spec.ts` ha consumato la **sua**, restando verde.

  **Il flaky non è di questa story, con la prova**: `flights.spec.ts:602` fallisce su `POST /flights` con **422** alla creazione della fixture — prima ancora che la UI entri in scena — e passa al retry. È il percorso `registerFlight` (gate scadenze/profilo), non tocca né la Contabilità, né l'`ExportMenu`, né una sola riga di CSS di questa story; la stessa classe di flake è già registrata dagli arbitri 15.6/15.7. Verificato inoltre che il file non condivide fixture con `mobile-billing.spec.ts` (persone e categorie sono run-unique da entrambe le parti).

## 10. Nota di tensione per la 15.8b — riscritta dopo la review (LOW-3): dove vive `.flow-bar-*` e come si riusa DAVVERO

La barra "Per categoria" **non condivide** il token con `.util-bar .seg` attraverso una classe: qui era uno **stile inline** con `var(--ok)`/`var(--bad)`, là è `.util-bar .seg.flown` (`airops.css:874`) con gli stessi due token. Il difetto è lo stesso (**2,47:1** in chiaro in entrambi i casi), il punto di applicazione no. La decisione presa **una volta sola** è la coppia `.flow-bar-in`/`.flow-bar-out`, nominata per la **forma** e non per la pagina.

**Dove vive adesso.** Accanto a `.stat-tone-*`, nel blocco `/* ---------- flow-bar (story 15.8a, R-15.8a-i) ---------- */` subito dopo i tre override `html[data-theme="dark"] .stat-tone-*` — non più in coda al blocco mobile di questa story. Motivo (review LOW-3, decisione PO): è un rimedio di contrasto **token-level valido a ogni larghezza**, il gemello dichiarato del rimedio per i **testi**, e chi cercherà la medicina per un oggetto grafico la cercherà lì, non dentro un blocco mobile per-story. Lo spostamento è un **MOVE**: zero cambi di valore, rimisurato pre/post con lo stesso metodo (canvas→WCAG, cookie `am-theme`, `getClientRects().length > 0`) — `flow-bar-in` **4,56** chiaro / **12,36** scuro e `flow-bar-out` **6,10** / **9,87** *prima e dopo*, con il `background` calcolato identico alla cifra (`oklch(0.529998 0.0876005 154.995)` e `oklch(0.488004 0.129589 25.0064)` in chiaro) a **375 e 1280**; i gemelli di testo restano 10,63 / 9,82 (chiaro) e 9,3 / 6,61 (scuro). Desktop rimisurato pre/post: `.billing-head` **109,23** @1280 · **152,23** @800 · **180,53** @641 IT, `.students` 990/990 · 678/988 · 519/988, `.billing-split` **488/488**, `.page-head` 51,44, `pageOverflow` 0, e il link dei saldi negativi **18,13 in entrambi** (il pavimento dei 44px è dentro la media query, il desktop non lo vede).

**Come si riusa davvero** — la promessa precedente ("la 15.8b riusa quelle due classi su `.util-bar .seg`") era **imprecisa sulla meccanica CSS**, e va letta così: `.util-bar .seg.flown` ha specificità **(0,3,0)**, `.flow-bar-in` ha **(0,1,0)**. Aggiungere la classe al `<div class="seg flown">` **non cambierebbe nulla**: vince la regola esistente. Il riuso corretto è un selettore **alla pari** — `.util-bar .seg.flow-bar-in{ background: color-mix(…) }`, che rimanda alla stessa decisione — oppure togliere il `background` da `.seg.flown` e lasciare che sia la classe di forma a portarlo. Quello che la 15.8b **non** deve fare è prendere una seconda decisione di colore sugli stessi due token.

## 11. Cosa NON ho fatto

- Non ho toccato `/dashboard/reports` né `/dashboard/settings` (superfici della 15.8b): le uniche misure lì sono guardie di non-regressione.
- Non ho toccato API, schemi Zod, servizi, il calcolo dei riquadri, `getLedgerRevenueCents`, `ledgerClubAmountCents`, il ciclo di vita di `CashCategory`. **Nessuna modifica server** oltre alla seconda riga di seed (dato di test).
- Non ho riscritto nessuno dei cinque spec verdi dell'export, né `billing-global.spec.ts`.
- Non ho aggiunto focus trap, `aria-modal`, `viewport-fit=cover` né la riserva sticky (15.10).
- Non ho corretto i difetti pre-esistenti non ratificati (`.search` 188/190, campo pilota desktop, taglio senza ellissi delle celle `.student-row`, colore globale dei link).
- **Non ho committato**: il repo è lasciato con le modifiche in working tree.

## 12. File toccati

**Nuovi**
- `src/lib/mobile-billing.ts` — le cinque derivazioni pure (AD-6), che riusano `joinSegments`
- `src/lib/mobile-billing.test.ts` — 15 unit
- `src/app/[locale]/dashboard/billing/billing-panels-mobile.tsx` — la KPI strip tappabile e i tre sheet
- `e2e/mobile-billing.spec.ts` — 26 test

**Modificati**
- `src/app/[locale]/dashboard/billing/billing-console.tsx` — testata mobile, albero card, sheet + tre `secondStep`, pannello Filtri, `.billing-split`, `.billing-negative-list`, i due fix di contrasto della card "Per categoria" e dei saldi negativi, rete condivisa (`postAdjust`/`postReverse`/`postReclassify`, `parseAdjustAmount`)
- `src/app/[locale]/dashboard/billing/billing-panels.tsx` — monta l'isola client mobile, resta server component
- `src/app/[locale]/dashboard/billing/page.tsx` — le 24 stringhe nuove
- `src/app/[locale]/dashboard/billing/transaction-editor.tsx` — classe `.transaction-form` (ancoraggio del 44px mobile)
- `src/components/ui/export-menu.tsx` — telaio `MobileSheet`, testid, contrasto dei due tag
- `src/components/ui/mobile-sheet.tsx` — tre prop di classe opzionali, `focus({preventScroll:true})`
- `src/styles/airops.css` — blocco `contabilità mobile + export menu (story 15.8a)` (+276 righe)
- `messages/it.json`, `messages/en.json` — `BillingPage.mobile.*` (24 chiavi per locale, parità 155/155)
- `prisma/seed.ts` — seconda riga non attribuita, una per consumer

---

## 13. Fix di review (2026-08-05, fix-subagent Opus 5 xhigh) — 3 minor + 4 low chiusi

Decisioni PO ratificate il 2026-08-05 sul report `15-8a-review-report.md`. Nessun commit: la consegna è il codice + questo aggiornamento.

| finding | esito | dove |
|---|---|---|
| **MINOR-1** — i 61 link di "Saldi negativi" a 18,13px, e la guardia che li escludeva senza dirlo | **chiuso** | `airops.css` (media query, `.billing-negative-row > a`: `min-height: 44px; line-height: 44px`) + `e2e/mobile-billing.spec.ts` (l'esclusione `.billing-negative-list` **sparisce** da `SMALL_TARGETS`; il doc-comment dichiara le due esclusioni residue **e** i due trigger calendario a 36, decisione PO linea 15.7). Misurato: **18,13 → 44** a 320/375/390, ellissi conservata (`display` resta `block`: un `inline-flex` avrebbe reso il testo un item anonimo e `text-overflow` avrebbe smesso di applicarsi), desktop **18,13 invariato** |
| **MINOR-2** — il ritorno di focus dal `secondStep` copriva 1 ramo su 3 | **chiuso** | `billing-console.tsx`: `sheetPrimaryRef` → **tre** ref (`sheetAdjustActionRef`/`sheetReclassifyActionRef`/`sheetReverseActionRef`) + `sheetMethodRef` + `sheetPreviousStepRef`; l'effetto legge lo step che si sta **lasciando** e rimette il focus sul bottone che lo aveva aperto, qualunque sia il ramo o la combinazione di azioni visibili. In più: **entrando** nella riclassifica il focus va al primo bottone di metodo (prima cadeva su `<body>` come all'uscita: era lo stesso `else` rotto) |
| **MINOR-3** — dichiarazione TD (j) falsa a metà | **corretta** (nessun codice) | §8 riga (j) |
| **LOW-1** — il desktop dell'`ExportMenu` cambia comportamento, non geometria | **dichiarato** | §3a, capoverso finale |
| **LOW-2** — la guardia (vii-bis) dichiarata non implementabile | **implementata** | §6 riga vii-bis + test AC 12 |
| **LOW-3** — dove vive `.flow-bar-*` e la meccanica del riuso | **spostata + corretta** | `airops.css` (accanto a `.stat-tone-*`) + §10 |
| **LOW-4** — i due trigger calendario a 36px | **coperto da MINOR-1** (decisione PO: restano 36, l'esclusione è ora **dichiarata** nel doc-comment della guardia) | `e2e/mobile-billing.spec.ts` |

**Guardie nuove, tutte provate rosse sul pre-fix** (metodo 15.5 §12: `git stash push -- src/` con lo spec al suo posto, **rebuild**, run; poi `stash pop`, rebuild, run):

```
PRE-FIX  (src a HEAD, spec fixato)   4 failed / 22 passed  E2E_EXIT=1
  · AC 3 storno      → transaction-reverse-action-mobile "inactive" dopo "Indietro"   (MINOR-2)
  · AC 3 riclassifica→ transaction-reclassify-method-mobile-CASH "inactive" entrando  (MINOR-2)
  · AC 5             → SMALL_TARGETS = 3 nodi a 18,13 (erano esclusi)                 (MINOR-1)
  · AC 12            → idem dentro il blocco (vi)                                     (MINOR-1)
POST-FIX (src fixato)                26 passed             E2E_EXIT=0
```

- Il ramo **ACCOUNT** del focus non fallisce sul pre-fix, ed è giusto così: era l'unico coperto. È asserito lo stesso (regressione).
- Le tre asserzioni di focus vivono **dentro test esistenti** (rettifica-invalidi, storno, riclassifica) e la guardia dei link gira su una riga **iniettata**: il fix non aggiunge **nessuna** scrittura di denaro al project parallelo (v. TD (j) corretto).
- `npm run gates` verde dopo il fix: `PASS lint / PASS typecheck / PASS test 1739 / PASS build`.

# Review Record — 15.8a (reviewer adversarial Opus 5 xhigh, fix-subagent Opus 5 xhigh — 2026-08-05)

Report integrale della review: `15-8a-review-report.md`.
Verdetto: **SHIPPABLE-WITH-FIXES** — **0 Major**, 3 Minor, 4 Low (terzo ciclo su quattro senza major).
Fix in `2e50615` (+ §13 "Fix di review" nel Dev Agent Record).

## Arbitro della review (pre-fix)

`CI=1` su build di produzione, DB fresco: **E2E_EXIT=0 — 430 passed + 1 flaky (10.6m)** su 431
(405 + 26 nuovi, TUTTI e 26 girati, zero skip). Il flaky NON era quello dichiarato dal dev ma
`billing.spec.ts:296` — il TD (j) già registrato. Gates verdi (1739 unit).

**Il nucleo contabile ha retto l'attacco dal vivo**: prospettiva club provata su TRE facce
(card mobile = cella desktop = **xlsx letto con exceljs**); `ledgerClubAmountCents` importata,
zero duplicati; secchiello gated sul COUNT provato col caso patologico **+903/−903 →
"Non attribuiti (2) · 0,00 €"**; il SEED a due righe marcate (deviazione 1) verificato
idempotente, consumato una riga per spec, fuori da ogni finestra di periodo, senza asserzioni
assolute nel repo; ExportMenu su **10 consumer** (la story ne diceva 9 — correzione del dev
giusta) con bottom sheet dentro il viewport a 375 e desktop geometricamente identico; KPI
parity nello stesso render; race/replay/409 delle scritture contabili sani (PATCH concorrente
200/200 last-write-wins: pre-esistente server-side, osservazione non finding).

## Findings → esito

| # | Sev | Difetto | Esito |
|---|---|---|---|
| MINOR-1 | minor | i **61 link** di "Saldi negativi" a 18,13px (AC 6 chiedeva ≥44) con la guardia `SMALL_TARGETS` che li ESCLUDEVA senza dichiararlo — un'esclusione non dichiarata è una guardia che mente | **decisione PO: 44px** — `min-height/line-height: 44px` (NON l'idioma inline-flex della riga accanto: avrebbe rotto l'ellissi, motivato nel commento); l'esclusione sparisce dalla guardia, le due residue + i calendari 36×36 sono DICHIARATI nel doc-comment. Rossa sul pre-fix (3 × 18,13) |
| MINOR-2 | minor | uscendo da un `secondStep` su riga CASH il focus cadeva su `<body>` (il difetto 15.2 F1 "risolto" solo su 1 ramo su 3) | tre ref per-step + ritorno sul bottone che ha APERTO lo step, per ogni ramo; scoperta ed estesa anche all'INGRESSO della riclassifica su riga CASH (stesso else rotto); guardie sui rami mancanti con lettura letterale di `document.activeElement`, rosse sul pre-fix (`Received: inactive`) |
| MINOR-3 | minor | record §8: TD (j) dichiarato "non aggravato" ma lo spec CREA denaro nel project parallelo (56.000 cent + ~28 movimenti/run) | **decisione PO: dichiarazione corretta** — aggravato IN POTENZA, causalità del flake non provata (pre-esistente 2/2), rimedio = TD (j); il fix di review non aggiunge scritture |
| LOW-1 | low | il redesign ExportMenu cambia il COMPORTAMENTO desktop (role=dialog, focus, Escape, one-sheet) a geometria identica: non dichiarato | dichiarato nel record §3a come scelta (focus trap/aria-modal restano a 15.10) |
| LOW-2 | low | guardia (vii-bis) dichiarata "non implementabile" — la review l'ha implementata per iniezione | adottata (iniezione del `<p>` → none@375/block@1280), tabella §6 corretta con l'autocritica del dev |
| LOW-3 | low | `.flow-bar-*`: nome giusto ma collocazione sbagliata e promessa di riuso IMPRECISA (`.util-bar .seg.flown` a specificità 0,3,0 batte 0,1,0) | **decisione PO: spostare + correggere ora** — MOVE accanto a `.stat-tone-*` con pre/post identici al centesimo di contrasto nei due temi; §10 riscritta con la meccanica reale per la 15.8b (`.util-bar .seg.flow-bar-in`, non il riuso letterale) |
| LOW-4 | low | trigger calendario annidati a 36×36 | **decisione PO: restano 36** (linea 15.7, primitiva condivisa → sweep 15.10), dichiarati nella guardia |

## Ratifiche PO sopraggiunte in review (3, 2026-08-05)

1. **MINOR-1/LOW-4 → link a 44px subito, calendari restano 36** dichiarati.
2. **LOW-3 → `.flow-bar-*` ricollocata e §10 corretta ORA**, prima che la 15.8b la erediti sbagliata.
3. **MINOR-3 → dichiarazione corretta**, nessun cambio di codice (causalità non provata).

## Verifiche del fix

Gates verdi (1739 unit). Discriminanza per stash+rebuild: pre-fix **4 failed / 22 passed**
(i due rami di focus `Received: inactive`, i 3 link a 18,13 su due AC), post-fix **26 passed
(29.3s), exit 0**. Spostamento `.flow-bar-*`: contrasti identici al centesimo nei due temi,
desktop rimisurato su 6 superfici. Guardia nuova (vi-bis) per iniezione DOM sulla lista
saldi negativi (la card è gated su una condizione globale non costruibile senza scrivere denaro).

## Gate finale

- Arbitro finale, `CI=1` su build di produzione, DB fresco, stato committato: **430 passed + 1 flaky (9.8m), E2E_EXIT=0 — il flaky e'`billing.spec.ts:296`, il TD (j), non attribuibile**
- `npm run gates`: **verde** (lint, typecheck, 1739 unit, build)

## TD (in `sprint-status.yaml`)

- TD (j) confermato col perimetro vero (lo spec nuovo crea denaro nel parallelo — aggravato in
  potenza, rimedio strutturale invariato).
- Calendari annidati 36×36 e ✕/typeahead delle primitive → sweep 15.10 (classe già tracciata).
- `PATCH /cash-movements/{id}` senza guardia di concorrenza (200/200 last-write-wins,
  pre-esistente server-side, osservazione della review).
