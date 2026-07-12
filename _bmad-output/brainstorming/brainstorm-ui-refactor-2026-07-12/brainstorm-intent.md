# Intent — Refactor UI AirManager → stile Refero "Ui"

Sessione brainstorming 2026-07-12 (completa). Input per bmad-prd / creazione epic e stories.

## Goal

Feel **infra-grade**: l'app deve trasmettere la credibilità professionale di Linear/Vercel/Cal.com a piloti e staff. Da "sito web" a desktop-app nel browser.

## Input vincolanti

- **`DESIGN.md`** (stessa cartella di questo file): token Refero "Ui" — monocromo clinico shadcn-like. Vincolante in toto.
- **Vincolo di processo (by user)**: lo sviluppo UI DEVE integrare le skill `impeccable`, `design-taste-frontend` e `ui-ux-pro-max`.

## Decisioni ratificate dall'utente (VINCOLANTI)

1. **Full refactor monocromo**: nessun punto critico percepito nel vincolo monocromo — accettato in toto. (Il "piatto" attuale è un problema di strati/gerarchia, non di colore.)
2. **Bersagli prioritari del cambio di sensazione**: form creazione VOLI e creazione PILOTI → da pagina sempre visibile a modale/sheet.
3. **Riga volo definitiva**: data (solo in contesti flat cross-giorno) / tratta / **velivolo** / durata / costo / PIC. Data e velivolo NON eliminabili dalla tabella.
4. **Costo in riga gated per ruolo**: staff/admin vedono tutti, pilota/allievo solo i propri — coerente coi permessi finanze esistenti.
5. **MoSCoW dei 6 cantieri** (sotto).
6. **Sicurezza per-oggetto su ogni nuova superficie**: pilota/allievo vede SOLO i propri voli/transazioni/prenotazioni, e nessun accesso per ID diretto a risorse altrui (anti-IDOR). Vale per sheet di dettaglio, ⌘K search, modali e liste: l'autorizzazione resta server-side per oggetto, mai solo filtro client.

## I 6 cantieri — MoSCoW approvato by user

| Pri | Cantiere |
|---|---|
| MUST | **A** Fondamenta: token DESIGN.md + stack superfici 3 toni |
| MUST | **B** App shell desktop-like: sidebar `#fafafa` + topbar persistenti (mai ricaricate), naviga solo il pannello contenuto, scroll indipendente, loading granulare per-sezione (skeleton pulse piatto, niente shimmer/gradienti) |
| MUST | **C** Form a comparsa: creazione in dialog modale, modifica/dettaglio in sheet laterale sopra la tabella |
| MUST | **D** Registro voli ripensato (vedi story chiave di volta) |
| SHOULD | **E** Igiene dettagli (regole dagli "orrori", sotto) |
| SHOULD | **F** Command palette ⌘K: navigazione, creazione, ricerca cross-entity |
| COULD | Batch-entry "Invio e ripeti" nel modale volo; jump-to-date via ⌘K |
| WON'T | Dark mode; redesign per-pagina delle altre sezioni (ricevono solo il nuovo sistema) |

## Regole derivate (proposte dal coach, coerenti con le decisioni — non ratificate esplicitamente)

- **Vocabolario status acromatico**: geometria al posto del semaforo — badge solid `#171717` = attivo/approvato, soft = pending/neutro, outline = chiuso/informativo; più dot ●◐○, weight, strikethrough.
- **Regola Ember**: `#e7000b` SOLO per azioni distruttive ed error-state veri (es. visita medica SCADUTA = error-state legittimo; "in scadenza" NO → badge solid + testo "scade tra N giorni"). Scioglie l'ambiguità di DESIGN.md (Ember accento decorativo vs riservato al distruttivo).
- **Orrori→regole** (dallo screenshot pagina voli, portato dall'utente come worst example):
  1. Date input nativi mm/dd/yyyy → date picker custom DD/MM/YYYY.
  2. Testo che trabocca/tronca a caso (tratta, persona) → max-width + ellipsis deliberata + tooltip.
  3. Data identica ripetuta su N righe → header di giornata.
  4. Altezze riga incoerenti → row height fissa da spec compact.
  5. Tabella mai nuda sul canvas → vive in card paper con header/footer nested.
  6. Pager "1/3" microscopico → load-more per giorni.
  7. Bottoni export gemelli affiancati → menu overflow singolo.

## Proposte coach NON ratificate (da validare in PRD/story)

- Registro voli: raggruppamento per **giorni** (bucket Europe/Rome esistente) con header sticky + "carica giorni precedenti" — no pager classico né infinite scroll puro (registro contabile: serve posizione citabile e confini per export/stampa). L'utente era indeciso tra paginazione e infinite scroll; questa è la riconciliazione proposta.
- Due contesti della stessa tabella voli: raggruppata per giorno (data nell'header, non in colonna) vs flat cross-giorno (ricerca, voli su scheda persona: colonna data presente).
- Modale creazione volo keyboard-first: autocomplete pilota/velivolo, parsing orari rapido ("1430"), durata derivata live come pill.
- Creazione pilota con progressive disclosure: modale minimo (nome, ruolo, contatto), il resto nello sheet persona.
- Takeoffs/landings fuori dalla riga → sheet dettaglio.

## Aperture / deferred

- Scelta finale paginazione registro (load-more per giorni è proposta coach, non ratificata).
- COULD e WON'T come da MoSCoW sopra.

## Story chiave di volta suggerita: registro voli (cantiere D)

Il registro è insieme il "momento più sito web" segnalato dall'utente e la sua worst possible idea: se il refactor vince lì, vince ovunque.
