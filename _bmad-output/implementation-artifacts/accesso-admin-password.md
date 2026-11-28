# Accesso amministratori con password individuale · fase 1
**Stato BMAD: done.** Base `24162d3c34f4c69a9cfd88d55d96bb6c0e0f21f6`.

Come amministratore attivo voglio poter accedere da una nuova sessione e lavorare anche quando relay e worker sono fermi. Il percorso ordinario continua a servire tutti i ruoli durante la transizione.

| Criterio | Prova richiesta |
|---|---|
| Ingresso esplicito IT/EN e autorizzazione sul server | Eseguire il login dal form dedicato, salvare un pilota e rileggere il registro. Verificare il rifiuto generico con ruolo ordinario o account disattivato. |
| Sessione revocata alla prima lettura protetta | Rimuovere il ruolo o disattivare un account di prova. Verificare HTTP 401 immediato e anche dopo il ripristino dell’account. Ripetere dopo il normale reset password. |
| Compatibilità e privacy | Condividere Argon2id e limiti ai tentativi con il login storico. Conservare le sessioni storiche e i limiti maturati. Verificare i campi ammessi nell’evento di audit. |
| Continuità senza posta | Test Chromium da browser disconnesso con database sintetico, relay di prova indisponibile e nessun worker associato. |
| Preparazione operativa | Per ogni admin attivo controllare individualmente il possesso della password mediante accesso completo e operazione consentita. |

## Prima del futuro passaggio al login via email

L’incaricato del club inventaria gli account amministrativi nominativi e annota chi ha completato la prova, quando e con quale esito. Un hash presente indica che una password è stata impostata. Solo il titolare può verificarne il possesso con una sessione nuova. Se la password manca o è dimenticata, completare il normale invito o recupero mentre la posta funziona, quindi riprovare. Conservare solo identificativo interno ed esito della prova. Non richiedere o annotare la password. Tenere disponibile un secondo admin verificato. Rinviare la transizione se manca un amministratore in grado di entrare senza email.

Un altro admin con la propria credenziale può ripristinare la posta e consentire il recupero ordinario del titolare. La perdita simultanea dell’ultima password e della posta richiede una decisione separata del club. I link di accesso, la verifica dell’indirizzo unico e la migrazione appartengono a fasi successive.

## Implementazione e revisione

Il provider Auth.js `admin-password` imposta nel JWT la versione amministrativa soltanto dopo la verifica server di password, ruolo e stato attivo. Le sessioni prive del nuovo campo conservano la verifica periodica storica. Una sessione del fallback confronta a ogni lettura protetta il ruolo, l’attivazione, la persona collegata, la versione della password e la versione amministrativa. Il servizio utenti incrementa quest’ultima nella stessa scrittura che disattiva l’accesso. Una successiva riattivazione richiede un nuovo login. Il controllo Node applica questi vincoli anche alle API.

I tentativi sui due ingressi condividono le soglie preesistenti per identificativo e IP e lo stesso lock per identificativo. I contatori del fallback usano pseudonimi HMAC distinti per email e IP. I conteggi e l’azzeramento dopo successo riconoscono anche le righe legacy. L’evento applicativo di accesso riporta tipo, ora UTC, esito e, in caso di successo, ID interno. I vecchi record operativi del throttle mantengono il formato storico. La diagnosi del fallback evita di propagare al logger di Auth.js errori grezzi del database o del provider.

La revisione indipendente Astra xhigh ha esaminato la compatibilità fra i due provider, il limite condiviso, la revoca duratura e i confini della diagnostica. Sul primo tree ha chiesto di confinare gli errori interni prima che arrivassero al logger di Auth.js. La correzione protegge anche l’errore durante la rilettura delle sessioni fallback. Riesame conclusivo approvato sul tree `cfdfaf8aaf13fb943504605044e2b3126b267b5a`.

## Prove e diagnosi

| Comando o prova | Exit | Esito sanitizzato |
|---|---:|---|
| `vitest run src/server/auth/{authorize,jwt-active-check,login-throttle}.test.ts`, RED sulla base | 1 | 6 falliti e 35 passati. Il risultato del pilota e i JWT erano valorizzati dove il test attendeva null. Il contatore conservava l’indirizzo esplicito. |
| Stesso gruppo con `src/server/services/users.service.test.ts`, primo GREEN parziale | 1 | 58 passati, 1 fallito. L’asserzione storica sulla forma esatta della scrittura non prevedeva il contatore amministrativo. Aggiornata mantenendo l’asserzione separata sulla versione legacy. |
| `vitest run src/server/auth/{authorize,jwt-active-check}.test.ts -t 'internal provider error\|live check is unavailable'`, RED del rilievo | 1 | I due doppi propagavano `Error: synthetic-private-diagnostic`. I 31 casi fuori selezione non sono stati eseguiti. |
| `vitest run src/server/auth/{authorize,jwt-active-check,login-throttle}.test.ts src/server/services/users.service.test.ts` dopo la correzione | 0 | 62 passati su 62. |
| Primo Chromium isolato, `scripts/e2e.sh start --config=/tmp/ap27/offline.cjs --workers=1 --retries=0` | 1 | 4 su 5 passati. Il ritorno bilingue leggeva l’URL durante la navigazione (`Expected: false; Received: true`), benché la pagina ordinaria fosse renderizzata. La prova ora attende URL, lingua e destinazione finali. Il primo integrale è stato fermato al cambio di candidato e non contribuisce al risultato finale. |
| Stesso Chromium isolato sul candidato riesaminato | 0 | 5 su 5, nessun retry o skip. Database e SMTP di test dedicati, senza globalSetup del worker. Prima e dopo il run la connessione al relay locale era rifiutata, il database non aveva override SMTP, heartbeat o messaggi credenziali. Il browser ha salvato e riletto un pilota. Declassamento e disattivazione via API applicativa, reset con token sintetico consumato dall’endpoint normale. La prima richiesta a /api/v1/me ha restituito 401. |
| `npx prisma migrate deploy` e browser sul DB di aggiornamento sintetico | 0 | Prima il seed e il login storico sulla versione di base. Dopo la migrazione, stessi identificativi, hash, ruoli, stato, versioni password e sessione del pilota ancora utilizzabile sul nuovo server. Nuovo contatore iniziale uguale a zero per tutti. Confronti eseguiti in memoria. |
| `node --import tsx --test scripts/test-credential-mail.ts` e `node --import tsx --test scripts/test-expiry-renewals.ts` | 0 | Rispettivamente 27 e 16 passati su PostgreSQL locale con trasporti sintetici, nessun retry o skip. |
| `npm run gates` sul candidato approvato | 0 | Lint, typecheck, 2.378 unit passati e build di produzione. |
| `E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2` e `scripts/e2e.sh status`, suite completa sul candidato | 0 | 724 casi, 723 al primo tentativo, 1 al primo retry, 0 skip. In `expiries-registry.spec.ts:230` il primo tentativo ha superato 90 secondi attendendo l’evento download del file Excel Currency. La causa del timeout resta indeterminata. I cinque casi del nuovo ingresso sono passati al primo tentativo. METAR sintetico, Mailpit locale e worker di suite su un DB separato dalla prova a posta spenta. |

Per ripetere la prova a posta ferma, usare il reset dedicato su un database locale nuovo, configurare il relay applicativo su una porta loopback senza listener e avviare soltanto il server web. Usare una configurazione Playwright isolata con lo stesso Chromium, la base URL del server e `testMatch: '**/admin-password.spec.ts'`. Omettere il globalSetup della suite ordinaria, che avvia intenzionalmente il worker. Prima e dopo i test controllare che non esistano override SMTP, che `MailChannel.heartbeatAt` sia nullo, che `CredentialMail` sia vuota e che la porta rifiuti la connessione. Nel log della prova finale i quattro eventi di accesso consentito e i tre rifiuti contenevano esclusivamente i campi previsti.

Nell’ambiente Cloud il primo tentativo di reperire PostgreSQL locale tramite `npm pack` è uscito 1 per la cache predefinita non scrivibile. La selezione `@16` non risolveva la versione prerelease del pacchetto (exit 1). La prova ha usato la cache del workspace e PostgreSQL 16.16 su una porta dedicata. Dopo la prima prova browser il wrapper segnalava `ALREADY RUNNING` (exit 0) per un processo zombie. Verificati sentinella di fine, stato Z e assenza di figli vivi, è stato archiviato soltanto il lock temporaneo del run concluso.
