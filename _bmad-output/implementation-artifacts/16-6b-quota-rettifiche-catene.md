---
baseline_commit: 9272129
---

# Story 16.6b: Una quota per anno, e una rettifica che non consuma lo storno di un volo

Status: **ready-for-dev** — 2026-09-10. **Modello dev: Opus 5 xhigh** (la story tocca UI: il `fetch` della quota associativa in `scadenze-console.tsx` — chiave di idempotenza, `try/catch`, bottone che oggi resta bloccato per sempre —, un ramo d'errore nuovo con la sua frase in due locale, e il predicato dell'azione di riga dell'estratto conto su **due facce**). Review: **Opus 5 xhigh adversarial**.

> ⚠️ **Questa story è la METÀ «guardie di scrittura» della 16.6 del piano.** L'altra metà è `16-6a-data-valuta-e-totali.md` (data valuta, parità PDF/schermo, etichette dei libri). Il piano descriveva **una** story; la divido perché tocca **sei superfici indipendenti** (soglia di progetto: >4 superfici non correlate o >20 AC) e perché le due metà non condividono **nessun** file di produzione. **Nessuna dipendenza fra le due**: qualunque ordine, anche in parallelo.
>
> ⚠️ **`src/lib/api/handler.ts:60` è condiviso con la 16.2 e la 16.3.** Tutte e tre le story hanno bisogno che i `details` di un `ConflictError` arrivino al client (oggi il layer li **scarta**). **Regola: la prima delle tre che atterra fa la modifica di una riga; le altre due VERIFICANO che sia presente** e, se lo è, non la ripetono (il `git diff` non deve nominare quel file due volte con lo stesso contenuto). Prima di scrivere: `grep -n "const details = error instanceof" src/lib/api/handler.ts` — se la riga cita già `ConflictError`, il lavoro è fatto e va solo verificato con il suo unit.
>
> ⚠️ **Baseline**: `9272129` è il HEAD su cui **ho misurato** ogni `file:riga`. La 16.1 (`1a57609`) è già committata: `todayDateOnlyUtcInZone(APP_TIMEZONE)` è l'helper vivo. I `file:riga` dell'audit sono su `b7b8d13`; dove divergono **vale questo file**. Se il dev parte da un HEAD più avanzato: `git log --oneline -3`, rileggere ogni riga citata, **correggere questo file** dove è slittata.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` §**MAJOR-6**, §**MINOR-2**, §**MINOR-3**, §5 **DQ-1**; `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.6», §«Architettura e vincoli», **R-16-g**; `src/lib/use-idempotency-key.ts` (il **contratto** TD-2, AC 6 — questa story non lo cambia, lo **applica** al settimo form); `_bmad-output/implementation-artifacts/16-2-guardie-registro-voli.md` §AD-3 (la stessa riga di `handler.ts`, vista dall'altro lato). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`; per la parte UI `design-taste-frontend` e `ui-ux-pro-max`.
>
> 🧹 **Il DB e2e va resettato PRIMA di qualunque run** e **un reviewer sta usando la porta 3000 e il DB adesso**: coordinarsi con la sessione principale. Il DB di lavoro contiene già **un doppio addebito di quota** trovato dall'audit (v. §3.6) — dopo la guardia, quel conto risponde **409** al prossimo addebito dello stesso anno, che è il comportamento corretto e va **dichiarato**, non aggirato.

---

## Story

As **l'admin che addebita la quota associativa e corregge il conto di un pilota**,

I want che la quota **non parta due volte nello stesso anno** — né per un ritentativo di rete né per una seconda pressione del bottone — e che una **rettifica a mano** non porti via per sempre lo storno di un volo,

so that l'unica rotta dove `Idempotency-Key` è **obbligatoria** smetta di essere la sola in cui il client la **rigenera a ogni tentativo** (MAJOR-6), il doppio addebito **deliberato** sia rifiutato con la data del primo (R-16-g / DQ-1), un volo non diventi **inannullabile per sempre** con un clic (MINOR-2), e una catena di correzioni non produca **ricavo fantasma** un anello più in là (MINOR-3).

### Il perché: quattro difetti, una sola forma — una protezione che esiste e non è collegata

1. **La chiave di idempotenza.** Il contratto è scritto senza ambiguità (`use-idempotency-key.ts:38-45`: *«The key survives a NETWORK failure … but is regenerated after ANY HTTP response arrives»*), **sei** form su sette lo rispettano alla lettera, e il settimo — **l'unico dove il server la esige** (`registry.ts:2011`) — la costruisce **inline dentro la chiamata**:
   ```tsx
   // scadenze-console.tsx:811-814
   const response = await fetch(`/api/v1/people/${personId}/membership-fee`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomIdempotencyKey() },
     body: JSON.stringify({ amountCents: parsedAmount, override }),
   });
   ```
   Il `fetch` non è in `try/catch`, quindi un guasto di rete (a) lascia `submitting` a `true` — `setSubmitting(false)` è a `:816`, **dopo**, e non viene mai raggiunto — con il bottone disabilitato (`:907`) e **nessun messaggio**; (b) spinge l'operatore a ricaricare la pagina e riprovare, che è **esattamente** il gesto che con una chiave nuova **raddoppia l'addebito**. L'audit lo chiama *«il diff più piccolo di tutto questo audit»*.
2. **Il doppio addebito deliberato.** Non c'è nessuna guardia per anno: due addebiti producono **due righe indistinguibili** (`Quota associativa <anno>`, `membership.service.ts:134`) e una scadenza spinta a **24 mesi** dal pagamento, perché il rinnovo è rotativo su `max(oggi, expiresAt)` (`:154`). Misurato oggi sul codice vivo (probe §4.4): *`[{"type":"ADJUSTMENT","amountCents":-3000,"description":"Quota associativa 2027"},{"type":"ADJUSTMENT","amountCents":-3000,"description":"Quota associativa 2027"}]`*, `expiresAt` **2029-03-10** per un pagamento del **2027-03-10**.
3. **La rettifica che consuma lo storno del volo.** La guardia sull'originale esclude **solo** `PACKAGE_PURCHASE` (`accounts.service.ts:619`), e l'azione di riga dell'estratto conto la offre su **qualunque** altro tipo (`account-section.tsx:245-246`). Una rettifica di +150,00 € contro un addebito di −200,00 € viene scritta, `charge + storno = −50,00 € ≠ 0`, e lo slot unico `reversalOfId` è occupato **per sempre**: ogni futuro `cancelFlight`/`correctFlight` risponde 409 (`flights.service.ts:1250-1258`). Il rifiuto è **intenzionale e documentato**; ciò che non è dichiarato è che **l'UI offra il gesto senza avvertire**. E il ledger unificato adotta già la regola giusta, sulla stessa azione: `transactions.service.ts:289`.
4. **La catena corta di un anello.** La difesa della review Billing-2 F3 guarda **due** livelli (`transactions.service.ts:187-189`). Un `TOP_UP ← A1 ← A2 ← A3` mette la radice **un livello oltre lo sguardo** e nasce ricavo fantasma. L'audit lo prova a profondità 3 e dichiara il rimedio: *«risolvere l'antenato per ricorsione (o **memorizzare il tipo radice sulla riga**) invece di srotolare N livelli — un terzo `reversalOf` annidato sposterebbe il buco a profondità 4»*.

### Fatti misurati che vincolano il design

| Fatto | Misura (oggi, su questo HEAD) | Conseguenza |
|---|---|---|
| Il lock che serializza gli addebiti di quota **c'è già** | `membership.service.ts:103`: `SELECT "id" FROM "Account" WHERE "id" = ... FOR UPDATE`, prima istruzione utile della `$transaction` | la guardia per anno va **dentro** quella transazione, **dopo** quel lock: due addebiti concorrenti non possono entrambi passare, **zero lock nuovi** (stessa disciplina della 16.2/16.3) |
| **Non esiste** alcun legame strutturale fra un `AccountMovement` e la quota | `model AccountMovement` (`schema.prisma:644-681`): `type`, `amountCents`, `description`, `effectiveDate`, `reversalOfId`, `flightId`, `cashMovement`, `hourPackage`. **Nessun** campo, nessuna FK verso `Expiry` | l'identificazione passa per la **descrizione**, ed è la sola cosa che funziona anche **retroattivamente** (una colonna nuova sarebbe `NULL` su ogni riga storica e andrebbe **comunque** riempita dalla descrizione) — v. AD-2 |
| L'app **ha già** l'idioma «identificazione per nome, sorgente unica» | `src/lib/expiry-scope.ts:29`: `export const MEMBERSHIP_FEE_TYPE_NAME = 'Quota associativa'`, importato da `membership.service.ts:2` e dai due picker client | la descrizione va **hoistata** accanto a quella costante, non ricopiata: il writer e la guardia leggono **la stessa** funzione |
| La descrizione della rettifica è **testo dell'operatore** | `accounts.service.ts:651`: `description: reason` (`reason` = `recordAdjustmentSchema.reason`, testo libero 1-500) | una rettifica con `reason` *«Quota associativa 2026»* e importo negativo **farebbe scattare** la guardia. **È l'esito voluto**: è la stessa quota, registrata a mano (v. AD-2, «falso positivo desiderabile») |
| `reversalOfId` è `@unique` | `schema.prisma:659` | le catene di storno sono **lineari**: ogni riga ha **al massimo un** figlio. Il «tipo radice» è quindi ben definito e **immutabile** (ledger append-only) ⇒ calcolabile **una volta**, alla scrittura |
| Nella catena di storno **i segni si alternano** | uno storno di `TOP_UP` è negativo (profondità 1), uno storno di **quello** è positivo (profondità 2) — che è **esattamente** l'asimmetria 1-livello/2-livelli del predicato attuale | i due livelli di oggi non sono due regole: sono le **istanze 1 e 2** di **una** regola («la radice è un `TOP_UP`»). Risolvere la radice **non** cambia semantica sui casi coperti oggi, la **completa** (dimostrazione in AD-4) |
| Prisma **non** può risalire una relazione a profondità arbitraria in un `where` | `ACCOUNT_REVENUE_OR` (`transactions.service.ts:130-140`) è un `Prisma.AccountMovementWhereInput[]` letto da **due** call-site (`:222` filtro `bookType`, `:466` `computeRevenueCents`) | una ricorsione a runtime **non** è esprimibile là. Restano: raw SQL con CTE (che spezza «una definizione, mai una seconda copia») o il **tipo radice sulla riga** — che è la seconda opzione dell'audit |
| `ConflictError` accetta `details`… e il layer API **li scarta** | `errors.ts` (*«`details` mirrors `ValidationError`'s shape too, even though no caller populates it yet»*) e **`handler.ts:60`**: `const details = error instanceof ValidationError ? error.details : undefined` | «409 con la data del primo addebito» **non è ottenibile** senza toccare quella riga. È il file condiviso con 16.2/16.3 |
| La rotta della quota **non dichiara** il 409 | `registry.ts:2017`: `...errorResponses(401, 403, 404, 422)` | va aggiunto `409` nello **stesso** commit (regola di progetto: OpenAPI/registry col codice) |
| Il client legge **già** i `details` di un 422 su questa stessa superficie | `scadenze-console.tsx:820-829`: ramo `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE` che interpola `details.balanceCents`/`amountCents` | il ramo 409 nuovo ha un **esemplare accanto**: si aggiunge un `if`, non si riscrive il blocco |
| L'e2e **documenta** oggi il comportamento che R-16-g ribalta | `e2e/membership-fee.spec.ts:107`: *«a second charge for the SAME pilot RENEWS the existing expiry … rather than creating a duplicate»*, `expect(secondCharge.status()).toBe(200)` a `:126` | quel test va **riscritto**, non cancellato: il rinnovo rotativo resta vero, ma è raggiungibile **solo** attraverso lo **storno** (o l'anno successivo) — ed è la prova migliore dell'esenzione di R-16-g |
| Sul DB di **carico** i difetti 3 e 4 sono **irraggiungibili** | 6 425 righe quota, **max 1 per conto/anno**, 0 stornate; 1 200 righe con `reversalOfId`, **profondità massima 2**; 0 rettifiche su `FLIGHT_CHARGE`; 0 rettifiche su `ADJUSTMENT` | MINOR-2 e MINOR-3 sono guardie **in avanti**: nessun backfill di dati «sporchi», e il backfill del tipo radice tocca **1 200** righe (banale) |

---

## §0 — Requisiti FISSI (contratto)

Dagli AC di contratto del piano (§«Story 16.6»), qui numerati. **Le tre righe di contratto della 16.6a non sono in questo file.**

| # | Requisito di contratto |
|---|---|
| **Q1** | Il bottone «Addebita quota»: **quando la rete cade e ritento, la `Idempotency-Key` è la stessa** del tentativo e il server risponde **replay**, non un secondo addebito. |
| **Q2** | (DQ-1 / R-16-g) Un **secondo addebito nello stesso anno civile** → **409 con la data del primo**… |
| **Q3** | …**a meno che il primo sia stato stornato**: nel ledger append-only «cancellare» = **storno via `ADJUSTMENT` di segno opposto**, e la guardia **ignora gli addebiti che hanno uno storno** (R-16-g, parole della ratifica). |
| **Q4** | `recordAdjustment` con un **`FLIGHT_CHARGE` come originale** → **422**: lo storno di un volo passa **solo** da `cancelFlight`. |
| **Q5** | Il classificatore risale l'antenato `TOP_UP` **a qualunque profondità** (MINOR-3). |
| **Q6** | Ogni guardia nuova nasce con un test che la prova **ROSSA** sul pre-fix simulato. |

**Ratifica che vincola questa story** — **R-16-g** (piano, 2026-09-10, risposta PO in chat): *«una quota associativa per anno civile; il secondo addebito nello stesso anno → 409 con la data del primo, **a meno che il primo sia stato stornato** ("se quella transazione viene cancellata, una nuova quota può essere creata" — nel ledger append-only "cancellare" = storno via `ADJUSTMENT` di segno opposto: la guardia ignora gli addebiti che hanno uno storno). Chiave di idempotenza stabile nel client per tentativo utente.»*
⇒ delle tre opzioni di **DQ-1**, il PO ha scelto la **(a)** (rifiutare con un 409 dedicato). Le opzioni (b) «renderlo distinguibile» e (c) «il rollover a 24 mesi è la semantica voluta» sono **respinte**: chi vuole pagare due anni paga una volta quest'anno e una l'anno prossimo. Nessuna ratifica PO **nuova** è necessaria.

**Invarianti che questa story deve lasciare intatte:**

| # | Invariante | Qui significa |
|---|---|---|
| **[L-1]** | Ledger **append-only**: nessun update/delete, ogni correzione è una riga nuova | il doppio addebito **già in DB** resta; la guardia vale sulle scritture nuove |
| **[L-2]** | Saldo = `SUM(AccountMovement)`, mai denormalizzato | `reversalRootType` (AD-4) **non** è un saldo né una cifra: è il **tipo** della radice della catena, e non entra in nessuna somma |
| **TD-2** | L'idempotenza di richiesta è **corretta** ed è **opt-in** (obbligatoria solo su 2 rotte) | il contratto di `use-idempotency-key.ts` **non si cambia**: si **applica** al settimo form. Nessun cambio di fingerprint, di lifecycle o di status di replay |
| **I7 / R-AOG** | `charge − reversal = 0` sul percorso automatico del volo | Q4 rende il percorso **manuale** incapace di violarla su un `FLIGHT_CHARGE`; il percorso automatico non si tocca |
| **Ratifica Billing-1 F3** | «uno storno appartiene al libro del suo originale, con segno opposto, nel mese in cui avviene» | Q5 la applica **transitivamente** (la radice, non il genitore): è la generalizzazione, non una regola nuova (AD-4) |
| **AD-1 (progetto)** | Una regola di dominio vive in **una** funzione | la descrizione della quota ha **una** sorgente e **due** lettori; il tipo radice ha **una** definizione letta dal badge di riga **e** dall'aggregato |

---

## §1 — Decisioni architetturali

**AD-1 — La chiave di idempotenza: si applica il contratto già scritto, verbatim.**

`use-idempotency-key.ts:47-62` contiene **il blocco d'uso**, in un doc-comment, con la frase «identical shape in all 5 forms». Il fix è quel blocco:

```tsx
// in MembershipFeeModal, accanto agli altri useState (~:797)
const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
// ...
setSubmitting(true);
let response: Response;
try {
  response = await fetch(`/api/v1/people/${personId}/membership-fee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify({ amountCents: parsedAmount, override }),
  });
} catch {
  // Guasto di rete: la chiave NON si rigenera (TD-2, AC 6) — il ritentativo
  // dell'operatore deve REPLAYARE, non addebitare una seconda volta.
  setSubmitting(false);
  setError(labels.genericError);
  return;
}
regenerateIdempotencyKey();
setSubmitting(false);
```

Tre difetti chiusi da questo blocco, e **tutti e tre** vanno asseriti (AC 1-3): la chiave sopravvive al guasto; `submitting` torna a `false` (il bottone di `:907` si riabilita); un messaggio d'errore **compare** invece del nulla di oggi.
⚠️ `randomIdempotencyKey` resta importata **solo** se il file la usa ancora altrove: `grep -n randomIdempotencyKey` sul file dopo il fix e **rimuovere l'import orfano** che il proprio cambio ha creato (karpathy §3), senza toccare altro.
⚠️ `IDEMPOTENCY_KEY_HEADER` va importata dallo **stesso** modulo client (`@/lib/use-idempotency-key`), **mai** da `@/lib/api/handler` — quel file è server-only e trascinerebbe Prisma nel bundle (il doc-comment dell'hook lo dichiara, `:5-13`).

**AD-2 — L'addebito di quota si identifica dalla DESCRIZIONE, con la stringa hoistata in una funzione condivisa. Non da una colonna nuova.**

La domanda vera è: che cosa rende una riga «l'addebito della quota dell'anno Y»? Le tre risposte possibili, misurate:

| Opzione | Verdetto |
|---|---|
| **(A) La descrizione** `Quota associativa <anno>`, hoistata in `membershipFeeDescription(year)` accanto a `MEMBERSHIP_FEE_TYPE_NAME` (`src/lib/expiry-scope.ts`) e usata **sia** dal writer **sia** dalla guardia | **SCELTA.** Funziona **retroattivamente** sulle 6 425 righe già in DB; una sorgente unica rende impossibile che il writer e la guardia divergano; un unit pinna il round-trip |
| **(B) Una colonna nuova** (`membershipFeeYear Int?`) + `@@unique([accountId, membershipFeeYear])` | **SCARTATA per due ragioni indipendenti.** (i) L'unicità DB **non può esprimere l'esenzione dello storno** che R-16-g richiede («a meno che il primo sia stato stornato»): un indice unico vieterebbe anche il secondo addebito **legittimo**. (ii) La colonna sarebbe `NULL` su ogni riga storica ⇒ il backfill andrebbe fatto **dalla descrizione**, che resta quindi la verità di base: si pagherebbe una migrazione per non cambiare la fonte |
| **(C) Derivare dall'`Expiry`** della quota (`updatedAt`, o `expiresAt` meno 12 mesi) | **SCARTATA**: `expiresAt` è **rotativo** (`:154`), quindi dopo un rollover non dice più in che anno si è pagato; `updatedAt` cambia a **ogni** modifica dell'admin. Sarebbe una guardia che sbaglia in silenzio |

```ts
// src/lib/expiry-scope.ts, subito sotto MEMBERSHIP_FEE_TYPE_NAME
/**
 * Descrizione dell'`AccountMovement` che addebita la quota — SORGENTE UNICA
 * (story 16.6b, R-16-g), letta dal writer (`membership.service.ts`) E dalla
 * guardia «una quota per anno civile». Vive accanto a
 * {@link MEMBERSHIP_FEE_TYPE_NAME} per la stessa ragione: l'app identifica la
 * quota PER NOME, e i due nomi devono cambiare insieme o non cambiare.
 * NON localizzata, deliberatamente: e' un marcatore di dominio scritto dal
 * server, non un testo di UI (l'estratto conto lo mostra cosi' com'e' da
 * sempre, in entrambi i locale).
 */
export function membershipFeeDescription(year: number): string {
  return `${MEMBERSHIP_FEE_TYPE_NAME} ${year}`;
}
```
`membership.service.ts:134` diventa `description: membershipFeeDescription(paymentYear)`. **La stringa prodotta è byte-identica** a quella di oggi (`Quota associativa 2027`): lo provano gli unit esistenti (`membership.service.test.ts:147`, `:324`) che **non vanno cambiati** — e il fatto che restino verdi **è** l'asserzione (AC 5).

**Il falso positivo è desiderabile, e va dichiarato.** Un operatore che registra a mano una rettifica con `reason` = «Quota associativa 2026» e importo negativo fa scattare la guardia. Non è un difetto: è **lo stesso evento economico**, registrato per un'altra strada. Rifiutare il secondo addebito è precisamente ciò che R-16-g chiede. Da scrivere nel doc-comment della guardia, così che il prossimo lettore non lo «corregga».

**AD-3 — La guardia per anno: DENTRO la transazione, DOPO il lock, PRIMA del controllo di saldo.**

```ts
// membership.service.ts, dentro la $transaction, dopo il FOR UPDATE di :103
// e PRIMA dell'aggregate del saldo di :105
const alreadyCharged = await tx.accountMovement.findFirst({
  where: {
    accountId: account.id,
    type: 'ADJUSTMENT',
    description: membershipFeeDescription(paymentYear),
    // R-16-g: «la guardia ignora gli addebiti che hanno uno storno» — nel
    // ledger append-only «cancellare» = una riga collegata via reversalOfId
    // (@unique: al massimo una). Un addebito stornato NON e' un addebito.
    reversal: { is: null },
  },
  orderBy: { createdAt: 'asc' },
  select: { id: true, effectiveDate: true },
});
if (alreadyCharged) {
  throw new ConflictError(
    `A membership fee for ${paymentYear} was already charged on this account.`,
    { year: paymentYear, movementId: alreadyCharged.id, chargedAt: toDateOnlyString(alreadyCharged.effectiveDate) },
    'MEMBERSHIP_FEE_ALREADY_CHARGED',
  );
}
```

| Scelta | Perché |
|---|---|
| **Dentro** la `$transaction`, **dopo** `FOR UPDATE` | due addebiti concorrenti sullo stesso conto sono già serializzati da quel lock: la lettura vede l'esito del vincitore. Fuori dalla transazione sarebbe la finestra TOCTOU che le prenotazioni hanno chiuso mettendo i loro predicati **dentro** (`bookings.service.ts:567`, `:941`, `:1166`). **Zero lock nuovi** |
| **Prima** del controllo di saldo (`:110`) | l'addebito è già stato fatto: se il saldo lo consentirebbe o no è **irrilevante**. Rispondere «saldo insufficiente» a chi ha già pagato sarebbe un messaggio falso |
| `orderBy: { createdAt: 'asc' }` | fra più righe (i doppioni **già in DB**) il 409 deve nominare **il primo**, deterministicamente, o un'asserzione e2e diventa flaky per costruzione |
| `chargedAt` = `effectiveDate`, non `createdAt` | è **la data dell'addebito** in senso contabile, ed è quella che l'operatore vede nell'estratto conto. `toDateOnlyString` (già importato, `:1`) la porta come `YYYY-MM-DD`, la forma di ogni data sul filo |
| `reversal: { is: null }` | forma esplicita; il tipo generato la ammette (`AccountMovement.ts:279`: `reversal?: XOR<NullableScalarRelationFilter, WhereInput> \| null`) |
| Codice **`MEMBERSHIP_FEE_ALREADY_CHARGED`** | famiglia già esistente su questa rotta (`MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`); verificato nuovo: `grep -rn "ALREADY_CHARGED" src/` → 0 |

**Anno = anno civile della data di pagamento** (`paymentYear`, `:93`, già calcolato in Roma dalla 16.1). Due addebiti a cavallo di capodanno (31/12 e 1/1) sono **due anni diversi** ⇒ ammessi. È «una per anno civile», la lettera di R-16-g.

⚠️ **Interazione portante con Q4 (AD-5)**: la restrizione di `recordAdjustment` **NON deve** vietare la rettifica di un `ADJUSTMENT`. Se lo facesse, l'esenzione di R-16-g (Q3) diventerebbe **irraggiungibile**: non ci sarebbe più modo di stornare una quota. `ADJUSTMENT` resta rettificabile — lo dichiara già `accounts.service.ts:572-573` (*«an `ADJUSTMENT` row can itself be `originalMovementId` for a later one»*) — e l'e2e di §4.2 lo prova end-to-end.

**AD-4 — MINOR-3: il tipo della RADICE si memorizza sulla riga alla scrittura. È la seconda opzione dell'audit, ed è l'unica esprimibile in un `where` Prisma.**

L'audit prescrive: *«risolvere l'antenato per ricorsione (o memorizzare il tipo radice sulla riga) invece di srotolare N livelli»*. La ricorsione **non è esprimibile** in `ACCOUNT_REVENUE_OR`, che è un `Prisma.AccountMovementWhereInput[]` letto da due call-site; passarla a raw SQL romperebbe l'invariante che quei due call-site e il classificatore di riga condividano **una** definizione («review Billing-1 F6's lesson, closed at the root», doc-comment `:99-102`). Resta la memorizzazione.

**Schema** — `prisma/schema.prisma`, nel `model AccountMovement` accanto a `reversalOfId` (`:659`):
```prisma
/// Tipo della RADICE della catena di storni che parte da questa riga (story
/// 16.6b, ledger MINOR-3) — `NULL` se e solo se `reversalOfId` e' `NULL`.
/// Denormalizzato ALLA SCRITTURA perche' il ledger e' append-only e
/// `reversalOfId` e' `@unique`: la catena e' lineare e immutabile, quindi la
/// radice non puo' cambiare dopo l'insert. Esiste perche' un `where` Prisma
/// non puo' risalire una relazione a profondita' arbitraria: srotolare N
/// livelli sposta il buco a N+1 (l'audit ha misurato il ricavo fantasma a
/// profondita' 3, con la difesa a due livelli della review Billing-2 F3).
/// Ogni writer che imposta `reversalOfId` DEVE impostare anche questo campo.
reversalRootType AccountMovementType?
```
**Migrazione** `prisma/migrations/2026091.....\_account_movement_reversal_root_type/migration.sql`:
```sql
ALTER TABLE "AccountMovement" ADD COLUMN "reversalRootType" "AccountMovementType";

-- Backfill: la radice di ogni catena esistente (1 200 righe sul DB di carico,
-- profondita' massima misurata 2 — il backfill regge qualunque profondita').
WITH RECURSIVE chain AS (
  SELECT id AS leaf, "reversalOfId" AS parent FROM "AccountMovement" WHERE "reversalOfId" IS NOT NULL
  UNION ALL
  SELECT c.leaf, p."reversalOfId" FROM chain c JOIN "AccountMovement" p ON p.id = c.parent WHERE p."reversalOfId" IS NOT NULL
),
root AS (
  SELECT c.leaf, (SELECT r.type FROM "AccountMovement" r WHERE r.id = c.parent) AS root_type
  FROM chain c
  WHERE NOT EXISTS (SELECT 1 FROM "AccountMovement" p WHERE p.id = c.parent AND p."reversalOfId" IS NOT NULL)
)
UPDATE "AccountMovement" m SET "reversalRootType" = root.root_type FROM root WHERE m.id = root.leaf;

-- L'invariante, applicata dal DB: un writer che dimentica il campo fallisce
-- forte, invece di produrre in silenzio una riga non classificabile.
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_reversalRootType_consistent"
  CHECK (("reversalOfId" IS NULL) = ("reversalRootType" IS NULL));
```
⚠️ Il `CHECK` è una risorsa **non gestita** da Prisma (invisibile all'introspezione, quindi `migrate diff` non lo rimuove). Se `npm run gates` o `prisma validate` protestano, **si toglie il CHECK e si tengono gli unit di §4.1 come asserzione** — dichiarando la scelta. Il CHECK è la cintura, gli unit sono le bretelle; le bretelle non sono negoziabili.

**I tre writer che impostano `reversalOfId`** (censimento: `grep -rn "reversalOfId:" src/server/services/*.ts | grep -v test` → 3 occorrenze) e cosa scrivono:

| Writer | `reversalOfId` | `reversalRootType` da scrivere |
|---|---|---|
| `accounts.service.ts:656` `recordAdjustment` | `originalMovementId` | `original.reversalOfId === null ? original.type : original.reversalRootType` — la `select` di `:614` prende **due campi in più** (`reversalOfId`, `reversalRootType`) |
| `flights.service.ts:1331` (storno da `cancelFlight`) | l'addebito del volo | `'FLIGHT_CHARGE'` — l'originale è per costruzione un `FLIGHT_CHARGE` (`loadRegisteredFlightForReversal`) |
| `flights.service.ts:1470` (storno da `correctFlight`) | idem | `'FLIGHT_CHARGE'` |

**I due predicati diventano più semplici** (il fix **rimuove** codice, che è il segno che è quello giusto):
```ts
// transactions.service.ts:130-140
export const ACCOUNT_REVENUE_OR: Prisma.AccountMovementWhereInput[] = [
  { type: 'FLIGHT_CHARGE' },
  { type: 'FLIGHT_CHARGE_REVERSAL' },
  { type: 'ADJUSTMENT', amountCents: { lt: 0 }, NOT: { reversalRootType: 'TOP_UP' } },
  { type: 'ADJUSTMENT', amountCents: { gt: 0 }, reversalOfId: { not: null }, NOT: { reversalRootType: 'TOP_UP' } },
];

// transactions.service.ts:180-191
if (row.amountCents < 0) return row.reversalRootType === 'TOP_UP' ? 'DEPOSIT' : 'REVENUE';
if (row.reversalOfId !== null) return row.reversalRootType === 'TOP_UP' ? 'DEPOSIT' : 'REVENUE';
return 'TRANSFER';
```
e `ACCOUNT_ROW_SELECT` (`:58-72`) sostituisce il join annidato `reversalOf: { select: { type: true, reversalOf: { select: { type: true } } } }` (`:68`) con `reversalRootType: true` — **un join in meno per riga** su ogni pagina del registro (guadagno collaterale, rilevante per l'epic 17).

**Perché questo NON cambia semantica sui casi coperti oggi** (dimostrazione, da riportare nel doc-comment):
> In una catena di storni **veri** i segni si alternano — lo storno di un `TOP_UP` (credito) è negativo, lo storno di **quello** è positivo, e così via. Quindi «negativo con genitore `TOP_UP`» **è** «negativo con radice `TOP_UP` a profondità 1», e «positivo con nonno `TOP_UP`» **è** «positivo con radice `TOP_UP` a profondità 2». I due livelli di oggi sono le prime due istanze di **una** regola, non due regole: il predicato sulla radice le contiene entrambe e continua alla profondità 3, 4, N. L'alternanza **non è garantita** (una rettifica ha importo libero: un operatore può registrare un negativo contro un negativo), ed è appunto il caso che il predicato sulla radice classifica correttamente e quello a due livelli no.

⚠️ **La `NOT` sui `null`.** `NOT: { reversalRootType: 'TOP_UP' }` include le righe con `reversalRootType IS NULL` (SQL: `NOT (col = 'TOP_UP')` su un `NULL` è `NULL`, che Prisma traduce con un `OR col IS NULL` — **verificare**, non assumere). Per la clausola 3 (`amountCents < 0`, senza vincolo su `reversalOfId`) le righe `NULL` sono le rettifiche **standalone a debito**, che **devono** stare in REVENUE ⇒ l'inclusione è **corretta e portante**. Un unit dedicato la pinna (§4.1), perché se Prisma generasse un semplice `<> 'TOP_UP'` quelle righe **spariscono dai ricavi** — un difetto silenzioso peggiore di quello che stiamo chiudendo. **È la trappola numero uno di questa story.**

**AD-5 — MINOR-2: il 422 nel service, e le DUE facce dell'UI allineate al ledger unificato.**

Server (`accounts.service.ts`, accanto alla guardia `PACKAGE_PURCHASE` di `:619-625`):
```ts
if (original.type === 'FLIGHT_CHARGE' || original.type === 'FLIGHT_CHARGE_REVERSAL') {
  // Story 16.6b (ledger MINOR-2): lo slot `reversalOfId` di un addebito volo
  // e' UNICO e appartiene a `cancelFlight`/`correctFlight`. Consumarlo a mano
  // rende il volo inannullabile per sempre (`flights.service.ts:1250-1258`,
  // che lo dichiara) e lascia `charge + storno != 0`. La correzione di un volo
  // passa dal registro voli, non dall'estratto conto.
  throw new ValidationError(
    'A flight charge is corrected by cancelling or correcting the flight, not by a manual adjustment.',
    undefined,
    'ADJUSTMENT_ORIGINAL_NOT_ADJUSTABLE',
  );
}
```
**422, non 409**: è un vincolo sull'**input** (`originalMovementId` punta a un tipo inammissibile), non sullo **stato** della risorsa — la stessa distinzione che tiene `PACKAGE_PURCHASE` a 409 (*«è un marcatore a importo zero: non c'è niente da correggere»* = stato) e `SCOPE_MISMATCH` a 422. ⚠️ **`PACKAGE_PURCHASE` resta un 409 col suo messaggio**: non si «uniforma», non si tocca (karpathy §3).

UI, `people/[id]/account-section.tsx:244-247` — allineata al ledger unificato, che ha già la regola giusta per lo stesso gesto (`transactions.service.ts:289`):
```tsx
/** Story 3.3 + story 16.6b (ledger MINOR-2): l'azione c'e' solo su un movimento MANUALE non ancora rettificato — stessa regola di `transactions.service.ts#toAccountRow`'s `actionable`. Un tipo DERIVATO (`FLIGHT_CHARGE`, `FLIGHT_CHARGE_REVERSAL`, `PACKAGE_PURCHASE`) si corregge alla sorgente, non qui. */
function rowIsAdjustable(row: AccountMovementRow): boolean {
  return !row.hasReversal && (row.type === 'TOP_UP' || row.type === 'ADJUSTMENT');
}
```
Il predicato è usato in **due** punti — la riga desktop (`:415`) e la bottom-sheet mobile (`:558`) — e una funzione sola li copre entrambi: **nessun cambio ai due call-site**. `transactions.service.ts:289` **non si tocca**: era già giusto, ed è il modello.

**Nessun avviso, nessuna conferma in più.** L'audit propone come rimedio minimo *«nascondere l'azione di riga sui tipi derivati»*: il gesto sparisce, quindi non c'è niente di cui avvertire. Un dialogo di conferma per un'azione che non esiste più sarebbe codice speculativo.

**AD-6 — `handler.ts:60`: una riga, condivisa con 16.2 e 16.3, con il suo unit.**
```ts
const details = error instanceof ValidationError || error instanceof ConflictError ? error.details : undefined;
```
`ConflictError` è **già importato** (`handler.ts:7`). Lo unit di `handler.test.ts` (la tabella di `:239`, `:492`) prende **un caso**: un `ConflictError` con `details` → il body porta `error.details`; senza `details` → la chiave è **omessa** (`errorEnvelope` di `:25` lo fa già: `details === undefined ? {error:{code,message}} : ...`) ⇒ **nessuna** risposta esistente cambia di un byte. Questa invarianza è essa stessa un AC (AC 11).
**Se una delle altre due story ha già fatto la modifica**: verificarla, eseguire il suo unit, e **non** ripeterla.

**AD-7 — OpenAPI/registry nello stesso commit.**

| Rotta | Modifica |
|---|---|
| `POST /api/v1/people/{id}/membership-fee` (`registry.ts:2008-2018`) | description: la regola «una per anno civile», il **409 `MEMBERSHIP_FEE_ALREADY_CHARGED`** con `details { year, movementId, chargedAt }`, e l'**esenzione dello storno**; `errorResponses(401, 403, 404, **409**, 422)` |
| `POST /api/v1/people/{id}/account/adjustments` (`registry.ts:659-670`) | description: il **422 `ADJUSTMENT_ORIGINAL_NOT_ADJUSTABLE`** sui tipi derivati; `errorResponses` ha già il 422 |
| `POST /api/v1/transactions` (`registry.ts:923-930`) | il branch `ADJUSTMENT` delega a `recordAdjustment`… ma il suo schema **non ha** `originalMovementId` (`schemas/transactions.ts:189-194`) ⇒ **non può** raggiungere la guardia nuova: **verificarlo e dichiararlo**, non aggiungere nulla |

**AD-8 — Nessun cambio al lifecycle dell'idempotenza server-side.** `IdempotencyRecord`, il fingerprint, `IDEMPOTENCY_KEY_REQUIRED`, `Idempotency-Replayed`: **invariati**. L'audit ha verificato il meccanismo **corretto** (§5.2); il difetto era **nel chiamante**. Una riga di quel percorso che cambia è un difetto della story.

**AD-9 — Ortogonalità con le altre story in volo.**

| Story | Confine |
|---|---|
| **16.6a** (l'altra metà) | zero file di produzione in comune. Tocca `accounts.service.ts` e `cash.service.ts` (guardia data valuta) e `exports.service.ts`; questa tocca `accounts.service.ts` (guardia sull'originale, ~40 righe più sotto), `membership.service.ts`, `transactions.service.ts`, `flights.service.ts`, `handler.ts`. **Se entrambe sono in volo, `accounts.service.ts` va coordinato con la sessione principale**: le due modifiche sono in funzioni diverse (`recordTopUp` a `:197`, `recordAdjustment` a `:591`) ma nello stesso file |
| **16.2** / **16.3** | `handler.ts:60` (AD-6). La 16.2 tocca anche `flights.service.ts`: questa story ci scrive **due campi** negli storni (`:1331`, `:1470`) — coordinare |
| **16.5** (payout istruttori, R-16-d) | aggiunge una colonna a `Flight`. Se le due migrazioni corrono insieme, **la seconda che atterra rigenera il client Prisma**: `npx prisma generate` e rileggere `src/generated/` prima del typecheck |
| **17.4** (ledger mensile in SQL) | riscriverà `computeRevenueCents` in SQL. `reversalRootType` **le semplifica la vita** (un campo scalare invece di due join): da segnalare nel Dev Agent Record |

---

## §2 — Acceptance Criteria

### La chiave di idempotenza (MAJOR-6 / Q1)

1. **Given** il pannello «Addebita quota» **When** il `fetch` **lancia** (guasto di rete) **Then** la chiave **non** si rigenera, un messaggio d'errore compare, e `submitting` torna a `false` (il bottone si riabilita) — i tre difetti di `:811-816` chiusi insieme.
2. **Given** lo stesso pannello **When** una risposta HTTP **arriva** (200, 409 o 422) **Then** la chiave si rigenera **dopo** di essa: un secondo tentativo corretto non collide con il record della chiave vecchia (contratto TD-2, AC 6, invariato).
3. **Given** il ritentativo dopo un guasto di rete **Then** il server **replaya** (`Idempotency-Replayed: true`) e l'estratto conto porta **una** sola riga di quota — non due.

### Una quota per anno civile (R-16-g / DQ-1 / Q2-Q3)

4. **Given** un conto con un addebito di quota per l'anno Y **non stornato** **When** ne arriva un secondo per lo stesso anno **Then** **409 `MEMBERSHIP_FEE_ALREADY_CHARGED`** con `details.chargedAt` = la `effectiveDate` **del primo**, `details.movementId` e `details.year`; **nessuna** riga scritta e **nessun** rinnovo di scadenza (la transazione non commit­ta).
5. **Given** la stessa riga di addebito **Then** la descrizione prodotta è **byte-identica** a quella di oggi (`Quota associativa <anno>`): gli unit esistenti (`membership.service.test.ts:147`, `:324`) restano verdi **senza essere modificati**.
6. **Given** un addebito di quota **stornato** (un `ADJUSTMENT` di segno opposto collegato via `reversalOfId`) **When** arriva un nuovo addebito nello stesso anno **Then** **passa** (200), l'addebito è scritto e la scadenza rinnovata: «un addebito stornato non è un addebito» (R-16-g, esenzione).
7. **Given** due addebiti **concorrenti** sullo stesso conto e anno **Then** esattamente **uno** riesce e l'altro prende 409: la guardia è **dentro** la transazione, **sotto** il `FOR UPDATE` già presente — e **nessun lock nuovo** compare nel diff.
8. **Given** il 31/12 e il 1/1 **Then** sono **due anni civili** ⇒ due addebiti ammessi (unit con orologio fittizio, sullo stesso modello di `membership.service.test.ts:314`).
9. **Given** un conto che porta **già** due addebiti dello stesso anno (lo stato che l'audit ha trovato in DB) **Then** il prossimo addebito di quell'anno prende 409 nominando il **primo** (`orderBy createdAt asc`), e le righe esistenti **non** vengono toccate ([L-1]).

### La rettifica che non consuma lo storno del volo (MINOR-2 / Q4)

10. **Given** `POST /account/adjustments` con `originalMovementId` di un **`FLIGHT_CHARGE`** (o di un `FLIGHT_CHARGE_REVERSAL`) **Then** **422 `ADJUSTMENT_ORIGINAL_NOT_ADJUSTABLE`**, nessuna riga scritta, e il volo **resta annullabile** (un `cancelFlight` successivo riesce). Con originale `TOP_UP` o `ADJUSTMENT` → invariato (200). Con `PACKAGE_PURCHASE` → **409 col messaggio di oggi**, invariato.
11. **Given** l'estratto conto di una persona con righe di ogni tipo **Then** «Rettifica questo movimento» compare **solo** su `TOP_UP` e `ADJUSTMENT` non ancora rettificati, sulla **riga desktop** e nella **bottom-sheet mobile** (un predicato, due facce); il registro unificato (`/dashboard/billing`) è **invariato** — era già giusto.

### Le catene di storno a qualunque profondità (MINOR-3 / Q5)

12. **Given** una catena `TOP_UP ← A1 ← A2 ← A3` **Then** A3 è classificata **`DEPOSIT`** (non `REVENUE`: era il ricavo fantasma di +50,00 € misurato dall'audit), e lo stesso vale a profondità 4 e 5 — **la profondità non compare** nel codice.
13. **Given** i casi che oggi funzionano (profondità 1 e 2, `FLIGHT_CHARGE` in entrambi i versi, rettifica standalone a debito/credito, `PACKAGE_PURCHASE` a importo zero, storno a importo zero) **Then** la classificazione è **identica** a prima: gli unit esistenti di `transactions.service.test.ts` (`:293`, `:440`, e la famiglia F3/F9) restano verdi.
14. **Given** una rettifica **standalone a debito** (`reversalOfId` e `reversalRootType` a `NULL`) **Then** è **REVENUE** nell'aggregato: la `NOT: { reversalRootType: 'TOP_UP' }` **include** i `NULL`. Un unit lo pinna **contro il SQL generato**, non contro l'intenzione (AD-4, trappola 1).
15. **Given** i **tre** writer di `reversalOfId` **Then** ognuno imposta `reversalRootType` (unit per writer), e `reversalRootType IS NULL ⟺ reversalOfId IS NULL` (CHECK in migrazione, o unit se il CHECK va rimosso).
16. **Given** il DB dopo la migrazione **Then** le righe esistenti con `reversalOfId` hanno il tipo radice corretto (backfill via CTE ricorsiva: 1 200 righe sul DB di carico, profondità massima 2) e la classificazione **prima/dopo** è invariata su di esse (misura riportata nel Dev Agent Record).

### Plumbing, non-regressione, prove

17. **Given** un `ConflictError` con `details` **Then** il body 409 li porta; **senza** `details` la chiave è **omessa** e ogni risposta 409 esistente è **byte-identica** (unit in `handler.test.ts`).
18. **Given** `e2e/membership-fee.spec.ts:107` **Then** è **riscritto** alla regola nuova: secondo addebito stesso anno → **409** con la data del primo; poi **storno** dell'addebito → un nuovo addebito **passa** e la scadenza **rotola avanti** dal suo `expiresAt` (il rinnovo rotativo di `:154` resta provato, per la strada che R-16-g rende disponibile).
19. **Given** la suite completa **Then** `CI=1` su DB fresco: **0 failed**; esiti verbatim nel Dev Agent Record.
20. **Given** il pre-fix simulato **Then** le **cinque** discriminanze della tabella §4.3 sono **ROSSE** con l'output citato, verdi col fix, `sha256sum` dei file ripristinati verificato.

---

## §3 — Dev Notes: blast radius (misurato su `9272129`)

### 3.1 File da modificare

| File | Cosa | Righe misurate |
|---|---|---|
| `prisma/schema.prisma` | `reversalRootType` nel `model AccountMovement` | accanto a `:659` |
| `prisma/migrations/<ts>_account_movement_reversal_root_type/migration.sql` | **NUOVA** — colonna + backfill CTE + CHECK (AD-4) | — |
| `src/lib/expiry-scope.ts` | `membershipFeeDescription(year)` sotto `:29` | `:20-29` |
| `src/server/services/membership.service.ts` | import, guardia per anno dentro la transazione, `description:` dalla funzione | `:1-9`, `:92-93`, `:103-105`, `:134` |
| `src/server/services/accounts.service.ts` | guardia sui tipi derivati; `select` di `:614` con 2 campi in più; `reversalRootType` nella `create` di `:648-657` | `:591`, `:614`, `:619-628`, `:648-657` |
| `src/server/services/flights.service.ts` | `reversalRootType: 'FLIGHT_CHARGE'` nei due storni | `:1331`, `:1470` |
| `src/server/services/transactions.service.ts` | `ACCOUNT_ROW_SELECT` (`:68`), `ACCOUNT_REVENUE_OR` (`:130-140`), `accountBookType` (`:180-191`) + i doc-comment che spiegano i due livelli (`:112-124`, `:167-178`) | `:58-72`, `:99-145`, `:156-192` |
| `src/lib/api/handler.ts` | **1 riga** (`:60`) — **condivisa con 16.2/16.3**, v. AD-6 | `:60` |
| `src/lib/schemas/registry.ts` | 2 description + `409` sulla rotta quota; verifica sul branch `ADJUSTMENT` di `/transactions` | `:659-670`, `:923-930`, `:2008-2018` |
| `src/app/[locale]/dashboard/expiries/scadenze-console.tsx` | hook, `try/catch`, `setSubmitting`, ramo 409 nuovo; label nel tipo (`:89-105`) | `:89-105`, `:797`, `:806-830`, `:907` |
| `src/app/[locale]/dashboard/expiries/page.tsx` | passaggio della label nuova | `:192-205` |
| `src/app/[locale]/dashboard/people/[id]/account-section.tsx` | `rowIsAdjustable` (`:244-247`) — **un** predicato, due call-site invariati | `:244-247`, `:415`, `:558` |
| `messages/it.json`, `messages/en.json` | 1 chiave (`ExpiriesPage.registry.membershipFee.alreadyCharged`) + eventuale frase per il 422 della rettifica, **simmetriche** | — |
| `e2e/membership-fee.spec.ts` | riscrittura di `:107-135` + il caso storno | `:107-135` |
| `e2e/account-adjustments.spec.ts` | il caso «rettifica su un addebito volo → 422» | `:149`, `:174` |

### 3.2 Test da modificare

| File | Perché |
|---|---|
| `src/server/services/membership.service.test.ts` | il mock di `prisma.accountMovement` non ha `findFirst`: va aggiunto, o la guardia nuova esplode in **ogni** test del file. `:147` e `:324` (descrizione) **non** si toccano: la loro invarianza è l'AC 5 |
| `src/server/services/accounts.service.test.ts` | le fixture dell'originale a `:725`, `:789`, `:812` e `:843` **omettono `type`** (l'audit lo nota): con la guardia nuova un `undefined` non è né `FLIGHT_CHARGE` né `PACKAGE_PURCHASE` ⇒ passano. Vanno rese **esplicite** (`type: 'TOP_UP'`) perché il test dica quello che intende |
| `src/server/services/transactions.service.test.ts` | ogni fixture di riga conto prende `reversalRootType`; le asserzioni F3/F9 esistenti **restano verdi** (AC 13) |
| `src/server/services/flights.service.test.ts` | le asserzioni sulle `create` degli storni prendono il campo nuovo |
| `src/lib/api/handler.test.ts` | il caso `ConflictError` **con** `details` (AC 17) |
| `src/lib/schemas/registry.test.ts` | se asserisce sulle description/`errorResponses`, riallineare |

### 3.3 Censimento `reversalOfId` (per AD-4)

`grep -rn "reversalOfId:" src/server/services/*.ts | grep -v test` → **3** scritture: `accounts.service.ts:656`, `flights.service.ts:1331`, `flights.service.ts:1470`. Nessun'altra. `cash.service.ts:418` scrive il `reversalOfId` di un **`CashMovement`**, che è un modello diverso e **fuori scope** (MINOR-3 riguarda il classificatore del ledger **conto**; il lato cassa non ha catene: `reverseCashMovement` rifiuta di stornare uno storno, `:403-404`).

### 3.4 UI: cosa fanno oggi le due superfici (misurato)

| Superficie | Oggi |
|---|---|
| Pannello quota | `scadenze-console.tsx:790-930`. `submit()` a `:806`: `setSubmitting(true)` (`:810`), `fetch` **senza** `try/catch` (`:811`), `setSubmitting(false)` (`:816`), ramo `!ok` con **un solo** codice riconosciuto (`MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`, `:822`) e `genericError` altrimenti (`:828`). Bottone disabilitato su `submitting` (`:907`). Testid page-level letti dall'e2e: `membership-fee-panel`, `membership-fee-submit`, `membership-fee-error`, `membership-fee-success`, `membership-fee-override-checkbox` — **nessuno va rinominato** |
| Azione di riga dell'estratto conto | `account-section.tsx:244-247` `rowIsAdjustable`, usata a `:415` (riga desktop) e `:558` (bottom-sheet). Il pannello di rettifica vive nello stesso file (`:590-810`) |

**Il messaggio del 409**: `ExpiriesPage.registry.membershipFee.alreadyCharged`, it «Quota {year} già addebitata su questo conto il {date}. Per addebitarla di nuovo, storna prima l'addebito esistente.» / en «The {year} membership fee was already charged to this account on {date}. To charge it again, reverse the existing charge first.» — interpolato dai `details` come fa già `insufficientBalance` (`:822-829`). La seconda frase è **necessaria**: senza di essa il 409 dice «no» e non dice **come**, e la via d'uscita (lo storno) è precisamente ciò che R-16-g ha ratificato.

### 3.5 e2e: il censimento delle spec che addebitano la quota

| Spec | Addebiti per pilota | Effetto della guardia |
|---|---|---|
| `membership-fee.spec.ts:65` | 1 (pilota fresco) | nessuno |
| `membership-fee.spec.ts:107` | **2, stesso anno** | **rosso** → **riscrittura** (AC 18) |
| `membership-fee.spec.ts:137` | 1 + replay con la **stessa** chiave | nessuno (il replay non riesegue) |
| `membership-fee.spec.ts:166`, `:182`, `:211`, `:237` | 0 o 1 riuscito (il 422 di saldo non scrive) | nessuno |
| `mobile-membership-fee.spec.ts:77`, `:157` | 1 riuscito per pilota fresco | nessuno |

⚠️ **`membership-fee.spec.ts` NON è nella catena serializzata di `playwright.config.ts`** (misurato: solo `mobile-membership-fee.spec.ts` lo è) e scrive `PUT /api/v1/settings/membership-fee`, che è **stato globale**. Il file si protegge con `mode: 'serial'` **al proprio interno**, che non lo protegge dagli **altri** worker. ⇒ **il test nuovo passa `amountCents` esplicito nel body e NON tocca `/settings/membership-fee`** (lo schema lo permette: `chargeMembershipFeeSchema.amountCents` è obbligatorio e l'UI lo precompila solo per comodità). Così la story **non aggiunge** impronta allo stato globale. La lacuna preesistente va **segnalata** come TD, non chiusa qui.

### 3.6 Misure sul DB di carico (`airmanager_load`, oggi, read-only)

```
AccountMovement con description LIKE 'Quota associativa %' : 6 425
  ... con uno storno collegato                             :     0
  ... coppie (conto, anno) con 2+ addebiti                  :     0   (max per conto/anno: 1)
AccountMovement con reversalOfId NOT NULL                  : 1 200   (profondita' massima catena: 2)
ADJUSTMENT il cui originale e' FLIGHT_CHARGE               :     0
ADJUSTMENT il cui originale e' ADJUSTMENT                  :     0
```
⇒ (a) il backfill di AD-4 tocca **1 200** righe e nessuna oltre la profondità 2 ⇒ la classificazione **non cambia** su questi dati (verifica prima/dopo obbligatoria, AC 16); (b) MINOR-2 e MINOR-3 sono guardie **in avanti**: **nessun** dato esistente le esercita, e va **dichiarato**; (c) il **doppio addebito** che l'audit ha misurato è nel DB **di lavoro**, non in quello di carico — dopo un reset del DB e2e non c'è più, quindi la discriminanza va **costruita** dal test (AC 9), non trovata.

---

## §4 — Piano di test

### 4.1 Unit

| File | Test |
|---|---|
`src/lib/expiry-scope.test.ts` (o l'esistente) | `membershipFeeDescription(2027) === 'Quota associativa 2027'` — il round-trip che pinna la stringa condivisa |
`membership.service.test.ts` | secondo addebito stesso anno → `ConflictError` con `code`/`details.chargedAt`/`details.movementId`; con lo **storno** collegato → **passa**; la `findFirst` è chiamata **dentro** la transazione **dopo** la `$queryRaw` del lock (asserzione sull'**ordine** delle chiamate, `mock.invocationCallOrder`) e **prima** dell'`aggregate` del saldo; **31/12 vs 1/1** con `vi.setSystemTime` (modello di `:314`); `accountMovement.create` **mai** chiamata sul percorso 409 |
`accounts.service.test.ts` | originale `FLIGHT_CHARGE` → 422 col codice, `create` non chiamata; `FLIGHT_CHARGE_REVERSAL` → 422; `TOP_UP`/`ADJUSTMENT` → 200; `PACKAGE_PURCHASE` → **409 invariato**; la `create` scrive `reversalRootType` = il tipo dell'originale quando questo è una radice, e il suo `reversalRootType` quando è già un anello |
`transactions.service.test.ts` | **profondità 3, 4 e 5** con radice `TOP_UP` → `DEPOSIT` in **entrambi** i versi di segno; radice `FLIGHT_CHARGE` a qualunque profondità → `REVENUE`; **rettifica standalone a debito (`reversalRootType: null`) → `REVENUE`** (AC 14); tutta la famiglia F3/F9 esistente **verde senza modifiche di asserzione** |
`flights.service.test.ts` | i due storni scrivono `reversalRootType: 'FLIGHT_CHARGE'` |
`handler.test.ts` | `ConflictError` con `details` → body con `details`; senza → chiave **omessa** |

⚠️ **Verifica del SQL generato per AC 14**, non solo del comportamento del mock: eseguire una `prisma.accountMovement.findMany({ where: { OR: ACCOUNT_REVENUE_OR } })` contro il DB reale (o `prisma.$queryRaw` con l'`EXPLAIN`) e controllare che una rettifica standalone a debito **ci sia**. Un unit su mock **non** può provarlo: il mock non traduce la `NOT` in SQL.

### 4.2 e2e

| Spec | Blocco |
|---|---|
`e2e/membership-fee.spec.ts` | **riscrittura di `:107`**: pilota fresco con saldo capiente → addebito 1 = 200 → addebito 2 stesso anno = **409** con `error.code` e `error.details.chargedAt` = la data del primo → **storno** dell'addebito via `POST /account/adjustments` con `originalMovementId` = l'id del movimento quota (letto da `GET /account/movements`) e importo **positivo** → addebito 3 = **200**, `expiresAt` **maggiore** del primo (rinnovo rotativo provato per la via nuova). **Senza** toccare `/settings/membership-fee` (§3.5) |
`e2e/account-adjustments.spec.ts` | volo registrato → il suo `FLIGHT_CHARGE` letto dall'estratto conto → rettifica con quell'`originalMovementId` = **422** `ADJUSTMENT_ORIGINAL_NOT_ADJUSTABLE` → `POST /flights/{id}/cancel` **riesce** (il volo è ancora annullabile: è il **danno** che MINOR-2 descrive, provato assente) |
`e2e/account-statement.spec.ts` (o `mobile-self-public.spec.ts`) | l'azione «Rettifica» **non** compare sulla riga di un `FLIGHT_CHARGE`, e **compare** su un `TOP_UP` — su **entrambe** le facce (desktop e sheet mobile) |
`e2e/mobile-membership-fee.spec.ts` | invariato; **verificare** che i suoi 2 test restino verdi (piloti freschi) |

⚠️ Nessuna spec nuova scrive `AppSettings` ⇒ **niente project serializzato nuovo**. Verifica prima di scegliere un testid: `grep -rn 'data-testid\^=' e2e/`. Il caso «guasto di rete» del client (AC 1) si prova con `page.route(..., route => route.abort())` sulla rotta della quota, **non** con un mock di `fetch`.

### 4.3 Tabella guardia → discriminanza (ognuna provata ROSSA sul pre-fix simulato, con ripristino `sha256`)

| Guardia | Discriminanza | Esito sul pre-fix |
|---|---|---|
| Una quota per anno (Q2) | `membership-year.probe.test.ts` → due addebiti stesso anno | **misurato oggi, 1 failed**: *«promise resolved "{ balanceCents: 1000000, …(3) }" instead of rejecting»*. Baseline: **due** righe `Quota associativa 2027` da −3000 e `expiresAt` **2029-03-10** per un pagamento del 2027-03-10 |
| Esenzione dello storno (Q3) | terzo addebito dopo lo storno → **200** | verde **anche** sul pre-fix (oggi passa tutto): la discriminanza vera è che sia verde **col fix**, cioè che la guardia non sia troppo larga. **Va scritta comunque**: è l'unico test che separa «guardia corretta» da «guardia che vieta sempre» |
| Chiave stabile nel client (Q1) | e2e con `route.abort()` sul primo tentativo, poi ritentativo | rosso: oggi la chiave cambia ⇒ **due** righe di quota, e `membership-fee-submit` resta disabilitato senza messaggio |
| 422 sull'originale volo (Q4) | unit `recordAdjustment` con `original.type = 'FLIGHT_CHARGE'` | rosso: oggi **scrive** (l'audit lo ha riprodotto: `reversalOfId` puntato al `FLIGHT_CHARGE`, `charge + storno = −5000 ≠ 0`) |
| Radice a qualunque profondità (Q5) | unit `accountBookType` su `TOP_UP ← A1 ← A2 ← A3` | rosso: oggi **`REVENUE`** (il ricavo fantasma di +50,00 € dell'audit, test D) |
| `details` del 409 (AC 17) | unit `handler.test.ts` con un `ConflictError` che porta `details` | rosso: `:60` li scarta |

**Metodo del pre-fix simulato**: `sha256sum` **prima**, si annulla il fix con una patch inversa, si esegue la discriminanza, si ripristina, si **riverifica il `sha256`**, si cita l'esito **verbatim** nel Dev Agent Record.

### 4.4 La discriminanza di partenza è già scritta ed ESEGUITA (pre-fix, oggi)

`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-6/membership-year.probe.test.ts` (+ `vitest.probe.config.mjs`, config usa-e-getta fuori dal glob di `vitest.config.ts` ⇒ **non** influenza `npm run gates`). Esecuzione di oggi, verbatim:
```
 × R-16-g probe — one membership fee per calendar year > the SECOND charge in the same calendar year is refused with a 409 (RED on the baseline)
 ✓ R-16-g probe — one membership fee per calendar year > BASELINE MEASURE: what actually happens today — two identical ADJUSTMENT rows and an expiry 24 months out
BASELINE rows: [{"type":"ADJUSTMENT","amountCents":-3000,"description":"Quota associativa 2027"},{"type":"ADJUSTMENT","amountCents":-3000,"description":"Quota associativa 2027"}]
BASELINE second expiresAt: 2029-03-10 (charged 2027-03-10)
```
⇒ **da promuovere** a test vero in `membership.service.test.ts`, adattando lo scaffolding di mock a quello del file (il probe usa il proprio, più permissivo).

### 4.5 Gate

`npm run gates` (**mai** i 4 comandi separati) → verde. Dopo la migrazione: `npx prisma migrate deploy` + `npx prisma generate` **prima** del typecheck, o il client non conosce il campo nuovo. Suite e2e: **solo** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **mai** `playwright test` in foreground; `export JOBS_SECRET=<non-placeholder>` prima di ogni suite `CI=1`. **Parità i18n**: confronto degli insiemi di chiavi `it.json`/`en.json` → **0/0**, citato nel Dev Agent Record.

---

## §5 — Trappole note

1. **La `NOT` sui `NULL` di `reversalRootType`** (AD-4, AC 14): se Prisma generasse `<> 'TOP_UP'` invece di includere i `NULL`, **ogni rettifica standalone a debito sparirebbe dai ricavi**. Un difetto silenzioso **peggiore** di quello che si sta chiudendo. Va verificato contro il **SQL**, non contro il mock.
2. **`membership.service.test.ts` esplode in ogni test** se il mock di `prisma.accountMovement` non elenca `findFirst`. Prima modifica, non ultima.
3. **`accounts.service.test.ts` ha fixture senza `type`** (`:725`, `:789`, `:812`, `:843`): passano la guardia nuova per omissione, non per intenzione. Renderle esplicite.
4. **La guardia sui tipi derivati NON deve vietare `ADJUSTMENT`**: altrimenti l'esenzione di R-16-g (Q3) diventa irraggiungibile e l'AC 6 non è più soddisfabile. Sono lo stesso codice visto da due story.
5. **`setSubmitting(false)` va anche nel ramo `catch`**, non solo dopo. Oggi il bottone resta disabilitato per sempre su un guasto di rete: se il fix sposta il `fetch` in un `try` e lascia il `setSubmitting(false)` **dopo** il blocco, il difetto **resta**.
6. **`IDEMPOTENCY_KEY_HEADER` si importa da `@/lib/use-idempotency-key`**, mai da `@/lib/api/handler` (server-only, trascina Prisma nel bundle).
7. **`handler.ts:60` è condiviso con 16.2 e 16.3**: verificare prima di modificare, e non duplicare (AD-6).
8. **Il branch `ADJUSTMENT` di `/api/v1/transactions` non ha `originalMovementId`** (`schemas/transactions.ts:189-194`) ⇒ non raggiunge la guardia nuova. Verificarlo e **dichiararlo**, non «sistemarlo».
9. **Il nome del testid**: non aggiungere suffissi `-mobile` dove esistono selettori `^=`. `grep -rn 'data-testid\^=' e2e/` **prima** di scegliere.
10. **Mai `Escape`** per chiudere un popover in un test (CLAUDE.md): `SlideOver` chiude l'intero pannello.
11. **Il DB e2e è condiviso e ha un cap anti-brute-force** (TD-6): dopo ~10 login lo stesso spec fallisce **sempre** alla riga di login. Prima di attribuirlo a una flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`.
12. **Se la 16.5 atterra in parallelo** con la sua migrazione: la seconda che atterra deve `npx prisma generate` e rileggere `src/generated/` prima del typecheck.
13. **Un reviewer sta usando la porta 3000 e il DB adesso**: coordinarsi con la sessione principale prima del primo reset.

---

## §6 — Fuori scope DICHIARATO

| Cosa | Perché | Dove finisce |
|---|---|---|
| **Rendere `Idempotency-Key` obbligatoria** sulle 5 rotte opt-in | l'audit ha verificato l'opt-in **corretto** (§5.2); il difetto era nel chiamante | dichiarato |
| **Cambiare il lifecycle server-side dell'idempotenza** (fingerprint, `IdempotencyRecord`, status di replay) | verificato corretto; toccarlo è fuori richiesta | dichiarato (AD-8) |
| **Ripulire il doppio addebito già in DB** | ledger **append-only** [L-1]. La via è uno **storno**, cioè un gesto d'operatore, non una migrazione | dichiarato (AC 9) |
| **Rendere «distinguibili» le due righe di quota** (opzione (b) di DQ-1) | il PO ha scelto (a): il secondo addebito **non esiste** più | dichiarato |
| **Il rollover a 24 mesi come semantica voluta** (opzione (c) di DQ-1) | respinta dal PO. Chi paga due anni paga una volta per anno | dichiarato |
| **Un avviso/conferma prima di rettificare un movimento derivato** | l'azione **sparisce** (AD-5): non c'è più niente di cui avvertire | dichiarato |
| **Uniformare `PACKAGE_PURCHASE` da 409 a 422** | quel 409 riguarda lo **stato** («marcatore a importo zero»), non l'input. Cambiarlo è fuori richiesta e romperebbe un contratto | dichiarato |
| **Catene di storno lato CASSA** | `reverseCashMovement` rifiuta di stornare uno storno (`cash.service.ts:403-404`): non esistono catene. MINOR-3 riguarda il ledger conto | dichiarato (§3.3) |
| **`getCashReport`, gli aggregati di tesoreria, i totali del PDF, la data valuta** | sono la **16.6a** | story **16.6a** |
| **MINOR-6** (tassa PPR stornata in cassa ancora visibile nel registro movimenti) | **PLAUSIBILE**, non riprodotto dall'audit, non nella copertura del piano per la 16.6 | TD in `sprint-status.yaml` |
| **MINOR-1** (le due formule di arrotondamento) | assegnato alla **16.5** dal piano | story **16.5** |
| **`membership-fee.spec.ts` fuori dalla catena serializzata** pur scrivendo `AppSettings` globali | lacuna **preesistente**; questa story non la aumenta (§3.5: il test nuovo non tocca `/settings`) e non la chiude (spostare uno spec in catena cambia i tempi di tutta la suite) | **TD-16.6b-a** in `sprint-status.yaml` |
| **`use-idempotency-key.ts:6`/`:34`/`:47`** che dice «shared by the 5 money-mutating forms» quando sono **7** | il conteggio nel doc-comment diventa più falso con questa story (il settimo lo adotta) ⇒ **va corretto**, non è fuori scope | §3.1 |

---

## §7 — Domande aperte per il PO (nessuna blocca la story)

1. **Il CHECK constraint in migrazione** (AD-4): se `prisma validate`/`migrate` lo rifiutano, la scelta è tenere solo gli unit come asserzione dell'invariante. Preferenza del PO? La mia: provare il CHECK, ripiegare senza drammi.
2. **Il testo del 409**: la mia proposta **nomina la via d'uscita** («storna prima l'addebito esistente»). Se il PO non vuole suggerire lo storno all'operatore in quel punto, la frase si accorcia — ma allora il 409 dice «no» senza dire «come».
3. **La generalizzazione di AD-4** estende l'esclusione DEPOSIT a un caso che oggi è REVENUE: una rettifica **negativa** il cui **nonno** è un `TOP_UP` (il doc-comment attuale la dichiara «out of scope», `transactions.service.ts:176-178`). È la conseguenza necessaria di «la radice, non il genitore», ed è coerente con la ratifica Billing-1 F3 applicata transitivamente. **Segnalata**, non sottoposta: senza di essa la profondità resterebbe nel codice.

---

## §8 — Riferimenti

- `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` — §MAJOR-6 (`:239-286`), §MINOR-2 (`:316-364`), §MINOR-3 (`:364-398`), §5 DQ-1, §5.2 (idempotenza verificata corretta)
- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — §«Story 16.6», §«Architettura e vincoli», **R-16-g**
- `src/lib/use-idempotency-key.ts` — il contratto TD-2, AC 6, con il blocco d'uso da copiare
- `_bmad-output/implementation-artifacts/16-2-guardie-registro-voli.md` §AD-3 e `16-3-prenotazioni-persona-istruttore-approvazione.md` — la stessa riga di `handler.ts:60`
- `_bmad-output/implementation-artifacts/16-6a-data-valuta-e-totali.md` — l'altra metà della 16.6
- `CLAUDE.md` — regole e2e (`scripts/e2e.sh`, project serializzati, testid, cap anti-brute-force), trappola env eager negli unit, gates
