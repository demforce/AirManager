# Invito verificato e accesso con link email · prova isolata

Stato BMAD: done. Base `8a8db640e377c76ecb2b57a4453a36148aaeb989`.

L’admin sceglie esplicitamente l’invito con verifica quando crea l’accesso in Piloti. La creazione dell’account, il suo indirizzo da verificare e la prenotazione dell’invito fanno parte della stessa transazione. Una normale creazione amministrativa continua a produrre l’invito password. Nessuna riga di verifica viene aggiunta agli account esistenti. La verifica richiede un POST consapevole e lascia il browser disconnesso. Il login richiede un secondo messaggio con credenziale distinta e una conferma esplicita dell’indirizzo prima della creazione della sessione Auth.js.

| Criterio | Riscontro verificato |
|---|---|
| Nessun autoregistro pubblico o verifica implicita | Account pendente, non iscritto, storico e disattivo, risposte uniformi, zero nuovi utenti o invii login. |
| Un indirizzo e un solo destinatario | Form con un solo campo email, esclusione di liste, nomi e controlli. Busta SMTP verificata contro la riga dell’account e capture locale. |
| Scopi distinti, lettura inerte, sessione unica | Aprire due anteprime, verificare il mancato consumo e confermare in due browser. Una sola sessione può aprire la risorsa protetta. |
| Scadenza assoluta | Dieci minuti dal tempo PostgreSQL della richiesta accolta. Retry temporaneo con la scadenza originaria, nessun retry dopo una risposta persa. |
| Limiti condivisi | Origini distinte, stessa identità canonica, limite aggregato e rifiuto di nuove prenotazioni senza revoca del link esistente. |
| Compatibilità | Login legacy e password individuale admin anche con SMTP spento. Modalità di prova disabilitata per default. |

## Attivazione per il collaudo

Solo in un ambiente disposable impostare `AIRMANAGER_EMAIL_TRIAL=1` sia sul processo web sia sul worker. Usare lo stesso `DATABASE_URL` e `TEST_DATABASE_URL` con PostgreSQL locale dedicato denominato airmanager_test o airmanager_e2e e un `APP_URL` loopback corrispondente all’origine del browser. Avviare Mailpit locale senza inoltro e il worker di prova locale descritto nel runbook della coda. Applicare prima le migrazioni al database sintetico. Senza attivazione la pagina pubblica è indisponibile e il provider email non viene registrato. Un worker ordinario non prende in carico i nuovi scopi con la modalità spenta. Il canale di prova consegna solo a un relay loopback. L’uscita dalla modalità impedisce anche l’uso di sessioni emesse dal provider sperimentale.

Nella scheda di creazione accesso scegliere «Invita con verifica email (prova)». L’invito di verifica conserva la finestra inviti di sette giorni. Dopo la conferma, dalla pagina di login scegliere «Accedi via email». Il browser rimuove il frammento del link dalla barra degli indirizzi. L’app usa solo l’hash nel database. La mail di collaudo è per sua natura leggibile in Mailpit. Proteggere il capture come una casella di posta.

## Confini e limiti

Il modulo pubblico riceve una singola voce email. Il server convalida prima i caratteri, poi normalizza maiuscole e spazi esterni. La richiesta per un indirizzo sintatticamente valido riceve sempre lo stesso riscontro, senza header di quota personali. Il destinatario viene dal database. Il worker verifica nuovamente account e scopo prima di affidare il messaggio al trasporto e subito prima del comando di invio. Un’email già affidata a SMTP può arrivare dopo una disattivazione o una scadenza. La conferma ricontrolla i requisiti sotto lock, senza tenere lock durante SMTP. Il trigger esistente revoca credenziali e richieste al cambio di identità.

| Finestra | Limite del collaudo |
|---|---|
| Richieste sintatticamente valide in 10 minuti | 5 per identità e 20 per origine, registrate con HMAC distinti. |
| Conferme in 10 minuti | Contatori distinti, 10 per identità e 30 per origine. |
| Singolo account | Una sola emissione nel periodo di validità di dieci minuti, tre emissioni in un’ora. Anche un esito incerto conserva la finestra. |
| Intero club | Dieci nuove emissioni login in venti minuti. Il massimo di tre tentativi SMTP per emissione e la validità di dieci minuti limitano a 30 gli affidamenti login in qualunque finestra di dieci minuti. |

La prenotazione usa un lock PostgreSQL condiviso tra le istanze. I limiti aggregati riguardano solo il login email. Le origini dirette condividono un bucket prudenziale. Un proxy fidato può passare un solo IP e la chiave facoltativa `AIRMANAGER_TRIAL_PROXY_SECRET` tramite `X-AirManager-Proxy-Key`. Deve rimuovere gli header in ingresso dal client e riscriverli sul collegamento privato verso l’app. La chiave deve avere almeno 32 byte e restare esclusa da diagnostica e log del proxy. In assenza di autenticazione del proxy gli header inoltrati vengono ignorati. I client dietro lo stesso NAT condividono la quota e possono risentirne. La protezione non garantisce tempi HTTP identici tra operazioni DB diverse.

Il routing delle comunicazioni, la migrazione dei legacy, il cambio indirizzo e il passaggio in esercizio restano nelle fasi successive.

## Pagina di conferma e fasi successive

I link provengono esclusivamente da APP_URL configurato. In questa prova sono ammessi solo origin loopback. Prima di un futuro rilascio pubblico sarà necessario un origin HTTPS esplicito e fidato. Il codice non deriva mai il dominio da Host o X-Forwarded-Host. La pagina restituisce no-store e no-referrer e usa solo risorse dell’app. Il GET lascia il token nel frammento, fuori dalla richiesta HTTP. La conferma avviene tramite POST same-origin o Auth.js con CSRF. Al proxy registrare solo metodo, percorso senza query, esito e correlazione. Escludere query string e frammenti, body POST, header Cookie/Set-Cookie, Authorization, chiave del proxy e credenziali dai log, dal tracing e dai report di errore. Verificare anche la redazione dei vecchi percorsi invito/reset che usano una query. Nessun intervento sugli ambienti reali.

Prima dell’attivazione pubblica occorre una story separata per password admin personale lunga e unica, rallentamento progressivo senza blocco automatico permanente, monitoraggio dei picchi di richiesta e del worker fermo, sospensione mirata dei soli link login. Gli avvisi di sicurezza saranno sempre email, raggruppati e deduplicati verso destinatari interni appropriati e verificati, indipendenti dagli interruttori operativi. Conservare l’intento in coda durante il guasto e riprendere dopo il ripristino con retry sicuri. Distinguere accettazione del trasporto e recapito. Un segnale in app è supplementare. Preservare fallback, posta operativa e alert durante una sospensione dei login. Nessun lavoro su DNS o antispam del dominio. Valutare CAPTCHA solo in presenza di dati che ne mostrino la necessità.

Il prossimo sotto-step concordato è il [template HTML per tutta la posta applicativa](template-html-email.md). Il rafforzamento del fallback, gli avvisi e il monitoraggio rimangono anch’essi prerequisiti per l’attivazione pubblica.

### Compatibilità delle password nel collaudo

La password già predisposta per un amministratore iscritto al collaudo viene accettata esclusivamente dall’ingresso admin, anche quando il collaudo è spento. Il form password storico continua a servire gli account già esistenti. L’emissione e il consumo di un reset per un amministratore iscritto richiedono la modalità di prova e il suo indirizzo verificato. Anche i suoi reset devono usare un relay loopback. La perdita del ruolo chiude l’accesso con password alla prima richiesta protetta successiva.

Per ripetere la prova funzionale, su PostgreSQL locale dedicato `airmanager_test` con entrambe le URL impostate, applicare le migrazioni e avviare `node --import tsx --test scripts/test-verification-invite.ts`. Il collaudo integrato usa `npm run gates` e la suite Playwright con Mailpit e il worker locale. I test browser dedicati sono `e2e/email-access.spec.ts` e `e2e/email-access-retry.spec.ts`.

## Evidenze del collaudo

Base `8a8db640e377c76ecb2b57a4453a36148aaeb989`. Il candidato di codice e test approvato è il tree `528bbcfaa6b1765fd7e76db778d3b89cbb8dd8d7`. PostgreSQL, Mailpit, relay con risposte controllate e browser sono locali. L’abilitazione in CI riguarda il solo database E2E disposable.

| Prova | Risultato |
|---|---|
| `npm run gates` | Exit 0. Lint con 0 errori, typecheck, 2.380 test unitari e build di produzione. |
| `node --import tsx --test scripts/test-verification-invite.ts` | Exit 0. 13 passati, zero skip. Controlla anche i budget condivisi, la scadenza al pre-invio, il singolo envelope, il reset dell’admin iscritto e il relay locale. |
| `node --import tsx --test scripts/test-credential-mail.ts` su database di test appena inizializzato | Exit 0. 27 passati, zero skip. Concorrenza, recupero worker, sostituzione, conferma persa e retry. |
| `node --import tsx --test scripts/test-expiry-renewals.ts` | Exit 0. 16 passati, zero skip. |
| Chromium mirato, `scripts/e2e.sh start --no-deps --workers=1 --retries=0 --grep 'verified invitation and one email session\|keeps the original deadline'` | Exit 0. Due prove sui form e sulla posta in Mailpit. Due browser confermano lo stesso invito e poi lo stesso login. Ogni credenziale ha un solo vincitore. Il secondo caso attraversa un 451, il retry accettato e la conferma a scadenza simulata. |
| Chromium mirato finale, `scripts/e2e.sh start --no-deps --workers=2 --retries=0 --grep 'new editors at\|edit editors, three filters\|verified invitation and one email session\|keeps the original deadline'` | 10 passati in 57,4 s, nessun retry o skip. Comprende creazione e modifica a 320 e 375 px nei due temi, con soglia 44 px. |
| Mirato storico dopo la precisazione delle label, `scripts/e2e.sh start --no-deps --workers=2 --retries=0 'user-management.spec.ts\|credential-mail.spec.ts\|email-access-retry.spec.ts'` | Exit 0. Dieci casi passati in 1,4 minuti, nessun retry o skip. |
| Suite completa finale, `scripts/e2e.sh start --workers=2`, poi `scripts/e2e.sh status` | E2E_EXIT=0. Tutti i 726 casi Chromium passati in 29,6 minuti al primo tentativo, senza skip. Nuovo DB sintetico inizializzato con `npm run -s db:reset:test`. Mailpit e worker su loopback, meteo sintetico. |
| Controllo dei segreti dopo la suite | Exit 0. Tre credenziali distinte lette nel capture. Nessuna corrispondenza in chiaro su 332 righe complessive in AuthToken, CredentialMail, MailAttempt, MailChannel ed EmailTrialRequest o nei log web, worker e Playwright di questo run. |
| Modalità spenta | Il server avviato con flag 0 espone i due provider password, rende il login email HTTP 404 e omette il link di navigazione. Con relay rifiutante e worker spento, i 5 casi di `admin-password.spec.ts` passano in 47,5 s senza retry o skip. Controllo prima e dopo: zero intenti e nessun heartbeat. |

### Revisione indipendente

Il primo esame statico (tree `0793bc112ae5394a79f7a39795be177c3fe5cc3f`) ha segnalato due rilievi bloccanti. Il provider password storico ammetteva un admin del trial con password predisposta e il suo reset poteva uscire dai confini del collaudo. La correzione separa gli account iscritti al trial nel provider e confina anche il loro reset in fase di emissione, selezione del worker, invio e consumo. Le regressioni difensive verificano il declassamento, il flag spento e l’assenza di tentativi di connessione a un relay non locale. Il riesame indipendente ha approvato le correzioni e i successivi delta di accessibilità e fixture. Il prodotto provato nei run mirati sul tree `6061f1f80b35c5a9631e66460d022f4164120550` è identico al prodotto del candidato finale. Fra i due sono cambiati soltanto i selettori dei test browser. Le registrazioni di chiusura BMAD seguono i gate. L’esecuzione delle suite è stata effettuata dal contesto di sviluppo.

### Diagnostica di sviluppo

| Comando o prova | Exit e diagnostica sanitizzata | Risoluzione |
|---|---|---|
| TDD, `node --import tsx --test scripts/test-verification-invite.ts` sulla base | 1 · atteso `VERIFY_EMAIL`, ottenuto `INVITE` | L’opzione esplicita crea la prenotazione con scopo di verifica. |
| Stessa suite sul primo relay sintetico | 1 · differenza sulle parentesi angolari del comando RCPT | Asserzione sul valore di busta SMTP rappresentato dal relay. |
| `npm run gates` preliminare | 1 · import Zod non ammesso e TS2345, fixture d’ambiente senza NODE_ENV | Zod esteso del progetto e input del controllo di isolamento tipizzato. |
| `node --import tsx --test --test-name-pattern='direct requests' scripts/test-verification-invite.ts` | 1 · `Invalid URL` per un IPv6 con zona | Il bucket diretto gestisce i valori non ammessi; gli IPv6 ammessi sono canonicalizzati. |
| `node --import tsx --test --test-name-pattern=provision scripts/test-verification-invite.ts` | 1 · due attese di diniego fallite prima delle correzioni | Isolamento del provider e del reset degli admin del trial. |
| `npm run -s typecheck` | 2 · TS2345, fixture parziale senza locale | Aggiunto il locale della fixture. |
| Prima esecuzione Chromium mirata | 1 · Playwright richiedeva opzioni di trace e screenshot a livello file | Spec dedicata nel progetto con impostazioni SMTP serializzate. |
| Seconda esecuzione Chromium mirata | 1 · `page.waitForResponse: Test ended` nel caso simultaneo | Il driver ora attende l’intestazione del nuovo form prima di compilare il campo email dopo la navigazione. |
| Prima suite completa, `scripts/e2e.sh start --workers=2` | Quattro combinazioni di viewport e tema hanno misurato 17 px sulla label del nuovo invito nel form Piloti. Fallimento anche nel percorso di modifica. Arresto esplicito con SIGTERM dopo la conferma del difetto. | Entrambe le label usano ora il layout flex delle checkbox vicine e la regola mobile esistente da 44 px. |
| Mirato touch su seed vuoto, `scripts/e2e.sh start --no-deps --workers=2 --retries=0` con i quattro gruppi sopra | Exit 1, 6 passati e 4 timeout su `logbook-new-button`, nascosto quando il Registro è vuoto sul telefono. | Il test prende il pulsante visibile che apre lo stesso editor in Registro voli e Pianificazione. Asserzioni e soglie conservate, nuovo riesame indipendente approvato. |
| Suite completa successiva, `scripts/e2e.sh start --workers=2` | Exit 1. 653 passati, 1 flaky, 5 falliti, 67 dipendenti non eseguiti. Cinque casi di gestione utenti: `strict mode violation: getByLabel('Email') resolved to 2 elements`. | I due helper degli inviti legacy selezionano per nome esatto il campo Email. Nessuna modifica del prodotto per questi cinque fallimenti. |
| Regressione coda su DB riutilizzato | 1 · `Start with a clean credential queue` (una riga del test precedente) | Ripetizione su DB sintetico reimpostato con `npm run -s db:reset:test`. |

La verifica del browser riguarda Chromium e il traffico dal client sintetico. Le prove controllano origine, assenza di risorse terze osservate, policy cache e referrer, assenza di header di quota personali e conferma esplicita. Non attestano l’esito di consegna a una casella reale, tempi di risposta identici o la configurazione effettiva di un proxy di produzione.
