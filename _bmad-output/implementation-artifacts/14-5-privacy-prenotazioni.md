---
baseline_commit: 0ff9186
---

# Story 14.5: Privacy prenotazioni — piloti e allievi vedono "Occupato", non i nomi degli altri

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a pilota o allievo che consulta la pianificazione,
I want vedere che un velivolo è occupato in uno slot senza sapere CHI l'ha prenotato,
so that la disponibilità resta consultabile ma le prenotazioni altrui restano private.

**Riferimenti vincolanti**: piano epic 14 (item 9+14), **ratifica R3**: admin E istruttori vedono i nomi; piloti e allievi vedono solo "Occupato" (velivolo + orario, nessun nome) — le PROPRIE prenotazioni restano ovviamente complete.

## Acceptance Criteria

1. **(Masking SERVER-SIDE)** Il mascheramento avviene nel DTO, mai solo in CSS/client: per un actor senza il nuovo permesso (AC2), `listBookings` (e ogni lettura derivata) sostituisce `personName`/`instructorName` con `null` (+ flag/shape che il client rende come "Occupato") su OGNI prenotazione NON propria (propria = `personId` dell'actor, o prenotazione fatta da lui). I nomi non devono MAI raggiungere il wire per chi non ha il permesso (verifica sulla risposta API grezza, non sul render).
2. **(Permesso dedicato)** Nuovo permesso RBAC (es. `bookings.read.names`) concesso a ADMIN, STAFF e INSTRUCTOR (`src/server/auth/rbac.ts:97` — oggi INSTRUCTOR ha solo `self.read`+`bookings.manage.own`); PILOT e STUDENT no. La logica usa il permesso, MAI il ruolo diretto (pattern RBAC esistente). NOTA: STAFF sparirà con la 14.9 — qui va comunque incluso per coerenza fino ad allora.
3. **(Tutti i consumer — "il gemello va misurato")** Il masking copre OGNI superficie che mostra prenotazioni: tabella bookings (`bookings-table.tsx`), pianificazione/schedule (`schedule.tsx` — usato sia da `/dashboard/bookings` sia dall'Overview di `/dashboard`), **PDF export** (`/api/v1/bookings/pdf` — un pilota che esporta ottiene "Occupato", non i nomi), API `GET /api/v1/bookings`, export Excel se esiste. Enumerazione dei consumer nel Dev Agent Record.
4. **(UI "Occupato")** Le prenotazioni mascherate mostrano una label i18n "Occupato"/"Booked" (velivolo e orario restano visibili; nessun altro dato personale: niente note/tipo se rivelano l'identità — valutare e motivare). Coerenza AirOps; nessuna differenza di layout che riveli indirettamente il contenuto.
5. **(Invarianti)** Admin/staff/istruttore: NESSUN cambiamento visibile. Le proprie prenotazioni: complete per tutti. I flussi di creazione/spostamento/cancellazione: INVARIATI (il pilota continua a gestire le proprie).
6. **(Test)** Unit sul masking nel servizio (proprio vs altrui, per ruolo/permesso). e2e: pilota vede "Occupato" sulle prenotazioni altrui e i SUOI dati sulle proprie (tabella E schedule), allievo idem, istruttore vede i nomi, PDF del pilota senza nomi altrui (assert sul contenuto del PDF o della risposta). Full suite CI=1 verde; e2e esistenti che asseriscono nomi da ruoli pilota/allievo aggiornati ai valori corretti (mai indeboliti).

## Contesto (puntatori — ricognizione 2026-07-28)

- DTO: `src/lib/schemas/bookings.ts:124-142` (`personName`/`instructorName` denormalizzati a read time). Servizio: `src/server/services/bookings.service.ts#listBookings`.
- Consumer enumerati (grep `listBookings|BookingListItem`): `bookings/page.tsx`, `dashboard/page.tsx` (Overview embedded), `api/v1/bookings/route.ts`, `api/v1/bookings/pdf/route.ts`, `exports.service.ts` (+ test).
- RBAC: `src/server/auth/rbac.ts` (`PERMISSIONS_BY_ROLE` — INSTRUCTOR `:97`); pattern permesso-non-ruolo in tutto il codice.
- Rendering: `bookings-table.tsx` (colonna pilota), `schedule.tsx` (blocchi calendario con nome).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`. Story con superficie UI → skill `design-taste-frontend` + `ui-ux-pro-max`. Commit su `dev`: `feat(14.5): privacy prenotazioni — masking server-side dei nomi per piloti e allievi` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- PPR/movimenti (nomi dei richiedenti transiti): non citati dal feedback, restano com'è.
- Rimozione STAFF (story 14.9).
- Notifiche/email di prenotazione: invariati.

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
