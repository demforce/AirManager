---
baseline_commit: 3587c77
---

# Story 14.7: Istruttore — toggle "per me / per un allievo" e pagina "I miei compensi"

Status: review (branch `dev`, epic 14)

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

**Status finale**: implementata, gates verdi (fresh DB, prod build). Full suite CI=1 (DB fresco, `env -u NODE_ENV` prod build, `JOBS_SECRET` esplicito, foreground/background con log su file, riletto per intero) **COMPLETATA in questa sessione**: `295 passed (10.3m)`, 0 falliti, nessun flaky osservato (289 dell'arbitro 14.6 + 6 nuovi = 295, conteggio esatto).

### AC → esito

1. **Toggle on/off**: `new-booking-form.tsx` — le 2 radio diventano UN controllo `Segmented` (riuso della primitiva esistente, stesso pattern di `BasedSegmented` in `aircraft-editor.tsx`), scelto su un toggle bare perché la scelta è una COPPIA di opzioni nominate ("per me"/"per un allievo"), esattamente il caso d'uso di `Segmented` — un toggle avrebbe richiesto una mappatura on/off→etichetta ad hoc senza benefici. Semantica di `bookingTarget` (stato, schema di validazione, campo allievo condizionale con la sua validazione 14.2) INVARIATA — solo il markup è cambiato.
   - **Deviazione motivata (accessibilità, scoperta interattivamente)**: il primo tentativo avvolgeva `Segmented` in `Field` (come `BasedSegmented`), ma verificato con Playwright che il `<label>` implicito di `Field` si associa SOLO al primo discendente "labelable" — Chromium calcola il nome accessibile del PRIMO bottone come testo-del-label PIÙ il testo dell'ALTRO bottone, con il proprio testo silenziosamente perso (`"Per me"` → `"Prenota Per un allievo"`), mentre il secondo bottone resta pulito. Fix: `Segmented` guadagna una prop opzionale `ariaLabel` che rende `role="group" aria-label={ariaLabel}` sul wrapper — stesso pattern già usato da `schedule.tsx` per il toggle Giorno/Settimana (hand-rolled, non tramite la primitiva) — e il controllo NON è più avvolto in `Field` (markup identico via le stesse classi `fld`/`fld-label-group`/`fld-label`/`fld-ctrl`, solo senza il wrapper `<label>`). Verificato via `ariaSnapshot()`: gruppo `"Prenota"` con due bottoni `"Per me"`/`"Per un allievo"`, nomi puliti. Nessun altro chiamante di `Segmented` (`BasedSegmented`) è stato toccato — la prop è opzionale e additiva.
   - Verificato interattivamente (Playwright throwaway): focus da tastiera, `Enter` attiva l'opzione, il campo Allievo compare/scompare correttamente, click torna a "Per me".
2. **Pagina "I miei compensi"**: nuovo `NavItemId` `myCompensation` (`route-registry.ts`), `href: '/dashboard/my-compensation'`, icona `cash` (stessa di `myAccount`/`billing`), gruppo `archive`, `roles: INSTRUCTOR_ROLES` (nuova costante, un solo ruolo, stesso pattern di `SELF_SERVICE_ROLES`). Pagina `src/app/[locale]/dashboard/my-compensation/page.tsx` (nuova, Server Component puro — nessuna mutazione, quindi nessun `'use client'`): 4 KPI (`KPI` primitiva riusata) — tariffa oraria, ore nel mese, maturato nel mese, residuo dovuto — più una tabella `Pagamenti ricevuti` (pattern `.students`/`.student-row` riusato da `account-section.tsx`) con data (di registrazione, `createdAt`), periodo coperto, metodo, importo. Prospettiva istruttore pura (mai club-centrica — nessun dato di altri istruttori, nessuna vista aggregata).
3. **Percorso di lettura SELF**: nuova `getOwnCompensationOverview(actor)` in `instructor-compensation.service.ts`. Risolve SEMPRE `getOwnInstructorProfileId(actor)` (riusata VERBATIM da `bookings.service.ts` — la stessa funzione che già alimenta il toggle "Nuova prenotazione" e la landing Overview — non duplicata: stesso contratto "self.read, null-safe su profilo assente/disattivato, nessun id dal client" già testato in `bookings.service.test.ts`). Nessun parametro personId/instructorProfileId sulla funzione — IDOR impossibile per costruzione, non per un controllo aggirabile. Il "maturato" (`mtdMinutes`/`mtdOwedCents`) e il "residuo dovuto" (`totalOwedCents`) riusano `computeSummaryRows` — la STESSA matematica della card staff-facing (`getCompensationSummary`/`getOwnCompensationSummary`), zero calcolo nuovo. Lo storico pagamenti è una query nuova (`prisma.instructorPayout.findMany` per `instructorProfileId`, mai per `personId` dal client). Gli endpoint staff-facing (`getCompensationSummary`, `recordPayout`, `setPayoutRate`) sono INVARIATI — zero righe toccate.
4. **Profilo attivo**: la voce sidebar segue il profilo attivo, non solo il ruolo — `dashboard/layout.tsx` filtra chirurgicamente la SOLA voce `myCompensation` da `visibleNavItems` quando `getOwnInstructorProfileId(actor) === null` per un attore INSTRUCTOR (query eseguita SOLO per attori con ruolo INSTRUCTOR, per non pagare una query in più per ogni altro ruolo). `visibleNavItems`/`route-registry.ts` restano un filtro PURO per ruolo (contratto invariato per ogni altra voce) — deviazione dal precedente 14.6 (che aveva dichiarato "fuori scope" un filtro per-profilo sul registry generale): qui l'AC lo richiede esplicitamente per QUESTA voce, quindi il filtro chirurgico vive nel layout, non nel registry. La PAGINA stessa è comunque universalmente raggiungibile (`self.read`, stessa convenzione di `my-account`) e mostra lo stato vuoto coerente (`my-compensation-empty`, "Nessun profilo istruttore attivo") per un attore senza profilo attivo — MAI un 403, MAI un vicolo cieco (lezione esplicita del prompt: la review 14.6 aveva trovato una CTA gated-sul-ruolo che portava a un 403; qui l'intera pagina è gated sul dato reale, non sul ruolo).
5. **Invarianti**: `getCompensationSummary`, `recordPayout` (incluso il gemello di cassa Billing-1), `setPayoutRate` — zero righe toccate, zero test esistenti modificati. Verificato interattivamente: admin registra un pagamento dalla console istruttori esistente, il flusso e i calcoli restano identici.
6. **Test**:
   - Unit (`instructor-compensation.service.test.ts`, nuovo describe `getOwnCompensationOverview`): rifiuta un actor senza `self.read`; `null` per actor senza persona collegata (mai una query); `null` per profilo DISATTIVATO (mai una query sui payout); `null` per nessun profilo istruttore; risoluzione tramite `getOwnInstructorProfileId` + storico payout scoped al profilo risolto (mai un id dal chiamante); guardia anti-regressione `expect(getOwnCompensationOverview).toHaveLength(1)` (nessun secondo parametro possibile). Mock prisma esteso con `instructorProfile.findUnique`/`instructorPayout.findMany` (necessari per il riuso di `getOwnInstructorProfileId`, che ora viene importato da `bookings.service.ts` — nessuna dipendenza circolare, verificato: `bookings.service.ts` non importa da `instructor-compensation.service.ts`).
   - e2e nuovo file `e2e/my-compensation.spec.ts` (5 test): visibilità sidebar (INSTRUCTOR sì, PILOT/STUDENT/ADMIN/STAFF no); un istruttore con profilo DISATTIVATO perde la voce sidebar E la pagina cade nello stato vuoto coerente (mai 403); un istruttore vede un pagamento REGISTRATO DALL'ADMIN (tariffa impostata via API, payout registrato via API con `Idempotency-Key`, data fissa nel passato per KPI deterministici indipendenti dal giorno di esecuzione) — riga storico con data/periodo/metodo/importo corretti, KPI coerenti; un pilota non vede né la voce né alcun dato navigando direttamente all'URL; IDOR-probe con `?instructorProfileId=`/`?personId=` dell'istruttore vittima sull'URL della pagina (che non ha alcun parametro id da poter sostituire) — l'attaccante vede SOLO la propria forma vuota, mai il dato della vittima.
   - e2e esistente aggiornato: `e2e/bookings.spec.ts:517` (`getByRole('radio', ...)` → `getByRole('button', ...)`, il markup è cambiato da radio a bottoni) — copertura NON indebolita, stesso comportamento asserito (l'istruttore prenota per un allievo, riga con entrambi i nomi). Aggiunto un NUOVO test gemello per lo stato di DEFAULT del toggle ("per me", mai esercitato prima da nessun test esistente) — chiude la lacuna esplicita dell'AC6 ("il toggle funziona: per me / per un allievo", non solo il percorso "per un allievo" già coperto).
   - Verifica interattiva (Playwright throwaway `playwright-core`, mai committato): toggle in entrambi gli stati (tastiera + click), pagina "I miei compensi" con dati reali (tariffa 35,00 €/h, pagamento 100,00 € Contanti) in light/dark/mobile — nessuna regressione visiva, coerente con lo stile AirOps (KPI row + card `.students`).

### File toccati

`src/components/shell/route-registry.ts`, `src/app/[locale]/dashboard/layout.tsx`, `src/app/[locale]/dashboard/bookings/new-booking-form.tsx`, `src/components/ui/segmented.tsx`, `src/server/services/instructor-compensation.service.ts`, `src/server/services/instructor-compensation.service.test.ts`, `src/app/[locale]/dashboard/my-compensation/page.tsx` (nuovo), `messages/it.json`, `messages/en.json`, `e2e/bookings.spec.ts`, `e2e/my-compensation.spec.ts` (nuovo), `CLAUDE.md` (Route map aggiornata con `my-compensation`).

### Deviazioni dichiarate

- **Export dei compensi**: NON incluso (dichiarato "fuori scope se non banale" nello story file). A differenza di `accounts.service.ts` (story 14.6), che aveva GIÀ endpoint xlsx/pdf self-access-safe da riusare a costo zero, `instructor-compensation.service.ts` oggi espone solo `finance.manage`-gated per l'export — costruire un nuovo endpoint export self-safe non era "a costo zero", quindi non incluso.
- **Accessibilità del toggle**: v. AC1 sopra — deviazione dal piano originale ("avvolgere in `Field`" come `BasedSegmented`) motivata da un difetto di accessibilità reale scoperto interattivamente, chiuso con una prop additiva su `Segmented` invece che con un nuovo componente hand-rolled.

### Gates (verbatim)

```
PASS  lint (36s)
PASS  typecheck (26s)
PASS  test (15s) — Tests  1577 passed (1577)
PASS  build (50s)
```

### Full suite CI=1 (verbatim)

DB fresco (`docker compose down -v && up -d`, `prisma migrate deploy` + `db seed`), `JOBS_SECRET=story147-dev-secret-not-a-placeholder`, `CI=1 npx playwright test` (build prod automatico via `webServer`, foreground con log su file, riletto per intero fino al termine):

```
295 passed (10.3m)
```

Nessun fallimento, nessun flaky osservato. Conteggio atteso: 289 (arbitro 14.6) + 6 nuovi (5 in `my-compensation.spec.ts` + 1 in `bookings.spec.ts`) = 295 — coincide esattamente.

## Review Record

_(compilato dopo la review adversarial)_
