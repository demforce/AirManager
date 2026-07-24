---
baseline_commit: e22eeee
---

# Story 13.3: Scheda persona + estratto conto in AirOps, click sul nome, rimozione slide-over profilo

Status: ready-for-dev

## Story

As a admin/staff dell'aviosuperficie,
I want che la scheda persona e l'estratto conto siano in stile AirOps come il resto dell'app, che si aprano cliccando sul nome nella tabella Piloti, e che lo slide-over di profilo sola-lettura sparisca,
so that non ci siano più pagine con la vecchia UI Tailwind e ci sia UNA destinazione coerente per tutto ciò che riguarda una persona.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 3). Ultime 2 pagine legacy dell'app (Tailwind, colori light hardcoded). L'editor slide-over della 13.2 (`pilot-editor.tsx`) è il contratto di editing da riusare.

**Ratifiche PO (AskUserQuestion 2026-07-24)**:
- **R-13.3-a (SPLIT)**: questa story porta SOLO le 2 pagine (scheda persona + estratto conto) in AirOps, ripunta il click sul nome, elimina lo slide-over profilo sola-lettura. Il ritiro COMPLETO dello stack legacy (DataTable in `new-booking-form`/`aircraft-editor`, ExportButton in `ExportMenu`, poi Tailwind/Geist/TanStack fuori da `package.json`) è una **story dedicata a valle** (13.x cleanup) — NON in questa. Conseguenza: qui l'estratto conto va ricostruito SENZA `DataTable` (markup tabella AirOps) e l'export della pagina account usa l'`ExportMenu` AirOps (o `export-href`) invece di `ExportButton`, così i consumer legacy di queste 2 pagine spariscono; gli ALTRI consumer (booking/fleet/ExportMenu) restano e li chiude il cleanup.
- **R-13.3-b (estratto conto = sezione)**: l'estratto conto diventa una **sezione/tab dentro la scheda persona**, non più una pagina separata. La rotta `people/{id}/account` può restare come deep-link alla stessa vista (o redirigere alla scheda con la sezione attiva) — decidere in dev il modo meno invasivo che non rompe i link entranti.
- **R-13.3-c (modifica via slide-over 13.2)**: la scheda persona è una VISTA/dossier; un bottone "Modifica" apre lo **stesso `PilotEditor` slide-over** della 13.2 (montato come client component sulla pagina). Nessuna logica di editing duplicata.

## Acceptance Criteria

1. **(Scheda persona AirOps)** `people/[id]/page.tsx` ricostruita in AirOps (niente più `#FBFBFA`/`#2F3437` hardcoded, niente utility Tailwind; primitive `src/components/ui/` + `airops.css`; tema light/dark corretto). Dossier read-oriented con: intestazione (nome + badge stato/ruoli), anagrafica, profili attivi, Ratings/scadenze (lista; la gestione avviene via editor), saldo, ultimi voli. Un bottone "Modifica" apre il `PilotEditor` slide-over della 13.2 (R-13.3-c). Le pagine sono generiche per QUALSIASI persona (non solo piloti), come oggi.
2. **(Estratto conto come sezione)** L'estratto conto (overview saldo + tabella movimenti + export) diventa una sezione/tab della scheda persona (R-13.3-b), ricostruita con markup tabella AirOps (pattern `.student-row`/grid come billing/logbook), SENZA `DataTable`/TanStack. Export via `ExportMenu` AirOps (xlsx+pdf, riuso `buildExportHref`/`buildPdfExportHref`), NON `ExportButton`. Stessa RBAC di oggi (`getAccountOverview`/`listAccountMovements` ri-checkano il permesso — invariato). La rotta `people/{id}/account` non deve rompere i link entranti (deep-link o redirect alla sezione).
3. **(Click sul nome → scheda)** Nella tabella Piloti (`pilots-console.tsx`) il click sul NOME naviga a `/dashboard/people/{id}` (come già fa la card saldi-negativi di billing, `billing-console.tsx:623`) invece di aprire lo slide-over profilo. Lo slide-over profilo sola-lettura (`pilot-profile.tsx`, `PilotProfile`, stato `profileTarget`/`setProfileTarget`, import e render in `pilots-console.tsx`) viene ELIMINATO (componente + wiring + i18n orfane + eventuali e2e che lo esercitano). Il bottone "Modifica" della tabella (che apre `PilotEditor`) resta invariato.
4. **(Nessun consumer legacy residuo su QUESTE 2 pagine)** Dopo la story: `people/[id]/page.tsx`, `people/[id]/account/*` e i loro pannelli (`account-panel.tsx`, `expiries-panel.tsx`, `profiles-panel.tsx`, `account-statement-table.tsx`) NON importano più `DataTable`, `ExportButton`, né utility Tailwind/Geist. I componenti `data-table.tsx`/`export-button.tsx` RESTANO nel repo (li rimuove il cleanup a valle quando cadono gli ultimi consumer booking/fleet/ExportMenu) — dichiararlo, non rimuoverli qui. Aggiornare il commento di stato in CLAUDE.md sullo stack dormiente per riflettere che le pagine legacy non esistono più ma le dipendenze sì (fino al cleanup).
5. **(e2e + skill UI)** e2e: navigazione nome→scheda persona; scheda mostra anagrafica/profili/ratings/saldo; "Modifica" apre l'editor; sezione estratto conto mostra i movimenti ed esporta; la rotta `/account` non è rotta. e2e esistenti che aprivano lo slide-over profilo aggiornate/rimosse. Selettori scoped/exact, MAI hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps assoluta. Verifica interattiva: prova i tool `mcp__playwright__*` (server via Docker, scope locale — se non raggiungibili dalla sessione subagent, fallback script `@playwright/test` throwaway in /tmp, cancellati prima del commit).

## Contesto (puntatori — ricognizione 2026-07-24)

- Scheda persona: `src/app/[locale]/dashboard/people/[id]/page.tsx` (legacy: `main` con `background:#FBFBFA`, header L119-155, anagrafica `dl` L157-169, poi `ProfilesPanel`/`ExpiriesPanel`/`AccountPanel` + "Ultimi voli"). Pannelli: `../profiles-panel.tsx`, `../expiries-panel.tsx`, `../account-panel.tsx`.
- Estratto conto: `src/app/[locale]/dashboard/people/[id]/account/page.tsx` (usa `ExportButton` L3, `AccountStatementTable`; reader `getAccountOverview`/`listAccountMovements` da `accounts.service`; export href `buildExportHref`/`buildPdfExportHref`). Tabella: `account/account-statement-table.tsx` (`DataTable` L8+L268, `ColumnDef` L150).
- Slide-over profilo da eliminare: `pilot-profile.tsx` + in `pilots-console.tsx` import L39, stato L159, onClick L287 (`setProfileTarget(pilot)`), render L411-414. La rotta target esiste già come link in `billing-console.tsx:623`.
- Editor da riusare (13.2): `PilotEditor` in `pilot-editor.tsx` (client component driven by props; va montato con un wrapper client sulla pagina server della scheda). Contiene già `LiveExpiryEditor` per ratings/scadenze.
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install, MAI dipendenze nuove — anzi qui NON si tocca `package.json`). Commit: `feat(13.3): scheda persona + estratto conto AirOps, click nome, rimozione slide-over profilo` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Ritiro delle dipendenze legacy (Tailwind/Geist/TanStack) e dei loro consumer booking/fleet/ExportMenu (`data-table.tsx`/`export-button.tsx` restano) — story cleanup dedicata a valle (R-13.3-a).
- Conversione di `search-combobox` ad airops.css e il fix font del logbook (era abbinato al ritiro legacy nel piano; segue il cleanup / la 13.5).
- Qualunque cambiamento backend/schema o alle altre pagine della punch-list (13.4+).

## Dev Agent Record

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
