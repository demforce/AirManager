# Riscontri funzionali del milestone pre-cutover

Base `6dd3a476e976830dcec59070dc7bd39d3dff4e59`. Le prove usano PostgreSQL 16, dati sintetici, Chromium e Mailpit su loopback con inoltro disattivato. Le durate di pausa e scadenza sono verificate con date di fixture. Le attese del trasporto e le conferme SMTP attraversano connessioni locali reali. I log condivisi riportano soltanto esiti, conteggi e fasi.

## Preparazione e migrazione

L’archivio Git della base è stato estratto in una directory temporanea. Dal suo schema sono stati generati il client Prisma e un database e2e con i seed della base. Sono stati aggiunti un admin verificato di prova, un token già emesso e un intento di recupero in coda. Sono stati confrontati prima e dopo la migrazione i campi rilevanti di cinque account, un token, un intento, un record di verifica e una riga di stato del canale. Il confronto comprendeva hash delle credenziali, versioni di sessione, scadenze, destinatari canonici e stato. L’esito aggregato coincideva senza stampare alcun valore sensibile. La migrazione inizializza l’invio login come consentito, il limite delle generazioni sospese a zero e le tre nuove tabelle vuote.

Comandi eseguiti sulla copia sintetica: `npx --no-install prisma generate`, `npm run -s db:reset:test` sulla base, confronto della fixture, `npx --no-install prisma migrate deploy` sul candidato e secondo confronto. Tutti con exit 0. Un successivo reset ha separato il collaudo dell’upgrade dai dati delle suite.

## Matrice funzionale

| Percorso | Riscontro |
|---|---|
| Form di reset da browser disconnesso | Il test su un amministratore provvisto di una password storica di 12 caratteri prova l’accesso, il tentativo di impostare un’altra password corta, il riutilizzo della propria password corrente e il completamento con una nuova password personale. Verifica anche lo stato del token dopo il rifiuto e la revoca della sessione precedente dopo il reset riuscito. |
| Impostazioni → Sicurezza degli accessi | Un admin entra dal fallback e attiva la pausa. Il link già accettato in Mailpit continua ad aprire una sessione con la conferma esplicita. Una richiesta già in coda viene soppressa. Una richiesta durante la pausa riceve l’acknowledgement pubblico generico. Per il pilota autenticato l’API di amministrazione restituisce 403. |
| Altri invii durante la pausa | Dal pulsante in Impostazioni arriva il messaggio bilingue al contatto sintetico del club. Una creazione utente produce l’invito. Una rettifica di saldo produce l’avviso al titolare. Le tre catture sono distinte. Dopo la riapertura, un giro del worker non recupera i login soppressi. Una nuova richiesta ammissibile produce una sola cattura. |
| Monitor senza worker | Due avvii distinti di `npm run security:monitor -- --once` osservano uno stesso picco sintetico e un worker mai partito oltre la finestra di avvio. Rimangono due incidenti e quattro intenti (due admin idonei), con heartbeat del worker ancora assente. |
| Guasto e ripartenza | Con gli invii login sospesi e le sei notifiche operative spente, gli avvisi sopravvivono a un rifiuto locale di connessione e al riavvio del processo. I giri immediati rispettano il backoff. Alla riapertura della stessa porta, con il solo prossimo tentativo reso dovuto nel DB di prova, quattro invii ricevono accettazione SMTP. Il giro seguente non li ripete. |
| MIME e destinatari | Le quattro catture Mailpit coprono due tipi di incidente in IT/EN. Ogni messaggio ha un destinatario, oggetto e corpo localizzati, wordmark AirManager, parti plain e HTML coerenti e nessun CC, BCC, link o asset remoto. Zero catture per gli account inattivi, non verificati, non amministrativi o con indirizzo diverso da quello verificato. |

## Diagnostica sanitizzata

| Comando o fase | Exit | Riscontro e correzione |
|---|---:|---|
| `node /tmp/am-precutover/password-ui.cjs base` sulla build pubblicata | 1 | `expected 422 for short replacement; got 200`. La prova rossa dimostra il comportamento originario del form con un admin sintetico. |
| Primo test della nuova suite funzionale | 1 | Modulo di monitoraggio ancora assente, come atteso nel primo giro test-first. |
| Primo controllo Mailpit della suite estesa | 1 | Il flag dell’inoltro era stato cercato in `/info`. La fixture ora controlla `MessageRelay.Enabled` in `/api/v1/webui`. |
| `node /tmp/am-precutover/alert-proof.cjs`, prima versione della fixture | 143 | Il processo di prova aspettava il figlio in modo sincrono mentre doveva servire anche il relay locale. Interrotte soltanto fixture e processo figlio. Con attesa asincrona, il relay ha accettato i quattro messaggi. |
| `node --import tsx /tmp/am-precutover/pause-ui.ts`, primo giro | 1 | `admin in Settings: TimeoutError`. Il driver ora seleziona esplicitamente l’admin del seed e attende il form amministrativo pronto. La ripetizione completa ha restituito exit 0. |
| `git diff --cached --check`, primo staging | 2 | `migration.sql:59: new blank line at EOF`. Rimossa la riga finale superflua e ripetuta la migrazione sulla copia della base. |

## Primo candidato e correzioni richieste

Il primo tree `67edca2e6ad619a0f28569ddd0d63c4fd55e51a0` aveva superato i quattro gate, con 2.403 unit, e 66 casi su database sintetico. La revisione indipendente ha richiesto cinque correzioni.

| Rilievo | Verifica di regressione sul candidato corretto |
|---|---|
| Una configurazione SMTP poteva essere sostituita fra lettura e invio dell’avviso. | Due relay su loopback. Salvataggio della nuova configurazione durante la preparazione o il saluto del primo. Il vecchio relay non riceve destinatari e il secondo accetta una sola volta. |
| Il monitor poteva vedere un heartbeat fresco mentre erano in ritardo solo gli avvisi di sicurezza. | Un avviso dovuto da quattro minuti apre l’incidente. Un tentativo con backoff futuro rimane escluso. Due scansioni dello stesso ritardo producono un solo incidente. |
| Le due rappresentazioni testuali di un IPv6 attestato potevano separare il conteggio dei due ingressi password. | Contatori esistenti, pseudonimi e nuove prenotazioni sono letti per la medesima origine attestata. Il controllo per identità rimane attivo in assenza di un’origine attribuibile. |
| I tentativi di invio degli avvisi potevano superare la capacità SMTP condivisa con credenziali e prova del club. | Le prenotazioni di sicurezza partecipano alla contabilità fisica del canale. Le prove incrociano i due tipi di invio nelle due direzioni, con un processo distinto e relay di test in attesa. |
| La selezione di un lavoro prima di una modifica concorrente poteva consumare un ulteriore tentativo di casella o dare un esito dipendente dall’ora della scansione. | Il claim confronta il numero del tentativo. Il completamento controlla la scadenza della lease sull’orologio del DB. Il quarto rifiuto temporaneo viene escluso e, dopo una lease scaduta, solo una conferma positiva dello stesso tentativo può aggiornare l’esito incerto. |

Nei test rossi delle correzioni, `node --import tsx --test scripts/test-access-security.ts` ha restituito exit 1. Sul primo relay si osservava un destinatario invece di zero, mancava l’incidente per l’arretrato e tre asserzioni di capacità o lease distinguevano il comportamento precedente. Il mirato Vitest del throttle ha restituito exit 1 per i due bucket IPv6. Una fixture intermedia attendeva il lock dello scanner anziché quello del claim. È stata corretta per esercitare la preparazione e il claim interessati. I messaggi pubblici e i log condivisi escludono i dati delle credenziali.

Dopo le correzioni funzionali, `npm run gates` sul tree `b65cce8d8bc06d557f3fae379f09929a91bad656` ha restituito exit 1. TypeScript, 2.404 unit e build erano verdi. Il lint segnalava in `scripts/test-access-security.ts:262,267` che l’helper di fixture `use` veniva interpretato come un hook React. La correzione cambia soltanto il nome in `saveRelayPort` nella dichiarazione e nelle due chiamate. L’ESLint del file ha restituito exit 0. Il primo mirato dei due relay si è sovrapposto al reset della copia di prova e ha restituito exit 1 con `The table public.SecurityIncident does not exist`. Dopo il completamento del reset, il medesimo caso ha superato 1/1 con exit 0.

Il revisore in un contesto separato ha approvato il tree `f61bb52cabca8076940df4fb7ee7c33525d5a078`. Il riesame ha verificato le cinque correzioni, la rinomina nell’ultimo diff, il blob del test, ESLint e l’assenza di errori in `git diff --check`.

## Prove sul candidato approvato

| Comando o percorso | Exit | Risultato |
|---|---:|---|
| `npm run gates` con Node 22 | 0 | Lint, TypeScript, 2.404 unit test e build di produzione. |
| `node --import tsx --test scripts/test-access-security.ts` | 0 | 18/18 prove funzionali. Incluse due istanze, scadenza della prenotazione, invio incerto, cambio di relay, autorizzazione, gestione del picco e configurazione preesistente. |
| `node --import tsx --test scripts/test-credential-mail.ts` | 0 | 27/27 regressioni della coda. |
| `node --import tsx --test scripts/test-expiry-renewals.ts` | 0 | 16/16 regressioni dei promemoria. |
| `node --import tsx --test scripts/test-verification-invite.ts` | 0 | 13/13 regressioni di verifica e login. Ogni suite di integrazione è partita da un DB sintetico reinizializzato. |
| `node /tmp/am-precutover/alert-proof.cjs` e `python /tmp/am-precutover/check-alert-mime.py` | 0 | Monitor e worker lanciati da processi distinti. Relay rifiutante, poi ripristinato sul medesimo indirizzo locale. Quattro accettazioni verificate con sorgente MIME. |
| `node --import tsx /tmp/am-precutover/pause-ui.ts` | 0 | Sequenza completa di pausa, consumo del link preesistente, tre invii indipendenti e ripresa, descritta nella matrice. |
| `scripts/e2e.sh start --config=/tmp/am-precutover/offline.cjs --workers=1 --retries=0` | 0 | Cinque casi del fallback, 5/5 in 23,3 s. Un amministratore ha salvato e riletto un pilota con worker spento e relay irraggiungibile. Confermati rifiuto per ruoli non idonei, revoca al declassamento, disattivazione e reset. Entrambi i provider password erano disponibili e la pagina del trial rispondeva 404. |
| `node /tmp/am-precutover/password-ui.cjs candidate` a posta spenta | 0 al secondo giro | Nel primo giro il driver ha restituito exit 1, `historical personal credential, offline: TimeoutError`. Dopo l’attesa esplicita del form pronto sono passati il login con password storica di 12 caratteri, 422 per la nuova corta e per il riuso, il reset con una nuova credenziale di 32 caratteri, la revoca della sessione e il nuovo login. Prima e dopo la prova, relay locale rifiutante, zero intenti di posta credenziale e nessun heartbeat. |

Per ripetere le prove persistenti nel repository, usare i quattro file di test elencati con i guard del database di integrazione e, in Chromium, `e2e/access-security.spec.ts` e `e2e/admin-password.spec.ts`. Le prove supplementari in directory temporanea hanno attivato i percorsi applicativi e i comandi del monitor e del worker indicati nella matrice. Per ripetere la prova offline avviare una build di test su loopback, con trial spento, un DB dedicato appena inizializzato, relay locale indisponibile e nessun processo worker, quindi eseguire la spec admin senza il global setup che avvia il worker.

Il collaudo riguarda il simulatore SMTP e Mailpit senza inoltro. L’accettazione registrata è quella del trasporto. Prima di un cutover reale restano a carico del club il collaudo individuale delle proprie credenziali e dei destinatari verificati e la supervisione indipendente dei due processi. [Procedura operativa](../../../../docs/operations/credential-mail.md)

La prima suite completa sul tree `f61bb52` ha concluso in 30,1 minuti con 724 passati al primo tentativo, tre al primo retry e zero skip, exit 0. I casi erano il filtro di periodo di «Il mio conto» (attesa URL di cinque secondi), il cambio lingua sul form amministrativo (titolo inglese ancora assente dopo cinque secondi) e il controllo mobile dei report (altezza iniziale misurata 0 px, soglia 43,5 px). La prima ripetizione di questi tre casi su DB fresco, con `scripts/e2e.sh start --no-deps --workers=1 --retries=0`, ha restituito exit 1, due passati e un fallito. Nel caso admin lo snapshot mostrava il titolo inglese del login ordinario. Il selettore di lingua è disponibile anche sulla pagina di partenza. La spec ora aspetta sia l’URL con modalità admin e callback corretti, sia il titolo italiano del form appena aperto, prima di cambiare lingua. Mantiene le verifiche su metodo, destinazione e passaggio all’inglese. Il diff successivo riguarda esclusivamente questa sincronizzazione del test.

Nel secondo giro mirato sul tree `f04edad` il caso amministrativo è passato. Gli altri due casi hanno restituito exit 1 per la selezione, un passato e due falliti. In «Il mio conto» lo snapshot mostrava ancora il valore iniziale del campo Dal e l’errore di intervallo. In Statistiche il contenuto mostrava «Caricamento…» alla misura di 0 px. La controprova su una copia della base originale `6dd3a47` con i due test originali, build e DB separati, ha superato 4/4 esecuzioni con `scripts/e2e.sh start --workers=1 --retries=0 --repeat-each=2` e la selezione di quei due casi. In quel controllo il difetto intermittente non si è manifestato.

Il tree finale `f082b22e8019b2afc18e7285ef65f916e11fcb1b` aggiunge due attese nei test. L’estratto conto verifica l’interattività del calendario e i valori di entrambi i campi prima dell’unico submit. In Statistiche il test attende il controllo «Mese» visibile e ne misura l’altezza effettiva. Mantiene anche le verifiche sulla classe del selettore, sui 44 px CSS e sui 43,5 px effettivi. Queste modifiche e quella al test admin riguardano esclusivamente le spec Chromium. Codice applicativo, migrazione, prove PostgreSQL e client di posta coincidono con il candidato verificato nelle prove sopra. Il revisore indipendente ha approvato il tree finale. Il riesame ha controllato i contratti dei test e `git diff --check` dalla base, exit 0.

## Suite Chromium completa

`E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2` sul database e2e reinizializzato e sulla build approvata. Exit 0 su 727 casi Chromium, 726 passati al primo tentativo, uno passato al primo retry e zero skip. I tre casi per i quali erano state stabilizzate le attese sono stati eseguiti anche due volte ciascuno su DB dedicato, con un solo worker e zero retry. Tutti e sei i passaggi hanno superato le asserzioni originali.

Al primo tentativo di `e2e/aog-impact-email.spec.ts:746`, il controllo sul doppio tocco prima dell’archiviazione ha riportato `archive-confirm: element(s) not found` entro 5.000 ms. È passato al primo retry.

La selezione indipendente del caso flotta su database appena reinizializzato, `scripts/e2e.sh start --workers=1 --no-deps --retries=0 e2e/aog-impact-email.spec.ts:746`, ha superato 1/1 in nove secondi, exit 0. La causa del primo timeout resta indeterminata. Sul tree finale sono state ripetute anche le quattro suite PostgreSQL, con 74 passati, zero fallimenti e zero skip.
