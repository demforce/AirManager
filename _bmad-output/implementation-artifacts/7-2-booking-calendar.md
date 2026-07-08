---
baseline_commit: e857b13
---

# Story 7.2: Vista calendario

Status: ready-for-dev

## Story

As a pilota,
I want vedere il calendario dei velivoli,
so that scelga un buco libero (FR-19).

## Acceptance Criteria

1. **Given** prenotazioni esistenti, **When** apro il calendario in vista giorno o settimana, **Then** vedo le colonne per velivolo con i blocchi prenotati (nome prenotante visibile agli autenticati) e posso navigare tra le date; la vista è usabile da mobile.

## Contesto e decisioni di design (vincolanti)

- **Il calendario vive DENTRO `/dashboard/bookings`** (la pagina di 7.1), come sezione principale SUBITO dopo l'header: ordine pagina = header → **calendario** → form "Nuova prenotazione" (invariato, solo `canCreate`) → "Prossime prenotazioni" (invariata). Nessuna route nuova: UJ-1 è "guardo il calendario, scelgo il buco, prenoto" — tutto su una pagina.
- **Stato vista SOLO via query param** (pagina server-rendered, zero stato client per la navigazione): `view=day|week` (default `day`), `date=YYYY-MM-DD` (default: oggi Europe/Rome), sanitizzati col pattern `sanitizeScope` di 6.4 (valori invalidi → default, MAI errore). **Lezione 6.4 M1 (crosstalk href)**: `pageHref` della lista DEVE preservare `view`/`date`, e gli href del calendario (prev/oggi/next, toggle vista) DEVONO preservare `page` — un query-object di next-intl `Link` SOSTITUISCE l'intera query string.
- **Vista giorno** = colonne per velivolo (TUTTI i non archiviati via `listBookableAircraft`, inclusi `OUT_OF_SERVICE` con badge motivo — le loro prenotazioni pre-fermo esistono e si devono vedere), asse verticale ore **06:00–22:00 Europe/Rome**, blocchi posizionati in assoluto per wall-time (top/height % sui minuti da 06:00 su 960'). Blocco = orario inizio–fine + nome prenotante (+ istruttore se presente, stile secondario). Blocchi che sforano la finestra 06–22: clampati al bordo con indicatore (▲/▼ o simile), MAI nascosti — doc-comment. Vista settimana = griglia righe-giorni (lun–dom) × colonne-velivolo, celle con chip compatti `HH:MM–HH:MM Nome`; entrambe le viste soddisfano "colonne per velivolo".
- **Timezone: il giorno calendario è Europe/Rome** (`APP_TIMEZONE`), i dati restano istanti UTC (AD-8). NUOVO helper `src/lib/zoned-time.ts` (puro, unit-testato, NIENTE librerie nuove): `zonedMidnightUtc(dateOnly: string, timeZone: string): Date` (l'istante UTC della mezzanotte wall-clock di quel giorno in quella zona — algoritmo: parti da `Date.UTC(y, m-1, d)`, leggi il wall-clock che quell'istante produce nella zona via `Intl.DateTimeFormat` con `hourCycle: 'h23'`, correggi della differenza, ripeti la correzione UNA seconda volta per i giorni di cambio ora); `zonedWallTime(instant: Date, timeZone: string): { hour, minute }` per il posizionamento dei blocchi; `weekStartDateOnly(dateOnly: string): string` (lunedì ISO, aritmetica date-only pura). Range giorno = `[zonedMidnightUtc(d), zonedMidnightUtc(d+1))`; settimana = `[lunedì, lunedì+7)`. Test obbligatori su CET (+1, gennaio), CEST (+2, luglio) e transizioni DST 2026-03-29 / 2026-10-25. MAI `new Date('YYYY-MM-DD')` nudo per questi calcoli e MAI `date-only.ts` per posizionare istanti (quello è per `@db.Date`).
- **Data dal service, non paginata**: nuova `listCalendarBookings(actor, { from, to })` in `bookings.service.ts` — `authorize('self.read')` (qualunque autenticato, FR-19), `from`/`to` OBBLIGATORI, `to > from` → 422, **range massimo 8 giorni** → 422 (`ValidationError`, code `RANGE_TOO_WIDE`), predicato overlap-col-range semi-aperto IDENTICO a 7.1 (`startsAt < to AND endsAt > from`), ordine `startsAt asc, id asc`, `take: 1000` con doc-comment (bound di sicurezza, non paginazione: un calendario non si pagina). Riusa `BOOKING_SELECT`/`toListItem`. API gemella `GET /api/v1/bookings/calendar` (AD-1, parità Flutter): query schema Zod con refine range, registry tag `['Bookings']`, errorResponses 401,403,422.
- **Nav estesa a tutti gli autenticati**: `nav-items.ts` → voce `bookings` aggiunge `self.read` ai permessi (pattern flights 5.4 / expiries 6.2: la pagina decide cosa mostrare — l'allievo vede calendario e lista, NON il form perché `canCreate` resta sui permessi manage). **ATTENZIONE contratto 7.1**: `e2e/bookings.spec.ts` oggi asserisce che l'allievo NON vede la voce nav "Prenotazioni" — quel test VA AGGIORNATO (l'allievo ora la vede, apre la pagina, vede il calendario coi nomi, e NON vede il form né può POSTare — il 403 API resta). Stesso giro di 6.2 sul test nav di 6.1: aggiornamento atteso, dichiararlo, non "fixarlo" silenziosamente.
- **Nomi visibili a ogni autenticato** (FR-19 + assumption PRD §377-379): il calendario mostra nome prenotante e istruttore per TUTTI gli autenticati — nessun oscuramento per ruolo. Niente evidenziazione "mie prenotazioni" (non richiesta: non-goal dichiarato, eventualmente 7.3 quando arrivano le azioni own).
- **Mobile-usable (AC esplicito)**: entrambe le viste dentro contenitori `overflow-x-auto` con larghezza minima per colonna velivolo (`min-w`), MAI overflow orizzontale del body (convenzione tabelle esistente); controlli di navigazione (prev/oggi/next, toggle giorno/settimana) con touch target ≥44px; vista giorno default. Verifica interattiva Playwright MCP ANCHE a viewport 375×812 (obbligatoria prima degli e2e) + un test e2e con viewport mobile.

## Tasks / Subtasks

- [ ] Task 1: Helper timezone `src/lib/zoned-time.ts` (AC 1)
  - [ ] `zonedMidnightUtc`, `zonedWallTime`, `weekStartDateOnly` come da Contesto, puri, con doc-comment sull'algoritmo a doppia correzione DST; unit test `zoned-time.test.ts`: gennaio CET (mezzanotte Roma = 23:00Z del giorno prima), luglio CEST (22:00Z), 2026-03-29 e 2026-10-25 (giorni di 23/25 ore: il range giorno copre esattamente l'intervallo tra le due mezzenotte), `weekStartDateOnly` su lunedì/domenica/anno-cavallo.
- [ ] Task 2: Service + API (AC 1)
  - [ ] `listCalendarBookings` in `bookings.service.ts` come da Contesto (authorize `self.read`; 422 su `to <= from` e su range > 8 giorni con code `RANGE_TOO_WIDE`; overlap semi-aperto; `take: 1000`; riuso `BOOKING_SELECT`/`toListItem`).
  - [ ] `src/lib/schemas/bookings.ts`: `calendarBookingsQuerySchema` (`from`/`to` `z.iso.datetime()` obbligatori + refine `to > from` COME ISTANTI — lezione N1 di 7.1: mai confronto lessicografico di ISO string) + response `z.array(bookingItemSchema)`; route `src/app/api/v1/bookings/calendar/route.ts` thin `apiRoute()`; registry: componenti + path GET (401,403,422); `registry.test.ts`.
- [ ] Task 3: UI calendario (AC 1) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [ ] `page.tsx`: sanitizza `view`/`date`; calcola range con gli helper Task 1; chiama `listCalendarBookings` direttamente (AD-1 read, pattern esistente della pagina); passa a un nuovo componente `booking-calendar.tsx` (server component se possibile — la navigazione è tutta `Link`; client solo se serve per lo scroll iniziale, motivare) i velivoli (`listBookableAircraft` ORA serve anche ai non-creator: spostarne la chiamata fuori dal ramo `canCreate`), i blocchi già proiettati in wall-time Rome (proiezione server-side via `zonedWallTime` — il client NON riconverte), `view`, `date`.
  - [ ] `booking-calendar.tsx`: toolbar (prev / oggi / next, toggle giorno|settimana, intestazione data localizzata via `formatDate`-equivalente esistente); vista giorno (griglia ore 06–22, colonne velivolo con marche + badge OOS col motivo, blocchi posizionati, clamp con indicatore); vista settimana (righe lun–dom con etichetta giorno localizzata, colonne velivolo, chip compatti); empty state per giorno/settimana senza prenotazioni; `key={id}` sui blocchi; contrasto e leggibilità palette esistente (blocchi = tinte chip neutre esistenti, NIENTE colori nuovi).
  - [ ] Href: tutti i link calendario preservano `page`; `pageHref` della lista preserva `view`/`date` (lezione 6.4 M1). Nav `bookings` + `self.read` in `nav-items.ts` + `nav-items.test.ts`.
  - [ ] i18n `messages/{it,en}.json` simmetrici: `BookingsPage.calendar.*` (toolbar, viste, empty, clamp hint, badge OOS).
- [ ] Task 4: Test (AC 1)
  - [ ] Unit: `zoned-time.test.ts` (Task 1); `bookings.service.test.ts` esteso — `listCalendarBookings`: 403 senza actor... (authorize), 422 `to<=from`, 422 range >8gg con code, boundary semi-aperto (booking che FINISCE esattamente a `from` escluso; che INIZIA esattamente a `to` escluso; che tocca il range per 1 minuto incluso), ordine, take bound; schema: from/to mancanti/malformati 422, refine istanti (precision mista, come il test N1); `registry.test.ts`, `nav-items.test.ts`.
  - [ ] e2e `bookings.spec.ts` esteso (dati run-unique): AGGIORNARE il test nav allievo (ora vede "Prenotazioni", apre la pagina, vede calendario e nomi, NESSUN form `form.title`, POST diretto resta 403); nuovo scenario calendario: velivolo run-unique + 2 prenotazioni via API admin a orari noti di DOMANI (es. 09:00Z e 14:00Z) → naviga a domani (link next o `?date=`) in vista giorno → blocchi visibili con nome prenotante run-unique nella colonna della marca run-unique; toggle settimana → chip presenti; prev/next cambiano l'intestazione; viewport mobile 375×812 → vista giorno usabile (blocco visibile, nessun overflow body — assert su `document.body.scrollWidth <= innerWidth` o equivalente pragmatico).
- [ ] Task 5: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `7-2-booking-calendar: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: NIENTE modifica/cancellazione o drag (7.3), NIENTE blocco scadenze (7.4), NIENTE click-su-slot-precompila-form (nice-to-have NON richiesto: se lo aggiungi è una deviation dichiarata e motivata). Il form e la lista di 7.1 restano funzionalmente INVARIATI (solo riordino sezioni e preservazione query param).
- **AD-1**: lettura pagina via service diretto + endpoint API gemello per il client mobile; **AD-5**: authorize nel service (la nav/page gate nascondono soltanto); **AD-8**: wire UTC ISO, presentazione Europe/Rome.
- **Riuso**: `BOOKING_SELECT`/`toListItem` (NON duplicare la proiezione DTO); `listBookableAircraft` (già include status/statusReason per il badge OOS); `formatTimeOfDay`/`formatDateTime`/`APP_TIMEZONE` di `src/lib/time.ts`; pattern sanitize di `expiries/page.tsx`; pattern href-preservation di 6.4.
- **Lezioni review da rispettare**: N1 7.1 (confronti datetime SEMPRE come istanti nei refine); crosstalk href 6.4 M1 (due "sezioni con stato" sulla stessa pagina: lista paginata + calendario navigabile); F1 6.3 (e2e solo su osservabili run-unique — MAI asserire sul numero totale di blocchi visibili, altri test creano prenotazioni in parallelo: cercare le PROPRIE marche/nomi run-unique); i18n simmetrica contata; `key={id}`; niente enum raw in UI.
- **Il posizionamento wall-time va fatto SERVER-SIDE** (`zonedWallTime` con `APP_TIMEZONE`): il TZ del browser/container e2e NON è affidabile (lezione 7.1: container UTC vs display CEST) — il client riceve blocchi già proiettati ({top%, height%, label}), così il rendering è deterministico ovunque. Negli e2e le assert sono su nomi/marche, non su coordinate.
- **Il dev agent NON può resettare il DB**: arriva GIÀ resettato+seedato; anomalie e2e da volume → `notesForReview`. PRIMA del run e2e di gate: `curl localhost:3000` DEVE fallire (altrimenti `pkill -f "next dev"` / `fuser -k 3000/tcp`). Classe flaky nota epic 5 (flights form-refresh, people-management sotto carico, `flights.spec:210` anche da solo): procedura invariata — DB fresco, re-run in isolamento, giudicare con "deterministico in isolamento assente alla baseline = regressione".
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query utili: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "calendar timeline schedule view"` e `"mobile responsive table"`); coerenza `minimalist-ui` (monocromi caldi, bento flat, NIENTE gradienti/ombre pesanti, palette chip esistenti); verifica interattiva Playwright MCP desktop E 375×812 PRIMA degli e2e.
- **Ambiente**: Mailpit su :8025/:1025; `SEED_ADMIN_PASSWORD` da `.env`; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`.
- **Gate**: lint 0 errori (warning benigno noto `data-table.tsx`), typecheck, `npx vitest run` (≥ 806 + nuovi), build, `npx playwright test` su DB il più fresco disponibile (≥ 113 + nuovi, col test allievo AGGIORNATO — dichiarare l'aggiornamento).
- Un commit di implementazione (`Story 7.2: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-resume-gcly8l`, non detached) prima del commit.

### Project Structure Notes

- Nuovi file: `src/lib/zoned-time.ts` (+test), `src/app/[locale]/dashboard/bookings/booking-calendar.tsx`, `src/app/api/v1/bookings/calendar/route.ts`. Modifiche: `bookings.service.ts` (+test), `src/lib/schemas/bookings.ts`, `registry.ts` (+test), `page.tsx` bookings, `nav-items.ts` (+test), `messages/{it,en}.json`, `e2e/bookings.spec.ts`.
- `zoned-time.ts` è VOLUTAMENTE separato da `time.ts` (display) e `date-only.ts` (calendario `@db.Date`): tre concern distinti, doc-comment di modulo che li delimita.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#4.6 FR-19, §377-379 assumption nomi]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-1, #AD-5, #AD-7, #AD-8]
- [Source: _bmad-output/implementation-artifacts/7-1-booking-creation.md] — DTO/BOOKING_SELECT, matrice permessi, Review Record (N1 istanti, N2 deferred), contratto e2e nav allievo DA AGGIORNARE
- [Source: src/server/services/bookings.service.ts] — `BOOKING_SELECT`/`toListItem`/`listBookableAircraft` da riusare
- [Source: src/app/[locale]/dashboard/bookings/page.tsx] — struttura pagina 7.1 (clamp page, pageHref, formMode)
- [Source: src/lib/time.ts#APP_TIMEZONE, formatTimeOfDay] — display Europe/Rome
- [Source: src/app/[locale]/dashboard/expiries/page.tsx#sanitizeScope] — pattern sanitize query param
- [Source: docs/handoffs/HANDOFF.md] — lezioni 6.4 M1 (href crosstalk), 6.3 F1 (run-unique), server stale

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-08: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
