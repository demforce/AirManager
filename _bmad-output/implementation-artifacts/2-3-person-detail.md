# Story 2.3: Scheda dettaglio persona

Status: ready-for-dev

## Story

As a staff,
I want una scheda persona con tutto il quadro,
so that trovi profili, contatti e storico in un colpo d'occhio (FR-6).

## Acceptance Criteria

1. **Given** una persona con profili attivi, **When** apro la sua scheda, **Then** vedo sezioni per: dati anagrafici, profili, e segnaposto pronti per scadenze/saldo/pacchetti/voli/prenotazioni che si popoleranno negli epic successivi senza cambiare struttura.
2. **And** un pilota autenticato vede la propria scheda in sola lettura; 403 su schede altrui.

## Tasks / Subtasks

- [ ] Task 1: Accesso "own" nel service (AC: 2)
  - [ ] `getPerson` (people.service.ts): consentire la lettura anche a un actor **senza** `people.read` ma con `self.read` e `actor.personId === personId` richiesto — è esattamente lo scoping "own" documentato nel module doc di `rbac.ts` (il check `personId` vive nel service, MAI in `authorize()`); ogni altro caso resta `ForbiddenError` (403 envelope AD-8). NON toccare `listPeople` né le scritture: restano `people.read`/`people.manage` puri
  - [ ] Nessuna migrazione: la story non aggiunge modelli
- [ ] Task 2: Pagina scheda (AC: 1, 2)
  - [ ] `/{locale}/dashboard/people/[id]`: server page (pattern `people/page.tsx`: sessione → redirect se non autorizzato, poi il service ri-autorizza comunque — AD-5 defense in depth; chi può aprirla: `people.read` oppure own con `self.read`)
  - [ ] Sezioni: **Dati anagrafici** (nome, email, telefono, indirizzo, CF, badge archiviata), **Profili** (riusare `profiles-panel.tsx` — con `people.manage` interattivo, altrimenti sola lettura: vedi Task 3), e segnaposto strutturali per **Scadenze**, **Saldo conto**, **Pacchetti ore**, **Ultimi voli**, **Prossime prenotazioni** — card vuote con titolo tradotto e testo "disponibile prossimamente"-style, pensate perché gli epic 3-7 le riempiano senza ristrutturare la pagina
  - [ ] Collegamenti: nell'elenco persone il nome diventa link alla scheda; per gli utenti self-service (`self.read` con `personId`, senza `people.read`) aggiungere accesso alla PROPRIA scheda (voce nav o card in dashboard — scegliere il punto più coerente con `nav-items.ts` esistente e documentare)
  - [ ] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche
- [ ] Task 3: Profili in sola lettura (AC: 2)
  - [ ] `profiles-panel.tsx` accetta una modalità read-only (prop, derivata server-side da `hasPermission(actor,'people.manage')`): niente form/bottoni attiva/disattiva, solo i dati — la UI nasconde, il service resta il guardiano (AD-5: le mutazioni profili sono già `people.manage`)
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit service `getPerson`: staff → qualunque persona; pilota con `personId` proprio → ok; pilota su persona altrui → `ForbiddenError`; pilota con `personId: null` → `ForbiddenError`; actor senza `self.read` né `people.read` → `ForbiddenError`
  - [ ] e2e: staff apre la scheda dall'elenco → vede anagrafica + profili + i 5 segnaposto; pilota (seed `pilot@airmanager.local`) apre la propria scheda → dati visibili, NESSUN controllo di modifica profili; pilota su scheda altrui → 403/redirect; `GET /api/v1/people/{own id}` da pilota → 200, su id altrui → 403 envelope

## Dev Notes

- **Pattern consolidati**: server page + client manager come `people/page.tsx`/`people-manager.tsx`; `profiles-panel.tsx` esiste già (2.2) e va riusato, non duplicato; `getSessionActor()` per l'actor; `hasPermission()` per decidere cosa rendere (mai unico guardiano).
- **`self.read` esiste già** (1.3) per PILOT/STUDENT/INSTRUCTOR/STAFF/ADMIN — NON aggiungere permessi nuovi; il seed `pilot@airmanager.local` ha già Person collegata e PilotProfile attivo (2.2), perfetto per gli e2e.
- **`GET /api/v1/people/[id]`** già ritorna `PersonDetail` con i profili (2.2): l'unica modifica API è la regola di autorizzazione own in `getPerson`; aggiornare la descrizione del path nel registry OpenAPI se cita solo `people.read`.
- La scheda è READ-heavy: nessuna nuova mutazione in questa story. Le azioni di modifica anagrafica restano nell'elenco (2.1); non duplicarle nella scheda.
- I segnaposto NON sono feature flag: sono sezioni statiche tradotte (IT/EN) con struttura (heading + card) stabile — gli epic successivi sostituiranno il contenuto, non il layout (AC 1).
- Persona inesistente → `NotFoundError` → 404 (pagina: `notFound()` di Next).
- Nessuna dipendenza npm nuova prevista; se servisse, `npm view` prima del pin.
- Ambiente: PostgreSQL su, Mailpit su 1025/8025 (riavviare se container nuovo: `service postgresql start`; `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &`); MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto su data-table.tsx), typecheck, Vitest (175+ attesi), `next build`, e2e Playwright (36+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8]
- [Source: src/server/auth/rbac.ts] — module doc sullo scoping own (self.read + actor.personId nel service)
- [Source: _bmad-output/implementation-artifacts/2-2-person-profiles.md#Dev Agent Record] — profiles-panel, PersonDetail, pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
