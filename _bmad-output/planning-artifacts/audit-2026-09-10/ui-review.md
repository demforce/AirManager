# Review UI AirManager — desktop e mobile (2026-09-10)

Revisione condotta come product designer + frontend engineer sull'app **in esecuzione** (build di produzione su
`http://localhost:3000`, DB di lavoro del team: 214 velivoli, ~400 persone, 140 prenotazioni, 124 voli).
Mandato: **valutare e proporre**, non implementare. Nessun file dell'app è stato modificato, nessun commit,
nessuna suite e2e lanciata, nessun processo toccato.

Tutti gli screenshot citati stanno in
`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/ui-review/`
(115 file; indice in §5).

---

## 1. Metodo

**Strumenti.** Il server MCP Playwright non è stato usato: per un audit che vive di misure ripetibili su ~55
superfici serviva uno script. Ho guidato Chromium con il `playwright-core` già installato nel repo (import per
path assoluto, script fuori dal repo, nessun `playwright install`). Quattro login totali (uno per ruolo), sessione
riusata via `storageState` — sotto il tetto anti-brute-force.

**Viewport e temi.**

| Configurazione | Dove |
|---|---|
| 375×812 (telefono), tema chiaro | tutte le route di tutti i 4 ruoli + 14 pannelli/sheet + `/ppr` + `/login` |
| 375×812, tema **scuro** | panoramica, pianificazione (+sheet), form nuovo volo, flotta, impostazioni, contabilità |
| 375×667 | pannello «Nuova prenotazione» (verifica del submit sotto il fold) |
| 768×1024 (tablet) | panoramica, pianificazione, flotta, impostazioni |
| 1280×900 (desktop) | tutte le route admin + pannello form; 1440 e 1920 per il taglio delle tabelle |
| locale **EN** | tab bar dei 4 ruoli, panoramica, pianificazione, flotta, contabilità |

**Il tema non segue `prefers-color-scheme`.** L'emulazione `colorScheme: 'dark'` non cambia nulla: il tema è un
cookie (`am-theme`, `theme-toggle.tsx`) e `:root` è chiaro. Le misure in scuro sono state rifatte col cookie
impostato (v. finding M14).

**Misure automatizzate, in pagina, su ogni superficie:**
- bersagli: `getBoundingClientRect()` di ogni elemento interattivo, soglia **43,5px** (la stessa dell'epic 15), con
  esclusione dei sottoalberi `inert`/`aria-hidden` (i pannelli chiusi non sono bersagli);
- contrasto: formula WCAG 2.x su colori **normalizzati via canvas 1×1** — indispensabile perché i token AirOps
  computano `lab()`/`oklch()`, che una regex `rgb()` legge come «trasparente» e produce falsi positivi (l'ho
  verificato: gli avatar risultavano 1:1). Soglie 4,5 / 3,0 con la regola del testo grande;
- sfondamenti: `right > viewport` escludendo i discendenti di contenitori a scroll orizzontale (le KPI strip e le
  strisce di chip sono scroller **di progetto**), più `scrollWidth vs clientWidth` per i troncamenti da `ellipsis`
  (la classe che la lezione 15.5 dichiara invisibile agli sweep);
- geometria della testata: offset di documento del **primo elemento di contenuto** su ogni pagina-lista.

**Validazione del metodo.** I miei numeri riproducono esattamente quelli del censimento della story 15.10:
`.mobile-sheet-label` **3,66**, «Settimana» **4,39**, `.prefix`/`.suffix` **4,39**, `.btn.mini` **24,67**. Dove
divergo dal repo, divergo su superfici che quel censimento non aveva guardato.

**Cosa NON ho potuto verificare (e perché).**
1. **Nessuna azione di scrittura** è stata inviata (il DB è quello di lavoro del team): niente approva/nega,
   niente fermo velivolo, niente ricariche, niente registrazione voli, niente salvataggi di impostazioni. Quindi
   **toast, live region, messaggi 422 in linea e il focus post-azione restano non misurati**. I form li ho aperti
   e compilati solo per giudicarne la UX.
2. `/set-password` richiede un token: la pagina serve 0 controlli, non misurabile.
3. Gesti reali di device: swipe-back iOS, tasto indietro hardware Android, pull-to-refresh, safe-area su schermo
   con notch, landscape. Il test «indietro» è stato fatto con `page.goBack()`, che è l'equivalente programmatico.
4. **Screen reader reali** (VoiceOver/TalkBack): non disponibili headless. `aria-owns` sui portali resta
   dichiarato non verificato, come già scritto nella coda TD della 15.10.
5. Il DB contiene fixture e2e con nomi generati lunghissimi (`I-AOG1786112359997-X`,
   `0Pilota-1786112444958-02th7h`). Dove un troncamento dipende da quel dato lo dico esplicitamente; dove dipende
   dalla **regola CSS** lo dimostro col codice.

---

## 2. Cosa funziona bene (onesto e specifico)

1. **Zero sfondamenti orizzontali.** Su nessuna delle superfici misurate — 4 ruoli, 375/768/1280, due temi, due
   lingue — `document.scrollWidth` supera `clientWidth`. Tutti gli scroller orizzontali trovati sono
   intenzionali (KPI strip, strisce di chip). Per un'app con 400 persone e 214 velivoli in tabella non è
   scontato.
2. **Zero contrasti nuovi sotto soglia**, in entrambi i temi, su tutte le pagine misurate. Le uniche voci sotto
   4,5 sono **esattamente** quelle già dichiarate nel Review Record 15.10 (`--ink-4`-come-testo 3,46-4,14,
   `.segmented` inattivo 4,39, `.prefix`/`.suffix` 4,39, asse dei grafici 4,39). Il tema scuro non aggiunge
   nemmeno un caso: la disciplina token-level dell'epic 13.9 ha tenuto.
3. **Gli sheet di dettaglio sono la cosa migliore dell'app mobile.** Kicker + titolo + badge di stato + righe
   chiave-valore + azioni tutte a 44px: `admin-pilot-sheet-375-light.png`, `fleet-mob-sheet-375-light.png`,
   `bookings-mob-sheet-375-light.png`. Il nome accessibile delle righe è composto e utile
   (`"Apri dettaglio: audit_pilot Audit1789046541 · I-AUD1789046541A · 26/11/2026, 10:00"`).
4. **Approvare una prenotazione da telefono costa 2 tap** (Panoramica → riga in attesa → «Approva», entrambe
   44px): `admin-overview-sheet-375-light.png`. È il percorso più importante dell'admin ed è il più corto.
5. **Le landing per ruolo sono davvero per ruolo.** Il pilota vede saldo, licenza, scadenza medico, prossimi
   voli e una CTA «Prenota volo» (`pilot-landing-375-it.png`); l'istruttore vede ore e payout
   (`instructor-it_dashboard-375-light.png`). Il titolo H1 lì è un saluto, non l'etichetta della pagina.
6. **Anello di focus presente e visibile** in entrambi i temi (`outline: auto 1px rgb(229,151,0)`), su tutti gli 8
   tab-stop campionati. Pannelli e sheet sono dialoghi con nome, `aria-modal` e trap che comprende i portali
   (lavoro della 15.10, verificato vivo).
7. **`/ppr` pubblico è esemplare**: 12 campi su 12 a **44px**, `autocomplete` corretto (`given-name`,
   `family-name`, `email`, `tel`), `type=email`/`tel`/`number`/`datetime-local`, switch di lingua visibile.
   Zero bersagli sotto soglia (`anon-ppr-375-light.png`).
8. **La griglia delle liste non occlude la tab bar**: a fondo pagina Impostazioni l'ultimo elemento chiude a
   652,1px contro un bordo barra a 745,1 (`padding-bottom: 60px` su `main`). Verificato.
9. **Deep link solidi**: `?status=PENDING` accende la chip giusta (`btn primary`), `?view=week` accende la vista
   settimana, `people/{id}/account` redirige a `people/{id}`.
10. **Pannello form desktop** ben proporzionato: 520px, griglia a 2 colonne, nessuno scroll interno
    (`admin-newflight-1280-light.png`).

---

## 3. Findings

Ordinati per impatto. `[MOBILE]` / `[DESKTOP]` / `[TABLET]`. «⚖️ RATIFICATO» marca gli item che toccano una
decisione già presa e registrata in `docs/handoffs/HANDOFF.md`.

---

### M1 `[MOBILE]` — La testata mangia da 262 a 572px del fold: su Scadenze resta **una riga e mezza** di contenuto

**Superficie**: tutte le 10 pagine-lista, ogni ruolo, 375×812, due temi.
**Misura** (offset di documento del primo elemento di contenuto; finestra utile reale = 812 − 53 di topbar sticky
− 66,9 di tab bar fissa = **692,1px**, bordo superiore della barra a y=745,1):

| Route | Primo elemento | Righe intere visibili | docH |
|---|---|---|---|
| `/dashboard/expiries` | **625,2** | **1** (la 2ª tagliata) | 2059 |
| `/dashboard/billing` | 563,4 | 3 | 3948 |
| `/dashboard/logbook` | 487,4 | 3 | 2190 |
| `/dashboard` | 462,7 | 4 | 1626 |
| `/dashboard/movements` | 445,4 | 4 | 1881 |
| `/dashboard/instructors` | 369,4 | 6 | 2813 |
| `/dashboard/bookings` | 366,4 | 6 | 3593 |
| `/dashboard/fleet` | 336,4 | 2 file (4 velivoli) | 2130 |
| `/dashboard/pilots` | 324,4 | 5 | 1780 |
| `/dashboard/ppr` | 314,7 | 5 | 2142 |

Scomposizione su Scadenze (`admin-expiries-375-it.png`): 53 topbar + **51,4 page-head** + **214,8 KPI 2×2** +
**175 card-head** (ricerca 46 + due file di bottoni 44) + **64 striscia chip** = 558,2px di cromo prima del dato.
Su Contabilità: 53 + 51,4 + 153 + 175 + 64.

Tre cause distinte, tutte chiudibili separatamente:

**(a) Il titolo di pagina ripete l'etichetta della topbar sticky.** Misurato su tutte le route:

| | route con `H1` == titolo topbar | eccezioni |
|---|---|---|
| IT | **10 su 12** | `/fleet` (topbar «Aeromobili» vs H1 «Velivoli»), `/dashboard` admin no (H1 = saluto per gli altri ruoli) |
| EN | **11 su 12** | `/dashboard` (topbar «Operations overview» vs H1 «Operational overview») |

Costo: 51,4px dove c'è solo il titolo, **115,4-117,4px** dove c'è anche la riga di sub (panoramica, PPR,
movimenti, statistiche). Le due eccezioni sono peggio della regola: sono **due lessici diversi per la stessa
pagina** (finding M13b).

**(b) Su Scadenze i 4 KPI e le 5 chip dicono la stessa cosa.** KPI: `Scaduti 29` / `Entro 7 giorni 0` /
`Entro 30 giorni 1` / `Entro 60 giorni 0` (214,8px, elementi **`<div>`, non tappabili**). Chip immediatamente
sotto: `≤60g` / `≤30g` / `≤7g` / `Scaduti` / `Tutte` (64px, `<button>` a 44px, filtrano). L'utente vede il
riquadro rosso «29» e lo tocca: **non accade niente**. Sulla stessa app, in Contabilità, i KPI **sono**
`<button>` che aprono uno sheet — quindi la stessa forma ha due comportamenti.

**(c) La `card-head` mobile impila 4 azioni su due file** (175px su Scadenze e Contabilità): Filtri, Esporta,
Quota associativa, Invia promemoria. Il criterio di story dell'epic era «testata ≤ pre-fix», misurato sulla sola
`.card-head`: ottimizzare quel numero non ha impedito alla **somma** di crescere.

**Perché è un problema.** Su un telefono la coda di lavoro è il contenuto; qui il primo elemento di
`/dashboard/expiries` arriva al 77% del fold e l'utente scrolla prima di vedere la seconda scadenza. Le tre
cause sono ridondanza pura: nessuno dei 558px porta informazione che non sia già altrove nella stessa schermata.

**Proposta.** (a) A `≤640px` rendere il `page-head` **solo sub-riga**, con l'`h1` mantenuto ma `sr-only` quando
coincide col titolo della topbar (regola in `airops.css` + una classe sul blocco titolo; il titolo della topbar
resta l'ancora di wayfinding perché è sticky). Recupero 29-33px dove c'è il sub, 51,4 dove non c'è.
(b) Portare i conteggi **dentro le chip** (`Scaduti 29`, `≤7g 0`, …) e cancellare la griglia KPI su mobile:
−214,8px e i numeri diventano tappabili, chiudendo anche l'incoerenza di affordance.
(c) Lasciare in testata ricerca + azione primaria; Filtri/Esporta/Quota in uno sheet «Azioni»: −88px.
Sommate: **Scadenze da 625 a ~290px**, cioè da 1 a 7 righe visibili.
**Effort**: S per (a), M per (b), M per (c).

---

### M2 `[MOBILE]` — Il pavimento dei 44px non è mai arrivato nei pannelli form né nella topbar: 60+ bersagli misurati

**Superficie**: shell mobile (ogni pagina, ogni ruolo) + 5 pannelli `SlideOver` + testata di Pianificazione.
**Causa strutturale**: in `airops.css` il pavimento esiste **123 volte**, sempre **ancorato a una pagina**
(`.movements-filter-panel .input`, `.billing-filter-panel .input`, `.settings-card .input`, `.ppr-form-grid
.input`, `.transaction-form .input`, `.account-adjust-panel .input`, `.membership-fee-modal .input`, …). Non
esiste **nessuna** regola d'insieme del tipo `@media (max-width:640px){ .input{ min-height:44px } }`. Ogni story
ha risanato «casa propria» (lo dice il censimento 15.10, riga 247), e ciò che nessuna story possedeva è rimasto
indietro.

**Bersagli misurati a 375px** (tutti sotto 43,5; `inert` esclusi):

| Superficie | Bersaglio | Misura | Nodi |
|---|---|---|---|
| **topbar mobile, ogni pagina** | `.iconbtn` «Cambia tema» | **32×32** | 1 × ogni pagina |
| **topbar mobile, ogni pagina** | `.mobile-avatar-btn` (menu profilo) | **32×32** | 1 × ogni pagina |
| Pianificazione, testata | `.date-nav .iconbtn` giorno prec./succ. | **26×26** | 2 |
| Pianificazione, testata | `schedule-date-pick` | 107,81×**28** | 1 |
| Pianificazione, testata | `schedule-filter-toggle` | 69,59×**34,84** | 1 |
| Pianificazione, testata | `.segmented` Giorno / Settimana | 54,73×**27,39** / 72,09×27,39 | 2 |
| Pianificazione + Registro + Flotta … | `export-menu-trigger` | 101,45×**34,84** | 1 per pagina |
| Pianificazione, paginazione | `booking-page-prev/next` | 37,94×**34,84** | 2 |
| **Pannello «Nuova voce» (registra volo)** | 3 typeahead, 1 select, 6 input, 2 time | 36,84 / **36** / 38,84 | **13 su 18 controlli** |
| **Pannello «Modifica velivolo»** | input, select, `.segmented` Basato/Ospite, submit `new-rate-submit`, `hour-meter-submit`, `archive-toggle-button` | 36,84 / 36 / **27,39** / **34,84** | **13 su 24** |
| **Pannello «Modifica pilota»** | 7 input 36,84 · **4 checkbox 13×13** · 4 `.btn.mini` **24,67** · `expiry-edit`/`expiry-remove` **24,67** · 36 chip scadenza **27,94** · 2 bottoni 34,84 | fino a **13×13** | oltre 50 |
| Pannello «Nuova prenotazione» | 3 select 36, 1 input 36,84 | 36 | 4 |
| Registro voli, pannello Filtri | `flight-filter-aircraft-mobile`, `flight-filter-type-mobile` | 335×**36** | 2 |
| Scheda persona | `recent-flights-view-all` «Vedi tutti» | 69,31×**15,94** | 1 |
| Statistiche | `.reports-rank-metrics button.on` «Ore» | **39,38**×44 | 2 |

Il caso peggiore è `admin-pilots-editor-375-light.png`: nell'editor pilota il dito deve centrare **checkbox da
13px** e bottoni `.btn.mini` da **24,67px** ‑ in un pannello alto 1888px che si scorre per tre schermate.

**Perché è un problema.** Le due voci più usate (tema e menu profilo, cioè logout e lingua: **l'unico** posto
dove vivono su mobile per ratifica R5) sono i due bersagli più piccoli della shell, presenti su ogni schermata.
E i pannelli form sono dove si inseriscono i dati: sono la superficie in cui un tap mancato costa di più.

**Proposta.** **Una** regola d'insieme a `≤640px` invece della 124ª eccezione ancorata:
`.so-body .input, .so-body select.input, .so-body .btn, .so-body .btn.mini, .so-body label:has(> input[type=checkbox])`
→ `min-height: 44px` (l'idioma `:has()` è già usato da `.settings-card form label:has(> input[type="checkbox"])`);
più due regole puntuali `.mobile-topbar .iconbtn`, `.mobile-avatar-btn` → 44×44, e `.date-nav .iconbtn` → 44×44 a
`≤640` (il desktop resta al centesimo, come da prassi dell'epic).
⚠️ Da misurare nello stesso lavoro: alzare le chip scadenza dell'editor pilota a 44 allunga il pannello — vale
la stessa istruttoria aritmetica che la 15.5 ha fatto sulle testate.
**Effort**: M (una regola, ~6 pannelli da rimisurare, invarianza desktop da provare su 15 file consumatori di
`SlideOver`).

---

### M3 `[MOBILE]` — «Filtri» di Pianificazione è ancora il popover desktop: 227 chip da 27,39px in una lista da 5057px

**Superficie**: `/dashboard/bookings`, **tutti i ruoli**, 375×812, due temi. Screenshot:
`bookings-mob-filters-375-light.png`.
**Misura**: popover `position: fixed` **320×500,6** a `left: 8`, `scrollHeight` **5057** contro `clientHeight`
499; **227 `<button>` `.segmented`, tutti 27,39px** di altezza (gruppi «Aeromobile» e «Istruttore»); contrasto
delle chip inattive 4,39 (voce già dichiarata). Codice: `bookings/schedule.tsx:468-545` — larghezza fissata a
`FILTER_POPOVER_WIDTH` e nessun ramo mobile.

**Perché è un problema.** Per filtrare per velivolo l'utente scorre 5 metri di lista dentro una finestrella da
500px, mirando bersagli da 27px. Ogni **altra** superficie di filtro dell'app ha ricevuto il pannello mobile con
il pavimento a 44px (`.movements-filter-panel`, `.billing-filter-panel`, `.logbook-filters-trigger`,
`.scadenze-filter-*`, `mobile-scadenze-filter-panel`): questa è l'unica rimasta col linguaggio desktop, e sta
sulla seconda voce della tab bar.

**Proposta.** Portare il filtro nella grammatica esistente: `MobileSheet` «Filtri» con **typeahead** su velivolo
e istruttore (il componente esiste, `SearchCombobox`, e le opzioni a 44px sono già garantite da `.combo-option`),
non una chip per velivolo. Beneficio collaterale: sparisce la dipendenza dalla dimensione della flotta.
**Effort**: M.

---

### M4 `[MOBILE]` — Nelle card prenotazione il **nome** ha 52px e la marca 133: l'unico dato che distingue le righe è quello troncato

**Superficie**: `/dashboard/bookings`, lista prenotazioni, tutti i ruoli, 375px. Screenshot:
`admin-bookings-cards-375-it.png`.
**Misura** su 4 righe consecutive: traccia del titolo **192,1px** totali → `.mobile-row-tail` **132,6px**,
`.mobile-row-name` **51,5px** con `scrollWidth` 242 (troncato a ~5 caratteri: «Impatt…», «Lontan…», «Probe …»).
Le 6 righe visibili hanno **tutte** lo stesso sub («16/09/2026 · 10:00») e lo stesso badge («Approvato»).
**Causa nel codice**: `airops.css:2257` — `.mobile-row-tail{ flex-shrink: 0 }` con il commento «never shrinks»
(fedeltà al template), mentre `.mobile-row-name` è l'unico elemento comprimibile della riga.

**Perché è un problema.** In una coda decisionale la riga serve a riconoscere **chi** ha prenotato. Con marche
lunghe il nome scompare; e nulla nel dominio vieta marche lunghe (il DB ne ha 214). Con una marca reale a 6
caratteri il nome avrebbe ~134px, cioè ~20 caratteri: comunque un residuo, non una quota.

**Nota di coerenza**: la coda della Panoramica usa la grammatica opposta e migliore — nome sulla prima riga,
`marca · data` sul sub (`"<span class=mobile-row-name>audit_pilot Audit1789046541</span>"` +
`"I-AUD1789046541A · 26/11/2026, 10:00"`). Due code decisionali, due grammatiche di riga.

**Proposta.** `.mobile-row-tail{ max-width: 12ch; overflow:hidden; text-overflow:ellipsis }` **oppure** allineare
la lista prenotazioni alla grammatica della Panoramica (marca nel sub). La seconda chiude anche l'incoerenza.
**Effort**: S.

---

### M5 `[MOBILE]` — Il tasto Indietro non chiude sheet e pannelli: porta **fuori** dalla pagina

**Superficie**: primitive condivise `MobileSheet` e `SlideOver`, quindi ~30 superfici mobile.
**Misura**: da `/dashboard` → tab «Registro voli» → apertura dello sheet di dettaglio di un volo
(`.mobile-sheet-panel` presente e visibile) → `goBack()` → URL `**/it/dashboard**`, sheet mai chiuso, pagina
abbandonata. Identico col pannello full-screen: `/dashboard/logbook` + «Nuova voce» aperto → indietro → si esce
dalla pagina (e il form compilato si perde).

**Perché è un problema.** Su Android il tasto/gesto indietro **è** il gesto di chiusura di un bottom sheet; su
iOS lo swipe-back fa lo stesso. Oggi l'utente che «chiude» uno sheet col gesto naturale perde la pagina e, nel
caso del pannello, quanto ha digitato. Chiudere si può solo col tap su ✕/scrim/Chiudi.

**Proposta.** All'apertura, `history.pushState` di uno stato marcato; su `popstate` chiudere invece di navigare;
alla chiusura via ✕ fare `history.back()` per non lasciare voci orfane. Vive **una volta** nelle due primitive.
⚠️ Interagisce con il listener globale di Escape e col focus trap della 15.10: da fare con la stessa disciplina
(una guardia per ogni comportamento nuovo).
**Effort**: M.

---

### M6 `[MOBILE]` — Per pilota e allievo l'etichetta della quinta tab **va a capo** e la barra cresce di 10,9px

**Superficie**: tab bar, ruoli **PILOT e STUDENT**, entrambe le lingue.
**Misura**:

| Ruolo / lingua | Altezza barra | Etichetta 5ª tab | Altezza etichetta |
|---|---|---|---|
| admin, instructor (IT/EN) | 66,9 | «Aeromobili», «I miei compensi», «My payouts» | 10,9 (una riga) |
| **pilot, student IT** | **77,8** | «Le mie transazioni» | **21,8 (due righe)** |
| **pilot, student EN** | **77,8** | «My transactions» | **21,8 (due righe)** |

Visibile in `pilot-landing-375-it.png` e `student-logbook-375-it.png`: l'icona della quinta tab non è più
allineata con le altre quattro e la barra ruba 10,9px di contenuto su **ogni** pagina di quei due ruoli (metà
degli utenti finali di un'aviosuperficie).

**Proposta.** Etichetta dedicata alla tab bar («Il mio conto» / «My account», che è anche il nome della route),
o `white-space: nowrap` + ellipsis su `.mobile-tab-label` con `title`. La prima è preferibile: un'ellissi in una
tab da 72,6px non comunica nulla.
**Effort**: S.

---

### M7 `[MOBILE]` — Cambiare tab su rete lenta costa **3,4 secondi senza un pixel di feedback**

**Superficie**: navigazione, tutte le pagine.
**Misura**: tap su una tab della barra con Fast 3G (150ms latenza, 1,6Mbps) + CPU 4× → **3448ms** dal tap alla
pagina dipinta. Senza throttling, tempo al `load` (3 campioni): panoramica 1999/1080/1086ms, pianificazione
1059/933/641, impostazioni 683/1179/401. Con throttling: panoramica 2040, pianificazione 2219, impostazioni 1887.
**Nel repo non esiste alcun indicatore di attesa**: zero `loading.tsx`, zero `Suspense`, zero `aria-busy`, zero
skeleton, zero stringa «caricamento» in `messages/`. Ci sono 68 `disabled` durante il submit (giusti, contro il
doppio invio), ma riguardano i form, non la navigazione.

**Perché è un problema.** Su telefono la percezione di velocità è quasi tutta feedback. Oggi il tap non lascia
traccia: nessuno stato premuto persistente, nessuna barra di progresso, nessuno scheletro — l'utente ritocca la
tab e la pagina si ricarica.

**Proposta.** (1) `loading.tsx` per segmento di route con lo scheletro della pagina (shell + testata restano,
la lista pulsa); (2) stato «in corso» sulla tab toccata con `useLinkStatus` di Next (disponibile su Next 16, già
lo stack del progetto).
**Effort**: M.

---

### M8 `[MOBILE]` — Mettere un velivolo fuori servizio è sepolto a 744px dentro un pannello da 1888

**Superficie**: `/dashboard/fleet` → sheet → «Modifica», 375px.
**Misura**: `out-of-service-reason` sta a **744,2px** dall'inizio di un `.so-body` con `scrollHeight` **1888** e
`clientHeight` 659 — terza schermata del pannello. Percorso: tab Aeromobili → card → sheet → Modifica → scroll
744px → compila → invia.
**Perché è un problema.** È un'azione operativa e urgente (un velivolo si ferma **adesso**), ed è l'unico
percorso; nello sheet del velivolo — dove il linguaggio dell'app mette le azioni (R-15.2-b) — c'è solo
«Modifica».
**Proposta.** Aggiungere «Metti fuori servizio» alle azioni dello sheet flotta, con il `secondStep` già usato da
storno volo e chiusura transito, riusando la funzione di dominio della story AOG-1b senza toccare il servizio.
**Effort**: M.

---

### M9 `[MOBILE]` — Lo stato vuoto conserva tutto l'apparato: 425px di cromo per dire «Nessun volo registrato»

**Superficie**: `/dashboard/logbook` per un allievo con 0 voli (`student-logbook-375-it.png`); stessa classe su
ogni lista vuota.
**Misura**: titolo duplicato + **4 KPI a zero** in strip orizzontale (`Voci 0`, `Ore di volo 0:00`,
`Decolli/Atterraggi 0/0`, …) + Filtri/Esporta + 3 chip di stato = 425px, sopra **una riga di testo**. Nessuna
illustrazione, nessuna CTA, nessuna spiegazione.
**Perché è un problema.** A zero dati i filtri non filtrano niente e i KPI non informano; l'utente nuovo vede
un'interfaccia complicata che non fa nulla. È anche il primo contatto di un allievo con l'app.
**Proposta.** Quando la lista è vuota **e nessun filtro è attivo**: comprimere KPI e barra filtri, e dare allo
stato vuoto una frase utile + l'azione possibile (per l'allievo: «Prenota un volo»; per l'admin: «Registra
volo»). Se un filtro è attivo, tenere i filtri e dire «Nessun risultato con questi filtri» + reset.
**Effort**: S.

---

### M10 `[MOBILE]` — Il ✕ del pannello perde il pavimento dei 44px quando il titolo va a capo

**Superficie**: `SlideOver`, `.so-head .iconbtn`, 375px.
**Misura** su quattro pannelli:

| Pannello | Titolo | Righe titolo | ✕ |
|---|---|---|---|
| Nuova voce (volo) | «Nuova voce» | 1 | **44×44** |
| Modifica velivolo | «I-AAA1786112354932-N» | 1 | **44×44** |
| Nuova prenotazione | «Nuova prenotazione» | 1 | **44×44** |
| **Modifica pilota** | «0Pilota-1786112444958-02th7h Prenota» | **2** | **37,19×44** |

**Causa**: la regola della 15.10 (`airops.css:3836`) fissa `width: 44px; height: 44px` ma non `flex-shrink: 0`;
in una `.so-head` flex con titolo su due righe il bottone si comprime del 15%.
**Perché è un problema.** È la regressione silenziosa di un fix appena consegnato, e succede proprio sui pannelli
con i titoli lunghi (nomi di persona), cioè quelli reali.
**Proposta.** `flex-shrink: 0` sulla stessa regola. Guardia: asserire la larghezza del ✕ su un pannello con
titolo **a due righe** (una guardia scritta sul caso a una riga è muta — lezione 15.3 F8).
**Effort**: S (una dichiarazione + una guardia).

---

### M11 `[MOBILE]` — Per pilota e allievo la seconda tab è la console dell'admin

**Superficie**: `/dashboard/bookings` con ruolo PILOT e STUDENT, 375px. Screenshot: `pilot-bookings-375-it.png`.
**Misura**: identico all'admin al pixel — stessa striscia di **214 chip marche** (`scrollWidth` 30850), stesso
popover «Filtri» a 227 chip, stessa agenda che nella prima schermata mostra **6 velivoli AOG**, stesso sub
«Timeline aeromobili e prenotazioni in attesa di approvazione» (la descrizione del lavoro di un altro). Le
prenotazioni **proprie** non sono distinte in alcun modo; nessuna CTA di prenotazione nella prima schermata (la
CTA «Prenota volo» sta sulla Panoramica, che è la scelta giusta ma non è questa pagina).
**Perché è un problema.** La Panoramica è stata adattata per ruolo (story 15.3, e funziona bene); la pagina che
segue nella tab bar no. Per un pilota «Pianificazione» dovrebbe essere «quando volo io e quando è libero
l'aereo», non l'inventario dei fermi macchina.
**Proposta.** Faccia self della pagina: le proprie prenotazioni in cima, agenda del giorno **senza** le chip
fleet-wide, filtro velivolo via typeahead, sub riscritto. Le letture per-attore esistono già.
**Effort**: L (è una story propria, con ratifiche: perimetro e definizione di «mia» agenda).

---

### M12 `[MOBILE]` — Il tema ignora la preferenza del sistema: chi ha il telefono in scuro riceve un'app bianca

**Superficie**: tutta l'app, primo accesso.
**Misura**: `routing.ts` e `theme-toggle.tsx` — il tema è **solo** il cookie `am-theme`; `airops.css` definisce
`:root` (chiaro), `html[data-theme="light"]`, `html[data-theme="dark"]` e **nessun** `@media
(prefers-color-scheme: dark)` (0 occorrenze nel file). Con `colorScheme: 'dark'` emulato e nessun cookie, la
pagina è chiara (confronto `admin-newflight-375-dark.png` prima e dopo l'impostazione del cookie: prima
identica alla chiara). In più `color-scheme` non è dichiarato (voce già nella coda TD 15.10), quindi i popup
**nativi** di `type="time"` e dei `<select>` restano chiari sopra un'app scura.
**Perché è un problema.** Su telefono la preferenza di tema è un'impostazione di sistema, e l'utente si aspetta
che l'app la rispetti; la correzione manuale richiede di trovare un bottone da 32px (M2). Di notte, in hangar,
una schermata bianca è anche un problema pratico.
**Proposta.** Quando il cookie **non** c'è, derivare il tema iniziale da `prefers-color-scheme` (media query CSS
sui token, così non serve JS e non c'è mismatch di hydration: `:root:not([data-theme])` sotto media query), e
dichiarare `color-scheme: light dark` per i controlli nativi. Il toggle continua a vincere.
**Effort**: S/M (tocca l'ordine dei blocchi token: da misurare la cascata prima, lezione 15.9).

---

### M13 `[MOBILE]` — Lessico e gerarchia delle azioni: tre incoerenze misurate

**(a) «Pianifica volo» apre «Registra volo».** La CTA primaria della Panoramica admin
(`dispatch-flight-button`) apre il pannello con kicker «Registro voli», titolo «Nuova voce» e submit «Registra
volo» — cioè la **registrazione di un volo avvenuto**, non la pianificazione di una prenotazione. Screenshot:
`admin-dispatch-panel-375-light.png`. Effort S (copy).

**(b) Due nomi per la stessa pagina.** IT: nav/topbar «Aeromobili» vs H1 «Velivoli». EN: topbar «Operations
overview» vs H1 «Operational overview». Effort S.

**(c) «Registra» senza oggetto, e due verbi per la stessa azione.** Nello sheet pilota il bottone di ricarica
legge «Registra» (`messages/it.json:364`, `pilots.actions.topUp`), mentre la stessa azione è «Ricarica» nelle
righe 704 e 791 dello stesso file. Nello sheet sta accanto a «Modifica», senza complemento. Effort S.

**(d) Gerarchia delle azioni negli sheet, disomogenea** (giudizio di gusto, ma misurabile): sheet prenotazione =
4 bottoni **tutti** in stile secondario (Modifica / Effettuato / Assente / Annulla) + «Chiudi», nessuna primaria;
sheet flotta e sheet pilota = una primaria scura («Modifica») + secondarie. Nella coda decisionale, dove esiste
un passo successivo evidente («Effettuato»), la primaria manca proprio dove servirebbe.

---

### M14 `[MOBILE]` — Le pagine di autenticazione non sono mai entrate nell'epic mobile

**Superficie**: `/it/login`, `/it/forgot-password`, 375px. Screenshot: `anon-login-375-it.png`,
`anon-forgot-375-light.png`.
**Misura**: login — email **269×36,84**, password **269×36,84**, «Accedi» **269×34,84**, «Password dimenticata?»
**121,53×15** con contrasto **3,61:1** su 12,5px (sotto 4,5); forgot — input 36,84, submit 34,84. Nessuno switch
di lingua, mentre `/ppr` pubblico ce l'ha e `localeDetection` è `false` per decisione di story: un utente EN
atterra su `/it/login` e può cambiare lingua **solo** modificando l'URL a mano.
**Perché è un problema.** È la prima schermata dell'app su telefono, l'unica che ogni utente vede sempre, e ha
il bersaglio più piccolo dell'intera applicazione (15px) col contrasto più basso.
**Proposta.** Estendere il pavimento 44px e il colore del link alle tre pagine `(auth)`; aggiungere lo switch
di lingua nell'header di login riusando il pattern `.ppr-top-right a` (già a 44px). **Effort**: S.

---

### M15 `[MOBILE]` — Voci di contrasto e bersagli **già dichiarate** (nessun difetto nuovo)

Riportate per completezza e per confermare che non sono regredite: `.mobile-sheet-label` «ALTRE SEZIONI»
**3,66** (chiaro); `.segmented` inattivo «Settimana»/«Giorno»/«Ricavo» **4,39**; `.prefix`/`.suffix` di
`input-group` **4,39** (contabilità, impostazioni); etichette d'asse dei grafici **4,39**; intestazioni delle
liste desktop **3,46**; `.nav-label` della sidebar **3,66**; 42 celle `.cal-popover` a 34,58 e input dell'ora a
36,84. Tutte nella tabella «TD POST-EPIC» di `sprint-status.yaml`. **⚖️ RATIFICATO.**
Non ho trovato **nessun** contrasto sotto soglia fuori da quell'elenco, in nessuno dei due temi.

---

### D1 `[DESKTOP]` — La Panoramica a 1280 è alta **33.313px**: 37 schermate

**Superficie**: `/dashboard`, admin, 1280×900 (e 768×1024: **23.760px**). Screenshot:
`admin-overview-1280-light.png`, `admin-overview-tall-1280-light.png`.
**Misura**: `main` alto 33.249,6px, composto da → `schedule-section` **13.062,9px** = **187 righe** `sched-row`
da 83,5px, una per velivolo non archiviato, di cui **161 senza alcuna prenotazione oggi** (griglia vuota);
`.split` con `fleet-card-widget` **19.065,2px** = `.fleet-grid` da **100 card** (il tetto
`OPTIONS_PAGE_SIZE`), 18.947,1px; `bookings-list-section` 820,8px.
Le versioni **mobile** delle stesse superfici sono cappate (agenda mobile, cap per rango della 15.8b «Prime 8 di
145 · Mostra tutte»); quelle desktop no.
**Perché è un problema.** La home non è un cruscotto ma la concatenazione di due pagine intere: per arrivare
alle prenotazioni in attesa — il lavoro vero — si scorre l'inventario della flotta. Con una flotta reale di 10-20
velivoli il difetto è invisibile; con 187 è la pagina.
**Proposta.** Nella home, timeline **solo dei velivoli con attività oggi** (+ «mostra tutti gli N»), e widget
flotta cappato a 6-8 card con link a `/fleet` (il pattern del cap dichiarato esiste già ed è per **rango**, non
per posizione DOM — lezione 15.8b).
**Effort**: M.

---

### D2 `[DESKTOP]` — A 1280 la tabella Registro voli nasconde 354px: la colonna «Azioni» sta fuori schermo

**Superficie**: `/dashboard/logbook` (e `/dashboard/pilots`), 1280×900. Screenshot:
`admin-logbook-1280-light.png`.
**Misura**: `.lb-row` con 11 colonne a px fissi (92+150+150+110+130+64+55+55+100+130+150 = **1344px**) dentro un
corpo da **990px** → scroller orizzontale interno (`.logbook-desktop-body`, `overflow-x: auto`) che nasconde
**354px**: «PIC» e tutta «Azioni» (Annulla, Modifica).

| Larghezza | Registro voli nascosto | Piloti nascosto |
|---|---|---|
| 1280 | **354px** | 112px |
| 1440 | **194px** | 0 |
| 1920 | 0 | 0 |

**Perché è un problema.** Le azioni di riga sono l'ultima colonna e la prima a sparire: su un portatile 1280 —
configurazione ordinaria — annullare o correggere un volo richiede uno scroll orizzontale dentro la card, che
non ha alcuna affordance visibile.
**Proposta.** Sotto ~1400px: fondere «Dec/Att» in una cella, mostrare «PIC» solo quando differisce dal pilota,
e rendere «Azioni» una colonna **sticky a destra** (o un menu `⋯` di riga). In alternativa colonne in `fr` con
`min-width`, invece dei px fissi.
**Effort**: M.

---

### D3 `[DESKTOP]` — Le intestazioni di lista non sono sticky

**Misura**: `.lb-row.header` ha `position: static` con 116 righe in pagina (e le liste crescono: 357
transazioni in contabilità). Scorrendo si perde il significato delle 11 colonne.
**Proposta**: `position: sticky; top: 0` sul solo `.header` dentro il corpo della card (attenzione:
`.card{overflow:hidden}` — lo stesso vincolo che la TD-7 ha già incontrato sui popover).
**Effort**: S.

---

### D4 `[DESKTOP]` — Statistiche: le liste ranked non hanno il cap che hanno su mobile

**Misura**: `/dashboard/reports` a 1280 → docH **19.708px**, con `reports-rank-aircraft` **9.386px** (161 righe)
e «Utilizzo flotta» 9.372,9px (161 righe). Su mobile la stessa card è cappata («Prime 8 di 145 · Mostra
tutte», story 15.8b, con fix **per rango** dopo il major di review).
**Proposta**: applicare lo stesso cap dichiarato anche a `≥641px`. Stessa classe di D1.
**Effort**: S (il meccanismo esiste già; è una condizione di larghezza da togliere).

---

### T1 `[TABLET]` — A 768px l'app è desktop ma il dito è quello del telefono ⚖️ RATIFICATO (R1)

**Superficie**: 768×1024, admin.
**Misura**: sidebar in modalità rail **64px** con `nav-item` **35×34**; topbar desktop con `locale-switch` e
tema a **32×32**, «Esci» 48,73×**34,84**; in Impostazioni **152** bottoni `.btn.mini` a **24,67px**
(47 «Modifica» + 73 «Disattiva» + 47 «Elimina» + 6 «Riattiva» misurati) e input a 36,84; docH **23.760** (D1).
Screenshot: `admin-settings-768-light.png`, `admin-overview-768-light.png`.
**Contesto**: la ratifica **R1** dell'epic 15 dice «tab bar solo ≤640px, gli iPad tengono il rail», e la
condivido: a 768px il rail è la scelta giusta. Ma la ratifica riguardava la **navigazione**, e il pavimento dei
44px è stato agganciato alla stessa soglia: su un tablet, che è un dispositivo **touch**, ogni controllo è
rimasto dimensionato per il mouse. 24,67px supera di poco il minimo WCAG 2.5.8 (24px) e sta molto sotto la
raccomandazione touch.
**Proposta.** Sganciare i due assi: navigazione a `≤640px` (invariata, come ratificato), pavimento dei bersagli
su `@media (pointer: coarse)` oppure `≤1024px`. Da misurare l'impatto sulle testate delle pagine dense a 768.
**Effort**: M — e va **ratificato** dal PO, perché reinterpreta la soglia di R1.

---

### A1 `[MOBILE + DESKTOP]` — Accessibilità: campione, non esaustivo

Cose buone (già in §2): focus ring visibile in entrambi i temi, dialoghi con nome e trap, `aria-current` sulle
tab, nome accessibile composto sulle righe di coda, `nav` unica in albero per costruzione.
Lacune misurate:
1. **Nessuno skip link** (`document.querySelector('a[href^="#"]')` → nessun risultato) e `main` **senza nome
   accessibile** (nessun `aria-label`). Su mobile la `nav` è l'ultimo landmark del DOM (giusto per una barra in
   basso), quindi da tastiera/Switch Control si attraversa tutta la pagina prima della navigazione.
2. La **KPI strip** è un tab-stop (`<div>` focalizzabile, 375×77) **senza nome né ruolo**: annunciato come gruppo
   anonimo. Va bene renderla scorrevole da tastiera, ma serve `role="group"` + `aria-label`.
3. Il **toast host è fuori dal contesto modale** del trap e `aria-owns` sui portali non è verificato con uno
   screen reader: entrambe già dichiarate nella coda 15.10. **⚖️ RATIFICATO.**
4. Non verificabile in questa sessione: annunci reali degli stati d'errore dopo un 422 e focus post-azione (§1,
   punto 1).
**Effort**: S per (1) e (2).

---

## 4. Proposte trasversali (ordinate per valore/costo)

1. **Un pavimento mobile unico invece della 124ª eccezione ancorata** (chiude M2, M14 e prepara T1). Una regola
   su `.so-body` + due puntuali su topbar e `date-nav`, con invarianza desktop misurata. Il modo in cui il
   pavimento è stato costruito — per pagina — è **la** ragione per cui i cinque pannelli form più usati
   dell'app sono rimasti fuori. **S/M.**
2. **Restituire il fold alle liste** (chiude M1): `h1` `sr-only` a ≤640 dove duplica la topbar, conteggi dentro
   le chip, azioni secondarie in uno sheet. Su Scadenze porta il primo dato da 625 a ~290px. **M.**
3. **Indietro chiude, non naviga** (chiude M5): una voce di history nelle due primitive. È la differenza fra
   «app» e «sito» sul telefono. **M.**
4. **Feedback di navigazione** (chiude M7): `loading.tsx` per segmento + stato pending sulla tab. 3,4 secondi
   muti su 3G sono il difetto percepito più grande che ho misurato. **M.**
5. **Portare l'ultimo filtro desktop nella grammatica mobile** (chiude M3): sheet + typeahead al posto di 227
   chip. **M.**
6. **Righe che dicono la cosa giusta** (chiude M4 e la sua incoerenza gemella): marca cappata, nome con quota,
   una sola grammatica per le due code decisionali. **S.**
7. **Rispettare il tema di sistema + `color-scheme`** (chiude M12): l'app ha un tema scuro buono e non lo usa
   quando il telefono lo chiede. **S/M.**
8. **Cappare le superfici desktop come sono cappate quelle mobile** (chiude D1 e D4): la home passa da 33.313 a
   ~3.000px. Il meccanismo di cap per rango esiste già ed è la lezione della 15.8b. **M.**

---

## 5. Indice degli screenshot

Radice: `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/ui-review/`
(115 file). I più significativi:

**Densità e testate (M1)** — `admin-expiries-375-it.png` (625px prima del dato),
`admin-it_dashboard_billing-375-light.png`, `admin-it_dashboard-375-light.png`,
`admin-it_dashboard_bookings-375-light.png`, `admin-it_dashboard_logbook-375-light.png`.

**Bersagli e pannelli form (M2, M10)** — `admin-pilots-editor-375-light.png` (checkbox 13px, `.btn.mini`
24,67, ✕ 37,19), `logbook-mob-newflight-375-light.png`, `fleet-mob-editor-375-light.png`,
`admin-newbooking-panel-375-light.png`, `shell-mob-load-375-light.png` (topbar 32×32).

**Filtri di Pianificazione (M3)** — `bookings-mob-filters-375-light.png`, `sched-filter-load-375-light.png`.

**Righe e grammatiche (M4, M13d)** — `admin-bookings-cards-375-it.png` (nome a 52px),
`bookings-mob-sheet-375-light.png` (4 azioni tutte secondarie), `fleet-mob-sheet-375-light.png`,
`admin-pilot-sheet-375-light.png`, `admin-overview-sheet-375-light.png` (Approva/Rifiuta a 2 tap).

**Ruoli self (M6, M9, M11)** — `pilot-landing-375-it.png`, `pilot-bookings-375-it.png` (console admin),
`pilot-logbook-375-it.png`, `student-logbook-375-it.png` (stato vuoto), `student-landing-375-it.png`,
`instructor-it_dashboard-375-light.png`, `instructor-compensation-375-it.png`.

**Shell (M6, M2)** — `shell-mob-altro-375-light.png` (sheet «Altro», 8 voci a 44,1),
`shell-mob-profile-375-light.png` (lingua + Esci a 44,8).

**Tema scuro (M12)** — `admin-overview-375-dark.png`, `admin-newflight-375-dark.png`,
`admin-bookings-sheet-375-dark.png`, `admin-settings-375-dark.png`, `admin-fleet-1280-dark.png`.

**Desktop (D1-D4)** — `admin-overview-1280-light.png`, `admin-overview-tall-1280-light.png`,
`admin-logbook-1280-light.png` (colonne tagliate), `admin-reports-tall-1280-light.png`,
`admin-settings-1280-light.png`, `admin-newflight-1280-light.png`.

**Tablet (T1)** — `admin-overview-768-light.png`, `admin-settings-768-light.png`,
`admin-bookings-768-light.png`, `admin-fleet-768-light.png`.

**Pubblico e auth (M14)** — `anon-ppr-375-light.png` (12/12 a 44px), `anon-login-375-it.png`,
`anon-forgot-375-light.png`.

**Locale EN (M6, M13b)** — `admin-overview-375-light-en.png`, `admin-bookings-375-light-en.png`,
`admin-fleet-375-light-en.png`, `admin-billing-375-light-en.png`.
