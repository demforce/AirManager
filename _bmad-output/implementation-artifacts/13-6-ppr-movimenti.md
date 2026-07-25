---
baseline_commit: 31e65ae
---

# Story 13.6: PPR & Voli in transito — istruzioni operative in Settings, telefono, calendario, export PDF

Status: ready-for-dev

## Story

As a staff dell'aviosuperficie,
I want che la console PPR non duplichi l'editor delle istruzioni operative (già in Impostazioni), che i Voli in transito mostrino bene il contatto e usino il calendario custom per le date, e che sia PPR sia Voli in transito abbiano l'export PDF,
so that le due pagine siano coerenti e complete come il resto dell'app.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 6). NESSUNA nuova ratifica (item meccanici); una SCOPERTA di ricognizione cambia un item (v. AC1).

## Acceptance Criteria

1. **(Istruzioni operative — RIMOZIONE dalla console PPR, non spostamento)** SCOPERTA ricognizione 2026-07-25: l'editor istruzioni operative è **GIÀ in Impostazioni** (`settings/club-card.tsx`, campi IT/EN, salva su `POST /api/v1/settings/ppr-operating-instructions`, aggiunto in 12.11) — MA è duplicato anche nella console PPR (`ppr-console.tsx:328` + `ppr-queue.tsx:377`, stesso endpoint). Il feedback "Operation Instructions → in settings" è di fatto già soddisfatto: qui si RIMUOVE l'editor duplicato dalla console PPR (`ppr-console.tsx`, sezione :328-360 circa + prop `instructionsEditor` + wiring in `ppr/page.tsx` che la fornisce + eventuale gemello in `ppr-queue.tsx` se ancora vivo — verificare quale delle due è renderizzata) e le i18n orfane. La ClubCard di Impostazioni resta l'UNICA sede. Verificare che l'endpoint `/api/v1/settings/ppr-operating-instructions` e l'uso nell'email di approvazione (`ppr.service.ts:547`) restino INTATTI.
2. **(Telefono contatto — rendering)** In `movements-table.tsx:239` la colonna "Richiedente · contatto" rende `contactLine` (email · phone) dentro `.student-sub mono` — troncata da `.student-sub {overflow:hidden;ellipsis;nowrap}` + `.student-row > * {overflow:hidden}` (`airops.css`) → il telefono (2° segmento) sparisce. STESSA radice del billing 13.5. Fix: layout che mostra email E telefono per intero (wrap su 2 righe, o larghezza colonna adeguata) senza rompere le altre colonne. Verificare con un richiedente che ha sia email sia telefono.
3. **(Filtri data → CalendarPopover)** I filtri data di Voli in transito (`movements-table.tsx:185,189`, `<input type="date">` nativi) usano il `CalendarPopover` custom (`src/components/ui/calendar-popover.tsx`, già usato in Pianificazione/bookings) — coerenza con l'app. Stesso comportamento (from/to → query), formato date DD/MM/YYYY.
4. **(Export PDF — Voli in transito)** L'export di Voli in transito (`ExportMenu` `movements-table.tsx:197`, oggi `pdfLabel=""` = solo Excel) guadagna il PDF. Serve BACKEND: `ppr-requests` ha solo xlsx (`exportPprRequestsXlsx`, `?format=xlsx`) → creare `exportPprRequestsPdf` + supporto `?format=pdf` sulla route `/api/v1/ppr-requests` (pattern estratto conto PDF story 10.2: `pdfResponse` + adapter PDF esistente; filtri status/from/to rispettati come l'xlsx). ExportMenu con `pdfLabel` + `pdfHref` (`buildPdfExportHref`).
5. **(Export — console PPR)** La console PPR (`ppr-console.tsx`) oggi NON ha alcun export → aggiungere un `ExportMenu` (Excel + PDF, stesso endpoint `ppr-requests` con i filtri della console) come le altre pagine. Riusa l'export xlsx esistente + il nuovo PDF (AC4).
6. **(e2e + skill UI)** e2e: console PPR senza editor istruzioni (e Impostazioni le gestisce ancora); telefono visibile nei Voli in transito; filtri data col CalendarPopover filtrano; export PDF movimenti + export Excel/PDF console PPR (href corretti). e2e esistenti che esercitano l'editor istruzioni nella console PPR aggiornate/spostate (o già coperte da settings.spec.ts). Selettori scoped/exact, MAI hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps. Verifica interattiva: prova PRIMA i tool `mcp__playwright__*` (Docker; se non raggiungibili → script `@playwright/test` throwaway in /tmp, cancellati prima del commit).

## Contesto (puntatori — ricognizione 2026-07-25)

- Istruzioni operative: Settings `club-card.tsx:34,56-57,100` (editor IT/EN → `POST /api/v1/settings/ppr-operating-instructions`), `settings/page.tsx:132,176` (fetch+pass). Duplicato da rimuovere: `ppr-console.tsx:328-360` (`PprOperatingInstructionsEditor`, prop `instructionsEditor` render :310), `ppr-queue.tsx:377-393` (gemello — VERIFICARE quale è vivo), `ppr/page.tsx` (fornisce `instructionsEditor`). Uso da preservare: email approvazione `ppr.service.ts:547`.
- Voli in transito: `movements-table.tsx` (`contactLine` :100 + render `.student-sub mono` :239; filtri `<input type="date">` :185/:189; `ExportMenu` :197 `pdfLabel=""`); `movements/page.tsx:143` (`exportHref` = `/api/v1/ppr-requests?...xlsx`).
- Export: `exports.service.ts:313` (`exportPprRequestsXlsx` — SOLO xlsx); route `/api/v1/ppr-requests/route.ts:44` (`?format=xlsx`). PDF pattern: story 10.2 `exportAccountStatementPdf` + `pdfResponse` (`src/server/adapters/pdf/response.ts`). `CalendarPopover` firma in `calendar-popover.tsx:32`.
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install, NON toccare package.json). Se il nuovo PDF export introduce una route/OpenAPI, registrarla in `registry.ts` (il test registry lo impone). Commit: `feat(13.6): PPR/movimenti — rimozione editor istruzioni duplicato, telefono, CalendarPopover, export PDF` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- La pagina pubblica `/ppr` NON deve iniziare a mostrare le istruzioni (comportamento deliberato, invariato — piano Epic 12).
- Ritiro stack legacy (13.11) e ogni altra pagina della punch-list.
- Qualunque cambiamento alla semantica PPR/movimenti oltre gli item elencati.

## Dev Agent Record

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
