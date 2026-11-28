# Cambio sequenziale dell’unico indirizzo verificato

Stato BMAD **done**. Base `abd20cab`. Si applica alla prova email locale esistente.

## Criteri e piano test-first

1. Provare l’idoneità dei due scopi solo per account attivi con prova corrente. Il titolare o chi gestisce utenti avvia dalla dashboard senza indicare il nuovo indirizzo.
2. Su PostgreSQL sintetico controllare l’avvio, il destinatario di ogni intento, la convalida della nuova casella, la scadenza indipendente dei due link e la conclusione atomica. Eseguire il primo POST al minuto nove simulato, il secondo al minuto undici. Provare concorrenza, cambio superato, revoca, scadenza, conflitti canonici anche con utenti inattivi e contatti archiviati.
3. Provare con Chromium e Mailpit locale il flusso del titolare e quello assistito. GET e anteprime lasciano tutto invariato. I POST sono espliciti. Dopo il secondo POST il vecchio cookie riceve 401 e il successivo accesso usa la nuova casella.
4. Verificare il candidato immutabile con gate, regressioni, suite browser e revisione indipendente. La readiness e i PDF restano lavori successivi.

## Percorsi e confini

L’avvio dal profilo o dalla scheda Piloti accetta un POST autenticato dalla stessa origine senza corpo. Si applicano il permesso `self.read` sul proprio account e `users.manage` per l’assistenza. Il primo intento usa la casella corrente dell’account verificato. Il primo POST valido con il link del titolare crea l’intento per il solo nuovo destinatario. Ogni intento conserva il termine fissato dall’orologio PostgreSQL. Le pagine pubbliche esistenti usano il token nel frammento, lo rimuovono dal browser e richiedono il POST di conferma.

Il nuovo destinatario compare temporaneamente sul secondo intento in un campo AES-256-GCM con chiave derivata e contesto autenticato per identificativo dell’intento, account, scopo e generazione. Il worker cancella il campo al primo controllo dopo la scadenza, anche per intenti accettati o incerti. A worker fermo il dato cifrato può restare fino al controllo successivo. La scadenza del link è già effettiva. Una revoca, una sostituzione o lo switch riuscito eliminano il campo nella transazione. Un invio già affidato al relay può essere accettato dopo una sostituzione o una revoca. I controlli di conferma continuano a verificare la generazione valida.

La verifica finale serializza le scritture di titolarità, ricontrolla entrambe le caselle e la scadenza e aggiorna utente e prova insieme. Conserva la prima attivazione e il ciclo degli avvisi. La data separata dello switch permette la prima richiesta di accesso alla nuova casella anche quando un vecchio intento aveva ancora tempo residuo. Restano i budget per account, origine e volume. Le sessioni e le credenziali precedenti vengono revocate solo al completamento del cambio. Il campo storico della persona, l’associazione e la password individuale restano intatti. Un conflitto conserva l’account corrente.

## Prove di sviluppo

- `node_modules/.bin/vitest run src/server/auth/email-trial-policy.test.ts` prima del codice, exit 1. Tre test passati e nuova attesa di idoneità rossa con `expected false to be true`. Dopo l’implementazione, `vitest run src/server/auth/email-trial-policy.test.ts src/server/adapters/mail/html-templates.test.ts src/i18n/messages.test.ts`, exit 0 e 61 test passati.
- `prisma migrate deploy` e `prisma generate` sul PostgreSQL sintetico di sviluppo, exit 0. L’indice parziale per la pulizia è stato aggiunto al candidato dopo la prima prova. Il comando `psql -c 'CREATE INDEX …'` locale ha riportato exit 127, `psql: command not found`. La medesima istruzione via client Node PostgreSQL ha restituito exit 0. La verifica finale ha applicato la migrazione completa su copia indipendente.
- `AIRMANAGER_EMAIL_TRIAL=1 node --import tsx --test scripts/test-account-email-change.ts`, exit 0, nove casi senza retry o skip. Il test di concorrenza verifica che il writer effettivo di una persona indipendente e il POST finale abbiano raggiunto in ordine il lock prima del rilascio. La conferma perdente conserva la versione e il link di login precedente. Il driver pg emette un avviso di deprecazione su query concorrenti della connessione nel percorso persona.
- Un typecheck intermedio ha riportato exit 2, `TS2737: BigInt literals are not available when targeting lower than ES2020`, nel test di associazione del dato cifrato. Uso di `BigInt(1)` compatibile col target.


### Correzione del POST amministrativo o personale senza dati

Sul primo albero in revisione un POST locale vuoto, convertito dal reale `NextRequestAdapter.fromNodeNextRequest`, ha restituito `BodyStreamPresent=true BodyBytes=0` (`node` con server HTTP loopback, exit 0). La prima guardia avrebbe rifiutato l’avvio dalla dashboard con 422. La route legge il flusso fino al primo byte utile o alla sua fine e rifiuta il contenuto senza registrarlo. I due casi browser verificano il rifiuto del dato anticipato con zero intenti e poi l’avvio normale mediante il pulsante vuoto.

Il riesame ha inoltre rilevato che la pulizia del campo cifrato scaduto prendeva un lock sull’intento prima del recupero del lock utente di un handoff abbandonato. Il worker ora effettua la pulizia con un solo UPDATE autonomo prima della transazione di prenotazione. Il suo lock termina prima della lettura del canale, del recupero delle lease e di ogni prenotazione successiva. Il test PostgreSQL verifica la normale ripresa di un handoff abbandonato, con stato incerto, un solo tentativo e cancellazione del candidato scaduto.

Il riscontro Chromium sull’albero precedente (`scripts/e2e.sh start --config=…/precheck.cjs -g 'own profile'`) ha confermato `Expected: 200; Received: 422`, E2E_EXIT=1, un fallimento senza retry. Sul candidato corretto i due test della route e i dieci casi PostgreSQL hanno restituito exit 0. Il titolare può avviare il cambio dalla shell anche senza persona collegata. La UI assistita in Piloti opera sulle persone collegate; per un account senza persona il contratto autenticato per ID conserva lo stesso controllo di gestione utenti.

## Chiusura e riesame indipendente

Approvato il tree applicativo `76678724869a053d482dc27b6a12a332b331473f` in un contesto separato. Il riesame ha confermato la lettura del corpo effettivo del POST, la pulizia in autocommit prima dei lock del worker e la prova temporale permanente, che controlla il primo termine già trascorso e il secondo ancora aperto con lo stesso orologio PostgreSQL. Nessun rilievo bloccante residuo.

| Verifica | Risultato |
| --- | --- |
| `npm run gates` | Exit 0. Lint, typecheck, 2.413/2.413 unitari e build. |
| `node --import tsx --test scripts/test-<nome>.ts` su database sintetici | Tutte le otto esecuzioni exit 0. Credential-mail 27, expiry-renewals 16, account-email-uniqueness 2, single-account-address 13, verification-invite 31, account-reactivation 11, access-security 18, account-email-change 10. Totale 128/128, zero skip. |
| `scripts/e2e.sh start`, Chromium, trial spento | E2E_EXIT=0. Dei 731 casi, 724 passati al primo tentativo, uno al primo retry e sei saltati. Il primo tentativo di «Le mie scadenze» ha riportato `expect(locator).toBeVisible() failed; element(s) not found` in `expiry-dashboard.spec.ts:199`. La causa resta indeterminata. |
| `scripts/e2e.sh start … -g 'a scadenza registered for the seed pilot' --repeat-each=3` | E2E_EXIT=0. Tre ripetizioni passate su un database separato. |
| Chromium con trial acceso | E2E_EXIT=0. 9/9 al primo tentativo. Comprende i sei casi esclusi a trial spento: cambio IT ed EN, riattivazione IT ed EN, invito con accesso e retry con scadenza originale. |
| Chromium offline | E2E_EXIT=0. 5/5 sul fallback personale senza worker o relay. |
| Cronometro reale, copia sintetica aggiornata da `abd20cab` | E2E_EXIT=0, 1/1. Il primo POST ha accodato il secondo link a +543,0 secondi. La conferma finale a +662,3 secondi è riuscita: il secondo intento aveva TTL autonomo di 600 secondi. La sessione precedente ha ricevuto 200 fino alla conferma e 401 dopo. È riuscito il login alla nuova casella. |
| Comunicazione successiva e ritorno alla modalità precedente | La rettifica di saldo ha prodotto una sola email nel sink per il nuovo indirizzo; zero per la casella vecchia o il recapito storico della persona. Tre recapiti e tre token sintetici cercati nei log applicativi e del worker: zero occorrenze. Un altro browser ha usato la medesima password personale con il nuovo indirizzo, worker fermo e relay locale chiuso, 1/1. Con trial spento dopo il cambio, la lettura di controllo conferma il nuovo indirizzo e la prova persistiti, comando indisponibile e instradamento operativo legacy. Durante questa lettura non è stato eseguito alcun invio. |

Una preparazione della fixture `INSERT INTO "Account"` aveva restituito exit 1 e SQLSTATE 23502, campo `updatedAt` obbligatorio. Aggiunto il timestamp alla fixture: exit 0.

Il collaudo ha usato Chromium, PostgreSQL sintetico e Mailpit loopback senza inoltro. Restano fuori dalla prova client email e dispositivi fisici. Un messaggio già passato al relay resta nei limiti temporali documentati sopra. Il prossimo passo è la readiness, seguita da Unicode e rimozione della sola colonna «Ambito» dal PDF Scadenze.
