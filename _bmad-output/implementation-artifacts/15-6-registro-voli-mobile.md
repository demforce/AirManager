---
baseline_commit: 5b23575
---

# Story 15.6: Registro voli mobile — lista a card con sheet di dettaglio, filtri in linguaggio mobile, registra/correggi/storna volo a tutto schermo coi comportamenti di dominio INVARIATI

Status: **approved — ratifiche PO R-15.6-a..i TUTTE chiuse (2026-08-04), pronta per il dispatch al dev**

## Ratifiche PO (chiuse 2026-08-04, batch AskUserQuestion in tre giri — la sezione Q1-Q9 in fondo porta fatti, opzioni e motivazioni; TUTTE le raccomandazioni del teammate accettate)

| R | Q | Decisione PO |
|---|---|---|
| R-15.6-a | Q1 | **Entrambe le facce** (admin E self-service) in un solo albero mobile: il ruolo decide i dati come già fa il server |
| R-15.6-b | Q2 | Card = **template + `Badge` SOLO se lo stato è anomalo** (priorità annullato > deroga > correzione); nello sheet orari/contaore/decolli/atterraggi/note, **non** il breakdown economico |
| R-15.6-c | Q3 | **Sheet per TUTTI i ruoli** (grammatica R-15.2-b e discendenza); azioni Correggi/Storna dentro lo sheet, gated `flights.manage` |
| R-15.6-d | Q4 | Storno = **`secondStep` nello stesso sheet + feedback nel toast** (focus alla textarea e ritorno al bottone, lezione 15.2 F1); niente mini-modal su mobile |
| R-15.6-e | Q5 | Testata = **chip strip sullo STATO + ricerca full-width + gli altri 5 filtri in un pannello "Filtri"** che applica in UNA navigazione (vincolo del remount con `key`, AD-4). Obiettivo ≈246px: il criterio "≤ pre-fix" della 15.5 è dichiarato irraggiungibile QUI per aritmetica — il target è la riduzione misurata da 266px, non un numero magico |
| R-15.6-f | Q6 | Export: **solo target 44px ora** (ratifica 15.5 F4 estesa alla superficie gemella); redesign alla 15.8 |
| R-15.6-g | Q7 | Tetto 100 del filtro Velivolo: **si SUBISCE** (TD della faccia picker resta aperto dov'è; e2e filtrano via `?aircraftId=`); niente typeahead (decisione utente 2026-07-21 sul `<select>` nativo), niente paginazione del select |
| R-15.6-h | Q8 | Lista self-service = **stessa card, senza azioni**; il caso istruttore-come-CFI (sub `· CFI ⟨nome⟩`) va VERIFICATO in e2e, non assunto |
| R-15.6-i | Q9 | **La KPI strip sostituisce la riga "Totali" su mobile**; guardia obbligatoria che MISURA la coincidenza dei 4 valori (mai dedotta); `logbook-totals-row` resta un nodo solo desktop |

## Story

As a amministratore che registra e controlla i voli dal telefono (piazzale, hangar, fine giornata al bar del campo),
I want vedere il registro come una lista di card leggibili con il dettaglio completo a portata di tocco, filtrare per periodo/velivolo/pilota/tipo/stato senza una testata alta due terzi dello schermo, e registrare, correggere o stornare un volo in un pannello a tutto schermo che si comporta ESATTAMENTE come sul desktop — guardia scadenze, deroga motivata, avviso saldo compresi,
so that il registro smette di essere una tabella larga il quadruplo dello schermo e la registrazione di un volo, che è l'operazione economicamente più delicata dell'app, non cambia una sola regola passando dal desktop al telefono.

E, come pilota/allievo/istruttore: vedere i **miei** voli (story 11.2) in quella stessa lingua, senza le azioni e senza i filtri che non mi competono.

---

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)`), **R2** (il template è incompleto by design: **la schermata Registro del template non ha filtri, export, paginazione, azioni di riga né sheet** — li progetta il team nello STESSO linguaggio, non li rimanda), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e azione primaria fissa in basso), **R4** (si porta TUTTO, **filtri e form inclusi**: nessuna superficie resta "tabella desktop scrollabile in orizzontale" come stato finale — ed è lo stato di oggi, misurato in §a.1), **R5** (logout/lingua già nel menu profilo, 15.1 — non si toccano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (15.1, in CLAUDE.md): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**. ⚠️ **Regola AD-5 della 15.5**: il suffisso `-mobile` è **illegale** dove esiste un selettore `^=` sul nome desktop. **Verificato per questa story** (`grep -rn 'data-testid\^=' e2e/`, 2026-08-04, 13 occorrenze): i prefissi in uso sono `pilot-row-`, `ac-card-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-fleet-card-`, `mobile-fleet-`. **Nessuno tocca `flight-`** ⇒ il suffisso `-mobile` è LEGALE qui (precedente esatto: `booking-row-mobile`, 15.4). La verifica va **rifatta dal dev** prima di scegliere ogni nome, e riportata nel record.

**Le quattro lezioni delle review 15.3/15.4/15.5 che questa story può violare davvero**:

1. **Guardia CIECA per costruzione** (15.5 F1, la più fresca): `expect(name.split(' — ')).toHaveLength(2)` era **verde proprio sul caso vietato**, perché `String.split` consuma il primo di due separatori adiacenti. Qui il rischio è identico e su una superficie identica: il `sub` dello sheet di un volo è una stringa composita (`marche · tipo`, e i voli storici hanno `departureAirfield`/`arrivalAirfield` **nullable**, `flights.ts:163-164`), e `BottomSheet` compone `` `${sub} — ${title}` `` (`bottom-sheet.tsx:61`). La guardia si scrive su una **proprietà** (`not.toMatch(/—\s*—/)`, nessun segmento vuoto, nessun segmento-segnaposto), mai su `split().length`.
2. **`text-overflow: ellipsis` nasconde gli sfondamenti allo sweep degli scroller** (15.5 F1/§12): lo sweep "nessun discendente con `scrollWidth > clientWidth`" esclude gli elementi ellissati, e un chip/badge che sfonda la riga passa inosservato. Serve, accanto allo sweep, una guardia di **CONTENIMENTO sul rect** (`child.right <= row.right`) per ogni oggetto che può crescere: qui il `Badge` di stato/deroga e la chip delle marche.
3. **Parità informativa enumerata contro TUTTO ciò che il desktop apre da quella riga** (15.5 F2): non basta coprire le colonne visibili. Sul registro il desktop apre da una riga **due** cose (`flight-cancel-action` → mini-modal con motivo; `flight-correct-action` → `FlightEditor` in modalità `correct`) e mostra **quattro** informazioni fuori colonna (badge Annullato + `cancelledDetail` con data e motivo, `correctionOf`, `correctedBy`, badge Deroga + `forcedDetail` col motivo). Vanno enumerate una per una.
4. **Fixture e2e indipendenti dall'ora e dentro i tetti dei picker** (15.4 secondo rosso, 15.5 §b): il DB reale ha **148 velivoli** e **305 persone**; il registro pagina a 20 su 64 voli. Nessuna asserzione può assumere "la mia fixture è a pagina 1", e nessuna fixture può dipendere dal catalogo `ExpiryType` globale (TD aperto: 11 tipi bloccanti su DB post-suite, 7 lasciati da altre spec) — si usa l'override `force`/`forceReason`, deterministico, come ha fatto la 15.5.

**Fonte visiva**: template `AirOps Mobile.dc.html` (+ `data.js`) — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/AirOps-Mobile.dc.html`. Lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de` (i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezioni in scope:

- **righe 283-297 — `Admin · Registro`**: testata (titolo 23px/600 + sub 12px `{{logbookSub}}` = "N voli registrati · ultimi 3 giorni"), poi **una card unica** (`background:var(--panel); border:1px solid var(--border); border-radius:14px; overflow:hidden`, `margin:0 16px`) con righe `grid-template-columns: 1fr auto; gap:10px; padding:11px 16px; border-top:1px solid var(--border); align-items:center`. Riga: a sinistra un blocco `min-width:0` con titolo 13px/600 = **chip mono 11px delle marche** + **nome pilota ellissato**, e sotto un sub mono 10.5px `--ink-3` ellissato; a destra un blocco `text-align:right` con **durata mono 12px/600 (`1.7h`)** e sotto **importo mono 10px `--ink-3`**.
- **script 666** — la meccanica del sub: `l.date + " · " + l.dep + "→" + l.arr + " · " + l.kind + (l.cfi !== "—" ? " · CFI " + l.cfi : "")`. Cioè **data · DEP→ARR · tipo [· CFI]**, esattamente le colonne che la card non porta a destra.
- **`data.js` 120-134** — il modello di riga del template: `{date, tail, pilot, cfi, dep, arr, kind, dur, takeoffs, landings, cost}`. Nota: `takeoffs`/`landings` **esistono nel dato e NON sono sulla riga** — il template li tiene per il dettaglio.
- **script 584-585 — `openFlight`** (il row-builder che il template usa per l'agenda, non per il registro): `sub = tail · kind`, `title = route`, `badge = stato`, righe `[Orario, Pilota, Istruttore, Aeromobile, Tipo]`. È la forma dell'API di `BottomSheet` (`{sub, title, badge, rows[]}`) e la base da cui partire per la parità (che qui deve essere **più ricca**, v. lezione 3).
- **Il template NON mostra** (⇒ R2, li progetta il team): i **filtri** (periodo, velivolo, persona, tipo, stato, azzera), l'**export**, la **paginazione**, la riga **Totali**, le **azioni di riga** (Annulla volo / Modifica), il **form** di registrazione e correzione, la **guardia scadenze** e la **deroga**, la **faccia self-service** del pilota, e il fatto che le righe del registro **non sono tappabili** nel prototipo (il VM `logbook` non ha `open`).
- **Non si portano** (assunzioni accettate del piano): orologio in topbar, "Accedi come".

---

## Ricognizione (2026-08-04, teammate story — verificata su file, righe e **misure a runtime** su build di produzione `npm run start`, DB reale post-suite: 148 velivoli / 121 attivi, 305 persone, 64 voli di cui 4 CANCELLED, 4 con deroga, 2 correzioni; il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 14.3/14.4/14.6/14.8/14.9 e in 15.1/15.2/15.3/15.4/15.5)

### a) Le superfici reali, misurate

#### a.1 — La tabella è larga **1344px** in 317 visibili, e la testata occupa **266px**

`src/app/[locale]/dashboard/logbook/` — 3 file:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 407 | server: gate `flights.manage` **oppure** `self.read` (82-86), `canForceExpiry = flights.forceExpiry` (90), `OPTIONS_PAGE_SIZE = 100` (33), `FLIGHTS_PAGE_SIZE = 20` (36), sanificazione difensiva di `dateFrom`/`dateTo`/`flightType`/`status` (43-53), **scoping dei filtri per ruolo** (96-104: `aircraftId`/`personId`/`personQuery` solo se `canManage`; `instructorPersonId` ammesso a un non-admin **solo se coincide col proprio `personId`**), clamp della pagina fuori range (144-148), `getFlightTotali` sul set filtrato INTERO (157), banner drill-down istruttore (206-227), `.kpi-row` a 4 KPI (229-234), **remount della console via `key={JSON.stringify({page, ...exportFilters})}`** (237) |
| `logbook-console.tsx` | 657 | client: `.card` + `.card-head` (352-444: 7 controlli + export + CTA), tabella `.logbook`/`.lb-row` a **11 colonne** (`COLS`, riga 179), riga **Totali** (537-559), paginazione (563-587), `FlightEditor` (590-604), **`.mini-modal` di storno** (606-654) |
| `flight-editor.tsx` | 1013 | `SlideOver` con prop **`footer`** — 17-18 campi, guardia 14.4 + deroga, pannello di esito |

**Misure a 375×812** (admin, IT, nessun filtro attivo; `.page` 375, `.card` 319, contenuto 317):

| superficie | valore | nota |
|---|---|---|
| `.logbook` | `clientWidth` **317** / `scrollWidth` **1344** ⇒ **1027px nascosti** | è la tabella più larga dell'epic: Piloti 785, Istruttori 437, prenotazioni 6 colonne |
| `.card-head` | **266px** di altezza (**309px** con un filtro attivo, cioè col bottone "Azzera"; **266px** anche in EN, su 7 righe) | contro **109px** a 1280px |
| primo `flight-row` | `top` **549** su un viewport 812 ⇒ **68% dello schermo prima della prima riga** (73% con un filtro attivo: 592) | il pre-fix Flotta che 15.5 contestava era il 47% |
| `.lb-row` (riga dati) | 317×**88** | 11 colonne compresse: la cella "tratta" va su 3 righe |
| overflow orizzontale **di pagina** | **0** | la tabella scrolla per conto suo (`.logbook{ overflow-x:auto }`, `airops.css:990`) ⇒ **una guardia sull'overflow di PAGINA sarebbe cieca**, esattamente la classe 15.2/15.3 F8/15.5 |
| `.kpi-row` | `display:flex`, `cw 375 / sw 703` | **già la strip della 15.2**, nulla da fare |
| paginazione | `1 / 4` — `flight-page-prev`/`next` **35px**, `flight-pagination-status` 20px | sotto i 44px |
| controlli della testata | date-from **37**, date-to **37**, velivolo **35**, **persona 18**, tipo **35**, stato **35**, azzera **35**, export **35**, "Nuova voce" **35** | ⚠️ i 18px del campo persona sono lo **stesso difetto misurato in 15.5 correzione 8**: `.search` centra i figli, il tap sul padding non dà fuoco a nulla |
| a **320×568** | `.card-head` **351px**, primo `flight-row` a `top` **635** | la prima riga è **sotto il fold** |
| controlli sotto la tab bar | **nessuno** (`covered: []`) | il `padding-bottom: 100px` di `.main` (15.1) regge già |

⚠️ **Difetto PRE-esistente misurato, da NON ereditare in silenzio e da NON correggere di straforo**: `.student-row > *, .lb-row > *{ min-width:0; overflow:hidden }` (`airops.css:991`) **taglia il testo delle celle senza ellissi**. Misurato a 375px: la sotto-riga "CFI ⟨nome⟩" ha `clientWidth 150 / scrollWidth 307` (157px tagliati, nessuna affordance); la cella data `110/124`. Lo stesso vale **a 1280px** (`.logbook` 990/1344 ⇒ 354px nascosti) e **nella fascia tablet** (641: 519/1344 ⇒ 825px nascosti). La card mobile deve avere `text-overflow: ellipsis` su ogni testo che può eccedere (lezione 15.5 §5-iv); la tabella desktop resta com'è (fuori mandato, TD da registrare).

#### a.2 — La testata ha **7 controlli**, e il riordino 15.5 alla lettera la fa PEGGIORARE (aritmetica)

Ordine reale dei figli di `.card-head` a 375px (misurato, 7 righe): `card-title` (20) · `spacer` · `filter-date-range` (37, due `DateInput` che vanno a capo a 320) · `flight-filter-aircraft` (35) · `.search` con `flight-filter-person` (34, input 18) · `flight-filter-type` (35) · `flight-filter-status` (35) · `ExportMenu` (35) · `logbook-new-button` (35). In più, condizionali: `flight-filter-reset` (35, quando un filtro è attivo) e `flight-cancel-feedback` (un `<p role="status">` che appare **dentro la testata** dopo uno storno riuscito, `logbook-console.tsx:355-359`).

**Aritmetica del riordino 15.5 alla lettera** (ogni controllo full-width e ≥44px, `.card-title` nascosto, padding 12/16 e gap 8 come `.registry-head`): periodo 44 + velivolo 44 + persona 46 + tipo 44 + stato 44 + [azzera|export] 44 + CTA 44 = 310, più 6 gap da 8 = 48, più 24 di padding ⇒ **382px**, contro i 266 di oggi. **Il criterio ratificato in 15.5 F3 ("testata ≤ pre-fix mantenendo tutti i target ≥44px") è irraggiungibile per aritmetica con 7 controlli in testata**: è il fatto che genera ⟨Q5⟩, e va deciso PRIMA di scrivere codice, non scoperto in review.

#### a.3 — Il form è **già** a tutto schermo con l'azione ancorata: R3 è soddisfatta, `.so-actions` NON va aggiunta

`FlightEditor` usa `SlideOver` con il prop **`footer`** (`flight-editor.tsx:693-720`), quindi la sua azione primaria vive in `.so-foot`, **fuori** da `.so-body`, ancorata a ogni larghezza per costruzione. Misurato sulla build di produzione:

| caso | pannello | `.so-body` scrollH/clientH | `.so-foot` | submit | `elementFromPoint` a `scrollTop 0` | `.so-actions` |
|---|---|---|---|---|---|---|
| NUOVO @375×812 | `0,0 375×812`, `border-left 0px` | 1036 / 659 | `bottom 812`, h 69 | **44px** | **`self`** | **0** |
| NUOVO @375×**560** (dove il corpo scorre davvero) | `0,0 375×560` | 1036 / 407 | `bottom 560` | **44px** | **`self`** | 0 |
| CORREGGI @375×812 | `0,0 375×812` | 1108 / 659 | `bottom 812` | **44px** | **`self`** | 0 |
| NUOVO @1280×900 | `760,0 520×900`, `border-left 1px` | 756 / 756 | `bottom 900`, h 60 | **35px** | `self` | 0 |

⇒ **Conclusione vincolante (AD-6)**: la modalità a tutto schermo della 15.2 + i 44px del fix 15.2 F5 (`.so-foot .btn`) coprono già R3 su questo form. Aggiungere `.so-actions` qui creerebbe **due barre ancorate nello stesso pannello**, che è esattamente il difetto per cui la 15.2 rinviò `pilot-editor`/`instructor-editor`. Il lavoro di questa story sul form è di **contenuto e comportamento**, non di geometria. Il TD "riserva sticky" di R-15.2-g (15.10) **non riguarda questo pannello**.

Layering verificato a 375px con la tab bar montata: col pannello aperto, `elementFromPoint` sul centro della `.mobile-tabbar` restituisce contenuto dello `SlideOver` (`so-foot` / `btn`), mai la barra.

#### a.4 — Lo storno vive in una `.mini-modal`, con un target da 35px

`logbook-console.tsx:606-654`: `.mini-modal` (z-index **60**) con `.mini-modal-card`, titolo, sotto-titolo (`marche — data — importo`), `textarea` `flight-cancel-reason` (maxLength 500), errore `flight-cancel-error`, "Chiudi" e `flight-cancel-confirm`. `submitCancel()` (320-347) valida il motivo **client-side senza chiamata di rete** se vuoto, poi `POST /api/v1/flights/{id}/cancel`, mappa il **409** su `conflictError`, chiude, azzera e fa `router.refresh()` + `cancelFeedback` (il `<p role="status">` in testata).

Misurato a 375×812: card **335×288** a `(20, 262)`, `flight-cancel-confirm` **35px** (sotto i 44), `elementFromPoint` = `self`. Cioè: **funziona, ma è l'unico overlay dell'app che non parla la lingua dell'epic** (R-15.2-a/b: la decisione vive nello sheet, il secondo passo dentro lo stesso nodo). ⟨Q4⟩.

Nota di dominio non negoziabile: **il motivo è obbligatorio nello schema** (`cancelFlightSchema = { reason: z.string().trim().min(1).max(500) }`, `schemas/flights.ts:226-228`) e lo storno è **irreversibile** (genera le transazioni di reversal, story 5.3): non è un'azione che si concede con un tap solo.

#### a.5 — I COMPORTAMENTI DI DOMINIO che il mobile deve preservare IDENTICI (enumerati con le righe)

| # | comportamento | dove | cosa deve restare vero su mobile |
|---|---|---|---|
| 1 | **Guardia scadenze 14.4** — 422 `FLIGHT_BLOCKED_BY_EXPIRY` | `flight-editor.tsx:602-627` | il banner nomina **OGNI** documento bloccante col suo **stato** (`documentExpiredOn` con la data **oppure** `documentMissing`, review F5: `expiresAt: null` = assente) e col suo **proprietario** (`documentRolePerson`/`documentRoleInstructor` + `personName`, review F6). Per un attore **senza** `flights.forceExpiry` quel messaggio è la risposta FINALE: nessuna affordance che prometta un bypass che non può usare (lezione 14.6 F2) |
| 2 | **Deroga admin motivata** | `flight-editor.tsx:637-684`, sezione `force-flight-section` (957-1008) | compare **solo** se `canForce` **e** dopo un 422; `force-flight-reason` è **obbligatorio** (submit vuoto ⇒ `force.requiredReason`, **zero richieste di rete**); il re-invio è `{...pendingForceBody, force:true, forceReason}` — **il corpo esatto appena rifiutato, l'operatore non ricompila nulla**; `resetForceState()` gira all'inizio di **ogni** submit; "Annulla" della sezione azzera stato **e** banner |
| 3 | **Il remount con `key` che ripulisce il payload force** (review 14.4 F1) | `logbook-console.tsx:592` (`key={editorTarget === null ? 'closed' : mode === 'new' ? 'new' : \`correct-${flight.id}\`}`) e `dispatch-flight-button.tsx:44` | chiudere/riaprire il pannello, o passare da un volo all'altro, **deve** ricostruire il componente: è la sola cosa che impedisce a un `pendingForceBody` stantìo di sopravvivere. Qualunque albero mobile che apra l'editor **deve passare per lo stesso `editorTarget`**, mai per una seconda istanza |
| 4 | **Invariante 14.3 su "Correggi volo"** | `flight-editor.tsx:395` (`isLocked = !isCorrecting && personIsStudentOnly`), 405 (`effectiveFlightType`), 413 (`showStudentOnlyCorrectionWarning`), 858/864 | in **correzione** il select Tipo volo **non è MAI `disabled`** e il valore iniziale è **quello a file** (`defaults.flightType`), mai riscritto a SCHOOL; in **nuova registrazione** `disabled ⇔ value === 'SCHOOL'` — una sola derivazione pilota `disabled` **e** `value`, così non possono divergere (review F2). Il valore **submesso** è `effectiveFlightType`, non il raw della form |
| 5 | **Avviso saldo** (14.4 AC 3, D1) | `flight-editor.tsx:776-792` (`flight-balance-alert`), risposta `registerFlightResponseSchema.balanceAlert` | non blocca (il volo È registrato); è un `role="status"` nel pannello di esito, insieme a `flight-forced-result` quando `forcedAt` è valorizzato |
| 6 | **`Idempotency-Key`** | `flight-editor.tsx:557` e 659, `useIdempotencyKey()` | inviato **solo** sulla registrazione (mai sulla correzione), **rigenerato dopo ogni risposta**, e lo **stesso** valore viaggia sul re-invio con `force` (è la stessa operazione, non una nuova) |
| 7 | **Motivo obbligatorio in correzione** | `flight-editor.tsx:483-485`, campo `reason` (913-925) | `markPlainRequiredFields()` marca velivolo/persona/motivo su **entrambi** i rami di `handleSubmit` (valid **e** invalid, review F2), e `focusFirstInvalid` porta il fuoco |
| 8 | **Typeahead persone TD-3 vs select velivolo cappato** | editor: `SearchCombobox` con `searchPilotStudent` (455-466) e `searchAircraft` (813) — **nessun tetto**; filtro: `<select>` seminato da `OPTIONS_PAGE_SIZE = 100` (`page.tsx:33`) | **misurato oggi**: il `<select>` `flight-filter-aircraft` ha **101 opzioni** ("Tutti i velivoli" + 100) contro **148 velivoli** in anagrafica ⇒ **48 velivoli non sono filtrabili**. È il TD aperto che cita questa riga per nome. ⟨Q7⟩ |
| 9 | **Masking per la faccia self-service** | `flights.service.ts:269` (`toListItem(flight, includeActorEmail, includeForceReason)`), 1489, 316 | `forceReason` è `null` e `actorEmail` assente per chi non ha `flights.manage`: la card e lo sheet mobile **non devono mai fabbricare** quei valori. Lo scope own-access è `personId === actor.personId` **OR** `instructorProfile.personId === actor.personId` (1416): **un istruttore vede anche i voli in cui era CFI**, dove il "pilota" della riga è un'altra persona |
| 10 | **409 sulla correzione** | `flight-editor.tsx:568-571` | `conflictError` distinto dal generico, mai confuso col 422 |

#### a.6 — RBAC e le due facce, misurate

| attore | `.card-head` @375 | controlli in testata | righe | azioni | note |
|---|---|---|---|---|---|
| ADMIN (`flights.manage` + `flights.forceExpiry`) | **266px** | periodo, velivolo, persona, tipo, stato, [azzera], export, "Nuova voce" | 20/pagina su 4 pagine | `flight-cancel-action`, `flight-correct-action` (solo su REGISTERED) | vede `forceReason` e la deroga |
| PILOTA (`self.read`) | **181px** | periodo, tipo, stato, export | 1 (i propri) | **nessuna** | sub di pagina: "1 voce · solo i tuoi voli"; KPI presenti (`1 · 0:25 · 1/1 · 50,00 €`) |
| ALLIEVO | come pilota | come pilota | i propri | nessuna | — |
| ISTRUTTORE | **181px** | come pilota | i propri **+ quelli in cui è CFI** | nessuna | sul DB attuale: 0 righe, empty state |

`logbook` è una voce di tab bar per **tutti** i ruoli (misurato: `mobile-tab-logbook` presente nella tab bar di pilota/allievo/istruttore, 15.1). **Non è un'area self** nel senso della 15.9 (che il piano definisce come `my-account`, `my-compensation`, "le mie transazioni", `/ppr` pubblico): ⟨Q1⟩.

#### a.7 — Il secondo consumer di `FlightEditor`: la Panoramica

`src/app/[locale]/dashboard/dispatch-flight-button.tsx` monta un `FlightEditor` **completo** ed è reso da `dashboard/page.tsx:506` dentro `.home-head-actions` — cioè **visibile a ≤640px** (R-15.3-d l'ha reso full-width sotto la sub-riga). Conseguenze:

- ogni riga toccata in `flight-editor.tsx` **cambia anche la Panoramica**, su desktop e su mobile;
- `dashboard/page.tsx:740` (`buildFlightEditorLabels`) **duplica deliberatamente** le label di `LogbookPage.editor.*`: ogni chiave nuova dell'editor va aggiunta **in due posti**, o la home la perde;
- `e2e/mobile-overview.spec.ts:504` e `home-dashboard.spec.ts:164/189` asseriscono `dispatch-flight-button` `toHaveCount(0)` per i non-admin: nessun testid nuovo dentro l'editor può moltiplicarsi lì.

#### a.8 — Le primitive 15.2/15.3/15.4/15.5 da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`** (86 righe): `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`. Compone `MobileSheet`; nome accessibile = `` `${sub} — ${title}` `` (riga 61); `onClose` **deve** essere referenzialmente stabile (`useCallback`, contratto a riga 37). Dal fix 15.3 F4 garantisce **uno sheet alla volta**.
- **`src/components/ui/mobile-sheet.tsx`**: scrim (`<testId>-scrim`), `Escape` montato solo da aperto, focus al pannello e **ritorno al trigger**, `role="dialog"`, z-index **40**. Senza `aria-modal`/focus-trap (è 15.10).
- **CSS già pronto, tutto dentro `@media (max-width:640px)`**: `.mobile-card-head/-title/-count/-empty/-foot` (`airops.css:2091-2096`), `.mobile-row` + figli (2103-2154: **UN solo `<button>` con figli `<span>`**), `.mobile-row-tail` (chip marche mono su `--bg-sunken`, 2135), `.mobile-row-name/-sub` (ellissati), `.mobile-row-side/-amount/-note` (15.5, 2584-2586 — **è esattamente la colonna destra "durata + importo" del template**), `.mobile-chip-strip > .btn` (2253-2269, pill 999px, mono 11px, ≥44px, scroll orizzontale senza scrollbar), `.registry-head` (2420-2477) e `.registry-pagination > .btn` (2483).
- **`.mobile-row` + `.mobile-row-side` coprono la riga del template senza una classe nuova**: `1fr auto`, `padding 11px 16px`, `border-top`, chip mono + nome ellissato + sub mono a sinistra, due valori impilati a destra. Il dev lo verifichi e lo dichiari; se serve un modificatore, ne serve **uno**, non una famiglia nuova.
- **`.ppr-card*`** (1861-1887) resta la famiglia sorella della coda PPR: la 15.3 ha deciso di **non** generalizzarla. Non riaprire quella decisione.

#### a.9 — `airops.css`: dove va la roba nuova, cosa non toccare

- File di **2649 righe**. Sezioni mobile: shell 15.1 **1666-1801**, primitive 15.2 **1802-1995**, panoramica 15.3 **1996-2192**, pianificazione 15.4 **2194-2350**, anagrafiche 15.5 **2352-2649**. Le regole nuove vanno **in coda**, in un blocco proprio `/* ---------- registro voli mobile (story 15.6) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** la riga `display:none` fuori-query per l'albero mobile (precedenti: `.ppr-queue-mobile` 1822, `.overview-mobile`/`.landing-mobile` 2022-2023, `.schedule-mobile`/`.bookings-mobile` 2239-2241, `.fleet-mobile`/`.pilots-mobile`/`.instructors-mobile` 2375-2377).
- **Mappa z-index in uso** (non introdurre valori nuovi senza una misura che li motivi): `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · popover/typeahead 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (a ≤640px sollevato, riga 1687).
- **Classi da NON usare come aggancio dello switch**: `.card`, `.card-head`, `.student-row` (13 console). `.logbook`/`.lb-row` sono usate **solo** da `logbook-console.tsx` (grep verificato), ma la convenzione dell'epic resta: lo switch va su **classi di pagina proprie**.
- **`.filter-date-range`** (1662-1663) è condivisa con `billing-console.tsx` e ha già la sua regola ≤640px (`flex-wrap: wrap`, fix 13.10 F4): qualunque regola nuova su quel nodo tocca **anche la contabilità** (che è 15.8). Usare `>` e ancorare alla testata del registro.
- `.page` = `padding: 22px 28px 60px` — è l'aritmetica su cui poggia il full-bleed della KPI strip ed è **asserita** da `mobile-primitives.spec.ts:188`.

### b) e2e e unit — il campo minato preciso

**Spec che vivono su questa pagina** (righe verificate il 2026-08-04):

| file | test | cosa fa | rischio per questa story |
|---|---|---|---|
| `e2e/flights.spec.ts` | 16 | il file di dominio del volo: registra, corregge, guardia scadenze + deroga, PIC, regole scuola. `getByTestId('flight-row').filter({hasText})` (251, 307, 524, 549, 640, 757), `logbook-new-button` (219), `flight-filter-aircraft` **`selectOption`** (521), `flight-filter-person` (638, 755), `page.getByTestId('flight-form').locator('.fld-hint')` (590, 676) | ⚠️ **il più esposto**. `flight-row` è letto **page-level**: un doppione mobile con quel testid lo rompe a 1280px. Il commento a riga 33-37 avverte già che un lookup page-level di `option` **matcha anche il `<select>` della testata** |
| `e2e/flight-log.spec.ts` | 4 | filtri + paginazione + faccia self-service: `flight-row` `toHaveCount(1/2/20)` **page-level** (237, 260, 264, 267, 351, 377, 402), `logbook-totals-row` (254, 396), `flight-filter-*` `selectOption`/`fill` (259, 266, 305-354), `flight-filter-reset` (34, 263), asserisce che il pilota **non** ha `flight-form`/`flight-cancel-action`/`flight-correct-action`/`flight-filter-aircraft`/`flight-filter-person` (229-234) | ⚠️ **`toHaveCount` page-level su `flight-row`**: è la causa di rottura n.1. E i suoi `toHaveCount(0)` sulla faccia pilota diventano **guardie della masking mobile** — non vanno indeboliti, semmai estesi ai nomi mobile |
| `e2e/flight-reversal.spec.ts` | 2 | storno + correzione: `flight-cancel-action` → `flight-cancel-reason` → `flight-cancel-confirm`, `flight-correct-action`, `flight-filter-aircraft.selectOption` (217, 273), `ac-card-{id}` **esatto** (207, 249), righe filtrate con `hasText: '02/01/2020'` + `has: flight-correct-action` (295, 308) | ⚠️ tocca **entrambe** le azioni che questa story sposta nello sheet; i suoi selettori di riga sono a match esatto, quindi sicuri, ma le azioni devono restare **presenti e con gli stessi testid nell'albero desktop** |
| `e2e/typeahead-pickers.spec.ts` | 5 | i tre `SearchCombobox` dell'editor (`flight-aircraft`, `flight-person`, `flight-instructor`), `logbook-new-button` (121, 167, 200, 231, 262) | rotto solo se l'editor cambia struttura |
| `e2e/exports.spec.ts` | 8 | `?aircraftId=` + `flight-row` `toHaveCount(1)` (266-267), colonne dell'XLS | l'export href deve continuare a riflettere **gli stessi filtri della lista** |
| `e2e/pdf-exports.spec.ts` | 9 | `?aircraftId=` + `flight-row` `toHaveCount(1)` (349-350) | idem |
| `e2e/person-detail.spec.ts` | 6 | `recent-flights-view-all` → `/dashboard/logbook?personId=…` (79, 112, 188-190) e poi `flight-row.filter({hasText:'Campo Prova'})` (191) | il deep link `?personId=` **non ha un controllo di filtro visibile** (13.5 AC 7) ma round-trippa: la testata mobile non deve perderlo |
| `e2e/people-management.spec.ts` | 13 | `recent-flight-row` sulla scheda persona (225) | superficie diversa (già a posto, §a.10) |
| `e2e/home-dashboard.spec.ts` | 6 | `dispatch-flight-button` `toHaveCount(0)` per i non-admin (164, 189) | l'editor è condiviso: v. §a.7 |
| `e2e/mobile-overview.spec.ts` | 14 | `DESKTOP_TESTIDS` asserita **= 1 nodo** a 375 **e** 1280 (39-51), `dispatch-flight-button` (504), `instructor-landing-logbook-cta` (506) | ogni testid nuovo che finisca dentro `FlightEditor` la rompe |
| `e2e/mobile-shell.spec.ts` | 5 | la tab bar del pilota include `logbook` (133) | nessun rischio, ma la geometria del fondo di **questa** pagina non è coperta lì: va scritta qui |
| `e2e/mobile-registries.spec.ts` | 16 | `instructor-profile-flight-row-mobile` (551-552) | nome già preso: **non riusarlo** |

**Tutta la suite gira a viewport desktop** (1280×720, `playwright.config.ts:13-19`) tranne gli spec mobile dedicati: un albero mobile `display:none` non la tocca — **ma un testid duplicato la rompe a qualsiasi viewport**.

**Stato globale**: questa story **non** scrive `AppSettings` ⇒ nessuno spec nuovo entra nella catena serializzata (`settings → booking-window → treasury-settings → billing-global`). ⚠️ Ma **crea voli**, e `POST /api/v1/flights` è accoppiato al **catalogo `ExpiryType` globale** (TD aperto: `findMissingBlockingDocuments` esige che OGNI tipo `blocksBooking` sia registrato e valido; misurati 11 tipi bloccanti su DB post-suite, 7 lasciati da `bookings.spec.ts`/`flights.spec.ts`). **Rimedio già collaudato (15.5 correzione 11)**: le fixture di volo di questa story usano l'override admin `force`/`forceReason`, deterministico qualunque sia il catalogo — e **non** vanno a toccare la guardia del guard-rail, che resta dov'è, in `flights.spec.ts`.

**Unit**: nessun test copre oggi `logbook/page.tsx` né `logbook-console.tsx`. I nuovi sono quelli di AD-5 (funzioni pure in `src/lib/`, che per costruzione non importano servizi e quindi non trascinano `@/lib/env` — verifica comunque `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`). Precedenti diretti: `src/lib/mobile-registries.ts`, `src/lib/mobile-agenda.ts`, `src/lib/booking-day-phase.ts`.

### c) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (`messages/it.json` + `messages/en.json`) — e, per l'editor, **anche** in `dashboard/page.tsx#buildFlightEditorLabels` (§a.7); segnaposto riempiti lato client → **`t.raw`**; suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground; build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** negli e2e per chiudere un popup dentro uno `SlideOver` (chiude tutto il pannello, review 14.3 F1); MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe; prima di attribuire un fallimento al lock TD-6, contare i `LoginAttempt` **falliti** (`login-throttle.ts:25`).

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — L'albero mobile vive DENTRO `logbook-console.tsx`, non in un componente di pagina parallelo.** Motivo dirimente (identico ad AD-1 di 15.4 e 15.5): quella console possiede **tutto** lo stato che le superfici mobile devono condividere — i 7 filtri con il debounce del campo persona, `editorTarget` (che pilota il `key` di remount, §a.5 n.3), `cancellingFlight` + motivo + errore + submitting + feedback, e i due pannelli (`FlightEditor` e `.mini-modal`). Un componente parallelo o duplica quello stato (due sorgenti di verità sul filtro) o duplica la rete.

**AD-2 — Si sostituisce il CORPO, non la card.** A ≤640px va a `display:none` **solo** la tabella, tramite una classe di pagina propria (es. `.logbook-desktop-body`), mai `.logbook`/`.lb-row` direttamente e mai `.card-head`. La testata resta **un solo nodo** con i suoi testid e la sua logica: la sua RESA mobile è ⟨Q5⟩, ma i testid desktop e la logica di navigazione non si duplicano — **salvo l'eccezione che ⟨Q5⟩ può introdurre, che va dichiarata e misurata** (v. AD-3).

**AD-3 — Se ⟨Q5⟩ sposta dei filtri in un pannello, si preferisce il NODO UNICO al doppio albero.** Due realizzazioni possibili, in ordine di preferenza:
  - **(preferita) nodo unico**: i controlli restano gli STESSI elementi React, avvolti in un contenitore che è `display: contents` sopra i 640px (zero box generato ⇒ i figli restano figli di flusso di `.card-head`, desktop invariato **per costruzione**) e diventa un pannello a tutto schermo sotto i 640px quando un attributo (`data-open`) lo apre. Zero testid duplicati, zero divergenza di valore, zero rischio strict-mode. **Va misurato pre/post a 641/800/1280** che il `display:contents` non muove nulla (è la sola incognita: un wrapper nuovo dentro un contenitore flex).
  - **(fallback) doppio albero**: i controlli sono resi due volte, pilotati dallo STESSO stato; i testid desktop restano sull'albero desktop e le copie mobile prendono il suffisso `-mobile`. Costo dichiarato: 5 testid nuovi e un secondo nodo per ogni filtro. Ammesso **solo** se il nodo unico è misurato non praticabile, con la misura allegata.

**AD-4 — Il pannello dei filtri, se c'è, applica in UNA navigazione.** Fatto misurato che lo impone: `page.tsx:237` remonta `LogbookConsole` con `key={JSON.stringify({page, ...exportFilters})}`, quindi **ogni** cambio di filtro distrugge lo stato locale della console — incluso un eventuale `filtersOpen`. Un pannello che navigasse a ogni `onChange` (come fa la testata desktop, `handleFilterChange` → `navigate`) si **richiuderebbe da solo dopo il primo tocco**. Il pannello mobile raccoglie quindi i valori in stato locale e naviga **una volta sola** su "Applica" (+ "Azzera"), nella grammatica R3 (header fisso col titolo e la X, azione primaria fissa in basso). È una divergenza di INTERAZIONE dal desktop, non di contratto: l'URL prodotto è identico. Va dichiarata nel record.

**AD-5 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test.** Valgono per: (i) la composizione della **sub-line** della card (`data · DEP→ARR · tipo [· CFI ⟨nome⟩]`) coi casi di confine reali — `departureAirfield`/`arrivalAirfield` sono **nullable** sui voli storici (`schemas/flights.ts:163-164`) e il desktop in quel caso mostra `noValue`; (ii) la scelta e la **priorità del badge di riga** (⟨Q2⟩: annullato / deroga / correzione / nessuno, e cosa vince quando ne valgono due — un volo annullato **può** essere anche una correzione e **può** essere forzato); (iii) la composizione del **`sub` dello sheet**, che finisce nel nome accessibile del dialog: i segmenti assenti si **omettono**, non si riempiono col segnaposto `—` (lezione 15.5 F1, riprodotta su 115 velivoli su 121). Restano pure ⇒ niente `@/lib/env`.

**AD-6 — `FlightEditor` non prende `.so-actions`.** Misurato in §a.3: il pannello è già a tutto schermo con l'azione ancorata dal prop `footer` e i 44px del fix 15.2 F5. Aggiungerla creerebbe due barre ancorate. Se il dev conclude diversamente, deve portare la misura che smentisce §a.3 **prima** di scrivere la riga.

**AD-7 — Un solo sheet aperto, un solo nodo per testid di sheet.** Il `BottomSheet` si rende condizionalmente (`{openRow ? <BottomSheet …/> : null}`, idioma di `mobile-booking-list.tsx:120`), così `mobile-flight-sheet` resta **un** nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). **Va asserito**, non assunto.

**AD-8 — Una sola logica di rete per i due alberi.** `submitCancel()` oggi legge `cancellingFlight` dallo stato: va parametrizzata sull'id (esattamente come `submitReject(id)` in 15.2 e `setUserActive` in 15.5) e riusata dallo sheet, **mai** riscritta. Stessi toast/`router.refresh()`/mappatura 409 su entrambe le facce.

**AD-9 — "Modifica" chiude PRIMA lo sheet, poi apre il pannello** (R-15.4-d, già ratificata: niente pannello z50 impilato su sheet z40) e passa dallo **stesso** `setEditorTarget({mode:'correct', flight})`, così il `key` di remount resta l'unico (§a.5 n.3).

---

## Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno riletti dopo le risposte del PO. Ogni misura si intende a **375×812** e ripetuta a **390×844** e a **320×568**, tema **chiaro e scuro**.

1. **(Lista a card — template 289-296) ⟨Q1⟩⟨Q2⟩⟨Q3⟩** A ≤640px la tabella `.logbook` è `display:none` **misurato** e al suo posto c'è una lista di card nel linguaggio del template: chip mono delle marche + nome del pilota ellissato, sub mono `data · DEP→ARR · tipo [· CFI ⟨nome⟩]` ellissato, e a destra **durata** (mono, 600) e **importo** (mono, `--ink-3`) impilati. Badge di riga secondo ⟨Q2⟩. Ogni card è **UN solo `<button>`** (figli `<span>`, **zero** elementi interattivi annidati, `min-height` ≥44px) con nome accessibile parlante che contiene **marche e data** (mai "Apri" da solo). L'empty state della lista mobile è **un solo nodo** proprio (`toHaveCount(1)`, non `toBeVisible()`), distinto dal `flight-empty` desktop che resta anch'esso un solo nodo. **Verifica misurata**: `display` di entrambi gli alberi a 375 **e** a 1280 (i due lati, mai uno solo); ispezione DOM: `card.querySelectorAll('button, a, input, select, textarea, [tabindex]').length === 0`; nessun testo della card con `scrollWidth > clientWidth` **e** `text-overflow !== 'ellipsis'` a 320px (lezione 15.5 §5-iv: la lettura letterale "nessun clipping" è impossibile insieme all'ellissi).

2. **(Sheet di dettaglio — R3, parità enumerata) ⟨Q2⟩⟨Q3⟩** Il tocco su una card apre il `BottomSheet` della 15.2 con `sub`/`title`/`badge`/`rows[]` modellati su `openFlight` (template 584-585) e **parità informativa verso TUTTO ciò che il desktop mostra o apre da quella riga** (lezione 15.5 F2), enumerata voce per voce nel record: le 11 colonne (data, tratta, pilota, **CFI**, aeromobile, tipo **+ solista**, durata, decolli, atterraggi, importo, **PIC** — `flightPicPerson`, story 11.2/12.8 AC 2), i quattro elementi **fuori colonna** (badge Annullato + `cancelledDetail` con **data e motivo**; `correctionOf`; `correctedBy`; badge Deroga + `forcedDetail` col **motivo**, quest'ultimo **solo** quando il server lo espone — masking §a.5 n.9), e i campi che il DTO ha e il desktop **non** mostra secondo ⟨Q2⟩ (orari di decollo/atterraggio, contaore, note). **Verifica**: apertura **da tastiera** (Tab reali + Enter, mai `focus()`); `mobile-flight-sheet` = **un solo nodo** (AD-7); il nome accessibile del dialog è **ben formato** — guardia su una **proprietà** (`not.toMatch(/—\s*—/)`, nessun segmento vuoto, nessun segmento uguale al segnaposto), **mai** `split(' — ').length` (lezione 15.5 F1, che era verde proprio sul caso vietato) — provata su un volo storico **senza** `departureAirfield`/`arrivalAirfield` e su uno **senza** istruttore.

3. **(Azioni di riga nello sheet — grammatica unica dell'epic) ⟨Q3⟩⟨Q4⟩** Le azioni ammesse dallo **stesso gate del desktop** (`canManage && status === 'REGISTERED'`, `logbook-console.tsx:509`) vivono **solo** nello sheet (R-15.2-b, confermata da R-15.3-b/R-15.4-d/R-15.5-i), `flex: 1`, `min-height: 44px`, riusando `.btn`/`.btn.primary`/`.btn.mini.*` — **nessun literal di colore nuovo**. "Modifica" **chiude lo sheet prima** di aprire il pannello (AD-9). Lo storno segue ⟨Q4⟩. Su una riga **CANCELLED** lo sheet non porta azioni (come il desktop) ma porta la lineage. Per la faccia self-service (⟨Q1⟩) lo sheet non porta **nessuna** azione. **Verifica**: e2e per attore (admin: 2 azioni; pilota/istruttore: 0), e su una riga CANCELLED 0 azioni con il motivo leggibile.

4. **(Storno a tutto tondo) ⟨Q4⟩** Secondo ⟨Q4⟩, e in ogni caso: il **motivo resta obbligatorio** (submit vuoto ⇒ errore inline e **zero richieste di rete**, provato con un contatore su `page.route`, non con l'assenza di toast); il **409** resta distinto dal generico; a esito riuscito la lista si aggiorna (`router.refresh()`) e la riga passa a CANCELLED sull'albero mobile **e** su quello desktop; la logica di rete è **una sola** (AD-8). **Verifica**: e2e a 375px su una fixture propria — motivo vuoto ⇒ 0 richieste; motivo reale ⇒ stato riletto **dall'API filtrata** sul volo run-unique (mai "la lista ha N righe": trappola 12.11 F1 / Billing-2 F4 / classe C della 15.3).

5. **(Filtri in linguaggio mobile — R2/R4) ⟨Q5⟩⟨Q6⟩⟨Q7⟩** Secondo ⟨Q5⟩. In ogni caso: **nessun filtro scompare** a ≤640px (R4) — periodo, velivolo, persona, tipo, stato, azzera restano tutti raggiungibili con lo **stesso** contratto URL di oggi (`?dateFrom&dateTo&aircraftId&personQuery&flightType&status`, sanificazione server-side invariata, `page.tsx:43-53`); il deep-link `?personId=` (scheda persona → "Vedi tutti", `person-detail.spec.ts:188-190`) e `?instructorPersonId=` (drill-down 9.3, col suo banner e il link "Rimuovi filtro") **continuano a round-trippare**; **ogni controllo ha `min-height` ≥44px** (incluso il campo persona, oggi **18px** per il centraggio di `.search` — stesso difetto misurato in 15.5 correzione 8, stessa medicina: l'altezza va sull'`<input>`) e **nessuno finisce sotto la tab bar**; gli **href di export riflettono gli STESSI filtri della lista** (`page.tsx:191-193`, guardato da `exports.spec.ts:266` e `pdf-exports.spec.ts:349`). **Verifica misurata**: altezza della testata mobile **pre/post** alle tre larghezze e in **entrambi i locale** (pre-fix misurato: **266px** @375 IT e EN, **309px** con un filtro attivo, **351px** @320), col criterio ratificato in 15.5 F3 — **testata ≤ pre-fix mantenendo ogni target ≥44px; se irraggiungibile, si porta l'ARITMETICA e si documenta** (§a.2 mostra che il riordino alla lettera darebbe **382px**).

6. **(Form a tutto schermo — R3 già soddisfatta, comportamenti INVARIATI)** A ≤640px il pannello di `FlightEditor` resta quello misurato in §a.3 (rect == viewport ±1px, `border-left 0`, header fisso, `.so-foot` ancorata a `bottom == viewport`, submit 44px, hit-testabile a `.so-body.scrollTop === 0` **anche su 375×560**, dove il corpo scorre davvero — lezione 15.4 iv), **senza** `.so-actions` (AD-6). E **tutti e dieci** i comportamenti di §a.5 restano identici, ciascuno esercitato a **375px** da un e2e o da una misura riportata nel record:
   - **(a) guardia 14.4**: registrazione bloccata ⇒ banner che nomina documento **+ stato (scaduto il ⟨data⟩ / assente) + proprietario (pilota o istruttore, col nome)**;
   - **(b) deroga**: la sezione `force-flight-section` compare **solo** con `flights.forceExpiry`; motivo vuoto ⇒ errore inline e **zero richieste di rete**; motivo reale ⇒ **201** con `forcedAt` valorizzato e `flight-forced-result` visibile nel pannello di esito;
   - **(c) niente affordance per chi non può derogare**: un attore `flights.manage` **senza** `flights.forceExpiry` vede il banner e **nessuna** sezione di deroga (oggi: nessun ruolo dell'app è in quello stato — se il dev non riesce a costruirlo, lo **dichiara** e prova la condizione con un unit/misura sul render, non la salta in silenzio);
   - **(d) remount**: chiudere e riaprire il pannello, o passare da un volo a un altro, azzera `pendingForceBody` (review 14.4 F1) — asserito, non dedotto;
   - **(e) invariante 14.3**: in **correzione** `flight-type-select` **non è mai `disabled`** e parte dal valore a file anche quando la persona è oggi allievo-solo (con l'hint `studentOnlyCorrectionHint`); in **nuova registrazione** vale `disabled ⇒ value === 'SCHOOL'`, verificato sulla **stessa** derivazione;
   - **(f) `Idempotency-Key`**: presente sulla registrazione, assente sulla correzione, **identico** fra il primo invio e il re-invio con `force`;
   - **(g) avviso saldo**: `flight-balance-alert` compare quando la risposta porta `balanceAlert: true` e **non** blocca;
   - **(h) 409** sulla correzione distinto dal generico;
   - **(i) motivo obbligatorio** in correzione, marcato su **entrambi** i rami di submit;
   - **(j)** i popover dei picker (z 65/66) restano **sopra** il pannello e interamente dentro il viewport, col bottone di conferma hit-testabile (**mai `Escape`** per chiuderli — chiude tutto il pannello, review 14.3 F1).

7. **(Paginazione e totali in linguaggio mobile — R-15.5-j) ⟨Q9⟩** La paginazione resta quella di oggi (stesso contratto `?page=`, stessi due `Link` con i loro testid) resa in linguaggio mobile: `.registry-pagination` (o equivalente ancorato con `>`), bottoni **≥44px**, hit-testabili **sopra** la tab bar. La riga "Totali" segue ⟨Q9⟩. **Verifica**: navigazione `1 / 4 → 2 / 4` a 375px con i filtri attivi preservati; misura dei due target; hit-test a fondo pagina.

8. **(Convenzione testid — nessun duplicato)** Desktop **invariati**: `flight-row`, `flight-empty`, `flight-takeoffs-cell`, `flight-landings-cell`, `flight-pic-cell`, `flight-status-badge`, `flight-forced-badge`, `flight-forced-reason`, `logbook-totals-row`, `logbook-new-button`, `flight-filter-date-from`, `flight-filter-date-to`, `flight-filter-aircraft`, `flight-filter-person`, `flight-filter-type`, `flight-filter-status`, `flight-filter-reset`, `flight-instructor-filter-banner`, `flight-instructor-filter-clear`, `flight-page-prev`, `flight-page-next`, `flight-pagination-status`, `flight-cancel-action`, `flight-correct-action`, `flight-cancel-panel`, `flight-cancel-reason`, `flight-cancel-confirm`, `flight-cancel-error`, `flight-cancel-feedback`, `flight-form`, `flight-type-select`, `flight-computed-duration`, `flight-result-panel`, `flight-result-total`, `flight-result-new-balance`, `flight-result-close`, `flight-forced-result`, `flight-balance-alert`, `flight-form-error`, `force-flight-section`, `force-flight-reason`, `force-flight-error`, `force-flight-submit`, `force-flight-cancel`, `flight-aircraft`, `flight-person`, `flight-instructor`. Le superfici mobile usano il **suffisso `-mobile`** dove duplicano una superficie desktop (`flight-row-mobile`, `flight-cancel-action-mobile`, `flight-correct-action-mobile`, `flight-cancel-reason-mobile`, `flight-cancel-confirm-mobile`, …) e il **prefisso `mobile-`** dove esistono solo su mobile (`mobile-flights-list`, `mobile-flights-empty`, `mobile-flight-sheet`, e quelli che ⟨Q5⟩ introduce). **Verifica obbligatoria prima di scegliere ogni nome**: `grep -rn 'data-testid\^=' e2e/` (AD-5 della 15.5), col risultato riportato nel record. **Verifica finale**: un `page.getByTestId(id)` per **ciascuno** dei testid desktop elencati restituisce **esattamente 1** nodo a 375px **e** a 1280px, su `/dashboard/logbook` **e** su `/dashboard` (dove `FlightEditor` è montato da `DispatchFlightButton`); suite completa verde in strict mode.

9. **(Geometria e layering, con la tab bar della 15.1 presente)** A 320, 375 e 390px, su `/dashboard/logbook` per **tutti e quattro** gli attori: **nessun overflow orizzontale di pagina**; **nessun contenitore interno con scroll orizzontale nascosto** (per ogni discendente di `.page`, `scrollWidth <= clientWidth + 1`), con l'elenco delle eccezioni **dichiarate** (la KPI strip 15.2 e la chip strip 15.4 sono scrollabili per progetto; la tabella desktop non conta perché è `display:none`); **nessun controllo finisce sotto la tab bar** (hit-test `elementFromPoint` su **ogni** `.page a, .page button, .page input, .page select` visibile a fondo pagina, metodo di `mobile-shell.spec.ts:174-205` — che però gira sulla **home**: questa pagina non è coperta, il test va scritto qui; baseline misurata oggi: `covered: []`, `barTop 745` in 812); lo sheet (z 40) copre la tab bar con lo scrim; il pannello del form (z 50) la copre del tutto (misurato: `elementFromPoint` sul centro della barra restituisce contenuto dello `SlideOver`); i toast (200) sopra tutto. **In più, la guardia di CONTENIMENTO** (lezione 15.5 F1/§12): per ogni card, ogni figlio che può crescere (badge di stato/deroga, chip marche, colonna destra) ha `child.right <= card.right` — perché lo sweep degli scroller **non vede** ciò che è ellissato.

10. **(Ogni regola nuova ha la sua guardia, provata DISCRIMINANTE)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` della tabella desktop a ≤640px; (ii) `display:none` dell'albero mobile >640px; (iii) la testata mobile secondo ⟨Q5⟩ — la guardia va scritta sul **lato che la regola libera** (l'altezza della testata e/o "il pannello filtri applica in una navigazione", non "il bottone esiste"); (iv) nessun testo clippato **senza ellissi** a 320px; (v) contenimento dei figli della card (AC 9); (vi) nome accessibile dello sheet ben formato, su **proprietà** e non su `split` (AC 2); (vii) empty state = **un solo** nodo per albero; (viii) i selettori nuovi **non raggiungono** il pannello `SlideOver` né la `.mini-modal` (lezione 15.3 F1: `.logbook-*` e `.registry-*` con `>`, e misura della larghezza dei bottoni del pannello pre/post); (ix) `.filter-date-range` non viene toccata per la contabilità (misura su `/dashboard/billing` a 375px pre/post); (x) le guardie dei comportamenti di dominio dell'AC 6 (almeno **d** — il remount che azzera il force — e **e** — l'invariante 14.3, entrambe invisibili a occhio). Ognuna va **provata rossa** simulando il pre-fix col repo **intatto** (iniezione CSS/`addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2, e `git stash` del solo `src/` con lo spec al suo posto, metodo 15.5 §12). Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

11. **(Invarianti)** Desktop >640px **invariato** su **entrambe** le pagine che rendono i componenti toccati (`/dashboard/logbook` **e** `/dashboard`, che monta `FlightEditor` — lezione 15.3 claim 3: "desktop invariato" ≠ "nient'altro è cambiato"): misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) sui valori già rilevati come baseline — `app` `grid-template-columns` `232px 1048px` / `64px 736px` / `64px 577px`; `.card-head` **109 / 152 / 152**; `.logbook` `cw/sw` **990/1344 · 678/1344 · 519/1344**; `.lb-row` `grid-template-columns` `92px 150px 150px 110px 130px 64px 55px 55px 100px 130px 150px` a tutte e tre; `.kpi-row` `display: grid`; `.filter-date-range` `flex-wrap: nowrap`; `pageOverflow 0`; tab bar `display: none` — più il pannello `SlideOver` aperto (larghezza **520**, `.so-body` `padding-bottom 18px`, `.so-foot` `bottom == viewport`, submit **35px**, `.so-actions` count **0**) e la `.mini-modal` di storno. `npm run gates` verde; **nessuna dipendenza nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale **e**, se tocca l'editor, anche in `dashboard/page.tsx#buildFlightEditorLabels`; contrasto delle superfici nuove **misurato** (canvas→WCAG, sfondo effettivo risolto risalendo gli antenati) ≥**4.5:1** per il testo e ≥**3:1** per gli oggetti grafici, in tema **chiaro e scuro**, **enumerando tutti gli esemplari** e non fidandosi dell'elenco (la 15.4 ha trovato un pallino a 1.76:1 e la 15.3 un glifo a 1.24:1 su superfici "ovvie"); gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

12. **(Multi-attore — lezione 15.1 F1) ⟨Q1⟩** La verifica per attore **non è opzionale**: ADMIN, PILOTA, ALLIEVO, ISTRUTTORE a **375 e 1280px**, con `page.context().clearCookies()` fra un'identità e l'altra. Per ciascuno: quali controlli di filtro sono presenti, quante azioni nello sheet, che cosa dice il sub di pagina, e che **la masking regge** (`forceReason` mai visibile a chi non ha `flights.manage` — asserito sull'albero mobile, non solo su quello desktop). Caso specifico da coprire perché è l'unico non ovvio: **l'istruttore vede anche i voli in cui era CFI**, dove il "pilota" della card è un'altra persona (`flights.service.ts:1416`).

13. **(Debito tecnico — dichiarato, non subìto in silenzio) ⟨Q7⟩** Il record dice per **ciascuno** dei TD che toccano questa pagina se la story lo **chiude**, lo **subisce** o lo **aggrava**, con la misura: (a) `OPTIONS_PAGE_SIZE = 100` del filtro Velivolo (misurato oggi: **101 opzioni per 148 velivoli** ⇒ 48 non filtrabili) — ⟨Q7⟩; (b) accoppiamento al catalogo `ExpiryType` globale (le fixture di volo usano `force`/`forceReason`); (c) il taglio senza ellissi delle celle di `.lb-row` a **ogni** larghezza (§a.1) — pre-esistente, **non** si corregge qui; (d) `viewport-fit=cover` mai dichiarato ⇒ tutti gli `env(safe-area-inset-*)` valgono 0 (TD di epic, 15.10); (e) la guardia AOG mancante su `POST /flights` (`flights.service.ts:496` non legge nemmeno `status`) — **story dedicata post-Epic-15**, questa story la **subisce** e non la introduce; (f) `billing.spec.ts:296` e `home-dashboard.spec.ts:228` — fragilità e2e pre-esistenti, subìte.

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):
1. **`flight-row` letto page-level con `toHaveCount` da 4 spec** (`flight-log.spec.ts:237/260/264/267/351/377/402`, `exports.spec.ts:267`, `pdf-exports.spec.ts:350`, `person-detail.spec.ts:191`, più i `filter({hasText})` di `flights.spec.ts` e `flight-reversal.spec.ts`). È la **causa di rottura n.1**: l'albero mobile non può riusare quel testid.
2. `flight-log.spec.ts:229-234` — la faccia pilota asserisce `toHaveCount(0)` su `flight-form`, `flight-cancel-action`, `flight-correct-action`, `flight-filter-aircraft`, `flight-filter-person`: se ⟨Q1⟩ include la faccia self-service, **i gemelli mobile di quei nomi devono essere 0 anche loro** (asserzione da estendere, non da indebolire).
3. `flight-reversal.spec.ts:217/273` e `flight-log.spec.ts:305/311/350/353/354` e `flights.spec.ts:521` — **8 call-site di `selectOption` su `flight-filter-aircraft`**: qualunque cambio di CONTROLLO (⟨Q7⟩ opzione B) li rompe tutti.
4. `flights.spec.ts:33-37` — il commento avverte che un lookup page-level di `option` matcha **anche** il `<select>` della testata: ogni `<option>` nuova che l'albero mobile introducesse allargherebbe quella collisione.
5. `mobile-overview.spec.ts:39-51` (`DESKTOP_TESTIDS` = 1 nodo a 375 **e** 1280) e `home-dashboard.spec.ts:164/189` — `FlightEditor` è montato anche sulla home (§a.7).
6. `typeahead-pickers.spec.ts:120-262` — i tre `SearchCombobox` dell'editor.
7. `person-detail.spec.ts:79/112/188-190` — il deep link `?personId=` deve continuare a funzionare **e** a filtrare.
8. `mobile-registries.spec.ts:551` — `instructor-profile-flight-row-mobile` è un nome **già preso**.
9. `mobile-shell.spec.ts` — **non** atterra su questa pagina: la copertura di geometria del fondo va **scritta qui**, non ereditata.

**Unit**: nessuno copre oggi queste superfici. I nuovi sono quelli di AD-5.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):
- la **fascia tablet 641-900px**: nessuna regola di questa story deve toccarla (R1) — misurare a 800 e 641px che nulla di nuovo compaia, che il rail resti 64px e che la testata resti 152px;
- il **tema scuro** delle superfici nuove — badge, chip marche, bordi e la colonna destra sono oggetti su `--panel`: **enumerare gli esemplari, non fidarsi dell'elenco**;
- la **Panoramica** a ogni larghezza (`FlightEditor` è montato lì, e le sue label sono duplicate a mano in `dashboard/page.tsx:740`);
- la **contabilità** (`/dashboard/billing`), se una regola tocca `.filter-date-range` senza ancorarla;
- il **`key` di remount** di `LogbookConsole` (`page.tsx:237`): qualunque stato locale nuovo (un pannello filtri aperto, uno sheet aperto) muore a ogni cambio di filtro o pagina — AD-4.

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-logbook.spec.ts`**, project `chromium` `fullyParallel` (non scrive `AppSettings` ⇒ **non** entra nella catena serializzata), `setViewportSize` **dentro il test** (pattern 13.10; nessun project Playwright duplicato — decisione di epic, riesame in 15.10). Copre: lista a card e non-clipping, sheet e parità, azioni e storno, filtri ⟨Q5⟩, paginazione, form a tutto schermo coi comportamenti di dominio, geometria/layering, multi-attore.
- **Modifiche a spec esistenti**: **nessuna prevista** se la convenzione testid è rispettata. L'unica estensione ammessa e auspicata è quella del punto 2 del blast radius (i `toHaveCount(0)` della faccia pilota estesi ai gemelli mobile), che **aumenta** la copertura. Ogni altra modifica va motivata nel record e non deve ridurre la copertura (lezione 14.6).
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-5, verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**
- Ogni test crea le **proprie** fixture (velivolo con targa run-unique, persona con cognome run-unique, volo con data/tratta run-unique) e le raggiunge **tramite i filtri della pagina** o via API filtrata — **mai** assumendo "la mia fixture è a pagina 1" (20 righe/pagina su 64 voli, e il DB cresce a ogni run).
- ⚠️ **Le fixture di volo usano l'override admin `force`/`forceReason`** (14.4 AC 2): il catalogo `ExpiryType` è globale e sporcato da altre spec (11 tipi bloccanti misurati, 7 non di seed) — è la medicina già collaudata dalla 15.5, deterministica qualunque sia il catalogo. La guardia del guard-rail resta dov'è, in `flights.spec.ts`.
- ⚠️ **Nessuna fixture può dipendere dal fatto che il proprio velivolo sia fra i primi 100** del `<select>` del filtro (⟨Q7⟩): se il test deve filtrare per velivolo, lo fa via **URL** (`?aircraftId=`), non via `selectOption`, e lo dichiara.
- Le fixture create alimentano i due TD aperti (tetto dei picker, volume delle liste): il dev deve dire **quante ne crea per run**.
- Attori: la pagina è aperta a **tutti** (`flights.manage` OR `self.read`) e la sua forma cambia col ruolo ⇒ verifica multi-attore obbligatoria (AC 12).

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)
- Sostituzione degli alberi: asserire **entrambi** i lati (tabella `none` + lista visibile a 375px; l'inverso a 1280px). Un solo lato lascia passare "ho nascosto tutto".
- Testata: **non** "il controllo esiste" — è l'**altezza misurata** contro il pre-fix (266/309/351) e la raggiungibilità di ogni filtro; se ⟨Q5⟩ introduce un pannello, la guardia è anche "applica in **una** navigazione" (AD-4), provata rossa navigando a ogni `onChange`.
- Nome accessibile dello sheet: guardia su **proprietà**, non su `split` (lezione 15.5 F1), provata rossa su una stringa con due separatori adiacenti.
- Contenimento: guardia sul **rect** dei figli della card, non solo lo sweep degli scroller (che è cieco sugli elementi ellissati).
- Comportamenti di dominio: il **remount** (AC 6d) e l'**invariante 14.3** (AC 6e) vanno provati rossi con un **rebuild** del difetto (metodo 15.2/15.5), non con un'iniezione CSS.
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). Baseline attesa: **353 test** (il totale della 15.5) più quelli nuovi. Se il dev non la completa, la **review la riesegue da arbitro** (prassi 13.9/13.11/15.2/15.3/15.4/15.5).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index), `15-2-primitive-mobile.md` (API delle primitive, R-15.2-a..g, guardia cieca, prova per rebuild), `15-3-panoramica-mobile.md` + `15-3-review-report.md` (guardie non cieche, selettore ancorato, il gemello va misurato), `15-4-pianificazione-mobile.md` + `15-4-review-report.md` (chip strip, fixture indipendenti dall'ora, guardia sul lato liberato), `15-5-anagrafiche-card-mobile.md` + `15-5-review-report.md` (AD-5 sui selettori `^=`, guardia cieca da `split`, ellissi che nasconde gli sfondamenti, parità enumerata, criterio testata ≤ pre-fix).
- Story di dominio da rileggere prima di toccare il form: `14-4-guardrail-registrazione-volo.md` (guardia + deroga + avviso saldo), `14-3-regole-voli-scuola.md` (invariante su "Correggi volo"), `11-2-logbook-registry-pic-person-access.md` (faccia self-service e PIC), `12-8-registro-voli.md` (la console attuale).
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/bookings/bookings-table.tsx` (albero mobile 15.4: chip strip + card + sheet con `secondStep`), `src/app/[locale]/dashboard/pilots/pilots-console.tsx` (sheet con azioni gated e conferma in due passi, 15.5), `src/app/[locale]/dashboard/ppr/ppr-console.tsx` (R-15.2-a).
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale, `JOBS_SECRET` da esportare — ⚠️ **misurato in questa sessione**: `npm run start` FALLISCE con il `JOBS_SECRET` di `.env`, che è ancora il segnaposto di `.env.example`; serve `export JOBS_SECRET=<valore non-segnaposto>` anche solo per servire la build. MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway lanciati **dalla root** con Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`; credenziali di seed `admin@airmanager.local` / `SEED_ADMIN_PASSWORD` di `.env`).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile list row two values", "mobile filter panel full screen", "destructive action confirmation mobile", "mobile form sticky action bar").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29: il codice UI lo scrive Opus 5; questa story è tutta UI). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.6): registro voli mobile — lista a card con sheet, filtri in linguaggio mobile, registra/correggi/storna a tutto schermo` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **Scadenze e Transiti** → 15.7; **Contabilità, Statistiche e Impostazioni** → 15.8 (incluso il **redesign** dell'`ExportMenu`, R-15.2-c: qui l'export cambia al massimo il target, ⟨Q6⟩); **aree self (`my-account`, `my-compensation`, "le mie transazioni") e `/ppr` pubblico** → 15.9.
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover` → **15.10**. La baseline di tastiera resta quella della 15.1 (focus al pannello, ritorno al trigger, Escape).
- **Riserva sticky di R-15.2-g** (`.so-actions` che si sgancia scorrendo) → 15.10, e **non riguarda** questo pannello (§a.3: qui l'azione è nel `footer`).
- **Il taglio senza ellissi delle celle di `.lb-row`** e la larghezza della tabella desktop (990/1344 a 1280px, 519/1344 a 641px): pre-esistenti, TD da registrare, **non** si correggono qui — toccare `COLS` o `.lb-row` è un cambio desktop.
- **La guardia AOG sulla registrazione del volo** (`flights.service.ts:496` non legge `status`): **story dedicata post-Epic-15**, con requisiti già fissati dal PO. Questa story ne subisce l'assenza e non la introduce.
- **`billing.spec.ts:296`**, **`home-dashboard.spec.ts:228`**, **`reports.spec.ts:307-315`** (PUT scheduling globale dal project parallelo), **accoppiamento `ExpiryType`**: TD pre-esistenti, subiti e non chiusi qui.
- Qualunque modifica alle API, agli schemi Zod o al dominio. Le sole modifiche server ammesse sono quelle che le ratifiche approvano esplicitamente (⟨Q7⟩, se il PO decide di chiudere il tetto del picker).
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/modalità full-screen di `SlideOver`: si **riusano**, non si reinventano.

---
---

# ASSUNZIONI DA RATIFICARE (BLOCCANTI) — **PRIMA** del dispatch al dev

> Regola di progetto (retro Epic 9, `sprint-status.yaml` AI-2, riconfermata dal piano epic 15: "Per ogni altro dubbio chiedi a me" — PO, 2026-07-29): un'assunzione scoperta in ricognizione si ratifica **prima** di implementare, mai spedita "da confermare" dentro il codice. Ogni domanda porta il **fatto misurato** che la genera, le **opzioni** e la **raccomandazione motivata** del teammate story.

### Q1 — Perimetro: solo la faccia ADMIN, o anche il registro self-service di pilota/allievo/istruttore?

**Il fatto**: la pagina ha **due facce** decise da `flights.manage` (`page.tsx:82-86`, `logbook-console.tsx:9-16`). Misurate a 375px: la faccia admin ha `.card-head` **266px** e una tabella **317/1344**; la faccia self-service ha `.card-head` **181px** e **la stessa** tabella 317/1344 (4 filtri invece di 7, zero azioni, zero CTA). `logbook` è una voce di tab bar per **tutti** i ruoli (misurato: `mobile-tab-logbook` nella tab bar del pilota) e **non** compare fra le "aree self" che il piano assegna alla 15.9 (`my-account`, `my-compensation`, "le mie transazioni", `/ppr` pubblico). Il piano descrive la 15.6 come *"Registro voli mobile — card list + filtri + registra/correggi volo full-screen col guard-rail 14.4 completo"*, senza distinguere le facce.

**Opzioni**
- **A — Entrambe le facce (un solo albero, il ruolo decide cosa vi compare).** La lista a card e lo sheet sono gli stessi; il pilota non vede le azioni (già gated dal `canManage` esistente) e vede 4 filtri invece di 7. Costo marginale ~zero (è il codice che c'è già, con i suoi `? :`), copertura e2e in più (AC 12).
- **B — Solo ADMIN adesso, faccia self-service rimandata a 15.9.** La 15.9 dovrebbe però ri-aprire lo stesso file e la stessa CSS, e nel frattempo tre ruoli su quattro continuerebbero a scorrere una tabella da 1344px con una tab bar che li ci manda.
- **C — Entrambe + la card "Voli recenti" della scheda persona.** Misurata: `recent-flight-row` è **già** un flex row con due valori, non una tabella — non c'è nulla da portare.

**Raccomandazione: A.** È lo stesso componente, lo stesso CSS e lo stesso sheet; l'unica differenza è quale ramo condizionale rende. Escludere la faccia self-service costerebbe **più** codice (una condizione in più per non renderla) e lascerebbe scoperta la voce di tab bar che ogni ruolo ha in prima pagina. C è una non-opzione (nulla da fare).

---

### Q2 — Che cosa vive sulla card, e che cosa nello sheet?

**Il fatto**: il desktop ha **11 colonne** più **quattro** elementi fuori colonna (badge Annullato + `cancelledDetail` con data e motivo, "correzione di", "corretto da", badge Deroga + `forcedDetail` col motivo). Il template mette sulla riga **solo** marche, pilota, `data · DEP→ARR · tipo [· CFI]`, durata e importo — e **non** rende le righe tappabili. Il DTO (`schemas/flights.ts:155-192`) ha inoltre tre cose che il desktop non mostra: **orari** di decollo/atterraggio, **contaore** (start/end) e **note**. Sul DB reale: 4 voli su 64 sono CANCELLED, 4 hanno una deroga, 2 sono correzioni.

**Opzioni** (la card; lo sheet in ogni caso porta la parità piena dell'AC 2)
- **A — Template + badge SOLO quando la riga non è "normale".** Card = template alla lettera (marche, pilota, sub, durata, importo) più un `Badge` a destra **solo** se la riga è CANCELLED, oppure forzata, oppure una correzione — con la priorità **annullato > deroga > correzione**. Una riga ordinaria non porta badge e resta pulita; una riga stornata **si vede subito**.
- **B — Template alla lettera, nessun badge.** Una riga stornata sarebbe **indistinguibile** da una valida sulla lista, e lo storno è irreversibile e ha effetti contabili: l'informazione più importante della lista sparirebbe.
- **C — Badge SEMPRE (tipo volo).** Duplica il `tipo` che è già nel sub e ruba larghezza al nome del pilota (misurato in 15.5: un `Badge` accanto a un identificatore su una card stretta gli lascia 7px di glifi).

**Sotto-decisione (i tre campi che il desktop non mostra)**: nello sheet mobile entrano **orari, contaore e note** (il mobile può mostrare **più** del desktop, mai meno — precedente R-15.2 AC 4 sulla coda PPR, dove provenienza/destinazione/note esistevano solo su mobile), mentre il **breakdown economico** (tariffa velivolo, importo velivolo, tariffa istruttore, importo istruttore) **non** entra: nemmeno il desktop lo mostra in tabella, vive nel pannello di esito dell'editor, e sarebbero 4 righe in più su 15.

**Raccomandazione: A** + la sotto-decisione come scritta. Motivo: è il template dove il template dice qualcosa, e dove tace (lo stato di un volo storno/correzione/deroga) applica la regola che l'epic usa da 15.2 — **il mobile non perde informazione**. La priorità annullato > deroga > correzione riflette la gravità decrescente per chi guarda la lista.

---

### Q3 — La riga del registro apre uno sheet?

**Il fatto**: nel template le righe del Registro **non** sono tappabili (il VM `logbook`, script 666, non ha `open` — a differenza di `agenda`/`pilots`/`instructors`/`fleet`). Ma le righe del registro **desktop** aprono due cose (Annulla volo, Modifica) e mostrano 11 colonne + 4 elementi di lineage: senza sheet, il mobile perderebbe **6 colonne e 2 azioni**. La grammatica dell'epic è già ratificata tre volte (R-15.2-b, R-15.3-b, R-15.4-d, R-15.5-i): dettaglio-riga = bottom sheet, azioni **solo** lì.

**Opzioni**
- **A — Sheet per tutti** (anche per la faccia self-service, dove porta solo il dettaglio e nessuna azione).
- **B — Sheet solo per chi ha `flights.manage`**: il pilota resterebbe con una card da 5 informazioni su 11 e nessun modo di vedere il resto.
- **C — Nessuno sheet** (template alla lettera): perde 6 colonne e 2 azioni per tutti. Viola R4.

**Raccomandazione: A.** È l'unica coerente con R4 ("nessuna informazione persa") e con la grammatica già ratificata; e per il pilota lo sheet è *l'unico* posto dove leggere contaore, decolli/atterraggi e il motivo di uno storno che lo riguarda.

---

### Q4 — Lo storno su mobile: dove vive l'azione, come si conferma, e dove va il feedback?

**Il fatto**: oggi lo storno vive in una `.mini-modal` (z 60) col motivo obbligatorio (`cancelFlightSchema` `min(1)`), il 409 mappato, e a esito riuscito un `<p role="status">` (`flight-cancel-feedback`) **dentro la testata della card**. Misurato a 375px: la modale è 335×288 e funziona, ma `flight-cancel-confirm` è **35px** (sotto i 44 che l'epic impone) e la modale è l'**unico** overlay dell'app che non parla la lingua dell'epic. L'operazione è **irreversibile** (genera le transazioni di reversal, story 5.3).

**Opzioni**
- **A — `secondStep` dentro lo stesso sheet** (R-15.2-a alla lettera, come il rifiuto PPR e il diniego prenotazione): "Annulla volo" sostituisce righe+azioni con la textarea del motivo + "Conferma"/"Annulla", **senza aprire un secondo overlay** e senza smontare lo sheet (il focus resta dentro il pannello — ⚠️ lezione 15.2 F1: entrando nel passo 2 il focus va portato alla textarea, tornando indietro al bottone che l'ha aperto, altrimenti finisce su `body`). La `.mini-modal` **resta** e serve il desktop, invariata.
- **B — Si tiene la `.mini-modal` anche su mobile** (funziona già a 375px), portando il solo target a 44px. Costo: una grammatica in meno da scrivere, ma un overlay z60 sopra uno sheet z40 — la sovrapposizione che R-15.4-d ha deciso di **non** introdurre — e due lingue diverse per la stessa classe di decisione.
- **C — Pannello a tutto schermo** per un solo campo di testo: sproporzionato, e la 15.2 l'ha già scartato per il motivo del rifiuto PPR.

**Sotto-decisione (il feedback)**: oggi l'esito è un `<p role="status">` **in testata**, non un toast — è l'unica pagina dell'app che fa così. Su mobile, dopo la chiusura dello sheet, quel paragrafo può finire fuori schermo. Due vie: **(i)** si tiene il `<p>` così com'è (zero codice nuovo, un solo nodo, ma l'esito può non essere visto); **(ii)** su mobile l'esito passa dal **toast** (`useToast`, host già sollevato sopra la tab bar dalla 15.1, z 200, la grammatica di tutto il resto dell'epic), lasciando il `<p>` al desktop.

**Raccomandazione: A + (ii).** Motivo: A è la grammatica già ratificata tre volte e mette la conferma **dove è iniziata l'azione**, che per un'operazione irreversibile è la cosa giusta; (ii) perché un conferma-e-poi-niente su un telefono è il modo più facile per far ripetere l'operazione a chi non l'ha vista andare a buon fine — e il toast host è già lì, sollevato, dalla 15.1.

---

### Q5 — I filtri (7 controlli) su mobile: quale forma prende la testata?

**Il fatto, con l'aritmetica**: la testata ha **7 controlli** + export + CTA e misura **266px** a 375px (309 con un filtro attivo, 351 a 320px, 266 anche in EN), contro i 109px di 1280px; la prima riga di volo comincia al **68%** dello schermo (73% con un filtro attivo). Il riordino ratificato in 15.5 (tutto full-width, ogni target ≥44px) darebbe **382px** — cioè **peggiorerebbe di 116px**, e il criterio "testata ≤ pre-fix" che il PO ha ratificato in review 15.5 (F3) sarebbe violato per **aritmetica**, non per esecuzione. In più: `page.tsx:237` remonta la console a ogni cambio di filtro, quindi qualunque pannello che navighi a ogni `onChange` **si richiude da solo** (AD-4).

**Opzioni**
- **A — Riordino 15.5 alla lettera.** Testata ~382px. **Sconsigliata**: peggiora la cosa che la story deve risolvere.
- **B — Una chip strip per UN filtro enum + ricerca persona full-width + gli altri in un pannello "Filtri" a tutto schermo.** Testata stimata: chip strip 64 + ricerca 46 + riga [Filtri (N) | Esporta] 44 + CTA 44 + gap/padding 48 ≈ **246px** (< 266 ✓). Sotto-scelta: la chip strip è **stato** (Tutti / Registrati / Annullati — 3 chip, precedente esatto `mobile-status-chips` di 15.4, e `?status` è già sanificato server-side) **oppure tipo volo** (Tutti / Turismo / Scuola / Lavoro aereo — 4 chip, il taglio che si usa più spesso). **Due** strip non stanno (128px di sole strip ⇒ ~310px totali).
- **C — Tutti e 5 i filtri dentro il pannello "Filtri".** Testata: riga [Filtri (N) | Esporta] 44 + CTA 44 + gap/padding 32 ≈ **120px** (−55% rispetto a oggi, la prima riga di volo salirebbe al ~30% dello schermo). Costo: anche il taglio più frequente costa 3 tap (apri → scegli → applica).
- **D — Nessun filtro su mobile.** Viola R4.

**In tutte le opzioni con pannello**: il pannello riusa la grammatica R3 (a tutto schermo, header fisso col titolo e la X, "Applica"/"Azzera" fissi in basso), **applica in una sola navigazione** (AD-4), e il bottone in testata **dichiara quanti filtri sono attivi** (altrimenti un filtro nascosto è un filtro dimenticato). Il periodo, il velivolo e la persona ci vanno comunque: sono un range di date, un `<select>` da 101 opzioni e un campo di testo con debounce — nessuno dei tre è una chip.

**Raccomandazione: B con la chip strip sullo STATO.** Motivi: (i) è l'unica che tiene a colpo d'occhio *il filtro che cambia il significato della lista* — un registro che mostra anche i voli **annullati** senza dirlo è il modo più facile per leggere numeri sbagliati; (ii) `?status` ha già il precedente esatto (`mobile-status-chips`, 15.4) e la sanificazione server-side; (iii) tiene la ricerca per nome sulla testata, che è il gesto più frequente di un admin che cerca "il volo di Rossi"; (iv) rispetta il criterio ≤ pre-fix con ~20px di margine misurabile. Se il PO preferisce il massimo guadagno verticale, **C** è difendibile e va scelta consapevolmente: costa 3 tap al filtro più frequente.

---

### Q6 — L'export su mobile: resta 15.8?

**Il fatto**: `ExportMenu` è nella testata (misurato 35px di trigger) e i suoi href riflettono già gli **stessi** filtri della lista (`page.tsx:191-193`, guardato da `exports.spec.ts:266` e `pdf-exports.spec.ts:349`). R-15.2-c assegna l'export mobile alla **15.8**; la review 15.5 (F4) ha però ratificato di portare **subito** il trigger a 44px sulle tre anagrafiche, lasciando il redesign del menu alla 15.8 — e la regola scritta allora (`.registry-head > div:has(> .btn) > .btn{ min-height: 44px }`) è **ancorata alla testata delle anagrafiche**, quindi non raggiunge questa pagina.

**Opzioni**
- **A — Stesso trattamento della 15.5**: solo il target a 44px qui e ora, menu e comportamento invariati, redesign in 15.8. Coerenza con le tre anagrafiche già consegnate.
- **B — Export invariato (35px)**: la pagina resterebbe l'unica con un controllo di testata sotto i 44px, e la review lo troverebbe (l'ha già trovato una volta).
- **C — Export dentro il pannello "Filtri"** di ⟨Q5⟩: è un'**azione**, non un filtro; e sposterebbe un menu che 15.8 deve comunque ridisegnare.

**Raccomandazione: A.** È la ratifica 15.5 F4 applicata alla superficie gemella, costa una riga di CSS ancorata, e non anticipa nulla di 15.8.

---

### Q7 — Il tetto `OPTIONS_PAGE_SIZE = 100` del filtro Velivolo: si chiude, si subisce o si alza?

**Il fatto, misurato oggi**: il `<select>` `flight-filter-aircraft` ha **101 opzioni** ("Tutti i velivoli" + 100) contro **148 velivoli** in anagrafica (121 attivi + 27 archiviati) ⇒ **48 velivoli non sono filtrabili**, e l'ultimo creato non c'è mai. È il TD aperto che cita `logbook/page.tsx:32` **per nome**; la faccia STATS è stata chiusa in review 15.4, la faccia PICKER è ancora aperta. Il rimedio in casa esiste (`SearchCombobox` + `searchAircraft`, che **l'editor di questa stessa pagina** usa già), ma: (i) il controllo a `<select>` è una **decisione esplicita dell'utente del 2026-07-21** (commento `logbook-console.tsx:261-264`: *"il filtro velivolo usa lo STESSO controllo di tipo/stato, no typeahead"*); (ii) **8 call-site e2e** fanno `selectOption` su quel testid (`flights.spec.ts:521`, `flight-log.spec.ts:305/311/350/353/354`, `flight-reversal.spec.ts:217/273`); (iii) è un cambio **desktop**, in una story il cui mandato è "desktop invariato".

**Opzioni**
- **A — Si subisce.** Il filtro resta un `<select>` cappato, ovunque viva su mobile; il TD si aggiorna con la misura di oggi (101/148). Le e2e di questa story filtrano per velivolo **via URL** (`?aircraftId=`), mai via `selectOption`, così non alimentano il fucile.
- **B — Si chiude ribaltando la decisione 2026-07-21**: `<select>` → `SearchCombobox` typeahead. Rompe 8 call-site in 3 spec (da riscrivere con l'helper `selectFromCombobox` che `flights.spec.ts:31` ha già) e cambia il desktop.
- **C — Si alza il tetto**: `listAircraft` paginato fino a `total` per le sole opzioni del filtro (precedente esatto: fix 15.4 F3 su `stats.service#listAllActiveAircraft`, deciso dal PO). Nessun controllo cambia, **zero** e2e rotti, ma su un telefono diventa un `<select>` nativo da 149 voci, e il costo cresce con l'anagrafica.

**Raccomandazione: A.** Il mandato della story è la UI mobile; B e C cambiano entrambi il desktop, e B ribalta per giunta una decisione presa dall'utente. Se il PO vuole chiuderlo comunque, **C** è la più economica e la meno rischiosa (una riga di servizio, nessun e2e toccato) — ma va detto che 149 opzioni in un `<select>` nativo su un telefono sono una lista di scorrimento, non un filtro.

---

### Q8 — La lista del pilota (self-service): stessa card o forma propria? ⟨dipende da Q1⟩

**Il fatto**: se ⟨Q1⟩ include la faccia self-service, la sua lista mostra **i propri voli**, senza azioni e con 4 filtri. Due particolarità misurate: (i) il pilota **vede l'importo** dei propri voli (la colonna esiste già oggi ed è la sua spesa — non c'è masking sul denaro proprio); (ii) un **istruttore** vede anche i voli in cui era CFI (`flights.service.ts:1416`), dove il "pilota" della card è **un'altra persona** — sul suo telefono la card direbbe il nome di un allievo.

**Opzioni**
- **A — Stessa card, stesso sheet, senza azioni.** Il nome sulla card resta **il pilota del volo** (che per l'istruttore è l'allievo), e il sub porta già `· CFI ⟨nome⟩` quando c'è: la riga resta leggibile e vera per entrambi i casi.
- **B — Card "invertita" per l'istruttore** (titolo = allievo, chip = ruolo "CFI"): richiederebbe una seconda forma di riga e una derivazione per attore, per un guadagno di chiarezza modesto (il sub lo dice già).
- **C — Card ridotta per il self-service** (senza importo): toglierebbe al pilota il dato che gli interessa di più e divergerebbe dal desktop, che glielo mostra.

**Raccomandazione: A.** Una forma sola, il sub porta già la distinzione CFI, e nessun dato viene tolto a chi oggi lo vede. La chiarezza del caso istruttore va **verificata in e2e** (AC 12), non assunta.

---

### Q9 — La riga "Totali" su mobile: si porta, o la sostituisce la KPI strip?

**Il fatto**: la riga `logbook-totals-row` mostra **minuti totali, decolli, atterraggi e ricavo** sul set filtrato **intero** (non la pagina), e la `.kpi-row` sopra la card mostra **gli stessi quattro numeri** dalla **stessa** fonte (`getFlightTotals` → `totals`, `page.tsx:157/229-234` e `logbook-console.tsx:537-559`) più il conteggio delle voci. A ≤640px la KPI row è **già** la strip a scroll-snap della 15.2 (misurata `cw 375 / sw 703`). Cioè: su mobile la riga Totali sarebbe una **ripetizione letterale** di ciò che sta 200px più in alto.

**Opzioni**
- **A — La KPI strip sostituisce la riga Totali su mobile.** Nessuna informazione persa (verificabile: stessa variabile `totals`), meno rumore, e la riga Totali resta intatta sul desktop. Va **provato** che i quattro numeri coincidono, non affermato.
- **B — Si porta anche la riga Totali** in fondo alla lista, in linguaggio mobile (un piede di card): coerente con la tabella desktop, ma ripete quattro numeri già presenti e allunga ogni pagina.
- **C — Si tolgono i KPI e si tiene solo il piede**: cambierebbe la Panoramica della pagina per tutti, KPI compresi, e i KPI sono ratificati dalla 12.8.

**Raccomandazione: A**, con l'obbligo di **misurare** la coincidenza dei quattro valori in e2e (e non di dedurla dal codice): se un giorno le due fonti divergessero, la guardia lo direbbe. `logbook-totals-row` resta **un solo nodo**, sull'albero desktop, e `flight-log.spec.ts:254/396` continua a leggerlo a 1280px senza modifiche.

---
---

# Dev Agent Record (dev subagent, Opus 5 xhigh — 2026-08-04)

Baseline: `e28f5be`. Ambiente: Fedora locale dell'utente, DB Docker resettato all'inizio e **di nuovo prima della suite finale**, build di produzione (`env -u NODE_ENV npm run build` + `npm run start`), Playwright MCP non raggiungibile → misure con script `playwright-core` throwaway nello scratchpad (mai committati). Skill applicate: `karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max` (query: *mobile filter panel full screen apply*, *destructive action confirmation mobile*, *touch target size mobile list row* → la sola regola pertinente e nuova rispetto all'epic e' il target 44px con >=8px di gap, gia' rispettata).

## 1. Verifica della ricognizione (misure rifatte, non fidate)

### Conferme (12)

| # | affermazione della ricognizione | misura mia |
|---|---|---|
| 1 | `.card-head` **266px** @375 IT **e** EN, **309** con un filtro attivo, **351** @320 | identiche (266 / 266 / 309 / 351) |
| 2 | `.card-head` **152** @641 e @800, **109** @1280 | identiche |
| 3 | `.logbook` `cw/sw` **317/1344** @375, **519/1344** @641, **678/1344** @800, **990/1344** @1280 | identiche |
| 4 | primo `flight-row` a `top` **549** @375 (68%), **592** con un filtro, **635** @320 | identiche |
| 5 | altezze dei controlli: date 37/37, velivolo 35, **persona 18**, tipo 35, stato 35, azzera 35, export 35, CTA 35 | identiche (il campo persona e' davvero 18px) |
| 6 | overflow orizzontale **di pagina 0** a ogni larghezza (la tabella scrolla per conto suo) ⇒ una guardia sull'overflow di pagina sarebbe cieca | confermato (0 a 320/375/390/641/800/1280) |
| 7 | §a.3 — pannello `FlightEditor` @375×812: rect `0,0 375×812`, `border-left 0px`, `.so-body` **1036/659**, `.so-foot` `bottom 812`, submit **44px**, `elementFromPoint` **self**, `.so-actions` **0** | identiche; **anche** @375×560 (body 1036/407, foot bottom 560, submit 44, self) e @1280 (760,0 520×900, border-left 1px, submit 35) ⇒ **AD-6 regge: nessun `.so-actions` aggiunto** |
| 8 | `.filter-date-range` `flex-wrap: wrap` <=640 / `nowrap` sopra | confermato |
| 9 | `.app` `grid-template-columns` `232px 1048px` / `64px 736px` / `64px 577px` | identiche |
| 10 | `.lb-row` `grid-template-columns` costante alle tre larghezze | confermato (`92px 150px 150px 110px 130px 64px 55px 55px 100px 130px 150px`) |
| 11 | ⟨Q9⟩ i 4 numeri della KPI strip **coincidono** con quelli della riga Totali | confermato e ora **misurato in e2e** (`9 · 14:20 · 12/12 · 2.229,17 €` contro `14:20 · 12 · 12 · 2.229,17 €`) |
| 12 | `grep -rn 'data-testid\^=' e2e/` → 13 occorrenze, prefissi `pilot-row-`, `ac-card-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-fleet-card-`, `mobile-fleet-`; **nessuno tocca `flight-`** | rifatto io, stesso risultato ⇒ il suffisso `-mobile` e' **legale** qui |

### Correzioni (7)

**C1 — §a.5 n.6 e AC 6(f) sono SBAGLIATI sull'`Idempotency-Key`.** La ricognizione dice che «lo **stesso** valore viaggia sul re-invio con `force` (e' la stessa operazione, non una nuova)». Il codice fa l'opposto, deliberatamente: `flight-editor.tsx:565` e `:667` chiamano `regenerateIdempotencyKey()` **dopo ogni risposta HTTP**, il 422 compreso, e il contratto e' scritto nero su bianco nel doc-comment di `src/lib/use-idempotency-key.ts` (story TD-2, AC 6): *"regenerated after ANY HTTP response, success OR an application-level error (422/409/…): a fresh submission attempt … must not collide with a completed or still-PENDING record under the OLD key"*; solo un **fallimento di rete** (nessuna risposta) conserva la chiave. Misurato sul filo: due UUID diversi. **Motivazione corretta dopo la review (LOW-4)**: la prima stesura scriveva che «riusare la vecchia chiave rischierebbe di rigiocare il rifiuto» — **falso**, e il reviewer l'ha misurato in DB: un tentativo **fallito LIBERA la chiave** (TD-2 AC 4, `e2e/idempotency.spec.ts:165` *"a failed attempt frees the key immediately"*), tanto che delle due chiavi osservate resta **una sola riga** in `IdempotencyRecord`, quella del 201. Il motivo vero della rigenerazione e' l'altro ramo dello stesso contratto: una chiave puo' restare **PENDING** lato server (risposta persa, richiesta ancora in volo) e un secondo invio sotto quella chiave otterrebbe un 409/una replica invece di registrare; rigenerare rende ogni tentativo indipendente per costruzione. Comportamento ed e2e restano quelli: l'e2e asserisce il contratto VERO (presente sulla registrazione, presente e **diversa** sul re-invio, **assente** sulla correzione).

**C2 — `.lb-row` "88px" e' un numero dipendente dai dati.** Misurato 105px con le mie fixture (nome pilota piu' lungo). Non contraddice nulla, ma non e' una costante da usare come baseline.

**C3 — la `.mini-modal` di storno misura 335×273** a 375×812 (e 420×273 a 1280), non 288. Il resto di §a.4 (conferma 35px, `elementFromPoint` self) e' confermato.

**C4 — `.mobile-row-side` NON e' drop-in su una riga a due colonne.** §a.8 dice che «`.mobile-row` + `.mobile-row-side` coprono la riga del template senza una classe nuova». Falso: dalla 15.5 quella classe porta `grid-row: 1; grid-column: 3`, cioe' la terza traccia della riga-persona. Su una griglia a due colonne finisce in una terza colonna implicita. Serve un modificatore, e sono **tre dichiarazioni** (non una): `.mobile-row-flight` (tracce `minmax(0,1fr) auto`), `> .mobile-row-side{ grid-column: 2 }`, `> .mobile-row-flag{ grid-row: 2; grid-column: 1 }`. Nessuna famiglia nuova: chip marche, nome, sub, importo, nota e badge restano le classi 15.3/15.4/15.5.

**C5 — AD-3 opzione "nodo unico" NON e' praticabile per i cinque filtri del pannello, e la misura e' aritmetica prima che sperimentale.** Il nodo unico impone che i controlli restino gli STESSI elementi React, quindi con lo stesso `onChange` → `handleFilterChange` → `navigate` del desktop. Ma AD-4 (fatto misurato: `page.tsx:237` remonta la console a ogni navigazione) impone che il pannello **applichi una volta sola**. Un solo elemento non puo' avere due semantiche di `onChange` senza leggere il viewport in JS, che l'architettura dell'epic vieta. Si e' quindi adottato il **fallback doppio albero** ma **solo per i quattro controlli che entrano nel pannello** (`flight-filter-date-from-mobile`, `-date-to-mobile`, `-aircraft-mobile`, `-type-mobile`) piu' `flight-filter-reset-mobile`: gli altri tre controlli di testata (ricerca persona, export, CTA) restano **nodo unico** ri-collocato in CSS, e il filtro **stato** non ha alcun gemello (le chip navigano da sole, come i `Link` della 15.4). Costo dichiarato: **5 testid nuovi col suffisso `-mobile`**, contro i 7 che il fallback integrale avrebbe richiesto.

**C6 — difetto di contrasto NON previsto dalla ricognizione, misurato e corretto**: `.bottom-sheet-sub` (primitiva 15.2, `airops.css:1831`) e' `--ink-4` e misura **3.66:1 (chiaro) / 4.14:1 (scuro)** su `--panel` — sotto il 4.5:1 che l'AC 11 chiede al testo. Sono **gli stessi due numeri** che la 15.4 misuro' su `.mobile-row-t2` e corresse con `--ink-3`. Applicata la stessa medicina, **una dichiarazione, solo colore**: 4.85 / 5.72. Solleva tutti gli sheet dell'epic (PPR, prenotazioni, piloti, istruttori, flotta, voli). Deviazione dichiarata al §7.

**C7 — difetto pre-esistente misurato e NON corretto**: sul desktop, `.search` largo 190px (il campo persona del registro) ha `clientWidth 188 / scrollWidth 190`. Non e' mio: iniettando `width:190px` sul `.search` della pagina Piloti (che non ho toccato) la stessa misura passa da `258/258` a `188/190`. E' guidato dalla larghezza, non dalla dichiarazione. Correggerlo sarebbe un cambio desktop, fuori mandato → TD.

## 2. Esito per AC, con le prove

| AC | esito | prova |
|---|---|---|
| 1 — lista a card | **fatto** | `.logbook` `display: none` a 375 **e** `.logbook-mobile` `none` a 1280 (entrambi i lati); card = **un solo `<button>`** con `querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`, `min-height >= 44`; aria-label parlante (marche · data · pilota); chip marche + nome ellissato + sub `data · DEP→ARR · tipo [· CFI nome]`; a destra durata (mono 600) e importo (mono `--ink-3`); badge solo se anomalo. e2e `mobile-logbook.spec.ts` test 1-4 |
| 2 — sheet e parita' | **fatto** | apertura **da tastiera** (`focus()` + `Enter` reali, poi `Escape` con ritorno del fuoco alla card); `mobile-flight-sheet` **un solo nodo**; 14 righe fisse (Data, Tratta, Pilota, Istruttore, **PIC**, Aereo, Tipo(+solista), Ore, **Orari**, Decolli, Atterraggi, **Contaore**, Costo, **Note**) + 3 condizionali (Deroga col motivo *solo quando il server lo espone*, Annullato con data e motivo, Storico con `correctionOf`/`correctedBy`); nome accessibile asserito **su proprieta'** |
| 3 — azioni nello sheet | **fatto** | stesso gate del desktop (`canManage && REGISTERED`); 2 azioni admin (44px), **0** su riga CANCELLED (col motivo leggibile), **0** per pilota/allievo/istruttore; "Modifica" chiude lo sheet **prima** di aprire il pannello (asserito: `mobile-flight-sheet` count 0 e `flight-form` visibile) |
| 4 — storno | **fatto** | motivo vuoto ⇒ **0 richieste** contate su `page.route` + errore inline; motivo reale ⇒ stato riletto **dall'API filtrata** sul volo run-unique (`CANCELLED` + `cancelReason` esatto), toast, e la riga passa ad "Annullato" su **entrambi** gli alberi; una sola logica di rete (`postCancel`, AD-8) |
| 5 — filtri | **fatto** | testata **175px** + chip strip **64px** = **239** contro **266** pre-fix (IT **e** EN); **239 contro 309** con un filtro attivo; **239 contro 351** a 320px; faccia pilota **69px** contro **181**; ogni target >= 44 (persona **18 → 44**, export 35 → 44, CTA 35 → 44, Filtri 44, chip 44); pannello che applica in **UNA** navigazione; `?personId=` e `?instructorPersonId=` round-trippano; href di export con gli stessi filtri |
| 6 — form | **fatto, invariato** | geometria pre/post **identica** (§1 conferma 7) su NUOVO e CORREGGI, a 375×812, 375×560 e 1280×900, `.so-actions` 0; (a) guardia che nomina documento + stato + **proprietario**; (b) deroga solo con `flights.forceExpiry`, motivo vuoto ⇒ **0 richieste**, motivo reale ⇒ 201 + `flight-forced-result`; (c) v. §6; (d) remount asserito; (e) invariante 14.3 su **entrambi** i rami; (f) v. C1; (g)/(h)/(i)/(j) v. §6 |
| 7 — paginazione e totali | **fatto** | `1 / 2 → 2 / 2` con `aircraftId` e `flightType` preservati; `flight-page-prev/next` **>= 44px** e hit-testabili a fondo pagina (`elementFromPoint` = self dopo scroll reale, mai `scrollIntoViewIfNeeded`); riga Totali **desktop-only**, un solo nodo, e i suoi 4 numeri **misurati uguali** ai KPI |
| 8 — testid | **fatto** | 10 testid desktop = **1 nodo** a 375 **e** 1280, su `/dashboard/logbook` **e** `/dashboard`; `flight-row` e `flight-row-mobile` hanno lo **stesso conteggio**; `grep 'data-testid\^='` rifatto (§1 conferma 12) |
| 9 — geometria/layering | **fatto** | a 320/375/390 (attore ADMIN) **e**, dopo il fix di review LOW-2, a 375 con un attore **NON admin** (ALLIEVO, stessa funzione di misura `pageGeometry`, non una copia piu' lasca): overflow di pagina **0**, `covered: []` (metodo 15.1 AC 6, scroll reale a fondo pagina), nessuno scroller interno fuori dalle eccezioni dichiarate (KPI strip 15.2, chip strip 15.4, e i nodi **ellissati**); contenimento sul **rect** dei figli della card = `[]`. *(La prima stesura scriveva «per admin e pilota»: il test iterava i viewport, non gli attori — corretto qui e nello spec.)* |
| 10 — guardie discriminanti | **fatto (con una eccezione dichiarata)** | tabella §4 |
| 11 — invarianti | **fatto** | desktop identico a 1280/800/641 su **entrambe** le pagine; `npm run gates` verde; **zero dipendenze nuove**; **nessun token cambia valore**, nessun literal di colore; ogni stringa in **entrambi** i locale; contrasti §5; suite finale §8 |
| 12 — multi-attore | **fatto dopo il fix di review LOW-2** | la prima stesura dichiarava «ADMIN / PILOTA / ALLIEVO / ISTRUTTORE a 375 e 1280» ma lo spec aveva **solo** pilota e istruttore, **solo** a 375, e **nessun** ALLIEVO. Ora, con `clearCookies` fra le identita': ADMIN (375 **e** 1280, test dei singleton), PILOTA (375 **e** 1280), ISTRUTTORE (375 **e** 1280), **ALLIEVO** (375 **e** 1280, test nuovo: badge "Deroga" presente, `forceReason` **mai**, 0 azioni nello sheet, `CFI ⟨istruttore⟩` nel sub); il caso non ovvio (istruttore che vede i voli in cui era CFI, con l'**allievo** sul titolo della card e `· CFI ⟨se stesso⟩` nel sub) **verificato**, non assunto |
| 13 — TD | **fatto** | §9 |

## 3. File toccati

- `src/lib/mobile-logbook.ts` (**nuovo**, 78 righe) — le tre derivazioni pure di AD-5 + `flightRouteLabel`.
- `src/lib/mobile-logbook.test.ts` (**nuovo**, 16 test) — verificato anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` (nessun `@/lib/env` trascinato).
- `src/app/[locale]/dashboard/logbook/logbook-console.tsx` — albero mobile, sheet, pannello filtri, `postCancel` condiviso, classi di aggancio.
- `src/app/[locale]/dashboard/logbook/page.tsx` — le 17 label nuove (`mobile.*`, `filtersCount` via `t.raw`).
- `messages/it.json` / `messages/en.json` — stesse 17 chiavi in **entrambi** i locale.
- `src/styles/airops.css` — blocco `registro voli mobile (story 15.6)` in coda (107 righe) + **una** dichiarazione dentro il blocco 15.2 (`.bottom-sheet-sub`, C6).
- `e2e/mobile-logbook.spec.ts` (**nuovo**, 24 test; **27 dopo i fix di review**: le due guardie xi/xii e il caso ALLIEVO di LOW-2).
- `e2e/flight-log.spec.ts` — **fix di review LOW-1**: l'estensione dei `toHaveCount(0)` ai gemelli `-mobile` e' stata **rimossa**, non indebolita: quei nodi esistono solo a sheet/pannello **aperti**, quindi contarli su una pagina chiusa e' verde anche per un admin (misurato dal reviewer) e non aggiungeva copertura. Al suo posto un commento che rimanda alla guardia vera, in `mobile-logbook.spec.ts`, che lo sheet e il pannello li **apre**. Le asserzioni desktop del file restano tutte.
- **NON toccati**: `flight-editor.tsx` (zero righe: il lavoro di questa story sul form era di verifica, non di codice — AD-6), `dashboard/page.tsx#buildFlightEditorLabels` (nessuna chiave nuova dell'editor ⇒ niente da duplicare), `.env.example`, CI, `.lb-row`/`COLS`.

## 4. Ogni regola nuova → la sua guardia → prova di discriminanza

Metodo: simulazione del pre-fix **col repo intatto** — iniezione CSS via `addStyleTag` per le regole di stile, modifica temporanea della funzione pura + `vitest` per la regola JS (metodo 15.5 §12; nessun rebuild necessario perche' il difetto e' in una funzione pura gia' coperta da unit).

| # | regola introdotta (difetto misurato) | guardia (sul lato LIBERATO) | pre-fix simulato | esito |
|---|---|---|---|---|
| i | `.logbook-desktop-body{display:none}` <=640 (tabella 317/1344) | `.logbook` `display: none` **e** lista visibile a 375 | `.logbook-desktop-body{display:flex}` | **ROSSA**: `table: none → flex` |
| ii | `.logbook-mobile{display:none}` fuori query (doppio match sul desktop) | `.logbook-mobile` `display: none` **e** tabella visibile a 1280 | `.logbook-mobile{display:block}` | **ROSSA**: `list: none → block` |
| iii | testata mobile: padding 12/16, titolo nascosto, 5 filtri nel pannello, ricerca full-width, target 44 | **altezza** testata+chip `<= 266` **e** ogni target `>= 44` | ripristino padding 14/18, titolo visibile, filtri visibili, `min-height: 0` sui target | **ROSSA**: `239 → 361`, persona `44 → 18`, export `44 → 35`, `allAtLeast44 true → false` |
| iv | ellissi su nome e sub della card | nessun testo con `scrollWidth > clientWidth` **e** `text-overflow != ellipsis` a 320 | `text-overflow: clip` su `.mobile-row-name`/`.mobile-row-sub` | **ROSSA**: `[] → [mobile-row-name, mobile-row-sub, …]` |
| v | `.mobile-row-flight` a `minmax(0,1fr) auto` + badge su riga propria in colonna 1 | **contenimento sul rect**: nessun figlio oltre il bordo destro della card | (a) badge che SPANNA le tracce; (b) badge spostato 150px; (c) valore lungo nella colonna destra | (a) e (c) **NON discriminanti** con i dati reali di questa pagina (le parole del badge sono corte e il nome e' ellissato): non sono riuscito a costruire uno sfondamento naturale — **dichiarato**; (b) **ROSSA** (`[] → mobile-row-flag:+77`) ⇒ il predicato **non e' vacuo**: la guardia resta di regressione |
| vi | `joinSegments` che **scarta** i segmenti assenti (nome accessibile del dialog) | proprieta' sul nome (`not.toMatch(/—\s*—/)`, `/·\s*·/`, nessun segmento vuoto, nessun segmento `—`) + 16 unit | rimosso il `.filter()` da `joinSegments` | **ROSSA**: 5 unit falliti (`'02/01/2020 ·  · Turismo'`, `' ·  · '`), tutti verdi dopo il ripristino |
| vii | empty state mobile in un nodo proprio | `mobile-flights-empty` count **1** e visibile, `flight-empty` count **1** e nascosto | iniezione **DOM** (non CSS): `node.parentElement.appendChild(node.cloneNode(true))` | **ROSSA** — dichiarazione **corretta dopo la review (LOW-3)**: la prima stesura diceva «non iniettabile» guardando alla sola iniezione CSS. Il reviewer ha mostrato la simulazione giusta e io l'ho rifatta: `{"before":{"mobile":1,"desktop":1},"after":{"mobile":2,"desktop":1},"guardWouldFail":true}` — con `toHaveCount(1)` il secondo nodo fa fallire la guardia, che quindi e' **discriminante**, non solo di regressione |
| viii | selettori di testata ancorati con `>` a `.logbook-head` (lezione 15.3 F1) | misura dei bottoni di `.so-foot` col pannello aperto, pre/post | (a) `.logbook-head .btn, .card .btn{…}` (variante discendente); (b) `.btn{…}` globale | (a) **NON discriminante** — e la ragione e' strutturale: il pannello non e' discendente ne' di `.logbook-head` ne' di `.card`, quindi nemmeno la variante sbagliata lo raggiunge; (b) **ROSSA** (`68x44,119x44 → 335x60,335x60`) ⇒ la misura **vedrebbe** un selettore che arrivasse fin li' |
| ix | nessuna regola tocca `.filter-date-range` (contabilita', 15.8) | `/dashboard/billing` a 375 **e** 1280, pre/post | build con `src/styles/airops.css` **ripristinato** dal repo (build vero, non iniezione) | **IDENTICO** byte per byte: `display flex`, `flex-wrap wrap`/`nowrap`, `gap 5px`, box `272×37`, `.card-head` 49, overflow 0 |
| x-d | il `key` che azzera `pendingForceBody` (review 14.4 F1) | chiudi/riapri ⇒ `.slideover.open` sparisce e riappare, `force-flight-section` **count 0**, `flight-form-error` **count 0**, `flight-person` vuoto | — | asserito in e2e (non dedotto). Difetto pre-fix riproducibile solo con un rebuild del codice 14.4: non rifatto, la guardia e' quella che 14.4 ha gia' pagato |
| x-e | invariante 14.3 in correzione | select **abilitato** e sul valore a file (`TOURISM`) con la persona oggi allievo-solo + hint; e sul ramo NUOVO `disabled` **e** valore `SCHOOL` | — | asserito in e2e sui **due** rami della stessa derivazione |
| **xi (fix review MINOR-2)** | `.mobile-row-flight > .mobile-row-flag .badge .b-dot{ display:inline-block }` (pallino **0x13**, cioe' non dipinto, sulla card) | e2e: per **ogni** chip di anomalia della card, `width`/`height` **>= 5** **e** contrasto del pallino contro il proprio pill **>= 3**, nei **due** temi | build **pre-fix** vera (la regola non c'era) | **ROSSA** sul pre-fix: `Annullato dot width in light ({"label":"Annullato","width":0,"height":13,"contrast":4.71})`, `Expected: >= 5 / Received: 0`. Verde post-fix (6x6). **Non-regressione della 15.5 misurata**: sulle card 15.5 (flotta 20 chip; piloti/istruttori 0 chip col DB corrente) il pre-fix simulato e' **identico** al post-fix, e un `.mobile-row-flag` con pallino **iniettato** sulla pagina Piloti resta `inline 0x13` mentre lo stesso markup dentro `.mobile-row-flight` misura `inline-block 6x6` ⇒ la regola non esce dalla card volo |
| **xii (fix review MINOR-1)** | il debounce della ricerca **annullato** all'apertura del pannello (pre-fix: navigava a 400ms e il `key` rimontava la console, chiudendo il pannello) | e2e: digita → apri il pannello → **oltre** il debounce il pannello e' ancora visibile e l'URL non e' cambiato; poi "Applica" porta ricerca **e** filtro nella stessa navigazione; e la chiusura senza Applica fa comunque atterrare la ricerca | build **pre-fix** vera | **ROSSA** sul pre-fix: `the panel must survive a pending debounce — element(s) not found` (il pannello era gia' sparito). Verde post-fix |

## 5. Contrasti misurati (canvas → sRGB → WCAG, sfondo effettivo risolto risalendo gli antenati; **enumerati**, non fidati dell'elenco)

`getComputedStyle` restituisce `oklch(...)` verbatim in Chromium: ogni colore e' stato **dipinto** su un canvas 1×1 e riletto in sRGB (una prima passata con parsing testuale dava 1.04:1 su un badge — misura falsa, scartata).

| oggetto | chiaro | scuro | soglia |
|---|---|---|---|
| `.mobile-row-name` (nome pilota, 13px/600) | 18.79 | 15.74 | 4.5 |
| `.mobile-row-sub` (sub mono 10.5px) | **4.85** | **5.72** | 4.5 |
| `.mobile-row-amount` (durata) | 18.79 | 15.74 | 4.5 |
| `.mobile-row-note` (importo, 10px) | **4.85** | **5.72** | 4.5 |
| `.mobile-row-tail` (chip marche) | 17.01 | 17.67 | 4.5 |
| `Badge.bad` "Annullato" (testo) | 8.38 | 7.46 | 4.5 |
| `Badge.warn` "Deroga" (testo) | 11.32 | 9.28 | 4.5 |
| `Badge` neutro "Correzione" (testo, 9.5px) | 9.05 | 10.63 | 4.5 |
| pallino di `Badge.bad` / `.warn` **sulla card** (oggetto grafico, ink fuso con `opacity .7` contro il proprio pill) | **4.71 / 4.81** | **4.43 / 5.40** | 3.0 |
| chip di stato attiva `.btn.primary` (testo) | 17.99 | 17.00 | 4.5 |
| chip di stato attiva (riempimento contro `--panel`, e' lo stato) | 18.79 | 15.74 | 3.0 |
| chip di stato inattiva (testo) | 18.79 | 15.74 | 4.5 |
| `.bottom-sheet-k` (chiave dello sheet, 10px) | **4.85** | **5.72** | 4.5 |
| `.bottom-sheet-v` / `.bottom-sheet-title` | 18.79 / 18.79 | 15.74 / 15.74 | 4.5 |
| `.bottom-sheet-sub` (over-line dello sheet) | **4.85** dopo il fix C6 (**3.66** prima) | **5.72** (4.14) | 4.5 |
| `.bottom-sheet-close` "Chiudi" | 9.99 | 9.47 | 4.5 |
| `.fld-label` del pannello filtri | 4.85 | 5.72 | 4.5 |
| `.so-title` del pannello filtri (19px/600) | 18.79 | 15.74 | 3.0 (testo grande) |
| `.iconbtn` ✕ del pannello | 9.99 | 9.47 | 4.5 |

Riempimenti dei `Badge` (1.10-1.38 contro `--panel`) e bordi di card/chip (1.18-1.45): **decorativi**, l'informazione e' la parola dentro il pill (e la 15.5 ha spedito gli stessi `Badge` sulle righe persona). Il `--ink-4` che 15.4 e 15.5 hanno gia' contestato **non compare** su nessuna superficie nuova di questa story dopo C6.

**Correzione della riga del pallino (review MINOR-2).** La prima stesura di questa tabella riportava per il pallino i numeri 8.38/11.32 e 7.46/9.28, che sono i contrasti del **TESTO** dei due pill: sulla card il pallino **non era dipinto affatto** (`.mobile-row-flag .badge{ display: block }` della 15.5 riportava `.b-dot` a elemento inline, dove `width`/`height` non si applicano — misurato **0x13**), quindi quella riga misurava un oggetto inesistente. Dopo il fix di review (`.mobile-row-flight > .mobile-row-flag .badge .b-dot{ display: inline-block; vertical-align: middle; margin-right: 5px }`, ratifica PO "dipingere il pallino") il pallino c'e' davvero, **6x6 come nello sheet e sulla riga desktop**, e i numeri qui sopra sono la sua misura vera, per variante e per tema:

| variante | pallino chiaro | pallino scuro | testo del pill (chiaro/scuro) |
|---|---|---|---|
| `Badge.bad` "Annullato" | **4.71** | **4.43** | 8.38 / 7.46 |
| `Badge.warn` "Deroga" | **4.81** | **5.40** | 11.32 / 9.28 |
| `Badge` neutro "Correzione" | **nessun pallino**: `statusChip()` non passa `dot` su questa variante (parita' col desktop, dove la discendenza e' testo, non un pill con pallino) | — | 9.05 / 10.63 |

Tutte sopra il 3:1 richiesto a un oggetto grafico. La regola 15.5 **non e' stata toccata**: i chip delle card 15.5 restano senza pallino e **misurati identici** pre/post (§4 riga xi).

## 6. Comportamenti di dominio di §a.5, uno per uno, esercitati a 375px

| # | comportamento | come e' stato provato |
|---|---|---|
| 1 | guardia 14.4 | e2e: registrazione di una persona **senza** documenti bloccanti ⇒ `flight-form-error` che contiene il ruolo (`pilota`), lo **stato** (`assente`/`scaduto il …`) e il **nome** del proprietario (asserito su `lastName` **e** `firstName`, perche' il server compone `firstName lastName` mentre il registro etichetta `lastName firstName` — dettaglio che ha fatto rossa la prima stesura) |
| 2 | deroga motivata | `force-flight-section` visibile **solo** dopo il 422 e **solo** con `flights.forceExpiry`; `force-flight-submit` con motivo vuoto ⇒ **0 POST** contati su `page.route`; motivo reale ⇒ `flight-result-panel` + `flight-forced-result`, 1 POST |
| 3 | remount col `key` | e2e dedicato: chiudi/riapri ⇒ `force-flight-section` 0, `flight-form-error` 0, `flight-person` vuoto. **Lo sheet mobile passa dallo STESSO `setEditorTarget`**: in `logbook-console.tsx` esiste **un solo** `<FlightEditor` (riga 931), col `key` invariato; l'altro consumer dell'app e' `dispatch-flight-button.tsx` sulla Panoramica, che non tocca il registro |
| 4 | invariante 14.3 | e2e sui due rami (correzione: `toBeEnabled()` + valore `TOURISM` a file + hint "solo il profilo allievo"; nuova: `toBeDisabled()` + valore `SCHOOL`) |
| 5 | avviso saldo | non esercitato in e2e su questa story: la fixture avrebbe richiesto un conto in banda peggiorativa e la superficie (`flight-balance-alert`, nel pannello di esito) e' **invariata** — zero righe toccate in `flight-editor.tsx`. **Dichiarato**, non silenziato |
| 6 | `Idempotency-Key` | e2e con `page.on('request')`: presente sulla registrazione, presente e **diversa** sul re-invio con force (v. C1), **assente** (`undefined`) sulla correzione |
| 7 | motivo obbligatorio in correzione | coperto da `flights.spec.ts` (invariato) e dal fatto che la correzione dal telefono passa per lo stesso form; l'e2e nuovo compila il motivo e ottiene il pannello di esito |
| 8 | typeahead TD-3 | i tre `SearchCombobox` sono invariati; usati a 375px in tre test nuovi (velivolo e persona), popover **sopra** il pannello e conferma cliccabile, **mai `Escape`** per chiuderli (si passa al campo successivo) |
| 9 | masking self-service | e2e pilota: lo sheet **non contiene** il `forceReason` (`not.toContainText('Fixture e2e 15.6')`) su un volo che *e'* forzato, e il badge "Deroga" resta (parita' col desktop: il server maschera solo il motivo) |
| 10 | 409 sulla correzione | invariato (`flight-editor.tsx:568-571`), coperto da `flight-reversal.spec.ts` |

**AC 6(c) — attore con `flights.manage` ma senza `flights.forceExpiry`**: **non costruibile** sul modello di ruoli attuale (dopo la 14.9 l'unica figura con `flights.manage` e' ADMIN, che ha anche `flights.forceExpiry`). Non l'ho simulato con un ruolo finto. La condizione e' pero' **strutturale e leggibile**: `flight-editor.tsx:637` rende la sezione solo `if (canForce)`, e `canForce` arriva da `page.tsx:90` (`hasPermission(actor, 'flights.forceExpiry')`). **Dichiarato come non esercitato**, come l'AC stesso ammette.

## 7. Decisioni non ovvie e deviazioni (con motivo)

1. **Chip strip dentro l'albero mobile, non dentro `.card-head`** (precedente esatto: `.bookings-mobile` della 15.4). Conseguenza sulle misure: l'AC 5 confronta 266 con **testata 175 + chip 64 = 239**, ed e' questo il numero che riporto (la sola `.card-head` sarebbe 175, un confronto lusinghiero e disonesto).
2. **Ordine delle azioni nello sheet invertito rispetto al desktop**: "Modifica" (primaria) prima, "Annulla volo" (`.btn.mini.bad`) dopo. Il desktop mette Annulla per primo. Motivo: lo storno e' **irreversibile** (genera le transazioni di reversal, 5.3) e su un telefono il primo bottone e' quello che il pollice trova. Nessuna informazione cambia, solo l'ordine.
3. **Feedback dello storno via toast su mobile** (ratifica R-15.6-d, sotto-decisione ii) e `<p role="status">` invariato sul desktop: implementato **senza** duplicare la rete — `postCancel(id, reason)` e' l'unica funzione che parla con l'API, i due chiamanti scelgono solo dove annunciare l'esito.
4. **Il pannello filtri non ha sottotitolo.** `SlideOver` lo renderebbe in `.so-sub`, che e' `--ink-4` (3.66:1) — una primitiva **desktop** che questa story non possiede e non puo' ricolorare senza ridipingere ogni pannello dell'app. Non passandolo, il nodo resta vuoto e il difetto non viene **esteso**. Dichiarato nel codice.
5. **Conteggio sul bottone "Filtri"**: conta i filtri **che il pannello nasconde** (periodo, velivolo, tipo), non tutti. Stato e persona sono in chiaro sulla testata: contarli renderebbe il numero un rumore. Il criterio e' scritto nel codice.
6. **`.mobile-row-flag` riusata per il badge di volo** con due dichiarazioni di ricollocazione, invece di una classe nuova: porta gia' `display:block`, `width: fit-content`, `max-width: 100%` ed ellissi, cioe' esattamente le tre cose che la 15.5 ha dovuto misurare per un chip su una card stretta.
7. **`.logbook-filter-range` e `.logbook-search`**: due `style` inline spostati in classi con **stile computato identico** sopra i 640px (misurato). Motivo tecnico, non estetico: un `display`/`width` inline non e' sovrascrivibile da una media query (la stessa lezione che la 15.5 ha pagato su `.registry-search`).
8. **Sub-line della card senza segnaposto**: su un volo storico senza aeroporti il segmento della tratta **sparisce** invece di diventare `—`. Nella riga del template il `—` sarebbe un secondo separatore; nello sheet la tratta ha comunque la sua riga, con il `—` che il desktop usa.
9. **`title` dello sheet = tratta, con fallback al pilota** (mai `—`): il template usa la rotta come titolo, ma la rotta e' nullable sui voli pre-11.1 e finirebbe nel nome accessibile del dialog (lezione 15.5 F1).
10. **(fix review MINOR-1) Semantica scelta per il debounce vs il pannello: il pannello ADOTTA la ricerca pendente.** All'apertura si **annulla** il timer (non lo si flusha: il flush *e'* la navigazione che chiuderebbe il pannello — sarebbe autolesionista) e si semina il draft con `personQueryInput`, cioe' il testo **come digitato**, non l'ultimo applicato: "Applica" manda ricerca e filtri del pannello nella **stessa unica** navigazione, che e' esattamente la regola di AD-4. Alla chiusura senza Applica (✕, scrim, `Escape`) si buttano le modifiche del pannello ma **non** la digitazione: il debounce viene ri-armato e la ricerca atterra da sola, come sarebbe successo se il pannello non fosse mai stato aperto. Nulla di digitato si perde in nessuno dei due rami, e sono entrambi asserti in e2e (§4 riga xii).
11. **(fix review MINOR-2, ratifica PO) Il pallino si dipinge anche sulla card.** Non si tocca la regola 15.5 (che ha una ragione misurata: `display:block` e' cio' che fa funzionare `text-overflow` sul pill) — si aggiunge **una** dichiarazione che vale **solo** dentro `.mobile-row-flight` e riporta `.b-dot` a `inline-block`, con `vertical-align: middle` e i `5px` di distacco che il `gap` del `.badge` flex dava sulle altre superfici. Cosi' la card, lo sheet e la riga desktop mostrano **lo stesso** oggetto per lo stesso stato, e i chip delle card 15.5 (che non chiedono `dot`) restano invariati — misurato, non dedotto (§4 riga xi).

## 8. Esito ONESTO della suite

- `npm run gates`: **PASS** (lint 21s · typecheck 3s · test **1705 passed** · build 32s), rieseguito dopo ogni modifica.
- Spec nuovo, run mirato su build di produzione (`E2E_REUSE_SERVER=1`): prima passata **19 passed / 4 failed / 1 flaky**, tutti e cinque **difetti dello spec, non del codice** — banner con `firstName lastName` (C1 del §1 no: dettaglio nome), `toBeHidden()` su un pannello chiuso che tiene il DOM montato, l'assunzione sbagliata sull'`Idempotency-Key` (**C1**), l'hit-test della paginazione senza scroll a fondo pagina, e un `framenavigated` di troppo contato prima dell'apertura del pannello. Seconda passata: **24 passed, exit 0** (`/tmp/airmanager-e2e/last-run.log`).
- Suite completa `CI=1` su build di produzione e **DB fresco**: due passate, §12.

**Giro dei fix di review (2026-08-04, DB resettato dalla sessione principale prima di iniziare).** Guardie scritte **prima** del codice e provate rosse su una build **vera** del pre-fix:

```
$ E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/mobile-logbook.spec.ts -g MINOR   # build PRE-fix
state: DONE — E2E_EXIT=1
  2 failed
    › the anomaly chip PAINTS its dot on the card too … (review 15.6 MINOR-2)
    › a search still in its debounce cannot pull the panel shut … (review 15.6 MINOR-1)
```

Dopo i fix, sulla build nuova:

```
$ E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/mobile-logbook.spec.ts e2e/flight-log.spec.ts
state: DONE — E2E_EXIT=0
  31 passed (40.3s)      # 27 mobile-logbook (24 + 3 nuovi) + 4 flight-log
$ npm run gates
PASS  lint (20s) · PASS  typecheck (4s) · PASS  test (7s) — 1705 passed · PASS  build (29s)
```

## 9. Blast radius, chiuso voce per voce

| voce | esito |
|---|---|
| 1. `flight-row` letto page-level con `toHaveCount` da 4 spec | **non toccato**: l'albero mobile usa `flight-row-mobile`. Misurato: i due conteggi sono **uguali** a 375 e a 1280, e nessun testid ha due nodi |
| 2. `flight-log.spec.ts:229-234` (faccia pilota) | **non indebolito** (le sue asserzioni desktop sono tutte li'). L'estensione ai nomi `-mobile` che avevo aggiunto era **vacua** — quei nodi vivono solo a sheet/pannello aperti (review LOW-1): rimossa e sostituita dal rimando alla guardia vera, che vive in `mobile-logbook.spec.ts` (sheet APERTO ⇒ `flight-cancel-action-mobile`/`flight-correct-action-mobile` **0** dove l'admin ne ha 2; pannello APERTO ⇒ `flight-filter-aircraft-mobile` **0**) |
| 3. 8 call-site di `selectOption` su `flight-filter-aircraft` | **intatti**: il controllo desktop non cambia, cambia solo la sua `display` sotto i 640px (dove nessuno spec desktop gira). Il gemello mobile e' un select **nuovo** dentro il pannello |
| 4. `flights.spec.ts:33-37` (lookup page-level di `option`) | **non allargato**: il select mobile del velivolo vive dentro il pannello, che e' reso **solo quando aperto** e apribile solo da un trigger `display:none` sopra i 640px ⇒ **zero `<option>` nuove** nel DOM desktop (verificato: a 1280 `flight-filter-aircraft-mobile` non esiste) |
| 5. `mobile-overview.spec.ts:39-51` + `home-dashboard.spec.ts:164/189` | **non toccati**: zero righe in `flight-editor.tsx`, zero testid nuovi dentro l'editor. Asserito in e2e che su `/dashboard` `flight-form` e' 1 nodo e `mobile-flight-sheet`/`flight-row-mobile` sono 0 |
| 6. `typeahead-pickers.spec.ts` | **non toccato** (editor invariato); i tre combobox esercitati a 375px dai test nuovi |
| 7. `person-detail.spec.ts` deep link `?personId=` | **coperto da un test nuovo**: filtra davvero e sopravvive a un tap sulle chip |
| 8. `mobile-registries.spec.ts:551` (`instructor-profile-flight-row-mobile`) | nome **non riusato** |
| 9. `mobile-shell.spec.ts` non atterra qui | copertura di geometria del fondo **scritta qui**, col metodo di 15.1 AC 6 |
| fascia tablet 641-900 | misurata: `.card-head` **152** a 641 e 800 (identica al pre-fix), rail **64px**, albero mobile `display:none`, `.lb-row` tracce invariate |
| tema scuro | §5, esemplari **enumerati** |
| Panoramica | `FlightEditor` invariato; geometria del pannello identica pre/post a 1280 |
| contabilita' | §4 riga ix: `/dashboard/billing` **identica** byte per byte, con un build vero del pre-fix |
| il `key` di remount | e' esattamente il vincolo che ha dettato AD-4: il pannello raccoglie in stato locale e naviga **una volta** |

## 10. Debito tecnico (dichiarato voce per voce)

| TD | questa story lo… | misura |
|---|---|---|
| (a) `OPTIONS_PAGE_SIZE = 100` del filtro Velivolo | **subisce** (ratifica R-15.6-g) | il select mobile e' seminato dalla **stessa** lista cappata del desktop. Le e2e filtrano via `?aircraftId=`, mai `selectOption` ⇒ non alimentano il fucile. **Nuova faccia misurata**: lo stesso tetto governa `personOptions`, e in **correzione** ne dipende l'hint `studentOnlyCorrectionHint` — su un DB con >100 persone il volo di un allievo-solo fuori pagina 1 non mostra l'hint (l'invariante 14.3, che e' la cosa che corrompeva i dati, regge comunque). Trovato facendo rossa la suite completa, non a tavolino |
| (b) accoppiamento al catalogo `ExpiryType` globale | **subisce** | tutte le fixture di volo usano `force`/`forceReason`; i due test che esercitano la guardia lo omettono deliberatamente e restano deterministici perche' una persona **nuova** non ha alcun documento |
| (c) taglio senza ellissi delle celle di `.lb-row` a ogni larghezza | **subisce**, non corretto | pre-esistente e desktop: `student-sub` `150/209` a 1280 (rimisurato). Toccarlo sarebbe un cambio desktop |
| (d) `viewport-fit=cover` mai dichiarato ⇒ `env(safe-area-inset-*)` = 0 | **subisce** | TD di epic (15.10) |
| (e) guardia AOG mancante su `POST /flights` | **subisce**, non introdotta | story dedicata post-Epic-15 |
| (f) `billing.spec.ts:296`, `home-dashboard.spec.ts:228` | **subisce** | fragilita' e2e pre-esistenti |
| **(g) NUOVO** — `.search` largo 190px ha `cw 188 / sw 190` sul desktop del registro | **dichiarato**, non corretto | pre-esistente e guidato dalla larghezza (dimostrato iniettando `width:190px` sulla pagina Piloti, `258/258 → 188/190`). Correggerlo e' un cambio desktop |
| **(h) NUOVO** — `.so-sub` (sottotitolo di `SlideOver`) e' `--ink-4`, **3.66:1** chiaro / 4.14 scuro | **evitato**, non corretto | il pannello nuovo non passa sottotitolo. La primitiva serve ogni pannello dell'app a **ogni** larghezza: ricolorarla e' un cambio desktop, da fare dove si fa il dark/a11y pass (15.10) |

## 11. Cosa NON ho fatto (e perche')

- **Nessuna riga in `flight-editor.tsx`**: §a.3 e' confermata, AD-6 regge, e i dieci comportamenti erano gia' corretti. Il lavoro sul form e' stato di **verifica misurata**, come la story chiedeva.
- **Nessuna chiave nuova dell'editor** ⇒ `dashboard/page.tsx#buildFlightEditorLabels` non e' stata toccata (la duplicazione manuale c'e' ancora, ma non aveva nulla da ricevere).
- **`.so-actions` non aggiunta** al pannello del volo (AD-6, misurato due volte).
- **Tetto del picker non alzato** e **`<select>` non sostituito** (ratifica R-15.6-g).
- **Riga Totali non portata su mobile** (ratifica R-15.6-i): sostituita dalla KPI strip, con la coincidenza dei quattro numeri **misurata** in e2e.
- **AC 6(c)** (attore con `flights.manage` senza `flights.forceExpiry`) non esercitato: non costruibile col modello di ruoli post-14.9 — dichiarato al §6, non saltato in silenzio.
- **AC 6(g)** (avviso saldo) non esercitato in e2e su questa story: superficie invariata, dichiarato al §6.
- **Guardia (v) di contenimento**: non ho trovato una simulazione del pre-fix che la rendesse rossa con i dati reali di questa pagina; il predicato e' stato provato **non vacuo** con un'iniezione blunt. Dichiarato al §4, non nascosto — e la review lo **conferma** avendo costruito il caso peggiore legale (marche di 20 caratteri, nomi lunghi, importo a 5 cifre) senza sfondare nulla a 320/375 nei due temi.
- **Guardia (vii) empty state**: la dichiarazione «non iniettabile» era **sbagliata** ed e' stata corretta (review LOW-3): l'iniezione giusta non e' CSS ma DOM (clonare il nodo), e con essa la guardia e' **rossa**. Misura in §4 riga vii.
- **`viewport-fit=cover`, focus trap, `aria-modal`, redesign dell'`ExportMenu`**: fuori scope (15.8/15.10).

## 12. Suite completa finale (l'unico gate che conta)

Prima passata su DB fresco (`CI=1`, build di produzione, `scripts/e2e.sh start` senza `E2E_REUSE_SERVER`):
**356 passed · 1 failed · 1 flaky · 19 did not run · exit 1**.

- Il **rosso era mio** e la sua diagnosi e' il TD (g)/(a) del §10: `mobile-logbook.spec.ts` asseriva l'hint `studentOnlyCorrectionHint` in correzione, che compare **solo** se la persona del volo sta nella pagina di 100 di `personOptions`. Sul DB della suite completa (centinaia di persone create dagli altri spec) la fixture ne resta fuori e l'hint legittimamente non c'e'. Era **la mia asserzione ad assumere "la mia fixture e' a pagina 1"**, non il codice a sbagliare: le due asserzioni dell'invariante 14.3 vero e proprio (`toBeEnabled()`, `toHaveValue('TOURISM')`) erano **verdi** nella stessa esecuzione. Asserzione rimossa e sostituita da un commento che spiega il tetto; il ramo NUOVO, dove la persona si sceglie col typeahead (che popola `personProfiles` a prescindere dal tetto), continua ad asserire `disabled` **e** `SCHOOL`.
- Il **flaky non era mio**: `mobile-planning.spec.ts:323` (story 15.4), un `POST /api/v1/aircraft` che non ha risposto 201 al primo tentativo e verde al retry.
- I **19 "did not run"** sono la catena serializzata (`settings` → `booking-window` → `treasury-settings` → `billing-global`), saltata perche' il project principale era rosso.

Seconda passata, dopo il fix dello spec, **DB resettato di nuovo** (`docker compose down -v` → `up -d` → `migrate deploy` → `db seed`), `CI=1` su build di produzione:

```
377 passed (11.1m)
E2E_EXIT=0
```

**377 = 353 (baseline 15.5) + 24 test nuovi**, zero failed, **zero flaky**, catena serializzata inclusa. Log copiato in `<scratchpad>/final-full-suite.log`.

`npm run gates` finale: **PASS** (lint · typecheck · test 1705 · build).

# Review Record — 15.6 (reviewer adversarial Opus 5 xhigh, fix-subagent Opus 5 xhigh — 2026-08-04)

Report integrale della review: `15-6-review-report.md`.
Verdetto: **SHIPPABLE-WITH-FIXES** — **0 Major**, 2 Minor, 5 Low: il ciclo più pulito dell'epic.
Fix in `bcb180d`.

## Arbitro della review (pre-fix)

`CI=1` su build di produzione, DB fresco: **E2E_EXIT=0 — 377 passed (10.5m), 0 failed, 0 flaky**,
catena serializzata inclusa — coincide con la dichiarazione del dev. Gates verdi (1705 unit).
Confermato empiricamente dal reviewer: testata **239 ≤ 266** a 320/375/390 in IT e EN anche con
filtri attivi, ogni target ≥44px; **la sequenza 14.4 F1 non si riproduce** (chiudi/riapri/cambia
pilota → il volo va SEMPRE alla persona giusta); doppio tap = 1 POST; storni concorrenti →
200+409 con UN addebito e UNO storno in DB; `?page` azzerato da Applica e dalle chip; deep-link
`?personId=`/`?instructorPersonId=` con parità desktop; il fix `.bottom-sheet-sub` solleva i
gemelli di TUTTI gli sheet dell'epic (PPR/prenotazioni/flotta) a 4.85/5.72.

## Findings → fix

| # | Sev | Difetto (misurato dalla review) | Fix (prove nel report del fix) |
|---|---|---|---|
| MINOR-1 | minor | il debounce 400ms della ricerca persona navigava DOPO l'apertura del pannello Filtri e il remount lo smontava sotto il pollice — il fallimento che AD-4 dichiarava inaccettabile, da un'altra porta | **decisione PO: ora** — `cancel()` del timer all'apertura (il flush SAREBBE la navigazione che chiude il pannello), il pannello ADOTTA la ricerca pendente nel draft e "Applica" naviga UNA volta; alla chiusura senza applicare il debounce si RIARMA (senza, il testo digitato si perdeva in silenzio — deviazione dichiarata e guardata). Guardia scritta PRIMA e provata rossa su build pre-fix reale |
| MINOR-2 | minor | il pallino del Badge di anomalia sulla CARD era inline width 0 (soppresso dalla regola 15.5) — e il record ne "misurava" il contrasto: misura di un oggetto non dipinto | **decisione PO di DESIGN (contro la raccomandazione del reviewer): dipingerlo** — eccezione mirata `.mobile-row-flight > .mobile-row-flag .badge .b-dot` (la regola 15.5 resta intatta: 20 chip flotta IDENTICI pre/post + prova strutturale per iniezione su Piloti); contrasto VERO nei due temi: Annullato 4.71/4.43, Deroga 4.81/5.40, Correzione senza pallino PER COSTRUZIONE (variante neutra = parità desktop); guardia w/h≥5 + contrasto ≥3, rossa sul pre-fix (`width: 0`) |
| LOW-1 | low | l'estensione dei `toHaveCount(0)` ai nomi `-mobile` in `flight-log.spec.ts` era VACUA (0 anche per un admin pieno: quei nodi esistono solo a sheet aperto) | rimossa + dichiarata (l'alternativa era un duplicato verbatim); in cambio i gemelli non-vacui sono espliciti in `mobile-logbook.spec.ts`: sheet APERTO come pilota → 0 azioni (admin: 2), pannello APERTO → i testid dei filtri |
| LOW-2 | low | copertura dichiarata > reale: mancava l'attore ALLIEVO, pilota/istruttore solo a 375, geometria solo admin | **decisione PO: colmare** — test allievo (invito reale, volo SCHOOL: titolo=allievo, CFI nel sub, badge Deroga, `forceReason` MAI, 0 azioni) + pilota/istruttore anche a 1280 + geometria non-admin con lo STESSO helper. Tutti verdi al primo run — nessun difetto, come la verifica manuale del reviewer |
| LOW-3 | low | la guardia (vii) era dichiarata "non iniettabile" ma la review l'ha resa discriminante con un'iniezione DOM; la (v) confermata NON discriminante coi dati reali | simulazione adottata (`guardWouldFail: true`), record corretto; la (v) resta dichiarata onestamente — nessuna prova finta |
| LOW-4 | low | la motivazione della correzione C1 (Idempotency-Key) era imprecisa: un tentativo fallito LIBERA la chiave | record corretto: la ragione vera della rigenerazione è il ramo "still-PENDING" del contratto TD-2; comportamento e test invariati |
| LOW-5 | low | consegna: sprint-status non aggiornato (status, TD nuovi), HANDOFF non aggiornato | chiuso in QUESTO commit di chiusura dalla sessione principale |

## Ratifiche PO sopraggiunte in review (4, 2026-08-04)

1. **MINOR-2 → pallino dipinto anche sulla card** — decisione di design esplicita del PO, contro
   la raccomandazione del reviewer (che proponeva di ratificare la card senza pallino).
2. **MINOR-1 → fix subito**, non TD.
3. **Faccia `personOptions` del tetto 100 → si SUBISCE** (l'invariante 14.3 regge, sparisce solo
   l'hint UX su flotte >100; TD unico con più facce, rimedio = story propria).
4. **LOW-2 → copertura colmata**, non record allineato al ribasso.

## Verifiche del fix

Gates verdi (1705 unit). Pre-fix build: guardie **2 failed, E2E_EXIT=1** (verbatim nei log dello
scratchpad); post-fix: `mobile-logbook` (27) + `flight-log` **31 passed**; vicini (`flights`,
`flight-reversal`, `mobile-registries`) **34 passed**, tutto exit 0.

## Gate finale

- Arbitro finale, `CI=1` su build di produzione, DB fresco, stato committato: **380 passed (10.1m), E2E_EXIT=0 — zero failed, ZERO flaky** (380 = 377 + 3 test nuovi del fix)
- `npm run gates`: **verde** (lint 23s, typecheck 3s, 1705 unit, build 33s)

## TD (in `sprint-status.yaml`, registrati alla chiusura)

- **(g)** `.search` a 190px ha 2px di scroll interno pre-esistente (desktop).
- **(h)** `.so-sub` è `--ink-4` (3.66:1) — primitiva desktop, evitata qui invece di estenderla.
- **Faccia `personOptions`** aggiunta al TD `OPTIONS_PAGE_SIZE = 100` (hint 14.3 invisibile
  oltre pagina 1 del picker; invariante server intatto).
