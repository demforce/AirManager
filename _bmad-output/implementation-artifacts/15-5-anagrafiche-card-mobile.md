---
baseline_commit: 0d82ba2
---

# Story 15.5: Anagrafiche a card — Flotta a griglia 2 colonne con barra ore, Piloti a riga con saldo e flag, e il salva primario in fondo ai due editor multi-form (R-15.2-g)

Status: **approved — ratifiche PO R-15.5-a..j TUTTE chiuse (2026-08-03), pronta per il dispatch al dev**

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
