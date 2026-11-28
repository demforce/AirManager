# Review adversariale — Story 16.5 (compensi istruttori congelati sul volo, ex istruttori visibili e pagabili)

- **Reviewer**: adversarial-reviewer (Opus 5.5), 2026-11-03 23:57 → 2026-11-04 09:50.
- **Commit in review**: `caeb973` (feat) + `be11075` (docs) su `dev`, base `1f6ab3e`. Dopo la review è arrivato `309644c` (solo documenti: file story 18.x, sprint-status e ratifiche PO della 16.5). Il codice in esame è identico a `caeb973`: `git diff be11075 309644c -- src messages prisma e2e` è vuoto.
- **Metodo**: lettura di §R, §R-PO e Dev Agent Record. Revisione statica del diff (32 file). Gate e unit eseguiti di nuovo, 10 mutanti propri su una copia isolata, query in sola lettura su `airmanager_load`, il servizio reale eseguito con tsx sul DB di carico, arbitro e2e completo sul DB fresco, poi una sonda API/DB/UI con fixture run-unique su un server di produzione a :3100. La sonda è uno script `playwright-core` + `pg`: `…/scratchpad/review-16-5/probe.mjs`, log in `probe.log`, screenshot in `shots/`.

## Verdetto: **SHIPPABLE-WITH-FIXES**

Il cuore della story è corretto e verificato su dati reali:
- lo snapshot viene scritto solo da `buildFlightWrite`, mai dentro `totalAmountCents`;
- la regola Q-16.5-a vale anche in modifica;
- R-19-d viene rispettata sui voli senza addebito;
- il backfill coincide al centesimo con il TS;
- il dovuto non è mai `null`;
- gli ex istruttori sono visibili e pagabili, con il 409 `INSTRUCTOR_NOTHING_OWED`.

L'arbitro chiude con **609/609 verdi**. Restano due findings Medium a basso costo di correzione, da sistemare nel commit di fix della review:
- **F1**: il dettaglio di un archiviato contraddice il summary e l'OpenAPI;
- **F2**: sul telefono da 320 px non si legge il nome dell'ex istruttore da pagare.

Il resto sono Low o Info.

## Arbitro e2e

| | |
|---|---|
| Comando | `export JOBS_SECRET=<non placeholder>; scripts/e2e.sh start`, suite completa con `CI=1` (build di produzione dentro il run), DB `airmanager` appena resettato dalla sessione principale (migrazioni applicate alle 22:57:03Z) |
| Finestra | avvio **01:06:00**, fine **01:24:24** (2026-11-04), fuori dalla finestra 23:40-01:00 |
| Esito | **609 passed (18,4 min) · 0 failed · 0 flaky · 0 skipped · 0 did not run · `E2E_EXIT=0`** |
| Log | `/tmp/airmanager-e2e/last-run.log` (letto con `scripts/e2e.sh status`) |
| Conteggio | `npx playwright test --list` → 609 test in 69 file = 606 di baseline + 3 nuovi |

Il run dimostra che i 17 fallimenti classificati dal dev come ambientali (run 534/19/2) erano davvero inquinamento del DB: `PERMISSIVE_SCHEDULING` più le 23:30. Le due regressioni D-o, corrette dal dev, sono verdi.

## Gate e test unit

- `npm run gates` (repo, 2026-11-04 00:09): **PASS** lint (21 s) · typecheck (19 s) · test **2238/2238** (baseline 2211, +27) · build (34 s).
- `env -u DATABASE_URL -u AUTH_SECRET npx vitest run`: 2238 passed. Nessun test nuovo trascina `@/lib/env`.
- **10 mutanti propri** su una copia isolata (`…/review-16-5/iso`, ripristino con controllo sha256 dopo ognuno, script `mutants.py`): **tutti rossi**.

| Mutante | Test rossi |
|---|---|
| K1 tariffa dell'originale tenuta anche cambiando istruttore | 2 |
| K2 ex istruttore pagabile con dovuto = 0 | 2 |
| K4 summary che nasconde l'ex istruttore a dovuto negativo | 1 |
| K5 filtro inattivi senza `isNot: null` | 1 |
| K9 `centsForMinutes` con `Math.floor` | 5 |
| K11 maturato del mese = dovuto netto | 1 |
| K12 dovuto mtd che sottrae i payout totali | 1 |
| K13 controllo «pagabile» sul solo ytd | 1 |
| K14 snapshot = importo addebitato all'allievo | 7 |
| K15 volo senza istruttore a 0 invece di null | 3 |

## Verifiche positive (con evidenza)

| Area | Evidenza |
|---|---|
| Migrazione da zero e assenza di drift | Il reset della sessione principale l'ha applicata da zero (`_prisma_migrations`: `20261103120000_…` 22:57:03Z). `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.` |
| Backfill su `airmanager_load` (BEGIN READ ONLY) | 60 018 voli, 15 697 con istruttore e 15 697 snapshot. **0** con istruttore e snapshot null, **0** senza istruttore e snapshot valorizzato, **0** tariffe ≠ `COALESCE(payoutRateCents,0)`, **0** importi ≠ `round(rate*min/60)`. 3 184 voli a 0/0. Σ = **51 759 840**, uguale al record |
| Numeri del record | KPI dopo = **11 914 584 c (119 145,84 €)**. 22 ex istruttori = **839 036 c (8 390,36 €)**. Ore 1 055 373′ = **17589:33**; prima 16621:38. AC 3 rifatta in SQL: 249 istruttori cambiano, max 12 c, ≤ 0,273 c/volo; le differenze di 2 c su Σ e netto sono l'errore float della formula ritirata, come dichiarato |
| Servizio reale sul carico | `getCompensationSummary` via tsx con `DATABASE_URL=…/airmanager_load`: 396 righe (374 attivi + 22 non più attivi, attivi prima), KPI 11 914 584, 0 dovuti null, 188 ms |
| Snapshot alla registrazione (sonda) | SCHOOL 90′ a 30 €/h → 3000/4500. Istruttore senza tariffa → **0/0** con addebito 4000 intatto. TOURISM senza istruttore → null/null. TOURISM con istruttore → 3000/1500, scritto ma non sommato. `noCharge` → 3000/3000 con importi addebitati a 0 (R-19-d) |
| MAJOR-1 | Tariffa 3000 → 6000: dovuto fermo a 7 500 |
| Q-16.5-a in modifica | Stesso istruttore, 120′ → **3000/6000** (tariffa congelata). Cambio a I3 → 4500/9000. Rimozione dell'istruttore → null/null. Di nuovo SCHOOL con un istruttore senza tariffa → 0/0 |
| Corsa fra modifiche dello stesso volo | `PUT` concorrenti → `[200, 409 FLIGHT_MODIFIED_CONCURRENTLY]`; la riga è coerente con il vincitore (70′, 3000/3500) |
| AD-7 | Né il DTO dei voli (admin) né quello degli altri tre ruoli contiene `instructorPayout*` |
| Ex istruttore | Dopo la disattivazione: `isActive:false` con il dovuto. Dettaglio **404**. `PUT rate` **409**. Dopo un pagamento a dovuto ≤ 0: **409 `INSTRUCTOR_NOTHING_OWED`**. Il replay con la stessa `Idempotency-Key` restituisce **201** (non 409). Archiviato con profilo attivo e dovuto > 0: **201** (D-c) |
| RBAC (pilota, istruttore, allievo) | 403 su summary, export, payout e PUT rate. «I miei compensi» dell'istruttore seed mostra `0,00 €` su maturato, dovuto e residuo (niente «—»); la landing mostra «Dovuto nel mese 0,00 €» |
| Export xlsx | Intestazioni `Nome, Compenso orario, Ore totali, Totale dovuto, Stato`. Riga senza tariffa: `null, "1:00", 0, "Attivo"` |
| UI | A 1280 c'è la card con la faccia desktop. A 375 e 320 la faccia mobile: riga `DIV` non tappabile, Paga **44 px**, nessun overflow orizzontale. «Compensi da liquidare» elenca l'ex istruttore con il badge «Non più attivo». Il 409 è mappato su «Questo istruttore non è più attivo e non ha compensi da liquidare.». Hint dell'editor presente. Il widget Contabilità mostra solo gli attivi (AD-9). In EN: «No longer active, still owed» |
| Census AC 18 | `grep "/ 60"` in `src/server src/app src/lib`: nessuna conversione in denaro fuori da `money.ts#centsForMinutes` |
| Testid e selettori `^=` | Nessuna collisione con i prefissi esistenti (`mobile-instructor-row-`, `pilot-row-`, `ac-card-`, …) |
| i18n | Parità e `BANNED` verdi (gate). Nessun «payout», «card» o «ciclo pagamenti» nelle stringhe IT nuove |

---

## Findings (ordinati per gravità)

### F1 — MEDIUM — Il dettaglio di un istruttore ARCHIVIATO col profilo attivo risponde 200 con `isActive: true`, mentre il summary lo dà `isActive: false`

**Dove**:
- `src/server/services/instructor-compensation.service.ts:421-440` (`resolveActiveInstructorRow`). La `select` non legge `archivedAt` e alla riga `:440` c'è `isActive: true` scritto fisso.
- `src/lib/schemas/registry.ts:1856`: la descrizione nuova dice «With `?personId=` (an ACTIVE instructor only, 404 otherwise)».
- Il doc-comment `:420` dice «The summary's no-longer-active rows keep this 404».

**Perché conta**:
- D-c, ratificata, dice che «non più attivo» = persona archiviata OPPURE profilo disattivato.
- Il campo `isActive` è nuovo in questa story, e la stessa route dà due risposte opposte sulla stessa persona: il GET senza `personId` dice `false`, quello con `personId` dice `true`.
- Il progetto è API-first e il futuro client Flutter leggerà il contratto.
- La UI oggi non raggiunge il dettaglio da quelle righe, che non sono cliccabili. Il difetto quindi è di contratto, non visibile a schermo.

**Repro (sonda, fixture run-unique)**:
1. Istruttore I3 con tariffa 45 €/h e un volo SCHOOL da 60′.
2. `POST /api/v1/people/{I3}/archive`.
3. Il summary dice `{"owedTotalCents":4500,"isActive":false}`.
4. `GET /api/v1/instructor-compensation?personId={I3}` risponde:

```
FAIL detail of an ARCHIVED person (profile active) agrees with the summary (404, or isActive false)
 :: {"status":200,"isActive":true,"summaryRow":{"…":"…","owedTotalCents":4500,"isActive":false}}
```

**Fix suggerito** (una riga più un test): leggere `archivedAt` nella `select` e trattare l'archiviato come il disattivato, quindi 404, coerente con Q-16.5-c e con la descrizione OpenAPI già scritta. In più, un unit accanto a «still 404s on a DEACTIVATED profile». Se il PO preferisse il 200, l'alternativa minima è `isActive: person.archivedAt === null` e correggere descrizione e doc-comment (v. domanda PO 3).

### F2 — MEDIUM (UI) — A 320 px il nome dell'ex istruttore con «Paga» si riduce a 5-22 px: la riga non si riconosce più

**Dove**:
- `src/styles/airops.css:2686-2688`: `.mobile-row-static` a 4 tracce `30px minmax(0,1fr) auto auto`, con il bottone da 44 px nella quarta.
- La riga è in `src/app/[locale]/dashboard/instructors/instructors-console.tsx:~514-545`.

**Misura (sonda su build di produzione, `clientWidth` di `.mobile-row-name`)**:

| Riga | 375 px | 320 px |
|---|---|---|
| ex istruttore, Paga, «1.000,00 € dovuti» | 60 px | **5 px** (il testo ne richiede 138) |
| ex istruttore, Paga, «35,00 € dovuti» | 77 px | **22 px** («Tr…») |
| ex istruttore senza Paga | 117 px | 69 px |
| riga del roster attivo | 117 px | 99 px |

Screenshot: `…/review-16-5/shots/card-320.png` e `card-375.png`.

**Perché conta**:
- Sul telefono stretto, la larghezza `PHONE_NARROW` che `mobile-registries.spec.ts:49` dichiara fra quelle d'obbligo, la lista di chi va pagato non dice chi è. Restano solo le iniziali dell'avatar.
- Il pannello Paga mostra il nome nel sottotitolo, quindi il rischio di pagare la persona sbagliata è mitigato, ma la lista come strumento non funziona.
- Il dev ha misurato solo a 375.
- La guardia `hidden` di `mobile-registries.spec.ts` esenta gli elementi con `text-overflow: ellipsis`, quindi nessun test lo vede.

**Fix suggerito**: sotto i ~360 px, Paga su una seconda riga della griglia (sotto il blocco ore/dovuto, oppure a tutta larghezza), così il nome conserva la larghezza che ha nel roster attivo. Aggiungere un'asserzione sulla larghezza del nome a 320 nel test «Gone» di `instructor-compensation.spec.ts`.

### F3 — LOW — Un «giro» di istruttore in modifica riprezza un volo congelato alla tariffa di oggi

Effetto della regola Q-16.5-a, ratificata, applicata modifica per modifica.

**Repro (sonda)**: volo F1 congelato a 3000 c/h con I1. La tariffa di I1 diventa 6000. Si modifica F1 mettendo I3 (4500/9000), poi lo si rimette su I1:

```
PASS edit F1 back -> I1: I1 CURRENT 6000 / 12000 (the old 3000 is gone)
```

Un admin che sbaglia istruttore e torna indietro cambia in silenzio il compenso di un volo forse già liquidato. È lo stesso schema di Q-19.3-b sulla categoria di prezzo, quindi coerente con il dominio, ma contraddice nella pratica «cambiare la tariffa vale per i voli futuri» (R-16-d). Nessun codice da cambiare senza una decisione PO (domanda 1). Il minimo è dichiararlo nel doc-comment di `updateFlight`.

### F4 — LOW — Regole UI senza nessuna guardia automatica

La sonda le ha verificate corrette, ma nessun test le protegge:
- il filtro `isActive` del widget Contabilità (`billing/page.tsx:195`, AD-9): nessun e2e legge il widget Compensi;
- «Paga» solo con dovuto > 0 sulla card (D-b, `instructors-console.tsx:465`);
- la mappatura del 409 `INSTRUCTOR_NOTHING_OWED` in `PaySlideOver` (`:644-645`);
- la media del compenso orario sui soli attivi (`page.tsx:67`);
- la clausola `subInactive` del sottotitolo.

Un mutante su una qualsiasi di queste righe passerebbe tutta la suite. È una deduzione statica: nessun test referenzia quei comportamenti. Una build mutante e2e non è stata eseguita per costo.

**Suggerimento economico**: nel test «Gone» già esistente,
- leggere `/it/dashboard/billing` e asserire l'assenza della riga dell'ex istruttore;
- dopo il primo pagamento, provocare il 409 dietro la UI e asserire il messaggio.

### F5 — LOW — L'hint dell'editor promette più di quanto valga

`messages/it.json` `InstructorsPage.editor.payoutRate.hint` dice «… quelli già registrati mantengono **il compenso** calcolato alla registrazione». Con Q-16.5-a, però, una modifica dei minuti ricalcola l'importo, alla tariffa congelata, e un cambio di istruttore prende la tariffa attuale del nuovo. Quello che resta fermo è il **compenso orario**, non l'importo.

**Proposta**: «Vale dai prossimi voli: quelli già registrati mantengono il compenso orario in vigore alla registrazione.» In EN: «…keep the hourly rate in force when they were registered.»

### F6 — LOW (documentazione) — Un nuovo selettore `^=` non è registrato in CLAUDE.md

`e2e/instructor-compensation.spec.ts` (test «Gone», `page.evaluate`) introduce `[data-testid^="instructor-row-"]` e `[data-testid^="inactive-instructor-row-"]`. Il dev lo ha dichiarato come D-n, ma l'avviso ⚠️ di CLAUDE.md elenca ancora solo `ac-card-` e `pilot-row-`. Un futuro `instructor-row-{id}-mobile` raddoppierebbe i conteggi della somma nello stesso render.

Per la regola di manutenzione di CLAUDE.md va aggiunto nel `docs(16.5)` di chiusura.

### Info (nessuna azione obbligatoria)

- **I-1 — Corsa dichiarata, ora misurata.** Due `POST /instructor-payouts` simultanei per l'intero dovuto di un ex istruttore, con chiavi diverse, rispondono `[201, 201]` e lasciano il dovuto a **−155,00 €**. Il denaro esce davvero due volte: non è solo una cifra negativa a schermo. Il doppio clic dallo stesso form è protetto (stessa chiave → replay 201 verificato). Serve una seconda scheda o un secondo amministratore. Ratificato come «dichiarato», v. domanda 2.
- **I-2.** Statistiche (`stats.service.ts`) mostra «—» per un ex istruttore con dovuto totale 0, anche se il dovuto del periodo è ≠ 0. Conforme a §R AC 21 («solo se ≠ 0, il summary filtra»).
- **I-3.** Il ramo modificato di `prisma/seed-load.ts` (le due colonne nel `createMany`) non è mai stato eseguito: è solo coperto dal typecheck (`tsconfig` include `**/*.ts`). Il DB di carico ha ricevuto le colonne dalla migrazione, non dal seed. Il rischio è basso; va provato alla prossima rigenerazione (D-R4).
- **I-4.** Dopo il 409 in `PaySlideOver` la pagina non si aggiorna: la riga dell'ex istruttore resta con il dovuto vecchio e con «Paga» finché non si ricarica.
- **I-5.** `setPayoutRate` accetta una persona archiviata con il profilo attivo (`PUT rate` → 200, sonda). È la regola preesistente (`resolveActiveInstructorProfileId` guarda solo `deactivatedAt`), invariata per scelta (D-c). È innocuo, perché nessun volo può più essere registrato con quella persona.
- **I-6.** «Totale dovuto» e il sottotitolo sono cifre **nette**: un ex istruttore pagato in eccesso abbassa il totale. Sul DB post-suite il sottotitolo diceva «85 attivi · **-1.020,72 €** da liquidare · 3 non più attivi con dovuto». Per gli attivi la semantica era già questa; ora vale anche per gli ex.
- **I-7.** Il messaggio d'errore del form Paga è in maiuscolo mono (`.fld-label`). È lo stile preesistente di quel form, non della story.

## Domande per il PO (in italiano semplice)

1. **Cambio di istruttore avanti e indietro (F3).** Se un amministratore sbaglia istruttore su un volo vecchio e poi rimette quello giusto, il volo prende il compenso orario di oggi di quell'istruttore, non quello di allora, e il suo dovuto cambia. Va bene così (lo scriviamo e basta), oppure vuoi un avviso nel form quando si cambia istruttore, del tipo «il compenso sarà ricalcolato con la tariffa attuale»?
2. **Due pagamenti nello stesso momento (I-1).** Abbiamo verificato che se due persone pagano insieme lo stesso ex istruttore, i due pagamenti passano entrambi e la cassa paga due volte. Confermi che va bene solo dichiararlo, sapendo che i soldi escono davvero due volte?
3. **Istruttore archiviato ma col profilo ancora attivo (F1).** Nell'elenco risulta «non più attivo», ma la sua scheda via API risponde come se fosse attivo. Proponiamo di trattarlo come l'ex istruttore disattivato: la scheda non si apre, si può solo pagarlo. D'accordo?
4. **Telefono piccolo (F2).** Su uno schermo da 320 px il nome di chi va pagato sparisce. Va bene spostare il bottone «Paga» su una seconda riga solo sugli schermi stretti?

## File e artefatti

- Report: `_bmad-output/implementation-artifacts/16-5-review-report.md` (questo file).
- Sonde: `/tmp/claude-1000/-home-admin-AirManager/45a65db7-6aab-42c2-90b8-6cdb4c6509a7/scratchpad/review-16-5/`, con `probe.mjs`, `probe.log`, `card-shot.mjs`, `summary-load.ts`, `mutants.py`, `shots/` (`card-320.png`, `card-375.png`, `card-1280.png`, `pay-409.png`, `instructors-*.png`).
- Arbitro: `/tmp/airmanager-e2e/last-run.log`.
- Stato lasciato: il server di sonda su :3100 è fermato, :3000 e :3100 sono liberi. Il DB `airmanager` contiene le fixture run-unique della sonda (prefisso «Rev», tag `mw1v91x3`/`mw1v9hh8`) oltre a quelle della suite. Nessun file del repo è stato modificato, eccetto questo report.
