---
date: 2026-07-10
status: ratificato — domande aperte risolte dall'utente (v. sezione in fondo); implementazione = Epic 11 in epics.md
source: feedback utente post-MVP (branch claude/flight-log-schema-design-9tmjqn)
inputDocuments:
  - prisma/schema.prisma (model Flight)
  - _bmad-output/planning-artifacts/epics.md (FR-14..17)
  - docs/handoffs/HANDOFF.md (MVP completo, epics 1–10 done)
---

# Change Request — Registro voli (schema + accesso)

## Contesto

Il piano MVP è completo (epics 1–10 merged). L'utente, prima ancora di vedere la UI,
ha fissato decisioni vincolanti sul registro voli e chiesto suggerimenti. Questo
documento cattura le decisioni, la gap analysis contro lo stato attuale e la
proposta di design. NESSUNA implementazione è partita: le domande aperte in fondo
vanno risolte dall'utente prima di creare epic/stories.

## Decisioni dell'utente (vincolanti)

1. Le date devono essere in **formato italiano** (DD/MM/YYYY).
2. Ogni volo deve avere ALMENO: aeroporto di partenza, aeroporto di arrivo,
   orario di decollo, orario di atterraggio, durata hh:mm, numero di decolli,
   numero di atterraggi, nome del PIC, nome dell'istruttore (solo voli scuola).
3. Deve essere facile accedere alla **lista voli di un pilota**.
4. Deve essere facile accedere alla **lista transazioni di un pilota**.

## Gap analysis (stato al 2026-07-10)

| Requisito | Stato attuale | Gap |
|---|---|---|
| Date in formato italiano | Helper `formatDateOnly`/`formatDateTime` (`src/lib/time.ts`) già DD/MM/YYYY, ma il registro voli (`flights-manager.tsx:578`) e l'estratto conto (`account-statement-table.tsx:153`) mostrano la stringa ISO raw (`YYYY-MM-DD`) | Retrofit del rendering sulle superfici che mostrano ISO raw (voli, estratto conto, expiries — audit completo da fare) |
| Aeroporto di partenza | Assente | Campo nuovo |
| Aeroporto di arrivo | Assente | Campo nuovo |
| Orario di decollo | Solo `flightDate` (`@db.Date`, senza orari) | Campo nuovo |
| Orario di atterraggio | Assente | Campo nuovo |
| Durata hh:mm | `minutes Int` (AD-2), reso `H:MM` via `formatMinutes` | OK — da definire la relazione con i nuovi orari (v. domanda 1) |
| Numero di decolli | Assente | Campo nuovo |
| Numero di atterraggi | `landings Int?` opzionale | Renderlo obbligatorio (default 1), backfill dei NULL storici |
| Nome PIC | DERIVATO, non memorizzato (commento schema, story 9.4): volo scuola solo → allievo, dual → istruttore; volo non scuola → `person` | Esporre una colonna PIC calcolata su registro/dettagli/export (la derivazione era già il piano per il futuro logbook/QTB) |
| Nome istruttore (solo scuola) | `instructorProfileId` ✓ (422 se istruttore su volo non-scuola) | Nessuno |
| Accesso facile ai voli di un pilota | `/dashboard/flights?personId=X` esiste (filtro staff, story 5.4); pilota/allievo vede già SOLO i propri | Manca il link diretto dalla scheda persona (`people/[id]`) al registro pre-filtrato |
| Accesso facile alle transazioni di un pilota | `people/[id]/account` con estratto conto completo ✓; `AccountPanel` con "vedi estratto" sulla scheda persona; il pilota ha la propria vista finanze | Sostanzialmente coperto — eventuale miglioria di visibilità del link |

## Proposta di schema (bozza, da confermare)

```prisma
model Flight {
  // ... campi esistenti invariati ...

  /// Aeroporto/aviosuperficie di partenza e arrivo — testo libero
  /// (codice ICAO O nome: molte aviosuperfici italiane non hanno ICAO),
  /// precompilato nel form col nome base (AppSetting `airfield.name`).
  /// Nullable in DB: la storia pre-migrazione non li ha; obbligatori
  /// nell'API per i voli nuovi.
  departureAirfield String?
  arrivalAirfield   String?

  /// Orari di decollo/atterraggio come istanti pieni (timestamptz, AD-8,
  /// stesso pattern di Booking.startsAt/endsAt) — NON time-of-day su
  /// flightDate: un atterraggio dopo mezzanotte non si rappresenta
  /// altrimenti. `flightDate` resta (= giorno di decollo in Europe/Rome)
  /// per compatibilità con filtri/export esistenti.
  takeoffAt DateTime?
  landingAt DateTime?

  takeoffs Int @default(1)
  landings Int @default(1)  // da opzionale a obbligatorio, backfill NULL→1
}
```

Migrazione: colonne nuove nullable (storia intatta), `landings` backfill `NULL→1`
poi `NOT NULL DEFAULT 1`. Il PIC resta derivato (nessuna colonna).

## Proposta UX / accesso

- **Scheda persona (`people/[id]`)**: aggiungere pannello/link "Voli" →
  `/dashboard/flights?personId=<id>` (il filtro esiste già — manca solo il link).
  L'estratto conto è già a un click (`AccountPanel` → "vedi estratto").
- **Registro voli**: nuove colonne partenza/arrivo/orari/decolli/atterraggi/PIC;
  date in DD/MM/YYYY.
- **Retrofit date italiane**: audit di tutte le superfici che rendono date-only
  ISO raw e passaggio a `formatDateOnly` (nota TD-1 in `time.ts` già segnalava
  `ExpiriesPanel`/`AccountStatementTable`).
- Export Excel/PDF (epic 10) da estendere con le colonne nuove.

## Suggerimenti (da validare con l'utente)

1. **Libretto voli pilota + QTB velivolo in PDF**: il set di campi richiesto È il
   formato logbook/QTB — con l'infrastruttura PDF dell'epic 10 sono due export
   naturali (per pilota e per velivolo, con totali di periodo).
2. **Precompilazione aeroporti** col nome base da settings (`airfield.name`):
   la quasi totalità dei voli parte e torna alla base — form a costo zero.
3. **Decolli/atterraggi default 1**, editabili per i touch-and-go.
4. **Durata auto-calcolata** da atterraggio−decollo nel form, con possibilità di
   rettifica staff (v. domanda 1 — la fatturazione oggi usa `minutes`).

## Domande aperte — RISOLTE dall'utente (2026-07-10)

1. **Durata vs orari**: la durata è SEMPRE atterraggio−decollo → **`minutes`
   diventa DERIVATO** dagli orari (auto-calcolato); resta la colonna snapshot
   che guida la fatturazione, ma non è più un input.
2. **Aeroporti**: testo libero (proposta accettata implicitamente — nessuna
   lista/ICAO richiesta).
3. **Obbligatorietà**: **sì** — orari e aeroporti obbligatori per i voli nuovi;
   la storia pre-migrazione resta senza.
4. **PIC**: la derivazione attuale copre tutti i casi ("the pilot is either the
   pilot/student/instructor") → **nessuna colonna PIC**, solo esposizione
   calcolata.

## Esito

Il change request diventa l'**Epic 11 — Registro voli logbook** (3 stories) in
`epics.md`; branch `claude/flight-log-schema-design-9tmjqn`. Il suggerimento 1
(libretto voli pilota / QTB velivolo in PDF) resta FUORI dall'epic: candidato
follow-up, non richiesto esplicitamente dall'utente.
