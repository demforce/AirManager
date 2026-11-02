---
baseline_commit: 72e7e1b
---

# Story 19.4: Editor pilota e istruttore a Salva unico

Status: **review** — 2026-11-02, implementazione `e160065` (Dev Agent Record in fondo). Scritta il 2026-11-01 (con due domande PO aperte, §❓: nessuna blocca la scrittura del backend, entrambe toccano solo la resa di due campi dell'editor istruttore; Q-19.4-b coincide con la Q-19.3-d, e la Q-19.3-c tocca il controllo dei profili, AD-9). Contratti backend della 19.3 concordati col suo writer e riportati nel banner. **Modello dev: Opus 5 xhigh (UI)** — la story riscrive due editor e il componente scadenze condiviso, oltre a service, schema Zod, OpenAPI ed e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Un solo dev subagent. Chiave sprint-status: `19-4-editor-pilota-istruttore-salva-unico`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` di questo file è misurato su **`72e7e1b`**. Il dev della 19.4 parte **DOPO il commit di 19.1, 19.2 e 19.3**, che toccano gli stessi file:
> - **19.2** toglie il codice fiscale da **entrambi** gli editor (`pilot-editor.tsx:56/261/287/311/323/347-349/459/594/663-665`, `instructor-editor.tsx:51/205/283/345-347`), da `updatePersonSchema`/`createPersonBaseSchema` (`src/lib/schemas/people.ts:22`, `:36`) e da `people.service.ts` (`assertUnique` diventa solo-email, AD-2 della 19.2): le righe slittano, e `fiscalCode` **non** deve ricomparire in nulla di quanto scritto qui.
> - **19.3** (`19-3-tariffe-allievo-pilota-editor-velivolo.md`, AD-2/AD-3/AD-5/AD-7, trappola 14 di §5) consegna il backend da cui questa story dipende. **Contratti concordati col suo writer il 2026-11-01** (da riverificare sul codice committato al T0: la review della 19.3 può rinominarli):
>
> | Contratto 19.3 | Forma | Uso qui |
> |---|---|---|
> | Esclusività pilota/allievo | `assertPilotStudentExclusive(tx, personId)` esportato da `people.service.ts`: legge `PilotProfile`/`StudentProfile` **dentro `tx`**, sullo **stato finale**; entrambi attivi → `ValidationError(…, undefined, 'PILOT_STUDENT_PROFILES_EXCLUSIVE')` → **422** senza `details`. I core `upsert*ProfileCore` restano **invariati** (il controllo non è dentro di loro) | AD-2 passo 6: **una** chiamata dopo disattivazioni e attivazioni |
> | Lock persona | `upsertProfile` (route singole) apre la transazione con `SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE` (fa anche da 404), poi core, poi helper | AD-3: **lo stesso** statement |
> | `createPerson` con `profiles.pilot` + `profiles.student` | pre-check sul body → stesso 422 | AD-9 (la UI del create lo rende impossibile) |
> | Tariffa istruttore (scrittura) | `upsertInstructorRateCore(tx, instructorProfileId, input: CreateInstructorRateInput, actorUserId)` esportato da `instructor-rates.service.ts`: upsert nativo su `(instructorProfileId, validFrom)`, riscrive prezzo e `actorUserId` | AD-2 passo 8 |
> | Decorrenza | `assertRateValidFromNotPast(validFrom: string)` esportato da `rates.service.ts` (condiviso velivolo/istruttore) → 422 `RATE_VALID_FROM_IN_PAST`; si chiama **prima** della transazione; «oggi» server = `todayDateOnlyUtcInZone(APP_TIMEZONE)` | AD-2 passo 4 |
> | Stessa data | il 409 «stessa `validFrom`» **sparisce** (riscrittura; `POST …/instructor-rates` → 201 anche quando riscrive); resta il 409 «no active instructor profile» delle funzioni pubbliche | AC 5, AC 18 |
> | «Oggi» client | nessuna funzione nuova: `todayDateOnlyInZone(APP_TIMEZONE)` da `@/lib/zoned-time` + `APP_TIMEZONE` da `@/lib/time` (idioma 16.9 AD-1) | AC 18 |
> | Minimo del calendario | `CalendarPopover` guadagna `minDate?: Date`; `DateInput` **non** ha prop nuove: legge il `min` nativo (`YYYY-MM-DD`) e lo inoltra. Giorni < min = `<button disabled>`; la digitazione < min **non** è bloccata (form `noValidate`) → serve la validazione client | AC 18, AC 21: `<DateInput min={todayRome} …/>` |
> | Composito velivolo | `PATCH /api/v1/aircraft/{id}` con blocco opzionale `rate` (stesso blocco del `POST /aircraft`), response invariata | D-1: stessa forma «PATCH sulla risorsa con blocchi opzionali» |
> | Resa del campo tariffa | placeholder = valore digitabile senza simbolo (`45,00`) **+** `hint` del `Field` «Attuale: {price}/h — lascia vuoto per non cambiarlo.» (il placeholder da solo non è accessibile); pannello aperto dopo il Salva; tariffa programmata = una riga sola, la più vicina (Q-19.3-d ≡ Q-19.4-b) | AC 18, AD-10 |
> | e2e | `e2e/db-fixtures.ts#seedInstructorRate(personId, { priceCentsPerHour, validFrom })` (SQL via `pg`) per tariffe con data passata; `todayRome()`/`addDaysIso()` in `e2e/helpers.ts`; `instructor-rates.spec.ts:76`/`:111` solo **adattati** dalla 19.3 alla semantica nuova; `instructor-rates-panel.tsx` **non** toccato dalla 19.3 | §3.4 |
>
> La 19.3 **non** rende esclusive le spunte del form «Nuovo»: mappa soltanto il 422 nel banner (`PilotsPage.editor.errors.profilesExclusive`) e, nell'editor attuale, nella sezione profilo (`PeoplePage.profilesPanel.errors.exclusive`). Il controllo UI è di questa story (AD-9). Le domande PO della 19.3 (Q-19.3-a..d) erano aperte alla scrittura di questo file: **Q-19.3-c** (istruttore + allievo ammesso?) e **Q-19.3-d** (≡ Q-19.4-b) toccano questa story (AD-9, AC 18).
> - **19.1** non tocca questi file in modo rilevante (solo `registry.ts`, `messages/*.json`, e2e altrove): slittamento di righe.
>
> Prima di scrivere una riga: `git log --oneline -6` (19.1, 19.2, 19.3 committate), rieseguire i **censimenti di §3** (sono comandi, non elenchi da fidarsi) e annotare gli scostamenti nel Dev Agent Record §A.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (convenzioni e2e — `getByLabel` è substring, mai `Escape` dentro uno `SlideOver` per chiudere un popup, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, unit test ed env eager, gates); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §2.3 «Salva unico», §4.0 **R-19-e**, **R-19-f**, **R-19-m**, §4.2 riga 19.4, §4.10 **A11**, **A12**, **A16**, **A17**; lo story file della **19.3** (backend tariffe/profili, editor velivolo a Salva unico — il gemello da cui copiare le scelte UI comuni); `13-1-*.md` e `13-2-*.md` (il composito di creazione e gli editor che questa story riscrive); `16-3-prenotazioni-persona-istruttore-approvazione.md` §AD-2 (ordine globale dei lock `Booking → Aircraft → Person → InstructorProfile`). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

---

## ❓ Domande PO aperte (da ratificare PRIMA del dispatch — la sessione principale registra qui l'esito)

**Q-19.4-a — Il campo «Compenso istruttore» (oggi «Tariffa payout») segue la regola del placeholder di R-19-f?**

R-19-f parla di **tariffe con decorrenza** («In vigore da», nessuno storico): la tariffa addebitata all'allievo (`InstructorRate`, storicizzata) rientra alla lettera. Il compenso pagato all'istruttore (`InstructorProfile.payoutRateCents`) è invece **un valore unico senza decorrenza** (`instructor-compensation.service.ts:532-543`, `PUT …/rate` con `null` = nessun compenso). Oggi il campo è **precompilato** col valore attuale (`instructor-editor.tsx:400`) e svuotarlo significa «nessun compenso» (`:405-406`).

| Opzione | Cosa | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | Resta com'è: campo **precompilato**, svuotarlo e salvare = nessun compenso (`null`). Entra nel Salva unico solo se il valore cambia | nessuna regola nuova; il compenso non ha decorrenza, quindi «vuoto = invariata» non ha un'alternativa per esprimere «togli il compenso» | i due campi tariffa dello stesso pannello si comportano in modo diverso (uno precompilato, uno a placeholder) |
| B | Anche il compenso a placeholder: vuoto = invariato | i due campi si comportano uguale | non si può più togliere un compenso dalla UI (serve un'azione nuova «Rimuovi compenso») oppure un valore `0` che oggi ha un significato diverso da `null` (compenso `null` → tariffa e dovuto «—» in tabella, `instructors-console.tsx:161-164`, `computeOwed` `instructor-compensation.service.ts:207`; compenso `0` → «0,00 €») |

*Raccomandazione A*: R-19-f è scritta per le tariffe con decorrenza; il compenso non ne ha, e B costringerebbe a inventare un'azione. Gli AC sono scritti su **A** (AC 19).

> **DECISIONE PO (2026-11-01)**: **A — precompilato** (svuotarlo e salvare = nessun compenso). AC 19 invariato.

**Q-19.4-b — Una tariffa istruttore già programmata nel futuro (validFrom > oggi) è visibile nell'editor?**

R-19-f: il campo mostra la tariffa **attuale** come placeholder, nessuno storico. Ma una tariffa con data futura, inserita ieri, **non è attuale** (non compare nel placeholder) e **non è storico**: con la sola regola di R-19-f l'admin non la vede da nessuna parte, mentre il voli registrati da quella data in poi la useranno. R-19-f dice anche che «una tariffa con data ≥ oggi si può riscrivere»: per riscriverla bisogna sapere che esiste e con che data.

| Opzione | Cosa | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | Sotto il campo, **una riga** in sola lettura quando esiste la prossima tariffa programmata: «Dal 15/11/2026: 45,00 €/h» (solo la più vicina, mai l'elenco) | l'admin vede cosa succederà e può riscriverla scegliendo quella data; non è uno storico | una riga di copy nuova |
| B | Niente: solo il placeholder con l'attuale | R-19-f alla lettera | tariffa invisibile finché non entra in vigore; riscriverla richiede di indovinarne la data |

*Raccomandazione A*. **È la stessa domanda della Q-19.3-d** (editor velivolo, due prezzi), con la stessa raccomandazione concordata fra i due writer: la risposta del PO vale per **entrambi** gli editor e si registra una volta sola. Gli AC sono scritti su **A** (AC 18, ultima riga); con **B** quella riga si toglie e basta.

> **DECISIONE PO (2026-11-01)**: **A — una riga sotto il campo** con la sola prossima tariffa programmata (stessa decisione della Q-19.3-d). AC 18 invariato.

> **DECISIONE PO collegata (Q-19.3-c, 2026-11-01)**: anche **istruttore + allievo** sono incompatibili (il profilo allievo esclude pilota E istruttore, stesso 422 della 19.3): AD-9 e l'AC 25 (creazione) si estendono — il form non permette Allievo insieme a Pilota né a Istruttore, e il Salva unico mappa il 422 su entrambe le combinazioni.

Nessun'altra assunzione di dominio nuova: le scelte di §0.3 sono tecniche o di resa UI, ognuna ricondotta a una ratifica chiusa o a un precedente nel codice (la sessione principale può portarle al PO se lo ritiene).

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che l'editor di un pilota e quello di un istruttore abbiano **un solo «Salva» in fondo al pannello**, che salva insieme anagrafica, profili (attivi e disattivi), ratings, visite mediche, compenso e tariffa istruttore — **tutto o niente** —, mentre «Archivia», «Crea e invia invito» e «Reinvia invito» restano bottoni a parte,

so that non debba più ricordarmi quale delle sei sezioni ho salvato e quale no (punto PO 7, R-19-m), un errore in una parte non lasci mai la persona salvata a metà (A17), e la tariffa istruttore si comporti come quella del velivolo (punto PO 14, R-19-f).

### Il perché

Oggi l'editor pilota in modifica è un mosaico di **form e azioni istantanee indipendenti** (inventario completo in §3.1): il footer salva solo l'anagrafica; ogni profilo ha i suoi bottoni Attiva/Modifica/Salva/Disattiva/Conferma; ogni rating e ogni visita medica si aggiunge, si modifica e si rimuove con una chiamata immediata (`LiveExpiryEditor`). L'editor istruttore ha tre submit (anagrafica nel footer, compenso, tariffa allievo) più le scadenze istantanee. Il risultato è che «Salva modifiche» **non salva** quello che l'utente ha appena toccato in un'altra sezione, e che una sequenza di modifiche può fermarsi a metà. La R-15.10-f («i submit di sezione restano dove sono») viene **superata** da R-19-m.

La creazione di una persona è **già** composita e atomica (`POST /api/v1/people`, story 13.1, `people.service.ts:468-543`): questa story porta lo stesso modello alla **modifica**.

### Fatti misurati che vincolano il design (su `72e7e1b`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| La creazione è già un composito transazionale | `createPerson` (`people.service.ts:468-543`): pre-validazione fuori transazione (403 → 409 email → 422 tipi scadenza), poi UNA `prisma.$transaction` con i `*Core(tx, …)` di profilo e le `tx.expiry.create`, email d'invito DOPO il commit | la modifica estende **lo stesso** schema, coi **core già estratti** (`upsertPilotProfileCore` `:635`, `upsertStudentProfileCore` `:647`, `upsertInstructorProfileCore` `:665`) — mai copie (AD-4) |
| I permessi delle parti sono diversi… | anagrafica e profili `people.manage` (`people.service.ts:547`, `:701`, `:730`); scadenze `expiries.manage` (`expiries.service.ts:185`, `:263`, `:300`); compenso `payouts.manage` (`instructor-compensation.service.ts:533`); tariffa allievo `settings.manage` (`instructor-rates.service.ts:120`) | il composito autorizza **ogni parte presente** nel body (AD-7) |
| …ma oggi li ha tutti solo l'ADMIN | `rbac.ts:107-111`: `ADMIN: ALL_PERMISSIONS`, gli altri ruoli hanno solo `self.read`/`bookings.*` | «ha `people.manage` ma non `payouts.manage`» è **strutturalmente irraggiungibile** (stessa nota di `people.service.ts:471-477` sul blocco `access` del create): il gating per parte si prova con un unit a `authorize` mockato, non con un ruolo (AD-7) |
| Un 409 generico oggi vuol dire «email già usata» per il client | `pilot-editor.tsx:301`, `:633`: `code === 'CONFLICT' ? labels.errors.conflictEmail : …`; ma `createInstructorRate` (`:124`, `:127`, `:149`), `setPayoutRate` (via `resolveActiveInstructorProfileId`, `:437-444`), `registerExpiry` (`:201`, `:222`, `:239`) lanciano **lo stesso** `CONFLICT` per motivi diversi | in un composito il client non saprebbe più a quale sezione attribuire un 409 → ogni 409 del composito diverso dall'email porta un **codice proprio** (AD-5) |
| `instructor-compensation.service.ts` importa `bookings.service.ts` | `instructor-compensation.service.ts:7` → `bookings.service` → `app-settings.service` → `@/server/crypto/secret-box` → `@/lib/env` (validazione Zod **eager**) | importarlo da `people.service.ts` romperebbe `people.service.test.ts` in una shell senza `.env` (CLAUDE.md, 3 occorrenze): la scrittura del compenso nel composito è un `tx.instructorProfile.update` locale (AD-4) |
| L'unico lock su `Person` oggi è quello delle prenotazioni | `bookings.service.ts:338-343` (`lockBookingPeople`, `FOR NO KEY UPDATE`); il doc-comment del modulo afferma «no other service locks `Booking`/`Person`/`InstructorProfile` rows» (`:81-82`) | la 19.3 ne aggiunge uno identico in `upsertProfile`; il composito prende **lo stesso** (AD-3): modo `FOR NO KEY UPDATE`, ordine coerente, doc-comment delle prenotazioni da aggiornare |
| Il testid del Salva del footer è usato da 6 spec | `pilot-identity-submit` (6 spec, anche in creazione), `instructor-identity-submit` (2 spec mobili che ne misurano hit-test e posizione nel `.so-foot`) | i due testid **restano** sul Salva unico; i testid dei submit di sezione spariscono (§3.4) |
| Gli editor non hanno un albero mobile proprio | lo stesso `SlideOver` diventa pannello a tutto schermo sotto 640px (story 15.2/15.10, `slide-over.tsx:46-100`, `airops.css:1135-1139`, `:2065`) | il Salva unico è **uno**, nello `.so-foot`, a ogni viewport: nessun testid `-mobile`/`mobile-` nuovo (AD-11) |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.4)

| # | Requisito |
|---|---|
| **P1** | Un **endpoint composito atomico** per la persona: anagrafica, profili attivi/disattivi, scadenze (ratings e visite mediche: aggiunte, modifiche, rimozioni), compenso istruttore, tariffa istruttore — tutto in **una transazione**, sul modello di `createPerson`. |
| **P2** | Un **solo Salva** nel piede del pannello (`SlideOver` `footer`, `.so-foot`) in entrambi gli editor, a ogni viewport. |
| **P3** | Restano bottoni a parte **solo** le azioni con effetti propri: **Archivia/Ripristina**, **Crea e invia invito**, **Reinvia invito** (R-19-m). |
| **P4** | Disattivare un profilo è un **dato** del Salva unico, non un'azione (A11). |
| **P5** | Profili pilota e allievo **esclusivi** (R-19-e): la UI non permette di attivarli entrambi; il backend (19.3) resta la garanzia. |
| **P6** | Tariffa istruttore (R-19-f): placeholder = tariffa attuale, vuoto = invariata, «In vigore da» predefinito oggi e minimo oggi (Europe/Rome, A16), **nessuno storico**. |
| **P7** | **Nessun salvataggio parziale**: un errore in una parte → nessuna parte salvata, il form conserva tutte le modifiche (A17). |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-m** | Tutti i dati dal Salva unico; restano azioni solo Archivia, Fuori servizio/Rientro, Invia/Reinvia invito, Email di prova. | P2, P3; supera R-15.10-f. |
| **R-19-e** | Pilota e allievo mutuamente esclusivi; istruttore combinabile col pilota. | P5, AC 9-10. |
| **R-19-f** | Decorrenza tariffe uguale per velivolo e istruttore: «In vigore da» predefinito e minimo oggi, placeholder = attuale, vuoto = invariata, riga con data ≥ oggi riscrivibile, nessuno storico. | P6, AC 18. |
| **A11** | Disattivare un profilo diventa un dato del Salva unico. | P4. |
| **A12** | Con «In vigore da» ≥ oggi, i voli datati prima della prima tariffa di un istruttore non si registrano (`NO_INSTRUCTOR_RATE`). | Conseguenza accettata, nessun lavoro qui (è del backend 19.3). |
| **A16** | Le date «oggi» nuove usano Europe/Rome lato server **e client**. | AC 18: default e minimo di «In vigore da» calcolati in Europe/Rome, mai `new Date().toISOString().slice(0, 10)` (la copia UTC di `instructor-rates-panel.tsx:71-73`, TD 16.9, sparisce con il pannello). |
| **A17** | Endpoint compositi atomici (una transazione), **mai** orchestrazione client di N richieste; il precedente `club-card.tsx:90-116` (5 PUT in `Promise.all`) non va replicato. | AD-1, AD-2; AC 6-7. |

**Ratifiche/AC storici SUPERATI da questa story** (da non «ripristinare»): **R-15.10-f** («i submit di sezione restano dove sono», `pilot-editor.tsx:152-162`, `instructor-editor.tsx:126-135`) e il suo pin e2e `mobile-registries.spec.ts:774-845` (AC 5-c della 15.5); story 13.2 AC 2 limitatamente alla scrittura **immediata** delle scadenze dall'editor (`LiveExpiryEditor`); story 2.2 limitatamente alla disattivazione dei profili come azione con conferma; story 4.2 AC 1 e 12.7 limitatamente allo **storico tariffe mostrato** nell'editor istruttore e al suo form «Aggiungi tariffa»; story 12.7 limitatamente al submit proprio del compenso.

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | Il composito è **`PATCH /api/v1/people/{id}` esteso** con blocchi opzionali, non una route nuova. Un body con le sole chiavi d'anagrafica si comporta **esattamente** come oggi. | Precedente 13.1: `POST /people` esteso con `profiles`/`expiries`/`access` opzionali (`registry.ts:434-447`); **stessa forma della 19.3** per il velivolo (`PATCH /api/v1/aircraft/{id}` + blocco opzionale `rate`) | route nuova `…/save`: due modi di aggiornare la stessa risorsa, non REST |
| **D-2** | Il body è **dichiarativo sullo stato finale** di ogni parte: `profiles.<tipo> = { active: true, …campi } \| { active: false }`; `expiries = { set: [...], remove: [...] }` per **tipo** di scadenza. Disattivare un profilo già inattivo e rimuovere una scadenza assente sono **no-op**, non 409. | A17 + idempotenza (AD-2): un retry dello stesso body deve dare lo stesso stato, non un errore | ricalcare le azioni (`deactivate`, `delete by id`): il secondo invio dopo un timeout darebbe 409/404 su un salvataggio riuscito |
| **D-3** | Il client manda **solo il diff** (parti e campi modificati rispetto a quanto caricato). | Protegge le parti non toccate da un form aperto da tempo (un altro admin può averle cambiate); rende naturale il RBAC per parte (AD-7) | mandare tutto il form: sovrascrive in silenzio le modifiche altrui sulle parti che l'utente non ha toccato |
| **D-4** | Dopo un Salva riuscito il pannello **resta aperto** (toast di conferma, form riallineato al server), come fa oggi il Salva del footer. | Comportamento attuale di `pilot-identity-submit`/`instructor-identity-submit` (`pilot-editor.tsx:316-326`, `instructor-editor.tsx:300-301`) | chiudere: cambia il comportamento del footer di oggi e costringe a riaprire per verificare |
| **D-5** | Il Salva è **disabilitato** quando il diff è vuoto o una richiesta è in volo. | Oggi è disabilitato solo in volo (`pilot-editor.tsx:170`); con un diff esplicito «nulla da salvare» è uno stato reale da mostrare | Salva sempre attivo: un click senza modifiche non farebbe nulla, o manderebbe una richiesta vuota |
| **D-6** | **Nessuna** conferma «modifiche non salvate» alla chiusura. | Precedente: il form di creazione (`pilot-editor.tsx:826-833`) e i form prenotazione chiudono senza conferma | un dirty-guard: superficie nuova senza precedenti nell'app, fuori perimetro. Se la 19.3 ne avesse introdotto uno sull'editor velivolo, replicarlo **identico** qui (stesso componente) e annotarlo in §G |
| **D-10** | Il placeholder e la riga «tariffa programmata» si calcolano **nel client** dalla lista che l'editor già carica oggi (`GET /people/{id}/instructor-rates`, `instructor-rates-panel.tsx:76-80`): attuale = massima `validFrom ≤ oggi` Roma, programmata = minima `validFrom > oggi` Roma; dopo il Salva la lista si ricarica. | L'editor istruttore è già tutto a fetch lato client (anagrafica, scadenze, tariffe); nessun codice server nuovo | il batch server nelle props della pagina, come fa la 19.3 per il velivolo (`getEffectiveRates`): coerente, ma aggiunge una lettura a ogni render della pagina Istruttori per un dato che serve solo a editor aperto |
| **D-7** | Le scadenze in bozza riusano il pattern **già** in uso nel form di creazione (`NewExpiryChipGroup`, `pilot-editor.tsx:383-433`): chip → riga con data inline; righe esistenti con data modificabile inline; rimozione come **interruttore reversibile** fino al Salva. Nessuna conferma a due passi, nessun «Aggiungi»/«Salva» di riga. | R-19-m: niente salvataggi di sezione; un bottone «Salva» di riga che non salva sarebbe ingannevole | tenere `LiveExpiryEditor` con «Aggiungi»/«Salva» di riga che scrivono in una bozza: due livelli di «salva» nello stesso pannello |
| **D-8** | Le route singole restano tutte (`PUT/POST …/profiles/{type}[/deactivate]`, `POST/PATCH/DELETE /api/v1/expiries`, `PUT /instructor-compensation/{id}/rate`, `POST /people/{id}/instructor-rates`): gli editor **non le chiamano più**. | API-first (futura app Flutter); sono la base di decine di helper e2e e del flusso «Aggiungi istruttore» (`instructors-console.tsx:681`) | toglierle: rottura di contratto e di ~40 helper e2e, nessun beneficio |
| **D-9** | L'editor istruttore guadagna «Annulla» nel footer accanto a «Salva», come l'editor pilota. | La label `InstructorEditorLabels.cancel` esiste già ed è inutilizzata (`instructor-editor.tsx:43`, `instructors/page.tsx` `editor.cancel`) | footer asimmetrici fra i due editor |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Contratto: `PATCH /api/v1/people/{id}` composito

Schema Zod nuovo in `src/lib/schemas/people.ts`, accanto a `createPersonSchema` (`:193-203`), riusando gli schemi per tipo già esistenti:

```ts
// forma, non lettera
const pilotProfileChangeSchema = z.discriminatedUnion('active', [
  pilotProfileRequestSchema.extend({ active: z.literal(true) }),
  z.object({ active: z.literal(false) }),
]);
// student: studentProfileRequestSchema.extend({ active: true }) | { active: false }
// instructor: { active: true } | { active: false }

const personExpiryChangesSchema = z.object({
  set: z.array(createPersonExpirySchema).max(50).optional(),        // { expiryTypeId, expiresAt } — riuso, :176-179
  remove: z.array(z.string().min(1)).max(50).optional(),            // expiryTypeId
}).refine(/* expiryTypeId unici in set, unici in remove, nessuno in entrambi */);

export const updatePersonCompositeSchema = updatePersonSchema.extend({
  profiles: z.object({ pilot: …optional(), student: …optional(), instructor: …optional() }).optional(),
  expiries: personExpiryChangesSchema.optional(),
  payoutRateCents: setInstructorPayoutRateSchema.shape.payoutRateCents.optional(), // riuso (instructor-compensation.ts:125-127): int ≥ 0 ≤ INT_MAX | null
  instructorRate: createInstructorRateSchema.optional(),                            // riuso: { priceCentsPerHour, validFrom } (regola ≥ oggi: 19.3)
});
```

- `updatePersonSchema` **resta** com'è (è il resolver RHF dell'anagrafica nei due editor); la route usa `updatePersonCompositeSchema` (`src/app/api/v1/people/[id]/route.ts:11-14`).
- **Response 200**: `PersonDetail` (`personDetailSchema`, `people.ts:236-240`) al posto di `PersonListItem`: è un **soprainsieme** (aggiunge i tre profili completi), nessun campo rinominato o tolto → compatibile per ogni client esistente. Serve agli editor per riallineare la sezione profili senza un secondo GET.
- **Errori** (tutti nell'involucro AD-8): 401; **403** se manca il permesso di una qualunque parte presente (prima di ogni query, AD-7); **404** persona inesistente; **409** `CONFLICT` email già usata (codice invariato, 19.2 AD-2), **409** `PERSON_ARCHIVED`, **409** `INSTRUCTOR_PROFILE_INACTIVE` (AD-5); **422** `VALIDATION_ERROR` (forma), `EXPIRY_TYPE_NOT_FOUND`, `EXPIRY_TYPE_INACTIVE`, `SCOPE_MISMATCH` (stessi codici del create, `people.service.ts:423-434`), `PILOT_STUDENT_PROFILES_EXCLUSIVE` e `RATE_VALID_FROM_IN_PAST` (19.3).
- **OpenAPI** (`registry.ts:462-473`): `body` = `updatePersonCompositeSchema` (registrato come `UpdatePersonRequest` al posto di `updatePersonSchema`, `:252`), summary «Update a person — optionally in one atomic save (profiles, expiries, instructor compensation and rate)», description che dice: atomicità, semantica dichiarativa e no-op di D-2, permesso per parte, ordine di applicazione (AD-2), response `PersonDetail`, i codici sopra; `responses` con `jsonContent(personDetailSchema)` e `errorResponses(401, 403, 404, 409, 422)`. `registry.test.ts`: asserzioni sulla presenza di `profiles`/`expiries`/`payoutRateCents`/`instructorRate` in `UpdatePersonRequest` e sulla response `PersonDetail`.
- **Idempotency-Key**: **non** richiesta. Il PATCH è idempotente per costruzione (AD-2), come ogni `PATCH` dell'app; l'`Idempotency-Key` (TD-2) serve alle `POST` che creano denaro.

### AD-2 — Service: `updatePerson` diventa il composito, in quest'ordine

`people.service.ts#updatePerson` (`:545-578`) si estende come `createPerson` si era esteso nella 13.1: stessa funzione, firma `updatePerson(actor, id, patch: UpdatePersonCompositeInput): Promise<PersonDetail>`. Ordine **vincolante**:

**Fuori dalla transazione** (fail-fast, nessuna scrittura, 403 prima di qualunque query):
1. `authorize(actor, 'people.manage')` (sempre); poi, **solo per le parti presenti**: `expiries` → `expiries.manage`; `payoutRateCents` → `payouts.manage`; `instructorRate` → `settings.manage`. (`profiles` è già coperto da `people.manage`.)
2. Persona esistente → altrimenti 404 (oggi `:549-552`).
3. Pre-check email (`assertUnique`, dopo la 19.2 solo-email) → 409 `CONFLICT`.
4. Se `expiries.set` non è vuoto: tipi esistenti e **attivi** per le sole righe che verranno **create** (le righe esistenti si possono aggiornare anche su un tipo disattivato, come fa oggi `updateExpiry`, e come mostra oggi l'editor, `expiry-editor.tsx:13-17`) → 422 `EXPIRY_TYPE_NOT_FOUND`/`EXPIRY_TYPE_INACTIVE`. Se `instructorRate` è presente: `assertRateValidFromNotPast(instructorRate.validFrom)` (19.3, `rates.service.ts` — import pulito, nessuna catena env) → 422 `RATE_VALID_FROM_IN_PAST`.

**Dentro UNA `prisma.$transaction`** (ogni scrittura passa da `tx`, nessuna da `prisma`):
5. **Lock** della persona: `SELECT "id" FROM "Person" WHERE "id" = $1 FOR NO KEY UPDATE` — **primo statement** (AD-3).
6. **Profili**: prima le **disattivazioni** (`updateMany … where { personId, deactivatedAt: null }` — 0 righe = no-op), poi attivazioni/aggiornamenti coi core esistenti (`upsertPilotProfileCore`/`upsertStudentProfileCore`/`upsertInstructorProfileCore`, che portano anche l'upsert dell'`Account`). Poi **una** chiamata a `assertPilotStudentExclusive(tx, personId)` (19.3), che legge lo **stato finale** da `tx` — così «disattiva Allievo + attiva Pilota» nello stesso Salva passa, «attiva Pilota» con Allievo attivo e non disattivato fallisce con 422 `PILOT_STUDENT_PROFILES_EXCLUSIVE` e il rollback annulla anche l'upsert dell'`Account`. Chiamarla anche quando il body non tocca Pilota/Allievo è innocuo (lo stato finale è quello del DB, già valido) ma superfluo: basta chiamarla se `profiles.pilot` o `profiles.student` sono presenti.
7. **Scadenze**: rimozioni (`deleteMany` per `personId` + `expiryTypeId in remove` — tipo assente = no-op), poi `set` per tipo: riga assente → **creazione** (persona archiviata → 409 `PERSON_ARCHIVED`, stessa regola di `registerExpiry`, `expiries.service.ts:200-202`; ambito compatibile coi profili **finali**, letti da `tx` dopo il passo 6, altrimenti 422 `SCOPE_MISMATCH` — stesso helper di `registerExpiry`, AD-4); riga presente con `expiresAt` **diverso** → aggiornamento **con** la cancellazione dei `SentAlert` (story 6.3 AD-9, `expiries.service.ts:270-287`); data uguale → **nessuna scrittura**.
8. **Istruttore** (solo se `payoutRateCents` o `instructorRate` presenti): profilo istruttore **attivo sullo stato finale** (letto da `tx` dopo il passo 6), altrimenti 409 `INSTRUCTOR_PROFILE_INACTIVE`. Poi `tx.instructorProfile.update({ data: { payoutRateCents } })` se presente e diverso; poi `upsertInstructorRateCore(tx, instructorProfileId, instructorRate, actor.userId)` (19.3: upsert su `(instructorProfileId, validFrom)`, riscrittura se la data esiste già; la decorrenza è già stata verificata al passo 4).
9. **Anagrafica per ULTIMA**: `tx.person.update` coi soli campi presenti (oggi `:556-575`, stesso backstop P2002 → 409 `CONFLICT`). Se nessun campo d'anagrafica è presente, nessuna `update`.
10. Lettura finale con `PERSON_DETAIL_SELECT` da `tx` → `toPersonDetail`.

**Idempotenza**: lo stesso body inviato due volte dà lo stesso stato e **200** entrambe le volte — attivazioni = upsert; disattivazioni e rimozioni no-op se già fatte; `set` con data uguale non scrive; compenso = assegnazione; tariffa = riscrittura della riga con lo stesso `validFrom ≥ oggi` (19.3). Unico effetto collaterale ammesso al secondo invio: nessuno (nessun `SentAlert` cancellato, perché la data non cambia).

**Retro-compatibilità**: un body con le sole chiavi d'anagrafica esegue i passi 1-3, 5, 9, 10 → stesso esito di oggi, più la response arricchita.

### AD-3 — Concorrenza: lock `Person` in `FOR NO KEY UPDATE`, anagrafica per ultima

Perché un lock: l'esclusività pilota/allievo (19.3) è un invariante su **due righe** (`PilotProfile`, `StudentProfile`); senza serializzazione due Salva concorrenti sulla stessa persona (uno attiva Pilota, l'altro Allievo) leggono ciascuno l'altro profilo inattivo e passano entrambi. Il lock di riga sulla `Person` li serializza — ed è **lo stesso** statement con cui la 19.3 apre la transazione di `upsertProfile` (`SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE`), quindi un Salva composito e un `PUT …/profiles/pilot|student` concorrenti sulla stessa persona si serializzano fra loro. (Il 404 qui resta il `findUnique` pre-transazione del passo 2, per tenere l'ordine 404 → 409 email → 422 fuori dalla transazione.)

Perché **`FOR NO KEY UPDATE`** e non `FOR UPDATE` (stessa scelta e stesso ragionamento di `lockBookingPeople`, `bookings.service.ts:330-343`): non confligge con il `FOR KEY SHARE` che ogni controllo di FK prende sulla riga madre. `registerFlight` tiene `Aircraft → Account` in `FOR UPDATE` (`flights.service.ts:1271-1305`) e **poi** inserisce un `Flight` che referenzia la persona (FK → `KEY SHARE` su `Person`); un `FOR UPDATE` sulla persona preso dal composito **prima** dell'upsert dell'`Account` (passo 6) chiuderebbe il ciclo `Person ↔ Account` → 40P01 → 500.

Perché l'**anagrafica per ultima** (passo 9): un `UPDATE` che **cambia** `email` (colonna con indice unico) acquisisce un lock `FOR UPDATE` sulla riga (regola di Postgres sui «key columns»), cioè proprio il modo che blocca i `KEY SHARE`. Facendolo per ultimo, il composito non acquisisce più nessun lock dopo di esso, quindi non può restare in attesa dentro un ciclo.

Ordine risultante: `Person (NO KEY UPDATE) → PilotProfile/StudentProfile/Account → Expiry/SentAlert → InstructorProfile → InstructorRate → Person (UPDATE)`. Coerente con l'ordine globale delle prenotazioni (`Booking → Aircraft → Person → InstructorProfile`, 16.3 AD-2) e con quello del registro voli (`Aircraft → Account`, mai `Person` in modo forte).

Da fare nello stesso commit: (a) doc-comment di `updatePerson` col censimento sopra; (b) il doc-comment del modulo prenotazioni che afferma «no other service locks `Booking`/`Person`/`InstructorProfile` rows» (`bookings.service.ts:81-82`) è falso già dopo la 19.3 (lock di `upsertProfile`): se la 19.3 l'ha riscritto, aggiungere il composito alla stessa frase; se non l'ha fatto, riscriverlo citando entrambi e perché non chiudono cicli (stesso modo, ordine `Person → InstructorProfile`). Nessun'altra modifica a `bookings.service.ts`.

**Stale form**: nessun ETag/versione (nessun precedente nell'app). Con D-3 l'ultimo Salva vince **solo sui campi che ha modificato**.

### AD-4 — Riuso dei core, mai copie; e l'env eager

| Parte | Core riusato | Dove sta | Nota |
|---|---|---|---|
| Profili (attiva/aggiorna) | `upsertPilotProfileCore`, `upsertStudentProfileCore`, `upsertInstructorProfileCore` | `people.service.ts:635-672` | già transazionali |
| Profili (disattiva) | **estrarre** `deactivateProfileCore(tx, personId, type): Promise<number>` dal corpo di `deactivateProfile` (`:741-748`) | `people.service.ts` | `deactivateProfile` resta e mantiene il suo 409 su `count === 0`; il composito tratta `0` come no-op |
| Esclusività | `assertPilotStudentExclusive(tx, personId)` (19.3) | `people.service.ts` (stesso file) | fuori dai core (verificato col writer della 19.3): si chiama una volta, dopo le scritture dei profili (passo 6) |
| Decorrenza tariffa | `assertRateValidFromNotPast(validFrom)` (19.3) | `rates.service.ts` (import pulito: `:1-6` + gli import di data della 19.3) | pre-transazione (passo 4) |
| Scadenze: ambito | esportare `assertScopeCompatible` (`expiries.service.ts:156-173`) | `expiries.service.ts` | **unica** implementazione: la 19.7 (visite mediche senza ambito, R-19-j) la cambierà in un punto solo. L'helper del create (`assertExpiryTypesValidForComposite`, `people.service.ts:412-437`) valuta l'ambito sui profili **della richiesta** perché la persona non esiste: resta com'è |
| Scadenze: aggiornamento data | **estrarre** `updateExpiryDateCore(tx, expiryId, nextExpiresAt, previousExpiresAt, actorUserId)` (wipe `SentAlert` se cambia) dal corpo di `updateExpiry` (`:270-287`) | `expiries.service.ts` | `updateExpiry` lo chiama; la regola 6.3 AD-9 vive in un punto solo |
| Compenso | **nessun import**: `tx.instructorProfile.update` nel composito | `people.service.ts` | `instructor-compensation.service.ts` trascina l'env eager (Fatti misurati); è un'assegnazione di una colonna: il doc-comment cita il gemello `setPayoutRate` (`:532-543`) |
| Tariffa istruttore | `upsertInstructorRateCore(tx, instructorProfileId, input, actorUserId)` (19.3) | `instructor-rates.service.ts` (nessun import pesante, verificato: `:1-5`) | riceve l'`instructorProfileId` già risolto (passo 8) |

Verifica obbligatoria di env eager (CLAUDE.md): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/people.service.test.ts src/server/services/expiries.service.test.ts src/server/services/instructor-rates.service.test.ts src/server/services/rates.service.test.ts` verde.

### AD-5 — Codici d'errore e mappatura per sezione

Regola: **nessun 409 del composito usa il codice generico `CONFLICT` salvo il conflitto email** (che lo tiene per retro-compatibilità, 19.2 AD-2). Codici nuovi (via il terzo argomento di `ConflictError`, `errors.ts:52-60`):

| Codice | Quando | Sezione che lo mostra |
|---|---|---|
| `CONFLICT` (409) | email già usata (pre-check o P2002) | Anagrafica (`labels.errors.conflictEmail`, invariata) |
| `PERSON_ARCHIVED` (409) | creazione di una scadenza su persona archiviata | Ratings/Visita medica (messaggio generico della sezione) |
| `INSTRUCTOR_PROFILE_INACTIVE` (409) | compenso o tariffa senza profilo istruttore attivo sullo stato finale | Compenso o Tariffa allievo |
| P2002 su `Expiry` (gara con una `POST /expiries` concorrente) | 409 con codice proprio ⟨scelto dal dev, es. `EXPIRY_CONFLICT`⟩, **mai** `CONFLICT` | Ratings/Visita medica |
| `EXPIRY_TYPE_NOT_FOUND`/`EXPIRY_TYPE_INACTIVE`/`SCOPE_MISMATCH` (422) | AD-2 passi 4 e 7 | Ratings/Visita medica |
| `PILOT_STUDENT_PROFILES_EXCLUSIVE` (422, 19.3) | AD-2 passo 6 | Profili (riusare la copy della 19.3 `PeoplePage.profilesPanel.errors.exclusive`) |
| `RATE_VALID_FROM_IN_PAST` (422, 19.3) | AD-2 passo 4 (la mezzanotte fra render e invio, o validazione client aggirata) | Tariffa allievo, sul campo «In vigore da» (stessa mappatura che la 19.3 fa nell'editor velivolo) |
| `VALIDATION_ERROR` (422) con `fieldErrors` | forma (Zod `flattenError` raggruppa per **prima chiave**: `firstName`…`address` → Anagrafica; `profiles` → Profili; `expiries` → Ratings; `payoutRateCents` → Compenso; `instructorRate` → Tariffa allievo) | quella sezione |
| 403 | parte senza permesso | banner generico vicino al Salva |

Lato client: **una** funzione per editor che, dato l'esito, sceglie la sezione e il messaggio, mostra l'errore **nella sezione** (`role="alert"`, testid in §3.4), porta il focus sul primo campo invalido della sezione (`focusFirstInvalid`, `src/lib/dom-focus.ts`) e **non** resetta nulla del form (P7).

### AD-6 — Editor pilota (modifica): un form, due azioni fuori dal form

Struttura in modalità **modifica** (la creazione, `NewPersonForm`, è già a submit unico e resta com'è salvo AD-9):

```
<SlideOver footer={[Annulla] [Salva modifiche: pilot-identity-submit, form="pilot-identity-form"]}>
  <form id="pilot-identity-form" data-testid="pilot-identity-form">   ← UN form
    Anagrafica (RHF + updatePersonSchema, come oggi)
    Profili   (controllato, AD-9)
    Ratings + Visita medica (bozza, AD-8: pilot-ratings-editor / pilot-medical-editor)
    [errori di sezione]
  </form>
  Accesso   (FUORI dal form: ha il SUO <form> per «Crea e invia invito» e il bottone «Reinvia invito» — azioni)
  Archivio  (FUORI dal form: azione con conferma, invariata)
</SlideOver>
```

- Accesso e Archivio sono **fratelli** del form principale, non figli: un `<form>` annidato è HTML non valido, e un Invio nell'email dell'invito deve inviare l'**invito**, non il Salva.
- Il Salva calcola il diff (D-3) dall'anagrafica (campi RHF modificati), dai profili (rispetto a `GET /people/{id}` caricato) e dalle scadenze (rispetto alla lista caricata — i diff dei **due** componenti in bozza, Ratings e Visita medica, si fondono in **un** blocco `expiries`: gli id di tipo sono unici fra i due `kind`), valida in locale (specchio delle regole server: licenza obbligatoria se Pilota attivo, data inizio corso se Allievo attivo, data obbligatoria per ogni scadenza in `set`), poi fa **una** `PATCH`. Successo → toast `PilotsPage.toast.updated` («Dati aggiornati.», invariato), `applyPatch` dalla response, ricarica delle scadenze, form riallineato (diff vuoto → Salva disabilitato, D-5), `onMutated()` (router refresh della lista/scheda).
- Archivia, Crea e invia invito, Reinvia invito **non** toccano lo stato in bozza: un'azione eseguita con modifiche non salvate lascia le modifiche nel form.
- `edit-person-button.tsx:11-16, 50-53`: il commento dice che chiudere è «l'unico momento affidabile» perché `LiveExpiryEditor` non chiama `onMutated` — dopo la story è falso (ogni scrittura riuscita chiama `onMutated`). Si toglie il `router.refresh()` incondizionato dell'`onClose` e il suo commento, lasciando `setOpen(false)`.

### AD-7 — RBAC per parte

- **Server** (vincolante): AD-2 passo 1. Una parte senza permesso → **403 per l'intera richiesta**, prima di qualunque query, mai la parte scartata in silenzio (stesso contratto del blocco `access` di `createPerson`, `:470-478`).
- **Client**: **nessun gating nuovo per sezione.** Con D-3 una sezione che l'utente non tocca non entra nel body, quindi un attore con `people.manage` ma senza `payouts.manage` che modifica solo l'anagrafica salva senza 403; se modifica il compenso riceve 403 e vede il banner generico, senza nessuna scrittura. Oggi questo attore **non esiste** (tutti questi permessi sono solo dell'ADMIN dalla 14.9), quindi nascondere o rendere in sola lettura le sezioni per permesso sarebbe codice speculativo (karpathy). Il ramo in sola lettura esistente dell'anagrafica istruttore (`!canManagePeople`, `instructor-editor.tsx:314-325`) resta com'è: senza form montato non c'è Salva (come oggi, `:136`).

### AD-8 — Scadenze in bozza: `ExpiryDraftEditor` al posto di `LiveExpiryEditor`

In `src/components/dashboard/expiry-editor.tsx`, `LiveExpiryEditor` (`:83-329`, consumatori: solo i due editor) è **sostituito** da un componente **controllato** che non chiama nessuna API di scrittura:

- **Caricamento**: come oggi (`fetchExpiryTypes(kind, true)` + `GET /people/{id}/expiries`, `:99-119`), incluso il filtro della quota associativa dentro `fetchExpiryTypes` (`:40-45`) — **invariato** (confine con la 19.7, §6).
- **Righe esistenti** (`expiry-row-{typeId}`): nome, data **modificabile inline** (`expiry-date-{typeId}`), badge di stato del valore **salvato**, interruttore «Rimuovi»/«Ripristina» (`expiry-remove-{typeId}`). Una riga modificata o da rimuovere è distinguibile a colpo d'occhio e porta `data-state="changed"`/`"removed"` (riga invariata: `"saved"`).
- **Chip** (`expiry-chip-{typeId}`) per i tipi attivi, compatibili con i profili della **bozza** (`isExpiryScopeCompatible`) e non ancora registrati: un click aggiunge una riga `data-state="new"` con la data **precompilata** da `validityMonths` (story 13.8 AC 5, `precompileExpiresAt` `:32-35`, comportamento da conservare); un secondo click sul chip, o «Rimuovi» sulla riga nuova, la toglie.
- **Profili in bozza → chip**: i chip si filtrano sui profili **della bozza**, non su quelli salvati; deselezionare un profilo **pota** le righe `new` diventate incompatibili (stessa ragione della review F1 della 13.2, `pruneSelectionsForFlags`, `pilot-editor.tsx:500-520`), così il Salva non manda una riga che il server rifiuterebbe con `SCOPE_MISMATCH` senza che l'utente la veda.
- **Uscita**: il componente espone (prop `onChange` o equivalente) il diff `{ set: [{ expiryTypeId, expiresAt }], remove: [expiryTypeId] }` e lo stato «c'è una data mancante» per la validazione del Salva. Nessun «Aggiungi», nessun «Salva»/«Annulla» di riga, nessuna conferma di rimozione.
- Testid che **spariscono**: `expiry-add-form`, `expiry-add-date`, `expiry-add-confirm`, `expiry-edit-{typeId}`, `expiry-edit-date-{typeId}`, `expiry-edit-save-{typeId}`, `expiry-remove-confirm-{typeId}` (nessun selettore `^=` li intercetta: `grep -rn 'data-testid\^=' e2e/` verificato su HEAD).
- Il form di **creazione** tiene il suo `NewExpiryChipGroup` e i suoi testid (`rating-chip-*`, `rating-date-*`, `medical-chip-*`, `medical-date-*`): non si unifica in questa story (funziona, è coperto da 4 test, fuori perimetro).

### AD-9 — Profili nell'editor in modifica

- Ogni profilo resta nel suo riquadro (`pilot-editor-profile-pilot` / `-student` / `-instructor`, testid invariati) col **badge dello stato salvato** (Attivo / Disattivato / Non attivato) e un **controllo di attivazione nella bozza** (testid `pilot-editor-profile-{type}-active`). Profilo attivo nella bozza → i suoi campi (Numero licenza, Tipo licenza / Data inizio corso), **precompilati** coi dati conservati anche se il profilo era disattivato (riattivare riusa i dati, come oggi l'upsert). Profilo inattivo nella bozza con dati conservati → i dati restano visibili in sola lettura (oggi `:1034-1036`, `:1151-1153`).
- **Esclusività (P5)**: la 19.3 **non** rende esclusive le spunte del form «Nuovo» (mappa solo il 422 nel banner): questa story rende esclusivi **entrambi** i form (creazione e modifica) con **lo stesso** controllo. Raccomandato: un gruppo a scelta singola «Profilo di volo: Nessuno · Pilota · Allievo» (primitiva `Segmented`, `src/components/ui/segmented.tsx:30`, bottoni `type="button"` con `aria-pressed`) + il checkbox Istruttore separato — l'esclusività si vede, nessun checkbox si spegne da solo. Testid: nel create il gruppo sostituisce i checkbox `new-person-activate-pilot`/`new-person-activate-student` (i campi `new-person-pilot-*`/`new-person-student-course-start` restano), nell'editor i riquadri tengono `pilot-editor-profile-{type}` e il controllo prende `pilot-editor-profile-{type}-active` (o il gruppo un testid unico, a scelta del dev, annotato in §G). In ogni caso: passare da Allievo a Pilota nella bozza produce **un** Salva con `student: { active: false }` + `pilot: { active: true, … }`. Il banner `PilotsPage.editor.errors.profilesExclusive` della 19.3 nel create **resta** come difesa (un 422 arriva solo se la UI è aggirata).
- **Q-19.3-c** (istruttore + allievo ammesso?): con la risposta **A** (raccomandata dalla 19.3: combinabile) l'Istruttore resta un checkbox libero; con **B** anche Istruttore e Allievo diventano esclusivi nell'helper della 19.3, e qui il controllo deve impedirli insieme nella bozza (es. checkbox Istruttore disabilitato con Allievo scelto, con una riga di spiegazione). Leggere l'esito nel file della 19.3 al T0.
- Nessuna conferma di disattivazione (P4: è reversibile fino al Salva). Testo «Disattivare questo profilo?» e bottoni Attiva/Modifica/Riattiva/Disattiva/Conferma/Salva/Annulla dei riquadri spariscono.

### AD-10 — Editor istruttore: un form, compenso e tariffa allievo dentro

```
<SlideOver footer={[Annulla] [Salva: instructor-identity-submit, form="instructor-identity-form"]}>   ← footer solo se il form è montato (come oggi :136)
  <form id="instructor-identity-form" data-testid="instructor-identity-form">
    Anagrafica (RHF, come oggi)
    Ratings (bozza AD-8, filtro ambito INSTRUCTOR_PROFILE_FLAGS :39 invariato; wrapper testid instructor-ratings-editor, nuovo)
    Compenso istruttore (wrapper testid instructor-payout-rate-form, invariato; campo precompilato — Q-19.4-a/A)
    Tariffa allievo (wrapper testid instructor-rates-panel, invariato; R-19-f — AC 18)
    [errori di sezione]
  </form>
  Ore totali / Dovuto (sola lettura, fuori dal form, invariato :187-196)
</SlideOver>
```

- `PayoutRateForm` (`:375-442`) e `InstructorRatesPanel` (`instructor-rates-panel.tsx`, intero) **non sono più form**: diventano sezioni controllate del form principale. Il file `instructor-rates-panel.tsx` può restare come componente di sezione o confluire nell'editor (scelta del dev, annotata in §G); lo **storico** (`:197-246`), il form `instructor-rates-form`, il submit e il readout `instructor-rates-current` (`:169-174`) spariscono: come nell'editor velivolo della 19.3, la tariffa attuale vive nel **placeholder** (`45,00`, senza simbolo) **e** nell'`hint` del `Field` «Attuale: {price}/h — lascia vuoto per non cambiarlo.» (`field.tsx:29-38`: `hint` ed `error` occupano lo stesso slot, mai insieme). Senza tariffa attuale: nessun placeholder, `hint` «Nessuna tariffa in vigore — lascia vuoto per non impostarla.» (o la copy che la 19.3 usa per lo stesso caso). Placeholder e riga programmata: D-10.
- Successo del Salva → toast **`InstructorsPage.toast.saved`** (nuovo: «Modifiche salvate.» / «Changes saved.»), `applyPatch({ firstName, lastName, payoutRateCents })` (il compenso torna nella riga della tabella via `onMutated`), ricarica di scadenze e tariffe, form riallineato.
- Il commento di `:100-113` (perché `current` è una copia locale: «the payout-rate field … sub-form re-syncs») si riscrive sul Salva unico.

### AD-11 — Mobile

Gli editor sono lo **stesso** componente a ogni viewport (`SlideOver` a tutto schermo sotto 640px): il Salva unico è nello `.so-foot` anche lì (44px di altezza minima già garantiti da `airops.css:2065`). Nessuna superficie mobile duplica l'editor → **nessun testid `-mobile`/`mobile-` nuovo**. I punti d'ingresso mobili restano: `pilot-edit-mobile` (`pilots-console.tsx:593`), `instructor-edit-mobile` (`instructors-console.tsx:391`). Verifica a 375px: Salva colpibile (`elementFromPoint`) col corpo scrollato in cima **e** in fondo (gli e2e di §3.4 lo misurano già); i popover dei `DateInput` nelle righe scadenza e in «In vigore da» si aprono dentro il viewport (portale, `date-input.tsx:36-43`).

---

## §2 — Acceptance Criteria

### Endpoint composito (P1, P7)

1. **Retro-compatibilità**: `PATCH /api/v1/people/{id}` con le sole chiavi d'anagrafica si comporta come oggi (stessi 200/403/404/409/422) e risponde col `PersonDetail` (tre profili completi). Unit: un body d'anagrafica non chiama nessun core di profilo/scadenza/istruttore.
2. **Profili dichiarativi** (D-2): `profiles.pilot = { active: true, licenseNumber, licenseType }` attiva o aggiorna; `{ active: false }` disattiva; `{ active: false }` su un profilo inattivo o mai attivato → **200 no-op** (non 409); stesso per `student` (`courseStartDate`) e `instructor`. Attivare Pilota o Allievo crea l'`Account` se manca (come oggi i core).
3. **Esclusività sullo stato finale** (R-19-e): persona con Allievo attivo; body `{ student: { active: false }, pilot: { active: true, … } }` → 200, Allievo disattivato e Pilota attivo; body `{ pilot: { active: true, … } }` senza disattivare Allievo → 422 `PILOT_STUDENT_PROFILES_EXCLUSIVE` e **nessuna** scrittura (anche l'`Account` eventualmente creato dall'upsert è annullato); body con `pilot` e `student` entrambi `active: true` → 422 `PILOT_STUDENT_PROFILES_EXCLUSIVE`. Unit: `assertPilotStudentExclusive` chiamata **una** volta, **dopo** l'ultima scrittura di profilo e prima del passo 7.
4. **Scadenze per tipo** (D-2): `expiries.set` crea le righe assenti e aggiorna quelle presenti con data diversa (cancellando i loro `SentAlert`, story 6.3); una riga con data uguale non viene scritta (`expiry.update` non chiamato, `SentAlert` intatti); `expiries.remove` cancella le righe del tipo, tipo assente → no-op. Un tipo sia in `set` sia in `remove`, o duplicato nello stesso array → 422 `VALIDATION_ERROR`. Creazione su tipo inesistente/disattivato → 422 `EXPIRY_TYPE_NOT_FOUND`/`EXPIRY_TYPE_INACTIVE`; **aggiornamento** di una riga esistente su tipo disattivato → 200 (come `updateExpiry`). Ambito incompatibile coi profili **finali** → 422 `SCOPE_MISMATCH`. Creazione su persona archiviata → 409 `PERSON_ARCHIVED`.
5. **Istruttore**: `payoutRateCents` (intero ≥ 0 o `null`) assegna il compenso; `instructorRate` registra la tariffa con la regola della 19.3 (`validFrom ≥ oggi` Europe/Rome, riscrittura della riga con lo stesso `validFrom ≥ oggi`); senza profilo istruttore attivo **sullo stato finale** → 409 `INSTRUCTOR_PROFILE_INACTIVE`; attivare Istruttore e impostare compenso e tariffa **nello stesso** body → 200.
6. **Atomicità — prova sul DB reale** (e2e API, discriminante): (a) pilota attivo con telefono T0; body `{ phone: T1, profiles: { pilot: { active: false } }, expiries: { set: [<tipo con ambito PILOTS>] } }` → **422 `SCOPE_MISMATCH`** (rilevato **dentro** la transazione, dopo la disattivazione); `GET /people/{id}`: telefono **T0**, Pilota **attivo**; `GET /people/{id}/expiries`: nessuna riga del tipo. (b) istruttore attivo con nome N0 e compenso C0; body `{ firstName: N1, profiles: { instructor: { active: false } }, payoutRateCents: C1 }` → **409 `INSTRUCTOR_PROFILE_INACTIVE`**; `GET`: nome **N0**, Istruttore **attivo**, compenso **C0** (via `GET /api/v1/instructor-compensation` o la riga della pagina Istruttori).
7. **Atomicità — prova nel codice** (unit): con un `tx` **distinto** da `prisma` nel mock di `$transaction`, nessun `prisma.<modello>.create/update/upsert/delete*` viene chiamato fuori da `tx` in un Salva che tocca tutte le parti; un errore lanciato al passo 8 (es. profilo istruttore inattivo) **propaga** fuori da `$transaction` (nessun `catch` che lo inghiotte) e il passo 9 (`tx.person.update`) **non** è stato chiamato.
8. **Ordine e lock** (unit, AD-2/AD-3): il primo statement dentro la transazione è un `$queryRaw` che contiene `FROM "Person"` e `FOR NO KEY UPDATE` (e **non** `FOR UPDATE` da solo); le disattivazioni precedono le attivazioni; `tx.person.update` è l'**ultima** scrittura; nessun lock viene preso se la richiesta fallisce ai passi 1-4 (403/404/409/422 pre-transazione → `$transaction` non chiamata).
9. **RBAC per parte** (AD-7): un PILOTA (e un ISTRUTTORE) che manda `PATCH` → 403 `FORBIDDEN` (e2e). Unit con `authorize` mockato per negare **solo** `payouts.manage` (poi solo `settings.manage`, poi solo `expiries.manage`): un body che contiene la parte negata → `ForbiddenError` **prima di qualunque** chiamata a `prisma`; un body **senza** quella parte → passa. Un body con la parte presente non viene mai salvato «senza quella parte».
10. **Idempotenza** (unit + e2e API): lo stesso body completo (anagrafica + disattivazione + `set` + `remove` + compenso + tariffa con `validFrom` = oggi) inviato due volte → **200** due volte, stesso `GET` dopo il primo e dopo il secondo, nessun `SentAlert` cancellato al secondo invio (unit: `sentAlert.deleteMany` non chiamato).
11. **Concorrenza** (e2e API, sul modello di E3 di `flights.spec.ts:1018`): persona senza profili di volo; due `PATCH` **in parallelo** (`Promise.all`), uno con `pilot: { active: true, … }`, l'altro con `student: { active: true, … }` → esattamente **uno** 200 e **uno** 422 `PILOT_STUDENT_PROFILES_EXCLUSIVE`; il `GET` finale ha **un solo** profilo di volo attivo. Nessun 500 (in particolare nessun 40P01).
12. **OpenAPI servito**: `GET /api/v1/openapi.json` descrive `PATCH /api/v1/people/{id}` con `UpdatePersonRequest` contenente `profiles`, `expiries`, `payoutRateCents`, `instructorRate`, response `PersonDetail`, errori 401/403/404/409/422; `registry.test.ts` lo asserisce.

### Editor pilota (P2-P5)

13. **Un solo Salva**: in modifica, desktop (1280) e mobile (375), il pannello ha **un** bottone di salvataggio (`pilot-identity-submit`, nello `.so-foot`, `form="pilot-identity-form"`) e nessun altro bottone che salvi dati: count **0** per `getByRole('button', { name: 'Salva', exact: true })` dentro `.so-body`, per i bottoni Attiva/Modifica/Riattiva/Disattiva dei riquadri profilo e per i testid scadenza rimossi (AD-8). Restano, fuori dal form, `pilot-archive-toggle` (+ conferma), `pilot-access-create`, «Reinvia invito».
14. **Un Salva, tutte le parti**: modificando in una sola sessione il telefono, attivando Pilota (licenza), aggiungendo un rating e cambiando la data di una visita medica, **un** click su Salva fa **una sola** richiesta di scrittura (e2e: conteggio delle richieste non-GET verso `/api/v1/` = 1, `PATCH /api/v1/people/{id}`), poi toast «Dati aggiornati.», e dopo un **reload** della pagina e la riapertura dell'editor tutte e quattro le modifiche sono presenti.
15. **Diff e stato del Salva** (D-3, D-5): editor appena aperto → Salva **disabilitato**; una modifica lo abilita; annullarla a mano (es. ripristinare il valore) lo disabilita di nuovo; dopo un Salva riuscito il form è riallineato e il Salva torna disabilitato. Il body inviato contiene **solo** le parti/campi modificati (e2e: `request.postDataJSON()` del PATCH senza le chiavi non toccate).
16. **Errore in una parte** (P7, AD-5): l'utente modifica il telefono e aggiunge un rating; prima del Salva il test **disattiva il tipo** via API; Salva → l'errore compare **nella sezione Ratings** (`pilot-ratings-error`), il focus va nella sezione, il form **conserva** telefono e rating non salvati; dopo un reload il telefono è quello **vecchio**. Email già usata → errore nella sezione Anagrafica (`pilot-identity-error`, «Esiste già una persona con questa email.»), nient'altro salvato.
17. **Profili ed esclusività** (AD-9): il controllo di attivazione non permette Pilota e Allievo attivi insieme nella bozza; passare da Allievo a Pilota e salvare produce **un** PATCH con `student.active = false` e `pilot.active = true`; dopo il Salva Allievo è «Disattivato» con la sua «Data inizio corso» ancora visibile, Pilota «Attivo», e la riga della lista mostra il badge «Pilota» e non «Allievo» (stesse asserzioni di `person-profiles.spec.ts:79-116`, riscritte sul Salva unico). Deselezionare un profilo pota i chip/righe nuove incompatibili (AD-8).

### Editor istruttore (P2, P6)

18. **Tariffa allievo (R-19-f)**: un campo prezzo con **placeholder** = tariffa in vigore oggi formattata senza simbolo (`45,00`), assente se non ce n'è, e l'`hint` «Attuale: 45,00 €/h — lascia vuoto per non cambiarlo.» (resa identica all'editor velivolo della 19.3); nessun valore precompilato; «In vigore da» precompilato con **oggi Europe/Rome** (`todayDateOnlyInZone(APP_TIMEZONE)`) e con **minimo oggi** (`<DateInput min={todayRome} …/>`, che la 19.3 inoltra come `minDate` al `CalendarPopover`: i giorni precedenti sono `<button disabled>`; una data **digitata** < oggi — il form è `noValidate`, il `min` nativo non la blocca — è un errore di campo **prima** della richiesta, confronto fra stringhe ISO); prezzo vuoto → nessun `instructorRate` nel body (la data da sola non basta); prezzo valido → `instructorRate: { priceCentsPerHour, validFrom }`. **Nessuno storico**: count 0 per `instructor-rate-history-row`, `instructor-rate-history-show-all`, `instructor-rates-form`, `instructor-rates-submit`. Dopo il Salva il placeholder mostra la nuova tariffa se `validFrom` = oggi, l'attuale se `validFrom` è futuro. *(Q-19.4-b/A)* Se esiste una tariffa programmata con `validFrom` > oggi, sotto il campo compare **una** riga «Dal GG/MM/AAAA: X €/h» (`instructor-rates-next`), solo la più vicina.
19. **Compenso** *(Q-19.4-a/A)*: campo precompilato col valore attuale (come oggi); cambiato → `payoutRateCents` nel body; svuotato → `payoutRateCents: null`; invariato → assente. La riga della tabella Istruttori mostra il nuovo compenso e il nuovo dovuto dopo il Salva (stesse asserzioni di `instructor-compensation.spec.ts:146-150`).
20. **Un solo Salva**: `instructor-identity-submit` nello `.so-foot` è l'unico bottone di salvataggio del pannello (count 0 per `instructor-payout-rate-submit` e `instructor-rates-submit`, a 1280 e 375); «Annulla» nel footer (D-9). Un Salva con nome + rating + compenso + tariffa → **una** `PATCH`, toast «Modifiche salvate.», tutte le parti presenti dopo un reload.
21. **Errore in una parte**: (UI) prezzo valido e «In vigore da» = ieri digitato nel campo (`fill` scrive nel `<input type="date">` anche sotto `min`) → errore di campo nella sezione Tariffa allievo, **nessuna** richiesta di scrittura partita, le altre modifiche in bozza intatte; (API) `PATCH` con `firstName` nuovo + `instructorRate.validFrom` = ieri → 422 `RATE_VALID_FROM_IN_PAST` e `GET` col nome **vecchio**. Un 422 `RATE_VALID_FROM_IN_PAST` ricevuto dal client (validazione aggirata) si mostra nella sezione Tariffa allievo (unit o test di componente sulla funzione di mappatura di AD-5).

### Azioni separate, mobile, regressioni

22. **Azioni separate** (P3): «Archivia»/«Ripristina» (con conferma), «Crea e invia invito», «Reinvia invito» funzionano come oggi e **non** inviano né perdono la bozza (e2e: modifica il telefono, archivia, il campo telefono conserva il valore non salvato e il Salva resta abilitato). `people-management.spec.ts:91-134` e `user-management.spec.ts:102-127` verdi **senza modifiche** di flusso.
23. **Mobile** (AD-11): a 375px in entrambi gli editor il Salva è nello `.so-foot`, alto ≥ 44px, colpibile col corpo scrollato in cima e in fondo (`mobile-a11y-sweep.spec.ts:281-322` verde invariato; `mobile-registries.spec.ts:774-845` riscritto, §3.4); nessun overflow orizzontale; i popover data delle righe scadenza e di «In vigore da» restano nel viewport.
24. **Scheda persona**: «Modifica» (`person-edit-button`) apre lo stesso editor; un Salva aggiorna la scheda dietro senza reload (`person-detail.spec.ts:195-222` verde invariato); la chiusura non fa più un refresh incondizionato (AD-6).
25. **Creazione invariata** salvo l'esclusività (AD-9): il form di creazione non permette Pilota + Allievo insieme (la 19.3 mappa solo il 422; il controllo è di qui); i test di creazione di `people-management.spec.ts` (`:270-330`, `:426-490`) e di `person-profiles.spec.ts:36-47` restano verdi (adattati al nuovo controllo se usano i checkbox `new-person-activate-pilot`/`-student`), il test multi-profilo (`:460-490`, Allievo + Istruttore) resta verde [Q-19.3-c = A].

### Contratti, residui, gate

26. **Nessun residuo** (0 righe, escluse `src/generated/`, `_bmad-output/`, `docs/`):
    - `grep -rn "LiveExpiryEditor\|PayoutRateForm\|ProfilesSection\|PilotProfileForm\|StudentProfileForm\|InstructorProfileForm\|ProfileSubShell" src e2e`
    - `grep -rn "fetch(\`/api/v1/people/\${[a-zA-Z.]*}/profiles\|/api/v1/expiries\|instructor-compensation/\${\|/instructor-rates\`, {" 'src/app/[locale]/dashboard/pilots' 'src/app/[locale]/dashboard/instructors/instructor-editor.tsx' 'src/app/[locale]/dashboard/instructors/instructor-rates-panel.tsx' src/components/dashboard/expiry-editor.tsx` — gli editor non chiamano più le route singole di scrittura (il `PUT …/profiles/instructor` di «Aggiungi istruttore», `instructors-console.tsx:681`, **resta**: è fuori da questi file)
    - `grep -rnE "expiry-add-(form|date|confirm)|expiry-edit-|expiry-remove-confirm-|instructor-payout-rate-submit|instructor-rates-(form|submit)\b|instructor-rate-history" src e2e`
    - `grep -rn "R-15.10-f" src e2e` → solo i riferimenti **storici** che spiegano il `.so-foot` (`airops.css:1127`, `mobile-ink-targets.spec.ts:698`, l'header di `mobile-a11y-sweep.spec.ts:269`), nessuno che affermi «i submit di sezione restano»
    - `grep -n "todayDateOnly\b\|toISOString().slice(0, 10)" 'src/app/[locale]/dashboard/instructors/'*.tsx src/components/dashboard/expiry-editor.tsx` → 0 (A16)
27. **i18n**: le chiavi diventate orfane rimosse da **entrambi** i file (§3.6), le nuove presenti in entrambi, parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/en.json | sort)` vuoto), conteggio chiavi riportato. Copy nuove secondo il glossario A20 («velivolo», «compenso istruttore», mai «payout» nel testo nuovo); revisione finale: 19.12.
28. **Gate**: `npm run gates` verde; e2e mirati verdi via `scripts/e2e.sh start <spec…>` (elenco §4.2); l'arbitro full-suite su DB fresco lo esegue la sessione principale. Delta test e2e dichiarato nel record.
29. **Verifica UI interattiva** (Playwright MCP o script throwaway in `/tmp`, CLAUDE.md), screenshot a **1280** e **375** di: editor pilota in modifica (pulito, con bozza, con errore di sezione), editor pilota dalla scheda persona, editor istruttore (pulito, con tariffa programmata se Q-19.4-b/A, con errore), form di creazione (esclusività); nessun overflow, `.so-foot` con Annulla + Salva, Salva disabilitato a form pulito.

---

## §3 — Dev Notes

### 3.1 — Inventario su HEAD `72e7e1b` (cosa c'è oggi)

**Editor pilota, modalità MODIFICA** (`src/app/[locale]/dashboard/pilots/pilot-editor.tsx`):

| # | Superficie | Controllo | Righe | Chiamata | Dopo 19.4 |
|---|---|---|---|---|---|
| 1 | Footer | «Annulla» | `:167-169` | chiude | resta |
| 2 | Footer | «Salva modifiche» `pilot-identity-submit` (`form="pilot-identity-form"`) | `:170-172` | `PATCH /people/{id}` (solo anagrafica) `:275-279` | **Salva unico** (stesso testid) |
| 3 | Anagrafica | `<form id="pilot-identity-form">` | `:330-358` | — | diventa il form **unico** (AD-6) |
| 4 | Profilo Pilota | Attiva/Modifica/Riattiva `:1054-1056`; Disattiva `:1057-1061`; Conferma/Annulla `:1045-1050`; form Salva/Annulla `:1023-1030` | `:952-1068` | `PUT …/profiles/pilot` `:979-983`; `POST …/pilot/deactivate` `:995` | controllo di attivazione + campi in bozza (AD-9) |
| 5 | Profilo Allievo | idem | `:1070-1185` | `PUT …/student` `:1099`; deactivate `:1115` | idem |
| 6 | Profilo Istruttore | idem | `:1187-1292` | `PUT …/instructor` `:1213`; deactivate `:1229` | idem |
| 7 | Ratings | `LiveExpiryEditor kind="RATING"` | `:1312-1314` | v. §3.1-bis | bozza (AD-8) |
| 8 | Visita medica | `LiveExpiryEditor kind="MEDICAL"` | `:1318-1320` | v. §3.1-bis | bozza (AD-8) |
| 9 | Accesso (no utente) | `<form>` email + ruoli, «Crea e invia invito» `pilot-access-create` | `:1424-1463` | `POST /users` `:1373-1377` | **azione**, fuori dal form, invariata |
| 10 | Accesso (invito pendente) | «Reinvia invito» | `:1415-1419` | `POST /users/{id}/resend-invite` `:1393` | **azione**, invariata |
| 11 | Archivio | `pilot-archive-toggle` `:1516-1518`, `pilot-archive-confirm` `:1505-1507`, Annulla `:1508-1510` | `:1468-1520` | `POST …/archive\|unarchive` `:1487` | **azione**, fuori dal form, invariata |

Totale oggi: **5 `<form>`** (anagrafica, 3 profili, accesso) + 2 editor scadenze con 3 flussi immediati ciascuno (aggiungi, modifica data, rimuovi) + 3 azioni. Dopo: **1** form + 3 azioni (+ il form dell'invito, che è un'azione).

**§3.1-bis — `LiveExpiryEditor`** (`src/components/dashboard/expiry-editor.tsx:83-329`): chip `expiry-chip-{id}` `:278-291` → riga «aggiungi» `expiry-add-form` con `expiry-add-date` + «Aggiungi» `expiry-add-confirm` `:296-321` → `POST /api/v1/expiries` `:147-151`; riga esistente: «Modifica» `expiry-edit-{id}` `:253-264` → `expiry-edit-date-{id}` + «Salva» `expiry-edit-save-{id}` `:204-232` → `PATCH /api/v1/expiries/{id}` `:169-173`; «Rimuovi» `expiry-remove-{id}` `:265-267` → «Conferma» `expiry-remove-confirm-{id}` `:233-248` → `DELETE /api/v1/expiries/{id}` `:186`. Consumatori: `pilot-editor.tsx:1313`, `:1319`, `instructor-editor.tsx:161` (nessun altro: `grep -rn LiveExpiryEditor src`).

**Editor istruttore** (`src/app/[locale]/dashboard/instructors/instructor-editor.tsx`):

| # | Superficie | Controllo | Righe | Chiamata | Dopo 19.4 |
|---|---|---|---|---|---|
| 1 | Footer | «Salva» `instructor-identity-submit` (solo se il form è montato) | `:136-143` | `PATCH /people/{id}` `:270-276` | **Salva unico** (stesso testid) + «Annulla» (D-9) |
| 2 | Anagrafica | `<form id="instructor-identity-form">` + rami caricamento/errore/sola lettura | `:304-354` | — | form **unico** (AD-10) |
| 3 | Ratings | `LiveExpiryEditor` ambito istruttore | `:160-162`, flag `:39` | §3.1-bis | bozza (AD-8) |
| 4 | Compenso | `<form data-testid="instructor-payout-rate-form">`, submit `instructor-payout-rate-submit` | `:375-442` (submit `:435-439`) | `PUT /instructor-compensation/{id}/rate` `:408-412` | sezione del form unico (Q-19.4-a) |
| 5 | Tariffa allievo | `InstructorRatesPanel`: readout `instructor-rates-current` `:169-174`, `<form instructor-rates-form>` `:176-195`, submit `instructor-rates-submit` `:191-193`, storico `:197-246` | `instructor-rates-panel.tsx` | `GET`/`POST /people/{id}/instructor-rates` `:77`, `:147-151` | sezione R-19-f, niente storico (AC 18) |
| 6 | Ore/Dovuto | input disabilitati | `:187-196` | — | invariato, fuori dal form |

**Creazione** (`NewPersonForm`, `pilot-editor.tsx:448-836`): già un form e un submit (`so-actions` `:826-833`) verso il composito `POST /people` — fuori perimetro salvo AD-9.

**Punti di montaggio**: `pilots-console.tsx:538-549` (+ ingresso mobile `pilot-edit-mobile` `:593`); `people/[id]/edit-person-button.tsx:41-59` (scheda persona, `people/[id]/page.tsx:287-295`, `canManagePeople`); `instructors-console.tsx:227-239` (+ ingresso mobile `instructor-edit-mobile` `:391`). L'editor istruttore oggi non riceve `canManagePayouts` (lo riceve solo la console, `:93`) — e con AD-7 non serve.

### 3.2 — Server e contratti

| File | Righe | Cosa |
|---|---|---|
| `src/server/services/people.service.ts` | `updatePerson` `:545-578`; core `:635-672`; `deactivateProfile` `:729-753` | AD-2 (composito), estrazione `deactivateProfileCore`; doc-comment col censimento dei lock (AD-3) |
| `src/server/services/expiries.service.ts` | `assertScopeCompatible` `:156-173`; `updateExpiry` `:262-290` | export dell'helper; estrazione `updateExpiryDateCore` (AD-4) |
| `src/server/services/instructor-rates.service.ts`, `rates.service.ts` | — | solo import di `upsertInstructorRateCore` e `assertRateValidFromNotPast` (19.3); nessuna modifica |
| `src/server/services/bookings.service.ts` | doc del modulo `:81-82` | solo il doc-comment (AD-3) |
| `src/server/services/errors.ts` | `:52-60` | nessuna modifica attesa (il codice si passa al costruttore) |
| `src/lib/schemas/people.ts` | `:30-37`, `:150-203` | `updatePersonCompositeSchema` + tipo (AD-1) |
| `src/lib/schemas/instructor-compensation.ts` | `setInstructorPayoutRateSchema` `:125-127` | solo riuso della forma di `payoutRateCents` (verificare che importarlo da `people.ts` non crei un ciclo di import fra schemi; in caso, ridichiarare la stessa forma con un commento che punta al gemello) |
| `src/app/api/v1/people/[id]/route.ts` | `:11-14` | `bodySchema: updatePersonCompositeSchema` |
| `src/lib/schemas/registry.ts` + `registry.test.ts` | `:252`, `:462-473` | AD-1 |

### 3.3 — UI

| File | Cosa |
|---|---|
| `pilots/pilot-editor.tsx` | AD-6, AD-9; header `:3-19` e commento `:152-162` riscritti (la modifica non è più a sezioni); via `ProfilesSection`/`ProfileSubShell`/`Pilot|Student|InstructorProfileForm` (`:838-1292`) sostituiti dalla sezione profili controllata; `RatingsSection` (`:1294-1323`) sul componente in bozza; `IdentitySection` assorbito nel form unico |
| `pilots/pilot-editor-labels.ts` | label dei profili/scadenze adeguate (§3.6) |
| `instructors/instructor-editor.tsx` | AD-10; header `:3-21` e commenti `:100-113`, `:126-135` riscritti |
| `instructors/instructor-rates-panel.tsx` | AD-10 (R-19-f): via storico, form, submit, `todayDateOnly` UTC `:71-73` |
| `instructors/instructors-console.tsx` | solo se cambia la firma dell'editor; commento `:613-621` («the pilots editor's `ProfilesSection` already uses») riscritto |
| `instructors/page.tsx` | label (§3.6) |
| `components/dashboard/expiry-editor.tsx` | AD-8 (`LiveExpiryEditor` → componente in bozza; `fetchExpiryTypes` e `precompileExpiresAt` restano) |
| `people/[id]/edit-person-button.tsx` | AD-6 (commento + refresh alla chiusura) |
| `src/lib/expiry-scope.ts:25` | commento che cita `LiveExpiryEditor` → nome nuovo |
| `src/styles/airops.css` | **nessuna** regola nuova attesa (Field, Badge, Segmented, `.expiry-chip`, `.meter-row` esistono); se serve uno stile per `data-state` delle righe scadenza, usare i token esistenti, mai colori letterali o `var(--…)` inline nuovi senza motivo |

### 3.4 — e2e: censimento e destino (comando: `grep -rnE "pilot-identity-|pilot-editor-profile-|pilot-ratings-editor|pilot-medical-editor|expiry-(chip|add|edit|remove|row)-|pilot-access-|pilot-archive-|instructor-identity-|instructor-payout-rate|instructor-rates-|instructor-rate-history|person-edit-button" e2e`)

| Spec | Righe | Oggi | Dopo |
|---|---|---|---|
| `person-profiles.spec.ts` | `:57-77` (attiva Pilota), `:79-116` (Allievo → Pilota) | per-profilo «Attiva»/«Salva», «Disattiva» + «Conferma» | **riscritti** sul controllo di attivazione + `pilot-identity-submit`; il secondo diventa la prova di AC 17 (transizione in **un** Salva); header `:12-18` riscritto |
| `person-profiles.spec.ts` | `:36-47` (helper create), `:118-145` (403/404 API) | create + API singole | invariati (se AD-9 cambia il controllo del create e l'helper lo usa, adattarlo) |
| `person-profiles.spec.ts` | test **aggiunti dalla 19.3** (AC 16 della 19.3): editor attuale — attivare Pilota con Allievo attivo mostra `PeoplePage.profilesPanel.errors.exclusive` nella sezione; form «Nuovo» con entrambe le spunte → banner `profilesExclusive` | flussi che dopo questa story **non esistono più** (la UI impedisce la combinazione) | **riscritti**: nel create e nell'editor il controllo non permette Pilota + Allievo insieme (asserzione d'impossibilità sul controllo); il percorso 422 resta provato dagli e2e API della 19.3 (AC 13-14 della 19.3) e da AC 3/11 qui |
| `person-profiles.spec.ts` | test API della 19.3 (`PUT …/profiles/pilot\|student` → 422, concorrenza) | route singole | **invariati** (D-8) |
| `people-management.spec.ts` | `:331-366` (aggiunge/rimuove rating) | `expiry-add-*`, `expiry-remove-confirm-*` | **riscritto**: chip → `expiry-date-{id}` → Salva → riga `data-state="saved"`; «Rimuovi» → Salva → riga assente; asserzioni sulla quota `:355-361` invariate |
| `people-management.spec.ts` | `:368-396` (modifica data) | `expiry-edit-*`, `expiry-edit-save-*` | **riscritto**: `expiry-date-{id}` → Salva → `31/12/2099` |
| `people-management.spec.ts` | `:398-424` (rating dall'editor istruttore) | `expiry-add-*` | **riscritto** con `instructor-identity-submit` |
| `people-management.spec.ts` | `:91-134` (archivia/ripristina), `:270-330`, `:426-490` (creazione) | azioni / create | **invariati** (AC 22, 25) |
| `expiry-registration.spec.ts` | helper `:94-106` + commento `:80-93`; precompile `:195-230` (`expiry-add-date` `:212`, `:218`, `:222`) | `expiry-add-*` | **riscritti**: chip → data → (tutte le aggiunte) → **un** Salva; il precompile si asserisce su `expiry-date-{id}`; commenti `:42`, `:88-90`, `:136`, `:189` sul nome nuovo |
| `instructor-compensation.spec.ts` | `:141-155` | `instructor-payout-rate-form` + `-submit`, toast «Tariffa payout aggiornata» | **riscritto**: campo nel wrapper `instructor-payout-rate-form` → `instructor-identity-submit` → toast «Modifiche salvate.»; righe `:148-155` invariate (l'`Escape` di `:153` chiude il **pannello**, uso legittimo) |
| `instructor-rates.spec.ts` | `:66-107` (due tariffe + storico), `:109-136` (409 stessa data) | form + storico | **riscritti** su R-19-f: placeholder = attuale, una tariffa con `validFrom` = oggi via Salva → placeholder aggiornato; una seconda con la **stessa** data → riscrittura (nessun 409, 19.3), placeholder col prezzo nuovo; con Q-19.4-b/A un test per `instructor-rates-next` (data futura). I test API `:138+` restano. ⚠️ **La 19.3 adatta questo spec** alla semantica nuova (date = `todayRome()` e `addDaysIso(todayRome(), 30)`, «409 stessa data» → «riscrittura», asserita ancora sullo **storico** del pannello che la 19.3 non tocca): partire dal suo stato, non da quello di `72e7e1b`; le tariffe con data passata necessarie ai test si creano con `seedInstructorRate` di `e2e/db-fixtures.ts` |
| `mobile-registries.spec.ts` | `:774-845` («section submits where they were», AC 5-c della 15.5) | pin di R-15.10-f | **riscritto**: «ONE save in `.so-foot`, NO section submits» — `instructor-payout-rate-submit` e `instructor-rates-submit` con `toHaveCount(0)`; le asserzioni su `primaryInFoot`, `atTop`/`atBottom`, padding `18px`, `gap ≥ 16` restano; titolo e commenti `:789-797`, `:818-819` riscritti |
| `mobile-registries.spec.ts` | `:539-561`, `:739-772` | apre editor / create | invariati |
| `mobile-a11y-sweep.spec.ts` | `:281-322` | hit-test del Salva nello `.so-foot` | **invariato** (testid conservati); commento `:269` («three multi-form editors») può restare storico |
| `person-detail.spec.ts` | `:33-45`, `:195-222` | create + `pilot-identity-submit` | **invariati** (AC 24) |
| `user-management.spec.ts` | `:102-127` | `pilot-access-none`/`-create` | **invariato** (AC 22) |

**Nuovi test e2e** (spec nuovo `e2e/person-save.spec.ts` oppure dentro `people-management.spec.ts`, a scelta del dev): AC 6 (a, b), 9 (403), 10, 11 via API; AC 14, 15, 16, 22 via UI pilota; AC 20 via UI istruttore. Nessuno entra nella catena serializzata: non mutano AppSettings e non asseriscono aggregati globali (le asserzioni sul compenso sono sulla **riga** dell'istruttore run-unique). Fixture run-unique (nomi/tipi con suffisso), mai nomi che contengano label di campo (lezione 12.11 F2: niente «Finestra», «Note», «Tipo»…).

**Trappole e2e specifiche**: `getByLabel` è substring → «Tipo licenza» contiene «Tipo», «Data inizio corso» contiene «Data» → sempre `{ exact: true }` o scope al riquadro; mai `Escape` per chiudere il popover di un `DateInput` nelle righe scadenza (chiude l'intero `SlideOver`, CLAUDE.md) — si chiude interagendo col campo successivo; per l'AC 14 contare le richieste con `page.on('request')` **filtrando** `method !== 'GET'` e l'URL `/api/v1/` (il router refresh fa richieste RSC che non sono API).

### 3.5 — Unit

- `people.service.test.ts`: `describe('updatePerson')` (`:657-687`) e il gate `:229-231` restano verdi; nuovi casi per AC 1-5, 7-10 (mock di `$transaction` con un **`tx` distinto** per AC 7; `$queryRaw` per il lock; `authorize` mockato per AC 9 — `vi.mock('@/server/auth/rbac', …)` parziale che conserva `hasPermission`). Il mock di `prisma` (`:5-58`) guadagna i modelli toccati (`expiry.findMany/deleteMany/update`, `sentAlert.deleteMany`, `instructorProfile.update`, `instructorRate.*` secondo il core 19.3).
- `expiries.service.test.ts`: `updateExpiry` invariato nelle asserzioni dopo l'estrazione del core; un caso sul core estratto (wipe solo se la data cambia).
- `registry.test.ts`: AC 12.
- Env eager: comando di AD-4.

### 3.6 — i18n (in **entrambi** `messages/it.json` e `messages/en.json`)

Da rimisurare sul HEAD (la 19.2 e la 19.3 toccano gli stessi namespace). Orientamento:
- **Orfane probabili** (togliere solo se davvero senza uso dopo il refactor — verificare con `grep`): `PeoplePage.profilesPanel.actions.{activate,edit,reactivate,deactivate,confirmDeactivate,confirmYes,confirmCancel,cancel,save}` (su HEAD le usa **solo** `pilot-editor-labels.ts:45-55`; le altre chiavi di `profilesPanel` — `heading`, `status.*`, `*.title`, `pilot.licenseNumber/licenseType`, `student.courseStartDate`, `badges.*` — hanno consumatori fuori dall'editor: `people/[id]/page.tsx:174-176`, `:322-344`, `pilots/page.tsx:127`, `exports.service.ts:162-164` → **restano**); `PilotsPage.editor.ratings.{addAction,cancel,save,edit,confirmRemove,confirmYes,confirmCancel}` e gemelle `PilotsPage.editor.medical.*`, `InstructorsPage.editor.ratings.*`; `InstructorsPage.editor.payoutRate.save`; `InstructorsPage.studentRate.{current?,submit,rateAdded,conflictError,historyTitle,historyEmpty,historyValidFrom,historyPrice,historyActor,historyWhen,historyShowAll,loadError?}`; `InstructorsPage.toast.{rateSet,identitySaved}`; `InstructorsPage.editor.identity.save` (se il Salva prende una label comune).
- **Della 19.3, da riusare**: `PeoplePage.profilesPanel.errors.exclusive` (errore della sezione Profili, AD-5) e `PilotsPage.editor.errors.profilesExclusive` (banner difensivo del create) — **restano**; la copy dell'errore di «In vigore da» nel passato dell'editor velivolo (riusarla, non duplicarla).
- **Nuove**: `InstructorsPage.toast.saved` («Modifiche salvate.» / «Changes saved.»); label del controllo di attivazione/«Profilo di volo» (AD-9); «Rimuovi»/«Ripristina» della riga scadenza (riusare `remove` esistente + una chiave `restore`); errori di sezione se servono testi nuovi (preferire i `genericError` esistenti); `InstructorsPage.studentRate.next` («Dal {date}: {price}/h», ICU, se Q-19.4-b/A); errore «In vigore da non può essere nel passato» (riusare la copy della 19.3 se esiste).
- Il testo di «Salva»: editor pilota tiene `PilotsPage.editor.submitEdit` («Salva modifiche»); editor istruttore usa la stessa dicitura (chiave sua o riuso), così i due footer dicono la stessa cosa.

---

## §4 — Piano di test

### 4.1 — Unit
§3.5. Prove nuove: forma del body e refine (set/remove disgiunti, unici); ordine dei passi (AC 8); `tx` distinto (AC 7); RBAC per parte con `authorize` mockato (AC 9); no-op e idempotenza (AC 2, 4, 10); retro-compatibilità (AC 1).

### 4.2 — e2e (project `chromium` `fullyParallel`, fixture run-unique; solo via `scripts/e2e.sh`)
Mirati da far girare prima della consegna: `person-profiles`, `people-management`, `expiry-registration`, `instructor-compensation`, `instructor-rates`, `mobile-registries`, `mobile-a11y-sweep`, `person-detail`, `user-management`, lo spec nuovo, `api-v1` (contratto). Per una serie di run: build **una volta** (`env -u NODE_ENV npm run build && npm run start &`) e poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …` (CLAUDE.md). Prima di attribuire un fallimento di login alla flake nota: query `LoginAttempt` di CLAUDE.md (TD-6).

### 4.3 — Discriminanza (obbligatoria, nel Dev Agent Record §D con sha256 prima/dopo)
1. **Atomicità**: sostituire temporaneamente la `prisma.$transaction(async (tx) => …)` del composito con l'esecuzione degli stessi passi su `prisma` (senza transazione) → l'e2e AC 6(a) diventa **rosso** (telefono T1 salvato, Pilota disattivato); ripristino byte-identico.
2. **Lock**: togliere lo statement di lock della `Person` → l'e2e AC 11 diventa rosso (due 200, due profili attivi) almeno una volta su N run (dichiarare N e gli esiti); se non si riesce a farlo diventare rosso, dichiararlo e tenere l'unit AC 8 come guardia.
3. **Diff**: far mandare al client l'intero form → l'asserzione «body senza chiavi non toccate» di AC 15 diventa rossa.

### 4.4 — Gate
`npm run gates` (mai i quattro comandi separati) + grep di AC 26 + parità di AC 27 + e2e mirati. **Prima** di gates/build/e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` — mai una build sotto un arbitro vivo (HANDOFF, incidente AOG-1b).

---

## §5 — Trappole note

1. **Non replicare `club-card.tsx:90-116`** (A17): niente `Promise.all` di più richieste dal client, nemmeno «solo per il compenso». Una `PATCH`, punto.
2. **`FOR UPDATE` sulla persona deadlocka col registro voli** (AD-3): il lock è `FOR NO KEY UPDATE`, e l'`UPDATE` dell'anagrafica va **per ultimo**.
3. **Esclusività valutata troppo presto**: `assertPilotStudentExclusive` va chiamata **una** volta, **dopo** tutte le scritture di profilo dello stesso Salva (disattivazioni comprese); chiamarla dopo ogni singolo upsert farebbe fallire «Allievo → Pilota» con 422 pur essendo legittimo (AD-2 passo 6).
4. **Ambito delle scadenze sui profili salvati invece che su quelli finali**: il composito legge i profili da `tx` **dopo** il passo 6; il client filtra i chip sui profili **della bozza**.
5. **409 `CONFLICT` ambiguo** (AD-5): un 409 non-email col codice generico verrebbe mostrato come «email già usata».
6. **Env eager**: non importare `instructor-compensation.service.ts` da `people.service.ts` (AD-4); verificare col comando `env -u …`.
7. **Form annidati**: Accesso e Archivio fuori dal form unico (AD-6), altrimenti Invio nell'email dell'invito fa partire il Salva (o il browser ignora il form interno).
8. **`getByLabel` substring** e **mai `Escape`** per chiudere i popover data (§3.4).
9. **A16**: niente `new Date().toISOString().slice(0, 10)` nel codice nuovo — la data di Roma è `todayDateOnlyInZone(APP_TIMEZONE)` (`@/lib/zoned-time` + `@/lib/time`, idioma 16.9 AD-1, lo stesso della 19.3).
10. **La 19.3 tocca `instructor-rates.spec.ts` e i 27 siti e2e che creavano tariffe con `validFrom` passato** (sostituiti da `seedAircraftRate`/`seedInstructorRate` di `e2e/db-fixtures.ts`): sono **suoi**. Qui si riscrivono solo i test **UI** dell'editor istruttore; ogni tariffa con data passata che serve a un test nuovo si crea con `seedInstructorRate`, mai via API (422 `RATE_VALID_FROM_IN_PAST`).
11. **`data-state` e `getByText` sulla data**: dopo una modifica di data non salvata il badge mostra lo stato del valore **salvato**; i test asseriscono la data **dopo** il Salva, non prima.
12. **Salva disabilitato a form pulito (D-5) e gli hit-test mobili**: `mobile-a11y-sweep.spec.ts:281-322` e `mobile-registries.spec.ts:774-845` misurano `elementFromPoint` sul Salva **senza** modificare nulla. Verificare sul Chromium del progetto che un `<button disabled>` resti il risultato dell'hit-test (Chromium non esclude i controlli disabilitati dall'hit-testing, ma va **misurato**, non dato per scontato); se non lo fosse, usare `aria-disabled="true"` + guardia nell'handler invece dell'attributo `disabled`, e dichiararlo in §G. Playwright `click()` su un bottone `disabled` aspetta che si abiliti: ogni test che clicca Salva deve prima aver modificato qualcosa.
13. **Diff falso all'apertura**: un campo d'anagrafica `null` sul server è `''` nell'input; un diff calcolato a mano confrontando i valori grezzi lo vedrebbe «modificato» e il Salva sarebbe abilitato a form appena aperto (AC 15 rosso). Usare i `dirtyFields` di RHF o normalizzare `'' ↔ null` (stessa cosa per prezzo/compenso vuoti).
14. **Riallineamento dopo il Salva**: se il form non si riallinea (baseline = valori salvati), il diff successivo rimanderebbe le stesse parti — innocuo per l'idempotenza (AD-2) ma il Salva resterebbe abilitato e AC 15 fallirebbe.

---

## §6 — Fuori scope DICHIARATO

- **Quota associativa e currency** (19.7): il filtro della quota in `fetchExpiryTypes` (`expiry-editor.tsx:39-45`) resta **invariato**; nessuna sezione quota/currency negli editor; il composito non dà regole speciali al tipo «Quota associativa» (parità con `POST /expiries`). La 19.7 la porterà fuori dai ratings e in Scadenze, lavorando sul componente in bozza di questa story.
- **Visite mediche senza ambito** (R-19-j, 19.7): l'ambito resta com'è; la 19.7 cambierà `assertScopeCompatible` (un punto solo, AD-4) e il filtro dei chip.
- **Editor velivolo a Salva unico e backend tariffe/profili** (19.3); **Impostazioni a Salva unico** (19.8); flusso «Aggiungi istruttore» (`instructors-console.tsx:613-…`, `AddInstructorSlideOver` `:640`, un form a un submit, invariato).
- **Form di creazione**: invariato salvo l'esclusività (AD-9); nessuna unificazione col componente in bozza.
- **Copy definitive e glossario** (19.12); copy di sezioni esistenti («Tariffa payout») non si riscrivono qui salvo le chiavi nuove.
- Gating UI per permesso (AD-7), ETag/versioni (AD-3), conferma di modifiche non salvate (D-6).
- Rimozione delle route singole (D-8).

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§2.3 «Salva unico», §4.0 R-19-e/f/m, §4.2 riga 19.4, §4.10 A11/A12/A16/A17).
- PRD: FR-11 (tariffe istruttore, decorrenza ≥ oggi, storico non mostrato), FR-48 (un solo Salva per form), FR-49 (profili esclusivi) — `_bmad-output/planning-artifacts/epics.md:916`.
- Precedenti: `13-1-*` (composito `createPerson`), `13-2-*` (editor e `LiveExpiryEditor`), `15-10-*` (R-15.10-f, `.so-foot`), `16-3-*` (AD-2 lock e ordine globale), `19-3-*` (gemello velivolo, backend).
- `CLAUDE.md` (e2e, gates, env eager, manutenzione del file); `docs/handoffs/HANDOFF.md` (ambiente, reset DB, arbitro).

---

## Tasks / Subtasks

- [x] **T0 — Riallineamento** (tutti): `git log --oneline -6` (19.1, 19.2, 19.3 committate); verificare sul codice committato della 19.3 i contratti della tabella del banner (nomi di `assertPilotStudentExclusive`, `upsertInstructorRateCore`, `assertRateValidFromNotPast`, codici `PILOT_STUDENT_PROFILES_EXCLUSIVE`/`RATE_VALID_FROM_IN_PAST`, statement del lock, `minDate` via `min`, `seedInstructorRate`/`todayRome`) e annotare nel Dev Agent Record §A ogni differenza; esiti di Q-19.4-a, Q-19.4-b (≡ Q-19.3-d) e Q-19.3-c; `scripts/e2e.sh status`, `:3000` libero; rieseguire i censimenti di §3.1 e §3.4.
- [x] **T1 — Contratto** (AC 1-5, 12): `updatePersonCompositeSchema` + tipo; route; `registry.ts` + `registry.test.ts`.
- [x] **T2 — Service** (AC 1-11): estrazioni `deactivateProfileCore`, `updateExpiryDateCore`, export `assertScopeCompatible`; `updatePerson` composito nell'ordine di AD-2; codici di AD-5; lock e doc-comment di AD-3 (+ `bookings.service.ts:81-82`).
- [x] **T3 — Unit** (AC 1-10): §3.5; comando env eager.
- [x] **T4 — Componente scadenze in bozza** (AC 13-17, 20): AD-8.
- [x] **T5 — Editor pilota** (AC 13-17, 22, 24-25): AD-6, AD-9; `edit-person-button.tsx`; label.
- [x] **T6 — Editor istruttore** (AC 18-21): AD-10; R-19-f con la data di Roma e il minimo; Q-19.4-a/b.
- [x] **T7 — i18n** (AC 27): §3.6, parità misurata.
- [x] **T8 — e2e** (AC 6, 9-11, 13-25): §3.4 (riscritture + spec nuovo).
- [x] **T9 — Discriminanza** (§4.3) con sha256.
- [x] **T10 — Verifica** (AC 23, 26, 28, 29): grep a zero, OpenAPI servito, `npm run gates`, e2e mirati via `scripts/e2e.sh`, screenshot 1280/375; Dev Agent Record compilato (righe effettive, delta test, deviazioni).

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), dev subagent unico della story (`dev-19-4`), 2026-11-02.

### §A — Riallineamento sul HEAD (T0) e verifica dei contratti 19.3

- Partenza da **`bb92494`** (19.1 `08eb558`, 19.2 `b0d142c`, 19.3 `2e66d40` + fix `8b5a023`, chiusura 19.3 con arbitro 504/504). `:3000` libero ed `e2e.sh status` DONE prima di ogni build/run; `.next/dev/types/validator.ts` assente. Implementazione in **`e160065`**.
- **Decisioni PO applicate**: Q-19.4-a = **A** (compenso precompilato, vuoto = `null`); Q-19.4-b = **A** (riga `instructor-rates-next` con la sola prossima tariffa); **Q-19.3-c = B** (l'allievo esclude pilota **e** istruttore): AD-9/AC 25 estesi — nessuno dei due form permette Allievo con Pilota né con Istruttore.
- **Contratti 19.3 verificati sul codice** (nomi definitivi, al posto dei provvisori del banner): `assertStudentProfileExclusive(tx, personId)` (legge anche l'istruttore, codice **`STUDENT_PROFILE_EXCLUSIVE`** — non `assertPilotStudentExclusive`/`PILOT_STUDENT_PROFILES_EXCLUSIVE`); lock `SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE` primo statement di `upsertProfile` (era `:745` su `bb92494`, ora `:929`); `assertRateValidFromNotPast(validFrom)` `rates.service.ts:75` (import pulito); `upsertInstructorRateCore(tx, instructorProfileId, input, actorUserId)` `instructor-rates.service.ts:95`, ritorna l'id; `DateInput` inoltra il `min` come `minDate` (`date-input.tsx:101`); `seedInstructorRate` (`e2e/db-fixtures.ts`), `todayRome`/`addDaysIso` (`e2e/helpers.ts:82`/`:87`). Il doc-comment del modulo prenotazioni era già stato corretto dalla 19.3 (cita `upsertProfile`): il composito è aggiunto alla stessa frase (`bookings.service.ts:83-90`).
- **Scostamenti di riga** rispetto a `72e7e1b` (censimenti §3 rieseguiti su `bb92494`): `people.service.ts` 794 righe — `createPerson` 460, `updatePerson` 544-575, core 632-669, `assertStudentProfileExclusive` 692, `upsertProfile` 736-760, `deactivateProfile` 770-794; `expiries.service.ts` `assertScopeCompatible` 156, `updateExpiry` 262-290; `registry.ts` PATCH `:437`; `pilot-editor.tsx` 1515 righe (`IdentitySection` 231, `NewPersonForm` 444, `ProfilesSection` 857, form di profilo 947/1065/1182, `RatingsSection` 1292, `AccessSection` 1329, `ArchiveSection` 1463); `instructor-editor.tsx` 438; `instructor-rates-panel.tsx` 249 (`todayDateOnly` UTC `:71`); `expiry-editor.tsx` 329 (`LiveExpiryEditor` 83); i18n **1714** chiavi per file. Census e2e di §3.4: stessi spec; `mobile-expiries-movements.spec.ts` intercetta solo `my-expiry-row-mobile` (altra famiglia, non toccata).

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 | ✅ | unit «an anagrafica-only body behaves as before» (chiamate = lock + `person.update`, `PersonDetail` con i tre profili) + i 4 unit storici di `updatePerson` invariati; e2e `api-v1` verde |
| 2 | ✅ | unit «profiles are declarative» (`updateMany` a 0 righe = 200); e2e `person-profiles` «activates the pilot profile» |
| 3 | ✅ | unit: ordine disattivazioni → attivazioni → **una** `assertStudentProfileExclusive` prima di `expiry.findMany`; 422 con Allievo attivo e con entrambi `active: true`, `account.upsert` già avvenuto e `person.update` mai; e2e Allievo → Pilota = **un** PATCH `{ student: {active:false}, pilot: {active:true,…} }` |
| 4 | ✅ | unit: create/update con wipe `SentAlert`/data uguale senza scrittura/remove; 422 `EXPIRY_TYPE_NOT_FOUND`/`_INACTIVE` **prima** di `$transaction`; riga esistente su tipo disattivato → 200; `SCOPE_MISMATCH` dopo la disattivazione; 409 `PERSON_ARCHIVED`; P2002 → 409 `EXPIRY_CONFLICT`; schema: tipo in set+remove o duplicato → rifiutato |
| 5 | ✅ | unit: compenso solo se diverso (anche `null`), tariffa via `upsertInstructorRateCore`, attivazione + compenso + tariffa nello stesso body; 409 `INSTRUCTOR_PROFILE_INACTIVE`; 422 `RATE_VALID_FROM_IN_PAST` prima della transazione |
| 6 | ✅ | e2e `person-save` AC 6a (422 `SCOPE_MISMATCH`, telefono T0, Pilota attivo, nessuna riga) e AC 6b (409, nome N0, Istruttore attivo, compenso 3000 dal riepilogo) sul DB reale; discriminanza §D-1 |
| 7 | ✅ | unit «every write … runs on tx»: nessun `prisma.<modello>` di scrittura chiamato (tx distinto); 409 al passo 8 propaga e `person.update` non chiamato |
| 8 | ✅ | unit: primo statement `$queryRaw` con `FROM "Person"` e `FOR NO KEY UPDATE`, unico; `person.update` ultima scrittura; 403/404/409 email/422 → `$transaction` mai chiamata |
| 9 | ✅ | e2e: PILOTA e ISTRUTTORE → 403 `FORBIDDEN`; unit con `authorize` reale + deny-list (`vi.hoisted`) per `payouts.manage`/`settings.manage`/`expiries.manage`: con la parte → 403 prima di ogni query, senza → salva |
| 10 | ✅ | unit (secondo invio: nessun `sentAlert.deleteMany`/`expiry.update`/`instructorProfile.update`); e2e: stesso body due volte → 200 ×2, snapshot persona+scadenze+tariffe+compenso **identico** |
| 11 | ✅ | e2e `Promise.all` → `[200, 422]`, un solo profilo di volo attivo; discriminanza §D-2 (9/10 rosse senza lock) |
| 12 | ✅ | `registry.test` (+2); `/api/v1/openapi.json` servito: `UpdatePersonRequest` con `profiles/expiries/payoutRateCents/instructorRate`, 200 con i tre profili, 401/403/404/409/422/500, i 7 codici nella description |
| 13 | ✅ | e2e AC 13/14: in `.so-body` 0 «Salva»/«Attiva»/«Modifica»/«Riattiva»/«Disattiva»/«Aggiungi», 0 testid rimossi, `pilot-identity-submit` in `.so-foot` con `form="pilot-identity-form"`; 1280 e 375 (screenshot §H) |
| 14 | ✅ | e2e: telefono + Pilota + rating nuovo + data visita medica → richieste non-GET `/api/v1/` = `['PATCH']`; dopo reload e riapertura tutte e quattro presenti |
| 15 | ✅ | e2e: aperto → disabilitato; modifica → abilitato; ripristino a mano → disabilitato; body = `{ phone }`; dopo il Salva disabilitato; discriminanza §D-3 |
| 16 | ✅ | e2e: tipo disattivato in corsa → `pilot-ratings-error` **con focus**, telefono e riga `new` conservati, telefono vecchio sul DB; email occupata → `pilot-identity-error` «Esiste già una persona con questa email.»; reload: niente salvato |
| 17 | ✅ | e2e `person-profiles`: controlli esclusi disabilitati con descrizione accessibile; transizione in un PATCH; Allievo «Disattivato» con «Data inizio corso» visibile, riga lista con «Pilota» e senza «Allievo»; potatura della riga nuova PILOTS togliendo Pilota |
| 18 | ✅ | e2e `instructor-rates`: placeholder `35,00` (fixture SQL passata) e hint, valore vuoto, «In vigore da» = `min` = oggi Roma, 0 testid di storico/form; dopo Salva placeholder `40,00`; data +30 → placeholder invariato, riga `instructor-rates-next`; senza tariffa: niente placeholder, hint «Nessuna tariffa in vigore»; due programmate → solo la più vicina; riscrittura stessa data → una riga, placeholder `99,00` |
| 19 | ✅ | e2e `instructor-compensation` (riga 30,00 €/h e dovuto) e `person-save` AC 20 (`payoutRateCents: 3350`, campo precompilato `33,50` dopo reload); svuotato → `null`: unit «cleared» (lato client `payoutCentsOf('') = null`) |
| 20 | ✅ | e2e `person-save` istruttore: un PATCH con nome+rating+compenso+tariffa, toast «Modifiche salvate.», tutto presente dopo reload, «Annulla» nel footer; `mobile-registries`: 0 submit di sezione, 1 solo `type="submit"` nel pannello a 375 |
| 21 | ✅ | e2e UI (data digitata ieri → errore di campo, 0 richieste, bozza intatta, nome vecchio sul DB); e2e API (422 + nome vecchio); unit `person-save.test` (`RATE_VALID_FROM_IN_PAST` → sezione tariffa) |
| 22 | ✅ | e2e «Archivia»: unica scrittura `…/archive`, telefono non salvato conservato, Salva abilitato; `people-management:95` e `user-management:102` verdi invariati |
| 23 | ✅ | `mobile-a11y-sweep:281-322` verde invariato (il bottone `disabled` resta il bersaglio di `elementFromPoint`, misurato — trappola 12); `mobile-registries` riscritto verde; 375 senza overflow; popover «In vigore da» a 375 dentro il viewport (left 47.5, right 327.5, 7 giorni disabilitati) |
| 24 | ✅ | `person-detail.spec.ts` verde invariato; `edit-person-button.tsx` senza refresh alla chiusura; `expiry-registration` chiude l'editor dopo il Salva e trova la scheda già aggiornata |
| 25 | ✅ | e2e «Nuovo»: Pilota → Allievo disabilitato (Istruttore no), Allievo → Pilota e Istruttore disabilitati; `people-management` creazione e `person-profiles` helper verdi senza modifiche |
| 26 | ✅ con residui motivati | §E |
| 27 | ✅ | §E: 1714 → **1672**, parità 0/0 |
| 28 | ✅ | §F, §I |
| 29 | ✅ | §H |

### §C — Censimento dei lock (AD-3)

`grep -rn "FOR UPDATE\|FOR NO KEY UPDATE" src/server` (no test): nuovo `people.service.ts:650` `Person FOR NO KEY UPDATE` (con `"archivedAt"`), **primo** statement della transazione di `updatePerson`; seguono solo righe della **stessa** persona: profili/`Account` (core) → `Expiry`/`SentAlert` → `InstructorProfile` (`update`) → `InstructorRate` (upsert) → `Person` (`UPDATE` dell'anagrafica, per ultimo). Invariati: `upsertProfile` `:929` (`Person` → profilo → `Account`); prenotazioni `Booking → Aircraft → Person → InstructorProfile` (`bookings.service.ts:348-350`); registro voli `Aircraft → Account` (`flights.service.ts:1173/1202`, `1393/1402`, `1522/1562`); tariffa velivolo `Aircraft` (`rates.service.ts:95`); `accounts.service.ts:639`, `membership.service.ts:103` (`Account`). Nessuna transazione prende `Account`/`InstructorProfile` e poi `Person`; l'ordine `Person → InstructorProfile` è quello delle prenotazioni; chi tiene `Account FOR UPDATE` tocca la persona solo col `FOR KEY SHARE` delle FK, compatibile con `FOR NO KEY UPDATE`. Doc-comment di `updatePerson` (`:557-611`) e del modulo prenotazioni aggiornati.

### §D — Discriminanza (§4.3) con sha256

Mutazioni sul sorgente, build di produzione dedicata, e2e con `--retries=0`, ripristino con `cp` dall'originale e confronto sha256 (16 hex). File: `people.service.ts` `d47107c2a598373c`, `pilot-editor.tsx` `adaa418e43478584`.

| # | Mutazione | Esito | sha256 prima → dopo |
|---|---|---|---|
| 1 | `return prisma.$transaction(async (tx) => {…})` → stessa funzione eseguita su `prisma` (nessuna transazione) | e2e AC 6a **rossa 3/3** (`--repeat-each=3`): Pilota disattivato rimasto salvato (`after.profiles.pilot` false); unit **16 rossi** (i test a `tx` distinto) | `d47107c2a598373c` → identico |
| 2 | lock senza `FOR NO KEY UPDATE` (stessa SELECT, nessun lock di riga) | e2e AC 11 **rossa 9/10** (`--repeat-each=10`): `[200, 500]` — i due `Account` upsert concorrenti collidono (P2002 → 500) invece del 422; unit **2 rossi** (forma/ordine del lock) | `d47107c2a598373c` → identico |
| 3 | client: il body porta tutta l'anagrafica (`IDENTITY_FIELDS` al posto di `changedIdentity`) | e2e AC 15 **rossa 3/3** (body con `firstName/lastName/email/address` in più) | `adaa418e43478584` → identico |

1 e 3 nella stessa build (server vs client, indipendenti); 2 in una build a parte. Dopo il ripristino: `grep -c DISCRIMINANCE` = 0, `npm run gates` verde e build di produzione rifatta prima della serie finale.

### §E — Grep di AC 26 e parità i18n (verbatim)

```
$ grep -rn "LiveExpiryEditor\|PayoutRateForm\|ProfilesSection\|PilotProfileForm\|StudentProfileForm\|InstructorProfileForm\|ProfileSubShell" src e2e
(0 righe)
$ grep -rn "fetch(`/api/v1/people/${…}/profiles\|/api/v1/expiries\|instructor-compensation/${\|/instructor-rates`, {" pilots/ instructor-editor.tsx instructor-rates-panel.tsx expiry-editor.tsx
(0 righe — instructor-rates-panel.tsx non esiste più)
$ grep -rnE "expiry-add-(form|date|confirm)|expiry-edit-|expiry-remove-confirm-|instructor-payout-rate-submit|instructor-rates-(form|submit)\b|instructor-rate-history" src e2e
e2e/instructor-rates.spec.ts:103   (asserzione di ASSENZA, AC 18)
e2e/mobile-registries.spec.ts:833  (asserzione di ASSENZA, AC 20/23)
e2e/person-save.spec.ts:239        (asserzione di ASSENZA, AC 13)
e2e/person-save.spec.ts:363        (asserzione di ASSENZA, AC 20)
$ grep -rn "R-15.10-f" src e2e
aircraft-editor.tsx:277, airops.css:1132, airops.css:3630, mobile-ink-targets.spec.ts:571, mobile-a11y-sweep.spec.ts:269 (storici), mobile-registries.spec.ts:806 («superseding R-15.10-f»)
$ grep -n "todayDateOnly\b\|toISOString().slice(0, 10)" instructors/*.tsx expiry-editor.tsx
instructors-console.tsx:442-472 (form «Paga», periodEnd/yearStart: censimento della 16.9, non toccato)
```

Residui motivati: (a) le 4 righe del grep 3 sono le asserzioni di assenza che AC 13/18/20 chiedono (stessa eccezione di 19.2 §G-1 e 19.3 §H-7); (b) grep 4: solo riferimenti storici, nessuno afferma «i submit di sezione restano»; (c) grep 5: il «Paga» della console è il caso 5 della 16.9 (TD 19.4-b), fuori dagli editor.

**i18n**: 1714 → **1672** chiavi per file (−47: `PeoplePage.profilesPanel.actions.*` 9, `PilotsPage.editor.{ratings,medical}.{addAction,cancel,save,edit,confirmRemove,confirmYes,confirmCancel}` 14, `InstructorsPage.editor.ratings.*` 7, `editor.payoutRate.save`, `editor.identity.save`, `studentRate.{current,loadError,submit,rateAdded,conflictError,historyTitle,historyEmpty,historyValidFrom,historyPrice,historyActor,historyWhen,historyShowAll}` 12, `toast.{rateSet,identitySaved,genericError}` 3 — ognuna verificata senza consumatori; +5: `restore` ×3, `InstructorsPage.toast.saved`, `InstructorsPage.studentRate.next`). Copy riusate, non duplicate: hint e «decorrenza nel passato» da `AircraftPage.editor.{rates.currentHint,errors.validFromPast}`, email occupata da `PilotsPage.editor.errors.conflictEmail`, hint di esclusività = `PeoplePage.profilesPanel.errors.exclusive`; il Salva istruttore usa `InstructorsPage.editor.save` («Salva modifiche», prima inutilizzata). `diff <(jq … it.json | sort) <(jq … en.json | sort)` **vuoto**.

### §F — Delta test (unit ed e2e, prima/dopo)

- **Unit**: 1804 → **1834** (+30): `people.service.test` +19 (17 `it` + 2 dal ciclo RBAC a 3 casi), `registry.test` +2, `expiries.service.test` +1 (core estratto), `person-save.test` nuovo +8. Env eager: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` di people/expiries/instructor-rates/rates/person-save → 226 passed.
- **e2e**: +15 → **delta atteso arbitro 504 → 519**: `person-save.spec.ts` nuovo (11), `person-profiles` 11 → 13, `instructor-rates` 4 → 6; `people-management`, `expiry-registration`, `instructor-compensation`, `mobile-registries` invariati nel numero. Nessuno spec nella catena serializzata (nessuna AppSettings, nessun aggregato globale: le asserzioni sul compenso leggono la riga del proprio istruttore run-unique).
- **Run mirati** (build di produzione, `E2E_REUSE_SERVER=1 scripts/e2e.sh start --project=chromium …`):
  1. primi 6 spec → 49 passed, **1 failed** (AC 16: focus non arrivato all'errore di sezione) + **1 flaky** (`instructor-rates` AC 18). Cause misurate e corrette: (i) il focus differito con `setTimeout` girava prima del commit dell'errore (log `focusin`: il Salva disabilitato lasciava il focus su `<body>`) → focus in un effetto dopo il commit; (ii) la pagina Istruttori fa `key={JSON.stringify({ count: items.length })}` sulla console (12.7): il `router.refresh()` del Salva la rimonta e chiude l'editor se nel frattempo uno spec parallelo ha creato un istruttore (snapshot dell'errore: 11 istruttori, pannello chiuso) → i test della pagina Istruttori riaprono l'editor dopo il Salva o leggono l'API (TD 19.4-a).
  2. **serie finale** sulla build del commit: person-save, person-profiles, instructor-rates, people-management, expiry-registration, instructor-compensation, mobile-registries, mobile-a11y-sweep, person-detail, user-management, api-v1 → **101 passed**, `E2E_EXIT=0`.
- Login `LoginAttempt` (TD-6) controllato prima della serie finale: solo tentativi riusciti (admin 66, pilot 7, instructor 1), nessun lock.

### §G — Deviazioni motivate

1. **Controllo dei profili a spunta, non `Segmented`** (AD-9 lo raccomandava): con Q-19.3-c = B la regola è a tre vie (allievo ⟂ pilota **e** istruttore, pilota + istruttore ammesso) e un gruppo a scelta singola + checkbox avrebbe comunque richiesto opzioni disabilitate; ogni profilo ha già il suo riquadro (AD-9). Regola unica `isProfileBlocked` nei due form: un controllo **non spuntato** è disabilitato mentre è spuntato un profilo che lo esclude (uno spuntato si può sempre togliere: nessuna persona salvata in uno stato vietato resta bloccata), attenuato con `cursor: not-allowed` e collegato via `aria-describedby` alla riga di spiegazione (copy `PeoplePage.profilesPanel.errors.exclusive`). Testid: `pilot-editor-profile-{type}-active`, campi `pilot-editor-profile-pilot-license-number`/`-license-type`, `pilot-editor-profile-student-course-start`; nel «Nuovo» restano `new-person-activate-*` (test di creazione invariati).
2. **`instructor-rates-panel.tsx` cancellato**, la sezione confluisce in `instructor-editor.tsx` (scelta che AD-10 lasciava al dev): lo stato della tariffa serve al Salva unico dell'editor.
3. **Il lock legge anche `"archivedAt"`** (`SELECT "id", "archivedAt" … FOR NO KEY UPDATE`): il 409 `PERSON_ARCHIVED` è deciso sotto il lock, così un `archivePerson` concorrente (che aggiorna la stessa riga) non può infilarsi fra controllo e creazione — stessa lezione di 19.3 F2. Modo invariato.
4. **P2002 su `Expiry`** → 409 **`EXPIRY_CONFLICT`** (nome scelto dal dev, AD-5).
5. **Lettura finale**: con chiavi d'anagrafica l'`UPDATE` restituisce già il `PersonDetail` (`select: PERSON_DETAIL_SELECT`, dentro `tx`, dopo ogni scrittura); senza, `findUniqueOrThrow`.
6. **Tipi delle scadenze**: esistenza verificata prima della transazione per tutti i tipi di `set`; tipo attivo verificato prima per le creazioni previste e **di nuovo** dentro la transazione per le creazioni effettive (riga cancellata nel frattempo), con la stessa mappa — nessuna query in più.
7. **Esclusività chiamata se è presente un qualunque blocco di profilo** (istruttore compreso, Q-19.3-c), non solo pilota/allievo.
8. **`updateExpiry`** ora scrive la data tramite `updateExpiryDateCore` e poi note/attore con la `select` in un secondo `UPDATE` della stessa transazione (asserzioni dei suoi unit invariate).
9. **Lato client un modulo condiviso** `src/lib/person-save.ts` (diff dell'anagrafica con `''` ≡ `null`, trappola 13; classificatore codice → sezione di AD-5) usato dai due editor, ognuno coi propri messaggi.
10. **Testid di errore di sezione** nuovi: `pilot-profiles-error`, `pilot-ratings-error`, `pilot-save-error`, `instructor-ratings-error`, `instructor-rates-error`, `instructor-save-error` (restano `pilot-identity-error`, `instructor-identity-error`, `instructor-payout-rate-error`); messaggi = i `genericError` della sezione (AD-5), salvo email occupata ed esclusività.
11. **Ramo in sola lettura dell'istruttore** (`!canManagePeople`, irraggiungibile oggi — AD-7): resta l'anagrafica in sola lettura; ratings/compenso/tariffa vivono nel form, quindi non compaiono senza form.
12. **`fetchPersonExpiries` fallisce invece di restituire `[]`**: una lista vuota per errore offrirebbe come chip tipi già registrati (il Salva darebbe `EXPIRY_CONFLICT`).
13. **La data salvata delle righe vive nel `DateInput`** (non più testo `mono`): l'asserzione «contiene 31/12/2099» di `people-management` diventa `toHaveValue('2099-12-31')` + `data-state="saved"` + `GET` dell'API.
14. **Focus dopo un Salva fallito in un effetto post-commit** (misura in §F-1); il focus del primo campo invalido lato client resta col `setTimeout` esistente (misurato funzionante: `pilot-editor-profile-pilot-license-number`, `instructor-rate-valid-from`).
15. **`aria-pressed` sui chip** della bozza (sono interruttori).
16. **e2e della pagina Istruttori**: riaprono l'editor dopo il Salva (`saveAndReopen`) o leggono l'API; il riallineamento in place dopo il Salva è provato sull'editor pilota (AC 15) e verificato a mano sull'istruttore (§H).
17. **`sprint-status.yaml` non toccato** (istruzione della sessione principale), nonostante il passo 4/9 del workflow.

**TD aperti** (da riportare nel §7): **19.4-a** la pagina Istruttori rimonta `InstructorsConsole` quando cambia il numero di istruttori (`instructors/page.tsx:93`, 12.7): un Salva con `router.refresh()` chiude l'editor se nel frattempo il conteggio è cambiato (D-4 violato in quella corsa; esisteva già col vecchio submit del compenso); **19.4-b** form «Paga» della console con «oggi» UTC (`instructors-console.tsx:442-472`, caso della 16.9); **19.4-c** `today` dell'editor istruttore fissato al mount (gemello di 19.3-c, il 422 server è mappato sul campo); **19.4-d** (preesistente, osservato) un campo anagrafica opzionale svuotato non si può salvare: `updatePersonSchema` rifiuta `''` (`min(1)`) e mostra «Campo obbligatorio» — invariato da questa story.

### §H — Verifica UI (screenshot)

Script `playwright-core` throwaway nello scratchpad (Chromium `chromium-1228`, `timezoneId: 'Europe/Rome'`), app reale su build di produzione, **1280×900** e **375×812**: editor pilota pulito / con bozza (riga rimossa barrata con «Ripristina», riga nuova con barra d'accento, Istruttore spuntato) / con errore di sezione, editor pilota dalla scheda persona, form «Nuovo» con Allievo (Pilota e Istruttore disabilitati + spiegazione), editor istruttore pulito / con tariffa programmata / con errore di data, popover «In vigore da».

```
scrollWidth == innerWidth in tutte le schermate (1280/1280, 375/375)
.so-foot: "Annulla | Salva modifiche" (pilota, scheda, istruttore) · Salva disabilitato a form pulito: true (pilota e istruttore, 1280 e 375)
focus dopo errore di sezione: pilot-ratings-error · dopo validazione client: pilot-editor-profile-pilot-license-number / instructor-rate-valid-from
popover «In vigore da» @375: left 47.5 right 327.5 top 51.5 bottom 441.7 (viewport 375×812), 7 giorni disabilitati; @1280: dentro (992-1272)
editor istruttore dopo il Salva: placeholder 48,00, prezzo vuoto, compenso 35,00, riga tabella 35,00 €/h
```

Coerenza AirOps (skill `design-taste-frontend` letta: design read «UI di prodotto AirOps, preservare» — il suo perimetro landing non si applica, prese solo le regole su stati, contrasto, label visibili; `ui-ux-pro-max` consultata: controlli disabilitati riconoscibili e spiegati, errori vicino al problema con `role="alert"`, feedback del submit): stessi `Section`, `Field`, `Badge`, `.form-grid`, `.expiry-chip` di prima; una sola regola CSS nuova (`.expiry-draft-row[data-state=…]`, token esistenti: barra `--accent` come il chip selezionato, `--ink-4` + barrato per la rimozione).

### §I — Gate ed esiti verbatim

```
$ npm run gates          (ultimo, sul contenuto di e160065)
PASS  lint (29s)
PASS  typecheck (12s)
PASS  test (11s) — Tests  1834 passed (1834)
PASS  build (31s)
```
e2e mirati: §F (serie finale 101 passed, `E2E_EXIT=0`). L'arbitro full-suite su DB fresco resta alla sessione principale (atteso **519**).

**Stato macchina a fine lavoro**: `:3000` libero (server fermati per task), nessun run e2e attivo, nessun DB gemello creato (le prove girano sul DB `airmanager` con fixture run-unique: contiene i dati dei run mirati — consigliato il reset prima dell'arbitro), nessuno stash; file untracked dell'utente, cancellazione di `.claude/skills/design-taste-frontend/SKILL.md`, `sprint-status.yaml` e story file di altre story non toccati.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `72e7e1b`).
- Dev 2026-11-02: tutte le task T0-T10 completate; implementazione `e160065`; Status → review.

### File List

- `src/server/services/people.service.ts`, `people.service.test.ts`
- `src/server/services/expiries.service.ts`, `expiries.service.test.ts`
- `src/server/services/instructor-rates.service.ts` (doc), `bookings.service.ts` (doc)
- `src/lib/schemas/people.ts`, `registry.ts`, `registry.test.ts`
- `src/lib/person-save.ts` (nuovo), `src/lib/person-save.test.ts` (nuovo), `src/lib/expiry-scope.ts` (commento)
- `src/app/api/v1/people/[id]/route.ts`
- `src/components/dashboard/expiry-editor.tsx`
- `src/app/[locale]/dashboard/pilots/pilot-editor.tsx`, `pilot-editor-labels.ts`
- `src/app/[locale]/dashboard/people/[id]/edit-person-button.tsx`
- `src/app/[locale]/dashboard/instructors/instructor-editor.tsx`, `instructors-console.tsx`, `page.tsx`
- `src/app/[locale]/dashboard/instructors/instructor-rates-panel.tsx` (cancellato)
- `src/styles/airops.css`
- `messages/it.json`, `messages/en.json`
- `e2e/person-save.spec.ts` (nuovo), `person-profiles.spec.ts`, `instructor-rates.spec.ts`, `people-management.spec.ts`, `expiry-registration.spec.ts`, `instructor-compensation.spec.ts`, `mobile-registries.spec.ts`
- `_bmad-output/implementation-artifacts/19-4-editor-pilota-istruttore-salva-unico.md` (questo record)

### Change Log

- 2026-11-02 — Implementazione completa della story 19.4 (`e160065`): `PATCH /people/{id}` composito atomico con lock `Person`, editor pilota e istruttore a Salva unico, scadenze in bozza, profili esclusivi nei due form, tariffa allievo R-19-f, OpenAPI, i18n, e2e. Status → review.
- 2026-11-02 — Fix di review (`f3f6cf9`): F1 (campi opzionali vuoti = `null`, chiude il TD 19.4-d), F2 (messaggio per codice, errori di riga sulla riga via `details.expiryTypeId`), F3 (GET tariffe fallito mostrato come errore). Status resta review.

## Review Record — 19.4

- **Review adversarial** (Opus 5.5, 2026-11-02): **SHIPPABLE DOPO IL FIX DI F1**. Il reviewer ha trovato 1 medium, 2 low e 3 note INFO. Report: `19-4-review-report.md`. Il suo arbitro su DB fresco ha dato **519/519**, `E2E_EXIT=0`.
- **Fix** (fix-subagent Opus 5.5, commit **`f3f6cf9`**). Cosa correggere l'ha deciso la sessione principale: F1, F2 e F3 tutti in questo fix. F2 non è stato rinviato alla 19.12.

### F1 (medium) — corretto

- **Causa**: il diff (`person-save.ts#savedFormOf`) tratta `''` come `null`, il resolver `updatePersonSchema` no (`min(1)` su telefono e indirizzo, `z.email()` sull'email). Un campo opzionale digitato e poi svuotato finiva quindi nel form come `''`, e `handleSubmit` bloccava l'intero Salva su «Campo obbligatorio.» senza mandare nessuna richiesta.
- **Fix**: `blankToNull` (`src/lib/person-save.ts`) è il `setValueAs` di `email`/`phone`/`address` in tutti e tre i form anagrafica con lo stesso resolver «trim + min(1)»: modifica pilota, modifica istruttore e «Nuovo» del pannello pilota. Il «Nuovo» usa `createPersonBaseSchema`, che ha la stessa trappola, e sta nello stesso file. Effetti:
  - un campo vuoto mai toccato, o toccato e svuotato, vale `null`: è valido e non entra nel diff;
  - un valore salvato poi svuotato entra nel diff come `null` e il server lo azzera. Questo **chiude il TD 19.4-d**: il server accettava già `null` su questi tre campi.
  - Il form di accesso (`AccessSection`), dove l'email è obbligatoria, resta invariato.
- **Nota minore del reviewer, corretta**: `onInvalid` dei due editor ora azzera `saveError`. L'errore server del tentativo precedente non resta più accanto ai nuovi errori di campo.
- **Guardie e2e** (tutte **rosse 3/3 sul pre-fix**, ferme alla riga del toast perché il Salva viene bloccato senza richiesta; verdi sul fix):
  - `person-save` «an optional field typed into and emptied again…» (editor pilota): indirizzo vuoto digitato e svuotato → Salva ancora disabilitato; telefono salvato svuotato + rating nuovo → **1 PATCH** con body `{ phone: null, expiries: { set: [...] } }`; sul server `phone = null` e la riga c'è.
  - Gemello nell'editor istruttore: telefono digitato e svuotato, email salvata svuotata, compenso → body `{ email: null, payoutRateCents: 3000 }`; sul server `email = null`.
  - «Nuovo»: telefono digitato e svuotato → creazione con `phone: null`.

### F2 (low) — corretto

- **Mappatura** (`personSaveError`, `src/lib/person-save.ts`, al posto di `personSaveErrorSection`): restituisce sezione, motivo ed eventuale `expiryTypeId`. Ogni codice del contratto del `PATCH /people/{id}` ha un messaggio suo:

  | Codice | Sezione | Messaggio IT |
  |---|---|---|
  | `PERSON_ARCHIVED` | Scadenze | «La persona è archiviata: ripristinala per aggiungere nuove scadenze.» |
  | `EXPIRY_TYPE_NOT_FOUND` | sulla riga | «Questo tipo non esiste più: togli la riga.» |
  | `EXPIRY_TYPE_INACTIVE` | sulla riga | «Questo tipo è stato disattivato: togli la riga.» |
  | `SCOPE_MISMATCH` | sulla riga | «Questo tipo non vale per i profili attivi: togli la riga o attiva il profilo a cui si applica.» |
  | `EXPIRY_CONFLICT` | sulla riga | «Una scadenza di questo tipo è stata registrata nel frattempo: chiudi e riapri la scheda per vederla.» |
  | `INSTRUCTOR_PROFILE_INACTIVE` | Compenso o Tariffa allievo | «Il profilo istruttore non è più attivo: compenso e tariffa allievo non si possono salvare.» |
  | `VALIDATION_ERROR` di un blocco | quella sezione | «Alcuni dati non sono validi: correggili e salva di nuovo.» |
  | `FORBIDDEN` / `NOT_FOUND` / `UNAUTHENTICATED` | banner del form | permessi / persona inesistente / sessione scaduta |

  Restano invariati `CONFLICT` (email), `STUDENT_PROFILE_EXCLUSIVE`, `RATE_VALID_FROM_IN_PAST` (sul campo «In vigore da») e `VALIDATION_ERROR` su un campo anagrafica (sul campo). **«Si è verificato un errore. Riprova.» resta solo per `INTERNAL_ERROR`, errori di rete e corpi non-envelope.**
- **Server, additivo**: i quattro errori su UNA riga portano `details: { expiryTypeId }` (`people.service.ts#updatePerson`/`assertExpiryTypeCreatable`). `assertScopeCompatible` (`expiries.service.ts`) accetta un `details` opzionale; `registerExpiry` non lo passa e resta invariato. Lo strato HTTP inoltrava già i `details` di `ValidationError`/`ConflictError` (16.2 AD-3). La descrizione OpenAPI del `PATCH` lo documenta. `PERSON_ARCHIVED` resta senza `details`, perché riguarda tutte le righe nuove e non una sola. `parseApiError` espone `details`; chi lo chiamava già leggeva solo `code`/`fieldErrors` e non cambia.
- **UI**: `ExpiryDraftEditor` ha una prop `rowError`. Il messaggio compare sotto la riga (`expiry-error-{typeId}`, `role="alert"`, `tabIndex=-1`, stile `.fld-error` come «Data obbligatoria») e riceve il focus. Il fallback è l'errore di sezione, usato se manca l'id o la riga non è nella bozza. Se l'utente toglie la riga, l'errore sparisce con lei e non risale alla sezione. Le etichette sono condivise: `pilot-editor-labels.ts#buildPersonSaveErrorLabels(PilotsPage, PeoplePage)`, usata anche da `instructors/page.tsx`, così le due superfici non formulano diversamente lo stesso rifiuto. Il «Nuovo» non è toccato da F2: il suo `POST` ha il proprio banner.
- **i18n**: 10 chiavi nuove in `PilotsPage.editor.saveErrors.*` più `InstructorsPage.studentRate.loadError` (F3). Tolte le chiavi rimaste orfane: `InstructorsPage.studentRate.genericError` e `InstructorsPage.editor.errors.generic`, con i rispettivi campi del tipo `InstructorEditorLabels`, insieme a `errors.conflictEmail`. Totale **1672 → 1681**, parità IT/EN **0/0**.
- **Guardie**:
  - **unit** `person-save.test.ts`: ogni codice instradato con sezione e motivo, l'id di riga letto da `details` (assente o non stringa → `null`), 500 e `null` → `generic`. Un test legge i codici dalla **descrizione OpenAPI** del `PATCH /people/{id}` (generata da `generateOpenApiDocument`), aggiunge i generici AD-8 delle sue risposte e asserisce che nessuno cada in `generic`: un codice documentato in futuro fa fallire il test finché non viene mappato.
  - `people.service.test.ts` asserisce `details.expiryTypeId` sui quattro codici: **rosso 3/3** con il service di HEAD. Il primo test copre insieme NOT_FOUND e INACTIVE.
  - `api-field-errors.test.ts`: `details` passato o `null`.
  - **e2e** (ognuno **rosso 3/3 sul pre-fix**, verde sul fix):
    - `person-save` AC 16 riscritto: tipo disattivato a pannello aperto → messaggio **sulla riga**, con focus, e nessun errore di sezione. Pre-fix: `element(s) not found`.
    - «a new scadenza on a person archived meanwhile…»: `pilot-ratings-error` = messaggio di `PERSON_ARCHIVED`, con focus, e telefono non salvato. Pre-fix: `Received: "Si è verificato un errore. Riprova."`.
    - «the instructor profile deactivated meanwhile…»: `instructor-payout-rate-error` = messaggio di `INSTRUCTOR_PROFILE_INACTIVE`, con focus.

### F3 (low) — corretto

- **Fix**: quando la lettura fallisce, `fetchInstructorRates` restituisce `null` invece di `[]`. L'editor tiene `ratesLoadError`, anche dopo la rilettura che segue un Salva riuscito, e mette il messaggio «Impossibile caricare le tariffe: quella in vigore non è nota.» nello slot dell'hint del campo prezzo: sotto il campo, rosso, `role="alert"` e collegato via `aria-describedby`. Non compaiono né il placeholder né «Nessuna tariffa in vigore», e il campo non è marcato invalido. Un errore di validazione del prezzo, quando c'è, ha la precedenza nello stesso slot.
- **Guardia e2e** `instructor-rates` «a failed read of the rates says so…»: tariffa reale seminata, poi GET intercettato con 500 → descrizione accessibile = messaggio di caricamento, nessun placeholder, nessun «Nessuna tariffa in vigore». **Rosso 3/3 sul pre-fix** (`Received: "Nessuna tariffa in vigore"`).

### Note INFO

- **I1** (`expiry-editor.tsx#precompileExpiresAt` usa la data UTC): preesistente (13.8) e fuori dal diff di F1-F3. Registrato come **TD 19.4-e**: fra le 00:00 e l'01:00/02:00 di Roma precompila la data un giorno indietro. Il grep di AC 26 non lo intercetta (`todayDateOnly\b` ≠ `todayDateOnlyUtc`).
- **I2** (ricontrollo «tipo attivo» con la mappa letta prima della transazione): innocuo, è la stessa finestra di `registerExpiry`. Nessuna azione.
- **I3** (persone legacy con Allievo e Pilota entrambi attivi): coerente con lo «stato finale». Nessuna azione.

### Discriminanza, gate, delta

- **e2e sul pre-fix**: build di produzione dei sorgenti di HEAD con gli spec del fix, sul DB gemello `airmanager_fix194`, filtrata su `review 19.4|AC 16, P7` → **7 failed / 0 passed**, ciascuno 3/3. Le righe di fallimento sono riportate sopra per ogni guardia.
- **Ripristino**: i 17 file del fix sono stati copiati da parte prima dello scambio e riportati; `sha256sum` confrontato: 17/17 identici.
- **e2e sul fix**: build dei gate, gemello, serie mirata sugli spec che toccano gli editor (`person-save`, `instructor-rates`, `instructor-compensation`, `people-management`, `person-detail`, `person-profiles`, `expiry-registration`, `user-management`, `mobile-registries`) → **86 passed** (1.9m), 0 failed, 0 flaky, `E2E_EXIT=0`.
- **Verifica UI** (`playwright-core`, Chromium 1228, Europe/Rome): errore di riga a 1280 e a 375, con testo atteso, focus sull'errore e overflow 0. Errore di caricamento tariffe a 1280 sotto il campo prezzo, senza placeholder. Coerenza AirOps: `.fld-error` e il ritmo dei messaggi di riga già esistenti. Screenshot nello scratchpad, `fix194/shots/`.
- `npm run gates` (sul contenuto committato): `PASS lint · PASS typecheck · PASS test — Tests 1839 passed (1839) · PASS build`. **Unit 1834 → 1839.**
- **Delta e2e atteso per l'arbitro: 519 → 525** (+5 in `person-save.spec.ts`, +1 in `instructor-rates.spec.ts`).
- **Stato macchina**: il DB `airmanager` non è stato toccato dal fix. Tutte le prove sono state fatte sul gemello `airmanager_fix194`, creato come copia dell'`airmanager` appena resettato e poi rimosso; `airmanager_load` non è mai stato toccato. I server avviati sono stati fermati per PID; `:3000` è libero e non ci sono processi `next`. Ultimo run e2e: `DONE — E2E_EXIT=0`, cioè la serie mirata, non un arbitro. Nessuno stash. File untracked dell'utente, `sprint-status.yaml` e story file di altre story non toccati.
