---
baseline_commit: b5a2c93
---

# Story AOG-1b: «Stai per impattare N prenotazioni» — l'anteprima, la conferma a due passi, il numero reale nella response e l'email ai piloti con una prenotazione approvata

Status: **done** — 2026-08-07: dev Opus 5 xhigh (Dev Agent Record in coda; `npm run gates` verde a 1 819 unit, suite e2e completa verde, §L). 2026-09-26: review SHIPPABLE-WITH-FIXES chiusa dal fix `a1b2362` sulle cinque decisioni PO del 2026-09-10 e dal fix `b12feef` sulla decisione PO 6 dello stesso giorno (doppio click ignorato sul Conferma) — «Review Record — AOG-1b» in fondo al file.

> ⚠️ **Baseline effettiva**: il frontmatter dichiara `b5a2c93` perché è il commit su cui è stata **misurata** la ricognizione e su cui sono ancorati **tutti** i riferimenti `file:riga` di questo file. La baseline **reale** di questa story è il **commit di chiusura di AOG-1a**: prima di iniziare, il dev rilegge le righe citate sul HEAD corrente e **corregge questo file** dove sono slittate (è successo al doc base: tre righe slittate di +19 fra fine luglio e il 7 agosto — la prassi di riverificare ha pagato in tutte le story dell'epic 15).
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/implementation-artifacts/aog-1-velivolo-fuori-servizio.md` **per intero** (§1.3 il flusso admin misurato, §1.6 i dati reali del conteggio, §7 con le **DECISIONI PO**) e `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` (quello che 1b **consuma**). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max`.

---

## Story

As **l'amministratore che sta per mettere un velivolo in AOG**,

I want sapere **prima di premere**, e poi **con un numero esatto dopo**, quante prenotazioni vive sto impattando — e che i piloti che hanno una prenotazione **approvata** su quel velivolo lo **sappiano senza dover aprire l'app**,

so that l'AOG smetta di essere l'atto silenzioso di oggi: due colonne scritte, **nessuna prenotazione toccata, nessuna mail, un toast da 2,6 secondi** e il pilota che scopre il fermo **arrivando al campo**.

### Il perché: l'asimmetria PENDING/APPROVED

I tre blocchi AOG che esistono fermano **creazione**, **spostamento** e **approvazione** (`bookings.service.ts:554`, `:922`, `:1151`). Ne esce l'asimmetria che è il cuore di questa story:

- una prenotazione **PENDING** su un velivolo che va in AOG è **di fatto congelata**: l'admin che prova ad approvarla prende un 422 col motivo e capisce perché;
- una prenotazione **APPROVED** sopravvive **INTATTA e MUTA**: nessuno la annulla, nessuno la marca, nessuno avvisa il titolare. L'unico segnale è **visivo** — il blocco AOG disegnato sopra le prenotazioni ancora in piedi nella timeline (desktop) e la riga AOG in testa all'agenda (mobile, R-15.4-h).

Il caso che fa male è **il pilota che si presenta al campo** con una prenotazione approvata e trova il velivolo smontato. Ed è esattamente il criterio che il PO ha ratificato per l'email (R-AOG-i): **si avvisa chi l'app NON fermerà da sola**.

### Fatti misurati che vincolano il design

| Fatto | Misura | Conseguenza |
|---|---|---|
| Il flusso admin vive in **un solo posto** | sezione «Disponibilità» dello `SlideOver` `AircraftEditor`, `fleet/aircraft-editor.tsx:286`, corpo `AvailabilitySection:690-765` | non c'è una seconda superficie da tenere allineata |
| Il **toast** è l'unico segnale di successo di oggi | `TOAST_LIFETIME_MS = 2600` (`components/ui/toast.tsx:26`), `aircraft-editor.tsx:713` | **un toast non è un portatore accettabile**: P1 dice «SUBITO VISIVO», non «visibile per due secondi e mezzo» |
| Esistono **due label MORTE già tradotte** per una conferma | `availability.confirm` («Conferma») e `.confirmReturnToService`, dichiarate a `aircraft-editor.tsx:66-67`, passate da `fleet/page.tsx:187-188`, **mai consumate** (`grep 'labels.availability'` → 5 occorrenze, nessuna delle due) | il doppio passo **riusa una stringa già tradotta**, non ne inventa una |
| Gli stati «vivi» ai fini dell'impatto | `PENDING` (congelata) + `APPROVED` (muta e pericolosa); `DENIED`/`CANCELLED`/`FLOWN`/`NO_SHOW` sono **stati chiusi** | il conteggio ha una definizione, non un'intuizione |
| Il fan-out può essere grosso | velivolo più prenotato del DB reale: **21 APPROVED future** (92 prenotazioni totali: 63 APPROVED, 11 PENDING, 13 CANCELLED, 2 FLOWN, 2 DENIED, 1 NO_SHOW) | il costo dell'invio va **misurato**, non stimato |
| L'infrastruttura email **esiste ed è matura** | `MailSender` (`server/adapters/mail/`), **9 template** (`templates.ts:53-350`), Mailpit in dev (`127.0.0.1:1025/8025`), e un modello di invio **esatto** da copiare: `sendBookingDeniedEmail` (`bookings.service.ts:1203-1221`) | **nessuna infrastruttura nuova** |

---

## §0 — Requisiti FISSI (contratto: action item PO + ratifiche 2026-08-07)

| # | Requisito |
|---|---|
| **P1** | Quando l'admin mette un velivolo in AOG, l'avviso che esistono **X prenotazioni impattate** deve essere **SUBITO VISIVO** — non un dato da andare a cercare. |

| # | Invariante |
|---|---|
| **[a]** | La data **non rimette mai** il velivolo in servizio da sola. Qui significa: `outOfServiceUntil` entra **solo** nel calcolo della **finestra di conteggio**, mai in una `where` o in un `if` che decida lo **stato** di un velivolo. |
| **[b]** | Il campo è **OPZIONALE**. Senza data il conteggio è **dichiarato non delimitato** — «rientro da definire», finestra `[ora, ∞)` — e **mai** presentato come se una data ci fosse. |

### Ratifiche PO del 2026-08-07 che vincolano QUESTA story

| R | Q | Decisione | Effetto vincolante qui |
|---|---|---|---|
| **R-AOG-a** | Q1 | **A — semantica INCLUSIVA** (contro la raccomandazione B) | La finestra di conteggio è **`[ora, fine giornata di until]`**: una prenotazione che inizia **il giorno di `until`** è **DENTRO**. Ereditata da 1a, dove vive il doc-comment che la definisce: qui si **cita**, non si reinterpreta. |
| **R-AOG-b** | Q2 | **C — anteprima + numero reale** | AC 2-7. Anteprima all'apertura della sezione + **submit a doppio passo**; al grounding conteggio **ricalcolato nella stessa transazione**, restituito **nella response** (DTO nuovo ⇒ OpenAPI stesso commit) e reso come **banner persistente `.alert-box.bad`**; **riga persistente** a ogni riapertura della Disponibilità di un velivolo già AOG. **Anteprima e definitivo chiamano la STESSA funzione di dominio.** |
| **R-AOG-i** | Q9 | **C — email best-effort post-commit alle sole APPROVED impattate** | AC 10-13. Modello `sendBookingDeniedEmail`: **fuori** transazione, `try/catch`, locale del destinatario, **skip** senza email. **Nessuna email al rientro** (`returnToService`). **Le PENDING non ricevono nulla** (già congelate dal 422 all'approvazione). 1 template nuovo + fan-out + stringhe ×2 + e2e Mailpit. |
| **R-AOG-j** | Q10 | **A — split**, dev **Opus 5 xhigh**, review adversarial **Opus 5 xhigh** | Questa story parte **dallo stato post-1a**. |

**Cosa 1b eredita da 1a e NON riscrive**: il campo `outOfServiceUntil` e la sua migrazione, il doc-comment che definisce la semantica inclusiva, l'azzeramento in `returnToService`, il campo data nell'editor Disponibilità, i 422 arricchiti, la guardia volo con deroga, il fix del conteggio della Panoramica.

---

## §1 — Decisioni architetturali (vincoli tecnici)

**AD-1 — UNA sola funzione di dominio per il conteggio. Anteprima e definitivo la chiamano entrambi.**
È la parte **letterale** di R-AOG-b («anteprima e definitivo chiamano la STESSA funzione di dominio»). La funzione prende `(aircraftId, until: Date | null, now)` e restituisce il conteggio **spaccato per stato** (`{ pending, approved }`) sulla finestra `[now, fine giornata di until]` — o `[now, ∞)` se `until` è `null`. Regole:
- gli stati contati sono **esattamente** `PENDING` e `APPROVED`; `DENIED`, `CANCELLED`, `FLOWN`, `NO_SHOW` sono **stati chiusi** e non contano mai;
- una prenotazione **già iniziata o già passata** non conta;
- la semantica inclusiva è **citata** dal doc-comment Prisma di 1a, non riscritta con parole nuove;
- **una sola implementazione**: due percorsi che si «tengono allineati» sono il difetto che questa AD esiste per impedire.
**Dove vive**: il dev la colloca dove può **provare** che non introduce un ciclo di import fra `aircraft.service.ts` e `bookings.service.ts` (il conteggio è su `Booking`, il chiamante è il grounding su `Aircraft`), e **scrive nel record** quale direzione ha scelto e perché. Non è una preferenza di stile: un ciclo di import qui è un errore di build a valle.

**AD-2 — L'anteprima passa da un endpoint proprio, non da un riuso di `GET /api/v1/bookings`.**
`listBookingsQuerySchema` (`schemas/bookings.ts:110-117`) espone già `aircraftId`, `from`, `to`, `status` (CSV) e restituisce `total` nella busta paginata: **il conteggio sarebbe esprimibile** così. **Non si fa**, e il motivo è AD-1: costruire `from`/`to` nel client significa **duplicare la semantica della finestra** (fine giornata inclusiva, ramo senza data) proprio nel punto in cui il PO ha chiesto una funzione sola. L'anteprima è quindi una **lettura dedicata** che esegue la funzione di dominio con la data **candidata** (quella che l'admin sta digitando, eventualmente vuota) come parametro, gated **come il grounding** (`aircraft.manage`), **registrata in OpenAPI nello stesso commit** (AD-5). ⚠️ `registry.test.ts` usa `expect.arrayContaining` e **non segnala** una rotta mancante (action item «F5 review 12.11: 8 route non registrate»): questa voce non diventa la nona.

**AD-3 — Il numero definitivo si calcola NELLA STESSA transazione del grounding, e la guardia atomica resta INTATTA.**
`setOutOfService` (`aircraft.service.ts:393-416`) diventa un `$transaction` che (i) esegue la `updateMany` guardata con la `where` **identica** (`{ id, status: 'OPERATIONAL' }` — review 2.2 F1: due chiamate concorrenti non possono vincere entrambe; **una sola riga di quella disciplina non cambia**), (ii) rilegge il velivolo (`findUniqueOrThrow`, `:414`), (iii) esegue la funzione di dominio di AD-1 sulla **stessa** connessione. Niente TOCTOU sul numero autoritativo.
Il `ConflictError` (`:411`) resta **esattamente** dove è e con lo stesso codice: il velivolo già AOG continua a dare 409.

**AD-4 — Il portatore dell'avviso è persistente. Il toast resta, ma non è l'avviso.**
Banner **`.alert-box.bad`** (`airops.css:790-796`, **entrambi i temi già gestiti**) dentro la sezione Disponibilità, che **non scompare da solo**. Il toast di oggi (`aircraft-editor.tsx:713`) resta **invariato**: è la conferma dell'atto, non il referto. E poiché un admin che chiude il pannello perderebbe il numero, la **riga persistente** «N prenotazioni nel fermo» ricompare **a ogni riapertura** della Disponibilità di un velivolo già AOG, con **lo stesso conteggio e la stessa funzione**.
⚠️ **Vietato aggiungere un 41° `var(--bad)`/`var(--ok)` inline**: il debito (40 dichiarazioni in 19 file) è un item TD post-epic con ciclo proprio — si usano `.alert-box.bad|ok|info` o `.stat-tone-*` (`airops.css:737-742`).

**AD-5 — Il contratto cambia: response nuova, OpenAPI nello stesso commit.**
`POST /api/v1/aircraft/{id}/out-of-service` oggi restituisce l'`AircraftListItem`. Con R-AOG-b restituisce **anche** il conteggio ⇒ DTO nuovo in `schemas/aircraft.ts`, rotta `src/app/api/v1/aircraft/[id]/out-of-service/route.ts`, registry `registry.ts:1097-1109` (+ la voce dell'anteprima di AD-2) — **stesso commit**, verifica **a lettura** (AD-2). Precedente interno per un campo **advisory** nella response di una scrittura: `balanceAlert` di `RegisterFlightResult` (story 14.4, AC 3): **stessa forma, stessa disciplina**.

**AD-6 — L'email è best-effort e POST-COMMIT, ricalcata riga per riga su `sendBookingDeniedEmail`.**
Modello: `bookings.service.ts:1203-1221` — **fuori** dalla transazione, `try/catch` + `console.error` (**mai** un throw che faccia fallire una scrittura valida), **locale dal `User.locale`** del destinatario (fallback `it`), **skip silenzioso** se la persona non ha email. Destinatari: **solo i titolari delle APPROVED impattate** — il sottoinsieme che la funzione di AD-1 già identifica. **Nessuna email** al `returnToService`. **Nessuna email** alle PENDING (sono già congelate: il pilota lo scopre alla decisione, col 422 che l'admin vede). Canale: **l'email esistente**; nessun canale nuovo (niente push, niente in-app).

**AD-7 — Invariante [a] preservata per costruzione, e provata.**
`outOfServiceUntil` entra **solo** nel calcolo del **limite superiore della finestra** di conteggio. Non compare in nessuna `where` che selezioni velivoli per stato, in nessun `if` che decida se un velivolo vola, in nessun job. La prova è un `grep` classificato voce per voce (AC 9), **come in 1a**: se l'elenco cresce, ogni voce nuova va classificata.

**AD-8 — Che cosa 1b tocca di 1a, dichiarato subito.**
1b **non riscrive** una riga di **produzione** di 1a. Modifica **due** cose, ed è tutto:
1. la **forma della response** di `setOutOfService` (AD-3/AD-5) — la `where` guardata, la scrittura del campo e l'azzeramento in `returnToService` restano **byte-identici**;
2. le **asserzioni unit** che descrivono quella chiamata (`aircraft.service.test.ts:582-585` e la fixture del DTO), aggiornate al valore **corretto** — **mai** indebolite a `objectContaining` (lezione 14.6).
Qualunque altra modifica a file di 1a è **fuori perimetro** e va motivata come deviazione nel record.

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record. Ogni AC che dice **«discriminante»** richiede la prova che il test è **rosso sul pre-fix**, col repo **ripristinato byte-identico** dopo (lezione 13.7/15.10). Le misure UI si intendono a **1280×900** e **375×812**, in **tema chiaro e scuro**, nei **due locale**.

### La funzione di dominio

**AC 1 — Una sola funzione, una sola semantica, provata sui bordi.**
La funzione di AD-1 è **unica** (il record mostra i due call-site: anteprima e grounding) e i suoi unit coprono, con **numeri esatti**: (a) `PENDING` e `APPROVED` contano, **spaccati**; (b) `DENIED`, `CANCELLED`, `FLOWN`, `NO_SHOW` **non** contano; (c) una prenotazione **passata** non conta; (d) una prenotazione che inizia **il giorno di `until`** **CONTA** (semantica inclusiva R-AOG-a — è il boundary che decide la story: va testato **sopra**, **sotto** e **sul** giorno di `until`); (e) con `until = null` la finestra è **`[ora, ∞)`** e conta **tutte** le future vive; (f) un velivolo **senza** prenotazioni dà `0/0`, e lo zero è un risultato, non un errore.

### L'anteprima e il doppio passo

**AC 2 — «Stai per impattare N prenotazioni» compare PRIMA dell'atto.**
All'apertura della sezione **Disponibilità** di un velivolo `OPERATIONAL`, l'admin vede il conteggio con la finestra **dichiarata in chiaro** («fino al {data} compreso» / «rientro da definire — finestra non delimitata») e lo **spacco per stato**: PENDING **«congelate»**, APPROVED **«da gestire»** — la distinzione non è decorativa, è **il criterio dell'email** (R-AOG-i). Il numero si **ricalcola** quando la data candidata cambia; il record dichiara **il trigger** e riporta **quante richieste** partono digitando una data intera (nessuna tempesta di fetch).
Il numero dell'anteprima è **dichiarato come stima** nella UI: il numero autoritativo è quello della response (AC 4). **IT ed EN insieme.**

**AC 3 — Il submit è a DOUBLE STEP e riusa le label già tradotte.**
Il bottone «Fuori servizio» chiede una **conferma** che consuma **`AircraftPage.editor.availability.confirm`** (dichiarata a `aircraft-editor.tsx:66-67`, passata da `fleet/page.tsx:187-188`, oggi **mai consumata**): **nessuna stringa nuova** per questo passo. Il secondo passo è **annullabile** senza effetti (unit/e2e: annullando, il velivolo resta `OPERATIONAL` — verificato sul DB, non sullo schermo). ⚠️ Il **primo** passo non scrive niente: nessuna scrittura di dominio prima della conferma.
Il controllo **nuovo** del secondo passo rispetta i **44px a ≤640** (AC 14) e non fa arretrare `out-of-service-submit` sotto la soglia che **1a** gli ha dato (R-AOG-g).

### Il numero reale e i suoi portatori

**AC 4 — Il conteggio definitivo nasce nella STESSA transazione e viaggia nella response.**
`setOutOfService` restituisce, **oltre** al velivolo, il conteggio **ricalcolato** dentro la transazione del grounding (AD-3). Unit: la `updateMany` guardata è chiamata con la `where` **invariata** e il `data` che 1a ha stabilito; il conteggio è calcolato **dopo** l'update e **dentro** la stessa transazione; un velivolo già AOG dà ancora **409** e **nessun** conteggio. DTO + rotta + **registry OpenAPI nello stesso commit** (AD-5), verifica **a lettura** riportata.

**AC 5 — Il banner è PERSISTENTE, e il test lo prova oltre la vita del toast.**
Dopo la conferma, il numero reale compare in un **banner `.alert-box.bad`** dentro la sezione Disponibilità. **Verifica esplicita**: il messaggio è **ancora presente e leggibile ≥ 5 s** dopo la conferma. ⚠️ Il toast dura **2600 ms** (`toast.tsx:26`): un test che misuri **sotto** quella soglia **non prova niente** — è il modo in cui questo AC può essere finto senza che nessuno se ne accorga. Il toast esistente **resta invariato** e non viene trasformato nel portatore.

**AC 6 — La riga riappare a ogni riapertura di un velivolo già AOG.**
Riaprendo la Disponibilità di un velivolo **già** fuori servizio, la riga «N prenotazioni nel fermo» è **di nuovo lì**, con lo **stesso** conteggio e la **stessa** funzione di dominio (nessuna seconda implementazione). ⚠️ Coerenza con **AD-9 di 1a**: per un velivolo già AOG la data **non è riscrivibile** (la `where` guardata dà 409) ⇒ questa riga è **informativa**, e **nessun controllo che porterebbe sempre a un 409 le sta accanto abilitato** (vicolo cieco, lezione 14.6 F2).

**AC 7 — Esattezza su fixture NOTE e run-unique, senza aggregati globali.**
Uno spec crea **il proprio** velivolo, e su di esso **N₁ PENDING + N₂ APPROVED future**, più **almeno una CANCELLED e una DENIED che NON devono contare**, **almeno una passata** che non deve contare e **almeno una oltre la finestra** (dopo `until`) che non deve contare; mette il velivolo AOG e asserisce **i due numeri esatti**. Un secondo caso ripete con `until = null` e verifica che quella «oltre la finestra» **adesso conta** (è la discriminanza della semantica inclusiva vista dall'e2e).
⚠️ **Vietato** asserire per uguaglianza un aggregato **globale** (i «3 AOG» della Flotta, l'«1 AOG» della Panoramica): sotto `fullyParallel` flaka per costruzione — review **Billing-2 F4**, flaky 2 run su 2.

**AC 8 — Invariante [b]: senza data, il conteggio è dichiarato NON DELIMITATO.**
Con `outOfServiceUntil = null`, anteprima, banner e riga persistente dicono **«rientro da definire»** e presentano il conteggio come **non delimitato** — **mai** una stringa vuota, **mai** un `—` ambiguo dove il posto è nominato, **mai** una data inventata, **mai** una frase che suggerisca una fine. IT **ed** EN.

**AC 9 — Invariante [a]: il conteggio non trasforma la data in una regola di stato.**
`grep -rn 'outOfServiceUntil' src/server/` — elenco **completo** nel record, **classificato una per una** (lettura DTO / limite della finestra di conteggio / messaggio). **Nessuna** occorrenza dentro una `where` Prisma che selezioni velivoli per stato, dentro un `if` che decida se un velivolo vola, o dentro un job. Unit: un velivolo AOG con `outOfServiceUntil` **nel passato** resta AOG, e le sue prenotazioni **restano contate** (la finestra scaduta non azzera il conteggio: azzererebbe l'avviso proprio quando il fermo è andato lungo).

### L'email (R-AOG-i)

**AC 10 — Solo le APPROVED impattate, e solo loro.**
Al grounding, i titolari delle prenotazioni **APPROVED** nella finestra ricevono **una** email ciascuno. **Le PENDING non ricevono nulla** (asserito, non assunto: nessun messaggio per il titolare della PENDING nella casella). Il `returnToService` **non manda niente**. Il template è **nuovo** (sulla falsariga di `buildBookingDeniedEmail`, `templates.ts:53-350`) e nomina: **marca del velivolo**, **motivo**, **fino al {data} compreso** o «rientro da definire», e **la prenotazione del destinatario**. Stringhe i18n **IT ed EN**.

**AC 11 — Best-effort davvero: l'email non può far fallire l'AOG.**
Unit **discriminante**: con il `MailSender` che **lancia**, `setOutOfService` risponde comunque **200**, la riga è scritta e il conteggio è nella response (il `try/catch` del modello `sendBookingDeniedEmail:1203-1221`). L'invio è **fuori** dalla transazione e **dopo** il commit: unit che lo prova sull'ordine delle chiamate. Una persona **senza email** viene **saltata in silenzio** e non fa saltare le altre.

**AC 12 — e2e Mailpit, con la trappola dello stato globale chiusa.**
Un e2e legge Mailpit (`http://localhost:8025/api/v1/messages`) e verifica: **una** email al titolare della APPROVED, **zero** al titolare della PENDING, e il contenuto (velivolo, motivo, finestra) nel locale del destinatario. ⚠️ **La casella Mailpit è stato GLOBALE e condiviso con tutta la suite**: il test **filtra per destinatario run-unique** e **non** asserisce mai su conteggi totali della casella né sull'ultimo messaggio arrivato. Il locale del destinatario si asserisce su un utente con `locale` **esplicito**, non sul fallback.

**AC 13 — Il costo del fan-out è MISURATO, non stimato.**
Fixture con un numero di APPROVED confrontabile col caso peggiore reale (**21** misurate sul velivolo più prenotato del DB): il record riporta **quanto** dura il grounding con quel fan-out e dichiara se è materiale. Nessun cap, nessuna coda, nessun batching **vengono introdotti** (non sono ratificati, karpathy §2): se la misura è preoccupante, **si dichiara un TD** in `sprint-status.yaml` con il numero, e basta.

### Superficie, non-regressione, test

**AC 14 — Geometria, contrasto e bersagli delle superfici nuove.**
Banner, riga persistente e controllo del secondo passo: misure **pre/post** dell'altezza della sezione Disponibilità e del pannello a **375** e **1280**; **contrasto WCAG ≥ 4,5:1** di **ogni pixel di testo nuovo**, calcolato **computazionalmente** (canvas → sRGB → WCAG, lezione 13.9 — mai giudizio visivo), con lo sfondo **effettivo risolto risalendo gli antenati** e con la **cascata reale** (lezione 15.9: `.fld-error` vinceva su `.stat-tone-bad`), in **entrambi i temi**; **nessun controllo nuovo sotto 44px a ≤640**. **Nessun `var(--bad)`/`var(--ok)` inline nuovo** (AD-4).
⚠️ La sezione Disponibilità cresce **due volte** (1a ci ha messo il campo data, 1b ci mette banner + riga): il record riporta l'altezza a 375 e dice **se e quanto** il contenuto finisce sotto il fold (pre-1a il submit era già a y 841 su 812).

**AC 15 — Nessuna regressione su AOG-1a.**
Le superfici e le misure consegnate da 1a restano quelle: campo data ed etichetta inclusiva nell'editor, `out-of-service-submit` **≥44px a ≤640 e identico al centesimo a 1280**, i tre 422 arricchiti, la guardia volo con deroga, il conteggio corretto della Panoramica. Il record riporta la **misura post-1b** dei valori che 1a aveva misurato. Ogni file di 1a toccato oltre i due punti di AD-8 è una **deviazione da motivare**.

**AC 16 — Unit, e girano in shell PULITA.**
Copertura: la funzione di dominio (AC 1, sei casi); la transazione del grounding (AC 4); il fan-out (AC 10/11, compreso il mail che lancia e la persona senza email); l'invariante [a] (AC 9). **Devono passare con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`** — ⚠️ qui il rischio è **massimo**, perché questa story importa **proprio** `@/server/adapters/mail`: è la regola CLAUDE.md a **3 occorrenze** (fix `3c6add9`, review 14.7 F1) — un import verso un service «grosso» trascina la validazione **eager** di `@/lib/env` e fa fallire `npm run gates` in locale mentre CI resta verde. Mockare la catena (`vi.mock('@/server/adapters/mail')` / `'./app-settings.service'` / `'@/lib/env'`, modello `bookings.service.test.ts`).

**AC 17 — e2e: convenzioni alla lettera e isolamento MOTIVATO.**
- **testid**: duplicato di una desktop → suffisso `-mobile`; solo-mobile → prefisso `mobile-`. **Verifica obbligatoria prima di ogni nome**: `grep -rn 'data-testid\^=' e2e/` (AD-5 della 15.5: un `-mobile` su un nome coperto da `^=` rompe sei helper **a qualsiasi viewport**). Elenco nel record.
- **selettori**: scoped al landmark o `exact: true`, mai `getByRole('link', { name })` page-level (lezione 103-F1); **mai `hasText` con date o `H:MM`** (lezione 11.2) — e questa story **mette date e numeri in pagina**.
- **fixture**: **niente time-dependent** (lezione 15.4 F1). Le finestre di conteggio si costruiscono **relative e calcolate**; una fixture che scade a mezzogiorno rende rosso il conteggio **dopo pranzo**, ed è il modo più facile di rompere questa story.
- **isolamento**: mettere un velivolo in AOG **è stato globale**; i tre spec che lo fanno oggi (`bookings.spec.ts:470`, `mobile-planning.spec.ts:291`, `mobile-registries.spec.ts:300`) vivono in `fullyParallel` e reggono perché ognuno crea **il proprio** velivolo run-unique. Stessa disciplina qui ⇒ **nessun project serializzato** — a condizione che **nessuna** asserzione tocchi un aggregato globale (AC 7) **né** la casella Mailpit nel suo insieme (AC 12). La scelta va **scritta e motivata** nel record; se un test la viola, entra nella catena di `playwright.config.ts` (**unica fonte di verità** dell'elenco e dell'ordine — non enumerarla altrove: un elenco copiato invecchia, è successo con la 15.8b).

**AC 18 — I gate.**
`npm run gates` **verde** (output compatto; **mai** i quattro comandi verbosi separati). Suite e2e completa su **build di produzione** via **`scripts/e2e.sh`**, **MAI** `playwright test` in foreground; esito letto **solo** con `scripts/e2e.sh status` — **assenza della sentinella `E2E_EXIT=` + nessun processo vivo = run MORTO, non riuscito**. Prima di attribuire un rosso alla flake di login: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1` (TD-6). Per una **serie**: build una volta (`env -u NODE_ENV npm run build && npm run start &`), poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …`. `export JOBS_SECRET=<non-placeholder>` prima di ogni suite `CI=1`.

---

## §3 — Dev Notes: blast radius (dal doc base §5, **ripartito**: qui c'è solo 1b)

**Dominio / contratti (5)**
1. **La funzione di conteggio** (AD-1) — file da scegliere **provando** l'assenza di ciclo di import (`aircraft.service.ts` ↔ `bookings.service.ts`), con la scelta motivata nel record. Il DTO del conteggio (`{ pending, approved }`) è **uno solo** e serve anteprima, response e riga persistente.
2. `src/server/services/aircraft.service.ts` — `setOutOfService:393-416` diventa `$transaction` (`where` guardata **intatta**, `ConflictError:411` **intatto**, rilettura `:414` **intatta**) e restituisce il conteggio; il fan-out email **dopo** il commit. ⚠️ `returnToService:423-438` **NON si tocca** (nessuna email al rientro, R-AOG-i).
3. `src/lib/schemas/aircraft.ts` — DTO nuovo della response + schema della lettura di anteprima. ⚠️ `setOutOfServiceSchema:90-94` è già stato esteso da **1a**: non si riapre.
4. `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` (response nuova) **+** la rotta di anteprima (AD-2).
5. `src/lib/schemas/registry.ts` — `:1097-1109` (response) + la voce dell'anteprima. **Stesso commit**, verifica **a lettura** (`arrayContaining` non copre).

**Email (3)**
6. `src/server/adapters/mail/templates.ts:53-350` — **un** template nuovo, sulla falsariga di `buildBookingDeniedEmail`.
7. Il **fan-out**, ricalcato su `sendBookingDeniedEmail` (`bookings.service.ts:1203-1221`): fuori transazione, `try/catch`, locale del destinatario, skip senza email.
8. `messages/it.json` + `messages/en.json` — **sempre le due insieme** (soggetto e corpo del template + le stringhe di anteprima/banner/riga).

**UI (2)**
9. `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` — `AvailabilitySection:690-765`: anteprima, **doppio passo** con `availability.confirm` (label morta a `:66-67`, oggi non consumata), **banner `.alert-box.bad`**, **riga persistente**. Il toast a `:713` **resta com'è**.
10. `src/app/[locale]/dashboard/fleet/page.tsx:186-189` — wiring delle label (le due della conferma sono **già** passate: si smette di ignorarle).

**Test (4)**
11. `src/server/services/aircraft.service.test.ts` — ⚠️ **si riapre dove 1a l'ha lasciato**: `:582-585` (la chiamata a `updateMany`) e la fixture del DTO `:105-120` / `:217-236` vanno riallineate alla response nuova, **al valore corretto**, **mai** a `objectContaining` (AD-8, lezione 14.6). Più: transazione, fan-out, mail che lancia, persona senza email.
12. Unit della **funzione di dominio** (AC 1) — i sei casi, boundary inclusivo **sopra/sotto/sul** giorno di `until`.
13. `e2e/` — spec nuovo o esteso: anteprima, doppio passo annullabile, banner ≥5 s, riga alla riapertura, i due numeri esatti su fixture run-unique, il caso `until = null`, **Mailpit filtrato per destinatario**.
14. `src/lib/schemas/registry.test.ts` — solo se cambiano i path; il **contenuto** nuovo non è coperto da `arrayContaining`.

**Cosa NON si tocca** (perimetro R-AOG-e, ereditato): card flotta desktop/mobile, sheet flotta mobile, timeline desktop, agenda mobile e suo sheet, opzioni dei form prenotazione, export Excel, testate — e **nessuna** delle superfici che 1a ha consegnato, oltre ai due punti di AD-8.

---

## §4 — Piano di test

**Unit** — la funzione di dominio (6 casi di AC 1, con i tre boundary attorno a `until`); la transazione del grounding (AC 4, incluso il 409 sul velivolo già AOG); il fan-out (AC 10/11: solo APPROVED, mail che lancia → 200, persona senza email saltata, nessun invio al rientro); l'invariante [a] (AC 9). Tutti verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` — v. l'avvertenza di AC 16.

**e2e** (project `chromium` `fullyParallel`, `setViewportSize` **dentro** il test, velivolo e attori **run-unique**):
1. apertura della Disponibilità → anteprima con lo spacco PENDING/APPROVED e la finestra dichiarata; cambio della data candidata → numero che si aggiorna;
2. submit → **conferma** → annulla: il velivolo è **ancora `OPERATIONAL`** (verificato sul DB);
3. submit → conferma → **banner** col numero reale, **ancora presente ≥ 5 s** (oltre i 2600 ms del toast);
4. chiusura e **riapertura** del pannello → la riga «N prenotazioni nel fermo» è di nuovo lì;
5. i **due numeri esatti** sulla fixture di AC 7, e il caso `until = null` (AC 8);
6. **Mailpit**: una email al titolare della APPROVED, **zero** a quello della PENDING, contenuto e locale verificati, **filtrando per destinatario run-unique**.

**Discriminanze obbligatorie** (rosse sul pre-fix, repo ripristinato byte-identico dopo): il boundary inclusivo di AC 1 (d); la persistenza ≥5 s di AC 5; l'assenza di email alle PENDING di AC 10; il 200 con mail che lancia di AC 11.

---

## §5 — Trappole note

- **Il toast è il trabocchetto di questa story**: 2600 ms (`toast.tsx:26`). Un test che asserisce la presenza dell'avviso **entro** quella finestra passa anche se il banner non esiste. La soglia è **≥ 5 s** e va scritta sul **requisito**, non sul valore ottenuto.
- **Mailpit è stato globale**: la casella è condivisa con tutta la suite e con i run precedenti. **Filtrare per destinatario run-unique**; mai `messages[0]`, mai conteggi totali.
- **Fixture time-dependent: VIETATE** (lezione 15.4 F1) — e qui una finestra di conteggio costruita su «oggi alle 10:00 UTC» rende rossi i test **da mezzogiorno in poi**, con un fallimento che sembra un difetto del conteggio.
- **`hasText` con date: VIETATO** per disambiguare righe (lezione 11.2): «11:00» contiene «1:00», e questa story mette **date e numeri** in pagina. Regex `\b`-anchored o assert esatti sulla cella.
- **`Escape` e i pannelli**: `SlideOver` chiude l'**INTERO** pannello (listener globale su `window`); i popover portalati (`CalendarPopover`, che 1a ha messo sul campo data della stessa sezione) intercettano **in cattura** e consumano il **PRIMO** `Escape` (verificato 15.10). Mai chiudere il calendario con `Escape` e poi asserire sul pannello: si asserisce su nodi fantasma (review 14.3 F1/F2). Chiudere **interagendo col campo successivo**.
- **`SlideOver`/`MobileSheet` sono DIALOGHI** con focus trap che comprende i portali attivi (`src/components/ui/focus-trap.ts`); un pannello chiuso è `inert`. Un **secondo passo di conferma** dentro il pannello vive in quel contesto: il focus deve restarci — **verificare, non assumere**.
- **Il pannello non è un componente che rimonta per grazia ricevuta**: lo stato del doppio passo **non deve sopravvivere** a una chiusura/riapertura (è la classe del **BLOCKER 14.4 F1**, `pendingForceBody` che sopravviveva). **Misurare** il comportamento del remount, non dichiararlo.
- **`OPTIONS_PAGE_SIZE = 100`**: su DB post-suite (148 velivoli) l'ultimo velivolo creato **non è selezionabile** in alcuni picker — un e2e che crea un velivolo e poi lo cerca **può morire per questo**, non per un difetto della story.
- **Lock anti-brute-force** (TD-6): ripetere run e2e mirati sullo stesso DB fa fallire lo spec alla riga di login dopo ~10 login — deterministico, non flake. Query di verifica in AC 18.
- **DB su questa macchina**: `docker compose exec -T postgres psql -U airmanager -d airmanager` (`psql` **non** è nel PATH dell'host). Mailpit: `docker compose`, API `http://localhost:8025/api/v1/messages`.

---

## §6 — Fuori scope DICHIARATO

- **Annullamento automatico** delle prenotazioni impattate: decisione PO 2026-07-31 (opzione 2 di 3). L'AOG **conta e avvisa**, non decide per l'admin.
- **Email al rientro in servizio** e **email alle PENDING**: escluse **esplicitamente** da R-AOG-i.
- **Notifiche push / in-app / marcatura della prenotazione impattata** nelle liste del pilota: il canale è **l'email esistente**; nessun canale e nessuna superficie nuova.
- **Cap, coda o batching** del fan-out: non ratificati (AC 13 li sostituisce con una **misura** e, se serve, un TD).
- **La data su superfici diverse dall'editor e dai tre 422**: perimetro **R-AOG-e**, già chiuso da 1a (AC 14 di 1a le elenca una per una).
- **Un percorso per modificare la data senza rientro in servizio**: AD-9 di 1a lo dichiara come TD; serve una **ratifica PO** per aprirlo.
- **Il TD `OPTIONS_PAGE_SIZE`**, il **TD 14.8 F6** (`date-only.ts`), il **TD 14.9 F11** (422-prima-di-403), le **42 celle `.cal-popover`**: tutti dichiarati da 1a, nessuno chiuso qui.
- **I 40 `var(--bad)`/`var(--ok)` inline in 19 file**: TD post-epic con ciclo proprio — **non se ne tocca uno e non se ne aggiunge** (AD-4).

---

## §7 — Riferimenti

- `_bmad-output/implementation-artifacts/aog-1-velivolo-fuori-servizio.md` — ricognizione misurata (§1.3 il flusso, §1.6 i dati del conteggio), censimento §2, §7 con le **DECISIONI PO**.
- `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` — la story che questa **consuma** (campo, semantica, editor, 422, guardia volo).
- `_bmad-output/implementation-artifacts/14-4-guardrail-registrazione-volo.md` — `balanceAlert` come precedente di un campo advisory nella response di una scrittura (AC 3 della 14.4); F1 BLOCKER del remount.
- `_bmad-output/implementation-artifacts/billing-2-pagina.md` — F4: perché un aggregato globale asserito per uguaglianza flaka sotto `fullyParallel`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:476` — l'action item AOG (contratto).
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, stato branch/PR.
- `CLAUDE.md` — testid mobile/AD-5, e2e, catena serializzata, unit + env eager, gates, `scripts/e2e.sh`.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate, semplicità (AC 13: niente cap speculativi), chirurgia (AD-8), criteri verificabili (§2).

---

## Dev Agent Record — AOG-1b

**Dev**: Opus 5 xhigh (subagent) · **Data**: 2026-08-07 · **Baseline REALE**: `7f0a2fb` (chiusura di AOG-1a; il frontmatter dichiara `b5a2c93`, che è dove la ricognizione fu **misurata**) · **Macchina**: Fedora locale (Postgres + Mailpit in Docker), NON il container di CLAUDE.md.

### §A — Verifica della ricognizione sul HEAD corrente (ogni riga citata, riverificata prima di toccarla)

1a ha spostato codice: il refactor del fix MAJOR-1 in `flights.service.ts`, il campo data nell'editor, il campo nello schema. **13 righe citate da questo story file sono slittate**; nessun fatto è risultato falso.

| Riferimento dello story file (misurato su `b5a2c93`) | Riga VERA su `7f0a2fb` | Esito |
|---|---|---|
| `fleet/aircraft-editor.tsx:286` — sezione Disponibilità montata | **`:305-306`** | **SLITTATO +19** |
| `AvailabilitySection:690-765` | **`:692-818`** (corpo cresciuto di 53 righe con 1a) | **SLITTATO +2 / corpo diverso** |
| `aircraft-editor.tsx:713` — il toast del successo | **`:743`** | **SLITTATO +30** |
| `aircraft-editor.tsx:66-67` — le due label MORTE | **`:67-68`** | **SLITTATO +1** |
| `fleet/page.tsx:187-188` — le due label passate | **`:194-195`** | **SLITTATO +7** |
| `toast.tsx:26` — `TOAST_LIFETIME_MS = 2600` | **`:26`** | **CONFERMATO alla riga** |
| `aircraft.service.ts#setOutOfService:393-416` | **`:410-448`**; `ConflictError` `:411`→**`:439`**; `findUniqueOrThrow` `:414`→**`:442`** | **SLITTATO +17/+28** |
| `returnToService:423-438` | **`:453-472`** | **SLITTATO +30** |
| I tre blocchi AOG `bookings.service.ts:554/922/1151` | throw a **`:557` / `:928` / `:1157`** | **SLITTATO** (il fatto tiene) |
| `schemas/aircraft.ts#setOutOfServiceSchema:90-94` | **`:108-112`** | **SLITTATO +18** |
| `aircraftListItemSchema:172-186` | **`:191-207`** | **SLITTATO +19** |
| `registry.ts:1097-1109` — il path dell'out-of-service | **`:1097-1110`** (literal del path a `:1099`) | **CONFERMATO** |
| `templates.ts:53-350` — «9 template» | file di **344 righe**, `buildBookingDeniedEmail` a **`:327-344`** | **CONFERMATO nel contenuto** (9 builder), range stale |
| `bookings.service.ts#sendBookingDeniedEmail:1203-1221` | **`:1205-1223`** | **SLITTATO +2** |
| `airops.css:790-796` — `.alert-box.*` | **`:790-796`** | **CONFERMATO alla riga** |
| `airops.css:737-742` — `.stat-tone-*` | **`:737-739`** + `.stat-tone-info` a **`:3750`** (aggiunta dalla 15.10) | **CORREZIONE**: nel range citato vivono 3 regole, non 4 |
| `schemas/bookings.ts:110-117` — `listBookingsQuerySchema` con `aircraftId`/`from`/`to`/`status` | **`:110-117`** | **CONFERMATO alla riga** |
| `bookings.service.ts:1234` — `BookableAircraftOption` | **`:1236`** | **SLITTATO +2** |
| `aircraft.service.test.ts:582-585` — il `toHaveBeenCalledWith` di `setOutOfService` | **`:583-587`**; fixture `SELECTED_AIRCRAFT` `:105-120`→**`:105-128`**; `toEqual` letterale `:217-236`→**`:214-243`** | **SLITTATO / CONFERMATO nel contenuto** |
| I tre spec che fermano un velivolo: `bookings.spec.ts:470`, `mobile-planning.spec.ts:291`, `mobile-registries.spec.ts:300` | **tutte e tre alla riga** | **CONFERMATO** |

**Tre correzioni alla ricognizione (fatti, non righe)**

1. **La superficie del secondo passo esisteva già, ed è quella dell'Archivio.** Lo story file descrive il doppio passo come una novità; `ArchiveSection` (`aircraft-editor.tsx:1208-1259` pre-1b) **ha già** l'idioma esatto — stato `confirming`, domanda + `confirmYes`/`confirmCancel`, il trigger che sparisce. Il doppio passo di AC 3 lo **riusa** invece di inventarne un secondo nella stessa pagina.
2. **`.fld` è un flex COLONNA** (`airops.css:1143`), non un semplice contenitore: la prima stesura del banner usava `className="alert-box info fld wide"` per prendersi `grid-column: 1 / -1` e ne è uscita una riga vuota (ogni `<br>` diventava un flex item) e due bottoni impilati a tutta larghezza. Misurato e corretto: `gridColumn` inline sul box, `flexDirection: 'row'` **solo** sulla riga armata. È anche il motivo per cui il submit di 1a resta 479×34,84 al centesimo: il suo contenitore è rimasto quello, senza stili.
3. **Il link «alla lista prenotazioni filtrata per velivolo» non è esprimibile oggi** — v. §H (deviazione 3): `/dashboard/bookings` legge `{page, view, date, status}` (`bookings/page.tsx:37`) e il filtro velivolo della timeline è **stato client** (`schedule.tsx:504-517`), non un parametro d'URL.

### §B — Riepilogo per AC, con le prove

| AC | Esito | Prova |
|---|---|---|
| **1** una sola funzione, sei casi | ✅ | `src/server/services/aog-impact.ts#computeAogImpact` — **unica**, 2 call-site (`aircraft.service.ts:476` grounding, `:509` anteprima). 8 unit in `aog-impact.test.ts`: (a) PENDING/APPROVED spaccati 2/1; (b) DENIED/CANCELLED/FLOWN/NO_SHOW → 0; (c) passata e altro velivolo fuori, `gte` chiuso a sinistra; (d) **sopra/sul/sotto** il giorno di `until` → 3 dentro, 1 fuori; (d-bis) il bound esclusivo è mezzanotte del giorno DOPO in `APP_TIMEZONE`; (e) `until = null` → 3 approvate contro 1 delimitata, **stessa fixture**; (f) zero è un risultato. Il client Prisma è un **parametro**: il fake del test VALUTA la `where` emessa, quindi ogni asserzione è comportamentale, non una shape-match |
| **2** l'anteprima prima dell'atto | ✅ | `aog-impact-preview` (`.alert-box.info`, `role="status"`) all'apertura della Disponibilità di un velivolo OPERATIONAL. Testo misurato: «Stai per impattare 4 prenotazioni. / In attesa (congelate): 0 · Approvate (da gestire): 4 / rientro da definire: conteggio non delimitato · **stima**». **Trigger**: il VALORE del controllo data (`impactUntil`), con debounce **300 ms** — misurato: senza debounce un anno digitato produce **4** richieste (`0002-…`, `0020-…`, `0202-…`, `2026-…`), con debounce **1**. IT+EN |
| **3** doppio passo, label già tradotta | ✅ | Primo click → `out-of-service-confirm` (label `availability.confirm`, mai consumata prima) + `out-of-service-cancel` (label `cancel`, già esistente); `out-of-service-submit` **count 0** mentre è armato. **Zero stringhe nuove per questo passo.** Annullando: velivolo ancora `OPERATIONAL` **verificato sul DB** (`GET /api/v1/aircraft/{id}`), non sullo schermo. Bersagli: confirm/cancel **44px a 375**, **34,84 a 1280**; `out-of-service-submit` **invariato al centesimo** (§C) |
| **4** conteggio nella transazione, nella response | ✅ | `setOutOfService` è un `$transaction`; unit sull'**ORDINE**: `['tx-start','updateMany','booking.findMany','tx-end']`. `where` guardata asserita **esatta** (`{ id, status: 'OPERATIONAL' }`), `data` con le tre chiavi di 1a — mai `objectContaining`. 409 su velivolo già AOG ⇒ **nessun conteggio, nessuna email** (asserito). Il conteggio usa la data **riletta dalla riga**, non l'input. DTO + rotta + registry nello stesso commit; verifica **a lettura** in §E |
| **5** banner persistente oltre il toast | ✅ | `aog-impact-banner` (`.alert-box.bad`, `role="status"`) col numero della response. e2e: dopo **6 000 ms** il toast ha `count 0` e il banner è **ancora visibile e col suo testo**. Il toast (`toast.tsx:26`, 2600 ms) è **invariato**. Discriminanza in §F |
| **6** la riga a ogni riapertura | ✅ | `aog-impact-row` (`.fld-hint`) su velivolo già AOG: «4 prenotazioni nel fermo · conteggio fino al 17/08/2026 compreso», stessa funzione di dominio via lo stesso GET. Alla riapertura `aog-impact-banner` **count 0** e `out-of-service-confirm` **count 0** (lo stato del doppio passo NON sopravvive al remount — la classe del BLOCKER 14.4 F1, **misurata**: `fleet-console.tsx:307` rimonta l'editor con `key`, incluso `'closed'`). AD-9 rispettato: accanto alla riga non c'è un solo controllo che darebbe 409 |
| **7** esattezza su fixture proprie | ✅ | Lo spec crea velivolo, 3 persone e **7** prenotazioni proprie: 3 APPROVED dentro (+2, +4 e **+10 = il giorno di `until`**), 1 PENDING dentro (+6), 1 APPROVED oltre (+40), 1 CANCELLED, 1 DENIED. Asserito **1 · 3** e totale **4**, e con `until = null` la coppia 2 → 1 sulla stessa fixture (secondo test). **Nessun aggregato globale** letto |
| **8** invariante [b] | ✅ | Senza data: anteprima, banner **e** riga dicono «rientro da definire: conteggio non delimitato»; l'email dice «rientro da definire» e **non** contiene «fino al» (asserito in negativo). IT+EN (`return date not yet known: count not delimited`) |
| **9** invariante [a] | ✅ | §D: censimento completo classificato. **Zero** occorrenze in una `where` che selezioni velivoli per stato, in un `if` che decida se un velivolo vola, in un job. Unit dedicato: un `until` **già passato** conta **tutte** le vive future (identico alla finestra non delimitata), **mai** zero |
| **10** solo le APPROVED | ✅ | Template **nuovo** `buildAircraftGroundedEmail` (nomina marca, motivo, finestra inclusiva o «rientro da definire», e la prenotazione del destinatario). e2e Mailpit: **1** messaggio al titolare APPROVED (in **inglese**, `User.locale` esplicito), **1** al secondo titolare (fallback `it`, nessun `User`), **0** al titolare PENDING — che **ha** un'email a fascicolo, quindi è un vero «non è stato spedito» e non uno skip silenzioso. `returnToService`: unit che asserisce `sendMock` **non chiamato** |
| **11** best-effort davvero | ✅ | Unit: `MailSender` che lancia ⇒ **200**, riga scritta, conteggio nella response, e **il secondo destinatario riceve comunque**. Ordine provato: `['tx-start','tx-end','send']` — l'invio è **fuori** e **dopo**. Persona senza email: saltata in silenzio, le altre partono. Discriminanze in §F |
| **12** e2e Mailpit, stato globale chiuso | ✅ | Filtro **`to:<indirizzo run-unique>` + subject ESATTO** (`groundingSubjects()`): serviva il subject esatto perché la fixture DENIED produce «Prenotazione rifiutata: `<marca>`» **allo stesso destinatario**, e un filtro sulla sola marca l'avrebbe scambiata per un'email di fermo. Mai un totale di casella, mai `messages[0]` |
| **13** costo del fan-out MISURATO | ✅ | 21 titolari distinti (il caso peggiore reale della ricognizione): il `POST /out-of-service` dura **1 615 ms**, contro **16 ms** con zero destinatari ⇒ **~76 ms/destinatario** contro Mailpit locale; 21 messaggi consegnati. **Nessun cap, nessuna coda, nessun batching introdotti.** TD da registrare in §G |
| **14** geometria, contrasto, bersagli | ✅ | §C. Tutti i contrasti ≥ 4,5 nei due temi; **nessun `var(--bad)`/`var(--ok)` inline aggiunto** (`git diff -U0 \| grep '^+.*var(--bad)\|^+.*var(--ok)'` → **0**) |
| **15** nessuna regressione su 1a | ✅ | §C: `out-of-service-submit` **335×44 a 375** e **479×34,84 a 1280**, identico al centesimo; pannello e `.so-body` invariati; i 9 test di 1a + i 4 della 2.5 verdi (`13 passed, E2E_EXIT=0`). I due file di 1a toccati, e perché, in §H |
| **16** unit in shell PULITA | ✅ | `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` su `aog-impact.test.ts` (8), `aircraft.service.test.ts` (71), `templates.test.ts` (**19** — corretto dalla review LOW-1: il record diceva 22; 16 preesistenti + 3 nuovi) — **verde**. `aircraft.service.ts` importa ORA `@/server/adapters/mail`: la catena è mockata nel test (`vi.mock('@/server/adapters/mail')` + `'@/server/adapters/mail/templates'`), che è ciò che tiene la regola a 3 occorrenze di CLAUDE.md |
| **17** convenzioni e2e + isolamento motivato | ✅ | §E |
| **18** i gate | ✅ | §L |

### §C — AC 14/AC 15: misure UI (build di produzione, `playwright-core`, 1280×900 e 375×812, tema chiaro e scuro, IT e EN)

**Geometria** (identica nei due temi; le due colonne per larghezza)

| Elemento | 1280 | 375 |
|---|---|---|
| `aog-impact-preview` (**nuovo**, `.alert-box.info`) | 479×**78,13** @y571,38 | 335×**78,13** @y714,66 |
| `aog-impact-banner` (**nuovo**, `.alert-box.bad`) | 479×**101,5** @y161,59 | 335×**101,5** @y201,88 |
| `aog-impact-row` (**nuovo**, `.fld-hint`) | 479×**17,39** @y586,59 | 335×**17,39** @y729,88 |
| `out-of-service-confirm` (**nuovo**) | 82,3×**34,84** | 82,3×**44** |
| `out-of-service-cancel` (**nuovo**) | 67,98×**34,84** | 67,98×**44** |
| `out-of-service-submit` (1a) | **479×34,84** — invariato al centesimo | **335×44** — invariato al centesimo |
| `[role=dialog]` | 520×900 @x760 — invariato | 375×812 @x0 — invariato |
| `.so-body` | 519×756,39 — invariato | 375×659,23 — invariato |
| `documentElement` overflow-X | **0** | **0** |

**Il fold, dichiarato (AC 14).** La sezione Disponibilità cresce una seconda volta: `out-of-service-submit` passa da **y 908,17** (misura di 1a a 375) a **y 1 000,30** — **+92,13px**, cioè l'altezza del box di anteprima (78,13) più il gap del `.form-grid` (14). Su un `.so-body` alto 659,23 il submit è quindi **a 341px sotto il bordo inferiore del corpo scrollabile** e si raggiunge **scorrendo**: era già così prima di 1b (908,17 > 659,23) e questa story lo peggiora di 92,13px. **Il pannello e il `.so-body` non cambiano di un centesimo**: la sezione cresce dentro il corpo scrollabile, non sposta la cornice. Il baricentro dell'avviso, però, si sposta **in su**: l'anteprima è il primo elemento della sezione ed è **sopra** il fold appena la sezione è a schermo.

> ⚠️ **Correzione (review MINOR-1, fix `a1b2362`, 2026-09-26)** — il paragrafo sopra misurava il fold **solo a 375** e taceva **1280×900**, dove era **falso** che «era già così prima di 1b»: pre-1b il submit era visibile all'apertura (bottom **811,97** < bordo del `.so-body` **840,16**), con 1b finiva a bottom **904,09** (64px sotto, scroll obbligatorio). Misure **dopo il fix** (build di produzione, `playwright-core`, tema chiaro e scuro identici):
>
> | Caso | 1280×900 | 375×812 |
> |---|---|---|
> | **0 prenotazioni** (anteprima = una riga `.fld-hint`) | submit **y 777,13 / bottom 811,97** — **sopra** il fold (840,16), `scrollTop 0`: identico al pre-1b al centesimo. La riga vive nella cella del `.form-grid` accanto alla data (232,5×34,78 @x1027,5 y728,34, 2 righe visive), **0px** di altezza aggiunta | riga di suo (335×34,78, 2 righe visive); submit **y 956,95** (bottom 1 000,95 contro 743 del `.so-body`): sotto il fold di **257,95px**, contro 301,30 prima del fix e 209,17 pre-1b |
> | **N > 0** (box completo, invariato per decisione PO) | submit y 869,25 / bottom 904,09 — sotto il fold di 63,93px, **dichiarato**: con N > 0 il box è l'avviso che P1 chiede, sopra il submit | submit y 1 000,30 (invariato) |
>
> `[role=dialog]` 520×900 / 375×812 e `.so-body` 519×756,39 / 375×659,23 **invariati**; overflow-X **0**. Dettaglio e alternativa scartata nel Review Record.

**Contrasti WCAG** (canvas → sRGB → WCAG, sfondo effettivo risalendo gli antenati, cascata reale, `getClientRects().length > 0`; ⚠️ misurati **col puntatore lontano e dopo il transition** — leggerli subito dopo un click dà il valore INTERMEDIO della transizione `.btn` e produce falsi 1,04:1)

| Testo nuovo | Chiaro | Scuro | Soglia |
|---|---|---|---|
| `aog-impact-preview` — titolo, spacco, finestra (3 span) | **8,46** | **8,79** | ≥4,5 ✅ |
| `aog-impact-banner` — titolo, spacco, finestra (3 span) | **8,38** | **7,46** | ≥4,5 ✅ |
| `aog-impact-bookings-link` (dentro `.alert-box.bad`) | **8,38** | **7,46** | ≥4,5 ✅ |
| `aog-impact-row` (`.fld-hint`, `--ink-3`) | **4,85** | **5,72** | ≥4,5 ✅ |
| `out-of-service-confirm` (`.btn.primary`) | **17,99** | **17,00** | ≥4,5 ✅ |
| `out-of-service-cancel` (`.btn`) | **18,79** | **15,74** | ≥4,5 ✅ |

Il link del banner **eredita l'inchiostro del box** e porta la sottolineatura (`color: inherit; text-decoration: underline`) — asserito nell'e2e confrontando `getComputedStyle(link).color` con quello del box, mai contro un literal. Senza quella regola avrebbe ereditato `a{ color: var(--info) }` sul `--bad-soft`: è il difetto a 3,61:1 che R-15.10-i ha già misurato su 64 righe.

**Testo reso, verbatim dalla misura**
- IT anteprima: `Stai per impattare 4 prenotazioni. / In attesa (congelate): 0 · Approvate (da gestire): 4 / rientro da definire: conteggio non delimitato · stima`
- IT banner: `Fermo registrato: 1 prenotazione impattata. / In attesa (congelate): 0 · Approvate (da gestire): 1 / conteggio fino al 10/08/2026 compreso / Vedi le prenotazioni`
- IT riga: `1 prenotazione nel fermo · conteggio fino al 10/08/2026 compreso`
- EN riga: `1 booking inside the grounding · counted until 10/08/2026 inclusive`
- EN email (destinatario `locale: 'en'`): subject `Aircraft out of service: I-…`, corpo con `until 17/08/2026 inclusive` e `has NOT been cancelled`

### §D — AC 9: censimento di `outOfServiceUntil`, classificato voce per voce

`grep -rn 'outOfServiceUntil' src/server/ prisma/schema.prisma` (esclusi i test e i doc-comment):

| File:riga | Cosa fa | Classe | Di chi |
|---|---|---|---|
| `prisma/schema.prisma:312` | la colonna + il doc-comment che è la **fonte unica** della semantica | schema | 1a |
| `aircraft.service.ts:31-32` | tipo del DTO | dichiarazione | 1a |
| `aircraft.service.ts:68` | chiave di `AIRCRAFT_SELECT` | **lettura** | 1a |
| `aircraft.service.ts:76-77` | tipo della riga grezza | dichiarazione | 1a |
| `aircraft.service.ts:89` | `toListItem` → `toDateOnlyString` | **visualizzazione (DTO)** | 1a |
| `aircraft.service.ts:466` | `setOutOfService`, chiave del `data` | **scrittura (ciclo di vita)** | 1a |
| `aircraft.service.ts:476` | `until` passato a `computeAogImpact` | **limite superiore della finestra di conteggio** | **1b** |
| `aircraft.service.ts:571` | `outOfServiceUntil` passato al template dell'email | **messaggio** | **1b** |
| `aircraft.service.ts:601` | `returnToService`, azzeramento | **scrittura (ciclo di vita)** | 1a |
| `bookings.service.ts:547-548 / 914-915 / 1144-1145` | colonna nei tre `SELECT … FOR UPDATE` | **lettura** | 1a |
| `flights.service.ts:617/621` | chiave del `select` | **lettura** | 1a |
| `aircraft-status.ts:29-35` | `outOfServiceDetails` | **messaggio d'errore** | 1a |
| `templates.ts:369/375` | parametro e frase della finestra nell'email | **messaggio** | **1b** |
| `aog-impact.ts` | **solo doc-comment**: il parametro si chiama `until`, e la finestra che costruisce filtra `Booking.startsAt`, **mai** `Aircraft` | **limite della finestra** | **1b** |

**Zero** occorrenze dentro una `where` Prisma che selezioni velivoli per stato, dentro un `if` che decida se un velivolo vola, dentro un job o un cron. Le **quattro** voci nuove di 1b sono tutte «limite della finestra di conteggio» o «messaggio»: l'unica cosa che decide se un velivolo vola resta `status`.

⚠️ **Una tensione interna allo story file, risolta e dichiarata**: AC 1 definisce la finestra `[ora, fine giornata di until]`, e AC 9 pretende che un `until` **già passato** NON azzeri il conteggio. Presi alla lettera insieme darebbero 0 (finestra vuota) proprio quando il fermo è andato lungo — che è esattamente ciò che AC 9 vieta. La regola vive in **un solo posto** (`aog-impact.ts`, doc-comment + una riga): **un limite superiore già passato non è un limite**, e la finestra torna quella non delimitata. Discriminanza D2 in §F.

### §E — AC 17: convenzioni e2e, testid, isolamento

**Testid nuovi (5)**: `aog-impact-preview`, `aog-impact-banner`, `aog-impact-row`, `aog-impact-bookings-link`, `out-of-service-confirm`, `out-of-service-cancel`. Audit obbligatorio eseguito **prima** di sceglierli — `grep -rn 'data-testid\^=' e2e/` dà **12 prefissi letterali + 1 loop dinamico** (`ac-card-`, `mobile-fleet-card-`, `mobile-fleet-`, `mobile-pilot-row-`, `mobile-instructor-row-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `reports-fleet-row-`, `reports-rank-aircraft-row-`, `flight-row-mobile`, + il loop di `mobile-reports.spec.ts:611-612` su `reports-fleet-row-`/`reports-rank-aircraft-row-`/`reports-rank-pilot-row-`/`reports-instructor-row-`). **Nessuno** copre `aog-impact-*` né `out-of-service-*`. Ognuno di questi controlli è **un solo nodo DOM a tutte le larghezze** (come `out-of-service-reason`/`-submit`), quindi né suffisso `-mobile` né prefisso `mobile-`: entrambi sarebbero sbagliati.

**Isolamento, con la motivazione (la scelta, non l'implicito): NESSUN project serializzato.** Lo spec vive nel project `chromium` `fullyParallel`, e regge per costruzione:
- **il velivolo è run-unique** e ogni test ferma **il proprio** — la disciplina identica dei tre spec che già fermano velivoli e di quello di 1a;
- **le persone e le prenotazioni sono run-unique**, quindi ogni numero asserito è un numero che il test ha creato: nessuna fotografia di fixture altrui (lezione 15.10);
- **la casella Mailpit è stato globale**, e viene letta **solo** per `to:<indirizzo run-unique>` + **subject esatto** — mai un totale, mai l'ultimo arrivato;
- **nessuna asserzione tocca un aggregato globale** (i «N AOG» della Flotta o della Panoramica), che è l'unica cosa che obbligherebbe alla catena (review Billing-2 F4). La guardia di 1a che LEGGE un aggregato globale resta dov'è, nel suo project `aog-overview-count`, e non è stata toccata.

**Fixture**: nessuna time-dependent. Ogni data è `dateOnlyFromToday(offset)`, gli orari sono 08:00-09:00Z (dentro ogni finestra di scheduling che i project serializzati lasciano dietro) e la prenotazione «oltre la finestra» è a **+40 giorni**, che sta dentro il `maxAdvanceDays` più restrittivo (45) che uno dei project serializzati scrive transitoriamente. La data attesa nei messaggi è prodotta dallo **stesso** `Intl.DateTimeFormat` di `formatDateOnly`, mai hard-coded. **Nessun `hasText` con date o `H:MM`**; le righe si trovano per marca run-unique.

**Precondizione prenotazioni**: `ensureValidSeedExpiries(page, personId, 'PILOTS')` su OGNI persona creata — senza, `createBooking` risponde 422 sui documenti scaduti (TD 15.5) prima di arrivare a qualunque cosa di questa story.

**Verifica a lettura dell'OpenAPI generato** (AD-5; `registry.test.ts` usa `arrayContaining` e non la copre): `generateOpenApiDocument()` →
- `POST /api/v1/aircraft/{id}/out-of-service` → 200 = oggetto con `required: ["aircraft","impactedBookings"]`, `aircraft` = l'`Aircraft` completo (`outOfServiceUntil: {"type":["string","null"],"format":"date"}` ancora al suo posto), `impactedBookings` = `{pending, approved}` interi `minimum: 0`, entrambi `required`;
- `GET /api/v1/aircraft/{id}/out-of-service-impact` → **registrato** (non è diventata la nona rotta mancante dell'action item «F5 review 12.11»), parametro `until` `{"type":"string","format":"date"}` **non** required, 200 = `{pending, approved}`, errori 401/403/404/422;
- schemi registrati: `AogBookingImpact`, `SetOutOfServiceResponse`.

### §F — Tabella guardia → discriminanza (tutte provate ROSSE simulando il pre-fix, ripristino byte-identico dichiarato)

| # | Guardia nuova | Simulazione del pre-fix | Esito rosso |
|---|---|---|---|
| D1 | boundary INCLUSIVO di AC 1 (d) | finestra ESCLUSIVA (`zonedMidnightUtc(until)` invece di `until+1`) | **4 failed**: `(d)` *expected 1 to be 3*, `(d-bis)` *expected [] to equal ['oneMsBefore']*, + i due unit di service sul `lt` (*'2031-05-11T22:00:00.000Z' vs '2031-05-12T22:00:00.000Z'*) |
| D2 | invariante [a] di AC 9 | rimosso il clamp «un limite già passato non è un limite» | **1 failed**: *expected `{pending: 0, approved: 0}` to match `{pending: 1, approved: 2}`* |
| D3 | «una email fallita non ferma le altre» (AC 11) | rimosso il `try/catch` PER destinatario | **1 failed**: *expected "vi.fn()" to be called 2 times, but got 1* |
| D3-bis | «l'email non può far fallire l'AOG» (AC 11) | rimossi **entrambi** i `try/catch` | **1 failed**: `Error: SMTP down` — il grounding stesso rigetta |
| D5 | persistenza ≥ 5 s di AC 5 | banner con la vita del toast (`setTimeout(() => setImpact(null), 2600)`), build ricompilata | **1 failed** alla riga **244**, cioè l'asserzione **dopo** i 6 s (`toBeVisible` → *element(s) not found*), con tutte le asserzioni immediate ancora verdi: la discriminanza è esattamente il ritardo |
| D6 | «nessuna email alle PENDING» di AC 10 | fan-out su TUTTE le impattate (conteggi lasciati identici), build ricompilata | **1 failed** alla riga **279**: *no grounding email for the PENDING holder …* con il messaggio ricevuto stampato per intero |
| D7 | pavimento 44px dei due controlli nuovi (AC 3) | rimossa la regola CSS (11) | **1 failed**: *out-of-service-confirm touch floor at 375 — Expected: >= 44, Received: 34.84375* |

**Ripristino**: `sha256sum -c` sui quattro file toccati dalle simulazioni → **`aog-impact.ts: OK`, `aircraft.service.ts: OK`, `airops.css: OK`, `aircraft-editor.tsx: OK`**. Byte-identico, verificato, non affermato.

### §G — Decisioni non ovvie

1. **`computeAogImpact` vive in un modulo NUOVO (`aog-impact.ts`), e il client Prisma è un PARAMETRO.** AD-1 chiede di provare l'assenza di ciclo: questo modulo importa **niente** da `services/` (solo `date-only`, `time`, `zoned-time` e i tipi Prisma) e **solo** `aircraft.service.ts` lo importa — non esiste un arco che possa chiudere un ciclo, in nessuna delle due direzioni. Il client come parametro è ciò che permette al grounding di contare sulla **stessa connessione** della transazione e, insieme, ai suoi unit di girare in shell pulita senza mockare la catena della posta che il chiamante ora importa. È lo stesso ragionamento che in 1a ha prodotto `aircraft-status.ts`.
2. **La response è un WRAPPER `{ aircraft, impactedBookings }`, non un campo additivo.** AD-5 cita `balanceAlert` di `RegisterFlightResult` come «stessa forma, stessa disciplina», e quella forma è un wrapper (`{ flight, account, balanceAlert }`): l'entità sotto la sua chiave, il dato advisory accanto. L'alternativa additiva (una chiave in più a fianco dei campi dell'`Aircraft`) sarebbe stata **non-breaking** ma avrebbe sporcato il DTO che un client legge **e riscrive**. Costo reale della scelta, censito: **due** consumatori, `aircraft-editor.tsx` e l'helper `ground()` dell'e2e di 1a; gli altri quattro spec che fermano un velivolo leggono **solo lo status** e non si sono accorti di nulla.
3. **Il fan-out fa DUE query batch, non due per destinatario.** `sendBookingDeniedEmail` è il modello per UN destinatario; ripeterlo N volte darebbe 2N round-trip senza guadagno. Il `try/catch` è però **doppio** e deliberato: uno attorno alle due letture (se falliscono, `console.error` e basta) e uno **per destinatario** attorno al `send` (un indirizzo rotto non mangia gli altri) — le due discriminanze D3/D3-bis provano che servono entrambi.
4. **UNA email per TITOLARE, non per prenotazione**, che nomina la sua prenotazione **più vicina** (`approvedBookings` arriva `startsAt`-ascendente). AC 10 dice «una email ciascuno»; il conteggio invece resta per **prenotazione** (unit dedicato: 2 impattate, 1 email). Conseguenza dichiarata: un titolare con tre prenotazioni impattate ne vede nominata una — ma la frase sul fermo («fino al … compreso» / «rientro da definire») le copre tutte.
5. **Il secondo passo riusa l'idioma dell'Archivio**, che vive **nello stesso pannello** venti righe più sotto: stato `confirming`, il trigger che **sparisce**, la coppia conferma/annulla. Un secondo linguaggio per «questa azione chiede prima» nella stessa schermata sarebbe stato il difetto. Da qui anche il testid nuovo `out-of-service-confirm` (come `archive-confirm`), che è ciò che rende il doppio passo **provabile** invece che invisibile a un test.
6. **Il debounce è 300 ms e nasce da una misura**, non da un'abitudine: un `<input type="date">` nativo emette un valore completo **per ogni cifra dell'anno**, quindi senza debounce una data digitata sono 4 richieste, tre delle quali su anni che nessuno ha chiesto (e che, con il TD 14.8 F6, un `0002` lo mapperebbe pure su `1902`).
7. **Modificare motivo o data mentre il doppio passo è armato lo DISARMA**: altrimenti la seconda pressione scriverebbe qualcosa che la prima non aveva mostrato.
8. **`role="status"` (polite) e non `role="alert"`** su anteprima e banner: nessuno dei due è un errore dell'utente — uno è un preavviso che si aggiorna mentre si digita, l'altro è il referto di un'azione voluta. `.alert-box.bad` porta il **tono**, non il ruolo.

### §H — Deviazioni, motivate

| # | Deviazione | Motivo |
|---|---|---|
| 1 | **Il link del banner NON è filtrato per velivolo**: punta a `/{locale}/dashboard/bookings?status=PENDING,APPROVED` | **Misurato**: `/dashboard/bookings` legge `{page, view, date, status}` (`bookings/page.tsx:37`) e **non** un `aircraftId`; il filtro velivolo della timeline è **stato client** (`schedule.tsx:504-517`), non un URL. Aggiungerne uno significa un contratto d'URL **nuovo** su una pagina che §3 non elenca nel blast radius, con le regole di crosstalk verso `?page`/`?status`/`?view`/`?date` e i due href di export (lezione 6.4 M1). Il link porta quindi **ai due stati di cui il numero parla**, che è la parte esprimibile oggi. Il `?status` CSV è già supportato (`booking-status-filter.ts`) |
| 2 | **`availability.confirmReturnToService` resta MORTA** | È una **domanda** («Rimettere in servizio questo velivolo?»): consumarla significa aggiungere un doppio passo al **rientro in servizio**, che AC 3 non chiede e che romperebbe due spec e2e esistenti (`aircraft-status-hours.spec.ts:74`, `aircraft-out-of-service-until.spec.ts:205`) — fuori perimetro. `availability.confirm` invece è stata consumata, ed è quella che AC 3 nomina |
| 3 | **Toccato `e2e/aircraft-out-of-service-until.spec.ts` (1a) oltre i due punti di AD-8**: l'helper `ground()` scarta l'involucro (`body.aircraft`) | Conseguenza **diretta** del cambio di forma della response, che AD-8 autorizza esplicitamente al punto 1. Tre righe, nessuna asserzione di 1a indebolita |
| 4 | **Toccato `e2e/aircraft-status-hours.spec.ts` (story 2.5)**: due click invece di uno | Conseguenza **diretta** del doppio passo ratificato (AC 3): quel test guida il bottone che ora arma. Tre righe |
| 5 | **Regola CSS (11) NUOVA invece di allargare la (10) di 1a** | I due controlli del secondo passo sono controlli nuovi e prendono il pavimento a 44px; la regola di 1a resta **byte-identica**, così la sua misura continua a descrivere esattamente ciò che ha misurato |
| 6 | **Un terzo test e2e non previsto dal §4** (bersagli 44px + inchiostro del link) | AC 3 e AC 14 lo chiedono («il controllo nuovo rispetta i 44px», «ogni pixel di testo nuovo»), e senza una guardia la regola CSS nuova sarebbe l'unica cosa della story senza discriminanza (D7) |
| 7 | **Il clamp «un limite già passato non è un limite»** | Unica lettura che soddisfa insieme AC 1 e AC 9 — v. §D |
| 8 | **`impactWindowUntil`/`impactWindowUndelimited` sono stringhe NUOVE** invece di riusare `untilValue`/`untilUnknown` di 1a | Quelle due sono clausole di «Stato attuale» («fermo fino al … compreso»); qui la frase parla del **conteggio** («conteggio fino al … compreso», «rientro da definire: conteggio non delimitato»), che è ciò che AC 8 chiede di dichiarare. Riusare le prime avrebbe detto una cosa diversa da quella che l'AC vuole |

### §I — TD da registrare (non miei: `sprint-status.yaml` è della sessione principale)

- **Costo del fan-out del grounding (AC 13)** — misurato su questa macchina: `POST /api/v1/aircraft/{id}/out-of-service` con **21** titolari APPROVED distinti dura **1 615 ms**, contro **16 ms** con zero destinatari (≈ **76 ms/destinatario**, SMTP verso Mailpit **locale**). L'invio è sequenziale, best-effort e post-commit, dentro la richiesta. Con un provider SMTP remoto il tempo scala col RTT e su un velivolo molto prenotato l'admin aspetta. **Nessun cap, nessuna coda, nessun batching sono stati introdotti** (non ratificati, AC 13): serve una ratifica PO per aprire il tema.
- **Ereditati e dichiarati, non toccati**: TD 14.8 F6 (`date-only.ts`, anni <100 → 1900+anno — raggiungibile anche dal `until` dell'anteprima, che però è generato dal controllo nativo), TD `OPTIONS_PAGE_SIZE`, TD 14.9 F11, TD AD-9 (la data non è modificabile senza rientro in servizio), i 40 `var(--bad)`/`var(--ok)` inline, le 42 celle `.cal-popover`.

### §J — File toccati

**Dominio / contratti (5)**
- `src/server/services/aog-impact.ts` — **nuovo** (134 righe): la funzione di dominio unica
- `src/server/services/aircraft.service.ts` — `SetOutOfServiceResult`, `setOutOfService` in `$transaction`, `previewOutOfServiceImpact`, `sendAircraftGroundedEmails`
- `src/lib/schemas/aircraft.ts` — `aogBookingImpactSchema`, `setOutOfServiceResponseSchema`, `outOfServiceImpactQuerySchema`
- `src/lib/schemas/registry.ts` — 2 schemi + la 200 riscritta + il path nuovo
- `src/app/api/v1/aircraft/[id]/out-of-service-impact/route.ts` — **nuovo**

**Email (3)**
- `src/server/adapters/mail/templates.ts` — `buildAircraftGroundedEmail` (+ `formatDateOnly` importato da `@/lib/time`, già usato dal modulo per `formatDateTime`)
- `messages/it.json` + `messages/en.json` — `Emails.aircraftGrounded` (4 chiavi) + `AircraftPage.editor.availability.impact*` (11 chiavi); **parità verificata: 0 chiavi solo-IT, 0 solo-EN** su 1 978

**UI (3)**
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` — anteprima, doppio passo, banner, riga, `SetOutOfServiceApiResponse`, `IMPACT_DEBOUNCE_MS`
- `src/app/[locale]/dashboard/fleet/page.tsx` — wiring delle 11 label nuove
- `src/styles/airops.css` — **due** regole: `.alert-box a` e il pavimento 44px dei due controlli nuovi

**Test (5)**
- `src/server/services/aog-impact.test.ts` — **nuovo** (8 test)
- `src/server/services/aircraft.service.test.ts` — mock della catena posta, 3 delegate Prisma nuovi, asserzioni riallineate al valore **corretto**, 13 test nuovi
- `src/server/adapters/mail/templates.test.ts` — 3 test del template nuovo
- `e2e/aog-impact-email.spec.ts` — **nuovo** (3 test)
- `e2e/aircraft-out-of-service-until.spec.ts` + `e2e/aircraft-status-hours.spec.ts` — le due conseguenze dichiarate in §H (3 e 4)

**NON toccati, a riprova del perimetro**: `src/server/services/bookings.service.ts`, `src/server/services/flights.service.ts`, `src/server/services/aircraft-status.ts`, `prisma/schema.prisma`, `src/components/dashboard/fleet-card.tsx`, `src/app/[locale]/dashboard/fleet/fleet-console.tsx`, `src/app/[locale]/dashboard/page.tsx`, `src/app/[locale]/dashboard/bookings/**`, `src/lib/mobile-agenda.ts`, `src/server/services/exports.service.ts`, `src/lib/date-only.ts`, `src/components/ui/{date-input,calendar-popover,toast,slide-over}.tsx`, `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` (la rotta passa avanti ciò che il service restituisce: non è cambiata di una riga), `e2e/aog-overview-count.spec.ts` e `playwright.config.ts`.

### §K — Cosa NON ho fatto

- **Nessun cap, nessuna coda, nessun batching** sul fan-out (AC 13): solo la misura e il TD di §I.
- **Nessun annullamento automatico** delle prenotazioni impattate, **nessuna email al rientro**, **nessuna email alle PENDING**, **nessun canale nuovo** (push/in-app), **nessuna marcatura** della prenotazione impattata nelle liste del pilota.
- **Nessun filtro `?aircraftId` nuovo** su `/dashboard/bookings` (§H 1).
- **Nessuna riga di produzione di 1a riscritta** oltre ai due punti di AD-8: la `where` guardata, il `ConflictError`, la rilettura e l'azzeramento di `returnToService` sono byte-identici; `bookings.service.ts` e `flights.service.ts` non sono stati aperti in scrittura.
- **`sprint-status.yaml` e `docs/handoffs/HANDOFF.md`**: non toccati (sono della sessione principale). Il TD di §I va registrato lì.
- **Nessun commit** (per istruzione).

### §L — Gate ed esiti, ONESTI

- **`npm run gates`** (eseguito **dopo** il ripristino byte-identico delle simulazioni pre-fix, su DB fresco):
  `PASS lint (20s) · PASS typecheck (3s) · PASS test (7s) — Tests 1819 passed (1819) · PASS build (29s)`
  **1 819 = 1 795 di baseline + 24 miei** (8 `aog-impact.test.ts`, 13 `aircraft.service.test.ts`, 3 `templates.test.ts`).
- **Unit in shell PULITA** (AC 16): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` su `aog-impact.test.ts` (**8 passed**), `aircraft.service.test.ts` (**71 passed**), `templates.test.ts` (**19 passed** — corretto dalla review LOW-1: qui c'era scritto 22) — verde. È il gate che la catena della posta appena importata in `aircraft.service.ts` avrebbe rotto senza i `vi.mock`.
- **e2e mirati** (build di produzione, `E2E_REUSE_SERVER=1`, via `scripts/e2e.sh`, esito letto **solo** con `status`):
  - `--project=chromium -g "story AOG-1b"` → **3 passed, `E2E_EXIT=0`**
  - `--project=chromium -g "AOG-1a|Story 2.5"` (non-regressione sui due file toccati) → **13 passed, `E2E_EXIT=0`**
- **Suite completa `CI=1` su build di produzione e DB FRESCO** (DB ricreato con `DROP DATABASE … WITH (FORCE)` + `CREATE DATABASE` + `migrate deploy` + `db seed`; casella Mailpit svuotata; **nessuna build lanciata durante il run**, `scripts/e2e.sh start`):

  ```
  524 passed (13.7m) — 0 failed, 0 flaky, 0 skipped — E2E_EXIT=0
  ```

  **524 = 521 di baseline + 3 miei.** I miei tre sono verdi **al primo tentativo**. I **3 skipped AMBIENTALI** che l'arbitro di 1a aveva registrato (`mobile-metar.spec.ts` 61/167/208, `test.skip(!metar?.raw)` by contract) **non ci sono in questo run**: aviationweather.gov era raggiungibile e i tre test sono **passati** (righe 506/507/508 del log) — quindi 521 = 518 + 3, come dichiarato dall'arbitro di 1a, e il totale torna.
- **Lock anti-brute-force (TD-6)**: nessun rosso attribuito alla flake di login; nessuno è occorso. Il flaky noto `flights.spec.ts:602` (seconda faccia del TD 15.5) **non si è presentato** in questo run.
- **Stato finale della macchina**: porta **3000 LIBERA** (il server della suite si chiude col run; quello che avevo aperto per le misure è stato ucciso prima di ogni rebuild, come impone CLAUDE.md); DB **post-suite** (193 velivoli, 17 AOG, 11 con data di rientro, 102 prenotazioni, 394 persone); Mailpit con **168** messaggi (tutti della suite). Nessun commit.

## Decisioni PO sui findings della review (2026-09-10 — chiudono le 5 decisioni del report `aog-1b-review-report.md` §5; il fix cycle può partire)

1. **MAJOR-1 (frase vs numero a bound scaduto)** — frase **DEDICATA** (2 chiavi × 2 locale, es. «fermo oltre il {data} previsto: conteggio non delimitato»), e la finestra EFFETTIVA esce da `computeAogImpact` nel DTO (`effectiveUntil: string | null`, null quando il bound è stato clampato); anteprima, banner, riga persistente ed email scelgono la frase su QUELLO (AD-1: nessuna seconda derivazione a valle). Decisione presa il 2026-09-10 in chat.
2. **MAJOR-2 (doppio click sul doppio passo)** — **idioma Archivio completo**: una domanda (`fld-label`, «Confermi il fermo? N prenotazioni impattate» / caso anteprima assente incluso) davanti alla coppia conferma/annulla, così il Conferma esce dal punto di click del trigger; 2 chiavi × 2 locale; e2e con doppio click che NON scrive.
3. **MINOR-1 (fold a 1280)** — **compattare a 0 prenotazioni**: con totale 0 l'anteprima è una sola riga («Nessuna prenotazione impattata»); con N > 0 il box completo resta. Rimisurare §C a 1280 e 375.
4. **MINOR-2 (link del banner non filtrato)** — **tenerlo così e dichiararlo** nel Review Record; il filtro per velivolo arriverà con la story 17.2 (filtro server via URL sulla Pianificazione) e allora il link si aggiorna.
5. **TD fan-out in-request** — registrato come TD verso la **story 17.8** (invii fuori richiesta per alert e AOG insieme); nessun cap ora.

LOW-1..4: fixare il conteggio unit nel record (LOW-1), dichiarare LOW-2/3/4 nel Review Record. Il fix è UI → **Opus 5 xhigh**; parte dopo il commit della 16.2 (condividono `messages/*.json`).

## Review Record — AOG-1b

**Review**: `aog-1b-review-report.md` (Opus 5 xhigh, 2026-08-07) — verdetto **SHIPPABLE-WITH-FIXES**: 2 MAJOR, 2 MINOR, 4 LOW, 0 BLOCKER · **Decisioni PO**: 2026-09-10 (sezione precedente) · **Fix**: `a1b2362` (decisioni 1-5) + `b12feef` (decisione PO 6, presa il 2026-09-26 dopo la misura del residuo di MAJOR-2) — Opus 5 xhigh, subagent, su `dev` · **Macchina**: Fedora locale, build di produzione, DB `airmanager` NON resettato (quello base-seminato dalla sessione principale).

### R.0 — La bozza ereditata (fix agent fermato dal PO il 2026-09-10, ~380 righe mai verificate)

Letta riga per riga contro il mandato. **Tenuto** (verificato, non creduto): `effectiveUntil` nel dominio, nel DTO Zod, nel registry e nella response del grounding; la frase dedicata in UI ed email; la domanda davanti alla coppia; l'anteprima compatta a zero nella cella accanto alla data; le label e il wiring in `page.tsx`; i 3 unit nuovi; i due e2e nuovi. **Cambiato**:
1. **La frase del caso «scaduto» nella UI** leggeva la data dal controllo (`impactUntil`), che corre AVANTI al conteggio per tutto il debounce + la richiesta: un conteggio non delimitato accanto a una data futura appena digitata avrebbe detto «fermo oltre il {quella data} previsto». Ora il conteggio viaggia con la data per cui è stato chiesto (`ShownImpact = AogBookingImpactDto & { askedUntil }`, scritto insieme nel fetch e nella response del grounding). Misurato: subito dopo aver digitato +10 giorni su un velivolo con 2 prenotazioni il testo resta `…rientro da definire: conteggio non delimitato · stima` (il numero vecchio con la SUA frase), poi diventa `…conteggio fino al 06/10/2026 compreso · stima`.
2. **L'e2e MAJOR-2 + MINOR-1 era UN test**: sul pre-fix il fold falliva per primo e il doppio click non veniva mai eseguito, quindi la sua discriminanza era improvabile. Diviso in due test, il fold asserito PRIMA del testo, il doppio click preceduto da `scrollIntoViewIfNeeded()` (come la review) così non dipende dal fold.
3. **Il testimone del doppio click**: la lettura dal DB subito dopo il gesto poteva correre contro una POST ancora in volo (falso verde sul pre-fix). Ora il test conta le **richieste POST** verso `/out-of-service` (partono sincrone dal click che conferma) e solo dopo legge il DB.
4. **Commenti** allineati ai numeri misurati (il «~3 px» della bozza → 3,20 misurati; il residuo di MAJOR-2 dichiarato nel commento).

**Tolto**: il testid `out-of-service-confirm-question` (non serviva: l'Archivio non ne ha, e l'e2e trova la domanda con `getByText(…, { exact: true })`). **Nessun testid nuovo** in questo fix; `aog-impact-preview` resta un solo nodo (due rami di render mutuamente esclusivi).

### R.1 — Le decisioni PO, applicate (cinque del 2026-09-10 + la sesta del 2026-09-26)

**1. MAJOR-1 — finestra EFFETTIVA dal dominio, frase dedicata.** `computeAogImpact` restituisce `effectiveUntil: string | null` — il giorno del bound se è ancora vivo, `null` sia senza data sia col bound clampato (la regola resta in `aog-impact.ts` e SOLO lì). Il DTO `aogBookingImpactSchema` lo porta, quindi `GET /out-of-service-impact` e `impactedBookings` di `POST /out-of-service`; registry aggiornato nello stesso commit. **OpenAPI generato, letto** (`GET /api/v1/openapi.json`, 84 path): `AogBookingImpact` = `{pending: integer ≥0, approved: integer ≥0, effectiveUntil: {"type":["string","null"],"format":"date"}}`, tutti e tre `required`; `SetOutOfServiceResponse.impactedBookings` identico. UI (anteprima, banner, riga) ed email scelgono la frase su `effectiveUntil`: vivo → `impactWindowUntil`/`windowUntil`; `null` senza data chiesta → `impactWindowUndelimited`/`windowUnknown`; `null` CON data chiesta → **frase nuova**. Chiavi nuove (2 × 2 locale):

| Chiave | IT | EN |
|---|---|---|
| `AircraftPage.editor.availability.impactWindowOverdue` | fermo oltre il {date} previsto: conteggio non delimitato | grounding past the expected {date}: count not delimited |
| `Emails.aircraftGrounded.windowOverdue` | oltre il {date} previsto, rientro da definire | past the expected {date}, return date not yet known |

L'email non parla di un conteggio, quindi la sua frase non dice «conteggio»: dietro l'etichetta «Fermo:» già presente si legge `Fermo: oltre il 25/09/2026 previsto, rientro da definire`. **Prima → dopo**, stessa fixture (velivolo fermato con `until` = ieri, una APPROVED a +40 giorni): riga `1 prenotazione nel fermo · conteggio fino al 25/09/2026 compreso` → **`1 prenotazione nel fermo · fermo oltre il 25/09/2026 previsto: conteggio non delimitato`** (EN `1 booking inside the grounding · grounding past the expected 25/09/2026: count not delimited`); response `{"pending":0,"approved":1,"effectiveUntil":null}`. Anteprima di un velivolo operativo con data candidata già passata: `…fermo oltre il 25/09/2026 previsto: conteggio non delimitato · stima`. Contrasto della riga invariato (**4,85** chiaro / **5,72** scuro, `.fld-hint`).
Test: unit `aog-impact.test.ts` (bound futuro → il suo giorno, oggi → oggi, ieri → `null`, nessuna data → `null`; e il caso clampato `expired.effectiveUntil === null`), unit `aircraft.service.test.ts` (anteprima con candidata già passata → `effectiveUntil: null` E nessun `lt` nella query: numero e finestra sono la stessa decisione), unit `templates.test.ts` (frase «oltre il … previsto» IT/EN, mai «fino al … compreso»), e2e `aog-impact-email.spec.ts:421` (DTO, riga IT/EN, email IT).

**2. MAJOR-2 — idioma Archivio completo.** Armato, il blocco è `<span class="fld-label">{domanda}</span>` + Conferma + Annulla (riga flex con `align-items: center`, `gap 8`, come `ArchiveSection`). La domanda ha il conteggio; la variante per l'anteprima che non ha mai risposto non lo ha:

| Chiave | IT | EN |
|---|---|---|
| `confirmQuestionOne` | Confermi il fermo? 1 prenotazione impattata | Confirm the grounding? 1 booking impacted |
| `confirmQuestionMany` | Confermi il fermo? {count} prenotazioni impattate | Confirm the grounding? {count} bookings impacted |
| `confirmQuestionUnknown` | Confermi il fermo? Conteggio non disponibile | Confirm the grounding? Count unavailable |

**Geometria, prima → dopo** (build di produzione, `playwright-core`, stessa procedura della review: trigger portato in vista con `scrollIntoViewIfNeeded()`, click sul bordo sinistro = `x+4` a metà altezza, centro = centro del box):

| | trigger | confirm PRIMA | confirm DOPO | copre bordo sx / centro (prima → dopo) | `dblclick` nativo bordo sx (prima → dopo) | `dblclick` centro (dopo) |
|---|---|---|---|---|---|---|
| **1280** | 781,444,25 · 479×34,84 | **781,444,25** · 82,3×34,84 | **1096,03,444,25** · 82,3×34,84 (cancel 1186,33) | **sì** / no → **no / no** | **1 POST, OUT_OF_SERVICE** → **0 POST, OPERATIONAL, armato** | 0 POST, OPERATIONAL |
| **375** | 20,567,3 · 335×44 | **20,567,3** · 82,3×44 | **20,590,52** · 82,3×44 (cancel 110,3) | **sì** / no → **no / no** | **1 POST, OUT_OF_SERVICE** → **0 POST, OPERATIONAL, armato** | 0 POST, OPERATIONAL |

Domanda: 307,03×15,22 a entrambe le larghezze (a 375 riempie la prima riga e la coppia va a capo). Contrasto domanda **4,85** chiaro / **5,72** scuro (`.fld-label`, `--ink-3` sul pannello), Conferma **17,99**. Bersagli: Conferma/Annulla **82,3×44 / 67,98×44 a 375** (regola (11) di 1b intatta), **82,3×34,84** a 1280; `out-of-service-submit` **479×34,84** a 1280 (identico al centesimo) e **335×44** a 375.

⚠️ **Residuo della sola domanda** (misurato dopo `a1b2362`, segnalato alla sessione principale, **chiuso dalla decisione PO 6** — R.1-6): il trigger è **a tutta larghezza** e deve restarlo (479×34,84, vincolo di 1a), quindi nessuna disposizione in flusso tiene la coppia fuori dal suo box. A **1280** il Conferma sta **interamente dentro** il box del trigger (intersezione 82,3×34,84), a destra dell'etichetta centrata (x 1096-1178 contro centro 1020,5): un doppio click in QUEL tratto del trigger armerebbe e confermerebbe ancora. A **375** il Conferma copre i 20,78px inferiori degli 82px di sinistra del trigger, e il punto «bordo sinistro a metà altezza» ne resta fuori di **1,22px**. Le due chiusure geometriche/temporali (coppia spostata di almeno l'altezza del trigger, oppure Conferma disabilitato ~500ms dopo l'armo) **non sono state scelte**: il PO ha scelto la terza, `event.detail` (R.1-6). E il margine di 1,22px a 375 era **peggio** di quanto sembrasse: col tocco, l'aggiustamento del tap di Chromium lo annulla (R.1-6, misura).
e2e `aog-impact-email.spec.ts:385` a 1280: `dblclick` sul bordo sinistro → **zero POST** verso l'endpoint, domanda visibile, Conferma non sotto il punto cliccato (e, dalla decisione 6, lo stesso gesto anche nel punto di sovrapposizione — R.1-6).

**3. MINOR-1 — anteprima compatta a zero.** Con totale 0 l'anteprima è **un solo `.fld-hint`**, «Nessuna prenotazione impattata · rientro da definire: conteggio non delimitato» (EN «No bookings impacted · return date not yet known: count not delimited») — la frase della finestra resta perché AC 8 vale anche a zero; con N > 0 il box completo è invariato. **Dove**: sopra i 640px nella cella del `.form-grid` che la data lascia vuota (232,5×34,78, allineata in basso alla cella da 100,84), sotto i 640px riga propria dopo la data. **Fold, prima → dopo** (tabella completa in §C, «Correzione»): a **1280×900** il submit passa da bottom **904,09** (64px sotto il bordo 840,16 del `.so-body`, scroll obbligatorio) a bottom **811,97** — **visibile senza scroll**, `scrollTop 0`, identico al pre-1b al centesimo (y 777,13); a **375×812** da 1 044,30 a **1 000,95** (sotto il fold di 257,95px, era 301,30; pre-1b 209,17: a 375 il submit si raggiunge scorrendo, come sempre). Contrasto della riga **4,85 / 5,72**.
⚠️ **Deviazione dalla lettera «una sola riga»**: il testo è UNA riga di hint, ma nella mezza cella va a capo su **2 righe visive** (34,78px). L'alternativa letterale — riga a tutta larghezza in testa alla griglia, 1 riga visiva da 17,39px — è stata **misurata** e lascia il submit a bottom **843,36**, cioè **3,20px sotto** il fold a 1280: mancherebbe proprio l'obiettivo del finding. Scelta la cella accanto alla data, che costa 0px.
e2e `aog-impact-email.spec.ts:342`: fold asserito per primo (`submitBottom ≤ bodyBottom`, `scrollTop 0`), poi il testo esatto.

**4. MINOR-2 — link del banner non filtrato: tenuto così, dichiarato.** `aog-impact-bookings-link` punta ancora a `/{locale}/dashboard/bookings?status=PENDING,APPROVED`: porta ai due stati di cui il numero parla, **non** al solo velivolo del banner, perché `/dashboard/bookings` oggi non ha un filtro velivolo via URL (§H, deviazione 1). Il filtro arriva con la **story 17.2** (filtro server via URL sulla Pianificazione); lì il link si aggiorna. La regola CSS `.alert-box a` non è stata toccata.

**5. TD fan-out in-request — registrato verso la story 17.8** (invii fuori richiesta per alert e AOG insieme): 1 517-1 615ms con 21 destinatari contro 16-27ms a zero (misure del dev e della review), nessun cap ora. La riga in `sprint-status.yaml` la scrive la sessione principale.

**6. Decisione PO 6 (2026-09-26, via AskUserQuestion della sessione principale) — il Conferma ignora la seconda metà di un doppio click.** Aggiunta SOPRA l'idioma della domanda, che resta. `out-of-service-confirm` ha `onClick={(event) => { if (event.detail > 1) return; void submitOutOfService(); }}`: nessun cambiamento visivo, nessun ritardo, a qualunque posizione. Solo sul Conferma, **non** sull'Annulla (un doppio click che finisce sull'Annulla disarma e basta). **Effetti collaterali accettati**, scritti anche nel commento del codice (`fedb868`): un **triplo click** è ignorato anch'esso, e un click VOLUTO sul Conferma che cade entro l'intervallo del doppio click (e ±2px) dal click che ha armato ne richiede un **secondo**.

*Fattibilità, misurata PRIMA di implementare* (build `a1b2362`, senza guardia, listener in cattura su `document`, puntando dentro la sovrapposizione Conferma/trigger — 1280: 1137,18/794,55; 375: 61,15/649,56):

| Gesto | Sequenza di click misurata | Esito |
|---|---|---|
| `mouse.dblclick` 1280 / 375 | `submit` detail 1 → **`confirm` detail 2** (1 ms dopo) | OUT_OF_SERVICE: il conteggio SOPRAVVIVE al cambio di nodo sotto il puntatore |
| due `mouse.click` separati (clickCount 1), stesso punto, 45 ms | `submit` 1 → `confirm` **1** | OUT_OF_SERVICE: sotto CDP Chromium **non** conta i click del mouse, il conteggio è quello che Playwright gli passa |
| due `touchscreen.tap`, contesto `hasTouch`+`isMobile`, subito o a 150 ms | `submit` 1 → **`confirm` 2** | OUT_OF_SERVICE: qui Playwright invia tocchi grezzi senza conteggio, **il 2 lo calcola il rilevatore di gesti di Chromium** |
| tap singolo sul Conferma 800 ms dopo l'armo | `confirm` 1 | conferma |
| Invio / Spazio sul Conferma a fuoco | `confirm` **0** | conferma |

*Che cosa dà il browser a un utente vero*: per il **mouse** il conteggio lo fa la piattaforma, non Blink. Su Linux/Windows/ChromeOS è `ui/events/event.cc#MouseEvent::IsRepeatedClickEvent` (letto nel sorgente Chromium): confronta **solo** tipo di pressione, flag del tasto, tempo (≤ `kDoubleClickTimeMs`) e posizione (±2px, `kDoubleClickWidth/Height = 4`), **mai** il target o la finestra; su macOS è il `clickCount` di AppKit, anch'esso tempo+posizione. Quella metà NON è misurabile su questa macchina (nessun server X, nessun `xdotool`): è **citata dal sorgente**, non misurata. Per il **tocco** invece il conteggio è di Chromium ed è **misurato**.

*Verifica sulla build di produzione CON la guardia* (condizione 1 del PO; `b12feef`):

| Gesto | Click visti | POST | Stato |
|---|---|---|---|
| 1280, `dblclick` a destra dell'etichetta (1137,18/794,55, dentro Conferma E trigger) | `submit:1 confirm:2` | **0** | **OPERATIONAL**, armato |
| 1280, `dblclick` sul bordo sinistro (785/794,55) | `submit:1 SPAN:2` (la domanda) | **0** | **OPERATIONAL** |
| 375 mouse, `dblclick` sul bordo sinistro (24/637,95) | `submit:1 DIV:2` | **0** | OPERATIONAL |
| 375 mouse, `dblclick` sulla sovrapposizione (61,15/649,56) | `submit:1 confirm:2` | **0** | OPERATIONAL |
| 375 **tocco**, doppio tap sul **bordo sinistro** (24/637,95) | `submit:1` **`confirm:2`** | **0** | OPERATIONAL |
| 375 tocco, doppio tap sulla sovrapposizione | `submit:1 confirm:2` | **0** | OPERATIONAL |
| click singolo sul Conferma (1280, 375 mouse), tap singolo (375 tocco) | `confirm:1` | 1 | OUT_OF_SERVICE (conferma) |
| Invio / Spazio sul Conferma a fuoco (1280) | `confirm:0` | 1 | OUT_OF_SERVICE (conferma) |

⚠️ **La riga del doppio tap sul bordo sinistro è la scoperta della misura**: il punto è 1,22px SOPRA il Conferma, ma l'**aggiustamento del tap** di Chromium (che aggancia un tocco al nodo cliccabile più vicino entro l'area del dito) ha consegnato il secondo tap al Conferma. Senza la decisione 6 un doppio tap sul bordo sinistro del trigger, a 375, avrebbe fermato il velivolo: la sola geometria non bastava sul telefono, e nessuna misura a punto singolo (come quella della review) poteva vederlo.

*Onestà dei due e2e* (condizione 2):
- `aog-impact-email.spec.ts:385` (1280, mouse) fa il doppio click sul bordo sinistro E nel punto di sovrapposizione (la sovrapposizione è **asserita**: se un layout futuro la togliesse, il test lo direbbe invece di perdere in silenzio la sua discriminanza), poi controllo negativo con **Invio** (detail 0) che conferma. ⚠️ Prova la metà di Blink (il conteggio arriva al nodo nuovo) e la guardia dell'app, **ma passa anche perché Playwright imposta da sé `clickCount` 1 poi 2**: la metà «la piattaforma conta per tempo e posizione» non la prova, è citata dal sorgente (sopra).
- `aog-impact-email.spec.ts:448` (375, contesto `hasTouch`+`isMobile`, `storageState` della sessione admin: nessun login in più) fa il doppio **tap** nella sovrapposizione: qui il conteggio lo fa **Chromium**, quindi il test è onesto end-to-end nel browser. Controllo negativo: tap singolo dopo 800 ms (oltre l'intervallo del doppio tap) che conferma. Il click singolo del mouse è il gesto con cui confermano tutti gli altri test del file.
- Entrambi **ROSSI senza la guardia** (R.4, R6/R7).

*L'Archivio* (condizione 3, sola misura, **non toccato**): `archive-toggle-button` NON è a tutta larghezza (71,42×34,84) e la sua domanda è corta. A **1280** `archive-confirm` nasce a x 981,78 contro un trigger che finisce a 852,42; a **375** a x 220,78 contro 91,42 — intersezione col trigger **nulla** a entrambe le larghezze (il suo Annulla va a capo a 375, 8px sotto il trigger, ed è innocuo). **L'Archivio non ha la geometria del difetto.** Nota per la **16.8**, che riusa questo doppio passo: se il suo trigger è a tutta larghezza (o se una qualunque coppia nasce a portata di dito del trigger — l'aggiustamento del tap allarga il «sotto il punto» a un'area), riusare la stessa guardia `event.detail > 1`.

### R.2 — LOW

- **LOW-1** — corretto: `templates.test.ts` era **19** passed, non 22 (§B AC 16 e §L). Dopo questo fix: **20**.
- **LOW-2** — dichiarato: il messaggio del commit `ea54b3f` dice «in catena serializzata», ed è **falso**. Lo spec vive nel project `chromium` `fullyParallel`, `playwright.config.ts` non è toccato (neanche da questo fix) e §E motiva la scelta. Un messaggio di commit non si riscrive su un branch condiviso: vale questa riga.
- **LOW-3** — dichiarato, nessuna azione: un titolare con più prenotazioni impattate riceve **una** email che nomina la **prima** («La tua prima prenotazione interessata»), mentre il banner dell'admin conta per prenotazione (§G-4). È onesto nel testo; nessun test ne asserisce il corpo per più prenotazioni.
- **LOW-4** — dichiarato, nessuna azione: `role="status"` su anteprima e riga compatta si ri-annuncia a ogni ricalcolo (una volta per debounce). Scelta deliberata (§G-8); limitarlo al solo totale è un'alternativa che nessuno ha ratificato.

### R.3 — Deviazioni di questo fix

| # | Deviazione | Motivo |
|---|---|---|
| 1 | **3 chiavi × 2 locale** per la domanda (One/Many/Unknown), non le 2 stimate | La domanda contiene il conteggio e IT/EN flettono il nome («1 prenotazione impattata» / «{count} prenotazioni impattate»). Le label arrivano al client come stringhe `t.raw` interpolate lato browser, quindi niente ICU plural: la coppia One/Many è la convenzione del file (`impactPreviewOne/Many`, `impactBannerOne/Many`, `impactRowOne/Many`). Più `impactPreviewNone` per MINOR-1: **6 chiavi nuove per locale** in tutto |
| 2 | **Riga compatta su 2 righe visive** nella mezza cella | v. R.1-3: la riga a tutta larghezza lascia il submit 3,20px sotto il fold |
| 3 | ~~Residuo di MAJOR-2~~ → **chiuso dalla decisione PO 6** (`b12feef`) | v. R.1-2 e R.1-6: la domanda da sola lasciava il Conferma dentro il box del trigger a tutta larghezza (e, col tocco, raggiungibile anche dal bordo sinistro) |
| 4 | **`ShownImpact`** (la data chiesta viaggia col conteggio) | Non chiesto alla lettera: è ciò che rende VERA la frase dedicata anche durante il debounce (R.0-1) |

**Parità i18n**: 0 chiavi solo-IT, 0 solo-EN su **1 986** per file (1 980 al HEAD + 6). **Nessun `var(--bad)`/`var(--ok)` inline aggiunto** (`git diff -U0 | grep` → 0). `src/styles/airops.css` non toccato: `.alert-box a` e le regole (10)/(11) byte-identiche. **Nessun testid nuovo.**

### R.4 — Ogni guardia nuova, provata ROSSA su un pre-fix simulato

sha256 **prima** delle simulazioni: `aog-impact.ts 53d3638b…3e77`, `templates.ts 34b3a7c4…13b8`, `aircraft-editor.tsx 1c556982…cc50` (quest'ultimo prima delle sole correzioni ai commenti, fatte dopo il ripristino). Ogni simulazione è stata ripristinata da copia e verificata con `sha256sum -c` → **tre OK**.

| # | Guardia | Simulazione del pre-fix | Esito rosso |
|---|---|---|---|
| R1 | `effectiveUntil` riporta il clamp (unit, 3 test) | `effectiveUntil` = il giorno CHIESTO, senza clamp (è la finestra che le superfici ricostruivano dalla data grezza) | **3 failed**: `expected '2026-08-06' to be null` (×2, `aog-impact.test.ts`), `a CANDIDATE date already gone answers effectiveUntil: null` (`aircraft.service.test.ts`, deep equality) |
| R2 | frase «oltre il … previsto» nell'email (unit) | l'espressione pre-fix: `outOfServiceUntil === null ? windowUnknown : windowUntil(outOfServiceUntil)` | **1 failed**: `expected 'Ciao Lontano,…' to contain 'oltre il 06/08/2026 previsto, rientro…'` |
| R3 | frase della riga su bound scaduto (e2e `:421`) | `windowText` pre-fix ricostruito dalla data grezza, build ricompilata | **failed alla riga 440**: `Expected substring: "fermo oltre il 25/09/2026 previsto: conteggio non delimitato"` / `Received string: "1 prenotazione nel fermo · conteggio fino al 25/09/2026 compreso"` |
| R4 | doppio click che non conferma (e2e `:375`) | domanda rimossa (coppia all'origine del trigger), stessa build | **failed alla riga 398**: `a double click must not reach the grounding endpoint` — `Received: ["http://localhost:3000/api/v1/aircraft/…/out-of-service"]` |
| R5 | fold a 1280 con zero prenotazioni (e2e `:342`) | box completo anche a zero, stessa build | **failed alla riga 357**: `submit bottom 904.09375 must sit above the body edge 840.15625` |

| R6 | doppio click nel punto di sovrapposizione, 1280 (e2e `:385`, decisione 6) | riga `if (event.detail > 1) return;` sostituita da `void event;` (diff di UNA riga), build ricompilata | **failed alla riga 421**: `a double click at 1123.8515625,794.546875 must not reach the grounding endpoint` — `Received: ["http://localhost:3000/api/v1/aircraft/…/out-of-service"]`; la prima iterazione (bordo sinistro) era passata |
| R7 | doppio tap a 375 (e2e `:448`, decisione 6) | stessa build | **failed alla riga 478**: `a double tap must not reach the grounding endpoint` — `Received: ["http://localhost:3000/api/v1/aircraft/…/out-of-service"]` |

R3-R5 in **un solo** run (`-g "review MAJOR-1|review MAJOR-2|review MINOR-1" --retries=0` → `3 failed`, `E2E_EXIT=1`), ognuno sulla PROPRIA asserzione; i numeri di riga di R3-R5 sono quelli del file com'era in `a1b2362` (il test del doppio tap, entrato con `b12feef`, li ha spostati: oggi `:385`/`:502`). Le misure «prima» di R.1-2 e R.1-3 vengono da quella stessa build simulata. R6-R7 in un secondo run (`-g "decisione PO 6" --retries=0` → `2 failed`, `E2E_EXIT=1`) — la build simulata è, nel comportamento, quella di `a1b2362`: fra `a1b2362` e `b12feef` l'editor differisce SOLO per la riga della guardia e per commenti; `aircraft-editor.tsx` ripristinato da copia prima della build successiva, `sha256sum -c` → `abb45390…b443: OK`. (A 1280 il punto di sovrapposizione nel run e2e è x 1123,85 invece dei 1137,18 del probe: il test lo legge dal box del Conferma, non lo cabla.)

### R.5 — Gate ed esiti

- **`npm run gates`** (dopo il ripristino, shell senza `.env` esportato) — per `a1b2362`:
  ```
  PASS  lint (19s)
  PASS  typecheck (9s)
  PASS  test (7s) — Tests  1877 passed (1877)
  PASS  build (28s)
  ```
  e per `b12feef` (decisione 6, nessun unit nuovo):
  ```
  PASS  lint (20s)
  PASS  typecheck (3s)
  PASS  test (7s) — Tests  1877 passed (1877)
  PASS  build (29s)
  ```
  **1 877 = 1 874 di baseline + 3** (1 `aog-impact.test.ts`, 1 `aircraft.service.test.ts`, 1 `templates.test.ts`).
- **Unit in shell PULITA** (`env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`): `aog-impact.test.ts` **9 passed**, `aircraft.service.test.ts` **72 passed**, `templates.test.ts` **20 passed**.
- **e2e mirati** (build di produzione di `b12feef`, `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/aog-impact-email.spec.ts e2e/aircraft-out-of-service-until.spec.ts e2e/aircraft-status-hours.spec.ts`, esito letto con `scripts/e2e.sh status`): **`20 passed (30.4s)`, `E2E_EXIT=0`** (su `a1b2362` erano `19 passed (27.8s)`, `E2E_EXIT=0`; +1 = il test del doppio tap). Le righe della story, verbatim:
  ```
  ✓  15 [chromium] › e2e/aog-impact-email.spec.ts:283:7 › Impacted-booking count and grounding email (story AOG-1b) › with NO expected-return date the count is declared NOT delimited, everywhere, and it includes what a dated window would have excluded (AC 8) (4.6s)
  ✓  16 [chromium] › e2e/aog-impact-email.spec.ts:342:7 › Impacted-booking count and grounding email (story AOG-1b) › with zero impacted bookings the preview is one compact line and the submit is above the fold at 1280x900 (review MINOR-1) (1.3s)
  ✓  17 [chromium] › e2e/aog-impact-email.spec.ts:385:7 › Impacted-booking count and grounding email (story AOG-1b) › a double click on the Fuori servizio trigger arms the second step and never confirms it, anywhere on the trigger (review MAJOR-2, decisione PO 6) (1.6s)
  ✓  18 [chromium] › e2e/aog-impact-email.spec.ts:448:7 › Impacted-booking count and grounding email (story AOG-1b) › a double TAP on the trigger at 375 never confirms, a single tap on Conferma does (decisione PO 6) (3.2s)
  ✓  14 [chromium] › e2e/aog-impact-email.spec.ts:156:7 › Impacted-booking count and grounding email (story AOG-1b) › the preview, the cancellable two-step submit, the persistent banner with the REAL number, the line at reopen, and the email to the APPROVED holders only (11.1s)
  ✓  20 [chromium] › e2e/aog-impact-email.spec.ts:537:7 › Impacted-booking count and grounding email (story AOG-1b) › the two controls of the double step reach the 44px floor on the phone, keep their desktop box, and the banner link carries the box ink plus its underline (AC 3/AC 14) (2.3s)
  ✓  19 [chromium] › e2e/aog-impact-email.spec.ts:502:7 › Impacted-booking count and grounding email (story AOG-1b) › a fermo past its expected day says so, over a count that is NOT delimited (review MAJOR-1) (2.5s)
  ```
  I 9 test di 1a e i 4 della 2.5 sono nello stesso run, tutti verdi. `aog-overview-count.spec.ts` non è stato toccato e non è stato rieseguito. **Suite completa: NON eseguita da me**; la esegue la sessione principale, come arbitro, dopo questi commit.
- **Stato della macchina**: porta **3000 libera** (server ucciso per PID). DB **non resettato**; residui delle misure: **30** velivoli run-unique (`model` `Measure …` / `Alt probe` / `Detail probe` / `Guard probe`), di cui **18 OUT_OF_SERVICE** (3 fermati dalla riproduzione del doppio click sulla build pre-fix, 2 fixture «fermo scaduto», 8 dal probe di fattibilità della decisione 6 senza guardia, 5 dalle conferme legittime del probe con guardia), **7** persone `Msr-*` con le loro prenotazioni; il velivolo della misura dell'Archivio NON è stato archiviato (`archivedAt null`). Nessun attore di seed e nessun `AppSettings` toccato. Lo script di misura (`playwright-core`, scratchpad) non è committato.

### Arbitro finale (sessione principale, 2026-09-27)

Suite completa `CI=1 scripts/e2e.sh start` su DB fresco, albero `4521c80` (= fix cycle `09dd893` + `test(e2e)` `2ee2a1c` + story file 16.8):
```
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  536 passed (11.8m)
=== e2e end: 2026-09-27T01:08:49+02:00 ===
E2E_EXIT=0
```
**536 passed + 1 flaky = 537 = 533 + 4** (i test nuovi di `aog-impact-email.spec.ts`: 3 → 7), exit 0. Il flaky è `billing.spec.ts:296` (aggregato globale «dated today», `Expected: 17000 / Received: 22000` = un movimento da 5 000 di un test parallelo dentro la finestra; verde al retry): classe documentata (CLAUDE.md, review Billing-2 F4), non attribuibile.

Due incidenti di processo prima del verde, entrambi dichiarati: (1) il primo arbitro è stato **invalidato** da un `npm run gates` del fix-agent (commit `fedb868`, solo commento) che ha riscritto `.next/BUILD_ID` sotto il server dell'arbitro → run fermato e rifatto; (2) il secondo arbitro è andato **rosso** su `bookings.spec.ts:1058` (3/3): i 4 test nuovi di questa story creano ~10 prenotazioni fra il 28/09 e il 05/11 e hanno spinto le righe di `FUTURE_DAY` oltre la pagina 1 della lista (20 righe, `startsAt asc`) — difetto di isolamento **preesistente** dello spec (14 lookup che assumevano la pagina 1 accanto all'helper `findBookingRow` che già esisteva), chiuso dal commit `2ee2a1c` con prova a densità iniettata (7 rossi → i 3 di pagina spariti; i 4 residui identici prima/dopo, dovuti al DB sporco: cap 100 del picker persone e scadenze accumulate sul pilota di seed).
