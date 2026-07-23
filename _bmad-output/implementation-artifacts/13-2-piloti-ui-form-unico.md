---
baseline_commit: 30ebc87
---

# Story 13.2: Piloti UI — form unico di creazione, editor scadenze inline, tabella

Status: ready-for-dev

## Story

As a admin/staff dell'aviosuperficie,
I want creare un pilota/allievo/istruttore con UN SOLO form (anagrafica + profili + ratings/visita medica con date + accesso) e gestire le scadenze direttamente dall'editor della persona,
so that non serva più il doppio passaggio creazione→modifica né il salto alla pagina Scadenze per ogni aggiornamento.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 2); **contratto API composite della 13.1** = `createPersonSchema` in `src/lib/schemas/people.ts` (blocchi opzionali `profiles`/`expiries`/`access`; `expiries` = `{expiryTypeId, expiresAt}` con `expiresAt` obbligatoria; `access` richiede `users.manage`) + Dev Agent Record e Fix post-review nello story file 13-1.

**Ratifiche PO vive**: R1 sospesi visibili con badge (già comportamento attuale); R2 ratings a **chip cliccabili**; R-13.1-c data di scadenza **obbligatoria** per ogni chip selezionato; **R5 il termine è "Ratings" in ENTRAMBE le lingue** (ogni stringa nuova segue la convenzione post-`ada175c`); **R6 `issuedAt` NON esiste** (né nel DB né nei form: si chiede SOLO la scadenza).

## Acceptance Criteria

1. **(Form unico)** "Aggiungi pilota" apre UN SlideOver con: anagrafica (campi attuali), attivazione profili pilot/student/instructor (coi rispettivi campi, come le sezioni esistenti dell'editor), sezione **Ratings a CHIP** dal catalogo `kind=RATING` (ambito coerente coi profili selezionati) + **Visita medica** (select dei tipi `kind=MEDICAL` + data scadenza), data di scadenza OBBLIGATORIA per ogni selezione (validazione client coerente col 422 server), sezione Accesso (email + ruoli) visibile SOLO a chi ha `users.manage`. Submit = UNA chiamata a `POST /api/v1/people` col payload composite — errore → nessuna creazione parziale visibile all'utente.
2. **(Editor scadenze inline)** Nella modifica persona, la sezione ratings (`RatingsSection` di `pilot-editor.tsx`, ex read-only) diventa EDITABILE: aggiungi (chip + data), modifica data, rimuovi — via le API expiries esistenti (`/api/v1/people/{id}/expiries` + registro expiries; verificare le route reali in ricognizione). Il link "Gestisci in Scadenze" sparisce. Visita medica gestita nella stessa sezione (tipi MEDICAL).
3. **(Toggle archiviati)** Il checkbox "mostra archiviati" (`pilots-console.tsx:236-239`) diventa un bottone toggle on/off in stile AirOps (stato attivo evidente, pattern `.btn`/segmented già in uso), stessa query param `?includeArchived` (la catena server funziona già — `people.service.ts:194`).
4. **(Sospesi)** Verifica del badge "Sospeso" in tabella (R1 = comportamento attuale via `User.isActive`): nessun rework atteso oltre l'eventuale chiarezza visiva.
5. **(Istruttori — gap N6 della 13.1)** Le pagine istruttori tornano a mostrare le abilitazioni: `instructor-editor.tsx` (e/o `instructor-profile.tsx`, `instructors-console.tsx`) espongono i ratings dell'istruttore (righe `Expiry` su tipi ambito ISTRUTTORI) con la stessa UI a chip+data dell'AC2 — selezione dal catalogo, mai testo libero. Inventario dei punti esatti dal Dev Agent Record 13.1 (sweep consumer).
6. **(e2e + skill UI)** e2e: flusso one-step completo via UI (crea con profilo+rating+medical+accesso → riga in tabella, invito in Mailpit) + editor inline (aggiungi/rimuovi scadenza). e2e esistenti dei piloti aggiornate se toccano il vecchio flusso a due step. Selettori scoped/exact (regole progetto), MAI hasText con date/H:MM. Skill obbligatorie: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza visiva AirOps (`src/styles/airops.css`, primitive `src/components/ui/`). Verifica interattiva: provare PRIMA i tool `mcp__playwright__*` (da 2026-07-23 il server MCP gira via Docker sull'immagine ufficiale); se non disponibili nella sessione subagent, fallback sanzionato = script `@playwright/test` throwaway in /tmp, cancellati prima del commit.

## Contesto (puntatori — ricognizione 2026-07-22 + 13.1)

- Form/editor: `pilot-editor.tsx` (mode new, IdentitySection, ProfilesSection, RatingsSection ex-CertificationsSection, AccessSection). La 13.1 ha GIÀ il backend one-step: questa story è SOLO UI+e2e (nessuna migrazione, nessun service nuovo — eventuali gap API per l'editor inline vanno segnalati, non improvvisati).
- Tabella/console: `pilots-console.tsx` (checkbox archiviati, badge sospeso, click nome → slide-over profilo: NON toccarlo, il repoint a people/{id} è della 13.3).
- Catalogo: `GET /api/v1/expiry-types?kind=RATING|MEDICAL` (filtro dalla 13.1); card Impostazioni come riferimento di pattern chip/CRUD.
- i18n: IT/EN speculari nello stesso commit; termine "Ratings" ovunque (R5).
- **Ambiente**: identico alla 13.1 (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install). Commit: `feat(13.2): one-step create form + inline expiries editor` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Click sul nome → `people/{id}` e rimozione dello slide-over profilo (13.3).
- Refactor pagine `people/{id}`/account (13.3); qualunque cambiamento backend/schema (13.1 chiusa).
- Ogni altra pagina della punch-list (13.4+).

## Dev Agent Record

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
