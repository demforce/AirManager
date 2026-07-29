---
baseline_commit: 3587c77
---

# Story 14.7: Istruttore — toggle "per me / per un allievo" e pagina "I miei compensi"

Status: done (review Opus 5 shippable-with-fixes, 4 major — fix F1-F8 `d40c062` + ratifica PO sui KPI, suite 297/297, 0 flaky — 2026-07-29)

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

**Reviewer**: adversarial (Opus 5 xhigh) — 2026-07-29. **Verdetto**: shippable-with-fixes (nessun blocker; isolamento self e invarianti economiche tengono, 4 major da chiudere prima della chiusura story).

### Full suite (arbitro, verbatim)

DB fresco (`docker compose down -v && up -d` + `prisma migrate deploy` + `db seed`), `JOBS_SECRET` esplicito, build prod via webServer, `CI=1 npx playwright test` foreground con log su file:

```
295 passed (10.4m)
EXIT=0
```

0 falliti, 0 retry, 0 flaky. Catena serializzata completa (settings 6/6, booking-window 3/3, treasury-settings 3/3, billing-global 2/2). Conteggio del dev confermato: 289 (arbitro 14.6) + 6 nuovi = 295.

**Gate locale**: `npm run gates` in shell PULITA (senza `.env` esportato) → `FAIL test` / EXIT=1 (v. F1). Con `.env` esportato è verde, come dichiarato.

### Findings

| # | Sev | Titolo | File |
|---|---|---|---|
| F1 | major | `npm run gates` rosso in shell senza `.env`: il nuovo import `./bookings.service` trascina `@/lib/env` (eager) nel test unitario | `src/server/services/instructor-compensation.service.test.ts:13`, `…service.ts:7` |
| F2 | major | Mobile 390px: la colonna IMPORTO collassa a 0px, irraggiungibile a qualunque scroll | `my-compensation/page.tsx:14,109,116` |
| F3 | major | Regressione a11y: stato selezionato non più esposto (radio `[checked]` → button senza `aria-pressed`/`aria-current`) | `src/components/ui/segmented.tsx:34-42` |
| F4 | major | KPI "Maturato nel mese" mostra un valore NETTO dei pagamenti: riga KPI autocontraddittoria | `my-compensation/page.tsx:94`, `messages/it.json:778` |
| F5 | minor | Persona ARCHIVIATA con profilo attivo: voce sidebar presente, pagina vuota (classe 14.6 F2) | `dashboard/layout.tsx:114` vs `…service.ts:97-111` |
| F6 | minor | Assert e2e non discriminante: `toContainText('0,00 €')` soddisfatta da `-200,00 €` nello stesso contenitore | `e2e/my-compensation.spec.ts:180` |
| F7 | nit | `listActiveInstructors(actor.personId ?? undefined)`: fallback che, se raggiunto, userebbe l'istruttore sbagliato | `…service.ts:292` |
| F8 | nit | Storico pagamenti senza cap/paginazione | `…service.ts:297-301` |
| F9 | nit | Il nuovo spec scrive sul ledger globale dal project parallelo (payout → CashMovement) | `e2e/my-compensation.spec.ts:104-110` |

**F1** — A/B in shell pulita: baseline `48e0a24` → `1 passed (27 tests)`; HEAD → `Invalid environment configuration … ❯ src/server/adapters/mail/smtp-mail-sender.ts:2:1`, `Tests no tests`; HEAD con `.env` → `33 passed`. Il gemello `bookings.service.test.ts:45` mocka `@/server/adapters/mail` proprio per questo. Stessa classe del fix `3c6add9`. CI non lo vede (dummy env in `ci.yml:17-23`), il gate locale obbligatorio sì.

**F2** — Misura a 390px: `.students` scrollWidth 546 / clientWidth 232; cella importo `clientWidth: 0`, `scrollWidth: 58`, invisibile anche a `scrollLeft` massimo; hit-test al suo centro → `DIV.card-body`. Screenshot: l'ultima colonna resa è METODO. Causa: `'150px 220px 130px 1fr'` + `airops.css:978` (`min-width:0`). La tabella gemella 14.6 mette il denaro in traccia fissa (`account-section.tsx:210`).

**F3** — ariaSnapshot A/B: prima `radio "Per me" [checked]`, ora `button "Per me"` senza alcuno stato; il pattern citato come modello (`schedule.tsx:427,436`) usa `aria-current`. Fix additivo di una riga.

**F4** — Fixture reale (60,00 €/h, volo SCHOOL 120' del 10/07, payout 30,00 € periodo 01→20/07): pagina → "ORE NEL MESE 2:00 | MATURATO NEL MESE 90,00 €", cioè 2×60 = 120,00 € ≠ 90,00 €. La matematica coincide al centesimo con `GET /api/v1/instructor-compensation` (owedMtd 9000, owedTotal 15000): è l'ETICHETTA a divergere dal resto dell'app ("Dovuto mese"/"Totale dovuto"). **Richiede ratifica PO**: rinominare l'etichetta oppure esporre il lordo maturato.

### Deviazioni dichiarate — verdetti

1. **`ariaLabel` + niente `Field`**: GIUSTIFICATA, diagnosi riprodotta (`button "Prenota Per un allievo": Per me` col wrapping `Field`), prop realmente additiva (unico altro call site `aircraft-editor.tsx:643` invariato). Incompleta però sullo stato selezionato → F3.
2. **Export compensi escluso**: ACCETTATA — l'unico export esistente è `?format=xlsx` sulla route `finance.manage` (`api/v1/instructor-compensation/route.ts:19`), niente di self-safe da riusare a costo zero.
3. **Test extra sul default del toggle**: ACCETTATA e utile — copre un percorso (self) prima non esercitato; l'aggiornamento `radio → button` a `bookings.spec.ts:517` asserisce lo stesso comportamento (copertura non indebolita) e nessun altro e2e guidava le vecchie radio.

### Verifiche empiriche superate (nessun finding)

- **Isolamento/IDOR**: da un istruttore "attaccante", URL con `?instructorProfileId=`/`?personId=` della vittima → solo la propria forma vuota; nell'HTML gli id compaiono unicamente come eco della query string (switch-lingua + payload di routing), testo visibile pulito; nessun identificatore né importo altrui.
- **Matrice RBAC** (admin/staff/istruttore/pilota/allievo): pagina sempre 200, stato vuoto coerente per i non-istruttori, voce sidebar solo INSTRUCTOR; mai 403.
- **Invarianti AC 5**: diff del servizio in addizione pura (0 righe rimosse); payout registrato da admin → gemello di cassa `-3000`, `BANK_TRANSFER`, categoria "Compensi istruttori", `instructorPayoutId` collegato; race di 2 POST con la stessa `Idempotency-Key` → 201 + 409 `IDEMPOTENCY_IN_PROGRESS`, 1 payout e 1 gemello in DB.
- **AC 4**: disattivazione profilo → voce sparita + stato vuoto; riattivazione → tutto ripristinato; attore INSTRUCTOR+PILOT vede entrambe le voci.
- **i18n/UI**: IT+EN complete e senza chiavi orfane, breadcrumb dal registry completo, dark theme coerente, toggle dentro il pannello a 390px.

> Nota ambiente: il DB locale contiene le fixture della review (persone `Rev Alpha-*`/`Rev Bravo-*`, voli `rev147flightA/B`, payout di prova) — resettare prima del giro di fix.

### Fix post-review (2026-07-29, fix-subagent Sonnet 5 xhigh — commit `d40c062`)

**Ratifica PO (AskUserQuestion) su F4**: la riga KPI espone ENTRAMBI i numeri — **"Maturato nel mese" = LORDO** (`round(mtdMinutes/60 × payoutRateCents)`, coerente con ore × tariffa) e **"Dovuto nel mese" = NETTO** (l'`owedMtdCents` della card staff-facing, stessa matematica), più "Residuo dovuto". Il lordo è un valore DERIVATO dalla formula esistente (`computeGrossCents` estratta da `computeOwed`), non una definizione nuova.

- **F1 fixed (major)** — la catena era più lunga di quella diagnosticata: oltre a `@/server/adapters/mail` c'è un secondo hop (`app-settings.service` → `crypto/secret-box` → `@/lib/env`). Entrambi mockati: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` → **34/34 in shell pulita**. Il gate locale obbligatorio torna affidabile (CI non lo vedeva: esporta env fittizie).
- **F2 fixed (major)** — `minmax(110px, 1fr)` sulla traccia dell'importo (prima `1fr`, collassata a 0 da `airops.css:978`). Misura post-fix a 390px: cella 110px, hit-test positivo dopo lo scroll, nessun overflow di pagina. **e2e di geometria nuovo, rosso pre-fix** (pattern 13.10).
- **F3 fixed (major)** — `aria-pressed` nella primitiva `Segmented` (additivo, vale anche per `BasedSegmented`): stato selezionato annunciato, verificato che si inverta al click. Chiude la regressione a11y introdotta dal passaggio radio→button.
- **F4 fixed (major)** — 5 KPI con testid dedicati; aritmetica verificata su dati reali: 2:00 h × 60,00 €/h → Maturato **120,00 €**, Dovuto **90,00 €** (netto acconto 30,00 €), Residuo 90,00 €. e2e nuovo con volo SCUOLA + payout parziale che prova lordo ≠ netto end-to-end.
- **F5+F7 fixed insieme** — `getOwnCompensationOverview` risolve la riga direttamente da `instructorProfileId` (nuova `resolveInstructorRowByProfileId`) invece di passare per `listActiveInstructors(personId)`: sparisce sia il disallineamento sull'archiviazione (sidebar vs pagina) sia il fallback `?? undefined` che, se raggiunto, avrebbe mostrato i dati di un ALTRO istruttore. Test di regressione: `listActiveInstructors` non è mai chiamata da questo percorso.
- **F6 fixed** — assert per-KPI su testid dedicati al posto del `toContainText` sull'intero contenitore (che passava per substring: "0,00 €" dentro "-200,00 €" — classe già in CLAUDE.md).
- **F8 fixed** — `take: 50` sullo storico payout. **F9** — nessuna azione (nota di contesa e2e pre-esistente).

**Gates post-fix**: PASS lint/typecheck/test/build — 1578 unit.

**Full suite finale** (run del fix-subagent sopravvissuto al cap grazie a `nohup`, atteso e verificato dalla sessione principale):

```
297 passed (10.6m)
```
Exit code `0`, zero flaky (297 = 295 + i 2 e2e nuovi di F2/F4).

**Esito finale: tutti i findings chiusi. Story DONE.**
