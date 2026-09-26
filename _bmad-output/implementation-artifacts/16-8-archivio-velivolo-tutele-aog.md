---
baseline_commit: 3147683
---

# Story 16.8: Archiviare un velivolo avvisa come il fermo

Status: **ready-for-dev** — 2026-09-26, **ratifiche Q-16.8-a e Q-16.8-b CHIUSE dal PO il 2026-09-26 (entrambe opzione A, la raccomandata — v. §0)**: gli AC sono già scritti su quelle opzioni. **Modello dev: Opus 5 xhigh (UI)** — la story scrive codice UI su tre superfici (`aircraft-editor.tsx`: anteprima, doppio passo, banner, faccia archiviata; `schedule.tsx`: riga «Archiviato» desktop e mobile; stringhe i18n) oltre al backend. Review: **Opus 5 xhigh adversarial**, come sempre.

> ⚠️ **Baseline**: il frontmatter dichiara `3147683` (chiusura del fix cycle AOG-1b, decisione PO 6). Il HEAD al momento della ricognizione è **`09dd893`** = `3147683` + `fedb868` (4 righe di **solo commento** in `aircraft-editor.tsx:1088-1091`) + `09dd893` (docs). **Ogni `file:riga` di questo file è misurato su `09dd893`**: in `aircraft-editor.tsx` le righe ≥ 1089 stanno 4 più in basso che su `3147683`, ogni altro file è identico. Prima di scrivere una riga: `git log --oneline -3`, rileggere le righe citate sul HEAD corrente e **correggere questo file** dove sono slittate. File in comune con story ancora `ready-for-dev`: **16.9** (`aircraft-editor.tsx:239`, `todayDateOnly`), **16.3** e **16.7** (`bookings.service.ts`, `dashboard/bookings/**`) — se una di loro è stata committata prima, l'unico effetto atteso è lo slittamento delle righe.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` **per intero** (§1 AD-1..AD-8, Dev Agent Record §G decisioni non ovvie, e il **Review Record** con le **sei decisioni PO** — in particolare la 1 `effectiveUntil`, la 2 la domanda davanti alla coppia, la 3 l'anteprima compatta a zero, la 4 il link del banner non filtrato, la 6 il Conferma che ignora `event.detail > 1`, e la nota per la 16.8 in R.1-6); `aog-1a-campo-guardia-volo.md` §1 (**AD-2** la guardia atomica, **AD-4** la guardia volo accanto ad `AIRCRAFT_ARCHIVED`, **AD-9** «nessun controllo che dà sempre 409»); `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` **§F7** e la riga «Aircraft» della sezione «Macchine a stati»; `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.8» (**contratto**, AC di record) + **R-16-e** + «Architettura e vincoli». Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

---

## Story

As **l'amministratore che archivia un velivolo**,

I want vedere **quante prenotazioni vive** sto per lasciare su un velivolo che esce dalla flotta, confermare in **due passi** con il numero davanti, avere il **numero reale** dopo, e che i piloti con una prenotazione **approvata** lo sappiano per **email**,

so that l'archiviazione — l'atto **definitivo** — non sia più **forte e più muta** del fermo temporaneo (ops F7, R-16-e), e che su un velivolo archiviato **nessuna operazione di stato** funzioni più: `unarchive` resta l'unica via.

### Il perché: l'atto definitivo non ha nessuna delle tutele dell'atto temporaneo

AOG-1a/1b hanno costruito per il **fermo** un apparato completo: anteprima «stai per impattare N prenotazioni», doppio passo, conteggio autoritativo dentro la transazione, banner persistente, email best-effort ai titolari delle APPROVED. L'**archiviazione** fa di più — il velivolo esce dalla flotta: `createBooking`/`updateBooking`/`transitionBooking→APPROVED` lo rifiutano (`bookings.service.ts:553-554`, `:921-922`, `:1150-1151`), `listBookableAircraft` lo esclude (`:1252`), la timeline non ha più la sua riga — e **non ha niente**: `archiveAircraft` (`aircraft.service.ts:373-390`) verifica esistenza e «già archiviato», scrive `archivedAt`, **non guarda una prenotazione**. Le APPROVED restano APPROVED, il pilota non sa nulla, e il primo a scoprirlo è chi si presenta al campo.

E c'è il secondo difetto di F7, speculare: **i due assi di stato non si parlano**. Un velivolo archiviato può essere messo fuori servizio — e il fermo **fa partire il fan-out email** ai titolari di un aereo che nessuno può più prenotare —, riportato in servizio, e avere il contaore corretto: `setOutOfService`, `returnToService` e `adjustHourMeter` non leggono **mai** `archivedAt`.

### Fatti misurati che vincolano il design

| Fatto | Misura (su `09dd893`, 2026-09-26) | Conseguenza |
|---|---|---|
| L'archiviazione non conta, non avvisa, non scrive in transazione | probe (§4.4): `archiveAircraft` su un velivolo con 2 APPROVED + 1 PENDING future → `impactedBookings` **`undefined`**, `$transaction` **0** chiamate, `booking.findMany` **0**, email **0** | A1-A3 rossi: la discriminanza di AC 1-3 è **già scritta** |
| Le operazioni di stato su un archiviato **riescono** | probe: `setOutOfService`, `returnToService`, `adjustHourMeter` su un archiviato → **risolvono** (B1-B3) | la guardia va **scritta**, non estesa |
| Il fermo di un archiviato **manda email** | misura: grounding di un archiviato con 2 APPROVED future → `status=OUT_OF_SERVICE`, `impacted={"pending":0,"approved":2,…}`, **`emailsSent=2`** | AC 9 chiude anche un fan-out spurio, non solo una scrittura |
| Le tariffe **già** rifiutano l'archiviato, col codice generico | `rates.service.ts:156-158` → `ConflictError('Cannot add a rate to an archived aircraft.')` = **409 `CONFLICT`**; probe B4: `code: "CONFLICT"` | «tariffe → 409 `AIRCRAFT_ARCHIVED`» cambia **solo il codice**, non lo status |
| …e il client, col codice generico, **mente** | `aircraft-editor.tsx:1220`: `code === 'CONFLICT' ? labels.errors.conflictRate : …` → su un archiviato (pannello stantio) mostra «Esiste già una tariffa con questa data di decorrenza.» | il codice specifico **ripara** un messaggio falso (AC 11) |
| `AIRCRAFT_ARCHIVED` **esiste già — come 422** | `flights.service.ts:667`: `ValidationError('Cannot register a flight on an archived aircraft.', undefined, 'AIRCRAFT_ARCHIVED')`; registry `:976`; `messages/*.json:1169/1387` | il 409 del piano **collide** col 422 esistente: **Q-16.8-a** |
| Nessun codice del repo vive oggi con due status | censimento dei terzi argomenti di `new ConflictError(` / `new ValidationError(` in `src/server`: **0** codici condivisi fra 409 e 422 | l'opzione raccomandata di Q-16.8-a sarebbe **la prima**: va dichiarata |
| Le prenotazioni di un velivolo archiviato **spariscono dalla timeline desktop** | righe = `listBookableAircraft` (`archivedAt: null`, `bookings.service.ts:1252`); blocchi disegnati **per riga** (`schedule.tsx:606-608`); `listCalendarBookings` **non** filtra l'archiviato (`:716`) | le APPROVED di un archiviato sono nel dato ma **invisibili** sul desktop, contate nella settimana (`:686-689`), righe normali senza contesto nell'agenda mobile (`mobile-agenda.ts:55-70`): AC 12 |
| L'anteprima esistente calcola **già** la finestra dell'archiviazione | `previewOutOfServiceImpact` senza `until` → `computeAogImpact(prisma, { until: null, … })` (`aircraft.service.ts:512-516`) = `[ora, ∞)`, PENDING+APPROVED, `effectiveUntil: null` (`aog-impact.ts:129-130`, `:155`) | **riuso** di `GET /out-of-service-impact`, nessun endpoint nuovo (AD-2) |
| Il doppio passo dell'Archivio **esiste già** | `ArchiveSection` (`aircraft-editor.tsx:1503-1555`): stato `confirming`, domanda `confirmArchive` + `archive-confirm` + Annulla **senza testid** (`:1543`) | il doppio passo si **estende** (numero nella domanda), non si inventa |
| Oggi l'Archivio **non** ha la geometria del doppio click | AOG-1b R.1-6: `archive-toggle-button` 71,42×34,84, `archive-confirm` a x 981,78 (1280) / 220,78 (375) contro un trigger che finisce a 852,42 / 91,42 — intersezione **nulla** | la domanda **si allunga** col conteggio: a 375 la coppia può andare a capo **dentro** il box del trigger → **rimisurare** (AC 7) |
| Nessuno spec e2e archivia un velivolo **con** prenotazioni, né opera su un archiviato | censimento §3.5: 4 archiviazioni via API in `finally` (nessuna legge il body; aerei senza prenotazioni) + 1 flusso UI a due click | blast radius e2e **quasi nullo**; il grosso è negli **unit** (§3.6) |
| i18n | parità **0/0** su **1 986** chiavi per file | ogni chiave nuova entra nei due file insieme |

---

## §0 — Requisiti FISSI (contratto: piano epic 16-18, «Story 16.8»)

| # | Requisito (dal piano — **AC di record**) |
|---|---|
| **P1** | Archiviando un velivolo con N prenotazioni PENDING/APPROVED future, l'**anteprima** mostra N (**stessa `computeAogImpact`, finestra non delimitata**), la conferma è **a due passi** con l'idioma consolidato dalla 1b, la **response** porta il conteggio autoritativo e i titolari **APPROVED** ricevono l'email (modello `sendAircraftGroundedEmails`, **testo dedicato** all'archiviazione) — best-effort post-commit. |
| **P2** | Su un velivolo archiviato, `out-of-service`, `return-to-service`, `hour-meter-adjustments`, tariffe → **409 `AIRCRAFT_ARCHIVED`**; `unarchive` resta l'unica via. *(Status e codice subordinati a **Q-16.8-a**.)* |
| **P3** | Il calendario, quando contiene prenotazioni di un velivolo archiviato, le mostra con la riga «archiviato» come oggi mostra l'AOG, «e lo spec serializzato AOG le conta». *(Seconda metà subordinata a **Q-16.8-b**.)* |

| # | Invariante |
|---|---|
| **[a]** (AOG-1a) | **Solo `returnToService` rimette in servizio un velivolo.** Qui significa: l'archiviazione **non tocca** `status`/`statusReason`/`outOfServiceUntil`, e `unarchive` restituisce il velivolo **esattamente** com'era (AD-5). |
| **[b]** (R-16-e) | **Nessun blocco, nessuna cascata**: archiviare un velivolo con prenotazioni vive **resta sempre possibile** e **non tocca** una prenotazione. Conta e avvisa, non decide per l'admin (stessa scelta PO 2026-07-31 dell'AOG). |
| **[c]** (piano) | **Guardie = codice + unit discriminante + e2e**: ogni guardia nuova nasce con un test provato **ROSSO** sul pre-fix simulato, repo **ripristinato byte-identico** (sha256 dichiarato). |

### Ratifiche già chiuse che vincolano QUESTA story

| R | Decisione | Effetto vincolante qui |
|---|---|---|
| **R-16-e** | Archiviare con prenotazioni future **conta e avvisa come l'AOG**: riuso di `computeAogImpact` e dell'apparato 1b (anteprima, doppio passo, email ai titolari APPROVED); **nessun blocco**. | AC 1-8. **Nessun** 409 «annulla prima le N prenotazioni», **nessun** annullamento in cascata (le due alternative dell'audit, scartate). |
| **R-AOG-i** (1b) | Email **solo** alle APPROVED; nessuna al rientro. | Qui: nessuna email alle PENDING (già congelate: l'approvazione su un archiviato risponde 409, `bookings.service.ts:1150-1151`); **nessuna email all'`unarchive`**. |
| **Decisioni PO 1b 1-6** | `effectiveUntil`; domanda davanti alla coppia; anteprima compatta a zero; link non filtrato; TD fan-out → 17.8; `event.detail > 1`. | Riprese **tutte** (AD-3, AD-4, AC 5-8). Il link resta non filtrato **per la stessa ragione** (la 17.2 lo aggiorna per entrambi). |

### ❓ Domande aperte per il PO (da ratificare PRIMA del dispatch — la sessione principale registra qui l'esito)

**Q-16.8-a — 409 o 422 per `AIRCRAFT_ARCHIVED`?** Il piano dice **409 `AIRCRAFT_ARCHIVED`**; il codice **esiste già come 422** sul registro voli (`flights.service.ts:667`, story 5.1 AC 3: «ogni problema di stato del dominio nell'input è un 422 con codice specifico»). Le prenotazioni, per lo stesso fatto, rispondono **409 `CONFLICT`** generico (`bookings.service.ts:554/922/1151`). Nessun codice del repo vive oggi con due status.

| Opzione | Cosa | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | **409 `AIRCRAFT_ARCHIVED`** sulle quattro scritture (`ConflictError` col codice); i voli **restano** 422 `AIRCRAFT_ARCHIVED` | è la lettera del piano; ogni guardia di stato di `aircraft.service.ts` è già 409 (`already archived` `:381`, `already out of service` `:470`, `already operational` `:612`), e `POST /rates` su archiviato è **già 409** dalla story 4.1 (registry `:1200` lo dichiara): lo status di tariffe **non cambia**, cambia solo il codice (`CONFLICT` → specifico, come la story 8.2 fece per `PPR_ALREADY_DECIDED`) | **stesso codice, due status** nell'API: va scritto nel registry (la regola: «il velivolo è la risorsa del path → 409 della famiglia `aircraft`; il velivolo è un riferimento nell'input di un volo → 422 della famiglia `flights`») — primo caso nel repo |
| B | **422 `AIRCRAFT_ARCHIVED`** (`ValidationError`) anche qui | un codice = uno status, ovunque | contraddice le altre guardie di stato di `aircraft.service.ts` (tutte 409); **cambia lo status di `POST /rates` su archiviato da 409 a 422** — un contratto spedito e dichiarato (`registry.ts:1200`) |
| C | **409 `CONFLICT`** generico (come prenotazioni e tariffe oggi), nessun codice nuovo | zero collisioni | il client non distingue «archiviato» da «stato già cambiato» né da «tariffa duplicata» — è proprio il messaggio falso delle tariffe di oggi (AC 11); e contraddice la lettera del piano |

**Q-16.8-b — Che cosa chiede AC 3 (P3)?** Due punti non mappano sul HEAD. (1) **«come oggi mostra l'AOG»**: sul desktop il blocco AOG **copre** la riga e **nasconde** le prenotazioni (`schedule.tsx:607-608`: `blocks = isAog ? [] : …`), mentre sul mobile la riga AOG sta in testa e i movimenti **restano** (`mobile-agenda.ts:55-70`). Ma la riga di un archiviato esiste **solo perché** ci sono prenotazioni (a differenza dell'AOG, che ha sempre la sua riga): coprirle lascerebbe una riga senza ragione visibile. (2) **«lo spec serializzato AOG le conta»**: l'unico spec serializzato AOG, `e2e/aog-overview-count.spec.ts` (project `aog-overview-count`, ultimo della catena in `playwright.config.ts:167-181`), confronta **due conteggi di velivoli** (Panoramica vs Flotta, AOG-1a AC 13) e **non conta prenotazioni**; gli archiviati sono **già** esclusi da entrambi i conteggi (`listOutOfServiceAircraft`, `archivedAt: null`, `aircraft.service.ts:240`).

| Opzione | Desktop | Mobile | «lo spec … le conta» |
|---|---|---|---|
| **A (raccomandata)** | riga «Archiviato» (pill `res-status` tono bad) **con i blocchi visibili** | riga «{marche} archiviato» in testa, **dopo** le AOG e prima dei movimenti, che restano | letto come «un e2e le conta»: spec **nuovo** nel project `chromium` `fullyParallel` che conta **esattamente** le proprie righe/blocchi su fixture run-unique (nessun aggregato globale ⇒ nessuna serializzazione, stessa motivazione di AOG-1b §E); **nessuna modifica** a `aog-overview-count.spec.ts` |
| B | blocco «Archiviato» a tutta larghezza che **copre** le prenotazioni (idioma `schedule-aog-block` letterale) | come A | **estendere** `aog-overview-count.spec.ts` con un velivolo archiviato **e** fermo che non deve contare nell'«N AOG» di Panoramica e Flotta (pin: verde anche sul pre-fix, non discrimina la story) |

*Raccomandazione A* per entrambe: A mostra all'admin **di chi** sono le prenotazioni da gestire (il motivo stesso per cui la riga compare), e il suo e2e **discrimina** (sul pre-fix la riga non esiste); B aggiunge a uno spec serializzato un'asserzione che è verde prima e dopo.

> **DECISIONI PO (2026-09-26, AskUserQuestion)**: **Q-16.8-a → A** — 409 `AIRCRAFT_ARCHIVED` sulle quattro scritture di `aircraft`, i voli restano 422 `AIRCRAFT_ARCHIVED`; la regola dei due status va scritta nel registry. **Q-16.8-b → A** — riga «Archiviato» con le prenotazioni visibili (desktop e mobile) + e2e nuovo parallelo che conta le proprie righe; `aog-overview-count.spec.ts` non si tocca.

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA funzione di dominio, tre call-site: l'archiviazione chiama `computeAogImpact` con `until: null`

`computeAogImpact` (`aog-impact.ts:121-156`) è **già** l'unica risposta a «quante prenotazioni impatta questo velivolo»; con `until: null` la finestra è `[ora, ∞)` — che è **esattamente** la semantica dell'archiviazione (il velivolo non rientra). Nessuna seconda implementazione, nessun parametro nuovo, **nessuna riga di `aog-impact.ts` toccata** (il suo doc-comment guadagna al massimo la menzione del terzo call-site). Call-site dopo la story: grounding (`aircraft.service.ts:476`), anteprima (`:512`), **archiviazione** (nuovo, dentro la transazione). `effectiveUntil` è **sempre `null`** per l'archiviazione: la frase che lo accompagna è **dedicata** (AD-4), mai quella del fermo («rientro da definire» sarebbe falsa: non c'è rientro).

### AD-2 — L'anteprima RIUSA `GET /api/v1/aircraft/{id}/out-of-service-impact` senza `until`. Nessun endpoint nuovo.

Deciso sul codice, non sul gusto:
1. `previewOutOfServiceImpact(actor, id, {})` esegue `computeAogImpact(prisma, { aircraftId: id, until: null, now })` (`aircraft.service.ts:512-516`): **il numero dell'anteprima dell'archiviazione, byte per byte**;
2. il gate è lo stesso della scrittura che precede (`aircraft.manage`, `:505` / `:374`);
3. il DTO è lo stesso (`aogBookingImpactSchema`, `schemas/aircraft.ts:127-140`), e il suo `effectiveUntil: null` è ciò che l'archiviazione restituirà nella propria response: anteprima e definitivo parlano **la stessa forma**;
4. AD-2 di 1b vieta una finestra **costruita dal client** (`from`/`to` su `GET /bookings`); qui il client **omette** un parametro e la finestra la definisce il server — nessuna semantica duplicata;
5. un endpoint nuovo (`/archive-impact`) sarebbe una seconda rotta, una seconda voce di registry e una seconda funzione di service che restituiscono **la stessa computazione**: la duplicazione che AD-1 di 1b esiste per impedire, spostata al livello delle rotte.

**Costo, dichiarato**: il path si chiama `out-of-service-impact`. Si paga con **documentazione** nello stesso commit — la descrizione del registry (`registry.ts:1121-1135`) e il doc-comment di `previewOutOfServiceImpact` (`aircraft.service.ts:489-503`) nominano l'archiviazione come **secondo consumatore** e dicono che l'omissione di `until` È la finestra dell'archiviazione — e con un **unit che pinna** «anteprima dell'Archivio = `GET` senza `until`» (§4.1 #3), così chi un giorno rendesse `until` obbligatorio o aggiungesse un 409 sull'archiviato vede rompersi un test e non un'anteprima in produzione. La lettura **non** prende la guardia di AC 9: è una lettura, non un'operazione di stato.

### AD-3 — Il numero autoritativo nasce nella transazione dell'archiviazione, con una guardia atomica NUOVA

`archiveAircraft` (`aircraft.service.ts:373-390`) oggi è **check-then-write** (`findUnique` → `update`). Diventa, ricalcato su `setOutOfService` (`:439-487`):

1. **fuori** transazione: `findUnique` → 404 se manca (invariato);
2. `prisma.$transaction(async (tx) => …)`:
   - `tx.aircraft.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: now } })` — `count === 0` → **`ConflictError('Aircraft is already archived.')`** (messaggio e codice **invariati**, `:381`);
   - `tx.aircraft.findUniqueOrThrow({ where: { id }, select: AIRCRAFT_SELECT })`;
   - `computeAogImpact(tx, { aircraftId: id, until: null, now })`;
3. **dopo** il commit: il fan-out (AD-6);
4. response `{ aircraft, impactedBookings: { pending, approved, effectiveUntil } }`.

**Perché la guardia atomica, e non solo la transazione**: con l'email, una doppia archiviazione concorrente (doppio click da due schede, retry) sul check-then-write di oggi scriverebbe due volte **e manderebbe due email a ogni titolare**. Con la `where` guardata vince una sola: l'altra prende 409 **senza conteggio e senza email** (stessa disciplina di review 2.2 F1, AOG-1b AC 4).

`unarchiveAircraft` (`:393-410`) **non si tocca**: nessun conteggio, nessuna email, response invariata (`AircraftListItem`).

### AD-4 — La superficie dell'Archivio prende l'idioma 1b INTERO, con testi propri

| Pezzo di 1b | Nell'Archivio | Testo |
|---|---|---|
| anteprima all'apertura della sezione (`aog-impact-preview`, `.alert-box.info` `role="status"`; compatta a **una** `.fld-hint` a zero — decisione PO 3) | `archive-impact-preview`, **stessi due rami**, fetch al **mount** di `ArchiveSection` solo per un velivolo **non** archiviato | titolo dedicato; spacco **riusato** (`availability.impactSplit`: «In attesa (congelate) · Approvate (da gestire)» è vero anche qui); finestra **dedicata**; «stima» **riusato** (`availability.impactEstimate`) |
| domanda davanti alla coppia (decisione PO 2) | la domanda **esistente** (`archive.confirmArchive`) guadagna il conteggio (`confirmArchiveOne`/`Many`); a conteggio ignoto **o zero** resta `confirmArchive` (onesta: non afferma un numero) | 2 chiavi nuove |
| `event.detail > 1` sul Conferma (decisione PO 6) | **condizionato alla misura** (AD-7) | — |
| banner persistente `.alert-box.bad` col numero della response | `archive-impact-banner`, `role="status"`; il link `archive-impact-bookings-link` → `/{locale}/dashboard/bookings?status=PENDING,APPROVED` (**riusa** `availability.impactBookingsLink`; non filtrato per la stessa ragione di 1b MINOR-2) | titolo dedicato |
| toast invariato | `toast.archived` «Velivolo archiviato.» **invariato**: è la conferma dell'atto, non il referto | — |
| riga persistente a ogni riapertura (1b AC 6) | **NON** si fa (§6): il portatore persistente delle prenotazioni di un archiviato è la **riga «Archiviato» del calendario** (AC 12), dove l'admin le gestisce | — |

**Stato locale**: lo stato del doppio passo e del banner vive in `ArchiveSection`, che `fleet-console.tsx:307` rimonta a ogni apertura (`key`): non sopravvive a chiusura/riapertura (classe BLOCKER 14.4 F1) — **misurarlo**, non dichiararlo. Un `unarchive` nella stessa sessione **azzera** il banner (come il rientro in servizio azzera quello del fermo, `aircraft-editor.tsx:888-889`).

⚠️ **Vietato** un nuovo `var(--bad)`/`var(--ok)` inline (debito dei 40 in 19 file, AD-4 di 1b): `.alert-box.bad|info`, `.fld-hint`, `.res-status.*` esistenti.

### AD-5 — Lo stato si CONGELA all'archiviazione (invariante [a]), non si azzera

L'audit (F7 rimedio b) lascia aperto «azzerati (o congelati)». **Congelati**, perché l'alternativa viola un'invariante ratificata: azzerare `status` a `OPERATIONAL` all'archiviazione farebbe rientrare **operativo**, all'`unarchive`, un velivolo ritirato **perché rotto** — cioè una via diversa da `returnToService` per rimettere in servizio un aereo (invariante [a] di AOG-1a, AD-2 di 1a). Congelare è anche **zero righe**: `archiveAircraft` scrive **solo** `archivedAt`, oggi e dopo. Conseguenze, tutte già vere sul HEAD e da **dichiarare**: un archiviato fermo **non** conta nell'«N AOG» (`aircraft.service.ts:240`), il badge dà precedenza all'archiviato (`fleet-console.tsx:358`), e dopo l'`unarchive` il velivolo torna AOG col suo motivo e la sua data (probe C2).

### AD-6 — L'email: un template nuovo, il fan-out GENERALIZZATO, non forkato

- **Template**: `buildAircraftArchivedEmail(locale, { firstName, aircraftRegistration, startsAt })` in `templates.ts`, sulla falsariga di `buildAircraftGroundedEmail` (`:346-397`) **senza** motivo né finestra (non ci sono), namespace i18n **`Emails.aircraftArchived`** con **`subject`** e **`body`** (testi in AC 15). Il corpo dice, come quello del fermo, che la prenotazione **NON è stata annullata** (invariante [b]).
- **Fan-out**: `sendAircraftGroundedEmails` (`aircraft.service.ts:543-589`) **non** si copia. Si generalizza in **una** funzione che riceve il costruttore del messaggio per destinatario (e un'etichetta per i `console.error`), chiamata dal grounding con `buildAircraftGroundedEmail` e dall'archiviazione con `buildAircraftArchivedEmail`. Il corpo resta **quello** — un'email per **titolare** sulla sua prima prenotazione (`startsAt` ascendente), **due** letture batch, `try/catch` **doppio** (letture + per destinatario), locale da `User.locale` con fallback `it`, skip silenzioso senza email — e il suo doc-comment smette di dire «setOutOfService» dove parla di entrambi. Il nome attuale diventerebbe falso: rinominarlo (es. `sendImpactedHolderEmails`) è parte della generalizzazione, non un refactor gratuito; il dev motiva nel record il nome scelto.
- **Best-effort post-commit**, identico ad AD-6 di 1b: mai un throw che faccia fallire un'archiviazione valida. **Nessuna email** all'`unarchive` e alle PENDING.
- **Costo dichiarato**: il fan-out resta **dentro la richiesta** (~76 ms/destinatario verso Mailpit locale, misura 1b §I): è la stessa riga del TD verso la **17.8** (decisione PO 1b 5), che ora copre due atti. Nessun cap, nessuna coda (§6).

### AD-7 — Il doppio click sull'Archivio: la misura decide se serve la guardia

La nota di 1b (R.1-6, condizione 3) misura **oggi** intersezione nulla fra `archive-confirm` e `archive-toggle-button`, e prescrive: se la coppia nasce a portata di dito del trigger, riusare `event.detail > 1`. Con 16.8 la domanda **si allunga** («Archiviare questo velivolo? 3 prenotazioni impattate») e, a 375, la coppia **può andare a capo** con il Conferma che nasce **sotto** l'angolo sinistro del trigger (x 20..91,42 × altezza 34,84): esattamente la geometria di MAJOR-2, e il doppio **tap** di Chromium allarga il «sotto il punto» a un'area (aggiustamento del tap, 1b R.1-6). **Procedura vincolante**:
1. rimisurare, **dopo** l'implementazione, i box di trigger, domanda, `archive-confirm`, `archive-cancel` a **1280** e **375**, **IT ed EN**, con **N = 1 e N ≥ 10** (la lunghezza della domanda dipende da lingua e cifre) e col conteggio **ignoto** (domanda corta);
2. **se** in una qualsiasi di queste configurazioni `archive-confirm` interseca il box del trigger, **o** un doppio tap in contesto `hasTouch`+`isMobile` sul trigger a 375 raggiunge `archive-confirm` → la riga `if (event.detail > 1) return;` va su `archive-confirm` (commento che rimanda alla decisione PO 6 e ai suoi effetti collaterali accettati, `aircraft-editor.tsx:1083-1092`) con i due e2e di AC 7, **rossi senza la riga**;
3. **altrimenti** nessuna guardia (karpathy §2: nessuna difesa senza un caso), e i due e2e **pinnano** l'assenza di intersezione come asserzione esplicita (se un layout futuro la crea, il test lo dice invece di perdere la discriminanza in silenzio, come 1b `:385`).
La guardia, se c'è, vale **solo** per `archive`: l'`unarchive` ha la domanda corta di oggi e la geometria misurata da 1b.

### AD-8 — Le quattro guardie su un archiviato stanno DENTRO l'atomicità che ognuna già ha

| Operazione | Dove (HEAD) | Guardia | Scelta del codice su `count === 0` |
|---|---|---|---|
| `setOutOfService` | `updateMany` guardata `:454-455`, dentro `$transaction` `:448` | `where: { id, status: 'OPERATIONAL', archivedAt: null }` | rilettura **nella stessa transazione** di `archivedAt` → `ConflictError(…, undefined, 'AIRCRAFT_ARCHIVED')`, altrimenti il 409 di oggi (`:470`) **byte-identico** |
| `returnToService` | `updateMany` guardata `:607-610` (nessuna transazione) | `where: { id, status: 'OUT_OF_SERVICE', archivedAt: null }` | rilettura di `archivedAt` → `AIRCRAFT_ARCHIVED`, altrimenti `:612` **byte-identico** |
| `adjustHourMeter` | `SELECT "hourMeterMinutes" … FOR UPDATE` `:645-646` | la stessa `SELECT` legge anche `"archivedAt"`; se non `null` → `AIRCRAFT_ARCHIVED` **prima** di `hourMeterAdjustment.create` | — (il lock già serializza con l'`UPDATE` dell'archiviazione) |
| `createAircraftRate` | `rates.service.ts:152-158`, check-then-write | **invariata**: cambia solo il terzo argomento del `ConflictError` → `'AIRCRAFT_ARCHIVED'` (messaggio invariato) | — |

**Perché nella `where` e non in una pre-lettura**: una pre-lettura è check-then-write contro un'archiviazione concorrente — e un grounding che passa su un velivolo appena archiviato **manda le email** (misura §«Fatti»). Nella `where`, l'`UPDATE` dell'archiviazione e quello del grounding si serializzano sul lock di riga e, sotto READ COMMITTED, il secondo rivaluta la `where` sulla versione nuova: vince uno solo. La rilettura dopo `count === 0` serve **solo** a scegliere il messaggio.
⚠️ **Deviazione dichiarata da AOG-1b AD-3/AD-8** («la `where` guardata resta INTATTA»): la `where` di `setOutOfService` guadagna **un** predicato. La disciplina di review 2.2 F1 non cambia — si **rafforza** con un secondo asse —, ed è letteralmente il rimedio (b) di F7. Le asserzioni **esatte** sulla `where` (§3.6) si aggiornano **al valore corretto**, mai a `objectContaining` (lezione 14.6).
**Residuo dichiarato** (TD 16.8-b): `createAircraftRate` resta check-then-write contro un'archiviazione concorrente; una tariffa che atterra su un velivolo archiviato nello stesso istante è innocua (prezza un aereo che nessuno può più prenotare) e chiuderla vorrebbe un lock che nessun AC chiede.

### AD-9 — La faccia archiviata dell'editor non offre controlli che danno sempre 409

AD-9 di 1a / lezione 14.6 F2: un controllo che porta sempre a un errore è un vicolo cieco. Dopo AC 9, su un archiviato:
- **Disponibilità** (`AvailabilitySection`, `aircraft-editor.tsx:743-1113`): resta «Stato attuale» (`availability-current`, `:944-946`, che per un archiviato fermo continua a dire motivo e data — stato **congelato**, AD-5) + **un** hint; **niente** form di fermo, **niente** `return-to-service-button`, **nessun fetch** dell'anteprima (l'effetto `:808-829` non parte), nessun banner/riga AOG.
- **Contaore** (`HourMeterSection`, `:1332-1499`): resta «Contaore attuale» + storico; **niente** `hour-meter-form`, al suo posto lo stesso hint.
- **Tariffe** (`RatesSection`, `:1244-1277`): il gate `archived` c'è già, ma il testo che mostra, `rates.readOnlyHint` «Solo un amministratore può aggiungere nuove tariffe.», è **falso** proprio lì — dalla review 14.9 F9 appare **solo** per un archiviato, e il lettore **è** un amministratore. Si sostituisce con lo stesso hint; la chiave `rates.readOnlyHint` resta **orfana** e si rimuove dai due file (orfano creato dalla story, karpathy §3).
- **Pannello stantio** (un'altra scheda/admin ha archiviato nel frattempo): i tre `if (!response.ok)` (`:855-858`, `:878-881`, `:1218-1221`, e `:1401-1404` del contaore) su `code === 'AIRCRAFT_ARCHIVED'` mostrano **lo stesso hint**, mai il generico «Riprova» (che fallirebbe identico, lezione R-15.4-g) né `conflictRate` (il messaggio falso di oggi). **Una** stringa, tre usi. Il pannello **non** si riallinea da solo (TD 16.8-e).
- **Identità** (`IdentitySection`) e **Archivio** (Ripristina) restano **invariati**: l'anagrafica non è un'operazione di stato, e l'`unarchive` è la via d'uscita.

### AD-10 — Il calendario: righe «Archiviato» dichiarate dal server, solo dove ci sono prenotazioni *(forma di Q-16.8-b opzione A)*

- **Dato**: una funzione nuova in `bookings.service.ts`, accanto a `listBookableAircraft` (`:1248-1256`), stesso gate `self.read`: `listArchivedAircraftByIds(actor, ids)` → `prisma.aircraft.findMany({ where: { id: { in: ids }, archivedAt: { not: null } }, select: { id: true, registration: true, model: true }, orderBy: { registration: 'asc' } })`. Il chiamante le passa gli `aircraftId` di `calendarBookings` **assenti** dalle righe attive, e **non la chiama** se l'insieme è vuoto (zero query nel caso normale). Si **dichiara** il fatto invece di **dedurlo** («non è fra i bookable ⇒ è archiviato» sarebbe vero oggi e falso il giorno in cui la **17.2** renderà le righe scelte dal server). Nessuna fuga: marche e modello di un velivolo sono già visibili a ogni ruolo sulle prenotazioni e nella flotta attiva; **non** si seleziona `statusReason`.
- **Dove**: le **due** timeline che rendono `Schedule` — `/dashboard/bookings` (`page.tsx:143`, `:248`, `:434`) **e** la Panoramica (`dashboard/page.tsx:313`, `:673`) — perché sono **lo stesso calendario** (un calendario che mostra le prenotazioni di un archiviato e un altro che le nasconde sarebbe proprio il difetto che l'epic 16 chiude). Le righe archiviate si passano **solo** a `Schedule` (`aircraft=`): i **picker** dei form (`aircraftOptions` a `bookings/page.tsx:459`, `dashboard/page.tsx:704`) restano **i soli bookable**.
- **Desktop** (`schedule.tsx:606-672`): la riga archiviata è una `schedule-aircraft-row` come le altre, nello **stesso ordine per marche**, con la `.res-status` «Archiviato» a tono bad (riuso della regola esistente del pallino o regola additiva `.res-status.archived` — nessun inline) e i **blocchi visibili** (`dayBlocks` filtrati per `aircraftId`, già oggi). Testid nuovo del pill: `schedule-archived-status`.
- **Mobile** (`mobile-agenda.ts:50-71`, `schedule.tsx:776-801`, sheet `:862-883`): `buildAgendaEntries` produce una riga di tipo `archived` **dopo** le AOG e **prima** dei movimenti; i movimenti dell'archiviato **restano** righe normali. Titolo «{marche} archiviato», badge «Archiviato» tono bad, sheet con marche e stato (stessa forma della riga AOG, testo proprio). ⚠️ `row.phase === null` oggi significa «AOG» nel badge (`:795-801`) e nello sheet (`:869-879`): va distinto per `kind`, altrimenti la riga archiviata dice «AOG».
- **Precedenza**: un velivolo archiviato **e** fermo (stato congelato, AD-5) produce **una** riga «Archiviato» e **nessuna** riga/blocco AOG — stessa precedenza del badge della flotta (`fleet-console.tsx:358`).
- **Filtri**: la riga entra nella **stessa** lista `aircraft` che alimenta popover filtri e chip delle marche, quindi la relazione «chip = voci del popover + 1» (`mobile-planning.spec.ts:380-383`, R-15.4-c) resta vera per costruzione.
- **Settimana**: invariata (i conteggi per giorno includono già le prenotazioni dell'archiviato con filtro «Tutti», `schedule.tsx:686-689`).

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record. Ogni AC che dice **«discriminante»** richiede la prova che il test è **ROSSO sul pre-fix simulato**, con repo **ripristinato byte-identico** (sha256). Le misure UI si intendono a **1280×900** e **375×812**, tema **chiaro e scuro**, **IT ed EN**.

### Il conteggio e l'archiviazione (R-16-e)

**AC 1 — Una funzione, tre call-site, la finestra non delimitata (discriminante).**
L'archiviazione conta con `computeAogImpact(tx, { aircraftId, until: null, now })`; l'anteprima dell'Archivio è `GET /api/v1/aircraft/{id}/out-of-service-impact` **senza** `until` (AD-2). Nel record: `grep -n "computeAogImpact(" src/server` → **1 definizione + 3 call-site** (grounding, anteprima, archiviazione), e **zero** conteggi di `Booking` scritti altrove per l'archiviazione. Unit (dalla probe A1): 1 PENDING + 2 APPROVED future (una a +40 giorni: la finestra **non** è delimitata) + 1 CANCELLED + 1 APPROVED già iniziata → **`{ pending: 1, approved: 2, effectiveUntil: null }`**.

**AC 2 — Il numero autoritativo nasce nella transazione e viaggia nella response (discriminante).**
`archiveAircraft` segue AD-3. Unit: ordine **`['tx-start', 'updateMany', 'booking.findMany', 'tx-end', 'send']`**; `where` della `updateMany` asserita **esatta** (`{ id, archivedAt: null }`), `data` **esatto** (`{ archivedAt: <Date> }`); un velivolo già archiviato → `count 0` → **409 `CONFLICT`** «Aircraft is already archived.» **senza** conteggio e **senza** email. Response `{ aircraft, impactedBookings }`: DTO `archiveAircraftResponseSchema` in `schemas/aircraft.ts` (stessa forma di `setOutOfServiceResponseSchema`, `:264-267`), registrato come **`ArchiveAircraftResponse`**, 200 del path `/archive` riscritto — **stesso commit**, verifica **a lettura** dell'OpenAPI generato riportata (AC 14). `unarchive` **invariato** (unit: nessun `booking.findMany`, nessun `send`).

**AC 3 — Email ai soli titolari APPROVED, testo dedicato, best-effort, fan-out non duplicato (discriminante).**
AD-6. Unit: **una** email per titolare APPROVED (due prenotazioni dello stesso titolare → **una** email che nomina la **prima**); **zero** alle PENDING/CANCELLED/già iniziate (dalla probe A3: destinatari **esattamente** `['p_1@…', 'p_2@…']`); `MailSender` che lancia → l'archiviazione risponde comunque, la riga è scritta, il conteggio è nella response, **il secondo destinatario riceve**; persona senza email saltata in silenzio; `unarchive` → `send` **mai** chiamato. `grep` nel record: **una** sola funzione di fan-out in `aircraft.service.ts`, chiamata dai due atti. e2e Mailpit: una email al titolare APPROVED, **zero** al titolare PENDING (che **ha** un'email a fascicolo: un vero «non spedito», come 1b AC 10), contenuto (marche, «archiviato», la prenotazione) nel locale del destinatario (un utente con `locale: 'en'` **esplicito**), filtro per **destinatario run-unique + subject ESATTO** (`Velivolo archiviato: {marche}` / `Aircraft archived: {marche}`).

**AC 4 — Due archiviazioni concorrenti: una vince, una email per titolare.**
e2e: `Promise.all` di due `POST /archive` sullo stesso velivolo (con una APPROVED futura) → `statuses.sort()` **`[200, 409]`**, e in Mailpit **una** sola email per quel titolare. La discriminanza è **unit** (deterministica): la `where` guardata di AC 2 simulata senza `archivedAt: null` (pre-fix = check-then-write) fa fallire l'asserzione esatta e il test «409 senza email».

### La superficie dell'Archivio (AD-4)

**AC 5 — L'anteprima c'è PRIMA di premere Archivia.**
All'apertura dell'editor di un velivolo **non** archiviato, la sezione Archivio mostra `archive-impact-preview`: con N > 0 `.alert-box.info` `role="status"` con titolo dedicato, spacco PENDING/APPROVED, finestra **dedicata** («tutte le prenotazioni future: conteggio non delimitato») e «stima»; con N = 0 **una** `.fld-hint` «Nessuna prenotazione futura su questo velivolo». Mai «rientro da definire», mai una data. **Misurato**: richieste all'apertura dell'editor (atteso: **una** in più, `GET …/out-of-service-impact` senza query); su un velivolo **archiviato** **zero** richieste di anteprima (né dall'Archivio né dalla Disponibilità, AD-9). IT **ed** EN.

**AC 6 — Il doppio passo porta il numero e si annulla senza effetti.**
Primo click su `archive-toggle-button` → **nessuna** scrittura (verificato sul DB, `GET /api/v1/aircraft/{id}` → `archivedAt: null`); la domanda dice il conteggio (`confirmArchiveOne`/`Many`; `confirmArchive` se ignoto o zero); `archive-cancel` (testid **aggiunto** all'Annulla esistente, `aircraft-editor.tsx:1543`) → trigger di nuovo lì, velivolo **non** archiviato (verificato sul DB, non sullo schermo). Chiusura e riapertura del pannello con il passo armato → alla riapertura il passo **non** è armato (misurato, AD-4).

**AC 7 — Il doppio click/tap non archivia (misurato, AD-7).**
Il record riporta la tabella dei box (trigger, domanda, `archive-confirm`, `archive-cancel`) a 1280 e 375, IT/EN, N = 1 / N ≥ 10 / ignoto, e l'esito della procedura di AD-7. Due e2e **in ogni caso**: (a) 1280, `dblclick` sul trigger → **zero** POST verso `/archive`, domanda visibile; (b) 375, contesto `hasTouch`+`isMobile` (con `storageState` della sessione admin: nessun login in più), doppio **tap** sul trigger → **zero** POST; controllo negativo: tap/click **singolo** su `archive-confirm` dopo 800 ms → **una** POST. Se la guardia serve: (a) o (b) **rossi senza la riga** (discriminanza). Se non serve: l'assenza di intersezione è **asserita** nel test.

**AC 8 — Il banner è persistente e porta il numero reale.**
Dopo la conferma, `archive-impact-banner` (`.alert-box.bad`, `role="status"`) col numero della **response**: titolo dedicato, spacco, finestra dedicata, link `archive-impact-bookings-link`. **Verifica**: ancora presente e leggibile **≥ 5 s** dopo la conferma (il toast dura 2600 ms, `toast.tsx:26`: un test sotto quella soglia non prova niente — AC 5 di 1b). Il toast `Velivolo archiviato.` resta **invariato**. Un `unarchive` nella stessa sessione **toglie** il banner. Il link eredita l'inchiostro del box (`.alert-box a`, `airops.css:807`, asserito confrontando `getComputedStyle` col box, mai con un literal).

### Nessuna operazione di stato su un archiviato *(status/codice: Q-16.8-a, opzione A)*

**AC 9 — 409 `AIRCRAFT_ARCHIVED` sulle quattro scritture, atomico, senza effetti (discriminante).**
AD-8. Su un velivolo archiviato: `POST …/out-of-service`, `POST …/return-to-service`, `POST …/hour-meter-adjustments`, `POST …/rates` → **409**, `error.code === 'AIRCRAFT_ARCHIVED'`; **nessuna** scrittura (stato, `HourMeterAdjustment`, contaore, tariffa invariati) e **nessuna** email (il grounding di un archiviato non fa più partire il fan-out: la misura di oggi è 2). Le quattro probe B1-B4 (§4.4) portate in `aircraft.service.test.ts` / `rates.service.test.ts` diventano **verdi**; C4 (grounding di un **non** archiviato) resta **verde**. e2e API su un velivolo run-unique: archivia → le quattro → **409 + codice**; `unarchive` → `out-of-service` **200** (l'unica via funziona). I 409 di oggi (`already out of service` / `already operational`) restano **byte-identici** su un velivolo non archiviato (unit esistenti verdi).

**AC 10 — Lo stato è congelato: l'`unarchive` restituisce il velivolo com'era.**
AD-5. Unit (probe C2): un archiviato `OUT_OF_SERVICE` con motivo → `unarchive` → `archivedAt: null`, **`OUT_OF_SERVICE`**, motivo e `outOfServiceUntil` **invariati**. e2e: ferma (con data) → archivia → ripristina → «Stato attuale» dice lo **stesso** motivo e la **stessa** data. `grep -n "archivedAt" src/server/services/aircraft.service.ts` nel record: l'archiviazione scrive **solo** `archivedAt`.

**AC 11 — La faccia archiviata dell'editor non ha vicoli ciechi.**
AD-9. Su un archiviato: `out-of-service-submit`, `out-of-service-reason`, `out-of-service-until`, `return-to-service-button`, `hour-meter-form`, `new-rate-form` → **count 0**; l'hint archiviato è visibile nelle tre sezioni; `archive-toggle-button` (Ripristina) e `identity-form` **presenti**. Pannello stantio (e2e: aprire l'editor, archiviare via API, poi agire dalla UI) → il messaggio è l'hint archiviato, **mai** `errors.generic` né `errors.conflictRate`, sulle tre azioni. `rates.readOnlyHint` rimossa dai due file e **nessun** riferimento residuo (`grep -rn "readOnlyHint" src/` → 0).

### Il calendario *(Q-16.8-b, opzione A)*

**AC 12 — La riga «Archiviato» mostra le prenotazioni, dove ci sono.**
AD-10. Unit: `buildAgendaEntries` con un archiviato che ha prenotazioni nel giorno → ordine **AOG → archiviato → movimenti** (WHOLE order, lezione 15.3 F8); un archiviato **e** fermo → **una** riga `archived`, **zero** righe `aog`; nessuna riga archiviata senza prenotazioni. Unit di `listArchivedAircraftByIds`: `where` **esatta** `{ id: { in: ids }, archivedAt: { not: null } }`, `select` senza `statusReason`; con `ids` vuoto **nessuna** query (asserito sul chiamante o sulla funzione). Desktop: la riga ha `schedule-archived-status` e **i suoi** `schedule-block`; mobile: la riga archiviata in testa dopo le AOG, badge «Archiviato» (non «AOG») in riga **e** nello sheet. Panoramica: stessa riga, stessa funzione (`grep` dei due call-site nel record). Picker dei form: **nessun** archiviato (e2e: il `<select>`/combobox del form di creazione non contiene le marche archiviate).

**AC 13 — Un e2e conta le proprie, esattamente (discriminante).**
Spec nuovo nel project `chromium` (`fullyParallel`): velivolo e persone **run-unique**, giorno `D = dateOnlyFromToday(+N)` con N ≤ 40 (dentro il `maxAdvanceDays` più restrittivo che la catena scrive, 45 — 1b §E), **2** APPROVED (08:00-09:00Z e 10:00-11:00Z) + **1** PENDING su `D`; archivia via API. A 1280 su `/it/dashboard/bookings?date=D`: **1** `schedule-aircraft-row` per quelle marche, con `schedule-archived-status` e **2** `schedule-block`; a 375 (chip delle marche premuto): **1** riga archiviata + **2** movimenti = **3** `mobile-agenda-row`; su `D+1`: **0** righe per quelle marche. **Rosso sul pre-fix** (la riga non esiste). Nessun aggregato globale, quindi **nessun** project serializzato: la scelta è **scritta e motivata** nel record (AOG-1b §E); `playwright.config.ts` **non** si tocca.

### Contratti, superfici, test

**AC 14 — OpenAPI nello stesso commit, verificato a lettura.**
`registry.ts`: `/archive` 200 → `ArchiveAircraftResponse` con descrizione (R-16-e: conteggio autoritativo, email ai titolari APPROVED, **nessun blocco**, `effectiveUntil` sempre `null`); `/out-of-service-impact` descrizione estesa (AD-2: l'omissione di `until` è anche l'anteprima dell'archiviazione); `/out-of-service`, `/return-to-service`, `/rates` POST: descrizione con `AIRCRAFT_ARCHIVED` (e, se Q-16.8-a = A, la regola dei due status); `/hour-meter-adjustments` POST: **`409` aggiunto** a `errorResponses` (`:1176` oggi dichiara `401, 403, 404, 422`) + descrizione. ⚠️ `registry.test.ts` usa `arrayContaining`: **non** vede niente di tutto questo — il record riporta il JSON generato dei sei punti.

**AC 15 — i18n: stringhe nuove IT+EN, parità 0/0, un orfano rimosso.**
Chiavi nuove (testo **indicativo**, il dev può affinarlo con `design-taste-frontend`, restando nel lessico dell'app):

| Chiave | IT | EN |
|---|---|---|
| `AircraftPage.editor.archive.confirmArchiveOne` | Archiviare questo velivolo? 1 prenotazione impattata | Archive this aircraft? 1 booking impacted |
| `…archive.confirmArchiveMany` (`t.raw`, `{count}`) | Archiviare questo velivolo? {count} prenotazioni impattate | Archive this aircraft? {count} bookings impacted |
| `…archive.impactPreviewNone` | Nessuna prenotazione futura su questo velivolo | No future bookings on this aircraft |
| `…archive.impactPreviewOne` | Archiviando impatti 1 prenotazione. | Archiving impacts 1 booking. |
| `…archive.impactPreviewMany` (`t.raw`) | Archiviando impatti {count} prenotazioni. | Archiving impacts {count} bookings. |
| `…archive.impactWindow` | tutte le prenotazioni future: conteggio non delimitato | every future booking: count not delimited |
| `…archive.impactBannerOne` | Velivolo archiviato: 1 prenotazione impattata. | Aircraft archived: 1 booking impacted. |
| `…archive.impactBannerMany` (`t.raw`) | Velivolo archiviato: {count} prenotazioni impattate. | Aircraft archived: {count} bookings impacted. |
| `…archive.archivedReadOnly` | Velivolo archiviato: ripristinalo per cambiarne stato, contaore o tariffe. | Archived aircraft: restore it to change its status, hour meter or rates. |
| `BookingsPage.schedule.archived` | Archiviato | Archived |
| `BookingsPage.schedule.mobile.archivedTitle` (`t.raw`) | {registration} archiviato | {registration} archived |
| `Emails.aircraftArchived.subject` | Velivolo archiviato: {aircraftRegistration} | Aircraft archived: {aircraftRegistration} |
| `Emails.aircraftArchived.body` | Ciao {firstName},\n\nIl velivolo {aircraftRegistration}, su cui hai una prenotazione approvata, è stato archiviato: è uscito dalla flotta e non è più prenotabile.\n\nLa tua prima prenotazione interessata: {when}\n\nLa prenotazione NON è stata annullata: contatta l'aviosuperficie per concordare come procedere. | Hello {firstName},\n\nAircraft {aircraftRegistration}, which you have an approved booking for, has been archived: it has left the fleet and can no longer be booked.\n\nYour first affected booking: {when}\n\nThe booking has NOT been cancelled: please contact the airfield to agree how to proceed. |

**Riusate** (zero duplicati): `availability.impactSplit`, `availability.impactEstimate`, `availability.impactBookingsLink`, `archive.confirmArchive`, `archive.confirmYes`, `archive.confirmCancel`. **Rimossa**: `AircraftPage.editor.rates.readOnlyHint` (AD-9). Wiring in `fleet/page.tsx:247-255` (+ `t.raw` per i template interpolati, convenzione `:202-217`) e `booking-labels.ts` (`:69`, `:81`). Parità riportata **verbatim** col comando python di 16.3 AC 10: **0/0**, conteggio chiavi prima/dopo.

**AC 16 — Geometria, contrasto, bersagli (misurato).**
Anteprima, domanda, banner, link, hint archiviato, riga «Archiviato» desktop e mobile: box a 375 e 1280; **contrasto WCAG ≥ 4,5:1** di ogni pixel di testo nuovo, calcolato (canvas → sRGB → WCAG, sfondo effettivo risalendo gli antenati, cascata reale — lezioni 13.9/15.9; letto col puntatore lontano e **dopo** il transition, 1b §C), nei **due temi**; `[role=dialog]` e `.so-body` **invariati** al centesimo; overflow-X **0**; la crescita della sezione Archivio (l'ultima del pannello) dichiarata in px. **Nessun `var(--bad)`/`var(--ok)` inline nuovo** (`git diff -U0 | grep '^+.*var(--bad)\|^+.*var(--ok)'` → 0). I controlli dell'Archivio restano a 34,84 a ≤640 per ratifica **R-15.10-f** (azioni secondarie di sezione): **dichiarato**, non toccato (TD 16.8-f verso la 18.1). Verifica UI interattiva col Playwright MCP o, dove non disponibile, lo script `playwright-core` throwaway sanzionato (HANDOFF).

**AC 17 — Nessuna regressione su AOG-1a/1b.**
I test e2e di `aog-impact-email.spec.ts`, `aircraft-out-of-service-until.spec.ts`, `aircraft-status-hours.spec.ts`, `aircraft-management.spec.ts`, `aircraft-rates.spec.ts` verdi **senza modifiche** alle loro asserzioni; unit `aog-impact.test.ts` (9) **intatto**; le asserzioni esatte di §3.6 aggiornate **al valore corretto**. Il record riporta la misura post-16.8 di `out-of-service-submit` (**479×34,84** a 1280, **335×44** a 375) e dei due controlli del doppio passo del fermo (1b R.1-2): **identici al centesimo**.

**AC 18 — Unit in shell pulita, convenzioni e2e, gate.**
- `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` **verde** su ogni file toccato — `aircraft.service.test.ts` importa già la catena posta mockata (`vi.mock('@/server/adapters/mail')` + `'@/server/adapters/mail/templates'`): il mock di `templates` va **esteso** con `buildAircraftArchivedEmail`, altrimenti il fan-out dell'archiviazione chiama `undefined` e il `try/catch` lo inghiotte in silenzio (§5).
- **testid nuovi** (`archive-impact-preview`, `archive-impact-banner`, `archive-impact-bookings-link`, `archive-cancel`, `schedule-archived-status`): **un solo nodo a tutte le larghezze** ⇒ né `-mobile` né `mobile-`. Audit **obbligatorio** prima di sceglierli: `grep -rn 'data-testid\^=' e2e/` — sul HEAD 12 prefissi letterali + il loop `${prefix}` di `mobile-reports.spec.ts` (`ac-card-`, `flight-row-mobile`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-instructor-row-`, `mobile-pilot-row-`, `mobile-tail-chip-`, `pilot-row-`, `reports-fleet-row-`, `reports-rank-aircraft-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`): **nessuno** copre i nomi sopra. La riga mobile archiviata è una `mobile-agenda-row` (come la riga AOG): nessun testid nuovo lì.
- selettori scoped o `exact: true`; **mai** `hasText` con date/`H:MM` (lezione 11.2 — la story mette date e numeri in pagina); fixture **mai** time-dependent (lezione 15.4 F1); `ensureValidSeedExpiries` su ogni persona che prenota (1b §E).
- `npm run gates` verde (output compatto). Suite e2e completa su build di produzione **solo** via `scripts/e2e.sh start` + `scripts/e2e.sh status` (mai `playwright test` in foreground; assenza di `E2E_EXIT=` + nessun processo vivo = run MORTO); `export JOBS_SECRET=<non-placeholder>` prima di ogni suite `CI=1`; per una serie: build una volta + `E2E_REUSE_SERVER=1`.

---

## §3 — Dev Notes: blast radius (misurato su `09dd893`)

### 3.1 — File da modificare

**Dominio / contratti (6)**
1. `src/server/services/aircraft.service.ts` — `archiveAircraft:373-390` (AD-3); `setOutOfService:454-470` e `returnToService:607-613` (AD-8, `where` + scelta del codice); `adjustHourMeter:645-650` (AD-8, `SELECT` + guardia); il fan-out `:543-589` generalizzato (AD-6) e i suoi due chiamanti (`:481` + archiviazione); doc-comment di `archiveAircraft` e `previewOutOfServiceImpact:489-503` (AD-2). Tipo `ArchiveAircraftResult` (stessa forma di `SetOutOfServiceResult:54-57`; alias ammesso).
2. `src/server/services/rates.service.ts:156-158` — terzo argomento del `ConflictError` (AD-8); doc-comment `:133-144` allineato.
3. `src/server/services/bookings.service.ts` — `listArchivedAircraftByIds` accanto a `:1248-1256` (AD-10). **Nient'altro** in questo file (i tre 409 `CONFLICT` sull'archiviato restano: TD 16.8-a).
4. `src/lib/schemas/aircraft.ts` — `archiveAircraftResponseSchema` dopo `setOutOfServiceResponseSchema:264-267`.
5. `src/lib/schemas/registry.ts` — `:267-268` (registrazione schema), `:1075-1087`, `:1102-1120`, `:1121-1135`, `:1136-1148`, `:1163-1178`, `:1195-1208` (AC 14).
6. `src/app/api/v1/aircraft/[id]/archive/route.ts` — **nessuna riga**: passa avanti ciò che il service restituisce (come la rotta `out-of-service` in 1b).

**Email (3)**
7. `src/server/adapters/mail/templates.ts` — `buildAircraftArchivedEmail` dopo `:397`.
8. `messages/it.json` + `messages/en.json` — `Emails.aircraftArchived` (accanto a `aircraftGrounded`, `:2384`), `AircraftPage.editor.archive.*` (`:1088-1096`), rimozione `rates.readOnlyHint` (`:1071`), `BookingsPage.schedule.archived` (`:1606`) e `schedule.mobile.archivedTitle` (`:1612`).

**UI (7)**
9. `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` — label type `archive:134-142` (+ rimozione `rates.readOnlyHint:116`); `ArchiveSection:1503-1555` (anteprima, domanda col numero, `archive-cancel`, banner, eventuale guardia AD-7, response a wrapper solo per `archive`); `AvailabilitySection:743-1113`, `RatesSection:1244-1277`, `HourMeterSection:1425-1461` (AD-9, faccia archiviata); i tre/quattro rami d'errore `:855-858`, `:878-881`, `:1218-1221`, `:1401-1404` (AD-9, pannello stantio).
10. `src/app/[locale]/dashboard/fleet/page.tsx:230` (rimozione) e `:247-255` (wiring).
11. `src/app/[locale]/dashboard/bookings/schedule.tsx` — `ScheduleAircraftRow:48-54` / `ScheduleAgendaRow:63-82` (il tipo `archived`); righe desktop `:606-672`; badge riga `:795-801`; `agendaTitle:322-324`, `agendaSub:335-339`, `agendaDetailRows:341-355`, sheet `:862-883`.
12. `src/lib/mobile-agenda.ts:33-71` — la riga `archived`, la precedenza sull'AOG.
13. `src/app/[locale]/dashboard/bookings/page.tsx` — `:143`/`:248` (derivazione degli id assenti + `listArchivedAircraftByIds`), `:286-320` (agenda), `:434` (solo `Schedule` riceve le righe archiviate; `:459` invariato).
14. `src/app/[locale]/dashboard/page.tsx` — `:313`/`:673` (stesse righe per la timeline della Panoramica; `:704` invariato).
15. `src/app/[locale]/dashboard/bookings/booking-labels.ts:69`, `:81` — le due label nuove.
+ `src/styles/airops.css` **solo se** serve una regola additiva `.res-status.archived` (preferire il riuso; nessun inline).

⚠️ `new-booking-form.tsx:21`: `AircraftOption` è **strutturalmente condiviso** con `ScheduleAircraftRow` («so `page.tsx` can hand `aircraftOptions` to both … without a cast»). Un campo **obbligatorio** nuovo sul tipo della riga rompe quel passaggio: tipo discriminato o campo opzionale, a scelta del dev, motivata.

### 3.2 — Censimento `AIRCRAFT_ARCHIVED` e dell'archiviato sulle scritture (HEAD)

| Percorso | Oggi | Dopo (Q-16.8-a = A) |
|---|---|---|
| `POST /flights` / `/correct` su archiviato | **422 `AIRCRAFT_ARCHIVED`** (`flights.service.ts:667`) | invariato |
| `POST /flights/{id}/cancel` (storno, riduce il contaore anche di un archiviato) | **sempre permesso** (registry `:991`) | invariato — AOG-1a AD-4: uno storno deve sempre potersi fare |
| `POST/PATCH /bookings`, transition → APPROVED | **409 `CONFLICT`** «Aircraft is archived.» (`bookings.service.ts:554`, `:922`, `:1151`) | invariato (TD 16.8-a) |
| `POST /aircraft/{id}/rates` | **409 `CONFLICT`** (`rates.service.ts:157`) | **409 `AIRCRAFT_ARCHIVED`** |
| `POST /aircraft/{id}/out-of-service` | **200** + fan-out email | **409 `AIRCRAFT_ARCHIVED`** |
| `POST /aircraft/{id}/return-to-service` | **200** | **409 `AIRCRAFT_ARCHIVED`** |
| `POST /aircraft/{id}/hour-meter-adjustments` | **200** | **409 `AIRCRAFT_ARCHIVED`** (409 **aggiunto** al registry) |
| `GET /aircraft/{id}/out-of-service-impact` | 200 | invariato (lettura, AD-2) |
| `PATCH /aircraft/{id}` (anagrafica) | 200 | invariato (non è stato, AD-9) |
| `POST /aircraft/{id}/archive` su archiviato | 409 `CONFLICT` | invariato (ora atomico) |
| `POST /aircraft/{id}/unarchive` su non archiviato | 409 `CONFLICT` | invariato |

### 3.3 — Il mapping HTTP e i `details`

`handler.ts:30-40`: `ConflictError` → 409, `ValidationError` → 422; il `code` viaggia così com'è (`:66`), e dalla 16.2 anche i `details` dei `ConflictError` (`:65`). Nessun `details` sul nuovo 409 (nessun dato da nominare: il velivolo è quello del path). Nessuna riga di `handler.ts` cambia.

### 3.4 — Il calendario oggi, per un velivolo archiviato con prenotazioni APPROVED nel giorno

| Superficie | Oggi | Riga |
|---|---|---|
| timeline desktop, vista giorno (Pianificazione e Panoramica) | **nessuna riga** ⇒ i blocchi **non si disegnano**; e poiché `dayBlocks.length > 0`, il messaggio `dayEmpty` (`schedule.tsx:676`) **non** compare neanche se nessuna riga visibile ha blocchi | `schedule.tsx:606-608`, `bookings.service.ts:1252` |
| vista settimana | **contate** col filtro «Tutti» | `schedule.tsx:686-689` |
| agenda mobile | **righe normali** (marche dalla prenotazione), nessuna riga di contesto, nessun chip per filtrarle | `mobile-agenda.ts:59-70`, `schedule.tsx:730-752` |
| lista prenotazioni | righe normali | invariata (§6) |

### 3.5 — Blast radius e2e (censimento completo: `grep -rn "archive" e2e/`)

| # | file:riga | Cosa fa | Effetto della story | Azione |
|---|---|---|---|---|
| 1 | `e2e/aircraft-management.spec.ts:136-171` | UI: `archive-toggle-button` → `archive-confirm` → toast «Velivolo archiviato» → Escape; poi Ripristina a due click | il doppio passo **esisteva già**: stessi due click; l'anteprima è un fetch in più; un `.click()` Playwright ha `detail 1` e passa l'eventuale guardia | **nessuna**: deve restare verde **senza modifiche** (AC 17) |
| 2 | `e2e/bookings.spec.ts:102-106` (helper) usato a `:762` (su `09dd893`; al momento della ricognizione un'altra sessione ha **modifiche non committate** a questo file, +43 righe, che spostano la chiamata a `:790` — rileggere) | `POST /archive` in `finally`, asserisce **solo** lo status 200 | 200 invariato; 6 velivoli **senza** prenotazioni ⇒ conteggio 0, nessuna email | nessuna |
| 3 | `e2e/mobile-reports.spec.ts:464` | `POST /archive` in `finally`, body ignorato | idem | nessuna |
| 4 | `e2e/mobile-settings.spec.ts:629` | idem (velivolo con un volo, nessuna prenotazione) | idem | nessuna |
| 5 | `e2e/mobile-registries.spec.ts:718` | idem (21 velivoli per la paginazione) | idem | nessuna |
| 6 | `e2e/mobile-planning.spec.ts:380-383` | relazione chip = popover + 1 | vera per costruzione (AD-10, stessa lista) | nessuna — **non** separare le due liste |
| 7 | `e2e/mobile-planning.spec.ts:307-317` | la riga AOG precede il primo movimento | la riga archiviata sta fra AOG e movimenti: l'indice AOG resta minore | nessuna |

**Nessuno** spec opera su un velivolo archiviato (out-of-service/return/contaore/tariffe dopo un `/archive`): il 409 nuovo non ne rompe nessuno. **Nessuno** legge il body di `/archive`: il wrapper non ne rompe nessuno. Il dev **rifà** questo censimento sul suo HEAD e lo riporta.

### 3.6 — Unit esistenti che cambiano (e quelli che NON devono cambiare)

| file:riga | Cosa succede | Azione |
|---|---|---|
| `aircraft.service.test.ts:568-590` (`archiveAircraft`) | «already archived» mocka `findUnique` archiviato e basta; «sets archivedAt» asserisce `updateMock` con `objectContaining` | riscrivere sul nuovo percorso (`mockInteractiveTransaction()`, `updateMany` `{count}`): `where`/`data` **esatti**, `result.aircraft.archivedAt`, `result.impactedBookings` |
| `aircraft.service.test.ts:634`, `:680` (`setOutOfService`, `where` **esatta** `{ id, status: 'OPERATIONAL' }`) | la `where` guadagna `archivedAt: null` | aggiornare **al valore corretto**, commento che cita AD-8 e la deviazione da 1b AD-3; **mai** `objectContaining` |
| `aircraft.service.test.ts:1020` (`returnToService`, `where` esatta) | idem con `status: 'OUT_OF_SERVICE'` | idem |
| `aircraft.service.test.ts:1063`, `:1086` (`queryRaw.mockResolvedValue([{ hourMeterMinutes: 750 }])`) | ⚠️ con la guardia, `archivedAt` è **`undefined`** e `undefined !== null` ⇒ **409 su ogni test del contaore** | aggiungere `archivedAt: null` alle fixture (il tipo di `queryRaw` a `:117-118` cresce) — **la trappola più insidiosa della story** |
| `aircraft.service.test.ts:61-63` (mock di `templates`) | espone solo `buildAircraftGroundedEmail` | aggiungere `buildAircraftArchivedEmail` |
| `rates.service.test.ts:98-101` («throws ConflictError for an archived aircraft») | resta verde (la classe non cambia) | **aggiungere** `code: 'AIRCRAFT_ARCHIVED'` all'asserzione (è la discriminanza di B4) |
| `aog-impact.test.ts` (9), `templates.test.ts` (20, i test di `buildAircraftGroundedEmail` `:249+`), `mobile-agenda.test.ts` (16), `booking-schedule.test.ts` (10) | **devono restare verdi senza modifiche**; si **aggiungono** casi | ⚠️ se un test esistente di `aog-impact.test.ts` cambia, la funzione di dominio è stata toccata ⇒ **indagare, non aggiornare** |
| Baseline in shell pulita su `09dd893` | `aircraft.service.test.ts` **72**, `rates.service.test.ts` **30**, `aog-impact.test.ts` **9**, `templates.test.ts` **20**, `mobile-agenda.test.ts` **16**, `booking-schedule.test.ts` **10** | il record riporta prima/dopo |

---

## §4 — Piano di test

### 4.1 — Unit

1. `aircraft.service.test.ts` — **archiviazione**: finestra non delimitata e stati (AC 1); ordine `tx-start → updateMany → booking.findMany → tx-end → send`, `where`/`data` esatti, 409 senza conteggio né email (AC 2); fan-out: una per titolare, prima prenotazione, niente PENDING, mail che lancia → risponde e il secondo riceve, persona senza email saltata, `unarchive` muto (AC 3).
2. `aircraft.service.test.ts` — **le guardie**: B1-B3 della probe (AC 9), la scelta del codice su `count 0` (archiviato → `AIRCRAFT_ARCHIVED`; non archiviato → il 409 di oggi, messaggio esatto), `adjustHourMeter` che non crea l'adjustment; C2 (stato congelato, AC 10), C4 (grounding normale).
3. `aircraft.service.test.ts` — **il pin di AD-2**: `previewOutOfServiceImpact(actor, id, {})` interroga `booking.findMany` **senza** `lt` e risponde `effectiveUntil: null` (è la lettura che l'Archivio fa).
4. `rates.service.test.ts` — B4 (`code: 'AIRCRAFT_ARCHIVED'`).
5. `templates.test.ts` — `buildAircraftArchivedEmail` IT/EN: subject esatto, marche, «archiviato»/«archived», la prenotazione nel locale, «NON è stata annullata»/«has NOT been cancelled»; **mai** «fino al», «rientro», «Motivo».
6. `mobile-agenda.test.ts` — AOG → archiviato → movimenti; archiviato + fermo → una sola riga `archived`; nessuna riga archiviata senza prenotazioni.
7. `bookings.service.test.ts` — `listArchivedAircraftByIds`: `where`/`select` esatti; `ids` vuoto → nessuna query (o il chiamante non la invoca: provato dove vive la regola).

### 4.2 — e2e (project `chromium` `fullyParallel`, velivoli/persone run-unique, `setViewportSize` dentro il test)

Spec nuovo (es. `e2e/archive-impact.spec.ts`), fixture ricalcate su `aog-impact-email.spec.ts` (`createAircraft`, `createPilotPerson`, `book`, `openFleetEditor`, `waitForMailpitMessage` — righe `:41-153`):
1. anteprima all'apertura (spacco esatto sulle proprie prenotazioni: 1 PENDING + 2 APPROVED, una a +40, + 1 CANCELLED che non conta), domanda col numero, **Annulla** → DB non archiviato; **Conferma** → banner col numero della response, **≥ 5 s**; Mailpit: 1 email per titolare APPROVED (uno con `locale: 'en'`), **0** al PENDING; subject esatto (AC 3, 5, 6, 8);
2. zero prenotazioni → anteprima compatta, domanda senza numero (AC 5, 6);
3. doppio click 1280 / doppio tap 375 (AC 7);
4. due archiviazioni concorrenti → `[200, 409]` + una email (AC 4);
5. le quattro operazioni su un archiviato → 409 + codice; `unarchive` → `out-of-service` 200; ferma-archivia-ripristina → stesso motivo e data (AC 9, 10);
6. faccia archiviata dell'editor + pannello stantio (AC 11);
7. la riga «Archiviato» su `?date=D` a 1280 e 375, e la sua assenza su `D+1`; i picker senza archiviati (AC 12, 13).

### 4.3 — Tabella guardia → discriminanza (ognuna ROSSA sul pre-fix simulato, ripristino sha256)

| # | Guardia | Simulazione del pre-fix | Rosso atteso |
|---|---|---|---|
| D1 | conteggio nella response (AC 1/2) | `archiveAircraft` di oggi (check-then-write, nessun conteggio) | probe A1/A2: `expected undefined to deeply equal { pending: 1, approved: 2, … }`, `$transaction` 0 volte |
| D2 | email ai soli APPROVED (AC 3) | fan-out non chiamato dall'archiviazione / chiamato su tutte le impattate | A3: `expected [] to deeply equal [ 'p_1@…', 'p_2@…' ]` / email al PENDING (e2e) |
| D3 | atomicità dell'archiviazione (AC 4) | `where: { id }` senza `archivedAt: null` | unit «409 senza email» e `where` esatta |
| D4 | fermo su archiviato (AC 9) | `where` di `setOutOfService` senza `archivedAt: null` | B1: `promise resolved … instead of rejecting` |
| D5 | rientro su archiviato (AC 9) | `where` di `returnToService` senza `archivedAt: null` | B2 |
| D6 | contaore su archiviato (AC 9) | `SELECT` senza `"archivedAt"` / guardia rimossa | B3 |
| D7 | codice delle tariffe (AC 9) | terzo argomento rimosso | B4: `code: "CONFLICT"` |
| D8 | banner ≥ 5 s (AC 8) | banner con la vita del toast (`setTimeout(…, 2600)`), build ricompilata | e2e: `toBeVisible` dopo i 6 s → *not found*, asserzioni immediate verdi |
| D9 | doppio click/tap (AC 7) | **solo se la guardia serve**: riga `if (event.detail > 1) return;` sostituita da `void event;`, build ricompilata | e2e (a) o (b): una POST verso `/archive` |
| D10 | riga «Archiviato» (AC 13) | righe della timeline = solo `listBookableAircraft` (oggi) | e2e: `schedule-aircraft-row` per quelle marche **0** |
| D11 | precedenza archiviato > AOG (AC 12) | la riga `aog` costruita prima del controllo `archived` | unit: una riga `aog` in più |

### 4.4 — La probe di partenza (già scritta ed eseguita, fuori dal repo)

`/tmp/claude-1000/-home-admin-AirManager/87e8c4a0-e70c-4ef9-934e-3d9b5a5f0be7/scratchpad/story-16-8/archive-guards.probe.test.ts` + `vitest.probe.config.mjs` (oggetto **letterale**, non `defineConfig`: da `/tmp` `vitest/config` non si risolve — lezione della probe 16.3). Il fake di Prisma **valuta la `where`** che riceve contro una riga in memoria e le sue prenotazioni (disciplina di `aog-impact.test.ts`): ogni asserzione è **comportamentale**, indipendente da dove il fix metta il controllo. Se lo scratchpad non c'è più, i suoi 11 casi sono elencati qui sotto e si ricostruiscono dentro `aircraft.service.test.ts`/`rates.service.test.ts` con le mock chain esistenti.

Comando: `cd /home/admin/AirManager && env -u DATABASE_URL -u AUTH_SECRET npx vitest run --config <scratchpad>/story-16-8/vitest.probe.config.mjs --reporter=verbose`. Output **verbatim** (prefisso del path abbreviato in `…/`):

```
 RUN  v4.1.9 /home/admin/AirManager
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — archiving counts and warns like the grounding (R-16-e) > A1 the archive response carries the AUTHORITATIVE count over an undelimited window: 1 pending, 2 approved 20ms
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — archiving counts and warns like the grounding (R-16-e) > A2 the archive counts INSIDE its transaction (booking.findMany runs, via $transaction) 2ms
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — archiving counts and warns like the grounding (R-16-e) > A3 the two APPROVED holders get ONE email each, the PENDING/CANCELLED/past holders none 6ms
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — no state operation works on an archived aircraft (AC 2) > B1 setOutOfService on an archived aircraft answers 409 AIRCRAFT_ARCHIVED, writes nothing, emails nobody 10ms
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — no state operation works on an archived aircraft (AC 2) > B2 returnToService on an archived (frozen OUT_OF_SERVICE) aircraft answers 409 AIRCRAFT_ARCHIVED and leaves it OUT_OF_SERVICE 4ms
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — no state operation works on an archived aircraft (AC 2) > B3 adjustHourMeter on an archived aircraft answers 409 AIRCRAFT_ARCHIVED and writes no adjustment 5ms
 × …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — no state operation works on an archived aircraft (AC 2) > B4 createAircraftRate on an archived aircraft answers 409 AIRCRAFT_ARCHIVED (today: 409 with the generic CONFLICT code) 8ms
 ✓ …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — control pins (green before AND after) > C1 archiving an aircraft with no live booking still archives (no block, R-16-e) and sends nothing 1ms
 ✓ …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — control pins (green before AND after) > C2 unarchive stays the way back: it clears archivedAt and KEEPS the frozen state (OUT_OF_SERVICE + reason) 1ms
 ✓ …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — control pins (green before AND after) > C3 archiving an already-archived aircraft is still a 409 1ms
 ✓ …/story-16-8/archive-guards.probe.test.ts > story 16.8 probe — control pins (green before AND after) > C4 setOutOfService on a NON-archived aircraft still grounds it (the new guard must not catch the normal path) 1ms
 FAIL  … > A1 the archive response carries the AUTHORITATIVE count over an undelimited window: 1 pending, 2 approved
AssertionError: expected undefined to deeply equal { pending: 1, approved: 2, …(1) }
 FAIL  … > A2 the archive counts INSIDE its transaction (booking.findMany runs, via $transaction)
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 FAIL  … > A3 the two APPROVED holders get ONE email each, the PENDING/CANCELLED/past holders none
AssertionError: expected [] to deeply equal [ 'p_1@example.test', …(1) ]
 FAIL  … > B1 setOutOfService on an archived aircraft answers 409 AIRCRAFT_ARCHIVED, writes nothing, emails nobody
AssertionError: promise resolved "{ …(2) }" instead of rejecting
 FAIL  … > B2 returnToService on an archived (frozen OUT_OF_SERVICE) aircraft answers 409 AIRCRAFT_ARCHIVED and leaves it OUT_OF_SERVICE
AssertionError: promise resolved "{ id: 'ac_1', …(13) }" instead of rejecting
 FAIL  … > B3 adjustHourMeter on an archived aircraft answers 409 AIRCRAFT_ARCHIVED and writes no adjustment
AssertionError: promise resolved "{ id: 'ac_1', …(13) }" instead of rejecting
 FAIL  … > B4 createAircraftRate on an archived aircraft answers 409 AIRCRAFT_ARCHIVED (today: 409 with the generic CONFLICT code)
AssertionError: expected ConflictError: Cannot add a rate to an ar… { …(2) } to match object { code: 'AIRCRAFT_ARCHIVED' }
 Test Files  1 failed (1)
      Tests  7 failed | 4 passed (11)
```

I **quattro verdi** provano che la probe non è degenere: C1 (archiviare senza prenotazioni resta possibile, invariante [b]), C2 (lo stato congelato sopravvive all'`unarchive`, AD-5), C3 (il 409 «già archiviato» c'è già), C4 (il grounding di un non archiviato funziona: la guardia nuova non deve catturare il percorso normale). **Il dev porta i sette rossi a verde e i quattro verdi restano verdi.** Misura accanto (`measure.probe.test.ts`, stessa cartella, verde per costruzione): `MEASURE status=OUT_OF_SERVICE archivedAt=2026-09-01T10:00:00.000Z impacted={"pending":0,"approved":2,"effectiveUntil":null} emailsSent=2`.

### 4.5 — Gate

`npm run gates` → unit per file in shell pulita → **DB fresco** (su questa macchina: `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 5 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`, **solo** dopo aver verificato che la sessione principale non stia usando :3000 — memoria «sessioni parallele») → `scripts/e2e.sh start` + `status`, esito verbatim nel record.

---

## §5 — Trappole note

- **`queryRaw` del contaore nei unit**: le fixture `[{ hourMeterMinutes: 750 }]` (`aircraft.service.test.ts:1063`, `:1086`) non hanno `archivedAt`; appena la guardia lo legge, `undefined !== null` e **ogni** test del contaore prende 409. Sembra un difetto della guardia: è la fixture (§3.6).
- **Il mock di `templates` inghiotte il template mancante**: `vi.mock('@/server/adapters/mail/templates', …)` sostituisce il **modulo intero**; se `buildAircraftArchivedEmail` non è nel factory, il fan-out chiama `undefined`, il `try/catch` per destinatario lo logga e **nessuna email parte** — un test «una email per titolare» fallisce per la ragione sbagliata, o uno «best-effort» passa per la ragione sbagliata.
- **La `where` guardata ha due assi adesso**: su `count === 0` la rilettura serve a **scegliere il messaggio**; non trasformarla in una seconda scrittura né in un secondo controllo che decide. E il 409 di oggi (`'Aircraft is already out of service.'` / `'…already operational.'`) resta **byte-identico** sul non archiviato: le asserzioni esistenti lo pinnano.
- **Il toast è il trabocchetto del banner** (2600 ms, `toast.tsx:26`): la soglia è ≥ 5 s, scritta sul requisito.
- **`effectiveUntil` è sempre `null` per l'archiviazione**: riusare `windowText` della Disponibilità (`aircraft-editor.tsx:929-935`) darebbe «rientro da definire: conteggio non delimitato» — falso, non c'è rientro. La frase è **`archive.impactWindow`**.
- **`row.phase === null` vuol dire «AOG» oggi** in due punti di `schedule.tsx` (`:795-801`, `:869-879`): una riga archiviata senza `phase` direbbe «AOG». Distinguere per `kind`.
- **Righe archiviate nei picker**: `aircraftOptions` alimenta **anche** i form (`bookings/page.tsx:459`, `dashboard/page.tsx:704`). Un archiviato nel picker = un 409 garantito alla creazione. Le righe archiviate vanno **solo** a `Schedule`.
- **Filtri a due liste**: se chip e popover ricevessero liste diverse, `mobile-planning.spec.ts:380-383` rompe (R-15.4-c): **una** lista.
- **Fixture sul giorno `D`**: la riga archiviata compare a **chiunque** guardi `D` — come ogni velivolo con prenotazioni, quindi niente di nuovo; ma **mai** su «oggi» (la Panoramica è di oggi e diversi spec ne leggono l'agenda): la Panoramica si prova per costruzione (stessa funzione, `grep` dei due call-site), non con una fixture time-dependent (lezione 15.4 F1).
- **Ordine delle creazioni**: una prenotazione su un archiviato **non si crea** (409). Creare le prenotazioni **prima**, poi archiviare.
- **`Escape` e i pannelli**: `SlideOver` chiude l'intero pannello (CLAUDE.md); lo spec esistente `aircraft-management.spec.ts:148` lo usa **dopo** il toast, ed è corretto. Nei test nuovi, mai `Escape` per chiudere un popup e poi asserire sul pannello.
- **Mailpit è stato globale**: filtro per destinatario run-unique + subject **esatto**; mai `messages[0]`, mai totali (AOG-1b §E, AC 12).
- **Lock anti-brute-force (TD-6)**: ripetere run mirati sullo stesso DB fa fallire alla riga di login dopo ~10 login; prima di chiamarla flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1` (`docker compose exec -T postgres psql -U airmanager -d airmanager`).
- **17.2 cambierà la fonte delle righe della timeline** (righe scelte dal server): la regola «righe archiviate solo dove ci sono prenotazioni» deve sopravvivere — è per questo che AD-10 la **dichiara** con una query invece di dedurla (TD 16.8-c).
- **Porta 3000**: la sessione principale può avere una suite in corso: chiedere prima di avviare server o resettare il DB.

---

## §6 — Fuori scope DICHIARATO

- **Bloccare** l'archiviazione o **annullare in cascata** le prenotazioni: scartati da R-16-e.
- **Email all'`unarchive`**, **email alle PENDING**, canali nuovi (push/in-app), marcatura della prenotazione nelle liste del pilota: esclusi come in 1b.
- **La riga persistente a ogni riapertura** dell'editor di un archiviato (1b AC 6): il portatore persistente è la riga «Archiviato» del calendario (AD-4). Se il PO la vuole, è una label e una riga di JSX, ma non è ratificata.
- **Allineare i tre 409 `CONFLICT` «Aircraft is archived.» delle prenotazioni** al codice specifico: TD 16.8-a (tocca tre rami client e la story 16.3/16.7 sugli stessi file).
- **Un lock sulle tariffe** contro l'archiviazione concorrente: TD 16.8-b.
- **Cap, coda o batching** del fan-out: TD della 17.8 (decisione PO 1b 5), che ora copre due atti.
- **Il filtro per velivolo** nel link del banner: arriva con la 17.2 (decisione PO 1b 4), per entrambi i banner.
- **Il pavimento 44 px dei controlli dell'Archivio** a ≤640: R-15.10-f li ha lasciati dove sono; TD 16.8-f verso la **18.1**.
- **Il riallineamento automatico del pannello stantio** dopo un 409 `AIRCRAFT_ARCHIVED`: TD 16.8-e.
- **`PATCH /aircraft/{id}`** (anagrafica) e **lo storno di un volo** su un archiviato: non sono operazioni di stato del velivolo (AD-9, AOG-1a AD-4).
- **Panoramica mobile, lista prenotazioni, export**: mostrano già le prenotazioni dell'archiviato come righe normali; il perimetro di P3 è «il calendario».
- **Il TD `OPTIONS_PAGE_SIZE`**, il **TD 14.8 F6**, i **40 `var(--bad)`/`var(--ok)` inline**: dichiarati altrove, nessuno toccato.

---

## §7 — Riferimenti

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — **contratto**: «Story 16.8», **R-16-e**, «Architettura e vincoli», «Regole di processo».
- `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` — **§F7** (sonde 20-21, i due difetti, il rimedio con le due alternative scartate), «Macchine a stati» riga Aircraft, §6 domanda 4 (chiusa da R-16-e).
- `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` — AD-1..AD-8, §C misure, §E convenzioni e isolamento, §G decisioni non ovvie (wrapper, fan-out batch, idioma dell'Archivio), **Review Record** (decisioni PO 1-6, R.1-6 nota per la 16.8).
- `_bmad-output/implementation-artifacts/aog-1b-review-report.md` — MAJOR-1 (la frase ricostruita a valle), MAJOR-2 (la geometria del doppio click).
- `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` — AD-2, AD-4, **AD-9**.
- `_bmad-output/implementation-artifacts/16-3-prenotazioni-persona-istruttore-approvazione.md` / `16-2-guardie-registro-voli.md` — formato di casa, probe fuori repo, `details` sul filo.
- `CLAUDE.md` — testid `-mobile`/`mobile-` e la regola `^=`, `scripts/e2e.sh`, catena serializzata, unit + env eager, gates, `Escape`/`SlideOver`, TD-6.
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, reset DB, `JOBS_SECRET`, `playwright-core` fallback per i subagent.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§0 Q-16.8-a/b), semplicità (AD-2: nessun endpoint nuovo; AD-5: zero righe per lo stato; AD-7: la guardia solo se la misura la chiede), chirurgia (AD-6: generalizzare, non forkare), criteri verificabili (§2, §4.3).
- Probe della ricognizione (fuori dal repo): `/tmp/claude-1000/-home-admin-AirManager/87e8c4a0-e70c-4ef9-934e-3d9b5a5f0be7/scratchpad/story-16-8/{archive-guards.probe.test.ts, measure.probe.test.ts, vitest.probe.config.mjs}`.

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 16.8-a** | I tre 409 delle prenotazioni su velivolo archiviato (`bookings.service.ts:554/922/1151`) restano `CONFLICT` generico «Aircraft is archived.»: il client non li distingue da una sovrapposizione. Allinearli al codice specifico tocca tre rami client (`new-booking-form`, `edit-booking-form`, `booking-transition`) — gli stessi della 16.3. |
| **TD 16.8-b** | `createAircraftRate` resta check-then-write contro un'archiviazione concorrente (`rates.service.ts:152-158`): una tariffa può atterrare su un velivolo archiviato nello stesso istante. Innocuo, nessun AC lo chiede. |
| **TD 16.8-c** | Per la **17.2**: quando le righe della timeline diventano scelte dal server, la regola «riga Archiviato solo dove ci sono prenotazioni APPROVED nel range» (AD-10) va portata nella query delle righe. |
| **TD 16.8-d** | Il fan-out in-request (TD verso la 17.8, decisione PO 1b 5) copre ora **due** atti: grounding e archiviazione. |
| **TD 16.8-e** | Dopo un 409 `AIRCRAFT_ARCHIVED` da pannello stantio l'editor mostra il messaggio ma non si riallinea (resta la faccia pre-archiviazione fino alla riapertura). |
| **TD 16.8-f** | I controlli dell'Archivio restano a 34,84 px a ≤640 (R-15.10-f); con l'archiviazione diventata un atto con fan-out, la **18.1** («un pavimento mobile unico») è la casa naturale. |

---
