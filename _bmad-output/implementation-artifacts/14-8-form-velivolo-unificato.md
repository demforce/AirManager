---
baseline_commit: 9097d18
---

# Story 14.8: Form velivolo unificato — la creazione espone tutto ciò che espone la modifica

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a admin che aggiunge un velivolo alla flotta,
I want inserire in UN colpo solo tutte le informazioni (identità, tariffe orarie, contaore iniziale),
so that non devo creare l'aereo "a metà" e riaprirlo subito in modifica per completarlo.

**Riferimenti vincolanti**: piano epic 14 (item 8): "il form di creazione non espone tutte le voci del form di modifica (es. il costo). vorrei che i form fossero identici". Story UI: `design-taste-frontend` + `ui-ux-pro-max`, AirOps.

## Acceptance Criteria

1. **(Creazione completa)** Lo SlideOver "Nuovo velivolo" (`fleet/aircraft-editor.tsx` — oggi `mode='new'` rende SOLO `IdentitySection`, `:231`) espone anche: **tariffe orarie** per tipo volo (la stessa griglia di `RatesSection`, valori effettivi dalla creazione) e **contaore iniziale** (`HourMeterSection`-equivalente). La sezione Archivio resta solo in edit (ovvio); Disponibilità: valutare — un velivolo nuovo nasce disponibile, la sezione ha senso in creazione solo se costa zero (decisione del dev, motivata).
2. **(Un solo submit)** L'inserimento è UN submit composito (pattern della creazione pilota composita, story 13.1: person+profilo+rating+medical+access in un colpo): se la parte tariffe/contaore fallisce DOPO la creazione dell'identità, l'utente lo vede chiaramente (niente stato "creato a metà" silenzioso — rollback transazionale lato server se il backend lo consente con costo ragionevole, altrimenti sequenza client con errore esplicito sul passo fallito e slide-over che resta aperto in modalità edit del velivolo appena creato).
3. **(Parità dei form)** A parità di sezione, i campi di creazione e modifica sono IDENTICI (label, unità, validazioni per-campo della 14.2 incluse). Nessun campo esiste solo in uno dei due (eccetto Archivio).
4. **(Test)** Unit sul percorso composito (inclusi i fallimenti parziali); e2e: creazione con tariffe+contaore in un colpo → la card flotta e la pagina mostrano i valori senza passaggi di modifica; full suite CI=1 verde.

## Contesto (puntatori — ricognizione 2026-07-28)

- Editor: `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` (`EditorTarget { mode: 'new' | 'edit' }` `:131`; branch new → solo IdentitySection `:231`; edit → Availability `:245`, Rates `:249`, HourMeter `:262`, Archive `:266`). Schemi: `createAircraftSchema`, `createHourMeterAdjustmentSchema` (`:29-30`), tariffe in `aircraft-rates` (epic 4 — records per tipo volo con validità temporale).
- Pattern submit composito: creazione pilota (story 13.1, `pilots/pilot-editor.tsx` NewPersonForm — person+profili+rating+medical+access).
- La 14.2 ha appena portato la validazione per-campo su questo editor: le sezioni nuove in creazione DEVONO nascere già col pattern (`Field error`, `aria-invalid`).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`. Commit su `dev`: `feat(14.8): form velivolo unificato — creazione con tariffe e contaore` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Cambiamenti al modello tariffe (validità temporale, tipi volo): si riusa quello che c'è.
- La pagina flotta e le sue card: invariati oltre a ciò che serve per mostrare i valori inseriti.

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
