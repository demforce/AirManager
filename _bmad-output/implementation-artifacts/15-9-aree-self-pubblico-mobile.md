---
baseline_commit: 118ad64
---

# Story 15.9: Aree self + modulo pubblico mobile — "Le mie transazioni" e "I miei compensi" come liste di card leggibili, l'estratto conto condiviso che smette di annientare la colonna Descrizione, e la vetrina pubblica `/ppr` che su un telefono ha target da un dito e ritrova la lingua

Status: **approved** — ratifiche PO 2026-08-05 (AskUserQuestion, sessione principale). Tabella sotto; le Q1-Q10 in fondo restano come record di fatti, opzioni e motivazioni.

## Ratifiche PO (2026-08-05) — VINCOLANTI

| R | Q | Decisione PO | Effetto vincolante |
|---|---|---|---|
| R-15.9-a | Q1 | **A — tutto in UNA story** (contro la raccomandazione di split) | Le quattro superfici + il componente condiviso viaggiano in un unico ciclo dev→review; la review copre quattro superfici, quattro attori, cinque stati degradati e il flusso pubblico bilingue. |
| R-15.9-b | Q2 | **A — TD 14.6 F4 chiuso su ENTRAMBE le facce** | Un solo albero mobile in `AccountSection` che rispetta `showActor`/`canManageFinance`; l'esclusione di `mobile-registries.spec.ts:888` viene RIMOSSA e il test resta verde (AC 2). |
| R-15.9-c | Q3 | **A — card tappabile → sheet a parità piena; azioni di testata inline a colonna singola con target 44px; rettifica di riga come `secondStep` dentro lo sheet** | AC 1/3; il caso AD-8 (pannello impilato su sheet) non deve presentarsi, va asserito. |
| R-15.9-d | Q4 | **A — i tre contrasti si chiudono TUTTI ORA con `.stat-tone-*`** | AC 9 in versione «chiusi»: l'inline sostituito dalla classe (mai una regola che non vincerà), desktop+mobile, due temi, gemelli enumerati, ramo `account-balance` rosso misurato. |
| R-15.9-e | Q5 | **B — KPI 2×2+1**, con Maturato e Dovuto sulla stessa riga | AC 5: quattro in griglia + il quinto a piena larghezza; il costo in altezza (~98px, misura 15.7) va quantificato pre/post nel record. |
| R-15.9-f | Q6 | **A — `/ppr`: risanamento chirurgico** | AC 6: campi e submit ≥44px ancorati a `.ppr-*`, submit full-width, trigger calendario 44px nel form pubblico; hero/aside/footer invariati; i 47 target di `.cal-popover` restano TD dichiarato per la 15.10. |
| R-15.9-g | Q7 | **A — switch di lingua visibile OVUNQUE, ≥44px** | Si toglie la dichiarazione dalla query 820px esistente (nessuna terza soglia); guardia: link visibile e ≥44px a 320/375/390/641/800, provata rossa reintroducendo il `display:none`. |
| R-15.9-h | Q8 | **A — il link coda PPR ↔ transiti SI FA QUI, col filtro server `pprNumber`** (contro la raccomandazione di rinvio) | **Unica modifica server della story** (AD-10 attivata): schema Zod + service + route + registry OpenAPI **nello stesso commit** + azione UI negli sheet. Nuovo **AC 15**. Chiude R-15.7-j. |
| R-15.9-i | Q9 | **A — coda PPR admin fuori scope, riserva 15.10** | Nessuna rifinitura; l'UNICA modifica ammessa su `/dashboard/ppr` è l'azione dello sheet imposta da R-15.9-h (AC 15 d), con non-regressione misurata del resto. |
| R-15.9-j | Q10 | **A — allineamento pieno di empty state e feedback** | Testid propri sui due empty di `AccountSection` (precedente R-15.7-i); empty mobile a nodo unico con stringa **DISTINTA** da «Nessun conto attivo» (guardia page-level `accounts-topups.spec.ts:101`); `adjustment-feedback` → **toast** su mobile, il `<p>` resta al desktop (canale unico, nessun doppio annuncio). |

## Story

As a pilota o allievo che controlla il proprio conto dal telefono, e come istruttore che verifica ore e compensi prima di firmare,
I want vedere le mie transazioni e i miei pagamenti come una lista di card leggibili invece di una tabella in cui la colonna **Descrizione è larga 0px** e l'importo finisce **200px fuori dallo schermo**,
so that le due schermate che pilota, allievo e istruttore hanno **in prima fila nella tab bar** (misurato: `mobile-tab-myAccount` per PILOT/STUDENT, `mobile-tab-myCompensation` per INSTRUCTOR — la quinta delle cinque icone di ciascuno) smettano di essere l'unica superficie dell'epic ancora illeggibile, **senza cambiare una sola regola** della contabilità di conto (segno, storni, rettifiche collegate, saldo) né del calcolo compensi (maturato lordo vs dovuto netto).

E, come pilota in transito che chiede il PPR dal piazzale con il telefono in mano: compilare il modulo pubblico dell'aviosuperficie con campi che si toccano con un dito invece che con la punta di un'unghia (**12 campi su 12 sotto i 44px**, i due trigger del calendario a **24×24**), e **poter cambiare lingua** — che oggi, su qualunque telefono e su qualunque tablet, **non è possibile**: `.ppr-top-right{display:none}` a ≤820px nasconde l'unico switch IT/EN della vetrina pubblica bilingue (`airops.css:1571`, misurato a 320/375/390/641/800: link `0×0`; ricompare a 821px).

E, come debito ereditato: **chiudere il TD 14.6 F4** — l'estratto conto `account-section.tsx`, componente **CONDIVISO** fra `my-account` e la scheda persona `people/{id}`, che la 15.5 ha dovuto **escludere esplicitamente dal proprio sweep** (`e2e/mobile-registries.spec.ts:888`, `!el.closest('[data-testid="account-section"]')`, con il commento *«TD 14.6 F4 … stays OPEN by this story's own declaration: it is the ONLY declared exception»*). Questa è la story che possiede quel componente: o l'esclusione sparisce qui, o va ratificato il rinvio alla 15.10.

---

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)` **tranne** le eventuali eccezioni dichiarate — e su `/ppr` la soglia esistente è **820px**, non 640: v. ⟨Q7⟩), **R2** (il template è incompleto by design — e su queste quattro superfici lo è **totalmente**: v. §a.0, il template **non ha** né una schermata "le mie transazioni", né una "i miei compensi", né il modulo pubblico; il linguaggio si eredita dalle superfici gemelle già consegnate, non si inventa), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e azione primaria fissa in basso), **R4** (si porta TUTTO: nessuna superficie resta "tabella desktop scrollabile in orizzontale" come stato finale — ed è lo stato di oggi su **tutte e tre** le superfici autenticate, misurato in §a.1/§a.2/§a.3), **R5** (logout/lingua nel menu profilo della shell, 15.1 — ⚠️ **`/ppr` è FUORI dalla shell**: non ha topbar, non ha tab bar, non ha menu profilo, misurato; il suo switch di lingua è un problema tutto suo, ⟨Q7⟩). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (15.1, in CLAUDE.md): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**. ⚠️ **Regola AD-5 della 15.5**: il suffisso `-mobile` è **illegale** dove esiste un selettore `^=` sul nome desktop. **Verificato per questa story** (`grep -rn 'data-testid\^=' e2e/`, 2026-08-05 — **20 occorrenze**, 7 file): i prefissi in uso sono `pilot-row-`, `ac-card-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-tail-chip-`, `mobile-fleet-`, `mobile-fleet-card-`, `reports-fleet-row-`, `reports-rank-aircraft-row-`, `reports-rank-pilot-row-`, `reports-instructor-row-`. **Nessuno tocca `account-`, `my-compensation-`, `adjustment-`, `reversal-`, `ppr-form`, `ppr-submit`, `ppr-success`, `export-menu-`** ⇒ il suffisso `-mobile` è **LEGALE** qui. ⚠️ **MA** `account-adjustment-row-{id}` è una famiglia di testid **composti con l'id di dominio** (`account-section.tsx:311`): un albero mobile che la riusasse darebbe due nodi per lo stesso id a 1280px. La verifica va **rifatta dal dev** prima di scegliere ogni nome, e riportata nel record.

**Le lezioni fresche (15.5 → 15.8b) che questa story può violare davvero**:

1. **Un'esclusione non dichiarata è una guardia che mente** (15.8a MINOR-1, riconfermata dal MINOR-2 della review 15.8b: la checkbox da 20×20 che compariva solo a form aperto). Qui la story ne eredita **una già scritta e dichiarata** (`mobile-registries.spec.ts:888` esclude `account-section` dallo sweep della scheda persona) e ne incontra **due nuove e obbligate** su `/ppr`: il **honeypot** (`ppr-honeypot`, 18×198, `position:absolute; left:-9999px` — misurato: entra nello sweep dei target E il suo wrapper è uno scroller `cw 1 / sw 198`) e i **47 target sotto 43,5px dentro `.cal-popover`** (primitiva condivisa). Vanno **dichiarate**, non ignorate.
2. **Le guardie si scrivono sul REQUISITO, mai sul valore ottenuto** (15.7 MINOR-1, 15.8b LOW-3: un'asserzione tautologica non discrimina più nulla). Qui il pavimento è **44** e la soglia dello sweep **43,5**, sempre — anche dove il valore ottenuto è più alto **per caso**: `ppr-submit` misura **64,59px a 375px** solo perché l'etichetta italiana va a capo (a ≥641px lo stesso bottone misura **44,3**). È esattamente il caso 15.8a delle voci di export a 53,7px.
3. **`text-overflow: ellipsis` nasconde gli sfondamenti allo sweep** (15.5 F1/§12) ⇒ serve una guardia di **CONTENIMENTO sul rect** per ogni oggetto che può crescere: qui l'importo (fino a `+1.200,00 €`), la descrizione del movimento, il periodo del pagamento (`15/01/2020 – 15/01/2020`, 200px di traccia fissa), il nome del metodo.
4. **Parità informativa enumerata contro TUTTO ciò che il desktop mostra o APRE dalla riga** (15.5 F2). Sulla faccia admin dell'estratto conto la riga **apre** un form (`account-adjustment-row-{id}` → pannello rettifica precompilato) e mostra **sei** colonne; sulla faccia self ne mostra **quattro** e non apre nulla.
5. **MAI asserzioni "riga in pagina 1" su liste paginate** (15.7, rosso del primo arbitro). L'estratto conto pagina a **20** (`ACCOUNT_PAGE_SIZE`, `my-account/page.tsx:16` e la gemella non esportata di `people/[id]/page.tsx`) e sul DB reale esistono conti con **21 movimenti** (2 pagine, misurato).
6. **Un cap è una SELEZIONE: ha senso solo se l'ordine DOM coincide con la metrica promessa** (15.8b MAJOR-1). Qui **non si introduce nessun cap** (l'estratto conto è già paginato lato server e i pagamenti istruttore sono pochi): se il dev pensasse di introdurne uno, deve prima dimostrare che l'ordine è quello che il testo promette.
7. **Il remount va MISURATO, non assunto** (15.7 D1, 15.8a AD-3, 15.8b AD-3). **Misurato qui, ed è l'opposto della Contabilità**: `AccountSection` è montato **senza `key`** da entrambi i consumatori (`my-account/page.tsx:131`, `people/[id]/page.tsx:389`) ⇒ **non rimonta mai**. Prova diretta: aperto il form "Registra ricarica" sulla scheda persona, digitato `42`, navigato a `?page=2` → il form è **ancora aperto** con **ancora `42`** dentro, mentre la lista sotto è cambiata (`2 / 2`, 1 riga). Uno sheet o un pannello mobile aperto **sopravvive** alla navigazione e a un `router.refresh()`: va **chiuso esplicitamente**, come già fanno `handleTopUpSuccess`/`handleAdjustmentSuccess` (`account-section.tsx:192-204`).
8. **Accessible-name ben formato, mai una guardia che conta gli `split`** (15.5 F1): il `sub` di un eventuale `BottomSheet` qui si compone da campi **nullable** (`description` **null** → il desktop stampa `—`, misurato; `actorEmail` **opzionale**; `method` sempre valorizzato sui payout) ⇒ segmenti assenti **omessi** via `joinSegments`, guardia su una **proprietà** (`not.toMatch(/—\s*—/)`).
9. **Il criterio "testata ≤ pre-fix mantenendo i 44px" va verificato con l'ARITMETICA prima di prometterlo** (15.5 F3, 15.6 R-15.6-e). Qui le testate sono minuscole e il problema è quasi tutto nel CORPO: `.page-head` **51,44** (my-account) / **70,28** (my-compensation) / **198,41** (scheda persona) e `.card-head` **63,84** / **49,3** / **106,69** a 375px. C'è pochissimo da guadagnare in testa e moltissimo da guadagnare in riga.

**Fonte visiva**: template `AirOps Mobile.dc.html` (+ `data.js`) — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/756bf5df-6305-44ec-bd2f-d0e61f2d5e2e/scratchpad/AirOps-Mobile.dc.html`. Lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de` (i subagent NON lo raggiungono). Riferimento storico **locale** per il modulo pubblico: `docs/design-reference/airops/PPR Request.html` (prototipo **desktop** del form pubblico, già portato 1:1 dalla story 12.4). **Leggerli davvero** prima di scrivere codice.

---

## Ricognizione (2026-08-05, teammate story — verificata su file, righe e **misure a runtime** su build di produzione `npm run start`, DB reale post-suite: **374 persone, 176 velivoli, 299 conti, 205 movimenti di conto, 68 richieste PPR** — 13 PENDING, 41 APPROVED, 3 REJECTED, 8 COMPLETED, 3 CANCELLED — **7 pagamenti istruttore**, `membership.annualFeeCents = 0`, `airfield.icao = LITA`. Il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 15.1-15.8b)

### a.0) Che cosa dice il template per queste quattro superfici — e quanto poco è (R2 al grado massimo)

Il template AirOps Mobile disegna **quattro** schermate self-adiacenti: `Pilota · Home` (righe 401-431), `Istruttore · Oggi` (434-466) — **già consumate dalla 15.3** (landing per-ruolo) — e le due liste admin. **Non esiste** nel template:

- nessuna schermata "le mie transazioni" / estratto conto personale;
- nessuna schermata "i miei compensi";
- nessun modulo PPR pubblico (il template è tutto dentro la shell autenticata: tab bar sempre presente, topbar sempre presente);
- nessun form pubblico, nessuna vetrina, nessun footer di sito.

Quello che il template **dà** e che questa story eredita è **una riga**: la lista "Movimenti recenti" della schermata `Admin · Contabilità` (righe 325-334) — `display:grid; grid-template-columns:1fr auto; gap:10px; padding:10px 16px; border-top:1px solid var(--border); align-items:center`, a sinistra un blocco `min-width:0` con descrizione **12,5px/500 ellissata** e sub mono **10,5px `--ink-3`** (`{{ t.sub }}` = `pilota · data · metodo`, script 671), a destra un **importo mono 12px/600** colorato (`t.amtColor`: `var(--ok-ink)` / `var(--bad-ink)` / `var(--ink)` — **i toni `-ink`, non `--ok`/`--bad`**). È **esattamente** la forma di un movimento di conto e di un pagamento istruttore, ed è **già implementata in casa** dalla 15.8a come `.mobile-row` + `.mobile-row-amount` (`airops.css`, blocco 15.8a).

Conseguenza operativa, da dichiarare e non subire: **per `/ppr` non esiste alcun riferimento visivo mobile**. L'unica fonte è il prototipo **desktop** `docs/design-reference/airops/PPR Request.html`, già portato 1:1 nella 12.4. Qualunque cosa si faccia lì è **progetto nuovo** nel linguaggio dell'epic (R2) — ⟨Q6⟩ esiste per decidere **quanto**.

### a.1) `my-account` — "Le mie transazioni": la colonna Descrizione è larga **0px** e l'importo sta **200px fuori dallo schermo**

`src/app/[locale]/dashboard/my-account/page.tsx` — **150 righe, server component puro**. Non ha console propria: monta `AccountSection` (§a.3) configurata *pilota-centrica* (`showActor={false}`, `canManageFinance={false}`, `statementBasePath="/dashboard/my-account"`, righe 140-145). `ACCOUNT_PAGE_SIZE = 20` (riga 16), clamp difensivo della pagina fuori range (74-78), href di export costruiti solo se `actor.personId` esiste (83-84).

**Misure a 375×812** (IT, tema chiaro, `.page` 375, `.card` 317, corpo carta **281**):

| superficie | valore | nota |
|---|---|---|
| `.page-head` | **51,44** a ogni larghezza | nessuna azione in testata |
| `.card-head` di `account-section` | **63,84** @375/@390/@641/@800/@1280 · **92,14** @320 | contiene solo titolo + `ExportMenu` |
| `.students` | `clientWidth` **281** / `scrollWidth` **434** ⇒ **153px nascosti** | 4 colonne |
| `gridTemplateColumns` **computato** | **`104px 150px 0px 120px`** | ⚠️ la traccia `1fr` della **Descrizione** collassa a **ZERO** |
| celle della prima riga (`w@right`) | `104@169` · `150@333` · **`0@347`** · `120@`**`481`** | l'importo finisce **200px oltre** il bordo del corpo (281) |
| lo stesso a **@641** | tracce `104px 150px 31px 120px`, `.students` **483/483** | **nessun** overflow, ma la Descrizione è **31px** |
| @800 / @1280 | `…190px…` **642/642** · `…502px…` **954/954** | sano |
| paginazione (21 movimenti = 2 pagine) | `account-statement-page-prev` **91,27×34,84**, `-next` **90,45×34,84**, status `1 / 2` | sotto i 44px |
| `export-menu-trigger` | **136,63×34,84** | sotto i 44px (le **voci** sono già a 44, v. sotto) |
| **totale target interattivi della pagina** | **3** | export + due frecce. Nient'altro |
| `pageOverflow` | **0** a 320/375/390/641/800/1280 | ⚠️ la tabella scrolla per conto suo ⇒ **una guardia sull'overflow di PAGINA sarebbe cieca**, classe 15.2/15.3 F8/15.5/15.6/15.7/15.8a |
| `docH` @375 | **1453** con 20 righe · **812** con 2 righe | |
| tab bar | `barTop` **734,16** in 812; `.main` ha `padding-bottom: 100px` (15.1) | hit-test a fondo pagina: **nessun controllo coperto** (v. §a.6, falso positivo `aria-disabled`) |

⚠️ **`ExportMenu` è GIÀ a posto** (consegnato dalla 15.8a, R-15.8a-h): a 375px il tocco su `export-menu-trigger` apre `export-menu-sheet` (z **40**, `0 → 375`, scrim `export-menu-sheet-scrim`) con `export-menu-pdf` e `export-menu-xls` a **44×341** e gli href giusti (`/api/v1/people/{id}/account/pdf?locale=it`, `/api/v1/people/{id}/account/movements?format=xlsx&locale=it`). **Non si tocca**: il lavoro qui è di **verifica misurata**.

⚠️ **Empty state senza testid**: un attore senza conto vede `account-balance` = «Nessun conto attivo» e, sotto, un `<p className="fld-label">` con «Nessun movimento registrato.» (`account-section.tsx:265-268`) **privo di testid** — stessa identica lacuna che la 15.7 ha chiuso su `my-expiries.tsx:41`.

### a.2) `my-compensation` — "I miei compensi": **359px nascosti**, l'importo **406px fuori**, e **zero** controlli interattivi

`src/app/[locale]/dashboard/my-compensation/page.tsx` — **157 righe, server component puro**, nessun componente client proprio. `TABLE_COLUMNS = '150px 200px 120px minmax(110px, 1fr)'` (riga 19, con il commento che spiega perché l'ultima traccia NON è un `1fr` nudo: la review 14.7 F2 aveva già misurato il collasso a 0).

**Misure a 375×812** (istruttore con 1 pagamento):

| superficie | valore | nota |
|---|---|---|
| `.page-head` | **70,28** @≤640 · **51,44** @≥641 | titolo + sub su due righe sul telefono |
| `.card-head` | **49,3** a ogni larghezza | solo il titolo "Pagamenti ricevuti" |
| `.students` | **281 / 640** ⇒ **359px nascosti** | 4 colonne |
| celle della riga (`w@right`) | `150@215` · `200@429` · `120@563` · `110@`**`687`** | l'importo finisce **406px oltre** il bordo (281) |
| @320 · **@641** · @800 · @1280 | `226/640` · **`483/640`** · `642/642` · `954/954` | ⚠️ **a 641px l'overflow c'è ancora** (157px): la fascia tablet **non** è sana su questa pagina |
| `.kpi-row` | **`flex`** `cw 375 / sw 835` con **5** card da **146px** a ≤640 · **`grid`** 521/521 @641, 680 @800, 992 @1280 | è **già** la strip della 15.2 |
| **totale target interattivi della pagina** | **0** | nessun export, nessun filtro, nessuna azione, nessuna paginazione |
| `pageOverflow` | **0** ovunque | stessa cecità di §a.1 |
| `docH` @375 | **812** (1 pagamento) | |
| hit-test a fondo pagina | `covered: []`, `barTop` 734,16 | il `padding-bottom: 100px` della 15.1 regge |

**I cinque KPI** (`my-compensation-kpis` → `kpi-rate`, `kpi-hours-mtd`, `kpi-gross-mtd`, `kpi-owed-mtd`, `kpi-owed-total`) portano: Tariffa oraria · Ore nel mese · **Maturato nel mese** (lordo = ore × tariffa) · **Dovuto nel mese** (netto) · Residuo dovuto. La distinzione lordo/netto è una **ratifica PO della review 14.7 F4** e va preservata alla lettera (commento a `page.tsx:103-106`). ⚠️ **Cinque** KPI: la variante 2×2 della 15.3/15.7 (`.kpi-row.kpi-row-grid`) è pensata per **quattro** — v. ⟨Q5⟩.

**Le tre facce** (misurate, tutte a 375px):

| attore | che cosa vede |
|---|---|
| ISTRUTTORE **con** profilo attivo e ≥1 pagamento | 5 KPI + tabella `my-compensation-payout-row` |
| ISTRUTTORE **con** profilo attivo, **0** pagamenti (il seed `instructor@`) | 5 KPI + `my-compensation-payouts-empty` («Nessun pagamento registrato.») |
| PILOTA / ALLIEVO / ADMIN (nessun profilo istruttore) | **solo** `my-compensation-empty` («Nessun profilo istruttore attivo.») dentro una `.card` **senza `.card-head`** — 0 KPI, 0 righe, `docH` 812 |

Entrambi gli empty state **hanno già** un testid proprio (a differenza di §a.1).

### a.3) `account-section.tsx` — il componente CONDIVISO, e il TD 14.6 F4 misurato su **entrambe** le facce

`src/app/[locale]/dashboard/people/[id]/account-section.tsx` — **585 righe, `'use client'`**. Due consumatori, **due geometrie**:

```
cols = ['104px','150px','1fr','120px', …showActor?['170px'], …showActions?['170px']]   (riga 210)
```

| faccia | props | colonne | `.students` @375 | ultima cella `right` |
|---|---|---|---|---|
| **self** (`my-account`) | `showActor:false`, `canManageFinance:false` | **4** | **281 / 434** | **481** |
| **admin** (`people/{id}`) | `showActor:true`, `canManageFinance:true` | **6** | **281 / 802** ⇒ **521px nascosti** | **849** |

**Misure aggiuntive sulla faccia admin a 375×812** (persona con 21 movimenti):

| superficie | valore |
|---|---|
| `.page-head` della scheda persona | **198,41** @375/@320 · 82,41 @641 · 53,81 @800 |
| `.card-head` di `account-section` | **106,69** @375/@641 · **177,83** @320 · 63,84 @800/@1280 |
| `account-topup-toggle` / `account-adjustment-toggle` | **116,41×34,84** / **117,77×34,84** |
| **`account-adjustment-row-{id}`** (azione di riga) | **154,55×24,67** — **il target più piccolo delle quattro superfici** |
| scroller interni a `.page` | **43** |
| `docH` | **2919** |
| tab bar | `barTop` **745,08** |

⚠️ **La 15.5 ha DICHIARATO l'esclusione**: `e2e/mobile-registries.spec.ts:874-897` fa lo sweep degli scroller nascosti sulla scheda persona **saltando** `[data-testid="account-section"]`, con il commento che lo motiva. **Se questa story chiude il TD, quella riga di esclusione deve sparire e il test deve restare verde** — è la guardia più discriminante che esista per il TD (⟨Q2⟩).

**Comportamenti di dominio da preservare IDENTICI** (con le righe):

| # | comportamento | dove | cosa deve restare vero su mobile |
|---|---|---|---|
| 1 | **Saldo**: rosso solo se `hasAccount && balanceCents < 0`; altrimenti `--ink`; senza conto stampa la stringa `noAccount` | `:238-240` | stesso ramo, stesso testo, stesso testid `account-balance` |
| 2 | **Segno e formato**: `formatSignedCents` col segno esplicito, colore per segno | `:300-302` | invariati (⚠️ il **colore** è sotto soglia, v. §a.5 e ⟨Q4⟩) |
| 3 | **Badge rettifica** (`ADJUSTMENT` + `reversalOfId`) e **badge storno** (`FLIGHT_CHARGE_REVERSAL` + `reversalOfId`), col testo che porta la **data dell'originale** solo se l'originale è **nella stessa pagina** (`rowById`), altrimenti il testo `linked` | `:178-186`, `:286-295` | stessa logica, stesso fallback: ⚠️ è un comportamento **dipendente dalla paginazione**, e un test che assume «l'originale è in pagina» è fragile per costruzione |
| 4 | **Azione di riga assente** su `hasReversal` o `PACKAGE_PURCHASE` | `:310` | stesso gate: su quelle righe **zero azioni** |
| 5 | **Ricarica**: `POST /people/{id}/account/top-ups` con `Idempotency-Key` rigenerata **dopo** la risposta; importo `> 0` e `<= 2_147_483_647`; metodo CASH/BANK_TRANSFER/POS; data obbligatoria; descrizione vuota ⇒ `null` | `:354-371`, `:402-430` | invariati; su mobile **una sola logica di rete** (AD-6) |
| 6 | **Rettifica**: `POST /people/{id}/account/adjustments`, importo **≠ 0** (positivo o negativo), motivo obbligatorio ≤500, `originalMovementId` **null** se standalone; **409 distinto dal generico** | `:471-487`, `:519-545` | invariati, 409 → `conflictError` |
| 7 | **Il pannello rettifica RIMONTA** quando cambia il bersaglio (`key={adjustPanel.originalMovement?.id ?? 'standalone'}`) perché RHF legge i `defaultValues` solo al mount | `:254` | qualunque superficie mobile deve conservare **questa** semantica |
| 8 | **`router.refresh()` + chiusura esplicita** su ogni successo; feedback rettifica in un `<p role="status" data-testid="adjustment-feedback">` **dentro la `.card-head`** | `:192-204`, `:217-221` | ⚠️ è la stessa forma che 15.6/15.7/15.8a hanno sostituito col **toast** su mobile (R-15.6-d ii, R-15.7-g, R-15.8a-j) |
| 9 | **`statementBasePath`** decide il target dei `Link` di paginazione (`/dashboard/my-account` vs `/dashboard/people/{id}`) | `:188-190` | invariato: è l'unica differenza di comportamento fra le due facce (review 14.6 F3) |
| 10 | **Nessun `key` sul componente** ⇒ **non rimonta mai** | `my-account:131`, `people/[id]:389` | **misurato**: un form aperto sopravvive a `?page=1→2`. Uno sheet/pannello mobile va **chiuso esplicitamente** |

### a.4) `/ppr` — il modulo pubblico: **12 campi su 12 sotto i 44px**, e la lingua che sparisce a ≤820px

`src/app/[locale]/ppr/` — 2 file: `page.tsx` (158 righe, server component; legge `getAirfieldBranding()` + `getAirfieldIcao()`, story 10.2) e `ppr-form.tsx` (470 righe, `'use client'`). ⚠️ **Superficie SENZA AUTH** (`src/proxy.ts` `PUBLIC_WEB_PATHS`) e **fuori dalla shell**: misurato a 375px, `mobile-tab-bar` **assente**, `.mobile-topbar` **assente**.

**Misure a 375×812** (IT, tema chiaro):

| superficie | valore | nota |
|---|---|---|
| `pageOverflow` | **0** a 320/375/390/641/800/821/900/1024/1280 | |
| `docH` | **2025** (IT) · **1969** (EN) · **1137** dopo il successo | 2,5 schermate di modulo |
| `.ppr-top` | **75,5** @375/@390 · **90** @320 · 60 @≥641 | |
| `.ppr-hero` | **230,53** (IT, `h1` 34px su **due** righe = 69,34) · **174,11** (EN, `h1` 34,67 su una riga) | il titolo italiano costa **56px** in più |
| `.ppr-grid` | **1 colonna** già a ≤820px (`327px` @375) — `1.7fr 1fr` solo a ≥821px | regola `airops.css:1571` |
| `#formCard` | **327×1222,91**, `padding: 22px 24px` ⇒ contenuto **277** | |
| `.ppr-form-grid` | **1 colonna** a ≤640px (fix 13.10 review F3, `airops.css:1611`) · **2 colonne** da 264,5px a 641px | ⚠️ fra **641 e 820px** il form è a **due colonne dentro una griglia a una colonna** |
| **i 12 campi** | 10 `input.input` a **36,84** · 2 `datetime-local` a **38,84** · `textarea` 74,53 | **nessuno raggiunge i 44px** |
| **2 `.date-input-btn`** | **24×24** | i trigger del calendario. Quattro story (15.7/15.8a×2/15.8b) li hanno già portati a **36px** — ma solo **ancorati** alla propria superficie (`.movements-filter-panel`, `.billing-filter-panel`, `.transaction-form`, `.settings-card`); qui restano **24** |
| `ppr-submit` | **101,64×64,59** @375 · **127,41×44,30** @≥641 | ⚠️ i 64,59 sono **il testo che va a capo**, non un target progettato (lezione 2) |
| `.ppr-actions` | `display:flex`, **`flex-wrap: nowrap`**, h **85,59** @375 | il submit e la nota "campi obbligatori" competono sulla stessa riga |
| **`.ppr-top-right`** | **`display: none` a ≤820px** (`airops.css:1571`) ⇒ link lingua **0×0** a 320/375/390/641/800; a **821px** torna `flex` e misura **45,72×15,94** | ⚠️ **è l'unico switch IT/EN della vetrina pubblica**, e sul desktop è comunque **sotto i 44px** |
| `.ppr-aside` | 327×294,81, sotto il form a ≤820px (`asideTop` 1559 su docH 2025) | le due `info-card`: "Come funziona" + "Aeroporto" |
| `.ppr-foot` | **99,69** @≤640 · 66,34 @641 · 49,67 @≥800 | |
| scroller interni | **1**: il wrapper del honeypot, `cw 1 / sw 198` | ⚠️ **esclusione obbligatoria e da DICHIARARE** |
| target sotto 43,5 | **14** a 375px, di cui **1** è il honeypot (18×198, off-screen) | v. ⟨Q6⟩ |

**Stati misurati, tutti a 375px:**

- **Submit vuoto** → **10 `.fld-error`** inline da 17,39px (uno per campo obbligatorio), `aria-invalid` sul primo campo, **nessun** banner (`ppr-form-error` assente), **nessuna** richiesta di rete (comportamento 14.2 AC 1/2, coperto da `ppr-public.spec.ts:280`). Contrasto `.fld-error` **9,82:1**. ⚠️ Il primo campo invalido sta a `top` **398** su `docH` 2259 e la pagina **non scrolla da sola**: l'utente vede il modulo fermo.
- **Successo** → `.ppr-success` **327×334,28** (`padding: 40px 36px`), **visibile senza scorrere**, `ppr-success-again` **178×44,30** (l'unico target già a norma), `docH` scende a **1137**, `pageOverflow` 0.
- **Picker data/ora** → il tocco su `.date-input-btn` apre `.cal-popover` **portalata su `document.body`**, z **66**: **280×362,69** a `x 47,5 → right 327,5`, **interamente dentro il viewport** (è il fix 13.10-F3, già guardato da `datetime-picker.spec.ts:237`). ⚠️ **Al suo interno 47 target sotto 43,5px**: 42 `.cal-cell` da **34,58×34,58** e 2 `.iconbtn` da **24×24**. È una **primitiva condivisa** (`CalendarPopover`, 11+ consumatori): v. ⟨Q6⟩/AC 16.
- **Bilinguismo** → il form è completamente tradotto (`PprPage` **45 chiavi**, parità piena IT/EN), l'email di ricevuta arriva nella **stessa lingua del form** (`locale` nel body, `ppr-form.tsx:207`, coperto da `ppr-public.spec.ts:197`), ma **lo switch non è raggiungibile** sotto 821px (sopra).
- **Contrasti** (canvas→WCAG, sfondo effettivo risolto risalendo gli antenati): **nessun difetto**. Chiaro: `.ppr-brand-name` 17,99 · `.ppr-brand-sub` 8,20 · `.ppr-eyebrow` 12,39 · `h1` 17,99 · `.ppr-hero p` 9,57 · `.ppr-section-label`/`.fld-label`/`.note`/`.ppr-foot-in span`/`.info-row .k` **4,85** · `.info-card li` 8,60 · `.info-row .v`/`.input` 18,79 · `.fld-error` 9,82. Scuro: gli stessi selettori 5,72-17,00. **Tutti sopra soglia in entrambi i temi** — a differenza delle tre superfici autenticate (§a.5).

**Validazioni e limiti del form (invarianti di dominio, con le righe)**:

| # | regola | dove |
|---|---|---|
| 1 | 9 campi obbligatori + email con regex; `etd <= eta` ⇒ `invalidRange`; `personsOnBoard` intero 1-99 | `ppr-form.tsx:115-149` |
| 2 | `.max()` speculari a `createPprRequestSchema` (100/100/30/20/100/100/100, note 1000) | `:99-114` |
| 3 | **Honeypot** `website`: off-screen (**non** `display:none`), `aria-hidden`, `tabIndex={-1}`, inoltrato solo se valorizzato | `:449-453`, `:210` |
| 4 | 429 ⇒ `RATE_LIMITED`; 422 field-shaped ⇒ marcatura per-campo sugli **11** campi con slot `.fld-error` visibile (mai `notes`/`website`); `ETA_IN_PAST` / `ETD_NOT_AFTER_ETA` ⇒ banner dedicato | `:219-263` |
| 5 | Il successo **non** porta il numero PPR (D13: arriva per email all'approvazione) e "invia un'altra" **resetta lo stato locale**, niente reload | `:268-289` |
| 6 | Nome/ICAO aviosuperficie da `AppSetting` (`airfield.name`, `airfield.icao`) in topbar, aside e footer; le voci senza setting sono **omesse, mai stubate** | `page.tsx:49`, `:134-146` |

### a.5) I contrasti degli importi: **2,73:1** e **3,96:1** in tema chiaro, su **tre** superfici, e la medicina è già in casa

Misurati canvas→WCAG a 375px, tema **chiaro**, sfondo effettivo risolto risalendo gli antenati e alpha letta **prima** della composizione:

| selettore | superficie | chiaro | scuro |
|---|---|---|---|
| `[data-testid="account-movement-row"] .mono.num` con importo **positivo** (`color: var(--ok)`, inline `account-section.tsx:300`) | my-account **e** people/{id} | **2,73** ❌ | 9,30 ✅ |
| lo stesso con importo **negativo** (`color: var(--bad)`) | my-account **e** people/{id} | **3,96** ❌ | 6,61 ✅ |
| `[data-testid="my-compensation-payout-row"] .mono.num` (`color: var(--ok)`, inline `my-compensation/page.tsx:144`) | my-compensation | **2,73** ❌ | 9,47 ✅ |
| `account-balance` in rosso (`var(--bad)`, `account-section.tsx:238`) | my-account **e** people/{id} | **da misurare** (nessun conto in rosso fra i fixture provati) — stessa coppia `--bad` su `--panel` di sopra | |
| `.kpi-label` | tutte | 4,85 ✅ | 5,72 ✅ |
| `.page-head .sub` | tutte | 4,64 ✅ | 6,18 ✅ |
| `.card-title`, `.kpi-value`, `account-balance` neutro | tutte | 18,79 ✅ | 15,74 ✅ |
| data/descrizione di riga (`--ink-2`) | tutte | 9,99 ✅ | 9,47 ✅ |

⚠️ **Sono gli STESSI DUE numeri che la 15.8a ha chiuso** su `billing-by-category-row` (in **2,73**, out **3,96**) e `negative-balance-row` (**3,96**), con la stessa causa (`var(--ok)`/`var(--bad)` come **colore di testo**) e la stessa medicina già scritta e misurata: **`.stat-tone-ok` / `.stat-tone-bad`** (`airops.css:733-737`, con l'override `html[data-theme="dark"]` che ritorna a `--ok`/`--bad`), misurate **9,82 / 10,63**. ⚠️ **Ma qui i colori sono `style` INLINE** — e uno stile inline batte qualunque regola di classe (lezione 15.8b LOW-1): il fix **deve** sostituire l'inline con la classe, esattamente come la 15.8a ha fatto. Il fix vale **desktop e mobile** (queste superfici esistono su entrambi) ⇒ desktop **rimisurato** e dichiarato. ⟨Q4⟩

### a.6) RBAC, facce e tab bar — misurato per attore

| attore | `my-account` | `my-compensation` | tab bar mobile (15.1) |
|---|---|---|---|
| **PILOTA** (`self.read`) | conto attivo, 2 movimenti, saldo 50,00 € | «Nessun profilo istruttore attivo.» | `overview · schedule · scadenze · logbook · **myAccount**` — 5 voci, **nessun "Altro"** |
| **ALLIEVO** | **identica** al pilota per struttura (stesso componente, stessi prop): sul DB attuale il seed `student@` non ha conto ⇒ «Nessun conto attivo» | come il pilota | `overview · schedule · scadenze · logbook · **myAccount**` |
| **ISTRUTTORE** | raggiungibile, «Nessun conto attivo» | 5 KPI + storico | `overview · schedule · scadenze · logbook · **myCompensation**` |
| **ADMIN** | raggiungibile, «Nessun conto attivo» | raggiungibile, «Nessun profilo istruttore attivo.» | `overview · schedule · ppr · fleet · **more**` — **nessuna** delle due voci self (né in barra né nello sheet: `roles: SELF_SERVICE_ROLES` / `INSTRUCTOR_ROLES`, `route-registry.ts:120/122`) |

Cioè, rispondendo alla domanda del brief: **allievo e pilota vedono ESATTAMENTE la stessa cosa** su `my-account` — non c'è alcun ramo per ruolo nel codice, la differenza è solo nei dati. Le due pagine sono **universalmente raggiungibili** (`self.read`, concesso a ogni ruolo — commenti a `my-account/page.tsx:30-43` e `my-compensation/page.tsx:32-47`): admin e istruttore che ci navigano direttamente vedono il **proprio** (tipicamente vuoto) stato, mai quello di un altro. **Nessun redirect da testare**, a differenza di Movimenti/Contabilità.

⚠️ **Falso positivo dell'hit-test da dichiarare**: a fondo pagina su `my-account`, lo sweep `elementFromPoint` segnala `account-statement-page-prev` come "coperto" — in realtà il `Link` ha `aria-disabled="true"` ⇒ `pointer-events: none` (convenzione preesistente dell'app) e `elementFromPoint` restituisce il genitore. **Va escluso dichiarandolo**, non "risolto".

### a.7) Le primitive già consegnate da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`**: `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`; compone `MobileSheet`; nome accessibile = `` `${sub} — ${title}` ``; `onClose` **deve** essere referenzialmente stabile (`useCallback`); uno sheet alla volta (fix 15.3 F4).
- **`src/components/ui/mobile-sheet.tsx`**: scrim `<testId>-scrim`, `Escape` montato solo da aperto, focus al pannello e ritorno al trigger, `role="dialog"`, z **40**.
- **`src/lib/mobile-*.ts` + `joinSegments`**: le derivazioni pure delle sub-line, con l'omissione dei segmenti assenti (15.5 F1 → 15.8a AD-6 → 15.8b AD-5). Precedenti diretti: `mobile-logbook.ts`, `mobile-registries.ts`, `mobile-agenda.ts`, `mobile-settings.ts`.
- **CSS già pronto, dentro `@media (max-width:640px)`**: `.mobile-card-head/-title/-count/-empty/-foot`, `.mobile-row` + figli (**UN solo `<button>` con figli `<span>`**), `.mobile-row-tail`, `.mobile-row-name/-sub`, `.mobile-row-side/-amount/-note` (15.5), `.mobile-row-flag`, `.mobile-row-edge-*` (15.4), `.mobile-chip-strip > .btn`, `a.mobile-row`, `.registry-head`/`.registry-pagination` (15.5), `.logbook-head`/`.logbook-filter-panel` (15.6), `.kpi-row.kpi-row-grid` (variante **2×2**, per le facce con **esattamente quattro** KPI), il blocco 15.8a (`.billing-mobile`, `.mobile-row-amount`, `.export-menu-*`) e il blocco 15.8b.
- **`.stat-tone-ok`/`.stat-tone-bad`** (`airops.css:733-737`) e i gemelli grafici `.flow-bar-in`/`.flow-bar-out` introdotti dalla 15.8a: **la medicina dei contrasti già ratificata e misurata**. ⟨Q4⟩
- **`ExportMenu`** (15.8a): bottom sheet a ≤640px, popover identico al desktop sopra. **Non si tocca.**
- ⚠️ **`.registry-pagination`** (15.5) è il modello per le due frecce dell'estratto conto — ma la paginazione di `AccountSection` è un `<div>` **inline-styled** (`account-section.tsx:323`), quindi come in 15.8a-f va prima portata in una classe propria, altrimenti nessuna media query la raggiunge.

### a.8) `airops.css`: dove va la roba nuova, cosa non toccare

- File di **3493 righe**. Sezioni mobile: shell 15.1 **1686-1801**, primitive 15.2 **1824-2023**, panoramica 15.3, pianificazione 15.4, anagrafiche 15.5 (**2426-2712**, con `.person-*`), registro voli 15.6, scadenze+transiti 15.7, **contabilità+export 15.8a 3076-3346**, **statistiche+impostazioni 15.8b 3347-3493**. Le regole nuove vanno **in coda**, in un blocco proprio `/* ---------- aree self + modulo pubblico mobile (story 15.9) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** le righe `display:none` fuori-query per gli alberi mobile (precedenti: `.billing-mobile` ecc.) e quanto ⟨Q7⟩ decide per `/ppr`, dove la soglia esistente è **820px**.
- **Mappa z-index in uso**: `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · popover/typeahead 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** (misurato su `/ppr`: `.cal-popover` = **66**) · `.toast-host` **200**.
- ⚠️ **Classi da NON usare come aggancio**: `.card`, `.card-head`, `.students`/`.student-row` (13 console), `.kpi-row`, `.split`, `.segmented` (6 consumatori), `.date-input` (5 pagine), `.mini-modal`. Lo switch va su **classi di pagina proprie** e i selettori vanno ancorati con `>` (lezione 15.3 F1, riconfermata 15.5 F5).
- ⚠️ **`.info-row` / `.info-card` sono CONDIVISE fra la scheda persona e `/ppr`**: è esattamente il selettore che la review **15.5 F5** ha trovato sfondare nel modulo pubblico (`.info-row .v{min-width:0;overflow-wrap:anywhere}`), poi riancorato a `.person-identity > .info-row > .v` (`airops.css:2695`). **Ogni regola nuova su `.info-*` va ancorata**, e la misura di controllo va fatta **su `/ppr`**.
- ⚠️ **`.date-input-btn` è globale e non ancorato** (`airops.css:1696`, 24×24). Le quattro maggiorazioni a 36px esistenti sono tutte **ancorate** alla propria superficie. Una regola nuova non ancorata arriverebbe a **tutte** le date dell'app, `/ppr` compreso.
- **Scansione fatta** (2026-08-05): fra la riga 1680 e la fine del file **non esiste** alcuna regola mobile su `.card`, `.input`, `.btn`, `.fld`, `.badge`, `.students`, `.student-row`, `.info-card`, `.info-row` non ancorata. `/ppr` è **oggi insulato**: ogni regola nuova di questa story che lo raggiunga sarebbe una **regressione introdotta qui**.

### b) e2e e unit — il campo minato preciso

**Spec che vivono su queste superfici** (righe verificate il 2026-08-05):

| file | test | cosa fa | rischio per questa story |
|---|---|---|---|
| `e2e/my-account.spec.ts` | 6 | visibilità sidebar per ruolo, movimenti propri + saldo esatto, **paginazione 20+1 con `statementBasePath`**, faccia allievo, probe IDOR, attore senza persona | ⚠️ `account-movement-row` letto **page-level con `toHaveCount`** a **184, 211, 218, 222, 254, 302**; `account-statement-header-row` con `not.toContainText('Registrato da'/'Azioni')` a **185/186/255** — un albero mobile che riusa quei testid dà **2N nodi a 1280px** |
| `e2e/my-compensation.spec.ts` | 7 | visibilità + profilo disattivato, storico proprio, **lordo ≠ netto** (ratifica 14.7 F4), due probe IDOR, **geometria mobile a 390px** (review F2: la cella Importo deve avere larghezza > 0 ed essere hit-testabile **dopo** aver scrollato `.students` a destra) | ⚠️ `my-compensation-payout-row` page-level a **263, 302, 323, 340**; `my-compensation-kpis` `toHaveCount(0)` a **237/301/320**. ⚠️ **il test di geometria a 390px scrolla `.students`**: se la tabella diventa `display:none` a ≤640px quel test **muore** — va riscritto **al valore corretto** (la cella dev'essere leggibile **senza** scroll orizzontale), mai indebolito |
| `e2e/account-statement.spec.ts` | 4 | 2 ricariche dalla scheda persona, colonna "Registrato da" presente/assente, 403 cross-person, formattazione EN | ⚠️ `account-balance` e `account-movement-row` page-level a **76/81/110/111/141/142**; `account-statement-header-row` a **79/112** |
| `e2e/accounts-topups.spec.ts` | 6 | creazione conto, ricarica 100 €, «Nessun conto attivo», faccia pilota senza azione, 403, niente update/delete | ⚠️ `account-balance` page-level ×6 (**61/71/79/88/101/112**), fra cui `toHaveText('Nessun conto attivo')` a **101** — una stringa che l'albero mobile **non può ripetere** |
| `e2e/account-adjustments.spec.ts` | 4 | rettifica −250 €, alert saldo negativo, badge rettifica + consumo dell'azione di riga, 409 sul secondo collegamento, 403 pilota | ⚠️ `adjustment-badge` page-level con `toHaveText` a **156**; `account-movement-row` a **104/147/159/160**; `account-adjustment-form` a **150** |
| `e2e/flight-reversal.spec.ts` | — | storno volo letto **nell'estratto conto** della scheda persona | ⚠️ `account-balance` **239/317**, `account-movement-row` **240/242**, `reversal-badge` **244** |
| `e2e/flights.spec.ts` | — | addebito volo letto nell'estratto conto | ⚠️ `account-movement-row` **274**, `account-balance` **276** |
| `e2e/people-management.spec.ts` | — | ricarica via API + lettura del saldo | `account-balance` **220** |
| `e2e/pdf-exports.spec.ts` | 9 | `/api/v1/people/{id}/account/pdf` (**222, 262, 286, 289, 314**), parità own-access pilota 200 / altrui 403 | gli href di export **non cambiano** |
| `e2e/ppr-public.spec.ts` | 6 | **nessun login**: submit IT + email Mailpit, submit EN nella stessa lingua, honeypot senza email, **submit vuoto = errori per campo + zero rete**, rate limit 429 al 6°, 422 `ETA_IN_PAST` | ⚠️ `ppr-success` page-level a **186/220/272**; il riempimento del form va **per etichetta localizzata** (`:128`) ⇒ **ogni cambio di label rompe il fill** |
| `e2e/datetime-picker.spec.ts` | 2 su `/ppr` | **`:237` è già un test a 375px sul modulo pubblico**: il campo ETD e la `.cal-popover` restano dentro il viewport, `scrollWidth <= clientWidth`, il conferma è hit-testabile; **`:278`** il guard-rail del flip a 1440px | ⚠️ usa `span.date-input:has(input[name="etd"])` e `getByRole('button', {name:'Apri calendario'})` **page-level**: due trigger uguali romperebbero lo strict mode |
| `e2e/ppr-queue.spec.ts` | — | `/dashboard/ppr` (già mobile dalla 15.2) e `ManualPprForm` | fuori scope, ma condivide il dominio |
| `e2e/mobile-shell.spec.ts` | 5 | **`:141`** la tab bar del pilota naviga a `/it/dashboard/my-account` | la voce e il target **non cambiano** |
| `e2e/mobile-registries.spec.ts` | — | **`:874-897`** sweep degli scroller nascosti sulla scheda persona **con l'esclusione dichiarata di `account-section`** (`:888`) | ⚠️ **la guardia più importante della story**: chiudere il TD significa **cancellare quella riga** e restare verdi |
| `e2e/mobile-billing.spec.ts` / `e2e/mobile-settings.spec.ts` | — | `export-menu-trigger`/`-xls`/`-pdf` = **un nodo per superficie**, `.export-menu-panel` letta con `document.querySelector` | l'`ExportMenu` di `account-section` **non si tocca** |
| `e2e/membership-fee.spec.ts` + `e2e/mobile-membership-fee.spec.ts` | 7 + 2 | addebitano la quota associativa a una persona ⇒ **creano un `AccountMovement`** sul conto di quella persona | ⚠️ `mobile-membership-fee.spec.ts` è **in catena serializzata** (8° project): nessun test nuovo di questa story deve asserire aggregati di conto **globali** |

**Tutta la suite gira a viewport desktop** (1280×720, `playwright.config.ts:13-19`) tranne gli spec mobile dedicati: un albero mobile `display:none` non la tocca — **ma un testid o un TESTO duplicato la rompe a qualsiasi viewport**.

**Catena serializzata** — la fonte di verità è `playwright.config.ts` (i project con `dependencies`). Alla data di questa story sono **nove**: `chromium → settings → booking-window → reports → treasury-settings → billing-global → mobile-metar → mobile-overview-overflow → mobile-membership-fee → mobile-settings` (**38 test in catena, 415 in `chromium`, 453 totali**). **Nessuna** delle quattro superfici di questa story scrive `AppSettings`: `/ppr` **legge** `airfield.name`/`airfield.icao` (che `settings.spec.ts` e `mobile-settings.spec.ts` **scrivono** dalla catena, e infatti sul DB post-suite il nome è `Aviosuperficie e2e 1785956242788-9zi1b9`) ⇒ **nessun test nuovo può asserire il nome/ICAO dell'aviosuperficie con uguaglianza**: si legge dal DOM e si confronta con sé stesso, oppure si asserisce la **struttura**, mai il valore. Se il dev conclude che serve entrare in catena, deve **dichiararlo prima di scriverlo**.

**Unit**: nessun test copre oggi `my-account/page.tsx`, `my-compensation/page.tsx`, `account-section.tsx`, `ppr/page.tsx` né `ppr-form.tsx`. I test nuovi sono quelli di AD-5 (funzioni pure in `src/lib/`, che per costruzione non importano servizi e quindi non trascinano `@/lib/env` — verifica comunque `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`).

### c) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale — verificato oggi: `MyAccountPage` **4/4**, `MyCompensationPage` **14/14**, `PprPage` **45/45**, `AccountStatementPage` **36/36**, `Export` **2/2**, **parità piena, zero chiavi in un solo locale**; segnaposto riempiti lato client → **`t.raw`** (`adjustmentBadge.ofDate`/`reversalBadge.ofDate` lo fanno già); suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground; build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** per chiudere un popup dentro uno `SlideOver`; MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe; prima di attribuire un fallimento al lock TD-6, contare i `LoginAttempt` falliti.

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — L'albero mobile dell'estratto conto vive DENTRO `account-section.tsx`, non in un componente parallelo, e serve ENTRAMBE le facce con lo stesso codice.** Motivo dirimente: quel componente possiede **tutto** lo stato che una superficie mobile deve condividere (`topUpOpen`, `adjustPanel`, `feedback`, la `rowById` che alimenta i due badge) e **tutta** la logica di rete (due `fetch` con `Idempotency-Key`, la mappatura 409, `router.refresh()`). Un componente parallelo o duplica quello stato o duplica la rete. E soprattutto: **`my-account` NON HA altro contenuto** oltre a `AccountSection` — «portare my-account su mobile» **è** «rendere responsive `account-section`». Le due facce si distinguono già per prop (`showActor`, `canManageFinance`), non per componente: l'albero mobile deve rispettare **gli stessi due prop**, non introdurne di nuovi.

**AD-2 — Si sostituisce il CORPO, non la card.** A ≤640px va a `display:none` **solo** la tabella desktop, tramite **classi di pagina proprie** (es. `.account-desktop-body`, `.compensation-desktop-body`), mai `.students`/`.student-row` (13 console), mai `.card-head`, mai `.kpi-row`. Le testate restano **un solo nodo** con i loro testid e la loro logica. ⚠️ Corollario obbligato: `my-account/page.tsx` e `my-compensation/page.tsx` sono **server component** e devono restarlo; qualunque stato client nuovo (uno sheet aperto) vive **dentro** il componente client che già esiste (`AccountSection`) o dentro un'isola client **nuova e minima** su `my-compensation`, con la motivazione scritta.

**AD-3 — `AccountSection` NON rimonta: uno sheet aperto sopravvive alla navigazione, e va chiuso a mano.** Fatto **misurato** (§a.3 punto 10): nessuno dei due consumatori passa `key`, e un form aperto con dentro `42` è sopravvissuto a `?page=1→2`. Regola: ogni superficie mobile che apre uno sheet o un secondo passo **deve chiudersi esplicitamente** sul successo (come già fanno `handleTopUpSuccess`/`handleAdjustmentSuccess`) **e** quando cambia la pagina dei dati sotto — altrimenti l'utente resta con uno sheet che descrive una riga che non è più in pagina. Il dev **lo rimisuri**, non lo deduca dal record. ⚠️ Va conservata anche l'altra metà: il `key={adjustPanel.originalMovement?.id ?? 'standalone'}` del **form** rettifica (`:254`) rimonta di proposito perché RHF legge i `defaultValues` solo al mount.

**AD-4 — I due `<Link>` di paginazione restano UN nodo ciascuno e cambiano solo forma.** Sono letti page-level da `my-account.spec.ts:214` (con `toHaveAttribute('href', /\/it\/dashboard\/my-account\?page=2/)`), quindi né i testid né `statementBasePath` possono cambiare. Il contenitore è oggi un `<div>` **inline-styled** (`account-section.tsx:322-346`): come in R-15.8a-f, l'inline va spostato in una **classe propria** dichiarata **fuori** dalla media query con gli **stessi valori misurati oggi** (desktop invariato), e neutralizzato dentro. ⚠️ E l'`aria-disabled` che produce `pointer-events:none` va **dichiarato come esclusione** dello sweep di hit-test, non "risolto" (§a.6).

**AD-5 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test, e riusano `joinSegments`.** Valgono per: (i) la **sub-line** della card di un movimento di conto (`tipo · data` sulla faccia self, `tipo · data · registrato-da` su quella admin, coi casi reali: `description` **null** ⇒ il desktop stampa `noValue`, `actorEmail` **opzionale**) e di un pagamento istruttore (`periodo · metodo`); (ii) il **testo dei due badge** (rettifica/storno), che dipende dalla presenza dell'originale **nella stessa pagina** — è già una funzione di `rowById` e va estratta com'è, senza cambiarne il fallback; (iii) l'eventuale `sub` di uno sheet, che finisce nel nome accessibile del dialog: segmenti assenti **omessi**, mai `—`. Restano pure ⇒ niente `@/lib/env`.

**AD-6 — Una sola logica di rete per i due alberi.** `TopUpForm`/`AdjustmentForm` (`account-section.tsx:375`/`:491`) **si riusano così come sono**: stessi endpoint, stessi header, stessa mappatura 409, stesso `router.refresh()`. Se una superficie mobile ha bisogno di un secondo punto d'ingresso, **rende lo stesso componente** in un contenitore diverso — mai una seconda implementazione (precedente esatto: `CompleteForm` in 15.7 AD-8, `submitAdjust`/`submitReverse` in 15.8a AD-8).

**AD-7 — Un solo sheet aperto, un solo nodo per testid di sheet.** Ogni `BottomSheet` si rende condizionalmente (`{openRow ? <BottomSheet …/> : null}`), così ciascun testid resta **un** nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). **Va asserito**, non assunto.

**AD-8 — Un'azione che apre un secondo overlay CHIUDE prima lo sheet** (R-15.4-d, riconfermata in 15.6, 15.7, 15.8a, 15.8b): niente pannello z50 impilato su uno sheet z40. Se ⟨Q3⟩ porta ricarica/rettifica dentro lo sheet come `secondStep`, il caso non deve presentarsi: **va asserito**.

**AD-9 — `/ppr` è FUORI dalla shell e va trattato come tale.** Misurato: nessuna tab bar, nessuna topbar, nessun menu profilo, `.ppr-page` imposta il proprio `background`/`color`. Conseguenze vincolanti: (i) **nessuna** regola di questa story può raggiungere `/ppr` per caso — ogni selettore nuovo va ancorato e la **misura di controllo va fatta su `/ppr`** (lezione 15.5 F5, che è nata proprio lì); (ii) la soglia dei 640px di R1 **non** coincide con quella che `/ppr` già usa (**820px**, `airops.css:1571`): qualunque cosa si decida in ⟨Q6⟩/⟨Q7⟩ deve dichiarare **a quale soglia** vive e perché; (iii) `/ppr` non ha `.page`, quindi ogni sweep scritto come `document.querySelectorAll('.page *')` **non lo vede**: gli sweep di questa story devono usare la radice giusta per ogni superficie.

**AD-10 — Nessun cambio server, salvo l'unica eccezione che il PO può approvare.** Le quattro superfici non richiedono alcuna modifica ad API, schemi Zod o dominio: la definizione di saldo, il segno, gli storni, il calcolo lordo/netto dei compensi, le validazioni del form pubblico, il rate limit e l'honeypot **non si toccano**. L'**unica** modifica server è quella **ratificata da R-15.9-h** (⟨Q8⟩ = A): il filtro `pprNumber` su `listPprRequestsQuerySchema` (oggi assente — verificato: `src/lib/schemas/ppr.ts:138-148` accetta solo `status`, `from`, `to` e i parametri di export), esteso a service, route e registry OpenAPI **nello stesso commit** — v. AC 15. Tutto il resto del dominio resta intoccabile.

---

## Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno riletti dopo le risposte del PO. Ogni misura si intende a **375×812** e ripetuta a **390×844** e a **320×568**, tema **chiaro e scuro**, nei **due locale**.

1. **(Estratto conto a card — faccia SELF) ⟨Q1⟩⟨Q2⟩⟨Q3⟩** A ≤640px la `.students` di `AccountSection` è `display:none` **misurato** e al suo posto c'è una lista di card nel linguaggio del template (riga "Movimenti recenti", template 325-334, già implementata come `.mobile-row` + `.mobile-row-amount` dalla 15.8a): **tipo di movimento** 12,5-13px/500 **ellissato**, sub mono 10,5px `--ink-3` **ellissato** (`data · descrizione`, via `joinSegments`, segmenti assenti **omessi**), a destra l'**importo mono 12px/600** col segno di `formatSignedCents` e il tono di ⟨Q4⟩; i **badge** di rettifica e storno restano visibili sulla card o nello sheet secondo ⟨Q3⟩, **con lo stesso testo di oggi** (compreso il fallback `linked` quando l'originale non è nella pagina corrente). **Nessuna informazione delle 4 colonne self scompare.** Ogni card è **UN solo elemento interattivo** (`<button>` se apre uno sheet, altrimenti nessuno — mai un elemento interattivo annidato, `min-height` ≥44px) con nome accessibile parlante che contiene **almeno tipo, data e importo**. **Verifica misurata**: `display` di **entrambi** gli alberi a 375 **e** a 1280 (i due lati, mai uno solo); ispezione DOM `card.querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`; nessun testo della card con `scrollWidth > clientWidth` **e** `text-overflow !== 'ellipsis'` a 320px; pre-fix da citare nel record: `.students` **281/434**, tracce **`104px 150px 0px 120px`**, importo a `right 481` in 281.

2. **(Estratto conto a card — faccia ADMIN sulla scheda persona) ⟨Q2⟩** Secondo ⟨Q2⟩. Se la faccia admin è in scope: le **6** colonne (data, tipo + badge, descrizione, importo, **registrato da**, **azioni**) sono tutte raggiungibili a ≤640px senza scroll orizzontale (pre-fix: `.students` **281/802**, ultima cella a `right 849`), e **l'esclusione `!el.closest('[data-testid="account-section"]')` di `e2e/mobile-registries.spec.ts:888` viene RIMOSSA e il test resta verde** — è la guardia canonica della chiusura del TD 14.6 F4. Se ⟨Q2⟩ rinvia la faccia admin, l'esclusione **resta** ed è **ridichiarata** nel record con la misura, mai lasciata muta.

3. **(Le due azioni dell'estratto conto dal telefono — comportamenti INVARIATI) ⟨Q2⟩⟨Q3⟩** Secondo ⟨Q3⟩, e in ogni caso **tutti e dieci** i comportamenti di §a.3 restano identici, ciascuno esercitato a **375px** da un e2e o da una misura riportata nel record: (a) saldo rosso **solo** se `hasAccount && balance < 0`, «Nessun conto attivo» altrimenti; (b) segno e formato di `formatSignedCents`; (c) i due badge col testo che porta la data dell'**originale in pagina** e il fallback `linked` altrimenti; (d) azione di riga **assente** su `hasReversal` e su `PACKAGE_PURCHASE`; (e) ricarica: importo `> 0` ⇒ errore inline e **zero richieste di rete** su valore non parsabile (contate con `page.route`, non dedotte dall'assenza di toast), `Idempotency-Key` presente e **rigenerata dopo la risposta**; (f) rettifica: importo **≠ 0** (positivo **e** negativo provati), motivo obbligatorio, `originalMovementId` **null** se standalone, **409 distinto dal generico**; (g) effetto contabile letto **dall'API filtrata** su una descrizione/motivo run-unique, **mai** da un conteggio di righe in pagina; (h) `router.refresh()` + chiusura esplicita su ogni successo (AD-3); (i) il pannello rettifica **rimonta** cambiando bersaglio (riga A → riga B → standalone: i `defaultValues` si azzerano davvero). **In più**: ogni target dell'azione è **≥44px** (pre-fix misurato: `account-adjustment-row-{id}` **24,67**, i due toggle **34,84**) e si raggiunge **senza scorrere in orizzontale**.

4. **(I miei compensi a card) ⟨Q1⟩⟨Q5⟩** A ≤640px la `.students` di `my-compensation` è `display:none` **misurato** e al suo posto c'è una lista di card con **tutte e quattro** le informazioni (data/ora di registrazione, **periodo** `dd/mm/aaaa – dd/mm/aaaa`, metodo, importo) — pre-fix: `.students` **281/640**, importo a `right 687` in 281. La card è **UN solo elemento** (interattivo solo se ⟨Q5⟩ prevede uno sheet). L'empty state resta `my-compensation-payouts-empty` (**un solo nodo**) e la faccia «nessun profilo» resta `my-compensation-empty` (**un solo nodo**), entrambi con la loro stringa attuale. ⚠️ **`e2e/my-compensation.spec.ts:329-361` (il test di geometria a 390px che scrolla `.students`) va riscritto AL VALORE CORRETTO** — la cella Importo dev'essere leggibile e hit-testabile **senza** scroll orizzontale — con la motivazione e le misure pre/post nel record; **mai** indebolito, mai cancellato (lezione 14.6).

5. **(I cinque KPI dei compensi) ⟨Q5⟩** Secondo ⟨Q5⟩. In ogni caso: i **cinque** testid restano un nodo ciascuno (`kpi-rate`, `kpi-hours-mtd`, `kpi-gross-mtd`, `kpi-owed-mtd`, `kpi-owed-total`) dentro l'unico `my-compensation-kpis`; la distinzione **Maturato (lordo)** vs **Dovuto (netto)** ratificata dalla review 14.7 F4 resta leggibile e adiacente; i valori arrivano da `getOwnCompensationOverview` **senza ricalcolo client**; `—` resta il segnaposto dei valori `null` (tariffa non configurata). **Verifica misurata**: geometria della `.kpi-row` **pre/post** alle tre larghezze (pre-fix: `flex` `cw 375 / sw 835`, 5 card da 146px @375; `grid` 521/521 @641, 992 @1280) e posizione della **prima card della lista** pre/post — se una scelta fa **scendere** qualcosa, va detto e quantificato (osservazione 15.7 §3.1), non nascosto.

6. **(Il modulo pubblico `/ppr` in linguaggio mobile) ⟨Q6⟩⟨Q7⟩** Secondo ⟨Q6⟩ e ⟨Q7⟩. In ogni caso, a 320/375/390px **senza sessione**: (a) **ogni campo del form e il submit hanno `min-height` ≥44px** — pre-fix misurato: 10 `input.input` a **36,84**, 2 `datetime-local` a **38,84**, 2 `.date-input-btn` a **24×24**, `ppr-submit` **101,64×64,59** (altezza data dal wrap, non dal progetto: la guardia si scrive sul **requisito 43,5**, mai sul valore ottenuto); (b) **lo switch di lingua è raggiungibile** (pre-fix: `.ppr-top-right{display:none}` a ≤820px ⇒ link **0×0** a 320/375/390/641/800; a 821px **45,72×15,94**, comunque sotto i 44) e il suo target è ≥44px; (c) `pageOverflow` resta **0** e **nessun contenitore interno** ha scroll orizzontale nascosto, con l'elenco delle **eccezioni dichiarate** — il **wrapper del honeypot** (`cw 1 / sw 198`) è una di queste e va **nominata**; (d) il flusso end-to-end resta identico: submit vuoto ⇒ **10 `.fld-error`** inline e **zero rete**; honeypot ⇒ vista di successo **senza** email; 429 ⇒ `RATE_LIMITED`; 422 field-shaped ⇒ marcatura per-campo; `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` ⇒ banner dedicato; successo ⇒ `.ppr-success` **senza numero PPR** e "invia un'altra" che resetta lo stato locale; (e) **entrambi i locale** provati fino alla mail di ricevuta nella lingua del form; (f) la `.cal-popover` resta **interamente dentro il viewport** (pre-fix già conforme: 280×362,69 a `x 47,5 → right 327,5`, z 66) e la guardia esistente `datetime-picker.spec.ts:237` **resta verde senza essere modificata**.

7. **(Paginazione in linguaggio mobile — R-15.5-j)** La paginazione dell'estratto conto resta quella di oggi (stesso contratto `?page=`, stessi `Link`, **stesso `statementBasePath`**) resa in linguaggio mobile (`.registry-pagination` o equivalente **ancorato con `>`**), bottoni **≥44px** (pre-fix: **91,27×34,84** e **90,45×34,84**), hit-testabili **sopra** la tab bar. ⚠️ Il contenitore è **inline-styled** (`account-section.tsx:323`): l'inline va portato in una classe propria **fuori** dalla media query coi valori misurati oggi (desktop invariato) e neutralizzato dentro — altrimenti nessuna regola lo raggiunge (precedente R-15.8a-f). **Verifica**: navigazione `1 / 2 → 2 / 2` a 375px su **entrambe** le facce (`/dashboard/my-account?page=2` e `/dashboard/people/{id}?page=2`), con l'href asserito; misura dei target; hit-test a fondo pagina.

8. **(`ExportMenu`: verifica, non modifica)** L'`ExportMenu` montato da `account-section.tsx:222` resta **un solo componente, un solo nodo di trigger, un solo nodo per voce** a 375 **e** a 1280 su **entrambe** le facce; a ≤640px continua ad aprirsi come bottom sheet (misurato: `export-menu-sheet` z 40, `0 → 375`, voci **44×341**) con gli **stessi href** (`/api/v1/people/{id}/account/pdf?locale=it`, `/…/account/movements?format=xlsx&locale=it`); il download continua a funzionare da dentro lo sheet (**provato**, non assunto). ⚠️ Il **trigger** misura **136,63×34,84**: se questa story lo porta a 44px, la misura **desktop pre/post** va dichiarata su **tutti** i consumatori dell'`ExportMenu` (il chassis è condiviso da dieci superfici) — altrimenti va **dichiarato come TD**, mai corretto in silenzio.

9. **(I contrasti degli importi: CHIUSI o DICHIARATI) ⟨Q4⟩** Secondo ⟨Q4⟩. Se si chiudono: i tre valori misurati sotto soglia in tema chiaro — `account-movement-row .mono.num` positivo **2,73 → ≥4,5**, negativo **3,96 → ≥4,5**, `my-compensation-payout-row .mono.num` **2,73 → ≥4,5** — salgono sopra soglia **senza scendere** in tema scuro (oggi 9,30 / 6,61 / 9,47), e `account-balance` in rosso viene **misurato** (caso oggi non coperto dai fixture: serve un conto con saldo negativo) e trattato allo stesso modo. **Vincoli non negoziabili**: (i) **nessun token esistente cambia valore** ⇒ il fix è **additivo** e riusa la medicina già ratificata e misurata dalla 15.8a (`.stat-tone-ok`/`.stat-tone-bad`, `airops.css:733-737`, 9,82/10,63) — **due decisioni per lo stesso token sono vietate** (lezione 15.3); (ii) **nessun literal di colore nuovo**; (iii) ⚠️ i colori di oggi sono **`style` INLINE** (`account-section.tsx:300`, `my-compensation/page.tsx:144`, `account-section.tsx:238`) e **uno stile inline batte qualunque regola di classe** (lezione 15.8b LOW-1): il fix **deve** sostituire l'inline con la classe, non aggiungere una regola che non vincerà mai; (iv) il fix vale **desktop e mobile** ⇒ **desktop rimisurato** a 1280 e dichiarato; (v) **misura dei GEMELLI**: enumerare e misurare **tutte** le superfici che usano la classe toccata, nei due temi. **Verifica**: rapporto canvas→WCAG con lo sfondo effettivo risolto **risalendo gli antenati partendo dall'elemento** e l'alpha letta **prima** della composizione (una `paint()` che pre-riempie di bianco dà alpha 1 sempre e misura tutto contro il bianco, sbagliando il tema scuro), **prima e dopo**, nei due temi, su ogni esemplare enumerato.

10. **(Convenzione testid — nessun duplicato, e nessun TESTO duplicato)** Desktop **invariati**: `account-section`, `account-balance`, `account-statement-header-row`, `account-movement-row`, `account-statement-page-prev`, `account-statement-page-next`, `account-statement-pagination-status`, `account-topup-toggle`, `account-topup-form`, `account-topup-submit`, `account-adjustment-toggle`, `account-adjustment-form`, `account-adjustment-submit`, `account-adjustment-row-{id}`, `adjustment-feedback`, `adjustment-badge`, `reversal-badge`, `my-compensation-empty`, `my-compensation-kpis`, `kpi-rate`, `kpi-hours-mtd`, `kpi-gross-mtd`, `kpi-owed-mtd`, `kpi-owed-total`, `my-compensation-header-row`, `my-compensation-payout-row`, `my-compensation-payouts-empty`, `ppr-page`, `ppr-form`, `ppr-submit`, `ppr-success`, `ppr-success-again`, `ppr-form-error`, `ppr-honeypot`, `export-menu-trigger`, `export-menu-xls`, `export-menu-pdf`, `export-menu-sheet`. Le superfici mobile usano il **suffisso `-mobile`** dove duplicano una desktop (`account-movement-row-mobile`, `my-compensation-payout-row-mobile`, …) e il **prefisso `mobile-`** dove esistono solo su mobile (`mobile-account-list`, `mobile-account-empty`, `mobile-account-sheet`, `mobile-compensation-list`, `mobile-compensation-empty`, …). ⚠️ **Nessun nome nuovo può cominciare per un prefisso `^=` in uso** (`pilot-row-`, `ac-card-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-tail-chip-`, `mobile-fleet-`, `mobile-fleet-card-`, `reports-fleet-row-`, `reports-rank-aircraft-row-`, `reports-rank-pilot-row-`, `reports-instructor-row-`) e **nessun albero mobile può riusare la famiglia composta `account-adjustment-row-{id}`**. **Verifica obbligatoria prima di scegliere ogni nome**: `grep -rn 'data-testid\^=' e2e/`, col risultato riportato nel record. **Verifica finale**: un `page.getByTestId(id)` per **ciascuno** dei testid elencati restituisce il numero **atteso** di nodi (1 per i singleton, N per i per-riga) a 375px **e** a 1280px su `/dashboard/my-account`, `/dashboard/my-compensation`, `/dashboard/people/{id}` **e** `/it/ppr`; **e** `page.getByText('Nessun conto attivo')` / `'Nessun movimento registrato.'` / `'Nessun pagamento registrato.'` / `'Nessun profilo istruttore attivo.'` restituiscono **al più 1** nodo a 1280px (⚠️ `'Nessun conto attivo'` è letto **page-level** da `accounts-topups.spec.ts:101`).

11. **(Geometria e layering)** A 320, 375 e 390px, su `/dashboard/my-account` (con e senza conto, con 2 e con 20 movimenti), `/dashboard/my-compensation` (con e senza profilo, con e senza pagamenti), `/dashboard/people/{id}` **e** `/it/ppr`: **nessun overflow orizzontale di pagina**; **nessun contenitore interno con scroll orizzontale nascosto** (per ogni discendente della radice giusta — `.page` nelle tre superfici della shell, **`.ppr-page` sul modulo pubblico**, AD-9 iii — `scrollWidth <= clientWidth + 1`), con l'elenco delle **eccezioni dichiarate**: la KPI strip è scrollabile per progetto; la tabella desktop non conta perché è `display:none`; **il wrapper del honeypot di `/ppr` (`cw 1 / sw 198`) è un'eccezione motivata e va NOMINATA**; **nessun controllo finisce sotto la tab bar** (hit-test `elementFromPoint` su **ogni** `a, button, input, select, textarea` visibile a fondo pagina dopo uno scroll **reale**, baseline misurata: `covered: []` su `my-compensation`, `barTop` 734,16 in 812, `.main` `padding-bottom: 100px`; ⚠️ **i `Link` con `aria-disabled="true"` hanno `pointer-events:none` e vanno ESCLUSI dichiarando il motivo** — su `my-account` producono l'unico falso positivo misurato); lo sheet (z 40) copre la tab bar con lo scrim; i popover portalati dei picker (65/66) restano **dentro il viewport** su **tutte** le superfici, `/ppr` compreso; i toast (200) sopra tutto. **In più, la guardia di CONTENIMENTO** (lezione 15.5 F1/§12): per ogni card, ogni figlio che può crescere (importo, badge di rettifica/storno, chip del metodo, periodo del pagamento) ha `child.right <= card.right` — perché lo sweep degli scroller **non vede** ciò che è ellissato.

12. **(Ogni regola nuova ha la sua guardia, provata DISCRIMINANTE)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` dei corpi desktop a ≤640px; (ii) `display:none` degli alberi mobile >640px; (iii) i target ≥44px con soglia **43,5** scritta sul **requisito**, non sul valore ottenuto (⚠️ `ppr-submit` misura 64,59 **per caso**); (iv) nessun testo clippato **senza ellissi** a 320px; (v) contenimento dei figli della card (AC 11); (vi) empty state = **un solo** nodo per albero, con la simulazione DOM del pre-fix (`node.parentElement.appendChild(node.cloneNode(true))`, metodo review 15.6 LOW-3 — **non** "non iniettabile"); (vii) nome accessibile dello sheet ben formato, su **proprietà** e non su `split` (lezione 15.5 F1), provato su una riga **senza `description`** (il DB reale ne ha: la cella stampa `—`); (viii) **i selettori nuovi NON raggiungono `/ppr`** — misura pre/post su `/it/ppr` a 375 e 1280 di `.info-card`, `.info-row .k/.v`, `.card`, `.input`, `.fld`, `.btn`, `.date-input-btn`, **e** prova con una variante DISCENDENTE del selettore (lezione 15.5 F5, nata esattamente lì); (ix) **nessuna regola tocca** `.students`/`.student-row` fuori dalle superfici della story (misura su `/dashboard/logbook`, `/dashboard/expiries`, `/dashboard/billing` a 375px), né `.kpi-row` fuori (misura su `/dashboard` e `/dashboard/reports`), né `.date-input-btn` fuori dalla superficie che lo alza, né `.info-row` fuori dalla scheda persona; (x) l'**esclusione rimossa** di `mobile-registries.spec.ts:888` (AC 2), provata rossa reintroducendo il difetto; (xi) i comportamenti di dominio dell'AC 3 invisibili a occhio (il movimento contabile unico, il 409 distinto, l'`Idempotency-Key` rigenerata). Ognuna va **provata rossa** simulando il pre-fix col repo **intatto** (iniezione CSS/DOM/`addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2, o `git stash` del solo `src/` con lo spec al suo posto, metodo 15.5 §12). Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

13. **(Invarianti)** Desktop >640px **invariato** su **tutte** le pagine che rendono i componenti toccati (lezione 15.3 claim 3: "desktop invariato" ≠ "nient'altro è cambiato") — cioè `/dashboard/my-account`, `/dashboard/my-compensation`, **`/dashboard/people/{id}`** (che monta lo stesso `AccountSection`) e **`/it/ppr`**: misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) sui valori già rilevati come baseline — `.app` `grid-template-columns` `232px 1048px` @1280; **my-account** `.page-head` **51,44**, `.card-head` **63,84**, `.students` `cw/sw` **954/954 · 642/642 · 483/483**, tracce **`104px 150px 502px 120px`** @1280 e **`…31px…`** @641; **my-compensation** `.page-head` **51,44**, `.card-head` **49,3**, `.students` **954/954 · 642/642 · 483/640**, `.kpi-row` `grid` 992/680/521; **scheda persona** `.page-head` **53,81** @800, `.card-head` di `account-section` **63,84** @800/@1280 e **106,69** @641, `.students` **281/802** @375; **`/ppr`** `.ppr-grid` `1.7fr 1fr` ⇒ `623,33px 366,66px` @1280 / `522,58px 307,42px` @900 / `472,84px 278,14px` @821 e **1 colonna** a ≤820, `ppr-submit` **127,41×44,30** @≥641, `docH` **1286** @1280, `.ppr-top-right` `flex` con link **45,72×15,94** @≥821; `pageOverflow 0` ovunque; tab bar `display:none` a >640px e **assente** su `/ppr`. `npm run gates` verde; **nessuna dipendenza npm nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (metodo in AC 9) ≥**4,5:1** per il testo e ≥**3:1** per gli oggetti grafici, in tema **chiaro e scuro**, **enumerando tutti gli esemplari** (la 15.4 ha trovato un pallino a 1,76:1, la 15.3 un glifo a 1,24:1, la 15.6 uno sfondo a 3,66:1: non fidarsi dell'elenco); gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

14. **(Multi-attore — lezione 15.1 F1)** La verifica per attore **non è opzionale**: **ADMIN, PILOTA, ALLIEVO, ISTRUTTORE** a **375 e 1280px**, con `page.context().clearCookies()` fra un'identità e l'altra, su **entrambe** le pagine self. Per ciascuno: quale faccia vede, quanti controlli, quante azioni. ⚠️ Le due pagine sono **universalmente raggiungibili** (`self.read`): **non esiste** un redirect da testare, a differenza di Movimenti/Contabilità — e i casi che contano sono proprio i **degradati**: attore **senza conto** (admin/istruttore/allievo di seed: «Nessun conto attivo» + `<p>` senza testid), attore **senza `personId`** (login non collegato a nessuna `Person` — esiste sul DB: `personless-pilot-…@airmanager.local`; misurato: nessun href di export, nessuna query), attore con **profilo istruttore disattivato** (deve cadere sullo stato «nessun profilo», mai 403 — comportamento 14.7 AC 4), e un conto con **saldo negativo** (per il ramo rosso dell'AC 9, oggi non coperto dai fixture). Su `/ppr`: verifica **senza sessione** e, in più, **con** una sessione attiva (la route è pubblica: il comportamento non deve cambiare).

15. **(Il link coda PPR ↔ transiti — R-15.9-h, chiude R-15.7-j)** L'**unico** lavoro server della story, ratificato esplicitamente dal PO: (a) `listPprRequestsQuerySchema` accetta un filtro **`pprNumber`** opzionale (formato `PPR-YYYY-NNNN`; valore malformato ⇒ **422 di validazione**, mai 500), il service filtra per numero esatto, la route lo espone e il **registry OpenAPI è aggiornato NELLO STESSO commit** (c'è già un TD di 8 route mancanti nel registry, F5 review 12.11: questa voce non diventa la nona); (b) il numero PPR è **null** su PENDING e REJECTED (`schemas/ppr.ts:176`): l'azione UI compare **solo** dove il numero esiste (49 richieste su 68 sul DB reale), mai un link verso un filtro vuoto; (c) l'azione UI vive negli **sheet** (forma di R-15.9-h: «Vedi in Transiti» nello sheet della coda PPR e/o «Vedi la richiesta» nello sheet del transito — la direzione, o entrambe, la decide il dev in ricognizione misurata, con la motivazione nel record), target **≥44px**, e **rispetta i permessi**: il link compare solo se l'attore può vedere la destinazione; (d) su `/dashboard/ppr` — fuori scope per R-15.9-i — l'azione nello sheet è l'**UNICA** modifica ammessa: misura pre/post del resto dello sheet e della pagina (non-regressione); (e) **verifica**: unit/contract test dello schema (valore valido, malformato, assente), e2e del deep-link end-to-end (dallo sheet la pagina di destinazione mostra **solo** le righe del numero, asserito sulla **propria fixture** run-unique, mai su conteggi globali), e la prova che un `pprNumber` inesistente rende la lista vuota con l'empty state corretto, senza errore.

16. **(Debito tecnico — dichiarato, non subìto in silenzio)** Il record dice per **ciascuno** dei TD che toccano queste superfici se la story lo **chiude**, lo **subisce** o lo **aggrava**, con la misura: (a) **TD 14.6 F4** (`account-section.tsx` non responsive) — v. ⟨Q2⟩ e AC 2, con la riga di esclusione `mobile-registries.spec.ts:888` come prova; (b) **R-15.7-j** (link coda PPR ↔ transiti) — **CHIUSO QUI** (R-15.9-h, AC 15); (c) **i 47 target sotto 43,5px dentro `.cal-popover`** (42 `.cal-cell` da 34,58 + 2 `.iconbtn` da 24×24) — primitiva **condivisa** da 11+ consumatori: **nuovo, misurato qui, e da dichiarare** (chiuderlo è materia di 15.10 salvo ⟨Q6⟩); (d) **`.date-input-btn` a 24×24 su `/ppr`** — quarta faccia di un TD che quattro story hanno già curato **solo** sulla propria superficie; (e) **`.so-sub` a `--ink-4`** (TD (h) della 15.6): ⚠️ **nessuno** dei componenti di questa story monta uno `SlideOver` con sottotitolo ⇒ **non attivo qui**, dichiarato e lasciato a 15.10; (f) **`viewport-fit=cover` mai dichiarato** ⇒ tutti gli `env(safe-area-inset-*)` valgono 0 (TD di epic, 15.10) — ⚠️ e su `/ppr`, che non ha shell, l'assenza si vede di più; (g) **il trigger dell'`ExportMenu` a 34,84px** (AC 8); (h) **`billing.spec.ts:296`** flaky su aggregato globale — questa story **non lo aggrava** se nessun test nuovo crea denaro fuori dalla catena: il dev dichiari **quante** ricariche/rettifiche crea per run; (i) **il catalogo `ExpiryType` globale mai ripulito** (TD 15.5) — le fixture di questa story creano persone e conti, non voli: dichiarare se il 422 `FLIGHT_BLOCKED_BY_EXPIRY` le tocca; (j) **`.ppr-top-right` nascosto a ≤820px** — v. ⟨Q7⟩; (k) **`ppr-public.spec.ts` riempie il form per etichetta localizzata** (`:128`): ogni cambio di label lo rompe — dichiarare se la story tocca una label.

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):

1. ⚠️ **`account-movement-row` è letto PAGE-LEVEL con `toHaveCount` in 6 file**: `my-account.spec.ts` (184, 211, 218, 222, 254, 302), `account-statement.spec.ts` (81, 111, 142), `accounts-topups.spec.ts` (80), `account-adjustments.spec.ts` (104, 147, 159, 160), `flight-reversal.spec.ts` (240, 242), `flights.spec.ts` (274). È la **causa di rottura n.1** e la convenzione dei testid la copre **per intero** (`-mobile` è legale qui): l'albero mobile **non può** riusare quel nome. **Nessuno di questi spec va riscritto.**
2. ⚠️ **`account-balance` page-level con `toHaveText` in 5 file** (accounts-topups 61/71/79/88/101/112, account-statement 76/110/141, account-adjustments 96/103/131, flight-reversal 239/317, flights 276, people-management 220): deve restare **un solo nodo** e **una sola stringa** — compresa `'Nessun conto attivo'`, che `accounts-topups.spec.ts:101` legge come testo esatto.
3. `account-statement-header-row` con `not.toContainText('Registrato da')`/`('Azioni')` (my-account 185/186/255, account-statement 79/112): se la testata desktop va a `display:none` a ≤640px il test resta verde (gira a 1280), ma **il nodo non può sparire dal DOM** né duplicarsi.
4. ⚠️ **`adjustment-badge` / `reversal-badge` page-level** (`account-adjustments.spec.ts:156` con `toHaveText`, `flight-reversal.spec.ts:244`): un badge ripetuto sulla card mobile dà **2 nodi a 1280px**.
5. ⚠️ **`my-compensation.spec.ts:329-361`** — l'unico test che **scrolla `.students`** su una superficie che questa story rende `display:none`: **va riscritto al valore corretto** (AC 4), con la misura pre/post nel record. È l'**unica** modifica a spec esistenti prevista e obbligata.
6. `my-compensation-payout-row` / `my-compensation-kpis` page-level (263, 302, 323, 340 / 237, 301, 320): un nodo ciascuno per i singleton.
7. ⚠️ **`ppr-public.spec.ts`** — 6 test **senza login**, che riempiono il form **per etichetta localizzata** (`:128`) e leggono `ppr-success` page-level (186, 220, 272): ogni cambio di label o di struttura del form li rompe.
8. ⚠️ **`datetime-picker.spec.ts:237-267`** — **già** un test a 375px su `/ppr`, che localizza il campo con `span.date-input:has(input[name="etd"])` e il trigger con `getByRole('button', {name:'Apri calendario'})` **page-level**: **deve restare verde senza essere modificato**, e nessun secondo trigger può comparire.
9. `pdf-exports.spec.ts` (222, 262, 286, 289, 314) — gli href di `/api/v1/people/{id}/account/pdf` **non cambiano**, e la parità own-access (pilota 200 sul proprio, 403 sull'altrui) resta.
10. `mobile-shell.spec.ts:141` — la tab bar del pilota naviga a `/it/dashboard/my-account`: la voce e il target non cambiano.
11. ⚠️ **`mobile-registries.spec.ts:874-897`** — lo sweep della scheda persona **con l'esclusione dichiarata di `account-section`**: v. AC 2. È la guardia che decide se il TD 14.6 F4 è chiuso o no.
12. `mobile-billing.spec.ts:788-856` e `mobile-settings.spec.ts:815` — l'`ExportMenu` resta **un** componente con **un** trigger e **una** voce per tipo su ogni consumatore.
13. `membership-fee.spec.ts` + `mobile-membership-fee.spec.ts` (in **catena**) — creano `AccountMovement` su conti reali: nessun test nuovo di questa story deve asserire aggregati di conto **globali**.
14. **(R-15.9-h, AC 15)** `src/lib/schemas/ppr.ts` (query schema), il service e la route di `listPprRequests`, il **registry OpenAPI** e i loro test di contratto; gli sheet consumer dell'azione nuova (`mobile-ppr-sheet` della coda 15.2, lo sheet del transito 15.7): il dev **enumeri** gli spec che li asseriscono (coda PPR, movimenti, export) e dichiari nel record che l'azione nuova non aggiunge un secondo nodo a nessun testid esistente né sposta i target già misurati dalla 15.7.

**Unit**: nessuno copre oggi queste superfici. I nuovi sono quelli di AD-5.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):

- ⚠️ **`/it/ppr`**, se una regola nuova non ancorata lo raggiunge (`.info-card`, `.info-row`, `.card`, `.input`, `.fld`, `.btn`, `.date-input-btn`): è **già successo** (review 15.5 F5) e oggi la superficie è **insulata** (scansione §a.8) — quindi qualunque sfondamento sarebbe **introdotto qui**;
- la **scheda persona** `people/{id}`, che monta lo **stesso** `AccountSection` con **due colonne in più**: ogni regola sul componente la tocca (AC 2/13);
- la **fascia tablet 641-900px**: nessuna regola di questa story deve toccarla (R1) — ⚠️ ma va **dichiarato** che a 641px `my-compensation` ha ancora **157px** di overflow interno (`483/640`) e che l'estratto conto ha la Descrizione a **31px**: se restano così, è un buco **dichiarato**, non una svista;
- il **tema scuro** delle superfici nuove — **enumerare gli esemplari, non fidarsi dell'elenco**;
- ⚠️ **il non-remount di `AccountSection`** (AD-3): qualunque stato locale nuovo (uno sheet aperto) **sopravvive** al cambio pagina e a `router.refresh()` — l'opposto di Contabilità/Movimenti;
- il **`key` del form rettifica** (`account-section.tsx:254`): se una superficie mobile lo aggira, i `defaultValues` di RHF non si azzerano più cambiando bersaglio.

---

## Piano di test

**Dove vivono i test nuovi**

- **Spec nuovo `e2e/mobile-self-public.spec.ts`** (uno solo: R-15.9-a), project `chromium` `fullyParallel` — questa story **non scrive `AppSettings`** ⇒ **non** entra nella catena serializzata; `setViewportSize` **dentro il test** (pattern 13.10). Copre: le due liste a card e il non-clipping, gli sheet e la parità, le due azioni dell'estratto conto secondo R-15.9-c, i cinque KPI (R-15.9-e), la paginazione su **entrambe** le facce, l'`ExportMenu` verificato, la geometria/layering, il multi-attore, **tutto il modulo pubblico a 375px senza sessione**, e il **deep-link R-15.9-h** (AC 15 e).
- **Modifiche a spec esistenti**: **una sola prevista e obbligata** — la riscrittura di `my-compensation.spec.ts:329-361` al valore corretto (blast radius 5), da motivare nel record con la misura; **più**, se ⟨Q2⟩ chiude il TD, la **rimozione** dell'esclusione a `mobile-registries.spec.ts:888` (che è un **rafforzamento**, non un indebolimento). Ogni altra modifica va motivata e non deve ridurre la copertura (lezione 14.6).
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-5 **+ il contract test dello schema `pprNumber`** (AC 15 e: valido, malformato, assente), verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**

- Ogni test crea le **proprie** fixture (persona + profilo pilota/allievo/istruttore con cognome run-unique, login via invito Mailpit come `my-account.spec.ts#createPersonWithLogin`, movimenti con descrizione/motivo run-unique) e le raggiunge **tramite l'URL della propria pagina self** — **mai** assumendo "la mia riga è a pagina 1" (l'estratto conto pagina a **20** e sul DB reale esistono conti con **21** movimenti).
- ⚠️ **Nessun test nuovo asserisce un aggregato GLOBALE con uguaglianza** (saldi all-time, totali di cassa): il saldo che si asserisce è quello **della propria fixture**, per costruzione isolato.
- ⚠️ **Nessun test nuovo asserisce il NOME o l'ICAO dell'aviosuperficie con uguaglianza** su `/ppr`: sono `AppSetting` globali che due project della catena riscrivono (misurato: `airfield.name = "Aviosuperficie e2e …"`, `airfield.icao = LITA`). Si asserisce la **struttura** (il nodo esiste, non è vuoto, compare in topbar/aside/footer con lo **stesso** valore), mai il valore.
- ⚠️ **Ogni test di `/ppr` usa un `x-forwarded-for` run-unique** (`uniqueFakeIp()`, `ppr-public.spec.ts:28`): il rate limit è DB-backed e il DB non si resetta fra i run. E il test di submit riuscito **crea una richiesta PPR** che finisce nella coda admin: il dev dichiari **quante** ne crea per run.
- ⚠️ **Nessun test nuovo scrive `AppSettings`** (se servisse, andrebbe nella catena: qui non serve, e se il dev pensa il contrario deve dichiararlo **prima** di scriverlo).
- Attori: le due pagine self sono **universalmente raggiungibili** ⇒ nessun redirect, ma **quattro** attori e **cinque** stati degradati obbligatori (AC 14).

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)

- Sostituzione degli alberi: asserire **entrambi** i lati (tabella `none` + lista visibile a 375px; l'inverso a 1280px). Un solo lato lascia passare "ho nascosto tutto".
- Il TD 14.6 F4: la guardia **non** è "la card esiste" — è la **rimozione dell'esclusione** di `mobile-registries.spec.ts:888` con il test verde, più la misura `.students` `cw/sw` pre/post su **entrambe** le facce (self **281/434**, admin **281/802**) e le **tracce computate** (pre-fix `104px 150px 0px 120px` / `… 0px … 170px 170px`).
- Target: soglia **43,5**, mai calibrata sul valore ottenuto (lezione 15.7 MINOR-1) — e su `/ppr` va scritta anche dove oggi il valore è 64,59 **per accidente tipografico**.
- Lo switch di lingua di `/ppr`: la guardia è che **il link è visibile e ≥44px a 320/375/390/641/800**, provata rossa reintroducendo `display:none` — non "il link esiste nel DOM" (oggi esiste, e misura 0×0).
- Nome accessibile dello sheet: guardia su **proprietà**, non su `split` (lezione 15.5 F1), provata rossa su una riga **senza `description`**.
- Contenimento: guardia sul **rect** dei figli della card, non solo lo sweep degli scroller (cieco sugli elementi ellissati).
- Effetti contabili: letti **dall'API filtrata** su una descrizione/motivo run-unique, **mai** da un conteggio di righe in pagina; le richieste di rete contate con `page.route` (zero sul valore non parsabile, **una** sul submit valido).
- Contrasti: misura canvas→WCAG **prima e dopo**, nei due temi, su ogni esemplare **enumerato**, compresi i gemelli della classe toccata.
- Sweep di `/ppr`: radice `.ppr-page` (**non** `.page`, che lì non esiste), con le **due** esclusioni dichiarate (honeypot e suo wrapper) e la prova che senza di esse lo sweep sarebbe rosso.
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). **Baseline attesa: 453 test** (il totale verificato dall'arbitro della 15.8b: 415 in `chromium` + 38 in catena) più quelli nuovi. Se il dev non la completa, la **review la riesegue da arbitro** (prassi 13.9/13.11/15.2-15.8b).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index), `15-2-primitive-mobile.md` (API delle primitive, guardia cieca, prova per rebuild), `15-3-panoramica-mobile.md` + review (selettore ancorato; il numero che non deve mentire; KPI 2×2), `15-4-pianificazione-mobile.md` + review (chip strip, fixture indipendenti dall'ora, guardia sul lato liberato), `15-5-anagrafiche-card-mobile.md` + review (**AD-5 sui selettori `^=`**, guardia cieca da `split`, ellissi che nasconde gli sfondamenti, parità enumerata, **F5 = il selettore che sfondava in `/ppr`**, e la **scheda persona**, che è il consumatore gemello di `AccountSection`), `15-6-registro-voli-mobile.md` + review (pannello Filtri a navigazione unica, badge di riga, toast vs `<p>`), `15-7-scadenze-transiti-mobile.md` + review (asimmetria del remount, guardie sul requisito, `secondStep` con effetto contabile, empty state con testid proprio), **`15-8a-contabilita-exportmenu-mobile.md` + review (il modello PIÙ VICINO: la riga "Movimenti recenti" del template, `.mobile-row-amount`, i contrasti `2,73`/`3,96` chiusi con `.stat-tone-*`, l'`ExportMenu` a bottom sheet, l'inline spostato in una classe)**, `15-8b-statistiche-impostazioni-mobile.md` + review (un cap è una selezione; l'esclusione non dichiarata; lo stile inline che batte la classe; l'asserzione tautologica).
- Story di dominio da rileggere: `3-1-accounts-topups.md`, `3-2-account-statement.md`, `3-3-adjustments-negative-alerts.md` (saldo, estratto, rettifiche), `13-3-scheda-persona-estratto-conto-ritiro-legacy.md` (la fusione in `AccountSection`), `14-6-area-personale-transazioni-profili.md` (la faccia self, `statementBasePath`, la privacy/IDOR), `14-7-istruttore-prenotazione-compensi.md` (lordo vs netto, profilo disattivato), `8-1-ppr-public-form.md` (honeypot, rate limit, codici 422), `12-4` (il rebuild AirOps del modulo pubblico), `10-2-pdf-exports.md` (config nome/logo aviosuperficie), `td-7-datetime-picker.md` (`CalendarPopover`, il flip/clamp e i suoi guard-rail).
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/billing/billing-console.tsx` (albero mobile 15.8a sulla **stessa forma di riga**), `src/app/[locale]/dashboard/logbook/logbook-console.tsx` (card + sheet + `secondStep`), `src/app/[locale]/dashboard/movements/movements-table.tsx` (`secondStep` con effetto contabile), `src/components/ui/{bottom-sheet,mobile-sheet,export-menu,datetime-input,calendar-popover}.tsx`.
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`). Prototipo desktop del modulo pubblico: `docs/design-reference/airops/PPR Request.html`.
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale; ⚠️ `npm run start` **fallisce** con il `JOBS_SECRET` segnaposto di `.env`: serve `export JOBS_SECRET=<valore non-segnaposto>` anche solo per servire la build — **riconfermato in questa ricognizione**; MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway **con import per path assoluto** (`/home/admin/AirManager/node_modules/playwright-core/index.mjs`) e Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`; ⚠️ **il tema si imposta col cookie `am-theme`**, non con `prefers-color-scheme`; ⚠️ i colori computati sono in sintassi moderna (`lab()`/`oklch()`/`color-mix()`): un parser `rgba()` restituisce `null` su tutto e fa credere che non ci siano contrasti da misurare — serve un round-trip su canvas; credenziali di seed `admin@`/`pilot@`/`instructor@`/`student@airmanager.local` con `SEED_ADMIN_PASSWORD` di `.env`, e le fixture e2e hanno password proprie scritte negli spec).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile account statement list", "public form mobile touch targets", "language switcher mobile placement", "money amount color accessibility", "mobile form field height 44").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29: il codice UI lo scrive Opus 5; questa story è tutta UI). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.9): aree self e modulo pubblico mobile — estratto conto e compensi a card, TD 14.6 F4 chiuso sul componente condiviso, /ppr con target da un dito e lo switch di lingua che torna, link coda-PPR<->transiti col filtro pprNumber (R-15.9-h)` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **"Le mie scadenze"** (`my-expiries.tsx`): **già consegnata dalla 15.7** (ratifica R-15.7-i). Non si tocca.
- **La coda PPR admin `/dashboard/ppr`**: già mobile dalla 15.2 (consumer di prova delle primitive: `ppr-row-mobile`, `mobile-ppr-sheet`, `.ppr-card*`). ⚠️ **`ManualPprForm` è CONDIVISO** fra `/dashboard/ppr` e `/dashboard/movements` ed è **già R3-compliant** (verificato dalla 15.7 AD-10: pannello `0,0 375×812`, `.so-actions` sticky col bottom al viewport, submit 44px, tab bar coperta): **non si tocca** — **R-15.9-i: fuori scope CONFERMATO**; l'unica modifica ammessa sulla pagina è l'azione dello sheet di AC 15 d.
- **La Panoramica / le landing per-ruolo** (15.3): le home di pilota, allievo e istruttore sono già nel linguaggio del template. Questa story non le riapre.
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover`, la riserva sticky di R-15.2-g, e i **47 target sotto soglia dentro `.cal-popover`** → **15.10** (salvo ⟨Q6⟩).
- **Qualunque modifica alle API, agli schemi Zod o al dominio**: saldo, segno, storni, rettifiche, calcolo lordo/netto dei compensi, validazioni del form pubblico, honeypot, rate limit, email di ricevuta **non si toccano**. L'**unica** eccezione è quella **ratificata** (R-15.9-h → AC 15).
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/`SlideOver`/`ExportMenu`/`CalendarPopover`/`joinSegments`: si **riusano**, non si reinventano.
- **I difetti pre-esistenti misurati e non ratificati qui**: le voci del typeahead a 36px, la ✕ di `SlideOver` a 32px, `.search` 188/190.

---
---

# ASSUNZIONI RATIFICATE (2026-08-05 — decisioni nella tabella in testa; il testo sotto resta come record di fatti, opzioni e motivazioni)

> Regola di progetto (retro Epic 9, `sprint-status.yaml` AI-2, riconfermata dal piano epic 15: *"Per ogni altro dubbio chiedi a me"* — PO, 2026-07-29): un'assunzione scoperta in ricognizione si ratifica **prima** di implementare, mai spedita "da confermare" dentro il codice. Ogni domanda porta il **fatto misurato** che la genera, le **opzioni** e la **raccomandazione motivata** del teammate story.

### Q1 — Perimetro: quattro superfici in una story, o si splitta come la 15.8?

**Il fatto**: il piano assegna alla 15.9 *"my-account, my-compensation, le mie transazioni, modulo PPR pubblico `/ppr`"*. Misurato sul codice, quelle quattro voci sono **tre pagine e un componente condiviso**: `my-account` **è** `AccountSection` (150 righe di server component che non fanno altro che montarlo), "le mie transazioni" **è** la stessa cosa (è il titolo della pagina), `my-compensation` è una pagina indipendente da 157 righe, e `/ppr` è **una superficie di natura diversa da tutto il resto dell'epic**: pubblica, senza sessione, fuori dalla shell (nessuna tab bar, nessuna topbar, nessun menu profilo — misurato), con una **soglia CSS propria a 820px** invece dei 640 di R1, e con l'unico test dell'epic che gira **senza login**. In più `AccountSection` è condiviso con la **scheda persona**, cioè con una superficie che il piano assegna alla 15.5 (già chiusa) e che ha **due colonne in più** (`281/802` contro `281/434`). La 15.8 è stata splittata dal PO su una domanda identica.

**Opzioni**
- **A — Tutto in una story.** Le tre superfici autenticate condividono **una** famiglia CSS (la riga importo del template, già scritta dalla 15.8a) e **un** componente; `/ppr` è indipendente ma piccolo (2 file, 628 righe, nessuno stato condiviso). Una sola apertura di `airops.css`, uno spec nuovo, una review.
- **B — Split 15.9a (aree self autenticate: `my-account` + `my-compensation` + `account-section` su entrambe le facce) / 15.9b (modulo pubblico `/ppr`).** Le due metà **non condividono una riga di codice** né una regola CSS (anzi: AD-9 impone che non si tocchino a vicenda), hanno soglie diverse (640 vs 820), attori diversi (autenticati vs anonimo) e rischi diversi (contabilità vs vetrina pubblica). Costo: due cicli story→dev→review.
- **C — Split 15.9a (le due pagine self) / 15.9b (`account-section` faccia admin + `/ppr`).** Il taglio più innaturale: spezzerebbe **un componente** in due story.

**Raccomandazione: B.** Motivi verificabili: (i) le due metà **non hanno intersezione tecnica** — nessun file, nessuna classe, nessun testid, nessuno spec in comune (l'unica intersezione è una **regola di non-interferenza**, AD-9/AC 12 viii, che vale in entrambe le direzioni e si scrive una volta per parte); (ii) sono due **rischi diversi**: la metà autenticata tocca il denaro dei soci e un componente condiviso con la scheda persona già consegnata, la metà pubblica tocca la **vetrina dell'aviosuperficie** e l'unico flusso senza sessione dell'app — mescolarle in una review sola significa che il reviewer adversarial deve tenere in testa due modelli di minaccia; (iii) la 15.8 ha già dimostrato che uno split su una superficie di questa taglia si chiude in due cicli puliti con 0 major sul primo. **A** è difendibile se il PO vuole chiudere l'epic in meno cicli, ma va scelto sapendo che una sola review dovrà coprire quattro superfici, quattro attori, cinque stati degradati e un flusso pubblico bilingue.

---

### Q2 — Il TD 14.6 F4: si chiude qui, e su quante facce?

**Il fatto**: `account-section.tsx` (585 righe, `'use client'`) è montato da **due** pagine con **due** geometrie. Misurato a 375px: faccia **self** 4 colonne, `.students` **281/434**, tracce computate **`104px 150px 0px 120px`** ⇒ la colonna **Descrizione è larga ZERO** (non "tagliata": inesistente, e nessuno scroll orizzontale la fa comparire) e l'importo finisce a `right 481` in un corpo da 281 (**200px fuori**); faccia **admin** 6 colonne, `.students` **281/802** (**521px nascosti**), ultima cella a `right 849`, azione di riga **24,67px**. Il TD è aperto dalla review 14.6 e la **15.5 lo ha dichiarato esplicitamente come l'unica eccezione del proprio sweep** (`mobile-registries.spec.ts:888`). ⚠️ E il punto dirimente: **`my-account` non ha altro contenuto** — rinviare il componente significa **non fare la story**.

**Opzioni**
- **A — Si chiude su ENTRAMBE le facce.** Un solo albero mobile dentro `AccountSection` che rispetta i due prop esistenti (`showActor`, `canManageFinance`), quindi rende 4 o 6 informazioni a seconda del chiamante. L'esclusione di `mobile-registries.spec.ts:888` **sparisce** e il test resta verde: prova secca e non aggirabile.
- **B — Si chiude solo la faccia SELF; la faccia admin resta esclusa e va alla 15.10.** Costa meno (niente colonna "registrato da", niente azione di riga da portare a 44px, niente form di ricarica/rettifica su mobile), ma lascia **lo stesso componente** con due comportamenti diversi a seconda del chiamante, l'esclusione dello sweep in piedi, e la scheda persona — consegnata dalla 15.5 come "mobile" — con un buco da 521px al centro.
- **C — Si rinvia tutto alla 15.10.** Non praticabile senza svuotare la story (v. sopra).

**Raccomandazione: A.** Motivi: (i) il costo marginale della faccia admin è **due informazioni in più nella card/sheet e due azioni** — non un secondo albero: il componente è **uno solo** e i due prop esistono già; (ii) lasciare la faccia admin fuori significa che il dev deve scrivere un ramo `if (showActor)` **nel nuovo codice mobile** per non renderla — cioè lavoro in più per ottenere meno; (iii) la prova di chiusura è **binaria e già scritta da un'altra story** (togliere `!el.closest('[data-testid="account-section"]')` e restare verdi), che è il tipo di criterio che questo epic ha imparato a preferire; (iv) la 15.10 è uno **sweep**, non una story di porting: caricarla di una superficie intera è esattamente ciò che ha reso costose le chiusure di epic precedenti. **B** è difendibile solo se ⟨Q1⟩ sceglie **A** (tutto in una story) e il PO vuole contenere la taglia.

---

### Q3 — Che cosa vive sulla card del movimento, e dove vivono ricarica e rettifica?

**Il fatto**: la riga desktop porta 4 informazioni (self) o 6 (admin), **due badge condizionali** (rettifica/storno, col testo che dipende dalla presenza dell'originale **nella stessa pagina**), e sulla faccia admin **apre** un form (`account-adjustment-row-{id}` → pannello rettifica precompilato con `key` di remount). Le due azioni di **testata** (`account-topup-toggle`, `account-adjustment-toggle`) aprono oggi due riquadri **inline dentro la card** (`account-section.tsx:243-263`), non due overlay: misurati **116,41×34,84** e **117,77×34,84**; i loro submit sono `account-topup-submit` e `account-adjustment-submit`. La grammatica dell'epic per questi casi è consolidata: dettaglio-riga = **bottom sheet** (R-15.2-b → R-15.8a-d), azione con effetto contabile = **`secondStep` dentro lo sheet** (R-15.7-d, R-15.8a-g), form di creazione = **pannello a tutto schermo** (R3).

**Opzioni**
- **A — Card tappabile → sheet a parità piena; le due azioni di TESTATA restano riquadri inline resi a colonna singola con target a 44px; l'azione di RIGA (rettifica collegata) diventa un `secondStep` dentro lo sheet.** Coerente con 15.7/15.8a: la scrittura contabile vive dove l'utente ha toccato la riga.
- **B — Card NON tappabile (tutte le informazioni sulla card, nessuno sheet); le azioni restano dove sono, portate a 44px.** Il più economico. Costo: 6 informazioni + 2 badge su 281px di larghezza, e l'azione di riga della faccia admin resta un bottone dentro una card affollata.
- **C — Card tappabile → sheet; ricarica e rettifica diventano PANNELLI A TUTTO SCHERMO (`SlideOver` in modalità mobile, R3 alla lettera).** Il più fedele a R3 per i "form di creazione". Costo: due pannelli nuovi su una superficie che oggi non ne ha nessuno, e AD-8 impone di chiudere lo sheet prima di aprirli.

**Raccomandazione: A.** Motivi: (i) sulla faccia self la card ha **tre** cose da dire (tipo, data+descrizione, importo) e la quarta (i badge) è **condizionale**: sta comodamente nella riga del template, e lo sheet serve a portare la descrizione per esteso — che è **esattamente l'informazione oggi annientata a 0px**, quindi lo sheet non è decorativo, è la cura; (ii) sulla faccia admin lo sheet è l'unico posto onesto dove mettere "registrato da" e l'azione di rettifica **senza** far competere sei oggetti su 281px (lezione 15.5 F2: la parità si porta nello sheet, non si stipa nella card); (iii) le due azioni di **testata** non sono azioni di riga e non hanno un contesto di riga da preservare: promuoverle a pannello full-screen (**C**) sarebbe lavoro nuovo senza un difetto misurato che lo giustifichi, mentre portarle a 44px in colonna singola è chirurgico. **C** è la scelta giusta **solo** se il PO legge R3 come vincolante anche per i form *inline* preesistenti — nel qual caso va detto, perché cambia la taglia della story.

---

### Q4 — I tre contrasti degli importi (2,73 / 3,96 in tema chiaro): si chiudono qui?

**Il fatto**: misurati canvas→WCAG in tema chiaro, l'importo **positivo** di un movimento di conto sta a **2,73:1** e quello **negativo** a **3,96:1** (`account-section.tsx:300`, `color: var(--ok)` / `var(--bad)` **inline**); l'importo di un pagamento istruttore sta a **2,73:1** (`my-compensation/page.tsx:144`, stesso inline). In tema scuro gli stessi valori misurano 9,30 / 6,61 / 9,47 — **sopra soglia**. Sono **gli stessi due numeri** che la 15.8a ha chiuso su `billing-by-category-row` (in 2,73, out 3,96) e `negative-balance-row` (3,96), con la stessa causa e la stessa medicina **già in casa, già ratificata e già misurata**: `.stat-tone-ok`/`.stat-tone-bad` (`airops.css:733-737`, **9,82/10,63**, con override `html[data-theme="dark"]` che ritorna ai token vivaci). Il difetto esiste **anche sul desktop** (è indipendente dalla larghezza) e tocca **tre** superfici (`my-account`, `people/{id}`, `my-compensation`). ⚠️ E i colori di oggi sono **inline**: una regola di classe non li batterebbe mai (è la LOW-1 della review 15.8b).

**Opzioni**
- **A — Si chiudono tutti e tre qui**, sostituendo l'inline con `.stat-tone-*`, con la misura pre/post nei due temi, su **desktop e mobile**, e l'enumerazione dei gemelli. Include la misura del ramo mancante (`account-balance` in rosso), oggi non coperto dai fixture.
- **B — Si chiude solo ciò che la card mobile rende nuovo** (cioè l'importo della card) e il desktop resta com'è. Costo: due toni diversi per lo stesso numero sulla stessa pagina a due larghezze diverse, e un TD che resta aperto su una superficie che questa story sta riscrivendo.
- **C — Si rinviano tutti alla 15.10** (dark/a11y pass).

**Raccomandazione: A.** Motivi: (i) è **precedente diretto e ratificato**: il PO ha già deciso "TUTTO ORA, non la raccomandazione" sulla stessa classe di difetto in R-15.8a-i/R-15.8b-e, e riaprire la decisione per gli stessi due numeri sarebbe incoerente; (ii) la medicina **esiste, è misurata e non introduce nulla** — è l'applicazione di una classe già scritta, cioè il fix più chirurgico possibile; (iii) **B è tecnicamente peggiore di A**: lasciare l'inline sul desktop e metterci una classe su mobile significa due sorgenti di verità per lo stesso colore sullo stesso componente; (iv) il costo è una manciata di righe più la misura dei gemelli, che l'AC impone comunque. **C** è difendibile solo se il PO vuole una sola story che tocchi i colori, ma la 15.10 arriverebbe a riaprire un file che questa story ha appena finito di riscrivere.

---

### Q5 — I cinque KPI dei compensi: strip, 2×2+1, o altro?

**Il fatto**: `my-compensation` ha **cinque** KPI (Tariffa oraria · Ore nel mese · Maturato nel mese **lordo** · Dovuto nel mese **netto** · Residuo dovuto). A ≤640px la `.kpi-row` è **già** la strip a scroll orizzontale della 15.2 (`flex`, `cw 375 / sw 835`, card da **146px**): due card e mezza visibili, le altre due e mezza fuori. La variante **2×2** (`.kpi-row.kpi-row-grid`, 15.3 R-15.3-c, riusata dalla 15.7) è progettata per **quattro** KPI; con cinque produrrebbe una riga spaiata. La 15.7 ha misurato che la 2×2 **costa 97,7px di altezza** (la prima card scese da 567 a 609) e la 15.8b ha ratificato "strip invariata" proprio per non pagare quel prezzo. ⚠️ Qui però c'è un fatto in più: **la coppia Maturato/Dovuto è una ratifica PO** (review 14.7 F4: *"mostrati fianco a fianco così che i due KPI adiacenti si riconcilino invece che uno sia silenziosamente nettato"*) — e in una strip a scroll i due possono finire **uno dentro e uno fuori dallo schermo**.

**Opzioni**
- **A — Strip invariata** (come R-15.8b-c). Zero lavoro, zero altezza. Costo: la coppia ratificata può risultare non adiacente **a schermo**, che è precisamente ciò che la ratifica 14.7 F4 voleva evitare.
- **B — 2×2 + 1** (quattro in griglia, il quinto a piena larghezza in coda), con l'ordine scelto perché **Maturato e Dovuto stiano sulla stessa riga**. Costo: ~98px di altezza (misura 15.7) su una pagina che a ≤640px è alta 812 con un solo pagamento — quindi il costo si vede.
- **C — Strip, ma con l'ordine riordinato** perché Maturato e Dovuto siano **le prime due card**, entrambe visibili senza scorrere (2,57 card entrano nei 375px). Zero altezza in più, la ratifica 14.7 F4 salva, ma cambia l'ordine di lettura anche sul **desktop** (dove i cinque KPI sono in griglia e si vedono tutti) — a meno di renderli in ordine diverso nei due alberi, che è duplicazione.

**Raccomandazione: B.** Motivi: (i) la ratifica 14.7 F4 è **esplicita sul fianco a fianco** e una strip a scroll non lo garantisce: A la viola in silenzio, che è il tipo di regressione che questa story deve evitare; (ii) **C** compra l'adiacenza al prezzo di cambiare l'ordine sul desktop o di duplicare l'ordine — e "due sorgenti di verità per l'ordine" è la stessa classe di difetto della 15.8b MAJOR-1; (iii) i ~98px si pagano su una pagina che **non ha nient'altro sopra la lista** (nessun filtro, nessuna CTA, nessuna ricerca: **zero** target interattivi misurati) — è la pagina dell'epic che se li può permettere meglio; (iv) 2×2+1 è la sola forma che rende **tutti e cinque** i numeri leggibili senza gesto. Se il PO preferisce **A**, va detto che la coppia ratificata resta adiacente **nel DOM** ma non necessariamente **a schermo**, e questo va scritto nel record come deviazione accettata.

---

### Q6 — Il modulo pubblico `/ppr`: risanamento chirurgico o ridisegno nel linguaggio dell'epic?

**Il fatto**: `/ppr` è **la vetrina pubblica dell'aviosuperficie** — la sola pagina che un pilota esterno vede prima di atterrare. Misurato a 375px: **non è rotto** (nessun overflow di pagina, griglia già a colonna singola, form già a colonna singola dal fix 13.10-F3, popover del calendario già dentro il viewport, contrasti tutti sopra soglia in **entrambi** i temi, flusso completo funzionante fino alla mail di ricevuta bilingue). **È scomodo**: **12 campi su 12 sotto i 44px** (10 a 36,84, 2 a 38,84), **2 trigger calendario a 24×24**, submit **101,64×64,59** (alto solo perché il testo va a capo) su una riga `flex-wrap: nowrap` alta 85,59, hero che si mangia **230,53px** (il titolo italiano su due righe), `docH` **2025px**, e **47 target sotto soglia dentro `.cal-popover`** (primitiva condivisa da 11+ consumatori). Il template mobile **non copre** questa schermata (R2 al massimo grado); il solo riferimento è il prototipo **desktop** già portato 1:1.

**Opzioni**
- **A — Risanamento chirurgico**: tutti i campi e il submit a **≥44px** (ancorati a `.ppr-*`, mai globalmente), submit **full-width** con la nota "campi obbligatori" su una riga propria, trigger calendario a 44px **ancorati al form pubblico**, e lo switch di lingua di ⟨Q7⟩. Il resto (hero, aside, footer, sezioni) **invariato**. I 47 target dentro `.cal-popover` restano **TD dichiarato** per la 15.10.
- **B — Risanamento + compattamento della testa**: come A, più hero ridotto a ≤640px (eyebrow + titolo su una riga, descrizione accorciata o spostata) e `.ppr-aside` promossa **sopra** il form o resa collassabile, per far arrivare il primo campo più in alto (oggi il primo input è dopo ~400px di pagina).
- **C — Ridisegno completo nel linguaggio del template**: card di sezione, submit **sticky in basso** come `.so-actions`, eventuale form a passi. Massima coerenza con l'epic, massimo rischio su una superficie pubblica coperta da 6 e2e che riempiono per **etichetta localizzata**.

**Raccomandazione: A.** Motivi: (i) è l'unica opzione il cui perimetro è **interamente derivato da misure**: ogni riga cambiata risponde a un numero sotto soglia, che è la regola di questo epic (karpathy: ogni riga riconducibile alla richiesta); (ii) **C** riscriverebbe la pagina che il PO ha già ratificato due volte (12.4 sul prototipo, 13.10 sul mobile pass) e metterebbe a rischio, senza un difetto misurato che lo giustifichi, l'**unico flusso pubblico dell'app** — quello che genera le richieste PPR reali; (iii) **B** è ragionevole ma il guadagno è estetico e il costo è tipografico: l'hero italiano è alto perché il **titolo tradotto** è lungo, e accorciarlo è una decisione di copy, non di layout; (iv) il difetto vero e **incontestabile** su questa pagina non è l'altezza: è che **non si riesce a toccare niente** e che **non si può cambiare lingua** — A chiude entrambi. Se il PO sceglie **B** o **C**, va messo in conto che `ppr-public.spec.ts` (riempimento per etichetta) e `datetime-picker.spec.ts:237` vanno riverificati riga per riga.

---

### Q7 — Lo switch di lingua della vetrina pubblica: dove torna, e a che soglia?

**Il fatto**: `airops.css:1571` — `@media (max-width:820px){ … .ppr-top-right{display:none} }`. `.ppr-top-right` contiene **soltanto** il link `Italiano ⇄ English` (`page.tsx:68-72`): il resto di quel blocco (le statistiche AFIS/ELEV/OPS del prototipo) è stato **omesso** dalla 12.4 perché non ha alcun setting che lo alimenti. Misurato: il link ha rect **0×0** a 320, 375, 390, 641 e 800px; a **821px** torna `flex` e misura **45,72×15,94**. Conseguenza: su **qualunque telefono e qualunque tablet**, un visitatore straniero non può passare all'inglese — e la lingua determina anche quella della **mail di ricevuta** (`locale` nel body, `ppr-form.tsx:207`). L'unico modo oggi è editare l'URL (`/it/ppr` → `/en/ppr`). ⚠️ R5 dell'epic mette lingua e logout nel **menu profilo della topbar**, che su `/ppr` **non esiste** (misurato: nessuna topbar, nessuna tab bar).

**Opzioni**
- **A — Il link torna visibile a ogni larghezza**, dentro `.ppr-top`, con target **≥44px**; a ≥821px resta dov'è oggi (misura desktop invariata a parte l'altezza del target). Una riga di CSS (togliere `.ppr-top-right{display:none}` dalla query e dare al link un'area di tocco) più l'aggiustamento della testata a ≤640px.
- **B — Il link torna, ma come chip nel FOOTER** (`.ppr-foot`, che a ≤640px è alto 99,69 e contiene solo due span). Non compete con brand e sottotitolo nella testata stretta, ma è **sotto 2025px di pagina**: chi apre in inglese per sbaglio deve scorrere tutto il modulo per accorgersi che si può cambiare.
- **C — Resta nascosto** e si accetta che la vetrina pubblica sia monolingue sul telefono, documentandolo come TD.

**Raccomandazione: A.** Motivi: (i) il bilinguismo IT/EN è un **requisito di prodotto dell'app** (next-intl, NFR-1) e questa è l'unica pagina che un utente **non registrato** vede: nasconderne lo switch è una perdita di funzione, non una scelta di layout; (ii) il motivo storico della regola non esiste più — `.ppr-top-right` fu nascosto perché nel prototipo conteneva **tre blocchi di statistiche** che a 375px non ci stavano, ma la 12.4 li ha **omessi tutti**: oggi la regola nasconde una parola di 8 caratteri; (iii) è la modifica più piccola che chiude un difetto reale, e la sua guardia è secca e provabile rossa ("il link è visibile e ≥44px a 320/375/390/641/800"); (iv) **B** funziona ma sposta un controllo di navigazione **sotto** il contenuto, che è il contrario di ciò che serve a chi ha sbagliato lingua. ⚠️ Da decidere insieme: la soglia. `/ppr` vive su **820px**, non su 640 — la raccomandazione è **non introdurre una terza soglia**: si toglie la dichiarazione dalla query esistente e si lascia il link visibile ovunque, così la superficie continua ad avere **un solo** breakpoint.

---

### Q8 — R-15.7-j: il link coda PPR ↔ transiti (con filtro server per `pprNumber`) si fa, si rinvia o si archivia?

**Il fatto**: la 15.7 ⟨Q10⟩ ha ratificato **"nessun link nuovo"** rinviando qui la decisione, con la motivazione che *"il deep link onesto richiede il filtro server per `pprNumber`"*. **Verificato oggi**: `listPprRequestsQuerySchema` (`src/lib/schemas/ppr.ts:138-148`) accetta **solo** `status`, `from`, `to` e i parametri di export — **nessun** filtro per numero. Fare il link significherebbe quindi: estendere lo schema Zod, il service, la route, il registry OpenAPI, e poi consumarlo dalla UI. Sarebbe **l'unico lavoro backend dell'intera story** (AD-10) e **l'unico cambio d'API dell'intero epic 15** (che il piano dichiara "tutto UI"). Contesto d'uso: il numero PPR (`PPR-YYYY-NNNN`) è **null** finché la richiesta è PENDING e **per sempre** su REJECTED (`schemas/ppr.ts:176`), quindi il link esisterebbe solo per le richieste approvate/completate. Sul DB reale: 68 richieste, 41 APPROVED + 8 COMPLETED.

**Opzioni**
- **A — Si fa qui**: filtro `pprNumber` sullo schema + service + route + OpenAPI, e un'azione "Vedi in Transiti" nello sheet della coda PPR (e/o "Vedi la richiesta" nello sheet del transito).
- **B — Si rinvia a una story dedicata post-epic**, insieme agli altri lavori backend già in coda (la story AOG, i due finding di sicurezza).
- **C — Si archivia**: il collegamento non serve, perché la coda PPR e il registro Transiti sono **la stessa entità** vista con due filtri di stato, e l'operatore che chiude un transito non parte mai dalla coda.

**Raccomandazione: B.** Motivi: (i) è **backend puro** dentro una story che il piano definisce "tutta UI", e la regola di progetto assegna il backend a un modello diverso (Sonnet 5 xhigh) — farlo qui significa o degradare il modello su una story UI, o far scrivere backend a un dev agent istruito per l'UI; (ii) tocca lo **schema pubblico dell'API** (che il progetto dichiara "API-first, consumata anche dalla futura app Flutter") e quindi merita il proprio ciclo con il proprio test di contratto e la propria voce OpenAPI — ⚠️ e c'è già un TD aperto sul registry OpenAPI non aggiornato (F5 review 12.11, 8 route mancanti); (iii) **non è bloccante per nessuna delle quattro superfici di questa story**: nessuno dei difetti misurati qui dipende da quel link; (iv) **C** è tentante ma butterebbe via un'osservazione ancora valida (chi approva una richiesta dal telefono non ha oggi nessun modo di vedere se quel volo è poi atterrato). **A** è difendibile solo se il PO vuole chiudere l'osservazione prima della fine dell'epic e accetta un cambio d'API dentro una story UI, dichiarandolo.

---

### Q9 — La coda PPR admin (`/dashboard/ppr`): rifinitura in scope o fuori?

**Il fatto**: `/dashboard/ppr` è stata portata dalla **15.2** come **consumer di prova** delle primitive (`ppr-row-mobile`, `mobile-ppr-sheet`, la famiglia `.ppr-card*` in `airops.css:1880-1901`) — cioè è la superficie mobile **più vecchia** dell'epic, costruita quando `BottomSheet`, la chip strip, il pannello Filtri, i `secondStep` e il nuovo `ExportMenu` **non esistevano ancora**. `ManualPprForm`, che quella pagina monta, è **condiviso** con `/dashboard/movements` ed è **già R3-compliant** (verificato dalla 15.7 AD-10 con misure: pannello a tutto schermo, `.so-actions` col bottom al viewport, submit 44px, tab bar coperta) ⇒ **non va toccato**. Il piano non assegna la coda PPR a nessuna story dopo la 15.2, e la 15.7 l'ha dichiarata "fuori scope → 15.9" nella propria sezione finale.

**Opzioni**
- **A — Fuori scope**, con la verifica di non-regressione che l'AC 13 impone comunque (il nuovo `ExportMenu` e le regole di questa story non la toccano).
- **B — In scope come rifinitura misurata**: si misura la pagina a 375px, si portano a 44px i target sotto soglia, e si allinea la testata alla grammatica consolidata (chip strip / pannello Filtri) **solo dove una misura lo giustifica**.
- **C — In scope come riscrittura** alla grammatica 15.6/15.7/15.8a.

**Raccomandazione: A**, con una **riserva esplicita per la 15.10**. Motivi: (i) questa story ha già quattro superfici e (con ⟨Q2⟩ **A**) un componente condiviso da riscrivere: aggiungere una quinta superficie **non misurata in questa ricognizione** significa spedire al dev un perimetro senza numeri, che è esattamente ciò che questo processo evita; (ii) la 15.10 è uno **sweep di epic** e il suo mandato naturale include "le superfici costruite prima che le primitive fossero complete" — la coda PPR è **l'unica** in quella condizione; (iii) `ManualPprForm` non si tocca comunque (AD-10 della 15.7 regge), quindi il pezzo più rischioso è già fuori. Se il PO sceglie **B**, la ricognizione della coda PPR va fatta **prima** del dispatch (misure a 375/320/390, target, testata, sheet) — non demandata al dev.

---

### Q10 — Gli empty state e i feedback: quanto si allinea alla grammatica dell'epic?

**Il fatto**: fra le quattro superfici gli stati vuoti sono **quattro e disomogenei**. `my-compensation` ne ha **due, entrambi con testid** (`my-compensation-empty` «Nessun profilo istruttore attivo.», `my-compensation-payouts-empty` «Nessun pagamento registrato.»). `AccountSection` ne ha **due, entrambi SENZA testid proprio**: la lista vuota è un `<p className="fld-label">` con «Nessun movimento registrato.» (`:265-268`) e il saldo assente è la stringa «Nessun conto attivo» **dentro** `account-balance` (`:239`) — ⚠️ quest'ultima è letta **page-level con `toHaveText`** da `accounts-topups.spec.ts:101`. In più il feedback della rettifica è un `<p role="status" data-testid="adjustment-feedback">` **dentro la `.card-head`** (`:217-221`) — **la stessa forma** che 15.6 (R-15.6-d ii), 15.7 (R-15.7-g) e 15.8a (R-15.8a-j) hanno sostituito col **toast** su mobile, per non annunciare due volte e per non nasconderlo sopra il fold.

**Opzioni**
- **A — Allineamento pieno**: i due empty state di `AccountSection` prendono un **testid proprio** (precedente esatto: R-15.7-i su `my-expiries.tsx`), l'albero mobile ha il proprio empty (**un solo nodo**, stringa **distinta** da quella desktop dove una guardia page-level la legge), e `adjustment-feedback` diventa **toast su mobile** mentre il `<p>` resta al desktop (canale unico, nessun doppio annuncio).
- **B — Solo i testid**: si aggiungono gli identificativi mancanti, il feedback resta un `<p>` anche su mobile.
- **C — Niente**: si riusano le stringhe e i nodi di oggi.

**Raccomandazione: A.** Motivi: (i) i testid mancanti sono **la stessa lacuna** che la 15.7 ha già chiuso sulla superficie gemella, con la stessa motivazione (un empty state senza testid si può asserire solo per testo, e il testo è ciò che duplica); (ii) il toast è **ratificato tre volte** su tre superfici diverse e il caso qui è identico: il feedback vive nella `.card-head`, cioè sopra una lista che su un telefono l'utente sta guardando **dopo** aver scrollato; (iii) **C** è la scelta che romperebbe `accounts-topups.spec.ts:101` non appena l'albero mobile ripete «Nessun conto attivo» — cioè non è un'opzione, è un difetto in attesa. **B** è accettabile se il PO vuole minimizzare le superfici toccate, ma va scritto nel record che il feedback resta sopra il fold sul telefono.

---
---

# Dev Agent Record (dev, Opus 5 xhigh — 2026-08-06)

## 0) Verifica della ricognizione — 6 correzioni

Tutto rimisurato su build di produzione (`npm run start`), DB **resettato all'inizio della sessione** (quindi con dati diversi da quelli della ricognizione, che girava su DB post-suite) e fixture create dal dev via API.

| # | La ricognizione diceva | Misurato dal dev | Conseguenza |
|---|---|---|---|
| 1 | `grep -rn 'data-testid\^=' e2e/` = **20 occorrenze, 7 file** | **29 occorrenze, 10 file** (`ac-card-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-tail-chip-`, `mobile-fleet-`, `mobile-fleet-card-`, `reports-fleet-row-`, `reports-rank-aircraft-row-`, `reports-rank-pilot-row-`, `reports-instructor-row-`) | **L'elenco dei prefissi è identico**: nessuno tocca `account-`, `my-compensation-`, `mobile-account`, `mobile-compensation`, `ppr-`. Il suffisso `-mobile` resta LEGALE qui. Conta e file corretti. |
| 2 | `/ppr`: «10 `input.input` a 36,84» | **9** `input.input` a 36,84 + 2 `datetime-local` a 38,84 + 1 `textarea` 74,53 = **12 campi**, di cui 11 sotto i 44 | Il totale «12 su 12 sotto i 44px» resta vero (il textarea è alto ma i suoi 11 fratelli no); la scomposizione era 9+2, non 10+2. |
| 3 | `.ppr-top` **75,5** @375 / **90** @320 | **60** @375 / **73,5** @320 | Dipende dalla lunghezza del nome aviosuperficie (`AppSetting`, riscritto dalla catena e2e): non è una costante. |
| 4 | `.page-head` scheda persona **198,41** @375 | **169,81** @375 | Stessa causa: dipende dai profili/badge della persona misurata. |
| 5 | contrasti importi: due valori (2,73 / 3,96) | **tre**: 2,73 (positivo su `--panel`), **2,59** (positivo su riga con sfondo alternato) e 3,96 (negativo) | Il fix li chiude tutti e tre (10,63 / 10,06 / 9,82). |
| 6 | `.stat-tone-*` «misurate 9,82/10,63» | `.stat-tone-ok` = **10,63**, `.stat-tone-bad` = **9,82** (chiaro) | Coppia invertita nel testo della story; i valori sono quelli. |

Confermate alla lettera invece: `.students` **281/434** self e **281/802** admin @375, tracce **`104px 150px 0px 120px`** (celle `104@169 · 150@333 · 0@347 · 120@481`), `.students` compensi **281/640** (celle `150@215 · 200@429 · 120@563 · 110@687`), `.page-head` 51,44 / 70,28, `.card-head` 63,84 / 49,3 / 106,69, paginazione 91,27×34,84 e 90,45×34,84, `export-menu-trigger` 136,63×34,84, `account-adjustment-row-*` **24,67**, i due toggle 34,84, `/ppr` **14** target sotto 43,5 di cui 1 honeypot, `ppr-submit` **101,64×64,59** @375 e **127,41×44,30** @≥641, `.ppr-top-right` **0×0** a ≤820 e **45,72×15,94** a 821, l'unico scroller di `/ppr` (`cw 1 / sw 198`, wrapper honeypot), `AccountSection` che **non rimonta**.

## 1) Esito per AC

| AC | Esito | Prova |
|---|---|---|
| 1 | **fatto** | `.account-desktop-body` `display:none` + `.account-mobile` `block` a 375, l'inverso (`flex`/`none`) a 1280 — asserito su **entrambi** i lati. Card = 1 `<button>` con `querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`, `min-height` 44 (rect 81,83 con badge / ~60 senza). Sub = `data · descrizione [· registrato da]` via `joinSegments`. Importo `.mobile-row-amount` + `.stat-tone-*`. |
| 2 | **fatto — TD 14.6 F4 CHIUSO** | `e2e/mobile-registries.spec.ts:888` **l'esclusione `!el.closest('[data-testid="account-section"]')` è stata RIMOSSA** e il test resta verde (run mirato: 16/16 di quel file). Con il difetto reintrodotto (CSS injection che riaccende la tabella desktop a 375) lo stesso sweep restituisce `["students account-desktop-body","student-row header","","student-row", …]`. |
| 3 | **fatto** | I dieci comportamenti: (a) saldo rosso solo con conto e saldo<0 (test dedicato, `-75,00 €` + classe `stat-tone-bad`, e «Nessun conto attivo» sull'attore senza conto); (b) `formatSignedCents` invariata; (c) badge con la data dell'originale **in pagina** e fallback `linked` (funzione pura `linkedBadgeText`, unit test sui due rami); (d) nessuna azione su `hasReversal`/`PACKAGE_PURCHASE` (asserito nello sheet); (e) importo non parsabile ⇒ errore inline e **0 richieste contate con `page.route`**, `Idempotency-Key` presente; (f) importo ≠ 0 negativo provato, motivo obbligatorio, `originalMovementId` asserito nel body, **409 distinto** provato con la corsa reale (rettifica creata via API a sheet aperto ⇒ messaggio dedicato, sheet che resta aperto, **nessun** movimento scritto); (g) effetto contabile letto **dall'API** filtrata; (h) `router.refresh()` + chiusura esplicita; (i) remount del form provato (riga A → riga B ⇒ importo vuoto). Target: 44px su tutti (`mobile-account-adjust-action` 341×44). |
| 4 | **fatto** | `.compensation-desktop-body` none / `.compensation-mobile` block a 375 e l'inverso a 1280; card con **tutte e quattro** le informazioni (periodo, `Registrato il … · metodo`, importo) — la sub **va a capo** invece di ellissare, perché questa card non ha uno sheet dietro (v. §4). `my-compensation.spec.ts:329-361` riscritto **al valore corretto** (v. §4). |
| 5 | **fatto** | `.kpi-row.kpi-row-grid.compensation-kpi-row`: `grid`, 2 tracce, `scrollWidth == clientWidth`, `kpi-gross-mtd.top === kpi-owed-mtd.top` (Maturato e Dovuto sulla STESSA riga), `kpi-owed-total` largo quanto la riga. Cinque testid, un nodo ciascuno. Costo misurato: **76,97 → 233,45** (+156,48px) @375 — v. §5, oltre la stima ~98px della story. |
| 6 | **fatto** | 320/375/390: target sotto 43,5 = **[]** escluso il honeypot **dichiarato**; submit **full-width** (277×44,3 in una `.ppr-actions` da 277); `pageOverflow` 0; sweep `.ppr-page` = solo il wrapper del honeypot; switch lingua visibile e ≥44 a **320/375/390/641/800/1280** e funzionante (IT→EN, label che si inverte, form EN); flusso invariato (submit vuoto = 10 `.fld-error` + **0** richieste; submit reale = 1 richiesta + `.ppr-success` senza numero PPR + "invia un'altra" che resetta); `.cal-popover` 47,5→327,5 dentro il viewport; `datetime-picker.spec.ts` **non toccato e verde**. |
| 7 | **fatto** | Paginazione su **entrambe** le facce a 375: `1 / 2 → 2 / 2`, href asserito (`/it/dashboard/people/{id}?page=2` e `/it/dashboard/my-account?page=2`), target 44 (pre 34,84), hit-test a fondo pagina `[]`. L'inline è diventato `.account-pagination` **fuori** dalla query (34,84 identico a 641/800/1280). |
| 8 | **fatto (verifica + una modifica dichiarata)** | Un solo `export-menu-trigger`, un solo `export-menu-xls`/`-pdf`, sheet a 375 con gli href identici e **download reale** provato (`.xlsx`). ⚠️ Il trigger è stato portato a 44px **solo su questa card** (`.account-head > div:has(> .btn) > .btn`): gli altri nove consumatori restano a 34,84 — TD (g) dichiarato, non chiuso. |
| 9 | **fatto — tutti e quattro chiusi** | v. §6. Inline sostituiti con la classe in 3 punti (`account-section.tsx` importo e saldo, `my-compensation/page.tsx` importo). |
| 10 | **fatto** | Desktop invariati; nomi nuovi: `account-movement-row-mobile`, `my-compensation-payout-row-mobile`, `adjustment-badge-mobile`, `reversal-badge-mobile` (suffisso), `mobile-account-list`, `mobile-account-empty`, `mobile-account-sheet`, `mobile-account-adjust-action`, `mobile-compensation-list`, `account-statement-empty`, `ppr-locale-switch`, `ppr-view-in-movements-mobile` (prefisso/nuovi). **Nessuno** comincia per un prefisso `^=` in uso; **nessuno** riusa la famiglia `account-adjustment-row-{id}` (l'azione nello sheet è un singleton). Conteggi verificati a 375 **e** 1280 su tutte e quattro le pagine. Le 4 stringhe lette page-level compaiono **una volta sola** a entrambe le larghezze. |
| 11 | **fatto** | 320/375/390 su my-account (con e senza conto, 2 e 21 movimenti), my-compensation (con e senza profilo, con e senza pagamenti), scheda persona, `/ppr`: `pageOverflow` 0, sweep `[]` (con le esclusioni dichiarate), contenimento dei figli delle card `[]`, hit-test a fondo pagina `[]` (esclusi i `Link` `aria-disabled`, motivo dichiarato). |
| 12 | **fatto** | v. §7 (tabella regola→guardia→discriminanza, ognuna provata ROSSA). |
| 13 | **fatto** | v. §5 (misure pre/post a 641/800/1280 su tutte e quattro le pagine). `npm run gates` verde; nessuna dipendenza nuova; nessun token cambiato; nessun literal di colore nuovo; ogni stringa nuova nei due locale. |
| 14 | **fatto** | ADMIN/PILOTA/ALLIEVO/ISTRUTTORE a 375 **e** 1280 su entrambe le pagine self, con `clearCookies` fra un'identità e l'altra: nessun redirect, `account-section`/`account-balance`/`mobile-account-list` = 1 nodo per ciascuno, **zero** azioni di scrittura sulla faccia self per chiunque, `my-compensation-kpis` presente **solo** per l'istruttore. Stati degradati: senza conto, senza pagamenti, senza profilo istruttore, saldo negativo, `/ppr` **senza** sessione e **con** sessione. |
| 15 | **fatto** | Schema (`pprNumberSchema`, `PPR-\d{4}-\d{4,}`), service (`where.pprNumber`), route (invariata: passa la query), **registry OpenAPI aggiornato nello stesso commit**, `movements/page.tsx` che sanifica il parametro. UI: «Vedi in Transiti» **solo** dove il numero esiste. Contract test (valido / seq>4 cifre / assente / 7 malformati) + unit del service + e2e end-to-end. |
| 16 | **fatto** | v. §8. |

## 2) File toccati

**Nuovi**
- `src/lib/mobile-self.ts` — 4 derivazioni pure (`accountMovementSubLine`, `accountMovementSheetSub`, `linkedBadgeText`, `payoutCardSubLine`).
- `src/lib/mobile-self.test.ts` — 12 casi (verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run`).
- `e2e/mobile-self-public.spec.ts` — 20 test, project `chromium`, `fullyParallel`, **fuori** dalla catena serializzata.

**Modificati**
- `src/app/[locale]/dashboard/people/[id]/account-section.tsx` — albero mobile + sheet + `.stat-tone-*` + classi di switch + testid degli empty + toast dal solo sheet.
- `src/app/[locale]/dashboard/my-account/page.tsx`, `src/app/[locale]/dashboard/people/[id]/page.tsx` — le tre label `mobile.*`.
- `src/app/[locale]/dashboard/my-compensation/page.tsx` — lista card, KPI 2×2+1, `.stat-tone-ok`.
- `src/app/[locale]/ppr/page.tsx` — `.ppr-brand-block` + `data-testid="ppr-locale-switch"` (nessuna label toccata).
- `src/app/[locale]/dashboard/ppr/ppr-console.tsx`, `.../ppr/page.tsx` — l'azione «Vedi in Transiti» nello sheet (unica modifica ammessa da R-15.9-i).
- `src/app/[locale]/dashboard/movements/page.tsx` — `?pprNumber=` sanificato e propagato.
- `src/lib/schemas/ppr.ts`, `src/lib/schemas/registry.ts`, `src/server/services/ppr.service.ts` — il filtro.
- `src/lib/schemas/ppr.test.ts`, `src/server/services/ppr.service.test.ts` — contract + unit.
- `src/styles/airops.css` — blocco 15.9 in coda (+ la rimozione di `.ppr-top-right{display:none}` dalla query 820px esistente).
- `messages/it.json`, `messages/en.json` — 6 chiavi nuove per locale (`AccountStatementPage.mobile.{empty,openDetail,close}`, `MyCompensationPage.mobile.registeredOn`, `PprQueuePage.mobile.viewInMovements`).
- `e2e/mobile-registries.spec.ts` — **esclusione rimossa** (rafforzamento) + titolo del test allineato.
- `e2e/my-compensation.spec.ts` — il test di geometria a 390px riscritto al valore corretto.

## 3) Decisioni non ovvie

1. **`inSheet` invece di un secondo stato.** `adjustPanel` porta ora `{ originalMovement, inSheet }`: il riquadro inline si rende con `!inSheet`, il `secondStep` dello sheet con `inSheet`. Così `account-adjustment-form` resta **un** nodo a qualsiasi larghezza (asserito) e la rete è una sola (AD-6), senza duplicare `AdjustmentForm`. Il `key` di remount è ripetuto **identico** nei due punti di render.
2. **Lo sheet è DERIVATO, non sincronizzato.** `sheetRow = rowById.get(sheetRowId)`: al cambio pagina la riga non esiste più e lo sheet sparisce **per costruzione** (provato con `?page=2`), senza `useEffect`. Non è solo eleganza: la regola di lint del progetto (`react-hooks/set-state-in-effect`) vieta il `setState` sincrono in un effetto, quindi la versione "chiusura esplicita in un effetto" **non compila**. `openSheet()` azzera un `adjustPanel` rimasto appeso a uno sheet precedente (provato: aprendo un'altra riga il secondo passo non si riapre).
3. **Il feedback della rettifica: un canale per azione, deciso dal CHIAMANTE** (grammatica 15.8a, citata dal suo stesso doc-comment). Lo sheet chiude e annuncia con un **toast**; il riquadro inline continua ad annunciare nel suo `<p role="status" data-testid="adjustment-feedback">`. ⚠️ **Deviazione dichiarata da R-15.9-j**: la ratifica dice «toast su mobile, il `<p>` resta al desktop», ma a ≤640px il riquadro inline **è ancora raggiungibile** (R-15.9-c lo tiene inline), e l'unica implementazione letterale (nascondere il `<p>` sotto i 640 e sparare sempre il toast) produrrebbe **due annunci** sul desktop — cioè viola l'altra metà della stessa ratifica («canale unico, nessun doppio annuncio»). In 15.8a il `<p>` poteva essere nascosto perché su mobile **nessun** percorso lo raggiungeva. Qui il `<p>` resta visibile a ogni larghezza: è adiacente al riquadro che l'utente ha appena usato (misurato: il riquadro è il primo nodo del `.card-body`, il `<p>` è nella `.card-head` sopra di esso — entrambi dentro il primo schermo quando si invia).
4. **La sub della card compensi VA A CAPO, quella dei movimenti no.** Misurato a 375: `Registrato il 06/08/2026, 09:32 · Bonifico` = 262px in 182px di traccia ⇒ con `nowrap + ellipsis` il **metodo spariva**, e su quella card non c'è uno sheet dove ritrovarlo (Q5 non ne prevede uno). La card dei movimenti mantiene l'ellissi perché la sua parità sta nello sheet. Costo: card 60,06 → 75,28 @375 (90,5 @320).
5. **Il trigger del calendario del riquadro "Registra ricarica" va a 44, non a 36.** Le quattro story precedenti si erano fermate a 36 sulle proprie superfici; qui la guardia è scritta sul requisito (43,5) e un'eccezione a 36 sarebbe stata un'esclusione non dichiarata. Stessa aritmetica del form pubblico: `padding-right` da 30 a 48px.
6. **Direzione UNICA del deep link (coda PPR → Transiti).** Il verso opposto («Vedi la richiesta» dallo sheet del transito) porterebbe alla **stessa entità** vista con un filtro diverso (la coda e il registro sono la stessa tabella `PprRequest`): sarebbe un link verso sé stessi. Il valore osservato da Q8 è l'altro («chi approva dal telefono non sa se quel volo è poi atterrato»), e quello lo chiude questa direzione. Entrambe le pagine sono gated `ppr.manage`: chi vede lo sheet può sempre vedere la destinazione (nessun ramo di permesso da scrivere, dichiarato).
7. **`sanitizePprNumber` sulla pagina, `pprNumberSchema` sull'API.** Un `?pprNumber=` scritto a mano non deve far esplodere una **pagina** (la pagina lo ignora e mostra il registro normale); l'**API** invece valida e risponde 422, che è ciò che AC 15 chiede. Stesso pattern di `sanitizeDateParam`, già in quel file.
8. **`.ppr-brand-name` ellissato, `.ppr-brand-sub` no.** Il nome dell'aviosuperficie è testo libero (la catena e2e ne scrive uno da 38 caratteri) e ora divide la testata con lo switch: senza `min-width:0` + ellissi la pagina sfonderebbe a 320. Il sottotitolo invece è una stringa i18n fissa: clamparlo troncava «Autorizzazione Preventiva Obbligatoria» a 375px per niente, quindi continua ad andare a capo come prima.

## 4) `my-compensation.spec.ts:329-361` — perché la riscrittura è un rafforzamento

Il test originale (review 14.7 F2) chiedeva: *la cella IMPORTO ha larghezza > 0 ed è hit-testabile **dopo aver scrollato `.students` tutto a destra***. Era il massimo ottenibile da una tabella che nessuno aveva ancora portato. La 15.9 la porta: a ≤640px quella tabella è `display:none`, quindi «scrolla la tabella di lato» non è più il requisito **giusto**.

Riscritto **al valore corretto**: l'importo dev'essere leggibile e hit-testabile **senza alcuno scroll orizzontale**, dentro la card, con la prova che **nessun antenato** della card scrolla di lato. Misure: pre `.students` **296/640** @390 con la cella importo a `right 687` in 296; post card 296 di larghezza, importo dentro, `anyScroller: false`. Il difetto originale (importo a 0px, irraggiungibile) **fallirebbe ancora** questa versione: una card il cui importo è largo 0 non contiene il testo e non è hit-testabile.

## 5) Misure pre/post

**Fasce mobile (375×812 se non indicato)**

| superficie | grandezza | pre | post |
|---|---|---|---|
| my-account | `.students` `cw/sw` | **281/434** | `display:none` |
| my-account | tracce computate | **`104px 150px 0px 120px`** | — (card list) |
| my-account | celle prima riga | `104@169 · 150@333 · **0@347** · 120@**481**` | card 281 di larghezza, importo contenuto |
| my-account | `.card-head` | 63,84 (92,14 @320) | **101,3** (@320 101,3) |
| my-account | paginazione | 91,27×34,84 / 90,45×34,84 | **44** (contenitore 44; 60,89 @320, va a capo) |
| my-account | `export-menu-trigger` | 136,63×**34,84** | **44** |
| my-account | `docH` (21 movimenti) | 1480 | **1782** |
| my-account | target sotto 43,5 | 5 (3 della pagina + 2 della shell) | **2** (i due `iconbtn` 32×32 della shell, TD 15.1) |
| scheda persona | `.students` `cw/sw` | **281/802** | `display:none` |
| scheda persona | ultima cella | `170@**849**` | contenuta nella card |
| scheda persona | `.card-head` | 106,69 (177,83 @320) | **110,98** (162,98 @320) |
| scheda persona | `account-adjustment-row-*` | **24,67** | azione nello sheet, **44** |
| scheda persona | target sotto 43,5 | **28** | **4** (2 `iconbtn` shell + 1 `iconbtn` + `recent-flights-view-all` 15,94, **tutti pre-esistenti e fuori scope**) |
| my-compensation | `.students` `cw/sw` | **281/640** | `display:none` |
| my-compensation | celle | `150@215 · 200@429 · 120@563 · 110@**687**` | card 281, importo contenuto |
| my-compensation | `.kpi-row` | `flex`, `cw 375 / sw 835`, 5 card da 146 | `grid` **155,5px 155,5px**, `sw == cw`, **233,45** di altezza |
| my-compensation | `docH` (2 pagamenti) | 812 | **813** (la pagina continua a stare in uno schermo) |
| `/ppr` | 12 campi | 9×36,84 + 2×38,84 + textarea | **44** (textarea invariata) |
| `/ppr` | `.date-input-btn` | **24×24** | **44×44** |
| `/ppr` | `ppr-submit` | 101,64×**64,59** (testo a capo) | **277×44,30**, full width |
| `/ppr` | `.ppr-actions` | 85,59 (`nowrap`) | 96,69 (`wrap`, nota su riga propria) |
| `/ppr` | switch lingua | **0×0** a 320/375/390/641/800 | **45,72×44** a **ogni** larghezza |
| `/ppr` | target sotto 43,5 | **14** | **1** (honeypot, dichiarato) |
| `/ppr` | `docH` | 1925 | 2023 |

**Desktop — invarianza (641 / 800 / 1280)**

| superficie | grandezza | pre | post |
|---|---|---|---|
| my-account | `.page-head` | 51,44 / 51,44 / 51,44 | **identica** |
| my-account | `.card-head` | 63,84 ×3 | **identica** |
| my-account | `.students` `cw/sw` | 483/483 · 642/642 · 954/954 | **identiche** |
| my-account | `docH` | 1394 ×3 | **1394 ×3** |
| scheda persona | `.card-head` | 106,69 / 63,84 / 63,84 | **identiche** |
| scheda persona | `.students` | 483/802 · 642/802 · 954/954 | **identiche** |
| scheda persona | `docH` | 2311 / 2253 / 2194 | **identici** |
| my-compensation | `.kpi-row` | `254,5×2` / `334×2` / **5 tracce** da 188,79 | **identiche** |
| my-compensation | `.students` | 483/640 · 642/642 · 954/954 | **identiche** |
| `/ppr` | `.ppr-grid` | 593 / 752 / `623,33 366,66` | **identiche** |
| `/ppr` | `ppr-submit`, `.input`, `.date-input-btn`, `.ppr-actions` | 127,41×44,3 · 36,84 · 24×24 · 65,3 | **identici** |
| `/ppr` | `.ppr-top` | 60 | **72** ⚠️ |
| `/ppr` | `docH` | 1542 / 1542 / 1286 | 1554 / 1554 / **1298** |

⚠️ **L'unica variazione desktop dichiarata**: `.ppr-top` 60 → **72** (+12) a ogni larghezza, `docH` +12. È il **prezzo aritmetico** di R-15.9-g: `.ppr-top-in` è una riga flex con 14px di padding sopra e sotto il cui elemento più alto era il logo da 32px; un target da 44 la porta a 72. Precedente identico: il +12,61px della 15.8b.

**Non-regressione di `/dashboard/ppr` (R-15.9-i, AC 15 d)** — misurata a 375 dopo la modifica: `docH` 812, `pageOverflow` 0, sweep `[]`, 19 target sotto 43,5 (**tutti pre-esistenti**: `ppr-public-form-link`, `ppr-manual-button`, i campi del `ManualPprForm`, `ppr-queue-filter-status`, `export-menu-trigger` — fuori scope per R-15.9-i, riserva 15.10), sheet di una richiesta PENDING: **9 righe kv, 2 azioni, 0 link**, pannello 579,30 — identico a prima per costruzione (il ramo nuovo si attiva solo con `pprNumber != null`, cioè dove prima non c'era **nessuna** azione). `ppr-queue.spec.ts` verde (9/9).

## 6) Contrasti (canvas→WCAG, sfondo effettivo risalendo gli antenati, alpha letta prima della composizione) — due temi, gemelli enumerati

| esemplare | superficie | chiaro pre | chiaro post | scuro pre | scuro post |
|---|---|---|---|---|---|
| `account-movement-row .mono.num` positivo | my-account + scheda persona (desktop **e** mobile) | **2,73** ❌ | **10,63** ✅ | 9,30 | 9,30 (invariato) |
| lo stesso su riga a sfondo alternato | my-account | **2,59** ❌ | **10,06** ✅ | 8,73 | 8,73 |
| `account-movement-row .mono.num` negativo | idem | **3,96** ❌ | **9,82** ✅ | 6,61 | 6,61 |
| `account-balance` in **rosso** (fixture con saldo −508,29 €) | idem | **3,96** ❌ | **9,82** ✅ | 6,61 | 6,61 |
| `my-compensation-payout-row .mono.num` | my-compensation | **2,73** ❌ | **10,63** ✅ | 9,30 | 9,30 |
| `.mobile-row-amount` (card nuova) | entrambe | — | **10,63 / 9,82** ✅ | — | 9,30 / 6,61 ✅ |
| `.mobile-row-sub` (card nuova) | entrambe | — | **4,85** ✅ | — | **5,72** ✅ |
| `.mobile-row-name` (card nuova) | entrambe | — | **18,79** ✅ | — | **15,74** ✅ |
| `.kpi-label` / `.kpi-value` nella griglia 2×2 | my-compensation | 4,85 / 18,79 | **identici** | 5,72 / 15,74 | **identici** |
| **GEMELLI `.stat-tone-ok`** (`billing-console`: importo card, "Per categoria" in, colonna Entrate) | /dashboard/billing | 10,63 | **10,63** | 9,30 | **9,30** |
| **GEMELLI `.stat-tone-bad`** (`billing-console` uscite + saldi negativi, `billing-panels`) | /dashboard/billing | 9,82 | **9,82** | 6,61 | **6,61** |

Il tema scuro **non scende** in nessun esemplare: l'override `html[data-theme="dark"] .stat-tone-*` restituisce esattamente i token `--ok`/`--bad` che l'inline usava. **Nessun token cambia valore, nessun literal nuovo**: il fix è l'applicazione di una classe già scritta e già ratificata (15.8a).

## 7) Regola nuova → guardia → discriminanza (ognuna provata ROSSA col repo intatto)

| regola introdotta | guardia | valore con il difetto reintrodotto |
|---|---|---|
| `.account-desktop-body{display:none}` / `.account-mobile{display:block}` a ≤640 | `treeDisplays()` asserisce **entrambi** i lati a 375 **e** a 1280 | iniettando `display:flex/none` ⇒ `{desktop:"flex", mobile:"none"}` ≠ atteso ⇒ **rosso** |
| lo stesso, dal punto di vista dello sweep | `mobile-registries.spec.ts:888` **senza** esclusione | pre-fix ⇒ `["students account-desktop-body","student-row header","","student-row", …]` ⇒ **rosso** |
| azione di riga → `secondStep` a 44px | `boundingBox().height >= 43.5` | geometria pre-fix (`.btn.mini`) ⇒ **24,67** ⇒ **rosso** |
| contenimento dei figli della card | `cardOverflows()` sul **rect** | spingendo `.mobile-row-side` di 120px ⇒ 3 nodi fuori ⇒ **rosso** |
| nome accessibile senza segmenti vuoti | guardia su **proprietà** (`not.toMatch(/·\s*—/)`), su una riga **senza descrizione** | iniettando `"15/01/2026 · — — Ricarica"` ⇒ match ⇒ **rosso** |
| empty state = un nodo per albero | `toHaveCount(1)` + clonazione DOM del nodo | dopo `appendChild(node.cloneNode(true))` ⇒ **2** ⇒ **rosso** |
| switch lingua visibile ovunque ≥44 | rect a 320/375/390/641/800/1280 | reintroducendo `@media(max-width:820px){.ppr-top-right{display:none}}` ⇒ `0×0`, `display:none` ⇒ **rosso** |
| campi/submit/trigger di `/ppr` ≥44 | sweep sul **requisito 43,5** (mai sul 64,59 ottenuto per accidente tipografico) | reintroducendo `min-height:0` + trigger 24 ⇒ **14** target sotto soglia ⇒ **rosso** |
| filtro server `pprNumber` | e2e del deep link + contract test | senza filtro la stessa GET restituisce **8** righe invece di **1**; `pprNumber=NOT-A-NUMBER` ⇒ **422** |
| toast al posto del `<p>` per la rettifica dallo sheet | `toHaveText('Rettifica registrata.')` sul toast **e** `toHaveCount(0)` sul toast nel ramo 409 | il ramo 409 senza il gate mostrerebbe il toast ⇒ **rosso** |
| card = un solo elemento interattivo | `querySelectorAll('button,a,input,…').length === 0` dentro la card | un controllo annidato ⇒ ≥1 ⇒ **rosso** |
| i selettori nuovi non raggiungono nient'altro | conteggio dei match di **tutti** i 16 selettori nuovi su 12 pagine × 2 larghezze | 0 match fuori dalle 4 superfici; `.date-input-btn` resta **24×24** su dashboard/logbook/billing/movements/bookings/**/dashboard/ppr**, `.input` invariata (36,84/38,84/35/36), `.students`/`.student-row`/`.kpi-row`/`.info-*` invariati |

## 8) Debito tecnico

| TD | stato dopo questa story |
|---|---|
| (a) **TD 14.6 F4** (`account-section.tsx` non responsive) | **CHIUSO** su entrambe le facce — l'esclusione dichiarata di `mobile-registries.spec.ts:888` è stata rimossa e il test è verde. |
| (b) **R-15.7-j** (link coda PPR ↔ transiti) | **CHIUSO** (AC 15). |
| (c) **47 target sotto 43,5 dentro `.cal-popover`** (42 `.cal-cell` 34,58 + 2 `.iconbtn` 24×24) | **SUBITO e dichiarato**: primitiva condivisa da 11+ consumatori, chiuderla qui la cambierebbe per tutti → 15.10. Il *trigger* che la apre su `/ppr` è invece a 44. |
| (d) `.date-input-btn` 24×24 fuori dalle superfici curate | **INVARIATO** (misurato a 24×24 su 6 pagine): quinta faccia dello stesso TD, ancorato come le quattro precedenti. |
| (e) `.so-sub` a `--ink-4` | **non attivo qui**: nessun componente di questa story monta uno `SlideOver` con sottotitolo (verificato). |
| (f) `viewport-fit=cover` mai dichiarato | **INVARIATO**, TD di epic (15.10). |
| (g) trigger `ExportMenu` a 34,84 | **CHIUSO sulla sola card dell'estratto conto** (44px, ancorato a `.account-head`); gli altri nove consumatori restano a 34,84 — TD ancora aperto, ora più piccolo. |
| (h) `billing.spec.ts:296` flaky su aggregato globale | **esposizione dichiarata, non aggravata di proposito.** Il nuovo spec crea per run: **8 conti** con ricariche (tutte datate `2026-01-15`, **passato**, compresa quella inviata dal form — cambiata apposta), **4 rettifiche** che il dominio data **oggi** (l'endpoint `POST /account/adjustments` non accetta una data: `-5,00`, `-25,00`, `-1,00`, `-75,00`), **2 pagamenti istruttore** (periodo 2020, non sono `AccountMovement`) e **3 richieste PPR**. **Nessuna** asserzione su un aggregato globale: ogni saldo asserito è quello della propria fixture, letto dall'API filtrata. ⚠️ Nel run finale `billing.spec.ts:296` è risultato **flaky** (verde al retry) — è il flaky NOTO di quel test (review Billing-2 F4: «flaky 2 run su 2» prima che questa story esistesse), causato dalla sua fotografia+uguaglianza su aggregati globali sotto `fullyParallel`, e le 4 rettifiche di oggi sono un contributo alla concorrenza che questo spec non può eliminare senza rinunciare al ramo "saldo negativo" (AC 9 lo impone). |
| (i) catalogo `ExpiryType` globale mai ripulito | **toccato solo in lettura**: le fixture usano `ensureValidSeedExpiries` (helper esistente) e non creano voli ⇒ il 422 `FLIGHT_BLOCKED_BY_EXPIRY` non le riguarda. |
| (j) `.ppr-top-right` nascosto a ≤820 | **CHIUSO** (R-15.9-g). |
| (k) `ppr-public.spec.ts` riempie per etichetta localizzata | **nessuna label toccata** su `/ppr` (diff verificato: solo una classe e un testid) ⇒ TD invariato e non aggravato. |
| **nuovo (l)** | `.ppr-top` cresce di 12px sul desktop (prezzo dei 44px dello switch): dichiarato, non un difetto da chiudere. |
| **nuovo (m)** | La testata della card estratto conto cresce di 37,46px sulla faccia self (63,84 → 101,3): prezzo dei 44px del trigger di export su una card che ha un solo controllo. Se la 15.10 volesse recuperarli, la strada è nascondere `.card-title` a ≤640 come fa `.billing-head` — non fatto qui perché sulla scheda persona quel titolo è l'unico nome di quella sezione. |

## 9) Cosa NON ho fatto

- **Non ho toccato** `ManualPprForm`, la coda PPR oltre l'azione dello sheet, "Le mie scadenze", le landing 15.3, `BottomSheet`/`MobileSheet`/`SlideOver`/`ExportMenu`/`CalendarPopover`/`joinSegments`.
- **Non ho toccato** nessuna regola di dominio: saldo, segno, storni, rettifiche, lordo/netto, validazioni del form pubblico, honeypot, rate limit, email di ricevuta.
- **Non ho introdotto** cap né selezioni sulle liste (l'estratto conto è già paginato lato server, i pagamenti sono pochi).
- **Non ho aggiunto** nessuno spec alla catena serializzata (questa story non scrive `AppSettings`; verificato).
- **Non ho chiuso** i TD (c), (d), (f) né il trigger `ExportMenu` sugli altri consumatori.

## 10) Esito dei gate — onesto

**`npm run gates`** (ultimo run, dopo l'ultima riga di codice):

```
PASS  lint (23s)
PASS  typecheck (3s)
PASS  test (8s) — Tests  1773 passed (1773)
PASS  build (38s)
```

**Suite completa `CI=1` su build di produzione e DB FRESCO** (`docker compose down -v` → `up` → `migrate deploy` → `db seed`, poi `scripts/e2e.sh start` senza `E2E_REUSE_SERVER`, server ucciso prima):

```
1 flaky
  [chromium] › e2e/billing.spec.ts:296:7 › Tre riquadri con numeri veri da scenario seminato (story Billing-2, AC 6) › ricarica + volo + payout, tutti dated today, move Risultato/Liquidità/Acconti by EXACTLY the expected deltas
2 skipped
470 passed (15.0m)
E2E_EXIT=0
```

**470 passed + 1 flaky + 2 skipped = 473 = 453 (baseline 15.8b) + 20 nuovi.** Exit **0**. L'unico flaky è quello NOTO (TD (h)), verde al retry; nessun rosso.

Run mirati eseguiti prima (tutti `E2E_EXIT=0`):
- `mobile-self-public.spec.ts` + `my-compensation.spec.ts` + `mobile-registries.spec.ts` → **43 passed** (è il run che prova la rimozione dell'esclusione di `mobile-registries.spec.ts:888`);
- blast radius: `my-account` + `account-statement` + `accounts-topups` + `account-adjustments` + `flight-reversal` + `flights` + `people-management` + `pdf-exports` + `ppr-public` + `datetime-picker` + `ppr-queue` + `mobile-expiries-movements` → **104 passed**;
- `mobile-self-public.spec.ts` da solo dopo l'ultima modifica (data della ricarica dal form portata al passato) → **20 passed**.

⚠️ **Non eseguito dal dev**: l'aggiornamento di `sprint-status.yaml` e di `docs/handoffs/HANDOFF.md` (sono del commit `docs(15.9)` di chiusura, sessione principale) e **nessun commit** (istruzione esplicita del dispatch).
