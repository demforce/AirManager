---
baseline_commit: eef77ef
---

# Story 19.10: Avviso con deroga admin — prenotazioni

Status: **done** — 2026-11-03 (review SHIPPABLE CON FIX, arbitro rosso per la fixture di ricarica → fix `761bf92` + docs `42ecd3e` (F1 ricariche al minimo, F2 pool esaurito dalle approvazioni simultanee, F3 popup come dialoghi accessibili via `MiniModal`, F4-F6); arbitro finale della sessione principale su DB fresco **597 + 1 flaky = 598, exit 0**, flaky = ECONNRESET infrastrutturale). Storico — **review** — 2026-11-03 (dev). Era: **ready-for-dev** — 2026-11-01. **Nessuna domanda PO aperta**: Q-19.10-a = **B** (PO, contro la raccomandazione) e Q-19.9-a = **sì** (sessione principale), decise il 2026-11-01 e applicate agli AC (le righe che ne dipendono restano marcate **[Q-a]** / **[Q-19.9-a]** per tracciabilità). **Modello dev: Opus 5 xhigh (UI)**: la story scrive UI in quattro superfici di prenotazione (form «Nuova prenotazione», form «Modifica», approvazione desktop dalla lista, approvazione nei due sheet mobile: lista Prenotazioni e Panoramica) e nel pannello «Quota associativa» delle Scadenze (deroga dell'addebito quota, §1 AD-10 — **assegnata a questa story dalla sessione principale il 2026-11-01**), oltre a service, una migrazione, Zod/OpenAPI, i18n ed e2e. Review: **Opus 5 xhigh adversarial**. Un solo dev subagent. Chiave sprint-status: `19-10-avviso-deroga-prenotazioni`.

> ⚠️ **Dipendenze e baseline**: ogni `file:riga` è misurato su **`eef77ef`** (HEAD, albero di lavoro pulito su `src/`, `prisma/`, `e2e/`). Il dev parte **DOPO il commit di 19.1…19.9**. Le story precedenti toccano file di questa e fanno slittare le righe:
> - **19.9** (scritta in parallelo, `19-9-avviso-deroga-voli.md`) crea il **servizio unico dei check** (`requirements.service.ts`), il codice `REQUIREMENTS_NOT_MET`, lo schema di `details.failures[]` (`src/lib/schemas/requirements.ts`), il permesso `requirements.force` (rinomina di `flights.forceExpiry`) e il componente UI dell'avviso unico (`requirements-warning.tsx`) — contratto concordato in §1 AD-1: questa story li **consuma**, non li riscrive (§1 AD-1). Toglie `forceReason` e il badge «Forzato» dai **voli** e riscrive o sostituisce `findBlockingExpiredDocuments` (`bookings.service.ts:465-481`), oggi condivisa coi voli.
> - **19.7a** aggiunge le funzioni di valutazione (`getMedicalRequirementFailure`, `getMembershipStatus`, `getCurrencyStatus`, `computeCurrency`), il tipo `MEMBERSHIP`, la regola mediche dentro `findBlockingExpiredDocuments` (D-5: per le prenotazioni solo scadute, solo la persona — **questa story estende** a mancanti e istruttore) e l'helper e2e `registerFlightOn`.
> - **19.5** porta i form prenotazione a `SearchCombobox` + `Controller` RHF (A15/A18): le righe di `new-booking-form.tsx`/`edit-booking-form.tsx` citate qui cambiano molto.
> - **19.3** introduce `studentPriceCents`/`pilotPriceCents` su `AircraftRate`, la regola di categoria `hasActivePilot ? PILOT : STUDENT` (`flights.service.ts`, AD-4 della 19.3), la fixture SQL `e2e/db-fixtures.ts` (`seedAircraftRate`, `seedInstructorRate`) e `todayRome()`/`addDaysIso()` in `e2e/helpers.ts`.
> - **19.6** elimina `Flight.status` (ogni riga `Flight` è un volo registrato).
> - **19.7a/19.7b** toccano `membership.service.ts` (tipo `MEMBERSHIP`, `getMembershipStatus`) e `expiries/scadenze-console.tsx` (registro unificato): le righe di AD-10 slittano.
>
> **Prima di scrivere una riga (T0)**: `git log --oneline -15`; leggere il file **committato** della 19.9 e il suo codice; rieseguire i censimenti di §3 e correggere le righe slittate **in questo file**; compilare la tabella di §1 AD-1 coi nomi reali. Se il servizio della 19.9 **non** accetta un costo precalcolato, una data di riferimento arbitraria o i profili di una persona qualsiasi (anche solo istruttore), **fermarsi e segnalarlo alla sessione principale**: non scrivere un secondo servizio dei check.
>
> **Da leggere PRIMA**: `CLAUDE.md` (convenzioni e2e: substring di `getByLabel`/`hasText`, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-`, catena dei project serializzati, suite solo via `scripts/e2e.sh`, lock anti-brute-force sui run ripetuti, env eager negli unit); `sprint-change-proposal-2026-11-01.md` §4.0 (**R-19-g/h/i/j/k/l/o**), §4.2 righe 19.9-19.10, **§4.4**, §4.5, §4.6, §4.10 **A9/A10**; `19-9-avviso-deroga-voli.md` (tutto); `19-7a-*.md` §1 AD-3/AD-4/AD-5 e §5.11-12; `16-3-prenotazioni-persona-istruttore-approvazione.md` AD-1/AD-2 con i **due emendamenti**, Review Record (PO-1, TD 16.3-g, sonda D1); `16-4-tipo-scadenza-disattivato.md` §0 P1. Skill: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

---

## Decisioni PO (2026-11-01) — tutte chiuse

> **Q-19.10-a = B** (decisione PO, **contro la raccomandazione**): sulle prenotazioni **currency e quota associativa si valutano alla data di OGGI** (Europe/Rome), non al giorno del volo prenotato. Le **scadenze dei documenti** (visite mediche, ratings) restano valutate al **giorno del volo** come dalla 7.4 (il PO ha risposto solo su currency e quota). Applicata in D-1, AD-1 (`expiryDateOnly`/`membershipDateOnly`/`currency.dateOnly`, contratto esteso dalla 19.9), AC 7, 8, 11, 11-bis. La tabella qui sotto resta come traccia della domanda posta.
>
> **Q-19.9-a = sì** (sessione principale, per R-19-k: la quota è dovuta anche dagli istruttori): la quota si controlla anche sull'istruttore a bordo. AC 10 invariato.
>
> Per conoscenza: Q-19.9-b = «sempre» (in modifica di un **volo** il saldo si ricontrolla sempre, al netto dell'addebito attuale) — della 19.9; coerente con D-3 di questa story (ogni PATCH ricontrolla tutto).

### Q-19.10-a — Currency e quota associativa: al giorno della prenotazione o a oggi?

Le scadenze di una prenotazione si valutano **al giorno del volo prenotato** dalla story 7.4 (ratificata: «prenotare per dopodomani con la medica che scade stanotte DEVE bloccare», `bookings.service.ts:552-560`), e la 19.9 valuta tutto al giorno del volo. Per currency e quota la CR non lo dice. Le funzioni della 19.7a accettano qualsiasi data (`getCurrencyStatus(personId, atDate)`, `getMembershipStatus(personId, dateOnly)`). Il saldo è sempre quello **attuale** (un saldo futuro non esiste).

| Opzione | Regola | Conseguenza concreta |
|---|---|---|
| **A (raccomandata)** | Tutto al **giorno della prenotazione** D (data di Roma di `startsAt`): scadenze, currency, quota. | Una regola sola per i tre check datati, identica a voli (19.9) e scadenze (7.4). Un pilota con ultimo volo 80 giorni fa (Y = 90) che prenota un solista fra 15 giorni è **bloccato** (a D ne sarebbero passati 95): prima vola in doppio comando (prenotazione creata da admin o istruttore, R-19-l), poi prenota il solista. Una quota che scade fra 5 giorni blocca una prenotazione fra 10: si rinnova prima (il rinnovo è cumulativo, `max(oggi, scadenza) + 12 mesi`, §4.6: rinnovare in anticipo non costa giorni). |
| B | Scadenze al giorno D (7.4), currency e quota **a oggi**. | Il pilota dell'esempio prenota; il controllo vero arriva all'approvazione (rivalutata) e alla registrazione del volo (19.9, al giorno del volo). Due date di riferimento nella stessa risposta: una scadenza fallisce «a D», una quota passa «a oggi». |

**Raccomandazione (non accolta): A** — una sola data per tutti i check di una prenotazione, la stessa della registrazione del volo che quella prenotazione diventerà; nessun «buco» fra prenotazione e volo che solo l'admin vedrebbe al momento di registrare. Il PO ha scelto **B**: gli AC marcati **[Q-a = B]** (7, 8, 11-bis) sono scritti su B.

### Q-19.9-a — La quota si controlla anche all'istruttore a bordo? (posta nella 19.9, vale anche qui) — **decisa: sì**

Domanda **condivisa**, aperta dal writer della 19.9 con lo stesso ID: non se ne apre una seconda. Raccomandazione comune: **sì, persona e istruttore** (R-19-k «per tutti», coerente con EXPIRY persona + istruttore). Gli AC lo assumono e marcano **[Q-19.9-a]** la riga che cade con l'altra risposta (AC 10, seconda metà).

**Già deducibile, non è una domanda** (confermato negli AC 12b, 14, 27-28): l'approvazione di una PENDING creata da un pilota rivaluta i check e, se falliscono, **l'admin vede l'avviso** e può procedere (R-19-h: solo l'admin deroga, e l'approvazione è un'azione solo admin, `transitionBooking` → `authorize(bookings.manage.any)`, `bookings.service.ts:1309`).

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che **ogni prenotazione** (creata, modificata o approvata) passi gli **stessi quattro controlli dei voli** — scadenze, currency, saldo che copre il costo stimato, quota associativa —, che solo io possa procedere comunque dopo **un unico avviso con l'elenco**, che piloti e istruttori vengano **bloccati** con lo stesso elenco, e che la stessa persona non possa essere **istruttore su un velivolo e pilota su un altro** nello stesso orario,

so that la prenotazione non prometta un volo che la registrazione poi rifiuterebbe (punto PO 15), la deroga abbia una sola forma in tutta l'app (§4.4, R-19-h) e il caso lasciato aperto dalla 16.3 (PO-1 → R-19-o) sia chiuso dentro i suoi stessi lock.

### Il perché

Oggi una prenotazione controlla **una sola cosa**: i documenti **scaduti** della **sola persona** (`findBlockingExpiredDocuments`, `bookings.service.ts:465-481`, chiamata a `:685`, `:1068`, `:1344`). Niente istruttore, niente documenti mancanti, niente saldo, niente quota, niente currency. La deroga esiste **solo sulla creazione** (`force` + `forceReason`, `:632-637`, `:687-701`): la modifica (`:1066-1076`) e l'approvazione (`:1343-1351`) rispondono 422 secco anche all'admin («cancella e ricrea con `force`», doc-comment `:126-129`). Il ramo di deroga chiede un **motivo** che R-19-h ha abolito, e risponde «Impossibile forzare la prenotazione. Riprova.» ai 422 che arrivano **dopo** il blocco scadenze (`BOOKING_IN_PAST`, `BOOKING_OUTSIDE_WINDOW`, `AIRCRAFT_OUT_OF_SERVICE`: TD 16.3-g), perché il blocco scadenze li precede (`:685` contro `:703`, `:710`, `:726`): un vicolo cieco deterministico, l'admin conferma la deroga e riceve un errore che con la deroga non c'entra.

La 16.3 ha lasciato dichiarato un buco (TD 16.3-a, doc-comment `:374-376`): la stessa persona `personId` di una prenotazione e **istruttore** di un'altra, sovrapposte, passa — i due predicati sono chiavati su colonne diverse. Il PO l'ha ratificato come blocco in questa story (R-19-o).

### Fatti misurati che vincolano il design (su `eef77ef`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Il blocco scadenze precede tre 422 non derogabili | `createBooking`: scadenze `:684-701` → `BOOKING_IN_PAST` `:703-705` → finestra `:710` → transazione con `AIRCRAFT_OUT_OF_SERVICE` `:726-728` e 409 `:735-744` | la deroga si decide **per ultima**, dopo ogni controllo non derogabile (AD-3): l'avviso compare solo quando la prenotazione passerebbe, «Procedi comunque» fallisce solo per una corsa. Chiude TD 16.3-g alla radice |
| Nessuna deroga su modifica e approvazione | `:1066-1076` (solo cambio di giorno, nessun `force`), `:1343-1351`; schema `updateBookingSchema` senza `force` (`schemas/bookings.ts:70-77`), `transitionBookingSchema` idem (`:248-251`) | `force` entra nei due body (AD-4) |
| Gli allievi non prenotano mai da soli | ruolo `STUDENT` = solo `self.read` (`rbac.ts:109`); l'auto-prenotazione richiede pilota **o istruttore** attivo (`bookings.service.ts:665`) e vieta l'istruttore (`:610-615`) | R-19-l è già strutturale: ogni auto-prenotazione è senza istruttore ⇒ volo solista ⇒ currency controllata (D-4). Nessun codice nuovo per «niente istruttore all'auto-prenotazione» |
| Le tariffe non sono leggibili dal pilota | `getEffectiveRate` → `authorize(aircraft.manage)` (`rates.service.ts:227-228`); `getEffectiveInstructorRate` → `authorize(people.read)` (`instructor-rates.service.ts:199-204`) | la stima del costo legge le tariffe **senza attore** (idioma di `findBlockingExpiredDocuments`), AD-2 |
| Chi è solo istruttore non ha un conto | doc `accounts.service.ts:108-111` («instructor-only people never get one»); il volo rifiuta una persona né pilota né allievo (`PERSON_NOT_PILOT_OR_STUDENT`, `flights.service.ts`) | per lui il check saldo non si valuta (D-6) |
| Il volo vieta istruttore = pilota, la prenotazione no | `INSTRUCTOR_SAME_AS_PILOT` (`flights.service.ts:783-785`); nessun controllo in `createBooking` (`:655-661`) | lo stesso 422 sulla prenotazione staff (D-8): è il caso degenere di R-19-o |
| Il lock persona è uno per riga, l'istruttore lockato per profilo | `lockBookingPeople` `:343-348` (`Person` poi `InstructorProfile`, `FOR NO KEY UPDATE`) | con R-19-o la stessa **persona** può comparire in due ruoli: il lock va sulla riga `Person` dell'istruttore, e due righe della stessa tabella si bloccano in **un** `ORDER BY "id"` (AD-5) |
| `InstructorProfile ↔ Person` è 1:1 | `InstructorProfile.personId String @unique` (`schema.prisma:124`) | il lock `Person` dell'istruttore **include** quello sul suo profilo: il lock `InstructorProfile` diventa ridondante e si toglie (AD-5) |
| Il predicato velivolo è asserito come oggetto esatto | unit 16.3 «the person and instructor predicates are EXACTLY the aircraft one re-keyed» (`bookings.service.test.ts`) | i due predicati persona/istruttore cambiano `where` (AD-5): quei test si aggiornano coi `where` nuovi, **non si indeboliscono** |
| La forzatura è già un pattern delle fixture e2e | `mobile-logbook.spec.ts:156-171` («`force`/`forceReason` on every fixture: the guard-rail's own catalogue is global and dirty») | le fixture API **admin** non dedicate ai check passano `force: true` (AD-9) |
| Il saldo del pilota del seed accumula fra run | `accounts-topups.spec.ts:28-30` («Scenarios needing a pristine balance create their own person») | ricaricare il pilota del seed per renderlo prenotabile non rompe asserzioni di saldo esatto (AD-9) |
| `form.force.cancel` non è solo della deroga | è l'«Annulla» del form e il `closeLabel` dello `SlideOver` (`new-booking-form.tsx:427`, `:628`) | la chiave si **sposta** (`form.cancel`), non si cancella (§3.8) |
| `forceReason` sulle prenotazioni | colonna `schema.prisma:1123`; scritta solo da `createBooking` (`:693`, `:761`); mai nel DTO (`schemas/bookings.ts:128-136`); nessun seed la scrive (`grep forceReason prisma/seed*.ts` → 0) | DROP in una migrazione (A10), nessun backfill |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto

| # | Requisito |
|---|---|
| **P1** | Creazione, modifica e approvazione (`PENDING → APPROVED`) valutano i **quattro check** della 19.9 con il **servizio unico** della 19.9: scadenze bloccanti (scadute **e mancanti**, persona **e istruttore**, regola mediche R-19-j, tipo disattivato non conta — 16.4 assorbita), currency (solo prenotazione **senza istruttore**), saldo che non copre il **costo stimato** (R-19-g, A9), quota associativa (persona e istruttore, R-19-k). |
| **P2** | Check falliti ⇒ **422 `REQUIREMENTS_NOT_MET`** con `details.failures[]` **identico** a quello dei voli (stesso schema Zod, stessi tipi `EXPIRY | CURRENCY | BALANCE | MEMBERSHIP`, stessi campi). |
| **P3** | **Solo l'admin deroga** (permesso **`requirements.force`**, solo ADMIN, rinominato dalla 19.9 da `flights.forceExpiry`: il gate di `force` non è più `bookings.manage.any`): rimanda la stessa richiesta con `force: true`, **senza motivazione**. `force` da non-admin → **403 prima di ogni query** (sulla creazione dopo le regole own, come oggi; sulla modifica prima di leggere la prenotazione). Pilota che si prenota, istruttore per sé o per l'allievo, own-path che sposta: **bloccati**, con lo stesso elenco (R-19-h). |
| **P4** | Restano **non derogabili**: le sovrapposizioni (velivolo, persona, istruttore, stessa persona in due ruoli — 409), il velivolo fuori servizio o archiviato, `BOOKING_IN_PAST`, `BOOKING_OUTSIDE_WINDOW` (§4.4). |
| **P5** | Un solo avviso con l'elenco e «Procedi comunque» in **ogni** superficie di creazione, modifica e approvazione, desktop e mobile; per chi non può derogare lo stesso elenco senza il bottone. |
| **P6** | Via `Booking.forceReason` (migrazione) e la sezione «Forza prenotazione» col campo motivo; resta il timbro silenzioso `forcedAt`/`forcedByUserId`, non mostrato (A10). |
| **P7** | **R-19-o**: la stessa persona come istruttore di una prenotazione `APPROVED` e come persona di un'altra sovrapposta → **409**, coi codici esistenti `PERSON_BUSY`/`INSTRUCTOR_BUSY`, serializzato dai lock della 16.3. |
| **P8** | **Deroga dell'addebito quota** (CR §4.6: «l'`override` senza motivo dell'addebito quota si allinea al pattern unico di §4.4»; assegnata dalla sessione principale): saldo insufficiente → 422 del contratto condiviso, `force: true` gated da `requirements.force`, avviso condiviso con «Procedi comunque» al posto della casella «Forza addebito», `Idempotency-Key` obbligatoria intatta (AD-10). |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-g** + **A9** | Saldo insufficiente = il saldo non copre il costo; prenotazione = costo **stimato** = prezzo per profilo × durata dello slot + tariffa istruttore × durata se c'è l'istruttore. | AD-2. |
| **R-19-h** | Un solo avviso con l'elenco + conferma, senza motivo e senza badge; derogano **solo** gli admin. | P3, P5, P6. |
| **R-19-i** | Currency per piloti e allievi; chi non è current vola solo con istruttore. | D-4. |
| **R-19-j** | Una visita valida di qualsiasi classe, per chiunque sia a bordo (anche l'istruttore). | dentro il servizio della 19.9. |
| **R-19-k** | Quota 12 mesi, dovuta da piloti, allievi e istruttori. | persona e istruttore. |
| **R-19-l** | Piloti e allievi non prenotano con istruttore ⇒ auto-prenotazione = solista; le prenotazioni con istruttore le creano admin e istruttori. | già strutturale (fatti misurati); D-4. |
| **R-19-o** | 16.3 PO-1: istruttore su un velivolo e pilota su un altro nello stesso orario si **blocca**, codici esistenti. | AD-5, P7. |
| **§4.4** | 422 con codice unico e `failures[]`; `force` senza motivo; 403 da non-admin prima di ogni query; non derogabili sovrapposizioni e fuori servizio. | P2-P4. |
| **A10** | Via `forceReason`; resta `forcedAt`/`forcedByUserId` non mostrato. | P6, AD-7. |
| **§4.6** | L'`override` senza motivo dell'addebito quota (saldo insufficiente) si allinea al pattern unico di §4.4. | P8, AD-10 (assegnazione della sessione principale, 2026-11-01). |
| **16.4 superseded** | Tipo disattivato non blocca: assorbita da 19.9/19.10. | proprietà del servizio della 19.9, verificata sul percorso prenotazione (AC 6d). |
| **15.4 (decisione PO 2026-08-03)** | La finestra oraria si ricontrolla su **ogni** modifica, incondizionata, sul risultato del merge. | D-3: i check seguono la stessa regola. |
| **R-16-b** | Una prenotazione già iniziata o passata si può approvare (lo staff regolarizza). | invariato; D-7 per il saldo. |

**Superati da questa story** (da non «ripristinare»): story 7.4 AC 2 («`force` + `forceReason` obbligatorio»; «sulla modifica niente deroga: cancella e ricrea»); TD-5 AC 5 («la modifica ricontrolla le scadenze **solo** se cambia il giorno»); 19.7a D-5 per la parte «prenotazioni = solo scadute, solo la persona»; 16.3 AD-1 «il predicato persona non passa per l'istruttore» e TD 16.3-a; 16.3 AD-2 «lock `InstructorProfile`» (sostituito dal lock `Person` dell'istruttore, AD-5).

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | **Due date di riferimento** **[Q-a = B]**: **scadenze dei documenti** (EXPIRY) e **tariffe della stima** (AD-2) al giorno di Roma di `startsAt` (`dateOnlyInZone(startsAt, APP_TIMEZONE)`, già calcolata a `:684`, `:1066`, `:1343`); **currency e quota** (CURRENCY, MEMBERSHIP) alla data di **oggi** di Roma (`todayDateOnlyInZone(APP_TIMEZONE)`, `zoned-time.ts:178`, la stessa che la 19.7a usa per la currency, A16). Il saldo è sempre quello attuale (D-2). | Q-19.10-a = B (decisione PO); 7.4 per le scadenze; le tariffe seguono il giorno del volo perché il volo le congelerà a quella data (AD-4) | una data sola (opzione A, non accolta) |
| **D-2** | **Saldo** = saldo **attuale** del conto della persona prenotata (`SUM(amountCents)`, AD-3 del ledger) confrontato col costo stimato di **questa** prenotazione; supera il check se `saldo ≥ costo`. Le altre prenotazioni aperte della persona **non** si sommano. | R-19-g e A9 alla lettera («il costo stimato» della prenotazione) | somma delle prenotazioni future: nessuna ratifica la chiede, e cambierebbe al variare di prenotazioni altrui ancora PENDING |
| **D-3** | **Ogni** modifica rivaluta i quattro check sul risultato del merge (anche una modifica delle sole note, anche nello stesso giorno). | la stessa regola che il PO ha ratificato per la finestra oraria (15.4, «incondizionata»); P1 («stessi check su modifica») | solo al cambio di giorno (TD-5): con saldo e currency la durata e il velivolo cambiano il costo, e il giorno non basta più |
| **D-4** | **Solista** ⇔ la prenotazione **non ha istruttore**. La currency si valuta solo allora, e solo per un soggetto currency (19.7a D-8: pilota o allievo attivo, non archiviato); una prenotazione con istruttore è doppio comando e non controlla la currency. | §4.5, R-19-i, R-19-l; la prenotazione non ha il flag «solista» del volo Scuola | aggiungere un flag «solista» alla prenotazione: nessuna ratifica, e l'auto-prenotazione è solista per definizione |
| **D-5** | **Categoria di prezzo della stima**: `STUDENT` se il profilo allievo è attivo, altrimenti `PILOT`. Su ogni persona che un volo accetta coincide con la regola della 19.3 (pilota → pilota; allievo → allievo; dopo Q-19.3-c i due profili si escludono); per chi è solo istruttore vale `PILOT` («un istruttore ha la licenza», motivazione PO di Q-19.3-c). Minuti = `Math.round((endsAt − startsAt) / 60000)`; ogni componente `Math.round(prezzoOrario × minuti / 60)` (stessa formula di `flights.service.ts:863`, `:1036`); tariffe **in vigore al giorno D** (riga con `validFrom` massimo ≤ D). Una componente **senza tariffa** a D vale 0 (nessun 422 nuovo: oggi le prenotazioni non richiedono tariffe, e la registrazione del volo bloccherà comunque con `NO_AIRCRAFT_RATE`/`NO_INSTRUCTOR_RATE`). | A9, R-19-e, AD-4 emendato | 422 non derogabile per tariffa mancante: un controllo nuovo su ogni prenotazione che nessuno ha chiesto, con decine di fixture e2e senza tariffa |
| **D-6** | **Persona senza conto** (solo istruttore): il check saldo **non si valuta** (`costCents` = null verso il servizio). | nessun volo le si addebita mai (fatti misurati) | saldo 0: blocco certo per un addebito che non esisterà |
| **D-7** | Approvazione di una prenotazione **già passata** (R-16-b): i check si valutano come per ogni altra (scadenze al giorno D, currency e quota a oggi, D-1). Se il volo è già stato registrato, il saldo ha già l'addebito e la stima lo conta una seconda volta: l'admin vede l'avviso e procede. Dichiarato, non corretto. | R-16-b + P1 | escludere i check sulle approvazioni passate: una regola che nessuno ha chiesto |
| **D-8** | Prenotazione staff con **istruttore = persona** (stessa persona nei due ruoli dello **stesso** slot) → **422 `INSTRUCTOR_SAME_AS_PILOT`** (codice e messaggio dei voli, `flights.service.ts:783-785`), su creazione e sulla ri-verifica dell'approvazione; non derogabile. | R-19-o (caso degenere della stessa regola) + precedente dei voli; senza, il predicato nuovo esclude la prenotazione da se stessa e lascerebbe passare proprio il caso più assurdo | lasciarlo passare: una prenotazione che il registro voli rifiuterebbe |
| **D-9** | `force: true` **senza** check falliti non timbra nulla; il timbro `forcedAt`/`forcedByUserId` si scrive su **qualsiasi** scrittura (creazione, modifica, approvazione) che abbia davvero derogato, e **non si azzera** mai (né da una modifica successiva senza deroga, né da «riapri»). | convenzione «scavalcato un blocco, non spuntata una checkbox» (`schema.prisma:1111-1119`), estesa ai due percorsi che ora derogano; A10 «minimo di audit» | azzerarlo: perderebbe la sola traccia di una deroga passata |
| **D-10** | `warnings` del 201 di `POST /bookings` (documenti scaduti **non** bloccanti) **resta**, con la stessa forma: RATING con `blocksBooking = false`, tipo attivo. Le visite (già dalla 19.7a) e la quota (ora un check `MEMBERSHIP`) non vi compaiono. | modifica chirurgica: R-19-h unifica la **deroga**, non le informazioni di successo | toglierlo: un cambio di contratto non richiesto |
| **D-11** | **Addebito quota a saldo insufficiente → 422 `REQUIREMENTS_NOT_MET`** con un solo failure `BALANCE` (`{ type: 'BALANCE', role: 'person', personName, balanceCents: <saldo prima>, costCents: <importo> }`); il codice `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE` **sparisce**. Il controllo resta **dentro** la transazione, sul saldo letto sotto il lock `FOR UPDATE` dell'`Account` (`membership.service.ts:103-105`, review F3/F7): il failure si costruisce lì col tipo e l'helper d'errore condivisi, **senza** chiamare `evaluateRequirements` (che gira prima della transazione, senza lock). | (1) la regola dei client del contratto condiviso (AD-1): `REQUIREMENTS_NOT_MET` ⇒ elenco + «Procedi comunque», ogni altro 4xx ⇒ errore secco — un 422 derogabile con un codice suo sarebbe l'unica eccezione che il client Flutter dovrebbe conoscere, cioè il «secondo pattern» che §4.4 elimina; (2) **stesso predicato**: oggi si rifiuta se `saldo − importo < 0` e «landing EXACTLY on zero is allowed» (`:72-85`, `:109`) ⇔ `saldo < costo`, «uguale = coperto» del BALANCE condiviso; (3) il formatter condiviso lo rende senza copy nuova | tenere `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE` (con `force` al posto di `override`): un secondo codice derogabile; chiamare `evaluateRequirements` con `{ documents: false, currency: null, balance }`: leggerebbe il saldo fuori dal lock e riaprirebbe la corsa di review F3 |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Il servizio dei check è quello della 19.9: contratto concordato, da verificare al T0

Questa story **non** implementa nessun check. Chiama il servizio della 19.9 con i dati della prenotazione e ne inoltra il risultato. Contratto **concordato col writer della 19.9 il 2026-11-01** e scritto in `19-9-avviso-deroga-voli.md` AD-2 (la politica — quale check chiedere — sta nel chiamante; il servizio valuta e basta). **Fa fede il codice committato della 19.9**: al T0 il dev conferma ogni riga e corregge qui i nomi se sono cambiati.

| Elemento | Concordato | Uso dalle prenotazioni |
|---|---|---|
| Modulo | `src/server/services/requirements.service.ts`, sola lettura, senza attore (nessun `authorize`), non lancia | — |
| Funzione | `evaluateRequirements(input): Promise<RequirementFailure[]>` (vuoto = tutto ok) | una chiamata per percorso (AD-3) |
| `input.expiryDateOnly` | data di EXPIRY e della regola mediche, Roma, `YYYY-MM-DD`, obbligatoria (sostituisce il vecchio `dateOnly`, esteso dalla 19.9 per Q-19.10-a = B) | giorno del volo prenotato, D-1 |
| `input.membershipDateOnly` | data di MEMBERSHIP, obbligatoria | **oggi** di Roma (`todayDateOnlyInZone(APP_TIMEZONE)`) **[Q-a = B]** |
| `input.person` | `{ id, name, hasActivePilot, hasActiveStudent, hasActiveInstructor }` (l'ultimo chiesto dalla 19.10: una persona **solo istruttore** prenotata deve avere la scansione «mancanti» sull'ambito INSTRUCTORS; i voli passano sempre `false`) | dai profili già letti (`BOOKABLE_PERSON_SELECT` + nome) |
| `input.instructor` | `{ personId, name } \| null` (scansionato sempre con ambiti ALL + INSTRUCTORS) | titolare dell'istruttore della prenotazione (AD-5) |
| `input.documents` | `boolean` (EXPIRY + MEMBERSHIP) | sempre `true` |
| `input.currency` | `{ dateOnly, excludeFlightId } \| null` (`null` = non solista o esente; `daysSinceLastFlight` è calcolato rispetto a `currency.dateOnly`) | `{ dateOnly: <oggi di Roma>, excludeFlightId: null }` **[Q-a = B]** **solo se** la prenotazione non ha istruttore **e** la persona ha profilo pilota o allievo attivo (19.7a D-8); altrimenti `null` (D-4) |
| `input.balance` | `{ costCents, creditCents } \| null` (`null` = saltato); failure se `saldo + creditCents < costCents` (uguale = coperto; conto assente = saldo 0) | `{ costCents: <stima AD-2>, creditCents: 0 }`; `null` se la persona non ha un `Account` (D-6) |
| `client` | **non previsto**: tutte le letture su `prisma` (le funzioni della 19.7a che il servizio chiama non accettano un client) | l'approvazione chiama il servizio **dentro** la sua transazione con `prisma`, come fa oggi `findBlockingExpiredDocuments` a `:1344` (AD-3) |
| Ordine dell'output | EXPIRY persona, EXPIRY istruttore, MEMBERSHIP persona, MEMBERSHIP istruttore, CURRENCY, BALANCE | non si riordina |
| Tipi (`src/lib/schemas/requirements.ts`, registrato una volta nell'OpenAPI) | `EXPIRY { role, personName, typeName, expiresAt \| null }` (null = mancante); `MEMBERSHIP { role, personName, expiresAt \| null }` (null = mai pagata); `CURRENCY { role: 'person', personName, lastFlightDate \| null, daysSinceLastFlight \| null, flightsInWindow, minFlights, windowDays }`; `BALANCE { role: 'person', personName, balanceCents, costCents }`; `AIRCRAFT_OUT_OF_SERVICE { registration, reason \| null, outOfServiceUntil \| null }` **solo voli** | sulle prenotazioni il fuori servizio resta un 422 a sé, non derogabile (§4.4): `AIRCRAFT_OUT_OF_SERVICE` non compare mai nei loro `failures` |
| Errore | 422 `REQUIREMENTS_NOT_MET`, `details: { failures }` (helper esportato dalla 19.9) | regola per i client: `REQUIREMENTS_NOT_MET` ⇒ elenco (+ «Procedi comunque» se si può); ogni altro 4xx ⇒ errore secco |
| Permesso di deroga | **`requirements.force`** (solo ADMIN; la 19.9 rinomina `flights.forceExpiry`) | unico gate di `force` anche sulle prenotazioni, al posto di `bookings.manage.any` (P3) |
| UI | formatter puro `src/lib/requirement-failures.ts` → `{ who: { name, role } \| null, key, values }`; componente `src/components/dashboard/requirements-warning.tsx` con testi da `useTranslations('Requirements')` (plurali ICU per la currency), props `failures`, `canProceed` (`false` = modalità **bloccata**, nessun bottone), `onProceed`, `onCancel`, `submitting`, `error`, `moneyLocale`, `title?` (predefinito `Requirements.title`); testid `requirements-warning`, `requirements-warning-item` (con `data-type`), `requirements-proceed`, `requirements-cancel`, `requirements-proceed-error` | AD-6; `title` dalle prenotazioni (§3.8) |
| i18n | namespace condiviso `Requirements.*` | mai testi per tipo di check in `BookingsPage` |

Se il servizio committato non accetta `hasActiveInstructor` o le tre date di riferimento distinte (`expiryDateOnly`, `membershipDateOnly`, `currency.dateOnly`), o il componente non ha la modalità bloccata o la prop `title`, vale la regola del banner: **fermarsi e segnalarlo**

**Nomi nel `input`**: `BOOKABLE_PERSON_SELECT` (`:277-283`) prende `firstName`/`lastName`; `assertActiveInstructorProfile` (`:306-318`) restituisce `{ id, personId, name }`; `EDITABLE_BOOKING_SELECT` (`:900-909`) prende i profili e il nome della persona e `instructorProfile: { select: { personId, person: { select: { firstName, lastName } } } }`. Nome = stessa composizione usata dalla 19.9.

### AD-2 — Stima del costo (A9, D-5, D-6): una funzione locale del service, senza attore

`estimateBookingCostCents(client, { aircraftId, instructorProfileId, startsAt, endsAt, priceCategory })` in `bookings.service.ts`, privata:
- `dateOnly = dateOnlyInZone(startsAt, APP_TIMEZONE)`; tariffe via `client.aircraftRate.findFirst({ where: { aircraftId, validFrom: { lte: parseDateOnlyUtc(dateOnly) } }, orderBy: [{ validFrom: 'desc' }] })` e l'analogo su `instructorRate` (query **tipizzata** su `@db.Date`, mai SQL grezzo: lezione review 3.5 F1 citata da `rates.service.ts:217-221`);
- `minutes = Math.round((endsAt − startsAt) / 60_000)`; prezzo velivolo = colonna della categoria (`studentPriceCents`/`pilotPriceCents`, nomi della 19.3); componente assente = 0.

**Non** si riusano `getEffectiveRate`/`getEffectiveInstructorRate` (gate `aircraft.manage`/`people.read`: un pilota riceverebbe 403). La regola della categoria (D-5) è una riga accanto alla stima; se la 19.3 ha esportato un helper puro della categoria per profili, riusarlo invece di riscriverla.

### AD-3 — «Valuta, poi decidi per ultimo»: la deroga è l'ultimo cancello prima della scrittura

Ordine nei tre percorsi (le righe sono quelle di HEAD):

| Percorso | Ordine |
|---|---|
| **Creazione** | authorize → regole own (403) → `force` senza `requirements.force` 403 (posizione di `:632-637`, invariata; cambia solo il permesso) → persona 404/409/422 → **D-8** (staff) → `BOOKING_IN_PAST` → finestra → **valutazione dei check** (fuori transazione, `prisma`) → transazione: lock `Aircraft` + 404/409/422 → lock persone (AD-5) → 409 sovrapposizioni → **se `failures.length > 0` e non `force` ⇒ 422 `REQUIREMENTS_NOT_MET`** → `create` (timbro se `failures.length > 0`). |
| **Modifica** | authorize → **`force` senza `requirements.force` 403** (nuovo, **prima** della lettura della prenotazione) → lettura 404 → stato 409 → own+timing → merge → `endsAt > startsAt` → `BOOKING_IN_PAST` (own) → finestra → **valutazione dei check sul merge** (D-3) → transazione: lock `Booking` → lock velivoli `ORDER BY id` → 404/409/422 sul velivolo di destinazione → lock persone → 409 → **decisione** → `updateMany` guardato (timbro se derogato). |
| **Approvazione** | authorize(`bookings.manage.any`) → `force` senza `requirements.force` 403 (oggi coincidono: entrambi solo ADMIN) → motivo del rifiuto → transazione: lock `Booking` → 404 → transizione legale → `BOOKING_NOT_STARTED` (FLOWN/NO_SHOW) → ramo APPROVED: persona 409/422, istruttore 409, **D-8** → **valutazione dei check** (dentro la transazione, con `prisma`: il servizio non accetta un client) → finestra → lock `Aircraft` + 404/409/422 → lock persone → 409 → **decisione** → `updateMany` guardato (timbro se derogato). |

La valutazione **prima** dei lock non tiene lock durante le sue query; la decisione **dopo** i 409 garantisce che l'avviso compaia solo quando ogni controllo non derogabile è passato. I check sono check-then-act, come oggi blocco scadenze e finestra (TD 16.3-d): i lock chiudono la corsa sulla **sovrapposizione**, nient'altro. Nota sul pool: oggi l'approvazione già chiama `prisma` dentro la sua transazione (`:1344`, `:1357`); il servizio della 19.9 continua quel pattern (nessun client), quindi nessuna connessione in più rispetto a oggi per richiesta.

### AD-4 — Contratto API

| Endpoint | Cambia |
|---|---|
| `POST /api/v1/bookings` | body: via `forceReason` e il secondo `.refine` (`schemas/bookings.ts:42`, `:48-51`); `force` resta. 422 `REQUIREMENTS_NOT_MET` con `details.failures[]` al posto di `EXPIRED_DOCUMENTS`. 201 invariato (`{ booking, warnings }`, D-10). |
| `PATCH /api/v1/bookings/{id}` | body: `force: z.boolean().optional()`; il `.refine` «almeno un campo» conta solo `aircraftId`/`startsAt`/`endsAt`/`notes` (un body `{ force: true }` da solo resta 422 `VALIDATION_ERROR`). 403 se `force` senza `requirements.force`. 422 `REQUIREMENTS_NOT_MET`. |
| `POST /api/v1/bookings/{id}/transition` | body: `force: z.boolean().optional()` con `.refine(force ⇒ to === 'APPROVED')`. 422 `REQUIREMENTS_NOT_MET` sul ramo APPROVED. |
| item (`bookingItemSchema`) | invariato (`forcedAt` resta: il DTO non è UI; A10 chiede che non sia **mostrato**). |

`EXPIRED_DOCUMENTS` sparisce dalle prenotazioni (`grep -rn EXPIRED_DOCUMENTS src` → 0 dopo 19.9+19.10). Descrizioni OpenAPI riscritte (`registry.ts:1426-1428`, `:1462-1465`, `:1496-1499`): i quattro check, chi deroga, ordine «ultimo cancello», R-19-o nella frase 16.3 dei 409, nessun `forceReason`, nessun «TD 16.3-a».

### AD-5 — R-19-o dentro i lock della 16.3

**Lock** — `lockBookingPeople(tx, personId, instructorPersonId: string | null)`:

```ts
const personIds = instructorPersonId && instructorPersonId !== personId ? [personId, instructorPersonId] : [personId];
await tx.$queryRaw`SELECT "id" FROM "Person" WHERE "id" IN (${Prisma.join(personIds)}) ORDER BY "id" FOR NO KEY UPDATE`;
```

- **Una** istruzione con `ORDER BY "id"`: Postgres applica il lock nell'ordine di uscita del sort (stesso idioma di `bookings.service.ts:1100` e `flights.service.ts:1484`), quindi due transazioni che bloccano le stesse due persone non possono incrociarsi.
- Il lock `InstructorProfile` (`:345-347`) **si toglie**: `InstructorProfile.personId` è unico, quindi ogni scrittore che coinvolge l'istruttore IP blocca già la riga `Person` del suo titolare. Ordine globale: **`Booking → Aircraft → Person (1 o 2 righe, ORDER BY id)`**. `FOR NO KEY UPDATE` invariato (emendamento 1 della 16.3: non blocca i controlli FK).
- Censimento da rifare al T0 e riportare nel record (`grep -rn "FOR UPDATE\|FOR NO KEY UPDATE" src/server`): su HEAD nessun'altra transazione blocca due righe `Person`; la 19.3 aggiunge `Person → Account` in `upsertProfile` (una riga, senza `Aircraft`/`Booking`): nessun ciclo possibile.

**`instructorPersonId`** si risolve una volta per percorso, senza query nuove dove possibile: creazione staff → `assertActiveInstructorProfile` restituisce anche `personId` (`:306-318`); creazione dell'istruttore per l'allievo → `actor.personId`; modifica → `EDITABLE_BOOKING_SELECT` (`:900-909`) prende `instructorProfile: { select: { personId: true } }` e i profili della persona (servono anche ad AD-2/AD-1); approvazione → `assertActiveInstructorProfile(tx, …)`.

**Predicati** (`findBookingConflict`, `:378-413`; args + `instructorPersonId`), precedenza **invariata** AIRCRAFT → PERSON → INSTRUCTOR:

| Soggetto | `where` (più `excludeSelf` e `overlapping` come oggi) | Codice |
|---|---|---|
| AIRCRAFT | **byte-identico** a oggi | `CONFLICT`, senza `details` |
| PERSON | `OR: [{ personId: P }, { instructorProfile: { personId: P } }]` | `PERSON_BUSY` |
| INSTRUCTOR (solo se c'è) | `OR: [{ instructorProfileId: IP }, { personId: Q }]` (Q = titolare di IP) | `INSTRUCTOR_BUSY` |

Il codice nomina il **soggetto della richiesta** che è occupato, qualunque ruolo abbia nell'altra prenotazione; `details` = la prenotazione in conflitto più vicina (`orderBy startsAt asc`), come oggi. Nessun dato nuovo su terzi: la prenotazione nominata coinvolge per costruzione la stessa persona che la richiesta nomina (stesso argomento della 16.3 AD-3). `bookingConflictError` (`:426-434`) invariata. Doc-comment: via «NOT covered, declared (TD 16.3-a)» (`:374-376`), via il paragrafo «Perché il predicato-persona NON passa per l'istruttore» dal modulo e da `schema.prisma`.

**Misura** (non soglia): `EXPLAIN (ANALYZE, BUFFERS)` dei due predicati nuovi su `airmanager_load` **in sola lettura** (`SELECT current_database()` nel record; mai scritture, migrazioni o indici su quel DB), con P = una persona che sul DB è sia `personId` sia istruttore di prenotazioni APPROVED. Tempo nel record. Nessun indice nuovo salvo misura che lo giustifichi (decisione da riportare alla sessione principale, non da prendere da soli).

### AD-6 — UI: un solo avviso, quattro superfici

Componente dell'avviso = quello della 19.9 (AD-1). Contenuto per tipo di check = testi della 19.9.

- **Form «Nuova prenotazione»** (`new-booking-form.tsx`): sul 422 `REQUIREMENTS_NOT_MET` l'avviso compare **dentro** il form, al posto della sezione «Forza prenotazione» (`:546-596`) e del ramo `EXPIRED_DOCUMENTS` (`:349-360`). Prop nuova `canForce` (calcolata dalla pagina con `hasPermission(actor, 'requirements.force')`, passata da `BookingsTable`, al posto del vecchio specchio `mode === 'staff'`): `true` → «Procedi comunque» rimanda il body appena rifiutato + `force: true` (stato `pendingForceBody` come oggi, senza `forceReason`, senza textarea); `false` → il componente con `canProceed={false}` e `title` = `BookingsPage.requirements.blockedTitle` (modalità bloccata: elenco, nessun bottone). `title` = `BookingsPage.requirements.title` quando si può procedere. Errori del rinvio: un 409 o un 422 non derogabile (forzare non può più servire, lezione review 16.3 MAJOR-1) prende il suo messaggio con la stessa mappa del primo invio (409 → `conflictMessage`, 422 noti → i loro testi) nel banner del form e l'avviso si chiude; solo un errore non riconosciuto o di rete resta dentro l'avviso via la prop `error` (`requirements-proceed-error`); `labels.force.generic` («Riprova») sparisce. Un nuovo submit del form azzera l'avviso (come oggi `resetForceState`).
- **Form «Modifica»** (`edit-booking-form.tsx`): stessa prop `canForce`; stesso comportamento; via il ramo `EXPIRED_DOCUMENTS` (`:196-198`).
- **Approvazione desktop** (`bookings-table.tsx`, `handleApprove` `:274-280`): sul 422 `REQUIREMENTS_NOT_MET` niente toast, ma un `mini-modal` (stesso markup del modale di rifiuto, `:791-829`) con l'avviso, «Annulla» e «Procedi comunque» → transizione con `force: true` → toast di successo come oggi.
- **Approvazione mobile**: sheet della lista Prenotazioni (`renderSheetActions`, `:438-450`; `sheetStep` `:214` guadagna `'requirements'`) e sheet della Panoramica (`mobile-pending-bookings.tsx:116-139`, stato `denying` → passo dedicato): un passo dello sheet con l'avviso e i due bottoni, focus sul primo bottone del passo (lezione review 15.2 F1, già applicata ai passi «rifiuta»/«annulla»).
- **`postBookingTransition`** (`booking-transition.ts:96-131`): parametro `force?: boolean`; l'esito di un 422 `REQUIREMENTS_NOT_MET` porta `failures` (non `stale`, non un messaggio da toast); `bookingErrorMessage` perde `EXPIRED_DOCUMENTS` (`:57-60`). `booking-transition.test.ts` aggiornato.
- **testid**: dentro ogni superficie l'avviso è il componente della 19.9 coi **suoi** testid (`requirements-warning`, `requirements-warning-item`, `requirements-proceed`), mai rinominati; le superfici aggiungono solo il **contenitore**: desktop `booking-requirements-modal`; sheet lista `booking-requirements-step-mobile` (nessun selettore `^=` su `booking-`: censimento `grep -rn 'data-testid\^=' e2e/` su HEAD); Panoramica `mobile-overview-requirements`. Ogni locator è **scoped** al contenitore o al form (`getByTestId('new-booking-form')`, `getByTestId('move-booking-form')`): nella Panoramica admin `FlightEditor` e `BookingsTable` sono montati insieme (`dashboard/page.tsx:533`, `:674`). `force-booking-*` spariscono.
- Coerenza visiva AirOps; nessun colore nuovo; verifica a 1280 e 375 px, tema chiaro e scuro.

### AD-7 — Migrazione e schema

`prisma/migrations/<ts>_booking_drop_force_reason/migration.sql` (dopo l'ultima della 19.9): commento in testa (story, A10, R-19-a) + `ALTER TABLE "Booking" DROP COLUMN "forceReason";`. `schema.prisma`: via `forceReason` (`:1123`), doc-comment dei campi `forcedAt`/`forcedByUserId` (`:1111-1119`: deroga di **qualsiasi** check su creazione/modifica/approvazione, mai azzerato, non mostrato) e paragrafo «Expiry-based creation block» del doc-comment del modello (`:1077-1085`) riscritti; doc 16.3 dei tre soggetti e dell'ordine dei lock (`:1026-1039`: «`Person` → `InstructorProfile`» diventa «`Person` (1 o 2 righe, `ORDER BY id`)», più R-19-o) e rivalutazione `btree_gist` (`:1040-1047`, invariata nella sostanza). Prova su DB gemello come le migrazioni precedenti (catena da zero, `prisma migrate diff` vuoto); `airmanager_load` **non** si migra.

### AD-8 — Doc-comment da riscrivere

`bookings.service.ts`: modulo (`:43-61` ordine di verifica, `:63-100` concorrenza con R-19-o e l'ordine dei lock nuovo, `:119-129` blocco scadenze → requisiti), `createBooking` (`:548-585`), `updateBooking` (`:985-996`, `:998-1014`), `transitionBooking` (`:1270-1284`), `lockBookingPeople` (`:322-342`), `findBookingConflict` (`:355-377`); `schemas/bookings.ts` (`:25-32`, `:128-136`, `:238-247`). Nessun commento che citi `forceReason`, `EXPIRED_DOCUMENTS` o «cancella e ricrea con force» sulle prenotazioni.

### AD-9 — Fixture e2e: tre regole

1. **Fixture API admin** che creano, spostano o approvano prenotazioni **non** per provare i check → `force: true` nel body (precedente: le fixture volo, `mobile-logbook.spec.ts:156-171`). Un 409 o un 422 non derogabile resta tale (AD-3), quindi i test di sovrapposizione, finestra e fuori servizio continuano a provare ciò che provano.
2. **Flussi own-path** (pilota/istruttore che prenota o sposta, da API o da UI) e **flussi UI admin** che non riguardano i check → le persone coinvolte rese conformi con un helper nuovo e **idempotente** in `e2e/helpers.ts`: `ensureBookingRequirements(adminPage, personId, { solo })` = idoneità valide (`ensureValidSeedExpiries`), quota registrata via `POST /api/v1/expiries` sul tipo `MEMBERSHIP` con `FAR_FUTURE_DATE` (409 = già presente), saldo ricaricato via `POST /api/v1/people/{id}/account/top-ups` se sotto una soglia ampia, e — solo con `solo: true` e se la persona non ha voli nella finestra (`GET /api/v1/flights?personId=…&dateFrom=…`) — un volo ieri via `registerFlightOn` (19.7a) con `force: true`, su un velivolo dell'helper con tariffa da `seedAircraftRate` (19.3). Preferire persone **run-unique**; sul pilota e sull'istruttore del seed l'helper è ammesso (saldo che accumula per progetto, fatti misurati) ma mai su uno spec che asserisce i loro voli o la loro quota senza averlo verificato.
3. Gli spec **nuovi** dei check usano persone run-unique e **non** scrivono AppSettings globali (currency ai predefiniti X = 1, Y = 90: X > 1 è provato a unità nella 19.7a). Nessuno spec nuovo nella catena serializzata.

Censimento obbligatorio al T0 (riportato nel record, con il destino di ogni riga): `grep -rnE "api/v1/bookings|new-booking-form|move-booking-form|booking-approve-action|mobile-overview-approve|force-booking|EXPIRED_DOCUMENTS|forcedAt" e2e`.

### AD-10 — Deroga dell'addebito quota (P8, D-11)

Righe misurate su HEAD; la 19.7a/19.7b le fanno slittare (banner).

- **Service** (`membership.service.ts:84-…`): ordine `authorize(finance.manage)` → **`input.force` senza `requirements.force` ⇒ 403** (nuovo, **prima** della query sulla persona, `:87`) → persona 404 (la `select` prende anche `firstName`/`lastName` per `personName`, stessa composizione della 19.9) → transazione: upsert `Account` → lock `FOR UPDATE` → saldo → **`saldo − importo < 0` e non `force` ⇒ 422 `REQUIREMENTS_NOT_MET`** con il failure di D-11 (al posto di `:108-127`) → scritture invariate (movimento, upsert tipo, rinnovo, wipe `SentAlert`). Il ramo morto `authorize(actor, 'settings.manage')` dentro la transazione (`:111-118`, «structurally unreachable», review 14.9 F5) **sparisce**: il gate è uno solo, in testa. `balanceAlert` invariato (doc-comment `:18-26`: «`true` solo su un addebito derogato»). Nessun timbro: l'addebito quota non ha colonne `forcedAt` e A10 non ne chiede.
- **Schema** (`src/lib/schemas/membership.ts:8-17`): `override` → `force: z.boolean().optional().default(false)`; doc-comment riscritto (gate `requirements.force`, nessuna motivazione). Un body con `override` è accettato e il campo ignorato (Zod non-strict): nessuno lo manda più dopo questa story.
- **`Idempotency-Key` obbligatoria, intatta** (route `people/[id]/membership-fee/route.ts:17-24`): un 422 **libera** il record (`handler.ts:444-450`, «a failed attempt frees the key immediately»), e il modale genera una chiave nuova a ogni invio (`scadenze-console.tsx:813`, `randomIdempotencyKey()`), quindi il rinvio con `force: true` non incontra mai `IDEMPOTENCY_KEY_MISMATCH` né un replay del 422; un addebito **riuscito** con deroga, ripetuto con la stessa chiave, si **riproduce** come oggi (nessun doppio addebito). Compatibile con la chiave stabile lato client della 16.6b (stesso motivo: il 422 libera la chiave).
- **OpenAPI** (`registry.ts:1755-1767`): body `{ amountCents, force? }`, `force` = `requirements.force`; 422 `REQUIREMENTS_NOT_MET` con un failure `BALANCE`; nessun `override`, nessun `settings.manage`, nessun `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`.
- **UI** (`expiries/scadenze-console.tsx`, `MembershipFeeModal` `:749-915`; montaggio `:622-631`; `page.tsx:69`, `:134`, `:208`): prop `canOverride` → **`canForce`** = `hasPermission(actor, 'requirements.force')` calcolato in `expiries/page.tsx` (oggi riusa `canTriggerReminders` = `settings.manage`, `page.tsx:69`); via la casella «Forza addebito» (`:883-888`) e lo stato `override` (`:793`); sul 422 `REQUIREMENTS_NOT_MET` il modale mostra il componente condiviso `requirements-warning.tsx` (al posto del banner `membership-fee-error` di `:819-826`) con «Procedi comunque» se `canForce` → stesso body + `force: true`, **chiave nuova** → successo come oggi (saldo e scadenza nel messaggio `membership-fee-success`); senza `canForce` la modalità bloccata. «Annulla» dell'avviso torna al form con i valori intatti. Ogni altro errore resta `genericError`. Il modale a tutto schermo sotto 640 px (15.7) resta una sola modalità CSS dello stesso nodo: l'avviso sta **dentro** `membership-fee-panel`, i bottoni ≥ 44 px.
- **CSS** (`src/styles/airops.css`): via le regole della casella `.membership-fee-override-label` (`:2790`, `:2920-2921`); il commento di `:3330-3332` che la cita come idioma si riformula senza il riferimento.

---

## §2 — Acceptance Criteria

### A — Contratto, ordine, deroga (server)

1. **Forma unica**: creazione, modifica e approvazione con almeno un check fallito rispondono **422 `REQUIREMENTS_NOT_MET`** con `details.failures[]` validato dallo **stesso** schema Zod dei voli (unit: `safeParse` dello schema della 19.9 sui `details` di ciascun percorso; e2e: un caso per percorso).
2. **Ultimo cancello (TD 16.3-g)** — unit su ognuno dei tre percorsi, con il servizio dei check mockato a restituire un fallimento: (a) `startsAt` passato (creazione, modifica own) → `BOOKING_IN_PAST`; (b) fuori finestra → `BOOKING_OUTSIDE_WINDOW`; (c) velivolo fuori servizio → `AIRCRAFT_OUT_OF_SERVICE`; (d) velivolo archiviato → 409; (e) velivolo, persona, istruttore occupati → i rispettivi 409; in **tutti** i casi la risposta è quella non derogabile, e la **stessa** con `force: true` (admin). e2e: una richiesta admin con check falliti **e** fuori finestra → 422 `BOOKING_OUTSIDE_WINDOW`, con e senza `force`.
3. **403 prima di ogni query** (gate `requirements.force`): creazione own-self e own cross-person con `force: true` → 403, nessuna query sulla persona di destinazione né sui check (unit: `prisma.person.findUnique` della persona target e il servizio dei check **non** chiamati); modifica own con `force: true` → 403 **prima** di `prisma.booking.findUnique` (unit). e2e: pilota con `force: true` su POST e su PATCH della propria prenotazione → 403.
4. **Deroga admin e timbro (D-9)**: con check falliti e `force: true` → 201/200 e `forcedAt`/`forcedByUserId` scritti; senza check falliti e `force: true` → nessun timbro; una modifica successiva senza deroga **non** azzera il timbro; «riapri» non lo tocca (unit su `create`/`updateMany` data). e2e: `forcedAt` non nullo nella lista dopo la deroga in creazione **e** dopo la deroga in approvazione.
5. **Schema e migrazione** (AD-4, AD-7): `PATCH` con `{ force: true }` soltanto → 422 `VALIDATION_ERROR`; `transition` con `{ to: 'DENIED', reason, force: true }` → 422 `VALIDATION_ERROR`; un body POST con `forceReason` è accettato e il campo ignorato (Zod non-strict). Migrazione su gemello: `\d "Booking"` senza `forceReason`, `migrate diff` vuoto, catena da zero verde. `grep -rn "forceReason" src prisma/schema.prisma e2e` → 0 dopo 19.9+19.10 (salvo migrazioni e `src/generated` rigenerato).

### B — I quattro check sulla prenotazione

6. **EXPIRY** (e2e API, admin senza `force`, persone run-unique): (a) persona con un RATING bloccante custom scaduto al giorno D → un fallimento `EXPIRY` della persona con nome e data; (b) prenotazione con istruttore la cui unica visita è scaduta → `EXPIRY` dell'**istruttore** (prima: nessun blocco); (c) persona **senza alcuna visita** → `EXPIRY` «mancante» (`expiresAt: null`, nomi delle visite attive, 19.7a D-4; prima: nessun blocco, 19.7a D-5); (d) RATING bloccante scaduto di un tipo **disattivato** → nessun `EXPIRY` (16.4 P1 sul percorso prenotazione); (e) scadenza con `expiresAt` = D → valida.
7. **Date di riferimento** **[Q-a = B]** (unit, con `vi.useFakeTimers` e una prenotazione a D = oggi + 10): i tre percorsi passano `expiryDateOnly` = `dateOnlyInZone(startsAt)` (creazione), quella del merge (modifica), quella della prenotazione bloccata (approvazione) — mai «oggi» — e `membershipDateOnly` = `currency.dateOnly` (quando `currency` non è `null`) = **oggi di Roma** su tutti e tre (anche su un'approvazione di una prenotazione passata, R-16-b); alle 22:59Z in ora legale queste due sono già il giorno dopo di Roma. e2e: RATING bloccante che scade **fra** oggi e D → `EXPIRY` (le scadenze restano al giorno del volo).
8. **CURRENCY** **[Q-a = B]** (e2e, voli con `registerFlightOn`, date relative a **oggi** di Roma): (a) pilota con l'unico volo a oggi − 91 (Y = 90) e prenotazione **senza** istruttore → `CURRENCY`; (b) **lo stesso** pilota, prenotazione admin **con** istruttore → nessun `CURRENCY`; (c) volo a oggi − 90 → nessun `CURRENCY` (bordo); (d) persona solo istruttore senza profilo pilota, prenotazione per sé → nessun `CURRENCY` (19.7a D-8); (e) **ancoraggio a oggi**: volo a oggi − 85 e prenotazione solista a oggi + 10 (a D sarebbero 95 giorni) → **nessun** `CURRENCY`. Unit: `solo` = `instructorProfileId === null` sui tre percorsi.
9. **BALANCE e stima** (unit su `estimateBookingCostCents` e sull'orchestrazione): pilota, 90 min, prezzo pilota 150,00 €/h → 22 500; allievo, stessa tariffa con prezzo allievo 100,00 €/h → 15 000; con istruttore a 40,00 €/h → + 6 000; arrotondamento (`Math.round`) su 50 min a 155,55 €/h; tariffa velivolo assente a D → componente 0; tariffa scelta = quella con `validFrom` massimo ≤ D (una riga futura a D + 1 ignorata); persona senza conto → servizio chiamato con `costCents: null`. e2e: velivolo con tariffa via `seedAircraftRate` (pilota 150,00 €/h), istruttore con `seedInstructorRate` (40,00 €/h), slot di 90 min con istruttore → costo 28 500; saldo 28 499 → `BALANCE` con `balanceCents: 28499`, `costCents: 28500` (nomi dei campi della 19.9); dopo una ricarica di 0,01 € → nessun `BALANCE`.
10. **MEMBERSHIP** (e2e): persona mai pagata → `MEMBERSHIP` della persona con `expiresAt: null`; **[Q-19.9-a]** prenotazione con istruttore la cui quota è scaduta → `MEMBERSHIP` dell'istruttore con la sua data.
11. **Tutti insieme** (e2e): persona run-unique con RATING bloccante scaduto, nessun volo, saldo 0, nessuna quota, prenotazione solista → **un solo** 422 con i quattro tipi, nell'ordine della 19.9. 
11-bis. **Quota ancorata a oggi** **[Q-a = B]** (e2e): quota registrata con scadenza oggi + 5, prenotazione a oggi + 10 → **nessun** `MEMBERSHIP`; quota scaduta ieri → `MEMBERSHIP` con quella data, qualunque sia D.
12. **Su ogni percorso**: (a) **modifica** (D-3): spostare di un'ora **nello stesso giorno** una prenotazione di una persona con saldo insufficiente → 422 (prima: nessun ricontrollo; il test TD-5 «same-day time-only move is unaffected» di `bookings.spec.ts:1605` si riscrive su questa regola); modifica che allunga lo slot oltre il saldo → `BALANCE`; il servizio riceve aircraft, intervallo e data **del merge** (unit); (b) **approvazione**: PENDING di un pilota conforme alla creazione, poi saldo ridotto con una rettifica → `transition APPROVED` → 422 `REQUIREMENTS_NOT_MET`; con `force: true` → 200 `APPROVED` con timbro.
13. **`warnings` (D-10)**: un RATING **non** bloccante scaduto al giorno D compare in `warnings` del 201, mai in `failures`; la quota scaduta compare in `failures` e mai in `warnings` (unit).

### C — Chi deroga (R-19-h, R-19-l)

14. **Admin**: creazione → 422 → `force: true` → 201 `APPROVED`; modifica → 422 → `force` → 200; approvazione → 422 → `force` → 200 (e2e API, un caso ciascuno; i dettagli dei timbri in AC 4).
15. **Pilota che si prenota** (own-self): 422 con l'elenco; `force` → 403 (AC 3). **Istruttore per sé**: idem. **Istruttore per l'allievo**: 422 che elenca i fallimenti **dell'allievo e dell'istruttore**; `force` → 403. **Own-path che sposta**: 422, nessuna deroga.
16. **R-19-l invariata** (pin di regressione): POST own-self con `instructorProfileId` → 422 come oggi (`:610-615`); nel form, modalità `pilot` senza selettore istruttore.

### D — R-19-o e lock

17. **PERSON_BUSY incrociato** (e2e API): P istruttore di una prenotazione APPROVED sul velivolo A, 10:00-11:00; prenotazione di P come persona sul velivolo B 10:30-11:30 → **409 `PERSON_BUSY`** con `details` = la prenotazione di A, su **creazione**, **spostamento** e **approvazione**; slot che si toccano (11:00) → nessun conflitto; una PENDING non blocca.
18. **INSTRUCTOR_BUSY incrociato** (e2e API): P persona di una prenotazione APPROVED su A; prenotazione su B con istruttore P → **409 `INSTRUCTOR_BUSY`** con `details` = la prenotazione di P, su creazione, spostamento e approvazione.
19. **Lock** (unit, sui tre percorsi): il lock persone è **una** `$queryRaw` con `FROM "Person"`, `IN (…)`, `ORDER BY "id"`, `FOR NO KEY UPDATE`, e lega i due id (persona e titolare dell'istruttore; uno solo senza istruttore o se coincidono); **nessuna** query `FROM "InstructorProfile" … FOR NO KEY UPDATE`; ordine `invocationCallOrder` = `['Booking', 'Aircraft', 'Person']` (modifica, approvazione) e `['Aircraft', 'Person']` (creazione). I test 16.3 sui `where` esatti dei predicati si aggiornano agli oggetti di AD-5, **senza** passare a `objectContaining`; il predicato velivolo resta esatto e invariato.
20. **Sonda di concorrenza** (e2e, come la 16.3): P con due PENDING sovrapposte, una come **persona** su A e una come **istruttore** su B; due approvazioni **in parallelo** (`Promise.all`) → esattamente `[200, 409]` (409 `PERSON_BUSY` o `INSTRUCTOR_BUSY` secondo chi vince), **10 ripetizioni su 10**. Discriminanza nel record: con il lock che blocca la sola persona della prenotazione (istruttore non incluso) la stessa sonda osserva almeno un `[200, 200]` (repo poi ripristinato byte-identico, sha256 prima/dopo). Dopo tutte le sonde, SQL: coppie APPROVED sovrapposte per «essere umano» (unione `personId` / `InstructorProfile.personId`) = 0 fra le fixture della sonda.
21. **D-8**: creazione staff con l'istruttore della persona stessa → 422 `INSTRUCTOR_SAME_AS_PILOT`; con `force: true` → stesso 422 (unit + e2e API).
22. **Misura** di AD-5 nel record (EXPLAIN su `airmanager_load` in sola lettura).

### E — UI

23. **Form «Nuova prenotazione», admin** (e2e UI, persona run-unique non conforme): invio → **un solo** avviso dentro il form con le righe dei check falliti (testi della 19.9) e «Procedi comunque» → successo, pannello pulito, prenotazione in lista; nessun campo motivo; `force-booking-section` assente dal DOM (`toHaveCount(0)`).
24. **Form, pilota e istruttore** (e2e UI): stesso elenco, **nessun** `requirements-proceed` (`toHaveCount(0)` scoped al form), titolo `blockedTitle`; nessuna prenotazione creata.
25. **Errori del rinvio** (e2e UI + unit della mappa): la persona è non conforme **e** il velivolo diventa occupato fra il primo invio e «Procedi comunque» (prenotazione APPROVED creata via API nel mezzo) → banner col messaggio di sovrapposizione, avviso chiuso; stesso esito per fuori servizio (con `{reason}`) e `PERSON_BUSY`. Mai «Riprova» per un codice noto (`grep -rn "force.generic" src` → 0).
26. **Form «Modifica»**: admin → avviso + «Procedi comunque» → 200; pilota proprietario → elenco senza bottone (e2e UI, una ciascuno).
27. **Approvazione desktop** (e2e UI): PENDING non conforme → «Approva» → `booking-requirements-modal` con l'elenco (`requirements-warning-item` scoped) → «Annulla» chiude e la prenotazione resta PENDING → «Approva» di nuovo → `requirements-proceed` → toast di successo, stato «Approvata».
28. **Approvazione mobile** (e2e a 375 px): sheet della lista (`booking-requirements-step-mobile` → `requirements-proceed` scoped) e sheet della Panoramica (`mobile-overview-requirements` → `requirements-proceed` scoped): l'elenco, il focus sul primo bottone del passo, l'approvazione riuscita chiude lo sheet; nessun 409/422 noto finisce su un toast generico.
29. **`postBookingTransition`** (unit `booking-transition.test.ts`): 422 `REQUIREMENTS_NOT_MET` → `{ ok: false, stale: false, failures: [...] }`; `force: true` nel body solo quando passato; il resto della mappa invariato.
30. **Verifica UI** (Playwright MCP o script throwaway in /tmp): screenshot a **1280** e **375**, tema **chiaro e scuro**, dei quattro avvisi (form nuovo admin e pilota, modifica, modale desktop, due passi mobile); nessun overflow orizzontale; i bottoni del passo mobile ≥ 44 px.

### F — Contratti, documenti, gate

31. **OpenAPI servito**: `GET /api/v1/openapi.json` contiene `REQUIREMENTS_NOT_MET` sulle tre operazioni e su `POST /api/v1/people/{id}/membership-fee`, `force` nei body di PATCH, transition e membership-fee; non contiene `override` né `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`; non contiene `forceReason` né `EXPIRED_DOCUMENTS` sulle prenotazioni; `registry.test.ts` aggiornato con un'asserzione di **assenza**.
32. **Doc-comment** di AD-8 riscritti; `grep -rn "TD 16.3-a\|EXPIRED_DOCUMENTS\|forceReason" src/server/services/bookings.service.ts src/lib/schemas/bookings.ts prisma/schema.prisma` → 0.
33. **i18n** (§3.8): chiavi tolte e aggiunte in **entrambi** i file, parità verde, nessuna chiave orfana.
34. **Unit**: `npm run gates` verde; ogni file di test nuovo o toccato passa anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` (il servizio della 19.9 trascina `currency.service` → `app-settings.service` → `@/lib/env` e `membership.service` → `accounts.service` → mail: mockare la catena, §5.7).
35. **e2e**: arbitro completo verde su DB fresco via `scripts/e2e.sh` (conteggio prima/dopo dichiarato, test nuovi e cambiati elencati col destino del censimento di AD-9).

### G — Deroga dell'addebito quota (P8, AD-10)

36. **Service e contratto** (unit `membership.service.test.ts`): saldo 3 000, importo 5 000, senza `force` → `ValidationError` con codice `REQUIREMENTS_NOT_MET` e `details.failures` = `[{ type: 'BALANCE', role: 'person', personName, balanceCents: 3000, costCents: 5000 }]` (validato con lo schema condiviso), **nessuna** scrittura; saldo 5 000, importo 5 000 → addebito riuscito (uguale = coperto); `force: true` da un attore senza `requirements.force` → `ForbiddenError` **prima** di `prisma.person.findUnique` e di `$transaction`; `force: true` da admin con saldo 0 → addebito riuscito, `balanceAlert: true`; `force: true` con saldo sufficiente → addebito identico a quello senza `force`. Gli unit che passano `override: false` (`:125-239`) passano `force`/nulla. `grep -rn "MEMBERSHIP_FEE_INSUFFICIENT_BALANCE\|override" src/server/services/membership.service.ts src/lib/schemas/membership.ts` → 0.
37. **Idempotency-Key** (e2e API in `membership-fee.spec.ts`): (a) senza header → 422 `IDEMPOTENCY_KEY_REQUIRED` anche con `force: true` (invariato); (b) prima richiesta a saldo 0 → 422 `REQUIREMENTS_NOT_MET`; rinvio con `force: true` e la **stessa** chiave → 200 (il 422 ha liberato la chiave), nessun `IDEMPOTENCY_KEY_MISMATCH`; (c) lo stesso rinvio ripetuto con quella chiave → replay (`Idempotency-Replayed: true`), **un solo** movimento `ADJUSTMENT` nell'estratto conto; (d) il test di replay esistente (`:137-164`) verde invariato.
38. **UI desktop** (`membership-fee.spec.ts`, riscritti `:182-210` e `:211-235`): pilota run-unique a saldo 0 → «Addebita» → dentro `membership-fee-panel` l'avviso condiviso (`requirements-warning`) con una riga di saldo insufficiente (saldo e importo) e nessun addebito (estratto conto senza `ADJUSTMENT`); «Procedi comunque» (`requirements-proceed`) → `membership-fee-success` con saldo −50,00 € e scadenza a 12 mesi; movimento `ADJUSTMENT` −5 000. `membership-fee-override-checkbox` assente dal DOM (`toHaveCount(0)`).
39. **UI mobile** (`mobile-membership-fee.spec.ts` a 375 px): via le asserzioni sulla casella (`:101-124`, `:134` dalla lista dei testid, `:146`, `:176-177`); il test «saldo insufficiente» (`:157-…`) diventa: avviso dentro il pannello a tutto schermo, `requirements-proceed` ≥ 44 px di altezza e dentro il viewport, «Procedi comunque» → addebito riuscito. Il test dei target (`:77-…`) verifica gli altri controlli come oggi.

---

## §3 — Dev Notes: blast radius (misurato su `eef77ef`)

### 3.1 — Schema e migrazione
`prisma/schema.prisma:1077-1085` (doc del modello), `:1111-1123` (campi), doc 16.3 dei soggetti e dei lock (`:1026-1047`); una cartella in `prisma/migrations/`.

### 3.2 — Server
`src/server/services/bookings.service.ts`: modulo `:16-130`; `BOOKABLE_PERSON_SELECT` `:277-283`; `assertActiveInstructorProfile` `:306-318`; `lockBookingPeople` `:322-348`; `findBookingConflict` `:355-413`; `ExpiredDocument`/`findBlockingExpiredDocuments` `:443-481` (o ciò che ne resta dopo la 19.9: `warnings`, D-10); `createBooking` `:548-768`; `EDITABLE_BOOKING_SELECT` `:900-920`; `updateBooking` `:962-1158`; `transitionBooking` `:1262-1406`. Nuovi: `estimateBookingCostCents` (AD-2), categoria D-5, D-8.

### 3.3 — Zod e OpenAPI
`src/lib/schemas/bookings.ts:25-53` (create), `:54-77` (update), `:238-253` (transition); `src/lib/schemas/registry.ts:1426-1428`, `:1462-1465`, `:1496-1499`; `registry.test.ts`.

### 3.4 — UI
`src/app/[locale]/dashboard/bookings/new-booking-form.tsx` (`:53-84` label, `:168-179` tipi, `:225-236` stato, `:269-281`, `:349-360`, `:375-424`, `:546-596`, `:627-629`); `edit-booking-form.tsx` (`:28-44`, `:157-207`, props `:47-55`); `booking-transition.ts` (`:26-131`) + `booking-transition.test.ts`; `bookings-table.tsx` (`:214`, `:259-280`, `:433-450`, `:791-829`, `:840-870` montaggio dei due form); `booking-labels.ts` (`:100-178`, `:226-239`); `src/app/[locale]/dashboard/mobile-pending-bookings.tsx` (`:50-60` label, `:86-139`, `:250-305`); label della Panoramica mobile in `dashboard/page.tsx` (dove costruisce le label di `MobilePendingBookings`, `:575`). **Dopo la 19.5** i form usano `SearchCombobox` + `Controller`: le righe sopra slittano.

### 3.5 — Seed
Nessun tocco atteso: nessun seed scrive `forceReason` (`grep -n forceReason prisma/seed*.ts` → 0); `seed-load.ts:971` (`createMany` di `Booking`) non elenca la colonna — rileggere dopo la migrazione e passare il typecheck (NON eseguirlo).

### 3.6 — Blast radius e2e
Spec con chiamate alle API prenotazioni (righe che contengono `/api/v1/bookings`, misurate su HEAD): `bookings.spec.ts` 59, `mobile-planning.spec.ts` 9, `api-v1.spec.ts` 8, `mobile-overview.spec.ts` 7, `pdf-exports.spec.ts` 7, `booking-window.spec.ts` 6, `mobile-overview-overflow.spec.ts` 5, `aog-impact-email.spec.ts` 3, `aircraft-out-of-service-until.spec.ts` 2, `home-dashboard.spec.ts` 1, `aircraft-management.spec.ts` 1. Own-path col pilota del seed: `api-v1.spec.ts:155-201`, `:211-246`; `aircraft-out-of-service-until.spec.ts:279-306`; `pdf-exports.spec.ts:231-266`; `aircraft-management.spec.ts:183-190`; `home-dashboard.spec.ts:151`, `:179`; `mobile-overview.spec.ts:460-515`; `mobile-planning.spec.ts:774-819`. Da riscrivere per contenuto:

| Spec | Punto (HEAD) | Destino |
|---|---|---|
| `bookings.spec.ts` «Booking expiry block (7.4)» | `:1446-1674` | riscritto sul nuovo contratto (pilota bloccato senza bottone; admin avviso + «Procedi comunque» senza motivo; `force` da pilota 403; bordo `expiresAt = D`; il test TD-5 `:1605` diventa AC 12a) |
| `bookings.spec.ts` «One person in one place (16.3)» | `:2026-2290` | invariato nella sostanza; fixture admin con `force: true`; `:2241` («Forza prenotazione» su persona occupata, review 16.3 MAJOR-1) riscritto su «Procedi comunque» (con AD-3 il 409 arriva già al **primo** invio: il test lo asserisce) |
| `bookings.spec.ts:271-309` | `createExpiryTypeForBooking`, `registerExpiry` | riusati dagli spec nuovi |
| `api-v1.spec.ts:148-246` | own-path del pilota del seed + approvazione | `ensureBookingRequirements` sul pilota (solista) prima del POST |
| tutti gli altri | fixture | regola 1 o 2 di AD-9, censimento nel record |
| **nuovo** `e2e/booking-requirements.spec.ts` (nome indicativo) | AC 2, 6-12, 14-15, 17-18, 20-21, 23-28 | persone run-unique, nessuna scrittura di AppSettings |

### 3.6-bis — Deroga quota (AD-10)
`src/server/services/membership.service.ts:11-130`; `src/lib/schemas/membership.ts:3-17`; `src/lib/schemas/registry.ts:1755-1767`; `src/app/[locale]/dashboard/expiries/scadenze-console.tsx:95-105` (label), `:622-631`, `:749-915`; `src/app/[locale]/dashboard/expiries/page.tsx:69`, `:134`, `:192-210`; `src/styles/airops.css:2790`, `:2920-2921`, `:3330-3332`; e2e `membership-fee.spec.ts:137-235`, `mobile-membership-fee.spec.ts:77-185`; unit `membership.service.test.ts:110-240`.

### 3.7 — Unit esistenti che cambiano
`membership.service.test.ts` (AC 36); `bookings.service.test.ts` (la mock chain del servizio dei check; i test 7.4/TD-5/force; i test 16.3 sui lock e sui `where` dei predicati — aggiornati agli oggetti nuovi, mai indeboliti; la sequenza di `$queryRaw`), `booking-transition.test.ts`, `registry.test.ts`, eventuali test di `new-booking-form`/`edit-booking-form` se presenti al T0.

### 3.8 — Chiavi i18n (entrambi i file; la copy definitiva è della 19.12)
- **Via (10 per locale)**: `BookingsPage.form.force.{title,description,reasonLabel,submit,requiredReason,generic}`, `BookingsPage.form.errors.EXPIRED_DOCUMENTS`, `BookingsPage.list.actions.errors.EXPIRED_DOCUMENTS`, `ExpiriesPage.registry.membershipFee.{insufficientBalance,overrideCheckbox}` (il saldo insufficiente lo dice il formatter condiviso della 19.9; `genericError` resta).
- **Spostata**: `BookingsPage.form.force.cancel` → `BookingsPage.form.cancel` («Annulla» / «Cancel», usata dal form e dal `closeLabel`).
- **Nuove** (solo i titoli passati alla prop `title` del componente; i testi per tipo di check, «Procedi comunque» e «Annulla» sono `Requirements.*` della 19.9): `BookingsPage.requirements.title` («La prenotazione non rispetta alcuni requisiti» / «This booking does not meet some requirements»), `BookingsPage.requirements.approveTitle` («L'approvazione non rispetta alcuni requisiti» / «Approving this booking does not meet some requirements»), `BookingsPage.requirements.blockedTitle` («Prenotazione non consentita: solo un amministratore può procedere comunque» / «Booking not allowed: only an administrator can proceed anyway»).

---

## §4 — Piano di test

### 4.1 — Unit
`bookings.service.test.ts`: AC 2-5, 7, 8 (`solo`), 9 (stima + `costCents: null`), 12 (argomenti del merge), 13, 19, 21. Il servizio dei check si **mocka a livello di modulo** (le sue regole sono provate dalla 19.9 e dalla 19.7a): qui si prova l'**orchestrazione** — quando è chiamato, con quali argomenti, dove sta la decisione, cosa si scrive. `booking-transition.test.ts`: AC 29. `registry.test.ts`: AC 31.

### 4.2 — e2e (`fullyParallel`, fixture run-unique, `scripts/e2e.sh`)
Persone run-unique; tariffe con `seedAircraftRate`/`seedInstructorRate` (date nel passato via fixture SQL: le API rifiutano `validFrom` < oggi, 19.3 D-7); voli con `registerFlightOn`; date da `todayRome()`/`addDaysIso()`; righe raggiunte per suffisso; celle e importi asseriti in modo esatto (mai `hasText` con date o importi, lezione 11.2); popup dei combobox chiusi interagendo col campo successivo, mai con `Escape` (CLAUDE.md).

### 4.3 — Discriminanze e sonde (nel Dev Agent Record)
(a) **Ultimo cancello**: spostare la decisione **prima** della finestra → l'e2e di AC 2 riceve `REQUIREMENTS_NOT_MET` invece di `BOOKING_OUTSIDE_WINDOW` (rosso); ripristino. (b) **Lock R-19-o**: sonda AC 20 senza la persona dell'istruttore nel lock → almeno un `[200, 200]`. (c) **Predicati**: togliere il ramo `instructorProfile: { personId: P }` → AC 17 rosso. (d) **403 sulla modifica**: spostare il controllo `force` dopo la lettura → unit AC 3 rosso. (e) **Stima**: usare sempre `pilotPriceCents` → unit AC 9 (allievo) rosso. (f) **Quota**: spostare il controllo `force` dentro la transazione → unit AC 36 (403 prima di `person.findUnique`) rosso; confronto `<=` al posto di `<` → unit AC 36 (uguale = coperto) rosso. Ogni ripristino byte-identico, sha256 prima/dopo.

### 4.4 — Gate
`npm run gates`; arbitro e2e completo su DB fresco (`scripts/e2e.sh start`, esito solo da `scripts/e2e.sh status`; build una volta e `E2E_REUSE_SERVER=1` per i run mirati). Prima del primo reset DB controllare i processi vivi su :3000 (sessioni parallele). Run mirati ripetuti sullo stesso DB fanno scattare il lock anti-brute-force: controllare `LoginAttempt` prima di attribuire un fallimento di login alla flake nota.

---

## §5 — Trappole note

1. **Il primo invio con un 409 nascosto** (review 16.3 MAJOR-1): con AD-3 non esiste più — il 409 arriva prima dell'avviso. Se un test vecchio si aspetta «avviso, poi 409 al rinvio», era la vecchia semantica: riscriverlo, non indebolirlo.
2. **Due righe `Person` in due istruzioni** = deadlock possibile fra due approvazioni con ruoli invertiti: **una** istruzione `IN (…) ORDER BY "id"`.
3. **Il lock `InstructorProfile` tenuto «per sicurezza»** non è innocuo: è un secondo ordine da difendere nel censimento. Si toglie (AD-5), e il doc-comment dice perché.
4. **`force` con `to ≠ APPROVED`**: la refine lo rifiuta; senza, un rifiuto con `force: true` passerebbe in silenzio.
5. **Il body `{ force: true }` del PATCH** passa il vecchio `.refine` (`Object.keys(value).length > 0`): la refine conta solo i campi modificabili.
6. **Le tariffe col gate**: `getEffectiveRate` dal percorso del pilota = 403 (AD-2).
7. **Env eager negli unit**: il servizio della 19.9 importa `currency.service` (→ `app-settings.service` → `@/server/crypto/secret-box` → `@/lib/env`) e `membership.service` (→ `accounts.service` → mail). `bookings.service.test.ts` già mocka mail e `app-settings.service`: aggiungere il mock del servizio dei check **a livello di modulo**. Verifica: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.
8. **Date**: stringhe `YYYY-MM-DD` di Roma; `parseDateOnlyUtc` per i confronti tipizzati su `@db.Date`; mai `new Date(string)` grezzo né un `Date` JS legato in SQL grezzo (diventa `timestamptz`).
9. **Persone del seed in parallelo**: l'helper di AD-9 è idempotente ma non atomico; due spec che lo chiamano insieme possono fare due ricariche o due voli. Accettato; non asserire mai conteggi assoluti di voli o movimenti del pilota del seed.
10. **Avviso fuori dal form**: nella Panoramica admin due `SlideOver` coesistono (`FlightEditor`, `BookingsTable`): ogni locator dell'avviso è scoped al suo form o modale.
11. **`Escape` e lo `SlideOver`**: mai per chiudere l'avviso o un popup nei test (CLAUDE.md); l'avviso si chiude con «Annulla» o con un nuovo invio.
12. **Confine con la 19.9**: nessuna regola di check scritta qui; nessun codice d'errore nuovo oltre a quelli della 19.9 e a `INSTRUCTOR_SAME_AS_PILOT` (già esistente).

---

## §6 — Fuori scope DICHIARATO

- Le regole dei check, il componente dell'avviso, `REQUIREMENTS_NOT_MET`, il permesso `requirements.force` → **19.9**.
- La parte «alert job»/contatori della 16.4 (P2: persone archiviate e tipi disattivati): non è una scansione bloccante, **né 19.9 né 19.10** — TD segnalato alla sessione principale dal writer della 19.9.
- La quota, la currency e le visite come dati (registro Scadenze, Impostazioni) → 19.7a/19.7b/19.8.
- Somma dei costi delle prenotazioni aperte nel check saldo (D-2): non richiesta.
- Indice nuovo per i predicati di R-19-o: solo se la misura di AD-5 lo giustifica, su decisione della sessione principale.
- Mostrare `forcedAt` in UI: vietato (A10).
- Le persone già in conflitto per «essere umano» nei dati esistenti (DB di carico): la guardia è sulla scrittura, come nella 16.3 (TD 16.3-c resta).

---

## §7 — Riferimenti

- CR §4.0 (R-19-g/h/i/j/k/l/o), §4.2 righe 19.9-19.10, §4.4, §4.5, §4.6, §4.10 (A9, A10); Q-19.10-a (sopra).
- Story: `19-9-avviso-deroga-voli.md`, `19-7a-*.md` (AD-3/4/5, §5.11-12), `19-3-*.md` (AD-4, D-7), `19-5-*.md` (AD-5), `16-3-*.md` (AD-1, AD-2 + emendamenti, Review Record: PO-1, TD 16.3-a/d/g, sonda D1), `16-4-*.md` (§0 P1), `15-4-*.md` (finestra su ogni modifica), `7-4-*.md`.
- Codice: `src/server/services/{bookings,rates,instructor-rates,accounts,flights}.service.ts`; `src/lib/schemas/{bookings,registry}.ts`; `src/app/[locale]/dashboard/bookings/*`, `dashboard/mobile-pending-bookings.tsx`, `dashboard/page.tsx`; `prisma/schema.prisma:1013-1160`; `e2e/{bookings,api-v1,booking-window,mobile-overview,mobile-planning}.spec.ts`, `e2e/helpers.ts`.

---

## Tasks / Subtasks

- [x] **T0 — Riallineamento**: `git log`; file e codice committati della 19.9 (tabella di AD-1 compilata) e della 19.3/19.5/19.7a; censimenti di §3 e di AD-9 su HEAD, righe corrette in questo file; censimento dei lock (AD-5).
- [x] **T1 — Migrazione e schema** (AC 5).
- [x] **T2 — Stima del costo e categoria** (AC 9).
- [x] **T3 — Orchestrazione dei check sui tre percorsi, ultimo cancello, `force`, timbro** (AC 1-4, 6-8, 10-15, 21).
- [x] **T4 — R-19-o: lock e predicati** (AC 17-20, 22).
- [x] **T5 — Zod, OpenAPI, doc-comment** (AC 5, 31, 32).
- [x] **T6 — UI: form nuovo e modifica** (AC 23-26).
- [x] **T7 — UI: approvazione desktop e mobile, `postBookingTransition`** (AC 27-29).
- [x] **T8 — i18n** (AC 33).
- [x] **T9 — e2e**: helper `ensureBookingRequirements`, spec adattati secondo il censimento, spec nuovo, sonda di concorrenza (AC 35).
- [x] **T10 — Deroga dell'addebito quota**: service, schema, OpenAPI, modale, CSS, i18n, unit ed e2e (AC 36-39).
- [x] **T11 — Gate, discriminanze, verifica UI** (AC 30, 34, §4.3; la verifica UI comprende il pannello quota a 1280 e 375 px, chiaro e scuro).

---

## Dev Agent Record

### Agent Model Used

Opus 5.5 (`claude-opus-5-5`), dev subagent `dev-19-10` — un solo dev per la story. Skill: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` (lettura «dashboard AirOps esistente, nessun nuovo linguaggio visivo»: token AirOps, nessun colore nuovo, nessun em-dash nella copy nuova), `ui-ux-pro-max` (ricerche «modal dialog focus management return focus after close», «bottom sheet touch target 44px mobile confirm step»: chiusura esplicita, target ≥ 44 px, 8 px fra i bottoni — già nel componente della 19.9). Niente Playwright MCP: `playwright-core` su `chromium-1228`, `localhost`.

### §A — Riallineamento sul HEAD (T0): contratto 19.9 compilato, righe corrette, censimento lock

- **HEAD** `933de13` (19.1…19.9 committate e chiuse; arbitro 19.9 = 580). Albero `src/`, `prisma/`, `e2e/` pulito al via.
- **Contratto della 19.9 (AD-1) — nessuna differenza di nome, nessun motivo di fermarsi**: `requirements.service.ts#evaluateRequirements(input: RequirementsInput): Promise<RequirementFailure[]>` con `expiryDateOnly`, `membershipDateOnly`, `person: { id, name, hasActivePilot, hasActiveStudent, hasActiveInstructor }`, `instructor: { personId, name } | null`, `documents`, `currency: { dateOnly, excludeFlightId } | null`, `balance: { costCents, creditCents } | null` (le tre date distinte e `hasActiveInstructor` ci sono); `balanceFailure(personName, balanceCents, costCents)`; `throwRequirementsNotMet(failures): never`; `schemas/requirements.ts#requirementFailureSchema`/`requirementsNotMetDetailsSchema`; `registry.ts#requirementsErrorResponses(...)`; `requirements-warning.tsx#RequirementsWarning({ failures, canProceed, onProceed, onCancel, submitting, error, moneyLocale, title? })` con modalità bloccata e testid `requirements-warning`/`-item` (`data-type`)/`-proceed`/`-cancel`/`-proceed-error`; permesso `requirements.force` (solo ADMIN). 19.3: nessun helper puro della categoria esportato (regola inline in `flights.service.ts:634-635`). 19.7a: `getMembershipStatus`, `getCurrencyStatus`, `getMedicalRequirementFailure` consumati via il servizio, non direttamente.
- **Righe effettive su `933de13`** (al posto di quelle su `eef77ef` del §3): `bookings.service.ts` — modulo `:17-137`, `BOOKABLE_PERSON_SELECT` `:284-290`, `assertActiveInstructorProfile` `:313-325`, `lockBookingPeople` `:350-355`, `findBookingConflict` `:385-420`, `findBlockingExpiredDocuments` `:478-499`, `createBooking` `:604-786`, `EDITABLE_BOOKING_SELECT` `:918-927`, `updateBooking` `:1048-1176`, `transitionBooking` `:1326-1424`; `membership.service.ts#chargeMembershipFee` `:87-…` (ramo morto `settings.manage` `:122`, codice `:127`); `registry.ts` POST/PATCH/transition bookings `:1456`, `:1493`, `:1527`, membership-fee `:1832`; `new-booking-form.tsx` (dopo la 19.5) sezione «Forza prenotazione» `:630-680`, ramo `EXPIRED_DOCUMENTS` `:396-407`; `bookings-table.tsx` `handleApprove` `:274-280`, modale di rifiuto `:791-829`; `mobile-pending-bookings.tsx` `handleApprove` `:116-139`; `scadenze-console.tsx#MembershipFeeModal` `:885-…`, casella `:978-983`; `airops.css` `.membership-fee-override-label` `:2877`, `:3007-3008`, commento `:3453`.
- **Censimento lock** (`grep -rn "FOR UPDATE\|FOR NO KEY UPDATE" src/server`): `Person` è bloccato fuori dalle prenotazioni solo da `people.service.ts:652` (`upsertProfile`) e `:931` (`updatePerson`), **una** riga, primo statement, seguita solo da righe della stessa persona (mai `Aircraft`, `Booking` o un'altra persona); `Aircraft` da `flights.service.ts` (`:1013`, `:1158`, `:1253`), `rates.service.ts:95` e dalle prenotazioni; `Account` da voli, conti e quota; `ExpiryType`/`CashCategory` dalle impostazioni. Nessun'altra transazione blocca due righe `Person`: con l'ordine `Booking → Aircraft → Person (1 o 2 righe, una istruzione ORDER BY id)` nessun ciclo è possibile. Il lock `InstructorProfile` della 16.3 è tolto (AD-5).

### §B — Riepilogo per AC con le prove

| AC | Prova |
|---|---|
| 1 | unit «AC 1» ×3 percorsi (`safeParse` di `requirementsNotMetDetailsSchema`, nulla scritto); e2e: 422 `REQUIREMENTS_NOT_MET` su create/move/approve (`booking-requirements.spec.ts`, admin e own-path) |
| 2 | unit «AC 2» (passato create e move own, finestra ×3 percorsi, fuori servizio e archiviato ×3, sovrapposizione ×3, ciascuno con e senza `force`; valutazione prima della transazione, decisione dopo i 3 predicati); e2e `booking-window.spec.ts` (persona fresca, fuori finestra → `BOOKING_OUTSIDE_WINDOW` con e senza `force`); mutante (a) rosso a unità e in e2e (§D) |
| 3 | unit «AC 3» (own-self e cross-person: `person.findUnique` del target e `evaluateRequirements` mai chiamati; move: 403 prima di `booking.findUnique`; gate = `requirements.force` provato con un ruolo che ha solo `bookings.manage.any`, sui tre percorsi); e2e: pilota con `force` → 403 su POST (`bookings.spec.ts`) e su PATCH della propria (`booking-requirements.spec.ts`) |
| 4 | unit «AC 4» (timbro sui tre percorsi solo con failure+force; nessun timbro senza failure; modifica senza deroga e «riapri» non toccano `forcedAt`; niente `forceReason`); e2e: `forcedAt` non nullo dopo la deroga in creazione (`bookings.spec.ts` AC 23, API) e in approvazione (AC 12b) |
| 5 | unit schema (PATCH `{ force: true }` → invalido; transition DENIED/PENDING + force → invalido; POST con `forceReason` accettato e scartato); migrazione §C; `grep forceReason src prisma/schema.prisma e2e` → solo asserzioni d'assenza e `src/generated` rigenerato |
| 6 | e2e «EXPIRY»: (a)+AC 7 rating che scade fra oggi e D, (b) visita scaduta dell'istruttore etichettata `instructor`, (c) visita mancante, (d) tipo disattivato nessun failure; (e) bordo `expiresAt = D` valido e D+1 scaduto (`bookings.spec.ts`, visita) |
| 7 | unit «AC 7» con `vi.useFakeTimers` a 22:59Z ora legale (oggi Roma = giorno dopo UTC): `expiryDateOnly` = giorno di Roma di `startsAt`/merge/bloccata, `membershipDateOnly` = `currency.dateOnly` = oggi di Roma sui tre percorsi, anche su un'approvazione passata |
| 8 | unit «AC 8» (solista ↔ niente istruttore, sui tre; solo-istruttore non soggetto); e2e «CURRENCY» (a) 91 → failure con valori, (b) con istruttore no, (c) 90 no, (d) solo-istruttore no, (e) 85 e prenotazione lontana no |
| 9 | unit «AC 9» (22 500; 15 000 e +6 000; 12 963 su 50 min a 155,55; `validFrom ≤ D` tipizzato; tariffa assente = 0; legacy pilota+allievo e solo-istruttore al prezzo pilota; senza conto `balance: null` e nessuna lettura delle tariffe); e2e «BALANCE» 28 499 → `{balanceCents: 28499, costCents: 28500}`, +1 cent → nessun BALANCE |
| 10, 11-bis | e2e «MEMBERSHIP» (mai pagata `null`; istruttore scaduta con data; scadenza oggi+5 passa; scaduta ieri fallisce a domani e a D) |
| 11 | e2e «all four»: tipi deduplicati in ordine `EXPIRY, MEMBERSHIP, CURRENCY, BALANCE` |
| 12 | (a) e2e `bookings.spec.ts` «every move re-judges…» (allungamento → BALANCE `400000/600000`; spostamento di un'ora nello stesso giorno con saldo sotto il costo → avviso bloccato nel form del pilota); unit «AC 12» (aircraft/intervallo/costo del merge, nota da sola rivalutata); (b) e2e approvazione dopo rettifica → 422 BALANCE, `force` → 200 con timbro |
| 13 | unit «AC 13» (`where` RATING non bloccanti attivi; bordo = D valido; failure mai in `warnings`); e2e avviso ambra `booking-form-warning` col tipo non bloccante (`bookings.spec.ts`) |
| 14, 15, 16 | e2e «admin…» (create/move/approve 422 → `force` → 201/200) e «own path…» (pilota, istruttore per sé, istruttore per l'allievo con le voci di entrambi, `force` → 403, PATCH own `force` → 403, self con `instructorProfileId` → 422 `VALIDATION_ERROR`) |
| 17, 18 | e2e «PERSON_BUSY across roles» e «INSTRUCTOR_BUSY across roles» (create, move, approval, `details` = la prenotazione dell'altro ruolo, bordo libero, PENDING che non blocca); mutante (c) rosso (§D) |
| 19 | unit 16.3 aggiornati: una `$queryRaw` `FROM "Person" WHERE "id" IN (?) ORDER BY "id" FOR NO KEY UPDATE` con i due id, nessun `InstructorProfile`, ordine `['Aircraft','Person']`/`['Booking','Aircraft','Person']`; predicati con `where` esatti (velivolo invariato byte per byte); caso legacy istruttore = persona → un id |
| 20 | e2e «concurrency probe» 10/10 `[200, 409]` (3 serie verdi) + sonda API §D: fix 10/10, mutante 3/10 `[200,200]`; SQL «essere umano» 0 sul fix |
| 21 | unit (create staff e approvazione, con e senza `force`); e2e (con e senza `force`) |
| 22 | §E |
| 23-28 | e2e `bookings.spec.ts` (AC 23, 24, 26 pilota) e `booking-requirements.spec.ts` (AC 25 tre corse, AC 26 admin con «Annulla» → focus su «Salva», AC 27 modale con «Annulla» → focus su «Approva», AC 28 due passi mobile con focus sul primo bottone e ≥ 43,5 px) |
| 29 | unit `booking-transition.test.ts` (+3) |
| 30 | §I |
| 31 | unit `registry.test.ts` «story 19.10 (AC 31)»; OpenAPI servito verificato sulla build (§J) |
| 32 | `grep -rn "TD 16.3-a\|EXPIRED_DOCUMENTS\|forceReason" bookings.service.ts schemas/bookings.ts schema.prisma` → 0 |
| 33 | i18n 1622 → 1616 per locale, parità (test di parità nei gates) |
| 34 | gates verdi; `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET` sui 4 file toccati → 412 passed |
| 35 | delta atteso dichiarato (§G); arbitro completo della sessione principale |
| 36 | unit «insufficient-balance guard and its deroga» (6 test: 422 con la voce BALANCE validata dallo schema e nulla scritto; lock → lettura → decisione; uguale = coperto; 403 prima di `person.findUnique` e `$transaction` con un ruolo che ha solo `finance.manage`; admin a saldo 0 → `balanceAlert`; `force` con saldo sufficiente = identico); `grep "MEMBERSHIP_FEE_INSUFFICIENT_BALANCE\|override"` sui due file → 0 |
| 37 | e2e `membership-fee.spec.ts` (a) senza chiave anche con `force` → 422 `IDEMPOTENCY_KEY_REQUIRED`; (b)(c) stessa chiave: 422 → `force` 200 → replay `Idempotency-Replayed: true`, un solo `ADJUSTMENT`; (d) test di replay esistente verde |
| 38, 39 | e2e desktop (avviso nel pannello, nessun addebito, «Annulla» con valori intatti e focus sul submit; «Procedi comunque» → −50,00 €, rinnovo a 12 mesi) e mobile 375 (avviso nel pannello a tutto schermo, `requirements-proceed` ≥ 43,5 px e nel viewport, addebito) |

### §C — Migrazione: gemello, `\d "Booking"`, `migrate diff`

Gemello `airmanager_d1910` (`createdb` nel container, `migrate deploy` delle 56 migrazioni da zero, `db seed`): «All migrations have been successfully applied»; `\d "Booking"` → `forcedAt`, `forcedByUserId` e la FK `Booking_forcedByUserId_fkey`, **nessun `forceReason`**; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` → `-- This is an empty migration.`, exit 0; `migrate status` → «Database schema is up to date!». Nessun seed scrive la colonna; `seed-load.ts` passa il typecheck (non eseguito). `airmanager_load` mai migrato.

### §D — Discriminanze e sonde §4.3, sonda di concorrenza AC 20 (verbatim)

**Unit** (`scratchpad/s1910/mutants.py`, un mutante alla volta, test del file, ripristino; `sha256` prima = dopo: `bookings.service.ts 8ad9dcfb8ff2…`, `membership.service.ts d347ad015fff…`, `requirements.service.ts 0ed080c2eef2…`, «sha256 restored: True»):

| Mutante | Esito |
|---|---|
| (a) decisione prima del passato/finestra (create) | 5 failed / 330 (AC 2: passato, finestra, fuori servizio, sovrapposizione, ordine) |
| (b) lock della sola persona | 3 failed (AC 19 ×3) |
| (c) predicato persona senza il ramo del profilo istruttore | 3 failed (R-19-o ×3) |
| (d) 403 della modifica dopo la lettura | 2 failed (AC 3) |
| (e) stima sempre al prezzo pilota | 1 failed (AC 9 allievo) |
| (f1) 403 della quota dentro la transazione | 1 failed / 24 (AC 36 403-prima) |
| (f2) `<=` al posto di `<` in `balanceFailure` | 1 failed (AC 36 uguale = coperto) |
| (g) timbro anche senza failure | 3 failed (AC 4 ×3) |

**e2e su build mutanti** (gemello, `next start`, poi sorgente ripristinato: `sha256sum -c` → `bookings.service.ts: OK`, build finale rifatta):
- **Mutante 1** (lock della sola persona della prenotazione), sonda API `s1910/probe-conc.cjs` (P persona di una PENDING su A e istruttore di una PENDING sovrapposta su B, approvazioni in `Promise.all`, `force`, 10 giri):
  - **fix**: `[[200,409]×10]`, codici `['OK','INSTRUCTOR_BUSY']×10`, `twoHundredPairs: 0`;
  - **mutante**: `[[200,200],[200,409],[200,409],[200,409],[200,200],[200,409],[200,200],[200,409],[200,409],[200,409]]`, `twoHundredPairs: 3`.
  - SQL «essere umano» (unione `personId` / `InstructorProfile.personId`, coppie APPROVED sovrapposte) su persone `Conc-%` e `Requisiti`: **una sola riga**, la P del mutante con 3 coppie; P della sonda sul fix e ogni persona degli e2e (AC 17/18/20 di tre serie) = 0.
- **Mutante 2** ((a) decisione prima della finestra + (c) ramo del profilo tolto), `--retries=0`: `booking-window.spec.ts:113` → «Expected: "BOOKING_OUTSIDE_WINDOW" / Received: "REQUIREMENTS_NOT_MET"»; `booking-requirements.spec.ts` AC 17 → «Expected: 409 / Received: 201» (il primo giro di AC 17 era inquinato dalla finestra 14-18 che `booking-window` scrive in parallelo nella stessa invocazione; rieseguito da solo).

### §E — Misura di AD-5 (EXPLAIN su `airmanager_load`, sola lettura)

`SELECT current_database()` → `airmanager_load` (40 000 prenotazioni); solo `EXPLAIN (ANALYZE, BUFFERS)`, nessuna scrittura. P = `41a75a10-…` (8 APPROVED da istruttore, 13 da persona), profilo `eed808af-…`, intervallo di una sua prenotazione. SQL catturato dal client Prisma sul gemello (log `query`).

| Predicato | Piano | Tempo (2 esecuzioni) |
|---|---|---|
| PERSON nella forma di AD-5 (`OR [{personId: P}, {instructorProfile: {personId: P}}]` → `LEFT JOIN "InstructorProfile"` + `OR` fra tabelle) | **Seq Scan on "Booking"** (39 986 righe scartate) + Hash Left Join | 29,8 ms / 22,0 ms |
| PERSON nella forma adottata (`OR [{personId: P}, {instructorProfileId: <profilo di P>}]`) | BitmapOr di `Booking_personId_idx` e `Booking_instructorProfileId_idx` | 0,51 ms / 0,94 ms |
| INSTRUCTOR (`OR [{instructorProfileId: IP}, {personId: Q}]`) | BitmapOr degli stessi due indici | 0,19 ms / 0,31 ms |

Esito: nessun indice nuovo; la forma di AD-5 del predicato persona è sostituita dalla forma equivalente indicizzata (D-a, §H) — `InstructorProfile.personId` è unico, quindi «prenotazioni il cui istruttore è P» = «prenotazioni col profilo di P». Da riportare alla sessione principale come decisione presa entro il perimetro «niente indici»: la misura mostrava una scansione sequenziale sotto lock, non un indice mancante.

### §F — Censimento e2e di AD-9 col destino di ogni riga

`grep -rnE "api/v1/bookings|new-booking-form|move-booking-form|booking-approve-action|mobile-overview-approve|force-booking|EXPIRED_DOCUMENTS|forcedAt" e2e` su HEAD: 17 file (bookings 105 righe, mobile-planning 18, booking-window 11, aircraft-out-of-service-until 11, mobile-overview 9, flight-requirements 8, api-v1 8, pdf-exports 7, datetime-picker 7, typeahead-pickers 5, mobile-overview-overflow 5, aog-impact-email 4, flights 3, mobile-logbook 2, home-dashboard 1, expiry-rules-currency 1, aircraft-management 1). Più due file fuori dal grep trovati nel censimento delle chiamate quota con `override` (`expiry-rules-currency.spec.ts:134`, `expiries-registry.spec.ts:312`).

| Spec | Destino |
|---|---|
| `bookings.spec.ts` | describe «expiry block (7.4)» **riscritto** (6 test: pilota bloccato senza bottone, avviso ambra non bloccante, admin «Procedi comunque» senza motivo con `forcedAt`, `force` del pilota 403, bordo visita = D, D-3 «ogni modifica», AC 12a e 26 pilota); test 16.3 MAJOR-1 **riscritto** (il 409 al primo invio, nessun avviso); fixture admin API → `force: true` (allievo, timeline ×2, 375 px, clamp, mezzanotte, concorrenza POST, 403 altrui, concorrenza PATCH, doppio annullo, crosstalk ×21, privacy ×2, approvazione «other», `postBooking` 16.3, PATCH al passato 16.3); own-path → `inRegola` (pilota da UI, sposta, sovrapposizione su sposta, `setupPendingBookingAsStaff`, privacy, approvazioni parallele, istruttore per allievo e per sé, allievo); pilota del seed → `ensureBookingRequirements` (già iniziata, own-path vede); picker staff → `ensureBookingRequirements` |
| `api-v1.spec.ts` | i due test own-path del pilota del seed → `ensureBookingRequirements` |
| `booking-window.spec.ts` | creazioni dentro la finestra → `force`; fuori finestra → anche con `force` (AC 2 e2e) |
| `mobile-overview.spec.ts` | `createBooking`/`moveBooking` → `force`; test «approve from the sheet» → pilota in regola; approvazione fuori banda → `force` |
| `mobile-overview-overflow.spec.ts` | create e i due PATCH → `force` |
| `mobile-planning.spec.ts` | `createBooking`/`moveBooking` → `force`; test del foglio decisionale → pilota in regola |
| `pdf-exports.spec.ts` | le due creazioni admin → `force` |
| `aog-impact-email.spec.ts` | i titolari (che prenotano anche da sé) → `ensureBookingRequirements` al posto di `ensureValidSeedExpiries` |
| `aircraft-out-of-service-until.spec.ts` | primo test: pilota del seed → `ensureBookingRequirements` (i 422 del fermo sono decisi prima, invariati) |
| `aircraft-management.spec.ts`, `home-dashboard.spec.ts`, `typeahead-pickers.spec.ts`, `datetime-picker.spec.ts` | `force` (admin) / persona in regola (own-path, UI staff) |
| `expiry-rules-currency.spec.ts` | test prenotazione con le visite → `ensureBookingRequirements` + `sendInRegola`; helper quota `override` → `force` |
| `expiries-registry.spec.ts` | quota `override` → `force` |
| `membership-fee.spec.ts`, `mobile-membership-fee.spec.ts` | riscritti (AC 37-39) |
| `flights.spec.ts`, `flight-requirements.spec.ts`, `mobile-logbook.spec.ts` | righe sul `forcedAt` dei **voli**: invariati |
| **nuovo** `booking-requirements.spec.ts` | 16 test (AC 6-11-bis, 3, 4, 12b, 14-16, 21, 17, 18, 20, 25-28) |

Helper nuovi in `e2e/helpers.ts`: `ensureBookingRequirements(page, { personId, scope, solo? })` (idempotente: idoneità, quota **registrata** con `POST /expiries` sul tipo `MEMBERSHIP` — 409 = presente, nessun movimento —, ricarica sotto 200 000, e con `solo` un volo **oggi** senza addebito su un velivolo run-unique con tariffa da oggi, archiviato subito) e `personIdByEmail`. In `bookings.spec.ts` le tre `create*WithLogin` hanno l'opzione `{ inRegola }`.

### §G — Delta test (unit ed e2e, prima/dopo)

- **Unit**: 2093 → **2147** (+54): `bookings.service.test.ts` 283 → 330 (blocchi 7.4/TD-5 superati tolti, blocco «Story 19.10» nuovo, 16.3 aggiornati), `membership.service.test.ts` 21 → 24, `booking-transition.test.ts` 4 → 7, `registry.test.ts` 50 → 51.
- **e2e**: `npx playwright test --list` 580 → **597** (+17): `booking-requirements.spec.ts` +16, `membership-fee.spec.ts` +1 (i due UI riscritti + il caso API della chiave). **Delta arbitro atteso 580 → 597.** Nessuno spec nuovo nella catena serializzata.

### §H — Deviazioni motivate

- **D-a (AD-5, predicato persona)**: `OR [{ personId: P }, { instructorProfileId: <profilo di P> }]` al posto di `{ instructorProfile: { personId: P } }`: stesso insieme (`personId` unico sul profilo, deattivato incluso), ma la forma di AD-5 è una scansione sequenziale sotto lock (§E: 22-30 ms contro 0,5-0,9 ms). `BOOKABLE_PERSON_SELECT` legge `instructorProfile.id`; `findBookingConflict` riceve `personInstructorProfileId` e `instructor: { profileId, personId } | null`. Nessun indice nuovo. Gli unit sui `where` esatti seguono la forma adottata, con un test per il ramo del profilo.
- **D-b (D-5, categoria)**: `STUDENT` solo per chi è **solo** allievo (`isActiveStudent && !isActivePilot`), `PILOT` altrimenti: coincide con la regola del volo su **ogni** persona, anche sui dati legacy con entrambi i profili (che la 19.3 tratta da pilota), mentre «STUDENT se allievo attivo» li avrebbe stimati al prezzo allievo.
- **D-c (D-8, messaggio)**: chiave nuova `BookingsPage.form.errors.INSTRUCTOR_SAME_AS_PILOT` (IT/EN) usata dal form e dalle etichette dell'approvazione: senza, il 422 nuovo cadeva su «Riprova» (lezione R-15.4-g). Non elencata nel §3.8.
- **D-d (guardia del corpo stantio)**: nei due form e nel modale quota ogni modifica dei campi chiude l'avviso (lo schema D-12 della 19.9): «Procedi comunque» non deroga mai un corpo diverso da quello elencato.
- **D-e (saldo sotto lock)**: non replicato sulle prenotazioni — non scrivono movimenti, quindi due prenotazioni concorrenti non spendono nulla e ciascuna è giudicata sul proprio costo (D-2); resta il check-then-act di ogni requisito (TD 16.3-d). La quota conserva la decisione sotto il lock `Account` (D-11). Motivazione nel doc-comment di `evaluateBookingRequirements`.
- **D-f**: `MOVABLE_BOOKING_SELECT` (solo `updateBooking`) invece di allargare `EDITABLE_BOOKING_SELECT`: `cancelBooking` invariato.
- **D-g (errori del rinvio in approvazione)**: desktop e sheet chiudono l'avviso e mostrano l'esito con il toast dell'approvazione (convenzione della superficie), un errore di rete resta nell'avviso (`error`); nei form la regola è quella di AD-6 (banner + focus, `flushSync`).
- **D-h (date degli e2e nuovi)**: le prenotazioni API del nuovo spec sono su `2032-06-15` (dopo le pile `2031-03-*` di `bookings.spec.ts`, entro `maxAdvanceDays` 3650), quelle UI su oggi+2 (dopo il «domani» che `home-dashboard`/`mobile-overview` leggono in pagina 1). Misurato: con oggi+10 le ~55 righe del nuovo spec finivano davanti alle pile e le passeggiate di pagina di `bookings.spec.ts` superavano i 30 s su un gemello eseguito due volte; con «domani» un test di `home-dashboard` perdeva la sua riga dalla card a 8. Gli ancoraggi a oggi (AC 7, 8e, 11-bis) restano provati, con anni di distanza invece di dieci giorni.
- **D-i (helper)**: quota registrata e non addebitata; volo di currency oggi con tariffa via API (non `seedAircraftRate`): `helpers.ts` non importa `pg`.
- **D-j (AC 2 e2e)**: il caso «fuori finestra con e senza `force`» vive in `booking-window.spec.ts` (catena serializzata), perché lo spec nuovo non scrive AppSettings (AD-9 regola 3) e su un DB fresco non esiste finestra.
- **D-k**: il modale quota usa il titolo predefinito `Requirements.title` («Requisiti non soddisfatti»), nessuna chiave nuova.

**TD**: TD-19.9-a, metà prenotazioni → **chiuso** (il blocco passa dal servizio della 19.9 con `isActive`; i `warnings` filtrano anche loro `isActive`). TD 16.3-a e TD 16.3-g → chiusi da questa story. Nuovi, da registrare (pre-esistenti, osservati nelle serie): **TD-19.10-a** — quattro test di `mobile-planning.spec.ts` (`:277`, `:325`, `:367`, `:763`) costruiscono fixture a ora±20 min e falliscono fra le 23:40 e le 00:20 di Roma (il giorno cambia sotto la fixture); **TD-19.10-b** — `typeahead-pickers.spec.ts:64` (volo, non toccato) fallisce fra le 00:00 e l'01:00 di Roma (data di Roma ≠ data UTC; verde prima di mezzanotte e alle 01:01, §J punto 7); **TD-19.10-c** — su un DB riusato, i 105 riempitivi `AAAtypeahead-*` per esecuzione e le pile di `FUTURE_DAY` rendono il picker staff a 100 e le passeggiate di pagina sempre più fragili (classe nota del picker a 100); **TD-19.10-d** — D-7 dichiarata: l'approvazione di una prenotazione il cui volo è già registrato conta il costo due volte (l'admin vede l'avviso e procede).

### §I — Verifica UI (screenshot)

Script `scratchpad/s1910/ui.cjs` (`playwright-core`, Chromium 1228, build di produzione sul gemello), 1280×900 e 375×812, `data-theme` chiaro e scuro, 22 screenshot in `scratchpad/s1910/shots/`: (1) form nuovo admin, (2) form modifica admin, (3) modale di approvazione (1280) / passo dello sheet della lista (375), (4) passo dello sheet della Panoramica (375), (5) pannello quota, (6) form nuovo del pilota in modalità bloccata. Misure (`ui-results.json`): `scrollWidth − clientWidth` = **0** ovunque; bottoni dell'avviso 34,8 px a 1280 e **44 px** a 375; focus all'apertura sull'avviso (`DIV:requirements-warning`) nei form e nel pannello, su `BUTTON:requirements-proceed` nei due passi degli sheet; modalità bloccata senza bottoni. Pannello `--warn-soft`/`--warn` dentro ogni superficie, leggibile in scuro; nessun colore, token o primitiva nuovi (solo regole tolte da `airops.css`).

### §J — Gate ed esiti verbatim

- `npm run gates` (finale, sul codice committato): `PASS lint (34s)`, `PASS typecheck (8s)`, `PASS test (22s) — Tests 2147 passed (2147)`, `PASS build (71s)`.
- `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run` su `bookings.service.test.ts`, `membership.service.test.ts`, `booking-transition.test.ts`, `registry.test.ts` → 4 file, **412 passed**.
- OpenAPI servito (`GET /api/v1/openapi.json` sulla build): le quattro operazioni hanno `REQUIREMENTS_NOT_MET` e `requirements.force` nella descrizione, il 422 col `$ref` a `RequirementsNotMetDetails`, `force` nel body, nessun `forceReason`/`override`; `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE` 0, `EXPIRED_DOCUMENTS` 0, `forceReason` 0.
- e2e mirati (`scripts/e2e.sh`, build una volta + `E2E_REUSE_SERVER=1`, gemello `airmanager_d1910`, `DATABASE_URL` del gemello esportato anche per il processo di test):
  1. gemello fresco, 15 spec: **155 passed, 1 flaky** (`mobile-overview:598`, `read ECONNRESET` sul POST della fixture, verde al retry), 5 failed: `home-dashboard:229` (affollamento della card da parte del nuovo spec → D-h, corretto) e 4 di `mobile-planning` (mezzanotte, TD-19.10-a). Il nuovo spec 16/16.
  2. stesso gemello (seconda esecuzione, dopo mezzanotte): 95 passed, 11 failed — tutti passeggiate di pagina/picker a 100 del DB riusato e mezzanotte (D-h, TD-19.10-c); il nuovo spec 16/16. Il gemello è stato ricreato da zero.
  3. **gemello ricreato da zero**, 16 spec (i 15 più `expiry-dashboard`, `mobile-expiries-movements`): **169 passed, 1 flaky** (`bookings:1237`, verde al retry), 1 failed `typeahead-pickers:64` (volo, finestra 00-01 di Roma, TD-19.10-b).
  4. catena `--project=booking-window --project=mobile-overview-overflow --project=mobile-membership-fee --no-deps --workers=1`: **7 passed**.
  5. pilota del seed dopo gli spec delle scadenze (`--workers=1`): `expiry-dashboard` + `mobile-expiries-movements` **20 passed**, poi i test del pilota del seed di `bookings`/`aircraft-out-of-service-until` 4 passed e `api-v1` 2 failed per `BOOKING_OUTSIDE_WINDOW` (la catena del punto 4, eseguita prima, aveva lasciato `maxAdvanceDays` 3650 e api-v1 prenota nel 2099: ordine della mia serie, nell'arbitro la catena gira dopo); tolte le chiavi `sched.*` dal gemello: `api-v1` **8 passed**.
  6. build finale, dopo le 00:20: `mobile-planning` + `booking-requirements` + `home-dashboard`: **31 passed**, 1 failed `home-dashboard:229` (gemello ormai sporco: le fixture «domani» delle serie precedenti sono diventate «oggi»; verde al punto 3 sul gemello fresco).
  7. build dei gates finali, alle 01:01: `typeahead-pickers.spec.ts` **9 passed** (il `:64` del punto 3 era la finestra 00-01 di Roma, TD-19.10-b).
- Arbitro completo su DB fresco: della sessione principale (atteso **597**).

### Completion Notes List

- 2026-11-03, dev: implementati i 39 AC — servizio unico della 19.9 sui tre percorsi con stima del costo senza attore, due date di riferimento (Q-19.10-a = B), deroga decisa per ultima dopo ogni controllo non derogabile (TD 16.3-g), `requirements.force` unico gate, own-path bloccato con l'elenco, R-19-o nei lock (`Person` 1-2 righe in una istruzione) e nei predicati, D-8, via `forceReason` (migrazione), deroga della quota sul contratto condiviso con decisione sotto il lock `Account`, avviso unico in cinque superfici (form nuovo e modifica, modale desktop, due passi mobile) e nel pannello quota, i18n, OpenAPI, e2e. Gates verdi, mutanti unit (8) ed e2e (2 build) rossi e sorgenti ripristinati con sha256 identici, serie mirate in §J. Commit dell'implementazione: `a0aba91`.
- Stato della macchina: gemello `airmanager_d1910` **eliminato** (`pg_database` = `airmanager`, `airmanager_audit`, `airmanager_load` e i template); `airmanager`, `airmanager_audit`, `airmanager_load` e la cartella `audit-2026-11-02/` mai toccati (su `airmanager_load` solo `EXPLAIN`); server di prova su :3000 fermati per PID, `:3000` libero; `scripts/e2e.sh status` = `E2E_EXIT=0` (punto 7 di §J); `.next` = build dei gates finali, sul codice di `a0aba91`. `sprint-status.yaml` non toccato (istruzione della sessione principale). Nessun push.

### File List

- `prisma/migrations/20261103100000_booking_drop_force_reason/migration.sql` (nuovo)
- `prisma/schema.prisma`
- `src/server/services/bookings.service.ts`, `src/server/services/bookings.service.test.ts`
- `src/server/services/membership.service.ts`, `src/server/services/membership.service.test.ts`
- `src/server/services/aircraft-status.ts`, `src/server/services/app-settings.service.ts`, `src/server/services/expiries.service.ts`, `src/lib/medical-requirement.ts` (solo commenti)
- `src/lib/schemas/bookings.ts`, `src/lib/schemas/membership.ts`, `src/lib/schemas/registry.ts`, `src/lib/schemas/registry.test.ts`
- `src/app/[locale]/dashboard/bookings/new-booking-form.tsx`, `edit-booking-form.tsx`, `bookings-table.tsx`, `booking-transition.ts`, `booking-transition.test.ts`, `booking-labels.ts`, `page.tsx`, `schedule.tsx` (solo commento)
- `src/app/[locale]/dashboard/mobile-pending-bookings.tsx`, `src/app/[locale]/dashboard/page.tsx`
- `src/app/[locale]/dashboard/expiries/scadenze-console.tsx`, `src/app/[locale]/dashboard/expiries/page.tsx`
- `src/styles/airops.css`
- `messages/it.json`, `messages/en.json`
- `e2e/booking-requirements.spec.ts` (nuovo), `e2e/helpers.ts`
- `e2e/bookings.spec.ts`, `e2e/api-v1.spec.ts`, `e2e/booking-window.spec.ts`, `e2e/mobile-overview.spec.ts`, `e2e/mobile-overview-overflow.spec.ts`, `e2e/mobile-planning.spec.ts`, `e2e/pdf-exports.spec.ts`, `e2e/aog-impact-email.spec.ts`, `e2e/aircraft-out-of-service-until.spec.ts`, `e2e/aircraft-management.spec.ts`, `e2e/home-dashboard.spec.ts`, `e2e/typeahead-pickers.spec.ts`, `e2e/datetime-picker.spec.ts`, `e2e/expiry-rules-currency.spec.ts`, `e2e/expiries-registry.spec.ts`, `e2e/membership-fee.spec.ts`, `e2e/mobile-membership-fee.spec.ts`
- `_bmad-output/implementation-artifacts/19-10-avviso-deroga-prenotazioni.md` (questo record)

### Change Log

- 2026-11-03 — Implementazione della story 19.10 (avviso unico con deroga admin su creazione, modifica e approvazione delle prenotazioni; R-19-o; deroga della quota allineata; via `forceReason`); Status → review.
- 2026-11-03 — Fix di review F1-F6 (`761bf92`), Review Record; Status resta review (arbitro completo della sessione principale).

## Review Record

### Review

- **Reviewer**: `review-19-10` (Opus 5.5, adversarial), report `19-10-review-report.md` (committato con questo record). Commit sotto review `a0aba91` + `dc69faf`, baseline `933de13`.
- **Verdetto**: **SHIPPABLE CON FIX**, ma arbitro completo su DB fresco **rosso** (`E2E_EXIT=1`): 543 passed, 1 failed deterministico (`mobile-billing.spec.ts:894`, causato dalle fixture di questa story → F1), 1 flaky (`bookings.spec.ts:1237` → F5), 52 did not run (la catena, verde a parte 52/52). Finding: F1 MAJOR, F2 MINOR (preesistente), F3 MINOR (a11y), F4 LOW, F5 LOW, F6 osservazione.
- **Fix**: `fix-19-10` (Opus 5.5), commit **`761bf92`** su `f6b06ab`. Decisioni della sessione principale (messaggio di lancio): **tutto ora**, F2 e F3 compresi, F3 su **entrambi** i popup (approvazione e rifiuto); un solo TD nuovo (il layout a 320 px, sotto). Nessuna domanda al PO.

### Finding

- **F1 (MAJOR) — corretto.** `e2e/helpers.ts#ensureBookingRequirements` ricarica **fino a** `BOOKING_BALANCE_FLOOR_CENTS` (non più `2 × soglia − saldo`) e solo se il saldo è sotto; soglia **50.000 cent** (500 €), esportata e documentata (prima 200.000, cioè 4.000 € per persona nuova).
  - **Soglia misurata** sul gemello dopo la serie 1 (sotto): la prenotazione più cara giudicata senza `force` dopo l'helper costa **12.000** (1 h a 120 €/h, `expiry-rules-currency`); l'unica più alta, **40.000**, è del test del saldo che sceglie da sé i propri importi (sotto). Il resto della soglia fa da margine al pilota del seed, a cui gli spec fratelli addebitano voli nel frattempo (un volo della suite costa al massimo qualche centinaio di euro; tariffe e2e ≤ 160 €/h).
  - I due test che dipendevano dai 4.000 € ora fissano importi propri rispetto alla soglia: `booking-requirements.spec.ts` «approval of a PENDING whose balance dropped» (tariffa = soglia/h, rettifica −30.000 → `{ balanceCents: soglia − 30.000, costCents: soglia }`); `bookings.spec.ts` «every move re-judges» (400 €/h; saldo asserito `toBe(BOOKING_BALANCE_FLOOR_CENTS)`; 80.000 contro 50.000; rettifica −20.000 → «saldo 300,00 €, costo 400,00 €»).
  - **Prova** (gemello fresco, build del fix, `E2E_REUSE_SERVER=1`): serie 1 = gli 11 spec che chiamano l'helper → **129 passed**; poi, **sullo stesso DB**, `mobile-billing.spec.ts --retries=0` → **26 passed**, compreso `:894`. Ricariche del mese sul gemello: dopo la serie 1 **31 movimenti, 14.785,00 €** (29 × 500,00 €, più 284,99 € e 0,01 € del test AC 9), dopo `mobile-billing` 35 / 15.345,00 € (5 cifre), contro i **126.944,24 €** dell'arbitro (28 × 4.000 € dell'helper). **Rosso sul pre-fix** = l'arbitro stesso (3 tentativi su 3, `cw 226 / sw 228`) e la prova causale del report (fresco verde, fresco + 28 × 4.000 € rosso): non rieseguita.
- **F2 (MINOR, preesistente) — corretto, opzione «valutare prima della transazione».** `transitionBooking` → APPROVED legge **prima** della transazione, con `readApprovalChecks`: la prenotazione (`MOVABLE_BOOKING_SELECT`, la stessa lettura della modifica), i suoi requisiti (`evaluateBookingRequirements`) e le impostazioni della finestra (`getSchedulingSettings`). Dentro la transazione, sotto il lock `Booking`, controlla che lo slot sia ancora quello valutato (`isSameSlot`: persona, istruttore, velivolo, inizio, fine): se non lo è risponde **409** «This booking has changed; please retry.» (una modifica arrivata in mezzo; per la UI è un 409 generico, quindi `stale`: toast di conflitto e refresh). Sul resto l'ordine resta quello di AD-3: persona 409/422, istruttore 409/422 e D-8, finestra, velivolo, lock delle persone, 409 di sovrapposizione, decisione per ultima.
  - `evaluateBookingRequirements` **non accetta più un client** e il suo doc-comment dice «mai dentro una transazione»; `assertWithinSchedulingWindow(settings, startsAt, endsAt)` è ora sincrona, con le impostazioni passate dal chiamante (creazione e modifica le leggono subito prima, come facevano, fuori transazione); doc-comment di `getSchedulingSettings`, del modulo e di `transitionBooking` riscritti; OpenAPI della transizione: una frase sul nuovo 409.
  - **Perché questa opzione e non «un client opzionale a `evaluateRequirements`»**: la seconda avrebbe esteso a un client le firme delle funzioni della 19.7a (`getMedicalRequirementFailure`, `getMembershipStatus`, `getCurrencyStatus`, `getCurrencySettings`) e tenuto lock `Booking` e connessione per ~10 query in più. Questa è la forma che creazione e modifica avevano già (AD-3) e che il doc-comment di `requirements.service.ts` prescrive («the caller runs it BEFORE its own transaction»).
  - **Censimento degli altri percorsi** (`evaluateRequirements`/`balanceFailure` dentro una transazione): voli 19.9 (`registerFlight`, `updateFlight`) → `resolveFlightInput` gira prima della transazione, dentro solo letture `tx` e `balanceFailure` (pura, sul saldo letto con `tx` sotto il lock `Account`); `chargeMembershipFee` → tutte letture `tx`, `balanceFailure` pura; creazione e modifica di prenotazioni → valutazione e finestra già fuori. L'approvazione era l'unico caso; nessun contratto 19.9 cambia.
  - **Sonda** (`probe-f2.cjs`: N approvazioni simultanee su prenotazioni distinte, con e senza `force`, più 3 GET estranee lanciate a +150 ms):

    | N | pre-fix (`dc69faf`) | fix |
    |---|---|---|
    | 20 forzate | 20 × 500, 5.170 ms; GET 500 (2.031 ms), 500, 200 | **20 × 200**, 292 ms; GET 200 (84 / 39 / 19 ms) |
    | 20 non forzate | 20 × 500, 5.149 ms; GET 500, 500, 200 | **20 × 422** `REQUIREMENTS_NOT_MET`, 285 ms; GET 200 |
    | 40 forzate | 9 × 200 + 31 × 500, 5.133 ms; GET 500, 500, 200 | **40 × 200**, 630 ms; GET 200 (≤ 141 ms) |
    | 40 non forzate | 40 × 500, 5.179 ms; GET 500, 500, 200 | **40 × 422**, 487 ms; GET 200 (≤ 168 ms) |

    Log del server: `P2028` / «Unable to start a transaction» **207** righe sul pre-fix, **0** sul fix. Le 60 approvazioni forzate del fix hanno tutte il timbro (APPROVED, `forcedAt` scritto).
  - Unit: «approve: evaluated BEFORE the transaction opens…» (l'`it.each` di creazione e modifica esteso all'approvazione, con l'ordine `evaluateRequirements` / `aircraftRate.findFirst` / `getSchedulingSettings` < `$transaction`) e «approve: a booking moved to another interval / aircraft between the read… answers 409» (2 casi, nulla scritto). Il helper di test `mockBookingLock` imposta anche la lettura preliminare (prima i test di approvazione la ereditavano, per caso, dall'implementazione lasciata dal test precedente).
- **F3 (MINOR, a11y) — corretto su entrambi i popup.** Primitiva nuova `src/components/ui/mini-modal.tsx` (`MiniModal`): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` sul titolo, `tabIndex={-1}`, trappola condivisa `useFocusTrap` (card più portali), Escape = chiusura del chiamante, focus iniziale su ciò che un figlio ha già focalizzato (l'avviso si focalizza da solo) altrimenti sul primo controllo, focus restituito al bottone che l'ha aperto (`returnFocusRef`, impostato dal click). Non viene usato «l'elemento focalizzato prima»: per l'approvazione sarebbe `<body>`, perché «Approva» è disabilitato mentre chiede.
  - `bookings-table.tsx`: il modale di rifiuto (titolo `id`, textarea focalizzata all'apertura, «Annulla» ed Escape → `closeDeny`, focus su «Rifiuta») e quello dei requisiti (`RequirementsWarning` con la prop nuova **`titleId`**, così il dialogo prende il nome dal titolo dell'avviso) usano `MiniModal`; `dismissRequirements` non sposta più il focus da sé.
  - **Trappola** (`focus-trap.ts`): il giro si chiude quando non c'è nessuno stop oltre il focus nella direzione del tasto. È la stessa regola di prima per `first`, `last` e il pannello, estesa a un nodo focalizzato che non è uno stop (un blocco `tabIndex=-1` come l'avviso). Prima, Shift+Tab dall'avviso, primo elemento del modale, usciva dalla pagina. Comportamento invariato per `SlideOver` e `MobileSheet`, che girano sugli stessi casi: serie 4 sotto.
  - **Sonda** (`probe-f3.cjs`, 1280): pre-fix approvazione `role null / aria-modal null / nome null`, Tab `in,in,OUT:BODY,OUT:A,…`, Escape non chiude; rifiuto: focus all'apertura su `booking-reject-action` (fuori), 9/9 Tab fuori, Escape non chiude. Fix: entrambi `dialog`, `aria-modal="true"`, nome «L'approvazione non rispetta alcuni requisiti» / «Rifiuta prenotazione», focus su `requirements-warning` / `booking-deny-reason`, **10/10 tasti dentro** (Shift+Tab per primo), Escape chiude, focus su `booking-approve-action` / `booking-reject-action`. Screenshot 1280 chiaro e scuro dei due dialoghi: nessuna differenza visiva (stesse classi `.mini-modal`).
  - Guardia e2e `booking-requirements.spec.ts` «review F3: the desktop approval modal and the reject modal are dialogs…»: `getByRole('dialog', { name })`, `aria-modal`, focus dentro dopo Shift+Tab, 4 × Tab, 5 × Shift+Tab, Escape chiude e restituisce il focus, «Annulla» idem, prenotazione ancora PENDING. **Rossa sul pre-fix** (build `dc69faf` sul gemello): `getByRole('dialog', { name: "L'approvazione…" })` — «element(s) not found» (`f3-guard-prefix.log`).
- **F4 (LOW) — corretto.** `lockBookingPeople` restituisce l'id del profilo istruttore **della persona**, letto con `tx.instructorProfile.findUnique({ where: { personId } })` **dopo** il lock `Person`. È un'istruzione nuova, quindi in READ COMMITTED vede ogni profilo già committato: chi rende quella persona istruttore di un'altra prenotazione blocca la stessa riga `Person`, quindi o ha già committato (e il profilo con lui) o aspetta. I tre percorsi passano quel valore a `findBookingConflict`; `person.instructorProfile?.id`, letto prima del lock, non decide più il predicato. La forma indicizzata misurata in §E non cambia (lookup sull'indice unico `personId`).
  - Unit «review 19.10 F4 — the person's OWN instructor profile is read AFTER the Person lock and BEFORE the person predicate…» × 3 percorsi: la persona è letta senza profilo, la lettura sotto lock ne trova uno → il predicato persona contiene `{ instructorProfileId: 'ip_created_meanwhile' }`; ordine lock `Person` < lettura < secondo `findFirst`. Il mock di `instructorProfile.findUnique` del describe R-19-o ora distingue `where.id` (istruttore indicato) da `where.personId` (profilo della persona).
- **F5 (LOW) — corretto.** `bookings.spec.ts` «an overlap on a move shows 409 in the Sposta form»: ogni prenotazione da form parte da una pagina appena caricata e aspetta la propria POST (`waitForResponse` → 201). Prima il banner di successo del primo invio bastava a far passare il secondo, e la seconda scelta del combobox correva contro il `router.refresh()` del primo successo. I due conteggi sono fatti via API sul velivolo run-unique (`toHaveLength(2)`, poi `['APPROVED', 'PENDING']`) invece che con le passeggiate di pagina; la riga «In attesa» resta trovata con `findBookingRow`. `test.slow()`: ~19 s da solo a 2 worker, oltre i 30 s sotto carico.
  - **×5 sotto carico**: `--repeat-each=5 --workers=5 --retries=0` con `load-f5.cjs` in parallelo (2 corsie, 300 prenotazioni inserite prima del `FUTURE_DAY` durante il run, 744 richieste) → **5 passed** (1,0-1,1 min ciascuno, dentro i 90 s di `test.slow`). Un primo tentativo con un carico estremo (4 corsie senza pausa, 11.114 richieste e 2.702 prenotazioni in 4 min) e senza `test.slow` era finito **5/5 in timeout a 30 s**, nel setup: la pagina non aveva ancora reso «Nuova prenotazione». Da lì `test.slow`; le 2.702 prenotazioni sono state cancellate dal gemello prima del secondo tentativo, perché avrebbero spinto le righe del test oltre le 50 pagine di `findBookingRow`.
- **F6 (osservazione) — corretto.** I due test che usano `withBlockingRating` (RATING bloccante `scope: 'ALL'`, mancante per tutti per una richiesta) hanno il tag `@global-catalogue`. Il project `chromium` li esclude (`grepInvert`), e un project nuovo della catena serializzata li esegue: `booking-requirements-catalogue`, `testMatch` sullo spec, `grep` sul tag, dopo `mobile-settings` e prima di `aog-overview-count`, che resta ultimo. La selezione è per tag e non per file, così il resto dello spec resta nel project principale e gli helper locali non si duplicano. `--list`: 15 test in `chromium`, 2 in `booking-requirements-catalogue`. Eseguito da solo (`--project=booking-requirements-catalogue --no-deps`): **2 passed**.

### Deviazioni del fix

- **AD-9 regola 3** («nessuno spec nuovo nella catena serializzata») è superata per due test, per decisione della sessione principale (F6). Il conteggio della catena passa da 52 a 54.
- **Primitiva condivisa invece di markup locale** (F3): `MiniModal` in `src/components/ui/` accanto a `SlideOver`, perché la meccanica del dialogo (trappola, Escape, focus) è del telaio, come dice la 15.10 per `focus-trap.ts`. Restano `.mini-modal` senza dialogo, fuori dal perimetro deciso: lo storno del registro voli (`logbook-console.tsx:813`), lo storno della contabilità (`billing-console.tsx`) e il pannello quota (`scadenze-console.tsx:977`). **Osservazione per la sessione principale**, non registrata come TD (istruzione «nessun TD salvo quelli indicati»): basta avvolgerli in `MiniModal`.
- **`focus-trap.ts` toccato** (F3), cioè la trappola di `SlideOver` e `MobileSheet`: è la generalizzazione descritta sopra, provata dalla serie 4.
- **F2, nuovo 409** su un'approvazione la cui prenotazione cambia fra la lettura e il lock: è una risposta in più del contratto, documentata nel doc-comment e nell'OpenAPI.

### TD

- **TD-19.10-e** (nuovo, preesistente, non della 19.10): a 320 px la riga «Per categoria» della contabilità (`src/app/[locale]/dashboard/billing/billing-console.tsx`, `billing-cat-line`) non regge tre importi a 6 cifre: con `112.445,00 €` sfora di 2 px (`cw 226 / sw 228`), quindi uno scroller nascosto. È un limite reale per un club con più di 100.000 € in una categoria nel mese. Da riprogettare la riga (a capo, o importi abbreviati) con la story che tocca la contabilità mobile.

### Prove

- **Gate**: `npm run gates` → `PASS lint (42s)`, `PASS typecheck (9s)`, `PASS test (24s) — Tests 2153 passed (2153)`, `PASS build (66s)` (dopo l'ultima modifica, il `test.slow()`; il primo giro sul codice dei service e della UI era identico: 58 s / 6 s / 2153 / 57 s). `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run src/server/services/bookings.service.test.ts` → 336 passed.
- **Unit rosse sul pre-fix**: stesso file di test in un worktree di `f6b06ab` (servizio pre-fix, `git worktree`, rimosso a fine lavoro) → **6 failed / 330 passed**: le 3 F4, la F2 «evaluated BEFORE» per l'approvazione e le 2 F2 «moved… 409». Sul fix 336/336.
- **Delta**: unit 2147 → **2153** (+6). e2e 597 → **598** (+1, la guardia F3): `chromium` 544 (545 + 1 − 2 spostati) + catena 54 (52 + 2) — `--list`: 598 test in 67 file.
- **Serie e2e** (gemello `airmanager_fix1910` fresco, build del fix, `E2E_REUSE_SERVER=1`, `CI=1`), in ordine sullo stesso DB:
  1. gli 11 spec dell'helper (`aircraft-out-of-service-until`, `aog-impact-email`, `api-v1`, `booking-requirements`, `home-dashboard`, `expiry-rules-currency`, `mobile-planning`, `mobile-overview`, `bookings`, `datetime-picker`, `typeahead-pickers`) → **129 passed**, 0 flaky;
  2. `mobile-billing.spec.ts --retries=0` → **26 passed** (`:894` compreso);
  3. `--project=booking-requirements-catalogue --no-deps` → **2 passed**;
  4. regressione della trappola: `flights`, `mobile-registries`, `mobile-expiries-movements`, `mobile-a11y-sweep`, `mobile-logbook` → **97 passed**;
  5. F5 ×5 sotto carico → 5 passed (sopra).
  SQL «essere umano» (coppie APPROVED sovrapposte della stessa persona in qualunque ruolo) sul gemello a fine serie: **0**.
- Gli script e i log sono nello scratchpad della sessione, `f1910/`: `probe-f2.cjs`, `probe-f3.cjs`, `probe-f3-shots.cjs`, `load-f5.cjs`, `f1-measure.sql`, gli esiti `probe-f2-{prefix,fix}.json` e `probe-f3-{prefix,fix}.json`, i log `series*.log`, `f3-guard-prefix.log`, `server-{prefix,fix}.log`, e `shots/`.

### File toccati dal fix

- `src/server/services/bookings.service.ts`, `src/server/services/bookings.service.test.ts`, `src/server/services/app-settings.service.ts` (doc-comment), `src/lib/schemas/registry.ts` (descrizione OpenAPI)
- `src/components/ui/mini-modal.tsx` (nuovo), `src/components/ui/focus-trap.ts`, `src/components/dashboard/requirements-warning.tsx`, `src/app/[locale]/dashboard/bookings/bookings-table.tsx`
- `e2e/helpers.ts`, `e2e/booking-requirements.spec.ts`, `e2e/bookings.spec.ts`, `playwright.config.ts`

### Stato della macchina

- Gemello `airmanager_fix1910` **eliminato** (`pg_database` = `airmanager`, `airmanager_audit`, `airmanager_load`, `postgres`, template). `airmanager` (resettato dalla sessione principale), `airmanager_audit`, `airmanager_load` e `audit-2026-11-02/`: mai toccati.
- `:3000` libero (server di prova pre-fix e fix fermati per PID); `scripts/e2e.sh status` = DONE `E2E_EXIT=0` (il run F5 ×5); `.next` = build dell'ultimo `npm run gates`, sul codice di `761bf92`. Worktree di prova rimosso (`git worktree list` = solo `dev`).
- **Prossimo passo**: arbitro completo su DB fresco (sessione principale): atteso **598**, con i 2 test `@global-catalogue` nella catena.

### Chiusura (sessione principale, 2026-11-03)

- **Arbitro finale**: DB `airmanager` resettato, `CI=1 scripts/e2e.sh start` su HEAD `42ecd3e` (10:41 Roma, fuori dalla fascia 23:40-01:00): **597 passed + 1 flaky = 598, E2E_EXIT=0** (22,6 min); delta 580 → 597 (dev) → 598 (fix: +1) confermato.
- **Flaky** `account-statement.spec.ts:90` → `apiRequestContext.get: read ECONNRESET` su `GET /api/v1/me` (nessuna risposta del dominio). Seconda occorrenza consecutiva della classe dopo l'arbitro 19.9 → **TD-19.10-g (infra, priorità media)**: probabile corsa keep-alive fra il server Node (`keepAliveTimeout` 5 s di default) e il riuso dei socket di `APIRequestContext`; correzione candidata `next start --keepAliveTimeout 75000` nel `webServer` di `playwright.config.ts` (e nel `npm run start` usato con `E2E_REUSE_SERVER`), da provare con N run.
- **TD-19.10-f**: tre mini-modal restano non accessibili come dialoghi (storno del registro voli, storno in contabilità, pannello quota) — basta avvolgerli in `MiniModal`.
- Decisioni della sessione principale sulla review: TUTTI i finding corretti ora (F2 e F3 inclusi, invece di TD).

