---
baseline_commit: accfd2f
---

# Story 15.8b: Statistiche + Impostazioni mobile — i grafici che reggono 375px senza mentire, le liste da 145 righe con un cap dichiarato, le sette card di configurazione con le azioni raggiungibili con un dito, e `reports.spec` che entra in catena

Status: **approved — ratifiche PO R-15.8b-* TUTTE chiuse (2026-08-05), pronta per il dispatch al dev**

> **Split e ordine**: questa story nasce dallo SPLIT ratificato dal PO sulla Q1 del draft 15.8. La 15.8b possiede **Statistiche** (`/dashboard/reports`) e **Impostazioni** (`/dashboard/settings`). La story gemella **15.8a** (Contabilità + redesign `ExportMenu`) **si sviluppa PRIMA** ⇒ quando questa story parte, sono già consegnati e **si riusano come precedenti**: (i) il **nuovo `ExportMenu`** a bottom sheet ≤640px (nessuna delle due superfici di questa story lo monta — v. §c.3 — ma la sua grammatica è il riferimento per "un elenco di scelte sale dal fondo"); (ii) il **KPI tappabile → sheet** di R-15.8a-c; (iii) l'eventuale **fix token-level dei contrasti** dell'AC 9 della 15.8a, che **si eredita e non si ridecide** (v. R-15.8b-e). Chi implementa la 15.8b **non deve** riaprire le decisioni della 15.8a, ma **deve** partire da una baseline rimisurata sul repo che la 15.8a ha lasciato.

## Ratifiche PO (chiuse 2026-08-05 — decisioni riportate VERBATIM; l'appendice in fondo porta il fatto misurato, le opzioni e la motivazione di ciascuna)

| R | Q | Decisione PO (verbatim) |
|---|---|---|
| R-15.8b-a | Q1 | **SPLIT**: 15.8a = Contabilita' + redesign ExportMenu; 15.8b = Statistiche + Impostazioni. |
| R-15.8b-b | Q8 | **A**: grafici INVARIATI; liste da 145 righe con cap client-side DICHIARATO ("prime N · Mostra tutte", pattern 13.4). Nessun cambio API. |
| R-15.8b-c | Q9 | **A**: KPI Statistiche = strip invariata (4 o 5, nessun ramo). |
| R-15.8b-d | Q10 | **A**: Impostazioni tutto in pagina; le 3 tabelle → card+sheet con azioni SOLO nello sheet, "Elimina" = secondStep, 409 "in uso" a toast; e2e che prova il 422 FLIGHT_BLOCKED_BY_EXPIRY da un tipo creato DAL TELEFONO. |
| R-15.8b-e | Q12 (parte grafici) | **TUTTO ORA (non la raccomandazione)**: TUTTI e sette i contrasti si chiudono in queste story — i due testi con .stat-tone-\*, gli OGGETTI GRAFICI (barre categoria 2,47, .util-bar .seg, fasce mix 2,04-2,73) e .chart-label 3,66 con fix token-level MISURATI nei due temi. Assegna ogni contrasto alla story che possiede la superficie (byCat\*/negBalance/barre → 15.8a; fasce mix/.chart-label → 15.8b). ATTENZIONE: i fix token-level toccano i temi — l'AC deve imporre la misura dei GEMELLI su tutte le superfici che usano quei token (lezione 15.3), nei DUE temi, con desktop rimisurato. |
| R-15.8b-f | Q13 | **TUTTO reports.spec IN CATENA (non la raccomandazione)**: l'intero `reports.spec.ts` migra nella catena serializzata di playwright.config.ts — chiude il TD annoso del PUT scheduling globale e la time-dependency della suite. L'AC deve imporre: posizione nella catena motivata, run locale `--no-deps` funzionante, il ripristino delle settings che lo spec scrive, e la misura del costo in durata della suite (prima/dopo). Story: 15.8b (possiede reports). |

⚠️ **Lettura obbligata di R-15.8b-e** (dichiarata qui perché il dev non la restringa né la duplichi): gli esemplari di competenza di questa story sono **tre** — `.util-bar .seg` (**2,47**, oggetto grafico, **4 consumer**: le due liste di `reports-console` + i due `RankBars`), le **quattro fasce** di "Composizione movimenti" (**2,73 / 2,04 / 4,85 / 3,61**, di cui **due sotto il 3:1**), e **`.chart-label`** (**3,66**, che è **testo** ⇒ soglia 4,5). Gli altri quattro (`billing-by-category-row` in/out, `negative-balance-row`, barra "in" di "Per categoria") sono della **15.8a**. ⚠️ **Se la 15.8a ha già introdotto un token/una classe per gli oggetti grafici sotto soglia, questa story lo RIUSA**: due decisioni per lo stesso token sono vietate (lezione 15.3). Il dev **verifichi sul repo consegnato dalla 15.8a** che cosa esiste già, prima di scrivere una riga di CSS.

## Story

As a amministratore che guarda i numeri del club e configura l'aviosuperficie dal telefono,
I want leggere le statistiche senza una pagina alta **21.485px** (26 schermate di scroll, di cui due card da **9.356** e **9.398px**) e amministrare le impostazioni senza inseguire **201 bottoni da 24,7px** che stanno **fuori dallo schermo a destra**,
so that le ultime due superfici amministrative dell'app diventano usabili su un telefono **senza cambiare una sola regola** delle statistiche (aggregati Rome-month, `topPilots` capped a 10 lato server, `fleetUtilization` omesso se non configurabile) o della configurazione (validazione scheduling, ciclo di vita tesoreria, catalogo `ExpiryType` col legame `blocksBooking` → guardie 7.4/14.4).

E, come debito di suite: **chiudere il TD annoso del `PUT /settings/scheduling` globale** che `reports.spec.ts` esegue da un project `fullyParallel` — la sorgente di flakiness che la 15.4 ha aggravato e che colpisce Pianificazione, voli e prenotazioni.

---

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)`, **tranne** la riga `display:none` fuori-query degli alberi mobile), **R2** (il template è incompleto **by design, e su queste due schermate lo è più che mai**: v. §a.0 — non ha grafici temporali, KPI, toggle di periodo, composizione movimenti, riga istruttori, toggle di metrica; e per le Impostazioni disegna **un catalogo in sola lettura**, senza "Aggiungi", senza Modifica/Disattiva/Elimina, senza `scope`, senza `blocksBooking`, e senza **sei** delle sette card reali), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e azione primaria fissa in basso), **R4** (si porta TUTTO: nessuna superficie resta "tabella desktop scrollabile in orizzontale" come stato finale — ed è lo stato di oggi sulle **tre** tabelle di Impostazioni, misurato in §a.2), **R5** (logout/lingua già nel menu profilo, 15.1 — non si toccano; ⚠️ il segmented "Tema" del template esiste già lì, e il segmented "Ruolo" = "Accedi come" **non è implementabile**: non si portano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (15.1, in CLAUDE.md): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**. ⚠️ **Regola AD-5 della 15.5**: il suffisso `-mobile` è **illegale** dove esiste un selettore `^=` sul nome desktop. **Verificato per il draft 15.8** (`grep -rn 'data-testid\^=' e2e/`, 2026-08-04 — **14 occorrenze**, 9 file): i prefissi in uso sono `ac-card-`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`. **Nessuno tocca `reports-`, `club-`, `scheduling-`, `smtp-`, `treasury-`, `rating-`, `ratings-`, `medical-`, `cash-categor-`, `airfield-`** ⇒ il suffisso `-mobile` è **LEGALE** qui. ⚠️ **MA la Statistiche ha quattro famiglie di testid COMPOSTI con un valore di dominio** — `reports-fleet-row-{registration}`, `reports-instructor-row-{name}`, `reports-rank-aircraft-row-{registration}`, `reports-rank-pilot-row-{name}` (`reports-console.tsx:63/68/116/172`), letti **page-level** da `reports.spec.ts:255-260`: un albero mobile che li riusa dà **due nodi per lo stesso id** a 1280px e rompe lo strict mode. La verifica va **rifatta dal dev** (anche perché la 15.8a ha nel frattempo aggiunto testid nuovi) e riportata nel record.

**Le lezioni fresche (15.5/15.6/15.7) che questa story può violare davvero**:

1. **L'asimmetria del remount decide la semantica dei controlli** (15.7 D1/LOW-1). **Misurata qui, ed è di nuovo asimmetrica**: `reports/page.tsx` non ha una console con stato di filtro (il periodo è **due `Link` server-side**, `:110-127`) **ma** `RankBars` tiene il proprio `metricIndex` in stato locale (`rank-bars.tsx:49`) **che sopravvive** perché non c'è `key`; `settings/page.tsx` monta **sette card indipendenti**, ognuna col proprio stato non controllato e **nessun `key`** ⇒ **niente si rimonta mai**, e un pannello/sheet mobile che ospitasse il form di una card ne erediterebbe lo stato per sempre. **Va misurato su entrambe**, non dedotto.
2. **Le guardie si scrivono sul REQUISITO, mai sul valore ottenuto** (15.7 MINOR-1: soglia 19.5 su un target da 20). Qui il pavimento è **44** e la soglia dello sweep è **43.5**, sempre, su ogni superficie nuova — e va scritta anche dove il valore ottenuto è più alto.
3. **`text-overflow: ellipsis` nasconde gli sfondamenti allo sweep** (15.5 F1/§12): serve una guardia di **CONTENIMENTO sul rect** per ogni oggetto che può crescere — qui il nome del tipo di scadenza, il sub con `scope`/validità, il nome della categoria, il valore mono delle liste ranked.
4. **Parità informativa enumerata contro TUTTO ciò che il desktop apre dalla riga** (15.5 F2): le righe delle tre tabelle di Impostazioni portano **4-5 colonne** e **quattro** azioni (Modifica, Disattiva/Riattiva, Elimina — quest'ultima con conferma inline, e **assente** sulle categorie di sistema).
5. **Il criterio "testata ≤ pre-fix mantenendo i 44px" va verificato con l'ARITMETICA prima di prometterlo** (15.6 R-15.6-e, 15.5 F3): qui vale per le **sette `.card-head`** di Impostazioni (misure in §a.2, **sensibili al locale**) e per la `.page-head` delle Statistiche (**104,83** a ≤640).
6. **La KPI 2×2 costa altezza** (15.7: 97,7px, prima card 567 → 609): R-15.8b-c chiude la questione (**strip invariata**), ma la misura resta il metro di ogni scelta su una pagina alta 21.485px.

**Fonte visiva**: template `AirOps Mobile.dc.html` (+ `data.js`) — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/AirOps-Mobile.dc.html`. Lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de` (i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezioni in scope: **righe 337-368 — `Admin · Statistiche`**; **righe 370-397 — `Admin · Impostazioni`**.

---

## Ricognizione (2026-08-04, teammate story — verificata su file, righe e **misure a runtime** su build di produzione `npm run start`, DB reale post-suite: **145 velivoli attivi nelle statistiche, 43 tipi `RATING` + 4 `MEDICAL`, 21 categorie di cassa (20 attive), 35 istruttori con compenso**. Il dev la **verifichi e CORREGGA** se sbaglia — e la **rimisuri sul repo consegnato dalla 15.8a**: la prassi ha pagato in 15.1-15.7)

### a.0) Che cosa dice il template — e quanto poco è (R2 al massimo grado)

| schermata | righe | cosa disegna | cosa NON disegna |
|---|---|---|---|
| **Admin · Statistiche** | 337-368 | testata; card **"Ore per aeromobile"** (righe `64px 1fr auto`: label mono 11px/600, barra **8px** su `--bg-sunken` con riempimento `--info`, ore mono 10.5 `--ink-2`); card **"Top piloti del mese"** (righe `1fr auto auto`: nome ellissato, ore mono, ricavo mono/600, `slice(0,6)`) | **nessun grafico temporale** (né linee né barre), nessun KPI, nessun toggle mese/anno, nessuna composizione movimenti, nessuna riga istruttori, nessun toggle di metrica |
| **Admin · Impostazioni** | 370-397 | testata; card "preferenze" con **due segmented** (Tema, Ruolo); card **"Tipi di abilitazione"** (righe `flex justify-between`: nome 12.5/500 + sub mono 10.5 `--ink-3` = `N mesi` / `senza scadenza`) | ⚠️ **il catalogo è in SOLA LETTURA**: nessun "Aggiungi", nessun Modifica/Disattiva/Elimina, nessun form, nessuno `scope`, nessun `blocksBooking`, nessuno stato attivo/inattivo. E **nessuna** delle altre sei card reali (Club, Pianificazione, SMTP, Tesoreria, Visite mediche, Categorie di cassa). Il segmented "Ruolo" è **"Accedi come"**, che il piano dichiara NON implementabile; il segmented "Tema" esiste già nel menu profilo (15.1) |

**Conclusione onesta**: sulle due superfici il template copre **due liste di sola lettura**, cioè meno del 10% di quello che le pagine reali fanno. Tutto il resto è R2, e va progettato nello stesso linguaggio riusando le primitive 15.2-15.8a (card+sheet, `secondStep`, pannello full-screen, KPI strip, toast).

### a.1 — Statistiche: pagina alta **21.485px**, due card da **9.356px** e **9.398px**, 5 KPI in strip

`src/app/[locale]/dashboard/reports/` — 2 file + 3 componenti grafici condivisi:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 147 | server: gate `finance.manage` (43-46), `period` = `month`\|`year` (48-49, default **year**), `getStats` (51), `.page-head` con il **`.segmented` di periodo a due `Link`** (110-127), `.kpi-row` con **4 o 5** `KPI` (130-142: il 5° `fleetUtilization` è **omesso** quando `null`, story 12.11 AC 6) |
| `reports-console.tsx` | 216 | client: **4 righe `.split`** — (Ricavi `LineChart` + Ore volate `BarChart`), (Transiti `BarChart` + Utilizzo flotta `.util-rows`), (Composizione movimenti + Ore istruttori), (2× `RankBars`) |
| `components/charts/{line,bar}-chart.tsx` | 79/78 | SVG `viewBox 600×180`, `preserveAspectRatio="none"`, label in una riga **HTML** sotto (`.chart-label`, 9px, `--ink-4`, `aria-hidden`) |
| `components/charts/rank-bars.tsx` | 92 | `.card` + `.card-head` con un **`.segmented` di metrica** in stato locale (`metricIndex`, :49) e `.util-row` ordinate per la metrica scelta |

**Misure a 375×812** (admin, IT, `period=year`):

| superficie | valore | nota |
|---|---|---|
| `.page-head` | **104,83** a ≤640 (IT **e** EN), **51,44** a 641/800/1280 | il `.segmented` di periodo va a capo |
| `.segmented` di periodo | 173×**33,4**, due `Link` da **27,4px** | sotto i 44 |
| `.kpi-row` | **5 KPI** (`Ricavi / Ore volate / Movimenti / Quota transiti / Utilizzo flotta`), strip `flex` `cw 375 / sw 826` (EN 835), card 146×77 | ⚠️ **il numero di KPI è 4 o 5** secondo la configurazione scheduling+flotta ⇒ la regola R-15.3-c ("2×2 per le facce con esattamente QUATTRO KPI") **non si applica meccanicamente** ⇒ R-15.8b-c |
| SVG dei 3 grafici | **281×180** a 375 (226 a 320, 296 a 390); a 1280 sono 612,7 (larghi) e **287,3** (stretti) | scalano già, `preserveAspectRatio="none"` |
| label dei grafici | ≤413px la regola `.chart-label:nth-last-child(even){visibility:hidden}` **funziona**: `period=year` **6 su 12** visibili con `minGap` **28,09 / 27,08** @375 (18,89/18,66 @320); `period=month` **3 su 6** con gap 81/70 | ⚠️ ma a **1280px** la card stretta ("Ore volate") ha `minGap` **6,03** con 12 label: tightness **desktop** pre-esistente, **fuori mandato** |
| contrasto dei **marchi** dei grafici | linea `oklch(0.55 0.14 155)` su `--panel`: **4,54** chiaro / **3,89** scuro; barre `var(--ink)` a `opacity .85`: **18,79** / **15,74**; gridline `var(--border)`: 1,3 (decorativa) | **sopra il 3:1** — i grafici SVG **non** sono il problema di contrasto |
| contrasto degli **oggetti grafici** delle liste | ⚠️ `.util-bar .seg` (barre Utilizzo flotta e RankBars): **2,47** chiaro (10,45 scuro) ⇒ **sotto il 3:1**; le 4 fasce di "Composizione movimenti": **2,73 / 2,04 / 4,85 / 3,61** chiaro ⇒ **due sotto il 3:1** (dark 9,3/9,96/5,72/7,73) | pre-esistenti, misurati ⇒ **R-15.8b-e** |
| `.chart-label` | `--ink-4`: **3,66** chiaro / **4,14** scuro | è **testo** ⇒ soglia 4,5 ⇒ **sotto**. È la faccia "grafici" del TD (h) ⇒ **R-15.8b-e** |
| **"Utilizzo flotta"** | **145 righe** (una per velivolo attivo), card alta **9.356px** | `getStats` NON cappa `fleet` (la 15.4 F3 l'ha **paginato fino a `total`** per decisione PO); `topPilots` è cappato a **10** (`stats.service.ts:281`) e `instructors` ne ha 5 sul DB |
| **"Per aeromobile"** (`RankBars`) | **145 righe**, card alta **9.398px** | idem |
| altezza documento | **21.485px** @375 (**17.794** @1280) | ⚠️ è un artefatto del **volume DB** (145 velivoli), non un difetto introdotto: su un'aviosuperficie reale la flotta è ~10-30. Ma su mobile è **26 schermate di scroll** per una card ⇒ R-15.8b-b |
| controlli sotto la tab bar | **nessuno** (`covered: []`) | |
| target < 44px | **6 in tutto**: 2 `Link` di periodo (27,4) + 4 bottoni di metrica dei due `RankBars` (27,4) | la pagina è quasi tutta di sola lettura |
| overflow orizzontale di pagina | **0** ovunque | |

### a.2 — Impostazioni: pagina alta **7.446px**, **231** target sotto i 44px (di cui **201 a 24,7px**), e le azioni di riga **fuori dallo schermo**

`src/app/[locale]/dashboard/settings/` — 8 file, **sette card**:

| file | righe | card | scritture |
|---|---|---|---|
| `page.tsx` | 352 | orchestratore: gate `settings.manage` (134-137), `Promise.all` di **12 letture** (139-153), split `RATING`/`MEDICAL` (159-160) | — |
| `club-card.tsx` | 229 | **Club** — identità (`SettingsForm` annidato, con **il suo** salva), ICAO, email di contatto, **stazione METAR**, tassa PPR di default, **quota associativa**, istruzioni operative IT/EN | **5 PUT in `Promise.all`** su un solo "Salva" (`:88-114`): `settings/club`, `settings/metar-station`, `settings/ppr-landing-fee`, `settings/ppr-operating-instructions`, `settings/membership-fee`; 422 `fieldErrors.contactEmail` per-campo (:120-129) |
| `settings-form.tsx` | 107 | (dentro Club) nome aviosuperficie, `airfield-settings-save` | `PUT settings/club` (branding) |
| `scheduling-card.tsx` | 145 | **Pianificazione** — `openTime`/`closeTime` (`type="time"`), `minSlotMinutes`, `turnaroundMinutes`, `maxAdvanceDays`, hint interpolato client-side | `PUT settings/scheduling`; 422 `fieldErrors.closeTime` (`closeTime > openTime`) per-campo. ⚠️ **è la finestra che 7.4/15.4 fanno rispettare**: la stessa chiave che `reports.spec.ts:307` scrive dal project parallelo (v. §b e R-15.8b-f) |
| `smtp-card.tsx` | 192 | **Email (SMTP)** — host/porta/sicurezza/from/user/pass + **"Invia email di prova"** nella testata | `PUT settings/smtp` (422 `fieldErrors.host` per SSRF), `POST settings/smtp/test-email` |
| `treasury-card.tsx` | 156 | **Tesoreria** — saldi di apertura cassa/banca + **data di apertura** (`DateInput`) | `PUT settings/treasury`; errori per-campo `invalidAmount`/`requiredDate`. ⚠️ alimenta `getBillingSummary` di **ogni** altra spec |
| `ratings-card.tsx` | 375 | **Abilitazioni** (`kind=RATING`) **e** **Visite mediche** (`kind=MEDICAL`) — **due istanze dello stesso componente**, testid diversi; tabella `.students` a **5 colonne**, form inline (nome/scope/validità/**blocksBooking**), Modifica/Disattiva/Riattiva/**Elimina** con conferma inline | `POST`/`PATCH`/`DELETE /expiry-types`; **409 = "in uso"** (:150-153) |
| `cash-categories-card.tsx` | 269 | **Categorie di cassa** — tabella `.students` a **4 colonne**, Rinomina/Disattiva/Riattiva/Elimina (Elimina **nascosto** sulle categorie di sistema `Ricariche`/`Compensi istruttori`/`PPR`, `cash.service.ts:52`) | `POST`/`PATCH`/`DELETE /cash-categories`, `POST .../{deactivate,reactivate}`; 409 "in uso" |

**Misure a 375×812** (admin, IT):

| superficie | valore | nota |
|---|---|---|
| altezza documento | **7.446** @375 (7.722 @320, **6.269** @1280) | 9 schermate di scroll |
| altezze delle 7 card @375 (@1280) | Club **1052,7** (807,8) · Pianificazione **664,1** (396,9) · SMTP **689** (385,2) · Tesoreria **433,2** (296,6) · Abilitazioni **2533,5** (2431,2) · Visite mediche **500,7** (398,5) · Categorie **1285,6** (1201,5) | |
| `.card-head` delle 7 card @375 (@1280) | 89,2 (49,3) · 89,2 (49,3) · **132** (63,8) · 73,2 (49,3) · **116,1** (63,8) · 116,1 (63,8) · **148** (63,8) | in EN cambiano (Tesoreria **49,3**, Abilitazioni **92,1**, Pianificazione **73,2**): baseline **sensibile al locale** |
| `.form-grid` | **1 colonna (277px)** a ≤640, 2 colonne a 641+ | il layout dei form **è già** a colonna singola su mobile |
| `.students` Abilitazioni | `cw` **317** / `sw` **694** ⇒ **377px nascosti** (5 colonne, **43 tipi** + intestazione) | Visite mediche idem (**4 tipi**); Categorie `317/520` (**21 categorie**) |
| ⚠️ **azioni di riga** | i `.btn.mini` misurano **24,7×61** e stanno a `x ≈ 503-690` in un viewport da 375 ⇒ **~156-343px oltre il bordo destro**: l'hit-test sul loro centro restituisce `MAIN.page`, cioè **non sono raggiungibili senza scorrere la tabella in orizzontale** | è **lo stesso difetto** che la 15.7 ha misurato sul "Completa" dei Movimenti (483px di scroll), ripetuto **201 volte** |
| target < 44px | **231**, di cui **201 a 24,7px** (i `.btn.mini`), 13 a ~37px (gli `input`), 12 a ~35px (i "Salva", **56,5×34,8**), 3 a 38,8 (i `type="time"`/`DateInput`), 1 a 24 (il trigger calendario) | il record peggiore dell'app |
| `club-contact-email-input` | `cw 275 / sw 300` ⇒ **testo tagliato senza ellissi** dentro un input | pre-esistente |
| overflow orizzontale di pagina | **0** a ogni larghezza | ⇒ **una guardia sull'overflow di PAGINA sarebbe cieca**: le tabelle scrollano per conto loro |

**Comportamenti di dominio delle Impostazioni che il mobile deve preservare IDENTICI**:

| # | comportamento | dove | cosa deve restare vero su mobile |
|---|---|---|---|
| 1 | **Club salva con 5 PUT in `Promise.all`** su un solo "Salva", e il 422 `contactEmail` è **per-campo** | `club-card.tsx:88-114`, `:120-129` | stessi endpoint, stesso ordine, stesso errore inline sul campo |
| 2 | **Pianificazione: 422 `closeTime` per-campo** (`closeTime > openTime`) | `scheduling-card.tsx` | invariato — ed è la finestra che 7.4/15.4 fanno rispettare |
| 3 | **SMTP: 422 `host` (SSRF)** e "Invia email di prova" separato | `smtp-card.tsx` | invariati, compreso il feedback del test |
| 4 | **Tesoreria: `invalidAmount`/`requiredDate`** per-campo | `treasury-card.tsx` | invariati; ⚠️ alimenta `getBillingSummary` di **ogni** spec su `/dashboard/billing` |
| 5 | **`ExpiryType`: `kind` inviato SOLO in creazione, `validityMonths` `null` se ≤ 0, `DELETE` in uso ⇒ 409 "in uso"** | `ratings-card.tsx:150-153` | stesso contratto, stesso 409 distinto dal generico (su mobile a **toast**, R-15.8b-d) |
| 6 | **`blocksBooking` alimenta le guardie 7.4 (prenotazioni) e 14.4 (voli)** | `expiry-types` → `assert*` delle due guardie | un tipo bloccante creato **dal telefono** produce **esattamente** lo stesso effetto: e2e obbligatorio sul **422 `FLIGHT_BLOCKED_BY_EXPIRY`** |
| 7 | **Categorie di sistema (`Ricariche`, `Compensi istruttori`, `PPR`) non si eliminano**: l'azione è **assente**, non disabilitata | `cash.service.ts:52`, `cash-categories-card.tsx` | l'azione resta **assente** anche nello sheet mobile |
| 8 | **Disattivare ≠ cancellare**: un tipo disattivato esce dalle guardie senza sparire | `ratings-card.tsx` | invariato, e distinguibile nella lista mobile |

### a.3 — Le primitive 15.2-15.8a da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`** (86 righe): `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`; nome accessibile = `` `${sub} — ${title}` `` (riga 61); `onClose` **deve** essere referenzialmente stabile; uno sheet alla volta (fix 15.3 F4); `.bottom-sheet-sub` a `--ink-3` (4,85/5,72). ⇒ è la primitiva delle tre liste CRUD (R-15.8b-d) e il `secondStep` è la conferma di "Elimina".
- **`src/components/ui/mobile-sheet.tsx`**: scrim `<testId>-scrim`, `Escape` da aperto, focus al pannello e ritorno al trigger, `role="dialog"`, z **40**.
- **`src/lib/mobile-sub-line.ts#joinSegments`** (story 15.7): **il** compositore di sub-line/`sub` di sheet — omette i segmenti assenti invece di riempirli col segnaposto (lezione 15.5 F1). **Si riusa, non si riscrive.**
- **CSS già pronto, dentro `@media (max-width:640px)`**: `.mobile-card-head/-title/-count/-empty/-foot` (2099-2104), `.mobile-row` + figli (2111-2160, **UN solo `<button>` con figli `<span>`**), `.mobile-row-tail` (2143), `.mobile-row-name/-sub` ellissati (2151/2157), `.mobile-row-side/-amount/-note` (2592-2594), `.mobile-row-flag` (2607-2622) col pallino dipinto (2758), `.mobile-chip-strip > .btn` (2261-2269), `a.mobile-row` (2327), `.registry-head`/`.registry-pagination` (2428-2491), `.logbook-head`/`.logbook-filter-panel` (2708-2766), `.scadenze-head`/`.movements-head`/`.membership-fee-modal` (2768-3018), `.kpi-row.kpi-row-grid` (2078-2093, la variante 2×2 — **qui NON si usa**, R-15.8b-c).
- **Precedenti di "corpo desktop / albero mobile"**: `.scadenze-desktop-body` + `.scadenze-mobile` (`scadenze-console.tsx:450/501`), `.logbook-desktop-body` (`logbook-console.tsx:733/737`), più i gemelli che la **15.8a** ha appena aggiunto su `billing-console.tsx` — **da leggere sul repo consegnato**, sono il modello più fresco.
- **`secondStep` per un'azione distruttiva/contabile**: precedenti vivi in `movements-table.tsx` (15.7, chiusura con tassa) e in `billing-console.tsx` (15.8a, rettifica/storno/riclassifica).
- **Il pannello full-screen che riusa il contenuto di una modale**: `scadenze-console.tsx` (15.7, quota associativa) — modello per qualunque form che non stia in uno sheet.

### a.4 — `airops.css`: dove va la roba nuova, cosa non toccare

- File di **3.018 righe** al `baseline_commit` (⚠️ **la 15.8a ha aggiunto un blocco in coda**: rileggere i numeri di riga sul repo consegnato). Sezioni mobile: shell 15.1 **1666-1801**, primitive 15.2 **1802-2018**, panoramica 15.3 **2019-2216**, pianificazione 15.4 **2217-2350**, anagrafiche 15.5 **2351-2658**, registro voli 15.6 **2659-2767**, scadenze+transiti 15.7 **2768-3018**, contabilità+export 15.8a **in coda**. Le regole nuove vanno **ancora più in coda**, in un blocco proprio `/* ---------- statistiche + impostazioni mobile (story 15.8b) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** la riga `display:none` fuori-query per gli alberi mobile (precedenti: `.ppr-queue-mobile` 1822, `.logbook-mobile` 2684, …).
- **Mappa z-index in uso**: `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · `.popover-scrim` 19 / `.popover` 20 · popover/typeahead 30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (≤640px sollevato).
- ⚠️ **Classi da NON usare come aggancio dello switch**: `.card`, `.card-head`, `.students`/`.student-row` (13 console), `.kpi-row`, `.mini-modal`, `.form-grid`, `.util-row`/`.util-bar`/`.util-value` (**4 consumer**: due `RankBars` + due liste di `reports-console` — cioè **tutti su questa pagina**, ma una regola su `.util-*` li colpisce **tutti e quattro insieme**: va deciso e dichiarato, non subìto), **`.split`** (`reports-console` ne ha 4, `billing-console` 1 — quest'ultimo ora dietro la classe `.billing-split` della 15.8a — e altre pagine), e soprattutto **`.segmented`**, che ha **6 consumer** (`scadenze-console.tsx:217`, `bookings/schedule.tsx:503/530/568`, **`reports/page.tsx:110`**, **`charts/rank-bars.tsx:60`**, `dashboard/scadenze-widget.tsx:83`, più `ui/segmented.tsx:32`): **due dei sei sono su questa pagina**, quindi una regola su `.segmented` che qui sembrasse innocua toccherebbe Pianificazione, Panoramica e Scadenze. Lo switch va su **classi di pagina proprie**, ancorate con `>` (lezione 15.3 F1, riconfermata 15.5 F5 e 15.7).
- **`.date-input`** è condivisa (contabilità, movimenti, registro voli, **tesoreria**, scheda persona): ogni regola nuova va ancorata alla card che la ospita.
- `.page` = `padding: 22px 28px 60px` — asserita da `mobile-primitives.spec.ts:188`.

### b) e2e e unit — il campo minato preciso (⚠️ questa story attraversa la **catena serializzata** come nessuna prima)

**La catena** (`playwright.config.ts:47-125`), in ordine: `chromium` → **`settings`** → **`booking-window`** → **`treasury-settings`** → **`billing-global`** → `mobile-metar` → `mobile-overview-overflow` → `mobile-membership-fee`. **Tre degli otto project della catena vivono sulle superfici di questa story** — e i loro `testIgnore` sono già scritti in `playwright.config.ts:37-45`. R-15.8b-f ne aggiunge un quarto (`reports`), e lo spec mobile nuovo delle Impostazioni ne aggiunge un quinto.

| file | project | test | cosa fa / cosa asserisce | rischio per questa story |
|---|---|---|---|---|
| `e2e/reports.spec.ts` | chromium → **catena** (R-15.8b-f) | 5 | KPI/serie/fleet/instructors/topPilots, il toggle periodo, l'RBAC del pilota, il 422 sul `ref` futuro; **`page.locator('.kpi-row .kpi .kpi-value')` page-level con `.nth(0..2)` e `toHaveCount(5)`** (249, 321); `reports-fleet-row-*`/`reports-instructor-row-*`/`reports-rank-pilot-row-*` page-level (255-260) | ⚠️ **due bombe**: (1) `toHaveCount(5)` su `.kpi-row .kpi .kpi-value` **page-level** — se l'albero mobile aggiunge una SECONDA `.kpi-row`, il conteggio raddoppia **a 1280px**; (2) i testid composti col dato di dominio non possono essere duplicati. E **:307-315 esegue un `PUT /settings/scheduling` GLOBALE dal project `fullyParallel`** — il TD che R-15.8b-f chiude |
| `e2e/settings.spec.ts` | **settings** (2° della catena) | 7 | Club (nome, ICAO, email, tassa PPR, istruzioni), Pianificazione, SMTP (+ test-email), e a **:147** un `page.getByText('Inserisci un indirizzo email valido.')` **page-level** | ⚠️ **due rischi**: (1) quel `getByText` page-level si rompe se il messaggio compare **due volte** (desktop + mobile) a 1280px; (2) ogni card di Impostazioni che cambia forma cambia **questo** spec |
| `e2e/booking-window.spec.ts` | **booking-window** (3°) | 4 | scrive `sched.*` via la card Pianificazione e verifica il 422 `BOOKING_OUTSIDE_WINDOW` | ⚠️ dipende dai testid `scheduling-*-input` e da `scheduling-settings-save` |
| `e2e/treasury-settings.spec.ts` | **treasury-settings** (4°) | 3 | scrive `treasury.*` (saldi di apertura), che alimenta `getBillingSummary` di **ogni** altra spec su `/dashboard/billing` | ⚠️ tocca la card Tesoreria: se cambia il modo di aprire/salvare quella card, questo spec va rifatto **dentro la catena** |
| `e2e/expiry-types.spec.ts` | chromium | 6 | il CRUD `ExpiryType` **da Impostazioni**: `rating-row`, `rating-form-submit`, `medical-*`, a **167-176** `page.getByLabel('Blocca prenotazioni')` **page-level**, a **198-201** la navigazione a "Le mie scadenze" | ⚠️ **il `getByLabel('Blocca prenotazioni')` page-level è la trappola**: un gemello mobile della checkbox dà **due** match a 1280px |
| `e2e/rbac.spec.ts` | chromium | 3 | i redirect dei non-admin | conferma: le due pagine sono ADMIN-only |
| `e2e/mobile-*.spec.ts` | vari | — | nessuno copre queste due superfici | la copertura di geometria/fondo pagina va **scritta qui** |
| `e2e/billing*.spec.ts`, `cash-*`, `account-adjustments`, `exports`, `pdf-exports` | vari | — | superfici della **15.8a** | ⚠️ non sono di questa story, **ma** `treasury-settings` alimenta `getBillingSummary`: un test nuovo che scriva la Tesoreria fuori dalla catena li rompe tutti |

**Tutta la suite gira a viewport desktop** (1280×720, `playwright.config.ts:13-19`) tranne gli spec mobile dedicati: un albero mobile `display:none` non la tocca — **ma un testid, un TESTO o un nome accessibile duplicato la rompe a qualsiasi viewport**.

**Stato globale**: ⚠️ **questa story scrive `AppSettings`** (è la pagina che li amministra). **Ogni spec nuovo che tocchi Impostazioni deve entrare nella catena serializzata** (regola CLAUDE.md; il precedente `mobile-membership-fee` della 15.7 è il modello: project dedicato in coda, `afterAll` che ripristina, `testIgnore` nel project `chromium`). Uno spec che tocchi **solo** le Statistiche in lettura può restare in `chromium`, **ma non se asserisce aggregati globali con uguaglianza** (review Billing-2 F4).

**Unit**: nessun test copre oggi `reports/page.tsx`, `reports-console.tsx`, i tre componenti grafici, né una sola card di `settings/`. I test nuovi sono quelli di AD-6 (funzioni pure in `src/lib/`, che per costruzione non importano servizi e quindi non trascinano `@/lib/env` — verifica comunque `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`). Precedenti diretti: `src/lib/mobile-{logbook,registries,agenda,expiries,movements,sub-line}.ts`.

### c) Correzioni al brief (verificate sul codice)

1. **"card METAR" fra le Impostazioni**: non è una card — la **stazione METAR è un campo dentro la card Club** (`club-card.tsx:161-169`), salvato dallo stesso "Salva" che spara **cinque** PUT.
2. **"i due editor segnalati dalla 15.7"** sulla card ratings: sono le **due istanze** dello STESSO componente `RatingsCard` (Abilitazioni `kind=RATING` + Visite mediche `kind=MEDICAL`), non due editor diversi. Il form è **uno solo**, parametrizzato.
3. **La Statistiche non ha export** (nessun `ExportMenu`, nessun href) e **nemmeno le Impostazioni**: il redesign dell'export è tutto nella **15.8a** (Contabilità + gli altri otto consumer). Questa story **non lo tocca** — ma se una sua regola arrivasse a `.popover`/`MobileSheet` lo romperebbe: guardia in AC 11.
4. **"card tesoreria"**: la card **Tesoreria** (saldi di apertura, che **scrive**) è qui, su Impostazioni; il **riquadro Liquidità** della Contabilità (sola lettura) è della 15.8a. Sono due oggetti diversi.
5. **Le due pagine sono ADMIN-only** (misurato: pilota → redirect a `/it/dashboard` su entrambe) e **nessuna** ha `mobileSlot` (`route-registry.ts:124-129`) ⇒ per l'admin vivono nello sheet "Altro", a **due** tap.

### d) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (verificato: `ReportsPage` **38/38**, `SettingsPage` **198/198**, parità piena, zero chiavi orfane); segnaposto riempiti lato client → **`t.raw`** (precedente vivo: `scheduling.hint`, `settings/page.tsx:231`); suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground (⚠️ TD (n) della 15.7: `scripts/e2e.sh start` **perde il quoting** degli argomenti — `-g "AC 9"` diventa `bash: AC: comando non trovato`); build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** negli e2e per chiudere un popover dentro uno `SlideOver` (chiude tutto il pannello, review 14.3 F1) — e qui il `DateInput` della Tesoreria è esattamente quel caso; MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe; prima di attribuire un fallimento al lock TD-6, contare i `LoginAttempt` **falliti**.

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — Gli alberi mobile vivono DENTRO i componenti che possiedono lo stato.** Per le Statistiche è `reports-console.tsx` (possiede il `metricIndex` dei due `RankBars`) e `reports/page.tsx` per i KPI e il periodo; per le Impostazioni è **ciascuna card** (ognuna possiede il proprio stato di form e il proprio `feedback`). Un componente parallelo o duplica quello stato o duplica la rete. ⚠️ **Corollario per le Impostazioni**: **non si introduce un orchestratore client nuovo** sopra le sette card senza una misura che lo motivi — `settings/page.tsx` è un **server component** e deve restarlo.

**AD-2 — Si sostituisce il CORPO, non la card.** A ≤640px va a `display:none` **solo** la tabella/la lista desktop, tramite **classi di pagina proprie** (es. `.expiry-types-desktop-body`, `.cash-categories-desktop-body`, `.fleet-util-desktop-body`), mai `.students`/`.student-row`, mai `.card-head`, mai `.util-row`, mai `.split`, mai `.segmented`. Le testate restano **un solo nodo** con i loro testid e la loro logica.

**AD-3 — Il remount è ASIMMETRICO fra le due pagine, e questo detta due comportamenti diversi.** Fatti misurati: `reports` non ha stato di filtro client (il periodo sono due `Link` server-side) **ma** `RankBars` tiene `metricIndex` locale **senza `key`** ⇒ sopravvive a tutto (compreso, se non si sta attenti, un cap "Mostra tutte" già espanso che resta espanso dopo un cambio di metrica: **decidere e dichiarare**); `settings` non rimonta **mai** nulla ⇒ lo stato di un form aperto in uno sheet/pannello mobile sopravvive alla navigazione e **anche a un salvataggio riuscito** (`router.refresh()` non rimonta i client component): va verificato che uno sheet/pannello mobile si **chiuda esplicitamente** dopo il successo, come già fa `handleSuccess` (`ratings-card.tsx:121-125`). **Va misurato su entrambe**, non dedotto.

**AD-4 — I controlli che duplicano un desktop prendono il suffisso; quelli che esistono solo su mobile il prefisso.** ⚠️ Su Impostazioni la regola ha due vincoli in più: `expiry-types.spec.ts:167-176` legge `getByLabel('Blocca prenotazioni')` **page-level** ⇒ un gemello mobile di quella checkbox **rompe lo spec**; e `settings.spec.ts:147` legge un **messaggio di errore** page-level (`'Inserisci un indirizzo email valido.'`). Su Statistiche il vincolo è `reports.spec.ts:249/321` (`.kpi-row .kpi .kpi-value` page-level, `toHaveCount(5)`) e le **quattro famiglie** di testid composti col dato di dominio (`reports-*-row-*`): **non riusabili** dall'albero mobile.

**AD-5 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test, e riusano `joinSegments`.** Valgono per: (i) la **sub-line** della card di un `ExpiryType` (`scope` · validità · stato, coi casi reali: `validityMonths` **null** = "senza scadenza", tipo **disattivato**, `blocksBooking` **true**) e della card di una `CashCategory` (stato · sistema/non sistema) — segmenti assenti **omessi**, mai `—` (lezione 15.5 F1); (ii) il **cap dichiarato** delle liste ranked (R-15.8b-b): "prime N" e "e altre M" sono una funzione pura di `(righe, N)`, con i casi di confine (M = 0 ⇒ nessuna riga finale; N ≥ totale ⇒ nessun cap). Restano pure ⇒ niente `@/lib/env`.

**AD-6 — Un solo sheet aperto, un solo nodo per testid di sheet.** Ogni `BottomSheet` si rende condizionalmente (`{openRow ? <BottomSheet …/> : null}`), così ciascun testid di sheet resta **un** nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). ⚠️ Qui gli sheet sono **tre famiglie** (Abilitazioni, Visite mediche, Categorie) su **tre card indipendenti** che non si conoscono: la mutua esclusione fra card diverse **non è garantita da nulla** — va verificata e, se non regge, dichiarata.

**AD-7 — Una sola logica di rete per i due alberi.** I `save()`/`submit()` delle sette card **si riusano così come sono**: stessi endpoint, stessi header, stessa mappatura 409/422 per-campo, stesso `router.refresh()`, stessi testid di feedback. Se una superficie mobile ha bisogno di un secondo punto d'ingresso, chiama **la stessa funzione**.

**AD-8 — Un'azione che apre un secondo overlay CHIUDE prima lo sheet** (R-15.4-d, riconfermata in 15.6, 15.7 e 15.8a): niente pannello z50 impilato su uno sheet z40. Con R-15.8b-d la conferma di "Elimina" è un **`secondStep` dentro lo stesso sheet**, quindi il caso non deve presentarsi: **va asserito**, non assunto.

**AD-9 — I grafici SVG NON si toccano** (R-15.8b-b: "grafici INVARIATI"). Il lavoro sui grafici è di **misura** (larghezza SVG, `minGap` fra le label visibili, contrasto dei marchi) e, per `.chart-label`, **solo** di contrasto (R-15.8b-e). Nessuna modifica a `line-chart.tsx`/`bar-chart.tsx` oltre a ciò che il fix di contrasto richiede; nessun cambio di `viewBox`, di `preserveAspectRatio` o della regola di diradamento `.chart-label:nth-last-child(even)` della 13.10.

**AD-10 — Nessun cambio server** (R-15.8b-b: "Nessun cambio API"). `stats.service.ts` non si tocca: `topPilots` resta cappato a **10** lato server, `fleet` resta **non cappato** (decisione PO 15.4 F3: paginato fino a `total`), `fleetUtilization` resta **omesso** quando `null` (12.11 AC 6, mai un finto 0%). Il cap di R-15.8b-b è **client-side e dichiarato**.

---

## Acceptance Criteria

> Ogni misura si intende a **375×812** e ripetuta a **390×844** e a **320×568**, tema **chiaro e scuro**. ⚠️ Le baseline di §a.1/§a.2 sono state prese al `baseline_commit`: il dev le **rimisura sul repo consegnato dalla 15.8a** prima di usarle come pre-fix, e dichiara ogni scostamento.

1. **(Statistiche: KPI e periodo — R-15.8b-c)** La `.kpi-row` resta **la strip invariata**: **nessun ramo** condizionale, **nessuna** variante 2×2, e continua a rendere **4 o 5** card secondo `fleetUtilization !== null` (12.11 AC 6). ⚠️ La `.kpi-row` resta **UN solo nodo** in tutto il DOM (`reports.spec.ts:249/321` conta `.kpi-row .kpi .kpi-value` **page-level** e asserisce `toHaveCount(5)`): asserire il conteggio dei nodi `.kpi-row` = 1 a **375** e a **1280**. Il toggle di periodo resta **due `Link`** con lo stesso `?period=` e diventa **≥44px** (pre-fix **27,4px**, `.segmented` 173×33,4) **senza toccare `.segmented`** (6 consumer, 4 dei quali fuori da questa pagina) — la regola va su una **classe di pagina propria ancorata con `>`**. Idem per i **quattro** bottoni di metrica dei due `RankBars` (pre-fix 27,4px), che conservano l'ordinamento per metrica selezionata. **Verifica misurata**: `.page-head` **pre/post** (pre-fix **104,83** a ≤640 IT **e** EN, **51,44** a 641+); target ≥43,5 su tutti e sei i controlli; misura pre/post di `.segmented` su `/dashboard/bookings`, `/dashboard/expiries` e `/dashboard` (guardia di non-contaminazione).

2. **(Statistiche: i grafici restano invariati, e lo si dimostra — R-15.8b-b/AD-9)** I tre grafici SVG (`LineChart` Ricavi, `BarChart` Ore volate, `BarChart` Transiti) **non cambiano**: nessuna modifica a `viewBox`, `preserveAspectRatio`, alla regola di diradamento `.chart-label:nth-last-child(even){visibility:hidden}` (13.10) né alla loro struttura. **Verifica misurata**, riportata nel record: per ogni grafico, **larghezza SVG** e **`minGap` fra le label visibili**, prima e dopo, a 375/390/320 e a 1280 (pre-fix: SVG **281×180** @375, **226** @320, **296** @390, **612,7**/**287,3** @1280; `period=year` @375 **6 su 12** label visibili con gap **28,09 / 27,08**, @320 gap **18,66-18,89**; `period=month` **3 su 6** con gap 81/70). ⚠️ Il `minGap` **6,03** della card stretta a **1280px** è tightness **desktop pre-esistente**: si dichiara, **non** si corregge (fuori mandato).

3. **(Statistiche: le liste ranked col cap DICHIARATO — R-15.8b-b)** A ≤640px "Utilizzo flotta" (**145 righe**, card alta **9.356px**) e "Per aeromobile" (`RankBars`, **145 righe**, **9.398px**) rendono le **prime N** righe per la metrica selezionata, con una riga finale che **non mente** — `"prime N · Mostra tutte"` (pattern 13.4; il precedente d'epic è la 15.3 sulle prenotazioni troncate: il dev **verifichi entrambi** e dichiari quale ha seguito) — e "Mostra tutte" **espande davvero** l'intera lista (nessuna informazione persa, R4). Il cap è **client-side**: `stats.service.ts` **non si tocca** (AD-10), `topPilots` resta cappato a **10 lato server** e nessun cap nuovo entra nel server. Le righe conservano label, **barra proporzionale** e valore. ⚠️ I testid composti col dato di dominio (`reports-fleet-row-{registration}`, `reports-instructor-row-{name}`, `reports-rank-aircraft-row-{registration}`, `reports-rank-pilot-row-{name}`) restano **un nodo ciascuno** a 375 **e** a 1280 — e a **1280 tutte** le righe restano rese (il cap è mobile-only: `reports.spec.ts:255-260` gira a 1280 e deve restare verde senza modifiche). **Verifica misurata**: altezza delle due card lunghe **pre/post** e altezza totale del documento **pre/post** (pre-fix **9.356** / **9.398** / **21.485** @375); numero di righe rese per card **dichiarato**, nei due stati (capped/espanso); il valore di N **motivato**, non scelto a caso.

4. **(Impostazioni: tutto in pagina, ogni controllo raggiungibile con un dito — R-15.8b-d)** **Tutte e sette** le card restano **in pagina** (nessun indice, nessun pannello-per-card: opzione B esplicitamente scartata) e **tutte** le scritture restano possibili da un telefono, con gli **stessi** endpoint e le **stesse** validazioni per-campo (Club: 5 PUT su un salva + 422 `contactEmail`; Pianificazione: 422 `closeTime`; SMTP: 422 `host` + test-email; Tesoreria: `invalidAmount`/`requiredDate`). **Ogni** controllo di form e **ogni** bottone di salva è **≥44px** (pre-fix: **231** target sotto soglia, di cui **201 a 24,7px**, i salva a **34,8**, gli input a 36,8-38,8, i `type="time"` a 38,8, il trigger calendario a **24**), i "Salva" sono **full-width** e nessun controllo finisce sotto la tab bar. **Verifica misurata**: altezza di **ciascuna** delle 7 card **pre/post** alle tre larghezze e nei **due locale** (le baseline sono in §a.2 e **cambiano col locale**: Club 1052,7 · Pianificazione 664,1 · SMTP 689 · Tesoreria 433,2 · Abilitazioni 2533,5 · Visite mediche 500,7 · Categorie 1285,6 @375); altezza del documento pre/post (pre-fix **7.446** @375); sweep dei target con soglia **43,5** (mai calibrata sul valore ottenuto, lezione 15.7 MINOR-1); hit-test di **ogni** controllo visibile.

5. **(Impostazioni: le tre tabelle diventano card + sheet — R-15.8b-d)** A ≤640px le tre `.students` (Abilitazioni `317/694` con 43 tipi, Visite mediche con 4, Categorie `317/520` con 21) sono `display:none` **misurato** e al loro posto ci sono **liste di card**: nome + sub mono (`scope` · validità · stato via `joinSegments`, segmenti assenti **omessi**), riga tappabile → **`BottomSheet`** con parità piena verso le colonne desktop, e **le azioni SOLO dentro lo sheet** (Modifica, Disattiva/Riattiva, Elimina) a **≥44px**; **"Elimina" è un `secondStep`** (conferma esplicita), e il **409 "in uso"** compare come **toast** (grammatica R-15.6-d ii / R-15.7-g / R-15.8a-j: toast su mobile, `<p>` al desktop, **niente doppio annuncio**). ⚠️ **Nessuna azione resta fuori dallo schermo** (pre-fix misurato: `.btn.mini` **24,7×61** a `x≈503-690` in 375, hit-test = `MAIN.page` — cioè irraggiungibili senza scorrere in orizzontale). Ogni card è **UN solo elemento interattivo** (`<button>`, figli `<span>`, zero interattivi annidati, `min-height` ≥44px). Empty state mobile = **un solo nodo** con testid proprio. **Verifica misurata**: `display` di entrambi gli alberi a 375 **e** a 1280; ispezione DOM `card.querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`; nessun testo clippato senza ellissi a 320px; contenimento sul rect di ogni figlio che può crescere.

6. **(CRUD `ExpiryType` e categorie di cassa dal telefono — dominio INVARIATO — R-15.8b-d)** Creazione, **modifica**, disattivazione/riattivazione e **cancellazione** di un tipo restano possibili da mobile con lo stesso contratto (`POST`/`PATCH`/`DELETE /expiry-types`, `kind` inviato **solo** in creazione, `validityMonths` `null` se ≤ 0); il campo **`blocksBooking`** resta presente, etichettato e col suo hint — ⚠️ è la manopola che alimenta le guardie **7.4** (prenotazioni) e **14.4** (voli): **un e2e obbligatorio prova che un tipo `blocksBooking=true` creato DAL TELEFONO produce il 422 `FLIGHT_BLOCKED_BY_EXPIRY`** su una persona priva di quel documento (la guardia è il **422**, non "la checkbox è spuntata"); la **conferma di cancellazione** resta a due passi (`secondStep`) e il **409 "in uso"** resta **distinto dal generico**; sulle categorie di cassa l'azione Elimina resta **assente** (non disabilitata) sulle tre categorie di sistema (`Ricariche`, `Compensi istruttori`, `PPR`); disattivare resta diverso da cancellare, e lo stato è leggibile sulla card. ⚠️ `expiry-types.spec.ts:167-176` legge `getByLabel('Blocca prenotazioni')` **page-level**: la soluzione **non può** creare un secondo nodo con quel nome accessibile a 1280px — se lo creasse, lo spec va **scopato alla card** (mai indebolito), con la misura pre/post nel record e la motivazione (lezione 14.6). Stessa regola per `settings.spec.ts:147` (`'Inserisci un indirizzo email valido.'`).

7. **(I contrasti delle Statistiche: CHIUSI — R-15.8b-e)** I tre esemplari di competenza salgono sopra soglia **in tema chiaro**, senza scendere sotto soglia in tema **scuro**: `.util-bar .seg` **2,47 → ≥3,0** (oggetto grafico, **4 consumer**: le due liste di `reports-console` + i due `RankBars`); le **quattro fasce** di "Composizione movimenti" (`reports-console.tsx:18-23`) **2,73 / 2,04 / 4,85 / 3,61 → tutte ≥3,0**; **`.chart-label`** (`--ink-4`) **3,66 → ≥4,5** (è **testo**). **Vincoli non negoziabili**: (i) **nessun token esistente cambia valore** (regola di architettura dell'epic) ⇒ il fix è **additivo** — token nuovo dedicato, o riuso di un token/classe già misurato sopra soglia; (ii) **nessun literal di colore nuovo** fuori dai token; (iii) il fix vale **desktop e mobile** ⇒ **desktop rimisurato** a 1280 e dichiarato; (iv) ⚠️ **misura dei GEMELLI** (lezione 15.3): enumerare e misurare **tutte** le superfici che usano il token/la classe toccati, **nei due temi** — `.util-*` ha 4 consumer su questa pagina, `--ink-4` è usato **anche altrove** (`.so-sub`, TD (h)), e le fasce condividono `--ok`/`--accent` con superfici della Contabilità; (v) ⚠️ **se la 15.8a ha già introdotto un token/una classe per gli oggetti grafici sotto soglia, si RIUSA** — due decisioni per lo stesso token sono vietate: il dev lo verifica sul repo consegnato e lo dichiara. **Verifica**: rapporto di contrasto misurato canvas→WCAG con lo sfondo effettivo risolto **risalendo gli antenati partendo dall'elemento** e l'alpha letta **prima** della composizione (una `paint()` che pre-riempie di bianco dà alpha 1 sempre e misura tutto contro il bianco, sbagliando il tema scuro), **prima e dopo**, nei due temi, su ogni esemplare enumerato.

8. **(`reports.spec.ts` entra INTERO nella catena serializzata — R-15.8b-f)** L'intero `e2e/reports.spec.ts` esce dal project `chromium` (`testIgnore` in `playwright.config.ts:37-45`) e diventa **un project della catena serializzata**, chiudendo il TD annoso del **`PUT /api/v1/settings/scheduling` GLOBALE** eseguito a `:307-315` da un project `fullyParallel` **senza ripristino** (registrato in `action_items` dal 14.4 come TD (b), **AGGRAVATO dalla 15.4**: da quando `assertWithinSchedulingWindow` vale anche su `updateBooking`, **ogni** `moveBooking` della suite eredita quella finestra, e le fixture "oggi" di `mobile-planning` escono dalla finestra se la suite gira prima delle ~07:20 o dopo le ~20:40 Roma). L'AC impone **tutte e quattro** le condizioni ratificate: (a) **posizione nella catena motivata** nel record (in relazione a `booking-window`, che possiede `sched.*` e lo controlla — e a `settings`, che scrive la stessa card); (b) **run locale `--no-deps` funzionante** (dimostrato: comando e esito nel record); (c) **ripristino** in `afterAll` di **ogni** `AppSetting` che lo spec scrive, **verificato in DB** (psql), non assunto; (d) **misura del costo in durata della suite, prima/dopo** (il numero, non "trascurabile"). ⚠️ E la regola dell'epic: **lo spec non si indebolisce** — i suoi 5 test restano tutti, con le stesse asserzioni (lezione 14.6).

9. **(Convenzione testid — nessun duplicato, e nessun TESTO duplicato)** Desktop **invariati**: `reports-period-{month,year}`, `reports-rank-{aircraft,pilots}`, `reports-fleet-row-*`, `reports-instructor-row-*`, `reports-rank-aircraft-row-*`, `reports-rank-pilot-row-*`, `club-settings-{card,save,feedback}`, `club-{icao,contact-email,metar-station,landing-fee,membership-fee,instructions-it,instructions-en}-input`, `airfield-{settings-form,name-input,settings-save,settings-feedback}`, `scheduling-settings-{card,save,feedback}`, `scheduling-{open-time,close-time,min-slot,turnaround,max-advance}-input`, `smtp-settings-{card,save,feedback}`, `smtp-{host,port,security,from,user,pass}-input`/`-select`, `smtp-test-email-{button,feedback}`, `treasury-settings-{card,save,feedback}`, `treasury-opening-{cash,bank,date}-input`, `ratings-settings-card`, `ratings-{add-button,feedback}`, `rating-{row,edit-button,form,name-input,scope-select,validity-input,form-submit,form-error}`, `medical-{settings-card,add-button,feedback,row,edit-button,form,name-input,scope-select,validity-input,form-submit,form-error}`, `cash-categories-{settings-card,feedback}`, `cash-category-{add-button,rename-button,delete-button,row,form,name-input,form-submit,form-error}`. Le superfici mobile usano il **suffisso `-mobile`** dove duplicano una superficie desktop e il **prefisso `mobile-`** dove esistono solo su mobile (`mobile-rating-list`, `mobile-rating-sheet`, `mobile-cash-category-list`, `mobile-fleet-util-more`, …). ⚠️ **Nessun nome nuovo può cominciare per un prefisso `^=` in uso** (`ac-card-`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`) — ⚠️ **attenzione a `mobile-fleet-`**: un nome come `mobile-fleet-util-row-*` per l'albero mobile di "Utilizzo flotta" **collide** col prefisso `^=` della 15.5 (Anagrafiche/flotta) e va evitato; né si possono riusare le **quattro famiglie composte** `reports-*-row-*`. **Verifica obbligatoria prima di scegliere ogni nome**: `grep -rn 'data-testid\^=' e2e/` **rifatto sul repo consegnato dalla 15.8a**, col risultato riportato nel record. **Verifica finale**: un `page.getByTestId(id)` per **ciascuno** dei testid elencati restituisce il numero **atteso** di nodi (1 per i singleton, N per i per-riga) a 375px **e** a 1280px su `/dashboard/reports` e `/dashboard/settings`; **e** i due nomi accessibili letti page-level dagli spec (`'Blocca prenotazioni'`, `'Inserisci un indirizzo email valido.'`) restituiscono **un solo** nodo a 1280px.

10. **(Geometria e layering, con la tab bar della 15.1 presente)** A 320, 375 e 390px, su `/dashboard/reports` e `/dashboard/settings`: **nessun overflow orizzontale di pagina**; **nessun contenitore interno con scroll orizzontale nascosto** (per ogni discendente di `.page`, `scrollWidth <= clientWidth + 1`), con l'elenco delle eccezioni **dichiarate** — la KPI strip è scrollabile per progetto; le tabelle desktop non contano perché sono `display:none`; **nessun controllo finisce sotto la tab bar** (hit-test `elementFromPoint` su **ogni** `.page a, .page button, .page input, .page select, .page textarea` visibile a fondo pagina dopo uno scroll **reale**; baseline misurata: Statistiche `covered: []`, Impostazioni **12** `cash-category-rename-button` con hit `MAIN.page` — che è il difetto dello **scroll orizzontale**, non della tab bar: il dev deve **discriminare** le due cause); lo sheet (z 40) copre la tab bar con lo scrim; i popover portalati dei picker (65/66 — il `DateInput` della Tesoreria) restano **dentro il viewport**; i toast (200) sopra tutto. **In più, la guardia di CONTENIMENTO** (lezione 15.5 F1): per ogni card delle tre liste, ogni figlio che può crescere (nome del tipo, sub con `scope`/validità, badge di stato) ha `child.right <= card.right`; e per ogni riga ranked, il valore mono a destra idem.

11. **(Ogni regola nuova ha la sua guardia, provata DISCRIMINANTE)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` dei corpi desktop a ≤640px; (ii) `display:none` degli alberi mobile >640px; (iii) i target ≥44px, con soglia **43,5** e guardia scritta sul **requisito** (mai calibrata sul valore ottenuto); (iv) nessun testo clippato **senza ellissi** a 320px; (v) contenimento dei figli della card (AC 10); (vi) nome accessibile dello sheet ben formato, su **proprietà** (`not.toMatch(/—\s*—/)`, nessun segmento vuoto) e **non** su `split` (lezione 15.5 F1) — provata su un tipo **senza validità** ("senza scadenza") e su uno **senza scope**; (vii) empty state = **un solo** nodo per albero, con la simulazione DOM del pre-fix (`node.parentElement.appendChild(node.cloneNode(true))`, metodo review 15.6 LOW-3 — **non** "non iniettabile"); (viii) il **cap** delle liste ranked: la guardia è il **numero di righe rese** a 375 **e** a 1280 (dove devono esserci **tutte**), più l'espansione da "Mostra tutte"; (ix) **nessuna regola tocca `.segmented`** fuori da questa pagina (misura pre/post su `/dashboard/bookings`, `/dashboard/expiries`, `/dashboard` a 375px), né `.util-*` fuori dalle Statistiche, né `.split` fuori da queste due pagine (misura su `/dashboard/billing`, **superficie appena consegnata dalla 15.8a**), né `.date-input` fuori dalla card Tesoreria (misura su `/dashboard/logbook`, `/dashboard/movements`, `/dashboard/billing`), né `.popover`/`MobileSheet` in modo da toccare l'**`ExportMenu`** della 15.8a (misura su `/dashboard/fleet` a 375 e 1280); (x) i comportamenti di dominio dell'AC 6 che sono invisibili a occhio (il 409 distinto, il **422 `FLIGHT_BLOCKED_BY_EXPIRY`** da un tipo creato dal telefono, l'assenza di "Elimina" sulle categorie di sistema). Ognuna va **provata rossa** simulando il pre-fix col repo **intatto** (iniezione CSS/DOM/`addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2, o `git stash` del solo `src/` con lo spec al suo posto, metodo 15.5 §12). Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

12. **(Invarianti)** Desktop >640px **invariato** su `/dashboard/reports` e `/dashboard/settings` (lezione 15.3 claim 3: "desktop invariato" ≠ "nient'altro è cambiato"): misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) sui valori già rilevati come baseline — `.app` `grid-template-columns` `232px 1048px` / `64px 736px` / `64px 577px`; **Statistiche** `.page-head` **51,44**, `.kpi-row` `grid` **188,8×5** @1280 e **254,5×2** @641/800, SVG **612,7** e **287,3** @1280, `docH` **17.794** @1280; **Impostazioni** le 7 altezze di card **807,8 / 396,9 / 385,2 / 296,6 / 2431,2 / 398,5 / 1201,5** @1280, `.form-grid` **468px 468px** @1280 e **232,5px 232,5px** @641, `docH` **6.269** @1280; `pageOverflow 0` ovunque; tab bar `display: none` a >640px. **E le superfici della 15.8a non regrediscono**: `/dashboard/billing` e l'`ExportMenu` su almeno **due** consumer, misurati a 375 e 1280 contro lo stato consegnato. `npm run gates` verde; **nessuna dipendenza npm nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (metodo in AC 7) ≥**4,5:1** per il testo e ≥**3:1** per gli oggetti grafici, in tema **chiaro e scuro**, **enumerando tutti gli esemplari** (la 15.4 ha trovato un pallino a 1,76:1, la 15.3 un glifo a 1,24:1, la 15.6 uno sfondo `--ink-4` a 3,66:1: non fidarsi dell'elenco); gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

13. **(Multi-attore — lezione 15.1 F1)** Le due pagine sono **ADMIN-only** (misurato: pilota → `/it/dashboard` su entrambe). La verifica per attore **non è opzionale**: ADMIN, PILOTA, ALLIEVO, ISTRUTTORE a **375 e 1280px**, con `page.context().clearCookies()` fra un'identità e l'altra, asserendo che il **redirect regge anche a 375px** e che nessuna delle due voci compare nella tab bar né nello sheet "Altro" dei tre non-admin. Caso specifico da coprire perché è l'unico non ovvio: un attore con `finance.manage` ma **senza** `settings.manage` (o viceversa) — se non è costruibile col modello di ruoli post-14.9 (ADMIN ha tutto), va **dichiarato** e provato con una misura sul render, non saltato in silenzio.

14. **(Debito tecnico — dichiarato, non subìto in silenzio)** Il record dice per **ciascuno** dei TD che toccano queste pagine se la story lo **chiude**, lo **subisce** o lo **aggrava**, con la misura: (a) **`reports.spec.ts:307-315`** (PUT scheduling globale da project `fullyParallel`) — **CHIUSO qui** (R-15.8b-f), con le quattro prove dell'AC 8; (b) i **contrasti** `.util-bar .seg`, fasce mix e `.chart-label` — **CHIUSI qui** (R-15.8b-e), col fix additivo e i gemelli misurati; (c) **`.chart-label` a `--ink-4`** è la faccia "grafici" del TD (h): se il fix la chiude, **dichiarare che cosa resta** del TD (h) altrove (`.so-sub`, che la 15.8a ha misurato attivo su `TransactionEditor`); (d) **la pagina Statistiche alta 21.485px** con due card da ~9.400px — artefatto di volume DB (145 velivoli), **mitigato** su mobile dal cap dichiarato, **non risolto** sul desktop (17.794px): dichiarato; (e) **`club-contact-email-input`** `cw 275 / sw 300` (testo tagliato senza ellissi dentro un input) — pre-esistente, **fuori mandato** se non tocca i 44px: dichiarato; (f) **il `minGap` 6,03** delle label a 1280px sulla card stretta — desktop pre-esistente, dichiarato; (g) **`viewport-fit=cover`** mai dichiarato ⇒ tutti gli `env(safe-area-inset-*)` valgono 0 (TD di epic, 15.10); (h) la ✕ di `SlideOver` a **32px** e le opzioni del typeahead a **36px** (TD (k) della 15.7) — se un pannello di questa story le usa, dichiarare.

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):

1. ⚠️ **`reports.spec.ts:249` e `:321` contano `.kpi-row .kpi .kpi-value` PAGE-LEVEL** (`.nth(0..2)` e `toHaveCount(5)`). È la **causa di rottura n.1** delle Statistiche: qualunque seconda `.kpi-row` (o `.kpi` mobile aggiuntiva) raddoppia il conteggio **a 1280px**. La cura corretta è **non creare un secondo nodo** (la KPI strip dell'epic è già una variante CSS dello stesso nodo, 15.3) — e R-15.8b-c la lascia **invariata**, quindi il rischio si chiude per costruzione: **va comunque asserito**.
2. ⚠️ **`expiry-types.spec.ts:167-176`** — `page.getByLabel('Blocca prenotazioni')` **page-level** (`check()`, `toBeChecked()`, `uncheck()`): un gemello mobile della checkbox rompe lo strict mode a 1280px.
3. ⚠️ **`settings.spec.ts:147`** — `page.getByText('Inserisci un indirizzo email valido.')` **page-level**: il messaggio di errore non può comparire due volte. Stessa classe di `expiry-dashboard.spec.ts:135` (15.7 blast radius 2).
4. **`reports.spec.ts:255-260`** — i quattro testid composti col dato di dominio (`reports-fleet-row-*`, `reports-instructor-row-*`, `reports-rank-aircraft-row-*`, `reports-rank-pilot-row-*`): l'albero mobile **non può riusarli**, e il cap client-side **non può togliere righe a 1280px**.
5. **`settings.spec.ts` (catena, 2° project), `booking-window.spec.ts` (3°), `treasury-settings.spec.ts` (4°)** — tre project serializzati che **guidano** le card di Impostazioni: ogni cambio di forma di quelle card li tocca, e **ogni spec nuovo che scriva `AppSettings` deve entrare nella catena** (modello: `mobile-membership-fee`, 15.7).
6. ⚠️ **La catena stessa**: R-15.8b-f la **allunga** (`reports` in catena) e lo spec mobile delle Impostazioni la allunga ancora. La **posizione** di ciascuno va motivata, il `testIgnore` del project `chromium` aggiornato **nello stesso commit**, e il **costo in durata** misurato (AC 8 d).
7. **`treasury-settings.spec.ts` → tutte le spec di `/dashboard/billing`**: i saldi di apertura alimentano `getBillingSummary`. Un test nuovo che scriva la Tesoreria fuori dalla catena romperebbe le superfici della **15.8a** appena consegnate.
8. **`rbac.spec.ts`** — i redirect dei non-admin restano.

**Unit**: nessuno copre oggi queste superfici. I nuovi sono quelli di AD-5.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):
- la **fascia tablet 641-900px**: nessuna regola di questa story deve toccarla (R1) — misurare a 800 e 641px che nulla di nuovo compaia, che il rail resti 64px e che le baseline di §a.1/§a.2 a quelle larghezze restino;
- il **tema scuro** delle superfici nuove — **enumerare gli esemplari, non fidarsi dell'elenco**;
- ⚠️ **le superfici della 15.8a** (`/dashboard/billing` e l'`ExportMenu` su nove consumer): una regola non ancorata di questa story arriverebbe lì, e la regressione sarebbe invisibile agli spec che girano a 1280. Misura obbligatoria (AC 11 ix, AC 12);
- **Pianificazione, Panoramica e Scadenze**, se una regola tocca `.segmented` senza ancorarla (6 consumer, **due dei quali su questa pagina**);
- il **registro voli**, i **movimenti**, la **contabilità** e la **scheda persona**, se una regola tocca `.date-input` senza ancorarla;
- l'**assenza di qualunque `key`** sulle sette card di Impostazioni: lo stato di un form sopravvive a tutto, compreso un salvataggio riuscito — AD-3;
- il `metricIndex` locale dei due `RankBars` (`rank-bars.tsx:49`), che **sopravvive** a ogni navigazione: se il cap "Mostra tutte" tiene stato, decidere e dichiarare che cosa succede quando cambia la metrica.

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-reports.spec.ts`** (project `chromium` `fullyParallel`; `setViewportSize` **dentro il test**, pattern 13.10): KPI (strip invariata, un solo nodo), periodo e metriche a ≥44px, grafici (larghezza e `minGap`), liste ranked col cap e l'espansione, geometria. ⚠️ **non deve** scrivere `settings/scheduling` (e non ne ha motivo: quel test è di `reports.spec.ts`, che con R-15.8b-f finisce in catena).
- **Spec nuovo `e2e/mobile-settings.spec.ts`** — ⚠️ **DEVE entrare nella catena serializzata** (dopo `mobile-membership-fee` o nella posizione che il dev motiva), con `testIgnore` nel project `chromium` e un `afterAll` che **ripristina** ogni `AppSetting` toccato, **verificato in psql** (modello 15.7 TD (l)). Copre: le 7 card, i target, le tre liste a card + sheet, il CRUD `ExpiryType` (compreso `blocksBooking` → **422 `FLIGHT_BLOCKED_BY_EXPIRY`**) e delle categorie, il multi-attore.
- **Migrazione di `e2e/reports.spec.ts` nella catena** (R-15.8b-f): `testIgnore` nel project `chromium` + project nuovo con `dependencies`, posizione **motivata**, `--no-deps` locale **dimostrato**, ripristino delle settings scritte, costo in durata **misurato**. Lo spec **non si indebolisce**: i 5 test restano com'erano.
- **Modifiche ad altri spec esistenti**: da **evitare**; ogni modifica va motivata e non deve ridurre la copertura (lezione 14.6). Le uniche candidate previste sono lo scoping di `expiry-types.spec.ts:167-176` e di `settings.spec.ts:147` **se e solo se** la soluzione crea un secondo nodo — e in quel caso la riscrittura va **al valore corretto** (scoping alla card), mai indebolita.
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-5, verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**
- Ogni test crea le **proprie** fixture (tipo di scadenza run-unique, categoria di cassa run-unique, persona run-unique) e le raggiunge **tramite i filtri della pagina** o via API filtrata — mai per posizione in lista (Abilitazioni ha **43** tipi, Categorie **21**).
- ⚠️ **Nessun test nuovo scrive `AppSettings` fuori dalla catena** — e chi la scrive **ripristina** in `afterAll`, **verificandolo in DB**.
- ⚠️ **Nessun test nuovo crea un `ExpiryType` con `blocksBooking = true` e lo lascia lì** (TD già registrato: 11 tipi bloccanti sul DB post-suite, che fanno fallire i `POST /flights` di ogni altra spec). Il test dell'AC 6 che ne crea uno **deve cancellarlo** in `afterEach`/`afterAll`, e dichiararlo.
- ⚠️ **Nessun test nuovo asserisce un aggregato GLOBALE con uguaglianza** (i KPI delle Statistiche): delta a finestra breve su una fixture run-unique, oppure il project serializzato — mai fotografia+uguaglianza (review Billing-2 F4).
- Le fixture create alimentano i TD di volume: il dev deve dire **quante ne crea per run**.
- Attori: le due pagine sono **ADMIN-only** ⇒ verifica multi-attore obbligatoria (AC 13), redirect incluso.

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)
- Sostituzione degli alberi: asserire **entrambi** i lati (tabella `none` + lista visibile a 375px; l'inverso a 1280px).
- Card di Impostazioni: **non** "il controllo esiste" — sono le **altezze misurate** contro il pre-fix (le 7 baseline di §a.2, **nei due locale**) e la **raggiungibilità** di ogni azione (hit-test, non solo dimensione).
- Cap delle liste ranked: la guardia è il **numero di righe rese** (capped a 375, **tutte** a 1280) e l'espansione, non "la riga finale esiste".
- Target: soglia **43,5**, mai calibrata sul valore ottenuto (lezione 15.7 MINOR-1).
- Nome accessibile dello sheet: guardia su **proprietà**, non su `split` (lezione 15.5 F1), provata rossa su un tipo senza validità e su uno senza scope.
- Contenimento: guardia sul **rect** dei figli della card, non solo lo sweep degli scroller (cieco sugli elementi ellissati).
- `blocksBooking`: la guardia è il **422 `FLIGHT_BLOCKED_BY_EXPIRY`** su una persona priva del documento, non "la checkbox è spuntata".
- Catena: la guardia di R-15.8b-f è il **run locale `--no-deps`** verde **e** il ripristino verificato in DB, non "il project esiste in config".
- Contrasti: misura canvas→WCAG **prima e dopo**, nei due temi, su ogni esemplare **enumerato**, compresi i gemelli del token/classe toccati.
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). **Baseline attesa: 405 test** (il totale verificato dall'arbitro della 15.7) **più quelli della 15.8a** più quelli nuovi — il dev riporta il totale atteso e quello ottenuto. ⚠️ La **durata** della suite va misurata prima/dopo (AC 8 d): questa story allunga la catena serializzata di **due** project. Se il dev non completa il gate, la **review lo riesegue da arbitro** (prassi 13.9/13.11/15.2-15.7).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- **Story gemella, da leggere PRIMA di cominciare**: `15-8a-contabilita-exportmenu-mobile.md` + il suo Dev Agent Record e la sua review — è stata consegnata subito prima e lascia sul repo: il nuovo `ExportMenu` (bottom sheet ≤640px), il pattern **KPI tappabile → sheet**, il blocco `airops.css` della 15.8a (che sposta i numeri di riga di §a.4) e, possibilmente, **il token/la classe per gli oggetti grafici sotto soglia** che questa story deve **riusare** (AC 7 v).
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index), `15-2-primitive-mobile.md` (API delle primitive, R-15.2-a..g, guardia cieca, prova per rebuild), `15-3-panoramica-mobile.md` + review (selettore ancorato; **R-15.3-c sulla KPI 2×2**, qui NON applicata), `15-4-pianificazione-mobile.md` + review (chip strip, fixture indipendenti dall'ora, guardia sul lato liberato, **tetto 100 di `getStats` paginato**: il precedente che spiega perché il cap di R-15.8b-b è client-side), `15-5-anagrafiche-card-mobile.md` + review (**AD-5 sui selettori `^=`**, guardia cieca da `split`, ellissi che nasconde gli sfondamenti, parità enumerata), `15-6-registro-voli-mobile.md` + review, `15-7-scadenze-transiti-mobile.md` + review (asimmetria del remount, guardie sul requisito, `secondStep`, **project serializzato nuovo col ripristino verificato in DB**).
- Story di dominio da rileggere: `12-10` e `12-11` (nel file dell'epic 12: statistiche, impostazioni, METAR, `fleetUtilization` e il "mai un finto 0%"), `6-1-expiry-types.md` (il catalogo e `blocksBooking`), `7-4-booking-expiry-block.md` e `14-4-guardrail-registrazione-volo.md` (le due guardie che `blocksBooking` alimenta), `3-4-cash-categories-movements.md` (le categorie di sistema), `billing-1-fondamenta.md`/`billing-2-pagina.md` (perché la Tesoreria alimenta ogni spec di billing).
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/expiries/scadenze-console.tsx` (15.7: pannello full-screen riusando il contenuto di una modale), `src/app/[locale]/dashboard/movements/movements-table.tsx` (15.7: `secondStep` con effetto), `src/app/[locale]/dashboard/billing/billing-console.tsx` (**15.8a**, il più fresco: card+sheet+`secondStep` su una console con azioni).
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale; ⚠️ `npm run start` **fallisce** con il `JOBS_SECRET` segnaposto di `.env`: serve `export JOBS_SECRET=<valore non-segnaposto>` anche solo per servire la build; MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway **con import per path assoluto** (`/home/admin/AirManager/node_modules/playwright-core/index.mjs`) e Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`; credenziali di seed `admin@airmanager.local` / `SEED_ADMIN_PASSWORD` di `.env`, più `pilot@`/`instructor@`/`student@airmanager.local` con la stessa password).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile settings screen pattern", "chart on small screen", "long list truncation mobile", "mobile CRUD list with destructive action").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.8b): statistiche e impostazioni mobile — liste ranked con cap dichiarato, card di configurazione con azioni nello sheet, reports.spec in catena` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **Contabilità e redesign dell'`ExportMenu`** → **15.8a** (consegnata prima). Qui non si tocca `/dashboard/billing` né `export-menu.tsx`: le uniche misure su quelle superfici sono le **guardie di non-regressione** (AC 11 ix, AC 12).
- **Aree self `my-account`/`my-compensation`** e il **modulo PPR pubblico `/ppr`** → **15.9**.
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover`, la riserva sticky di R-15.2-g, la ✕ a 32px di `SlideOver` e le opzioni del typeahead a 36px → **15.10**.
- **Qualunque modifica alle API, agli schemi Zod o al dominio**: il calcolo dei KPI, i cap di `getStats`, il ciclo di vita di `ExpiryType`/`CashCategory` e la validazione dello scheduling **non si toccano** (R-15.8b-b: "Nessun cambio API").
- **La correzione dei difetti pre-esistenti misurati e non ratificati**: `club-contact-email-input` clippato; il `minGap` **6,03** delle label a 1280px sulla card stretta; il taglio senza ellissi delle celle `.student-row` desktop; l'altezza desktop della pagina Statistiche (17.794px).
- **La guardia AOG sulla registrazione del volo** e la **data di rientro sull'AOG**: story dedicata post-Epic-15, requisiti già fissati dal PO.
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/`SlideOver`/`joinSegments`: si **riusano**, non si reinventano.

---
---

# Appendice — le ratifiche in esteso (il fatto misurato, le opzioni, la decisione PO)

> Questa sezione conserva integralmente il ragionamento del draft 15.8: serve al dev per capire **perché** una decisione è quella, e quali alternative sono già state scartate. Le decisioni sono chiuse: non si riaprono. ⚠️ Due delle sei (Q12, Q13) hanno una decisione **diversa dalla raccomandazione del teammate**: leggerle con attenzione.

### Q1 → **SPLIT** (R-15.8b-a)

**Il fatto, con i numeri.** Il piano assegnava alla 15.8 *"KPI, registro entrate/uscite con filtri, secchiello, bar chart orizzontali, card impostazioni; export/PDF raggiungibili da mobile"*. Le tre pagine reali misurano:

| | righe di codice della superficie | oggetti da portare | scritture | overlay | spec e2e che le guidano |
|---|---|---|---|---|---|
| **Contabilità** | 1.661 | tabella a 9 colonne (988px), 3 riquadri, 8 gruppi di controllo, 2 card secondarie, 1 card saldi, paginazione a 12 pagine | 3 + 1 form a 3 rami | 2 `.mini-modal` + 1 `SlideOver` | `billing` (13), `billing-global` (2, catena), `cash-register` (5), `cash-report` (4), `account-adjustments` (4) |
| **Statistiche** | 363 (+ 249 di componenti grafici condivisi) | 5 KPI, 4 grafici, 4 liste, 2 toggle | **nessuna** | nessuno | `reports` (5) |
| **Impostazioni** | 1.825 (7 card) | 7 card, 3 tabelle CRUD, ~20 campi di form | **~15 endpoint** | nessuno (form inline) | `settings` (7, catena), `booking-window` (4, catena), `treasury-settings` (3, catena), `expiry-types` (6) |
| **totale** | **3.849** (+249) | | **~19 scritture** | 3 | **53 test in 10 file, 4 dei quali in catena serializzata** |

Per confronto la 15.7 toccava **1.647 righe** con **3** scritture e **nessuno** spec in catena alla creazione. Il perimetro pieno era **2,3×** in codice e **~6×** in scritture, e le tre pagine **non condividono né codice né pattern**: la Contabilità è una console-lista, le Statistiche sono sola lettura, le Impostazioni sono **sette form** — un pattern che l'epic non aveva ancora affrontato.

**Decisione PO: SPLIT** — 15.8a = Contabilità + redesign `ExportMenu`; **15.8b = Statistiche + Impostazioni**, cioè "sola lettura + form", con la catena serializzata **tutta da una parte sola** e un gate leggibile.

### Q8 → **A** (R-15.8b-b) — grafici invariati, liste col cap dichiarato

**Il fatto misurato**: i tre grafici SVG (`LineChart` Ricavi, `BarChart` Ore volate, `BarChart` Transiti) **scalano già** a 281px di larghezza a 375px, le loro label sono **già** diradate a 6 su 12 dalla regola 13.10 (`minGap` **27-28px** a 375, **18,7** a 320) e i loro marchi hanno un contrasto **sopra soglia** (linea **4,54** chiaro / **3,89** scuro; barre 18,79/15,74). Cioè **i grafici temporali non sono rotti su mobile**. Quello che è rotto è il resto: "Utilizzo flotta" ha **145 righe** e la card è alta **9.356px**, "Per aeromobile" (`RankBars`) ne ha altre **145** per **9.398px**, e la pagina misura **21.485px** — **26 schermate**. `topPilots` è invece cappato a **10** lato server, e "Ore istruttori" ne ha 5. Il template, per parte sua, disegna **solo** due liste a barre e **nessun grafico temporale**.

**Opzioni**: **A** grafici invariati + **cap client-side dichiarato** sulle due liste lunghe (nessun cambio server) · **B** cap **server-side** su `fleet` (risolverebbe anche il desktop, ma è un cambio di API in una story il cui mandato è la UI — e la 15.4 F3 ha già deciso, sullo stesso servizio, nella direzione **opposta**: paginare fino a `total`) · **C** scroller interno ad altezza fissa (nessuna informazione persa, ma uno scroller annidato in una pagina già lunga) · **D** grafici sostituiti dalle barre del template (**perde la serie storica**: vietato da R4 nella sostanza).

**Decisione PO: A** — grafici **INVARIATI**; liste da 145 righe con **cap client-side DICHIARATO** (`"prime N · Mostra tutte"`, pattern 13.4). **Nessun cambio API**. Nota onesta che resta valida: il numero misurato (145 velivoli) è un artefatto del DB di test — su un'aviosuperficie reale la flotta è di 10-30 velivoli.

### Q9 → **A** (R-15.8b-c) — i KPI restano una strip

**Il fatto**: la `.kpi-row` rende **4 o 5** KPI (`Ricavi`, `Ore volate`, `Movimenti`, `Quota transiti`, e `Utilizzo flotta` **solo se** `sched.openTime/closeTime` sono configurati e c'è almeno un velivolo operativo — story 12.11 AC 6: mai un finto 0%). Sul DB attuale sono **5**, e la strip misura `cw 375 / sw 826`. La ratifica R-15.3-c ha introdotto la variante 2×2 **"per le facce con esattamente QUATTRO KPI"**, motivandola col **valore d'uso** dei numeri nascosti; la 15.7 l'ha applicata alle Scadenze e la review ha misurato che **è costata 97,7px** facendo **scendere** la prima card. Qui i cinque numeri sono tutti statistica: nessuno richiede un'azione. ⚠️ E `reports.spec.ts:249/321` conta `.kpi-row .kpi .kpi-value` **page-level** con `toHaveCount(5)`.

**Opzioni**: **A** strip invariata (i numeri 3-4-5 con uno swipe) · **B** 2×2 (con 5 card diventa 2+2+1: ~150px in più su una pagina alta 21.485px, ultima riga spaiata) · **C** 2×2 **solo quando i KPI sono 4** (coerente alla lettera con R-15.3-c, ma produce **due layout diversi** sulla stessa pagina secondo la configurazione del club — e la catena serializzata scrive proprio quella `AppSetting`).

**Decisione PO: A** — **strip invariata (4 o 5, nessun ramo)**. R-15.3-c è motivata dal valore d'uso dei numeri nascosti; qui la pagina si apre per *guardare*, e lo swipe è il gesto naturale. **C** è esclusa esplicitamente: un layout che dipende da una `AppSetting` è la cosa più difficile da guardare con un e2e.

### Q10 → **A** (R-15.8b-d) — le card di Impostazioni, e il CRUD `ExpiryType` dal telefono

**Il fatto misurato**: la pagina è alta **7.446px**, ha **sette** card, **231** target sotto i 44px (di cui **201 a 24,7px**: i `.btn.mini` delle tre tabelle), e le azioni di riga stanno **a x≈503-690 in un viewport da 375** — raggiungibili solo scorrendo la tabella in orizzontale (hit-test sul loro centro = `MAIN.page`). I `.form-grid` sono **già** a colonna singola sotto 640px, quindi i **form** funzionano: quello che non funziona sono **le tre tabelle CRUD** e i **target**. Le sette card non sono omogenee: quattro sono form puri (Club, Pianificazione, SMTP, Tesoreria), tre sono tabelle con azioni. Il template disegna **una** lista di tipi **in sola lettura** e due segmented non implementabili.

**Opzioni**: **A** tutto resta in pagina, con la cura minima (tre tabelle → liste a card + **sheet** con le azioni, conferma di cancellazione come `secondStep`; form invariati coi target a 44px e i "Salva" full-width) · **B** le sette card diventano un **indice** e ognuna apre un pannello a tutto schermo (pagina a ~500px, ma **pattern nuovo** e il **doppio albero su sette card** = il costo in testid più alto dell'epic, con **tre project serializzati** che guidano quei form) · **C** A per i form, B per le tre tabelle.

**Sotto-decisione (il CRUD `ExpiryType`)**: qui si amministra il catalogo che **altrove blocca** (`blocksBooking` → guardie 7.4 e 14.4). Risposta misurata sul codice: da mobile **non cambia niente** — `PATCH` e `DELETE` sono gli stessi endpoint, il `DELETE` di un tipo **in uso** risponde **409** e la card mostra "in uso" (`ratings-card.tsx:150-153`), e disattivare un tipo bloccante lo toglie dalle guardie senza cancellarlo. L'unica cosa che cambia su un telefono è **quanto è facile toccare per sbaglio "Elimina"**: oggi è un bottone da 24,7px accanto ad altri due, fuori schermo.

**Decisione PO: A + la sotto-decisione** — Impostazioni **tutto in pagina**; le 3 tabelle → **card+sheet con azioni SOLO nello sheet**, **"Elimina" = `secondStep`**, **409 "in uso" a toast**; e un **e2e che prova il 422 `FLIGHT_BLOCKED_BY_EXPIRY` da un tipo creato DAL TELEFONO**.

### Q12 → **TUTTO ORA** (R-15.8b-e) — i contrasti delle Statistiche

**I fatti misurati** (canvas→WCAG, tema **chiaro**; in tema scuro sono tutti sopra soglia) — **la parte di competenza di questa story**:

| oggetto | dove | misura | soglia | tipo |
|---|---|---|---|---|
| `.util-bar .seg` (Utilizzo flotta + i due `RankBars`) | `airops.css` | **2,47** (dark 10,45) | 3 | oggetto grafico |
| fasce di "Composizione movimenti" (`--ok`, `--accent`, …) | `reports-console.tsx:18-23` | **2,73 / 2,04 / 4,85 / 3,61** (dark 9,3/9,96/5,72/7,73) | 3 | oggetti grafici (**due** sotto soglia) |
| `.chart-label` (label degli assi) | `--ink-4` | **3,66** (dark 4,14) | 4,5 | **testo** |

(Gli altri quattro esemplari — `billing-by-category-row` in **2,73** / out **3,96**, `negative-balance-row` **3,96**, barra "in" di "Per categoria" **2,47** — vivono su `/dashboard/billing` ⇒ **15.8a**.)

**Opzioni offerte**: chiudere gli oggetti grafici qui (serve una scelta di colore o un bordo: i token `--ok`/`--accent` sono per costruzione tenui su bianco) / rimandarli alla 15.10 col mobile che non eredita la coppia; `.chart-label` col resto del TD (h) in 15.10 / qui.

**Decisione PO: TUTTO ORA** (la raccomandazione del teammate era 2-B, 3-A: rimandare gli oggetti grafici): tutti e sette i contrasti si chiudono nelle due story, con **fix token-level MISURATI nei due temi**, ripartiti per superficie posseduta, e con l'obbligo di **misurare i GEMELLI** su tutte le superfici che usano quei token (lezione 15.3), **desktop rimisurato**. Il vincolo di architettura resta: **nessun token esistente cambia valore** ⇒ il fix è additivo (v. AC 7). E se la 15.8a ha già introdotto il rimedio per gli oggetti grafici, **si riusa**.

### Q13 → **TUTTO `reports.spec` IN CATENA** (R-15.8b-f)

**Il fatto**: `reports.spec.ts:307-315` esegue un **`PUT /api/v1/settings/scheduling` GLOBALE** (`07:00-21:00, 60, 15, 30`) dal project `chromium` **`fullyParallel`**, **senza ripristino**. È registrato in `action_items` dal 14.4 come TD (b), e la 15.4 lo ha **AGGRAVATO**: da quando `assertWithinSchedulingWindow` vale anche su `updateBooking` (ratifica 15.4, incondizionata), **ogni** `moveBooking` della suite eredita quella finestra, e le fixture "oggi" di `mobile-planning` escono dalla finestra se la suite gira prima delle ~07:20 o dopo le ~20:40 Roma. La nota di `sprint-status.yaml` dice testualmente: *"la priorità di (b) SALE"*. **Questa story possiede `/dashboard/reports`** — è la prima e forse l'ultima occasione naturale per chiuderlo.

**Opzioni**: **A** l'intero `reports.spec.ts` esce da `chromium` ed entra nella catena (più netto; serializza anche quattro test che non ne avrebbero bisogno) · **B** si sposta **solo** il test colpevole (`fleetUtilization`, `:307-315`) dentro `booking-window.spec.ts`, che quella chiave la possiede già (il taglio chirurgico) · **C** si subisce.

**Decisione PO: A — TUTTO `reports.spec` in catena** (la raccomandazione del teammate era **B**). Motivazione ratificata: chiude **sia** il TD del PUT scheduling globale **sia** la **time-dependency** della suite. L'AC deve imporre: **posizione nella catena motivata**, **run locale `--no-deps` funzionante**, il **ripristino** delle settings che lo spec scrive, e la **misura del costo in durata della suite (prima/dopo)** — v. AC 8.

---
---

# Dev Agent Record — story 15.8b (Opus 5 xhigh, 2026-08-05)

Status: **implementata, gates verdi, suite completa CI=1 su build di produzione e DB fresco eseguita** (esito in §9). Nessun commit: la consegna è il codice + questo record.

Baseline ricostruita su questa macchina (build di produzione, `npm run start`) **ripopolando il DB alle volumetrie della ricognizione** — 145 velivoli OPERATIONAL, 43 `RATING` + 4 `MEDICAL`, 21 categorie di cassa, 12 istruttori con voli, 10 `topPilots`, scheduling configurato. Script e JSON in `/tmp/.../scratchpad/{measure,gemelli,mix,interactive}.mjs` + `pre.json`/`post.json`. Il DB è stato poi **azzerato** (`down -v` → `up` → `migrate deploy` → `db seed`) prima degli e2e e del gate finale.

## 1. Verifica della ricognizione — conferme e correzioni, tutte MISURATE

### Confermato alla cifra

| fatto della ricognizione | misura ripetuta |
|---|---|
| `.page-head` **104,83** a ≤640 (IT **e** EN), **51,44** a 641/800/1280 | identico |
| `.segmented` di periodo **173,05×33,39**, due `Link` da **27,39** | identico (EN 170×33,39) |
| SVG **281×180** @375, **226** @320, **296** @390, **612,66**/**287,34** @1280 | identico |
| `minGap` `period=year` @375 **28,09 / 27,08**, @320 **18,89 / 18,66**; `period=month` **81,02 / 70,17**; card stretta @1280 **6,03** | identico |
| "Utilizzo flotta" **9.356,36** (ricogn. 9.356) · "Per aeromobile" **9.397,75** (9.398) | identico |
| target <44 sulle Statistiche: **6** (2 `Link` + 4 bottoni di metrica, tutti 27,39) | identico |
| `overflow` orizzontale di pagina **0** a 320/375/390/641/800/1280, su entrambe le pagine | identico (⇒ una guardia sull'overflow di PAGINA è davvero cieca qui) |
| `.util-bar .seg` **2,47** chiaro / **10,45** scuro | identico |
| fasce "Composizione movimenti" **2,73 / 2,04 / 4,85 / 3,61** chiaro, **9,3 / 9,96 / 5,72 / 7,73** scuro | identico |
| `.chart-label` **3,66** chiaro / **4,14** scuro | identico |
| Impostazioni: **231** target <43,5 — **201** a 24,67 · 13 a 36,84 · 12 a 34,84 · 3 a 38,84 · 1 a 36 · 1 a 24 | identico |
| le 7 `.card-head` @375 IT: **89,17 · 89,17 · 132,02 · 73,23 · 116,08 · 116,08 · 147,95** | identico |
| le 7 altezze di card @375 IT: 1052,73 · 664,11 · 688,98 · 433,16 · **2399,69** · 500,7 · 1285,61 | identico tranne Abilitazioni (la ricognizione dava 2533,5: dipende dal numero di tipi) |
| `.students` `cw/sw` **317/694**, **317/694**, **317/520** | identico |
| `.btn.mini` **24,67×61** a `x` 503→637 | identico (IT max 637,23; EN 623,52 — la ricognizione diceva "≈503-690") |
| `.form-grid` 1 colonna **277px** @375, **232,5×2** @641, **468×2** @1280 | identico |
| `.app` `grid-template-columns` 375px / **64px 577px** / 64px 736px / **232px 1048px** | identico |
| le due pagine sono ADMIN-only | confermato per pilota/allievo/istruttore a 375 **e** 1280 |

### Correzioni / precisazioni (9)

1. **La `.kpi-row` rende 4 KPI, non 5, finché `sched.openTime/closeTime` non sono configurati** (12.11 AC 6). Misurato in entrambi gli stati: **4** (strip `sw` 670) e **5** (`sw` **828** IT / **835** EN). La ricognizione riportava solo il caso a 5. R-15.8b-c è quindi esercitata su **due** configurazioni, non una.
2. **`docH` 21.485 @375 / 17.794 @1280 non è riproducibile dalla sola flotta**: con 145 velivoli + 12 istruttori + 10 piloti misuro **21.939** @375 e **9.759** @1280 (le due card lunghe combaciano al centesimo). Le uniche cifre usate come pre-fix in questo record sono quelle che ho misurato io.
3. **`club-contact-email-input` NON era clippato sul mio DB** (`cw 275 / sw 275` contro `275/300`): l'overflow dipende dalla lunghezza dell'indirizzo memorizzato. Il TD (e) è **sensibile ai dati**, non strutturale.
4. **I controlli coperti in fondo a Impostazioni sono coperti dalla TOP BAR sticky, non da `MAIN.page`**: pre-fix `cash-category-rename-button` ×2 + `cash-category-delete-button` colpiscono `HEADER.mobile-topbar`. La ricognizione diceva "12 con hit `MAIN.page`". La discriminazione (tab bar vs top bar vs altro) è ora **dentro la guardia**.
5. **L'hit-test dei `.btn.mini` restituisce `NAV.mobile-tabbar`, non `MAIN.page`** — il centro clampato al viewport cade sulla tab bar. Il fatto vero, e quello che la guardia asserisce, è `rect.right > innerWidth`.
6. **Due esemplari di contrasto NON elencati dalla story**: la barra `--accent` della **seconda metrica** di entrambi i `RankBars` (**1,85** chiaro / 11,19 scuro) e i **quattro pallini della legenda** di "Composizione movimenti", che condividono la mappa colori delle fasce (2,73 / 2,04 / 4,85 / 3,61). Entrambi chiusi.
7. **`.util-*` ha esattamente 4 consumer, tutti su questa pagina** (`reports-console.tsx` ×2 + `rank-bars.tsx` ×2): verificato con grep, come dichiarava la story.
8. **`grep -rn 'data-testid\^=' e2e/` rifatto sul repo consegnato dalla 15.8a**: **14 occorrenze, 9 file** — prefissi `ac-card-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `pilot-row-`, `mobile-fleet-card-`, `mobile-fleet-`. **Nessuno** tocca `reports-`, `club-`, `scheduling-`, `smtp-`, `treasury-`, `rating-`, `ratings-`, `medical-`, `cash-categor-`, `airfield-`, né i nomi nuovi (`mobile-rating-`, `mobile-medical-`, `mobile-cash-category-`, `mobile-reports-`) ⇒ suffisso `-mobile` **legale**.
9. **`DELETE /expiry-types/{id}` risponde 204**, non 200 (trovato dall'e2e; la story non lo dice).

### Il remount, MISURATO (AD-3)

- `reports/page.tsx` non ha stato di filtro (il periodo sono due `Link` server-side) e `ReportsConsole` è montata **senza `key`**: il `metricIndex` dei due `RankBars` sopravvive a ogni navigazione — e con esso, per costruzione, i due flag di espansione nuovi. **Deciso e dichiarato**: un cambio di metrica **NON richiude** una lista espansa (il lettore ha chiesto di vedere tutto; ri-nascondere 137 righe annullerebbe una richiesta che nessuno ha ritirato). Asserito nell'e2e.
- `settings/page.tsx` è un **server component** e monta sette card **senza `key`**: nulla si rimonta mai. Verificato che ogni sheet si chiuda **esplicitamente** (`closeSheet()` dopo il delete, `closeSheet()` all'ingresso della Modifica) e che il form inline continui a chiudersi da solo su successo (`handleSuccess`, invariato).

## 2. Che cosa è stato costruito, per AC

| AC | esito | prova (misura o test) |
|---|---|---|
| **1** KPI + periodo | **fatto** | `.kpi-row` **1 nodo** a 375 e a 1280, nessuna `.kpi-row-grid` (R-15.8b-c: nessun ramo); `.kpi .kpi-value` stesso conteggio ai due viewport. Periodo **27,39 → 44** (larghezza 157,5 ciascuno), metriche **27,39 → 44** ×4; `SMALL_TARGETS` **6 → 0** a 375, **6 invariati** a 1280. `.page-head` **104,83 → 117,44** (v. §7 deviazione 1). Guardia di non-contaminazione: i `.segmented` di `/bookings`, `/expiries`, `/dashboard` restano **sotto 43,5** a 375. |
| **2** grafici invariati | **fatto** | Larghezza SVG e `minGap` **identici al centesimo** pre/post a 320/375/390 (`226/281/296`, gap 18,66-28,09, 6 label su 12) e a 1280 (`612,66/287,34/612,66`, 12 su 12, gap 33,78/**6,03**/30,97); `period=month` 3 su 6. Nessun cambio a `viewBox`, `preserveAspectRatio`, alla regola `:nth-last-child(even)`. Il `minGap` **6,03** a 1280 è tightness desktop pre-esistente: **dichiarata, non corretta**. |
| **3** cap dichiarato | **fatto** | "Utilizzo flotta" **9.356,36 → 502,64**, "Per aeromobile" **9.397,75 → 556,64**, "Ore istruttori" 844,86 → 508,52, "Per pilota" 756,66 → 562,52; `docH` **21.939 → 3.726** @375 (**−83%**), **21.987 → 3.774** @320. Righe VISIBILI 8 su 145 (`RANKED_MOBILE_LIMIT = 8`, motivato in `src/lib/mobile-reports.ts`), riga finale `"Prime 8 di 145 · Mostra tutte (137)"` a 44px, espansione → **145 visibili** e foot rimosso. A **1280 tutte** le righe visibili e il foot `display:none`. `stats.service.ts` **non toccato**. |
| **4** Impostazioni in pagina | **fatto** | **231 → 1** target sotto 43,5 a 320/375/390 (l'1 è il trigger calendario 36×36, **dichiarato**, linea PO 15.7/15.8a LOW-4). Le 5 "Salva" sono **full-width** (57,66 → larghezza del contenitore) e ≥44. Le 7 testate **non superano il pre-fix** (misura PRE/POST **nella stessa pagina**, v. §3c). Le 4 card di form scrivono con gli **stessi endpoint**: Club **5 PUT** su un solo Salva + 422 `contactEmail` inline; Pianificazione 422 `closeTime` + round-trip 200; SMTP 422 `host` (SSRF); Tesoreria `invalidAmount`+`requiredDate` con **0 richieste** contate con `page.route`. |
| **5** tre tabelle → card+sheet | **fatto** | `.expiry-types-desktop-body`/`.cash-categories-desktop-body` `display:none` @375 e `flex` @1280; `.expiry-types-mobile`/`.cash-categories-mobile` l'inverso (misurato sui **due** lati). Card = **UN** `<button>`: `querySelectorAll('button,a,input,select,textarea,[tabindex]').length` = **0** su tutte, `min-height` ≥44. Sheet: **1 nodo**, righe **Ambito · Validità · Stato · Blocca prenotazioni e voli** (parità con le 5 colonne desktop), 3 azioni a **44**, "Chiudi" 44. "Elimina" = **`secondStep`** (le `.bottom-sheet-kv` spariscono, **una sola** `.mobile-sheet` nel DOM), 409 "in uso" a **toast**. Contenimento sul **rect**: `CHILDREN_OUT_OF_CARD` = `[]`. |
| **6** CRUD dal telefono | **fatto** | Create/edit/deactivate/delete completi dallo sheet e dal form; `PATCH` verificato sul **body**: `{name, scope, blocksBooking, validityMonths: null}` — **`kind` assente** in modifica, `validityMonths` `null` per `0`. Il **422 `FLIGHT_BLOCKED_BY_EXPIRY`** è provato su un tipo `blocksBooking=true` creato **dal telefono** (checkbox + `POST` 201), con `details.documents` che **contiene il nome del tipo**; il tipo è **cancellato** in `finally`. Categorie: rinomina/disattiva/riattiva/elimina dallo sheet; su "Ricariche" (sistema) il bottone Elimina è **assente** (`toHaveCount(0)`), non disabilitato. |
| **7** contrasti | **fatto** | v. §5: `.util-bar .seg` **2,47 → 4,56**; barra `--accent` **1,85 → 3,63** (non elencata); fasce **2,73/2,04/4,85/3,61 → 5,04/4,01/7,85/6,26**; pallini della legenda idem (non elencati); `.chart-label` **3,66 → 4,85**. Tema scuro: tutto sale (12,36 / 12,95 / 11,01-11,53-7,92-9,76 / 5,72). Gemelli della 15.8a rimisurati: **identici** (§5). |
| **8** `reports.spec` in catena | **fatto** | Project `reports` fra `booking-window` e `treasury-settings`, motivazione in `playwright.config.ts`; `--no-deps` **verde** (5 passed, `E2E_EXIT=0`); `afterAll` che ripristina e **rilegge**; ripristino verificato **in DB** con psql: `sched.*` = `00:00/23:59/30/0/3650` dopo il run. Costo in durata in §9. Lo spec **non è indebolito**: 5 test, stesse asserzioni. |
| **9** testid | **fatto** | Matrice asserita a **375 e 1280**: 41 singleton a 1 nodo su Impostazioni, 6 nomi assenti a riposo, `rating-row-mobile`/`cash-category-row-mobile` = **N** (uguale al conteggio desktop, mai 2N); su Statistiche i 4 singleton e le **quattro famiglie composte** con `data-testid` **unici**. I due nomi letti page-level dagli spec esistenti (`'Blocca prenotazioni'`, `'Inserisci un indirizzo email valido.'`) = **1 nodo** a 1280. **Nessuno spec esistente modificato.** |
| **10** geometria e layering | **fatto** | `pageOverflow` **0** a 320/375/390 su entrambe; `HIDDEN_SCROLLERS` = `[]` su Impostazioni (**81 → 0**) e solo `.kpi-row` (eccezione dichiarata) sulle Statistiche; `CLIPPED_WITHOUT_ELLIPSIS` = `[]` (**10 → 0** su Impostazioni); dopo uno scroll **reale** a fondo pagina nessun controllo è coperto dalla **tab bar** né da "altro" (la top bar sticky è l'eccezione 15.1, **discriminata**). Sheet z **40** sopra la tab bar (`hit.closest('.mobile-sheet')`). |
| **11** guardie discriminanti | **fatto** | Tabella in §6: ognuna provata **rossa** su una simulazione del pre-fix col repo **intatto** (iniezione CSS/DOM). |
| **12** invarianti | **fatto** | Desktop **identico** a 641/800/1280 su entrambe le pagine: `docH` 11.083/11.083/9.759 (reports) e 6.410/6.293/6.135 (settings), le 7 altezze di card e le 7 testate, `.students` 519/694-678/694-990/990, `.form-grid`, `.app` grid, `pageOverflow` 0. Nessuna dipendenza npm nuova; **nessun token cambia valore**; **nessun literal di colore nuovo** (`color-mix` sui token, tecnica 15.4/15.8a); 26 stringhe nuove **nei due locale**. Superfici 15.8a rimisurate (§5 e AC 11 ix). |
| **13** multi-attore | **fatto** | PILOTA/ALLIEVO/ISTRUTTORE → redirect a `/it/dashboard` su **entrambe** le pagine a **375 e 1280**, con `clearCookies()` fra le identità; "Statistiche"/"Impostazioni" assenti dalla tab bar (e dallo sheet "Altro" quando esiste — v. §7 deviazione 5); ADMIN entra e vede la testata. |
| **14** debito tecnico | **fatto** | §8. |

## 3. Decisioni non ovvie

**a) Il cap è CSS, non JS.** Ogni riga è resa a ogni larghezza; solo il telefono nasconde quelle oltre il limite (`.ranked-rows-capped .ranked-row-overflow{display:none}` dentro la media query). È l'unico modo di rispettare insieme (i) l'architettura dell'epic (niente `matchMedia`, niente switch di larghezza in JS), (ii) `reports.spec.ts:255-260`, che legge i testid composti **page-level a 1280**, e (iii) AC 9, che vuole **un nodo per testid a entrambe le larghezze**. Il limite vive in **una sola** costante (`RANKED_MOBILE_LIMIT`): il CSS non lo conosce, sono i chiamanti a marcare le righe eccedenti con `.ranked-row-overflow`. La guardia è quindi sul **numero di righe VISIBILI**, non sul numero di nodi.

**b) N = 8, misurato.** A 375×812 restano ~664px fra la top bar (56) e la tab bar (92); dopo la riscrittura della riga (v. c) una riga ranked costa ~30px + 12 di gap, e testata + foot ~110: **8 righe = ~546px**, cioè una schermata. Le card lunghe passano da 9.356/9.398 a **502/556**.

**c) La riga ranked resta FLEX, ma va a capo.** La 13.10 aveva trasformato `.util-row` in colonna flex proprio per rendere **inerti** i `grid-template-columns` inline dei quattro call site (`90px 1fr 80px`, …): tornare a `grid` li avrebbe resuscitati e ri-clippato il valore. La riga nuova resta `display:flex` e usa `flex-wrap` + `order`: label e valore sulla prima riga, barra sulla seconda. Ancorata a `.ranked-rows >`, che è una classe di questa story (i 4 consumer di `.util-*` sono tutti qui, ma la regola non è scritta su `.util-*`).

**d) Il contrasto è UNA decisione, in un posto solo.** `.util-bar .seg.flown` è **elencato nella regola `.flow-bar-in` stessa** (invece di ripetere il `color-mix` in un secondo selettore alla pari, l'altra opzione che la §10 della 15.8a offriva): così il riempimento delle due forme è deciso su **una riga**, e `.util-bar .seg.flown` non porta più un `background` proprio. La famiglia si allarga di tre toni (`accent`/`info`/`muted`) perché la striscia "Composizione movimenti" è **una** palette: due fasce scurite accanto a due intatte sarebbero state due palette. `--info` e `--ink-3` erano già sopra 3:1 e sono mescolati **solo** per quella coerenza.

**e) `.chart-label` cambia TOKEN, non valore.** Da `--ink-4` (3,66) a `--ink-3` (4,85, la scelta che `.bottom-sheet-sub` già fa). Il colore esce dallo style inline dei due componenti — uno style inline batte qualunque regola di classe — e nient'altro di quegli inline si muove. `--ink-4` **non cambia valore**: i suoi altri consumer restano a 3,66/4,14 (misurati su 6 pagine, §5).

**f) Il form resta in pagina, ma va incontro al dito.** R-15.8b-d opzione A tiene i form inline: "Modifica"/"Rinomina" nello sheet chiude lo sheet, apre **lo stesso** form e lo porta in vista (`scrollIntoView({block:'center'})`), gated su un ref che **solo lo sheet** imposta — il desktop non scrolla mai (la lezione `preventScroll` della 15.8a). Misurato: dopo il tap il form è a `top: 175,5` dentro il viewport.

**g) Due canali di annuncio, decisi dal PUNTO D'INGRESSO.** `requestToggleActive`/`requestDelete` sono la rete condivisa (AD-7); chi la chiama decide dove annunciare — il `<p role="status">` per il flusso inline (desktop **e** form mobile), un **toast** per tutto ciò che parte dallo sheet. Nessun `if` sulla larghezza, e il doppio annuncio è impossibile per costruzione: ogni azione passa da **uno solo** dei due wrapper. Nessun `display:none` sul `<p>` è quindi necessario.

**h) Il fuoco segue il `secondStep` nei DUE sensi.** Entrando in "Elimina" il fuoco va sul "Sì", tornando indietro torna sul bottone "Elimina" che lo aveva aperto (lezione 15.2 F1 / 15.8a MINOR-2, che aveva coperto 1 ramo su 3). Asserito leggendo `document.activeElement`.

## 4. Due difetti trovati dalle guardie di questa story

**Le cinque "Salva" non erano full-width**: `min-height: 44px` le aveva portate all'altezza giusta, ma la larghezza restava **57,66px** (il testo "Salva" più il padding) perché il contenitore è un `div` a blocco e un `flex: 1 1 0` su un figlio di un blocco non fa nulla. Trovato dall'asserzione di AC 4 (`box.w > box.parentW - 1`), che la prima stesura del CSS faceva fallire. Chiuso con `.settings-card div:has(> .btn.primary:only-child) > .btn.primary{ width: 100% }` — `:only-child` è ciò che distingue una **riga di salvataggio** (un bottone solo nel proprio div, forma condivisa da tutte e cinque) dalla colonna di azioni dello sheet e dall'azione della testata, che hanno regole proprie.

**2. Lo sweep degli scroller nascosti trovava TRE `<input>` — ed era il TD (e), non un difetto mio.** Emerso **solo nel gate finale**, perché dipende dai DATI che la suite scrive: con un `contactEmail` da 42 caratteri, `club-contact-email-input` misura `sw 299` in `cw 220` (a 320px), e con esso `airfield-name-input` (259 in 220) e `smtp-from-input` (236 in 220). Diagnosi con prova, prima di toccare la guardia: **gli stessi tre input sfondano anche a 641px**, dove nessuna regola di questa story si applica ⇒ è il comportamento nativo di un campo di testo il cui VALORE è più lungo della casella, cioè il TD (e) che la story dichiara fuori mandato (la ricognizione lo misurava `275/300`, io `275/299`). La guardia è stata corretta con un'esclusione **dichiarata** — `INPUT`/`TEXTAREA` fuori dallo sweep, con il motivo e le misure scritte sopra la funzione (lezione 15.8a MINOR-1: un'esclusione non dichiarata è una guardia che mente) — e **tutto il resto continua a essere spazzato**: la prova di discriminanza (i) rimostra le tabelle desktop e la lista torna piena di `DIV`.

## 5. Contrasti — misure nei DUE temi, coi gemelli enumerati

Metodo: canvas→WCAG, sfondo effettivo risolto **risalendo gli antenati partendo dall'elemento**, alpha letta prima della composizione, tema pilotato dal cookie `am-theme`, nodi senza `getClientRects()` **esclusi** (un sottoalbero `display:none` misura sfondi che l'utente non vede — nota metodologica 15.8a §5).

| esemplare | dove | chiaro pre → post | scuro pre → post | soglia |
|---|---|---|---|---|
| `.util-bar .seg.flown` (Utilizzo flotta + Ore istruttori) | `.flow-bar-in` | **2,47 → 4,56** | 10,45 → **12,36** | 3,0 |
| barra `RankBars`, metrica 1 (`--ok`) | `.flow-bar-in` | **2,47 → 4,56** | 10,45 → **12,36** | 3,0 |
| barra `RankBars`, metrica 2 (`--accent`) *(non elencata dalla story)* | `.flow-bar-accent` | **1,85 → 3,63** | 11,19 → **12,95** | 3,0 |
| fascia mix SCUOLA | `.flow-bar-in` | **2,73 → 5,04** | 9,3 → **11,01** | 3,0 |
| fascia mix TURISMO | `.flow-bar-accent` | **2,04 → 4,01** | 9,96 → **11,53** | 3,0 |
| fascia mix LAVORO AEREO | `.flow-bar-muted` | 4,85 → **7,85** | 5,72 → **7,92** | 3,0 |
| fascia mix TRANSITI | `.flow-bar-info` | 3,61 → **6,26** | 7,73 → **9,76** | 3,0 |
| **pallini** della legenda ×4 *(non elencati)* | idem | **2,73 / 2,04 / 4,85 / 3,61 → 5,04 / 4,01 / 7,85 / 6,26** | 9,3 / 9,96 / 5,72 / 7,73 → 11,01 / 11,53 / 7,92 / 9,76 | 3,0 |
| `.chart-label` (36 esemplari) | `--ink-4` → `--ink-3` | **3,66 → 4,85** | 4,14 → **5,72** | 4,5 (**testo**) |

**Gemelli — enumerati e rimisurati, nei due temi, a 375 e 1280.**
- **`.flow-bar-in`/`-out` della 15.8a** (`/dashboard/billing`, "Per categoria"): **4,56** / **6,10** chiaro e **12,36** / **9,87** scuro — **identici** ai valori che il record 15.8a dichiara. Nulla si è mosso: la regola ha guadagnato un selettore, non un valore.
- **`.stat-tone-ok/-bad/-warn`** su `/dashboard/billing`: **10,63 / 9,82 / 7,58** chiaro e **9,3 / 6,61 / 9,96** scuro su 23-40 esemplari — identici.
- **Gli altri consumer di `--ink-4`** (`.so-sub`, `.mobile-row-chev`, `.syl-num`, `.ppr-card-id`) su `/dashboard`, `/logbook`, `/movements`, `/fleet`, `/bookings`, `/billing`: **3,66** chiaro / **4,14** scuro, **invariati** — il token non è stato toccato, è `.chart-label` che ha cambiato consumer.
- `.util-value` (testo delle liste ranked): 9,99 / 9,47, invariato.

## 6. Regola nuova → guardia → prova di discriminanza

Ogni guardia è stata provata **rossa** simulando il pre-fix **col repo intatto** (iniezione CSS/DOM nei due spec nuovi, test "AC 11").

| # | regola introdotta (per un difetto misurato) | guardia | come è stata provata discriminante |
|---|---|---|---|
| i | `.expiry-types-desktop-body`/`.cash-categories-desktop-body` `display:none` ≤640 | `DISPLAY_PROBE` sui **due** lati (`none`@375 / `flex`@1280) **+** `HIDDEN_SCROLLERS() === []` **+** nessun `.btn.mini` oltre il bordo | iniettato `display:flex!important` ⇒ tornano **58 scroller nascosti** e i `.btn.mini` con `right > innerWidth`. ⚠️ Il **conteggio** dei target piccoli NON è l'asserzione: il pavimento 44px è su `.settings-card .btn`, che raggiunge anche i mini della tabella nascosta, e un conteggio dipenderebbe dal numero di righe |
| ii | `.expiry-types-mobile`/`.cash-categories-mobile`/`.ranked-cap-foot` `display:none` >640 | `isVisible()` sui due lati; foot `toBeHidden()` a 1280 | iniettato `display:block!important` a 1280 ⇒ la card mobile diventa visibile (e la matrice testid vedrebbe 2N nodi); iniettato `display:flex` sul foot ⇒ diventa visibile a 1280 |
| iii | pavimento 44px (periodo, metriche, input, salva, azioni di sheet) | `SMALL_TARGETS() === []` con soglia **43,5**, scritta sul **requisito** | rimesso `min-height:0; padding:5px 8px` ⇒ sulle Statistiche riappaiono **esattamente 6** controlli; su Impostazioni **>20** |
| iv | ellissi sulla label ranked e sui figli della card | `CLIPPED_WITHOUT_ELLIPSIS() === []` | iniettato `text-overflow:clip; flex:0 0 40px` ⇒ la lista non è più vuota (con `flex-grow` intatto l'iniezione non morde: annotato nel test) |
| v | contenimento dei figli della card | `CHILDREN_OUT_OF_CARD() === []` (guardia sul **rect**, cieca allo sweep degli scroller) | spostato `.mobile-row-side` di 120px ⇒ la lista non è più vuota |
| vi | nome accessibile dello sheet ben formato | proprietà su `sub` (`/—\s*—/`, `/·\s*·/`, nessun segmento vuoto o "—") negli unit di `mobile-settings.ts` + lettura reale dell'`aria-label` (`"Ratings · Piloti — Abilitazione baseline 04"`) | 15 unit, fra cui un tipo **senza validità** ("senza scadenza") e un segmento **vuoto** passato al posto di uno assente. ⚠️ Il caso "senza scope" **non è costruibile**: `ExpiryScope` è un enum non nullable a quattro valori — **dichiarato**, e coperto dall'unit sul segmento vuoto |
| vii | empty state mobile = 1 nodo con stringa distinta | `toHaveCount(1)` dopo **iniezione DOM** del nodo, poi `cloneNode` ⇒ 2 | i tre cataloghi sono seminati, quindi lo stato vuoto non è raggiungibile per flusso: iniettarlo è **esattamente** lo scopo dell'iniezione (metodo 15.6 LOW-3, riusato dalla vii-bis della 15.8a) |
| viii | cap delle liste ranked | **numero di righe VISIBILI**: 8 a 375, **tutte** a 1280, e l'espansione | iniettato `display:flex!important` su `.ranked-row-overflow` ⇒ le righe visibili passano da 8 a `total` |
| ix | nessuna regola esce da questa pagina | geometria di `/bookings`, `/expiries`, `/dashboard` (`.segmented` < 43,5), `/logbook`+`/movements`+`/billing` (`.date-input-btn` ≤ 36), `/expiries` (`.scadenze-desktop-body` ancora `none`), `/fleet` (ExportMenu a `x=0`, dentro il viewport) | i valori sono quelli **misurati prima** della modifica; una regola non ancorata li sposterebbe (è il difetto che 15.3 F1 e 15.5 F5 hanno misurato) |
| x | comportamenti invisibili a occhio | `PATCH` senza `kind` e con `validityMonths: null`; **0 richieste** sulla Tesoreria invalida; 409 ≠ generico; **422 `FLIGHT_BLOCKED_BY_EXPIRY`** con `details.documents` che contiene il tipo; "Elimina" **assente** sulle categorie di sistema | contati con `page.route`, letti dal **body** della richiesta/risposta, mai da un testo in pagina |
| xi | testate ≤ pre-fix coi 44px | altezza PRE e POST misurate **nella stessa pagina** (iniezione delle 4 dichiarazioni pre-fix) | il confronto è per costruzione discriminante: senza le regole nuove la testata è quella di prima. ⚠️ Scelto **dopo** aver misurato che una tabella di baseline hard-coded è fragile: la stessa pagina dà 113,23 sotto un contesto `playwright-core` e **129,17** sotto `devices['Desktop Chrome']` della suite (una riga in più su una `.card-sub` la cui misura del testo cambia dell'~1%) |
| xii | soglia dei target | **43,5** ovunque, anche dove il valore ottenuto è 44 esatto | scritta sul requisito, mai sul risultato (lezione 15.7 MINOR-1) |

## 7. Deviazioni dalla story (con motivazione)

1. **La `.page-head` delle Statistiche CRESCE di 12,61px** (104,83 → **117,44** a ≤640, nei due locale). È il prezzo aritmetico dei 44px: il `.segmented` passa da 33,39 a 46 (44 + bordo), e i 2px di padding tolti al box non bastano a compensarlo. La story chiede di **misurare** la testata, non di ridurla (il criterio "testata ≤ pre-fix" è delle testate di card, dove è **rispettato**). Contropartita misurata sulla stessa pagina: **−18.213px** di documento.
2. **La pagina Impostazioni si ALLUNGA di 612px** (7.465 → **8.077** @375; 8.200 @320, 8.037 @390, 8.004 EN@375). È il costo dei 44px su 29 controlli e di una card per riga al posto di una riga di tabella (la card Abilitazioni 2.399,69 → 2.782,09 con 43 tipi). In cambio: **230 dei 231** target sotto soglia spariscono, **81 scroller orizzontali nascosti → 0**, **10 testi clippati → 0** e nessuna azione resta fuori dallo schermo. È il rovescio esplicito dell'opzione A ratificata (tutto in pagina): l'alternativa che accorciava la pagina era l'opzione B, **scartata dal PO**.
3. **Il cap è applicato a TUTTE E QUATTRO le liste ranked**, non solo alle due nominate dall'AC 3. "Ore istruttori" (35 righe sul DB della ricognizione) e "Per pilota" (10, cappata a 10 lato server) condividono componente e linguaggio con le due lunghe: tre liste cappate e una no si legge come un bug, e il codice è lo stesso `RankedCapFoot`. Costo: zero righe in più.
4. **`RankBars` cambia due firme**: `metric.color` (stringa di colore inline) → `metric.barClass` (classe di tono) e due prop nuove (`capLabels`/`capTestId`/`metricsClassName`). È l'unico modo di prendere la decisione di colore **una volta sola** in CSS invece di due volte in JS, e i due soli consumer sono su questa pagina.
5. **La verifica multi-attore sullo sheet "Altro" è CONDIZIONALE**: `mobile-nav.tsx` non rende affatto la tab "Altro" per un ruolo che vede ≤5 aree, e pilota/allievo/istruttore sono in quel caso. La tab bar è comunque asserita per tutti e tre; lo sheet solo quando esiste. **Dichiarato** invece di essere silenziosamente saltato.
6. **Il caso "attore con `finance.manage` ma senza `settings.manage`" NON è costruibile** col modello di ruoli post-14.9 (ADMIN ha entrambi, nessun altro ruolo ha nessuno dei due): AC 13 lo chiedeva "se costruibile". Provato ciò che è costruibile: i tre non-admin sono respinti da **entrambe** le pagine, a 375 e a 1280.
7. **La Tesoreria non viene MAI scritta dallo spec nuovo**: la card è esercitata solo sul ramo di validazione, che ritorna **prima** della `PUT` (0 richieste, contate). `treasury.*` alimenta `getBillingSummary` di ogni spec di `/dashboard/billing` e **non ha una GET** da cui ripristinare (D5): scriverla sarebbe stato l'unico dei quattro form senza ripristino verificabile.
8. **Il Club è esercitato come round-trip a VUOTO** (i 5 PUT partono coi valori già a schermo): il contratto dei cinque endpoint è provato senza spostare un solo valore memorizzato.
9. **`document.fonts.ready` aggiunto ai due helper di navigazione degli spec nuovi.** Ogni altezza di queste pagine è un **a capo**, e un a capo dipende dalle metriche del font: `networkidle` non implica font **applicati**. È anche la lezione che ha fatto scartare la tabella di baseline hard-coded (§6 xi).
10. **DUE spec esistenti sono stati modificati** (la story chiede di evitarlo e di motivarlo — lezione 14.6). Entrambi sono guardie di **non-contaminazione** scritte da 15.7 e 15.8a che congelavano la geometria di `/dashboard/reports` ai numeri **pre-15.8b**, cioè a una superficie che **questa** story possiede e che gli AC 1/3 cambiano per mandato. Trovati dal gate finale, non dedotti: `2 failed / 413 passed`.
    - `e2e/mobile-expiries-movements.spec.ts:1284` asseriva `min-height != 44px` sui figli di **ogni** `.segmented` di tre pagine. Riscritto **al valore corretto**: su `/dashboard/reports` l'asserzione è ora sull'**owner** (`.segmented` deve portare `.reports-period` o `.reports-rank-metrics` — cioè il pavimento arriva da una classe di pagina, mai da `.segmented`), sulle altre due pagine resta identica. Una regola scritta su `.segmented` verrebbe comunque catturata lì: copertura invariata.
    - `e2e/mobile-billing.spec.ts:1124` congelava `segmentedHeights: [33.39×3]` e `utilBarWidths: [281]` su `/dashboard/reports`. **Aggiornati** ai valori misurati post-15.8b (`[46,46,46]`, `[281, 0]` — lo 0 sono le barre delle righe oltre il cap), la pagina **resta nella sweep** (`.split`, la larghezza delle barre visibili e i `date-input` sono ancora congelati): nessun indebolimento, solo una baseline riportata alla realtà dalla story che possiede quella superficie.

## 8. Debito tecnico — voce per voce

| TD | esito | misura |
|---|---|---|
| (a) `reports.spec.ts:307-315`, PUT scheduling globale da project `fullyParallel` | **CHIUSO** | project `reports` in catena fra `booking-window` e `treasury-settings`; `--no-deps` verde; `afterAll` che ripristina e **rilegge**; verifica in DB con psql (`sched.*` = 00:00/23:59/30/0/3650). Chiude anche la **time-dependency** della suite: nessuna finestra 07:00-21:00 resta in piedi per i `moveBooking` di `mobile-planning` |
| (b) contrasti `.util-bar .seg`, fasce mix, `.chart-label` | **CHIUSI** (+2 esemplari non elencati) | §5 |
| (c) `.chart-label` a `--ink-4` = faccia "grafici" del TD (h) | **chiusa quella faccia**; il TD (h) **resta aperto altrove** | `.so-sub`, `.mobile-row-chev`, `.syl-num`, `.ppr-card-id` restano a **3,66** chiaro su 6 pagine (misurato). `--ink-4` non ha cambiato valore |
| (d) pagina Statistiche alta 21.939px con due card da ~9.400 | **mitigato su mobile, NON risolto sul desktop** | 21.939 → **3.726** a 375; a 1280 resta **9.759** (il cap è mobile-only per costruzione, AC 3) |
| (e) `club-contact-email-input` clippato senza ellissi | **subìto e dichiarato**, e **precisato due volte**: (i) sul DB di seed non si presenta (`275/275`), dipende dalla lunghezza dell'indirizzo memorizzato; (ii) sul DB che la suite lascia si presenta su **tre** campi (`club-contact-email-input` 299 in 220, `airfield-name-input` 259 in 220, `smtp-from-input` 236 in 220 a 320px) **e anche a 641px**, dove nessuna regola di questa story vive ⇒ pre-esistente e indipendente dalla larghezza. È l'esclusione dichiarata dello sweep degli scroller (§4.2) |
| (f) `minGap` **6,03** delle label a 1280 sulla card stretta | **subìto e dichiarato**: tightness desktop pre-esistente, fuori mandato; rimisurato identico pre/post |
| (g) `viewport-fit=cover` mai dichiarato | **subìto** (TD di epic, 15.10): gli `env(safe-area-inset-*)` valgono 0 |
| (h) ✕ di `SlideOver` a 32px e opzioni typeahead a 36px | **non toccati**: nessun `SlideOver` e nessun typeahead vive su queste due superfici |
| (i) trigger calendario annidato a **36×36** (Tesoreria) | **subìto per decisione PO** (linea 15.7, riconfermata 15.8a LOW-4) e **DICHIARATO nella guardia**: è l'unica esclusione di `SMALL_TARGETS`, con il motivo scritto sopra la funzione |
| **nuovo (j)** | `.settings-card .btn{min-height:44px}` raggiunge anche i `.btn.mini` della tabella desktop, che a ≤640 è `display:none`: **nessun effetto visibile**, ma rende inefficace un'iniezione che ri-mostri la tabella aspettandosi i 24,67px di prima. La guardia (i) è scritta di conseguenza (scroller + azioni fuori bordo), e il fatto è dichiarato qui |
| **nuovo (k)** | l'altezza di una `.card-head` **dipende dalle metriche del font e dal contesto browser**: la stessa pagina misura 113,23 sotto `playwright-core` e **129,17** sotto `devices['Desktop Chrome']`. Ogni baseline di altezza hard-coded in uno spec è fragile per questo motivo; la guardia xi confronta PRE e POST nella stessa pagina |
| **nuovo (l)** | a 390px e in EN **tre** testate crescono rispetto al pre-fix (Tesoreria +13,93, Abilitazioni +21,09, Pianificazione +5,94 in EN): il pre-fix a quelle larghezze/locale aveva l'azione sulla stessa riga del titolo, il post le dà una riga propria per portarla a 44px. A **320 e 375/IT** tutte e sette restano **sotto** il pre-fix |

## 9. Esito della suite (onesto)

- `npm run gates`: **PASS lint / PASS typecheck / PASS test (1754) / PASS build**, ripetuto a ogni passo intermedio; ultimo run verde prima della consegna.
- **Unit nuovi**: `src/lib/mobile-reports.test.ts` (6) + `src/lib/mobile-settings.test.ts` (9) = **15 test**, verdi anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` (nessun `@/lib/env` trascinato: entrambi i moduli sono puri).
- **Spec nuovi**, run mirati su build di produzione e DB fresco:
  - `e2e/mobile-reports.spec.ts` (project `chromium`): **10 passed, E2E_EXIT=0** (13,2s).
  - `e2e/mobile-settings.spec.ts` (`--project=mobile-settings --no-deps`): **12 passed, E2E_EXIT=0** (37,4s).
  - `e2e/reports.spec.ts` migrato (`--project=reports --no-deps`): **5 passed, E2E_EXIT=0** (5,2s) — AC 8 b.
- **Blast radius mirato** (`mobile-billing.spec.ts` + `mobile-expiries-movements.spec.ts`, le due superfici consegnate da 15.7 e 15.8a): **47 passed, 2 skipped, E2E_EXIT=0** dopo la correzione delle loro due guardie di vicinato (v. §7 deviazione 10).

### Gate finale

Suite completa `CI=1` su build di produzione e **DB fresco** (`docker compose down -v` → `up` → `migrate deploy` → `db seed`), lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status`. Esito verbatim nel §11 (aggiunto a fine run).

**Costo in durata della catena (AC 8 d), misurato per project in isolamento su build di produzione:**

| project | test | durata |
|---|---|---|
| `reports` (nuovo, era dentro `chromium`) | 5 | **5,2s** |
| `mobile-settings` (nuovo) | 12 | **37,4s** |
| **totale aggiunto alla coda serializzata** | 17 | **~43s** |

I 5 test di `reports.spec.ts` giravano prima **dentro** il project parallelo, dove il loro costo era assorbito dai worker: il delta netto sulla durata della suite è quindi ~43s meno i pochi secondi che quei 5 test occupavano in parallelo, cioè **~40s** su una suite da ~9-10 minuti (+7%). È il prezzo dichiarato di R-15.8b-f: in cambio la finestra `sched.*` non resta più scritta da un project parallelo, e la suite smette di dipendere dall'ora in cui gira.

## 10. Cosa NON ho fatto

- Non ho toccato **API, schemi Zod, servizi, seed, migrazioni**: `stats.service.ts` (cap `topPilots` 10, `fleet` non cappato, `fleetUtilization` `null`), `expiry-types.service.ts`, `cash.service.ts`, `app-settings.service.ts` sono **invariati** (AD-10, R-15.8b-b "Nessun cambio API").
- Non ho toccato la **geometria o la logica dei tre grafici SVG** (AD-9): `viewBox`, `preserveAspectRatio`, la regola di diradamento 13.10 e la struttura sono identiche; dei due componenti ho tolto **solo** la dichiarazione `color` inline della label, che è il fix di contrasto.
- Non ho introdotto un **orchestratore client** sopra le sette card: `settings/page.tsx` resta un **server component** (AD-1).
- Non ho trasformato i form in **pannelli a tutto schermo**: R-15.8b-d opzione A li tiene in pagina; l'opzione B è esplicitamente scartata dal PO.
- Non ho toccato `/dashboard/billing`, `export-menu.tsx`, `BottomSheet`, `MobileSheet`, `SlideOver`, `joinSegments`: riusati, non riscritti. Le uniche misure su quelle superfici sono guardie di non-regressione.
- Non ho aggiunto **focus trap**, `aria-modal`, `viewport-fit=cover` né la riserva sticky (15.10).
- Non ho corretto i difetti pre-esistenti non ratificati: `minGap` 6,03 a 1280, altezza desktop della pagina Statistiche, taglio senza ellissi delle celle `.student-row` desktop, `club-contact-email-input`.
- **Non ho committato**: il repo è lasciato con le modifiche in working tree.

## 11. File toccati

**Nuovi**
- `src/lib/mobile-reports.ts` — `RANKED_MOBILE_LIMIT` + `rankedCap` (AD-5 ii), pura
- `src/lib/mobile-reports.test.ts` — 6 unit
- `src/lib/mobile-settings.ts` — le quattro composizioni di sub-line/over-line (AD-5 i), che riusano `joinSegments`
- `src/lib/mobile-settings.test.ts` — 9 unit
- `src/components/charts/ranked-cap-foot.tsx` — la riga di cap condivisa dalle 4 liste ranked
- `e2e/mobile-reports.spec.ts` — 10 test (project `chromium`)
- `e2e/mobile-settings.spec.ts` — 12 test (project `mobile-settings`, **in catena**)

**Modificati**
- `src/styles/airops.css` — famiglia `.flow-bar-*` allargata (+3 toni) e `.util-bar .seg.flown` elencato nella stessa regola; `.chart-label{color:var(--ink-3)}`; blocco `statistiche + impostazioni mobile (story 15.8b)` in coda (+~150 righe)
- `src/app/[locale]/dashboard/reports/page.tsx` — classe `.reports-period`, labels del cap (`t.raw`)
- `src/app/[locale]/dashboard/reports/reports-console.tsx` — `MIX_TONES` al posto di `MIX_COLORS`, `.ranked-rows` + cap sulle due liste proprie, wiring dei due `RankBars`
- `src/components/charts/rank-bars.tsx` — `metric.barClass` al posto di `metric.color`, cap + `metricsClassName`
- `src/components/charts/{bar,line}-chart.tsx` — via il `color` inline della label
- `src/app/[locale]/dashboard/settings/page.tsx` — labels `mobile.*` per i tre cataloghi, testid mobile della card "Visite mediche"
- `src/app/[locale]/dashboard/settings/ratings-card.tsx` — classe `.settings-card`, corpo desktop dietro `.expiry-types-desktop-body`, albero mobile a card, `BottomSheet` con `secondStep`, rete condivisa + toast
- `src/app/[locale]/dashboard/settings/cash-categories-card.tsx` — idem, con "Elimina" assente sulle categorie di sistema
- `src/app/[locale]/dashboard/settings/{club,scheduling,smtp,treasury}-card.tsx` — classe `.settings-card` (una riga ciascuno)
- `messages/{it,en}.json` — 13 chiavi nuove per locale (2 `ReportsPage.mobile.*` + 11 `SettingsPage.*.mobile.*`), parità verificata
- `playwright.config.ts` — project `reports` (fra `booking-window` e `treasury-settings`) e `mobile-settings` (in coda), `testIgnore` aggiornato
- `e2e/reports.spec.ts` — intestazione che dichiara la catena + `afterAll` che ripristina e rilegge `sched.*`
- `e2e/mobile-billing.spec.ts`, `e2e/mobile-expiries-movements.spec.ts` — le due guardie di vicinato su `/dashboard/reports` riportate ai valori/alla forma corretti (v. §7 deviazione 10)

## 12. Gate finale — esito verbatim

Suite completa `CI=1` su build di produzione e **DB fresco** (`docker compose down -v` → `up` → `migrate deploy` → `db seed`), lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status`:

```
453 passed (12.2m)
E2E_EXIT=0
```

**453 = 431 + 22**: i **430 passed + 1 flaky** dell'arbitro 15.8a più i **10** di `mobile-reports.spec.ts` e i **12** di `mobile-settings.spec.ts`. **Zero failed, zero flaky** (il flaky noto di `billing.spec.ts:296` / `flights.spec.ts:602` non si è ripresentato in questo run).

**Il run precedente NON era verde, e va detto**: `2 failed / 413 passed` prima, `1 failed / 449 passed` poi. Tre fallimenti in tutto, **tutti attribuibili a questa story e tutti chiusi**:
1. `mobile-expiries-movements.spec.ts` e `mobile-billing.spec.ts` — le due guardie di vicinato che congelavano la geometria di `/dashboard/reports` ai numeri pre-15.8b (§7 deviazione 10);
2. `mobile-settings.spec.ts` AC 10 — lo sweep degli scroller che contava tre `<input>` con il valore più lungo della casella, cioè il TD (e) (§4.2). Diagnosticato con la prova (**lo stesso difetto a 641px**, dove nessuna regola di questa story vive) prima di toccare la guardia, e chiuso con un'esclusione **dichiarata** che continua a spazzare tutto il resto.

**Stato del DB dopo il gate**, verificato con psql:
- `sched.*` = `00:00 / 23:59 / 30 / 0 / 3650` — il ripristino permissivo, **non** la finestra `07:00-21:00` che `reports.spec.ts` scrive: R-15.8b-f chiuso end-to-end, sull'intera catena, non solo sul run isolato.
- Nessuna fixture di questa story sopravvive: `Blocco mobile*`, `Tipo mobile*`, `Cat mobile*` = **0 righe**. Gli **11** tipi con `blocksBooking = true` che restano sono i 4 di seed più i 7 di `bookings`/`flights` — il TD di volume già registrato, **non aggravato** da questa story.
- Porta 3000 **libera**, nessun server lasciato in ascolto.

## 13. Note per la review

- La misura più fragile che ho incontrato è l'**altezza di una testata**: la stessa pagina dà 113,23 sotto un contesto `playwright-core` e 129,17 sotto `devices['Desktop Chrome']` (TD nuovo (k)). Ogni baseline di altezza hard-coded in uno spec eredita quella fragilità; la guardia xi confronta PRE e POST **nella stessa pagina** proprio per questo.
- Le due modifiche a spec esistenti (§7 deviazione 10) sono l'unico punto in cui ho toccato copertura altrui: entrambe sono baseline di vicinato **su una pagina che questa story possiede**, riportate al valore corretto e non indebolite.
- I due esemplari di contrasto non elencati dalla story (barra `--accent` dei `RankBars` a **1,85**, i quattro pallini della legenda) sono la parte del lavoro che l'elenco dell'AC non copriva: se la review ne cerca altri, il metodo è in §5 e gli script sono riproducibili.
