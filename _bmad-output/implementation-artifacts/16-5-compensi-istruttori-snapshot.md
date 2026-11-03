---
baseline_commit: 9272129
---

# Story 16.5: Il dovuto agli istruttori non cambia quando cambia la tariffa, e non sparisce quando l'istruttore va via

Status: **ready-for-dev** — 2026-09-10. **Modello dev: Opus 5 xhigh** (la story tocca UI: una sezione NUOVA sulla pagina Compensi con le sue due facce desktop/mobile, un qualificatore sul KPI, un `hint` nel form della tariffa, una colonna nell'export e 8 stringhe i18n in due locale — v. §1 AD-8 e §3.4).

> ⚠️ **Baseline e ordine di lavoro (misurato il 2026-09-10)**: il frontmatter dichiara `9272129` (`docs(sprint-status): 16.3 ready-for-dev`) e **tutti** i `file:riga` di questo file sono misurati **su quel HEAD**. La 16.1 è **committata** (`1a57609`); le story **16.2, 16.3 e 16.4 hanno il file pronto ma NON sono implementate**, e **due di loro toccano gli stessi file di questa**:
> - **16.2** riscrive `flights.service.ts` in 6 punti (guardia di sovrapposizione dentro la transazione, helper del contaore, bordo inferiore della durata a `:754`) ⇒ **ogni riga di `flights.service.ts` citata qui slitta**;
> - **16.3** aggiunge lock e guardie in `bookings.service.ts` e `errors.ts` (nessuna sovrapposizione con questa story), **16.4** tocca la scansione dei documenti (idem).
> ⇒ **Prima di scrivere una riga**: `git log --oneline -5`, poi **rileggere e correggere in questo file ogni riga citata** (prassi che ha pagato in tutti gli epic 15 e AOG). Le righe di `instructor-compensation.service.ts`, `page.tsx`, `instructors-console.tsx`, `exports.service.ts`, `stats.service.ts`, `prisma/schema.prisma` non sono toccate da nessuna delle tre story parcheggiate: quelle sono affidabili.
>
> **Da leggere PRIMA di implementare**: `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` §**MAJOR-1**, §**MAJOR-2**, §**MINOR-1**, e la sezione «Invarianti» (I2, I4, **I5**, I7, I8, I12, I13) più **VC-8** (la storicizzazione delle tariffe corretta, da NON toccare); `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.5», §«Architettura e vincoli», ratifica **R-16-d**. Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`; per la parte UI `design-taste-frontend` e `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).
>
> 🧹 **DB di lavoro**: questa story **non richiede** un reset per gli unit (tutto mockato), ma la migrazione va provata su un DB con dati e i run e2e vanno su DB fresco. Il DB di **carico** `airmanager_load` (usato per tutte le misure di §3.6) **non va rigenerato**: la migrazione lo aggiorna in-place, ed è il solo posto dove i numeri di questa story sono verificabili su volumi reali.

---

## Story

As **il tesoriere dell'aviosuperficie**,

I want che il compenso maturato da ogni volo sia **congelato al momento del volo** e che il dovuto resti **visibile finché non è pagato**,

so that cambiare la tariffa payout non riscriva il passato (MAJOR-1), archiviare un istruttore non nasconda i soldi che gli si devono (MAJOR-2), e l'arrotondamento del compenso sia **lo stesso** dell'addebito (MINOR-1).

### Il perché: il commento dello schema promette una domanda che il lettore fa comunque

`InstructorProfile.payoutRateCents` è una colonna mutabile, e il doc-comment (`schema.prisma:129-138`) motiva la scelta così:

> «Deliberately a single mutable column, NOT historicized like `InstructorRate` … the payout ledger (`InstructorPayout` below) already carries its own dated rows, so there is **no "what was the rate on date D" question** to answer for this field the way AD-4 answers it for `InstructorRate`.»

Quella domanda **la fa `computeOwed`**, e la fa su **tutte le ore di sempre**: `instructor-compensation.service.ts:167-176` calcola `round(totalMinutes/60 × payoutRateCents) − paid`, con `totalMinutes` non delimitato (`sumMinutesByProfile(ids, null)`, `:122-139`) e `paid` = somma di **tutti** i payout (`:148-163`). `setPayoutRate` (`:532-543`) è un `instructorProfile.update` secco: **una riga aggiornata riscrive il dovuto di ogni ora già liquidata**, in entrambi i versi — e verso il basso inventa un dovuto **negativo**, per cui lo schema dichiara che non esiste rimedio (`schema.prisma:174-177`: *«there is no reversal concept for this MVP ledger»*).

Il gemello di questo lettore, sulla stessa area, dichiara la regola **opposta** e la motiva: `accounts.service.ts:730-735` — *«ARCHIVED people are deliberately NOT filtered out … **archiving must never hide money owed**»*. Due liste di denaro su schermate adiacenti, politiche opposte, e solo una delle due argomentata.

### Fatti misurati che vincolano il design

Tutte le misure sul **DB di carico** `airmanager_load` (60 487 voli, 401 profili istruttore) e con le sonde di §4.4. Query in §3.6.

| Fatto | Misura | Conseguenza |
|---|---|---|
| MAJOR-1 è riproducibile in unit | sonda §4.4: 100 h pagate a 20,00 €/h → dovuto **0**; `setPayoutRate(25,00)` → dovuto **+500,00 €**; `setPayoutRate(18,00)` → **−200,00 €** | la discriminanza esiste già scritta ed **eseguita**: il dev la porta in `instructor-compensation.service.test.ts` con l'aspettativa rovesciata |
| MAJOR-2 non è latente sul carico | **27** profili istruttore inattivi (persona archiviata **e** profilo disattivato: le due flag coincidono su tutti e 27), **22** con dovuto ≠ 0, per **8 103,88 €** invisibili da qualunque superficie | la sezione «non più attivi» ha subito 22 righe da mostrare: l'AC 4 è verificabile sul carico, non solo su una fixture |
| L'arrotondamento **per volo** non coincide con quello **sull'aggregato** | 319 istruttori con tariffa: **248** cambiano dovuto, scarto **±1..9 c**, |Σ| **490 c**, netto **+220 c** (TS esatto; **489/+219 c** con l'aritmetica `numeric` di SQL — la differenza di 1 c *è* l'errore float della formula vecchia) | il «deve essere zero» del piano è **falso**, e va dichiarato con la cifra: l'AC 2 si misura, non si assume (v. AD-3) |
| La formula scelta è riproducibile **identica** in SQL | `Math.round((rate*minutes)/60)` vs `round((rate::numeric*minutes)/60)`: su **11 700 300** coppie checksum **601 639 468 750** e checksum pesato **4 832 281 482 578 978 300**, uguali; sulle **12 871** righe reali da backfillare somma **53 157 673** e pesata **38 510 736 413**, uguali | il backfill può stare **nella migrazione**, in SQL, senza uno script TS: la prova è in §4.5 |
| 81 istruttori hanno voli SCHOOL e **nessuna** tariffa payout | 2 399 voli; **0** di loro ha payout registrati | dopo il backfill quei voli restano **senza snapshot**: il dovuto è **ignoto**, non zero — è la ragione per cui `owed*Cents` **resta nullable** (AD-5) |
| Un istruttore può stare su un volo **non** SCHOOL | **3 848** voli con istruttore e `flightType <> 'SCHOOL'`; **0** voli SCHOOL senza istruttore; **0** voli SCHOOL con `instructorAmountCents` nullo | lo snapshot si scrive come il suo gemello di addebito (**ogni** volo con istruttore), e il filtro `flightType: 'SCHOOL'` resta **solo** nel lettore: una regola, un posto (AD-4) |
| Il KPI di pagina cambia di una cifra misurabile | «Totale dovuto» oggi **113 214,17 €** (soli attivi, arrotondamento sull'aggregato) → dopo **121 320,03 €**: **+8 103,88 €** di MAJOR-2 e **+1,98 €** di arrotondamento | il Dev Agent Record ha un numero prima/dopo da citare, non un'impressione |
| Il budget di query non cambia | oggi 6 `groupBy` (3 minuti + 3 payout); dopo 6 (3 sui voli con `_sum` **e** `_count`, 3 sui payout) — idioma **provato** sul carico (§4.5) | nessun costo nuovo: `_count: { _all: true, <colonna>: true }` viaggia nella stessa query del `_sum` |
| Tre fixture e2e su sei **dipendono** dalla retroattività | `instructor-compensation.spec.ts:131` vs `:144`, `:174` vs `:176`, `:217` vs `:218`: il volo è registrato **prima** che la tariffa esista | la suite oggi **certifica** il difetto: le tre fixture vanno riordinate (§3.5), ed è la prova più forte che MAJOR-1 non era un caso limite |
| L'export e i tre lettori derivati **riscorrono il servizio** | `exports.service.ts:472`, `stats.service.ts:181`, `billing/page.tsx:192`, `dashboard/page.tsx:897` | la parità è per costruzione (VC-7), ma **tre** superfici cambiano contenuto senza che nessuno le abbia toccate: vanno decise, non scoperte in review (AD-9) |

---

## §0 — Requisiti FISSI (contratto)

Gli AC di contratto sono quelli del piano (`docs/superpowers/plans/2026-09-10-epics-16-18-audit.md`, §«Story 16.5»), qui numerati per essere citabili:

| # | Requisito di contratto |
|---|---|
| **P1** | Un volo SCHOOL registrato porta `instructorPayoutCents` **e la tariffa payout applicata**, calcolati con la tariffa vigente e la **STESSA** funzione di arrotondamento dell'addebito; correzione e storno lo ricalcolano/stornano come gli altri importi del volo. |
| **P2** | I voli esistenti sono **backfillati** con la tariffa payout attuale del loro istruttore, e il record **dichiara** quante righe e per quali istruttori il dovuto cambia rispetto a oggi. |
| **P3** | `computeOwed` somma **gli snapshot** dei voli REGISTERED non stornati **meno** i payout: cambiare `payoutRateCents` oggi **non muove** il dovuto dei voli passati. |
| **P4** | Un istruttore disattivato o archiviato con dovuto ≠ 0 **compare** in una sezione «non più attivi, con dovuto» e il KPI **«Totale dovuto» lo include** — la regola «archiving must never hide money owed» vale anche qui. |
| **P5** | Delle **due** formule di arrotondamento censite dall'audit (19 769 coppie in disaccordo) **ne resta una**, usata da addebito, payout ed export. |

**Ratifica applicabile — R-16-d (vincolante)**: *«la tariffa payout dell'istruttore si **congela sul volo** (`instructorPayoutCents` snapshot alla registrazione, come già `aircraftRateCentsPerHour`); il dovuto = somma degli snapshot dei voli REGISTERED non stornati − payout; cambiare la tariffa vale per i **voli futuri**; **backfill** dei voli esistenti con la tariffa attuale, dichiarato»*.
⇒ La **storicizzazione** di `payoutRateCents` (la prima opzione dell'audit, `@@unique([instructorProfileId, validFrom])` come `InstructorRate`) è **esclusa**: non si crea nessuna tabella nuova, non si tocca `instructor-rates.service.ts`, e `payoutRateCents` resta **una colonna mutabile** — solo, da questa story, non è più la fonte del passato. Nessuna ratifica PO nuova è necessaria; le due decisioni che il PO potrebbe voler rivedere sono in §7 e **non bloccano**.

**Invarianti che questa story deve lasciare intatte:**

| # | Invariante | Qui significa |
|---|---|---|
| **I5** (AD-4) | Il volo **congela** tariffa e importi; una modifica del listino non riscrive la storia | le due colonne nuove sono **esattamente** questo, per la terza tariffa del dominio; si scrivono **una volta**, alla `flight.create`, e **nessun** percorso le aggiorna mai (zero `flight.update` che le tocchi) |
| **I2** (AD-3) | Ledger append-only | la migrazione **non** scrive né corregge un solo `AccountMovement`/`CashMovement`/`InstructorPayout`: aggiunge due colonne a `Flight` e le riempie |
| **I4** (AD-2) | Centesimi interi | le due colonne sono `Int?`; il backfill produce interi (`round(...)::int`), provato uguale al TS su 12 871 righe |
| **I7** | Lo storno è la negazione del valore **memorizzato**, mai un ricalcolo | lo storno del compenso **non è un'operazione**: il volo passa a `CANCELLED` e **esce** dall'insieme sommato con lo stesso snapshot con cui c'era entrato (AD-6) |
| **I13** | Solo ADMIN tocca i soldi | nessun permesso nuovo: `finance.manage` per la lettura, `payouts.manage` per tariffa e payout, invariati |
| **VC-8** | Le tariffe storicizzate (`AircraftRate`, `InstructorRate`) sono corrette | **non si toccano**: `getEffectiveRate`/`getEffectiveInstructorRate` restano identiche, e il compenso payout non entra nell'addebito al pilota |
| **AD-1 (progetto)** | Una regola di dominio vive in **una** funzione | l'arrotondamento diventa **una** funzione con 3 call-site; il filtro `flightType: 'SCHOOL'` resta in **un** posto (il lettore) |

---

## §1 — Decisioni architetturali

**AD-1 — Due colonne su `Flight`, `Int?`, mai NOT NULL.**

```prisma
  instructorRateCentsPerHour Int?
  instructorAmountCents      Int?          // (esistenti, invariati)

  /// Snapshot (AD-4/R-16-d) della tariffa PAYOUT in forza sull'istruttore al
  /// momento della registrazione …
  instructorPayoutRateCents  Int?
  /// Snapshot del compenso che QUESTO volo matura per il suo istruttore …
  instructorPayoutCents      Int?
```

`Int?` e non `Int NOT NULL DEFAULT 0`, per tre ragioni misurate:
1. **Un volo senza istruttore non matura nulla**: 44 405 voli su 60 487 non hanno `instructorProfileId`. `0` significherebbe «zero euro dovuti», che è un'affermazione; `NULL` significa «non applicabile», che è la verità. È esattamente la scelta già fatta per il gemello `instructorAmountCents Int?` (`schema.prisma:1040-1044`).
2. **81 istruttori hanno voli e nessuna tariffa payout** (2 399 voli): per loro il compenso maturato è **ignoto**, non zero. Un `DEFAULT 0` trasformerebbe «non lo sappiamo» in «non gli dobbiamo niente» — la stessa classe di difetto che l'audit segnala sul `?? 0` del KPI.
3. **NOT NULL renderebbe la migrazione impossibile senza un valore inventato** per quei 3 211 voli con istruttore ma senza tariffa.

**AD-2 — Quando lo snapshot si scrive: come il suo gemello di addebito, non come il filtro del lettore.**
Regola **unica**: le due colonne sono valorizzate ⟺ il volo ha un `instructorProfileId` **e** quel profilo ha `payoutRateCents !== null` al momento della registrazione. **Non** si aggiunge la condizione `flightType === 'SCHOOL'` al writer, benché solo i voli SCHOOL siano sommati dal lettore. Perché: il filtro SCHOOL è una regola del **compenso**, e vive già in `sumMinutesByProfile` (`:127`); duplicarla nel writer la metterebbe in **due** posti, e la prima divergenza fra i due sarebbe invisibile. Conseguenza dichiarata: **3 848** voli non-SCHOOL con istruttore porteranno uno snapshot che **nessun lettore somma**. Il doc-comment della colonna nomina il lettore e il suo filtro, così la colonna non può essere letta per quello che non è; il DTO non la espone (AD-7).

**AD-3 — Il calcolo si sposta da «una volta sull'aggregato» a «una volta per volo», e la differenza è misurata, non zero.**
Il piano dice *«deve essere zero al momento della migrazione: stessa tariffa, stesso arrotondamento»*. La prima metà è vera (stessa tariffa), la seconda **no**: oggi l'arrotondamento cade **una volta**, sulla somma di tutti i minuti (`round(Σminuti/60 × tariffa)`); dopo cade **una volta per volo** (`Σ round(tariffa × minuti_volo/60)`). Le due cose differiscono per la granularità, e sul carico la differenza è:

| Misura (319 istruttori con tariffa, 9 641 voli SCHOOL REGISTERED) | Valore |
|---|---|
| istruttori il cui dovuto si muove | **248** su 319 |
| scarto massimo su un istruttore | **9 centesimi** |
| somma degli scarti in valore assoluto | **490 centesimi** (4,90 €) |
| scarto netto | **+220 centesimi** (+2,20 €) |

⇒ **AC 2 si riscrive come una misura**, non come uno zero: la story dichiara le righe backfillate, gli istruttori il cui dovuto si muove e di quanto. La direzione è quella giusta: il **per-volo** è la regola che l'addebito applica già (`aircraftAmountCents`, `instructorAmountCents` sono arrotondati per volo e **scritti nel ledger**), quindi il compenso smette di essere l'unico numero del dominio arrotondato su un aggregato. Il prezzo è ≤ 1 centesimo per volo, dichiarato.

**AD-4 — La formula sopravvissuta, e il modo in cui la seconda sparisce.**
MINOR-1 non si chiude «scegliendo» una delle due formule: si chiude perché **la seconda non ha più un chiamante**.

```
tenuta   flights.service.ts:884, :987 → Math.round((rate * minutes) / 60)
eliminata instructor-compensation.service.ts:169 → Math.round((minutes / 60) * rate)
```

La tenuta è quella **provata** half-up da un test (`flights.service.test.ts:893`, 333 c/h × 30′ → 167) e algebricamente esatta: `rate * minutes` è un intero < 2^53 sempre (tariffa max 2 147 483 647 c per schema, minuti ≤ 1440 per guardia; nel dominio reale ≤ 5,8·10⁷), quindi il quoziente è il double più vicino al razionale esatto e `Math.round` è half-up davvero. La eliminata perde il mezzo centesimo per eccesso: `(69/60) * 1510 === 1736.4999999999998` mentre il valore esatto è `1736.5` (sonda §4.4, terzo test).

Dopo la story `computeGrossCents` e `computeOwed` **non esistono più**: il lordo È la somma degli snapshot, il netto È lordo − payout. Il censimento post-fix di `src/` deve trovare **zero** siti che dividono minuti per 60 per ottenere denaro fuori da `centsForMinutes`.
Casa della funzione: **`src/lib/money.ts`** (dove vive già `formatCents`, nessuna catena `@/lib/env`, quindi sicura in unit senza `.env`):

```ts
/** L'UNICA conversione ore→denaro del dominio (MINOR-1) … */
export function centsForMinutes(rateCentsPerHour: number, minutes: number): number {
  return Math.round((rateCentsPerHour * minutes) / 60);
}
```

3 call-site: `flights.service.ts:884` (compenso addebitato all'allievo), `:987` (componente velivolo), e il payout snapshot nuovo. `prisma/seed-load.ts` ne ha 4 copie inline (`:659`, `:661`, `:732`, `:734`): **non si toccano** in questa story se non per aggiungere le due colonne nuove (§3.3) — un seed non è un percorso di dominio, e riscriverne le formule non è riconducibile alla richiesta (karpathy §3). Va **segnalato** nel Dev Agent Record.

**AD-5 — `owed*Cents` resta `number | null`, ma il `null` cambia significato — e la ragione è misurata.**

| | oggi | dopo |
|---|---|---|
| `owed = null` quando | `payoutRateCents === null` (proprietà dell'ISTRUTTORE, oggi) | esiste **almeno un volo** nella finestra con `instructorPayoutCents IS NULL` (proprietà della **storia**) |

Al momento della migrazione i due insiemi **coincidono**: il backfill usa la tariffa attuale su tutti i voli, quindi uno snapshot è nullo ⟺ l'istruttore non ha tariffa. Misura: **81** istruttori con dovuto ignoto prima, **81** dopo. Nessuna regressione di display su nessuna delle cinque superfici.
Il caso **nuovo** (parzialmente prezzato) nasce solo così: volo registrato senza tariffa → tariffa impostata → altri voli. Allora la finestra contiene snapshot noti **e** ignoti, e il dovuto è **ignoto** («—»), non una somma parziale spacciata per totale. Due conseguenze da dichiarare, non da scoprire:
- «Ciclo pagamenti» filtra `(owedTotalCents ?? 0) > 0` (`instructors-console.tsx:262`) ⇒ un istruttore parzialmente prezzato **non compare** in quella lista. È **lo stesso** comportamento di oggi per un istruttore senza tariffa (asserito da `instructor-compensation.spec.ts:226`), quindi non è una regressione — ma è un modo in cui del denaro può restare fuori da una lista, e va scritto (§5, §7 domanda PO).
- La via d'uscita per l'admin **esiste già**: `correctFlight` su quei voli li ri-snapshotta alla tariffa corrente (è la stessa via d'uscita che AD-4 dà per una tariffa velivolo sbagliata). Va nel doc-comment.
Il **secondo** effetto del `null` che l'audit segnala (`?? 0` nel KPI: «si legge come una cifra completa quando è incompleta») si chiude con AD-8, non nascondendolo.

**AD-6 — Storno e correzione: nessuna aritmetica nuova.**
- **`cancelFlight`**: **zero modifiche**. Il lettore filtra `status: { not: 'CANCELLED' }` (`:128`), quindi il volo stornato **esce** dall'insieme sommato portandosi via **esattamente** lo snapshot con cui era entrato. Il dovuto scende della stessa cifra, senza un calcolo — che è lo spirito di **I7** («la negazione del valore memorizzato, mai un ricalcolo») applicato per sottrazione di insieme invece che per riga.
- **`correctFlight`**: il volo originale va `CANCELLED` (esce) e il volo nuovo passa per `registerFlightCore` con il **proprio** snapshot, calcolato da `resolveFlightInput` sulla tariffa payout **corrente**. Conseguenza dichiarata e inevitabile: **correggere oggi un volo del 2020 ne ri-prezza il compenso alla tariffa di oggi** — perché la tariffa payout, per ratifica R-16-d, non ha storia. Non è un difetto di questa story: è il costo della metà economica della ratifica, ed è **coerente** con il contratto già scritto di `correctFlight` (*«a correction IS a new registration, re-validated from scratch»*, doc-comment `:1370-1378`). Il lato addebito NON si comporta così solo perché le sue tabelle sono storicizzate. Va nel doc-comment di `correctFlight` e in §7.

**AD-7 — Le due colonne NON entrano nel DTO del volo.**
`FLIGHT_SELECT` (`:185-218`), `FlightBreakdown` (`:114-123`), `FlightListItem`, gli schemi Zod di `src/lib/schemas/flights.ts` e il registry OpenAPI dei voli **non si toccano**. Motivo: nessun AC chiede di mostrare il compenso payout su un volo, la pagina Registro voli non ha una colonna per farlo, e il compenso payout è un dato **del club verso l'istruttore** che oggi vive solo su Compensi (`finance.manage`) — esporlo nel DTO dei voli lo renderebbe leggibile da `listFlights`, che ha anche un ramo own-access (`authorizeFlightsQuery`, `:1565`). Zero contratto API nuovo sui voli, zero `registry.ts` sui voli. Dichiarato in §6.

**AD-8 — La pagina Compensi: due liste, quattro KPI ognuno con la sua platea dichiarata.**
`getCompensationSummary` restituisce **l'unione** di due platee, con un discriminante sulla riga:

```ts
export type InstructorCompensationSummaryItem = {
  …
  /** `false` quando la persona è archiviata O il profilo istruttore è disattivato … */
  isActive: boolean;
};
```

La pagina (`instructors/page.tsx:49-54`) si divide così — **ogni** KPI dichiara la sua platea, perché mescolarle sarebbe la stessa ambiguità che l'audit contesta:

| KPI / testo | Platea dopo | Perché |
|---|---|---|
| `kpi.active` «Istruttori attivi» | **solo attivi** | l'etichetta dice *attivi*: contarci dentro chi non lo è più sarebbe una bugia sulla parola stessa |
| `kpi.hours` «Ore totali volate» | **attivi + non più attivi mostrati** | sono ore che l'aviosuperficie ha erogato; escluderle renderebbe le ore incoerenti col dovuto che le genera |
| `kpi.owed` «Totale dovuto» | **attivi + non più attivi mostrati** | **P4**, ed è la ragione della story |
| `kpi.owed` → `delta` (slot esistente di `KPI`) | conteggio dei dovuti **ignoti** | chiude il secondo rilievo di MAJOR-2: la cifra dice quanti istruttori non sono nel totale |
| `kpi.avgRate` «Tariffa media payout» | **solo attivi con tariffa** | è la tariffa che il club **paga oggi**; la tariffa di chi è andato via non è una tariffa in vigore |
| `sub` di pagina | `{active} attivi · {owed} da liquidare` **+** clausola nuova se ci sono non-più-attivi | additivo: la stringa esistente non cambia forma (nessun parametro ICU nuovo) |

La sezione nuova è una **seconda `card` in sola lettura**, sotto il roster, resa **solo** se ha righe. Riusa `.students`/`.student-row` e — punto importante — le **stesse due classi** che la pagina già possiede per lo scambio desktop/mobile: `instructors-desktop-body` e `instructors-mobile` (`airops.css:2500`, `:2518-2521`). ⇒ **zero CSS nuovo**, e lo scambio a 640px funziona per costruzione. Nessuna azione sulle righe (niente «Modifica», niente «Paga», niente click sul nome): il dettaglio risponde 404 su un profilo disattivato (`:371-373`) e `recordPayout` risponde 409 (`:438-442`) — offrire un bottone che non può funzionare sarebbe peggio che non offrirlo. Il **perché** e la **via d'uscita** stanno nell'hint della sezione, non in un `title` invisibile (§7, domanda PO 1).

**AD-9 — Le tre superfici che cambiano contenuto senza essere toccate: decise qui.**
`getCompensationSummary` ha quattro consumatori oltre alla sua pagina. Con una platea più larga:

| Consumatore | `file:riga` | Decisione |
|---|---|---|
| Export xlsx Compensi | `exports.service.ts:472-486` | **include** i non-più-attivi (riscorre il servizio, VC-7) **+ una colonna «Stato»**: ciò che si stampa deve coincidere con ciò che si vede (lezione MAJOR-5), e una riga senza stato su carta è indistinguibile |
| Statistiche `/dashboard/reports` | `stats.service.ts:181`, `:208-209`, `:262-269` | **nessuna modifica**: `instructorGroups` include **già** i voli degli ex istruttori (nasce da `flight.groupBy`, non dal roster) e mostrava `owedCents: null` per loro; ora la mappa risolve e il numero **compare**. È un miglioramento gratuito e coerente — va **dichiarato e asserito** con un unit, non lasciato al caso |
| Widget «Compensi istruttori» su `/dashboard/billing` | `billing/page.tsx:192-198`, `billing-console.tsx:1143-1157` | **filtra `isActive`** (una `.filter` in `page.tsx`). Il widget è **month-to-date**: un ex istruttore ha 0 minuti nel mese e `owedMtd` 0, quindi comparirebbe come una riga «0:00 · — / 0,00 €» — che **suggerisce** che non gli si deve niente. Il dovuto all-time vive su Compensi, che è la superficie che P4 nomina |
| Landing Panoramica istruttore | `dashboard/page.tsx:897`, `:915-917` | **nessuna modifica**: passa per `getOwnCompensationSummary` → `listActiveInstructors(personId)`, che resta la platea **attiva**. Un istruttore disattivato non ha una landing da leggere (`getOwnInstructorProfileId` risolve solo profili attivi) |

**AD-10 — Il lettore: due platee, UNA matematica, stesso budget di query.**
`listActiveInstructors` resta **byte-identica** (la usa anche `getOwnCompensationSummary`, che non deve cambiare comportamento). Si aggiunge **una** funzione gemella, e `computeSummaryRows` gira **una volta** sull'unione:

```ts
/** Ogni istruttore NON più attivo (persona archiviata O profilo disattivato) — la platea che P4 aggiunge. */
async function listInactiveInstructors(): Promise<InstructorRow[]> {
  const rows = await prisma.person.findMany({
    where: {
      instructorProfile: { isNot: null },
      OR: [{ archivedAt: { not: null } }, { instructorProfile: { deactivatedAt: { not: null } } }],
    },
    select: { id: true, firstName: true, lastName: true, instructorProfile: { select: { id: true, payoutRateCents: true } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  …
}
```

(`isNot: null` è tipizzato: `InstructorProfileNullableScalarRelationFilter`, `src/generated/prisma/models/InstructorProfile.ts:391-394`.)
Poi: `computeSummaryRows([...active, ...inactive])` → si filtra **dopo** il calcolo (`!isActive && owedTotalCents !== 0`), perché «dovuto ≠ 0» è una proprietà **calcolata**. Costo sul carico: la lista `in` dei `groupBy` passa da 374 a 401 id — **+27**, una query in più (il `person.findMany` gemello), zero query per riga.
E la sostituzione del cuore:

```ts
// prima: 3 x sumMinutesByProfile + 3 x sumPayoutsByProfile, poi computeOwed(minuti, tariffa, pagato)
// dopo:  3 x sumSchoolFlightsByProfile + 3 x sumPayoutsByProfile, poi owed = accrued - paid (o null)
async function sumSchoolFlightsByProfile(ids: string[], bounds: VariantBounds) {
  const rows = await prisma.flight.groupBy({
    by: ['instructorProfileId'],
    where: { instructorProfileId: { in: ids }, flightType: 'SCHOOL', status: { not: 'CANCELLED' }, ...(bounds ? { flightDate: { gte: bounds.from, lte: bounds.to } } : {}) },
    _sum: { minutes: true, instructorPayoutCents: true },
    _count: { _all: true, instructorPayoutCents: true },
  });
  // per profilo: { minutes, accruedCents, unpricedFlights: _count._all - _count.instructorPayoutCents }
}
```

Il `where` **non cambia di una clausola**: stesso `flightType`, stesso `status`, stessi bound. `_count: { _all: true, instructorPayoutCents: true }` viaggia nella **stessa** query del `_sum` — idioma **provato** sul carico su `instructorAmountCents` (§4.5): `{"_sum":{"minutes":3551,"instructorAmountCents":182821},"_count":{"_all":40,"instructorAmountCents":40},…}`. `owed = unpricedFlights > 0 ? null : accruedCents - paidCents`.

**AD-11 — La migrazione: SQL a mano, backfill dentro, nessuno script.**
Idioma della casa (`20260722190000_add_expiry_type_kind`, `20260726090000_billing1_payment_method_payout_twin`): `npx prisma migrate dev --create-only`, poi si scrive il file. Nome: `20260910<HHMMSS>_flight_instructor_payout_snapshot`.

```sql
-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "instructorPayoutRateCents" INTEGER,
ADD COLUMN     "instructorPayoutCents" INTEGER;

-- Backfill (R-16-d): ogni volo con un istruttore la cui tariffa payout è
-- impostata OGGI riceve quella tariffa e il compenso arrotondato con la
-- STESSA regola di `centsForMinutes` — `round((rate * minutes) / 60)`.
-- L'uguaglianza fra questo `round(numeric)` e il `Math.round` del TS è
-- PROVATA su 11 700 300 coppie sintetiche e sulle 12 871 righe reali del DB
-- di carico (Dev Agent Record §…). I voli il cui istruttore NON ha tariffa
-- restano NULL: il compenso maturato è ignoto, non zero.
UPDATE "Flight" f
SET "instructorPayoutRateCents" = ip."payoutRateCents",
    "instructorPayoutCents" = (round((ip."payoutRateCents"::numeric * f.minutes) / 60))::int
FROM "InstructorProfile" ip
WHERE f."instructorProfileId" = ip.id
  AND ip."payoutRateCents" IS NOT NULL;
```

Nessun indice nuovo: il lettore raggruppa per `instructorProfileId`, che ha già `@@index([instructorProfileId])` (`schema.prisma:1085`), e sommare una colonna in più non cambia il piano. Gli indici sono lavoro dell'epic 17.

---

## §2 — Acceptance Criteria

### Lo snapshot sul volo

1. **Given** la migrazione **When** gira su un DB con dati **Then** `Flight` ha `instructorPayoutRateCents Int?` e `instructorPayoutCents Int?`, **entrambi con doc-comment** che nomina R-16-d, il lettore e il suo filtro `flightType: 'SCHOOL'`; e il doc-comment di `InstructorProfile.payoutRateCents` (`schema.prisma:129-138`) **non afferma più** che «there is no "what was the rate on date D" question»: dichiara che la domanda esiste, che la risposta è lo snapshot sul volo, e che la colonna vale **dai prossimi voli**.
2. **Given** il backfill **When** è finito **Then** ogni volo con istruttore e tariffa payout impostata porta `instructorPayoutRateCents` = la tariffa attuale e `instructorPayoutCents` = `round(tariffa × minuti / 60)`; i voli senza istruttore **o** con istruttore senza tariffa restano a `NULL` su **entrambe** le colonne (mai una sola delle due). Verifica su `airmanager_load`: **12 871** righe valorizzate, **3 211** con istruttore e senza tariffa lasciate a `NULL`, **0** righe con una colonna valorizzata e l'altra no.
3. **Given** il dovuto per istruttore prima e dopo la migrazione **When** il Dev Agent Record chiude **Then** riporta la misura: **248** istruttori su 319 cambiano dovuto, scarto max **9 c**, |Σ| **490 c**, netto **+220 c** — e **dichiara** che lo zero atteso dal piano non è raggiungibile perché l'arrotondamento passa dall'aggregato al singolo volo (AD-3). Nessun istruttore cambia di più di 1 centesimo **per volo**.
4. **Given** un volo con istruttore la cui tariffa payout è `3000` **When** lo registro per 90′ **Then** `flight.create` riceve `instructorPayoutRateCents: 3000` e `instructorPayoutCents: 4500`, calcolati con `centsForMinutes` — la **stessa** funzione che ha prodotto `instructorAmountCents` e `aircraftAmountCents` nella stessa chiamata.
5. **Given** un volo con istruttore **senza** tariffa payout, **oppure** senza istruttore **Then** entrambe le colonne sono `null`; `flight.create` le riceve esplicitamente `null` (mai `undefined`: una `data` con `undefined` lascia la colonna al default e nasconde l'intenzione).
6. **Given** un volo `SCHOOL` registrato **When** lo **storno** **Then** **nessuna** colonna del volo è riscritta e il dovuto dell'istruttore **scende esattamente dello snapshot di quel volo** — verificato leggendo il dovuto prima e dopo, non ricalcolandolo (AD-6).
7. **Given** un volo del passato con snapshot `4500` e una tariffa payout **oggi** diversa **When** lo **correggo** **Then** il volo originale esce dall'insieme sommato e il volo nuovo porta il **proprio** snapshot alla tariffa **corrente**; il doc-comment di `correctFlight` **dichiara** che correggere un volo vecchio ne ri-prezza il compenso, e perché (AD-6).

### Il lettore: il passato non si riscrive più

8. **Given** `getCompensationSummary` **When** calcola **Then** `owed*Cents = Σ instructorPayoutCents (voli SCHOOL non CANCELLED nella finestra) − Σ payout (per `periodEnd` nella finestra)`; `computeGrossCents` e `computeOwed` **non esistono più**, e `sumMinutesByProfile` è diventata la funzione che restituisce minuti **e** maturato **e** conteggio dei non prezzati in **una** `groupBy` per variante (6 query totali, come oggi).
9. **Given** 100 h già liquidate a 20,00 €/h (dovuto 0) **When** `setPayoutRate` porta la tariffa a 25,00 €/h **Then** il dovuto resta **0**: nessuna riga di `Flight` è stata toccata, quindi nessun euro del passato si muove. **È la discriminanza di MAJOR-1** (§4.4, oggi VERDE = difetto; deve diventare verde con l'aspettativa rovesciata).
10. **Given** un volo registrato **quando la tariffa payout non c'era** e una tariffa impostata **dopo** **Then** il dovuto di quell'istruttore è **`null`** («—»), non una somma parziale: la finestra contiene uno snapshot ignoto (AD-5). **E** il doc-comment nomina la via d'uscita (correggere il volo).
11. **Given** un istruttore senza tariffa e **senza voli** **Then** il dovuto è `0` (nulla è maturato, nulla è dovuto) — cambio di display **dichiarato** rispetto a oggi («—»), che riguarda **1** dei 401 profili del DB di carico.
12. **Given** `payoutRateCents` **When** viene modificato via il form dell'editor **Then** il campo porta un `hint` (slot esistente di `Field`, `field.tsx:35`) che dice che la tariffa vale **dai prossimi voli** — in **entrambi** i locale. È l'unica frase che rende visibile all'utente il cuore della story.

### Chi non c'è più non sparisce

13. **Given** un istruttore con persona archiviata **o** profilo disattivato e dovuto ≠ 0 **When** apro `/dashboard/instructors` **Then** compare in una sezione «Non più attivi, con dovuto» **sotto** il roster, con nome, ore totali e dovuto; la sezione **non è resa** quando è vuota. Sul DB di carico: **22** righe, **8 103,88 €**.
14. **Given** quella sezione **When** misuro il KPI **Then** «Totale dovuto» **include** quelle righe (carico: da 113 214,17 € a 121 320,03 €) e «Istruttori attivi» **no**; «Ore totali volate» le include; «Tariffa media payout» **no** (AD-8, tabella).
15. **Given** istruttori con dovuto **ignoto** **When** apro la pagina **Then** il KPI «Totale dovuto» porta nel suo `delta` il loro **conteggio** (carico: 81) — la cifra non si legge più come completa quando non lo è (secondo rilievo di MAJOR-2).
16. **Given** la sezione nuova **When** cerco azioni **Then** non ce ne sono: nessun «Modifica», nessun «Paga», nessun click sul nome, e «Ciclo pagamenti», `PaySlideOver`, `InstructorEditor`, `InstructorProfile` ricevono **solo** le righe attive (`items`) — invariati al byte.
17. **Given** i testid della sezione **Then** sono `inactive-instructor-row-{personId}` (desktop) e `mobile-inactive-instructor-row-{personId}` (mobile): **nessuno** dei due matcha `[data-testid^="mobile-instructor-row-"]`, che `e2e/mobile-a11y-sweep.spec.ts:283` usa con `.first()` per aprire l'editor (§5.5). Verifica obbligatoria: `grep -rn 'data-testid\^=' e2e/`.

### Una sola formula

18. **Given** `src/` dopo la story **When** censisco le conversioni ore→denaro **Then** ce n'è **una**: `money.ts#centsForMinutes`, con 3 call-site in `flights.service.ts`; `grep -rn "/ 60" src/server src/app --include=*.ts --include=*.tsx` non trova nessun altro sito che produca centesimi (le occorrenze di `time.ts`, `booking-schedule.ts`, `bookings.service.ts:330-331`, `reports-console.tsx:71` sono ore/minuti, non denaro).
19. **Given** 69′ a 15,10 €/h **When** registro il volo **Then** addebito istruttore e snapshot payout valgono **entrambi 1737** (half-up sull'esatto 1736,5) — il caso che oggi diverge (`1737` vs `1736`, sonda §4.4 terzo test). Un unit lo fissa **come uguaglianza fra i due numeri**, non come due letterali.

### Superfici, parità e non-regressione

20. **Given** l'export xlsx Compensi **When** lo scarico **Then** contiene le righe non-più-attive e una **quinta colonna «Stato»** (`Attivo`/`Non più attivo`, entrambi i locale); le colonne 1-4 restano al loro posto e con lo stesso formato numerico.
21. **Given** `/dashboard/reports` nel periodo corrente **When** un ex istruttore ha volato nel periodo **Then** la sua riga mostra il dovuto invece di «—» (conseguenza dichiarata di AD-9, con il suo unit in `stats.service.test.ts`); **Given** `/dashboard/billing` **Then** il widget Compensi resta **solo attivi** (AD-9).
22. **Given** l'OpenAPI **When** rigenero **Then** `instructorCompensationSummaryItemSchema` porta `isActive`, e le **due** descrizioni che oggi dichiarano il contrario sono corrette: `registry.ts:2032` («all ACTIVE instructors», «`payoutRateCents: null` -> `owed*Cents: null`») e `:2064` (stessa affermazione sul PUT rate). Nessun test copre le descrizioni (lezione 15.9): vanno cambiate a mano.
23. **Given** `prisma/seed-load.ts` **When** rigenero il DB di carico **Then** i suoi `flight.createMany` popolano le due colonne nuove (`:688-689` e `:759-760`, dalla mappa delle tariffe payout già disponibile in `instructorProfileRows`, `:348`); **Given** `prisma/seed-demo.ts` **Then** **nessuna** modifica (passa per il vero `registerFlight`, e imposta la tariffa payout a `:368-371`, **prima** dei voli a `:440` — verificato).
24. **Given** le tre fixture e2e che oggi registrano il volo **prima** della tariffa (`instructor-compensation.spec.ts:131`/`:144`, `:174`/`:176`, `:217`/`:218`) **Then** sono riordinate (tariffa prima, volo dopo) **e** nasce un test nuovo che asserisce il caso opposto: un volo registrato senza tariffa resta senza compenso, e impostare la tariffa dopo **non** lo riscrive (AC 10).
25. **Given** `npm run gates` **Then** passa; **Given** la suite e2e completa via `scripts/e2e.sh` su DB fresco **Then** 0 failed, con gli skipped ambientali noti dichiarati.

---

## §3 — Dev Notes: blast radius (misurato su `9272129`)

### 3.1 File da modificare

| File | Righe | Cosa |
|---|---|---|
| `prisma/schema.prisma` | `129-138` (doc-comment `payoutRateCents`), `1040-1044` (dopo `instructorAmountCents`) | 2 colonne nuove + 2 doc-comment |
| `prisma/migrations/20260910…_flight_instructor_payout_snapshot/migration.sql` | **nuovo** | `ALTER TABLE` + backfill (AD-11) |
| `src/lib/money.ts` | fine file | `centsForMinutes` (AD-4) |
| `src/server/services/flights.service.ts` | `348-366` (`ResolvedFlightInput` +2 campi), `465-475` (`findActiveInstructor`: `payoutRateCents` nel select **e** nel ritorno), `884` (usa `centsForMinutes`), `898-902` (2 campi nel ritorno), `937-939` (`RegisterFlightCoreInput` +2), `987` (usa `centsForMinutes`), `1010-1013` (2 campi in `flight.create`), `1147-1149` + `1523-1525` (2 campi ai due call-site), doc-comment `:45-53`/`:556-566` e `:1368-1382` (AD-6) | il volo congela la terza tariffa |
| `src/server/services/instructor-compensation.service.ts` | `27-38` (+`isActive`), `97-119` (invariata), **nuova** `listInactiveInstructors`, `120-139` → `sumSchoolFlightsByProfile`, `166-176` (**via** entrambe le funzioni), `179-210` (`computeSummaryRows`), `213-218` (`getCompensationSummary`: unione + filtro), `264-277`/`325-357` (`mtdGrossCents` = maturato dagli snapshot), `361-381` (`resolveActiveInstructorRow`: `isActive: true`), doc-comment del modulo `:13-24` | il lettore somma snapshot |
| `src/lib/schemas/instructor-compensation.ts` | `22-42` (doc-comment + `isActive`) | DTO + OpenAPI |
| `src/lib/schemas/registry.ts` | `2032`, `2064` | 2 descrizioni che oggi mentono |
| `src/app/[locale]/dashboard/instructors/page.tsx` | `49-54` (KPI e platee), `62-69` (`items` = solo attivi), `76`, `81-84`, + prop nuova e ~10 label | AD-8 |
| `src/app/[locale]/dashboard/instructors/instructors-console.tsx` | `39-45` (`InstructorRow` +`isActive`), `48-56` (labels), `95-101` (prop nuova), dopo `:184` (sezione desktop) e dopo `:230` (faccia mobile) | la sezione nuova |
| `src/app/[locale]/dashboard/instructors/instructor-editor.tsx` | `57` (label `hint`), `423` (`Field hint=`) | AC 12 |
| `src/app/[locale]/dashboard/billing/page.tsx` | `192` | `.filter((row) => row.isActive)` (AD-9) |
| `src/server/services/exports.service.ts` | `480-485` | colonna «Stato» |
| `messages/it.json`, `messages/en.json` | `InstructorsPage` | 8 chiavi (v. 3.4) |
| `prisma/seed-load.ts` | `584-589` (tipo), `660-661`, `688-689`, `733-734`, `759-760`, `794-795` | 2 campi nei `createMany` |

**Nessun** file nuovo oltre alla migrazione. **Nessuna** nuova env var, **nessuno** script/hook/CI da toccare (`src/lib/env.ci-sync.test.ts` non è coinvolto: nessun contratto d'ambiente cambia).

### 3.2 Test unit: quali fixture si stringono

`flights.service.test.ts` (2 335 righe, prisma **interamente mockato**, `$transaction` stand-in a `:160-166`):
- **`INSTRUCTOR_PROFILE_ROW` (`:211-216`) non ha `payoutRateCents`**. Appena `findActiveInstructor` lo seleziona, la fixture restituisce `undefined` → lo snapshot diventerebbe `undefined`. **Va aggiunto** lì e nei 3 `instructorProfile` inline: `:803`, `:816`, `:1385`. **È la trappola numero uno lato voli.**
- Le asserzioni su `flight.create` usano **tutte** `expect.objectContaining` (verificato sui 27 siti `flightCreateMock`): aggiungere due campi non rompe nulla **e non asserisce nulla** ⇒ servono asserzioni **nuove**, esplicite, sui due campi (AC 4/5) — mai un `objectContaining` allargato che passerebbe anche con le colonne assenti.
- `CREATED_FLIGHT_ROW` (`:220-250`) è la riga **restituita** dal mock (forma di `FLIGHT_SELECT`): per AD-7 **non** cambia.
- `flights-expiry-boundary.integration.test.ts:23-35` mocka `flight: { create }` e persone: da rileggere per la stessa fixture-istruttore.

`instructor-compensation.service.test.ts` (576 righe):
- `flightGroupBy.mockResolvedValue([{ instructorProfileId, _sum: { minutes: 130 } }])` compare in ~10 test. Dopo il fix ogni fixture deve dichiarare **anche** `_sum.instructorPayoutCents` e `_count` — cioè **dire quanto è maturato**, invece di lasciarlo dedurre da minuti × tariffa. È un **irrigidimento**: il test smette di ricalcolare la regola che verifica.
- Il test *«a null payoutRateCents (no rate set yet) yields a null owedMtdCents, never a fabricated 0»* (`:186`, con `stubZeroAggregates()`) **cambia contratto**: con 0 voli il dovuto è **0** (AC 11). Va **riscritto**, non cancellato: il `null` ora nasce da un **volo** non prezzato (AC 10), e il nuovo test lo dice. Il suo commento deve spiegare il cambio, altrimenti in review sembra un test indebolito.
- `instructorPersonRow` (`:100-109`) e `resolveActiveInstructorRow`: aggiungere `isActive` alle attese `toEqual` (sono uguaglianze esatte: `:193`, e altre).

`stats.service.test.ts:184-199` e `exports.service.test.ts:382-403`: i mock di `getCompensationSummary` sono `as never` (nessun errore di tipo), ma le fixture vanno completate con `isActive` **e** l'export va asserito sulla quinta cella in **entrambe** le righe (AC 20), aggiungendo una terza riga non-più-attiva.

### 3.3 Il censimento delle formule (per AC 18)

`grep -rn "60)" src --include=*.ts --include=*.tsx | grep -i "cent\|rate\|amount"` → oggi **3** siti di denaro (`instructor-compensation.service.ts:169`, `flights.service.ts:884`, `:987`) e **4** copie nel seed di carico (`seed-load.ts:659`, `:661`, `:732`, `:734`). Dopo la story: **1** funzione, 3 call-site, e le 4 copie del seed **dichiarate** (AD-4). Nessun altro sito del repo converte minuti in centesimi — verificato.

### 3.4 UI: cosa esiste già e cosa si aggiunge

- **Zero CSS nuovo**: la sezione riusa `.card`/`.card-head`/`.card-title`/`.card-sub`, `.students`/`.student-row`, e le due classi di scambio `instructors-desktop-body`/`instructors-mobile` (`airops.css:2500`, `:2518-2521`), più la famiglia `.mobile-row*` per la faccia telefono. Le colonne: `cols` del roster è `'minmax(160px,1.8fr) 120px 110px 130px minmax(160px,1.2fr)'` (`instructors-console.tsx:112`) — la sezione ne usa **quattro** (nome, tariffa, ore, dovuto), senza la colonna azioni.
- **`KPI` ha già lo slot `delta`** (`kpi.tsx:36`, reso in `.kpi-delta`): è lì che va il conteggio dei dovuti ignoti (AC 15), con `trend=''` (neutro — non è né buono né cattivo, è un'incompletezza).
- **`Field` ha già `hint`** (`field.tsx:35`, `.fld-hint`, muted, **esclusivo** con `error`): è lì che va la frase «vale dai prossimi voli» (AC 12).
- **8 chiavi i18n nuove** in `InstructorsPage`, entrambi i locale: `subInactive`, `kpi.owedUnknown`, `inactiveSection.title`, `inactiveSection.hint`, `table.status`, `status.active`, `status.inactive`, `editor.payoutRate.hint`. Parità: `python3 -c "import json;a=json.load(open('messages/it.json'));b=json.load(open('messages/en.json'));…"` — 0 chiavi asimmetriche (non esiste un test automatico: è una verifica del dev, come nelle story precedenti).
- **Verifica UI interattiva** col Playwright MCP (o lo script `@playwright/test` throwaway se il MCP non è disponibile, v. `HANDOFF.md`): a **1280** e **375**, nei **due temi**, misurando (a) che la sezione non compare quando è vuota, (b) contrasto del testo del dovuto ≥ 4,5:1, (c) altezza riga ≥ 44px a 375px, (d) che il roster attivo sopra è **invariato al centesimo** (screenshot/misura pre-post).

### 3.5 e2e: le fixture che cambiano (censimento completo)

| # | `file:riga` | Cosa fa oggi | Correzione |
|---|---|---|---|
| 1 | `instructor-compensation.spec.ts:123-166` | volo a `:131`, tariffa via **UI** a `:139-145`, poi attende `30,00 €` a `:149` | la tariffa va impostata **prima** del volo (l'interazione UI col form resta: è l'unica copertura di `instructor-payout-rate-form`). L'asserzione «`—` prima della tariffa» a `:137` **resta valida** (la cella *Tariffa* dice «—»), ma il commento va corretto: la cella *Dovuto* dirà **0,00 €**, non «—», perché non ci sono ancora voli |
| 2 | `instructor-compensation.spec.ts:167-196` | volo a `:174`, tariffa via PUT a `:176`; attende `owedTotalCents === 7000` | spostare il PUT **sopra** `:174`. Il numero **non cambia**: 120′ × 6000/60 = 12 000 sia per volo sia sull'aggregato |
| 3 | `instructor-compensation.spec.ts:209-229` | volo a `:217`, tariffa via PUT a `:218`; attende la riga nel ciclo pagamenti | spostare il PUT **sopra** `:217`. La riga «Unrated» resta fuori dal ciclo (dovuto 0, nessun volo) e mostra «—» sulla tariffa: aggiungere l'asserzione **esplicita sulla cella della tariffa** invece del `toContainText('—')` di riga, che è ambiguo |
| 4 | **nuovo** in `instructor-compensation.spec.ts` | — | AC 10 + AC 13/14: (a) volo **senza** tariffa → dovuto «—», tariffa impostata dopo → **ancora** «—»; (b) un istruttore con tariffa, volo e payout parziale, **disattivato** via API → compare nella sezione «non più attivi» e il KPI lo include |

Fixture **verificate non collidenti** (perché il censimento sia completo): `my-compensation.spec.ts:277` imposta la tariffa **prima** del volo di `:280` ⇒ i due KPI attesi (`120,00 €` lordo, `90,00 €` netto) restano esatti; `my-compensation.spec.ts:247-261` non registra voli ⇒ `0,00 €`/`-200,00 €` invariati; `mobile-registries.spec.ts:496` imposta la tariffa **prima** del volo di `:513` ⇒ «dovuti» resta; `mobile-self-public.spec.ts:782` imposta la tariffa e non registra voli; `flights.spec.ts:202` è un commento. **Nessun altro spec** legge `owed*`.
**Stato globale**: nessuna di queste scrive `AppSettings` ⇒ **niente** project serializzato nuovo in `playwright.config.ts`.

### 3.6 Misure sul DB di carico (query eseguite oggi, sola lettura)

```sql
-- 1. platee e tariffe
SELECT count(*) FROM "InstructorProfile";                                   -- 401
SELECT count(*) FROM "InstructorProfile" WHERE "payoutRateCents" IS NOT NULL;-- 319
-- 2. voli
SELECT count(*) FROM "Flight";                                              -- 60 487
SELECT count(*) FROM "Flight" WHERE "instructorProfileId" IS NOT NULL;      -- 16 082
SELECT count(*) FROM "Flight" WHERE "instructorProfileId" IS NOT NULL AND "flightType" <> 'SCHOOL'; -- 3 848
SELECT count(*) FROM "Flight" WHERE "flightType" = 'SCHOOL' AND "instructorProfileId" IS NULL;      -- 0
-- 3. MAJOR-2, quantificato
--    27 profili inattivi (persona archiviata E profilo disattivato su tutti e 27),
--    22 con dovuto != 0, 810 388 c = 8 103,88 EUR
-- 4. l'arrotondamento per volo vs sull'aggregato: 248/319, |Σ| 490 c, max 9 c, netto +220 c
-- 5. il KPI di pagina: 11 321 417 c -> 12 132 003 c
```

| Misura | Valore |
|---|---|
| righe che il backfill valorizza | **12 871** |
| righe con istruttore lasciate a `NULL` (istruttore senza tariffa) | **3 211** |
| istruttori con dovuto **ignoto** dopo (= prima) | **81** |
| istruttori nella sezione «non più attivi» | **22** (su 27 inattivi) |
| «Totale dovuto» prima → dopo | **113 214,17 € → 121 320,03 €** |

---

## §4 — Piano di test

### 4.1 Unit — `flights.service.test.ts`

| # | Caso | Asserzione |
|---|---|---|
| U1 | volo con istruttore, tariffa payout 3000, 90′ | `flight.create` riceve `instructorPayoutRateCents: 3000`, `instructorPayoutCents: 4500` |
| U2 | volo con istruttore **senza** tariffa payout | entrambe `null`; `instructorAmountCents` (addebito) **resta** valorizzato — le due tariffe sono indipendenti |
| U3 | volo **senza** istruttore | entrambe `null` |
| U4 | 69′ a tariffa payout 1510 **e** tariffa addebito 1510 | `instructorPayoutCents === instructorAmountCents === 1737` — **uguaglianza fra i due**, non due letterali (AC 19) |
| U5 | `correctFlight` che cambia i minuti | il volo nuovo porta lo snapshot dei **nuovi** minuti alla tariffa **corrente**; nessun `flight.update` tocca le due colonne |
| U6 | `cancelFlight` | **nessuna** delle due colonne nella `data` dell'`update` (l'unica scrittura è status/cancelledAt/cancelReason) |
| U7 | `findActiveInstructor` | il `select` chiede `payoutRateCents` (asserzione sull'argomento passato a `person.findUnique`) |

### 4.2 Unit — `instructor-compensation.service.test.ts`

| # | Caso | Asserzione |
|---|---|---|
| U8 | 100 h con snapshot per 200 000 c, payout 200 000 c | `owedTotalCents === 0` |
| U9 | **la stessa** storia, `payoutRateCents` del profilo cambiata a 2500 | `owedTotalCents` **ancora 0** — MAJOR-1 chiuso (AC 9) |
| U10 | finestra con un volo `instructorPayoutCents: null` | `owedTotalCents === null`, e **non** la somma dei soli noti (AC 10) |
| U11 | istruttore senza tariffa e senza voli | `owedTotalCents === 0` (AC 11) |
| U12 | roster: 1 attivo + 1 archiviato con dovuto ≠ 0 + 1 archiviato con dovuto 0 | 2 righe, `isActive` `true`/`false`, il terzo **assente** (AC 13) |
| U13 | il `where` di `listInactiveInstructors` | `{ instructorProfile: { isNot: null }, OR: [{ archivedAt: { not: null } }, { instructorProfile: { deactivatedAt: { not: null } } }] }` |
| U14 | il `where` di `sumSchoolFlightsByProfile` | `flightType: 'SCHOOL'`, `status: { not: 'CANCELLED' }`, bound — **invariato** rispetto a oggi (nessuna clausola aggiunta o tolta) |
| U15 | budget di query | `flight.groupBy` chiamata **3** volte e `instructorPayout.groupBy` **3** volte per un roster di N (mai N+1) |
| U16 | `mtdGrossCents` di `getOwnCompensationOverview` | = Σ snapshot della finestra mtd, **non** `minuti × tariffa` |
| U17 | `getOwnCompensationSummary` | usa ancora la platea **attiva** (un profilo disattivato → `null`) — AD-9 |

### 4.3 Unit — contorno

| # | File | Caso |
|---|---|---|
| U18 | `money.test.ts` (**nuovo** o esistente) | `centsForMinutes(1510, 69) === 1737`; `centsForMinutes(333, 30) === 167`; `centsForMinutes(rate, 0) === 0`; il confronto con la formula ritirata su `(1510, 69)` **documenta** perché una sola resta |
| U19 | `stats.service.test.ts` | un ex istruttore nel periodo corrente ora ha `owedCents` valorizzato (AC 21) |
| U20 | `exports.service.test.ts` | 3 righe (attiva prezzata, attiva senza tariffa, non-più-attiva): colonne 1-4 invariate + quinta cella `Attivo`/`Non più attivo` |

### 4.4 Le sonde discriminanti, già scritte ed **eseguite** oggi (pre-fix)

`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-5/major-1-2.test.ts` (throwaway, **fuori** dal repo: `vitest.config.ts` include solo `src/**`; eseguita con un config di scratch e `node_modules` simlinkato). Usa l'idioma di mock di `instructor-compensation.service.test.ts` e un `person.findMany` che **applica davvero** il `where` del servizio a un roster di 2 — così la sonda misura **il filtro**, non una fixture scelta a mano. Esito **verbatim** di oggi:

```
 RUN  v4.1.9 /home/admin/AirManager

 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MAJOR-1 (pre-fix) — the payout rate is applied RETROACTIVELY to hours already settled > 100 h paid in full at 20,00 EUR/h -> owed 0; the SAME history re-read after setPayoutRate(25,00) -> owed +500,00 EUR 61ms
 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MAJOR-2 (pre-fix) — the instructor who left is unreachable, and the KPI reads complete > the roster of 2 answers 1 row: 1 000,00 EUR owed to the archived/deactivated instructor is in NO summary, and the "Totale dovuto" KPI says 0,00 EUR 6ms
 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MAJOR-2 (pre-fix) — the instructor who left is unreachable, and the KPI reads complete > the roster query REALLY carries the two exclusions (the filter is the defect) 5ms
 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MINOR-1 (pre-fix) — two formulas, and the payout one loses the half cent > 69 min at 15,10 EUR/h: the flight charge rounds UP to 1737, the payout rounds DOWN to 1736 1ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**Quattro test verdi = i tre difetti**: (1) il dovuto passa da 0 a +500,00 € e a −200,00 € senza che un volo o un payout si muovano; (2) 1 000,00 € dovuti a un istruttore archiviato **non sono in nessun summary** e il KPI di pagina — calcolato con la riga esatta di `instructors/page.tsx:51` — dice **0,00 €**; (3) lo stesso rate×minuti dà 1737 all'addebito e 1736 al compenso.
Il dev **porta i casi 1 e 2 dentro** `instructor-compensation.service.test.ts` con l'aspettativa **rovesciata** (U9, U12) e cita nel Dev Agent Record **entrambi** gli output: questo (verde = difetto) e quello post-fix (rosso sul pre-fix simulato).

### 4.5 Le due prove che la migrazione non muove denaro per sbaglio

**(a) SQL ≡ TypeScript sulla formula tenuta.** Su `rate ∈ [1000, 40000] × minutes ∈ [1, 300]` (11 700 300 coppie):

| | somma | somma pesata `× (rate·301 + minutes)` |
|---|---|---|
| `Math.round((rate*minutes)/60)` (Node) | 601 639 468 750 | 4 832 281 482 578 978 300 |
| `round((rate::numeric*minutes)/60)` (Postgres 16) | 601 639 468 750 | 4 832 281 482 578 978 300 |

Due somme indipendenti identiche su 11,7 M punti: l'uguaglianza non è un caso di compensazione.
**(b) SQL ≡ TypeScript sulle righe reali.** Sulle 12 871 coppie `(payoutRateCents, minutes)` che il backfill toccherà nel DB di carico: **12 871** righe, somma **53 157 673**, somma pesata **38 510 736 413** — identiche nei due motori. Comandi e script in `…/scratchpad/story-16-5/{delta.mjs,backfill-pairs.psv}`; il dev **rieseguirà (b)** dopo la migrazione confrontando `SUM("instructorPayoutCents")` col numero qui sopra.
**(c) l'idioma `_count` del lettore, provato sul DB reale** (`…/scratchpad/story-16-5/groupby.test.ts`, su `instructorAmountCents` che è già `Int?`):

```
[{"_sum":{"minutes":3551,"instructorAmountCents":182821},"_count":{"_all":40,"instructorAmountCents":40},"instructorProfileId":"00309384-…"}, …]
```

⇒ `_sum` e `_count` (con `_all` **e** il conteggio dei non-nulli) viaggiano in **una** query: il budget resta 6.

### 4.6 Tabella guardia → discriminanza (ognuna provata **ROSSA** sul pre-fix simulato, con ripristino `sha256`)

| Comportamento | Pre-fix da simulare | Rosso atteso |
|---|---|---|
| snapshot scritto alla registrazione | togliere i 2 campi dalla `data` di `flight.create` | U1, U4, E-nuovo (a) |
| snapshot `null` senza tariffa | scrivere `0` invece di `null` | U2, U10 |
| dovuto dagli snapshot | tornare a `round(minuti/60 × tariffa)` | U9, E-1 |
| dovuto ignoto ≠ 0 | sommare i soli noti (`?? 0` dentro il `_sum`) | U10, E-nuovo (a) |
| platea che include chi è andato via | rimettere il solo `listActiveInstructors` | U12, E-nuovo (b) |
| filtro «dovuto ≠ 0» | mostrare tutti gli inattivi | U12 |
| KPI attivi ≠ KPI dovuto | contare `summary.length` per gli attivi | E-nuovo (b) |
| una sola formula | rimettere `computeGrossCents` | U4, U18 |
| backfill | eseguire la migrazione senza l'`UPDATE` | prova (b) di §4.5: somma 0 invece di 53 157 673 |

### 4.7 Gate

`npm run gates` (mai i 4 comandi separati). Suite e2e **solo** via `scripts/e2e.sh start` + `scripts/e2e.sh status` (mai `playwright test` in foreground), su **DB fresco** e build di produzione, con `export JOBS_SECRET=<non-placeholder>` prima del run (`HANDOFF.md`). Per una serie di run mirati: build una volta + `E2E_REUSE_SERVER=1`. Se ripetendo run mirati un login inizia a fallire sempre: è il cap anti-brute-force (`LoginAttempt`), non la story. La migrazione va provata **due volte**: su un DB fresco (`prisma migrate deploy` da zero) e su `airmanager_load` (dati veri, 60 487 voli) — con il tempo misurato e riportato.

---

## §5 — Trappole note

1. **`INSTRUCTOR_PROFILE_ROW` senza `payoutRateCents`** (`flights.service.test.ts:211-216`, più i 3 inline a `:803`, `:816`, `:1385`): il mock restituisce `undefined`, Prisma lo tratta come «campo non fornito», la colonna resta `NULL` e **U1 fallisce con un messaggio che sembra un bug del codice**. È la trappola numero uno.
2. **`undefined` vs `null` nella `data` di `flight.create`**: `instructorPayoutCents: cond ? x : null`, **mai** `cond ? x : undefined`. Con `undefined` la colonna resta al default e il test `objectContaining` passa comunque.
3. **Il caso «tariffa impostata dopo il volo» è il cuore dell'AC 10 e la suite e2e oggi lo dà per buono in 3 test** (§3.5): chi riordina le fixture senza aggiungere il test nuovo cancella la prova che il difetto è chiuso.
4. **«Ciclo pagamenti» filtra `(owedTotalCents ?? 0) > 0`** (`instructors-console.tsx:262`): un dovuto `null` (ignoto) resta fuori da quella lista. Comportamento **identico a oggi** per un istruttore senza tariffa, ma va dichiarato — non è la sezione «non più attivi» che lo risolve.
5. **`[data-testid^="mobile-instructor-row-"]`** è usato da `e2e/mobile-a11y-sweep.spec.ts:283` con `.first()`: un testid della sezione nuova che inizi con quel prefisso farebbe aprire al test la riga **sbagliata** (che non ha né editor né dettaglio) — e il fallimento sarebbe in un altro spec, su un'altra pagina. Nomi obbligati: `inactive-instructor-row-{id}` e `mobile-inactive-instructor-row-{id}` (AC 17).
6. **`activeCount = summary.length`** (`page.tsx:49`): con la platea allargata quella riga fa mentire il KPI «Istruttori attivi» **e** il `sub` di pagina. Va cambiata **insieme** alla platea, non dopo.
7. **La faccia mobile va aggiunta anche alla sezione nuova**: `.instructors-mobile` è `display: none` **fuori** dalla media query (`airops.css:2500`) e `display: block` dentro; una sezione con la sola tabella desktop **sparisce** a 375px, e nessun test desktop lo vede.
8. **`Field`: `hint` ed `error` sono esclusivi** (`field.tsx:46-47`) — l'hint della tariffa scompare quando il campo è in errore. È il comportamento voluto, ma un test che cerchi l'hint dopo un input invalido fallirebbe.
9. **`resolveActiveInstructorRow` (`:361-381`) risponde 404 su un profilo disattivato** e `recordPayout` 409 (`:438-442`): la sezione nuova **non** deve avere click sul nome né bottoni. Se il dev li mette «per simmetria», la review trova un 404 in faccia all'utente.
10. **La tariffa payout è letta FUORI dalla transazione** (`resolveFlightInput`, come tutte le altre tariffe: *«Rate lookups BEFORE any transaction»*, `:868-869`) — ma a differenza di `AircraftRate`/`InstructorRate` **è mutabile**. Esiste quindi una finestra di millisecondi in cui `setPayoutRate` concorrente fa congelare la tariffa vecchia. **Non si prende nessun lock**: sarebbe un lock nuovo su una colonna che un admin cambia due volte l'anno, per una finestra che nessun utente può osservare. Va **dichiarato** nel doc-comment, non chiuso.
11. **`mtdGrossCents`** (`:264-277`, `:346`) è oggi `round(mtdMinutes/60 × tariffa)`: se resta così mentre `owed` passa agli snapshot, la pagina «I miei compensi» mostra un **lordo** e un **netto** calcolati con due regole diverse, e la loro differenza smette di essere il pagato. Deve diventare Σ snapshot della finestra (U16).
12. **Le descrizioni OpenAPI non sono coperte da test** (`expect.arrayContaining` nel registry test): le due affermazioni false di `registry.ts:2032`/`:2064` non fanno protestare nessun gate (lezione 15.9).
13. **`prisma/seed-load.ts` va aggiornato o il DB di carico nasce senza snapshot**: la migrazione backfilla le righe **esistenti**, ma il seed inserisce righe **nuove** con `createMany` (bypassa il servizio). Senza le due colonne nel builder, ogni misura dell'epic 17 sul dovuto sarebbe zero.
14. **Non toccare `payoutRateCents` come colonna** (niente storicizzazione, niente tabella nuova): R-16-d ha scelto lo snapshot. Un diff su `instructor-rates.service.ts` o una migrazione con un `@@unique([instructorProfileId, validFrom])` è scope creep.

---

## §6 — Fuori scope DICHIARATO

| Voce | Perché fuori | Dove va |
|---|---|---|
| **Storicizzare `payoutRateCents`** (`InstructorRate`-style, prima opzione dell'audit) | R-16-d ha ratificato lo snapshot sul volo; la seconda opzione «non richiede migrazione dei dati esistenti» ma non risponde alla domanda «quanto ha maturato **questo** volo» | ratificato: nessun TD |
| **Liquidare un istruttore non più attivo** (`recordPayout` risponde 409 su un profilo disattivato, `:438-442`) | non è in P4, che chiede **visibilità** e **KPI**; cambiare quel 409 è una decisione operativa (si può pagare chi non lavora più? con quale traccia?) con un suo test dedicato (`instructor-compensation.service.test.ts:551`) | **domanda PO** in §7 + TD se la risposta è sì |
| **Il dettaglio (slide-over) di un istruttore non più attivo** (`resolveActiveInstructorRow` → 404) | la sezione è in sola lettura per AD-8; aprire il dettaglio richiederebbe rilassare anche quel 404 | dichiarato; segue la decisione PO sopra |
| **Storno di un `InstructorPayout`** (`schema.prisma:174-177`: *«no reversal concept for this MVP ledger»*) | preesistente, e con lo snapshot il dovuto negativo per **ricalcolo** non nasce più (nasce solo se si paga davvero più del maturato) | dichiarato |
| **Ri-prezzare i voli già registrati senza tariffa** (gli 81 istruttori / 2 399 voli) | riscriverebbe uno snapshot, cioè I5; la via d'uscita esiste ed è `correctFlight` volo per volo | dichiarato nel doc-comment + §7 |
| **Esporre le due colonne nel DTO del volo / in OpenAPI dei voli** | AD-7: nessun AC lo chiede, e `listFlights` ha un ramo own-access | dichiarato |
| **Le 4 copie della formula in `prisma/seed-load.ts`** (`:659`, `:661`, `:732`, `:734`) | un seed non è un percorso di dominio; sostituirle non è riconducibile alla richiesta (karpathy §3) — si aggiungono solo le due colonne | segnalato nel Dev Agent Record |
| **Indici nuovi su `Flight`** | `@@index([instructorProfileId])` esiste (`schema.prisma:1085`); sommare una colonna non cambia il piano | epic **17** |
| **Il widget Compensi di `/dashboard/billing` che mostri il dovuto all-time** | è un riquadro **month-to-date** per progetto; cambiarne la semantica è un'altra story | dichiarato (AD-9) |
| **`sumMinutesByProfile` che passi da `status: { not: 'CANCELLED' }` a `status: 'REGISTERED'`** | equivalenti (l'enum ha 2 valori); cambiare la clausola è churn senza effetto | dichiarato |
| **Il doc-comment di `people.ts:148`** («`InstructorProfile` having no own field left») | preesistente, non riconducibile a questa richiesta | segnalato nel Dev Agent Record |

---

## §7 — Riferimenti e domande

- **AC di contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` → «Story 16.5», «Architettura e vincoli», ratifica **R-16-d**.
- **Findings**: `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` → **MAJOR-1** (`:52-80`), **MAJOR-2** (`:82-119`), **MINOR-1** (`:286-314`), invarianti **I2/I4/I5/I7/I12/I13** (`:29-48`), **VC-8** (tariffe storicizzate corrette, da non toccare), **VC-7** (gli export riscorrono il servizio), **VC-12** (nessun aggregato su pagina).
- **Idioma «una funzione di dominio, N call-site»**: `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` (`computeAogImpact`, 2 call-site, mai due implementazioni).
- **Idioma migrazione a mano + backfill**: `prisma/migrations/20260722190000_add_expiry_type_kind/migration.sql`, `20260726090000_billing1_payment_method_payout_twin/migration.sql`.
- **Codice**: `instructor-compensation.service.ts` (modulo `:13-24`, `listActiveInstructors:97`, `sumMinutesByProfile:122`, `sumPayoutsByProfile:148`, `computeGrossCents:167`, `computeOwed:173`, `computeSummaryRows:179`, `getCompensationSummary:213`, `getOwnCompensationSummary:242`, `getOwnCompensationOverview:325`, `resolveActiveInstructorRow:361`, `getInstructorCompensationDetail:393`, `recordPayout:467`, `setPayoutRate:532`); `flights.service.ts` (`FLIGHT_SELECT:185`, `ResolvedFlightInput:348`, `findActiveInstructor:465`, `resolveFlightInput:598`, `:884`, `registerFlightCore:977`, `:987`, `registerFlight:1085`, `cancelFlight:1304`, `correctFlight:1411`); `schema.prisma` (`InstructorProfile:125-155`, `InstructorPayout:157-193`, `Flight:962-1090`); `accounts.service.ts:730-735` (la regola opposta, argomentata); `kpi.tsx:36` (`delta`); `field.tsx:35` (`hint`); `airops.css:2500`, `:2518-2521` (lo scambio desktop/mobile).
- **Sonde di questa story** (fuori dal repo, usa-e-getta): `…/scratchpad/story-16-5/major-1-2.test.ts` (le 3 discriminanze), `groupby.test.ts` (l'idioma `_count` sul DB reale), `delta.mjs` + `school-flights.psv` + `backfill-pairs.psv` (le prove SQL≡TS).

**Domande PO (nessuna blocca la story)**

1. **Si può liquidare un istruttore non più attivo?** Oggi no: `recordPayout` risponde 409 su un profilo disattivato, quindi la sezione nuova mostra 8 103,88 € (sul carico) **senza** una via d'uscita nell'app — l'admin deve riattivare il profilo, pagare e disattivarlo di nuovo. **Raccomandazione**: sì, permetterlo (è il pagamento di un lavoro passato, non un'operazione su una risorsa attiva), come story separata con il suo 409 → 200 e il suo test. Questa story si limita a **mostrare** il dovuto, come P4 chiede.
2. **I voli volati quando la tariffa payout non c'era vanno ri-prezzati?** Sono 2 399 voli di 81 istruttori sul carico. Oggi e dopo la migrazione il loro dovuto è **ignoto** («—»). **Raccomandazione**: no, non massivamente (riscriverebbe uno snapshot, cioè I5); la via d'uscita per-volo è `correctFlight`, ed è la stessa che il dominio offre per una tariffa velivolo sbagliata.
3. **Correggere un volo vecchio ne ri-prezza il compenso alla tariffa di oggi** (AD-6): è la conseguenza inevitabile di una tariffa senza storia. Se il PO la considera indesiderabile, l'unico rimedio è la prima opzione dell'audit (storicizzare `payoutRateCents`), che R-16-d ha escluso — quindi la si dichiara, non la si aggira.

## Addendum della sessione principale (2026-09-10, ratifiche PO prima del dispatch)

Le tre domande aperte della ricognizione sono state ratificate dal PO (AskUserQuestion, 2026-09-10) e PREVALGONO su quanto scritto sopra dove divergono:

- **R-16-i — payout a istruttori non più attivi**: `recordPayout` ACCETTA un istruttore disattivato/archiviato purché abbia dovuto residuo > 0 (il 409 odierno resta solo per dovuto ≤ 0); la card «non più attivi, con dovuto» porta l'azione **Paga** come il roster attivo. Unit + e2e sul caso «ex istruttore con 1 000 € dovuti → payout 200 € → dovuto 800 €».
- **R-16-j — correzione di un volo**: `correctFlight` **eredita** `instructorPayoutRateCents` dal volo originale (stesso volo, dati sistemati) e ricalcola `instructorPayoutCents` con la stessa formula sui minuti corretti; NON usa la tariffa di oggi. Se l'originale non ha tariffa (v. R-16-k) la correzione usa la tariffa vigente dell'istruttore, se esiste, altrimenti 0.
- **R-16-k — voli con istruttore SENZA alcuna tariffa payout**: il dovuto è **0, non null** (decisione PO contro la raccomandazione «null + contatore»): backfill a 0 e registrazione a 0 quando la tariffa manca; il contatore «N voli senza tariffa» in UI DECADE. Le due colonne restano nullable SOLO per i voli senza istruttore; per ogni volo con istruttore sono sempre valorizzate. Adeguare AC, migrazione e prove di parità di conseguenza; dichiarare nel Dev Agent Record quanti voli del DB di carico ricevono 0 (attesi 2 399).
