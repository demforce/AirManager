---
baseline_commit: 3587c77
---

# Story 14.7: Istruttore — toggle "per me / per un allievo" e pagina "I miei compensi"

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a istruttore,
I want scegliere "per me" o "per un allievo" con UN comando on/off invece di due radio, e avere una pagina dove vedo i miei compensi e QUANDO sono stato pagato,
so that prenoto più in fretta e ho sotto controllo la mia posizione economica senza chiedere all'amministrazione.

**Riferimenti vincolanti**: piano epic 14 (item 11, 12).

## Acceptance Criteria

1. **(Toggle on/off)** Nel form "Nuova prenotazione" (`bookings/new-booking-form.tsx:419-427`) la coppia di radio "Prenoto per me" / "Prenoto per un allievo" diventa UN solo controllo binario nel linguaggio AirOps (primitiva `Segmented` esistente in `src/components/ui/segmented.tsx`, già usata altrove — es. `BasedSegmented` di aircraft-editor; oppure un vero toggle se più coerente col design: scelta del dev, motivata e coerente con l'app). Semantica INVARIATA: `bookingTarget` self/student, il campo allievo compare solo su "per un allievo" con la sua validazione per-campo (14.2). Accessibilità: il controllo resta raggiungibile da tastiera e con nome accessibile corretto (niente regressioni sugli e2e che lo guidano).
2. **(Pagina "I miei compensi")** Nuova voce sidebar in `route-registry.ts` visibile al solo ruolo INSTRUCTOR (label i18n IT/EN, es. "I miei compensi"/"My payouts"), pagina con: **maturato** (ore/importo del periodo corrente, dalla stessa fonte della card istruttori staff-facing), **storico dei pagamenti ricevuti** in tabella (data, periodo coperto, metodo, importo) e saldo residuo dovuto se il dominio lo espone già. Prospettiva ISTRUTTORE (mai club-centrica).
3. **(Percorso di lettura SELF — lezione 14.6)** Il servizio che alimenta la pagina risolve SEMPRE il profilo istruttore dell'ACTOR (`getOwnInstructorProfileId`): nessun parametro id dal client, IDOR impossibile per costruzione. Gate `self.read`. Gli endpoint staff-facing (`getCompensationSummary`, `recordPayout`) restano INVARIATI nei loro gate `finance.manage`.
4. **(Profilo attivo — coerenza 14.6)** La voce sidebar e la pagina seguono il PROFILO ISTRUTTORE ATTIVO, non il ruolo (`getOwnInstructorProfileId !== null`): un istruttore con profilo disattivato non deve vedere una pagina che poi non ha dati né senso.
5. **(Invarianti)** La card "Compensi istruttori" staff-facing e il flusso di pagamento (`recordPayout` + gemello di cassa Billing-1) INVARIATI. Nessun cambiamento ai calcoli di compenso.
6. **(Test)** Unit sul servizio self (actor→proprio profilo; profilo disattivato → vuoto/negato; nessun id accettato). e2e: istruttore vede i SUOI compensi da fixture reale (payout registrato dall'admin → compare nello storico con data/metodo/importo), un pilota NON vede la voce né la pagina, IDOR-probe; il toggle prenotazione funziona (per me / per un allievo) e gli e2e esistenti che guidavano le radio sono aggiornati ai nuovi selettori (mai indeboliti). Full suite CI=1 verde.

## Contesto (puntatori — ricognizione 2026-07-29)

- Toggle: `src/app/[locale]/dashboard/bookings/new-booking-form.tsx:419-427` (fieldset + 2 radio `booking-target`); stato `bookingTarget`, validazione `studentId` a `:151`; primitiva `Segmented` in `src/components/ui/segmented.tsx`.
- Compensi: `src/server/services/instructor-compensation.service.ts` — `getCompensationSummary` (`:207`, staff, `finance.manage`), `recordPayout` (`:354`, crea il gemello di cassa — Billing-1 AC4), `InstructorPayoutDto` (`:54`). Card staff-facing: pagina `/dashboard/instructors`.
- Sidebar: `route-registry.ts` (la voce `instructors` è STAFF_ROLES — quella nuova è per il solo INSTRUCTOR, come `my-account` è per PILOT/STUDENT).
- Pattern self-service di riferimento: story 14.6 (`getOwnAccountOverview`/`listOwnAccountMovements` senza parametro personId + pagina `/dashboard/my-account`).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`; in questa sandbox `scripts/reset-db.sh` NON funziona (sequenza docker compose). Story UI → `design-taste-frontend` + `ui-ux-pro-max`. e2e: spec singoli a `--workers=1`, mai assumere pagina 1 su DB sporco, gate vero = full suite CI=1 prod. Commit su `dev`: `feat(14.7): istruttore — toggle prenotazione e pagina compensi` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Modifiche al calcolo dei compensi o al flusso di pagamento (solo lettura self + presentazione).
- Export dei compensi (includerlo solo se banale col riuso esistente — decisione del dev, motivata).
- Rimozione STAFF (story 14.9).

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
