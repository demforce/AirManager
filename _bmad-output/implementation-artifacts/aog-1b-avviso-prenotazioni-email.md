---
baseline_commit: b5a2c93
---

# Story AOG-1b: «Stai per impattare N prenotazioni» — l'anteprima, la conferma a due passi, il numero reale nella response e l'email ai piloti con una prenotazione approvata

Status: **ready for dev DOPO la chiusura di AOG-1a** — ratifiche PO chiuse 2026-08-07.

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
