# Worker SMTP per inviti e recupero password

L’applicazione salva nella transazione di creazione la richiesta d’invito. Anche il recupero password affida l’invio alla coda. Il worker usa il database, l’URL pubblico e il trasporto SMTP dell’installazione. SMTP continua a usare le impostazioni salvate dal club e i valori di ambiente esistenti. La migrazione crea tabelle vuote e la riga dello stato del canale. I token emessi prima dell’aggiornamento conservano il proprio termine.

## Attivazione

Preparare il binario Node supportato dal progetto, i pacchetti bloccati, incluso il runtime `tsx`, e il client Prisma generato per lo stesso rilascio. Applicare le migrazioni prima di avviare i processi applicativi aggiornati. In sviluppo avviare `npm run mail:worker` accanto al server Next. Il worker carica il file locale tramite dotenv. Le variabili già esportate dal supervisore hanno precedenza. Per scegliere un file diverso si può impostare `DOTENV_CONFIG_PATH`. Per installazioni con systemd predisporre una unit con i percorsi e l’identità dell’installazione. Esempio da adattare.

```ini
[Unit]
Description=AirManager credential email worker
After=network-online.target

[Service]
Type=simple
User=airmanager
WorkingDirectory=/opt/airmanager/current
EnvironmentFile=/etc/airmanager/application.env
ExecStart=/usr/bin/node --import tsx scripts/mail-worker.ts
Restart=always
RestartSec=5
TimeoutStopSec=110
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Installare e abilitare il servizio con il gestore adottato dall’installazione. Occorre una supervisione indipendente dal traffico web. Verificare in Impostazioni il primo ciclo, il suo aggiornamento dopo un riavvio e la prova manuale al contatto del club. Il ciclo standard è di 30 secondi e la CLI ammette intervalli da 250 millisecondi a 60 secondi. Il worker aggiorna il segnale di attività anche fra le ondate dello stesso giro. Il limite condiviso sul database è di 10 nuove prenotazioni per intervallo e due conversazioni contemporanee. Le istanze della stessa installazione devono usare lo stesso intervallo. La suite browser usa un intervallo di un secondo. Richiede un database locale denominato airmanager_e2e oppure airmanager_test, con lo stesso URL dichiarato in DATABASE_URL e TEST_DATABASE_URL. In modalità di collaudo il worker ricontrolla anche l’host delle impostazioni salvate prima di ogni invio e si ferma se il relay esce dal loopback. Il comando `npm run mail:worker -- --once` esegue un singolo giro.

## Interpretazione degli esiti

Un invito vale sette giorni e un recupero due ore. Il termine è stabilito all’emissione. Un tentativo ripetibile genera un nuovo token con la stessa scadenza e invalida il precedente. Il worker ritenta un rifiuto temporaneo esplicito o un guasto transitorio certamente precedente all’affidamento. Sono consentiti tre tentativi totali, con attese di 1 e 5 minuti e fino a 5 secondi aggiuntivi. Occorrono due minuti residui per il retry. Un rifiuto permanente chiude il messaggio. L’accettazione è la conferma finale SMTP. La ricezione in casella e le notifiche di mancato recapito successive richiedono evidenze esterne.

Come per le impostazioni SMTP già esistenti, il client usa AUTH solo se sono configurati sia il nome utente sia la password. Un rifiuto SMTP 530 o 535 segnala una configurazione da verificare. Il formato storico del segreto salvato accetta anche password legacy in chiaro. Se un valore senza versione non si decifra, l’applicazione può osservare il rifiuto del relay ma non attribuirlo con certezza a un dato corrotto.

Un errore di configurazione sospende il canale fino a una correzione o a una prova manuale. Tre guasti consecutivi del servizio aprono una pausa di un minuto. Un rifiuto specifico della casella resta circoscritto al destinatario. Una sola istanza può sondare il canale in pausa con un intento valido già dovuto oppure con il test esplicito al club. Una risposta sulla vecchia configurazione conserva il proprio valore storico. Soltanto la sonda assegnata alla configurazione attuale può riaprire la coda.

I limiti iniziali sono 10 secondi per connessione e saluto, 45 secondi di inattività, 90 secondi complessivi per conversazione e 120 secondi di lease. Concordare la finestra di risposta finale e il ritmo sostenibile con il gestore del trasporto prima dell’attivazione effettiva. Se il server può avere già accettato il messaggio, il worker registra incertezza e ferma i retry. L’operatore può emettere un nuovo invito idoneo. Il primo messaggio può ancora arrivare, ma la vecchia credenziale viene revocata. Una nuova richiesta di recupero parte solo dal percorso pubblico abituale.

Il pannello amministrativo riporta separatamente la sonda manuale, la sonda di ripresa su un messaggio dovuto, il ciclo del worker e lo stato della coda. Trascorsi quattro minuti senza un ciclo, il pannello segnala il ritardo. L’ultima osservazione di ogni origine resta disponibile dopo il riavvio. Gli eventi tecnici terminali vengono rimossi dopo 14 giorni, una volta scaduta la credenziale. Il replay di un’azione amministrativa dura 24 ore. Il limite fra reinvii intenzionali è un minuto per account e sono ammessi 20 reinvii per amministratore in dieci minuti.

Il worker registra soltanto diagnostica normalizzata. Per verificare il servizio usare le osservazioni amministrative e dati sintetici. Il login corrente continua a funzionare. Qualsiasi futura dipendenza del login dall’email richiede anche una procedura di recupero indipendente per l’ultimo amministratore, approvata e collaudata separatamente.
