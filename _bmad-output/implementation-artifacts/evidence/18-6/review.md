# Revisione indipendente BMAD 18.6 — verdetto finale

- Base: `d13da84b3498eded221b2f0b8fece7f1f4c5e3e9`.
- Tree candidato attuale: `67f6a7176c83ee98cc435c8baa2e66adfcfba3bb` (precedente `54c9e927c9306a9187172cf9dd6181fab45712fb`). `git diff --cached --exit-code <tree>`: exit 0 al controllo; le modifiche documentali unstaged non fanno parte del candidato.
- Reviewer: contesto separato, sola lettura del repository. Nessun commit o push; test UI su snapshot `git archive` in `/workspace/review-186`, DB sintetico `airmanager_test` su loopback 55484, SMTP locale. Nessuna modifica CSP o ACL.
- Verdetto: **APPROVATO** sul tree `67f6a7` per gli AC 1–9, con il gate AOG corretto e riesaminato. La full finale ha `E2E_EXIT=0`, 706 passed + 2 flaky recuperati = 708 casi, zero skip. La prima full su 54c9e9 fu interrotta dopo il rosso AOG e non è stata conteggiata come verde.

## Rilievi per gravità

- **HIGH, gate bloccante risolto — AOG exact-geometry** (`e2e/aog-impact-email.spec.ts:621–647`). Il vecchio test fissava `rect.y=620,44` mentre il pannello poteva trovarsi a scrollTop 0 o 2 px anche sulla base: la prima full ha fallito tre tentativi. Il tree 67f6a7 verifica la coordinata all’origine del contenuto a 622,44 px senza allargare la tolleranza. Le 24 misure base/candidato e la mutazione +2 px dimostrano che ora il test distingue un vero spostamento. Mirato 1/1 e full finale al primo tentativo verdi.
- **LOW, non bloccante — due flaky nel run finale.** `expiry-types.spec.ts:239` non ha trovato entro 5 s il titolo «Le mie scadenze» dopo la navigazione; `settings.spec.ts:715` non ha trovato entro 5 s il feedback SMTP dopo il click, con Mailpit locale. Entrambi passano al retry #1. L’intero file settings in modalità seriale è stato rieseguito, generando 20 righe `retry #1` per 2 soli flaky unici. La causa di temporizzazione non è determinata; non va presentata come prova al primo tentativo.
- **Nessun rilievo applicativo confermato** su tema, SSR, idratazione, precedenza del cookie o interfacce nel tree riesaminato.

## Riscontri per criterio

| AC | Riscontro |
| --- | --- |
| 1–3 | Lo spec del dev `e2e/theme-system.spec.ts` ha misurato 48 combinazioni (375/1280 × OS light/dark × cookie assente/light/dark × login/dashboard/logbook/settings) con chunk applicativi bloccati. Campione DOM/CSS precedente al `first-paint`; `data-theme`, sfondo e `color-scheme` attesi. Il server emette `data-theme` solo per cookie valido. La prova indipendente sulla build isolata conferma login/dashboard/fleet scuri senza cookie, navigazione, cookie manuale e cookie invalido. |
| 4 | Prova UI indipendente: toggle desktop e mobile, entrambe le istanze DOM delle icone coerenti; scelta manuale scrive il cookie e prevale dopo cambio OS e reload. |
| 5 | `color-scheme` calcolato light/dark nella matrice; controlli nativi input email, input time e select testati nei relativi schermi. |
| 6 | Spec automatico controlla console/page errors e `router.refresh()` dopo creazione sintetica. Prova indipendente: dopo scrittura velivolo sintetico e refresh RSC, tema automatico scuro senza cookie; poi document reload e navigazione restano scuri. |
| 7 | Spec automatico confronta 4 override calcolati fra automatico scuro e cookie scuro. I 23 override CSS esistenti non cambiano. Suite completa verde con i due flaky estranei al tema descritti sopra. |
| 8 | Ratifiche Q-18.6-a/b rispettate: due stati senza «Automatico»; listener OS attivo senza cookie, fermato dal toggle. Prova indipendente del cambio OS dopo navigazione; cookie aggiunto a pagina aperta vince al successivo cambio OS. |
| 9 | `npm run gates` sul tree 67f6a7: lint 42s, typecheck 7s, 2.351 unit 18s e build 59s, tutti passati in `/tmp/am186/gates-v2.log`. Mirato AOG corretto 1 passed, `E2E_EXIT=0` in `/tmp/am186/focus-aog/airmanager-e2e/last-run.log`. Full finale: `E2E_EXIT=0`, 706 passed + 2 flaky = 708, zero skip, in `/tmp/am186/full2/airmanager-e2e/last-run.log`. Tutti i 6 test tema, 59 `mobile-ink-targets`, 9 `login`, 3 METAR e il test AOG corretto passano al primo tentativo. |

## Prove e comandi

- `git archive <tree> | tar -x` in snapshot esterno, `prisma generate`, `env -u NODE_ENV npm run build`: exit 0; `/tmp/am186/review-build-standard.log`.
- `node /tmp/am186/review-ui.cjs`: exit 0; `/tmp/am186/review-ui.log`. Browser Chromium su porta 3188, utente seed e dati sintetici. Copre navigazione, OS variabile, vero refresh RSC, reload, due toggle e icone, 0 errori browser.
- `node /tmp/am186/review-edge.cjs`: exit 0; `/tmp/am186/review-edge.log`. Copre cookie invalido, precedenza dopo cookie aggiunto a pagina aperta, CSS con JavaScript disabilitato.
- Log dei mutanti del dev, riesaminato in sola lettura (`/tmp/am186/mut-results.log`): senza script e con decisione tardiva AC1 rosso; cookie ignorato AC3 rosso; senza `color-scheme` AC5 rosso; originale verde. La variante tardiva passa il caso idratato ma fallisce il pre-paint con chunk bloccati.
- Screenshot/misure del dev riesaminati: `/tmp/am186/measurements/`; 48 first paint, 48 misure di form/route. Screenshot mobile scuri di login e pannello «Registra volo» ispezionati.

## Riesame del delta AOG

Il delta 54c9e9 → 67f6a7 modifica **solo** `e2e/aog-impact-email.spec.ts:621-647` (+5/−2), non l'applicazione. `git diff --check` e `git diff --cached --exit-code 67f6a7`: exit 0. Il test ora compara `rect.y + anchor.closest('.so-body').scrollTop` con 622,44 px, invece del solo `rect.y` con 620,44 px; mantiene x, larghezza, altezza, display, margini, padding, touch floor e colori esatti. Non allarga una soglia.

`/tmp/am186/geo-base.log` e `geo-candidate.log`: 12+12 misure nelle tre larghezze 641/900/1280 sul medesimo DB/browser. In entrambi i tree y viewport è 620,44 oppure 622,44 secondo scrollTop 2 oppure 0; y all'origine è sempre 622,44. X = 156/415/795, dimensioni = 102,92 × 19,38 in tutti i casi. `/tmp/am186/geo-mutant.log`: un reale spostamento CSS +2 porta la y all'origine a 624,44 e la controprova fallisce. Le prove UI indipendenti sul codice applicativo invariato restano applicabili.

## Limiti

- Le misure derivano da Chromium con `colorScheme` emulato; nessun telefono fisico o browser diverso verificato.
- La prima build isolata con `node_modules` in symlink è fallita per limite Turbopack fuori root; un tentativo webpack si è fermato su validazione route handler. La build standard Turbopack con dipendenze locali in snapshot ha exit 0 e costituisce la prova valida. I log dei tentativi sono `/tmp/am186/review-build.log` e `/tmp/am186/review-build-webpack.log`.
- Nessun rilievo applicativo bloccante resta aperto. La prima full è stata fermata con SIGTERM dopo AOG rosso 3/3 e altri retry (`/tmp/am186/launch2.log`), senza sentinella `E2E_EXIT`; non è un esito completo. Il run finale sul tree corretto è verde con 2 flaky esplicitati sopra.

- Il PID del runner finale resta zombie nel namespace: `scripts/e2e.sh status` mostra `RUNNING`, ma il log specifico contiene riepilogo, timestamp di fine e sentinella `E2E_EXIT=0`. La sentinella è il risultato effettivo; non ho rilanciato la suite.
