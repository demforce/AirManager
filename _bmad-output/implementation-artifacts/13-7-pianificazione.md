---
baseline_commit: 94211e7
---

# Story 13.7: Pianificazione — popover filtri (z-index/overflow) + export PDF prenotazioni

Status: ready-for-dev

## Story

As a staff dell'aviosuperficie,
I want che il popover dei filtri della Pianificazione non finisca "dentro" la tabella sottostante e che la tabella prenotazioni abbia l'export PDF,
so that la pagina sia usabile e completa come il resto dell'app.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 7).

**Ratifica PO (AskUserQuestion 2026-07-25)**: "sort by date" del feedback → **l'ordinamento crescente attuale (prossima prenotazione in cima) va già bene** — NESSUNA modifica di sort (né controllo cliccabile né default decrescente). Questa story fa SOLO il fix del popover filtri + l'export PDF.

## Acceptance Criteria

1. **(Popover filtri — clipping)** Il popover "Filtri" della Pianificazione (`schedule.tsx:283`, `<div className="popover">`, scrim :282) finisce visivamente "dentro"/dietro la tabella sottostante. CAUSA (ricognizione): il popover è assoluto dentro una `.card` con `overflow:hidden` (`airops.css:402`) che lo RITAGLIA (non è un problema di z-index puro: 20 > 19 è già corretto). Fix: far uscire il popover dal clip della card (es. il popover non vive dentro la card ritagliata, o la card che lo contiene non ha `overflow:hidden`, o portale/stacking-context adeguato) SENZA rompere il layout della timeline/week grid né il popover calendario (`schedule.tsx:245`, stesso pattern — verificare che resti a posto). Verificare LIVE che il popover filtri si veda per intero sopra la tabella.
2. **(Export PDF prenotazioni)** La tabella prenotazioni (`bookings-table.tsx:310`, `ExportMenu` con `pdfLabel=""` = solo Excel) guadagna il PDF. Serve BACKEND: `bookings` ha solo xlsx (`exportBookingsXlsx` `exports.service.ts:276`, `?format=xlsx` route `bookings/route.ts:19`) → creare `exportBookingsPdf` + route dedicata `GET /api/v1/bookings/pdf` (pattern 13.6/10.2: `pdfResponse` + adapter PDF; STESSI filtri della lista xlsx — status ecc.; riuso `listBookings`), registrata in OpenAPI (`registry.ts` + `registry.test.ts` — il test lo impone). ExportMenu con `pdfLabel` + `pdfHref` (`buildPdfExportHref`). RBAC uguale all'xlsx.
3. **(Sort — nessuna modifica)** L'ordinamento della tabella prenotazioni resta `startsAt` crescente (server, `bookings.service.ts`) — INVARIATO per ratifica. NON aggiungere controlli di sort.
4. **(e2e + skill UI)** e2e: popover filtri visibile per intero (non clippato — assert su visibilità/posizione se fattibile in modo robusto, altrimenti verifica interattiva documentata + assert che il popover apra e i filtri funzionino); export PDF prenotazioni (download reale, `%PDF`, filtri rispettati); export Excel esistente ancora verde. Selettori scoped/exact, MAI hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps. Verifica interattiva: prova PRIMA i tool `mcp__playwright__*` (Docker; se non raggiungibili → script `@playwright/test` throwaway in /tmp, cancellati prima del commit) — il clipping è un bug VISIVO, lo screenshot prima/dopo è la prova migliore.

## Contesto (puntatori — ricognizione 2026-07-25)

- Popover: `schedule.tsx` (calendar popover :245 stesso pattern che FUNZIONA, filter popover :282-283 che si clippa). `.card { overflow:hidden }` `airops.css:402`. `.popover`/`.popover-scrim` z-index 20/19 (già corretti — il problema è l'overflow della card contenitrice).
- Export: `bookings-table.tsx:310` (`ExportMenu` `pdfLabel=""`); `exports.service.ts:276` (`exportBookingsXlsx` — SOLO xlsx); `bookings/route.ts:19` (`?format=xlsx`). PDF pattern di riferimento: `exportPprRequestsPdf` (13.6, `src/app/api/v1/ppr-requests/pdf/route.ts`) e `exportAccountStatementPdf` (10.2). `listBookings` in `bookings.service.ts` (orderBy `startsAt asc`).
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install, NON toccare package.json). Commit: `feat(13.7): pianificazione — fix popover filtri clippato + export PDF prenotazioni` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Qualunque cambiamento all'ordinamento della tabella prenotazioni (ratifica: va bene crescente).
- Ritiro stack legacy (13.11) e ogni altra pagina della punch-list. Dark theme (13.9) e mobile (13.10) — il fix del popover NON deve introdurre regressioni lì, ma la revisione trasversale è quelle story.

## Dev Agent Record

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
