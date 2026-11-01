---
baseline_commit: eef77ef
---

# Story 19.9: Avviso con deroga admin — registrazione voli

Status: **ready-for-dev** — 2026-11-01. **Nessuna domanda PO aperta**: Q-19.9-a = **SÌ** (sessione principale) e Q-19.9-b = **SEMPRE** (PO, contro la raccomandazione), registrate sotto le domande e applicate agli AC marcati `[Q-a = SÌ]`/`[Q-b]`; contratto esteso per Q-19.10-a = B (date di riferimento per check, AD-2). **Modello dev: Opus 5 xhigh (UI)**: la story scrive codice UI (avviso unico nel form volo desktop e pannello mobile, registro senza badge, sheet mobile, riepilogo) oltre a un servizio nuovo, una migrazione, Zod/OpenAPI, permessi, seed ed e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-9-avviso-deroga-voli`. **Assorbe la 16.4** (superseded) per la parte voli (§0.2, D-13, D-14). La deroga sull'addebito della quota associativa è della **19.10** (decisione della sessione principale, §6).

> ⚠️ **Baseline e ordine**: ogni `file:riga` è misurato su **`eef77ef`** (HEAD al 2026-11-01: 19.1 e 19.2 committate, 19.3-19.8 solo come story file). Il dev parte **DOPO il commit di 19.3 … 19.8**, che toccano **gli stessi file**:
> - **19.3** aggiunge `aircraftPriceCategory` a `resolveFlightInput`/`OriginalFlightIdentity` (prezzo dal profilo, Q-19.3-b) e `e2e/db-fixtures.ts` (`seedAircraftRate`, `seedInstructorRate`), `todayRome()`/`addDaysIso()` in `e2e/helpers.ts`.
> - **19.5** riduce `FlightType` a `TOURISM`/`SCHOOL` e mette il `Toggle` «Volo solista» (testid `flight-solo-toggle`) al posto delle radio (`flight-editor.tsx:1041-1055` su questa baseline).
> - **19.6** introduce `PUT`/`DELETE /api/v1/flights/{id}`, `updateFlight` (sostituisce `correctFlight`), `Flight.noCharge`, il helper puro di scrittura (`buildFlightWrite` o nome reale: **l'unico** posto che calcola `totalAmountCents`), la regola D-7 sul timbro in modifica, e riduce `statusBadgeAndLineage`/`flightBadgeKind` al solo caso «deroga» (che questa story toglie).
> - **19.7a** mette la regola mediche dentro le scansioni (`findMissingBlockingDocuments` / `findBlockingExpiredDocuments`), il tipo `MEMBERSHIP`, ed esporta `getMedicalRequirementFailure`, `getMembershipStatus`, `getCurrencyStatus(personId, atDate, { excludeFlightId })`, `getCurrencySettings`, l'helper e2e `registerFlightOn`.
> - **19.7b**/**19.8**: registro Scadenze e Impostazioni (X e Y della currency): nessun file in comune salvo seed ed e2e.
>
> **Prima di scrivere una riga**: `git log --oneline -10`, `scripts/e2e.sh status`, `ss -ltnp | grep :3000`; poi rieseguire i **censimenti di §3** (sono comandi, non elenchi di cui fidarsi) e correggere in questo file le righe slittate (T0). Leggere l'API **reale** di `getCurrencyStatus` (forma del ritorno), `getMembershipStatus`, `getMedicalRequirementFailure`, del helper di scrittura della 19.6 e di `registerFlightOn`.
>
> **Da leggere PRIMA**: `CLAUDE.md` (convenzioni e2e: substring di `getByLabel`/`hasText`, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-` e divieto del suffisso dove esiste un `^=`, suite solo via `scripts/e2e.sh`, env eager negli unit); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §4.0 **R-19-g/h/i/j/k**, §4.2 righe 19.9-19.10, **§4.4**, §4.5, §4.6, §4.10 **A5/A9/A10**; `19-6-*.md` (AD-4, AD-5, D-7), `19-7a-*.md` (§0.3 D-4..D-8, AD-3..AD-5, §5.11-12), `19-3-*.md` (AD-4), `19-5-*.md` (AD-4 `Toggle`), `16-4-tipo-scadenza-disattivato.md` (AD-2 #1 e #6, ciò che si assorbe); `aog-1a-*.md` (review MAJOR-1: perché la deroga deve mostrare **tutto** prima di essere data). Skill: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).
>
> **Contratto condiviso con la 19.10** (servizio, formato di `details.failures[]`, permesso, componente UI, chiavi i18n): concordato con lo writer della 19.10 il 2026-11-01 (§1 AD-2; la 19.10 lo consuma nel suo AD-1, delta finali comunicati: `hasActiveInstructor`, nessun `client`, `registration` nel fuori servizio, `title?` del componente, `forcedAt` nel DTO; poi, per Q-19.10-a = B, le **date di riferimento per check**: `expiryDateOnly`, `membershipDateOnly`, `currency.dateOnly`). **Non rinominare** nulla di AD-2 senza riallineare la 19.10.

### ✅ Domande PO — decise il 2026-11-01

**Q-19.9-a — La quota associativa si controlla anche all'istruttore a bordo?**

R-19-k dice che la quota è dovuta da piloti, allievi **e istruttori** e che «mancante o scaduta = check fallito»; per le visite mediche R-19-j dice esplicitamente «persona e istruttore», per la quota la CR non lo dice. Vale anche per le prenotazioni con istruttore (19.10: stessa domanda, stesso ID).

| Opzione | Effetto | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | MEMBERSHIP valutata per la persona **e** per l'istruttore del volo (una voce per ciascuno, con il ruolo). | È l'unico punto in cui la quota di un istruttore viene mai controllata (R-19-k «per tutti»); stessa copertura di EXPIRY; per l'admin resta un avviso derogabile. | Il volo di un allievo in regola mostra l'avviso se è l'istruttore a non aver pagato. |
| B | Solo la persona (chi paga il volo). | Avviso più corto. | La quota dell'istruttore non viene controllata da nessuna parte. |

> Con B: in AD-2 `evaluateRequirements` non chiama `getMembershipStatus` per l'istruttore; cambiano AC 4 e un caso di AC 25. Nient'altro.

> ✅ **DECISIONE (2026-11-01, sessione principale): A — SÌ**, per R-19-k (la quota è dovuta anche dagli istruttori): MEMBERSHIP si valuta per la persona **e** per l'istruttore del volo. Vale anche per la 19.10.

**Q-19.9-b — Modificando un volo, quando compare l'avviso sul saldo?**

R-19-g: «saldo insufficiente = il saldo non copre il costo del volo». In modifica il saldo va letto **al netto dell'addebito attuale** del volo (altrimenti il volo pagherebbe due volte). Resta da decidere se l'avviso compare anche quando la modifica **non** aumenta l'importo.

| Opzione | Effetto | Esempio (pilota a −20 € dopo un volo da 100 €, si corregge il numero di atterraggi) |
|---|---|---|
| A | Sempre (salvo volo senza addebito): avviso se saldo + addebito attuale < nuovo costo. | Avviso «saldo 80 €, costo 100 €» su una correzione che non sposta un centesimo; l'admin clicca «Procedi comunque» e il volo prende il timbro di deroga. |
| **B (raccomandata)** | Solo se la modifica **cambia chi paga** o **aumenta l'addebito**; il confronto resta al netto dell'addebito attuale. | Nessun avviso: la correzione non chiede soldi nuovi. Se invece i minuti salgono a 150 €, avviso «saldo 80 €, costo 150 €». |

> Raccomando B per lo stesso principio della ratifica R-14.4-b («correggere non è registrare di nuovo»: una correzione che non cambia chi/quando non riapre i controlli e non lascia un timbro di deroga finto). Con A: in AD-3 `balance` è `null` solo con `noCharge` (via la condizione sul costo), sempre con `creditCents` = addebito attuale se la persona non cambia; cambiano AC 11 (ultimo punto) e un caso di AC 25. Nient'altro.

> ✅ **DECISIONE PO (2026-11-01): A — SEMPRE** (contro la raccomandazione). In modifica il check sul saldo si rifà **sempre**, come se il volo fosse nuovo, **al netto dell'addebito attuale** del volo in modifica (credito = addebito attuale se la persona non cambia, 0 se cambia), anche quando la modifica non aumenta l'importo né cambia chi paga; resta saltato solo per il volo senza addebito (A9). Applicato in D-8 (c), AD-3, AC 11 (c), sonda §4.3-i.

Le altre scelte (§0.3) non sono assunzioni di dominio nuove: ognuna discende da una ratifica chiusa o da un vincolo tecnico, e la sessione principale può riaprirle col PO prima del dispatch.

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che, quando registro o modifico un volo, l'app controlli **tutti** i requisiti — scadenze (anche dell'istruttore), currency per i voli solisti, saldo che copra il costo, quota associativa — e me li mostri **in un solo avviso** con l'elenco dei problemi e un bottone **«Procedi comunque»**, senza dover scrivere una motivazione,

so that nessun volo passi senza che io lo sappia (punto PO 11, FR-21), ma nessun volo resti impossibile da registrare: la decisione è mia e consapevole (R-19-h), e il registro non si riempie di badge e motivazioni (A10).

### Il perché

Oggi la registrazione volo controlla **solo** i documenti bloccanti (scaduti e mancanti, persona e istruttore — `flights.service.ts:801-846`) e il velivolo fuori servizio (`:647-703`), con **due** codici d'errore diversi (`FLIGHT_BLOCKED_BY_EXPIRY`, `AIRCRAFT_OUT_OF_SERVICE`) e una deroga che pretende un **motivo obbligatorio** (`schemas/flights.ts:111-117`) e lascia un **badge «Deroga» col motivo** nel registro (`logbook-console.tsx:366-380`) e nel riepilogo (`flight-editor.tsx:878-894`). Il saldo **non** è controllato (decisione D1 della 14.4: solo un segnale dopo la registrazione, `:1227-1228`), la quota nemmeno, la currency non esiste (arriva con la 19.7a, senza check). Il PO ha ratificato il contrario: **quattro** check, **un** avviso, deroga **solo admin**, **niente** motivazione, **niente** badge (R-19-g/h/i/j/k, §4.4). La 19.10 farà lo stesso sulle prenotazioni con lo **stesso** servizio e lo **stesso** formato.

C'è anche un difetto noto da chiudere (16.4, ratifica R-16-c): un tipo di scadenza **disattivato** blocca ancora chi ce l'ha scaduto, perché la scansione degli scaduti non filtra `isActive` (`bookings.service.ts:469-472`, riusata dai voli a `flights.service.ts:425`, `:431`).

### Fatti misurati che vincolano il design (su `eef77ef`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Due codici derogabili, due rami UI, due forme di `details` | `FLIGHT_BLOCKED_BY_EXPIRY` `{ documents }` (`flights.service.ts:840-844`); `AIRCRAFT_OUT_OF_SERVICE` `{ reason, outOfServiceUntil, documents? }` (`:698-702`); due rami nel form (`flight-editor.tsx:685-737`) | **un** codice, **una** lista (D-2) |
| Lo **stesso** codice `AIRCRAFT_OUT_OF_SERVICE` è derogabile sui voli e **non** sulle prenotazioni | voli: `:684` (`!input.force`); prenotazioni: 422 secco (`bookings.service.ts:727`, `:1112`, `:1371`); CR §4.4: «restano non derogabili … velivolo fuori servizio **sulle prenotazioni**» | sui voli il fuori servizio entra nell'elenco (D-2): «REQUIREMENTS_NOT_MET ⇒ derogabile, ogni altro 4xx ⇒ no» diventa una regola senza eccezioni per i client (Flutter) |
| Lo scan documenti è chiamato da **due** punti per lo stesso volo | `scanBlockingDocuments` a `:693` (dentro il ramo fuori servizio) e `:819`; il secondo ramo esiste solo perché il primo rispondeva prima (review MAJOR-1 AOG-1a, commento `:668-681`) | con un solo elenco valutato in fondo, il doppio cammino sparisce |
| Il costo del volo si conosce **dopo** le tariffe | tariffe a `:850-863`, importo velivolo nel core `:1036-1037` (dalla 19.6 nel helper puro di scrittura); lo scan documenti oggi è **prima** delle tariffe (`:817`) | la valutazione dei check si sposta **dopo** tariffe e costo (D-3): il saldo deve confrontarsi con lo **stesso** numero che diventerà il `FLIGHT_CHARGE` |
| Scaduti senza filtro `isActive`, mancanti con | `bookings.service.ts:469-472` (`where: { personId }`); `flights.service.ts:385-388` (`isActive: true, blocksBooking: true, scope`) | 16.4 P1: il filtro entra nello scan nuovo (D-4); `findBlockingExpiredDocuments` resta per le prenotazioni fino alla 19.10 |
| Lo scan degli scaduti non ha `orderBy` | `bookings.service.ts:469` | l'ordine dell'elenco va **definito** (AD-2), o gli e2e che asseriscono la lista sono fragili |
| Il motivo è obbligatorio e mostrato | refine `schemas/flights.ts:111-117`; colonna `Flight.forceReason` (`schema.prisma:990`); DTO `forceReason` mascherato per non-admin (`flights.service.ts:167-168`, `:314`); badge e motivo (`logbook-console.tsx:366-380`, sheet `:462`, card `:414-420`); riepilogo `flight-editor.tsx:878-894` | A10/R-19-h: via colonna, campo, refine, badge, notice (D-10) |
| Il gate di deroga è un permesso dedicato | `flights.forceExpiry` (`rbac.ts:50-63`, `:79`), solo ADMIN; il 403 è **prima** di ogni query (`flights.service.ts:604-606`); il nome è già falso dalla AOG-1a (copre anche il fuori servizio, commento `rbac.ts:56-62`) | rinominato `requirements.force`, condiviso con la 19.10 (D-9) |
| Il segnale saldo post-registrazione è condiviso | `balanceAlert` in `RegisterFlightResponse` (`schemas/flights.ts:206`), rettifiche (`accounts.service.ts:705`), quota (`membership.service.ts:176`); UI `flight-editor.tsx:898-914` | resta (D-11) |
| Solo l'ADMIN registra voli | `flights.manage` è solo in `ALL_PERMISSIONS` (`rbac.ts:65-80`, `:105`) | nel form volo `canForce` è sempre vero: il ramo «nessun bottone» esiste per la 19.10 (D-12) |
| Il form volo è **un** componente per desktop e mobile, montato in **tre** punti | `flight-editor.tsx` dentro `SlideOver` (pannello a tutto schermo ≤640 px); montato da `logbook-console.tsx:959`, `dispatch-flight-button.tsx:51` (Panoramica, `dashboard/page.tsx:526-535`) | il componente dell'avviso si scrive **una** volta e usa `useTranslations` (precedente `src/components/ui/date-input.tsx`): niente label da far passare per tre pagine, e i plurali ICU funzionano (D-12) |
| Gli errori liberano l'`Idempotency-Key` | `handler.ts:268-277` (`freeIdempotencyRecord` su errore); il client rigenera la chiave dopo ogni risposta (`flight-editor.tsx:627`, `:779`) | il reinvio con `force` dopo un 422 è sicuro, invariato |
| **I fixture e2e registrano voli per decine di spec** | `grep -c "api/v1/flights['\`\"]"`: 25 in `flights.spec.ts`, 5 `mobile-logbook`, 5 `aircraft-out-of-service-until`, 3 `mobile-registries`, 2 `pdf-exports`, 2 `flight-reversal`, 2 `flight-log`, 1 in altri 12 spec; più i form UI | dopo questa story **ogni** volo di una persona di fixture appena creata fallisce almeno MEMBERSHIP (mai pagata), BALANCE (saldo 0) e, se solista, CURRENCY (nessun volo): serve una regola e2e esplicita (AD-8), non un adattamento caso per caso |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.9 + §4.4)

| # | Requisito |
|---|---|
| **P1** | **Servizio unico** di valutazione dei check, riusabile dalla 19.10 per le prenotazioni (dichiarato nel suo doc-comment). |
| **P2** | Check: **EXPIRY** (scadute e mancanti, persona e istruttore, regola mediche R-19-j, tipo disattivato non blocca — 16.4); **CURRENCY** (solo voli solisti: senza istruttore, o Scuola con «solista»; X voli in Y giorni — R-19-i); **BALANCE** (il saldo non copre il costo — R-19-g; saltato per il volo senza addebito — A9); **MEMBERSHIP** (mancante o scaduta — R-19-k). |
| **P3** | Il server valuta **tutti** i check; se qualcuno fallisce risponde **422 `REQUIREMENTS_NOT_MET`** con `details.failures[]` tipizzati e i dati per il messaggio (§4.4). |
| **P4** | L'admin vede **un solo avviso** con l'elenco e **«Procedi comunque»**, che rimanda la **stessa** richiesta con `force: true`, **senza motivazione** (R-19-h). |
| **P5** | `force` da chi non ha il permesso di deroga → **403 prima di qualunque query**; la deroga è **solo admin** (R-19-h). |
| **P6** | Restano **non derogabili** le sovrapposizioni (409 `FLIGHT_OVERLAP`). |
| **P7** | Via `forceReason` (colonna, campo, refine) e il badge «Deroga»/motivo; resta solo il **timbro silenzioso** `forcedAt`/`forcedByUserId` (A10). |
| **P8** | Integrazione in **registrazione e modifica** (`POST` e `PUT /flights` della 19.6), con `excludeFlightId` per la currency e il saldo al netto dell'addebito attuale del volo in modifica. |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-g** | Saldo insufficiente = il saldo non copre il costo del volo. | D-6, AC 6. |
| **R-19-h** | Un solo avviso con l'elenco + conferma, senza motivazione e senza badge; solo admin. | P4, P5, P7, D-9, D-10, D-12. |
| **R-19-i** / **§4.5** / **A5** | Currency per piloti e allievi; volo solista = senza istruttore o Scuola «solista»; un volo con istruttore (anche Turismo) è sempre ammesso. | D-5. |
| **R-19-j** | Una visita valida di qualsiasi classe, per chiunque sia a bordo. | D-4: si riusa la regola della 19.7a (`getMedicalRequirementFailure`), non se ne scrive una seconda. |
| **R-19-k** / **§4.6** | Quota 12 mesi per tutti; mancante o scaduta = check fallito. | D-7, [Q-a = SÌ]. |
| **A9** | Il volo senza addebito salta il check sul saldo. | D-6. |
| **A10** | Via `forceReason` e badge; resta `forcedAt`/`forcedByUserId` non mostrato. | D-10. |
| **R-AOG-c** (AOG-1a) | Il fuori servizio sui voli è derogabile con la **stessa** conferma dei documenti, un solo timbro. | D-2: confermata e semplificata (stesso elenco). CR §4.4 la conferma (solo le prenotazioni restano non derogabili). |
| **R-14.4-b** | Una correzione che non cambia persona, istruttore e data è esente dal controllo documenti. | D-8: estesa con lo stesso principio a quota e currency; **non** al saldo (Q-19.9-b = sempre). |
| **R-16-c** (16.4, ora assorbita) | Un tipo di scadenza disattivato smette di bloccare. | D-4 (scan voli), D-13 (chip Piloti). Prenotazioni: 19.10. |
| **19.6 D-7** | In modifica il timbro si sovrascrive solo se la modifica stessa deroga. | Invariata (AC 10). |
| **Q-19.6-a = B** | Il volo senza addebito richiede comunque le tariffe. | Il costo esiste sempre; con `noCharge` il saldo semplicemente non si valuta. |

**Superati da questa story** (da non «ripristinare»): story 14.4 AC 1/2/3 per «422 `FLIGHT_BLOCKED_BY_EXPIRY`», «motivo obbligatorio», «badge Deroga + motivo visibile» (e le sue review F2 — maschera del motivo —, F10 — motivo visibile sotto il badge —, F11 — notice nel riepilogo) e la decisione **D1** («mai bloccare per saldo»); story AOG-1a AC 8/10/11 per «422 `AIRCRAFT_OUT_OF_SERVICE` sui voli, controllato **prima** della data del volo» (ora è una voce dell'elenco, valutata dopo le guardie dure) e la review MAJOR-1 per la **forma** (`details.documents` dentro il 422 del fuori servizio: ora c'è un solo elenco per costruzione); story 15.6 R-15.6-b per il chip «Deroga» della card mobile; il commento di `rbac.ts:56-62` («il nome resta `forceExpiry` deliberatamente»); la riga 16.4 di `sprint-status.yaml` per la parte voli.

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | **Servizio nuovo** `src/server/services/requirements.service.ts` con **una** funzione esportata, `evaluateRequirements` (AD-2): sola lettura, nessun attore, nessuna transazione, chiamata **prima** della transazione del chiamante. La **politica** (quali check chiedere: solista? senza addebito? modifica esente?) sta nel chiamante; il servizio valuta e restituisce l'elenco. | P1; la 19.10 ha tre percorsi di scrittura con politiche diverse (auto-prenotazione = sempre solista, R-19-l) e lo stesso elenco | dentro `flights.service.ts`: la 19.10 dovrebbe importare dal service dei voli; un servizio che decide anche la politica: due chiamanti con regole diverse lo riempirebbero di flag |
| **D-2** | **Un** codice, `REQUIREMENTS_NOT_MET` (422), `details: { failures }`. Sui voli il **fuori servizio** è il quinto tipo dell'elenco (`AIRCRAFT_OUT_OF_SERVICE`, sempre per primo, aggiunto da `flights.service.ts`, non dal servizio). Il codice 422 `AIRCRAFT_OUT_OF_SERVICE` **sparisce dai voli** (resta sulle prenotazioni, non derogabile). | §4.4 «un codice unico … un solo avviso»; R-AOG-c (derogabile, una conferma); fatto misurato: stesso codice con due derogabilità | 422 `AIRCRAFT_OUT_OF_SERVICE` a sé con `details.failures`: due codici derogabili sui voli, e un codice che è derogabile su un endpoint e non sull'altro |
| **D-3** | **Ordine**: tutte le guardie **dure** (404, `AIRCRAFT_ARCHIVED`, `PERSON_ARCHIVED`, profili, orari, data futura, Scuola/istruttore, `SOLO_REQUIRES_SCHOOL`, `INSTRUCTOR_*`, `NO_AIRCRAFT_RATE`, `NO_INSTRUCTOR_RATE`) → costo → `evaluateRequirements` → 422 o timbro → transazione (409 `FLIGHT_OVERLAP` sotto lock, invariato). | «Procedi comunque» non deve mai approdare a un errore che la deroga non copre e che era già noto; il saldo ha bisogno del costo | lasciare il fuori servizio prima della data (AOG-1a AC 8): un admin che conferma la deroga si vedrebbe poi rifiutare per `FLIGHT_DATE_IN_FUTURE` |
| **D-4** | **EXPIRY** = semantica **attuale** dei voli + 16.4: per ciascuna persona (persona del volo; istruttore se c'è) (a) tipi `kind = RATING`, `blocksBooking`, **`isActive`** con riga `Expiry` scaduta (`expiresAt < data`, il giorno di scadenza è valido) — **senza** filtro di scope, come oggi; (b) tipi `RATING` `blocksBooking` `isActive` **applicabili per scope** senza alcuna riga (persona: `ALL` + `PILOTS`/`STUDENTS` dei profili attivi; istruttore: `ALL` + `INSTRUCTORS`), come oggi; (c) il documento unico della regola mediche (`getMedicalRequirementFailure`, 19.7a D-4, scaduto o mancante). `MEMBERSHIP` non entra mai in EXPIRY. Il servizio **non** chiama `findBlockingExpiredDocuments` (resta alle prenotazioni fino alla 19.10). | R-16-c; 16.4 AD-1 (filtro nel `where` SQL, mai in JS); 16.4 §6 (filtrare gli scaduti per scope è un secondo cambio di semantica non ratificato) | applicare lo scope anche agli scaduti: decisione PO mai presa |
| **D-5** | **CURRENCY**: solo la persona del volo, solo se il volo è **solista** = `instructorPersonId === null` **oppure** (`flightType === 'SCHOOL'` ∧ `isSolo`). Data = giorno del volo (Roma). In modifica `excludeFlightId` = id del volo (il volo non conta per sé stesso). La persona è sempre soggetta (la guardia `PERSON_NOT_PILOT_OR_STUDENT` precede). | R-19-i, §4.5, A5, 19.7a D-6/D-8 | applicarla anche all'istruttore: R-19-i non lo prevede |
| **D-6** | **BALANCE**: costo = `totalAmountCents` del helper puro della 19.6 (lo **stesso** numero del `FLIGHT_CHARGE`); saldo = `SUM(amountCents)` del conto della persona (0 senza conto) + `creditCents` (addebito attuale del volo in modifica se la persona non cambia, altrimenti 0). Fallisce se saldo + credito **<** costo (uguale = coperto). Letto **prima** della transazione: una ricarica concorrente fra lettura e scrittura può rendere l'avviso inesatto — accettato, è un avviso derogabile, non un invariante (il ledger non cambia). Con `noCharge` il check non si valuta (nessuna query). | R-19-g, A9; AD-3 progetto (saldo = SUM) | valutare il saldo dentro la transazione sotto il lock del conto: spezzerebbe l'elenco in due momenti (gli altri check sono prima della transazione) e farebbe lanciare il 422 dopo il 409 |
| **D-7** | **MEMBERSHIP**: `getMembershipStatus(personId, data del volo)` della 19.7a; `missing`/`expired` = voce. Per la persona **e** per l'istruttore (Q-19.9-a = SÌ). Data di riferimento: il giorno del volo (`membershipDateOnly`, AD-2). | R-19-k, §4.6 | — |
| **D-8** | **Modifica** (`PUT`): (a) se persona, istruttore e data **non cambiano** (`isIdentityUnchanged`, R-14.4-b) non si valutano né EXPIRY né MEMBERSHIP; (b) la CURRENCY si valuta se il volo nuovo è solista **e non** (stessa persona ∧ stessa data ∧ volo originale già solista); (c) **[Q-b = SEMPRE, PO]** il BALANCE si valuta **sempre** (salvo `noCharge`), al netto dell'addebito attuale se la persona non cambia; (d) fuori servizio: esente se il velivolo non cambia (invariato, AOG-1a AD-4). | R-14.4-b esteso con lo stesso principio a quota e currency (dipendono solo da chi e quando); il saldo per decisione PO Q-19.9-b | rivalutare tutto a ogni modifica: una correzione degli atterraggi di un volo di sei mesi fa riaprirebbe la currency di allora |
| **D-9** | **Deroga**: body `force?: boolean`, nessun motivo. Permesso rinominato **`flights.forceExpiry` → `requirements.force`** (solo ADMIN); dalla 19.10 anche gate del `force` delle prenotazioni e dell'addebito quota (suo AD-1/AD-10). 403 se `force` senza permesso, **prima di qualunque query** (posizione invariata). Timbro `{ forcedAt, forcedByUserId }` **solo** se l'elenco non è vuoto **e** `force`; mai con un `force: true` che non aveva niente da derogare. | R-19-h, P5, A10; il nome attuale è falso dalla AOG-1a | tenere `flights.forceExpiry`: un nome sbagliato per quattro check e due domini |
| **D-10** | Via la colonna `Flight.forceReason` (migrazione) e il campo `forceReason` dal DTO (con la maschera per non-admin, `toListItem` terzo parametro). **`forcedAt` resta nel DTO** (`FlightListItem`, `flightListItemSchema`): A10 chiede che il timbro non sia **mostrato in UI**, e la UI smette di leggerlo; il DTO è il contratto API, come per `bookingItemSchema.forcedAt` che la 19.10 tiene. `Booking.forceReason` è della 19.10 (toglierlo qui romperebbe il codice prenotazioni fra le due story). | A10; modifica chirurgica; stessa scelta della 19.10 sul `Booking` | togliere anche `forcedAt` dal DTO: churn di contratto senza requisito, e due domini con due regole |
| **D-11** | `balanceAlert` **resta** (campo e riga nel riepilogo, invariati). | È un fatto **dopo** la registrazione (saldo in rosso), non un avviso da confermare; scatta anche dove il check non c'è (volo senza addebito con saldo già negativo; modifica che riduce il costo ma lascia il rosso); è nel contratto condiviso con rettifiche e quota; l'email al pilota (soglia, `bandWorsened`) è un'altra funzione e resta | toglierlo: rottura del contratto API per zero semplificazione |
| **D-12** | **UI**: componente condiviso `src/components/dashboard/requirements-warning.tsx` (elenco + «Procedi comunque» / «Annulla»), testi da `useTranslations('Requirements')` (plurali ICU), formatter puro `src/lib/requirement-failures.ts` (voce → chiave + valori, testato a unità). Con `canProceed = false` l'elenco compare senza bottoni (ramo per la 19.10; nel form volo irraggiungibile, dichiarato). **Guardia del corpo stantio**: cambiare un campo dopo l'avviso lo chiude. | P4; lezione MAJOR-1 AOG-1a (la deroga copre solo ciò che è stato **visto**); il componente serve tre montaggi oggi e i form prenotazione domani | label passate come prop da `logbook/page.tsx` e `dashboard/page.tsx`: impossibile il plurale ICU con `.replace`, e la 19.10 rifarebbe l'idraulica |
| **D-13** | Il chip «documento bloccante» della pagina Piloti (`listBlockingExpiriesByPerson`) esclude i tipi RATING disattivati. | 16.4 AD-2 #6 nota (d): un chip che dice «bloccato da» un documento che non avvisa più è la stessa bugia di F5 | lasciarlo: 16.4 chiusa a metà |
| **D-14** | Le altre metà della 16.4 **non** sono dei voli e **non** si fanno qui: alert job e contatori Scadenze (persone archiviate, tipi disattivati — 16.4 P2) e il fold-in di «oggi» UTC → Roma (16.4 P5). Restano come **TD-19.9-a/b** (§7), senza casa assegnata. | CR §4.3: la 16.4 è assorbita per le **scansioni bloccanti** | farle qui: perimetro non ratificato per questa story |
| **D-15** | `seed-demo.ts` registra i voli storici con `force: true`: sono dati di prova, non operatività; senza, il primo volo solista di ogni pilota demo fallirebbe la currency per costruzione. | La 19.6 AD-4 (registrazione via service reale) | ordinare i voli demo per rendere tutti in regola: dati costruiti per aggirare i check |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA migrazione forward, dopo l'ultima presente (19.8 o successiva)

`prisma/migrations/<ts>_flight_drop_force_reason/migration.sql`, commento in testa (story, R-19-h, A10): `ALTER TABLE "Flight" DROP COLUMN "forceReason";` (generata con `prisma migrate dev --create-only`). `schema.prisma`: via `forceReason` (`:990`); doc-comment di `forcedAt` (`:979-986`) riscritto: «timbro silenzioso (A10): `forcedAt`/`forcedByUserId` valorizzati insieme, solo quando `resolveFlightInput` ha derogato almeno un requisito (`REQUIREMENTS_NOT_MET`) con `force: true` e il permesso `requirements.force`; mai mostrato in UI (resta nel DTO come dato API, D-10); in modifica si sovrascrive solo se la modifica stessa deroga»; doc della relazione `User` (`:438`) allineato. Verifica su DB gemello (mai su `airmanager` con un arbitro vivo): conteggi `Flight` prima/dopo identici, `\d "Flight"` senza la colonna, `migrate diff` vuoto, catena da zero verde.

### AD-2 — Contratto del servizio (concordato con la 19.10)

```ts
// src/server/services/requirements.service.ts — read-only, no actor, called BEFORE the caller's transaction.
export type RequirementFailure =
  | { type: 'EXPIRY'; role: 'person' | 'instructor'; personName: string; typeName: string; expiresAt: string | null } // null = missing
  | { type: 'MEMBERSHIP'; role: 'person' | 'instructor'; personName: string; expiresAt: string | null }              // null = never paid
  | { type: 'CURRENCY'; role: 'person'; personName: string; lastFlightDate: string | null; daysSinceLastFlight: number | null;
      flightsInWindow: number; minFlights: number; windowDays: number }
  | { type: 'BALANCE'; role: 'person'; personName: string; balanceCents: number; costCents: number } // balanceCents = SUM + creditCents
  | { type: 'AIRCRAFT_OUT_OF_SERVICE'; registration: string; reason: string | null; outOfServiceUntil: string | null }; // flights only, built by the caller

export type RequirementsInput = {
  expiryDateOnly: string;                                             // YYYY-MM-DD (Rome): reference day of EXPIRY (flight/booking day)
  membershipDateOnly: string;                                         // YYYY-MM-DD (Rome): reference day of MEMBERSHIP (flights: flight day; bookings: today, Q-19.10-a = B)
  person: { id: string; name: string; hasActivePilot: boolean; hasActiveStudent: boolean; hasActiveInstructor: boolean }; // scopes for the MISSING scan
  instructor: { personId: string; name: string } | null;
  documents: boolean;                                                 // EXPIRY + MEMBERSHIP
  currency: { dateOnly: string; excludeFlightId: string | null } | null; // null = not evaluated; dateOnly = reference day (flights: flight day; bookings: today)
  balance: { costCents: number; creditCents: number } | null;         // null = not evaluated
};

export async function evaluateRequirements(input: RequirementsInput): Promise<RequirementFailure[]>;
```

- **Ordine deterministico** dell'output: EXPIRY della persona, EXPIRY dell'istruttore, MEMBERSHIP della persona, MEMBERSHIP dell'istruttore [Q-a = SÌ], CURRENCY, BALANCE. Dentro EXPIRY di una persona: scadute per `typeName` crescente, poi mancanti per `typeName` crescente, poi l'eventuale documento medico. `AIRCRAFT_OUT_OF_SERVICE` lo antepone il chiamante.
- **Date per check** (Q-19.10-a = B, PO 2026-11-01: sulle prenotazioni currency e quota si valutano a **oggi**, i documenti al giorno del volo): EXPIRY usa `expiryDateOnly`, MEMBERSHIP `membershipDateOnly`, CURRENCY `currency.dateOnly`; tutte **obbligatorie** (nessun predefinito che copra un chiamante distratto, lezione 10.1). I voli passano il giorno del volo a tutte e tre.
- Le date sono stringhe `YYYY-MM-DD`; `daysSinceLastFlight` = giorni fra `lastFlightDate` e `currency.dateOnly` (aritmetica su date-only, `src/lib/date-only.ts`/`zoned-time.ts`, mai `new Date(string)` grezzo); `minFlights`/`windowDays` sono quelli **usati** per la valutazione (da `getCurrencyStatus` se li restituisce, altrimenti da `getCurrencySettings()`: misurarlo al T0).
- `person.hasActive*` dicono quali ambiti valgono per i tipi **mancanti** della persona in **questo** slot: i voli passano sempre `hasActiveInstructor: false` per la persona del volo (vola come pilota/allievo: semantica invariata, `flights.service.ts:426-430`); la 19.10 lo usa per la persona solo-istruttore di una prenotazione. L'istruttore è sempre scansionato con `ALL` + `INSTRUCTORS`.
- Query: EXPIRY con il filtro nel `where` (D-4), le letture per persona sequenziali come oggi; nessuna query per i blocchi a `false`/`null` (unit: mock non chiamati). **Nessun** parametro `client`/`tx`: tutte le letture su `prisma` (come `findBlockingExpiredDocuments` oggi dentro la transazione di approvazione), coerenti con le funzioni della 19.7a che il servizio chiama e che non accettano un client; la 19.10 lo sa (il suo AD-1 lo ammette).
- Doc-comment del modulo: contratto, ordine, «la politica sta nel chiamante», «riusato dalla 19.10 per create/update/approve delle prenotazioni».
- **Errore**: `throwRequirementsNotMet(failures: RequirementFailure[]): never`, esportato dallo stesso modulo e usato da voli, quota e prenotazioni = `throw new ValidationError('Requirements not met: <tipi>.', { failures }, 'REQUIREMENTS_NOT_MET')`.
- **Zod condiviso** `src/lib/schemas/requirements.ts`: `requirementFailureSchema` (`z.discriminatedUnion('type', …)`) e `requirementsNotMetDetailsSchema = z.object({ failures: z.array(requirementFailureSchema) })`, registrati **una volta** nell'OpenAPI (`RequirementFailure`, `RequirementsNotMetDetails`). Il tipo TS del servizio è `z.infer` di quello schema (una sola fonte). ⚠️ il file non importa `@/lib/env`.

### AD-3 — Integrazione in `resolveFlightInput` (registrazione e modifica)

Dopo tariffe e costo (D-3), al posto dei due rami attuali (`:647-703` e `:801-846`), che spariscono con `scanBlockingDocuments`, `findMissingBlockingDocuments`, `FlightBlockingDocument` e l'import di `findBlockingExpiredDocuments`:

```ts
const solo = instructorPersonId === null || (input.flightType === 'SCHOOL' && input.isSolo);
const samePerson = original !== undefined && original.personId === input.personId;
const sameDate = original !== undefined && original.flightDate.getTime() === flightDate.getTime();
const originalSolo = original !== undefined && (original.instructorPersonId === null || (original.flightType === 'SCHOOL' && original.isSolo));
const failures: RequirementFailure[] = [
  ...(outOfServiceBlock ? [{ type: 'AIRCRAFT_OUT_OF_SERVICE', registration, ...outOfServiceDetails(aircraft) }] : []),
  ...(await evaluateRequirements({
    expiryDateOnly: flightDay,                                          // flightDay = toDateOnlyString(flightDate)
    membershipDateOnly: flightDay,
    person: { id, name, hasActivePilot, hasActiveStudent, hasActiveInstructor: false },
    instructor: instructorPersonId === null ? null : { personId: instructorPersonId, name: instructorName },
    documents: !isIdentityUnchanged(original, input, instructorPersonId, flightDate),                       // D-8 (a)
    currency: solo && !(samePerson && sameDate && originalSolo) ? { dateOnly: flightDay, excludeFlightId: original?.id ?? null } : null, // D-5, D-8 (b)
    balance: input.noCharge ? null : { costCents, creditCents: samePerson ? original!.chargeCents : 0 }, // A9, D-8 (c) [Q-b = SEMPRE]
  })),
];
if (failures.length > 0 && !input.force) throwRequirementsNotMet(failures);
const forceStamp = failures.length > 0 ? { forcedAt: new Date(), forcedByUserId: actor.userId } : null;
```

(È la forma, non la lettera.) `OriginalFlightIdentity` (pre-letta da `updateFlight` della 19.6, AD-4 punto 2) guadagna `id`, `isSolo` e `chargeCents` = `0 - amountCents` dell'addebito attuale (relazione `charge` della 19.6; `0` per un volo senza addebito). `outOfServiceBlock` resta calcolato come oggi (`:682-683`), senza lanciare. `costCents` viene dal helper puro della 19.6, chiamato una volta: se oggi lo invoca il core dentro la transazione, si calcola il totale qui e lo si passa (mai due formule). Il 403 di `force` resta la **prima** istruzione (`:604-606`, permesso `requirements.force`). `RegisterFlightResult` invariato salvo `toListItem` senza il terzo parametro.

### AD-4 — Zod e OpenAPI

- `src/lib/schemas/flights.ts`: via `forceReason`, via `requireForceReason`/`FORCE_REASON_REFINE_ISSUE` (se la 19.6 non li ha già collassati), `force: z.boolean().optional()` con doc nuovo (deroga di `REQUIREMENTS_NOT_MET`, nessun motivo, `requirements.force`); un `forceReason` nel body viene **scartato** da Zod (non-strict, come i campi tolti dalla 19.2) — nessun 422. `flightListItemSchema`: via `forceReason` (`:182-183`); doc di `forcedAt` (`:180-181`) riscritto: timbro silenzioso di una deroga di `REQUIREMENTS_NOT_MET`, mai mostrato in UI (A10).
- `registry.ts`: registrazione dei due componenti di AD-2; descrizione di `POST /api/v1/flights` (`:949`) e di `PUT /api/v1/flights/{id}` (19.6) riscritte: i quattro check + il fuori servizio, `REQUIREMENTS_NOT_MET` con `details.failures` (rimando al componente), `force` senza motivo, 403 senza `requirements.force`, `FLIGHT_OVERLAP` non derogabile, `balanceAlert` invariato. Via ogni menzione di `FLIGHT_BLOCKED_BY_EXPIRY`, `forceReason`, `flights.forceExpiry`, «no insufficient-balance block».
- `registry.test.ts`: asserzione di presenza di `RequirementFailure` e di **assenza** di `forceReason` in `RegisterFlightRequest`.

### AD-5 — Permesso

`rbac.ts:50-63`, `:79`: `'flights.forceExpiry'` → `'requirements.force'` con commento nuovo (deroga dell'avviso unico su voli e prenotazioni, solo ADMIN, R-19-h; perché un permesso distinto da `flights.manage`/`bookings.manage.any`: la 19.10 lo usa per le prenotazioni, dove `bookings.manage.own` non deve derogare). Chiamanti: `flights.service.ts:604`, `logbook/page.tsx:87-90` (`canForceExpiry` → `canForce`), `dashboard/page.tsx:533`, prop `canForceExpiry` di `logbook-console.tsx:191-192`, `:227`, `:969`; commenti in `flight-editor.tsx:154`, `:1066`, `schemas/flights.ts:77`; test.

### AD-6 — UI

**Form volo (`flight-editor.tsx`, desktop e pannello mobile, nuovo e modifica)**
- Via: stato e sezione «Forza registrazione» (`:351-379`, `:1065-1121`: `blockedDocuments`, `blockedOutOfService`, `forceReason*`, textarea), i rami `AIRCRAFT_OUT_OF_SERVICE` e `FLIGHT_BLOCKED_BY_EXPIRY` (`:685-737`), `describeBlockingDocuments` (`:169-193`), `labels.force` e le chiavi errore orfane (`:99-112`, `:132-141`), `forcedNotice` e il blocco `flight-forced-result` (`:126-127`, `:872-894`).
- Nuovo: su 422 con `code === 'REQUIREMENTS_NOT_MET'` → `failures` dal body (stessa lettura `response.clone().json()` di oggi), `pendingBody` = il body inviato, `formError` **nullo** (l'elenco non si duplica nel banner), render di `<RequirementsWarning failures canProceed={canForce} onProceed onCancel submitting error moneyLocale />` (props: `failures`, `canProceed`, `onProceed`, `onCancel`, `submitting`, `error`, `moneyLocale`, `title?`) dove oggi c'è la sezione di deroga.
- «Procedi comunque» → stesso endpoint e metodo del submit (`POST /api/v1/flights` con la chiave di idempotenza corrente; `PUT /api/v1/flights/{id}` in modifica, senza chiave), body `{ ...pendingBody, force: true }` (con `noCharge` sempre presente, 19.6 trappola 7). Esiti: 2xx → riepilogo; 409 `FLIGHT_OVERLAP` → avviso chiuso e messaggio di sovrapposizione nel banner (comportamento E8 invariato); 404 in modifica → `notFoundError` (19.6); altro → errore generico **dentro** l'avviso (`requirements-proceed-error`), avviso aperto.
- **Guardia del corpo stantio** (D-12): qualunque cambio di valore del form (campi RHF via `watch`, e gli stati fuori RHF: velivolo, persona, istruttore, tipo, solista, senza addebito) chiude l'avviso e scarta `pendingBody`; «Annulla» idem. Nessun reinvio con dati diversi da quelli mostrati nell'elenco.
- Riepilogo: via la notice di deroga; `flight-balance-alert` invariato (D-11).

**Componente `src/components/dashboard/requirements-warning.tsx`** (client)
- Contenitore `data-testid="requirements-warning"`, stile del pannello di avviso attuale (token `--warn-soft`/`--warn`, come `:1073`, nessun colore nuovo), `tabIndex={-1}` e `aria-labelledby` sul titolo; alla comparsa riceve il focus e va in vista (`scrollIntoView({ block: 'nearest' })`): nel pannello mobile a tutto schermo l'avviso è sotto il form.
- Titolo: prop `title?: string`, predefinito `Requirements.title` (il form volo non la passa; la 19.10 passa il suo `BookingsPage.requirements.title`); `<ul>` con un `<li data-testid="requirements-warning-item" data-type={failure.type}>` per voce, nell'ordine del server; testo = `Requirements.who` (nome + ruolo) + `—` + messaggio della voce (il fuori servizio non ha persona).
- Bottoni (solo con `canProceed`): «Procedi comunque» (`requirements-proceed`, `btn primary`, disabilitato durante l'invio) e «Annulla» (`requirements-cancel`, `btn`); altezza minima 44 px sotto i 640 px (stessa regola dei bottoni del pannello). Errore: `<p role="alert" data-testid="requirements-proceed-error">`.
- Nessun testid con suffisso `-mobile` (un solo albero; `grep -rn 'data-testid\^=' e2e/` al T0 per escludere collisioni con `requirements-warning`).

**Formatter puro `src/lib/requirement-failures.ts`**: `describeRequirementFailure(failure, { formatDate, formatMoney })` → `{ who: { name, role } | null; key; values }` (chiavi di §AD-7: `EXPIRY` con `expiresAt` nullo → `expiryMissing`; `CURRENCY` senza `lastFlightDate` → `currencyNever`; fuori servizio con `outOfServiceUntil` → `outOfServiceUntil`). Nessun import di service o di `next-intl`.

**Registro (`logbook-console.tsx`, `logbook/page.tsx`)**: via la funzione residua `statusBadgeAndLineage` e la sua cella (`:354-401`, chiamata `:746` — dopo la 19.6 contiene solo il blocco deroga), `statusChip` (`:406-424`), la riga motivo dello sheet (`:462`), il badge della card (`:889`, `:923`) e dello sheet (`:507`, `:1147`), le label `forcedBadge`/`forcedDetail` (`:123-126`, `page.tsx:288-291`) (la mappatura `forcedAt` di `page.tsx:169` resta: è un campo del DTO). Verificare a 1280 che la cella liberata non lasci un buco nella griglia.

**`src/lib/mobile-logbook.ts`**: via `FlightBadgeKind` e `flightBadgeKind` (orfani) e la frase del doc di testa sul badge; i loro unit in `mobile-logbook.test.ts` si tolgono.

### AD-7 — i18n (entrambi i file; copy definitiva della 19.12)

- **Rimosse (18 per file)**: `LogbookPage.table.{forcedBadge,forcedDetail}`; `LogbookPage.editor.result.forcedNotice`; `LogbookPage.editor.force.{title,description,reasonLabel,submit,cancel,requiredReason,generic}`; `LogbookPage.editor.errors.{FLIGHT_BLOCKED_BY_EXPIRY,AIRCRAFT_OUT_OF_SERVICE,AIRCRAFT_OUT_OF_SERVICE_UNTIL,AIRCRAFT_OUT_OF_SERVICE_DOCUMENTS,documentExpiredOn,documentMissing,documentRolePerson,documentRoleInstructor}` (e le loro righe in `buildFlightEditorLabels`, `dashboard/page.tsx:757-851`, e in `logbook/page.tsx:308-400`). `outOfServiceSuffix` del picker **resta**.
- **Nuove (namespace di primo livello `Requirements`, condiviso con la 19.10)**:
  - `title` «Requisiti non soddisfatti» / «Requirements not met»; `proceed` «Procedi comunque» / «Proceed anyway»; `cancel` «Annulla» / «Cancel»; `proceedError` «Impossibile completare l'operazione. Riprova.» / «Could not complete the operation. Please try again.»
  - `who` «{name} ({role})» / idem; `role.person` «pilota/allievo» / «pilot/student»; `role.instructor` «istruttore» / «instructor»
  - `failure.expiryExpired` «{typeName}: scaduto il {date}» / «{typeName}: expired on {date}»; `failure.expiryMissing` «{typeName}: mancante» / «{typeName}: missing»
  - `failure.membershipExpired` «Quota associativa scaduta il {date}» / «Membership fee expired on {date}»; `failure.membershipMissing` «Quota associativa mai pagata» / «Membership fee never paid»
  - `failure.currency` «Currency scaduta: {flightsInWindow, plural, one {# volo} other {# voli}} negli ultimi {windowDays} giorni (minimo {minFlights}); ultimo volo il {date}, {days, plural, one {# giorno} other {# giorni}} fa» / «Currency lapsed: {flightsInWindow, plural, one {# flight} other {# flights}} in the last {windowDays} days (minimum {minFlights}); last flight on {date}, {days, plural, one {# day} other {# days}} ago»
  - `failure.currencyNever` «Currency scaduta: nessun volo registrato (minimo {minFlights, plural, one {# volo} other {# voli}} negli ultimi {windowDays} giorni)» / «Currency lapsed: no flight logged (minimum {minFlights, plural, one {# flight} other {# flights}} in the last {windowDays} days)»
  - `failure.balance` «Saldo insufficiente: saldo {balance}, costo {cost}» / «Insufficient balance: balance {balance}, cost {cost}»
  - `failure.outOfService` «Velivolo {registration} fuori servizio: {reason}» / «Aircraft {registration} out of service: {reason}»; `failure.outOfServiceUntil` «Velivolo {registration} fuori servizio fino al {date} compreso: {reason}» / «Aircraft {registration} out of service until {date} inclusive: {reason}»

### AD-8 — Regole e2e (blast radius: §3.6)

Dopo questa story una persona di fixture appena creata, su un volo con addebito, fallisce **sempre** MEMBERSHIP e BALANCE (e CURRENCY se solista): il comportamento è deterministico, quindi le regole lo sono.

| # | Caso | Regola |
|---|---|---|
| **E-R1** | Volo creato via API come **fixture** (non è ciò che il test verifica), incluso `registerFlightOn` (19.7a) | body con `force: true` (admin). Via ogni `forceReason` dai fixture. |
| **E-R2** | Registrazione/modifica **da UI** il cui soggetto non è l'avviso | helper `submitPastRequirements(page)` in `e2e/helpers.ts`: asserisce `requirements-warning` visibile e clicca `requirements-proceed`. **Non** condizionale (un helper «se compare, clicca» nasconderebbe una regressione). Dove il fixture è in regola per costruzione (sotto), niente helper. |
| **E-R3** | Test che asserivano `FLIGHT_BLOCKED_BY_EXPIRY`/`AIRCRAFT_OUT_OF_SERVICE` su un volo | `REQUIREMENTS_NOT_MET` + `expect.arrayContaining([expect.objectContaining({ type, … })])` sulla voce che interessa; uguaglianza dell'**intero** elenco solo con fixture «in regola» (sotto). |
| **E-R4** | Test sulla deroga UI (`force-flight-*`, motivo vuoto rifiutato, badge, notice) | riscritti su `requirements-*`; spariscono le asserzioni sul motivo e sul badge, al loro posto l'**assenza** (`flight-forced-badge` count 0). |
| **E-R5** | Fixture «in regola» (serve agli AC dei check da soli) | helper `ensureFlightRequirements(page, { personId, scope, topUpCents })` in `e2e/helpers.ts`: `ensureValidSeedExpiries` + ricarica (`POST /api/v1/people/{id}/account/top-ups`) + quota (`POST /api/v1/people/{id}/membership-fee`, dopo la ricarica: nessun override). La currency si costruisce nel test (un volo `force: true` con `noCharge: true` nella finestra: non tocca il saldo). Riusabile dalla 19.10. |
| **E-R6** | **Catalogo globale sporco** (`mobile-logbook.spec.ts:156`, classe TD 16.2-g): altri spec creano tipi RATING bloccanti in parallelo, che compaiono come EXPIRY **mancanti** (`expiresAt: null`) su qualunque persona di fixture | ogni asserzione su un elenco passa da un helper `ownFailures(failures, ownTypeNames)` che scarta le voci EXPIRY mancanti di tipi né del seed né creati dal test; le voci non-EXPIRY si asseriscono sempre esatte |

Nessuno spec nuovo muta AppSettings: X e Y restano ai predefiniti (1, 90); i casi con X > 1 sono unit della 19.7a.

---

## §2 — Acceptance Criteria

### Schema e migrazione

1. **Migrazione** (AD-1): una sola, forward, dopo l'ultima presente; `Flight` senza `forceReason`; doc-comment di `forcedAt` riscritto (nessuna menzione di motivo, `flights.forceExpiry`, «documento scaduto» come unico caso); sul gemello conteggi `Flight` identici prima/dopo, `\d "Flight"` senza la colonna, catena da zero verde, `migrate diff` vuoto (output nel record).

### Servizio unico (`evaluateRequirements`, unit con prisma e servizi 19.7a mockati)

2. **Contratto e ordine** (AD-2): con tutti i check falliti per persona **e** istruttore l'elenco è esattamente, in ordine: EXPIRY persona (scaduta, mancante, medico), EXPIRY istruttore, MEMBERSHIP persona, MEMBERSHIP istruttore [Q-a = SÌ], CURRENCY, BALANCE; con `documents: false`, `currency: null`, `balance: null` le rispettive letture **non** avvengono (mock mai chiamati) e l'elenco è vuoto; con **tre date diverse** (`expiryDateOnly`, `membershipDateOnly`, `currency.dateOnly`) ogni lettura riceve la **sua** (scan EXPIRY e `getMedicalRequirementFailure` la prima, `getMembershipStatus` la seconda, `getCurrencyStatus` la terza); nessuna scrittura, nessuna `$transaction`, nessun `authorize`.
3. **EXPIRY** (D-4): (a) RATING bloccante attivo scaduto il giorno prima della data → voce con `expiresAt`; (b) **stesso tipo disattivato** → nessuna voce (16.4); (c) `expiresAt === expiryDateOnly` → nessuna voce; (d) RATING bloccante attivo applicabile **mancante** → voce con `expiresAt: null`; disattivato o non applicabile per scope → nessuna; (e) uno scaduto di scope `PILOTS` su un allievo → voce (scaduti senza scope, come oggi); (f) una riga `MEMBERSHIP` scaduta non produce mai una voce EXPIRY; (g) il documento di `getMedicalRequirementFailure` entra **una** volta per persona, chiamato con `(personId, expiryDateOnly)`; (h) l'istruttore è scansionato con scope `ALL` + `INSTRUCTORS`; (i) ordine interno per nome come AD-2. Il filtro `isActive` è nel `where` (asserzione sull'argomento di `findMany`, 16.4 AD-1).
4. **MEMBERSHIP** (D-7): `getMembershipStatus` chiamata con `(personId, membershipDateOnly)` per la persona e per l'istruttore (Q-19.9-a = SÌ); `valid` → nessuna voce; `expired` → `expiresAt` = data; `missing` → `expiresAt: null`; `role`/`personName` corretti.
5. **CURRENCY** (D-5): `getCurrencyStatus` chiamata solo con `currency ≠ null`, con `(personId, currency.dateOnly, { excludeFlightId })` passati così come sono; current → nessuna voce; non current → voce con `lastFlightDate`, `daysSinceLastFlight` (giorni fra le due date, es. `2026-07-01` → `2026-10-01` = 92), `flightsInWindow`, `minFlights`, `windowDays`; mai volato → `lastFlightDate: null`, `daysSinceLastFlight: null`.
6. **BALANCE** (D-6): saldo `SUM` + `creditCents` **<** `costCents` → voce con `balanceCents` = SUM + credito e `costCents`; **uguale** → nessuna voce; persona senza conto → saldo 0; con `balance: null` l'aggregato non è letto.

### Registrazione e modifica volo (unit su `flights.service.ts` con `./requirements.service` mockato + e2e API)

7. **Un codice, dopo le guardie dure** (D-2, D-3): con l'elenco non vuoto e senza `force` → 422 `REQUIREMENTS_NOT_MET`, `details.failures` = l'elenco, `$transaction` mai chiamata. Precedenze nuove (unit): velivolo fuori servizio + persona archiviata → `PERSON_ARCHIVED`; fuori servizio + data futura → `FLIGHT_DATE_IN_FUTURE`; documento scaduto + nessuna tariffa → `NO_AIRCRAFT_RATE`. Il codice 422 `AIRCRAFT_OUT_OF_SERVICE` non è più emesso dai voli (grep di AC 22).
8. **Politica in registrazione** (AD-3, unit sugli argomenti di `evaluateRequirements`): `expiryDateOnly` = `membershipDateOnly` = `currency.dateOnly` = giorno di Roma del decollo (un decollo alle 00:30 di Roma resta quel giorno); `documents: true`; `currency` = `{ dateOnly, excludeFlightId: null }` per Turismo senza istruttore e per Scuola con `isSolo`, `null` per Scuola in doppio e per Turismo con istruttore (A5); `balance` = `null` con `noCharge`, altrimenti `{ costCents, creditCents: 0 }` con `costCents` **uguale** a `-amountCents` del `FLIGHT_CHARGE` scritto nella stessa chiamata (una sola formula).
9. **Fuori servizio nell'elenco** (D-2): su un velivolo fuori servizio la voce `AIRCRAFT_OUT_OF_SERVICE` (`registration`, `reason`, `outOfServiceUntil`) è la **prima**, seguita dalle altre; in modifica che tiene lo stesso velivolo non compare; che sposta su un velivolo fuori servizio compare; con `force: true` → 201/200 col timbro. e2e: `aircraft-out-of-service-until.spec.ts` riscritto su questa forma (§3.6).
10. **Deroga e timbro** (D-9): elenco non vuoto + `force: true` (admin) → 201, `Flight.forcedAt`/`forcedByUserId` valorizzati; elenco vuoto + `force: true` → 201 **senza** timbro (unit: nessun campo `forced*` nel `data` di `flight.create`); `force: true` senza `requirements.force` → `ForbiddenError` **prima di qualunque query** (unit: `prisma.aircraft.findUnique` e `evaluateRequirements` mai chiamati); un `forceReason` nel body è scartato (e2e API: 201, nessun 422); in modifica che deroga il timbro si sovrascrive, in modifica senza voci resta quello di prima (19.6 D-7, unit due casi).
11. **Politica in modifica** (D-8, unit per ramo + e2e discriminanti): (a) stessa persona, istruttore e data → `documents: false`; cambiare uno dei tre → `true`; (b) volo originale solista, stessa persona e data → `currency: null`; volo originale in doppio reso solista → `currency: { dateOnly, excludeFlightId: <id> }`; data cambiata su un solista → `{ dateOnly: <nuova data>, excludeFlightId: <id> }`; e2e: un pilota in regola (E-R5) con **un solo** volo solista (fixture `force`, `noCharge`), modificato spostandone la data al giorno **prima**, riceve la sola voce CURRENCY (il volo non conta per sé stesso; senza `excludeFlightId` sarebbe current) — sonda §4.3-a; (c) **[Q-b = SEMPRE, PO]** stessa persona → `balance: { costCents, creditCents: <addebito attuale> }` **qualunque** sia il costo nuovo (anche uguale o minore); persona cambiata → `{ costCents, creditCents: 0 }`; `noCharge` → `null`; e2e: pilota in regola con una ricarica tale che, dopo quota e volo, il saldo sia esattamente 0 → modifica che **allunga** il volo → voce BALANCE con `balanceCents` = costo vecchio e `costCents` = costo nuovo; modifica che lo **accorcia** → 200 senza avviso (coperto al netto); **discriminante della decisione PO**: pilota col saldo **negativo** dopo il volo (ricarica minore del costo, volo registrato con `force`) → modifica dei soli atterraggi (costo invariato) → voce BALANCE con `balanceCents` = saldo + addebito attuale e `costCents` = costo invariato.
12. **Senza addebito** (A9): e2e, pilota in regola salvo il saldo (E-R5 con ricarica pari alla sola quota: saldo 0 dopo l'addebito della quota) → senza `noCharge` 422 con la sola voce BALANCE; con `noCharge: true` → 201 **senza** `force` e senza timbro (lettura del timbro come in AC 18); unit: `balance: null` passato al servizio.

### UI

13. **Avviso unico** (desktop 1280): su 422 `REQUIREMENTS_NOT_MET` il form mostra `requirements-warning` con un `requirements-warning-item` per voce, nell'ordine del server, testo leggibile per ciascun tipo (`data-type` sull'item; testi asseriti **esatti** su almeno EXPIRY scaduto, MEMBERSHIP mancante, CURRENCY mai volato, BALANCE con importi formattati), titolo «Requisiti non soddisfatti», «Procedi comunque» e «Annulla»; **nessuna** textarea, nessun campo motivo, nessun duplicato dell'elenco nel banner `flight-form-error`; il focus va sull'avviso.
14. **Procedi comunque** (e2e): reinvia la stessa richiesta con `force: true` — una sola richiesta contata con `page.route`, metodo e URL come il submit (POST in registrazione, PUT in modifica), body uguale a quello del primo invio più `force: true`; esito: riepilogo `flight-result-panel` **senza** notice di deroga; con un 409 `FLIGHT_OVERLAP` sul reinvio l'avviso si chiude e il banner nomina il volo in conflitto (E8 riscritto, registrazione e modifica); con un errore di rete/500 → `requirements-proceed-error`, avviso ancora aperto.
15. **Corpo stantio** (D-12): dopo l'avviso, cambiare l'orario di atterraggio, oppure accendere il toggle «Senza addebito», chiude l'avviso (count 0) e nessuna richiesta parte finché non si preme di nuovo «Registra»; «Annulla» chiude l'avviso senza richieste.
16. **Mobile 375** (pannello a tutto schermo): stesso avviso in fondo al form, portato in vista e col focus; voci che vanno a capo senza overflow orizzontale (`scrollWidth ≤ clientWidth` del pannello); bottoni ≥ 44 px; «Procedi comunque» registra e mostra il riepilogo (e2e in `mobile-logbook.spec.ts`, che sostituisce i casi di `:957-1085`).
17. **Registro senza deroga visibile**: nessun `flight-forced-badge`/`flight-forced-reason` su desktop, nessun badge sulla card mobile né nello sheet, nessuna riga «Deroga» nello sheet, per un volo registrato con `force` (e2e); `grep -rnE "statusBadgeAndLineage|statusChip|flightBadgeKind|FlightBadgeKind" src` → 0; riepilogo senza `flight-forced-result`; `flight-balance-alert` presente come oggi quando il saldo dopo è negativo (D-11, test `flights.spec.ts:811` riscritto con «Procedi comunque»: il saldo che non copre è ora anche una voce BALANCE).
18. **Timbro silenzioso** (D-10): in `GET /api/v1/flights` gli item non hanno `forceReason`; `forcedAt` è valorizzato per un volo derogato e `null` per uno registrato con `force: true` senza voci (e2e API); nessuna superficie UI lo mostra (AC 17).

### Pagina Piloti, permesso, contratti

19. **Chip Piloti** (D-13): `listBlockingExpiriesByPerson` non restituisce voci per un tipo RATING disattivato (unit: filtro `isActive: true` nel `where` della parte RATING, accanto a `kind: 'RATING'` della 19.7a; le MEDICAL restano come le ha lasciate la 19.7a).
20. **Permesso** (AD-5): `grep -rn "forceExpiry" src e2e` → 0; `requirements.force` solo in `ALL_PERMISSIONS`; `ROLE_PERMISSIONS` degli altri ruoli invariati (unit rbac).
21. **OpenAPI servito**: `GET /api/v1/openapi.json` sull'app reale contiene i componenti `RequirementFailure` (cinque varianti) e `RequirementsNotMetDetails`, `REQUIREMENTS_NOT_MET` nelle descrizioni di `POST /flights` e `PUT /flights/{id}`; **non** contiene `forceReason` (né nello schema `RegisterFlightRequest` né negli item volo), `FLIGHT_BLOCKED_BY_EXPIRY`, `flights.forceExpiry`; `forcedAt` resta negli item volo.
22. **Nessun residuo** (esclusi `src/generated/`, `prisma/migrations/`, `_bmad-output/`, `docs/`; il dominio **prenotazioni** tiene i suoi `force`/`forceReason` fino alla 19.10):
    - `grep -rnE "FLIGHT_BLOCKED_BY_EXPIRY|scanBlockingDocuments|findMissingBlockingDocuments|FlightBlockingDocument|describeBlockingDocuments|forcedNotice|forcedBadge|forcedDetail|force-flight-|flight-forced-" src e2e messages` → 0;
    - `grep -nE "forceReason|findBlockingExpiredDocuments|'AIRCRAFT_OUT_OF_SERVICE'" src/server/services/flights.service.ts src/lib/schemas/flights.ts 'src/app/[locale]/dashboard/logbook/'*.tsx src/app/'[locale]'/dashboard/dispatch-flight-button.tsx` → 0;
    - `grep -rn "forceReason" e2e --include=*.ts | grep -v -i booking` → 0 (verificare a mano che le righe residue siano solo di prenotazioni).
23. **i18n** (AD-7): le 18 chiavi rimosse da **entrambi** i file, il namespace `Requirements` presente in entrambi; parità it/en 0/0 (`diff` dei percorsi `jq` vuoto, conteggio nel record); i plurali ICU rendono «1 volo» / «0 voli» / «2 voli» (unit del formatter su `values` + un e2e EN che legge una voce CURRENCY esatta).

### Seed, e2e, gate

24. **Seed**: `seed-demo.ts` passa `force: true` ai suoi `registerFlight` (D-15, commento che lo motiva); `npx prisma db seed` + `npm run seed:demo` verdi su DB fresco; `seed-load.ts` (scritture dirette, nessun `forceReason` oggi) passa il typecheck, **NON** eseguirlo.
25. **e2e nuovo** `e2e/flight-requirements.spec.ts` (fixture run-unique, nessuna scrittura di AppSettings, project `chromium` `fullyParallel`): (a) un pilota «in regola» (E-R5 + un volo `force` `noCharge` a oggi−10) registra un volo solista **senza** avviso (201, nessun timbro); a partire da quello, **ogni check da solo**: (b) EXPIRY (un RATING bloccante creato dal test, scaduto ieri) → elenco di **una** voce (dopo `ownFailures`, E-R6); (c) MEMBERSHIP (stesso fixture senza quota) → una voce `expiresAt: null`; (d) CURRENCY (senza il volo a oggi−10; e con il volo a oggi−91: `daysSinceLastFlight` 91) → una voce; (e) BALANCE (ricarica che dopo la quota lascia meno del costo) → una voce coi due importi; (f) **combinato**: persona appena creata senza nulla, volo Scuola solista con istruttore senza visite e senza quota → dopo `ownFailures` (E-R6) l'elenco è esatto nell'ordine di AD-2: EXPIRY persona (visita mancante + i RATING bloccanti del seed applicabili), EXPIRY istruttore (idem), MEMBERSHIP persona, MEMBERSHIP istruttore [Q-a = SÌ], CURRENCY, BALANCE; (g) volo **in doppio** della stessa persona non current → nessuna voce CURRENCY; (h) `force` → 201; (i) pilota: `POST` con `force: true` → 403; (j) AC 11 (b) e (c), AC 12. UI: AC 13-16 (desktop e 375).
26. **e2e esistenti** riscritti secondo AD-8 e §3.6; delta dei test dichiarato (prima/dopo, nuovi/cancellati/riscritti); arbitro completo verde su DB fresco via `scripts/e2e.sh` (lo esegue la sessione principale; il dev dichiara gli spec mirati verdi).
27. **Gate**: `npm run gates` verde; ogni file di test nuovo o toccato passa anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` (`requirements.service.ts` trascina `currency.service` → `app-settings` → crypto → env e `membership.service` → `accounts.service` → mail: mockare la catena).
28. **Verifica UI** (Playwright MCP o script throwaway in /tmp): screenshot 1280 e 375, tema chiaro e scuro, di: avviso con almeno quattro voci (incluso il fuori servizio), avviso con errore di reinvio, riepilogo dopo «Procedi comunque», registro e card senza badge, avviso nel form in modifica; nessun overflow orizzontale, `.so-foot` invariato.
29. **Residui della 16.4** (D-14): nessuna riga di codice su alert job, contatori Scadenze e «oggi» UTC; il record ricontrolla sul HEAD i call-site di TD-19.9-a/b (§7) e ne aggiorna le righe.

---

## §3 — Dev Notes: blast radius (misurato su `eef77ef`; rieseguire dopo 19.3-19.8)

### 3.1 — Schema e migrazione
`prisma/schema.prisma:436-438` (doc relazioni `User`), `:979-990` (`forcedAt`/`forcedByUserId`/`forceReason` del `Flight`). ⚠️ `Booking.forcedAt/forceReason` (`:1114-1123`) **non** si toccano (19.10).

### 3.2 — Server
- **Nuovo** `src/server/services/requirements.service.ts` (+ test).
- `src/server/services/flights.service.ts`: import `:14` (resta `hasNegativeBalanceAlert`, D-11), `:19` (via `findBlockingExpiredDocuments`), modulo doc `:24-126` (paragrafo sulla deroga), `FlightListItem` `:166-168` (via `forceReason`, doc di `forcedAt` riscritto), `RegisterFlightResult` doc `:174-186`, `FLIGHT_SELECT` `:210-214` (via `forceReason`), `SelectedFlight` `:245-246`, `toListItem` `:256-314` (via il terzo parametro), `FlightBlockingDocument` `:318-334` (via), `OriginalFlightIdentity` `:341` (+ `id`, `isSolo`, `chargeCents`), `ResolvedFlightInput.forceStamp` `:357-358` (senza motivo), `findMissingBlockingDocuments`/`scanBlockingDocuments` `:361-441` (via, logica spostata nel servizio), `isIdentityUnchanged` `:481-509` (resta), doc di `resolveFlightInput` `:511-588` (riscritto: ordine D-3, avviso unico, esenzioni D-8), 403 `:595-606`, ramo fuori servizio `:647-703` (resta il calcolo di `outOfServiceBlock`, via il `throw` e lo scan), ramo documenti e timbro `:801-846` (→ AD-3, dopo le tariffe `:848-863`), core `:994-995` e `:1062-1065` (timbro senza motivo), doc di `assertNoOverlappingFlight` `:922-933` (via «unlike FLIGHT_BLOCKED_BY_EXPIRY/AIRCRAFT_OUT_OF_SERVICE», resta «NOT derogable»), `listFlights` `:1715-1717` (via `includeForceReason`). Dopo la 19.6: `updateFlight` (pre-lettura con `id`, `isSolo`, addebito attuale) e il helper di scrittura.
- `src/server/services/expiries.service.ts`: `listBlockingExpiriesByPerson` (D-13, righe dopo la 19.7a).
- `src/server/auth/rbac.ts:50-63`, `:79` (AD-5).
- `src/server/services/bookings.service.ts`: **nessuna modifica** (resta `findBlockingExpiredDocuments`, 19.10).

### 3.3 — Zod e OpenAPI
**Nuovo** `src/lib/schemas/requirements.ts`. `src/lib/schemas/flights.ts:75-117` (doc + `force`/`forceReason` + refine), `:180-183` (item), `:197-206` (doc di `registerFlightResponseSchema`: `balanceAlert` invariato). `src/lib/schemas/registry.ts:273`, `:949` (+ la descrizione del `PUT` della 19.6), registrazione dei componenti; `registry.test.ts`.

### 3.4 — UI
| File | Righe (eef77ef) | Cosa |
|---|---|---|
| `logbook/flight-editor.tsx` | header `:3-21`; labels `:97-142`; `canForce` `:154-155`; `describeBlockingDocuments` `:169-193`; stato deroga `:351-379`; `resetForceState` nei submit `:567`; lettura errore `:629-741`; `onForceSubmit` `:748-806`; riepilogo `:872-914`; sezione `:1065-1121` | AD-6 |
| `components/dashboard/requirements-warning.tsx` | nuovo | AD-6 |
| `src/lib/requirement-failures.ts` | nuovo (+ test) | AD-6 |
| `logbook/logbook-console.tsx` | labels `:123-126`; prop `:191-192`, `:227`; `statusBadgeAndLineage` `:354-401` e chiamata `:746`; `statusChip` `:406-424`; doc sheet `:424-434`; `:462`; `:507`; `:889`, `:923`; `:969`; `:1131` (commento), `:1147` | AD-5, AD-6 |
| `logbook/page.tsx` | `:87-90`; `:169`; `:288-291`; `:308-400` | AD-5, AD-6, AD-7 |
| `dashboard/page.tsx` | `:533`; `buildFlightEditorLabels` `:757-851` | AD-5, AD-7 |
| `dispatch-flight-button.tsx` | `:30`, `:61` (prop `canForce`, solo doc se serve) | — |
| `src/lib/mobile-logbook.ts` | `:13-35` | AD-6 |
| `src/styles/airops.css` | solo se il pannello attuale (stili inline `:1073`) non basta: un blocco con commento di story, solo token esistenti | — |

### 3.5 — Seed
`prisma/seed-demo.ts:433-453` (`registerFlight` → `force: true`, D-15). `seed.ts`, `seed-load.ts`: nessuna modifica attesa (verificare con `grep -n "force" prisma/seed*.ts`).

### 3.6 — Blast radius e2e (comando: `grep -rnE "api/v1/flights['\`\"]|registerFlightOn|flight-form|force-flight|flight-forced|forceReason|force: true|FLIGHT_BLOCKED_BY_EXPIRY|AIRCRAFT_OUT_OF_SERVICE|flight-balance-alert|forcedAt" e2e`)

| Spec | Punto (eef77ef) | Destino |
|---|---|---|
| `helpers.ts` | `:13-77` doc di `ensureValidSeedExpiries` (cita `findMissingBlockingDocuments`); `registerFlightOn` (19.7a) | doc riscritto; `registerFlightOn` con `force: true` (E-R1); nuovi `ensureFlightRequirements` (E-R5), `submitPastRequirements` (E-R2) |
| `flights.spec.ts` | registrazioni UI `:224`, `:284`, `:393`, `:457`, `:527`, `:576` e seguenti; describe «Blocking expiry guard-rail» `:677-850` (`:691`, `:752`, `:781`, `:811`); 16.2 `:863-1250` (E1-E8, fixture API) | E-R2 sulle UI; `:691`/`:781` → E-R4 (avviso, voce EXPIRY persona/istruttore, nessun badge); `:752` senza `forceReason`; `:811` → AC 17; E1-E7 E-R1; **E8** `:1148` → AC 14 (409 sul reinvio) |
| `aircraft-out-of-service-until.spec.ts` | `:259-…` (i tre 422 arricchiti: **solo** la parte voli cambia), `:410-430`, `:462`, `:489-504` (controllo documenti vs fuori servizio + documenti), `:529`, `:568`, `:615-617` (`forcedAt` nullo dopo una modifica sullo stesso velivolo), `:633` | voli → `REQUIREMENTS_NOT_MET` con la voce `AIRCRAFT_OUT_OF_SERVICE` prima (AC 9); prenotazioni invariate; `:615-617` resta valido (AC 10, 18) |
| `mobile-logbook.spec.ts` | fixture `:156-171` (`force`+`forceReason`); deroga dal telefono `:956-1007`; idempotenza col force `:1083-1085` | E-R1; AC 16; il caso idempotenza riscritto sul reinvio con «Procedi comunque» (chiave nuova dopo il 422, una sola riga) |
| `mobile-registries.spec.ts` | `:272-273`, `:535-536` | E-R1 |
| `mobile-settings.spec.ts` | `:572-621` (tipo bloccante creato dal telefono → `FLIGHT_BLOCKED_BY_EXPIRY`) | E-R3: voce EXPIRY con quel `typeName` |
| `aog-impact-email.spec.ts` | `:135` (commento) | riformulare |
| `flight-delete-update.spec.ts` (19.6), `flight-log`, `pdf-exports`, `exports`, `reports`, `person-detail`, `people-management`, `my-compensation`, `my-account`, `mobile-self-public`, `mobile-reports`, `login`, `instructor-compensation`, `billing`, `flight-no-charge` (19.6), gli spec nuovi della 19.7a/19.7b che usano `registerFlightOn` | registrazioni di fixture via API | E-R1 (una riga ciascuno); se uno registra **da UI**, E-R2 |
| `typeahead-pickers`, `mobile-primitives`, `mobile-ink-targets` | aprono il form volo | verificare: se non inviano, nessuna modifica |
| **nuovo** `e2e/flight-requirements.spec.ts` | AC 11-16, 25 | — |

Nessuno spec nuovo entra nella catena serializzata (nessuna scrittura di AppSettings, nessun aggregato globale).

### 3.7 — Unit esistenti che cambiano
- `flights.service.test.ts`: mock di `./bookings.service` (`:98-106`) → mock di `./requirements.service` (`evaluateRequirements`); describe «blocking expiry guard-rail» (`:1181-1330`) → «requirements» (politica di AC 7-11, timbro, 403); i casi fuori servizio `:390-441` → voce nell'elenco e nuove precedenze (AC 7, 9); `registerFlightSchema` con `forceReason` (`:1277-1290`) → scartato; `toListItem` senza `forceReason`.
- `flights-expiry-boundary.integration.test.ts`: il confine «valido alla data del volo, scaduto oggi» si riscrive sullo scan **reale** del servizio nuovo (prisma mockato, currency/membership/saldo mockati) — stesso scopo della review F8 14.4.
- `mobile-logbook.test.ts` (via `flightBadgeKind`), `rbac` test (permesso), `exports.service.test.ts:862`, `:908` (fixture: via `forceReason` se sono item volo), `expiries.service.test.ts` (AC 19), `registry.test.ts`.
- **Nuovi**: `requirements.service.test.ts` (AC 2-6), `src/lib/requirement-failures.test.ts` (AC 23 e mappatura chiavi).

### 3.8 — Riepilogo prestazioni
Per volo: EXPIRY = per persona 2 `findMany` + 1 lettura medica (come oggi, che erano 3 per persona fra le due scansioni), MEMBERSHIP 1, CURRENCY 1 `$queryRaw` (19.7a) + 1 lettura impostazioni, BALANCE 1 `aggregate`. Tutte su indici esistenti (`Expiry_personId_…`, `AccountMovement_accountId_…`); nessun indice nuovo. Nessuna misura richiesta: `scripts/perf/targets.json` misura solo i `GET` dei voli (`:11-12`, `:26`), mai la registrazione.

---

## §4 — Piano di test

### 4.1 — Unit
Come §3.7: servizio (AC 2-6) con `prisma`, `./currency.service`, `./membership.service`, `./expiries.service`, `./app-settings.service` mockati; politica dei voli (AC 7-12) con `./requirements.service` mockato; formatter (AC 23); rbac (AC 20); chip Piloti (AC 19).

### 4.2 — e2e (`fullyParallel`, fixture run-unique, `scripts/e2e.sh`)
Mirati da far girare prima della consegna: `flight-requirements`, `flights`, `aircraft-out-of-service-until`, `mobile-logbook`, `mobile-registries`, `mobile-settings`, `flight-delete-update`, `flight-no-charge`, `flight-log`, più ogni spec toccato da E-R1. Date da `todayRome()`/`addDaysIso()`; tariffe nel passato via `seedAircraftRate`/`seedInstructorRate` (19.3); celle e voci asserite in modo esatto (mai `hasText` con importi, date o «0 voli», lezione 11.2). Ripetere run mirati sullo stesso DB fa scattare il lock anti-brute-force (CLAUDE.md, TD-6): resettare prima di attribuire un rosso alla flake di login.

### 4.3 — Discriminanza e sonde (obbligatorie nel Dev Agent Record, ripristino byte-identico con sha256)
- **(a) `excludeFlightId`**: passare `null` al posto dell'id in modifica → l'e2e di AC 11 (b) e il suo unit **rossi** (il volo conterebbe per sé stesso).
- **(b) Senza addebito**: valutare il saldo anche con `noCharge` → AC 12 **rosso**.
- **(c) Timbro fantasma**: timbrare quando `force` è vero a prescindere dall'elenco → unit di AC 10 **rosso**.
- **(d) 16.4**: togliere `isActive: true` dallo scan degli scaduti → unit AC 3 (b) **rosso**.
- **(e) 403 tardivo**: spostare il controllo del permesso dopo la lettura del velivolo → unit AC 10 **rosso**.
- **(f) Confine del saldo**: `<=` al posto di `<` → unit AC 6 «uguale» **rosso**.
- **(g) Corpo stantio**: togliere la chiusura dell'avviso al cambio di campo → e2e AC 15 **rosso**.
- **(h) Ordine**: valutare i check prima delle tariffe → unit AC 7 «documento scaduto + nessuna tariffa» **rosso**.
- **(i) Saldo sempre in modifica** (Q-19.9-b): reintrodurre la condizione «solo se il costo aumenta» → l'e2e «solo atterraggi con saldo negativo» di AC 11 (c) e il suo unit **rossi**.
- **(j) Date per check**: passare `expiryDateOnly` anche a `getMembershipStatus` → unit AC 2 «tre date diverse» **rosso**.

### 4.4 — Gate
`npm run gates` (mai i quattro comandi verbosi separati) + grep di AC 20 e 22 + parità di AC 23 + e2e mirati. **Prima** di gates, build ed e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` (mai una build sotto un arbitro vivo); migrazione e sonde **solo** sul gemello.

---

## §5 — Trappole note

1. **Il costo con due formule**: il saldo va confrontato col numero che diventa il `FLIGHT_CHARGE`. Se il helper della 19.6 gira solo dentro la transazione, si estrae il calcolo del totale e lo si usa in entrambi i punti; mai un `Math.round` copiato in `resolveFlightInput`.
2. **`instructorName!`**: oggi il nome dell'istruttore si risolve in `findActiveInstructor` (`:793-798`); il servizio lo riceve, non lo rilegge.
3. **Ordine non deterministico**: lo scan degli scaduti di oggi non ha `orderBy` (`bookings.service.ts:469`); nel servizio nuovo l'ordine di AD-2 è contratto (gli e2e combinati lo asseriscono).
4. **Doppio documento medico**: la 19.7a ha messo lo scaduto in uno scan e il mancante nell'altro; nel servizio nuovo è **una** chiamata a `getMedicalRequirementFailure` per persona — mai sommarla a una scansione MEDICAL per tipo.
5. **`MEMBERSHIP` fra i RATING**: il `where` degli scan EXPIRY porta `kind: 'RATING'`, altrimenti una quota scaduta comparirebbe due volte (EXPIRY e MEMBERSHIP).
6. **Env eager negli unit**: `requirements.service.ts` importa `currency.service` (→ `app-settings` → crypto → `@/lib/env`), `membership.service` (→ `accounts.service` → mail) ed `expiries.service`; `flights.service.test.ts` deve mockare `./requirements.service` intero. Verifica con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.
7. **`useTranslations` in un componente client**: è già usato da primitive (`date-input.tsx`); i messaggi arrivano da `NextIntlClientProvider` (`[locale]/layout.tsx:93`). I plurali ICU vanno passati come valori numerici, non preformattati.
8. **`formError` e avviso insieme**: con `REQUIREMENTS_NOT_MET` il banner resta vuoto, altrimenti lo screen reader legge due volte lo stesso elenco.
9. **Reinvio e chiave di idempotenza**: dopo il 422 la chiave è già rigenerata (`:627`); il reinvio usa quella nuova; in modifica nessuna chiave (19.6).
10. **`noCharge` nel reinvio**: `PUT` è una sostituzione completa (19.6 trappola 7); `pendingBody` contiene già `noCharge`, mai ricostruirlo a mano.
11. **`getByLabel`/`hasText` sono substring** (CLAUDE.md): «Procedi comunque», «Annulla» (anche nel `.so-foot` del pannello!) → selettori per testid o `{ exact: true }` dentro `requirements-warning`.
12. **Mai `Escape` dentro lo `SlideOver`** per chiudere qualcosa del form: chiude il pannello.
13. **Il fixture che fallisce «per costruzione»**: una persona appena creata fallisce sempre MEMBERSHIP e BALANCE; un test che si aspetta 201 senza `force` e senza E-R5 è sbagliato, non flaky.
14. **Prenotazioni intatte**: `findBlockingExpiredDocuments`, `Booking.forceReason`, `new-booking-form.tsx`, `bookings.manage.any` come gate del force restano come sono (19.10). Il rename del permesso tocca **solo** il dominio voli; il gate di prenotazioni e quota lo sposta la 19.10.
15. **`src/generated/prisma`** è gitignored: `npx prisma generate` dopo lo schema.
16. **Commenti storici** che citano `FLIGHT_BLOCKED_BY_EXPIRY`, `forceReason` o `flights.forceExpiry` come vivi: il grep di AC 22 li prende; vanno riformulati anche quando raccontano il passato (lezione 13.4).

---

## §6 — Fuori scope DICHIARATO

- Check e avviso sulle **prenotazioni** (create/update/approve), auto-prenotazioni soliste, stessa persona in due ruoli, `Booking.forceReason`, `findBlockingExpiredDocuments`, il gate `force` delle prenotazioni → **19.10** (che riusa AD-2, il componente e le chiavi `Requirements.*`).
- **Deroga sull'addebito della quota associativa** (`membership.service.ts`, `override` → `force`, casella «Forza addebito» → avviso, CR §4.6) → **19.10** (P8/D-11/AD-10, AC 36-39; decisione della sessione principale): la 19.10 riusa `throwRequirementsNotMet`, la voce `BALANCE` e il componente di questa story.
- Alert job, contatori Scadenze, fold-in «oggi» UTC → Roma (16.4 P2/P5) → TD-19.9-a/b (§7, D-14).
- Email di currency (A8); un log di audit delle deroghe; un permesso per tipo di check.
- Revisione delle copy nuove → **19.12**.

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§4.0 R-19-g/h/i/j/k, §4.2 righe 19.9-19.10, §4.3 16.4, §4.4, §4.5, §4.6, §4.10 A5/A9/A10).
- PRD: `prds/prd-AirManager-2026-07-04/prd.md` (FR-21 change record `:412`, FR-46 `:417`, FR-47 `:418`).
- Story: `19-6-*.md` (AD-4, AD-5, D-7, trappola 7), `19-7a-*.md` (D-4..D-8, AD-3..AD-5, §5.11-12), `19-3-*.md` (AD-4), `19-5-*.md` (AD-4), `16-4-tipo-scadenza-disattivato.md` (AD-1, AD-2), `14-4-*.md` (R4, R-14.4-a/b, F2/F5/F6/F10/F11, D1), `aog-1a-*.md` (R-AOG-c, MAJOR-1), `16-2-guardie-registro-voli.md` (E8, `FLIGHT_OVERLAP` non derogabile).
- Codice: `src/server/services/{flights,bookings,expiries,membership,accounts}.service.ts`, `src/server/auth/rbac.ts`, `src/lib/schemas/{flights,registry,common}.ts`, `src/lib/api/handler.ts:268-277`, `src/app/[locale]/dashboard/logbook/`, `src/app/[locale]/dashboard/{page.tsx,dispatch-flight-button.tsx}`, `src/lib/mobile-logbook.ts`.

### TD aperti da questa story (residui della 16.4 senza casa)

| ID | Debito | Misura / call-site (16.4 AD-2, da ricontrollare sul HEAD) | Owner proposto |
|---|---|---|---|
| **TD-19.9-a** | **Alert job e contatori Scadenze** contano e scrivono ancora per **persone archiviate** e **tipi di scadenza disattivati** (16.4 P2, ratifica R-16-c seconda metà): promemoria a chi non è più socio, contatori che non coincidono con l'elenco visibile. | `runExpiryAlertsJob` (`expiry-alerts.service.ts`, candidati `where: { expiresAt: { lte: horizon } }`), `getExpiryTierCounts` e `listAllExpiries` (`expiries.service.ts`, che la 19.7b riscrive in SQL per il registro unificato). Misura di record della 16.4 su `airmanager_load`: 708 `Expiry` di persone archiviate su 13 612; tier «scadute» 3 387 → 3 196 col filtro; candidati dell'alert job 5 415 → 5 108. | alert job → **17.8** (alert job a lotti, che riscrive comunque quella query); contatori e registro → verificare se la 19.7b li filtra già, altrimenti una story dedicata |
| **TD-19.9-b** | **«Oggi» UTC nel dominio scadenze** (16.4 P5, fold-in di TD 16.1-a): sei call-site in `expiries.service.ts`/`expiry-alerts.service.ts` usano ancora `todayDateOnlyUtc()`. | `sprint-status.yaml` action item «TD 16.1-a..e» (punto a). | **16.9** (un solo calendario) |

---

## Tasks / Subtasks

- [ ] **T0 — Riallineamento**: `git log --oneline -10` (19.3-19.8 committate), `scripts/e2e.sh status`, `:3000` libero; API reali di `getCurrencyStatus`/`getMembershipStatus`/`getMedicalRequirementFailure`/helper di scrittura 19.6/`registerFlightOn`/`db-fixtures`; censimenti di §3.6 e grep di AC 22 su HEAD; righe slittate annotate nel record; risposte PO a Q-19.9-a/b lette dal file.
- [ ] **T1 — Schema e migrazione** (AC 1).
- [ ] **T2 — Servizio e Zod condiviso** (AC 2-6): `requirements.service.ts`, `schemas/requirements.ts`, helper d'errore.
- [ ] **T3 — Integrazione voli** (AC 7-12): `resolveFlightInput` (AD-3), `updateFlight` (pre-lettura), timbro, DTO senza `forceReason`, permesso (AD-5).
- [ ] **T4 — Chip Piloti** (AC 19).
- [ ] **T5 — OpenAPI** (AC 21).
- [ ] **T6 — UI** (AC 13-17): componente, formatter, form volo, registro, sheet, `mobile-logbook.ts`, label delle pagine.
- [ ] **T7 — i18n** (AC 23).
- [ ] **T8 — Seed** (AC 24).
- [ ] **T9 — Unit** (§4.1) + sonde §4.3 (a)-(j) con sha256.
- [ ] **T10 — e2e** (AC 25-26): helper E-R1/E-R2/E-R5/E-R6, spec nuovo, spec riscritti di §3.6; delta dei test.
- [ ] **T11 — Verifica** (AC 20, 22, 27, 28, 29): grep, gates, e2e mirati, screenshot, call-site di TD-19.9-a/b ricontrollati; Dev Agent Record compilato.

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD (T0)

### §B — Riepilogo per AC con le prove

### §C — Migrazione: gemello, conteggi prima/dopo, `\d "Flight"`, `migrate diff`

### §D — Sonde e discriminanze §4.3 (a)-(j) con sha256

### §E — Grep di AC 20 e 22, parità i18n (verbatim)

### §F — Delta test (unit ed e2e, prima/dopo; mappa dei test di deroga 14.4/AOG-1a → nuovi)

### §G — Deviazioni motivate

### §H — Verifica UI (screenshot)

### §I — Gate ed esiti verbatim

### §J — TD-19.9-a/b: call-site ricontrollati sul HEAD (D-14)

### Completion Notes List

- Story file scritto dallo story writer (2026-11-01, ricognizione su `eef77ef`); contratto AD-2 concordato con lo writer della 19.10.

### File List
