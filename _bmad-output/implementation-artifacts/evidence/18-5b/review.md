# Revisione indipendente 18.5b — approvata

## Perimetro

- Baseline `0c07fc668d4ad6d20eca7744f8643d02f1faf117`; tree candidato immutabile `ab8e07a2494b96a8b0dfaa5767a4a1813593c7ad` (11 file, +318/-60).
- Sola lettura del repository. Build da `git archive` del tree in `/workspace/.review-185b`; database sintetico dedicato `airmanager_test` su loopback, UI locale :3187, SMTP locale. Nessuna modifica ad ACL, repository o rami.
- Riferimenti: `CLAUDE.md`, skill `bmad-code-review`, `karpathy-guidelines`, story `18-5-righe-tab-lessico.md` AC 6 e Q-18.5-e, handoff 18.5a/18.4/18.2b.

## Riscontri indipendenti

- `npm run db:reset:test` sul solo `airmanager_test`: exit 0. `env -u NODE_ENV npm run build` nello snapshot isolato: exit 0. Il primo tentativo con `node_modules` symlink fuori root è uscito 1 (`TurbopackInternalError`); `npm run build -- --webpack` è uscito 1 per controllo route typing non usato dal gate standard. Risolto usando snapshot nella stessa root filesystem con dipendenze locali; build standard verde. Sono problemi del setup temporaneo, non un risultato del candidato.
- `node /tmp/am185b/review-measure.cjs review`: exit 0. A 375, card pilota `[28,115.84,319,184.28]`, calendario inizia y=322.13, CTA `[259.8,128.84,70.2,44]`, tab bar y=743.94; allievo card `[28,134.69,319,159.84]`, calendario y=316.53. Overflow documento 0. A 1280 card nascosta, sottotitolo staff ripristinato. Admin e istruttore a 375/1280 hanno le stesse coordinate di testata, calendario, lista e CTA della misura di base `/tmp/am185b/before.log`.
- Screenshot indipendenti `/tmp/am185b/review-{pilot,student,admin,instructor}.png`: la card precede il calendario, gli slot altrui restano «Occupato», lo stato personale indica solo marche, data/ora e stato; nessun nome altrui esposto.
- `node /tmp/am185b/review-role.cjs`: exit 0. CTA visibile per PILOT attivo e PILOT+STUDENT con profilo pilota attivo; assente per STUDENT, STUDENT con profilo pilota attivo ma senza ruolo PILOT, e PILOT+STUDENT con profilo disattivato. Il testo studente senza eleggibilità indica istruttore/amministratore. Apertura/chiusura della CTA e ritorno focus verdi. Modifiche dei soli ruoli/profili di fixture ripristinate nel database disposable.
- `node /tmp/am185b/review-back.cjs`: exit 0. Un singolo Indietro chiude il pannello allo stesso URL e restituisce il focus alla CTA.
- `node /tmp/am185b/review-order.cjs`: exit 0. Con `date=2031-03-11`, `status=DENIED`, `page=9` e filtro velivolo diverso, la preview pilota IT/EN mostra ordinati 10:00, 14:00, 17:00 del giorno sintetico 2026-11-27, limita a 3 e segnala troncamento; non sostituisce le marche col velivolo filtrato. Il confronto geometrico card/calendario è confermato dalla misura precedente; il check geometrico in questo script aveva un campo `bottom` non presente nel tipo `boundingBox`, quindi non viene conteggiato come prova aggiuntiva.
- Review statica: `listOwnUpcomingBookings` autorizza `self.read`, deriva `personId` dall'attore, esclude gli stati conclusi, ordina con tie break ID, legge 4 righe per segnare il troncamento e seleziona solo id, tempo, stato e marche (`bookings.service.ts:1007-1019`). Nessuna modifica a RBAC; lista e calendario mantengono i loro reader e masking esistenti (`page.tsx:235-248`, `:466`). Il testo e la CTA usano l'eleggibilità condivisa 18.2b (`page.tsx:429-447`), senza aggiungere un percorso di scrittura.

## Gate finale e verdetto

Letti il log **specifico** `/tmp/am185b/final/airmanager-e2e/last-run.log` e la sentinella `E2E_EXIT=0` (fine 2026-11-26 16:14:21 UTC). Il runner `scripts/e2e.sh status` conserva `RUNNING` per il PID residuo, ma il log contiene riepilogo e sentinella finale: **699 passati al primo tentativo, 3 flaky recuperati in 4 retry, 0 skip, 0 falliti finali**, 27,5 min, **702 casi distinti**. I 2 casi 18.5b (`personal-planning.spec.ts:24,123`), i 3 casi 18.5a (`mobile-rows-tabs.spec.ts:55,128,220`) e i 3 casi METAR (`mobile-metar.spec.ts:61,167,208`) sono passati al primo tentativo. Il mirato `scripts/e2e.sh start e2e/personal-planning.spec.ts --project=chromium --workers=2 --retries=0` aveva dato `E2E_EXIT=0`, 2/2 in 35,2 s. `npm run gates` del candidato, letto in `/tmp/am185b/gates.log`: lint, typecheck, 2.351 unit e build passati; exit 0 comunicato dal dev e coerente con il log completo. La build indipendente standard è uscita 0.

Retry del full, separati dai passati al primo tentativo:

| Spec | Tentativi falliti | Diagnostica sanitizzata | Esito |
| --- | ---: | --- | --- |
| `account-adjustments.spec.ts:94` | 1 | `Expected 1 Mailpit message(s) ... within 15000ms` | Retry 1 passato |
| `aog-impact-email.spec.ts:564` | 2 | `641px desktop AOG link`: y atteso 620,44 px, osservato 622,44 px | Retry 2 passato |
| `mobile-expiries-movements.spec.ts:666` | 1 | `/it/dashboard/reports .segmented button height`: atteso ≥43,5 px, osservato 0 px | Retry 1 passato |

Questi tre test appartengono a superfici preesistenti non modificate dal candidato; restano instabilità di test da monitorare, non prove di passaggio al primo tentativo. Nessun comportamento METAR è stato saltato.

**Verdetto: approvata la 18.5b / AC 6 sul tree `ab8e07a2494b96a8b0dfaa5767a4a1813593c7ad`.** Nessun rilievo bloccante, medio o basso specifico al diff dopo controllo di codice, dati, UI e gate. `git diff --cached --quiet <tree> --` e `git diff --quiet <tree> --` entrambi exit 0 immediatamente prima del verdetto: checkout e index coincidono ancora con il tree revisionato. Nessuna modifica sorgente, commit o push eseguiti dal revisore.
