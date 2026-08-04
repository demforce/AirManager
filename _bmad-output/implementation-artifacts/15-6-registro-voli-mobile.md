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
