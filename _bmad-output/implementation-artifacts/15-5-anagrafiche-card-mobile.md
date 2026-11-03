---
baseline_commit: 0d82ba2
---

# Story 15.5: Anagrafiche a card — Flotta a griglia 2 colonne con barra ore, Piloti a riga con saldo e flag, e il salva primario in fondo ai due editor multi-form (R-15.2-g)

Status: **review** (implementata 2026-08-03/04 — v. Dev Agent Record in fondo; ratifiche PO R-15.5-a..j chiuse prima del dispatch)

## Ratifiche PO (chiuse 2026-08-03, batch AskUserQuestion in tre giri — la sezione Q1-Q10 in fondo porta fatti, opzioni e motivazioni)

| R | Q | Decisione PO |
|---|---|---|
| R-15.5-a | Q1 | **Perimetro PIENO: tutte e QUATTRO le superfici** (Flotta, Piloti, Istruttori, scheda persona `people/{id}`) — il piano alla lettera, NON la raccomandazione A del teammate. Ogni condizionale "se ⟨Q1⟩ include…" nel testo si legge **INCLUSO**. Conseguenze: AC 11 e 12 aggiunti sotto; la story è grande per scelta deliberata del PO, review dimensionata di conseguenza |
| R-15.5-b | Q2 | Barra ore = **reader batchato nuovo** `sumFlightMinutesByAircraft` sugli id della pagina, finestra = mese corrente, gate `aircraft.manage`, didascalia che dichiara la finestra, normalizzazione sulla pagina corrente esplicitata nel doc-comment |
| R-15.5-c | Q3 | Flag riga pilota = **documento BLOCCANTE** (`blocksBooking = true`): scaduto → chip `--bad`, ≤30g → `--warn`, priorità sospeso > bloccante, l'etichetta NOMINA il documento. Reader batchato, soglie da `tierOf`, funzione pura con unit (AD-6) |
| R-15.5-d | Q4 | Saldo sulla riga: **invariato** (proprietà del gate `people.read`, ADMIN-only), nota nel record — nessun cambio desktop |
| R-15.5-e | Q5 | Tariffa oraria: **resta sulla card** mobile, stessa etichetta e `formatCents` del desktop |
| R-15.5-f | Q6 | R-15.2-g = **`.so-actions` sulla riga identità di entrambi gli editor + su `pilot-editor` NUOVO** (primaria = salva anagrafica, uniforme con `aircraft-editor`). Riserva ACCETTATA e da documentare nel record: in MODIFICA la barra sticky si sgancia oltre la prima sezione. Il TD in sprint-status va chiuso/riscritto con le misure di §a.4 nello stesso commit |
| R-15.5-g | Q7 | Testata mobile = **ricerca full-width in cima alla lista + chip "Archiviati" sulla `.mobile-chip-strip` (stesso stato, nessuna seconda fonte di verità) + CTA "Nuovo…" full-width** (R-15.3-d/f). `ExportMenu` INVARIATO in testata (export mobile = 15.8, R-15.2-c) |
| R-15.5-h | Q8 | Griglia Flotta **dentro la `.card` attuale**, `repeat(2, minmax(0,1fr))` + ellissi sul modello — niente full-bleed |
| R-15.5-i | Q9 | **Sheet di dettaglio CON le azioni ovunque** (grammatica unica R-15.2-b/R-15.3-b/R-15.4-d); card mobile = `<button>` vero. Sotto-decisione: `.ac-card` desktop RESTA `<div onClick>` (difetto a11y pre-esistente) → **TD nuovo** in sprint-status |
| R-15.5-j | Q10 | **Paginazione invariata**, resa in linguaggio mobile (piede della card, bottoni ≥44px, hit-testabili sopra la tab bar) |

## Story

As a amministratore che gestisce l'anagrafica del club dal telefono (hangar, piazzale, ufficio senza scrivania),
I want vedere la flotta come una griglia di card con marche, stato e quanto ha volato ogni velivolo, e i piloti come una lista di righe con saldo e un segnale se qualcosa non va, e poter aprire, cercare e modificare senza scorrere in orizzontale una tabella larga il triplo dello schermo,
so that le due anagrafiche più consultate smettono di essere tabelle desktop rimpicciolite e le loro modifiche si salvano senza cercare il bottone 900px sotto il bordo dello schermo.

E, come debito ratificato che questa story POSSIEDE: **R-15.2-g** — la riga d'azione primaria fissa in basso della modalità a tutto schermo (R3) manca sui due editor multi-form (`pilots/pilot-editor.tsx`, `instructors/instructor-editor.tsx`), rinviata qui dalla review 15.2 F3 perché "decidere quale riga è primaria" è lavoro per-pagina.

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)`), **R2** (il template è incompleto by design: quello che non mostra — la ricerca, il toggle archiviati, l'export, la paginazione, i form — lo progetta il team nello STESSO linguaggio, non lo rimanda), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e **azione primaria fissa in basso** — è esattamente la metà non ancora mantenuta su queste due pagine), **R4** (si porta TUTTO, **filtri e form inclusi**: nessuna superficie resta "tabella desktop scrollabile in orizzontale" come stato finale — ed è lo stato di oggi della lista Piloti, misurato in §a.2), **R5** (logout/lingua già nel menu profilo, 15.1 — non si toccano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (fissata dalla 15.1, in CLAUDE.md e nel doc-comment di `mobile-nav.tsx`): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**. ⚠️ **Questa story è la prima in cui la regola del suffisso, applicata alla lettera, ROMPE la suite**: v. AD-5 (sei helper e2e usano selettori a PREFISSO `[data-testid^="ac-card-"]` / `[data-testid^="pilot-row-"]`).

**Lezioni delle review 15.1/15.2/15.3/15.4 da NON ripetere** (le quattro che questa story può violare davvero):
1. **La guardia va scritta sul lato che la regola ha LIBERATO** (15.2 KPI strip, 15.3 F8, 15.4 iii). Qui il caso concreto è la griglia 2 colonne della Flotta: la guardia non è "la griglia esiste" né "la pagina non va in overflow" — la pagina NON va in overflow nemmeno col difetto, perché `.card{overflow:hidden}` (`airops.css:457`) lo nasconde. V. §a.1, misurato.
2. **Il selettore nuovo deve essere ANCORATO** (15.3 F1: `.home-head-actions .btn` era discendente e sfondava nel piede di uno `SlideOver` a tutto schermo). Entrambe le console di questa story montano `SlideOver` **come fratello della card**: ogni regola nuova usa `>` e va provata che non raggiunge il pannello.
3. **Il gemello va misurato, non dedotto** (review 15.3: `.list-icon.green` a 1.24:1, peggio del difetto trovato). Qui i gemelli sono le classi `.mobile-row*` (15.3/15.4, due consumer già vivi) e `.ac-card`, condivisa fra la console Flotta **e** il widget della Panoramica (`components/dashboard/fleet-card.tsx`).
4. **Un test della catena serializzata gira su DB post-suite** (review 15.4, secondo rosso): le fixture UI devono sopravvivere ai tetti dei picker (100 opzioni) e alle liste paginate a 20 righe. Qui le liste sono paginate a 20 su entrambe le pagine (`fleet/page.tsx:16`, `pilots/page.tsx:15`) e il DB reale ha **>100 velivoli e ~300 persone**: nessuna asserzione può assumere "la mia fixture è a pagina 1".

**Fonte visiva**: template `AirOps Mobile.dc.html` — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/AirOps-Mobile.dc.html` (+ `data.js`). Lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de` (i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezioni in scope:

- **righe 186-204 — `Admin · Aeromobili`**: testata (titolo 23px/600 + sub 12px `{{fleetSub}}` = "N totali · N disponibili · N AOG"), poi una **griglia `1fr 1fr` con `gap:10px` e `padding:0 16px`** — le card stanno DIRETTAMENTE sulla pagina, non dentro una `.card`. Card (righe 194-201): sfondo `{{a.cardBg}}` (`--panel`, oppure `color-mix(in oklch, var(--bad-soft) 55%, var(--panel))` se AOG), bordo `--border`, radius 12px, padding 12, `gap:8`; riga 1 = marche mono 14px/600 `letter-spacing:.03em` + **pallino 8px** di stato (`--bad` AOG / `--info` prenotato / `--ok` disponibile); riga 2 = modello mono 10.5px `--ink-3` **con `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`**; riga 3 = `statusLabel` mono 10px a sinistra + **`€{{a.rate}}/h`** a destra in `--ink`; riga 4 = **barra ore** (traccia `height:4px; background:var(--bg-sunken); border-radius:999px; overflow:hidden`, riempimento `width:{{a.barW}}`, colore `--bad` se AOG altrimenti `--ok`); riga 5 = "ore mese" mono 10px a sinistra + `{{a.hours}}h` a destra in `--ink`.
- **script 640-644 — la meccanica della barra**: `maxH = Math.max(1, ...AIRCRAFT_STATS.map(a => a.hours))`, `barW = Math.round(st.hours/maxH*100) + '%'` ⇒ la barra è **relativa al velivolo che ha volato di più**, non a un massimo assoluto. `hours` viene da `AIRCRAFT_STATS`, cioè le **ore volate nel mese** (v. Q2: in app quel dato esiste solo dentro `getStats`).
- **righe 226-247 — `Admin · Piloti`**: testata + una card unica (`background:var(--panel); border-radius:14px; overflow:hidden`) con righe `grid-template-columns:30px 1fr auto; gap:12px; padding:11px 16px; border-top:1px solid var(--border)`: **avatar rotondo 30px** con iniziali mono 10px/600 su fondo colorato, blocco centrale (nome 13px/600 ellissato + sub mono 10.5px `--ink-3`), colonna destra `flex-direction:column; align-items:flex-end; gap:3px` con **saldo mono 12px/600** (`--bad-ink` se negativo, con il segno "−" tipografico) e, **solo se presente**, un **chip flag** mono 9.5px `border-radius:999px` (`--bad-soft`/`--bad-ink` se "sospeso", `--warn-soft`/`--accent-ink` se "medico Ngg").
- **script 651-655 — la meccanica del flag**: `med = p.medicalExp && dl(p.medicalExp) <= 60`; priorità **sospeso > medico**, un solo flag per riga, nessun flag se entrambi assenti. `sub` = `licenza · ruolo · abilitazioni`.
- **righe 249-268 — `Admin · Istruttori`** (in scope solo se Q1 lo include): stesse righe `30px 1fr auto`, colonna destra = `{{i.hoursMtd}}h` mono 12px/600 + `{{i.owed}} dovuti` mono 10px `--ink-3`.
- **script 594-597 — i row-builder degli sheet**: `openPilot` = badge di stato account + righe `[Licenza, Scad. licenza, Medico, Abilitazioni, Saldo conto, Ultimo volo, Email]`; `openInstr` = badge `€X/h` + righe `[Ore nel mese, Dovuto nel mese, Ore anno, Dovuto anno, Ore totali]`; `openTail` (598-599) = sub `proprietario · carburante`, titolo `marche · modello`, badge di stato, righe `[Stato, Tariffa, Posti, Ore mese, Ricavo mese]`.
- **Il template NON mostra** (⇒ R2, li progetta il team): la **ricerca**, il toggle **archiviati**, l'**export**, la **paginazione**, i **form** di creazione/modifica, le **azioni di riga** (Modifica / Registra acconto / Sospendi), e la nozione di "profili attivi" (mostra un `role` singolo che in questo dominio non esiste — v. il doc-comment di `pilots-console.tsx:9-19`). **Non si portano** (assunzioni accettate del piano): orologio in topbar, "Accedi come".

---

## Ricognizione (2026-08-03, teammate story — verificata su file, righe e **misure a runtime** su build di produzione, DB reale post-suite; il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 14.3/14.4/14.6/14.8/14.9 e in 15.1/15.2/15.3/15.4)

### a) Le superfici reali, misurate a 375×812 (admin, build `npm run start`, DB con 100+ velivoli e ~300 persone)

#### a.1 — Flotta: la griglia c'è già, ma è **a UNA colonna**, e la testata occupa 192px

`src/app/[locale]/dashboard/fleet/` — 3 file:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 228 | server: gate `aircraft.manage` (49-52), `PAGE_SIZE = 20` (16), `Promise.all` di `listAircraft` + `listAircraft(page1,size1)` per il totale + `listOutOfServiceAircraft` (57-61), poi `getEffectiveRates` + `listReservedAircraftIds` **batchati sugli id della PAGINA** (66-69), sub di testata "N totali · N disponibili · N AOG" (103) |
| `fleet-console.tsx` | 213 | client: `.card` + `.card-head` (128-156: toggle archiviati, ricerca 240px, `ExportMenu`, "Nuovo aeromobile"), `FleetCardGrid` (163-169), paginazione (172-196), `AircraftEditor` (199-210) |
| `aircraft-editor.tsx` | 1192 | `SlideOver` composito 14.8 — **già sistemato in 15.2** (`.so-actions` sulla riga identità) |

La griglia vive in `src/components/dashboard/fleet-card.tsx` (**condiviso**: `FleetCardGrid` è usato sia da `fleet-console.tsx:163` sia dal widget `FleetCard` della Panoramica, riga 132-154 — che a ≤640px è già dentro `.home-desktop-surface` e quindi `display:none`, `dashboard/page.tsx:696`).

**Misure a 375px** (`.page` 375 wide, `.card` 319, contenuto 317):

| superficie | valore | nota |
|---|---|---|
| `.fleet-grid` `grid-template-columns` | **`281px`** — UNA colonna | `repeat(auto-fill, minmax(220px,1fr))` (`airops.css:775-779`): a 281px di content box ci sta una sola colonna da 220 |
| `.ac-card` | 281×186 | 20 card ⇒ `.page` alta **4313px** |
| `.card-head` | **192px** di altezza (contro **64px** a 1280px) | quattro controlli che vanno a capo: toggle + ricerca 240px + Esporta + Nuovo aeromobile |
| overflow orizzontale di pagina | **0** | la Flotta non è "rotta": è **lunga e sprecata** (una card da 281px porta 4 righe di testo) |
| `.ac-card` | `tagName === 'DIV'`, **0 figli interattivi** | è un `<div onClick>` (`fleet-card.tsx:80-85`): **non focusabile, non operabile da tastiera**. Difetto a11y PRE-esistente, desktop compreso (v. Q9) |

⚠️ **Trappola misurata sulla griglia 2 colonne — e la guardia che NON la vedrebbe.** Iniettando `grid-template-columns: 1fr 1fr` (la dichiarazione letterale del template) su `.fleet-grid` a 375px, le tracce **non** diventano 135.5px: diventano **`285.281px 275.828px`** (somma 561px + 10 di gap in un content box da 317px), perché `1fr` è `minmax(auto, 1fr)` e il `min-content` di `.ac-model` ("Cessna 172 Skyhawk", che **non ha `text-overflow`**, `airops.css:801`) allarga le tracce. La seconda colonna finisce **ritagliata da `.card{overflow:hidden}`** e `document.documentElement.scrollWidth - clientWidth` resta **0**: una guardia sull'overflow di PAGINA sarebbe **cieca per costruzione**, esattamente la classe 15.2/15.3 F8. Con `repeat(2, minmax(0,1fr))` (idioma già in casa: `.kpi{min-width:0}`, fix 13.10 F1) le tracce misurano **135.5px** a 375px e **108px a 320px** — e a 320px `.ac-model` **clippa di 9px** (misurato), cioè servono le tre dichiarazioni di ellissi che il template ha già sulla sua riga modello.

#### a.2 — Piloti: la tabella è larga **1102px** in 317 visibili

`src/app/[locale]/dashboard/pilots/` — `page.tsx` (149 righe: gate `people.read` 39-42, `PAGE_SIZE = 20`, `listPilotsPageData` 47, sub "N iscritti · N sospesi" 82), `pilots-console.tsx` (544), `pilot-editor.tsx` (1488), `pilot-editor-labels.ts`.

| superficie | clientWidth | scrollWidth | overflow nascosto |
|---|---|---|---|
| `.students` (tabella piloti) | **317px** | **1102px** | **785px** — 7 colonne `minmax(150px,1.4fr) minmax(160px,1.4fr) 100px 110px minmax(160px,1.2fr) 120px minmax(200px,1.3fr)` (`pilots-console.tsx:224`) |
| `.card-head` | — | — | **149px** di altezza a 375px (64px a 1280px) |
| overflow orizzontale di pagina | — | — | **0** (la tabella scrolla per conto proprio dentro `.card`) |

Le 7 colonne desktop sono: nome (`<Link>` a `/dashboard/people/{id}`, `pilot-name-{id}`), email, **saldo** (`formatCents`, rosso se negativo), ultimo volo, **profili attivi** (fino a 3 `Badge`: pilota/allievo/istruttore), **stato utente** (`Badge` attivo/sospeso/senza accesso), **azioni** (Modifica `people.manage`, Registra `finance.manage`, Sospendi/Riattiva `users.manage` **con conferma inline a due bottoni ✓/✕**, `pilots-console.tsx:307-359`).

⇒ **La pagina non è rotta: è illeggibile.** È il caso letterale che R4 vieta come stato finale, identico a quello che la 15.4 ha risolto su `/dashboard/bookings` (§a.1 di quella story).

#### a.3 — Istruttori (in scope solo se Q1 lo include)

`instructors/page.tsx` (234 righe): gate `people.read`, **NON paginata** (`getCompensationSummary`, doc-comment 25-27), `.kpi-row` a 4 KPI (80-85 — già strip a ≤640px dalla 15.2, misurata `scrollW 720 / clientW 375`), `instructors-console.tsx` con `.students` a 5 colonne: misurata **clientW 317 / scrollW 754** (437px nascosti), **28 righe**. Azioni di riga: Modifica (`instructor-edit-{id}`), Paga (`instructor-pay-{id}`, `payouts.manage`); il NOME apre un secondo pannello (`instructor-name-{id}` → `InstructorProfile`, uno `SlideOver` di sola lettura — **è un pannello di DETTAGLIO, non un form**, cioè esattamente ciò che R3 vuole diventi un bottom sheet, come annotato dalla 15.2 §b).

#### a.4 — R-15.2-g: **la ricognizione del TD è imprecisa, misurato** (correzione importante)

Il TD in `sprint-status.yaml` (owner "story 15.5") riporta: *"pilot-editor NUOVO body scrollHeight 1652/728 con il submit 906px sotto il fold, pilot-editor MODIFICA submit a bottom 2269, instructor-editor MODIFICA a 2072 — non hit-testabili senza scorrere"*. Misurato oggi a 375×812 sui pannelli reali:

| pannello | body scrollH/clientH | submit **PRIMARIO** (`.btn.primary` del form d'identità) | altri submit, sotto il fold |
|---|---|---|---|
| `pilot-editor` **NUOVO** (`NewPersonForm`, un solo `<form>`) | 1652 / 728 | `pilot-identity-submit` a **bottom 1718** = **906px sotto il fold** | — (è l'unico) |
| `pilot-editor` **MODIFICA** | 2299 / 716 | `pilot-identity-submit` a **bottom 585** → **già visibile a `scrollTop 0`**, `reachable: true` | `pilot-access-create` a **2269** (sezione Accesso, `.btn.primary`) |
| `instructor-editor` **MODIFICA** | 2248 / 716 | `instructor-identity-submit` a **bottom 577** → **già visibile**, `reachable: true` | `instructor-payout-rate-submit` a **1777** (`.btn`, non primary), `instructor-rates-submit` a **2072** (`.btn`) |
| `aircraft-editor` (riferimento, già sistemato in 15.2) | 1763 / 728 | `identity-submit` a **701**, `hasSoActions: true` | `new-rate-submit` 1291, `hour-meter-submit` 1688 |

⇒ **Il difetto vero e unico sul salva primario è `pilot-editor` NUOVO.** I numeri 2269 e 2072 del TD sono **azioni SECONDARIE di sezione** ("Crea e invia invito", "Aggiungi tariffa"), non il salva primario — e stanno sotto il fold esattamente come stanno sul desktop, dove si raggiungono scorrendo alla propria sezione (identico ad `aircraft-editor`, chiuso in 15.2 con quella stessa asimmetria). Il **salva primario** di entrambi i pannelli in MODIFICA è già sopra il fold perché la sezione identità è la PRIMA del pannello. Q6 decide cosa fare di questa scoperta.

Fatto strutturale che pesa su Q6: **`SlideOver` ha già un prop `footer`** (`ui/slide-over.tsx:23, 51` → `<footer className="so-foot">`), usato da 3 consumer (`transaction-editor`, `instructor-profile`, `flight-editor`), che rende l'azione ancorata **a ogni larghezza** — quindi metterci dentro il salva di questi due pannelli **cambierebbe il desktop** (vietato senza ratifica: è il motivo per cui la 15.2 non l'ha fatto, sua ricognizione §b). La modalità mobile esistente è invece `.so-actions` (`airops.css:1915-1923`, dentro `@media (max-width:640px)` ⇒ **inerte sul desktop**): `position: sticky; bottom: 0` dentro `.so-body`, con `.so-body:has(.so-actions){padding-bottom:0}` (1915) e `.so-actions .btn{flex:1; min-height:44px}` (1923).

#### a.5 — I dati che il template mostra e l'app NON ha (o ha altrove)

| dato del template | fonte reale | verdetto |
|---|---|---|
| card flotta: marche, modello, stato, **tariffa €/h** | `FleetCardItem` (`fleet-card.tsx:20-38`): `registration`, `model`, `status`, `wetRateCents` (da `getEffectiveRates`), `reserved`, `archivedAt` | **c'è già**, ed è già sulla card desktop (`fleet-card.tsx:94-97`) |
| card flotta: **ore mese** + barra relativa | **NON esiste su questa pagina.** L'unico aggregato per-velivolo dell'app è dentro `getStats` (`stats.service.ts:183`, `flight.groupBy({by:['aircraftId'], _sum:{minutes, aircraftAmountCents}})`), gate `finance.manage`, servizio pesante (10+ query, e dalla 15.4 F3 pagina tutta la flotta). `FleetCardItem.hourMeterMinutes` è il **contaore totale**, non le ore del mese | **⟨Q2⟩** — dato mancante, tre vie possibili |
| card flotta: pallino di stato 8px | in app lo stato è un `Badge` con dot (`badgeFor`, `fleet-card.tsx:42-65`, 4 casi: archiviato / AOG / riservato / disponibile) | il `Badge` dice **più** del pallino: si tiene il `Badge` (precedente D5 di 15.2: l'app prevale sul mock) |
| riga pilota: **saldo** | `PilotRow.balanceCents` da `listPilotsPageData` (`people.service.ts:286-327`) — **NON gated su `finance.manage`**: chiunque abbia `people.read` lo vede, e `people.read` è **ADMIN-only** (`rbac.ts:104`) | **c'è già** ⟨Q4⟩ per la conferma esplicita |
| riga pilota: **flag "medico Ngg"** | **NON è sulla pagina.** Ma il dominio HA il campo giusto: `ExpiryType.kind = MEDICAL` (`prisma/schema.prisma:1275-1278, 1311`, story 13.1 R-13.1-a) — **non** serve l'euristica sul nome (`categoryOf`, `lib/expiry-status.ts:106-111`, che è solo il ripiego del registro Scadenze). Manca un reader batchato per-persona: `listPersonExpiries` è per UNA persona (`expiries.service.ts:117`) e `listAllExpiries` (441) è una lista globale paginata gated `expiries.manage` | **⟨Q3⟩** |
| riga pilota: **flag "sospeso"** | `PilotRow.user.isActive === false` → il desktop lo mostra già come colonna "Stato" (`pilots-console.tsx:302-306`) | c'è già |
| riga pilota: avatar iniziali colorato | `components/ui/avatar.tsx` (`Avatar({init, color})`, 4 colori + default, `airops.css:278-290`) — **nessuna funzione di colore-da-nome esiste**: il template usa `avColors[p.id % 5]` | primitiva pronta, la scelta del colore è del dev (deterministica sull'id, mai casuale) |
| riga pilota: `sub` = licenza · ruolo · abilitazioni | **NON c'è**: `PilotRow` porta `profiles` (3 booleani) ed `email`, non il tipo di licenza né le abilitazioni | il `sub` mobile usa quello che c'è (email e/o profili attivi) — nessun dato nuovo dal server |
| riga istruttore: ore mese / dovuto mese | `InstructorRow.totalMinutes` / `owedTotalCents` da `getCompensationSummary` — sono **totali**, non "del mese" | il testo del sub deve dire la verità (precedente R-15.3-a: "In volo ora" → "In corso ora") |

#### a.6 — Le primitive 15.2/15.3/15.4 da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`** (86 righe): `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`. Compone `MobileSheet`; nome accessibile = `` `${sub} — ${title}` `` (riga 61); `onClose` **deve** essere referenzialmente stabile (`useCallback`, contratto documentato a riga 37). Dal fix 15.3 F4 la primitiva garantisce **uno sheet alla volta** (token d'istanza, `mobile-sheet.tsx`).
- **`src/components/ui/mobile-sheet.tsx`**: scrim (`<testId>-scrim`), `Escape` montato solo da aperto, focus al pannello e **ritorno al trigger**, `role="dialog"`, z-index **40**. Senza `aria-modal`/focus-trap (è 15.10).
- **`src/app/[locale]/dashboard/mobile-booking-list.tsx`** (139 righe, 15.3/15.4): lista read-only a card + sheet, `testId`/`rowTestId`/`emptyTestId` **come prop**, `withTimeColumn` per la colonna orari. **NON è riusabile qui senza estenderla** (le righe di questa story hanno un avatar a sinistra e DUE valori impilati a destra, non un `Badge`) — v. AD-4.
- **CSS già pronto** (tutto dentro `@media (max-width:640px)`): `.mobile-card-head/-title/-count/-empty/-foot` (`airops.css:2076-2081`), `.mobile-row` + `.mobile-row-timed` (2083-2106), `.mobile-row-main/-title/-tail/-name/-sub/-chev` (2107-2140), `.mobile-chip-strip` (2233+, 15.4). `.mobile-row` è **UN solo `<button>`** con figli `<span>` (commento 2083-2087): è l'idioma che questa story deve seguire.
- **`.ppr-card*`** (1861-1887) resta la famiglia sorella della coda PPR: la 15.3 ha deciso di **non** generalizzarla (costo non zero). Non riaprire quella decisione.

#### a.7 — `airops.css`: dove va la roba nuova, cosa non toccare

- File di **2326 righe**. Sezioni mobile: shell 15.1 **1666-1801**, primitive 15.2 **1802-1995**, panoramica 15.3 **1996-2192**, pianificazione 15.4 **2194-2326**. Le regole nuove vanno **in coda**, in un blocco proprio `/* ---------- anagrafiche mobile (story 15.5) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** la riga `display:none` fuori-query per ogni albero mobile nuovo (precedenti: `.ppr-queue-mobile` 1822, `.overview-mobile`/`.landing-mobile` 2022-2023, `.schedule-mobile`/`.bookings-mobile` 2223-2225, con la motivazione: senza quella la suite desktop trova due match per ogni testo in pagina).
- **Mappa z-index in uso** (non introdurre valori nuovi senza una misura che li motivi): `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · popover/typeahead 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (a ≤640px sollevato, riga 1687).
- **Classi condivise da NON usare come aggancio dello switch**: `.card`, `.card-head`, `.students`/`.student-row` (13 console), `.fleet-grid`/`.ac-card` (**condivise fra la console Flotta e il widget della Panoramica**), `.list`. Lo switch va su **classi di pagina proprie** (precedenti 15.2/15.3/15.4).
- **Riuso invece di colori nuovi**: stato = `Badge` (`ui/badge.tsx`, toni `'' | ok | warn | bad | info`); azioni = `.btn.primary` / `.btn.mini.ok` / `.btn.mini.bad` (1151-1162, override dark 13.9); la traccia della barra ore è **`--bg-sunken`** e il riempimento `--ok`/`--bad`, come il template — ma **il contrasto di un oggetto grafico va MISURATO** (canvas→WCAG ≥3:1) nei due temi, non scelto a occhio (13.9 ha trovato 5 cause radice token-level; la 15.4 ha trovato un pallino ambra su ambra a **1.76:1**).
- `.page` = `padding: 22px 28px 60px` (293-299) — è l'aritmetica su cui poggia il full-bleed della KPI strip (`margin-inline:-28px`) ed è **asserita** da `mobile-primitives.spec.ts:188`. Qualunque full-bleed nuovo usa lo stesso numero e lo dichiara.

### b) e2e e unit — il campo minato preciso

**Spec che vivono su queste pagine** (righe verificate):

| file | righe | cosa fa | rischio per questa story |
|---|---|---|---|
| `e2e/aircraft-management.spec.ts` | 243, 8 test | CRUD velivolo; **helper riga 46: `page.locator('[data-testid^="ac-card-"]').filter({hasText: registration})`** | ⚠️ **selettore a PREFISSO**: un testid mobile `ac-card-{id}-mobile` gli darebbe **2 match** e lo romperebbe in strict mode **a qualsiasi viewport**. V. AD-5 |
| `e2e/aircraft-rates.spec.ts` | 247, 6 test | tariffe; stesso helper a **riga 39** | idem |
| `e2e/aircraft-status-hours.spec.ts` | 159, 4 test | AOG + contaore; stesso helper a **riga 39** | idem |
| `e2e/flights.spec.ts` / `e2e/flight-reversal.spec.ts` | 269 / 207, 249 | `page.getByTestId(\`ac-card-${aircraft.id}\`)` — **match ESATTO** | sicuri per costruzione (nessun prefisso) |
| `e2e/people-management.spec.ts` | 493, 13 test | CRUD persona, ricerca, profili, accesso; **helper riga 46: `[data-testid^="pilot-row-"]`**; `pilots-search` (84), `pilot-name-{id}` (212), `pilots-new-button` (52/294/441/466), `instructor-edit-{id}` (418) | ⚠️ stesso prefisso; e a **riga 352** `page.getByText('Gestisci in Scadenze')` page-level |
| `e2e/person-profiles.spec.ts` | 150, 5 test | stesso helper a **riga 34** | idem |
| `e2e/user-management.spec.ts` | 253, 7 test | stesso helper a **riga 94** | idem |
| `e2e/person-detail.spec.ts` | 219, 6 test | scheda persona; `page.getByRole('heading', …)` (61-68), **`page.getByText(updatedPhone)` page-level (217)** | un albero mobile sulla scheda persona darebbe 2 match a 1280px (⟨Q1⟩) |
| `e2e/instructor-compensation.spec.ts` | 255, 6 test | `instructor-row-{id}` / `instructor-edit-{id}` **esatti** (134-222) | sicuri; ma la riga mobile non deve riusare quei nomi |
| `e2e/instructor-rates.spec.ts` | 149 | `instructor-edit-{personId}` (69) | idem |
| `e2e/home-dashboard.spec.ts` | 147 | `fleet-card-widget` `toBeVisible()` a 1280px | il widget rende `FleetCardGrid`: un albero mobile dentro quel componente comparirebbe **anche sulla home** |
| `e2e/mobile-overview.spec.ts` | 39-51, 209, 224 | lista `DESKTOP_TESTIDS` (contiene `fleet-card-widget`) asserita **= 1 nodo** a 375 **e** 1280; `fleet-card-widget` `toBeHidden()` a 375 | ogni testid nuovo che finisca dentro il widget lo rompe |
| `e2e/expiry-registration.spec.ts` | 232 | passa da Piloti per registrare scadenze | rotto solo da testid duplicati |
| `e2e/billing.spec.ts`, `e2e/reports.spec.ts`, `e2e/my-compensation.spec.ts` | varie | citano `pilot-`/`instructor-` ma su altre pagine | nessuno se lo switch è su classi di pagina |

**Tutta la suite gira a viewport desktop** (`sharedUse` estende `devices['Desktop Chrome']` = 1280×720, `playwright.config.ts:13-19`) tranne gli spec mobile dedicati: un albero mobile `display:none` non la tocca — **ma un testid duplicato la rompe a qualsiasi viewport**.

**Stato globale**: questa story **non** scrive `AppSettings` ⇒ nessuno spec nuovo entra nella catena serializzata di `playwright.config.ts`. ⚠️ Ma **crea/archivia velivoli e persone**, cioè alimenta i due tetti già tracciati come TD (`OPTIONS_PAGE_SIZE = 100` dei picker; liste a 20 righe/pagina): ogni asserzione deve leggere il dato da un percorso deterministico (ricerca per targa/cognome run-unique, oppure API filtrata), **mai** "la mia fixture è nella prima pagina".

**Unit**: nessun test copre oggi queste `page.tsx`. Ogni derivazione pura nuova (composizione delle righe/card, calcolo della larghezza della barra, scelta del flag e della sua priorità) va in `src/lib/` con il suo `*.test.ts` — per costruzione non importa servizi, quindi non trascina `@/lib/env` (lezione a 3 occorrenze in CLAUDE.md). Verifica comunque: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`. Precedenti diretti: `src/lib/booking-day-phase.ts`, `src/lib/mobile-agenda.ts`, `src/lib/overview-alerts.ts`.
Se ⟨Q2⟩/⟨Q3⟩ introducono un reader nuovo in un service, quello ha i suoi unit con mock Prisma (precedente: `stats.service` dopo il fix 15.4 F3).

### c) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (`messages/it.json` + `messages/en.json`); segnaposto riempiti lato client → **`t.raw`**; suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground; build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** negli e2e per chiudere un popup dentro uno `SlideOver`; MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe; prima di attribuire un fallimento e2e al lock anti-brute-force TD-6, contare i `LoginAttempt` **falliti** (`login-throttle.ts:25`).

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — Gli alberi mobile vivono DENTRO `fleet-console.tsx` e `pilots-console.tsx`** (e `instructors-console.tsx` se ⟨Q1⟩ lo include), **non in componenti di pagina paralleli.** Motivo dirimente, identico ad AD-1 della 15.4: quelle console possiedono lo **stato** che le superfici mobile devono condividere — la ricerca con debounce, il toggle archiviati, il target dell'editor, il target dell'acconto, la conferma di sospensione, e i tre/quattro `SlideOver`. Un componente parallelo o duplica quello stato o duplica la rete.

**AD-2 — `FleetCardGrid` è CONDIVISO col widget della Panoramica: l'albero mobile NON va dentro quel componente.** `components/dashboard/fleet-card.tsx` è renderizzato sia da `fleet-console.tsx:163` sia da `FleetCard` (widget home, riga 150). Un albero mobile aggiunto lì comparirebbe **anche sulla home** (dove è invisibile perché dentro `.home-desktop-surface`, ma i suoi testid esisterebbero nel DOM e `mobile-overview.spec.ts:39-51` asserisce l'unicità di 10 testid **a 375 e a 1280**). La griglia mobile della Flotta è quindi resa da `fleet-console.tsx` come **fratello** di `FleetCardGrid`, non come sua variante. Se il dev conclude che l'estensione di `FleetCardGrid` è preferibile, deve **misurare** che il widget della home non guadagna alcun nodo e dirlo nel record.

**AD-3 — Si sostituisce il CORPO, non la card: la testata resta un solo nodo.** A ≤640px vanno a `display:none` **solo** `.fleet-grid` e `.students` (tramite classi di pagina proprie messe su quei nodi — mai `.students`, condivisa da 13 console). Resta viva e unica la `.card-head` con i suoi controlli (`fleet-search`/`fleet-toggle-archived`/`ExportMenu`/`fleet-new-button`; `pilots-search`/`pilots-toggle-archived`/`ExportMenu`/`pilots-new-button`) — la sua resa mobile è ⟨Q7⟩, ma i **testid e la logica restano quelli**, mai duplicati. Stesso principio di AD-2 della 15.4 (che ha tenuto verde `bookings.spec.ts:813-846` senza modifiche) e AD-3 della 15.3.

**AD-4 — `MobileBookingList` si estende SOLO se è a costo zero per i suoi tre consumer.** Le righe di questa story hanno un **avatar 30px** a sinistra e **due valori impilati** a destra (saldo + flag), dove quel componente ha `Badge`. Regola (la stessa applicata a `.ppr-card*` in 15.3 e a `MobileBookingList` in 15.4): si estende **solo** se bastano ≤2 prop opzionali **e** il diff dei computed style delle tre liste esistenti (home admin, home pilota, home istruttore) a 375px pre/post è **vuoto** (misurato, non dedotto); altrimenti nasce un componente sorello che riusa le **stesse classi** `.mobile-row*`, e la duplicazione va dichiarata nel record col motivo.

**AD-5 — I testid mobile di questa story NON possono usare il suffisso `-mobile` sulle righe/card.** Fatto misurato (§b): **sei** helper e2e usano selettori a **prefisso** — `[data-testid^="ac-card-"]` (`aircraft-management:46`, `aircraft-rates:39`, `aircraft-status-hours:39`) e `[data-testid^="pilot-row-"]` (`people-management:46`, `person-profiles:34`, `user-management:94`). Un `ac-card-{id}-mobile` / `pilot-row-{id}-mobile` darebbe a ognuno **2 match** e romperebbe 18+ test in strict mode a viewport desktop. Due vie, e si sceglie la prima:
  - **(scelta) nomi solo-mobile con prefisso `mobile-`**: `mobile-fleet-card-{id}`, `mobile-pilot-row-{id}`, `mobile-instructor-row-{id}` — nessuna collisione possibile, zero modifiche agli spec esistenti. **Precedente esatto e già ratificato in review**: la 15.3 ha usato `mobile-overview-pending-row` invece di `booking-row-mobile` proprio per non creare un doppione, e la review l'ha giudicata "REGGE".
  - (scartata) scopare i sei helper all'albero desktop: tocca 6 file di test per una comodità di naming, e lascia il fucile carico per il prossimo `^=`.
  Il dev **deve** aggiungere una riga alla sezione convenzioni e2e di CLAUDE.md nello stesso commit: *"il suffisso `-mobile` è illegale dove un selettore `^=` esiste; in quel caso si usa un nome `mobile-`"*.

**AD-6 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test.** Valgono per: la scelta e la priorità del flag di riga (⟨Q3⟩: sospeso > medico > nessuno, e i confini "scaduto/entro N giorni"), il calcolo della larghezza della barra ore (⟨Q2⟩: `max` della pagina, divisione per zero quando nessuno ha volato, arrotondamento), e la composizione delle righe di dettaglio dello sheet. Motivo: sono l'unica parte che un e2e non può provare in modo discriminante sui casi di confine (nessun velivolo ha volato; un solo velivolo; flag assente/presente/entrambi), e la lezione 15.2 dice che una regola senza guardia è una regola che può sparire. Restano pure ⇒ niente `@/lib/env`.

**AD-7 — Un solo sheet aperto, un solo nodo per testid di sheet.** Le pagine in scope hanno più proprietari di pannello (editor, acconto, profilo istruttore, ciclo di pagamento). Ogni `BottomSheet` va reso condizionalmente (`{openRow ? <BottomSheet …/> : null}`, idioma di `mobile-booking-list.tsx:120`), così il testid resta un solo nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). **Va asserito**, non assunto.

**AD-8 — `AircraftEditor` non si tocca** (l'ha già sistemato il fix 15.2 F3: `.so-actions` sulla riga identità, desktop rimisurato invariato a 1280/800/641). Se ⟨Q6⟩ sceglie un meccanismo diverso da `.so-actions`, la coerenza fra i tre editor va **dichiarata e motivata**, non lasciata implicita.

---

## Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno riletti dopo le risposte del PO. Ogni misura si intende a **375×812** e ripetuta a **390×844** e a **320×568** (la larghezza dove la griglia 2 colonne è al limite, misurata in §a.1), tema **chiaro e scuro**.

1. **(Flotta a card, 2 colonne — template 191-201) ⟨Q2⟩⟨Q8⟩⟨Q9⟩** A ≤640px `.fleet-grid` desktop è `display:none` **misurato** e al suo posto c'è una griglia di card a **due colonne uguali**, ognuna con: marche mono 14px/600, indicatore di stato (il `Badge` dell'app, `badgeFor`), modello mono ellissato, stato + tariffa oraria sulla stessa riga, **barra ore ⟨Q2⟩** e la sua didascalia. Ogni card è **UN solo `<button>`** (figli `<span>`, zero elementi interattivi annidati, `min-height` ≥44px, nome accessibile parlante che contiene le marche). Il fondo AOG resta quello dell'app (`.ac-card.aog`, `airops.css:791`), non il `color-mix` del template. **Verifica misurata**: le due tracce della griglia sono **uguali** e la loro somma + gap **≤ larghezza del contenitore** (è il lato che la regola LIBERA — con `1fr 1fr` misurano `285.28px + 275.83px = 561px` in un box da 317, e la pagina NON va in overflow perché `.card{overflow:hidden}` lo nasconde: la guardia va scritta **sulle tracce**, non sull'overflow di pagina); a **320px** nessun testo della card è clippato (`scrollWidth <= clientWidth` su `.ac-model`, marche e riga tariffa — misurato pre-fix: modello clippato di **9px**); zero `button`/`<a>` dentro `<button>` nell'albero mobile.

2. **(Piloti a riga — template 232-244) ⟨Q3⟩⟨Q4⟩** A ≤640px `.students` della console Piloti è `display:none` **misurato** e ogni pilota è una riga `30px 1fr auto` in una card unica: `Avatar` con le iniziali (colore deterministico sull'id, mai casuale), nome + sub, e a destra **saldo** (mono, 600, colore `--bad` se negativo — stesso `formatCents` e stessa soglia del desktop, `pilots-console.tsx:293-295`) e, sotto, il **flag ⟨Q3⟩** quando c'è. La riga è **UN solo `<button>`**, `min-height` ≥44px, nome accessibile parlante (cognome+nome). Nessuna informazione della riga desktop va persa: quello che la riga non mostra (email, ultimo volo, profili attivi, stato utente) è **nello sheet** (AC 4). **Verifica**: e2e con una persona di fixture run-unique **raggiunta tramite la ricerca** (mai "è nella prima pagina"); ispezione DOM: zero elementi interattivi annidati; misura del target ≥44px.

3. **(Testata, ricerca, archiviati, export, paginazione — R2/R4) ⟨Q7⟩** Secondo ⟨Q7⟩. In ogni caso: la `.card-head` resta **un solo nodo** con i suoi testid attuali (AD-3), nessun controllo scompare a ≤640px (R4), ogni controllo ha `min-height` ≥44px e **nessuno finisce sotto la tab bar** (AC 8), e il sub della testata continua a dire il vero (Flotta: "N totali · N disponibili · N AOG", `fleet/page.tsx:103`; Piloti: "N iscritti · N sospesi", `pilots/page.tsx:82`). **Verifica misurata**: altezza della testata a 375px **pre/post** (pre-fix misurato: **192px** Flotta, **149px** Piloti, contro 64px a 1280px), e la paginazione resta operabile (`fleet-page-prev/next`, `pilots-page-prev/next`, ≥44px, hit-testabili).

4. **(Dettaglio in bottom sheet — R3) ⟨Q9⟩** Il tap su una card/riga apre il `BottomSheet` della 15.2 con `sub`/`title`/`badge`/`rows[]` modellati sui row-builder del template (594/598) e **parità informativa verso il desktop**: la card flotta mostra almeno Stato (col motivo dell'AOG se c'è), Tariffa, Posti, Carburante, Contaore, Note; la riga pilota mostra almeno Email, Telefono, Saldo, Ultimo volo, Profili attivi, Stato accesso. Le **azioni** ammesse dallo stesso gate del desktop (`people.manage` → Modifica, `finance.manage` → Registra acconto, `users.manage` → Sospendi/Riattiva con la **conferma in due passi** come `secondStep`, `aircraft.manage` → Modifica velivolo) vivono **solo nello sheet** (grammatica unica dell'epic: R-15.2-b, confermata da R-15.3-b e R-15.4-d). "Modifica" **chiude prima lo sheet** e apre il pannello a tutto schermo (R-15.4-d: niente pannello z50 impilato su sheet z40). **Verifica**: apertura **da tastiera** (Tab reali + Enter, mai `focus()`); il nome accessibile del dialog non è malformato (lezione 15.2 F6: nessun `—` doppio); `mobile-*-sheet` = **un solo nodo** (AD-7); sospensione: conferma vuota impossibile, esito riletto **dall'API**, mai dal conteggio di una lista.

5. **(R-15.2-g — salva primario in fondo ai due editor multi-form) ⟨Q6⟩** Secondo ⟨Q6⟩, e in ogni caso: (a) `pilot-editor` in modalità **NUOVO** ha la sua azione primaria **hit-testabile senza scorrere** con il corpo in cima (`elementFromPoint` sul centro del bottone, `.so-body.scrollTop === 0`) — pre-fix misurato: `bottom 1718` in un viewport 812, cioè **906px sotto il fold**; (b) **una sola** barra/azione ancorata per pannello (mai due impilate — è il motivo per cui la 15.2 ha rinviato); (c) i submit **secondari** di sezione (`pilot-access-create` 2269, `instructor-payout-rate-submit` 1777, `instructor-rates-submit` 2072) restano dove sono e restano raggiungibili scorrendo alla propria sezione, come sul desktop e come in `aircraft-editor`; (d) **desktop invariato**: misura pre/post a 1280/800/641px di `position`, `border-top`, background, `padding-bottom` di `.so-body`, altezza dei bottoni e larghezza del pannello (i cinque campi che il fix 15.2 F3 ha già usato). **Verifica**: la guardia è "il submit è hit-testabile a `scrollTop 0` **su un viewport dove il corpo scorre davvero**" (lezione 15.4 iv), provata **rossa** rimuovendo la regola a runtime.

6. **(Convenzione testid — nessun duplicato, AD-5)** Desktop **invariati**: `ac-card-{id}`, `fleet-search`, `fleet-toggle-archived`, `fleet-new-button`, `fleet-empty`, `fleet-page-prev/next`, `fleet-pagination-status`, `fleet-card-widget`, `identity-form`, `identity-submit`; `pilot-row-{id}`, `pilot-name-{id}`, `pilot-edit-{id}`, `pilot-topup-{id}`, `pilot-suspend-toggle-{id}`, `pilot-suspend-confirm-{id}`, `pilot-reactivate-toggle-{id}`, `pilots-search`, `pilots-toggle-archived`, `pilots-new-button`, `pilots-empty`, `pilots-page-prev/next`, `pilots-pagination-status`, `pilot-identity-form`, `pilot-identity-submit`, `pilot-access-create`, `pilot-archive-toggle`, `pilot-archive-confirm`, `topup-form`, `topup-submit`; (se ⟨Q1⟩ include Istruttori) `instructor-row-{id}`, `instructor-name-{id}`, `instructor-edit-{id}`, `instructor-pay-{id}`, `instructors-search`?/`instructors-new-button`, `instructors-empty`, `instructor-identity-form`, `instructor-identity-submit`, `instructor-payout-rate-submit`, `instructor-rates-submit`. Le superfici mobile usano **nomi nuovi col prefisso `mobile-`** (AD-5): `mobile-fleet-grid`, `mobile-fleet-card-{id}`, `mobile-fleet-empty`, `mobile-fleet-sheet`, `mobile-pilots-list`, `mobile-pilot-row-{id}`, `mobile-pilots-empty`, `mobile-pilot-sheet`, e i controlli **dentro** lo sheet che duplicano un'azione desktop prendono il suffisso (`pilot-edit-mobile`, `pilot-topup-mobile`, `pilot-suspend-toggle-mobile`, `pilot-suspend-confirm-mobile`, `aircraft-edit-mobile`) — **purché quel nome non sia il prefisso di nessun selettore `^=`** (verifica obbligatoria: `grep -rn 'data-testid\^=' e2e/`). **Verifica**: un `page.getByTestId(id)` per **ciascuno** dei testid desktop elencati restituisce **esattamente 1** nodo a 375px **e** a 1280px, su `/dashboard/fleet`, `/dashboard/pilots` **e** su `/dashboard` (dove `FleetCardGrid` è embeddato); i sei helper `^=` restituiscono **1 match** per fixture; suite completa verde in strict mode.

7. **(Form a tutto schermo — R3, parità di comportamento)** A ≤640px i pannelli di queste pagine restano a tutto schermo (già 15.2: rect del pannello == rect del viewport ±1px, header fisso) e **tutti** i comportamenti esistenti restano identici: validazione per-campo Zod + `parseApiError` (14.2), 409 `CONFLICT` distinto dal generico, il **form unico di creazione persona 13.2** (profili + scadenze + accesso in un solo POST), il composito velivolo 14.8, l'`Idempotency-Key` di acconto/payout, il reset su ogni via di chiusura. I popover dei picker (z 65/66) restano **sopra** il pannello e **sopra** l'eventuale barra sticky, interamente dentro il viewport. **Verifica**: e2e a 375px del percorso "crea persona con profilo pilota + scadenza" e "modifica velivolo"; apertura di un `DateInput` dentro il pannello con il bottone di conferma hit-testabile (**mai `Escape`** per chiuderlo — chiude tutto il pannello, review 14.3 F1).

8. **(Geometria e layering, con la tab bar della 15.1 presente)** A 375, 390 e 320px, su `/dashboard/fleet` e `/dashboard/pilots` (+ `/dashboard/instructors` se ⟨Q1⟩): **nessun overflow orizzontale di pagina**; **nessun contenitore interno con scroll orizzontale nascosto** (l'asserzione più forte, e quella che coglie il difetto di §a.1: per ogni discendente di `.page`, `scrollWidth <= clientWidth + 1`, con l'elenco delle eccezioni dichiarate — la KPI strip 15.2 e la chip strip 15.4 sono scrollabili **per progetto**); nessun controllo finisce sotto la tab bar (z 5) — hit-test `elementFromPoint` su **ogni** `.page a, .page button` visibile a fondo pagina, con il metodo di `mobile-shell.spec.ts:174-205` (che però gira sulla **home**: queste pagine non sono coperte, il test va scritto qui); lo sheet (z 40) copre la tab bar con lo scrim; il pannello del form (z 50) la copre del tutto; i toast (200) sopra tutto. **Verifica**: valori riportati nel record per ciascuna coppia, non giudizi visivi (lezioni 13.7/13.10/15.1).

9. **(Ogni regola nuova ha la sua guardia, provata discriminante — 15.1 F2/F3, 15.2 guardia cieca, 15.3 F8, 15.4 iii)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` degli alberi desktop (`.fleet-grid`, `.students`) a ≤640px; (ii) `display:none` degli alberi mobile >640px; (iii) **le due tracce della griglia sono uguali e stanno nel contenitore** — il lato liberato, NON l'overflow di pagina (che resta 0 anche col difetto); (iv) nessun clipping di testo nella card a 320px; (v) la barra ore ⟨Q2⟩: larghezza proporzionale corretta e caso "nessuno ha volato" (unit, l'e2e non può fabbricarlo); (vi) il flag ⟨Q3⟩: presente/assente/priorità (unit) + un caso reale in e2e; (vii) `.so-actions`/⟨Q6⟩: submit hit-testabile con il corpo in cima su un viewport dove il corpo scorre; (viii) empty state di ogni lista = **un solo** nodo (`toHaveCount(1)`, non `toBeVisible()`); (ix) il selettore delle regole nuove **non raggiunge** il piede/i bottoni del `SlideOver` (lezione 15.3 F1: misurare la larghezza dei bottoni del pannello pre/post). Ognuna va **provata discriminante** simulando il pre-fix col repo **intatto** (iniezione CSS / `addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2): il test deve diventare **rosso**. Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

10. **(Invarianti)** Desktop >640px **invariato** su **tutte** le pagine che rendono i componenti toccati (`/dashboard/fleet`, `/dashboard/pilots`, `/dashboard/instructors` se in scope, **e `/dashboard`** per `FleetCardGrid` — lezione 15.3 claim 3: "desktop invariato" ≠ "nient'altro è cambiato"): misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) su geometria di `.page`, `.page-head`, `.card`, `.card-head`, `.fleet-grid` e ogni `.ac-card`, `.students`, e sul pannello `SlideOver` aperto (larghezza, `position` della riga d'azione, `padding-bottom` del body, altezza dei bottoni). `npm run gates` verde; **nessuna dipendenza nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (canvas→WCAG) ≥4.5:1 (testo) / ≥3:1 (oggetti grafici: **barra ore**, pallino, chip del flag, avatar) in tema chiaro **e** scuro — enumerando **tutti** gli esemplari, non fidandosi dell'elenco (lezione 15.3: il gemello verde stava peggio del rosso trovato); gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

11. **(Istruttori a riga — R-15.5-a, aggiunto in ratifica)** A ≤640px la `.students` di `instructors-console.tsx` (misurata 317/754, 437px nascosti) è `display:none` e ogni istruttore è una riga della stessa famiglia di AC 2 (`30px 1fr auto`): `Avatar` iniziali, nome + sub, e a destra **ore e dovuto** del periodo (gli stessi campi di `getCompensationSummary` che la tabella desktop mostra — è il contenuto che il piano assegna alla lista: "ore/dovuto"). La riga è **UN solo `<button>`** ≥44px; tap → sheet della grammatica R-15.5-i con parità informativa verso le 5 colonne desktop e le azioni con gli stessi gate (`instructor-edit-*` → pannello, `instructor-pay-*` → `payouts.manage`; il dettaglio che il desktop apre da `instructor-name-{id}` — l'`InstructorProfile`, uno SlideOver di sola lettura — su mobile è assorbito dallo sheet, che è esattamente la forma che R3 prescrive per un dettaglio-riga). La pagina NON è paginata (28 righe oggi): nessun piede di paginazione da inventare; la KPI row resta la strip 15.2. Testid: `mobile-instructor-row-{id}`, `mobile-instructors-list`, `mobile-instructor-sheet` (AD-5 — MAI il suffisso su `instructor-row-{id}`: helper esatti in `instructor-compensation.spec.ts:134-222`). Geometria/invarianti/guardie come AC 8/9/10, con `/dashboard/instructors` aggiunta a ogni matrice di misura.

12. **(Scheda persona `people/{id}` in linguaggio mobile — R-15.5-a, aggiunto in ratifica)** A ≤640px il dossier (6 card) si impila a **colonna singola senza overflow orizzontale di pagina né scroll interni nascosti** (stessa asserzione di AC 8), con le tabelle interne portate al linguaggio dell'epic (righe/card, non tabelle rimpicciolite) **eccetto l'estratto conto**: il componente condiviso `account-section.tsx` porta il **TD 14.6 F4** (non responsive sotto ~700px), che resta APERTO per dichiarazione esplicita di questa story — il suo stato a 375px va **misurato e documentato nel record** (non "sistemato di sfuggita": è un componente condiviso con blast radius proprio). Vincolo di attori (lezione 15.1 F1): la pagina è raggiungibile da **ogni ruolo** sul proprio record (`self.read` + `actor.personId === id`, `people/[id]/page.tsx:83-87`) ⇒ verifica multi-attore obbligatoria (admin su record altrui; pilota/istruttore/allievo sul proprio) a 375 e 1280px, con il masking esistente intatto. Blast radius specifico: `person-detail.spec.ts:61-68/217` usa heading e `getByText` page-level — nessun doppione mobile di quei testi (AD-5 vale anche per il contenuto: un secondo nodo col telefono aggiornato rompe il `toHaveCount`/strict mode a 1280px).

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):
1. **I sei helper a prefisso** — `aircraft-management:46`, `aircraft-rates:39`, `aircraft-status-hours:39`, `people-management:46`, `person-profiles:34`, `user-management:94`. È **la causa di rottura n.1** di questa story e la ragione di AD-5. Vanno rieseguiti tutti e sei i file (18+ test) e il record deve riportare il conteggio di match di ciascun helper con una fixture presente.
2. `e2e/mobile-overview.spec.ts:39-51/209/224` — la lista `DESKTOP_TESTIDS` include `fleet-card-widget`, asserita **= 1 nodo** a 375 **e** 1280: qualunque testid nuovo dentro `FleetCardGrid` la rompe (AD-2).
3. `e2e/home-dashboard.spec.ts:147` — `fleet-card-widget` visibile a 1280px.
4. `e2e/people-management.spec.ts:352` — `page.getByText('Gestisci in Scadenze')` page-level `toHaveCount(0)`: un doppione mobile lo rompe.
5. `e2e/person-detail.spec.ts:61-68/217` — heading e `page.getByText(updatedPhone)` page-level, se ⟨Q1⟩ include la scheda persona.
6. `e2e/instructor-compensation.spec.ts:134-222` e `e2e/instructor-rates.spec.ts:69` — testid esatti `instructor-row-{id}`/`instructor-edit-{id}`, se ⟨Q1⟩ include Istruttori.
7. `e2e/expiry-registration.spec.ts`, `e2e/flights.spec.ts:269`, `e2e/flight-reversal.spec.ts:207/249`, `e2e/billing.spec.ts` — passano da queste pagine o cliccano `ac-card-{id}` esatti.
8. `e2e/mobile-shell.spec.ts` — non atterra su queste pagine: la copertura di geometria del fondo va **scritta qui** (AC 8), non ereditata.

**Unit**: nessuno copre oggi queste pagine. I nuovi sono quelli di AD-6 (+ del reader se ⟨Q2⟩/⟨Q3⟩ ne introducono uno).

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):
- il **tablet 641-900px**: nessuna regola di questa story deve toccarlo (R1) — misurare a 800 e 641px che nulla di nuovo compaia e che il rail resti 64px;
- il **tema scuro** delle superfici nuove — la **barra ore** e il chip del flag sono oggetti grafici su `--panel`/`--bg-sunken`: la 15.4 ha trovato un pallino a **1.76:1** e la 15.3 un glifo a **1.24:1**, entrambi su superfici "ovvie";
- la **Panoramica** a ogni larghezza (`FleetCardGrid` è embeddato lì);
- la **scheda persona** `people/{id}`, se ⟨Q1⟩ la include: è raggiungibile da **ogni ruolo** per il proprio record (`self.read` + `actor.personId === id`, `people/[id]/page.tsx:83-87`) ⇒ verifica multi-attore obbligatoria (lezione 15.1 F1), e porta il **TD 14.6 F4** (estratto conto non responsive sotto ~700px) come nodo aperto.

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-registries.spec.ts`**, project `chromium` `fullyParallel` (non scrive `AppSettings` ⇒ **non** entra nella catena serializzata), `setViewportSize` **dentro il test** (pattern 13.10; nessun project Playwright duplicato — decisione di epic, riesame in 15.10). Copre: griglia 2 colonne e non-clipping, lista piloti a riga, sheet di dettaglio e azioni, testata/ricerca ⟨Q7⟩, geometria/layering, form a tutto schermo, R-15.2-g.
- **Modifiche a spec esistenti**: **nessuna prevista** se AD-5 è rispettata. Se il dev ne modifica una, va motivata nel record e non deve ridurre la copertura (lezione 14.6).
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-6 (+ nel service se ⟨Q2⟩/⟨Q3⟩ ne introducono uno, con mock Prisma paginante — precedente `stats.service` post-15.4 F3), verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**
- Ogni test crea le **proprie** fixture (velivolo con targa run-unique, persona con cognome run-unique) e le raggiunge **tramite la ricerca della pagina** o via API filtrata — **mai** assumendo pagina 1 di una lista da 20 righe su un DB con 100+ velivoli e ~300 persone (classe C della 15.3, secondo rosso della 15.4).
- Le fixture create in questa story **alimentano** i due TD aperti (`OPTIONS_PAGE_SIZE = 100` dei picker; volume delle liste): il dev deve dire quante ne crea per run.
- Attori: entrambe le pagine sono **ADMIN-only** (`aircraft.manage`/`people.read` sono in `ALL_PERMISSIONS`, cioè solo `ADMIN`, `rbac.ts:101-106`) ⇒ la verifica multi-attore qui **non** è sulla pagina ma su (a) le azioni gated da permessi diversi (`people.manage`/`finance.manage`/`users.manage`/`payouts.manage`) e (b) la scheda persona, se ⟨Q1⟩ la include, che è raggiungibile da **tutti** i ruoli per il proprio record. Un attore non-admin deve essere **rediretto** da `/dashboard/fleet` e `/dashboard/pilots` anche a 375px (asserito, non assunto).

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)
- Griglia 2 colonne: **non** "la griglia esiste", **non** "la pagina non va in overflow" (resta 0 anche col difetto). L'asserzione è **le due tracce sono uguali e la loro somma + gap ≤ contenitore**, più **nessun testo clippato a 320px**. Discriminanza: iniettando `1fr 1fr` il test deve diventare rosso (`285.28 / 275.83`, misurato).
- Sostituzione degli alberi: asserire **entrambi** i lati (desktop `none` + mobile visibile a 375px; l'inverso a 1280px). Un solo lato lascia passare "ho nascosto tutto".
- Barra `.so-actions`/⟨Q6⟩: **non** "il bottone esiste" — è "il submit è hit-testabile col corpo in cima **su un viewport dove il corpo scorre davvero**" (lezione 15.4 iv).
- Ordine delle superfici mobile: asserzione d'**ordine intero**, mai a prefisso (lezione 15.3 F8).
- Selettori nuovi: misurare la larghezza dei bottoni del pannello `SlideOver` pre/post (lezione 15.3 F1).
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). Se il dev non la completa, la **review la riesegue da arbitro** (prassi 13.9/13.11/15.2/15.3/15.4).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index, F1-F4), `15-2-primitive-mobile.md` (API delle primitive, R-15.2-a..g — **incluso il TD che questa story chiude** —, guardia cieca, prova per rebuild), `15-3-panoramica-mobile.md` + `15-3-review-report.md` (guardie non cieche, selettore discendente, il gemello va misurato), `15-4-pianificazione-mobile.md` + `15-4-review-report.md` (fixture indipendenti dall'ora, tetti dei picker sulla catena serializzata, guardia sul lato liberato).
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/mobile-booking-list.tsx`, `src/app/[locale]/dashboard/mobile-pending-bookings.tsx`, `src/app/[locale]/dashboard/ppr/ppr-console.tsx`, `src/app/[locale]/dashboard/bookings/bookings-table.tsx` (albero mobile 15.4).
- TD posseduto da questa story: `sprint-status.yaml`, action item con `owner: "story 15.5"` (R-15.2-g) — **da chiudere o da riscrivere con le misure di §a.4** nello stesso commit.
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale, `JOBS_SECRET` da esportare, MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway lanciati dalla root con Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`; credenziali di seed `admin@airmanager.local` / `SEED_ADMIN_PASSWORD` di `.env`).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile card grid two column", "list row avatar balance", "progress bar accessibility", "mobile form sticky action bar").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.5): anagrafiche a card — flotta 2 colonne con barra ore, piloti con saldo e flag, salva primario in fondo ai due editor multi-form` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **Registro voli** → 15.6; **Scadenze/Transiti** → 15.7; **Contabilità/Statistiche/Impostazioni** → 15.8; **aree self e `/ppr` pubblico** → 15.9.
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover` (TD di epic) → **15.10**. La baseline di tastiera resta quella della 15.1.
- **TD 14.6 F4** (estratto conto non responsive sotto ~700px, componente condiviso `account-section.tsx`): resta aperto anche se ⟨Q1⟩ include la scheda persona, salvo diversa ratifica.
- **Tetto `OPTIONS_PAGE_SIZE = 100` dei picker** (faccia picker ancora aperta dopo il fix 15.4 F3), **`reports.spec.ts:307-315`** (PUT scheduling globale dal project parallelo), **`home-dashboard.spec.ts:228`**, **`billing.spec.ts:296`**: TD pre-esistenti, subiti e non chiusi qui.
- **METAR nella fascia 641-900px** → 15.10.
- Qualunque modifica alle API, agli schemi Zod o al dominio. Le sole modifiche server ammesse sono quelle che le ratifiche approvano esplicitamente (un reader batchato per le ore ⟨Q2⟩ e/o per il flag ⟨Q3⟩).
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/modalità full-screen di `SlideOver`: si **riusano**, non si reinventano.

---
---

# ASSUNZIONI DA RATIFICARE (BLOCCANTI) — **PRIMA** del dispatch al dev

> Regola di progetto (retro Epic 9, `sprint-status.yaml` AI-2, riconfermata dal piano epic 15: "Per ogni altro dubbio chiedi a me" — PO, 2026-07-29): un'assunzione scoperta in ricognizione si ratifica **prima** di implementare, mai spedita "da confermare" dentro il codice. Ogni domanda porta il **fatto misurato** che la genera, le **opzioni** e la **raccomandazione motivata** del teammate story.

### Q1 — Perimetro: solo Flotta e Piloti, o anche Istruttori e la scheda persona?

**Il fatto**: il piano epic descrive la 15.5 come *"Flotta (card 2-col con barra ore), **Piloti** (saldo + flag medico), **Istruttori** (ore/dovuto), coi loro filtri mobile e i form full-screen (velivolo composito 14.8, pilota unico 13.2, **scheda persona `people/{id}`** in linguaggio mobile)"* — quattro superfici. Il brief di questa sessione ne nomina due (Flotta, Piloti). Misure: Istruttori è una terza tabella a scroll orizzontale (317/754), **non paginata**, con **due** pannelli aggiuntivi (`InstructorProfile` di sola lettura + `PaymentCycleSlideOver`); `people/{id}` è **6 card** con una tabella scadenze, l'estratto conto (TD 14.6 F4 aperto) e l'unico ingresso multi-attore delle quattro (self.read sul proprio record).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Flotta + Piloti + Istruttori** (le tre anagrafiche a card), scheda persona rinviata | copre le tre liste che il template disegna; `people/{id}` è la superficie più grande e la sola multi-attore, e trascina un TD di responsive non chiuso |
| B | Flotta + Piloti soltanto (brief letterale), Istruttori e scheda persona rinviate | la story più piccola; ma lascia Istruttori come **unica** tabella a scroll orizzontale delle anagrafiche, contro R4, senza un proprietario dichiarato |
| C | Tutte e quattro (il piano alla lettera) | perimetro coerente col piano; story molto grande (4 superfici + 5 pannelli + il TD R-15.2-g), rischio di review lunga e di un gate che salta |
| D | Flotta + Piloti + **il TD R-15.2-g su entrambi gli editor**, con Istruttori spostato in una 15.5-bis | il TD tocca `instructor-editor.tsx`, quindi Istruttori viene comunque "toccata a metà" (l'editor sì, la lista no): stato incoerente |

**Raccomandazione: A.** Le tre liste condividono **la stessa forma di riga** (`30px 1fr auto` per Piloti/Istruttori, la griglia per Flotta) e **lo stesso lavoro CSS**: farne due su tre significa pagare due volte la stessa infrastruttura e lasciare in piedi esattamente ciò che R4 vieta su una pagina che il TD di questa story tocca comunque (`instructor-editor.tsx`). La scheda persona `people/{id}` è invece una superficie di natura diversa (dossier, non lista), multi-attore, con un TD responsive già aperto sul suo componente condiviso: merita la sua story, e il rinvio va tracciato esplicitamente come TD con owner.

### Q2 — La barra ore della card flotta: quale dato la alimenta?

**Il fatto misurato**: il template disegna una barra proporzionale alle **ore volate nel mese** del velivolo, normalizzata sul velivolo che ha volato di più (`barW = hours/maxH*100%`, script 640-644). In app quel numero **esiste solo dentro `getStats`** (`stats.service.ts:183`: `flight.groupBy({by:['aircraftId'], _sum:{minutes}})` sulla finestra del periodo), un servizio `finance.manage` che fa 10+ query e — dal fix 15.4 F3 — pagina **tutta** la flotta. Sulla pagina Flotta non c'è: `FleetCardItem.hourMeterMinutes` è il **contaore totale** (che cresce per sempre e non dice nulla sull'attività recente). Il precedente in casa per un dato del genere è `listReservedAircraftIds` (`bookings.service.ts:1319-1331`): **un solo `groupBy` sugli id della pagina corrente**, gate `aircraft.manage`, già usato da questa stessa pagina (`fleet/page.tsx:68`).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Reader nuovo batchato sugli id della pagina**: `sumFlightMinutesByAircraft(actor, ids, from, to)` in `aircraft.service.ts`, finestra = **mese corrente**, gate `aircraft.manage`, aggiunto al `Promise.all` esistente | ~15 righe + unit; una query in più su una pagina che ne fa già 5; il dato è **vero** ed è quello del template. La normalizzazione è **sulla pagina** (20 card), non sulla flotta: va detto nella didascalia o accettato |
| B | Chiamare `getStats(actor, {period:'month'})` dalla pagina Flotta | zero codice nuovo di dominio; ma trascina 10+ query e la paginazione dell'intera flotta per usarne un campo, su una pagina già paginata — e aggiunge un gate `finance.manage` dove oggi basta `aircraft.manage` |
| C | Barra sul **contaore** (`hourMeterMinutes`, già in pagina) | zero query nuove; ma il numero è un totale storico: un velivolo vecchio e fermo avrebbe la barra piena. **Mostrerebbe una cosa falsa sotto un'etichetta vera** — la classe di difetto che R-15.3-a ha già evitato una volta |
| D | Niente barra: la card porta solo marche/stato/modello/tariffa | zero rischio, ma la card 2-col perde l'unico contenuto che il template le dà oltre all'identità, e la story perde metà del suo titolo |

**Raccomandazione: A**, con la **didascalia che dichiara la finestra** ("ore del mese") e la normalizzazione **sulla pagina corrente** esplicitata nel doc-comment. Motivo: è l'unica opzione in cui il numero è vero e il costo è proporzionale (una query batchata, lo stesso identico pattern che la pagina già usa due volte); B paga un servizio intero per un campo; C stampa un dato che mente. Se il PO preferisce non toccare il server in questa story, **D** è accettabile e la barra si rimanda con la Flotta "a card senza barra" — ma allora va detto nel titolo della story, non scoperto in review.

### Q3 — Il "flag" della riga pilota: quale semantica, e su quale dato?

**Il fatto**: il template mostra **un solo** chip a destra, con priorità **sospeso > medico in scadenza ≤60 giorni** (script 651-655). In app: "sospeso" c'è già (`user.isActive === false`, colonna Stato del desktop); il "medico" **non è sulla pagina**, ma il dominio ha il campo giusto — `ExpiryType.kind = MEDICAL` (`prisma/schema.prisma:1275-1278`, story 13.1) — e ha anche un campo **più operativo**: `ExpiryType.blocksBooking`, il flag che decide se un documento scaduto **blocca davvero** prenotazione (7.4) e registrazione volo (14.4). Serve in ogni caso un reader batchato per-persona (oggi esistono solo `listPersonExpiries` per UNA persona e `listAllExpiries` globale paginata, gate `expiries.manage`). Le soglie sono già in casa e pure: `tierOf(daysUntilUtc(...))` (`lib/expiry-status.ts:89-95`: 0 = scaduto, 1 = ≤7g, 2 = ≤30g, 3 = ≤60g).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Flag = documento MEDICO** (`kind: 'MEDICAL'`) scaduto o in scadenza ≤60g, priorità sospeso > medico, un solo chip | fedele al template, su un campo di dominio vero; 1 reader batchato + 1 funzione pura. Ma tace su una **licenza scaduta**, che blocca il volo esattamente come la medica |
| B | **Flag = documento BLOCCANTE** (`blocksBooking = true`) scaduto → chip `--bad`; in scadenza ≤30g → chip `--warn`; priorità sospeso > bloccante | dice la cosa operativamente utile ("questo pilota oggi non può volare/prenotare") e riusa il flag che il dominio già usa per decidere; diverge dall'etichetta del template ("medico") |
| C | Flag = **scadenza più urgente** qualunque (tier 0/1), col nome del tipo nel chip | massima informazione; il chip diventa lungo e variabile, e a 375px la colonna destra ha ~110px |
| D | Nessun flag: solo saldo + stato utente | zero costo, zero server; la riga mobile mostra **meno** della riga desktop (che ha la colonna Stato) — contro la parità che l'epic ha tenuto finora |

**Raccomandazione: B**, con l'etichetta del chip che nomina il documento (es. "Medico scaduto", "Licenza 12gg"). Motivo: il template dice "medico" perché nel suo mondo la medica è l'unico documento; qui il dominio ha già deciso **quali** documenti bloccano, e usare quel flag rende il chip azionabile invece che decorativo — nella stessa logica per cui R-15.3-a ha cambiato il titolo di una card perché il numero non mentisse. **A** resta la scelta "più template" ed è accettabile se il PO vuole fedeltà letterale; **D** va scartata perché toglie informazione al mobile.
*(In entrambi i casi A e B: il reader è batchato sugli id della pagina, gate allineato a quello della pagina — `people.read`, ADMIN-only —, e la priorità/soglie stanno in una funzione pura con unit test, AD-6.)*

### Q4 — Il saldo sulla riga pilota: si mostra a tutti quelli che vedono la pagina?

**Il fatto**: `listPilotsPageData` calcola `balanceCents` per ogni riga **senza gate `finance.manage`** (`people.service.ts:290-311`) e la tabella desktop lo mostra a chiunque apra la pagina (`pilots-console.tsx:293-295`). La pagina è gated `people.read`, che oggi è **ADMIN-only** (`rbac.ts:104`), quindi il perimetro reale è "solo admin" — ma il codice non lo dice: se un domani `people.read` venisse dato a un'altra figura, il saldo di tutti seguirebbe in silenzio.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Invariato**: il saldo si mostra come oggi, mobile e desktop, e la story lo dichiara nel record come proprietà del gate `people.read` | zero codice; il mobile è la copia fedele del desktop; il rischio latente resta (ma è pre-esistente e non introdotto qui) |
| B | Saldo **gated su `finance.manage`** anche sulla riga mobile (e sul desktop, per non divergere) | chiude il rischio latente; **cambia il desktop** e va oltre il mandato "desktop invariato"; oggi non cambia nulla di visibile (chi ha `people.read` ha anche `finance.manage`) |
| C | Saldo solo nello sheet, non sulla riga | riduce l'esposizione a colpo d'occhio; ma il saldo è **il** dato che il template mette sulla riga, ed è la ragione per cui un admin apre questa pagina dal telefono |

**Raccomandazione: A**, con la nota nel record. Motivo: è una story di porting, e l'unico modo di "chiudere il rischio" (B) è cambiare il desktop per un difetto che oggi non si manifesta — lavoro speculativo che la skill vieta. Se il PO vuole comunque chiuderlo, **B** va fatta esplicitamente e misurata pre/post, non nascosta nel diff.

### Q5 — La tariffa oraria sulla card flotta: resta, e a chi?

**Il fatto**: il template mostra `€X/h` sulla card, e **il desktop la mostra già** (`fleet-card.tsx:94-97`, `wetRateCents` da `getEffectiveRates`, etichetta `rateLabel`). Il widget della Panoramica la mostra anch'esso. Nessun gate aggiuntivo: chi vede la pagina (ADMIN) vede la tariffa.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Resta com'è** sulla card mobile, con la stessa etichetta e lo stesso `formatCents` | parità col desktop, zero decisioni nuove |
| B | Tariffa solo nello sheet, per fare spazio a marche/modello/barra su una card da 135px | card più pulita; ma toglie dal colpo d'occhio il dato che il template mette in evidenza, e crea una divergenza mobile/desktop |

**Raccomandazione: A.** Misurato: a 375px la card è 135.5px e la riga "stato + €/h" **non clippa**; il problema di spazio si manifesta solo a 320px sul MODELLO, e si risolve con l'ellissi che il template stesso ha. Non c'è motivo di togliere informazione.

### Q6 — R-15.2-g: quale riga è primaria, e con quale meccanismo?

**Il fatto misurato** (§a.4, e **corregge la ricognizione del TD**): il salva **primario** (l'unico `.btn.primary` del form d'identità) è già sopra il fold in MODIFICA — `pilot-identity-submit` a **bottom 585**, `instructor-identity-submit` a **577**, entrambi `reachable: true` a `scrollTop 0`. I numeri 2269/2072 citati dal TD sono **azioni secondarie di sezione** ("Crea e invia invito", "Aggiungi tariffa"), che stanno sotto il fold anche sul desktop e anche in `aircraft-editor` (chiuso in 15.2 con quella stessa asimmetria: `new-rate-submit` 1291, `hour-meter-submit` 1688). **Il difetto vero e unico** è `pilot-editor` in modalità **NUOVO**: un solo form, un solo submit, a **906px sotto il fold**. Vincolo tecnico: mettere il salva nel prop `footer` di `SlideOver` lo ancora **a ogni larghezza** ⇒ cambierebbe il desktop; `.so-actions` (`airops.css:1915-1923`) è invece inerte >640px, ma è `position: sticky` dentro `.so-body`: **si sgancia quando si scorre oltre il blocco che lo contiene** (è la preoccupazione con cui la 15.2 ha motivato il rinvio).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **`.so-actions` sulla riga identità di entrambi gli editor + su `pilot-editor` NUOVO** — primaria = il salva dell'anagrafica, come in `aircraft-editor` | 1 riga per file, desktop inerte per costruzione, **uniforme con l'editor già sistemato**; chiude il difetto misurato (NUOVO) e dà al MODIFICA la stessa barra che ha la Flotta. Onestà: in MODIFICA il guadagno è piccolo (il salva è già visibile) e la barra si sgancia scorrendo alla seconda sezione |
| B | **Slot nuovo `mobileFooter` su `SlideOver`**: un `<footer>` reso **solo ≤640px** (CSS, nessun `matchMedia`) con il salva primario legato al form via l'attributo HTML `form="pilot-identity-form"`, e la riga in-body nascosta ≤640px | è ciò che R3 e il TD chiedono alla lettera ("azione primaria **fissa in basso**", "il salva primario nel piede del pannello"): la barra **non** si sgancia mai. Costo: si tocca la primitiva condivisa da **11** consumer (rischio da misurare su tutti), e `aircraft-editor` resterebbe con `.so-actions` — o va convertito anche lui, riaprendo un fix chiuso |
| C | **Solo `pilot-editor` NUOVO** prende `.so-actions`; per i due MODIFICA il TD si chiude come "non è un difetto", con le misure di §a.4 allegate | il minimo onesto e strettamente giustificato dalle misure; ma lascia i due pannelli senza azione ancorata, cioè R3 formalmente non soddisfatta su di essi |
| D | Nessun intervento, TD riscritto con le misure e rinviato | non chiude nulla e sposta il problema di nuovo |

**Raccomandazione: A.** Motivi: (i) chiude il difetto reale e misurato (NUOVO, 906px) al costo di una riga; (ii) rende i tre editor **uniformi** (`aircraft-editor` ha già `.so-actions` sulla riga identità: divergere renderebbe il codice più difficile da leggere di quanto il guadagno giustifichi); (iii) non tocca una primitiva usata da 11 pannelli in una story che ha già quattro superfici. La riserva onesta va scritta nel record: in MODIFICA la barra si sgancia oltre la prima sezione, e questo è **accettato**, non ignorato. Se il PO ritiene che "fissa in basso" debba valere letteralmente per tutto il pannello, **B** è la scelta corretta ma va messa in conto come lavoro sulla primitiva **con** la conversione di `aircraft-editor`, e il blast radius sugli 11 consumer va misurato uno per uno.

### Q7 — Ricerca, toggle archiviati ed export su mobile: che forma prendono?

**Il fatto misurato**: la `.card-head` a 375px è alta **192px** sulla Flotta (toggle + ricerca da 240px + Esporta + Nuovo aeromobile, tutti a capo) e **149px** sui Piloti — contro 64px a 1280px. Cioè: prima di vedere la prima card si consumano ~25% dello schermo. Il template **non ha nessuno di questi controlli** (R2 ⇒ li progetta il team). Il linguaggio già ratificato dall'epic per una CTA di testata è **full-width sotto la sub-riga** (R-15.3-d, R-15.4-f), e per un filtro è la **strip di chip** (R-15.4-c, `.mobile-chip-strip`, `airops.css:2233+`). L'export in linguaggio mobile è esplicitamente **rimandato a 15.8** (R-15.2-c).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Ricerca full-width in cima alla lista** + **chip "Archiviati"/"Solo archiviati"** (stessa `.mobile-chip-strip` della 15.4, stesso stato, nessuna seconda fonte di verità) + **CTA "Nuovo…" full-width** sotto la testata (R-15.3-d/f) + `ExportMenu` invariato nella testata | linguaggio coerente con tutto l'epic, altezza della testata drasticamente ridotta, nessun controllo perso (R4); i testid restano quelli (AD-3) |
| B | Testata invariata (va a capo come oggi) | zero lavoro; ma è la definizione di "pagina desktop rimpicciolita" e spreca un quarto dello schermo su ogni anagrafica |
| C | Filtri dietro un pannello/sheet "Filtri" | testata minima; introduce un pattern **nuovo** che l'epic non ha (la 15.4 ha tenuto il popover esistente **e** aggiunto i chip, mai nascosto un filtro) |
| D | Ricerca full-width, ma toggle archiviati ed export **nascosti** ≤640px | il più compatto; **perde due funzioni su mobile** ⇒ contro R4 |

**Raccomandazione: A.** È il linguaggio che l'epic ha già ratificato due volte (chip per i filtri, CTA full-width), non perde niente, e la misura dice che il problema è reale (192px). L'`ExportMenu` resta dov'è e come oggi: è esplicitamente lavoro della 15.8.

### Q8 — La griglia della Flotta: dentro la `.card` attuale o full-bleed come il template?

**Il fatto misurato**: il template mette le card **direttamente sulla pagina** (`padding:0 16px`, nessun contenitore `.card`). In app la griglia vive dentro `.card` (bordo + `overflow:hidden` + padding 18px). A 375px, con `repeat(2, minmax(0,1fr))`: **135.5px per card** dentro la `.card`, contro i **166.5px** che il template ottiene senza contenitore. A 320px si scende a **108px** e il modello clippa di 9px (misurato). Il precedente in casa per il full-bleed è la KPI strip (D4 della 15.2: `margin-inline: -28px`, con l'invariante "la riga è figlia DIRETTA di `.page`" **asserita** da `mobile-primitives.spec.ts:188`).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Griglia dentro la `.card` attuale**, 2 colonne `minmax(0,1fr)` + ellissi sul modello | zero rischio strutturale, testata/ricerca/paginazione restano nella stessa card; card da 135.5px (320px: 108px), il modello **deve** troncare |
| B | **Full-bleed**: a ≤640px la card contenitore perde bordo/fondo/padding e la griglia va a tutta larghezza (16px di gronda come il template) | +31px per card (166.5px a 375), fedele al template; ma è una seconda regola di full-bleed nel CSS e la 15.2 ha già segnalato quel meccanismo come "il punto più fragile del diff" |
| C | Full-bleed **e** card contenitore rimossa dal DOM ≤640px | il più fedele; smonta la testata dalla lista (la `.card-head` resterebbe orfana) e rompe AD-3 |

**Raccomandazione: A.** Motivo: i 31px in più non cambiano quello che la card riesce a mostrare (misurato: a 375px con 135.5px **nessun** testo clippa; il clipping compare a 320px, dove anche il full-bleed lascerebbe ~139px e il modello troncherebbe comunque), mentre B aggiunge la regola più fragile del CSS mobile in una story che ne ha già molte. Le ellissi sul modello vanno messe in ogni caso: sono nel template.

### Q9 — Tap sulla card/riga: bottom sheet di dettaglio, o apertura diretta dell'editor?

**Il fatto**: oggi il tap su una card flotta apre **direttamente** l'`AircraftEditor` (`fleet-console.tsx:168`); sulla riga pilota, invece, il tap sul NOME va alla scheda persona (`<Link>`) e le azioni sono **tre bottoni distinti** nella colonna Azioni. R3 dice "dettaglio-riga = bottom sheet", e le tre story precedenti hanno costruito **una sola grammatica**: card = trigger unico → sheet con le azioni (R-15.2-b, confermata da R-15.3-b e R-15.4-d). In più: `.ac-card` è un `<div onClick>` (**misurato**: `tagName DIV`, 0 figli interattivi) ⇒ oggi la Flotta **non è usabile da tastiera** su nessun dispositivo.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Sheet di dettaglio con le azioni** su entrambe (grammatica unica dell'epic): tap → sheet (righe chiave-valore + Modifica / Registra acconto / Sospendi / Vai alla scheda) | coerente con tutto l'epic; parità informativa piena; un tap in più per arrivare al form. Sulla Flotta cambia il gesto rispetto a oggi (tap = editor) |
| B | Flotta: tap = editor diretto (come oggi); Piloti: tap = sheet | meno lavoro; **due grammatiche diverse nella stessa story**, che è ciò che R-15.3-b ha esplicitamente evitato |
| C | Sheet ovunque, ma **senza azioni** (sola lettura + "Modifica") | sheet più semplice; ma nasconde Registra acconto e Sospendi dietro il pannello di modifica, che non le contiene ⇒ **perdita di funzione** su mobile, contro R4 |

**Raccomandazione: A.** Motivo: è la grammatica che l'epic ha ratificato tre volte, ed è l'unica che regge la riga Piloti (che ha **tre** azioni con permessi diversi e una conferma in due passi — impossibili da mettere inline su una riga da 375px). Il tap in più sulla Flotta è il costo già accettato in R-15.2-b ("2 tap per pratica"), e in cambio la card mobile diventa un `<button>` vero, operabile da tastiera.
**Sotto-domanda (stessa ratifica)**: `.ac-card` desktop resta un `<div onClick>` (difetto a11y pre-esistente, non introdotto qui) o si converte in `<button>` anche lì? *Raccomandazione: resta, e va aperto un TD* — convertirlo cambia il DOM desktop in una story il cui mandato è "desktop invariato", e il fix corretto tocca anche il widget della Panoramica.

### Q10 — Paginazione su mobile: si tiene, o diventa "carica altri"?

**Il fatto**: Flotta e Piloti sono paginate a **20 righe** (`fleet/page.tsx:16`, `pilots/page.tsx:15`) con un piede `prev / N / M / next` fatto di `<Link>` (`fleet-console.tsx:172-196`, `pilots-console.tsx:366-390`); Istruttori **non** è paginata. Il template non mostra paginazione. Misurato: 20 card a una colonna fanno una pagina alta **4313px**; a due colonne saranno ~2200px.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Paginazione invariata**, resa in linguaggio mobile (piede della card, bottoni ≥44px, hit-testabili sopra la tab bar) | zero logica nuova, contratto URL invariato (`?page=`), nessun rischio; due tap per cambiare pagina |
| B | "Carica altri" (append client-side) ≤640px | più naturale al pollice; introduce stato client nuovo, rompe il contratto `?page=` e la retrocompatibilità dei deep link, e va progettato per la ricerca e per il refresh dopo una mutazione |
| C | Scroll infinito | il più "app"; il più lontano dal resto dell'app e dal template, e il peggiore da testare in modo deterministico |

**Raccomandazione: A.** L'epic non ha mai introdotto un pattern di caricamento nuovo (la 15.4 ha tenuto la paginazione della lista prenotazioni), il contratto URL vale anche per la futura app Flutter, e B/C aggiungono stato e casi di test per un guadagno di comodità. Va però verificato (AC 3/8) che i due bottoni siano ≥44px e non finiscano sotto la tab bar.

---

# Dev Agent Record (dev-15-5, Opus 5 xhigh — 2026-08-03)

Status: **review**. Gates verdi, spec nuovo verde (15/15), 8 guardie provate DISCRIMINANTI
per iniezione sul repo intatto, suite completa `CI=1` su build di produzione e DB fresco
lanciata come gate finale (esito in §9).

## 1. Verifica della ricognizione (conferme e correzioni, numerate)

Tutto rimisurato a runtime sulla build di produzione, DB seed fresco + fixture proprie.

**Confermate:**

1. **§a.1 — la griglia Flotta è a UNA colonna sotto i 640px.** `grid-template-columns`
   misurato: **281px** a 375, **226px** a 320, `226px 226px`… no: una sola traccia in
   entrambi i casi. `.ac-card` 281×143. Confermato.
2. **§a.1 — `.card-head` della Flotta = 192px a 375px** (64px a 1280, 107px a 800/641).
   Confermato al pixel.
3. **§a.1 — `.ac-card` è un `<div>` con 0 figli interattivi.** Misurato `tagName: 'DIV'`,
   `querySelectorAll('button,a,input,select').length === 0`. Confermato → TD aperto (R-15.5-i).
4. **§a.2 — la tabella Piloti è 1102px in 317 visibili** a 375px (`.students` cw 317 / sw
   1102), `.card-head` 149px. Confermato al pixel.
5. **§a.3 — Istruttori 317/754** a 375px. Confermato. (La sua `.card-head` misura **150px**,
   numero che la ricognizione non aveva.)
6. **§a.4 — il salva PRIMARIO in MODIFICA è già sopra il fold**: `pilot-identity-submit`
   `bottom 573` `reachable: true`, `instructor-identity-submit` `bottom 550` `reachable: true`.
   Confermato (la ricognizione diceva 585 e 577 su un DB più pieno).
7. **§a.4 — i submit di sezione stanno sotto il fold**: `instructor-payout-rate-submit`
   `bottom 835`, `instructor-rates-submit` `bottom 1130` in un viewport 812. Confermato.
8. **§a.4 — `aircraft-editor` è già a posto e INERTE sul desktop**: `hasSoActions: true`,
   `position: sticky` a 375 e `static` a 641/800/1280, `.so-body` `padding-bottom` 0px a 375
   e 18px sopra. Confermato.
9. **§a.7 — `.meter-bar`/`.fill` esiste nel design system e non ha nessun consumer**
   (`grep -rn "meter-bar" src/ --include=*.tsx` → 0). Riusata per la barra ore: track
   `--bg-sunken`, fill `--ok`, `.fill.bad` — la ricetta del template, zero classi nuove.
10. **§b — i sei helper `^=`** esistono esattamente dove indicato
    (`grep -rn 'data-testid\^=' e2e/`, 6 file + 3 occorrenze 15.4 su altri prefissi).
    AD-5 rispettata: nessun testid nuovo comincia per `ac-card-`, `pilot-row-`,
    `instructor-row-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`.

**Correzioni (la ricognizione sbagliava o era incompleta):**

1. **`--bad-ink` NON ESISTE in questo design system.** Il template lo usa per il saldo
   negativo e la ricognizione lo cita, ma `airops.css` definisce solo `--accent-ink`
   (grep: 0 occorrenze di `--bad-ink:`/`--ok-ink:`). Scritto `color: var(--bad-ink)` la
   dichiarazione è **invalida a computed-value time** e il valore torna a ereditare `--ink`:
   **misurato 18.79:1**, cioè il saldo negativo era NERO, indistinguibile da uno positivo.
   Trovato solo perché il contrasto va misurato e non dedotto. Sostituito con la classe che
   il design system ha già per questo caso esatto — `.stat-tone-bad` (Billing-2, "testo
   colorato su `--panel`"): **9.82:1 chiaro / 6.61 scuro**, zero literal nuovi.
2. **La `1fr 1fr` del template non è di per sé il difetto: lo è `min-width: auto`.**
   Iniettando `1fr 1fr` sulla card MOBILE (che ha `min-width: 0` e le tre dichiarazioni di
   ellissi) le tracce restano **137.5 / 137.5**: la guardia non diventa rossa. Il pre-fix
   fedele è `1fr 1fr` **+ card senza `min-width: 0` + riga modello senza ellissi** (cioè la
   `.ac-model` del desktop): allora le tracce misurano **219.14 / 117.8**, somma 336.94 + 10
   di gap in un box da 317 (`fits: false`) e la **page overflow resta 0** — la prova che la
   guardia va scritta sulle tracce. Dettaglio in §5-iii.
3. **AC 1 chiede due cose incompatibili sul modello.** "modello mono **ellissato**" e
   "a 320px nessun testo della card è clippato (`scrollWidth <= clientWidth` su `.ac-model`)"
   non possono valere insieme: `text-overflow: ellipsis` PRODUCE `scrollWidth > clientWidth`.
   Letta come "nessun testo è tagliato **senza affordance**": la guardia asserisce che ogni
   testo della card o entra, o porta `text-overflow: ellipsis`. Con la lettura letterale il
   test sarebbe verde solo togliendo l'ellissi, cioè reintroducendo il difetto.
4. **Il `Badge` non entra accanto alle marche.** §a.5 decide "si tiene il `Badge`" al posto
   del pallino 8px, ma su una card da **137.5px** il `Badge` "Disponibile" (91px) lasciava
   alle marche **7px di glifi visibili** (misurato) — l'identificatore stesso della card,
   ellissato via. Il `Badge` ha quindi una riga sua (§4-1).
5. **`.card-head` NON si accorcia solo riordinando.** Misurato: con i 44px che AC 3 impone su
   ogni controllo, la testata a 375px passa da 192 → **220px** sulla Flotta e 149 → **220px**
   sui Piloti. Nascondendo il `.card-title` (che ripete quello che dicono già l'`<h1>` e la
   top bar mobile) si scende a **176-177px**. ⚠️ **Riga corretta nel ciclo di fix (review F3,
   2026-08-04)**: il "**-16px** sulla Flotta" che questa riga rivendicava confrontava un post
   misurato a **390px** con un pre misurato a **375px**. Al viewport di riferimento
   dell'epic (375px) i numeri veri della prima consegna erano **221.84** (Flotta, quattro
   righe), **179** (Piloti), **167.84** (Istruttori), cioè **PEGGIO** del pre-fix su tutte e
   tre. Il secondo giro li ha portati a **175 / 175 / 121** — v. la tabella di §7 e §12.
6. **Il tetto della testata dipende dalla LUNGHEZZA delle etichette.** A 375px "Mostra
   archiviati" (141px) + "Esporta Excel" (137px) + gap = **288px in un content box da 281**:
   vanno a capo e la Flotta resta a **220px**; sui Piloti ("Solo archiviati", 128px) stanno
   sulla stessa riga e la testata è **177px**; a 390px anche la Flotta scende a 177. È un
   `flex-wrap` che degrada bene, non una regressione: l'alternativa era troncare l'etichetta
   di un filtro.
7. **Il flag non entra nella colonna destra.** Con il chip nello slot del template, un
   documento reale ("Visita medica classe 2 scaduto", 191px) portava la colonna destra a
   193px e lasciava al NOME **38px**. Il chip ha quindi una riga sua (§4-2).
8. **La ricerca non era un target da 44px** anche col wrapper a 44: `.search` centra i figli,
   quindi `fleet-search` (l'`<input>`) misurava 19px e un tap sul padding non dava fuoco a
   nulla. L'altezza è passata sull'input.
9. **`.info-row .v` della scheda persona sfora il proprio box** a 375px (3 righe: email,
   codice fiscale, indirizzo — token non spezzabili). Non era in ricognizione.
10. **`/api/v1/users/{id}` non ha GET** (rimosso in 12.13): la rilettura dell'esito della
    sospensione passa dalla PAGINA (server-rendered da `listPilotsPageData`), che è lo STATO
    del record, non il conteggio di una lista.
11. **Il catalogo `ExpiryType` è GLOBALE e le altre spec lo sporcano.** Misurato su DB
    post-suite: **11 tipi `blocksBooking = true`**, di cui **7** lasciati da `bookings.spec.ts`
    ("Tipo prenotazioni …") e `flights.spec.ts` ("Tipo voli …"), mai rimossi. `POST /flights`
    esige che OGNI tipo bloccante sia REGISTRATO e valido (`findMissingBlockingDocuments`,
    14.4), quindi una persona nuova è bloccata da tutti quelli che esistono in quel momento:
    il mio fixture del volo (per la barra ore) è passato dal verde al 422 fra il run mirato
    su DB fresco e la suite completa. Non è un difetto introdotto qui — è un accoppiamento a
    stato globale PRE-esistente — ma il mio test doveva esserne immune: usa ora l'override
    admin `force`/`forceReason` (14.4, AC 2), che è deterministico qualunque sia il catalogo.
    La guardia del guard-rail resta dov'era, in `flights.spec.ts`.
12. **Il chip del flag sfondava la riga, e nessuna asserzione lo vedeva.** Trovato con la
    verifica VISIVA (screenshot 375px, tema scuro), non da un test: un nome di tipo reale
    lungo 38 caratteri portava il chip oltre il bordo destro della card. Due cause: (a) un
    item che SPANNA due tracce contribuisce col suo max-content a entrambe, quindi
    `grid-column: 2 / -1` rigonfiava la colonna `auto` da cui doveva essere indipendente
    (fix: `grid-column: 2` dentro una traccia `minmax(0, 1fr)`); (b) `text-overflow` non ha
    effetto sull'item anonimo in cui un `.badge` `inline-flex` trasforma una stringa, quindi
    il taglio avveniva **senza ellissi** (fix: `display: block` + `width: fit-content` sul
    chip). La guardia era cieca **per costruzione**: lo sweep degli scroller nascosti esclude
    gli elementi con `text-overflow: ellipsis`, e il chip ne ha uno. Aggiunta un'asserzione
    dedicata sul CONTENIMENTO (`chip.right <= row.right`).

## 2. Riepilogo per AC

| AC | Esito | Prova |
|---|---|---|
| 1 Flotta 2 colonne + barra ore | fatto | tracce **137.5/137.5** a 375, **110/110** a 320, **145/145** a 390, uguali e dentro il contenitore; card = 1 `<button>`, 0 figli interattivi, ≥44px, `aria-label` con le marche; nessun testo clippato senza ellissi a 320; barra: `100%` sul velivolo che ha volato, `0%` sull'altro (e2e), unit sui confini |
| 2 Piloti a riga | fatto | `.students` `display:none` misurato; riga `30px 1fr auto`, 1 `<button>`, 0 figli interattivi, 60-85px; saldo `formatCents` con `.stat-tone-bad` sul negativo; flag presente sul fixture con documento scaduto, **assente** su quello pulito |
| 3 testata/ricerca/archiviati/paginazione | fatto | 3 testid = 1 nodo ciascuno, tutti ≥44px; la ricerca guida `?q=`, il chip guida `?includeArchived=true` e `aria-pressed`; paginazione `1 / 2 → 2 / 2` con `?page=2` e bottoni ≥44px; altezze pre/post in §7 |
| 4 sheet di dettaglio + azioni | fatto | sheet = **1 nodo**, z 40, nome accessibile ben formato (un solo ` — `); parità (Stato/Motivo AOG/Tariffa/Posti/Carburante/Contaore/Ore mese/Note e Email/Telefono/Saldo/Ultimo volo/Ruolo/Stato); apertura **da tastiera** (Tab reali + Enter); "Modifica"/"Registra" chiudono lo sheet PRIMA del pannello; sospensione in due passi, dismiss = nessuna mutazione, conferma riletta dal server su entrambe le facce |
| 5 R-15.2-g | fatto | `pilot-editor` NUOVO: `reachable: true` con `scrollTop 0` su 375×560 dove il corpo **scorre davvero**, `position: sticky`, submit 44px, pannello == viewport, **1 sola** barra ancorata; i submit di sezione restano fuori da `.so-actions` (asserito); desktop invariato §7 |
| 6 testid | fatto | 7 testid desktop = 1 nodo a **375 e 1280**, su `/dashboard/fleet`, `/dashboard/pilots`, `/dashboard/instructors`; `fleet-card-widget` = 1 nodo su `/dashboard` e **0** testid `mobile-fleet-*` dentro il widget (AD-2) |
| 7 form a tutto schermo | fatto | pannello == viewport ±1px a 375×560; `identity-form`/`pilot-identity-form`/`instructor-identity-form` raggiunti dal percorso mobile e popolati; nessun `Escape` usato per chiudere un popup |
| 8 geometria e layering | fatto | overflow di pagina **0** a 320/375/390 su tutte e quattro le superfici, in **entrambi i temi**; nessuno scroller interno nascosto (eccezioni dichiarate: `.kpi-row` 15.2, l'estratto conto TD 14.6 F4); hit-test su ogni `.page a, .page button` a fondo pagina: **0** sotto la tab bar, 0 coperti |
| 9 guardie discriminanti | fatto | tabella §5: 8 regole, **8 provate rosse** per iniezione sul repo intatto |
| 10 invarianti | fatto | §7 (desktop identico a 1280/800/641 su geometria, pannelli e `.so-actions`), §6 (contrasti nei due temi), gates verdi, 0 dipendenze nuove, 0 token cambiati, 0 literal di colore nuovi, chiavi i18n nei DUE locale |
| 11 Istruttori a riga | fatto | `.students` nascosta, riga della stessa famiglia con ore + dovuto, 1 `<button>` ≥44px, sheet con `instructor-edit-mobile`/`instructor-pay-mobile` gated, entrambi i lati dello switch asseriti |
| 12 scheda persona | fatto | 1 colonna (`bottomTracks: 1`), scadenze a riga (`expiryTracks: 2`, header `display:none`), **nessun doppione di testo** (`person-expiry-row` = 1, "Licenza" = 1 nodo), overflow 0 a 320/375/390, multi-attore (pilota sul proprio record + redirect dalle due console) |

## 3. File toccati

- `src/lib/mobile-registries.ts` (**nuovo**) + `src/lib/mobile-registries.test.ts` (**nuovo**, 21 test)
- `src/server/services/aircraft.service.ts` — `sumFlightMinutesByAircraft` (+3 unit nel test esistente)
- `src/server/services/expiries.service.ts` — `listBlockingExpiriesByPerson` (+4 unit nel test esistente)
- `src/components/ui/avatar.tsx` — prop `as` (default invariato)
- `src/app/[locale]/dashboard/fleet/page.tsx` / `fleet-console.tsx` — reader ore, albero mobile, sheet, classi di switch
- `src/app/[locale]/dashboard/pilots/page.tsx` / `pilots-console.tsx` — reader flag, albero mobile, sheet con 4 azioni e conferma a due passi, `setUserActive` condivisa
- `src/app/[locale]/dashboard/instructors/page.tsx` / `instructors-console.tsx` — albero mobile, sheet
- `src/app/[locale]/dashboard/pilots/pilot-editor.tsx` / `instructors/instructor-editor.tsx` — `.so-actions` (R-15.5-f)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` — classi al posto di 2 stili inline, `.person-expiries`, `.home-head-actions`
- `src/styles/airops.css` — blocco `anagrafiche mobile (story 15.5)` in coda
- `messages/it.json` / `messages/en.json` — chiavi nuove nei DUE locale (36 righe ciascuno, solo additive)
- `e2e/mobile-registries.spec.ts` (**nuovo**, 15 test) — **nessuno spec esistente modificato** (AD-5 ha tenuto)
- `CLAUDE.md` — la riga di convenzione che AD-5 impone
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — TD R-15.2-g chiuso e riscritto con le misure, 2 TD nuovi, stato della story

## 4. Decisioni non ovvie

1. **Il `Badge` di stato ha una riga sua sulla card** (il template ci mette un pallino 8px).
   Misurato: accanto alle marche su una card da 137.5px lasciava all'identificatore **7px**.
   Costa ~18px di card e tiene leggibili entrambi anche a 320px.
2. **Il chip del flag ha una riga sua sulla riga pilota** (`grid-row: 2; grid-column: 2/-1`).
   Misurato nello slot del template: il nome scendeva a **38px**. Sulla sua riga il chip ha
   245px e nessun altro deve stringersi.
3. **Il chip "Archiviati" è lo STESSO bottone del desktop, ridisegnato a pillola**, non un
   nodo dentro una `.mobile-chip-strip`. R-15.5-g chiede il chip **e** "nessuna seconda fonte
   di verità"; AD-3 vieta di duplicare il nodo. Una strip con un chip solo non ha nulla da
   scorrere. L'aggancio è `[aria-pressed]`, non `:not(.primary)`: "Ciclo pagamenti" vive
   nella stessa testata e deve continuare a leggersi come azione.
4. **`.card-title` nascosto a ≤640px** sulle tre console: costa una riga intera e ripete
   quello che dicono l'`<h1>` e la top bar mobile. È un `div`, non un heading, e nessun test
   lo legge (verificato con grep sui tre valori).
5. **La riga "stato + tariffa" del template diventa "Tariffa + €/h"**: il `Badge` sopra
   NOMINA già lo stato, e ripetere la stessa parola due volte su una card da 137px è rumore.
   L'informazione non si perde.
6. **`.mobile-ac-meter` va a capo** invece di `space-between`: a 320px "Tariffa" + "180,00 €/h"
   misurano 95px in 84 e side-by-side venivano ellissate **entrambe**. A capo costa 12px solo lì.
7. **`Avatar` guadagna `as`** invece di una seconda `.avatar` copiata nella riga: la riga è un
   `<button>` (R-15.2-b) e il suo modello di contenuto è phrasing content — un `<div>` lì
   dentro è markup non valido. Prop additiva, default invariato, 5 consumer non toccati.
8. **La scadenze della scheda persona si RI-DISPONE, non si duplica.** Un albero mobile
   avrebbe messo due volte ogni tipo/data/stato nel DOM e `person-detail.spec.ts:217`
   (`getByText(updatedPhone)`) e `expiry-registration.spec.ts` leggono quella pagina a livello
   di pagina. Regole `:nth-child` su 4 celle, zero testid nuovi, zero rischio e2e.
9. **`setUserActive` estratta** e condivisa fra la conferma inline della tabella e il
   `secondStep` dello sheet: stessa PATCH, stesso ramo 409 `CONFLICT`, stessi toast. Stessa
   ragione di `booking-transition.ts` in 15.3.
10. **La composizione delle righe di sheet è restata JSX** (AD-6 la elencava fra le funzioni
    pure). Portano `ReactNode` e stringhe già formattate dal locale, non hanno rami di
    confine, e l'e2e le prova per intero. Deviazione dichiarata, non dimenticata.

## 5. Regola nuova → guardia → prova di DISCRIMINANZA

Simulazioni sul repo **intatto** (iniezione CSS/DOM sulla build di produzione, script
`m7-discriminance.mjs`/`m8-disc2.mjs` nello scratchpad, non committati).

| # | Regola (difetto misurato) | Guardia | Verde ora | Simulando il pre-fix |
|---|---|---|---|---|
| i | alberi desktop `display:none` ≤640 (1102px e 754px di scroll orizzontale in 317) | `.fleet-desktop-body`/`.pilots-desktop-body`/`.instructors-desktop-body` `toBeHidden()` + albero mobile visibile | ✅ `desktopHidden: true` | `.fleet-desktop-body{display:block}` → `false` → **rosso** |
| ii | alberi mobile `display:none` >640 | a 1280 `mobile-*-list`/`mobile-fleet-grid` `toBeHidden()` | ✅ `mobileHidden: true` | `.pilots-mobile{display:block}` → `false` → **rosso** |
| iii | griglia `repeat(2, minmax(0,1fr))` + `min-width:0` + ellissi (il lato LIBERATO) | le due tracce **uguali** e somma+gap ≤ contenitore | ✅ `137.5/137.5`, `fits: true` | `1fr 1fr` + card senza `min-width:0` + modello senza ellissi → **`219.14/117.8`, `equal:false`, `fits:false`** → **rosso**, e `pageOverflow` resta **0** in entrambi i casi (la prova che l'overflow di pagina sarebbe una guardia cieca) |
| iv | ellissi sulle tre righe di testo della card | a 320: nessun testo con `scrollWidth > clientWidth` **e** `text-overflow != ellipsis` | ✅ `[]` | `.mobile-ac-model{text-overflow:clip}` → `['mobile-ac-model','mobile-ac-model']` → **rosso** |
| v | barra ore proporzionale al massimo di PAGINA, 0 quando nessuno ha volato | 21 unit su `hoursBarPercent` (max 0, minuti 0, 100%, arrotondamento, clamp, max negativo) + e2e sul cablaggio (`100%` / `0%`) | ✅ | unit per costruzione (l'e2e non può fabbricare "nessuno ha volato" senza svuotare il DB) |
| vi | flag = documento bloccante, priorità sospeso > scaduto > ≤30g | unit su `pilotRowFlag` (assente/scaduto/oggi/30/31/60/priorità/pareggio) + e2e con documento reale scaduto e riga pulita senza chip | ✅ | unit per costruzione + e2e: il fixture pulito ha `.badge` `toHaveCount(0)` |
| vii | `.so-actions` sui due editor multi-form | submit hit-testabile con `scrollTop === 0` su 375×560 dove il corpo **scorre** (`bodyScrolls: true`) | ✅ `reachable: true` | `.so-actions{position:static}` → `reachable: false` → **rosso** |
| viii | empty state = UN nodo | `toHaveCount(1)` su `mobile-fleet-empty`/`mobile-pilots-empty` | ✅ `count: 1` | secondo nodo clonato nel DOM → `count: 2` → **rosso** |
| ix | i selettori nuovi non raggiungono il pannello (lezione 15.3 F1) | `.home-head-actions > .btn` (figlio DIRETTO) e `.registry-head > …`; misura dei bottoni del `SlideOver` aperto | ✅ `164/164/61…` px | versione DISCENDENTE `.home-head-actions .btn{min-width:12px;max-width:12px}` → `26/26/18…` px → **rosso**: la trappola 15.3 F1 esiste davvero su questa testata (il `PilotEditor` è montato come FRATELLO del trigger) ed è il `>` a disinnescarla |

## 6. Contrasto misurato (canvas → WCAG), tema chiaro **e** scuro

Tutte le superfici nuove, enumerate una per una (lezione 15.3: il gemello va misurato).
Testo ≥4.5:1, oggetti grafici ≥3:1.

| elemento | token | chiaro | scuro | soglia |
|---|---|---|---|---|
| marche della card (`.mobile-ac-tail`) | `--ink` su `--panel-2` | **16.83** | **13.03** | 4.5 ✅ |
| modello della card (`.mobile-ac-model`) | `--ink-2` su `--panel-2` | **8.95** | **7.84** | 4.5 ✅ |
| etichetta "Tariffa"/"Ore mese" | `--ink-2` su `--panel-2` | **8.95** | **7.84** | 4.5 ✅ |
| valore tariffa/ore (`.v`) | `--ink` su `--panel-2` | **16.83** | **13.03** | 4.5 ✅ |
| `Badge` di stato sulla card | `.badge.ok` | **8.38** | **7.46** | 4.5 ✅ |
| **riempimento barra ore** vs traccia | `color-mix(--ok 70%, --ink)` su `--bg-sunken` | **6.10** | **9.87** | 3 ✅ |
| nome della riga persona | `--ink` su `--panel` | **18.79** | **15.74** | 4.5 ✅ |
| sub della riga persona | `--ink-3` su `--panel` | **4.85** | **5.72** | 4.5 ✅ |
| saldo positivo / ore istruttore | `--ink` su `--panel` | **18.79** | **15.74** | 4.5 ✅ |
| **saldo negativo** | `.stat-tone-bad` | **9.82** | **6.61** | 4.5 ✅ |
| "N dovuti" (`.mobile-row-note`) | `--ink-3` su `--panel` | **4.85** | **5.72** | 4.5 ✅ |
| chip flag "scaduto" | `.badge.bad` | **8.38** | **7.46** | 4.5 ✅ |
| chip flag "Ngg" | `.badge.warn` | **11.32** | **9.28** | 4.5 ✅ |
| avatar (3 tinte estratte dalle fixture) | `.avatar`/`.amber`/`.green` | **5.69 / 5.21 / 5.09** | idem (token invarianti) | 4.5 ✅ |

⚠️ Due misure **negative** trovate e chiuse durante il lavoro (§1 correzioni 1 e la nota sotto):
- `var(--bad-ink)` **non esiste** → il saldo negativo rendeva a 18.79 (nero). Sostituito.
- `--ink-3` su `--panel-2` (il fondo della card) misura **4.34** in chiaro, sotto la soglia
  del testo: la card mobile usa `--ink-2`. **La `.ac-card` DESKTOP porta lo stesso 4.34 su
  `.ac-model`/`.meter-row`**: difetto PRE-esistente, non toccato (componente condiviso con
  il widget della Panoramica, mandato "desktop invariato") → **TD nuovo** in sprint-status.

## 7. Misure pre/post

**Desktop (AC 10) — 641 / 800 / 1280px, `q` sulle stesse fixture:**

| campo | pre | post |
|---|---|---|
| `.card-head` Flotta | 106.69 / 106.69 / 63.84 | **identico** |
| `.card-head` Piloti | 149.53 / 106.69 / 63.84 | **identico** |
| `.registry-search` Flotta / Piloti | 240px / 260px (inline) | **240px / 260px** (classe) |
| `.fleet-grid` tracce | 235.5×2 / 315×2 / 229.5×4 | **identico** |
| `.students` Piloti scrollWidth | 1102 | **1102** |
| `aircraft-editor`: pannello / `.so-actions` / `.so-body` pb / submit | 520px / static / 0px border-top / 18px / 35px, bottom 535 | **identico** |
| `pilot-editor` NUOVO: pannello / actions / body pb / submit bottom | 520 / — / 18px / **854** | 520 / **static**, border-top **0px**, background **trasparente** / 18px / **854** |
| `pilot-editor` MODIFICA submit bottom / reachable | 501 / true | **501 / true** |
| `instructor-editor` submit bottom / larghezza; sezioni | 478 / 115px; 744 e 948 | **478 / 115px; 744 e 948** |
| `.person-bottom-grid` | 252.5×2 / 332×2 / 488×2 (inline) | **identico** (classe) |
| `.person-expiries .student-row` | 4 tracce | **4 tracce**, header `display: grid` |
| widget Flotta della home | 1 traccia 287.34px a 1280 | **identico**, e **0** nodi `mobile-fleet-*` dentro |

**Mobile (le due deviazioni dichiarate) — 375px** (colonna "post fix" = dopo il secondo giro
sulla testata del ciclo di fix, review F3 — §12):

| superficie | pre-fix | prima consegna | post fix | nota |
|---|---|---|---|---|
| `.card-head` Flotta | **192px** | **221.84px** (4 righe) | **175px** | chip ed export sulla stessa riga; ogni controllo ≥44px, export incluso (F4) |
| `.card-head` Piloti | **149px** | **179px** | **175px** | 3 righe è il pavimento: 24 (padding) + 44 + 46 + 44 + 16 di gap = 175 contro un pre-fix che era esattamente tre righe da 35px |
| `.card-head` Istruttori | **150px** | **167.84px** | **121px** | "Ciclo pagamenti" + export sulla stessa riga |
| pagina Flotta (20 card) | **4313px** a 1 colonna | ~**1600px** a 2 colonne | idem | card 137.5×145 |

## 8. Blast radius, voce per voce

1. **I sei helper `^=`** — nessun testid nuovo comincia con `ac-card-`/`pilot-row-`: i nomi
   sono `mobile-fleet-card-{id}`, `mobile-pilot-row-{id}`, `mobile-instructor-row-{id}`.
   Verificato che ogni helper trova **1 solo** nodo per fixture (i sei file girano nella
   suite completa, §9). **Nessuno spec esistente è stato modificato.**
2. **`mobile-overview.spec.ts:39-51/209/224`** — `fleet-card-widget` resta 1 nodo e il widget
   contiene **0** testid `mobile-fleet-*` (asserito a 375 **e** 1280 dal test AC 6): AD-2
   rispettata rendendo la griglia mobile come FRATELLO di `FleetCardGrid`.
3. **`home-dashboard.spec.ts:147`** — `fleet-card-widget` visibile a 1280: invariato.
4. **`people-management.spec.ts:352`** (`getByText('Gestisci in Scadenze')` = 0) — nessun
   testo duplicato introdotto sui Piloti.
5. **`person-detail.spec.ts:61-68/217`** — la scheda persona non ha alberi mobile: le
   scadenze sono RI-DISPOSTE via CSS, quindi zero nodi di testo nuovi.
6. **`instructor-compensation.spec.ts:134-222` / `instructor-rates.spec.ts:69`** —
   `instructor-row-{id}`/`instructor-edit-{id}` invariati (i nomi mobile sono altri).
7. **`expiry-registration.spec.ts`, `flights.spec.ts:269`, `flight-reversal.spec.ts`,
   `billing.spec.ts`** — passano da queste pagine con testid esatti: invariati.
8. **`mobile-shell.spec.ts`** — non atterra qui: la copertura di geometria del fondo è
   scritta in `mobile-registries.spec.ts` (hit-test su ogni `.page a, .page button`).
9. **Tablet 641-900px (R1)** — misurato a 641 e 800: rail 64px, nessuna regola nuova attiva
   (`.fleet-mobile`/`.pilots-mobile`/`.instructors-mobile` `display: none`, `.so-actions`
   `position: static`), geometria identica al pre-fix.

## 9. Esito ONESTO della suite

- `npm run gates`: **PASS lint / PASS typecheck / PASS test (1689) / PASS build**.
- `e2e/mobile-registries.spec.ts` mirato, build di produzione, `E2E_REUSE_SERVER=1`:
  primo run **5 rossi** (tutti miei: volo bloccato da documenti mancanti 14.4, riga
  istruttore senza tariffa payout, `fleet-search` alto 19px, editor istruttore aperto da un
  testid `display:none` a 375, `.info-row` che sfora); dopo i fix **15/15 verde, exit 0**.
- **Primo run della suite completa `CI=1`** (build di produzione, DB ricreato da zero):
  **328 passed, 5 failed, 19 did not run — `E2E_EXIT=1`**. Le cinque:
  1. `mobile-registries.spec.ts` "barra ore" — **mia**, causa nel §1 correzione 11
     (catalogo `ExpiryType` globale sporcato da altre spec ⇒ `POST /flights` 422). Chiusa
     con l'override admin `force`; riverificata **sullo stesso DB sporco** (11 tipi
     bloccanti, 7 non miei): **15/15 verde, exit 0**.
  2-5. **`mobile-planning.spec.ts` × 4** (agenda del giorno, marcatore ORA, chip marche,
     multi-attore) — **NON mie, e l'attribuzione è provata, non affermata**:
     - forma unica del fallimento: mancano le righe d'agenda **FUTURE** del proprio fixture
       (3→2, 1→0, 1→0) e il marcatore ORA è 0 (esiste solo se c'è un movimento futuro OGGI);
     - la spec 15.4 dichiara nel proprio doc-comment la sua unica banda inutilizzabile:
       *"l'unica banda inutilizzabile è 23:40-00:20 Rome"* — le sue fixture di "oggi" sono
       `now ± 20 minuti`, quindi dopo le 23:40 il movimento futuro cade **domani** e sparisce
       dall'agenda di oggi;
     - **il run è partito alle 23:44 e quelle quattro sono fallite fra le 23:47 e le 23:50
       (ora di Roma), cioè dentro la banda dichiarata**;
     - nessun file toccato da questa story entra in quel percorso: `bookings/page.tsx`,
       `schedule.tsx` e `bookings-table.tsx` non sono nel diff, e i due reader nuovi sono
       chiamati solo da `fleet/page.tsx` e `pilots/page.tsx`;
     - controprova eseguita: la suite completa è stata **rilanciata dopo le 00:20** su DB
       ricreato da zero (§9-bis).
- **Verifica visiva** (screenshot 375px, tema chiaro e scuro, Flotta/Piloti/Istruttori +
  sheet aperto): ha trovato il difetto del chip che nessuna asserzione vedeva (§1 correzione
  12). Ripetuta dopo il fix: chip contenuto, ellissi visibile.

### 9-bis. Gate finale

**Suite completa `CI=1`, build di produzione, DB ricreato da zero — `E2E_EXIT=0`,
351 passed, 1 flaky (verde al retry), 8.0 min** (`2026-08-04T00:43 → 00:51`, log
`run8-full-suite-FINAL-green.log`). La catena serializzata ha girato per intero (i 19 test
"did not run" dei run precedenti erano l'effetto dell'abort, non un'esclusione).

Il run è stato raggiunto in tre passaggi, tutti documentati sopra:

| # | ora | esito | causa |
|---|---|---|---|
| 1 | 23:44-23:51 | 328 passed, **5 failed** | 1 mia (catalogo `ExpiryType` globale), 4 di `mobile-planning` dentro la banda oraria 23:40-00:20 che quella spec dichiara inutilizzabile |
| 2 | 00:22-00:29 | 331 passed, **2 failed** | 1 mia (asserzione che chiedeva a un controllo `aria-disabled` di essere hit-testabile), 1 di `mobile-planning` (`toISOString()` UTC per "domani" fra 00:00 e 02:00 Rome) |
| 3 | 00:32-00:40 | 332 passed, **1 failed** | mia: lo sweep di hit-test segnalava le righe che passano sotto la **top bar sticky**, che è per progetto |
| 4 | **00:43-00:51** | **351 passed, 1 flaky, exit 0** | — |

**L'unico flaky** è `flights.spec.ts:602` (`POST /api/v1/flights` → 422, verde al retry):
è **esattamente** l'accoppiamento a stato globale del §1 correzione 11 — un'altra worker
aveva appena creato un `ExpiryType` bloccante e la persona nuova di quel test risultava priva
del documento. Spec **non toccata** da questa story, difetto **pre-esistente**, e conferma
indipendente della diagnosi che mi ha fatto adottare `force` nel mio fixture. **TD nuovo.**

**Due spec esistenti toccate**, entrambe motivate (il piano di test prevedeva "nessuna
modifica"):
- `e2e/mobile-planning.spec.ts` — UNA riga: `"domani"` calcolato in **Europe/Rome** invece
  che in UTC. Il `?date=` è un giorno di calendario romano; fra 00:00 e 02:00 Rome
  `toISOString()` restituiva **oggi** e l'asserzione "nessun marcatore ORA in un giorno che
  non è oggi" andava rossa su un marcatore legittimo. Stessa classe di review 15.4 F1, una
  frontiera più in là. **Copertura invariata**, anzi resa vera a ogni ora.
- Nessun'altra: i sei helper `^=` e tutti gli altri spec sono intatti (AD-5 ha tenuto).

## 10. Debito tecnico da tracciare (già scritto in `sprint-status.yaml`)

1. **TD R-15.2-g CHIUSO** con le misure corrette; resta aperta la **riserva sticky** ratificata
   (in MODIFICA la barra si sgancia oltre la sezione identità) → 15.10 se il PO vuole R3 alla lettera.
2. **`.ac-card` desktop resta un `<div onClick>`** (R-15.5-i, sotto-decisione) → TD a11y.
3. **`--ink-3` su `--panel-2` = 4.34:1** sul desktop `.ac-model`/`.meter-row` → TD dark/a11y pass 15.10.
4. **TD 14.6 F4 confermato e misurato**: `account-section.tsx` resta non responsive —
   `.students` **802px** in un box da **226-296px** a 320/375/390. È l'UNICA eccezione
   dichiarata dell'asserzione AC 12 e la guardia la nomina esplicitamente.
5. **Catalogo `ExpiryType` globale mai ripulito** (`bookings.spec.ts`, `flights.spec.ts`):
   ogni tipo `blocksBooking = true` che una spec crea rende **ogni persona nuova** priva di
   quel documento e quindi bloccata su `POST /flights` (`findMissingBlockingDocuments`,
   14.4). Misurato: 11 tipi bloccanti su DB post-suite, 7 non di seed. Effetto osservato due
   volte: il mio fixture della barra ore (chiuso con `force`) e il **flaky** di
   `flights.spec.ts:602` nel run finale. Rimedio suggerito: le due spec cancellino il tipo
   che creano (o lo creino con `blocksBooking: false` dove non serve).
6. `sprint-status.yaml` **non è YAML valido** (riga 35, `last_updated` non quotato con `:`
   dentro): **pre-esistente**, verificato su `git show HEAD:` — non toccato.

## 11. Cosa NON ho fatto (dichiarato)

- Non ho convertito `.ac-card` desktop in `<button>` (TD sopra) né corretto il suo contrasto.
- Non ho reso responsive `account-section.tsx` (TD 14.6 F4, esplicitamente fuori scope).
- Non ho toccato `AircraftEditor` (AD-8), né la primitiva `SlideOver` (nessun `mobileFooter`).
- Non ho portato l'export in linguaggio mobile (R-15.2-c: è la 15.8).
- Non ho aggiunto `aria-modal`/focus-trap agli sheet (15.10).
- La composizione delle righe di sheet non è una funzione pura con unit (AD-6): §4-10.
- Non ho modificato nessuno spec e2e esistente.

## 12. Ciclo di fix della review (fix-15-5, Opus 5 xhigh — 2026-08-04)

Sette findings, tutti chiusi. Misure a runtime sulla build di produzione, DB fresco seedato.

| F | cosa è cambiato | evidenza (misurata, pre → post) |
|---|---|---|
| **F1** (Major) | il `sub` che finisce nel nome accessibile del dialog OMETTE i segmenti assenti invece di iniettare il segnaposto `—`: `fleet-console.tsx` (`based`/`fuelType` filtrati e uniti) e `subLineOf` in `pilots-console.tsx` (ritorna `''`, e il fallback è di chi RENDE: `—` sulla riga, `labels.cardTitle` sullo sheet). Guardia riscritta: `expectWellFormedSheetName` vieta `— —`, i segmenti vuoti e i segmenti-segnaposto, invece del cieco `split(' — ').length === 2` | `"Basato · — — I-ABCD · Tecnam P92 Eaglet"` → `"Basato — I-ABCD · Tecnam P92 Eaglet"`; test nuovo con un velivolo **senza carburante** e una persona **senza email né profili** |
| **F2** (Major) | lo sheet Istruttori porta le tre voci del pannello desktop (**Ore nel mese**, **Allievi recenti**, **Voli recenti come CFI**, dallo STESSO `GET /api/v1/instructor-compensation?personId=` del pannello, fetch **all'apertura dello sheet**, zero query in più sulla lista) e l'azione **"Vai alla scheda"** (`instructor-open-profile-mobile`, gemella di `pilot-open-profile-mobile`) | sheet a 375px: `ORE NEL MESE 1:00 · ALLIEVI RECENTI <allievo> · VOLI RECENTI COME CFI <data · nome · 1:00>`; 3 azioni tutte a 44px; `pageOverflow 0`, zero scroller nascosti, contrasti 18.79/15.74 (valori) e 4.85/5.72 (chiavi) |
| **F3** (Minor + PO) | secondo giro sulla testata col criterio ratificato: padding della testata mobile a `12px 16px` (quello di `.mobile-card-head`), `column-gap` 8px, chip a `padding 5px 10px`, glifo del check nascosto sul chip (lo stato resta `.btn.on` + `aria-pressed`) ⇒ chip ed export sulla **stessa riga** | **375px**: Flotta 221.84 → **175** (pre-fix 192 ✅), Istruttori 167.84 → **121** (150 ✅), Piloti 179 → **175** (149 ❌, **non raggiungibile**: 24 di padding + righe 44/46/44 + 16 di gap = 175, e il pre-fix 149 era esattamente tre righe da 35px). A **320px** la testata sale di 5px (221.84 → 227) perché F4 impone 44px all'export: costo aritmetico dichiarato. Filtro ON: 175 in entrambi i locale (era 227 in IT) |
| **F4** (Minor + PO) | `.registry-head > div:has(> .btn) > .btn{ min-height: 44px }` — solo il target, il menu resta alla 15.8 | trigger export 34.84 → **44px** su tutte e tre le console; guardia nello sweep ≥44px (locatore strutturale: l'`ExportMenu` non ha testid) |
| **F5** (Minor) | `.info-row .v` → `.person-identity > .info-row > .v`, con la classe nuova sulla card "Dati anagrafici" | `/ppr` a 375px: `overflow-wrap anywhere` → **normal**, `min-width 0px` → **auto** (identico a 1280); scheda persona invariata (`anywhere`/`0px` a 320/375/390, `normal`/`auto` a 641/800/1280, `pageOverflow 0` ovunque) |
| **F6** (Minor) | `.so-body:has(.so-actions)` → `:has(> .so-actions:last-child), :has(> :last-child .so-actions)`: il `padding-bottom: 0` vale solo dove la barra è l'ULTIMA cosa del corpo (è lì che la spinge in alto) | fondo del corpo a 375px: `pilot-editor` MODIFICA 0 → **18.31**, `instructor-editor` MODIFICA 0 → **17.69**, `aircraft-editor` MODIFICA 0 → **17.77**; **invariati** `pilot-editor` NUOVO (0.23) e `aircraft-editor` NUOVO (0.31), submit sempre `reachable: true` con `scrollTop 0` (375×560: bottom 548, `sticky`); desktop 641/800/1280 `padding-bottom 18px`, `position static`, pannello 520px — identico |
| **F7** (Minor) | TD riscritto e **chiuso**: `--ink-3` su `--panel-2` non è sotto soglia | rimisurato canvas→WCAG su `/dashboard/fleet` a 1280: **4.59 chiaro / 5.36 scuro** su `.ac-model` e `.meter-row`, e `contrastPair(--ink-3, --panel-2)` dà gli stessi numeri — il 4.34 del TD non riproduce (la review aveva misurato gli stessi 4.59/5.36 in modo indipendente) |

**Sweep ripetuto dopo il cambio di layout** (le 24 combinazioni della review: 4 superfici ×
320/375/390 × tema chiaro e scuro): `pageOverflow` **0**, scroller nascosti **[]**, controlli
sotto la tab bar o coperti **[]**, target < 44px nella testata/paginazione **[]**, testo sotto
4.5:1 **[]** — **0 combinazioni con findings**.

**Desktop invariato** (641/800/1280, misurato): `.registry-head` `padding 14px 18px`,
`gap 8px 10px`, altezze 106.69/106.69/63.84 (Flotta) e 149.53/106.69/63.84 (Piloti),
`.registry-search` 240/260, chip `padding 7px 12px` e glifo `display: block`, `.card-title`
visibile, i tre alberi mobile `display: none`.

**Discriminanza delle guardie nuove — provate ROSSE sul codice pre-fix.** Le sole modifiche a
`src/` e `messages/` sono state messe da parte (`git stash`) lasciando lo spec nuovo al suo
posto, ricostruita la build di produzione e rilanciato `e2e/mobile-registries.spec.ts`:
**5 failed / 11 passed** (`--retries=0`), una per finding, con il messaggio giusto:

| guardia | rosso sul pre-fix |
|---|---|
| F1 `expectWellFormedSheetName` | `Error: no two adjacent separators — Received: "Basato · — — I-AMSEC8OAEJSQ · P92"` (la vecchia `split(' — ')` era **verde** su questa stessa stringa) |
| F2 parità dello sheet istruttore | `toContainText` fallisce: `"…Tariffa payout 60,00 €/h Ore totali 1:00 Totale dovuto 60,00 € Modifica Paga Chiudi"` — nessun "Ore nel mese", nessun allievo, nessun volo, nessun "Vai alla scheda" |
| F3 chip ed export sulla stessa riga | `Error: chip pressed: still one row with the export menu — Received: false` |
| F5 `/ppr` non raggiunto dalla regola | `overflow-wrap/min-width` diversi da `normal/auto` sul modulo pubblico |
| F6 fondo del corpo in MODIFICA | `paddingBottom` `Received: "0px"` (atteso `18px`) |
| F4 target dell'export | stesso test di F3 (fallisce prima sull'asserzione della riga): la prova è la misura diretta, trigger **34.84px** pre-fix su tutte e tre le console a 320/375/390 |

Log del rosso: `scratchpad/discriminance-prefix-RED.log`. Ripristinate le modifiche, ricostruita
la build: **16/16 verde** sullo spec e **58/58** sul blast radius ristretto; il primo giro sul
blast radius completo (18 spec: `ppr-public`, i tre `aircraft-*`, `people-management`,
`person-profiles`, `person-detail`, `user-management`, `instructor-*`, i cinque `mobile-*`,
`home-dashboard`, `expiry-registration`) era **114 passed, exit 0**.

# Review Record — 15.5 (reviewer adversarial Opus 5 xhigh, fix-subagent Opus 5 xhigh — 2026-08-04)

Report integrale della review (evidenze, riproduzioni, misure): `15-5-review-report.md`.
Verdetto: **SHIPPABLE-WITH-FIXES**. Fix in `ff0bff7`.

## Arbitro della review (pre-fix)

`CI=1` su build di produzione, DB fresco: **E2E_EXIT=0 — 351 passed + 1 flaky (8.4m)** su 352
(`mobile-registries.spec.ts` 15/15). Il flaky era `billing.spec.ts:296` — il TD pre-esistente
che la story stessa elenca — NON il `flights.spec.ts:602` del run del dev (che in questo run
non si è ripresentato; la diagnosi del dev sull'accoppiamento `ExpiryType` resta confermata dai
dati: 11 tipi bloccanti sul DB post-suite, 7 non di seed). Gates verdi (1689 unit).

Il reviewer ha RIPROVATO le 8 guardie per iniezione (tutte rosse), il desktop a 641/800/1280 su
3 console + 4 pannelli + scheda persona + Panoramica, i testid AC 6 (1 nodo a 375 e 1280, zero
duplicati), il multi-attore sulla scheda persona (incluso l'attore multi-ruolo, con ripristino
verificato), i due reader nuovi (1 query ciascuno, valori incrociati in SQL), 24 combinazioni
viewport×tema, la parità i18n e l'assenza di token `var(--x)` non definiti nell'intero repo.

## Findings → fix

| # | Sev | Difetto (misurato dalla review) | Fix (prove nel report del fix e in §12 del Dev Agent Record) |
|---|---|---|---|
| F1 | MAJOR | `aria-label` dello sheet malformato su **115/121 velivoli** (`"Basato · — — I-ABCD"`: il segnaposto `—` entrava nel `sub` e la primitiva compone `sub — title`; stessa classe sulla riga Piloti senza email/profili) con **guardia CIECA**: `split(' — ').length === 2` è verde sul caso vietato perché `split` consuma i separatori adiacenti | i segmenti assenti vengono FILTRATI dal `sub` (ogni chiamante possiede il proprio fallback); guardia riscritta (`expectWellFormedSheetName`: vieta `— —`, segmenti vuoti e segnaposto) + test con velivolo senza carburante e persona senza email/profili. Rossa sul pre-fix: `"Basato · — — I-AMSEC8OAEJSQ · P92"` |
| F2 | MAJOR | lo sheet Istruttori PERDEVA il dettaglio desktop (`InstructorProfile`: ore nel mese, allievi recenti, voli recenti come CFI — irraggiungibili a 375px, `instructor-name-{id}` 32 nodi 0 visibili) e non aveva l'ingresso alla scheda persona | **decisione PO: assorbire** — `InstructorSheet` con fetch all'apertura (stessa API del pannello desktop, zero query per-riga): le tre sezioni + azione `instructor-open-profile-mobile` ("Vai alla scheda", chiave nei due locale). Misurato popolato a 375, 3 azioni ≥44px, contrasti 18.79/15.74 |
| F3 | minor | testate mobili PIÙ ALTE del pre-fix (Flotta 192→222, Piloti 149→179, Istruttori 150→168 @375) contro il beneficio su cui R-15.5-g era stata ratificata; record contraddittorio (§1 vs §7) | **decisione PO: secondo giro con criterio "≤ pre-fix mantenendo i 44px"** — `.registry-head` compattata (padding 12/16, gap 8, chip senza glifo): **Flotta 175 (≤192 ✅), Istruttori 121 (≤150 ✅), Piloti 175 (>149 ❌ — irraggiungibile per aritmetica: 3 controlli da 44px + padding + gap = 175; il pre-fix era fatto di righe da 35px)**. Documentato nel CSS, in §12 e nel budget e2e; sparito anche il salto del toggle (175→227 solo in IT, ora stabile). Record corretto |
| F4 | minor | trigger `ExportMenu` a **34.84px** contro i ≥44 di AC 3, senza guardia | **decisione PO: ora** — `min-height: 44px` ≤640px sulle tre console, dentro lo sweep ≥44px con locator strutturale; il redesign del menu resta alla 15.8 |
| F5 | minor | `.info-row .v` discendente raggiungeva il modulo PPR PUBBLICO (classe lezione 15.3 F1) | scope a `.person-identity > .info-row > .v`; `/ppr` misurato identico a prima a 375 e 1280, guardia nuova sul modulo pubblico |
| F6 | minor | `.so-body:has(.so-actions){padding-bottom:0}` azzerava i 18px in fondo ai due editor in MODIFICA | `:has` ristretto ai casi in cui la barra è davvero l'ultimo elemento: fondo 0→~18px sui tre editor in MODIFICA, invariati i NEW e il desktop (5 campi del fix 15.2 F3 misurati) |
| F7 | minor | il TD `--ink-3` su `--panel-2` citava 4.34, che non riproduce (review: 4.59/5.36) | rimisurato 4.59 chiaro / 5.36 scuro (sopra soglia 3:1) → TD **chiuso** in sprint-status con l'audit trail — deviazione di giudizio del fix-subagent, ratificata qui: un TD che descrive un non-difetto non va tenuto aperto |

## Verifiche del fix

Gates verdi (1689 unit); `mobile-registries.spec.ts` **16/16** (un test nuovo per F1);
blast radius completo **18 spec, 114 passed, exit 0**; prova di discriminanza per stash
del src (spec tenuto, rebuild, `--retries=0`): **5 failed / 11 passed** sul pre-fix,
tutto verde al ripristino. Sweep della review RIPETUTO dopo il cambio di layout:
**24/24 combinazioni** (4 superfici × 3 larghezze × 2 temi) senza findings.

## Gate finale

- Arbitro finale, `CI=1` su build di produzione, DB fresco, stato committato: **353 passed (8.9m), E2E_EXIT=0 — zero failed, ZERO flaky** (353 = 352 + il test nuovo della guardia F1)
- `npm run gates`: **verde** (lint 20s, typecheck 3s, 1689 unit, build 33s)

## Ratifiche PO sopraggiunte in review (3, 2026-08-04)

1. **F2 → assorbire il dettaglio nello sheet** (non "Vai alla scheda" da solo, non il pannello riusato).
2. **F3 → secondo giro con criterio misurabile** "testata ≤ pre-fix mantenendo tutti i target ≥44px,
   altrimenti documentare e accettare" — esito: 2 su 3 centrate, Piloti accettata con la prova aritmetica.
3. **F4 → 44px subito** sul trigger dell'export (redesign in 15.8).

## TD (in `sprint-status.yaml`)

- Chiuso: `--ink-3`/`--panel-2` (F7, non-difetto rimisurato da due parti indipendenti).
- Restano i TD aperti dal Dev Agent Record (accoppiamento `ExpiryType` fra spec; card desktop
  `<div onClick>`; volume fixture per run — ora 8 velivoli + 21 archiviati, 9 persone, 2 voli).
