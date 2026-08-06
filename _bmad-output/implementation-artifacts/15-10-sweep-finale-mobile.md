---
baseline_commit: 79571c5
---

# Story 15.10: Sweep finale mobile — il focus che smette di uscire dai pannelli, l'inchiostro che il template ci ha lasciato addosso, i bersagli delle primitive condivise, e la coda dei debiti chiusa con un numero accanto a ciascuno

Status: **approved** — ratifiche PO 2026-08-06 (AskUserQuestion, sessione principale, quattro giri). Tabella sotto; le Q1-Q13 in fondo restano come record di fatti, opzioni e motivazioni. Tutte e 13 le decisioni coincidono con la raccomandazione del teammate story (Q5 inclusa, la cui raccomandazione era B).

## Ratifiche PO (2026-08-06) — VINCOLANTI

| R | Q | Decisione PO | Effetto vincolante |
|---|---|---|---|
| R-15.10-a | Q1 | **A — perimetro: a11y + inchiostro + bersagli + `/ppr` + e2e + minori; i 40 inline dei form restano DICHIARATI** | Blocchi A, B, C, E, F per intero; del blocco D solo i 3 esemplari «di pagina» (Q9). Il debito ereditato dal desktop (40 inline in 19 file, stati d'errore) resta dichiarato post-epic. |
| R-15.10-b | Q2 | **A — `MobileSheet` (trap + `aria-modal`) + `SlideOver` (dialogo + nome + focus in/out + trap + `inert` da chiuso)** | `inert` da chiuso su SlideOver come PRIMA cosa (difetto A3, il più grave). La scelta trap-manuale vs `inert` sullo sfondo la fa il dev MISURANDO contro gli e2e scoped al landmark. `.cal-popover` resta dichiarato. |
| R-15.10-c | Q3 | **A — `.mobile-tab` + `.so-sub` a `--ink-3` + censimento COMPLETO dei 19 consumatori** | Classificazione testo/decorazione per tutti; si chiudono SOLO i testi sotto soglia misurata. Il valore del token NON cambia (ratifica 13.9 F6). `.so-sub` si vede sul desktop di 6 pagine: dichiarato. |
| R-15.10-d | Q4 | **A — bersagli mobile-only (≤640): ✕ 32→≥44, typeahead 35,56→≥44, `.date-input-btn` 24→≥44** | Desktop identico al centesimo. `.date-input-btn` con UNA regola che unifica le cinque facce, non la sesta eccezione ancorata. |
| R-15.10-e | Q5 | **B — `.cal-popover`: SOLO i 4 non-cella** (2 frecce 24×24 + 2 bottoni 34,84 → ≥44) | Le 42 celle restano 34,58 DICHIARATE (griglia densa per progetto, 7×44 > 280); la larghezza del popover NON cambia; le guardie 13.10-F3 e TD-7 restano verdi intatte. |
| R-15.10-f | Q6 | **A — R3 alla lettera sui 3 editor multi-form col `footer` ESISTENTE** | Submit primario di aircraft/pilot/instructor-editor nel prop `footer` (`.so-foot`, fuori da `.so-body`), `form="<id>"`; azioni secondarie di sezione dove stanno; NESSUNA riga sulla primitiva. `aircraft-editor` va MISURATO prima (forse già a posto dalla 15.2). |
| R-15.10-g | Q7 | **A — il «project mobile» Playwright NON si fa: questione CHIUSA** | Annotare nel record/piano: riesaminato a fine epic coi numeri (13/14 spec dual-width ⇒ zero righe risparmiate, catena da duplicare). |
| R-15.10-h | Q8 | **A — `.card-title` dell'estratto conto nascosta a ≤640 SOLO su faccia self** (`showActor === false`) | −20,3px; scheda persona INTATTA (lì il titolo è l'unico nome della sezione). Chiude il TD (m) della 15.9. |
| R-15.10-i | Q9 | **A — contrasti: i 3 esemplari «di pagina»** (KPI expiries, 64 link Saldi negativi, colonna «Giorni rimasti») | I 40 inline dei form restano dichiarati. Per `--info`: NON esiste `.stat-tone-info` — valutare `--ink` + sottolineatura per il link prima di creare una classe nuova, e RIPORTARE la decisione. |
| R-15.10-j | Q10 | **A — `/dashboard/ppr`: rifinitura misurata, SOLO i 19 bersagli → ≥44** | In gran parte una regola su `ManualPprForm` (medicina 15.9 del form pubblico gemello); card, sheet, testata e struttura INVARIATI e misurati tali. |
| R-15.10-k | Q11 | **A — METAR: `.mobile-metar-card` estesa a ≤900px** (il tablet È superficie d'uso) | Una media query + verifica con stazione configurata ⇒ il test DEVE entrare nella catena serializzata (`mobile-metar.spec.ts` è già il 7° project, ripristino in afterAll). |
| R-15.10-l | Q12 | **A — `viewport-fit=cover` aggiunto** (`export const viewport` nel layout) | Con la limitazione SCRITTA: Chromium headless ha inset 0 ⇒ la verifica di non-regressione è che a inset 0 ogni valore resti identico al centesimo; la verifica su tacca reale non è possibile su questa macchina. |
| R-15.10-m | Q13 | **A — il quoting di `scripts/e2e.sh` si sistema QUI** | Parametri posizionali a `bash -c`; verifica: run mirato con `-g "pattern con spazi"` che pre-fix dà 127 e post-fix passa. Chiude il TD (n) della 15.7. |

> Questa è l'**ULTIMA** story dell'epic 15 ed è uno **SWEEP**: non porta una superficie nuova, chiude (o dichiara) la coda dei debiti che le nove story precedenti hanno **misurato e lasciato scritti**. Il suo primo prodotto è il **CENSIMENTO** (§1), il secondo è la **MISURA** (§2-§7), il terzo è il **TAGLIO ONESTO DEL PERIMETRO** — che decide il PO nelle domande **Q1-Q13** in fondo. Uno sweep che promette tutto consegna niente: il perimetro va **tagliato prima**, non scoperto a metà lavoro.

---

## Story

As **il PO che chiude l'epic 15**, e come **chi userà questa app da un telefono con una tastiera bluetooth, uno screen reader o semplicemente in tema scuro**,

I want che i debiti che le nove story hanno **dichiarato invece di nascondere** vengano chiusi dove ha senso e **rimandati con un numero accanto** dove non ce l'ha,

so that l'epic si chiuda con **una coda leggibile** invece che con una lista di promesse: oggi il pannello a tutto schermo di R3 — l'idioma centrale dell'epic — **non è un dialogo per nessuna tecnologia assistiva** (nessun `role`, nessun nome accessibile, il focus resta sul trigger), **il suo gemello CHIUSO tiene 18 controlli nell'ordine di tabulazione** sotto un `aria-hidden="true"` (misurato su `/dashboard/bookings` a 375px), il **focus esce da ogni bottom sheet** dopo l'ultima voce e atterra sulla tab bar dietro lo scrim, e la **tab bar stessa** — la superficie più toccata di tutto l'epic — ha le sue quattro etichette inattive a **3,50:1 in tema chiaro** e **4,47:1 in tema scuro**, su **tutte e 14** le pagine misurate.

E come **chi dovrà lavorare su questa app dopo l'epic**: che la coda in `sprint-status.yaml` smetta di contenere voci non più vere (ne ho trovate **quattro**, provate) e voci il cui numero è cambiato (ne ho corrette **cinque**).

---

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`, riga 83-84 — la 15.10 è «**Sweep finale — dark theme pass mobile, a11y pass (focus/aria su sheet e form panel), audit copertura e2e mobile, riesame "project mobile" Playwright, full suite arbitro**». Restano in vigore **R1** (soglia 640px; 641-900px tengono il rail 64px), **R2**, **R3** (dettaglio = bottom sheet, form = pannello a tutto schermo con azione primaria fissa in basso), **R4**, **R5**. Architettura: regole **ADDITIVE** dentro `@media (max-width: 640px)` salvo eccezioni **dichiarate**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo, `display:none` VERO su entrambi gli alberi.

**Convenzione testid dell'epic** (15.1, in CLAUDE.md) + **AD-5 della 15.5**: il suffisso `-mobile` è **illegale** dove esiste un selettore `^=` sul nome desktop. Verifica obbligatoria prima di scegliere ogni nome: `grep -rn 'data-testid\^=' e2e/` (alla data della 15.9: **29 occorrenze, 10 file**; prefissi `ac-card-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-tail-chip-`, `mobile-fleet-`, `mobile-fleet-card-`, `reports-fleet-row-`, `reports-rank-aircraft-row-`, `reports-rank-pilot-row-`, `reports-instructor-row-`). **Il dev la rifaccia** e riporti il risultato nel record.

**Le lezioni che questa story può violare davvero** (tutte pagate almeno una volta nell'epic):

1. **Un fix su una PRIMITIVA tocca TUTTO**: `MobileSheet` è il chassis di **ogni** sheet dell'app (BottomSheet, sheet "Altro", menu profilo, ExportMenu); `SlideOver` ha **17 usi in 15 file**; `CalendarPopover` è dietro **ogni** campo data. Ogni modifica qui vuole i **GEMELLI ENUMERATI E MISURATI** — non «gli altri consumatori sono uguali» (lezione 15.3: il glifo verde stava a 1,24:1, *peggio* del rosso che il dev aveva riparato).
2. **Un fix TOKEN-LEVEL tocca anche il DESKTOP**, e va misurato lì (lezione 13.9 → 15.8b → 15.9). Qui vale per `--ink-4`-come-testo e per gli inline `var(--bad)`/`var(--ok)`.
3. **La medicina di classe va misurata sulla CASCATA REALE prima di prescriverla** (15.9 MINOR-1): `.stat-tone-bad` **perde** contro `.fld-label` (pari specificità, dichiarata dopo) e il grigio 4,85 sarebbe passato per un fix. Su un `p.fld-label` la classe giusta è **`.fld-error`** (stesso literal ratificato, 9,82 / 6,61 dark). **Misurato qui: 25 dei 34 inline `var(--bad)` stanno su `className="fld-label"`** — cioè il caso della lezione, 25 volte.
4. **Le guardie si scrivono sul REQUISITO, mai sul valore ottenuto** (15.7 MINOR-1, 15.8b LOW-3). Il pavimento è **44**, la soglia dello sweep **43,5**, sempre.
5. **Un'esclusione non dichiarata è una guardia che mente** (15.8a MINOR-1) — e **un'esclusione scritta con `querySelector` esclude TUTTI gli antenati**: si usa `:scope >` (15.9 MINOR-2). Questa story ha **due esclusioni obbligate e già misurate** (§7.4): il honeypot di `/ppr` e la barra `.so-actions` che sfonda di proposito il padding del form.
6. **`text-overflow: ellipsis` nasconde gli sfondamenti allo sweep** (15.5 F1): il contenimento va asserito **sul rect**.
7. **Il remount va MISURATO, non assunto** (15.7 D1).
8. **Niente asserzioni «riga in pagina 1»** su liste paginate (15.7).
9. **Un cap è una SELEZIONE** (15.8b MAJOR-1): questa story non ne introduce nessuno.
10. **Parità informativa enumerata** contro TUTTO ciò che il desktop mostra o APRE (15.5 F2).

**Fonte visiva**: `AirOps Mobile.dc.html` (+ `data.js`) — copia locale in `/tmp/claude-1000/-home-admin-AirManager/756bf5df-6305-44ec-bd2f-d0e61f2d5e2e/scratchpad/`. Lo scratchpad si ripulisce fra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de`. ⚠️ **Per questa story il template dice poco**: è uno sweep di semantica, inchiostro e bersagli, non di layout. L'unica cosa che il template *impone* e che qui si contesta è il colore delle etichette inattive della tab bar (§3.1).

---

# §1 — LA TABELLA DEL CENSIMENTO

Ogni voce aperta di `_bmad-output/implementation-artifacts/sprint-status.yaml` che nomina la 15.10 o l'epic 15, più i TD dichiarati nei Dev Agent Record e nei Review Record di 15.1-15.9. **Misure rifatte a runtime il 2026-08-06** (build di produzione `npm run start`, DB reale **post-suite**: 386 persone, 177 velivoli, 309 conti, 281 movimenti di conto, 72 PPR, 121 voli, 92 prenotazioni, 47 `ExpiryType`), viewport 375×812 salvo diversa indicazione, tema chiaro salvo indicazione.

Legenda proposta: **CHIUDE** = si fa qui · **DICHIARA** = resta scritto post-epic con la misura · **NON PIÙ VERO** = il TD non riproduce, si marca chiuso con la prova · **RATIFICA** = decide il PO (Qn).

| # | TD (origine) | Misura di OGGI | Proposta | Costo stimato |
|---|---|---|---|---|
| **A1** | **Focus trap + `aria-modal` su `BottomSheet`/`MobileSheet`** (piano 15.10; doc-comment `mobile-sheet.tsx:26-30` che lo rinvia esplicitamente qui) | `role="dialog"` ✅, `aria-label` ✅, focus al pannello all'apertura ✅, ritorno al trigger su Escape ✅ e sul «Chiudi» ✅. **`aria-modal` = null ❌. Nessun trap ❌**: sullo sheet di un volo (`/dashboard/logbook`) le tabulazioni sono `flight-correct-action-mobile → flight-cancel-action-mobile → Chiudi → **`mobile-tab-overview`** → mobile-tab-schedule → …` — cioè la 4ª esce sulla **tab bar dietro lo scrim**. `Shift+Tab` dal pannello esce anche all'indietro. `.main` non è `inert`, il body non blocca lo scroll | **CHIUDE** (⟨Q2⟩) | 1 file (`mobile-sheet.tsx`), blast radius = **ogni** sheet dell'app |
| **A2** | **Focus/aria sul pannello form a tutto schermo (`SlideOver`)** (piano 15.10 «form panel») | **Nessun `role`, nessun `aria-modal`, nessun nome accessibile, nessuna gestione del focus.** `slide-over.tsx:37-53`: solo `aria-hidden={!open}` sul contenitore e l'Escape globale. Misurato su `/dashboard/bookings` a 375: dopo l'apertura `document.activeElement` è **ancora `new-booking-button`**; il primo focusabile del pannello è il **204° su 221** dell'ordine DOM (30 tabulazioni non bastano: passano chip di stato, 21 righe e la paginazione) | **CHIUDE** (⟨Q2⟩) | 1 file, 17 usi in 15 file |
| **A3** | **`SlideOver` CHIUSO: 11-18 controlli nell'ordine di tabulazione sotto `aria-hidden="true"`** (**nuovo, misurato qui**) | Pannello chiuso su `/dashboard/bookings` a 375: `.slideover` = `aria-hidden="true"`, `visibility: visible`, `display: block`, `pointer-events: none`, pannello traslato `translateY(812px)`, **11 controlli focusabili**; una tabulazione dal top della pagina ci finisce dentro **18 volte** (fino a «Prenota», il submit). Violazione ARIA testuale (focus su un nodo rimosso dall'albero di accessibilità = lo screen reader non annuncia nulla). **Pre-esistente dalla 12.1**, ma è il pannello che R3 ha promosso a idioma mobile | **CHIUDE** (⟨Q2⟩) | stesso file di A2 — è lo stesso fix |
| **A4** | **`.cal-popover` senza semantica di dialogo** (**nuovo**) | Portalata su `body`, z 66: `role = null`, `aria-modal = null`, `aria-label = null`. Il focus va all'`input` dell'ora all'apertura | **DICHIARA** o CHIUDE con A1/A2 (⟨Q2⟩) | 1 file |
| **B1** | **`.so-sub` a `--ink-4`** (TD (h) 15.6; riconfermato attivo dalla 15.7) | **3,66:1 chiaro** — ⚠️ **e 4,14:1 SCURO**: il TD diceva solo «chiaro», il gemello scuro **è anch'esso sotto 4,5** e nessuno l'aveva misurato. Sottotitolo NON vuoto su **6 pagine**: bookings (×2), logbook, instructors (×2), movements, billing, ppr | **CHIUDE** (⟨Q3⟩) | 1 riga CSS, invarianza desktop su 6 pagine |
| **B2** | **`.mobile-tab-label` inattiva** (**NUOVO — debito PROPRIO dell'epic, mai misurato da nessuno**) | **3,50:1 chiaro / 4,47:1 scuro**, 9,5px, su **14/14** pagine misurate, **4 etichette per pagina**. Attiva: 17,99 / 17,00 ✅. Causa: `.mobile-tab{ color: var(--ink-4) }` (`airops.css:1808`), preso dal template dalla 15.1 (che ha ratificato «i valori `--ink-4` dell'app prevalgono sul template» — ma **la scelta del token** non fu mai messa in discussione). Il vicino `.mobile-topbar-sub` usa `--ink-3` (4,85/5,72) ✅ | **CHIUDE** (⟨Q3⟩) | 1 riga CSS, mobile-only |
| **B3** | **Il token `--ink-4` è calibrato a ≥3:1, non a 4,5** | `airops.css:25`/`:51`, commento della **ratifica 13.9 F6**: «keep ≥3:1 on --panel/--bg (table headers, sidebar group labels)». Misurato: **3,66 chiaro / 4,14 scuro** su `--panel`. **19 consumatori** in `airops.css`. Tre story (15.4, 15.6, 15.8b) hanno già spostato **un consumatore ciascuna** a `--ink-3` con la stessa motivazione scritta in tre commenti diversi. **Il token NON si tocca** (ratifica 13.9 + regola dell'epic): si spostano i consumatori che rendono **TESTO** | **CHIUDE** l'enumerazione (⟨Q3⟩) | censimento + N righe |
| **C1** | **✕ di `SlideOver` a 32px** (TD (k) 15.7) | **32×32** confermato a 375 **e** a 1280, in entrambi i temi (contrasto 9,99/9,47 ✅, è solo il bersaglio). ⚠️ **Il TD dice «11 consumer»: sono 17 usi in 15 file** (`grep -c '<SlideOver' src`) | **CHIUDE** (⟨Q4⟩) | 1 regola ancorata + invarianza desktop su 15 file |
| **C2** | **Opzioni del typeahead a 36px** (TD (k) 15.7) | **35,56×333** (non 36), 50 opzioni, `.combo-listbox` z 66, listbox 335×240 con scroll interno | **CHIUDE** (⟨Q4⟩) | 1 regola |
| **C3** | **47 bersagli sotto 43,5 dentro `.cal-popover`** (TD 15.9) | **Confermato il totale, corretta la scomposizione**: 42 `.cal-cell` **34,58×34,58** + 2 `.iconbtn` **24×24** + 1 `input` **254×36,84** + 2 `.btn` **52,8×34,84** e **82,3×34,84** = **47 su 47** sotto soglia. Popover **280×412,52** a `x 47,5 → right 327,5` in un viewport da 375 (dentro per 47,5px per lato). ⚠️ **7 colonne × 44 = 308 > 280**: portare le celle a 44 **allarga il popover** e rimette in gioco le guardie di flip/viewport di 13.10-F3 e 14.1 (`datetime-picker.spec.ts:237` e `:278`) — a 320px il margine è ~20px | **RATIFICA** (⟨Q5⟩) | medio-alto: geometria + 2 guardie da riprovare |
| **C4** | **`.date-input-btn` 24×24 fuori dalle superfici curate** (TD 15.9, «quarta faccia») | **Quinta faccia, misurata a 375**: `logbook` 1×24 · `movements` 2×24 · `bookings` 2×24 · **`/dashboard/ppr` 2×24** (dentro `ManualPprForm`); già a 36 su `billing` e `settings`; già a 44 su `/ppr` pubblico (15.9). La regola globale `airops.css:1696` resta a 24; le 4 maggiorazioni esistenti sono tutte **ancorate** | **CHIUDE** (⟨Q4⟩) | 1-2 regole + `padding-right` dell'input, invarianza desktop |
| **D1** | **Riserva sticky R-15.2-g** (chiuso in 15.5 con riserva accettata dal PO) | **Misurato per la prima volta**, `pilot-editor` in MODIFICA a 375: `.so-body` scrolla **2693px** in **716px**; `.so-actions` è `position: sticky` **dentro** `.so-body` → all'apertura è a `top 550 / bottom 619` (in viewport ✅), ma **scrollando il corpo in fondo va a `top −1426,53 / bottom −1357,53`** e `pilot-identity-submit` diventa **non hit-testabile** (`elementFromPoint` = false). Il secondo submit (`pilot-access-create`) resta raggiungibile perché è nella sezione in vista. ⚠️ **Il TD dice «richiede lo slot `mobileFooter` sulla primitiva (11 consumer)»: NON È VERO** — `SlideOver` ha **già** il prop `footer`, reso in `.so-foot` **fuori** da `.so-body` (`slide-over.tsx:51`), **e 7 call-site lo usano già** (transaction-editor, scadenze-console, billing-console, instructor-profile, flight-editor, movements-table, logbook-console). Il lavoro è **sui 2-3 editor**, non sulla primitiva | **RATIFICA** (⟨Q6⟩) | basso-medio: 2 editor, `form="id"` per il submit fuori dal `<form>` |
| **E1** | **Testata card estratto conto self 101,3px** (TD (m) 15.9) | **Confermata al centesimo: 101,3** a 375 e a 320. Composizione: `.card-title` «Estratto conto» 20,3 + trigger export **44×281** (full width) impilati. `.page-head` 51,44. La prima riga di movimento comincia a `top 323,7` in uno schermo da 812. Via d'uscita dichiarata dal dev 15.9: nascondere `.card-title` a ≤640 come fa `.billing-head` — **non fatto** perché sulla scheda persona quel titolo è l'unico nome della sezione | **RATIFICA** (⟨Q8⟩) | basso |
| **E2** | **`.search` `cw 188 / sw 190`** (TD (g) 15.6, seconda occorrenza 15.7) | **Confermato: 188/190 a 1280** (2px di scroll interno). ⚠️ **A 375 è sano**: `cw 283 / sw 283`, h 46. Cioè è un difetto **solo desktop** | **DICHIARA** (⟨Q1⟩) | banale ma è desktop |
| **F1** | **Inline `color: 'var(--bad)'` / `'var(--ok)'`** (classe chiusa dalla 15.8a e dalla 15.9 **un file alla volta**) | **40 dichiarazioni inline in 19 file** (34 `--bad`, 6 `--ok`; 0 `--info`, 0 `--warn`). **25 su 34 stanno su `className="fld-label"`** e **31 su 34** su `role="alert"`. Coppie misurate: `--ok` su `--panel` **2,73** ❌, `--bad` su `--panel` **3,96** ❌ (chiaro); scuro 9,30 / 6,61 ✅. Medicina già ratificata e misurata: `.fld-error` **9,82/6,61**, `.stat-tone-ok` **10,63/9,30** | **RATIFICA** (⟨Q9⟩) | alto: 19 file, quasi tutti stati d'errore |
| **F2** | **KPI di `/dashboard/expiries` con colore inline** (**nuovo**) | `kpi-value` con `style="color:var(--bad)"` → **3,96** ❌ (×2: «Scaduti», «Entro 7 giorni») e `style="color:var(--info)"` → **3,61** ❌ («Entro 60 giorni»); «Entro 30 giorni» usa `--accent-ink` → 12,94 ✅. **Identici su desktop 1280 e su mobile 375**; in tema scuro 6,61 / 7,73 ✅. ⚠️ **Non esiste `.stat-tone-info`**: la famiglia ha ok/bad/warn (`airops.css:733-738`) | **RATIFICA** (⟨Q9⟩) | basso, ma serve un tono nuovo o un token diverso |
| **F3** | **64 link «Saldi negativi» su `/dashboard/billing`** (**nuovo — il gemello di contrasto del MINOR di altezza della 15.8a**) | **3,61:1 in chiaro**, 12,5px, **su desktop 1280 E su mobile 375** (64 righe, `negative-balance-row`); scuro **7,73** ✅. Stesso colore di F2 «Entro 60 giorni» — è il tono link/`--info` | **RATIFICA** (⟨Q9⟩) | basso |
| **F4** | **Colonna «Giorni rimasti» a 3,38:1** (TD (g) 15.7, desktop) | **Confermato: 3,38 chiaro** su 21 righe, `--bad` sopra la tinta `--bad-soft` della riga. ⚠️ **In tema scuro: ZERO nodi sotto soglia** — il difetto è **solo chiaro** | **RATIFICA** (⟨Q9⟩) | basso |
| **G1** | **`/dashboard/ppr`, l'unica superficie mobile costruita PRIMA che le primitive fossero complete** (riserva R-15.9-i, mai misurata) | **Misurata a 375/320/390**: `pageOverflow` **0** ovunque, `docH` 1653 (1791 @320). `.page-head` **106,28** a tutte e tre (51,44 a ≥641), `.card-head` **93,3** (136,14 @320, 65 a ≥641). La card è già nella grammatica giusta: `ppr-row-mobile` = **`<button>` 317×82,83 con 0 figli interattivi**; lo sheet è **corretto** (role=dialog, nome «Richiesta — I-PKQ2DLW6 · Cessna 172», 9 righe kv, 3 controlli tutti a **44**). **19 bersagli sotto 43,5**: `ppr-public-form-link` 34,84 · `ppr-manual-button` 34,84 · ✕ del pannello 32 · **12 campi di `ManualPprForm`** (10×36,84 + 2×38,84) · **2 `.date-input-btn` 24×24** · `ppr-queue-filter-status` 36 · `export-menu-trigger` 34,84. `.ppr-card-sub` ellissa correttamente (`overflow:hidden`+`ellipsis`+`nowrap`) | **RATIFICA** (⟨Q10⟩) | medio: è quasi tutto `ManualPprForm` |
| **H1** | **METAR assente nella fascia 641-900px** (R-15.3-f) | **Provato strutturalmente** (senza scrivere l'`AppSetting`, DB read-only): `.weather-card{display:none}` dentro `@media (max-width:900px)` (`airops.css:1494`) e `.mobile-metar-card{display:flex}` dentro `@media (max-width:640px)` (`:2258`) ⇒ **nella fascia 641-900 non esiste nessuno dei due**. ⚠️ Sul DB attuale la stazione METAR **non è configurata** (la scrive solo il project serializzato `mobile-metar`): una verifica a runtime richiede quella scrittura | **RATIFICA** (⟨Q11⟩) | basso (una soglia) |
| **I1** | **`viewport-fit=cover` mai dichiarato** (review 15.2, TD di epic) | **Confermato a runtime**: `<meta name="viewport" content="width=device-width, initial-scale=1">` (il default di Next: **non esiste** un `export const viewport` in `src/app/**`). Quindi i **6** `env(safe-area-inset-*)` di `airops.css` (righe 1764, 1766, 1801, 1835, 2008, 3064) valgono **0** e sono inerti | **RATIFICA** (⟨Q12⟩) | basso, ma non verificabile su Chromium headless |
| **J1** | **`scripts/e2e.sh start` perde il quoting** (TD (n) 15.7) | **Confermato**: `scripts/e2e.sh:84` interpola `'"$*"'` dentro la stringa di `bash -c`; `start -g "AC 9"` diventa `npx playwright test -g AC 9`. Fix = passare gli argomenti come parametri posizionali (`bash -c '…"$@"…' _ "$@"`) | **RATIFICA** (⟨Q13⟩) | 1-2 righe |
| **K1** | **Bucket stato+giorno dei transiti oltre la pagina da 20** (TD (m) 15.7) | Registro transiti a 375: **20 righe per pagina**, paginazione «1 / 3». È una **fragilità e2e** (`gotoMovementsFor` naviga per stato+giorno, la fixture può cadere oltre pagina 1), non un difetto di UI | **DICHIARA** — backlog TD e2e | — |
| **K2** | **Back button che ri-applica la finestra abbandonata sulle chip Scadenze** (LOW-1 15.7) | PRE-esistente e **identico sul `.segmented` desktop** (le chip `<button>` ereditano stato locale che non rimonta) — non è un difetto mobile | **NON PIÙ MIO** — backlog TD | — |
| **L1** | **Voci del menu Esporta a 35px** (LOW-2 15.7, «terza occorrenza della classe 15.5 F4») | ❌ **NON PIÙ VERO**: la 15.8a ha ridisegnato `ExportMenu` a bottom sheet; misurato dalla 15.9 e riconfermato qui — voci **44×341**, sheet z 40. **Da marcare CHIUSO in sprint-status con la prova** | **NON PIÙ VERO** | — |
| **L2** | **`.slideover` come «scroller orizzontale nascosto»** | ❌ **FALSO POSITIVO da dichiarare**: a 1280 `.slideover` misura `cw 1280 / sw 1800` perché il pannello da 520px è traslato fuori. `pageOverflow` resta **0**. Idem `manual-ppr-form` `cw 335 / sw 355`: lo sfondamento è la barra `.so-actions` che **bleeda di proposito** oltre il padding del form (`margin-left/right: -20px`, `airops.css:2007`) | **NON PIÙ VERO** (esclusione da dichiarare) | — |
| **L3** | **Anello di focus invisibile in tema scuro** (ipotesi mia, **SMENTITA**) | Il computed è **identico nei due temi** (`outline: rgb(16,16,16) auto 1px`, `:focus-visible` true) e l'app **non dichiara mai `color-scheme`** (`getComputedStyle(html).colorScheme === 'normal'` con `data-theme="dark"`). **MA lo screenshot prova il contrario**: Chromium disegna l'anello `auto` adattandolo alla luminanza dello sfondo — chiaro su scuro, scuro su chiaro. **Non è un difetto.** Resta vero (e minore) che i controlli **nativi** (scrollbar, popup dei `<select>`, autofill) restano chiari in tema scuro | **NON PIÙ VERO** per l'anello; **DICHIARA** per i controlli nativi | — |
| **M1** | AOG (`setOutOfService` non protegge prenotazioni né voli) | Story dedicata post-epic ratificata dal PO | **NON MIA** | — |
| **M2** | 422-prima-di-403 (TD 14.9 F11 + occorrenza `pprNumber`) | Backend, chassis `apiRoute` | **NON MIA** | — |
| **M3** | Findings security post-epic-13 | Backlog dedicato | **NON MIA** | — |
| **M4** | `OPTIONS_PAGE_SIZE = 100` (3 facce), `ExpiryType` globale mai ripulito, `billing.spec.ts:296` flaky, `home-dashboard.spec.ts:228` fragile, `date-only.ts` anni <100, PATCH cash-movements senza guardia di concorrenza | Tutti **backlog TD** con owner proprio, nessuno assegnato alla 15.10 | **NON MIE** | — |

**Riepilogo del censimento**: **4 voci NON PIÙ VERE provate** (L1, L2, L3-anello, e la parte «slot `mobileFooter` da creare» di D1), **5 numeri corretti** (C1 11→17 consumer, C2 36→35,56, C3 42+2→42+2+1+2, B1 «solo chiaro»→anche scuro 4,14, E2 «difetto»→solo desktop), **3 difetti NUOVI misurati** (A3 il pannello chiuso tabulabile, B2 la tab bar a 3,50/4,47, F2/F3 i tre contrasti inline mai visti).

---

# §2 — Ricognizione: stato REALE della semantica dei pannelli (misurato, non dedotto)

Metodo: `playwright-core` throwaway (Chromium `~/.cache/ms-playwright/chromium-1228`), build di produzione, DB post-suite **read-only**, tema via cookie `am-theme`, contrasti canvas→WCAG con sfondo effettivo risolto **risalendo gli antenati** e alpha letta **prima** della composizione, `getClientRects()` per escludere i `display:none` (che darebbero colori falsi).

## 2.1 `MobileSheet` (`src/components/ui/mobile-sheet.tsx`, 127 righe) — il chassis di OGNI sheet

Consumatori: `shell/mobile-nav.tsx` (sheet «Altro»), `shell/mobile-top-bar.tsx` (menu profilo), `ui/bottom-sheet.tsx` (il `BottomSheet` di R3, **17 file consumatori**), `ui/export-menu.tsx` (10 consumatori).

| proprietà | stato misurato | dove |
|---|---|---|
| `role="dialog"` | ✅ sul `.mobile-sheet-panel` | `:121` |
| nome accessibile | ✅ `aria-label` (`` `${sub} — ${title}` `` per `BottomSheet`) | `:121`, `bottom-sheet.tsx:61` |
| focus all'apertura | ✅ `panelRef.focus({preventScroll:true})` — verificato: `activeElement` = il pannello | `:104` |
| ritorno del focus | ✅ al trigger, su Escape **e** sul «Chiudi» — verificato su `flight-row-mobile` | `:112` |
| Escape | ✅ montato solo da aperto | `:105-108` |
| uno sheet alla volta | ✅ token module-level (fix 15.3 F4) | `:55, :92-94` |
| **`aria-modal`** | ❌ **null** — e il doc-comment dice perché: «deliberately does NOT claim `aria-modal` — there is no focus trap yet, and claiming modality without enforcing it is worse than not claiming it» | `:28-30` |
| **focus trap** | ❌ **assente**. Sheet volo: `flight-correct-action-mobile → flight-cancel-action-mobile → Chiudi → `**`mobile-tab-overview`**` → mobile-tab-schedule → mobile-tab-ppr → mobile-tab-fleet → mobile-tab-more`. `Shift+Tab` esce all'indietro sulla tab bar. Sheet «Altro»: 8 voci poi `>>OUT<<`. Sheet Esporta: 2 voci poi `logbook-new-button` | — |
| sfondo inerte | ❌ `.main` non ha `inert`, non ha `aria-hidden`; `body`/`html` `overflow: visible` (la pagina sotto scrolla) | — |

⚠️ **Il doc-comment del file dichiara TRE volte che il trap è lavoro della 15.10** (`mobile-sheet.tsx:16-17`, `:46-49`, `bottom-sheet.tsx:17-18`, `export-menu.tsx:27-28`). È il punto in cui l'epic ha deliberatamente parcheggiato il debito.

## 2.2 `SlideOver` (`src/components/ui/slide-over.tsx`, 55 righe) — il pannello a tutto schermo di R3

**17 usi in 15 file**: `edit-booking-form`, `new-booking-form`, `scadenze-console`, `transaction-editor`, `instructor-profile`, `billing-console`, `instructor-editor`, `logbook-console`, `instructors-console`, `pilot-editor`, `aircraft-editor`, `flight-editor`, `movements-table`, `pilots-console`, `manual-ppr-form`.

| proprietà | stato misurato |
|---|---|
| `role` / `aria-modal` / nome accessibile | ❌ **nessuno dei tre**, né sul contenitore né sul `<aside class="slideover-panel">` |
| `aria-hidden` | `false` da aperto, `true` da chiuso (contenitore) |
| focus all'apertura | ❌ **resta sul trigger** (`new-booking-button`) |
| ordine di tabulazione da aperto | ❌ il primo focusabile del pannello è il **204° su 221**; 30 tabulazioni non lo raggiungono |
| focus trap | ❌ assente |
| ritorno del focus | ❌ assente (dopo Escape `activeElement` resta dove stava) |
| **da CHIUSO** | ❌ **11 controlli focusabili** con `getClientRects()` non vuoto e `visibility: visible`, dentro `aria-hidden="true"`; una tabulazione dall'inizio della pagina ci entra **18 volte** (compreso il submit «Prenota»). L'unica difesa è `pointer-events: none`, che non tocca la tastiera |
| Escape | ✅ globale, chiude l'**intero** pannello (nota di CLAUDE.md: mai usarlo negli e2e per chiudere un popup interno) |
| ✕ | `.iconbtn` **32×32** in entrambi i temi e a entrambe le larghezze (contrasto 9,99 / 9,47 ✅) |
| `footer` (slot fisso vero) | ✅ **esiste** (`:51`, reso in `.so-foot` **fuori** da `.so-body`) e **7 call-site lo usano già** |

## 2.3 `CalendarPopover` (`src/components/ui/calendar-popover.tsx`, 200 righe)

**22 file** importano `CalendarPopover`/`DateInput`/`DateTimeInput`. Aperta dal pannello «Nuova prenotazione» a 375: portalata su `body`, z **66**, **280×412,52** a `x 47,5 → right 327,5`, **dentro il viewport** (guardia `datetime-picker.spec.ts:237` verde). Focus all'apertura sull'`input` dell'ora. `role`/`aria-modal`/`aria-label` **tutti null**. **47 bersagli, 47 sotto 43,5** (v. C3).

## 2.4 Il pannello «Altro» e il menu profilo

Entrambi montano `MobileSheet` ⇒ ereditano **esattamente** A1: `role=dialog` + nome + focus in/out ✅, `aria-modal` e trap ❌. Sheet «Altro» misurato: 8 voci (`mobile-more-visiting … mobile-more-settings`), poi il focus esce.

---

# §3 — Dark theme pass mobile: i buchi TRASVERSALI

Sweep su **14 superfici × 2 temi** a 375px (ogni nodo con testo proprio, soglia 4,5 per il testo normale e 3 per il testo largo, sfondo effettivo risalendo gli antenati) + `/ppr` pubblico senza sessione. Le story hanno chiuso i **propri** esemplari: quello che resta è **trasversale**.

## 3.1 `--ink-4` usato come TESTO — una causa, due consumatori molto visibili

| esemplare | chiaro | scuro | dove | quante volte |
|---|---|---|---|---|
| `.mobile-tab-label` (tab **inattive**) | **3,50** ❌ | **4,47** ❌ | `airops.css:1808` (`.mobile-tab{color:var(--ink-4)}`) | **4 per pagina, su 14/14 pagine** |
| `.so-sub` | **3,66** ❌ | **4,14** ❌ | `airops.css:1095` | 6 pagine con sottotitolo non vuoto |
| coppia di token `--ink-4` su `--panel` | **3,66** | **4,14** | `airops.css:25` / `:51` | 19 consumatori CSS |
| (riferimento) `--ink-3` su `--panel` | **4,85** ✅ | **5,72** ✅ | il tono che 15.4/15.6/15.8b hanno già scelto tre volte | — |
| (riferimento) tab **attiva** | 17,99 ✅ | 17,00 ✅ | `.mobile-tab.active{color:var(--ink)}` | — |
| (riferimento) `.mobile-topbar-sub`, `.bottom-sheet-sub`, `.mobile-row-sub`, `.mobile-row-model`, `.chart-label` | 4,85 ✅ | 5,72 ✅ | già `--ink-3` | — |

⚠️ **La forma del debito**: tre story hanno spostato **un consumatore ciascuna** a `--ink-3` scrivendo tre volte la stessa motivazione (`airops.css:1667-1678` la 15.8b sui `.chart-label`, `:1897-1900` la 15.6, `:2198-2200` la 15.4, `:3022` la 15.5). Nessuna ha **enumerato** i restanti. Gli altri 15 consumatori (`.weather-title`, `.crumbs .sep`, `.cal-cell.out`, `.wd-meta .lbl`, `.ppr-empty`, `.ppr-card-id`, `.mobile-row-chev`, le righe 160/255/500/658/995/1020/1048/1305/1452) vanno **classificati uno per uno**: `.mobile-row-chev` è un **oggetto grafico** (soglia 3, passa), `.cal-cell.out` è testo disattivato, gli altri sono testo vero.

## 3.2 Colori INLINE sotto soglia (la classe che 15.8a e 15.9 hanno chiuso un file alla volta)

| esemplare | chiaro | scuro | superficie | n |
|---|---|---|---|---|
| `kpi-value` `style="color:var(--bad)"` | **3,96** ❌ | 6,61 ✅ | `/dashboard/expiries`, **mobile E desktop** | 2 |
| `kpi-value` `style="color:var(--info)"` | **3,61** ❌ | 7,73 ✅ | `/dashboard/expiries`, **mobile E desktop** | 1 |
| link di `negative-balance-row` | **3,61** ❌ | 7,73 ✅ | `/dashboard/billing`, **mobile E desktop** | **64** |
| colonna «Giorni rimasti» (`--bad` su `--bad-soft`) | **3,38** ❌ | *nessun nodo sotto soglia* ✅ | `/dashboard/expiries` **desktop** | 21 righe |
| `p[role=alert]`/`p[role=status]` con `style="color:'var(--bad)'"` | 3,96 ❌ | 6,61 ✅ | **19 file**, stati d'errore | **34** |
| idem con `'var(--ok)'` | 2,73 ❌ | 9,30 ✅ | idem | **6** |

Marginali **sopra** soglia ma vicini, da NON toccare senza motivo: `.prefix`/`.suffix` 4,39 (11,5px, billing/settings), etichette d'asse «agosto 2026» 4,39 (12px, reports), «Settimana» 4,39 (bookings).

## 3.3 Quello che NON è un difetto (provato)

- **`/ppr` pubblico**: **zero** nodi sotto soglia in **entrambi** i temi (la 15.9 l'ha chiuso davvero).
- **Anello di focus**: v. L3 — Chromium adatta l'anello `auto`, screenshot alla mano.
- **Scrim**: `.mobile-sheet-scrim` `alpha 0.4`, `.slideover-scrim` `alpha 0.35`, **identici nei due temi**. Il pannello dello sheet contro la pagina sotto misura 1,04 (chiaro) / 1,08 (scuro) — ma la separazione la fa lo scrim, non il bordo: non lo tratto come difetto.
- **`.ppr-card-sub`**: `scrollWidth > clientWidth` **con** `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap` ⇒ contenimento corretto, non uno sfondamento.

---

# §4 — `/dashboard/ppr`: la superficie mai misurata

Costruita dalla **15.2** come «primo consumer di prova» delle primitive, quando `BottomSheet` era appena nato e `MobileFormPanel`, `ExportMenu`-sheet, chip strip, testata mobile e KPI strip **non esistevano ancora**. R-15.9-i l'ha lasciata fuori scope con **una sola** modifica ammessa (l'azione «Vedi in Transiti»).

| grandezza | 375 | 320 | 390 | 641 | 1280 |
|---|---|---|---|---|---|
| `pageOverflow` | 0 | 0 | 0 | 0 | 0 |
| `docH` | 1653 | 1791 | 1653 | 1802 | 1789 |
| `.page-head` | **106,28** | **106,28** | **106,28** | 51,44 | 51,44 |
| `.card-head` | **93,3** | **136,14** | 93,3 | 65 | 65 |
| `.students` | `display:none` | `display:none` | `display:none` | flex 519/519 | flex 990/990 |
| bersagli < 43,5 | **19** | **19** | **19** | 51 | 51 |

**I 19 bersagli a 375**, per gruppo: `ppr-public-form-link` **120×34,84** · `ppr-manual-button` **120,36×34,84** · ✕ del pannello **32×32** · **12 campi** di `ManualPprForm` (10 `input.input` **335×36,84** + 2 datetime **335×38,84**) · **2 `.date-input-btn` 24×24** · `ppr-queue-filter-status` **107×36** · `export-menu-trigger` **103,91×34,84**.

**Quello che è già a norma**: la card (`ppr-row-mobile` = `<button>` **317×82,83**, **0** figli interattivi), lo sheet (role=dialog, nome parlante, **9** righe kv, «Approva»/«Rifiuta»/«Chiudi» tutti a **44**), il sub della card ellissato, `pageOverflow` 0, l'`ExportMenu` a bottom sheet.

**Quello che NON c'è** rispetto alle superfici delle story 15.4-15.9: nessuna chip strip di stato (c'è un `<select>` a 36px), nessuna KPI strip, nessuna testata mobile con ricerca. Se il PO vuole allineare **quello**, non è una rifinitura: è una story.

---

# §5 — Audit copertura e2e mobile e riesame del «project mobile» Playwright

## 5.1 Com'è organizzata oggi

- **59 file spec**, **472 `test(` statici** (474 a runtime: due sono condizionali/parametrici) — baseline dell'arbitro 15.9: **474 passed, 0 flaky, 0 skipped, exit 0, 14.2m**.
- **14 spec `mobile-*`** con **170 test** (**36% della suite**): `mobile-billing` 26 · `mobile-logbook` 27 · `mobile-expiries-movements` 23 · `mobile-self-public` 21 · `mobile-registries` 16 · `mobile-overview` 12 · `mobile-settings` 12 · `mobile-planning` 10 · `mobile-reports` 10 · `mobile-shell` 5 · `mobile-primitives` 3 · `mobile-metar` 2 · `mobile-membership-fee` 2 · `mobile-overview-overflow` 1.
- **5 spec desktop** contengono test a viewport mobile: `bookings`, `datetime-picker`, `ppr-queue`, `typeahead-pickers`, `my-compensation` (13 chiamate a `setViewportSize` in totale).
- **260 chiamate a `setViewportSize`** in tutta la suite.
- **Catena serializzata (10 project, l'unica fonte di verità è `playwright.config.ts`)**: `chromium → settings → booking-window → reports → treasury-settings → billing-global → mobile-metar → mobile-overview-overflow → mobile-membership-fee → mobile-settings`. **Quattro** dei 14 spec mobile sono già in catena (17 test).

## 5.2 I numeri che rispondono alla domanda del piano

Il piano diceva: «*Ogni story porta e2e mobile MIRATI (pattern 13.10: test con `setViewportSize`), NIENTE project Playwright duplicato per ora (riesame a fine epic)*».

Il fatto decisivo, misurato: **13 dei 14 spec `mobile-*` dichiarano una costante `DESKTOP` e asseriscono a 1280** (l'unico che non lo fa è `mobile-overview-overflow`, 1 test). Non è un accidente: è la **grammatica di guardia dell'epic** — «`display` di ENTRAMBI gli alberi, a 375 **e** a 1280, i due lati, mai uno solo» (AC 1 di ogni story dalla 15.5 in poi), più i censimenti «un nodo per testid a 375 **e** a 1280» che proteggono lo strict mode.

Conseguenze aritmetiche di un `project` a viewport fisso 375×812:

1. **Non rimuoverebbe una sola chiamata a `setViewportSize`** dai 13 file dual-width: cambierebbe solo il valore di partenza, e ogni test dovrebbe comunque saltare a 1280 e tornare.
2. **Raddoppierebbe la catena serializzata**: 4 dei 14 spec mobile scrivono `AppSetting` globali e vivono in catena; un project mobile con `dependencies` proprie o li duplica o li lascia dove sono (e allora il project non contiene «tutti i test mobile», che era il suo unico scopo).
3. **Costo di run**: nessun test in meno, un project in più da ordinare, e la superficie di errore di `testMatch`/`testIgnore` che oggi è già a 5 pattern.
4. **Guadagno reale**: leggibilità dell'elenco (un project «mobile» invece di un prefisso di file) e la possibilità di lanciare `--project=mobile`. Oggi lo stesso risultato si ottiene con `npx playwright test e2e/mobile-` (e con `--no-deps` per i 4 in catena).

## 5.3 Buchi di copertura misurati

| area | copertura oggi | buco |
|---|---|---|
| focus/aria degli sheet | `mobile-primitives.spec.ts` (3 test) asserisce apertura/chiusura/uno-alla-volta | **nessuna asserzione su `aria-modal`, sul trap o sul ritorno del focus dopo Escape** su una primitiva |
| semantica di `SlideOver` | nessuna | **zero** asserzioni su role/nome/focus del pannello a tutto schermo |
| contrasti | ogni story ha misurato **i propri** esemplari, quasi sempre in un test dedicato | **nessuna guardia trasversale**: un nuovo consumatore di `--ink-4`-come-testo non fa fallire niente |
| bersagli 44px | ogni story ha uno sweep **ancorato alla propria pagina**, con esclusioni dichiarate | `/dashboard/ppr` **non ha nessuno sweep** (misurato: 19 sotto soglia) |
| `/dashboard/ppr` | `ppr-queue.spec.ts` (4 `setViewportSize`) | nessuno sweep di bersagli/scroller, nessuna misura di testata |

---

# §6 — Decisioni architetturali (vincoli tecnici, non ratifiche)

**AD-1 — Il trap va nel CHASSIS, una volta sola.** `MobileSheet` è il chassis di **tutti** gli sheet (nav «Altro», menu profilo, `BottomSheet` di 17 consumatori, `ExportMenu` di 10). Il suo doc-comment lo dice tre volte. Un trap scritto in `BottomSheet` lascerebbe scoperti il menu profilo e l'`ExportMenu`; uno scritto nei chiamanti va riscritto a ogni nuovo consumatore. **Il trap e `aria-modal` si aggiungono INSIEME**: `aria-modal` senza trap è una promessa falsa (lo dice il commento esistente e ha ragione).

**AD-2 — `SlideOver` prende la stessa medicina, nello stesso file, con la stessa forma.** Serve: `role="dialog"`, nome accessibile (il prop `title` c'è già; `subtitle` + `title` è la stessa formula di `BottomSheet`), focus al pannello all'apertura, ritorno al trigger alla chiusura, trap. ⚠️ **E la parte più importante è la più semplice**: da CHIUSO il pannello **non deve avere controlli tabulabili** — `inert` sul contenitore (o non renderlo affatto) chiude A3 e rende la questione dell'`aria-hidden` coerente. ⚠️ **Attenzione al comportamento esistente che NON va perso**: l'Escape globale chiude l'intero pannello (`slide-over.tsx:29-31`, nota in CLAUDE.md) e i test ci contano.

**AD-3 — `display:none` vs `inert`: sono cose diverse e servono entrambe.** L'epic usa `display:none` VERO per gli alberi desktop/mobile (fuori dall'accessibility tree ⇒ i selettori e2e scoped restano univoci). `inert` serve per lo sfondo di un overlay **che resta visibile**. Non sostituire l'uno con l'altro: un `display:none` sullo sfondo distruggerebbe le misure di ogni guardia esistente.

**AD-4 — Un fix su una primitiva vuole i GEMELLI ENUMERATI E MISURATI, e la misura DESKTOP.** Per ogni regola nuova: elenco esplicito dei consumatori (dal `grep`, non dal ricordo), misura pre/post a **375, 641, 800, 1280**, nei **due temi** dove il fix tocca il colore. Precedenti: 15.3 (`.list-icon.green` a 1,24 trovato solo enumerando), 15.5 (`--ink-3`/`--panel-2` che **non riproduceva**), 15.8b (i gemelli dei grafici identici al centesimo).

**AD-5 — Un fix TOKEN-LEVEL non cambia mai il valore di un token.** Si sposta il **consumatore** su un token già misurato sopra soglia (`--ink-3` = 4,85/5,72), oppure si applica una **classe già ratificata** (`.fld-error` 9,82/6,61, `.stat-tone-ok` 10,63/9,30, `.stat-tone-bad` 9,82/6,61). ⚠️ **E la classe va scelta misurando la CASCATA**: su un `p.fld-label` (25 casi su 34) `.stat-tone-bad` **perde** e si otterrebbe il grigio 4,85 credendo di aver fatto un fix (lezione 15.9). ⚠️ **Uno stile INLINE batte qualunque classe**: il fix è **sostituire** l'inline, non affiancarlo.

**AD-6 — Ogni sweep usa la RADICE giusta e dichiara le esclusioni con `:scope >`.** `.page` per le superfici della shell, `.ppr-page` per il modulo pubblico (che **non ha** `.page`). Esclusioni **già misurate** che vanno **nominate**: (i) il wrapper del honeypot di `/ppr` (`cw 1 / sw 198`); (ii) `.so-actions` che sfonda il padding del form di proposito (`margin: 0 -20px`, produce `manual-ppr-form cw 335 / sw 355`); (iii) `.slideover` chiuso, il cui pannello traslato dà `cw 1280 / sw 1800` senza alcun overflow di pagina; (iv) i `<Link aria-disabled="true">` (`pointer-events:none`) nell'hit-test. Un'esclusione via `querySelector` non-scoped esclude **tutti gli antenati**.

**AD-7 — Nessun cambio server, nessun cambio di dominio, nessuna dipendenza nuova.** Questa story non tocca API, schemi Zod, servizi, seed, migrazioni. Se il dev pensa di doverlo fare, si ferma e chiede.

**AD-8 — Nessun testid desktop cambia; ogni nome nuovo passa dalla verifica `^=`.** Vale anche per gli attributi che un fix a11y potrebbe introdurre: aggiungere `role="dialog"` a `SlideOver` **cambia l'albero di accessibilità** e quindi il comportamento di `getByRole` in **tutta** la suite — v. il blast radius §8.

**AD-9 — Il gate finale è la suite completa, e la baseline è 474.** `CI=1` su build di produzione, DB **fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (mai `playwright test` in foreground; `export JOBS_SECRET=<non-placeholder>` prima).

---

# §7 — Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno **riletti dopo le risposte del PO**: un AC il cui ⟨Q⟩ è stato tagliato diventa «dichiarato con la misura», non sparisce. Ogni misura si intende a **375×812**, ripetuta a **390×844** e **320×568**, nei **due temi** e nei **due locale** dove il testo conta.

1. **(Focus trap e `aria-modal` sul chassis degli sheet) ⟨Q2⟩** A ≤640px, con uno sheet aperto: (a) `.mobile-sheet-panel` porta `aria-modal="true"` **insieme** al trap (mai l'uno senza l'altro); (b) `Tab` dall'ultimo elemento focusabile dello sheet torna al **primo dello sheet**, `Shift+Tab` dal primo va all'**ultimo dello sheet** — asserito su **almeno tre** consumatori diversi del chassis: `BottomSheet` (riga volo), sheet **«Altro»** della tab bar, sheet **`ExportMenu`**; (c) il ritorno del focus al trigger su Escape e sul «Chiudi» **resta** (oggi funziona: non regredirlo); (d) lo sfondo non è raggiungibile da tastiera mentre lo sheet è aperto. **Prova pre-fix da citare**: `flight-correct-action-mobile → flight-cancel-action-mobile → Chiudi → `**`mobile-tab-overview`** (la 4ª tabulazione esce), sheet «Altro» 8 voci poi fuori, sheet Esporta 2 voci poi `logbook-new-button`. **Guardia discriminante**: rimuovendo il trap la sequenza torna a uscire ⇒ rossa.

2. **(Semantica di dialogo e focus sul pannello a tutto schermo) ⟨Q2⟩** Con un `SlideOver` aperto a 375px: (a) il pannello è un `dialog` con **nome accessibile** derivato da `title` (+ `subtitle` se presente), asserito con `getByRole('dialog', { name: … })`; (b) il focus si sposta **dentro** il pannello all'apertura (misura pre-fix da citare: resta su `new-booking-button`, e il primo focusabile del pannello è il **204° su 221** dell'ordine DOM); (c) `Tab`/`Shift+Tab` restano dentro; (d) alla chiusura il focus torna al **trigger**; (e) l'Escape globale continua a chiudere l'intero pannello (comportamento esistente, **non** regredirlo). Asserito su **almeno tre** dei 15 file consumatori, scelti fra grammatiche diverse (un form semplice, un editor multi-form, un pannello di sola lettura). **(f) ⟨Q6⟩ — l'azione primaria fissa di R3**: secondo ⟨Q6⟩, sugli editor multi-form il submit primario resta hit-testabile **dopo aver scrollato `.so-body` fino in fondo** (misura pre-fix da citare: `pilot-editor` in MODIFICA, `.so-body` 2693px in 716px, `.so-actions` da `top 550,47` a **`top −1426,53`**, `pilot-identity-submit` `elementFromPoint` = **false**), con la geometria desktop del pannello **invariata** e le azioni secondarie di sezione lasciate dove stanno.

3. **(Il pannello CHIUSO non è tabulabile) ⟨Q2⟩** Con **nessun** pannello aperto, una tabulazione completa di `/dashboard/bookings`, `/dashboard/pilots` e `/dashboard/ppr` a 375px **e** a 1280px **non entra mai** dentro `.slideover-panel`. **Misura pre-fix da citare**: 11 controlli focusabili nel pannello chiuso, **18 fermate** di tabulazione dentro di esso su `/dashboard/bookings` a 375 (fino al submit «Prenota»), sotto `aria-hidden="true"`. **Guardia discriminante**: reintroducendo il difetto (togliendo `inert`/il gate di render) il conteggio delle fermate «dentro il pannello chiuso» torna > 0 ⇒ rossa.

4. **(`--ink-4` non è più usato come TESTO) ⟨Q3⟩** (a) Le etichette **inattive** della tab bar salgono da **3,50 (chiaro) / 4,47 (scuro)** a **≥4,5 in entrambi i temi**, con l'etichetta **attiva invariata** (17,99 / 17,00) e la **geometria della barra invariata al centesimo** (altezza item **47,92**, `min-height` 44, 5 colonne); (b) `.so-sub` sale da **3,66 / 4,14** a **≥4,5 in entrambi**, misurato sui **6** consumatori che rendono un sottotitolo non vuoto (bookings ×2, logbook, instructors ×2, movements, billing, ppr) **e sul DESKTOP a 1280** (è testo desktop prima ancora che mobile); (c) il record contiene il **CENSIMENTO COMPLETO dei 19 consumatori di `--ink-4`** in `airops.css`, ciascuno classificato **testo** (soglia 4,5, va spostato o dichiarato) oppure **oggetto grafico/decorazione** (soglia 3, resta) con la sua misura nei due temi. **Vincoli**: il **token `--ink-4` NON cambia valore** (ratifica 13.9 F6, il suo pavimento ≥3:1 resta giusto per ciò per cui è nato); nessun literal di colore nuovo; il tono di arrivo è **`--ink-3`**, già misurato 4,85/5,72 e già scelto tre volte (15.4, 15.6, 15.8b) — se il dev ne propone un altro, lo misura e lo motiva.

5. **(I bersagli delle primitive condivise) ⟨Q4⟩⟨Q5⟩** Secondo ⟨Q4⟩ e ⟨Q5⟩; in ogni caso **la soglia si scrive sul requisito (43,5), mai sul valore ottenuto**. (a) ✕ di `SlideOver`: pre-fix **32×32**, post ≥44 alla larghezza dove la ratifica lo chiede, con **invarianza desktop misurata** e l'altezza di `.so-head` **dichiarata** pre/post su tutti i 15 file consumatori (o su un campione motivato che li copra tutti per costruzione); (b) opzioni del typeahead: pre-fix **35,56×333** (50 opzioni, listbox 335×240 con scroll), post ≥44 con la **posizione e l'altezza massima della listbox** rimisurate (il popup non deve uscire dal viewport né coprire il campo); (c) `.date-input-btn`: pre-fix **24×24** su `logbook` (1), `movements` (2), `bookings` (2), `/dashboard/ppr` (2), già 36 su `billing`/`settings`, già 44 su `/ppr` pubblico — post uniforme secondo ⟨Q4⟩, col `padding-right` dell'input adeguato (precedente 15.9: da 30 a 48px) e **misura di controllo su `/ppr` pubblico** (che non deve cambiare); (d) `.cal-popover` secondo ⟨Q5⟩ — se si chiude: **le guardie di geometria esistenti (`datetime-picker.spec.ts:237` e `:278`) restano verdi senza essere modificate**, il popover resta **interamente dentro il viewport a 320, 375 e 390px** e il flip verticale continua a funzionare (pre-fix: 280×412,52 a `x 47,5 → right 327,5`; 7 colonne × 44 = **308 > 280** ⇒ il popover **si allarga**, ed è esattamente il vincolo da riprovare).

6. **(I contrasti residui) ⟨Q9⟩** Secondo ⟨Q9⟩. Per **ogni** esemplare che si chiude: rapporto canvas→WCAG **prima e dopo**, **nei due temi**, con lo sfondo effettivo risolto **risalendo gli antenati partendo dall'elemento** e l'alpha letta **prima** della composizione; il tema scuro **non scende** in nessun esemplare; **nessun token cambia valore**; **nessun literal nuovo**; l'inline viene **sostituito** dalla classe (mai affiancato); la classe è scelta **misurando la cascata reale** (`.fld-error` sui `p.fld-label` — 25 casi su 34 —, `.stat-tone-*` altrove); i **GEMELLI** della classe toccata sono **enumerati e rimisurati** (per `.stat-tone-*`: `/dashboard/billing` — la 15.9 li ha misurati 22 nodi ok + 36 bad, identici al centesimo). Baseline da citare: KPI expiries **3,96** (×2, `--bad`) e **3,61** (`--info`); **64** link `negative-balance-row` **3,61**; «Giorni rimasti» **3,38** (21 righe, solo chiaro); 40 inline (34 `--bad` a 3,96, 6 `--ok` a 2,73). ⚠️ Se serve un tono per `--info`, **non esiste** `.stat-tone-info`: crearlo è una decisione, non un dettaglio (la famiglia oggi è ok/bad/warn, `airops.css:733-738`).

7. **(`/dashboard/ppr`) ⟨Q10⟩** Secondo ⟨Q10⟩. Se si rifinisce: i **19** bersagli sotto 43,5 misurati a 375/320/390 scendono a **zero** salvo esclusioni **dichiarate**, con `pageOverflow` **0** e lo sweep degli scroller **vuoto** salvo le esclusioni di AD-6; la card, lo sheet e l'`ExportMenu`, che sono **già** a norma (`<button>` 317×82,83 con 0 figli interattivi; sheet role=dialog con 9 kv e 3 controlli a 44), restano **identici al centesimo**; `ppr-queue.spec.ts` resta verde. Se si dichiara: il record riporta la tabella dei 19 con la misura e il motivo.

8. **(Copertura e2e mobile e project Playwright) ⟨Q7⟩⟨Q13⟩** (a) Il record contiene l'**audit**: 14 spec `mobile-*` / **170 test** / 36% della suite, 5 spec desktop con test a viewport mobile, **260** `setViewportSize`, **13 su 14** spec mobile dual-width, 4 spec mobile già in catena; (b) la **decisione** sul project mobile è scritta **coi numeri** (⟨Q7⟩) e, se è «non si fa», il piano epic va **annotato** come riesaminato-e-chiuso, non lasciato aperto; (c) i **buchi** di §5.3 sono chiusi o dichiarati: in particolare le guardie a11y degli AC 1-3 **sono** la copertura mancante delle primitive; (d) ⟨Q13⟩ sul quoting di `scripts/e2e.sh`.

9. **(Le voci NON PIÙ VERE si chiudono con la prova)** Il record e `sprint-status.yaml` marcano **chiuse** le voci che questa ricognizione ha smentito, ciascuna con la sua misura: (a) **voci `ExportMenu` a 35px** (LOW-2 15.7) → **44×341**, chiuso dalla 15.8a; (b) lo **slot `mobileFooter` da creare sulla primitiva** (parte della riserva R-15.2-g) → il prop **`footer` esiste già** (`slide-over.tsx:51`, `.so-foot` fuori da `.so-body`) ed è **già usato da 7 call-site**; (c) i tre **falsi positivi** dello sweep degli scroller (`.slideover` chiuso, `manual-ppr-form`, `.ppr-card-sub` ellissato) diventano **esclusioni dichiarate**, non difetti; (d) l'**anello di focus in tema scuro** → **non è un difetto** (Chromium adatta l'anello `auto`; screenshot come prova), mentre resta vera e minore l'assenza di `color-scheme` per i controlli **nativi**. E i **numeri corretti** vengono corretti: 17 usi di `SlideOver` in 15 file (non 11 consumer), 35,56 (non 36), la scomposizione 42+2+1+2 dei 47 bersagli di `.cal-popover`, `.so-sub` sotto soglia **anche in scuro** (4,14), `.search` 188/190 **solo desktop**.

10. **(Ogni regola nuova ha la sua guardia, provata DISCRIMINANTE)** Per ogni regola CSS o comportamento introdotto per un difetto **misurato**, il record indica l'asserzione che lo protegge e il **valore che quell'asserzione produce col difetto reintrodotto**, provato **col repo intatto** (iniezione CSS/DOM/`addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2; oppure `git stash` del solo `src/` con lo spec al suo posto, metodo 15.5 §12). Minimo: trap (AC 1), dialogo+focus (AC 2), pannello chiuso non tabulabile (AC 3), i due contrasti `--ink-4` (AC 4), ciascun bersaglio portato a 44 (AC 5), ciascun contrasto chiuso (AC 6). ⚠️ Una guardia scritta **sul valore ottenuto** invece che sul **requisito** protegge il difetto, non la regola (15.7 MINOR-1). ⚠️ Una guardia che vive dove il caso **non esiste** è muta (15.3 F8): chiedersi sempre **in quale project e su quale stato** gira.

11. **(Geometria e layering — nessuna regressione)** A 320/375/390px su **tutte** le pagine toccate: `pageOverflow` **0**; nessun contenitore interno con scroll orizzontale nascosto salvo le esclusioni **dichiarate** di AD-6; nessun controllo sotto la tab bar (hit-test `elementFromPoint` dopo uno scroll **reale**, con i `Link aria-disabled` esclusi **dichiarando il motivo**); z-order invariato (`.mobile-topbar`/`.mobile-tabbar` 4/5 · popover 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` 60 · popover portalati **65/66** · `.toast-host` 200); i popover portalati restano **dentro il viewport** su **tutte** le superfici, `/ppr` pubblico compreso.

12. **(Invarianti)** Desktop >640px **invariato** su **tutte** le pagine che rendono i componenti toccati — e «desktop invariato» **non è** «nient'altro è cambiato» (lezione 15.3 F1: la regressione sta sul lato che la regola ha **liberato**). Misura pre/post a **1280, 800 e 641px** su: `/dashboard` · `/dashboard/bookings` · `/dashboard/logbook` · `/dashboard/fleet` · `/dashboard/pilots` · `/dashboard/instructors` · `/dashboard/expiries` · `/dashboard/movements` · `/dashboard/billing` · `/dashboard/reports` · `/dashboard/settings` · `/dashboard/ppr` · `/dashboard/my-account` · `/dashboard/my-compensation` · `/dashboard/people/{id}` · **`/it/ppr`**. `npm run gates` verde; **nessuna dipendenza npm nuova**; **nessun token esistente cambia valore**; nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici toccate ≥**4,5:1** (testo) e ≥**3:1** (oggetti grafici) nei **due temi**, **enumerando tutti gli esemplari** (la 15.3 ha trovato un glifo a 1,24 non enumerando, la 15.4 un pallino a 1,76, la 15.6 uno sfondo a 3,66).

13. **(Multi-attore — lezione 15.1 F1)** Le superfici toccate sono trasversali: la verifica per attore **non è opzionale**. **ADMIN, PILOTA, ALLIEVO, ISTRUTTORE** a **375 e 1280px**, con `page.context().clearCookies()` fra un'identità e l'altra. ⚠️ La tab bar (AC 4a) ha **composizioni diverse per ruolo** e il caso che rompe è il **multi-ruolo** (`visibleNavItems(['INSTRUCTOR','PILOT'])` produceva 6 voci e una barra a 2 tab — il difetto che nessun test e nessuna verifica interattiva a ruolo singolo vedeva). `/ppr` pubblico va provato **senza** sessione **e** con una sessione attiva.

14. **(Il gate finale, e la baseline)** Suite completa `CI=1` su **build di produzione**, **DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run). **Baseline: 474 passed, 0 flaky, 0 skipped, exit 0** (arbitro 15.9). Il record dichiara il delta (nuovi test) e **attribuisce** ogni flaky con evidenza — mai «è la flake nota» senza contarne i `LoginAttempt` falliti né leggerne il messaggio.

15. **(Debito tecnico — la coda che resta, leggibile)** Il record chiude la **tabella del censimento** (§1) voce per voce con l'esito reale (**CHIUSO** / **DICHIARATO post-epic** / **NON PIÙ VERO, con la prova**), e `sprint-status.yaml` viene aggiornato di conseguenza **nello stesso commit di chiusura**: le voci chiuse marcate `status: done` **con la misura**, le voci che restano riscritte con **owner e numero** (mai «da valutare»). ⚠️ Le voci **NON di questa story** (AOG, security, 422-prima-di-403, `OPTIONS_PAGE_SIZE`, `ExpiryType` globale, `billing.spec.ts:296`, `home-dashboard.spec.ts:228`, `date-only.ts`, PATCH cash-movements) restano **intatte**: non si «puliscono» approfittando dello sweep.

---

# §8 — Dev Notes: file da toccare e blast radius ENUMERATO

## 8.1 File candidati

**Primitive (il cuore — ogni riga qui attraversa la suite)**
- `src/components/ui/mobile-sheet.tsx` (127 righe) — trap + `aria-modal`. **Blast radius: OGNI sheet dell'app** = `shell/mobile-nav.tsx`, `shell/mobile-top-bar.tsx`, `ui/bottom-sheet.tsx` (17 file consumatori), `ui/export-menu.tsx` (10 consumatori).
- `src/components/ui/slide-over.tsx` (55 righe) — dialogo, focus, `inert` da chiuso. **Blast radius: 17 usi in 15 file** (elencati in §2.2), cioè **quasi ogni pagina del dashboard**, desktop compreso.
- `src/components/ui/calendar-popover.tsx` (200 righe) — solo se ⟨Q5⟩/⟨Q2⟩ lo includono. **Blast radius: 22 file** che importano `CalendarPopover`/`DateInput`/`DateTimeInput`.
- `src/components/search-combobox.tsx` — altezza delle opzioni.

**Fogli di stile**
- `src/styles/airops.css` (3493 righe alla 15.9). Il blocco nuovo va **in coda**, `/* ---------- sweep finale mobile (story 15.10) ---------- */`, dentro `@media (max-width: 640px)` salvo le eccezioni **dichiarate** (i fix token-level su `.so-sub` e i contrasti desktop sono **fuori** dalla query per costruzione). Punti d'intervento noti: `:25`/`:51` (token `--ink-4` — **da NON toccare**), `:258` (`.iconbtn` 32×32), `:733-738` (`.stat-tone-*`), `:1095` (`.so-sub`), `:1174` (`.fld-error`), `:1289-1296` (`.cal-head .iconbtn` 24×24), `:1305`/`:1326` (`.cal-cell`), `:1494` (`.weather-card` nascosta ≤900), `:1696` (`.date-input-btn` 24×24), `:1808` (`.mobile-tab` `--ink-4`), `:2005-2012` (`.so-actions` sticky), `:2258` (`.mobile-metar-card` ≤640).
- ⚠️ **Classi da NON usare come aggancio**: `.card`, `.card-head`, `.students`/`.student-row` (13 console), `.kpi-row`, `.split`, `.segmented` (6 consumatori), `.date-input` (5 pagine), `.mini-modal`, `.info-row`/`.info-card` (**condivise con `/ppr` pubblico** — è il selettore che la review 15.5 F5 ha trovato sfondare lì).

**Superfici (secondo le ratifiche)**
- `/dashboard/ppr`: `src/app/[locale]/dashboard/ppr/ppr-console.tsx`, `src/components/ppr/manual-ppr-form.tsx`.
- Contrasti inline: i 19 file di F1 (elencati sotto), `expiries/scadenze-console.tsx` (KPI), `billing/billing-console.tsx` (link saldi negativi).
- `scripts/e2e.sh` (⟨Q13⟩), `src/app/[locale]/layout.tsx` (⟨Q12⟩, `export const viewport`).

**I 19 file con colori inline** (F1): `bookings/{edit-booking-form,new-booking-form}.tsx`, `expiries/scadenze-console.tsx`, `settings/{cash-categories-card,ratings-card}.tsx`, `billing/{transaction-editor,billing-console}.tsx`, `fleet/aircraft-editor.tsx`, `instructors/{instructor-editor,instructor-rates-panel,instructors-console}.tsx`, `logbook/{logbook-console,flight-editor}.tsx`, `pilots/{pilots-console,pilot-editor}.tsx`, `movements/movements-table.tsx`, `ppr/ppr-form.tsx`, `components/dashboard/expiry-editor.tsx`, `components/ppr/manual-ppr-form.tsx`.

## 8.2 Blast radius e2e — le trappole vere

1. ⚠️ **Aggiungere `role="dialog"` a `SlideOver` cambia l'albero di accessibilità di TUTTA la suite.** Ogni `getByRole(...)` che oggi risolve dentro un pannello aperto può cambiare significato; e un `getByRole('dialog')` page-level troverebbe **due** dialoghi se uno sheet e un pannello fossero aperti insieme (non dovrebbe succedere: lo scrim dello `SlideOver` a z 50 copre la tab bar che apre gli sheet — **da verificare, non da assumere**). Il dev misuri **prima** quante asserzioni della suite usano `getByRole` su nodi interni ai pannelli.
2. ⚠️ **Rendere il pannello chiuso non tabulabile può cambiare il comportamento di `page.fill`/`page.click` su elementi «già presenti».** Playwright aspetta la visibilità, quindi in teoria no — ma `manual-ppr-form`, `flight-editor`, i due editor multi-form montano il contenuto **anche da chiuso** e qualche test potrebbe leggerlo. Il dev conti le occorrenze prima di scegliere fra `inert` e il gate di render (l'`inert` è **meno** invasivo: non smonta niente).
3. ⚠️ **Il focus trap può rompere i test che tabulano fuori di proposito.** `mobile-primitives.spec.ts` e i test di focus della 15.2 (review F1: «il focus che esce dal pannello nel passo del rifiuto») vanno riletti.
4. ⚠️ **Un cambio di altezza del ✕ cambia `.so-head`** e quindi la geometria di **ogni** pannello — che tre story hanno misurato e asserito (15.5 testate, 15.6 239 vs 266, 15.8a 239 vs 266).
5. ⚠️ **Un cambio di `.date-input-btn` tocca `/ppr` pubblico** se non è ancorato: la 15.9 l'ha portato a 44 **lì** con `padding-right: 48px`; una regola globale nuova deve **arrivare allo stesso valore** o essere ancorata, e la misura di controllo si fa **su `/ppr`**.
6. ⚠️ **Un cambio di `.cal-cell` allarga il popover** e rimette in gioco `datetime-picker.spec.ts:237` (viewport 375 su `/ppr`) e `:278` (flip a 1440).
7. ⚠️ **I fix token-level su `.so-sub` e sui 40 inline cambiano il DESKTOP**: 15 file di pannelli, 19 file di form. Ogni superficie va rimisurata a 1280.
8. ⚠️ **La catena serializzata è in `playwright.config.ts` e basta**: se un test nuovo scrive `AppSetting` globali (l'unico candidato è ⟨Q11⟩ sul METAR, che richiede la stazione configurata), **deve** entrare in catena — e il dev lo **dichiara prima** di scriverlo. Oggi `mobile-metar.spec.ts` è già il 7° project e ripristina in `afterAll`.
9. `mobile-shell.spec.ts` (5 test) asserisce la tab bar: il fix di AC 4a la tocca.
10. `typeahead-pickers.spec.ts` (3 `setViewportSize`) asserisce il typeahead: il fix di AC 5b lo tocca.

## 8.3 Trappole di ambiente (CLAUDE.md + HANDOFF, non riscoprirle)

- Suite e2e **SEMPRE** via `scripts/e2e.sh start` + `status`, **MAI** `playwright test` in foreground. Build **una volta per ciclo** (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`). `export JOBS_SECRET=<non-placeholder>` prima di ogni run (il `.env` locale ha il placeholder e la validazione di produzione lo rifiuta).
- **MAI `Escape`** per chiudere un popup dentro uno `SlideOver` (chiude il pannello: le asserzioni successive corrono su nodi fantasma).
- Prima di attribuire un fallimento al lock TD-6: contare i `LoginAttempt` **falliti** (il contatore conta solo quelli).
- MCP Playwright **non raggiungibile dai subagent** su questa macchina: fallback sanzionato = script `playwright-core` throwaway (Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`), **mai committati**, **mai `playwright install`**.
- `display:none` dà **contrasti falsi**: filtrare con `getClientRects()`. I colori `oklch` non si parsano a mano: round-trip su canvas.
- **DB fresco prima di ogni run che conta**: una sola suite completa porta il DB oltre il tetto 100 dei picker.

---

# §9 — Piano di test (indicativo, il dev lo raffina)

1. **Unit**: nessuno previsto (questa story non introduce derivazioni pure). Se il dev ne introduce, valgono le regole di CLAUDE.md sull'`@/lib/env` eager (`env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`).
2. **e2e nuovi** (probabile file unico `e2e/mobile-a11y-sweep.spec.ts`, project `chromium`, `fullyParallel`, **fuori** dalla catena — non scrive `AppSetting`):
   - trap + `aria-modal` su 3 consumatori del chassis sheet (AC 1);
   - dialogo + focus in/out su 3 consumatori di `SlideOver` (AC 2);
   - pannello chiuso non tabulabile su 3 pagine × 2 larghezze (AC 3);
   - contrasti `--ink-4` (tab bar + `.so-sub`) nei due temi, con la misura canvas→WCAG in-page (AC 4);
   - sweep bersagli ≥43,5 sulle primitive toccate (AC 5) e su `/dashboard/ppr` (AC 7);
   - contrasti chiusi + gemelli (AC 6).
3. **Spec esistenti da rileggere** (non da indebolire): `mobile-primitives`, `mobile-shell`, `typeahead-pickers`, `datetime-picker`, `ppr-queue`, più i 13 spec `mobile-*` dual-width.
4. **Gate**: `npm run gates` → suite completa `CI=1` su build di produzione, DB fresco, via `scripts/e2e.sh`.

---

# §10 — Fuori scope dichiarato

- **Qualunque cambio server**: API, schemi Zod, servizi, dominio, seed, migrazioni (AD-7).
- **La story AOG** (backlog post-epic ratificato dal PO), i **findings security**, il **422-prima-di-403** (TD 14.9 F11 + `pprNumber`), `OPTIONS_PAGE_SIZE`, il catalogo `ExpiryType` globale, `billing.spec.ts:296`, `home-dashboard.spec.ts:228`, `date-only.ts` anni <100, PATCH `/cash-movements/{id}` senza guardia di concorrenza.
- **Ridisegno del desktop** e **PWA/offline/push** (fuori scope dell'epic dal piano).
- **Riscrivere `/dashboard/ppr` nel linguaggio pieno delle story 15.4-15.9** (chip strip, KPI strip, testata mobile con ricerca): non è una rifinitura, è una story — v. ⟨Q10⟩ opzione C.

---

# ASSUNZIONI RATIFICATE (2026-08-06 — decisioni nella tabella in testa; il testo sotto resta come record di fatti, opzioni e motivazioni)

> **Non dispatchare al dev prima delle risposte.** Ogni domanda porta il **fatto misurato**, le opzioni e la raccomandazione. Le **Q1-Q13** sono ordinate per impatto sul perimetro: **Q1 decide la forma dello sweep**, le altre lo riempiono.

## Q1 — Il perimetro onesto dello sweep: che cosa CHIUDE questa story e che cosa resta DICHIARATO post-epic?

**Fatto misurato**: il censimento (§1) ha **26 voci**, di cui 4 non più vere e 5 non mie. Quelle vive si raggruppano in **sei blocchi** con costi molto diversi: **(A) a11y delle primitive** (3 difetti misurati, 2 file, blast radius = tutta la suite); **(B) `--ink-4`-come-testo** (2 consumatori molto visibili + censimento di 19, poche righe, tocca il desktop); **(C) bersagli delle primitive** (✕ 32, typeahead 35,56, `.date-input-btn` 24×24, `.cal-popover` 47/47 — l'ultimo è il costoso); **(D) contrasti inline** (40 dichiarazioni in 19 file + 3 esemplari nuovi con 64+21+3 nodi); **(E) `/dashboard/ppr`** (19 bersagli, quasi tutti in `ManualPprForm`); **(F) i minori** (METAR, sticky R-15.2-g, testata 101,3, `.search` 188/190, `viewport-fit`, quoting `e2e.sh`).

**Opzioni**
- **A — Sweep a11y + inchiostro + bersagli + `/ppr` + e2e (A, B, C, E, F), (D) solo dove è mobile-reachable.** È il perimetro che risponde alla lettera del piano («dark theme pass mobile, a11y pass, audit e2e, riesame project, full suite») e chiude ciò che l'epic ha **creato** (la tab bar è debito proprio della 15.1; le primitive sono debito proprio della 15.2), lasciando fuori il debito **ereditato** dal desktop (i 34 `p[role=alert]` dei form, la colonna «Giorni rimasti», `.search` 188/190).
- **B — Tutto, (D) compreso**: chiude anche i 40 inline dei 19 file. Perimetro più ampio dell'epic intero su una superficie sola; il precedente 15.8 dice che 2,3× la story tipo **si splitta**.
- **C — Solo (A) + (F)**: l'a11y pass alla lettera e i minori; inchiostro e bersagli dichiarati.

**Raccomandazione: A.** Motivo dirimente: uno sweep di chiusura deve chiudere ciò che **questo epic ha introdotto o promesso** — il trap che `mobile-sheet.tsx` rinvia per iscritto tre volte, la tab bar che la 15.1 ha dipinto col token sbagliato, i bersagli delle primitive che quattro story hanno curato «solo in casa propria». Il debito **ereditato dal desktop** (D, in gran parte stati d'errore) ha 40 occorrenze in 19 file: è una story propria, e metterla qui è il modo sicuro di consegnare male tutto il resto.

## Q2 — Il focus trap: quale idioma, e su quali primitive?

**Fatto misurato**: `MobileSheet` ha già role/nome/focus-in/focus-out ma **niente `aria-modal` e niente trap** (Tab esce sulla tab bar alla 4ª pressione sullo sheet di un volo). `SlideOver` **non ha niente**: né role, né nome, né focus, né trap — e **da chiuso tiene 11 controlli tabulabili** (18 fermate misurate su `/dashboard/bookings`) sotto `aria-hidden="true"`. `.cal-popover` non ha role né nome.

**Opzioni**
- **A — `MobileSheet` (trap + `aria-modal`) + `SlideOver` (dialogo + nome + focus in/out + trap + `inert` da chiuso).** Due file, un idioma solo, scritto una volta per ~30 superfici.
- **B — Solo `MobileSheet`.** Chiude il rinvio scritto nel codice, lascia il pannello a tutto schermo (l'idioma **centrale** di R3) senza semantica e **tabulabile da chiuso**.
- **C — A + `.cal-popover`** (role/nome/trap anche sul popover del calendario, che è portalato su `body` a z 66).
- **D — A, ma il trap è `inert` sullo sfondo** invece di un ciclo di tabulazione scritto a mano (idioma più moderno, meno codice, ma cambia l'albero di accessibilità di `.main` e va misurato).

**Raccomandazione: A, con `inert` da chiuso su `SlideOver` come prima cosa.** Il difetto **A3** (pannello chiuso tabulabile) è il più grave dei tre, il più cheap da chiudere e quello con la guardia più discriminante. `.cal-popover` (opzione C) lo lascerei dichiarato: è un popover, non un dialogo modale, e trattarlo da modale interferisce col campo che lo apre. Su **D**: la scelta fra trap manuale e `inert` la faccia il dev **misurando** (`inert` su `.main` è più pulito ma va provato contro i selettori e2e scoped al landmark).

## Q3 — `--ink-4` come testo: quanti consumatori si spostano?

**Fatto misurato**: il token è calibrato a **≥3:1** dalla ratifica **13.9 F6** («table headers, sidebar group labels») e misura **3,66 chiaro / 4,14 scuro**. Ha **19 consumatori** in `airops.css`. Tre story ne hanno già spostato **uno ciascuna** a `--ink-3` (4,85/5,72). Restano come **testo** almeno: `.mobile-tab-label` (**3,50/4,47**, 4 etichette × 14 pagine) e `.so-sub` (**3,66/4,14**, 6 pagine, **desktop compreso**).

**Opzioni**
- **A — I due grossi (`.mobile-tab`, `.so-sub`) + il censimento completo dei 19 con la classificazione testo/decorazione.** I due si chiudono, gli altri si classificano e si chiudono **solo se sono testo e sono sotto soglia misurata**.
- **B — Solo `.mobile-tab`** (debito proprio dell'epic, mobile-only, zero impatto desktop); `.so-sub` resta il TD (h) della 15.6.
- **C — Tutti e 19 a `--ink-3`**, senza classificare: veloce e **sbagliato** (`.mobile-row-chev` è un chevron, non testo; `.cal-cell.out` è un giorno disattivato — spostarli cambia il disegno per niente).
- **D — Cambiare il valore del token.** **Vietato** dall'architettura dell'epic e dalla ratifica 13.9.

**Raccomandazione: A.** `.so-sub` costa una riga e chiude un TD dichiarato da **due** story (15.6 e 15.7); il censimento dei 19 costa mezz'ora e impedisce la quarta occorrenza dello stesso commento in `airops.css`. ⚠️ Il PO sappia che **`.so-sub` è testo desktop**: il fix si vede su 6 pagine a 1280 (più chiaro, non diverso di forma).

## Q4 — I bersagli delle primitive condivise: a quale larghezza si alzano?

**Fatto misurato**: ✕ di `SlideOver` **32×32** (17 usi, 15 file, desktop **e** mobile); opzioni typeahead **35,56** (50 opzioni, listbox con scroll); `.date-input-btn` **24×24** su 4 pagine dashboard a 375 (già 36 su billing/settings, già 44 su `/ppr` pubblico).

**Opzioni**
- **A — Mobile-only (≤640px)**: tutti e tre a ≥44 solo sul telefono, desktop **identico al centesimo**. Coerente con l'architettura additiva dell'epic e con le 4 maggiorazioni ancorate già esistenti.
- **B — Ovunque**: 44px anche sul desktop. Più uniforme, ma cambia `.so-head` su 15 file e la densità di ogni form con un campo data — cioè cambia il desktop che 9 story hanno dichiarato invariato.
- **C — Solo il ✕ e il typeahead** (mobile-only), `.date-input-btn` dichiarato: è la **quinta** faccia dello stesso TD e le quattro cure precedenti sono tutte ancorate.

**Raccomandazione: A.** Il pavimento 44px è un requisito **del tocco**, non del puntatore: alzarlo sul desktop è un cambio di design non richiesto. E `.date-input-btn` a 44 **mobile-only** finalmente unifica cinque facce con **una** regola invece che con la sesta eccezione ancorata.

## Q5 — `.cal-popover`: 47 bersagli su 47 sotto soglia. Si chiude o si dichiara?

**Fatto misurato**: 42 `.cal-cell` **34,58×34,58** + 2 `.iconbtn` **24×24** + 1 `input` **36,84** + 2 `.btn` **34,84** = **47 su 47**. Popover **280×412,52**, dentro il viewport a 375 con 47,5px per lato. **7 colonne × 44 = 308 > 280**: portare le celle a 44 **allarga il popover di ~28-50px**, e a **320px** il margine residuo è ~20px per lato. Le guardie che proteggono quella geometria sono `datetime-picker.spec.ts:237` (viewport 375 su `/ppr`, il fix 13.10-F3) e `:278` (flip verticale a 1440, il blocker di TD-7). Primitiva condivisa da **22 file**.

**Opzioni**
- **A — Si chiude, mobile-only**: celle e `.iconbtn` a 44 a ≤640, popover riallargato, **le due guardie esistenti riprovate verdi senza modificarle** e una guardia nuova a 320px. È la cosa giusta per il dito (una cella di 34,58px è il bersaglio più piccolo che l'utente tocca **davvero**, ogni volta che sceglie una data).
- **B — Si chiude a metà**: solo i 2 `.iconbtn` (24×24 → 44, sono i due più piccoli e **non** cambiano la larghezza del popover) e i 2 bottoni del piede; le 42 celle restano a 34,58 **dichiarate** (sono una griglia densa per progetto, come ogni calendario nativo).
- **C — Si dichiara tutto** e resta post-epic.

**Raccomandazione: B.** Motivo: le 42 celle sono l'unico caso di tutto l'epic in cui il pavimento 44 **confligge con la funzione** (un mese in 7 colonne dentro un popover che deve stare in 320px); i calendari nativi di iOS e Android usano celle sotto i 44 con spaziatura compensativa. I **4 bersagli non-cella** (2 frecce 24×24 e 2 bottoni 34,84) non hanno nessuna scusa e costano due righe. ⚠️ Se il PO sceglie **A**, il costo vero non è il CSS: è **riprovare la geometria** del popover a 320/375/390 + il flip a 1440, cioè il lavoro che ha prodotto il blocker della TD-7 e i 4 major della 14.1.

## Q6 — La riserva sticky R-15.2-g: R3 «azione primaria fissa» alla lettera, sì o no?

**Fatto misurato per la PRIMA volta** (`pilot-editor` in MODIFICA, 375×812): `.so-body` scrolla **2693px** dentro **716px**; la barra `.so-actions` è `position: sticky` **dentro** `.so-body`, quindi all'apertura sta a `top 550,47 / bottom 619,47` (in viewport ✅) ma **scorrendo il corpo fino in fondo finisce a `top −1426,53 / bottom −1357,53`** e `pilot-identity-submit` diventa **non hit-testabile** (`elementFromPoint` = `false`). ⚠️ **Il TD dice che servirebbe uno slot `mobileFooter` NUOVO sulla primitiva: non è vero.** `SlideOver` ha **già** il prop `footer`, reso in `.so-foot` **fuori** da `.so-body` (`slide-over.tsx:51`) — cioè davvero fisso — **e 7 call-site lo usano già** (`transaction-editor`, `scadenze-console`, `billing-console`, `instructor-profile`, `flight-editor`, `movements-table`, `logbook-console`). Gli unici che usano ancora la barra sticky in-body sono i **3 editor multi-form**: `aircraft-editor`, `pilot-editor`, `instructor-editor`.

**Opzioni**
- **A — R3 alla lettera sui 3 editor**: il submit **primario** di ciascuno passa nel `footer` esistente (fuori da `.so-body`), con `form="<id>"` per restare collegato al suo `<form>`; le azioni **secondarie** di sezione («Crea e invia invito», «Aggiungi tariffa») restano dove sono — la 15.5 ha già provato che stanno sotto il fold **anche sul desktop** e non sono l'azione primaria. Nessuna riga sulla primitiva.
- **B — Solo `pilot-editor`** (l'unico dove la riserva è stata misurata come difetto reale) e gli altri due dichiarati.
- **C — Si dichiara**: la barra sticky resta, e il record scrive che R3 vale «per sezione» e non «per pannello» sui 3 editor multi-form.

**Raccomandazione: A.** Il costo è crollato rispetto a quello che il TD stimava (nessuna modifica alla primitiva, nessun blast radius sugli 11-17 consumatori: solo 3 call-site), e la misura mostra che il difetto **esiste davvero** — l'azione primaria di un editor esce dallo schermo e non è più cliccabile finché non si risale. ⚠️ Da verificare in ricognizione dal dev: `aircraft-editor` è stato chiuso dalla 15.2 con la stessa asimmetria, quindi potrebbe già essere a posto — **si misura**, non si assume (è esattamente l'errore che la 15.5 ha corretto sui numeri di questo stesso TD).

## Q7 — Il «project mobile» Playwright: si fa o no?

**Fatto misurato**: 14 spec `mobile-*`, **170 test** (36% della suite da 474), **13 su 14 dual-width** (dichiarano `DESKTOP` e asseriscono a 1280 — è la grammatica di guardia dell'epic: «entrambi gli alberi, mai uno solo»), **260** `setViewportSize` in tutta la suite, **4** spec mobile già dentro la catena serializzata a 10 project.

**Opzioni**
- **A — NON si fa**, e il piano epic viene annotato «riesaminato a fine epic, chiuso» coi numeri.
- **B — Si fa**: `project` con `use.viewport = {375, 812}` e `testMatch: '**/mobile-*.spec.ts'`.
- **C — Si fa solo per i 10 spec mobile FUORI dalla catena**, lasciando i 4 dove sono.

**Raccomandazione: A, e chiudere la questione.** Il numero che decide è **13 su 14**: un viewport di default non toglie **una sola** riga a spec che devono comunque saltare a 1280 e tornare; **B** e **C** aggiungono un project (e, per B, o duplicano la catena o mentono sul proprio scopo) in cambio di zero test risparmiati e di un `--project=mobile` che oggi si ottiene con `npx playwright test e2e/mobile-`.

## Q8 — La testata della card estratto conto (101,3px sulla faccia self): si recupera?

**Fatto misurato**: **101,3** a 375 **e** a 320 (era 63,84 pre-15.9; +37,46 è il prezzo dei 44px del trigger export su una card con **un solo** controllo). Composizione: `.card-title` «Estratto conto» **20,3** + trigger **44×281** impilati. La prima riga di movimento comincia a **top 323,7** in uno schermo da 812. Via d'uscita già scritta dal dev 15.9: nascondere `.card-title` a ≤640 come fa `.billing-head` — **non fatta** perché sulla scheda persona quel titolo è l'unico nome della sezione.

**Opzioni**
- **A — Si recupera solo sulla faccia SELF** (dove `.page-head` dice già «Le mie transazioni»): `.card-title` nascosta a ≤640 **solo** quando `showActor === false`, scheda persona intatta. −20,3px.
- **B — Si mette il trigger sulla stessa riga del titolo** (come le altre testate dell'epic): −44px, ma a 320px l'etichetta «Esporta Excel ▾» va a capo (misurato 53,69 sulla faccia admin, che ha 103,91px di larghezza).
- **C — Si dichiara**: 101,3px su una pagina il cui `docH` sta comunque in uno schermo.

**Raccomandazione: A.** È il caso in cui la ridondanza si vede: `.page-head` «Le mie transazioni» e `.card-title` «Estratto conto» dicono la stessa cosa a 20px di distanza. La faccia admin, dove il titolo **serve**, non si tocca — e la differenza è già espressa da un prop esistente (`showActor`), non da un ramo nuovo.

## Q9 — I contrasti residui: quali si chiudono?

**Fatto misurato**, tutti in **tema chiaro** (in scuro sono tutti sopra soglia):

| esemplare | valore | dove | n |
|---|---|---|---|
| KPI expiries `--bad` / `--info` (inline) | 3,96 / 3,61 | mobile **e** desktop | 3 |
| link «Saldi negativi» | 3,61 | mobile **e** desktop | **64** |
| colonna «Giorni rimasti» | 3,38 | **solo desktop** | 21 righe |
| 40 inline `--bad`/`--ok` nei form | 3,96 / 2,73 | 19 file, stati d'errore | 40 |

**Opzioni**
- **A — I tre esemplari «di pagina» (KPI expiries, 64 link, Giorni rimasti); i 40 inline dei form restano DICHIARATI.** I primi tre sono **sempre a schermo**, il quarto gruppo compare solo in errore.
- **B — Tutto**, i 40 compresi (19 file).
- **C — Solo quelli visibili su una superficie MOBILE** (KPI expiries e link saldi negativi; «Giorni rimasti» è desktop-only).
- **D — Niente**, tutto dichiarato post-epic.

**Raccomandazione: A.** I 64 link e i 3 KPI sono lo **stato normale** di due pagine, sono identici su desktop e mobile e la medicina è già scritta e ratificata. «Giorni rimasti» costa una riga e chiude un TD della 15.7. I 40 inline sono la stessa classe, ma sono **stati d'errore in 19 file di form**: hanno bisogno del loro ciclo (e della lezione della cascata applicata 25 volte). ⚠️ Nota tecnica per il dev: per `--info` **non esiste** `.stat-tone-info` — la famiglia è ok/bad/warn. Crearlo è una decisione da riportare, non un dettaglio: valutare prima se il tono giusto per un link non sia semplicemente `--ink` + sottolineatura.

## Q10 — `/dashboard/ppr`: rifinitura misurata, dichiarazione, o story propria?

**Fatto misurato**: `pageOverflow` 0, card e sheet **già nella grammatica giusta** (button 317×82,83 con 0 figli interattivi; sheet role=dialog con 9 kv e 3 controlli a 44), `ExportMenu` già a bottom sheet. Ma **19 bersagli sotto 43,5** — 15 dei quali dentro `ManualPprForm` (12 campi + 2 trigger calendario + ✕) — e una **testata da 106,28 + 93,3 = 199,58px** a 375 (136,14 di `.card-head` a 320), contro i 51,44 + 65 del desktop. Non ha chip strip di stato (un `<select>` da 36px), non ha KPI strip, non ha testata mobile con ricerca.

**Opzioni**
- **A — Rifinitura misurata**: i 19 bersagli a 44 (in gran parte una regola sui campi di `ManualPprForm`, come la 15.9 ha fatto su `/ppr` pubblico), niente altro. Card, sheet, testata e struttura **invariati e misurati tali**.
- **B — Rifinitura + testata**: A, più la testata portata al linguaggio delle story 15.5-15.8 (chip di stato al posto del `<select>`, controlli a 44).
- **C — Dichiarazione**: la superficie resta com'è, il record porta la tabella dei 19 e la nota «unica superficie costruita prima delle primitive complete».

**Raccomandazione: A.** `ManualPprForm` è un pannello a tutto schermo con 12 campi che un admin compila **dal piazzale** — è esattamente il caso d'uso di R3 — e la medicina è quella che la 15.9 ha già scritto e misurato su un form pubblico quasi identico. **B** è tentante ma è la porta d'ingresso a una story: sostituire il `<select>` con una chip strip vuol dire decidere il remount, l'URL, i testid e le guardie (la 15.7 ha dedicato a quella decisione una lezione intera).

## Q11 — METAR nella fascia 641-900px: si copre o si accetta?

**Fatto misurato** (strutturale, sul CSS: la stazione METAR non è configurata sul DB e la scrive solo un project serializzato): `.weather-card{display:none}` a **≤900px** (`airops.css:1494`, ratifica 13.10) e `.mobile-metar-card` esiste solo a **≤640px** (`:2258`, R1) ⇒ **nella fascia 641-900 il meteo campo non esiste da nessuna parte**. Su un iPad in verticale (768px) non c'è.

**Opzioni**
- **A — Si abbassa la soglia della card mobile a ≤900px**: la card compatta appare anche su tablet. Una media query.
- **B — Si ripristina `.weather-card` nella fascia**: torna la card della sidebar sul rail da 64px — dove non ci sta (è il motivo per cui la 13.10 l'ha nascosta).
- **C — Si accetta e si documenta**: nessuna modifica, il TD si chiude come «comportamento noto».

**Raccomandazione: A**, se il PO considera il tablet una superficie d'uso reale; **C** altrimenti. ⚠️ Costo nascosto di **A**: la verifica richiede la **stazione METAR configurata**, cioè una scrittura `AppSetting` globale, cioè un test che **deve entrare nella catena serializzata** (dove `mobile-metar.spec.ts` è già il 7° project e ripristina in `afterAll`). Non è una media query e basta.

## Q12 — `viewport-fit=cover`: si dichiara, si rimuovono gli `env()`, o si lascia?

**Fatto misurato**: `<meta name="viewport" content="width=device-width, initial-scale=1">` (il default di Next; **non esiste** `export const viewport` in `src/app/**`) ⇒ i **6** `env(safe-area-inset-*)` di `airops.css` (righe 1764, 1766, 1801, 1835, 2008, 3064) valgono **0** e sono **inerti**. Chromium headless ha inset 0: **la verifica vera non è possibile qui**.

**Opzioni**
- **A — Si aggiunge `viewport-fit=cover`** (`export const viewport` nel layout) e si dichiara che gli `env()` restano non verificati su questa macchina.
- **B — Si rimuovono i 6 `env()`** come rumore.
- **C — Si lascia tutto e si dichiara** (terza volta: il TD è aperto dalla review 15.2).

**Raccomandazione: A**, con la limitazione scritta a chiare lettere. Motivo: `viewport-fit=cover` **senza** gli `env()` sarebbe un difetto (contenuto sotto la tacca); gli `env()` **senza** `viewport-fit` sono inerti ma corretti; averli **entrambi** è l'unica combinazione che è giusta su un iPhone reale, e il rischio su un browser senza inset è **zero per costruzione** (`env(x)` vale 0 ⇒ `calc(100px + 0)` = il valore di oggi). **B** butterebbe via lavoro corretto di tre story. ⚠️ **Non decidere a occhio su Chromium headless**: la misura di non-regressione è che a inset 0 **ogni** valore resta identico al centesimo.

## Q13 — `scripts/e2e.sh`: il quoting si sistema qui?

**Fatto misurato**: `scripts/e2e.sh:84` interpola `'"$*"'` dentro la stringa passata a `bash -c`; `scripts/e2e.sh start -g "AC 9"` diventa `npx playwright test -g AC 9` (word splitting) → `E2E_EXIT=127`. Il fix è passare gli argomenti come **parametri posizionali** (`bash -c '… "$@" …' _ "$@"`), 1-2 righe.

**Opzioni**
- **A — Si sistema qui** (è lo strumento che questa story userà di più: i run mirati per grep sono l'unico modo di provare le discriminanze senza ripagare la suite).
- **B — Resta TD sullo script.**

**Raccomandazione: A.** È l'unica voce del censimento che **abilita il lavoro della story stessa**. La verifica è un run mirato con `-g "…"` che oggi fallisce con 127 e dopo passa.

---

## Nota di metodo per chi implementa

Questa story ha una tentazione precisa: **fare tutto un po'**. Il censimento §1 è lungo apposta — serve a rendere visibile che «lo sweep finale» sono **sei lavori diversi**, e che il valore sta nel chiuderne pochi **per intero, con la guardia** e nel lasciare gli altri **scritti con un numero accanto**. Il metro dell'epic è stato, nove volte su nove, la **misura prima della prescrizione**: la 15.5 ha corretto le misure di un TD della 15.2, la 15.6 ha corretto un contratto che la story aveva immaginato, la 15.9 ha corretto sei righe della propria ricognizione. **Questa ricognizione contiene già quattro voci che il dev troverebbe false e cinque numeri che troverebbe diversi**: la sua ultima riga è la stessa delle nove precedenti — *verificala e correggila*.
