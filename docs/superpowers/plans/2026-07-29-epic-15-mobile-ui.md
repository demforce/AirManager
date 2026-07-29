# Epic 15 — UI mobile AirOps (porting completo del template "AirOps Mobile")

**Data**: 2026-07-29 · **Fonte**: richiesta utente + template design claude.ai/design
progetto `dcd71b3a-dbcf-494e-a543-29325a5435de`, file `AirOps Mobile.dc.html` (+ `data.js` fixture,
`support.js` runtime dc — copie verbatim usate per la valutazione in scratchpad di sessione).
Valutazione di fattibilità completa (agent 2026-07-29): verdetto SÌ, separabile senza danni alla
desktop — sintesi ripresa qui sotto, dettagli nel messaggio di sessione.

## Decisione di fondo

L'app diventa **totalmente responsive** con una UI mobile DEDICATA (markup proprio, non solo CSS),
fedele al template AirOps Mobile, SENZA toccare il comportamento desktop. Il template è dichiarato
**incompleto by design** (ratifica R2): i pezzi mancanti (form, filtri, pagine self, auth) vanno
PROGETTATI nello stesso linguaggio visivo del template, non rimandati.

## Ratifiche PO (2026-07-29, vincolanti)

- **R1 — Soglia e tablet**: bottom tab bar SOLO ≤640px. Gli iPad/tablet (641-900px) TENGONO il
  rail 64px attuale (la ratifica 13.10 resta in vigore per quella fascia; il cambio di pattern vale
  solo per i telefoni).
- **R2 — Template incompleto**: il template non ha tutte le pagine/bottoni; li completa il team di
  sviluppo nello stesso linguaggio (es. nav per pilota/istruttore/allievo: tab bar con le LORO route
  del registry, ≤5 voci, senza "Altro"; admin = 5 slot del template + sheet "Altro" con le restanti).
- **R3 — Pattern di apertura**: dettaglio-riga = **bottom sheet** (pattern del template, sale dal
  fondo, chiave-valore + azioni). FORM di creazione/modifica = **pannello a tutto schermo** con
  header fisso (titolo + X) e azione primaria fissa in basso (evoluzione mobile dello SlideOver;
  ratificato con mockup 2026-07-29).
- **R4 — Perimetro**: si porta TUTTO nel linguaggio del template — incluse le funzionalità che il
  template non mostra: filtri, tutti i form di edit/creazione, scheda persona, aree self, export.
  Nessuna pagina resta "tabella desktop scrollabile" come stato finale.
- **R5 — Logout e lingua**: vivono nel menu che si apre toccando l'icona del PROFILO nella topbar.

Assunzioni accettate (obiezione non pervenuta): lo switch-ruolo "Accedi come" e l'orologio in topbar
sono artefatti del prototipo e NON si implementano; i valori `--ink-4` dell'app (ratifica
accessibilità 13.9 F6) prevalgono su quelli del template; la futura app Flutter resta fuori scope.

## Architettura (dalla valutazione — vincolante per le story)

- **Componenti mobile dedicati + switch a breakpoint CSS puro** (niente route parallele, niente
  user-agent sniffing, niente `matchMedia` JS): `mobile-nav.tsx` accanto alla `Sidebar` nello stesso
  `dashboard/layout.tsx`, entrambi pilotati dallo STESSO `visibleNavItems` di `route-registry.ts`
  (unica fonte di verità: RBAC e i18n gratis). Visibilità: sidebar `display:none` ≤640px,
  mobile-nav `display:none` >640px — `display:none` VERO (fuori dall'accessibility tree, così i
  selettori e2e scoped al landmark restano univoci).
- **Token**: `airops.css` resta la fonte; ogni regola mobile è ADDITIVA dentro `@media (max-width:
  640px)`. Unica aggiunta ai token: promozione di `--ok-ink`/`--bad-ink`/`--info-ink` (valori già
  usati inline nell'app, identici a quelli del template). MAI cambiare valori esistenti.
- **Doppio markup** (tabella desktop + card mobile nella stessa pagina): convenzione `data-testid`
  fissata alla prima story — testid solo sull'albero desktop, oppure suffisso `-mobile` — per non
  rompere lo strict mode Playwright.
- **e2e**: la suite desktop (298) non vede la UI mobile (display:none). I 3-4 spec che già usano
  viewport mobile (bookings 375px, datetime-picker, my-compensation 390px) vanno rieseguiti e
  sistemati nella story shell (la tab bar cambia la geometria del fondo pagina). Ogni story porta
  e2e mobile MIRATI (pattern 13.10: test con `setViewportSize`), NIENTE project Playwright duplicato
  per ora (riesame a fine epic). Gate invariato: full suite CI=1 su build prod.

## Story (ordine di lavorazione)

1. **15.1 Shell mobile** — tab bar per-ruolo (R2) + sheet "Altro" (admin) + topbar compatta con menu
   profilo (logout + switcher lingua, R5) + media query di switch (R1) + campo di priorità/slot nel
   registry + fix degli spec mobile-viewport esistenti. Dopo questa story l'app è mobile-navigabile
   e ogni pagina resta usabile (baseline 13.10).
2. **15.2 Primitive mobile** — `BottomSheet` (dettaglio-riga) + `MobileFormPanel` a tutto schermo
   (R3, evoluzione SlideOver con header/azione fissi) + KPI strip a scroll snap + convenzione
   testid. Primo consumer completo come prova: coda PPR (dettaglio in sheet, Approva/Nega, form
   manuale full-screen).
3. **15.3 Panoramica mobile** — KPI strip, "In volo ora", coda prenotazioni con Approva/Nega inline,
   feed Avvisi (riconciliato con le fonti reali: expiry-alerts, saldi, PPR pending), card METAR.
   Riconciliazione con la landing per-ruolo 12.12 (le home pilota/istruttore/allievo si allineano al
   linguaggio del template).
4. **15.4 Pianificazione mobile** — agenda "Voli di oggi" con chip per marche e marcatore ORA,
   lista/gestione prenotazioni con filtri mobile, form prenotazione full-screen (finestra, force 7.4).
5. **15.5 Anagrafiche a card** — Flotta (card 2-col con barra ore), Piloti (saldo + flag medico),
   Istruttori (ore/dovuto), coi loro filtri mobile e i form full-screen (velivolo composito 14.8,
   pilota unico 13.2, scheda persona `people/{id}` in linguaggio mobile).
6. **15.6 Registro voli mobile** — card list + filtri + registra/correggi volo full-screen col
   guard-rail 14.4 completo (blocco documento mancante/scaduto, deroga admin motivata, avviso saldo).
7. **15.7 Scadenze + Transiti mobile** — registry scadenze, promemoria, transiti con chiusura/fee.
8. **15.8 Contabilità + Statistiche + Impostazioni mobile** — KPI, registro entrate/uscite con
   filtri, secchiello, bar chart orizzontali, card impostazioni; export/PDF raggiungibili da mobile.
9. **15.9 Aree self + pubblico** — my-account, my-compensation, le mie transazioni, modulo PPR
   pubblico `/ppr` in linguaggio mobile.
10. **15.10 Sweep finale** — dark theme pass mobile, a11y pass (focus/aria su sheet e form panel),
    audit copertura e2e mobile, riesame "project mobile" Playwright, full suite arbitro.

Il taglio per-story può essere rifinito alla creazione delle story (bmad-create-story); l'ordine
1→2→3 è vincolante (shell e primitive prima di tutto), il resto segue il valore d'uso.

## Regole di processo (invariate)

Ciclo per story: story file (sessione principale Fable xhigh) → DB fresco → dev (UN subagent
`dev-story` — **Opus 5 xhigh: regola utente 2026-07-29, il codice UI lo scrive Opus 5, e questo
epic è tutto UI**; vale anche per i fix-subagent) → DB fresco → review adversarial
(`adversarial-reviewer` Opus 5 xhigh, mai degradare) → fix → chiusura con sprint-status/HANDOFF
aggiornati. Skill obbligatorie dev:
karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; fedeltà visiva al template AirOps
Mobile (i file design restano recuperabili via DesignSync dal progetto sopra). Ratifiche di dominio
nuove: SEMPRE AskUserQuestion prima di implementare ("Per ogni altro dubbio chiedi a me" — PO,
2026-07-29).

## Fuori scope

- App Flutter (le API REST restano la base per il futuro client nativo).
- Ridisegno del desktop (nessuna regressione ammessa: gate = suite completa + verifica interattiva).
- PWA/offline/notifiche push (eventuale epic successivo).
