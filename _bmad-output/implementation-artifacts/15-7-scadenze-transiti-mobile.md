---
baseline_commit: ed76466
---

# Story 15.7: Scadenze + Transiti mobile — registry scadenze a card (registry, promemoria, quota), "Le mie scadenze" self, e i voli in transito con la chiusura/landing fee in linguaggio mobile

Status: **approved — ratifiche PO R-15.7-a..k TUTTE chiuse (2026-08-04), pronta per il dispatch al dev**

## Ratifiche PO (chiuse 2026-08-04, batch AskUserQuestion in tre giri — TUTTE le raccomandazioni del teammate accettate; la sezione Q1-Q11 in fondo porta fatti, opzioni e motivazioni)

| R | Q | Decisione PO |
|---|---|---|
| R-15.7-a | Q1 | **Tutte e TRE le superfici** (Scadenze admin + «Le mie scadenze» self + Movimenti) in questa story |
| R-15.7-b | Q2 | Card scadenza = template + **`Badge` di stato dell'app** (5 tier, già sopra soglia); riga tappabile → sheet con parità piena + azione "Apri scheda persona"; giorni nel sub |
| R-15.7-c | Q3 | Card transito = template; **sheet a parità PIENA** (9 colonne + `pprNumber` OMESSO quando nullo, PoB, note, motivo rifiuto/chiusura solo se valorizzati, badge form pubblico) |
| R-15.7-d | Q4 | Chiusura con tassa = **`secondStep` nello sheet** (focus al campo tassa, ritorno al bottone); annullo transito = **secondo `secondStep`** (inline impossibile: card = un solo `<button>`); `CompleteForm` riusato intero; riga-pannello desktop invariata |
| R-15.7-e | Q5 | Testata Scadenze = **chip strip sulla FINESTRA + ricerca full-width + [Filtri (N) \| Esporta] + [Quota \| Promemoria]** (~238 vs 262); il bottone Filtri DICHIARA quanti filtri nasconde; `.segmented` desktop INTATTO (6 consumer) |
| R-15.7-f | Q6 | Testata Movimenti = **chip strip sullo STATO + periodo nel pannello + [Filtri \| Esporta] + CTA "Registra arrivo" full-width ≥44px** con classe NUOVA sul wrapper oggi inline-styled (desktop rimisurato invariato) |
| R-15.7-g | Q7 | Esito promemoria nel **toast** su mobile (`<p>` resta al desktop); **quota associativa in pannello full-screen** (contenuto di `MembershipFeeModal` riusato; mini-modal resta al desktop) |
| R-15.7-h | Q8 | KPI: **2×2 sulla Scadenze** (scala unica di urgenza), **strip sui Movimenti** (R-15.3-c applicata sul valore, non sul conteggio) |
| R-15.7-i | Q9 | Faccia self = **stessa card senza nome + sheet** con note/stato per esteso; **testid nuovo obbligatorio per l'empty state**; `pendingBadge` portato com'è |
| R-15.7-j | Q10 | **Nessun link nuovo** PPR↔transiti (il deep link onesto richiede il filtro server per `pprNumber`: materia 15.9 se si vorrà) |
| R-15.7-k | Q11 | Debiti: **(1) CHIUSO l'export che perde `window`/`personQuery`** (due parole, href desktop cambiano, `pdf-exports.spec` resta verde); **(2) "Azzera" SOLO nel pannello mobile** (etichetta orfana già tradotta); **(3) contrasto 3.38:1 desktop SUBITO → TD 15.10** — la card mobile NON eredita la coppia difettosa (toni `-ink`, misurati) |

## Story

As a amministratore che tiene sotto controllo i documenti del club e chi atterra sul campo dal telefono (piazzale, ufficio senza scrivania, hangar),
I want vedere le scadenze come una lista di card ordinate per urgenza, filtrabili senza una testata che si mangia due terzi dello schermo, e vedere i voli in transito con il loro stato derivato — atteso / in arrivo / al suolo / partito — potendo **chiudere un transito con la tassa di atterraggio** da un telefono senza scorrere in orizzontale una tabella a nove colonne,
so that le due superfici operative che oggi si guardano solo da un computer diventano usabili sul campo, **senza cambiare una sola regola** del ciclo di chiusura (8.3), dello stato derivato (12.4 AC 3) o dei promemoria (6.3).

E, come pilota/allievo/istruttore: vedere le **mie** scadenze (story 6.2 AC 2) in quella stessa lingua, dalla voce di tab bar che ogni ruolo ha già in prima pagina.

---

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)`), **R2** (il template è incompleto by design: **le due schermate del template non hanno filtri, export, paginazione, KPI, azioni di riga, chiusura, promemoria né la faccia self** — li progetta il team nello STESSO linguaggio, non li rimanda), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e azione primaria fissa in basso), **R4** (si porta TUTTO, filtri e azioni inclusi: nessuna superficie resta "tabella desktop scrollabile in orizzontale" come stato finale — ed è lo stato di oggi su **tutte e tre** le facce, misurato in §a.1/§a.2/§a.3), **R5** (logout/lingua già nel menu profilo, 15.1 — non si toccano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (15.1, in CLAUDE.md): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**. ⚠️ **Regola AD-5 della 15.5**: il suffisso `-mobile` è **illegale** dove esiste un selettore `^=` sul nome desktop. **Verificato per questa story** (`grep -rn 'data-testid\^=' e2e/`, 2026-08-04 — **14 occorrenze**): i prefissi in uso sono `pilot-row-`, `ac-card-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-fleet-card-`, `mobile-fleet-`. **Nessuno tocca `scadenze-`, `ppr-register-`, `ppr-complete-`, `my-expiry-`, `movements-`, `log-arrival-`, `membership-fee-`** ⇒ il suffisso `-mobile` è **LEGALE** qui. La verifica va **rifatta dal dev** prima di scegliere ogni nome, e riportata nel record.

**Le cinque lezioni delle review 15.4/15.5/15.6 che questa story può violare davvero**:

1. **Il debounce è una porta di servizio del remount** (15.6 MINOR-1). Qui il fatto è **asimmetrico e va letto con attenzione, perché una delle due pagine si comporta al contrario dell'altra**: `movements/page.tsx:217` **remonta** `MovementsTable` con `key={JSON.stringify({page, ...filterQuery})}` a ogni navigazione (⇒ AD-4 vale alla lettera), mentre `expiries/page.tsx:118` monta `ScadenzeConsole` **senza `key`** (⇒ il suo stato locale SOPRAVVIVE alla navigazione). Ma la Scadenze ha il suo debounce da **400 ms** sulla ricerca pilota (`scadenze-console.tsx:171-178`) che scrive `filters` **dopo** l'apertura di un eventuale pannello: il pannello non si chiude, ma il suo **draft diventa stantìo** e "Applica" rimanda indietro la ricerca appena digitata. Stessa classe, meccanica diversa: va **misurata**, non dedotta.
2. **Guardia CIECA per costruzione** (15.5 F1): mai `split().length` su una stringa composita. Qui il `sub` dello sheet del transito è `PPR-YYYY-NNNN · tipo` col **`pprNumber` nullable** (`schemas/ppr.ts:176`: `null` finché PENDING e per sempre su REJECTED) e `BottomSheet` compone `` `${sub} — ${title}` `` (`bottom-sheet.tsx:61`). La guardia si scrive su una **proprietà** (`not.toMatch(/—\s*—/)`, nessun segmento vuoto, nessun segmento uguale al segnaposto), mai su `split`.
3. **`text-overflow: ellipsis` nasconde gli sfondamenti allo sweep degli scroller** (15.5 F1/§12): serve, accanto allo sweep, una guardia di **CONTENIMENTO sul rect** (`child.right <= row.right`) per ogni oggetto che può crescere — qui il pill di stato del transito ("In arrivo"/"Al suolo"), il pill dei giorni della scadenza e la chip mono delle marche.
4. **Parità informativa enumerata contro TUTTO ciò che il desktop apre dalla riga** (15.5 F2): sul registro Movimenti il desktop apre da una riga **due** cose (`ppr-register-complete-button` → pannello di chiusura con tassa+metodo; `ppr-register-cancel-button` → conferma inline a due bottoni) e mostra **nove** colonne; sulla Scadenze il desktop apre **un link alla scheda persona** (`/dashboard/people/{id}`, `scadenze-console.tsx:303`) e mostra sei colonne più una **tinta di riga** che è informazione (`TIER_ROW_TINT`).
5. **Il criterio "testata ≤ pre-fix mantenendo i 44px" va verificato con l'ARITMETICA prima di prometterlo** (15.6 R-15.6-e). Fatto qui: il riordino 15.5 alla lettera darebbe **330px** sulla Scadenze (contro 262) e **276px** sui Movimenti (contro 143). ⟨Q5⟩/⟨Q6⟩ esistono per questo.

E due regole di isolamento e2e che questa story eredita:
- **fixture indipendenti dall'ora e dentro i tetti dei picker** — il DB reale ha 338 persone, 174 velivoli, 437 scadenze e 28 richieste PPR; i due registri paginano a 20;
- **MAI mutare attori/impostazioni di seed da un project `fullyParallel`** — e qui c'è un precedente vivo: `movements.spec.ts:269` fa un `PUT /api/v1/settings/ppr-landing-fee` **globale** dal project `chromium` senza ripristino (v. §b, TD).

**Fonte visiva**: template `AirOps Mobile.dc.html` (+ `data.js`) — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/AirOps-Mobile.dc.html`. Lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de` (i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezioni in scope:

- **righe 207-225 — `Admin · Transiti`**: testata (titolo 23px/600 "Voli in transito" + sub 12px `{{visitingSub}}` = "N movimenti · N al suolo"), poi **una card unica** (`background:var(--panel); border:1px solid var(--border); border-radius:14px; overflow:hidden`, `margin:0 16px`) con righe `grid-template-columns: 1fr auto; gap:10px; padding:11px 16px; border-top:1px solid var(--border); align-items:center; cursor:pointer` (le righe **sono tappabili**: `onClick="{{ v.open }}"`). A sinistra un blocco `min-width:0` con titolo 13px/600 = **callsign mono** + **tipo mono 10.5px `--ink-3` peso 400**, e sotto un sub mono 10.5px `--ink-3` **ellissato**; a destra un **pill mono 10px** `border-radius:999px`, `padding:2px 8px`, `white-space:nowrap` col colore dello stato.
- **script 646 — la meccanica del sub**: `v.origin + " → " + v.dest + " · " + v.pilot + " · ETA " + v.eta`. Cioè **rotta · pilota · ETA**.
- **script 600-601 — `openVisit`** (il row-builder dello sheet): `{sub: id · tipo, title: callsign, badge: stato, rows: [Rotta, Pilota, Telefono, ETA, ETD]}`.
- **script 563-566 — `_badge`**: `on-ground` → "al suolo" `--ok-soft`/`--ok-ink`; `inbound` → "in arrivo" `--info-soft`/`--info-ink`; `departed` → "partito" `--bg-sunken`/`--ink-3`; `expected` → "atteso" `--warn-soft`/`--accent-ink`. **Combacia 1:1 con `MOVEMENT_STATUS_TONE` dell'app** (`movements-table.tsx:97-105`: AL_SUOLO `ok`, IN_ARRIVO `info`, PARTITO `''`, ATTESO `warn`) ⇒ si usa il `Badge` dell'app, nessun literal nuovo.
- **righe 266-286 — `Admin · Scadenze`**: testata (titolo 23px/600 + sub 12px `{{scadenzeSub}}` = "N voci nei prossimi 60 giorni"), poi **una card unica** con righe `1fr auto`, stesse metriche della Transiti ma **NON tappabili** (il VM `scadenze`, script 664, non ha `open` — come il Registro voli della 15.6). A sinistra `who` (nome) 13px/600 **ellissato** + sub mono 10.5px `--ink-3` = `{{x.what}} · {{x.date}}`; a destra un **pill mono 10px** con `dLabel` = `"scaduta"` oppure `"N gg"`, tinto per giorni: ≤7 → `--bad-soft`/`--bad-ink`, ≤30 → `--warn-soft`/`--accent-ink`, altrimenti `--bg-sunken`/`--ink-3`.
- **script 662-664 — la meccanica della lista**: solo le voci con `dl(expires) <= 60`, ordinate per giorni crescenti. È **esattamente** il default dell'app (`window=60` + `expiresAt asc`, `expiries.service.ts:441-482`).
- **Il template NON mostra** (⇒ R2, li progetta il team): su **Scadenze** — le 4 stat card, il segmented della finestra, il filtro tipo, la ricerca pilota, l'export, la paginazione, "Quota associativa", "Invia promemoria", il badge di **categoria** (Medico/Licenza/Abilitazione), il badge di **stato a 5 tier** con pallino, la **tinta di riga**, il **link alla scheda persona** e **tutta la faccia self**; su **Transiti** — la KPI row, i filtri stato/periodo, "Azzera filtri", l'export, la paginazione, "Registra arrivo", la **chiusura con tassa di atterraggio**, l'**annullamento**, e i tre stati non derivati (in attesa / rifiutato / annullato).
- **Non si portano** (assunzioni accettate del piano): orologio in topbar, "Accedi come".

---

## Ricognizione (2026-08-04, teammate story — verificata su file, righe e **misure a runtime** su build di produzione `npm run start`, DB reale post-suite: **338 persone, 174 velivoli, 437 scadenze, 37 tipi di scadenza (32 attivi), 28 richieste PPR** — 11 PENDING, 10 APPROVED, 2 REJECTED, 4 COMPLETED, 1 CANCELLED. Il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 14.3/14.4/14.6/14.8/14.9 e in 15.1-15.6)

### a) Le tre superfici reali, misurate

#### a.1 — Scadenze (faccia ADMIN): tabella larga **868px** in 317 visibili, testata **262px**, prima riga al **70% dello schermo**

`src/app/[locale]/dashboard/expiries/` — 3 file:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 245 | server: gate `expiries.manage` **oppure** `self.read` (59-63), `canTriggerReminders = settings.manage` (69), `canChargeMembershipFee = finance.manage` (70), `REGISTRY_PAGE_SIZE = 20` (24), **`OPTIONS_PAGE_SIZE = 100` (25)**, `sanitizeWindow` difensiva (28-30, default `'60'`), `listPeople` 1×100 → `personOptions` (79-80), `listExpiryTypes` **senza tetto** (82-83), `getExpiryTierCounts` **globale** (85), clamp della pagina fuori range (94-100), href di export (103-105), **`<ScadenzeConsole …/>` SENZA `key` (118)**, e in coda il ramo own-access `listPersonExpiries` (213) → `<MyExpiries/>` (224) |
| `scadenze-console.tsx` | 539 | client: `.kpi-row` a 4 `StatCard` (205-210), `.card` (212) + `.card-head` (213-273: **7 gruppi di controllo**), `<p role="status" data-testid="scadenze-reminders-feedback">` **dentro la card** (275-279), `.students`/`.student-row` a **6 colonne** (`COLS`, riga 100), paginazione (328-352), `MembershipFeeModal` in una **`.mini-modal`** (355-365, 466) |
| `my-expiries.tsx` | 92 | client, faccia self: `.card` + `.students` a **4 colonne** (`COLS`, riga 27); empty state = un `<p>` dentro lo stesso `.card` (38-44), **senza testid proprio** |

**Misure a 375×812** (admin, IT, nessun filtro; `.page` 375, `.card` 319, contenuto 317):

| superficie | valore | nota |
|---|---|---|
| `.students` | `clientWidth` **317** / `scrollWidth` **868** ⇒ **551px nascosti** | 6 colonne |
| `.card-head` | **262px** (**304px** a 320px; **262px anche in EN**; **non cresce** con un filtro attivo — non c'è nessun bottone "Azzera", v. §a.5) | contro **107px** a 1280px |
| prima `scadenze-row` | `top` **567** su un viewport 812 ⇒ **70% dello schermo prima della prima riga** (a 320: `top` **610** su 568 ⇒ **sotto il fold**) | il pre-fix Registro voli che 15.6 contestava era il 68% |
| `.student-row` (riga dati) | 317×**61** | |
| overflow orizzontale **di pagina** | **0** a 320/375/390/641/800/1280 | la tabella scrolla per conto suo ⇒ **una guardia sull'overflow di PAGINA sarebbe cieca**, classe 15.2/15.3 F8/15.5/15.6 |
| `.kpi-row` (4 `StatCard`) | `display:flex`, `cw 375 / sw 679`, card 146px | **già la strip della 15.2**; a 1280 è `grid` 239×4 |
| `.page-head` | **51px** a ogni larghezza (nessuna azione) | |
| paginazione | `1 / 2` — `scadenze-page-prev`/`next` **35px** | sotto i 44px |
| controlli della testata | `.segmented` 260×**33** (5 bottoni da **27px**!), tipo **267×35**, **pilota 190×34 con l'`<input>` a 18px**, export **35**, "Quota associativa" **147×35**, "Invia promemoria" **143×35** | ⚠️ i **18px** del campo pilota sono lo **stesso difetto** di 15.5 correzione 8 e 15.6: `.search` centra i figli, il tap sul padding non dà fuoco a nulla. **Nessun controllo raggiunge i 44px.** |
| controlli sotto la tab bar | **nessuno** (`covered: []`, `barTop 745` in 812) | il `padding-bottom: 100px` di `.main` (15.1) regge già |

⚠️ **Difetti PRE-esistenti misurati, da NON ereditare in silenzio e da NON correggere di straforo**:
- `.student-row > *{ min-width:0; overflow:hidden }` (`airops.css:637+`) **taglia il testo senza ellissi**: misurato a 375px la cella "Certificato" ha `clientWidth 140 / scrollWidth 181-277` (fino a **137px tagliati**, nessuna affordance). Vale **anche a 1280px** (`DIV 190/232`). La card mobile deve avere `text-overflow: ellipsis` su ogni testo che può eccedere; la tabella desktop resta com'è (TD).
- `.search` a 190px ha `clientWidth 188 / scrollWidth 190` **a ogni larghezza, desktop compreso**: è il **TD (g) già registrato dalla 15.6** — stessa classe, seconda occorrenza (guidata dalla larghezza, non dalla dichiarazione).
- **Contrasto misurato (canvas→WCAG, tema chiaro)**: la colonna "Giorni rimasti" (`.mono.num`, `color: var(--bad)` sui tier 0/1, sopra la tinta `--bad-soft` della riga) misura **3.38:1** — **sotto il 4.5 del testo**. La card mobile **non deve ereditare quella coppia**: il template usa i toni `-ink` (`--bad-ink`/`--accent-ink`), che sono la medicina già applicata in 15.4/15.6. Il desktop resta com'è (TD).

#### a.2 — Scadenze (faccia SELF, "Le mie scadenze"): tabella **600px** in 317, e **nessuna testata**

Misurato a 375×812 con `pilot@airmanager.local` (7 righe): `.students` `cw 317 / sw 600` ⇒ **283px nascosti**; `.student-name` `150/240` **clippato senza ellissi**; `.card-head` **assente** (zero controlli: nessun filtro, nessuna azione, nessuna paginazione); `pageOverflow` 0. Con `student@airmanager.local` e `instructor@airmanager.local`: **0 righe** ⇒ empty state (`<p>` dentro `.card`, **senza testid proprio**, `my-expiries.tsx:41`).

⚠️ **`scadenze` è una voce di tab bar per TUTTI i ruoli** e, per pilota/allievo/istruttore, **sta nella barra, non nello sheet "Altro"** (misurato: `mobile-tab-scadenze` presente per tutti e tre; `route-registry.ts:113` `ALL_ROLES`, e i tre ruoli vedono esattamente 5 voci ⇒ `mobileNavLayout` le mette tutte in barra). Cioè: **questa è, per tre ruoli su quattro, una delle cinque schermate raggiungibili con un dito** — e oggi è una tabella che scrolla in orizzontale. Non è un'"area self" nel senso della 15.9 (che il piano definisce come `my-account`, `my-compensation`, "le mie transazioni", `/ppr` pubblico): ⟨Q1⟩/⟨Q9⟩.

#### a.3 — Movimenti (Voli in transito): tabella **800px** in 317, testata **143px**, e una **CTA da 35px** non full-width

`src/app/[locale]/dashboard/movements/` — 3 file:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 306 | server: gate `ppr.manage` (75-78, **ADMIN-only** — misurato: pilota/allievo/istruttore vengono **rediretti** a `/dashboard`), `MOVEMENTS_PAGE_SIZE = 20` (21), `MOVEMENTS_STATUSES` + `sanitizeStatus` (24-36, default `'APPROVED'`), `sanitizeDateParam` (29-32), **`KPI_SCAN_LIMIT = 500`** (39), `movementStatusOf` (50-54), 4 query in `Promise.all` per i KPI (91-106), clamp della pagina (115-120), `.page-head` con `LogArrivalLaunchButton` (154-188), `.kpi-row` a 4 KPI (191-208), **`<MovementsTable key={JSON.stringify({page, ...filterQuery})}/>` (210-217)**, paginazione **fuori** dalla tabella (291-303) |
| `movements-table.tsx` | 465 | client: `.card` `data-testid="ppr-register"` (176) + `.card-head` (177-209: stato + dal + al + [azzera] + export), empty `ppr-register-empty` (212-215), `.students` a **9 colonne** (`cols`, riga 173), riga (236-290) con le due azioni (269-288), **pannello di chiusura come RIGA della griglia** (292-312), `CompleteForm` (337-465) |
| `log-arrival-launch-button.tsx` | 46 | monta `ManualPprForm` con `approveImmediately` |

**Misure a 375×812** (admin, IT, filtro di default `APPROVED`, 10 righe):

| superficie | valore | nota |
|---|---|---|
| `.students` | `cw` **317** / `sw` **800** ⇒ **483px nascosti** | 9 colonne |
| `.card-head` | **143px** (**230** a 320; **186** con un filtro attivo, cioè col bottone "Azzera"; **143 anche in EN**) | contro **68px** a 1280px |
| prima `ppr-register-row` | `top` **512** su 812 ⇒ **63%** (a 320: **599** su 568 ⇒ **sotto il fold**) | |
| `.student-row` (riga dati) | 317×**76** | il blocco "Richiedente · contatto" occupa 3 righe (nome + email + telefono) |
| `.page-head` | **106px** a ≤640 (51 a 1280) | |
| **`log-arrival-button`** | **127×35** dentro un wrapper **inline-styled senza classe** (`page.tsx:154`), a 320/375/390 **e** 1280 | ⚠️ è l'**unica CTA di pagina dell'epic ancora così**: la regola `.home-head-actions > .btn{flex:1 1 0; min-height:44px}` (R-15.3-d, `airops.css:2073`) **non la raggiunge**, perché quel wrapper non ha la classe |
| overflow orizzontale di pagina | **0** a ogni larghezza | stessa cecità di §a.1 |
| `.kpi-row` (4 KPI) | `display:flex`, `cw 375 / sw 687`, card 146px | strip 15.2; a 1280 è `grid` |
| controlli della testata | stato **107×36**, dal **134×39**, al **134×39** (+ due `.date-input-btn` da **24×24**), azzera **35**, export **104×35** | **nessuno** raggiunge i 44px; i trigger del calendario sono **24px** |
| paginazione | assente col filtro di default (1 pagina); con `status=ALL` compare, due `Link` **senza testid proprio** dentro `nav[data-testid="movements-pagination"]` | |
| controlli sotto la tab bar | **nessuno** (`covered: []`) | |

⚠️ **Difetti PRE-esistenti misurati**:
- `mono 90/133` sulla colonna "Rotta" (`origin → destination`) **clippata senza ellissi** a ≤640; a 1280 `student-name 65/234` e `student-sub 65/333` (nome e contatti del richiedente clippati **con** ellissi, ma il contatto è illeggibile).
- Il `SlideOver` **chiuso** di `ManualPprForm` è un discendente di `.page` e resta montato nel DOM: misurato come scroller interno nascosto (`FORM 335/355` a 375px; `.slideover 641/1161`, `800/1320`, `1280/1800` alle tre larghezze desktop). ⚠️ **Lo sweep "nessun discendente di `.page` con `scrollWidth > clientWidth`" dell'AC 9 lo troverà**: va dichiarato come eccezione motivata (pannello chiuso) o escluso misurando la visibilità — **non ignorato in silenzio**.

#### a.4 — Il ciclo di chiusura del transito: **funziona, ma su un telefono è irraggiungibile** (misurato)

Sequenza misurata a 375×812 (admin, riga APPROVED):

1. Il bottone **"Completa"** vive nell'ultima delle 9 colonne: per raggiungerlo si deve scorrere `.students` in orizzontale di **483px** (`scrollLeft` misurato dopo il click: **483** su `scrollWidth 800 / clientWidth 317`).
2. Il pannello di chiusura è una **RIGA della stessa griglia** con `gridTemplateColumns: '1fr'` (`movements-table.tsx:293`): a `scrollLeft 0` misura `317px` e parte dal bordo della card — cioè **si apre 483px a SINISTRA del punto in cui l'operatore ha appena toccato**, e per vederlo deve riportare indietro la tabella.
3. Dentro il pannello: `ppr-complete-fee-input` **200×37**, `ppr-complete-method` **200×36**, `ppr-complete-submit` **169×54**, `ppr-complete-close` **68×54**; il submit sta a `y 821` su un viewport 812 ⇒ **fuori dal fold** anche dopo lo scroll orizzontale.
4. L'**annullamento** è una conferma inline nella stessa cella: `ppr-register-cancel-confirm` **68×25** e `ppr-register-cancel-abort` **32×25** ⇒ **25px**, il target più piccolo delle due pagine.

**Comportamenti di dominio della chiusura (8.3) che il mobile deve preservare IDENTICI** (con le righe):

| # | comportamento | dove | cosa deve restare vero su mobile |
|---|---|---|---|
| 1 | **Solo le righe `APPROVED` hanno azioni** | `movements-table.tsx:269` (`row.status !== 'APPROVED' ? null : …`) | stesso gate: su PENDING/REJECTED/COMPLETED/CANCELLED **zero azioni** |
| 2 | **La tassa è obbligatoria e validata client-side** (0 ammesso) | `movements-table.tsx:368-379` (`parseCents`, `Number.isInteger`, `0 <= x <= 2_147_483_647`) | valore non parsabile ⇒ `fld-error` inline e **zero richieste di rete** |
| 3 | **Il metodo di pagamento è obbligatorio, default CASH** | `movements-table.tsx:341`, `440-446` (Billing-1 review D2) | il `<select>` resta, con gli stessi tre valori |
| 4 | **Prefill best-effort del default di club** | `movements-table.tsx:346-362` (`GET /api/v1/settings/ppr-landing-fee`) | il campo resta editabile anche se la fetch fallisce |
| 5 | **`Idempotency-Key` sulla chiusura, rigenerata dopo la risposta** | `movements-table.tsx:344`, `386`, `394` | header presente sul POST; `regenerateIdempotencyKey()` **dopo** la risposta (contratto TD-2 — la 15.6 C1 ha già corretto una ricognizione che diceva il contrario: la chiave **cambia**) |
| 6 | **409 `PPR_NOT_APPROVED` distinto dal generico** | `movements-table.tsx:91-95`, `398-400`, `164` | toast `conflictError`, mai `genericError` |
| 7 | **Effetto contabile**: `landingFeeCents > 0` ⇒ **una** `CashMovement` nella categoria "PPR"; `= 0` ⇒ **nessun** movimento | `ppr.service.ts:646-692` (transazione con `lockPprRequest(tx, id, 'APPROVED')`) | invariato: il mobile chiama **lo stesso** endpoint con lo stesso corpo |
| 8 | **L'annullamento NON registra né tassa né movimento né motivo** | `ppr.service.ts:702-716` | resta una conferma, non un form |
| 9 | **`router.refresh()` + toast su ogni esito** | `movements-table.tsx:164-170`, `301-310` | stessi toast (`completed`/`cancelled`/`conflictError`/`genericError`) |
| 10 | **Stato derivato 12.4 AC 3** | `lib/ppr-movement-status.ts:36-41` + `page.tsx:50-54` | `eta <= now` ⇒ AL_SUOLO (**anche di un giorno precedente mai chiuso**); stesso giorno-Roma e futuro ⇒ IN_ARRIVO; giorno successivo ⇒ ATTESO; `COMPLETED` ⇒ PARTITO; PENDING/REJECTED/CANCELLED **con il loro stato reale**. Il confine di giornata è **Europe/Rome**, non UTC |

#### a.5 — I promemoria, la quota, e le due asimmetrie che nessuno ha dichiarato

- **"Invia promemoria"** (`scadenze-send-reminders-button`, gate `settings.manage`) ⇒ `POST /api/v1/expiry-alerts/trigger` (route gated in-place, `expiry-alerts/trigger/route.ts`) che rilancia `runExpiryAlertsJob()` — **idempotente** via `SentAlert` (story 6.3 AD-9): un re-run manuale è un no-op quando non c'è nulla di nuovo. Soglie `EXPIRY_ALERT_THRESHOLDS = [60, 30, 7, 0]` (`lib/expiry-status.ts:43`), semantica "marcatore di cadenza, non uguaglianza" (`daysLeft <= T`); **una** email al titolare per run + **una** digest per ogni ADMIN attivo, solo se il run ha consumato almeno una soglia. **Esito**: un `<p role="status" data-testid="scadenze-reminders-feedback">` **dentro la card**, `scadenze-console.tsx:275-279` — **la stessa forma che la 15.6 ha sostituito col toast su mobile** (ratifica R-15.6-d ii). ⟨Q7⟩
- **"Quota associativa"** (`scadenze-membership-fee-button`, gate `finance.manage`, `disabled` se `membershipFeeCents <= 0`) ⇒ una **`.mini-modal` (z 60)** con un `SearchCombobox` persone, l'importo, la checkbox "Forza addebito" (solo `settings.manage`), e `POST /api/v1/people/{id}/membership-fee` con `Idempotency-Key`. Misurata a 375×812: card **335×385** a (20,213), submit **131×35**, checkbox **13×13**; a 320×568: card **280×400** a (20,84), submit visibile. ⇒ **funziona, ma è il secondo overlay dell'app che non parla la lingua dell'epic** (il primo era lo storno del volo, chiuso in 15.6). ⟨Q7⟩
- ⚠️ **Asimmetria 1 — la Scadenze non ha "Azzera filtri"**: `page.tsx:152` passa `labels.filters.reset` ("Azzera filtri"), ma `scadenze-console.tsx` **non lo rende mai** (grep: zero occorrenze). Etichetta orfana in **entrambi** i locale. La Movimenti invece ce l'ha (`ppr-register-filter-reset`, `movements-table.tsx:202-206`). Se ⟨Q5⟩ sposta i filtri in un pannello, il pannello Scadenze avrebbe bisogno di un "Azzera" **che oggi non esiste**: aggiungerlo è un controllo nuovo, non un porting.
- ⚠️ **Asimmetria 2 — l'export della Scadenze NON riflette i filtri della lista**: `page.tsx:103` `const exportFilterQuery = { expiryTypeId, scope: undefined, status: undefined }` ⇒ gli href XLS/PDF portano **solo** `expiryTypeId`, mai `window` né `personQuery`. La Movimenti invece è in parità piena (`page.tsx:143-145`: `status`, `from`, `to`). È una divergenza **pre-esistente** dalla regola che 15.6 AC 5 dà per scontata ("gli href di export riflettono gli STESSI filtri della lista"). ⟨Q11⟩

#### a.6 — RBAC e le facce, misurate

| attore | `/dashboard/expiries` | `/dashboard/movements` | tab bar mobile (15.1) |
|---|---|---|---|
| ADMIN (`expiries.manage` + `settings.manage` + `finance.manage` + `ppr.manage`) | registry: 4 stat card, 7 controlli, 20 righe/pagina su 2 pagine, quota + promemoria | registro completo, 4 KPI, 4 controlli, azioni su ogni riga APPROVED, "Registra arrivo" | `visiting` e `scadenze` sono entrambe nello **sheet "Altro"** (nessuna delle due ha `mobileSlot`) |
| PILOTA (`self.read`) | "Le mie scadenze": 7 righe, 0 controlli, `.card-head` **assente** | **redirect** a `/dashboard` (misurato) | `mobile-tab-scadenze` **in barra** |
| ALLIEVO | come pilota (0 righe sul DB attuale ⇒ empty state) | redirect | `mobile-tab-scadenze` **in barra** |
| ISTRUTTORE | come pilota (0 righe) | redirect | `mobile-tab-scadenze` **in barra** |

#### a.7 — Le primitive 15.2-15.6 da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`** (86 righe): `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`. Compone `MobileSheet`; nome accessibile = `` `${sub} — ${title}` `` (riga 61); `onClose` **deve** essere referenzialmente stabile (`useCallback`, contratto a riga 37). Dal fix 15.3 F4 garantisce **uno sheet alla volta**. `.bottom-sheet-sub` è `--ink-3` dal fix 15.6 C6 (4.85/5.72).
- **`src/components/ui/mobile-sheet.tsx`**: scrim (`<testId>-scrim`), `Escape` montato solo da aperto, focus al pannello e **ritorno al trigger**, `role="dialog"`, z-index **40**. Senza `aria-modal`/focus-trap (è 15.10).
- **CSS già pronto, tutto dentro `@media (max-width:640px)`**: `.mobile-card-head/-title/-count/-empty/-foot` (`airops.css:2099-2104`), `.mobile-row` + figli (2111-2160: **UN solo `<button>` con figli `<span>`**), `.mobile-row-tail` (chip mono su `--bg-sunken`, 2143), `.mobile-row-name/-sub` (ellissati, 2151/2157), `.mobile-row-side/-amount/-note` (15.5, 2592-2594), `.mobile-row-flag` (2607-2622) e il fix 15.6 del pallino (2758), `.mobile-row-edge-*` (15.4, 2291-2294 — il bordo colorato di riga, che qui **potrebbe** dire lo stato del transito), `.mobile-chip-strip > .btn` (2261-2269, pill 999px, mono 11px, ≥44px, scroll orizzontale senza scrollbar), `a.mobile-row` (2327, per una riga che è un link), `.registry-head`/`.registry-pagination` (15.5, 2428-2491), `.logbook-head`/`.logbook-filter-panel` (15.6, 2708-2766), `.kpi-row.kpi-row-grid` (15.3, 2078-2093 — la variante **2×2** per le facce con esattamente 4 KPI).
- **Il pannello "Filtri" della 15.6 è il modello esatto**: `logbook-console.tsx:270` (`filterDraft` in stato locale), `:684` (semina del draft + `cancel()` del debounce all'apertura), `:718` (trigger `.logbook-filters-trigger` col conteggio), `:1039-1130` (`SlideOver` reso condizionalmente + `.logbook-filter-panel`), `:538-560` (applica in **UNA** navigazione).
- **`.ppr-card*`** (`airops.css:1880-1901`, story 15.2) è la famiglia della **coda PPR** — righe `display:block`, `.ppr-card-head` flex, `.ppr-card-main/-name/-sub/-side/-id`. La 15.3 ha deciso di **non** generalizzarla. ⚠️ Qui la tentazione è forte (i Movimenti sono **lo stesso oggetto di dominio**, `PprRequest`): la decisione va **presa e dichiarata**, non subita (v. AD-3 e ⟨Q3⟩).

#### a.8 — `airops.css`: dove va la roba nuova, cosa non toccare

- File di **2766 righe**. Sezioni mobile: shell 15.1 **1686-1801**, primitive 15.2 **1824-2023**, panoramica 15.3 **2053-2223**, pianificazione 15.4 **2249-2358**, anagrafiche 15.5 **2401-2665**, registro voli 15.6 **2694-2766**. Le regole nuove vanno **in coda**, in un blocco proprio `/* ---------- scadenze + transiti mobile (story 15.7) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** la riga `display:none` fuori-query per gli alberi mobile (precedenti: `.ppr-queue-mobile` 1822, `.overview-mobile`/`.landing-mobile`, `.schedule-mobile`/`.bookings-mobile`, `.fleet-mobile`/`.pilots-mobile`/`.instructors-mobile`, `.logbook-mobile` 2684).
- **Mappa z-index in uso** (non introdurre valori nuovi senza una misura che li motivi): `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · popover/typeahead 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (a ≤640px sollevato, riga 1687).
- ⚠️ **Classi da NON usare come aggancio dello switch**: `.card`, `.card-head`, `.students`/`.student-row` (13 console), `.kpi-row`, `.mini-modal` — e soprattutto **`.segmented`**, che ha **6 consumer** (`scadenze-console.tsx:217`, `bookings/schedule.tsx:503/530/568`, `reports/page.tsx:110`, `charts/rank-bars.tsx:60`, `dashboard/scadenze-widget.tsx:83`, più la primitiva `ui/segmented.tsx:32`): qualunque regola `@media` su `.segmented` toccherebbe **Pianificazione (15.4), Panoramica (15.3) e Statistiche (15.8)**. Lo switch va su **classi di pagina proprie** e i selettori vanno ancorati con `>` (lezione 15.3 F1, riconfermata 15.5 F5).
- **`.date-input`** (`airops.css:1210+`) è condivisa: i due filtri periodo dei Movimenti la usano, e la usano anche contabilità, registro voli, scheda persona. Qualunque regola nuova su quel nodo va ancorata alla testata dei Movimenti.
- `.page` = `padding: 22px 28px 60px` — è l'aritmetica su cui poggia il full-bleed della KPI strip ed è **asserita** da `mobile-primitives.spec.ts:188`.

### b) e2e e unit — il campo minato preciso

**Spec che vivono su queste pagine** (righe verificate il 2026-08-04):

| file | test | cosa fa | rischio per questa story |
|---|---|---|---|
| `e2e/movements.spec.ts` | 12 (`describe.serial` dentro il project `chromium`) | il file di dominio del transito: chiusura con fee e movimento contabile, fee 0 senza movimento, annullamento, filtri stato/periodo, "Azzera filtri", stato derivato, "Registra arrivo", export PDF, 404 della route ritirata | ⚠️ **il più esposto**. `page.getByText(created.registration)` **page-level** a **276, 397, 409, 419, 422** (`toBeVisible()` ×3 e `toHaveCount(0)` ×2): una card mobile che stampa le stesse marche dà **2 match** e rompe lo strict mode **a 1280px**. `page.getByRole('button', {name:'Esporta'})` **page-level** a 225. `movementsRows(page).filter({hasText})` a 245/278/286/466/507 è invece scoped e sicuro |
| `e2e/expiry-dashboard.spec.ts` | 7 | il file di dominio del registry: 3 tier ordinati, tinta di riga, link alla scheda persona, finestra segmented, stat card globali, filtro pilota debounced, faccia self | ⚠️ `scadenze-row` letto **page-level** con `toHaveCount(3)` e `.nth(0/1/2)` (104-113, 134, 139, 201, 205, 215, 223). E **`page.getByText('Nulla in questa finestra.')` page-level a 135**: un empty state mobile con la **stessa stringa** rompe lo strict mode a 1280px (classe `people-management.spec.ts:352`) |
| `e2e/membership-fee.spec.ts` | 7 | la quota associativa: prefill, saldo insufficiente 422, override admin, bottone disabilitato a quota 0 | `scadenze-membership-fee-button` + `membership-fee-panel` letti **page-level** (76-87, 189-203, 218-229, 242): il trigger e il pannello devono restare **un nodo ciascuno** |
| `e2e/expiry-alerts.spec.ts` | 4 | il job promemoria; a **254-255** asserisce `scadenze-send-reminders-button` `toHaveCount(0)` per un attore senza `settings.manage` | ⚠️ è una **guardia di masking**: se lo story sposta il bottone, il gemello mobile deve essere **0 anche lui**, e l'asserzione va estesa, non indebolita |
| `e2e/expiry-registration.spec.ts` | 2 | registra scadenze dal `LiveExpiryEditor` della scheda persona/Piloti + disattivazione tipo da Impostazioni | non tocca queste pagine; rotto solo da testid duplicati |
| `e2e/expiry-types.spec.ts` | 6 | il catalogo `ExpiryType` **vive in Impostazioni** (`ratings-card.tsx`/medical); a **201** asserisce l'heading "Le mie scadenze" | ⚠️ conferma che **il CRUD dei tipi NON è in questa pagina** (v. §c) |
| `e2e/pdf-exports.spec.ts` | 9 | `/api/v1/expiries/pdf` e `/api/v1/ppr-requests/pdf` (225-226, 296-299, 317-318, 338); `page.getByRole('button', {name:'Esporta'})` a 355 | gli href di export devono continuare a riflettere gli stessi filtri di oggi |
| `e2e/reports.spec.ts` | — | crea/approva/**completa** un PPR via API (142-176) e conta i `movements` nei KPI | invariato se il ciclo di chiusura non cambia contratto |
| `e2e/mobile-shell.spec.ts` | 5 | la tab bar del pilota include `scadenze` (133) | nessun rischio, ma la geometria del fondo di **queste** pagine non è coperta lì: va scritta qui |
| `e2e/mobile-overview.spec.ts` | 14 | `DESKTOP_TESTIDS` include `scadenze-widget` (43), asserita **= 1 nodo** a 375 **e** 1280 (39-51) | il widget della home usa `scadenze-widget-*`: **nessun nome nuovo di questa story può cominciare per `scadenze-widget-`** |
| `e2e/home-dashboard.spec.ts` | 6 | `scadenze-widget` visibile a 1280 (146) | idem |
| `e2e/shell-misc.spec.ts` | — | a 63 confronta l'icona di "Aeromobili" e "Voli in transito" nella sidebar | nessun rischio |
| `e2e/ppr-queue.spec.ts` | — | `/dashboard/ppr`, che monta lo **stesso** `ManualPprForm` (`manual-ppr-form`, `manual-ppr-submit`) e ha già il suo albero mobile 15.2 (`ppr-row-mobile`, `mobile-ppr-sheet`) | ⚠️ qualunque riga toccata in `components/ppr/manual-ppr-form.tsx` **cambia anche la coda PPR** |

**Tutta la suite gira a viewport desktop** (1280×720, `playwright.config.ts:13-19`) tranne gli spec mobile dedicati: un albero mobile `display:none` non la tocca — **ma un testid o un TESTO duplicato la rompe a qualsiasi viewport**.

**Stato globale**: questa story **non** scrive `AppSettings` ⇒ nessuno spec nuovo entra nella catena serializzata (`settings → booking-window → treasury-settings → billing-global`). ⚠️ Ma va detto che `movements.spec.ts:269` **scrive già** `PUT /api/v1/settings/ppr-landing-fee` (globale, senza ripristino) dal project `fullyParallel`: è la stessa classe del TD `reports.spec.ts:307-315`. **Nessun test nuovo di questa story deve dipendere dal valore del default** — il campo tassa è editabile, e il test digita il proprio importo.

**Unit**: nessun test copre oggi `expiries/page.tsx`, `scadenze-console.tsx`, `my-expiries.tsx`, `movements/page.tsx` né `movements-table.tsx`. Esistono e restano le guardie pure di `lib/expiry-status.ts` (`tierOf`, `categoryOf`, `daysUntilUtc`) e `lib/ppr-movement-status.ts`. I test nuovi sono quelli di AD-6 (funzioni pure in `src/lib/`, che per costruzione non importano servizi e quindi non trascinano `@/lib/env` — verifica comunque `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`). Precedenti diretti: `src/lib/mobile-logbook.ts`, `src/lib/mobile-registries.ts`, `src/lib/mobile-agenda.ts`.

### c) Che cosa NON è su queste pagine (correzione al brief, verificata)

Il brief chiede *"cosa succede su mobile a modifica/cancellazione di un tipo o di una scadenza?"*. Misurato sul codice: **niente, perché non si fa da qui.**

- **Il CRUD di una `Expiry`** (registra / modifica / cancella) vive nel `LiveExpiryEditor` (`src/components/dashboard/expiry-editor.tsx`), montato **solo** da `pilots/pilot-editor.tsx:30` e `instructors/instructor-editor.tsx:28` — cioè dentro i due pannelli a tutto schermo che la **story 15.5 ha già consegnato**. Il registry Scadenze è **di sola lettura**.
- **Il CRUD di un `ExpiryType`** vive in **Impostazioni** (`settings/ratings-card.tsx`, due istanze: Abilitazioni e Visite mediche; la vecchia pagina `/dashboard/expiries/types` è stata rimossa nella 13.1) ⇒ è **story 15.8**.
- Il legame `ExpiryType.blocksBooking` → guardie 7.4 (prenotazioni) e 14.4 (voli) è quindi **fuori dal perimetro di questa story per costruzione**: qui non si amministra nulla che blocchi altrove. L'unica azione che scrive, su questa pagina, è la **quota associativa** (che crea un movimento contabile e sposta una scadenza, `POST /api/v1/people/{id}/membership-fee`), più il **trigger dei promemoria** (che manda email e scrive `SentAlert`).

Conseguenza operativa: le due sole azioni di scrittura della Scadenze sono **azioni di PAGINA**, non di riga (⟨Q7⟩), e le tre azioni di scrittura dei Movimenti sono **di riga** ("Completa", "Annulla PPR") **più una di pagina** ("Registra arrivo").

### d) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (`messages/it.json` + `messages/en.json` — verificato oggi: `ExpiriesPage` 74 chiavi e `MovementsPage` 79, **parità piena**, zero chiavi presenti in un solo locale); segnaposto riempiti lato client → **`t.raw`**; suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground; build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** negli e2e per chiudere un popup dentro uno `SlideOver` (chiude tutto il pannello, review 14.3 F1) — e qui i due `DateInput` del filtro periodo sono esattamente quel caso; MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe; prima di attribuire un fallimento al lock TD-6, contare i `LoginAttempt` **falliti** (`login-throttle.ts:25`).

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — Gli alberi mobile vivono DENTRO `scadenze-console.tsx`, `movements-table.tsx` e `my-expiries.tsx`, non in componenti di pagina paralleli.** Motivo dirimente (identico ad AD-1 di 15.4/15.5/15.6): quelle console possiedono **tutto** lo stato che le superfici mobile devono condividere — i filtri con il debounce della ricerca pilota, `feeModalOpen`, `remindersFeedback`/`remindersSending` (Scadenze); `rowAction` (quale riga ha il pannello di chiusura o la conferma aperta) e `busyId` (Movimenti). Un componente parallelo o duplica quello stato o duplica la rete.

**AD-2 — Si sostituisce il CORPO, non la card.** A ≤640px va a `display:none` **solo** la tabella, tramite **classi di pagina proprie** (es. `.scadenze-desktop-body`, `.movements-desktop-body`, `.my-expiries-desktop-body`), mai `.students`/`.student-row` e mai `.card-head`. Le testate restano **un solo nodo** con i loro testid e la loro logica: la loro RESA mobile è ⟨Q5⟩/⟨Q6⟩, ma i testid desktop e la logica di navigazione non si duplicano — **salvo l'eccezione che ⟨Q5⟩/⟨Q6⟩ possono introdurre, che va dichiarata e misurata** (v. AD-5).

**AD-3 — La famiglia CSS della riga si SCEGLIE una volta, e la scelta si dichiara.** Le righe di entrambe le liste hanno la forma del template `1fr auto` con due valori a sinistra e un pill a destra: è **esattamente** `.mobile-row` + `.mobile-row-side` col modificatore che la 15.6 ha già scritto per il volo (`.mobile-row-flight`, `airops.css:2740-2748`, tracce `minmax(0,1fr) auto`). La famiglia sorella `.ppr-card*` (15.2) **non** si generalizza e **non** si riusa qui, per due motivi verificabili: (i) la 15.3 ha già deciso di non generalizzarla e la decisione non si riapre; (ii) le sue righe non hanno una colonna destra a griglia, quindi un pill di stato lungo ("In arrivo") competerebbe col nome senza tracce a proteggerlo — che è il difetto che 15.5 ha misurato e 15.6 ha risolto col modificatore. Se il dev conclude diversamente, deve portare la misura che smentisce, **prima** di scrivere la riga. In ogni caso: **se serve un modificatore ne serve UNO per lista, non una famiglia nuova**.

**AD-4 — Il remount è ASIMMETRICO fra le due pagine, e questo detta due comportamenti diversi.** Fatti misurati: `movements/page.tsx:217` remonta `MovementsTable` a **ogni** navigazione (`key={JSON.stringify({page, ...filterQuery})}`) ⇒ un pannello filtri lì **deve** raccogliere i valori in stato locale e navigare **una volta sola** su "Applica" (AD-4 della 15.6, alla lettera), altrimenti si richiude sotto il pollice. `expiries/page.tsx:118` **non** passa alcun `key` ⇒ lo stato locale di `ScadenzeConsole` **sopravvive** alla navigazione, e un pannello lì non si chiuderebbe — **ma** il debounce da 400 ms della ricerca pilota (`scadenze-console.tsx:171`) scrive `filters` **dopo** l'apertura, e un draft seminato all'apertura tornerebbe indietro sulla ricerca. Regola unica che copre entrambi i casi, e che il dev deve implementare **e guardare**: *all'apertura del pannello si **annulla** il timer pendente (mai flusharlo: il flush È la navigazione) e si semina il draft con il testo **come digitato**; "Applica" naviga UNA sola volta con tutto insieme; alla chiusura senza applicare il debounce si **riarma**, così nulla di digitato si perde* (fix 15.6 MINOR-1, `logbook-console.tsx`). Va **misurata su entrambe le pagine**, non dedotta da una sola.

**AD-5 — Se ⟨Q5⟩/⟨Q6⟩ spostano dei filtri in un pannello, i controlli desktop restano UN nodo ciascuno e i gemelli mobile prendono il suffisso.** La 15.6 ha misurato che il "nodo unico" con `display: contents` **non è praticabile** quando il pannello deve applicare in una navigazione sola (correzione C5 del suo record: un solo elemento non può avere due semantiche di `onChange` senza leggere il viewport in JS, che l'architettura vieta). Si adotta quindi il **doppio albero SOLO per i controlli che entrano nel pannello**, col suffisso `-mobile`, e si dichiara il costo in testid; ogni altro controllo di testata (ricerca, export, CTA) resta **nodo unico** ri-collocato in CSS. I filtri che diventano **chip** non hanno gemello: le chip navigano da sole (`Link`, pattern 15.4/15.6) e prendono nomi **nuovi**.

**AD-6 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test.** Valgono per: (i) la composizione della **sub-line** della card transito (`origin → destination · richiedente · ETA hh:mm`) e di quella scadenza (`tipo · data`), coi casi di confine reali (`etd` **nullable**, `email` **nullable**, `pprNumber` **nullable**); (ii) la scelta del **pill** e del suo tono (transito: i 7 stati di `MovementStatusLabel`; scadenza: ⟨Q2⟩ — tier vs giorni), riusando `tierOf`/`categoryOf`/`deriveApprovedPprMovementStatus` **senza una seconda implementazione**; (iii) la composizione del **`sub` dello sheet**, che finisce nel nome accessibile del dialog: i segmenti assenti si **omettono**, non si riempiono col segnaposto `—` (lezione 15.5 F1). Restano pure ⇒ niente `@/lib/env`.

**AD-7 — Un solo sheet aperto, un solo nodo per testid di sheet.** Ogni `BottomSheet` si rende condizionalmente (`{openRow ? <BottomSheet …/> : null}`, idioma di `mobile-booking-list.tsx:120` e `logbook-console.tsx:1105`), così ciascun testid di sheet resta **un** nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). **Va asserito**, non assunto.

**AD-8 — Una sola logica di rete per i due alberi.** `confirmCancel(id)` (`movements-table.tsx:157-171`) è **già** parametrizzata sull'id: si riusa così com'è. `CompleteForm` è già un componente con `onSuccess`/`onConflict`/`onCancel`: se ⟨Q4⟩ lo porta in una superficie mobile, si **riusa lo stesso componente** (o la sua sola funzione di submit), **mai** riscritto — stessi toast, stesso `router.refresh()`, stessa mappatura 409, stesso `Idempotency-Key`.

**AD-9 — Un'azione che apre un secondo overlay CHIUDE prima lo sheet** (R-15.4-d, già ratificata e riconfermata in 15.6 AD-9: niente pannello z50 impilato su sheet z40). Vale per "Completa" se ⟨Q4⟩ sceglie il pannello, e per un eventuale "Apri scheda" della card scadenza se ⟨Q2⟩ lo mette nello sheet.

**AD-10 — `ManualPprForm` non si tocca.** Misurato in §a.3/§a.9: il pannello di "Registra arrivo" è **già** a tutto schermo (rect `0,0 375×812`, `border-left 0`), la sua `.so-actions` è sticky con `bottom == viewport`, il submit misura **44px** ed è hit-testabile (`elementFromPoint` = `self`), e col pannello aperto la tab bar è coperta (`elementFromPoint` sul suo centro restituisce `so-actions`). Cioè **R3 è già soddisfatta** dal lavoro 15.2. In più il componente è **condiviso con `/dashboard/ppr`**: ogni riga cambiata lì cambia anche la coda PPR. Il lavoro di questa story sul form è di **verifica misurata**, non di codice. Se il dev conclude diversamente, deve portare la misura che smentisce **prima** di scrivere la riga.

---

## Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno riletti dopo le risposte del PO. Ogni misura si intende a **375×812** e ripetuta a **390×844** e a **320×568**, tema **chiaro e scuro**.

1. **(Lista Scadenze a card — template 273-283) ⟨Q1⟩⟨Q2⟩** A ≤640px la `.students` del registry è `display:none` **misurato** e al suo posto c'è una lista di card nel linguaggio del template: nome della persona 13px/600 **ellissato**, sub mono `tipo · data` **ellissato**, e a destra il **pill dei giorni** secondo ⟨Q2⟩. Ogni card è **UN solo elemento interattivo** (`<button>` o `<a>` secondo ⟨Q2⟩, figli `<span>`, **zero** elementi interattivi annidati, `min-height` ≥44px) con nome accessibile parlante che contiene **persona e tipo** (mai "Apri" da solo). L'empty state della lista mobile è **un solo nodo** proprio (`toHaveCount(1)`), con un testid proprio e **una stringa che NON è quella desktop** (`'Nulla in questa finestra.'` è letta page-level da `expiry-dashboard.spec.ts:135`) — oppure, se la stringa si riusa, quello spec va scopato e la modifica motivata. **Verifica misurata**: `display` di entrambi gli alberi a 375 **e** a 1280 (i due lati, mai uno solo); ispezione DOM `card.querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`; nessun testo della card con `scrollWidth > clientWidth` **e** `text-overflow !== 'ellipsis'` a 320px.

2. **(Lista Movimenti a card — template 214-222) ⟨Q3⟩** A ≤640px la `.students` del registro movimenti è `display:none` **misurato** e al suo posto c'è una lista di card: **callsign mono** + **tipo mono `--ink-3`** sul titolo, sub mono `rotta · richiedente · ETA` **ellissato**, e a destra il **`Badge` di stato dell'app** (`MOVEMENT_STATUS_TONE`, `movements-table.tsx:97-105` — che combacia 1:1 col `_badge` del template, script 563), **mai un literal di colore nuovo**. Copre **tutti e sette** i valori di `MovementStatusLabel` (i 4 derivati + PENDING/REJECTED/CANCELLED che il filtro `ALL` fa emergere). Card = **UN solo `<button>`**, ≥44px, nome accessibile con **marche e stato**. Empty state proprio, **un solo nodo**, distinto da `ppr-register-empty` che resta anch'esso un solo nodo. **Verifica**: come AC 1, più un caso per **ognuno** dei 7 stati (fixture proprie o filtro `?status=`).

3. **(Sheet di dettaglio — R3, parità enumerata) ⟨Q2⟩⟨Q3⟩⟨Q4⟩** Il tocco su una card apre il `BottomSheet` della 15.2 con `sub`/`title`/`badge`/`rows[]` modellati su `openVisit` (template 600-601) e **parità informativa verso TUTTO ciò che il desktop mostra o apre da quella riga** (lezione 15.5 F2), enumerata voce per voce nel record:
   - **transito**: le 9 colonne (marche, tipo, rotta, richiedente **+ email + telefono**, ETA, ETD, stato, tassa, azioni) più i campi che il DTO ha e la tabella non mostra secondo ⟨Q3⟩ (`pprNumber`, `personsOnBoard`, `notes`, `fromPublicForm`, `rejectionReason`, `closedAt`);
   - **scadenza**: le 6 colonne (persona, categoria, certificato, scadenza, giorni, stato) più ciò che la riga desktop **apre** (il link a `/dashboard/people/{id}`, `scadenze-console.tsx:303`) e ciò che il DTO ha e la tabella non mostra (`notes`, `typeScope`).
   **Verifica**: apertura **da tastiera** (Tab reali + Enter, mai `focus()`); ogni sheet = **un solo nodo** (AD-7); il nome accessibile del dialog è **ben formato** — guardia su una **proprietà** (`not.toMatch(/—\s*—/)`, nessun segmento vuoto, nessun segmento uguale al segnaposto), **mai** `split(' — ').length` (lezione 15.5 F1) — provata su un transito **senza `pprNumber`** (PENDING o REJECTED) e su uno **senza `etd`**.

4. **(Chiusura del transito con la tassa — 8.3, comportamenti INVARIATI) ⟨Q4⟩** Secondo ⟨Q4⟩, e in ogni caso **tutti e dieci** i comportamenti di §a.4 restano identici, ciascuno esercitato a **375px** da un e2e o da una misura riportata nel record: (a) azioni **solo** su `APPROVED`; (b) tassa non parsabile ⇒ errore inline e **zero richieste di rete** (contate con `page.route`, non dedotte dall'assenza di toast); (c) metodo obbligatorio, default CASH; (d) prefill best-effort del default; (e) `Idempotency-Key` presente e **rigenerata dopo la risposta**; (f) **409 distinto dal generico**; (g) fee > 0 ⇒ **esattamente una** `CashMovement` nella categoria "PPR" con la descrizione `PPR <pprNumber> landing fee`, fee = 0 ⇒ **nessun** movimento (letto **dall'API filtrata**, mai da un conteggio di righe in pagina); (h) annullamento senza tassa né movimento né motivo; (i) toast + `router.refresh()` su ogni esito; (j) una sola logica di rete (AD-8). **In più**: ogni target dell'azione è **≥44px** (pre-fix misurato: submit 54, chiudi 54, ma conferma annullo **25×25**), e il submit è **hit-testabile senza scorrere in orizzontale** — cioè il difetto §a.4 punto 2 (pannello che si apre 483px a sinistra del tocco) **non si riproduce** sull'albero mobile.

5. **(Testata Scadenze in linguaggio mobile — R2/R4) ⟨Q5⟩⟨Q7⟩⟨Q11⟩** Secondo ⟨Q5⟩. In ogni caso: **nessun filtro e nessuna azione scompaiono** a ≤640px (R4) — finestra, tipo, ricerca pilota, export, "Quota associativa", "Invia promemoria" restano tutti raggiungibili con lo **stesso** contratto URL di oggi (`?window&expiryTypeId&personQuery&page`, sanificazione server-side invariata, `page.tsx:28-30`); **ogni controllo ha `min-height` ≥44px** (incluso il campo pilota, oggi **18px**, e i 5 bottoni del `.segmented`, oggi **27px**) e **nessuno finisce sotto la tab bar**; gli href di export restano quelli di oggi (v. ⟨Q11⟩ per la loro asimmetria). ⚠️ **Nessuna regola può agganciarsi a `.segmented`**: ha 6 consumer, fra cui la Pianificazione e la Panoramica (§a.8) — se la finestra diventa una chip strip, la strip è **markup nuovo** e il `.segmented` desktop resta intatto. **Verifica misurata**: altezza della testata mobile **pre/post** alle tre larghezze e in **entrambi i locale** (pre-fix: **262px** @375 IT **e** EN, **304px** @320, invariata con un filtro attivo), col criterio ratificato in 15.5 F3 — **testata ≤ pre-fix mantenendo ogni target ≥44px; se irraggiungibile, si porta l'ARITMETICA e si documenta** (⟨Q5⟩ mostra che il riordino alla lettera darebbe **330px**).

6. **(Testata Movimenti in linguaggio mobile — R2/R4) ⟨Q6⟩** Secondo ⟨Q6⟩. In ogni caso: stato, dal, al, azzera ed export restano tutti raggiungibili con lo **stesso** contratto URL (`?status&from&to&page`, sanificazione invariata, `page.tsx:30-36`); ogni controllo **≥44px** (pre-fix: 36/39/39/35/35, e i due trigger del calendario **24×24**); i due `DateInput` restano operabili **e i loro popover portalati (z 65/66) restano sopra ogni superficie nuova e interamente dentro il viewport** (mai `Escape` per chiuderli, review 14.3 F1); la CTA "Registra arrivo" (oggi **127×35** in un wrapper inline-styled senza classe, `page.tsx:154`) diventa **≥44px** nella grammatica già ratificata per le CTA di pagina (R-15.3-d/R-15.4-f/R-15.5-g/15.6). **Verifica misurata**: altezza `.page-head` + `.card-head` **pre/post** alle tre larghezze e nei due locale (pre-fix: `.page-head` **106**, `.card-head` **143** @375 IT/EN, **230** @320, **186** con un filtro attivo), stesso criterio dell'AC 5 (il riordino alla lettera darebbe **276px** di sola `.card-head`).

7. **("Le mie scadenze" in linguaggio mobile) ⟨Q1⟩⟨Q9⟩** Secondo ⟨Q9⟩. In ogni caso, se la faccia self è in scope: la `.students` di `MyExpiries` è `display:none` a ≤640px **misurato** (pre-fix `cw 317 / sw 600`, `student-name` clippato `150/240`), la lista mobile porta **tutte e quattro** le colonne (tipo, scadenza, stato, note) senza perdere il `my-expiry-pending-badge`, e l'**empty state ha un testid proprio** (oggi non ce l'ha, `my-expiries.tsx:41`) reso **un solo nodo**. **Verifica**: multi-attore obbligatoria — pilota (7 righe sul DB attuale), allievo e istruttore (0 righe ⇒ empty), a **375 e 1280**, con `page.context().clearCookies()` fra un'identità e l'altra.

8. **(Promemoria, quota associativa e KPI) ⟨Q7⟩⟨Q8⟩** Secondo ⟨Q7⟩ e ⟨Q8⟩. In ogni caso: il gate resta quello di oggi (`settings.manage` per i promemoria, `finance.manage` per la quota, `disabled` a quota ≤ 0 col suo `title`); il trigger dei promemoria resta **un solo nodo** (`expiry-alerts.spec.ts:254-255` conta 0 per chi non lo può usare: se compare un gemello mobile, quell'asserzione va **estesa**, mai indebolita); la quota conserva `Idempotency-Key`, il 422 `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE` col messaggio che porta saldo e importo, la checkbox override **non spuntata di default**, e i marcatori per-campo (`requiredPilot`/`invalidAmount`). **Verifica**: e2e a 375px del percorso quota (successo + saldo insufficiente + override) e del trigger promemoria (esito visibile **senza scorrere**, ⟨Q7⟩).

9. **(Paginazione in linguaggio mobile — R-15.5-j)** Le due paginazioni restano quelle di oggi (stesso contratto `?page=`, stessi `Link`) rese in linguaggio mobile (`.registry-pagination` o equivalente **ancorato con `>`**), bottoni **≥44px** (pre-fix: Scadenze `scadenze-page-prev/next` **35px**; Movimenti due `Link` senza testid dentro `nav[data-testid="movements-pagination"]`), hit-testabili **sopra** la tab bar. ⚠️ La paginazione dei Movimenti vive **fuori** da `MovementsTable`, in `page.tsx:291-303`: una regola ancorata alla card **non la raggiunge**. **Verifica**: navigazione `1 / 2 → 2 / 2` (Scadenze) e `1 / N → 2 / N` con `?status=ALL` (Movimenti) a 375px con i filtri preservati; misura dei target; hit-test a fondo pagina.

10. **(Convenzione testid — nessun duplicato, e nessun TESTO duplicato)** Desktop **invariati**: `scadenze-row`, `scadenze-status-badge`, `scadenze-window-{60,30,7,expired,all}`, `scadenze-filter-type`, `scadenze-filter-pilot`, `scadenze-membership-fee-button`, `scadenze-send-reminders-button`, `scadenze-reminders-feedback`, `scadenze-page-prev`, `scadenze-page-next`, `scadenze-pagination-status`, `scadenze-stat-{expired,within7,within30,within60}`, `membership-fee-panel`, `membership-fee-amount`, `membership-fee-submit`, `membership-fee-success`, `membership-fee-error`, `membership-fee-override-checkbox`, `my-expiries`, `my-expiry-row`, `my-expiry-status-badge`, `my-expiry-pending-badge`, `ppr-register`, `ppr-register-row`, `ppr-register-empty`, `ppr-register-filter-bar`, `ppr-register-filter-status`, `ppr-register-filter-from`, `ppr-register-filter-to`, `ppr-register-filter-reset`, `ppr-register-complete-button`, `ppr-register-cancel-button`, `ppr-register-cancel-confirm`, `ppr-register-cancel-abort`, `ppr-complete-form`, `ppr-complete-fee-input`, `ppr-complete-method`, `ppr-complete-submit`, `ppr-complete-close`, `movements-kpi-{on-ground,inbound-today,expected-tomorrow,month}`, `movements-pagination`, `movements-pagination-status`, `log-arrival-button`, `manual-ppr-form`, `manual-ppr-submit`. Le superfici mobile usano il **suffisso `-mobile`** dove duplicano una superficie desktop (`scadenze-row-mobile`, `ppr-register-row-mobile`, `my-expiry-row-mobile`, `ppr-register-complete-button-mobile`, `ppr-register-cancel-button-mobile`, `ppr-complete-*-mobile`, …) e il **prefisso `mobile-`** dove esistono solo su mobile (`mobile-scadenze-list`, `mobile-scadenze-empty`, `mobile-scadenze-sheet`, `mobile-movements-list`, `mobile-movements-empty`, `mobile-movement-sheet`, `mobile-my-expiries-list`, `mobile-my-expiries-empty`, e quelli che ⟨Q5⟩/⟨Q6⟩ introducono). ⚠️ **Nessun nome nuovo può cominciare per `scadenze-widget-`** (la home, `mobile-overview.spec.ts:43`). **Verifica obbligatoria prima di scegliere ogni nome**: `grep -rn 'data-testid\^=' e2e/`, col risultato riportato nel record. **Verifica finale**: un `page.getByTestId(id)` per **ciascuno** dei testid desktop elencati restituisce **esattamente 1** nodo a 375px **e** a 1280px, su `/dashboard/expiries`, `/dashboard/movements` **e** su `/dashboard` (dove vive `scadenze-widget`); **e** un `page.getByText(<marche di una fixture>)` restituisce **al più 1** nodo a 1280px (v. blast radius 1).

11. **(Geometria e layering, con la tab bar della 15.1 presente)** A 320, 375 e 390px, su `/dashboard/expiries` (admin **e** self) e `/dashboard/movements`: **nessun overflow orizzontale di pagina**; **nessun contenitore interno con scroll orizzontale nascosto** (per ogni discendente di `.page`, `scrollWidth <= clientWidth + 1`), con l'elenco delle eccezioni **dichiarate** — la KPI strip 15.2 e una eventuale chip strip sono scrollabili per progetto; la tabella desktop non conta perché è `display:none`; ⚠️ **il `SlideOver` CHIUSO di `ManualPprForm` è un discendente di `.page` e misura 335/355 a 375px e fino a 1280/1800 a 1280px**: va dichiarato come eccezione motivata o escluso misurando la visibilità, **mai** ignorato in silenzio; **nessun controllo finisce sotto la tab bar** (hit-test `elementFromPoint` su **ogni** `.page a, .page button, .page input, .page select` visibile a fondo pagina dopo uno scroll **reale**, metodo di `mobile-shell.spec.ts:174-205` — che però gira sulla **home**: queste pagine non sono coperte, il test va scritto qui; baseline misurata oggi: `covered: []`, `barTop 745` in 812, con l'unica eccezione di un'ancora che scorre sotto la **topbar** sticky, che non è la tab bar); lo sheet (z 40) copre la tab bar con lo scrim; il pannello del form (z 50) la copre del tutto (misurato: `elementFromPoint` sul centro della barra restituisce `so-actions`); la `.mini-modal` della quota (z 60) sta sopra; i toast (200) sopra tutto. **In più, la guardia di CONTENIMENTO** (lezione 15.5 F1/§12): per ogni card, ogni figlio che può crescere (pill di stato, pill dei giorni, chip mono) ha `child.right <= card.right` — perché lo sweep degli scroller **non vede** ciò che è ellissato.

12. **(Ogni regola nuova ha la sua guardia, provata DISCRIMINANTE)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` delle tabelle desktop a ≤640px (tre alberi, se ⟨Q1⟩ li include tutti); (ii) `display:none` degli alberi mobile >640px; (iii) le testate secondo ⟨Q5⟩/⟨Q6⟩ — la guardia va scritta sul **lato che la regola libera** (l'altezza misurata e i target ≥44px, e "il pannello applica in una navigazione" se c'è un pannello), **non** "il bottone esiste"; (iv) nessun testo clippato **senza ellissi** a 320px; (v) contenimento dei figli della card (AC 11); (vi) nome accessibile dello sheet ben formato, su **proprietà** e non su `split` (AC 3); (vii) empty state = **un solo** nodo per albero, con la simulazione DOM del pre-fix (`node.parentElement.appendChild(node.cloneNode(true))`, metodo review 15.6 LOW-3 — **non** "non iniettabile"); (viii) i selettori nuovi **non raggiungono** né il `SlideOver` di `ManualPprForm` né la `.mini-modal` della quota (lezione 15.3 F1: misura della larghezza dei bottoni del pannello e della modale pre/post, e prova con una variante DISCENDENTE del selettore); (ix) **nessuna regola tocca `.segmented`** (misura pre/post su `/dashboard/bookings` **e** `/dashboard/reports` **e** `/dashboard` a 375px) né `.date-input` fuori dalla testata Movimenti (misura su `/dashboard/billing` e `/dashboard/logbook`); (x) i comportamenti di dominio dell'AC 4 che sono invisibili a occhio (la `CashMovement` unica; il 409 distinto). Ognuna va **provata rossa** simulando il pre-fix col repo **intatto** (iniezione CSS/DOM/`addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2, o `git stash` del solo `src/` con lo spec al suo posto, metodo 15.5 §12). Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

13. **(Invarianti)** Desktop >640px **invariato** su **tutte** le pagine che rendono i componenti toccati (`/dashboard/expiries`, `/dashboard/movements` **e** `/dashboard/ppr` se si tocca `ManualPprForm`, che AD-10 vieta — lezione 15.3 claim 3: "desktop invariato" ≠ "nient'altro è cambiato"): misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) sui valori già rilevati come baseline — `.app` `grid-template-columns` `232px 1048px` / `64px 736px` / `64px 577px`; **Scadenze** `.card-head` **107 / 148 / 148**, `.students` `cw/sw` **990/990 · 678/868 · 519/868**, `.kpi-row` `grid` con 4 card **239 / 161 / 121.25**, `.segmented` **260×33** con 5 bottoni da **27px**, `.search` **188/190**, `.page-head` **51**; **Movimenti** `.card-head` **68 / 111 / 115**, `.students` `cw/sw` **990/990 · 678/800 · 519/800**, `.kpi-row` `grid` **189 / 334 / 254.5**, `log-arrival-button` **127×35**, `.page-head` **51**; `pageOverflow 0`; tab bar `display: none` — più il pannello `SlideOver` di `ManualPprForm` aperto e la `.mini-modal` della quota. `npm run gates` verde; **nessuna dipendenza nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (canvas→WCAG, sfondo effettivo risolto risalendo gli antenati **partendo dall'elemento**) ≥**4.5:1** per il testo e ≥**3:1** per gli oggetti grafici, in tema **chiaro e scuro**, **enumerando tutti gli esemplari** e non fidandosi dell'elenco — ⚠️ **baseline già trovata in ricognizione: la colonna "Giorni rimasti" del desktop misura 3.38:1 in chiaro** (`--bad` su `--bad-soft`), quindi la card mobile **non** deve ereditare quella coppia; gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

14. **(Multi-attore — lezione 15.1 F1) ⟨Q1⟩⟨Q9⟩** La verifica per attore **non è opzionale**: ADMIN, PILOTA, ALLIEVO, ISTRUTTORE a **375 e 1280px**, con `page.context().clearCookies()` fra un'identità e l'altra. Per ciascuno: quale faccia della Scadenze vede, quali controlli sono presenti, quante azioni negli sheet, e che **il redirect da `/dashboard/movements` regge** per i tre non-admin (misurato oggi: `finalUrl /it/dashboard`) **anche a 375px**. Caso specifico da coprire perché è l'unico non ovvio: un attore con `expiries.manage` ma **senza** `settings.manage`/`finance.manage` non vede promemoria/quota — se non è costruibile col modello di ruoli post-14.9 (ADMIN ha tutto), va **dichiarato** e provato con una misura sul render, non saltato in silenzio.

15. **(Debito tecnico — dichiarato, non subìto in silenzio) ⟨Q11⟩** Il record dice per **ciascuno** dei TD che toccano queste pagine se la story lo **chiude**, lo **subisce** o lo **aggrava**, con la misura: (a) `OPTIONS_PAGE_SIZE = 100` di `expiries/page.tsx:25` — **quarta faccia** del TD già registrato: qui alimenta `personOptions`, cioè gli `initialOptions` del `SearchCombobox` della quota associativa; misurato oggi **100 opzioni iniziali su 338 persone**, ma il combobox ha il typeahead server-side (`searchPersonFilter`, `pageSize: 50`) quindi il tetto **degrada la comodità, non la funzione** — a differenza del `<select>` del registro voli; (b) l'export Scadenze che **non** riflette `window`/`personQuery` (§a.5, ⟨Q11⟩); (c) `labels.filters.reset` orfano in entrambi i locale (§a.5); (d) il taglio senza ellissi delle celle di `.student-row` a **ogni** larghezza (§a.1/§a.2/§a.3) — pre-esistente, **non** si corregge qui; (e) `.search` a 190px con `cw 188 / sw 190` — **seconda occorrenza** del TD (g) della 15.6, sulla superficie gemella; (f) `.so-sub` di `SlideOver` a `--ink-4` (3.66:1) — ⚠️ **`ManualPprForm` PASSA un sottotitolo** ("Voli in transito", `movements/page.tsx:160`), quindi qui il TD (h) della 15.6 è **attivo**, non evitato: va dichiarato e lasciato a 15.10; (g) il contrasto 3.38:1 della colonna "Giorni rimasti" (§a.1) — **nuovo**, desktop, non corretto qui; (h) `movements.spec.ts:269` scrive `settings/ppr-landing-fee` globale dal project `fullyParallel` — **nuovo**, e2e, subìto; (i) `viewport-fit=cover` mai dichiarato ⇒ tutti gli `env(safe-area-inset-*)` valgono 0 (TD di epic, 15.10); (j) `KPI_SCAN_LIMIT = 500` (`movements/page.tsx:39`) — degradazione dichiarata e accettata dalla 12.4, **non** un difetto nuovo.

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):

1. ⚠️ **`movements.spec.ts` legge `page.getByText(created.registration)` PAGE-LEVEL in 5 punti** (276, 397, 409, 419, 422 — tre `toBeVisible()` e due `toHaveCount(0)`). È la **causa di rottura n.1** e **non è evitabile con la sola convenzione dei testid**: la card mobile *deve* stampare le marche, che sono il suo identificatore, e a 1280px l'albero mobile è nel DOM (`display:none`, ma presente) ⇒ **2 match ⇒ strict-mode violation**. L'unica cura corretta è **scopare quelle 5 asserzioni alla riga** (`movementsRows(page).filter({hasText: registration})`, che è **già** l'idioma usato nello stesso file alle righe 245/278/286/466/507): è una riscrittura **al valore corretto**, non un indebolimento (lezione 14.6), e va motivata nel record con la misura del pre/post. Il dev **non** deve invece cambiare la semantica dei due `toHaveCount(0)`: diventano "zero righe con quelle marche", che è ciò che il test voleva dire.
2. ⚠️ `expiry-dashboard.spec.ts:135` — `page.getByText('Nulla in questa finestra.')` **page-level**: l'empty state mobile non può ripetere quella stringa (o lo spec va scopato). Stessa classe di `people-management.spec.ts:352`.
3. `expiry-dashboard.spec.ts:104-113/134/139/201/205/215/223` — `scadenze-row` letto **page-level** con `toHaveCount` e `.nth(i)`: l'albero mobile **non può riusare quel testid**.
4. `movements.spec.ts:225` e `pdf-exports.spec.ts:355` — `page.getByRole('button', {name:'Esporta'})` **page-level**: l'`ExportMenu` deve restare **un solo nodo** su entrambe le pagine.
5. `membership-fee.spec.ts:76/189/218/242` — `scadenze-membership-fee-button` e `membership-fee-panel` page-level: un nodo ciascuno.
6. `expiry-alerts.spec.ts:254-255` — `scadenze-send-reminders-button` `toHaveCount(0)` per chi non ha `settings.manage`: se compare un gemello mobile, l'asserzione va **estesa** (e non deve essere **vacua**: la lezione 15.6 LOW-1 dice che contare un nodo che esiste solo a pannello aperto è verde per chiunque).
7. `mobile-overview.spec.ts:39-51` (`DESKTOP_TESTIDS` = 1 nodo a 375 **e** 1280, include `scadenze-widget`) e `home-dashboard.spec.ts:146` — nessun nome nuovo per `scadenze-widget-*`.
8. `ppr-queue.spec.ts` + `pdf-exports.spec.ts:141-176` — `ManualPprForm` è **condiviso** con `/dashboard/ppr` (AD-10: non si tocca).
9. `mobile-shell.spec.ts:133` — la tab bar del pilota include `scadenze`: nessun rischio, ma la copertura di geometria del fondo di **queste** pagine va **scritta qui**, non ereditata.
10. `reports.spec.ts:142-176` — crea/approva/completa un PPR via API: si rompe solo se cambia il contratto di `POST /ppr-requests/{id}/complete`, che questa story non tocca.

**Unit**: nessuno copre oggi queste superfici. I nuovi sono quelli di AD-6.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):
- la **fascia tablet 641-900px**: nessuna regola di questa story deve toccarla (R1) — misurare a 800 e 641px che nulla di nuovo compaia, che il rail resti 64px e che le due `.card-head` restino **148** (Scadenze) e **115/111** (Movimenti);
- il **tema scuro** delle superfici nuove — pill, chip e bordi sono oggetti su `--panel`: **enumerare gli esemplari, non fidarsi dell'elenco** (la 15.4 ha trovato un pallino a 1.76:1, la 15.3 un glifo a 1.24:1, la 15.6 uno sfondo `--ink-4` a 3.66:1 su superfici "ovvie");
- la **Pianificazione, la Panoramica e le Statistiche**, se una regola tocca `.segmented` senza ancorarla (6 consumer, §a.8);
- la **contabilità** e il **registro voli**, se una regola tocca `.date-input` senza ancorarla;
- la **coda PPR** (`/dashboard/ppr`), se si tocca `ManualPprForm`;
- il **`key` di remount** di `MovementsTable` (`page.tsx:217`): qualunque stato locale nuovo (un pannello filtri aperto, uno sheet aperto) muore a ogni cambio di filtro o pagina — AD-4;
- l'**assenza** di quel `key` su `ScadenzeConsole` (`expiries/page.tsx:118`): qui è l'opposto — lo stato locale sopravvive e un draft può diventare stantìo (AD-4).

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-expiries-movements.spec.ts`** (o due spec separati se ⟨Q1⟩ sceglie lo split), project `chromium` `fullyParallel` (non scrive `AppSettings` ⇒ **non** entra nella catena serializzata), `setViewportSize` **dentro il test** (pattern 13.10; nessun project Playwright duplicato — decisione di epic, riesame in 15.10). Copre: le tre liste a card e il non-clipping, gli sheet e la parità, la chiusura con fee e l'annullamento, i filtri ⟨Q5⟩/⟨Q6⟩, promemoria e quota, la paginazione, geometria/layering, multi-attore.
- **Modifiche a spec esistenti**: **una sola prevista e obbligata** — lo scoping delle 5 asserzioni page-level di `movements.spec.ts` (blast radius 1), da motivare nel record con la misura. Ogni altra modifica va motivata e non deve ridurre la copertura (lezione 14.6); l'estensione dei `toHaveCount(0)` dell'AC 8/blast-radius 6 è ammessa e auspicata **solo se non è vacua** (lezione 15.6 LOW-1: deve girare con lo sheet/il pannello **aperto**).
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-6, verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**
- Ogni test crea le **proprie** fixture (richiesta PPR con marche run-unique via il POST pubblico + approvazione API, come `movements.spec.ts#createApprovedRequest`; persona con cognome run-unique + tipo di scadenza run-unique, come `expiry-dashboard.spec.ts`) e le raggiunge **tramite i filtri della pagina** o via API filtrata — **mai** assumendo "la mia fixture è a pagina 1" (20 righe/pagina; il registro Movimenti è **FIFO `createdAt asc`**, quindi la fixture più nuova finisce sull'**ultima** pagina: si riusa `gotoMovementsLastPage`).
- ⚠️ **Nessun test nuovo scrive `settings/ppr-landing-fee`** (globale, e già scritto da `movements.spec.ts:269` dal project parallelo): il campo tassa è editabile, il test digita il proprio importo e asserisce **quello**.
- ⚠️ **Nessun test nuovo dipende dal catalogo `ExpiryType` globale** oltre al tipo run-unique che crea (`blocksBooking` resta `false` per default, `schema.prisma:1329`, quindi non alimenta il TD 14.4(a)).
- Le fixture create alimentano i TD di volume: il dev deve dire **quante ne crea per run**.
- Attori: la Scadenze è aperta a **tutti** (due facce), i Movimenti sono **ADMIN-only** ⇒ verifica multi-attore obbligatoria (AC 14), redirect incluso.

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)
- Sostituzione degli alberi: asserire **entrambi** i lati (tabella `none` + lista visibile a 375px; l'inverso a 1280px). Un solo lato lascia passare "ho nascosto tutto".
- Testate: **non** "il controllo esiste" — è l'**altezza misurata** contro il pre-fix (262/304 Scadenze; 143/230/186 Movimenti) e la raggiungibilità di ogni filtro; se c'è un pannello, la guardia è anche "applica in **una** navigazione" (AD-4), provata rossa navigando a ogni `onChange`, **e** "sopravvive a un debounce pendente", provata rossa senza il `cancel()` (fix 15.6 MINOR-1).
- Nome accessibile dello sheet: guardia su **proprietà**, non su `split` (lezione 15.5 F1), provata rossa su una stringa con due separatori adiacenti (transito senza `pprNumber`).
- Contenimento: guardia sul **rect** dei figli della card, non solo lo sweep degli scroller (cieco sugli elementi ellissati).
- Chiusura del transito: l'effetto contabile si legge **dall'API filtrata** sulla categoria PPR e sulla descrizione run-unique, **mai** da un conteggio di righe in pagina (trappola 12.11 F1 / Billing-2 F4 / classe C della 15.3).
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). **Baseline attesa: 380 test** (il totale verificato alla chiusura della 15.6) più quelli nuovi. Se il dev non la completa, la **review la riesegue da arbitro** (prassi 13.9/13.11/15.2-15.6).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index), `15-2-primitive-mobile.md` (API delle primitive, R-15.2-a..g, guardia cieca, prova per rebuild — **e il consumer di prova, la coda PPR, che è la sorella di questa story**), `15-3-panoramica-mobile.md` + `15-3-review-report.md` (selettore ancorato, il gemello va misurato), `15-4-pianificazione-mobile.md` + `15-4-review-report.md` (chip strip, fixture indipendenti dall'ora, guardia sul lato liberato), `15-5-anagrafiche-card-mobile.md` + `15-5-review-report.md` (AD-5 sui selettori `^=`, guardia cieca da `split`, ellissi che nasconde gli sfondamenti, parità enumerata, criterio testata ≤ pre-fix), `15-6-registro-voli-mobile.md` + `15-6-review-report.md` (**il modello più vicino a questa story**: pannello Filtri a navigazione unica, debounce vs pannello, chip strip di stato, badge di riga col pallino dipinto).
- Story di dominio da rileggere: `8-3-ppr-closure-fee.md` (chiusura, tassa, movimento contabile), `12-4` (registro movimenti e stato derivato — nel file dell'epic 12), `6-2-expiry-registration.md` e `6-3-expiry-alerts.md` (registry, faccia self, soglie dei promemoria), `6-4-expiry-dashboard.md` (le stat card globali), `12-11` (il porting AirOps della Scadenze).
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/logbook/logbook-console.tsx` (albero mobile 15.6: chip strip + card + sheet + pannello Filtri + `secondStep`), `src/app/[locale]/dashboard/ppr/ppr-console.tsx` (albero mobile 15.2 sullo **stesso** oggetto di dominio), `src/app/[locale]/dashboard/pilots/pilots-console.tsx` (sheet con azioni gated e conferma in due passi, 15.5).
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale; ⚠️ `npm run start` **fallisce** con il `JOBS_SECRET` segnaposto di `.env`: serve `export JOBS_SECRET=<valore non-segnaposto>` anche solo per servire la build; MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway **con import per path assoluto** (`/home/admin/AirManager/node_modules/playwright-core/index.mjs` — l'import per nome fallisce da fuori la root) e Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`; credenziali di seed `admin@airmanager.local` / `SEED_ADMIN_PASSWORD` di `.env`, più `pilot@`/`instructor@`/`student@airmanager.local` con la stessa password).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile list row status pill", "mobile filter panel full screen apply", "money input mobile form", "destructive action confirmation mobile", "expiry urgency color coding accessibility").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29: il codice UI lo scrive Opus 5; questa story è tutta UI). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.7): scadenze e transiti mobile — registry a card con sheet, filtri in linguaggio mobile, chiusura transito con tassa a tutto schermo` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **Il CRUD dei tipi di scadenza** (`settings/ratings-card.tsx`, Abilitazioni + Visite mediche) e **tutta la pagina Impostazioni** → **15.8**, insieme a Contabilità e Statistiche e al **redesign dell'`ExportMenu`** (R-15.2-c: qui l'export cambia al massimo il target, come ratificato in 15.5 F4 e 15.6 ⟨Q6⟩).
- **Il CRUD di una singola scadenza** (`LiveExpiryEditor`): vive nei due editor persona, **già consegnati dalla 15.5**. Questa story non lo tocca.
- **La coda PPR `/dashboard/ppr`** (già mobile dalla 15.2) e il **modulo pubblico `/ppr`** → 15.9. `ManualPprForm` è condiviso e **non si tocca** (AD-10).
- **Aree self `my-account`/`my-compensation`/"le mie transazioni"** → 15.9. ⚠️ "Le mie scadenze" **non** è fra quelle (il piano non la elenca) ed è una voce di tab bar per tre ruoli su quattro: ⟨Q1⟩/⟨Q9⟩.
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover` → **15.10**. La baseline di tastiera resta quella della 15.1.
- **La riserva sticky di R-15.2-g** (`.so-actions` che si sgancia scorrendo) → 15.10.
- **I difetti pre-esistenti misurati e NON corretti qui**: taglio senza ellissi delle celle `.student-row` a ogni larghezza; `.search` 188/190; contrasto 3.38:1 della colonna "Giorni rimasti"; `.so-sub` a `--ink-4`; `labels.filters.reset` orfano; export Scadenze che perde `window`/`personQuery` (salvo ⟨Q11⟩); `movements.spec.ts:269` che scrive un `AppSetting` globale dal project parallelo.
- **La guardia AOG sulla registrazione del volo** e la **data di rientro sull'AOG**: story dedicata post-Epic-15, requisiti già fissati dal PO.
- Qualunque modifica alle API, agli schemi Zod o al dominio. Le sole modifiche server ammesse sono quelle che le ratifiche approvano esplicitamente (⟨Q11⟩, se il PO decide di allineare l'export).
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/modalità full-screen di `SlideOver`: si **riusano**, non si reinventano.

---
---

# ASSUNZIONI DA RATIFICARE (BLOCCANTI) — **PRIMA** del dispatch al dev

> Regola di progetto (retro Epic 9, `sprint-status.yaml` AI-2, riconfermata dal piano epic 15: "Per ogni altro dubbio chiedi a me" — PO, 2026-07-29): un'assunzione scoperta in ricognizione si ratifica **prima** di implementare, mai spedita "da confermare" dentro il codice. Ogni domanda porta il **fatto misurato** che la genera, le **opzioni** e la **raccomandazione motivata** del teammate story.

### Q1 — Perimetro: le due superfici insieme, e con quante facce?

**Il fatto**: il piano assegna alla 15.7 *"registry scadenze, promemoria, transiti con chiusura/fee"* — due pagine. Ma le pagine sono **tre superfici**: la Scadenze ha **due facce** decise da `expiries.manage` (`page.tsx:59-63`), e la faccia self ("Le mie scadenze") è **una voce di tab bar per pilota, allievo e istruttore** (misurato: `mobile-tab-scadenze` in barra per tutti e tre) mentre il piano assegna alla 15.9 solo `my-account`, `my-compensation`, "le mie transazioni" e `/ppr` pubblico. Misure: Scadenze admin `.students` **317/868** con testata **262px**; Scadenze self **317/600** con **zero** controlli; Movimenti **317/800** con testata **143px** e un ciclo di chiusura che oggi richiede **483px di scroll orizzontale** per essere raggiunto. Il costo delle tre superfici non è uniforme: la self è la più piccola dell'epic (una lista di 4 colonne, nessun filtro, nessuna azione, un componente da 92 righe).

**Opzioni**
- **A — Tutte e tre le superfici in questa story.** Le due liste admin condividono la stessa famiglia CSS e lo stesso pattern (card + sheet + chip strip + pannello filtri); la self costa poco perché non ha né filtri né azioni. Una sola apertura di `airops.css`, un solo spec nuovo, una sola review.
- **B — Solo le due facce ADMIN; la self rimandata alla 15.9.** La 15.9 dovrebbe ri-aprire `my-expiries.tsx` e la stessa sezione CSS, e nel frattempo tre ruoli su quattro continuerebbero a trovare una tabella che scrolla in orizzontale dietro una delle loro cinque icone di barra.
- **C — Split in due story (15.7a Scadenze, 15.7b Transiti).** Le due pagine non condividono codice (nessun componente in comune) e la Transiti porta l'unico ciclo di scrittura economicamente delicato. Costo: due cicli story→dev→review invece di uno, e la sezione CSS aperta due volte con il rischio di due famiglie divergenti per la stessa forma di riga.

**Raccomandazione: A.** Le tre superfici hanno **la stessa forma di riga** (`1fr auto`, due valori a sinistra, un pill a destra — il template le disegna identiche) e lo stesso modificatore CSS le copre tutte; escludere la self costerebbe **più** codice in totale (un secondo blocco CSS in 15.9) e lascerebbe scoperta la superficie con la maggiore esposizione per ruolo. **C** è difendibile se il PO vuole ridurre la superficie di una singola review, ma va scelto sapendo che paga un ciclo in più e che le due story si contenderebbero le stesse righe di `airops.css`.

---

### Q2 — Che cosa vive sulla card scadenza, e la riga è tappabile?

**Il fatto**: il desktop mostra **sei** colonne (persona come **link** a `/dashboard/people/{id}`, categoria come `Badge` Medico/Licenza/Abilitazione, nome del certificato, data, **giorni** colorati, **stato** come `Badge` con pallino a 5 tier) più una **tinta di riga** che è essa stessa informazione (`TIER_ROW_TINT`, `scadenze-console.tsx:107-113`). Il template mostra **tre** cose: nome, `tipo · data`, e **un solo pill** col numero di giorni ("scaduta" / "N gg") tinto a 3 livelli (≤7 bad, ≤30 warn, resto neutro). Le righe del template **non sono tappabili**. Misurato: la colonna giorni del desktop ha un contrasto di **3.38:1** in tema chiaro (sotto soglia); il `Badge` di stato ha 8.38:1.

**Opzioni** (la card; lo sheet in ogni caso porta la parità piena dell'AC 3, se c'è uno sheet)
- **A — Card = template + pill di STATO dell'app** (il `Badge` a 5 tier con pallino, che è già misurato sopra soglia e già usato dal desktop e dallo sheet), **e la riga apre uno sheet** con la parità piena e un'azione "Apri scheda persona". Il numero di giorni entra nel **sub** (`tipo · data · N gg`) o come seconda riga della colonna destra.
- **B — Card = template alla lettera**: pill col **numero di giorni** e i suoi 3 toni, riga **non tappabile**, il nome della persona è un `<a>` verso la scheda (come il desktop). Costo: si perdono categoria, stato a parole e note; e i toni vanno rifatti con i token `-ink` perché quelli del desktop misurano 3.38:1.
- **C — Card tappabile con pill di stato E numero di giorni** (due oggetti a destra, impilati come la colonna destra della 15.5). Il più informativo; il più affollato su 317px.

**Raccomandazione: A.** Motivi: (i) è la grammatica che l'epic ha ratificato quattro volte (dettaglio-riga = sheet, R-15.2-b → R-15.6-c) e l'unica che non perde le sei colonne del desktop; (ii) il `Badge` dell'app dice **più** del pill del template (una parola invece di un numero) ed è **già misurato sopra soglia in entrambi i temi**, mentre replicare i toni del template richiederebbe di rifare i colori da zero; (iii) l'ingresso alla scheda persona è la sola cosa che il desktop **apre** da quella riga, ed è esattamente il buco che la review 15.5 F2 ha contestato allo sheet Istruttori — meglio non ripeterlo. **B** è la scelta "più template" ed è la più economica, ma trasforma una riga che oggi apre qualcosa in una riga muta.

---

### Q3 — Che cosa vive sulla card transito, e quanto porta lo sheet?

**Il fatto**: il desktop mostra **nove** colonne (marche, tipo, rotta, richiedente **su tre righe** — nome, email, telefono —, ETA, ETD, stato, tassa, azioni) su una tabella larga **800px** in 317 visibili; la riga misura **76px** perché il blocco richiedente ne occupa tre. Il template mostra callsign + tipo, un sub `rotta · pilota · ETA`, e un pill di stato, con la riga **tappabile**; il suo `openVisit` porta 5 righe nello sheet (`Rotta, Pilota, Telefono, ETA, ETD`). Il DTO (`schemas/ppr.ts:158-188`) ha inoltre **7 campi** che la tabella non mostra: `pprNumber`, `personsOnBoard`, `notes`, `fromPublicForm`, `rejectionReason`, `decidedAt`, `closedAt`. Sul DB reale: 10 APPROVED, 4 COMPLETED, 11 PENDING, 2 REJECTED, 1 CANCELLED.

**Opzioni**
- **A — Card = template (callsign + tipo · sub rotta/richiedente/ETA · `Badge` di stato), sheet con parità piena**: le 9 colonne + `pprNumber` (che è il numero con cui si parla al pilota), `personsOnBoard`, `notes`, e — solo quando valorizzati — `rejectionReason` e `closedAt`. `fromPublicForm` come badge secondario (la coda PPR lo mostra già, `ppr-console.tsx:331`).
- **B — Card + sheet minimale** (le 5 righe del template): perde email/telefono/tassa/note, cioè proprio i dati per cui un operatore apre un transito dal piazzale.
- **C — Card che mostra anche la tassa a destra** (come la colonna destra del volo, 15.6): la tassa esiste **solo** su una riga COMPLETED (4 su 28) e su tutte le altre sarebbe un `—`; e ruberebbe spazio al pill di stato, che è l'informazione che cambia il significato della riga.

**Raccomandazione: A.** È il template dove il template parla e la regola dell'epic dove tace ("il mobile non perde informazione", R-15.2 AC 4 sulla coda PPR, dove provenienza/destinazione/note esistevano **solo** su mobile). Il `pprNumber` merita una menzione esplicita: è l'identificatore con cui l'operatore parla alla torre e al pilota, ed è nullable — quindi va **omesso**, non messo a `—`, quando manca (lezione 15.5 F1 sul nome accessibile).

---

### Q4 — La chiusura con la tassa: dove vive su mobile?

**Il fatto misurato** (§a.4): oggi il pannello di chiusura è una **riga della griglia a 9 colonne**. Sul telefono l'operatore deve scorrere la tabella di **483px** per trovare "Completa", e il pannello si apre **483px più a sinistra** del punto che ha appena toccato; il suo submit sta a `y 821` su un viewport 812. Il pannello contiene **due** campi (tassa 200×37, metodo 200×36) e due bottoni (54px). L'operazione ha un **effetto contabile reale** (crea una `CashMovement` nella categoria "PPR", `ppr.service.ts:661-688`) ed è **irreversibile** dalla UI. L'annullamento è invece una conferma inline a **25px**.

**Opzioni**
- **A — Chiusura come `secondStep` dentro lo stesso sheet** (R-15.2-a alla lettera, come il rifiuto PPR, il diniego prenotazione e lo storno volo di 15.6): "Completa" sostituisce righe+azioni con i due campi + "Conferma"/"Annulla", **senza aprire un secondo overlay**; il focus va al campo tassa entrando e torna al bottone uscendo (lezione 15.2 F1). L'annullamento è un **secondo** `secondStep` con la sola conferma. La riga-pannello desktop resta invariata.
- **B — Chiusura in un pannello a tutto schermo** (`SlideOver` in modalità mobile, R3): due campi e un'azione ancorata in basso, con lo sheet chiuso prima (AD-9). Più spazio, ma è un terzo overlay per un form da due campi, e la 15.2 ha già scartato quella scelta per il motivo del rifiuto PPR.
- **C — Si tiene la riga-pannello anche su mobile**, portando solo i target a 44px: costa poco, ma lascia in piedi il difetto misurato (il pannello che si apre fuori dallo schermo) e due grammatiche diverse per la stessa classe di decisione.

**Sotto-decisione (la conferma dell'annullo)**: oggi sono due bottoni da 25px accanto a una frase. Su mobile diventano un `secondStep` con la stessa frase e due bottoni `flex:1` da 44px, oppure restano inline nella card — ma una card è **un solo `<button>`** (R-15.2-b), quindi inline **non è possibile** senza annidare elementi interattivi: la conferma **deve** vivere nello sheet.

**Raccomandazione: A + la sotto-decisione come scritta.** Motivi: (i) è la grammatica ratificata quattro volte e mette la decisione **dove è iniziata l'azione**, che per un'operazione con effetto contabile è la cosa giusta; (ii) evita un terzo overlay e la sovrapposizione pannello-su-sheet che R-15.4-d ha deciso di non introdurre; (iii) `CompleteForm` è già un componente con `onSuccess`/`onConflict`/`onCancel`, quindi la sua **logica** si riusa intera (AD-8) e cambia solo dove viene resa. Se il PO preferisce **B**, va messo in conto che il pannello va aperto **dopo** aver chiuso lo sheet e che il ritorno porta alla lista, non al dettaglio.

---

### Q5 — La testata Scadenze (7 gruppi di controllo) su mobile: quale forma prende?

**Il fatto, con l'aritmetica**: la testata ha **`.segmented` a 5 bottoni + tipo + ricerca pilota + export + Quota + Promemoria** e misura **262px** a 375px (304 a 320px, **262 anche in EN**, e **non cresce** con un filtro attivo perché non c'è nessun "Azzera"), contro i 107px di 1280px; la prima riga comincia al **70%** dello schermo (a 320px è **sotto il fold**). Nessun controllo raggiunge i 44px (segmented **27**, tipo 35, ricerca **18**, export 35, quota 35, promemoria 35). Il riordino 15.5 alla lettera (tutto full-width, ogni target ≥44) darebbe: finestra 44 + tipo 44 + ricerca 46 + export 44 + quota 44 + promemoria 44 = 266, più 5 gap da 8 = 40, più 24 di padding ⇒ **330px**, cioè **+68px**. ⚠️ E `.segmented` ha **6 consumer** (§a.8): qualunque regola su quella classe toccherebbe Pianificazione, Panoramica e Statistiche.

**Opzioni**
- **A — Riordino 15.5 alla lettera**: ~330px. **Sconsigliata**: peggiora la cosa che la story deve risolvere.
- **B — Chip strip sulla FINESTRA + ricerca full-width + [Filtri (N) | Esporta] + le due azioni di pagina in una riga.** La finestra è già un `enum` di 5 valori sanificato server-side, ed è **il filtro che cambia il significato della lista** (60/30/7/scaduti/tutte): è la chip strip per costruzione, e le chip navigano da sole come `Link` (pattern 15.4/15.6). Il pannello "Filtri" contiene il solo **tipo** (+ un "Azzera" **nuovo**, v. §a.5 asimmetria 1). Stima: chip strip 64 (fuori dalla testata, come in 15.6) + ricerca 46 + riga [Filtri|Esporta] 44 + riga [Quota|Promemoria] 44 + 2 gap 16 + padding 24 = testata **174** + strip **64** = **238** (< 262 ✓).
- **C — Come B, ma le due azioni di pagina escono dalla testata** e vanno in uno sheet "Azioni" o in fondo alla lista (⟨Q7⟩). Testata **~130** + strip 64 = **194**: il massimo guadagno verticale, al costo di un tap in più per due azioni che un admin usa raramente (i promemoria sono un job idempotente, la quota è un'operazione occasionale).
- **D — Tutto nel pannello** (finestra compresa): testata ~120, ma il taglio più frequente costerebbe 3 tap e la lista non direbbe più a colpo d'occhio *quale finestra sta guardando*.

**Raccomandazione: B**, con la precisazione che il bottone "Filtri" **dichiara quanti filtri nasconde** (altrimenti un filtro nascosto è un filtro dimenticato) e che **la chip strip è markup nuovo**: il `.segmented` desktop non si tocca e non si restilizza (6 consumer). Se il PO sceglie **C**, va deciso insieme a ⟨Q7⟩ dove finiscono le due azioni. Nota onesta: anche con B la prima card resta intorno al 50-55% dello schermo, perché sopra la card ci sono `.page-head` (51) e la KPI strip (99) — che sono fuori dal mandato di questa story, salvo ⟨Q8⟩.

---

### Q6 — La testata Movimenti (4 controlli + CTA) su mobile: quale forma prende?

**Il fatto, con l'aritmetica**: `.card-head` misura **143px** a 375px (**230** a 320, **186** con un filtro attivo, **143 anche in EN**) contro i 68px di 1280px, e `.page-head` ne aggiunge **106** (contro 51) perché la CTA "Registra arrivo" va a capo. Nessun controllo raggiunge i 44px: stato 36, dal 39, al 39, azzera 35, export 35, **CTA 127×35**, e i due trigger del calendario **24×24**. Il riordino 15.5 alla lettera darebbe: stato 44 + dal 44 + al 44 + azzera 44 + export 44 = 220, più 4 gap = 32, più padding 24 ⇒ **276px** di sola `.card-head`, cioè **+133**. ⚠️ La CTA vive in un `div` **inline-styled senza classe** (`page.tsx:154`), quindi la regola `.home-head-actions > .btn` di R-15.3-d **non la raggiunge**: è l'unica CTA di pagina dell'epic rimasta in quello stato.

**Opzioni**
- **A — Chip strip sullo STATO + [Filtri (periodo) | Esporta] + CTA full-width.** Lo stato è un enum di 6 valori (`ALL` + 5) già sanificato server-side, ed è il filtro che decide *quali* transiti si stanno guardando; il periodo (due `DateInput` con popover portalati) va nel pannello, dove c'è spazio e dove i popover non competono con la testata. Stima: strip 64 + riga [Filtri|Esporta] 44 + padding 24 = `.card-head` **68** + strip **64** = **132** (< 143 ✓, e < 186 con filtri attivi); `.page-head` con la CTA full-width a 44px ⇒ **~100** (≈ invariata, ma con un target usabile).
- **B — Riordino 15.5 alla lettera** (tutto full-width nella testata): ~276px. **Sconsigliata**.
- **C — Tutto nel pannello** (stato compreso): `.card-head` ~68, ma un registro che mostra solo gli APPROVED **senza dirlo in modo evidente** è il modo più facile per credere che non ci sia nessuno al suolo. Il default della pagina **è** un filtro (`status=APPROVED`, `page.tsx:35`), e oggi lo si legge solo aprendo il `<select>`.
- **D — La chip strip sostituisce il `<select>` anche sul desktop**: cambia il desktop, fuori mandato, e romperebbe `movements.spec.ts:407/437` (`selectOption`).

**Raccomandazione: A**, con **CTA "Registra arrivo" full-width a ≥44px** nella grammatica già ratificata (R-15.3-d/R-15.4-f/R-15.5-g/15.6): è l'unica azione primaria della pagina, è la ragione per cui un operatore apre questa pagina dal piazzale, e oggi è un bersaglio da 35px. La regola va ancorata al wrapper della CTA — che **oggi non ha classe**: gliene va data una (è markup nuovo di zero costo, non un cambio di comportamento) e il desktop va rimisurato invariato.

---

### Q7 — Promemoria e quota associativa su mobile: dove vivono, e dove va il loro esito?

**Il fatto**: sono le **uniche due azioni di scrittura** della Scadenze (§c) e sono **azioni di PAGINA**, non di riga. "Invia promemoria" (`settings.manage`) è un job **idempotente** (`SentAlert`, 6.3 AD-9) il cui esito è un `<p role="status">` **dentro la testata della card** (`scadenze-console.tsx:275-279`) — la stessa forma che la 15.6 ha sostituito col toast su mobile (R-15.6-d ii), perché *un conferma-e-poi-niente su un telefono è il modo più facile per far ripetere l'operazione a chi non l'ha vista andare a buon fine*. "Quota associativa" (`finance.manage`) apre una **`.mini-modal` z60** che a 375px misura 335×385 e funziona, ma ha il submit a **35px** e la checkbox override a **13×13**.

**Opzioni**
- **A — Entrambe restano in testata** (⟨Q5⟩ opzione B), portate a 44px; l'esito dei promemoria passa dal **toast** su mobile (host già sollevato sopra la tab bar dalla 15.1, z 200) lasciando il `<p>` al desktop; la quota resta nella `.mini-modal`, coi target a 44px.
- **B — Come A, ma la quota diventa un pannello a tutto schermo** (R3: è un form con due campi, un typeahead e una checkbox — cioè esattamente ciò per cui esiste la modalità full-screen di `SlideOver`). La `.mini-modal` resta al desktop, invariata. Costo: un pannello nuovo; guadagno: il typeahead persone ha finalmente spazio, e la checkbox "Forza addebito" — che è una decisione deliberata — smette di essere un bersaglio da 13px.
- **C — Le due azioni escono dalla testata** e vivono in fondo alla lista (`.mobile-card-foot`) o in uno sheet "Azioni della pagina" (⟨Q5⟩ opzione C). Guadagna ~44px di testata; costa un tap e introduce un pattern nuovo che l'epic non ha ancora.

**Raccomandazione: B** (cioè A + la quota a tutto schermo). Motivi: (i) il toast è la grammatica di tutto il resto dell'epic e l'host è già lì; (ii) la modale della quota è, dopo lo storno chiuso in 15.6, **l'ultimo overlay dell'app che non parla la lingua dell'epic**, e a differenza dello storno non è un solo campo di testo: ha un typeahead su 338 persone, un importo e una checkbox che decide se scavallare un rifiuto del server — su 335px di larghezza è stretta per costruzione; (iii) `MembershipFeeModal` è già un componente isolato con `onClose`/`onCharged`, quindi il contenuto si riusa e cambia solo il contenitore. Se il PO preferisce non aprire un pannello nuovo, **A** è accettabile e costa due righe di CSS ancorate — ma va detto che i 13px della checkbox restano un difetto misurato.

---

### Q8 — I KPI delle due pagine: strip o griglia 2×2?

**Il fatto**: entrambe le pagine hanno **esattamente quattro** KPI e oggi entrambe li rendono come la **strip a scroll-snap** della 15.2 (misurato: Scadenze `cw 375 / sw 679`, Movimenti `cw 375 / sw 687`, card da 146px ⇒ il 3° e il 4° si vedono solo dopo uno swipe). La 15.3 ha già introdotto la variante `.kpi-row.kpi-row-grid` (2×2, `airops.css:2078-2093`) **proprio per le facce con quattro KPI**, con la motivazione ratificata (R-15.3-c): *"in una strip il 3° e il 4° sono raggiungibili solo dopo uno swipe, e su quelle facce sono i numeri per cui l'attore ha aperto l'app"*. Qui i quattro numeri sono: **Scaduti / ≤7g / ≤30g / ≤60g** (dove i primi due sono i soli che richiedono un'azione) e **Al suolo ora / In arrivo oggi / Attesi domani / Movimenti nel mese** (dove il primo è nel sub della pagina e il quarto è statistica).

**Opzioni**
- **A — 2×2 su entrambe** (`kpi-row-grid`): una riga di CSS per pagina, tutti e quattro i numeri visibili insieme; costo verticale misurato ≈ +90px sulla Scadenze e +70px sui Movimenti rispetto alla strip (due file invece di una), che si mangiano una parte del guadagno di ⟨Q5⟩/⟨Q6⟩.
- **B — Strip invariata su entrambe**: zero lavoro, ma su una pagina dove "Scaduti" è il numero che fa agire, la strip lo mette in prima posizione (bene) e nasconde gli altri tre (accettabile).
- **C — 2×2 solo sulla Scadenze** (dove i quattro numeri sono un unico gradiente di urgenza e vanno letti insieme), strip sui Movimenti (dove il primo numero è già nel sub della testata e il quarto è statistica).

**Raccomandazione: C.** Motivo: la ratifica R-15.3-c è motivata dal **valore d'uso dei numeri nascosti**, non dal loro numero. Sulla Scadenze i quattro tier sono una scala che si legge insieme (10 / 5 / 6 / 0 sul DB attuale) e il quarto è informativo quanto il primo; sui Movimenti "Al suolo ora" è **già ripetuto nel sub della pagina** (`page.tsx:152`, "N attualmente al suolo") e "Movimenti nel mese" è una statistica che nessuno guarda dal piazzale — la strip è la resa onesta. **A** è difendibile per uniformità; **B** è la scelta a costo zero se il PO vuole massimizzare il guadagno verticale di ⟨Q6⟩.

---

### Q9 — "Le mie scadenze": stessa card, e con quale sheet? ⟨dipende da Q1⟩

**Il fatto**: se ⟨Q1⟩ include la faccia self, la sua lista mostra **quattro** colonne (tipo, scadenza, stato, note) senza filtri, senza azioni e senza paginazione, e misura **317/600** a 375px con `student-name` clippato **150/240**. Ha inoltre due particolarità: (i) può portare un `my-expiry-pending-badge` ("Proposta in attesa") che è un **residuo di sola lettura** — la 12.13 ha ritirato il flusso di proposta, quindi il badge può ancora comparire su una riga pre-cutover ma non c'è nulla da farci; (ii) l'empty state (misurato su allievo e istruttore: 0 righe) è un `<p>` dentro la stessa `.card`, **senza testid proprio**.

**Opzioni**
- **A — Stessa card di ⟨Q2⟩ (senza il nome della persona, che qui è sempre "io"), con lo sheet** che porta le note e lo stato per esteso. Una forma sola, un modificatore CSS solo, e il pilota può finalmente leggere le note del proprio documento (che oggi sono nella quarta colonna, fuori schermo).
- **B — Stessa card, senza sheet** (le 4 colonne stanno tutte sulla card: tipo + data nel sub, stato a destra, note in una seconda riga del sub): zero sheet nuovo, ma le note possono essere lunghe e la card diventa a due altezze diverse.
- **C — Faccia self rimandata a 15.9** (⟨Q1⟩ opzione B).

**Raccomandazione: A**, con l'aggiunta obbligatoria di un **testid proprio per l'empty state** (oggi non c'è, e senza di esso l'AC 12(vii) non è scrivibile). Il `pendingBadge` si porta com'è, senza azioni: è ciò che il desktop fa.

---

### Q10 — Il collegamento fra la coda PPR e i transiti: si crea?

**Il fatto**: una richiesta PPR **approvata** sparisce dalla coda (`/dashboard/ppr`) e ricompare come transito (`/dashboard/movements`) — sono la stessa riga `PprRequest` in due fasi di vita. Oggi **non esiste alcun link fra le due pagine** (grep: zero occorrenze di `/dashboard/movements` fuori dal route-registry e dai suoi stessi file; `/dashboard/ppr` è linkato solo dal feed Avvisi della Panoramica). Su desktop entrambe sono a un click nella sidebar; su mobile **entrambe finiscono nello sheet "Altro"** dell'admin (nessuna delle due ha `mobileSlot`, `route-registry.ts:94-95`), cioè a **due** tap ciascuna. Il `pprNumber` è il collante naturale ed è già nel DTO.

**Opzioni**
- **A — Nessun link nuovo.** Le due pagine restano indipendenti come oggi; il perimetro della story non cresce. Il costo è che un operatore che approva una richiesta dal telefono deve tornare allo sheet "Altro" per vederne il transito.
- **B — Un ingresso dallo sheet del transito verso la richiesta PPR** ("Vedi richiesta", che porta a `/dashboard/ppr?...`): ma la coda PPR **non filtra per numero** (`ppr-console.tsx` ha solo il filtro di stato), quindi il link atterrerebbe su una lista, non sulla riga — cioè lo stesso difetto che la 15.4 ⟨Q5⟩ ha dovuto chiudere sul deep link `?status=PENDING`. Farlo bene richiede un filtro nuovo lato server.
- **C — Uno `mobileSlot` per una delle due** nella tab bar dell'admin: cambierebbe la barra ratificata in 15.1 (R-15.1-a) e toglierebbe il posto a Panoramica/Pianificazione/PPR/Aeromobili.

**Raccomandazione: A.** Motivi: (i) B introdurrebbe un deep link che **non filtra**, che è esattamente il difetto che l'epic ha già dovuto riparare una volta, e ripararlo bene significa toccare il server in una story il cui mandato è la UI; (ii) C riapre una ratifica di shell chiusa in 15.1. Se il PO vuole comunque il collegamento, la forma onesta è **B con il filtro server-side per `pprNumber`**, e va messo in conto come lavoro backend aggiuntivo (schema di query, sanificazione, test) — oppure rimandato alla 15.9, che possiede già `/dashboard/ppr` e il modulo pubblico.

---

### Q11 — I tre debiti che questa story tocca: si chiudono o si subiscono?

**I fatti misurati** (§a.5, §a.1, AC 15):
1. **L'export della Scadenze non riflette i filtri della lista**: `page.tsx:103` costruisce gli href con il solo `expiryTypeId` — `window` e `personQuery` vengono **persi**. Un admin che esporta dopo aver cercato "Rossi" ottiene **tutte** le scadenze del tipo selezionato. La Movimenti è invece in parità piena. Chiuderlo = due parole in una riga di `page.tsx` (`window` e `personQuery` dentro `exportFilterQuery`), e l'API le accetta già (`listAllExpiriesQuerySchema` ha entrambi i campi, `schemas/expiries.ts:142-149`). ⚠️ Ma cambia il **desktop**: gli href diventano diversi, e `pdf-exports.spec.ts:225` esporta con `?expiryTypeId=` (resterebbe verde).
2. **`labels.filters.reset` è orfano**: la Scadenze non ha alcun "Azzera filtri", mentre i Movimenti sì. Se ⟨Q5⟩ introduce un pannello, il pannello ne ha bisogno — ed è un **controllo nuovo** su una superficie che il mandato dice di portare, non di estendere.
3. **Il contrasto 3.38:1 della colonna "Giorni rimasti"** (`--bad` su `--bad-soft`) è sotto il 4.5 richiesto al testo, sul **desktop**. La card mobile può evitarlo usando i toni `-ink`; correggerlo sul desktop è una riga ma tocca una superficie che la story dichiara invariata.

**Opzioni** (una per punto)
- **1 — A: si chiude** (due parole, l'export dice la verità). **B: si subisce**, TD registrato con la misura.
- **2 — A: il pannello mobile ha il suo "Azzera"** (usa l'etichetta orfana, che esiste già in entrambi i locale) e il desktop resta senza. **B: si aggiunge anche al desktop** (cambio desktop). **C: niente Azzera**, il pannello si svuota a mano.
- **3 — A: si subisce** (TD, il fix è token-level e appartiene al dark/a11y pass di 15.10). **B: si corregge subito** sul desktop (una riga, ma è un cambio desktop dentro una story "desktop invariato").

**Raccomandazione: 1-A, 2-A, 3-A.** Motivi: (1) è il difetto più concreto dei tre — un export che mente sui filtri è un dato sbagliato consegnato a qualcuno, costa due parole e non rompe nulla di misurato; (2) l'etichetta esiste già tradotta in entrambi i locale e il pannello senza un "Azzera" costringerebbe a rimettere a mano quattro controlli, mentre aggiungerlo al desktop è un cambio non richiesto; (3) è la stessa classe del TD (h) già rimandato dalla 15.6 a 15.10 e va trattata allo stesso modo — con la card mobile che **non** eredita la coppia difettosa, misurata e dichiarata.


---
---

# Dev Agent Record (Opus 5 xhigh, 2026-08-04)

Status: **implementata — pronta per la review adversarial**. Nessun commit (regola di consegna).

## 0) Verifica della ricognizione — 12 conferme, 8 correzioni

Metodo: misure a runtime su **build di produzione** (`env -u NODE_ENV npm run build && npm run start`), script `playwright-core` throwaway (Chromium `~/.cache/ms-playwright/chromium-1228`, import per path assoluto), baseline catturata **prima** di scrivere una riga di codice e ri-catturata dopo.

**Confermate**
1. `grep -rn 'data-testid\^=' e2e/` → **14 occorrenze**, prefissi `pilot-row-`, `ac-card-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-fleet-card-`, `mobile-fleet-`. Nessuno tocca `scadenze-`, `ppr-register-`, `ppr-complete-`, `my-expiry-`, `movements-`, `log-arrival-`, `membership-fee-` ⇒ **suffisso `-mobile` legale** (AD-5 rispettata).
2. Righe dei sei file: 245 / 539 / 92 / 306 / 465 / 46 — esatte.
3. Scadenze `.card-head` **261.5** @375 e @390, **304.34** @320, **identica in EN**. (recon: 262 / 304 / EN identica ✓)
4. Movimenti `.card-head` **142.98** @375, **229.83** @320, **185.83** con un filtro attivo; `.page-head` **106.28** a ≤640. (recon: 143 / 230 / 186 / 106 ✓)
5. `.search` `cw 188 / sw 190` **a ogni larghezza, desktop compreso** — seconda occorrenza del TD (g) della 15.6 ✓.
6. `.students` Scadenze `317/868`, Movimenti `317/800` (su DB popolato) ✓.
7. Il `SlideOver` **CHIUSO** di `ManualPprForm` è uno scroller discendente di `.page`: `FORM 335/355` @375, `.slideover 641/1161 · 800/1320 · 1280/1800` ✓.
8. `expiries/page.tsx:118` monta `ScadenzeConsole` **senza `key`**; `movements/page.tsx:217` remonta con `key` ✓ — l'asimmetria AD-4 è reale e ha dettato due scelte diverse (v. §3).
9. `movements.spec.ts`: `page.getByText(created.registration)` page-level a **276, 397, 409, 419, 422** ✓ (5 punti).
10. `expiry-dashboard.spec.ts:135` legge `'Nulla in questa finestra.'` page-level ✓.
11. `expiry-alerts.spec.ts:254-255` conta `scadenze-send-reminders-button` = 0 per un pilota ✓.
12. `.segmented` ha **6 consumer** ✓ — nessuna regola di questa story lo nomina.

**Corrette**
- **C1 — La baseline desktop dell'AC 13 sbaglia il valore a 800px.** La story dà `.card-head` Scadenze **107 / 148 / 148** (1280/800/641); misurata pre-fix: **106.84 / 106.84 / 148.23**. A 800px la testata è di **due** righe, non tre. (Il valore post-fix è identico: 106.84.)
- **C2 — `scadenze-filter-type` non misura 267×35 ma 154×35.** Quel `<select>` ha `width:auto`, quindi la sua larghezza è quella dell'**opzione più lunga**: con un tipo di scadenza run-unique da 34 caratteri sale a **239px**, e a 800px quei +85px fanno passare la testata desktop da 106.84 a 148.23. **Sensibilità ai dati, non alla CSS**: tutte le misure desktop di questo record sono state ri-prese disattivando i tipi-fixture, ottenendo esattamente i numeri della baseline.
- **C3 — Il DB appena seminato non ha nulla in nessuna delle tre superfici.** I conteggi della ricognizione (338 persone, 437 scadenze, 28 PPR, 7 righe per il pilota) sono quelli di un DB **post-suite**. Su DB fresco: registry Scadenze vuoto, registro Movimenti vuoto, "Le mie scadenze" del pilota vuoto (card 264×52.84, solo empty state). Ogni misura di questo record è stata presa con **fixture esplicite**.
- **C4 — `.page-head` dei Movimenti in EN a 320px misura 125.13, non 106.28.** La ricognizione ha registrato solo il valore IT.
- **C5 — A 320px, pre-fix, la `.card` e la `.card-head` della Scadenze sono esse stesse scroller orizzontali** (`262/278`). Non è nella ricognizione; il fix la elimina.
- **C6 — La story dichiara "questa story non scrive `AppSettings` ⇒ nessuno spec nuovo entra nella catena serializzata", ma l'AC 8 chiede il percorso quota.** Il bottone "Quota associativa" è `disabled` finché `membership.annualFeeCents` è 0, quindi esercitarlo **richiede** di scrivere quella chiave globale — che `membership-fee.spec.ts` scrive cinque volte e **lascia a 0** per la sua ultima asserzione. Deviazione ratificata da me e dichiarata: i due test della quota vivono in `e2e/mobile-membership-fee.spec.ts`, **nella catena serializzata** (dopo `mobile-overview-overflow`), e ripristinano 0 in `afterAll`.
- **C7 — Un bucket stato+giorno del registro Movimenti può superare la pagina.** Misurato: `status=APPROVED&from=D&to=D` → **36 righe, 2 pagine**. "L'ultima pagina dello stato" non basta a raggiungere una fixture: lo spec nuovo usa `gotoMovementsFor(status, eta)` = filtro stato **+** giorno-Roma dell'ETA **+** ultima pagina di *quel* bucket.
- **C8 — I due link della paginazione Movimenti sono `aria-disabled` a pagina 1 e diventano pointer-transparent**: `elementFromPoint` sul loro centro restituisce il `<nav>` padre. Una guardia di copertura ingenua li conta come "coperti"; la guardia corretta ignora un **antenato** (un antenato non può coprire il proprio figlio).

## 1) Riepilogo per AC, con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 — lista Scadenze a card | ✅ | e2e "AC 1/12": `.scadenze-desktop-body` `none` e `.scadenze-mobile` `block` **misurati a 375**, l'inverso a 1280; card = 1 solo elemento interattivo (`querySelectorAll('button,a,input,select,textarea,[tabindex]').length === 0`), ≥44px, `aria-label` con **persona + tipo**; empty state proprio con **stringa nuova** (`registry.mobile.empty`), un solo nodo |
| 2 — lista Movimenti a card | ✅ | e2e "AC 2/12" + "AC 2 sette stati": `Badge` con `MOVEMENT_STATUS_TONE` (nessun literal nuovo), marche in chip mono + tipo mono `--ink-3`, sub `rotta · richiedente · ETA hh:mm`; i **7** valori di `MovementStatusLabel` esercitati con fixture proprie |
| 3 — sheet a parità piena | ✅ | e2e "AC 3" (apertura **da tastiera**, Tab reali + Enter) e "AC 3/12": sheet = 1 nodo, nome accessibile ben formato provato su un transito **senza `pprNumber`** (PENDING) — guardia su **proprietà** (`/—\s*—/`, `/·\s*·/`, segmenti non vuoti/non segnaposto), mai `split().length` |
| 4 — chiusura con tassa | ✅ | 4 e2e a 375px: (a) azioni solo su APPROVED (PENDING e COMPLETED: 0 azioni); (b) tassa non parsabile ⇒ `role="alert"` e **0 richieste** contate con `page.route`; (c) metodo default `CASH`; (d) prefill non vuoto; (e) `Idempotency-Key` presente, **una sola** richiesta; (f) 409 ⇒ toast `conflictError`; (g) fee 37,50 ⇒ **esattamente 1** `CashMovement` `PPR <n> landing fee` letto **dall'API filtrata**, fee 0 ⇒ **0**; (h) annullo senza tassa né movimento; (i) toast + refresh; (j) `CompleteForm` **riusato intero**. Submit **hit-testabile senza scroll orizzontale** (`pageOverflow 0`), tutti i target ≥44 |
| 5 — testata Scadenze | ✅ (con una nota misurata) | 261.5 → **175 + 64 di chip strip = 239** @375/390 (IT ed EN), 304.34 → **248.69** @320; ogni controllo ≥44px (campo pilota da **18 → 44**); tutti i filtri e le due azioni raggiungibili; contratto URL invariato. ⚠️ **Nota onesta**: la prima card resta più in basso di prima (top **609** contro **567** pre-fix, a 375×812), perché la KPI 2×2 ratificata da R-15.7-h costa **+97.7px** (`.kpi-row` da 101.16 a 198.84) contro i **−22.5px** guadagnati dalla testata. Il costo era previsto e accettato da ⟨Q8⟩ ("≈ +90px sulla Scadenze"); il criterio dell'AC 5 è sulla **testata**, ed è rispettato. Sui Movimenti, dove i KPI restano una strip, la prima card sale da **512** a **445** |
| 6 — testata Movimenti | ✅ | 142.98 → **69 + 64 = 133** @375/390, 229.83 → **133** @320, 185.83 (filtro attivo) → 133; CTA `log-arrival-button` **127×35 → 319×44 full width**; `.page-head` 106.28 → **115.44** (+9.16 = 44−34.84, il prezzo del target, dichiarato); popover data dentro il pannello, mai `Escape` |
| 7 — "Le mie scadenze" | ✅ | e2e "AC 7/14": card+sheet per il pilota, `my-expiries-desktop-body` `none` a 375 e visibile a 1280; **empty state con testid proprio** (`my-expiries-empty` desktop, `mobile-my-expiries-empty` mobile), 1 nodo ciascuno, verificato su allievo **e** istruttore |
| 8 — promemoria, quota, KPI | ✅ | promemoria: toast a 375, `<p>` **un solo nodo** e `display:none` sotto 640; quota: pannello **0,0 375×812**, submit 44, checkbox **13→20**, successo/saldo insufficiente/override in `mobile-membership-fee.spec.ts`; KPI **2×2** sulla Scadenze (`kpi-row-grid`), **strip** sui Movimenti |
| 9 — paginazione | ✅ | e2e "AC 9": stesso contratto `?page=`, target ≥44 su entrambe (`registry-pagination` anche sul `<nav>` che vive **fuori** da `MovementsTable`), filtri preservati |
| 10 — testid | ⚠️ parziale, misurato | Tutti i testid desktop = **1 nodo** a 375 **e** a 1280 su `/expiries`, `/movements` e `/dashboard` ✓. **L'ultima clausola dell'AC ("`getByText(<marche>)` al più 1 nodo a 1280") è irrealizzabile con l'architettura dell'epic** e contraddice il blast radius 1: lo switch è CSS-only, la card mobile *deve* stampare le marche, `getByText` conta anche i nodi nascosti ⇒ **misurato: esattamente 2, uno per albero**. La cura corretta è quella prescritta dal blast radius — **scopare** le asserzioni page-level — ed è stata applicata (5 in `movements.spec.ts` + 1 in `expiry-dashboard.spec.ts`). Lo spec asserisce la proprietà verificabile: 1 nodo per albero, 2 in totale |
| 11 — geometria e layering | ✅ | `pageOverflow 0` a 320/375/390 su tutte e tre le superfici; scroller nascosti = **solo** chip strip e KPI strip (per progetto) più il `SlideOver` CHIUSO di `ManualPprForm` (eccezione dichiarata, escluso misurando `.slideover:not(.open)`); **contenimento** dei figli delle card = 0 sfondamenti; nessun controllo sotto la **tab bar** (la topbar sticky resta l'eccezione baseline 15.1, dichiarata); sheet copre la barra con lo scrim, pannello con `so-foot`, mini-modal z60 sopra |
| 12 — guardie discriminanti | ✅ | tabella §5 |
| 13 — invarianti | ✅ | §4 |
| 14 — multi-attore | ✅ | ADMIN/PILOTA/ALLIEVO/ISTRUTTORE a 375 e 1280 con `clearCookies()` fra le identità; redirect da `/dashboard/movements` **anche a 375px** per i tre non-admin. Il caso "expiries.manage senza settings/finance.manage" **non è costruibile** col modello post-14.9 (ADMIN ha tutto): dichiarato, non saltato — il gate resta quello del server (`canTriggerReminders`/`canChargeMembershipFee`) e `expiry-alerts.spec.ts:254` continua a contarlo a 0 per un pilota, perché il trigger è rimasto **un solo nodo** |
| 15 — debito tecnico | ✅ | §7 |

## 2) File toccati

**Sorgenti**
- `src/lib/mobile-sub-line.ts` (**nuovo**) — `joinSegments`, la lezione 15.5 F1 in una funzione sola, ora che ha tre consumer.
- `src/lib/mobile-sub-line.test.ts`, `src/lib/mobile-expiries.test.ts`, `src/lib/mobile-movements.test.ts` (**nuovi**).
- `src/lib/mobile-expiries.ts`, `src/lib/mobile-movements.ts` (**nuovi**) — derivazioni pure di AD-6.
- `src/lib/mobile-logbook.ts` — due righe: importa `joinSegments` invece di ridefinirlo (nessun cambio di comportamento; i suoi test passano invariati).
- `src/app/[locale]/dashboard/expiries/page.tsx` — export che porta `window`/`personQuery` (R-15.7-k(1)); label mobile.
- `src/app/[locale]/dashboard/expiries/scadenze-console.tsx` — albero mobile, chip strip, pannello Filtri, toast promemoria, quota full-screen, KPI 2×2.
- `src/app/[locale]/dashboard/expiries/my-expiries.tsx` — albero mobile + sheet + empty state con testid.
- `src/app/[locale]/dashboard/movements/page.tsx` — classe sul wrapper della CTA, `registry-pagination` sul `<nav>`, label mobile.
- `src/app/[locale]/dashboard/movements/movements-table.tsx` — albero mobile, chip strip, pannello Filtri, sheet con i **due** `secondStep`, `CompleteForm` parametrizzato sul suffisso testid.
- `src/styles/airops.css` — blocco `scadenze + transiti mobile (story 15.7)` in coda (10 dichiarazioni fuori query, il resto dentro `@media (max-width: 640px)`).
- `messages/it.json`, `messages/en.json` — 41 righe ciascuno, **solo aggiunte**, parità piena.

**Test**
- `e2e/mobile-expiries-movements.spec.ts` (**nuovo**, 23 test, project `chromium`).
- `e2e/mobile-membership-fee.spec.ts` (**nuovo**, 2 test, project serializzato).
- `playwright.config.ts` — il project `mobile-membership-fee` in coda alla catena + il suo `testIgnore`.
- `e2e/movements.spec.ts` — le **5** asserzioni page-level scopate alla riga (blast radius 1).
- `e2e/expiry-dashboard.spec.ts` — **una sesta**, non enumerata dal blast radius: riga 182, `page.getByText(type.name)` sulla faccia **self**, che la card di "Le mie scadenze" avrebbe duplicata.

## 3) Decisioni non ovvie

**D1 — Le chip della finestra Scadenze sono `<button>`, non `Link` come in 15.4/15.6.** AD-5 suggerisce `Link`, ma `ScadenzeConsole` è montata **senza `key`** (AD-4, asimmetria misurata): una `Link` navigherebbe senza aggiornare lo stato locale `filters`, e il **filtro successivo** rimanderebbe indietro la finestra appena scelta. Il `<button>` chiama `handleFilterChange`, cioè esattamente ciò che fa il `.segmented` desktop: stesso contratto URL, stato coerente. Sui Movimenti, dove il `key` remonta il componente a ogni navigazione, le chip **sono** `Link` (pattern 15.6). L'e2e AC 5 prova la conseguenza: dopo una chip, "Applica" del pannello **conserva** `window=7`.

**D2 — La quota associativa è una MODALITÀ CSS dello stesso nodo, non un secondo albero.** R-15.7-g chiede il pannello a tutto schermo riusando il contenuto di `MembershipFeeModal`. Un secondo albero duplicherebbe `membership-fee-panel`, `membership-fee-submit`, `membership-fee-amount`, l'`id` DOM del combobox e il suo percorso di rete — tutti letti **page-level** da `membership-fee.spec.ts`. Si adotta il precedente già scritto nel repo per lo stesso problema (`airops.css:1904`, la modalità full-screen di `SlideOver`: "one CSS mode of the one component"). Il `.mini-modal` **non** è agganciato: le regole stanno su `.membership-fee-modal`, classe di questa modale. Risultato misurato: card `0,0 375×812`, submit 168×44, checkbox 20×20.

**D3 — L'esito dei promemoria è annunciato in ENTRAMBI i posti, e la CSS decide quale si vede.** Il trigger deve restare **un solo nodo** (`expiry-alerts.spec.ts:254` + AC 10) e l'architettura vieta di leggere il viewport in JS: non esiste una terza forma. Quindi `sendReminders` scrive il `<p role="status">` (invariato) **e** mostra il toast; `.scadenze-reminders-feedback` è `display:none` sotto 640. **Deviazione dichiarata**: sul desktop l'azione ora produce anche un toast transitorio, che prima non c'era. Nessun cambiamento di geometria, nessuno spec lo legge.

**D4 — Il `secondStep` di chiusura rende lo STESSO `CompleteForm` del pannello desktop** (AD-8, vincolo non negoziabile). L'unica aggiunta al componente è `testIdSuffix` (`'-mobile'`) e `autoFocusFee`. Le tre dichiarazioni inline che portava (padding/flex del form, i due cap a 200px, la riga azioni) sono diventate classi, perché una dichiarazione inline non è sovrascrivibile da una media query (lezione 15.5): `ppr-complete-form`, `ppr-complete-field`, `ppr-complete-actions` hanno lo **stesso stile calcolato** sopra 640px (misurato).

**D5 — Il conteggio "una sola navigazione" filtra le navigazioni verso lo STESSO url.** Next commette un `framenavigated` sull'url corrente a ogni refresh RSC: misurato, con il pannello aperto ce n'è **1 verso lo stesso url e 0 verso un url diverso**; senza pannello il debounce ne produce **uno verso un url diverso** (`?personQuery=`). La guardia conta solo i secondi — che sono esattamente ciò che il pre-fix produrrebbe.

**D6 — `.card-sub` nascosta anche sulla Scadenze.** Tenendola, la testata misurava **198.94 + 64 = 262.94** contro un pre-fix di **261.5**: 1.4px oltre il budget ratificato. Senza: **175 + 64 = 239**, il numero che l'aritmetica di ⟨Q5⟩ aveva previsto. Misurato, non stimato.

**D7 — Le icone delle due azioni di pagina della Scadenze sono nascoste sotto 640px.** "Quota associativa" col suo glifo misura **146.64px** contro i **137.5px** di mezza riga a 375px: andrebbe a capo. Stesso precedente della 15.5 (`.registry-head > .btn[aria-pressed] > svg{display:none}`), stessa motivazione misurata.

**D8 — `.mobile-row-tail` (il chip mono) per le marche del transito, invece del testo mono nudo del template.** Le marche sono lo **stesso dato** che 15.4/15.5/15.6 rendono già come chip: la coerenza dentro l'app batte la fedeltà letterale a una schermata del template che non ha mai visto le altre tre. Il tipo aeromobile prende una classe nuova (`.mobile-row-model`, mono 10.5 `--ink-3`, ellissata) — **un** modificatore per lista, come chiede AD-3.

**D9 — `.ppr-card*` (15.2) NON è riusata**, come AD-3 prescrive: le sue righe non hanno una colonna destra a griglia, e un pill "In arrivo" competerebbe con le marche. Il modificatore è `.mobile-row-transit` su `.mobile-row` (`minmax(0,1fr) auto`), gemello di `.mobile-row-flight` della 15.6.

**D10 — `joinSegments` è uscita da `mobile-logbook.ts`.** Con tre consumer, tre copie di una funzione che *è* la lezione 15.5 F1 sarebbero state il difetto che la funzione previene. Spostata in `mobile-sub-line.ts`, stesso corpo, con il suo test.

## 4) Invarianti desktop — pre/post, stesso set di opzioni

Ri-misurati disattivando i tipi-fixture (v. C2), così i due lati sono confrontabili:

| valore | 641 | 800 | 1280 | pre = post |
|---|---|---|---|---|
| `.app` `grid-template-columns` | `64px 577px` | `64px 736px` | `232px 1048px` | ✅ |
| Scadenze `.card-head` | 148.23 | 106.84 | 106.84 | ✅ (C1: la story diceva 148 a 800) |
| Scadenze `.students` cw/sw | 519/868 | 678/868 | 990/990 | ✅ |
| Scadenze `.kpi-row` (grid, card) | 121.25 | 161 | 239 | ✅ — `kpi-row-grid` non tocca il desktop |
| `.segmented` / suoi bottoni | 259.53×33.39 / 48.94×27.39 | idem | idem | ✅ |
| `.search` (box / cw-sw) | 190×34.13 / 188-190 | idem | idem | ✅ |
| `scadenze-filter-type` | 154×35 | idem | idem | ✅ |
| Movimenti `.card-head` | 114.69 | 110.69 | 67.84 | ✅ |
| Movimenti `.students` cw/sw | 519/800 | 678/800 | 990/990 | ✅ |
| Movimenti `.kpi-row` (card) | 254.5 | 334 | 188.8 | ✅ |
| `log-arrival-button` | 127.11×34.84 | idem | idem | ✅ |
| `.page-head` (entrambe) | 51.44 | 51.44 | 51.44 | ✅ |
| `pageOverflow` / tab bar | 0 / `none` | 0 / `none` | 0 / `none` | ✅ |

Fascia tablet **641-900px**: il rail resta 64px, nessuna superficie nuova compare, le due `.card-head` restano ai valori di sopra. `/dashboard/ppr` non è stata toccata (`ManualPprForm` invariato, AD-10 verificata per misura: pannello `0,0 375×812`, submit 44px hit-testabile).

## 5) Regola nuova → guardia → discriminanza

Ogni guardia è stata ri-eseguita contro una **simulazione del pre-fix col repo intatto** (iniezione CSS/DOM) e deve andare **rossa**. Output integrale in `proofs157.mjs`.

| # | regola introdotta (difetto misurato) | guardia | pre-fix simulato → esito |
|---|---|---|---|
| i | `display:none` delle tre tabelle desktop a ≤640 | e2e AC 1/2/7: `display` **misurato su entrambi i lati** | `.students.scadenze-desktop-body{display:flex}` iniettato ⇒ post `none/block` → pre **`flex`/`none`** ✅ rossa |
| ii | `display:none` dei tre alberi mobile >640 | idem, a 1280 | stessa iniezione, lato opposto ✅ |
| iii | testata Scadenze (262 → 239) | altezza `.card-head + .mobile-chip-strip` ≤ 261.5 **e** `SMALL_TARGETS === []` | rimesse in testata segmented/tipo/titolo/sub ⇒ post **239** → pre **351.69** ✅ |
| iii-bis | testata Movimenti (143 → 133) | ≤ 142.98 + CTA full width ≥44 | idem per costruzione (la CTA pre-fix misura 127×35) ✅ |
| iv | pannello che applica in **una** navigazione | conteggio delle navigazioni verso un url **diverso** | senza pannello il debounce ne produce 1; con pannello 0 e il pannello resta aperto ✅ (D5) |
| v | debounce annullato all'apertura | pannello ancora visibile dopo 900 ms + "Applica" che porta `personQuery` digitato | senza pannello il timer naviga (finestra **non vacua**) ✅ |
| vi | ellissi su ogni testo che può eccedere | sweep `overflow-x:hidden && text-overflow!=ellipsis` | `text-overflow: clip` iniettato ⇒ post `[]` → pre **3 nodi** ✅ |
| vii | contenimento dei figli della card | rect di **ogni** figlio dentro il rect della card | pill spinto di 120px ⇒ post `[]` → pre **2 nodi fuori** (450 > 346) ✅ |
| viii | nome accessibile ben formato | proprietà (`/—\s*—/`, `/·\s*·/`, nessun segmento vuoto/segnaposto) | `'— · Cessna 172 — I-ABC123'` ⇒ **2 fallimenti**; `' · Cessna…'` ⇒ 1. Il `split(' · ').length` **non li distingue**: 2 segmenti, come un sub legittimo ✅ |
| ix | empty state = 1 nodo per albero | `toHaveCount(1)` + **clone DOM** del nodo | `node.parentElement.appendChild(node.cloneNode(true))` ⇒ 1 → **2** ✅ (in-spec) |
| x | selettori ancorati con `>` (mai discendenti) | misura del submit di `ManualPprForm` | variante **discendente** `.movements-head .btn{min-height:90px}` ⇒ post 44 → pre **90** ✅ |
| xi | nessuna regola su `.segmented` | `display`/altezza/`min-height` dei figli su `/bookings`, `/reports`, `/dashboard` | `.segmented{display:none}` iniettato ⇒ post `flex`/33.39 → pre **`none`/0** ✅ |
| xii | `.date-input` toccata solo dentro il pannello Movimenti | altezza `.date-input .input` < 43.5 su `/billing` e `/logbook` | per costruzione: la regola è `.movements-filter-panel .input` ✅ |
| xiii | effetto contabile della chiusura | `CashMovement` letta **dall'API filtrata** per categoria + descrizione run-unique | la stessa asserzione distingue fee 37,50 (**1**) da fee 0 (**0**) ✅ |
| xiv | 409 distinto dal generico | toast `conflictError` dopo una chiusura concorrente reale | il percorso generico produrrebbe l'altro toast ✅ |

**Guardia non scrivibile, dichiarata**: l'AC 10 chiede "`getByText(<marche>)` al più 1 nodo a 1280" — impossibile con lo switch CSS-only (v. AC 10 in §1). La proprietà verificabile che l'ha sostituita è "1 nodo per albero, 2 in totale", asserita.

## 6) Contrasto — enumerato, nei due temi

Metodo: `fillStyle` su canvas 1×1 (i token sono `oklch`, il regex `rgb()` non li legge — errore preso e corretto in corsa), sfondo effettivo risolto risalendo gli antenati **partendo dall'elemento**.

| oggetto | chiaro | scuro |
|---|---|---|
| `.mobile-row-name` (nome/tipo sulla card) | 18.79 | 15.74 |
| `.mobile-row-sub` (sub mono) | **4.85** | 5.72 |
| `.mobile-row-model` (tipo aeromobile, classe **nuova**) | **4.85** | 5.72 |
| `.mobile-row-tail` (chip marche) | 17.01 | 17.67 |
| `Badge` di stato sulla card (peggiore: `Scaduto`) | 8.38 | 7.46 |
| pallino del `Badge` (oggetto grafico, ≥3) | 8.38 | 7.46 |
| chip della strip (inattiva / attiva) | 17.99 | 15.74 |
| `.mobile-card-empty` | 4.85 | 5.72 |
| sheet: over-line / titolo / chiave / valore | 4.85 / 18.79 / 4.85 / 18.79 | 5.72 / 15.74 / 5.72 / 15.74 |
| sheet: azione primaria / distruttiva / chiudi | 17.99 / 6.53 / 9.99 | 15.74 / 6.61 / 9.47 |
| testata: "Filtri", "Invia promemoria", CTA "Registra arrivo" | 18.79 / 17.99 / 17.99 | 15.74 / 15.74 / 17 |
| pannello Filtri: titolo, label, footer | 18.79 / 4.85 / 17.99 | 15.74 / 5.72 / 15.74 |
| chiusura nello sheet: label, input, hint | 4.85 / 17.79 / 4.85 | 5.72 / 14.77 / 5.72 |
| quota: label, azioni | 4.85 / 17.99 | 5.72 / 15.74 |

**Minimo assoluto 4.85** (`--ink-3` su `--panel`, la coppia che 15.6 ha già misurato e adottato). **Nessun testo sotto 4.5, in nessuno dei due temi.** La card mobile **non eredita** la coppia difettosa del desktop (`--bad` su `--bad-soft`, 3.38:1): il pill dei giorni è diventato il `Badge` di stato ratificato in R-15.7-b, e i giorni vivono nel sub a `--ink-3`.

**Non un difetto nuovo**: i bordi hairline `1px solid var(--border)` misurano 1.29-1.30:1 su `.btn`, `.input`, `.badge` e `.mobile-row-tail`. È la hairline dell'**intero** design system dal 12.1 (la stessa di `.card`, `.student-row`, ogni `.btn` del desktop): questa story non ne introduce di nuove e non ne cambia il token.

## 7) Debiti tecnici — chiusi, subiti, nuovi

| TD | esito | misura |
|---|---|---|
| (a) `OPTIONS_PAGE_SIZE = 100` su `expiries/page.tsx:25` | **subìto** | alimenta `initialOptions` del combobox quota, che ha il typeahead server-side: degrada la comodità, non la funzione |
| (b) export Scadenze che perde `window`/`personQuery` | **CHIUSO** (R-15.7-k(1)) | `exportFilterQuery` porta ora `window` (omesso quando `'all'`, che non è un valore dello schema) e `personQuery`; `pdf-exports.spec.ts` resta verde |
| (c) `labels.filters.reset` orfano | **CHIUSO** (R-15.7-k(2)) | è il bottone "Azzera filtri" del pannello mobile; il desktop resta senza, come oggi |
| (d) celle `.student-row` tagliate senza ellissi a ogni larghezza | **subìto**, non ereditato | la card mobile ha `text-overflow: ellipsis` ovunque (sweep = 0) |
| (e) `.search` `cw 188 / sw 190` | **subìto** — seconda occorrenza del TD (g) 15.6 | invariato |
| (f) `.so-sub` a `--ink-4` (3.66:1) | **subìto, ATTIVO**: `ManualPprForm` passa un sottotitolo (`movements/page.tsx:160`) | i due pannelli Filtri **non** passano sottotitolo, proprio per non aggiungere occorrenze; resta a 15.10 |
| (g) contrasto 3.38:1 della colonna "Giorni rimasti" (desktop) | **subìto** (R-15.7-k(3)) | non corretto qui; la card mobile non lo eredita (§6) |
| (h) `movements.spec.ts:269` scrive `settings/ppr-landing-fee` globale dal project parallelo | **subìto** | nessun test nuovo dipende da quel valore: ognuno digita il proprio importo |
| (i) `viewport-fit=cover` mai dichiarato ⇒ `env(safe-area-inset-*)` = 0 | **subìto** (TD di epic, 15.10) | le due nuove `calc(... + env(safe-area-inset-bottom))` valgono oggi come senza |
| (j) `KPI_SCAN_LIMIT = 500` | **subìto**, degradazione già accettata da 12.4 | invariato |
| **(k) NUOVO** — la ✕ (`.iconbtn`) dell'header di `SlideOver` misura **32px** su mobile | **subìto** | è la primitiva condivisa da 11 consumer dal 15.2; portarla a 44 cambierebbe ogni pannello dell'epic: materia 15.10 |
| **(l) NUOVO** — `mobile-membership-fee.spec.ts` scrive `settings/membership-fee` | **dichiarato e isolato** | project **serializzato**, ripristina 0 in `afterAll` (v. C6) |
| **(m) NUOVO** — un bucket stato+giorno del registro può superare la pagina (36 righe misurate) | **gestito** | `gotoMovementsFor` naviga all'ultima pagina *del bucket* |

## 8) Esito della suite — onesto

- **`npm run gates`**: `PASS lint (18s) · PASS typecheck (3s) · PASS test (6s) — 1724 passed · PASS build (26s)`.
- **Unit nuovi**, verificati anche **senza env** (`env -u DATABASE_URL -u AUTH_SECRET npx vitest run …`): 4 file, 35 test, verdi. Le funzioni sono pure e non importano nessun service ⇒ nessuna catena verso `@/lib/env`.
- **Run mirato** (`mobile-expiries-movements.spec.ts` + `movements.spec.ts` + `expiry-dashboard.spec.ts`, `E2E_REUSE_SERVER=1`): **32 passed, 1 failed, 9 did not run**. L'unico rosso era `movements.spec.ts:238` (pre-esistente, "email e telefono su righe proprie"), che naviga a `/it/dashboard/movements` **pagina 1** e cerca la propria fixture: sul DB usato per le misure il registro aveva oltre 20 righe APPROVED, quindi la fixture era a pagina 2. **Fragilità pre-esistente esposta dal volume**, non una regressione — e infatti su DB fresco quel test è verde (v. sotto); i 9 "did not run" erano la coda del suo `describe.serial`.
- **Run mirato del solo project serializzato** (`--project=mobile-membership-fee --no-deps`): **2 passed**. ⚠️ Senza `--no-deps` Playwright esegue prima **tutta** la catena di dipendenze: lezione presa in corsa, e il motivo per cui CLAUDE.md prescrive `--no-deps` per un run locale singolo.
- **Gate finale — suite completa `CI=1` su build di produzione e DB fresco** (`docker compose down -v` + `up` + `migrate deploy` + `db seed`), lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status`:

  ```
  state: DONE — E2E_EXIT=0
  405 passed (9.7m)
  ```

  **405 = 380 (baseline alla chiusura della 15.6) + 23 (spec nuovo) + 2 (spec della quota)**. Zero rossi, zero flaky, tutti i sette project della catena eseguiti.

  Due giri precedenti, entrambi diagnosticati e chiusi, riportati per onestà:
  1. primo giro su DB fresco: **402 passed, 1 failed, 1 flaky** — il rosso era **mio**, `mobile-membership-fee.spec.ts` usava `POST /account/topups` (404) invece di `/account/top-ups` con `paymentMethod`/`effectiveDate`; il flaky era `flights.spec.ts:602`, **pre-esistente** e verde al retry;
  2. secondo giro: **383 passed, 1 failed** — il rosso era ancora **mio**, l'asserzione "lo sheet copre la tab bar" cercava la stringa `mobile-sheet` nella classe dell'elemento colpito, mentre su uno sheet ALTO (il transito ne ha dieci righe) l'elemento sopra la barra è il **pannello** stesso (misurato: `BUTTON.btn bottom-sheet-close`). Riscritta sulla proprietà giusta — l'elemento appartiene al **sottoalbero** `.mobile-sheet` — che è ciò che l'AC 11 chiede davvero.

## 9) Cosa NON ho fatto

- Non ho committato (regola di consegna).
- Non ho toccato `ManualPprForm` (AD-10): il lavoro sul form è stato **verifica misurata**, e la misura conferma la 15.2 (pannello `0,0 375×812`, submit 44px hit-testabile, tab bar coperta).
- Non ho toccato la riga-pannello di chiusura del desktop, né la conferma inline di annullo del desktop (restano 54px e 25px: R-15.7-d dice "riga-pannello desktop invariata").
- Non ho corretto il contrasto 3.38:1 della colonna "Giorni rimasti" né la ✕ a 32px di `SlideOver` (entrambi 15.10).
- Non ho aggiunto link fra coda PPR e transiti (R-15.7-j).
- Non ho toccato `.segmented`, `.mini-modal`, `.students`, `.card-head`, `.kpi-row` come agganci: tutte le regole passano da classi di pagina.
- Il finding `side-tab` dell'hook di design sullo `StatCard` (`borderLeft: 3px solid var(--ink)`) è **pre-esistente dalla 12.11**, è la grammatica KPI di tutta l'app e ricade sotto "desktop invariato" (AC 13): lasciato invariato, non silenziato.
