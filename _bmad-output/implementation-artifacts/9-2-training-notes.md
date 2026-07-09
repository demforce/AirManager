---
baseline_commit: 555f683
---

# Story 9.2: Annotazioni di avanzamento (diario di addestramento)

Status: ready-for-dev

## Story

As a istruttore,
I want annotare l'avanzamento dei miei allievi (data, volo collegato opzionale, esercizi svolti, giudizio, prossimi passi),
so that il percorso didattico sia documentato e l'allievo possa consultarlo (FR-33; assumption ratificata PRD §382: annotazioni visibili all'allievo in sola lettura).

## Acceptance Criteria

1. **Given** un istruttore con un allievo ASSEGNATO (9.1), **When** scrive un'annotazione (data addestramento; volo collegato OPZIONALE; esercizi svolti obbligatori; giudizio e prossimi passi opzionali), **Then** l'annotazione è creata con autore = il suo `InstructorProfile` e appare nel diario dell'allievo in ordine cronologico inverso (data addestramento desc, `createdAt` desc a parità); allievo NON assegnato all'istruttore → 403; volo collegato che non sia un volo `SCHOOL` dell'allievo → 422 con code specifico; pilota/allievo/staff senza profilo istruttore → 403/422 coerenti (staff non crea: non è autore).
2. **Given** un allievo loggato, **When** apre il proprio diario, **Then** lo legge in SOLA lettura (nessuna azione di scrittura/modifica offerta, own-access `self.read` + `actor.personId` — pattern 6.4); il diario di un ALTRO allievo → 403. Staff/admin leggono il diario di qualunque allievo (`school.manage.any`); un istruttore assegnato legge il diario COMPLETO del proprio allievo (tutte le annotazioni, anche di altri istruttori: il diario è dell'allievo).
3. **Given** un'annotazione esistente, **When** qualcuno la modifica, **Then** SOLO l'autore o l'ADMIN possono farlo ed ESCLUSIVAMENTE entro 7 giorni da `createdAt`: dopo → 409 `NOTE_IMMUTABLE` per CHIUNQUE (admin incluso); istruttore non-autore e staff → 403 sempre; la UI mostra l'azione di modifica solo quando è permessa; un'annotazione modificata mostra che è stata modificata (updatedAt ≠ createdAt). Nessuna cancellazione: non richiesta dal PRD (immutabilità = niente delete; deferral dichiarato).
4. `GET` del diario paginato con envelope AD-8 (`{items,total,page,pageSize}` via `paginate()` — il diario cresce nel tempo, a differenza delle liste 9.1); endpoint registrati in OpenAPI; migrazione con timestamp DOPO `20260709220221`; unit (matrice accessi, finestra 7 giorni, validazione volo) + e2e (crea/vede allievo read-only/403 altrui/modifica autore/immutabile).

## Contesto e decisioni di design (vincolanti)

- **Schema — nuovo modello `TrainingNote`** (ERD spine :191-192: `InstructorProfile ||--o{`, `StudentProfile ||--o{`): `id` cuid; `studentProfileId` FK → `StudentProfile`; `instructorProfileId` FK → `InstructorProfile` (= AUTORE, immutabile); `noteDate DateTime @db.Date` (data dell'addestramento, distinta da `createdAt`: l'istruttore può annotare a posteriori); `flightId String?` FK → `Flight` (NON-unique: più note possono citare lo stesso volo); `exercises String` (obbligatorio); `assessment String?`; `nextSteps String?`; `createdAt`, `updatedAt`. FK RESTRICT default. Index su `[studentProfileId, noteDate]`. Migrazione `add_training_notes` con timestamp DOPO `20260709220221` (verificare `ls prisma/migrations | tail` prima del commit).
- **Zod** (`src/lib/schemas/school.ts`, si estende quello di 9.1): `exercises z.string().trim().min(1).max(2000)`; `assessment`/`nextSteps` `z.string().trim().max(2000).optional()`; `noteDate` date-only string (pattern date esistente); `flightId` cuid opzionale. Pattern maxLength identico a PPR/aircraft (:500/:2000 esistenti).
- **RBAC**: NESSUN permesso nuovo per creare/leggere (bastano `school.manage.own`, `school.manage.any`, `self.read`). Per l'override di modifica dell'admin: nuovo permesso **`school.notes.manage.any`** aggiunto al type union e ad `ALL_PERMISSIONS` ma a NESSUN ruolo esplicito → lo possiede SOLO l'ADMIN via `ALL_PERMISSIONS` (rbac.ts:79). Così il check resta a permessi (mai `actor.roles` nei service) e lo staff — che ha `school.manage.any` — NON può modificare (AC 3 letterale: "solo l'autore o l'admin"). Documentare nel catalogo con una riga di commento.
- **Service (`school.service.ts`, si estende)**:
  - `listTrainingNotes(actor, studentPersonId, {page,pageSize})` — accesso: `school.manage.any` OPPURE (`school.manage.own` + istruttore ASSEGNATO all'allievo: esiste `StudentInstructorAssignment` per i due profili) OPPURE own-access (`self.read` && `actor.personId === studentPersonId`, pattern esatto `expiries.service.ts:123-127`); altrimenti 403. Risoluzione profilo allievo col `resolveActiveStudentProfile` esistente (:52-64) SOLO per i path di gestione; per l'own-access dell'allievo con profilo disattivato il diario resta leggibile (è storia sua — usare il resolver non-strict `resolveStudentProfileId` per quel ramo). Ordine: `noteDate desc, createdAt desc`; envelope `paginate()` come `listFlights`.
  - `createTrainingNote(actor, studentPersonId, input)` — `authorize(actor,'school.manage.own')` per primo; risolve il PROPRIO `InstructorProfile` attivo (pattern `listOwnStudents` :240-249, 422 `INSTRUCTOR_PROFILE_REQUIRED`); richiede assegnazione esistente istruttore↔allievo → altrimenti `ForbiddenError` (l'allievo non è suo); allievo attivo via `resolveActiveStudentProfile`; se `flightId` presente: il volo DEVE esistere, essere `flightType SCHOOL` e avere `personId === studentPersonId` → altrimenti 422 `FLIGHT_NOT_LINKABLE` (nuovo code, stile 5.1); stato del volo NON vincolato (una nota può citare un volo poi stornato: la nota è cronaca, non contabilità — documentare nel doc-comment).
  - `updateTrainingNote(actor, studentPersonId, noteId, input)` — carica la nota (404 se non esiste o non appartiene all'allievo del path); permesso: autore (`school.manage.own` + proprio profilo === `note.instructorProfileId`) OPPURE `school.notes.manage.any` (= admin); altrimenti 403; finestra: `Date.now() - createdAt > 7 giorni` → `ConflictError('...', 'NOTE_IMMUTABLE')` (409, pattern `PPR_ALREADY_DECIDED`); modificabili SOLO `noteDate`/`flightId`/`exercises`/`assessment`/`nextSteps` (mai autore/allievo); stessa validazione volo del create. Last-write-wins tra edit concorrenti (accettato, documentare). La finestra è confronto tra timestamp UTC esatti — niente logica di timezone (7×24h esatte, documentare).
  - DTO `TrainingNoteItem`: id, noteDate, exercises, assessment, nextSteps, createdAt, updatedAt, author `{personId, firstName, lastName}` (via instructorProfile.person), flight opzionale `{id, flightDate, minutes}` — MAI dati contabili del volo; flag derivato `editableBy` NON nel DTO: la UI decide con i dati che ha (authorPersonId + createdAt + ruolo), il server resta l'enforcement.
- **API** (route sottili, pattern 9.1): `GET/POST /api/v1/people/{id}/training-notes` (GET envelope paginato, POST 201) e `PATCH /api/v1/people/{id}/training-notes/{noteId}` (200). `{id}` = `Person.id` dell'allievo (convenzione). Registrare in registry (tag `School`), aggiornare il test del registry.
- **UI**:
  - **Pagina diario NUOVA `/dashboard/school/[id]`** (id = personId allievo, server component): guard = stesso triplice accesso del service (redirect `/dashboard` se nessuno dei tre); header con nome allievo + inizio corso; lista cronologica delle annotazioni (card/righe: data, autore, esercizi, giudizio, prossimi passi, volo collegato se presente, "modificata" se updatedAt≠createdAt) con paginazione coerente col pattern esistente; per l'ISTRUTTORE ASSEGNATO (e solo per lui): form "Nuova annotazione" (textarea `rows`/`maxLength` pattern ppr-queue :280-291; select del volo opzionale popolata dai voli SCHOOL dell'allievo via API esistente `GET /api/v1/flights?personId=...` — verificare il filtro reale di 5.4) e azione Modifica inline sulle note dove è autore ed entro finestra; per admin: Modifica su tutte entro finestra; per allievo/staff: NESSUNA azione.
  - **Row-link da "I miei allievi"** (`school/page.tsx`): il nome dell'allievo diventa link a `/dashboard/school/{personId}`.
  - **Entry-point allievo**: tile "Il mio diario" nella home dashboard (`dashboard/page.tsx`, pattern ownAccountHref :64 / ownPersonHref :54-55) visibile SOLO se l'actor ha un proprio profilo allievo (verificare come la home risolve `me.person` e i flag profili; se il flag non c'è nel DTO della home, aggiungere il minimo indispensabile) → porta a `/dashboard/school/{ownPersonId}`. La voce NAV "Scuola" resta gated `school.manage.own` (invariata: la pagina indice è dell'istruttore; l'allievo entra dal tile).
  - i18n IT/EN simmetrici; stile minimalist-ui esistente; verifica interattiva Playwright MCP desktop + mobile 375×812 (story con UI: applicare `design-taste-frontend` e `ui-ux-pro-max`).
- **Fuori scope (dichiarato)**: cancellazione note (immutabilità, sopra); riepiloghi ore/compensi (9.3, FR-34); notifiche email all'allievo; allegati; colonna "ultima annotazione" in "I miei allievi" — QUESTA È IN SCOPE invece: chiudere il deferral 9.1 aggiungendo la colonna (ultima `noteDate` per allievo, query batched groupBy/max — MAI N+1) alla tabella di `school/page.tsx`, era il pezzo mancante dell'AC 9.1.
- **Seed**: invariato (instructor@/student@ di 9.1 bastano). NON seedare note.

## Tasks / Subtasks

- [ ] **T1 (AC 1, 4)** — Modello `TrainingNote` + migrazione (ordinamento verificato) + schemi Zod.
- [ ] **T2 (AC 1, 2, 3)** — Permesso `school.notes.manage.any` (admin-only via ALL_PERMISSIONS, rbac + test); service: `listTrainingNotes`/`createTrainingNote`/`updateTrainingNote` con triplice accesso, assegnazione obbligatoria, `FLIGHT_NOT_LINKABLE`, finestra 7 giorni → `NOTE_IMMUTABLE`.
- [ ] **T3 (AC 4)** — Route GET/POST/PATCH + registry OpenAPI + test registry.
- [ ] **T4 (AC 1, 2, 3)** — Pagina `/dashboard/school/[id]` (diario, form istruttore, edit gated, read-only allievo/staff) + row-link da "I miei allievi" + tile "Il mio diario" in home + colonna "ultima annotazione" (batched) in "I miei allievi"; i18n; verifica Playwright MCP.
- [ ] **T5 (AC tutti)** — Unit (matrice accessi 3 vie, non-assegnato 403, flight non collegabile, autore vs non-autore vs admin, dentro/fuori finestra 7gg, allievo profilo disattivato legge ancora, batched last-note) + e2e su `school.spec.ts` o file affine (istruttore crea con volo collegato; allievo legge read-only e NON vede form; allievo altrui 403; modifica autore ok; nota vecchia >7gg immutabile anche per admin — creare la nota e backdatare `createdAt` via psql nel test setup se necessario, dichiararlo).
- [ ] **T6** — `npm run gates`; e2e nuovi + regressione school; story file (Dev Agent Record) + sprint-status.yaml (9-2 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; UI → anche `design-taste-frontend` e `ui-ux-pro-max`.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); Mailpit attivo; prima di ogni run e2e `curl localhost:3000` deve FALLIRE; build SEMPRE `env -u NODE_ENV`; MAI `playwright install`. Baseline e2e: **156 test** (flake noti: `ppr-register:292` ~1 rosso ogni 2-3 run anche isolato, contention varie fuori diff — criterio: fuori dal diff + verde in isolamento = non-regressione).
- UN commit di implementazione (`Story 9.2: ...`). Codice/commenti inglesi; UI IT/EN.
- Helper e2e riusabili: `e2e/school.spec.ts:16-165` (login, createInstructorWithLogin via Mailpit, createStudentPerson, registerSchoolFlight, assegnazione via page.request). Per il test dell'immutabilità: backdate di `createdAt` via psql è legittimo (unico modo di testare la finestra senza aspettare 7 giorni) — dichiararlo nel Debug Log.
- Il GET diario per l'allievo passa dal proxy come route protetta normale (nessuna modifica a PUBLIC_*).

### References

- [Source: _bmad-output/planning-artifacts/epics.md:745-755 — story 9.2 AC; :757-771 — confine 9.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md:276-277, :382 — FR-33 + assumption]
- [Source: ARCHITECTURE-SPINE.md:191-192 — ERD TrainingNote; prisma/schema.prisma:84]
- [Source: src/server/services/school.service.ts — service 9.1 (resolver, listOwnStudents); expiries.service.ts:114-127 — pattern own-access; flights.service.ts:1193-1207 — own-access voli]
- [Source: src/app/[locale]/dashboard/school/page.tsx; dashboard/page.tsx:54-64 — tile own; e2e/school.spec.ts:16-165 — helper]
- [Source: src/app/[locale]/dashboard/ppr/ppr-queue.tsx:280-291 — pattern textarea; src/lib/schemas/registry.ts:623+ — sezione School]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-09: Story file created (Fable 5 main session) — seconda story Epic 9, ricognizione Explore su stato post-9.1. Include la chiusura del deferral 9.1 "ultima annotazione" nella tabella I miei allievi.
