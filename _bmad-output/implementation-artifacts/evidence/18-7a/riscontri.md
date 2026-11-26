# Misure Chromium della 18.7a

Base applicativa `a7dff74c6572308632901ee7a0776cfa720892cd`. Tree delle prime misure `3fdef6ecea8a5a646f7c1d122ad77510f7abffd4`. Tree sottoposto al riesame finale `7c73be797f1fe3e3826ae00fc478d062b3b50580`. La differenza contiene soltanto due file di test. Il confronto di src, messages e prisma fra i due tree ha exit 0, senza differenze. App di produzione Next.js servita in loopback. Chromium di sistema. Login attraverso il modulo italiano con le utenze di seed. Tutti i dati sono sintetici.

## Geometria prima e dopo

`misure.csv` contiene 264 osservazioni della pagina italiana in chiaro e in scuro. Le larghezze sono 375, 768, 1000, 1100, 1280 e 1440 CSS px. Altezza 900 px sul desktop e 812 sul telefono. Le due basi dati sono state mantenute uguali tra misura iniziale e finale. Il database e2e già popolato aveva 228 voli, 954 persone e 508 velivoli. Il database di carico aveva 60.018 voli, 5.007 persone e 1.501 velivoli. La suite integrata finale usa un nuovo database e2e creato dopo queste misure.

- `hiddenWidth` misura la larghezza di contenuto consultabile con lo scorrimento orizzontale. Il raggiungimento delle azioni si misura separatamente con `elementFromPoint` al centro di ciascuno dei primi due pulsanti. Nel CSV, l'osservatore porta il riquadro sotto la topbar con uno scroll verticale della pagina e misura l'hit prima dello scroll *orizzontale*. Il test versionato verifica anche la prima riga partendo da `window.scrollTo(0,0)`.
- `internalScrollY` è lo spostamento verticale effettivo del riquadro dopo una richiesta di 800 px. Sulla base il riquadro non scorre verticalmente e viene registrata la posizione dell'intestazione dopo lo scroll della pagina. Laddove la pagina di 20 righe a 900 px termina prima di 800 px, il CSV riporta lo spostamento effettivo. Nel test versionato 20 persone e 20 voli contrassegnati per esecuzione consentono di raggiungere esattamente 800 px con un viewport desktop alto 400 px. Il test controlla l'angolo di intestazione con Azioni, entrambe le azioni di una riga successiva e la posizione rispetto alla topbar, in entrambi i temi a 641, 768, 1000, 1100, 1200, 1201, 1280 e 1440 px.
- `fourthRightGapPx` è la distanza fra il bordo destro dell'ultima delle quattro card e il bordo destro del gruppo. A 1280 px vale zero per tutte e sei le superfici sul candidato. A 1000 px ciascuna presenta 2+2. La striscia mobile e le griglie 2×2 delle landing personali mantengono i rispettivi layout. Compensi conserva cinque card e la distribuzione precedente a ogni larghezza misurata.
- `maxValuePastCardRightPx` confronta il bordo destro del testo misurato tramite DOM Range con quello della propria card. Un valore positivo indica clipping sulla destra. A 1280 px sul carico, Registro voli («15.589.074,93 €») passa da +42,09 a −25,52 px e Statistiche («5.047.865,46 €») da +24,91 a −108,95 px. A 1280 px sul Registro di carico tutte le cifre sono visibili e il simbolo € va sulla seconda riga. Panoramica carico mostra «259.248,98 €». Nel dataset e2e sono presenti sia apertura sia chiusura orarie e Statistiche mostra quattro KPI. Nel carico entrambe le impostazioni sono assenti, quindi Statistiche mostra tre KPI ed è verificata anche in questa configurazione. Il test versionato verifica tutti i rettangoli del testo, sui due assi.

## Verifiche funzionali

`e2e/desktop-registries.spec.ts` prova l'apertura da tastiera di «Modifica», l'altro pulsante su una riga successiva (annullamento prima di eliminare o chiusura della ricarica), l’ingresso con Tab dalla precedente azione di creazione, l’uscita con Shift+Tab e con Tab dall’ultimo pulsante, le frecce in verticale e orizzontale dentro la regione con il nome italiano atteso, il punto di sovrapposizione con il pannello e il popover Export, lo sfondo opaco di intestazione/angolo/cella in entrambi i temi e lo sheet mobile a 375 px. Nessuna operazione di rimozione o di ricarica viene confermata. Il controllo da tastiera è stato eseguito in Chromium. Non è stata svolta una sessione con screen reader fisico.

## Controprove CSS su copia isolata

`git archive 3fdef6ecea8a5a646f7c1d122ad77510f7abffd4` estratto in una directory privata. Il foglio di stile prima della variante ha SHA-256 `c3358fdfd2908541a51bf47ac7985ff7ea147088f0256924c9cb42c02db5eff6`, identico al sorgente nel candidato. Solo nella copia sono stati portati a `auto` gli inset superiore e destro delle celle sticky ed è stato ripristinato il numero precedente di colonne KPI. SHA-256 della variante `51ef609881e4162b685d3e62c3876046db5a73f1b94e2212b36ab53c490f51b0`. La copia ha la propria build di produzione. Le tre osservazioni del probe sono indipendenti e sono registrate tutte prima di calcolare l'exit complessivo.

| Build sul carico sintetico | 1000 px | Spazio dopo quarta KPI, 1280 | Azioni al centro, 1280 | Scroll interno effettivo e top intestazione su viewport 1280×400 | Exit probe chiaro/scuro |
|---|---|---:|---|---|---|
| Base | 3+1 | 200,81 px | no / no | 0 px, top −734,27 px dopo scroll pagina | 1 / 1 |
| Variante CSS isolata | 3+1 | 200,81 px | no / no | 800 px, top −734,27 px | 1 / 1 |
| Candidato | 2+2 | 0 px | sì / sì | 800 px, top 65,73 px | 0 / 0 |

Il bordo inferiore della topbar era a 63,84 px. Comandi `node /tmp/am187a/probe.cjs PORT TEMA` sui server in loopback 3191 (base), 3192 (variante) e 3193 (candidato), con `TEMA=light` e `dark`. Gli screenshot di base e candidato mostrano la pagina italiana a 1280 px sul DB di carico.

## Diagnostica dello sviluppo

| Comando e fase | Exit | Evidenza e risoluzione |
|---|---:|---|
| `scripts/e2e.sh start e2e/desktop-registries.spec.ts --project=chromium --workers=2 --retries=0`, prima esecuzione sulla base; secondo tentativo limitato a `-g 'sticky header'` | 1 e 1 (suite) | `INSERT has more target columns than expressions`. Completate le liste SELECT/VALUES dei soli fixture User e Aircraft. I tre test KPI erano già rossi sulla base. |
| Stesso mirato `-g 'sticky header'`, sulla base dopo la correzione dei fixture | 1 (suite) | Su entrambi i registri `Expected [true,true], Received [false,false]` a 768 px. Rosso geometrico misurato separatamente a 1100 e 1280 nel CSV. |
| Mirato completo sul primo candidato UI | 1 (suite) | 3 passed, 2 failed. Registro: `expect(locator).toBeHidden() failed … .slideover-panel … Received: visible`. Piloti: `strict mode violation … resolved to 2 elements`. Il componente conserva il pannello chiuso nel DOM. Il test ora seleziona il pannello della sola shell aperta. Rilancio di entrambi i registri: 2 passed, exit 0. |
| Mirato conclusivo sull'intero file, dopo l'aggiunta delle verifiche a 641/1200/1201 e di hit su punti ricoperti delle celle sticky | 0 (suite) | 5 passed, 25,6 s, nessun retry o skip. |
| `node /tmp/am187a/measure.cjs before load-logbook`, misura integrativa sul carico durante la ricostruzione della build principale | 1 (probe) | `page.waitForURL: Timeout 30000ms exceeded`. La matrice principale era già stata acquisita. I due tentativi di riuso di una build storica (prima dipendenze incomplete, poi `Could not find a production build`) hanno dato `net::ERR_CONNECTION_REFUSED`. È stata creata una build isolata dell'esatto SHA di base. |
| `env -u NODE_ENV npx next build` nell'archivio Git della base | 1 | `Module not found: Can't resolve '@/generated/prisma/client'`. `npx prisma generate` e successiva build hanno entrambi exit 0. Misura integrativa rieseguita sulla build isolata, 12/12 osservazioni e probe exit 0. |
| `npm run gates` sul tree applicativo finale | 0 | Lint 67 s, typecheck 9 s, 2.351 unit 25 s, build 78 s. |
| `npm run db:reset:test` | 0 | `Test database airmanager_e2e reset and seeded.` PostgreSQL dedicato in loopback, porta 55484; SMTP locale. Per la suite il servizio meteo è simulato nel server di test. |

## Correzione delle misure dopo la prima suite integrata

La prima esecuzione di `E2E_REUSE_SERVER=1 TMPDIR=/tmp/am187a/full scripts/e2e.sh start --workers=2` sul tree 3fdef6e ha esaurito tutti i tentativi del caso `empty-18-2b.spec.ts:4` (Billing in IT/EN). La diagnostica riporta `Expected [260,85.84,992,51.44], Received [260,79.84,992,51.44]`. Su uno snapshot locale separato del database interrotto, la sonda ha registrato nello stesso frame `scrollY=6`, origine dell'intestazione nel documento 85,84375 px, font caricati e topbar a 63,84375. Il test finale riporta lo scroll a zero prima di confrontare gli stessi quattro valori esatti. Eseguito con il nuovo test sulle build di base e candidato, il caso passa su entrambe al primo tentativo. Una copia isolata del test applica 4 px di spostamento reale al titolo di Billing: exit 1, `Expected 85.84, Received 89.84`. SHA-256 del test finale `c56cd89ebc9e27bb9512481dcf1b6760357827a9c7f6eb15f9f82c2a679295c3`, della copia con lo spostamento `59c0560e719e604a375a18667030884062d9ea0fee5ed7316a2c27fa46430a8f`.

Al primo tentativo la stessa suite aveva letto `[false,false]` per entrambi i registri e ciascuno era passato al primo retry. Nella sonda con 6 esecuzioni sullo snapshot, a 641 px si osserva un frame con i centri a (0,0) sulla sidebar, poi al frame successivo i centri sono a (497,64;565,51) e (558,80;565,51), sui pulsanti. In entrambi i frame il documento e la tabella sono a scroll zero e i font sono già caricati. Il test finale interroga nuovamente i centri fino alla risposta di hit testing, senza click di Playwright né scroll per ottenere il risultato. I due registri passano al primo tentativo sul candidato e falliscono entrambi sulla build di base con il nuovo test, exit 1.

Dopo il rosso definitivo di Billing, il processo Playwright della prima suite ha ricevuto SIGINT. Il runner ha scritto `E2E_EXIT=130`, con 227 passed, 5 flaky, 1 failed, 2 interrupted e 478 did not run. Per questa suite parziale, gli altri retry recuperati sono stati `account-adjustments:94` (15 s di attesa Mailpit), `account-statement-period:590` (URL del periodo ancora assente dopo 5 s, due retry) e `flight-log:276`. I due test interrotti erano in esecuzione al momento del segnale. Le cartelle di trace non sono complete per questa prima suite: la diagnostica separata di 641 px ha usato inizialmente il percorso di output predefinito; le successive usano ciascuna un percorso dedicato. Il log del runner della prima suite e il riepilogo sono stati conservati. Tutti i 24 PID del gruppo sono risultati terminati prima del nuovo reset. Un mirato esplorativo con CPU 4×, su un altro DB locale, aveva restituito exit 1 (3 passed e 1 timeout di login a 5 s), senza raggiungere la geometria nel caso interrotto. La riproduzione sopra proviene dalle sei esecuzioni successive sullo snapshot, tutte completate.

Le successive prove sul tree 7c73be7 includono inoltre il raggiungimento della regione tramite Tab, il nome, l'uscita nei due versi e lo scorrimento con freccia destra, oltre alla freccia giù. Comandi diagnostici su copie private con la configurazione puntata alle sole istanze loopback: `playwright test desktop-registries.spec.ts -g 'sticky header' --workers=2 --retries=0` e `playwright test empty-18-2b.spec.ts -g 'filtered admin registries' --workers=1 --retries=0`.

`TMPDIR=/tmp/am187a/gates-v2 npm run gates` sul tree finale 7c73be7: exit 0 (lint 46 s, typecheck 6 s, 2.351 test unitari in 18 s, build in 70 s). `npm run db:reset:test` sul solo database disposable: exit 0, reset e seed completati. Suite finale avviata con `E2E_REUSE_SERVER=1 TMPDIR=/tmp/am187a/full2 scripts/e2e.sh start --workers=2` alle 17:56:01 UTC.

### Esito della suite finale

713 casi. Il runner ha registrato **710 passed, 3 flaky**, tutti recuperati al primo retry, **zero skipped, failed e did not run**. Durata 28,7 minuti, `E2E_EXIT=0`. I cinque casi nuovi, il confronto desktop di Billing della 18.2b e i tre casi METAR sono passati al primo tentativo. I casi METAR usano il servizio meteo locale simulato.

| Caso recuperato | Primo tentativo, log sanitizzato |
|---|---|
| `e2e/account-adjustments.spec.ts:94` | `Expected 1 Mailpit message(s) to "[casella sintetica]" within 15000ms` |
| `e2e/mobile-reports.spec.ts:506` | Alla riga 525, controprova mobile sul clipping: `Expected: > 0; Received: 0`. |
| `e2e/mobile-self-public.spec.ts:282` | `Test timeout of 30000ms exceeded` durante la verifica del foglio di dettaglio di una transazione personale. |

I log sopra identificano l'asserzione o l'attesa fallita. Dai primi tentativi non si ricava una causa ulteriore. Il codice applicativo è rimasto lo stesso per le misure e per la suite finale.
