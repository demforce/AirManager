---
baseline_commit: 44c8fda
---

# Story 14.2: Validazione form per-campo — bordo rosso e messaggio sul campo, non in fondo

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a utente che compila un form,
I want vedere A COLPO D'OCCHIO quale campo manca o è invalido (bordo rosso + messaggio accanto al campo),
so that non devo indovinare da una stringa generica in fondo al form quale campo sistemare.

**Riferimenti vincolanti**: piano epic 14 (item 5). Story UI: `design-taste-frontend` + `ui-ux-pro-max`, AirOps.

## Acceptance Criteria

1. **(Primitiva Field con stato errore)** `src/components/ui/field.tsx` supporta `error?: string`: il controllo prende bordo/anello rosso (token `--bad`, classe dedicata in `airops.css` + `aria-invalid="true"`) e il messaggio appare INLINE sotto il campo. Contrasto MISURATO in chiaro E scuro (lezione 13.9, ≥ 4.5:1 sul testo, ≥ 3:1 sul bordo).
2. **(Required al submit)** Al submit con campi obbligatori vuoti: OGNI campo mancante viene marcato col suo errore ("Campo obbligatorio."), il focus va al PRIMO campo invalido, e la stringa globale in fondo sparisce o resta solo come riepilogo. L'errore del singolo campo si pulisce quando l'utente lo corregge.
3. **(422 server mappati sui campi)** Le risposte 422 dell'API portano `details.fieldErrors` (Zod): dove la chiave corrisponde a un campo del form, l'errore va SUL campo; ciò che non è mappabile resta nel messaggio globale. Nessun cambiamento alle regole di validazione (solo presentazione).
4. **(Sweep completo)** Il pattern si applica a TUTTI i form dell'app — enumerazione OBBLIGATORIA nel Dev Agent Record (lezione "il gemello va misurato"): SlideOver editor (pilot-editor, flight-editor, transaction-editor, editor velivolo, prenotazioni, completamento PPR, expiries...), card Impostazioni (club, scheduling, smtp, treasury, ratings/medical), form pubblico PPR, login/set-password. Le chiavi i18n "requiredField"/"required" generiche restano (riusate per-campo), quelle diventate orfane rimosse.
5. **(Test)** e2e: per un form rappresentativo per gruppo (uno SlideOver, una card Impostazioni, il form pubblico PPR) assert su `aria-invalid` + messaggio inline sul campo giusto (mai solo la stringa globale). Full suite CI=1 verde; e2e esistenti che asserivano la stringa globale aggiornati ai valori corretti (mai indeboliti).

## Contesto (puntatori — ricognizione 2026-07-28)

- Primitiva: `src/components/ui/field.tsx` (Field/Input/Select/InputGroup — oggi NESSUNO stato errore); CSS: `src/styles/airops.css` (`.fld`, `.input`).
- Pattern attuale: stringa generica ("Campo obbligatorio.", `messages/it.json:233,269,333,416,469...`) mostrata come feedback globale in fondo al form.
- Formato 422 API: envelope `error.details.formErrors/fieldErrors` (Zod flatten — v. `b31a07d` per un esempio reale di `fieldErrors.contactEmail`).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`. Commit su `dev`: `feat(14.2): validazione form per-campo — bordo rosso e messaggio sul campo` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Nuove regole di validazione o cambi di schema (solo presentazione degli errori esistenti).
- Il toast d'errore generico della club card multi-endpoint (5 PUT, un messaggio — nota della sessione 2026-07-28: eventualmente diventa parlante qui SE il costo è marginale, altrimenti resta com'è).

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
