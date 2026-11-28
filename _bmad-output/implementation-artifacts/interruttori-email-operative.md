# Interruttori delle email operative

**Stato BMAD: done, 27 novembre 2026.** Base `161699f7f3b37d5de1cd271b6797a04e27e43291`. Commit applicativo `2337eca76239f1b2550cfc3dd86b571663189506`, tree di codice e test `a51953ebeff54fc123f4a6da26fd04b8dbffd36f`. La story segue la [correzione dei promemoria dopo rinnovo](promemoria-rinnovo.md).

## Obiettivo e criteri di accettazione

L’amministratore può scegliere da Impostazioni quali avvisi operativi inviare. Ogni interruttore indica l’evento e i destinatari. L’installazione nuova e il club che ha già configurato SMTP partono con tutti e sei gli avvisi abilitati.

1. Impostazioni permette di leggere, modificare e salvare separatamente i sei valori. Valgono i permessi amministrativi esistenti, il flusso «Salva» della pagina, le due lingue IT/EN e l’uso da tastiera e con lettore di schermo.
2. Peggioramento del saldo, diniego di prenotazione, fermo e archiviazione del velivolo mantengono i rispettivi destinatari. Con l’avviso spento l’operazione si completa e il trasporto non riceve l’email dell’evento.
3. Titolare e riepilogo amministratori sono indipendenti. Solo riepilogo include una volta le voci dovute e segnala il promemoria disattivato. Solo titolare conserva invio, deduplicazione e retry. Con entrambi spenti, cron e comando manuale riportano lo stato disattivato senza creare claim o contattare il trasporto.
4. La riattivazione parte dalle soglie successive. I cicli già in corso conservano i marker esistenti. Documentare la regola per il giorno del cambio, i nuovi cicli e i canali riattivati in momenti diversi. Il job continua ad avanzare oltre il tetto di 200 candidati.
5. Distinguere promemoria soppresso per configurazione, contatto senza recapito e tentativo di invio fallito. Verificare guasto e retry del titolare, deduplicazione, rinnovo durante il giro e persistenza delle impostazioni e dei marker su un database già popolato.
6. Test SMTP al club, inviti, recupero delle credenziali e comunicazioni di accesso/sicurezza restano disponibili anche con tutti i sei interruttori spenti. I contatti operativi conservano il recapito attuale. La decisione sull’indirizzo verificato unico appartiene alla fase successiva.

## Ambiente di verifica

La prova di aggiornamento è partita dal database PostgreSQL locale sintetico dell’integrazione precedente. Prima di applicare la modifica conteneva 21 impostazioni, 376 scadenze, 96 marker, 99 utenti e 957 persone. Dopo `npx prisma migrate deploy` (exit 0), conteggi e impronte coincidono per tutte le impostazioni e i marker, per i campi storici delle scadenze e per gli identificativi e gli indirizzi dei contatti e degli utenti controllati. Tutte le 376 scadenze sono rimaste prive di un numero di ciclo. La lettura dei sei interruttori ha restituito sei valori attivi, senza creare una riga di configurazione. Per la suite finale il database viene ricreato. Il solo trasporto SMTP usato per le prove è Mailpit locale.

## Confine alla riattivazione

I sei valori si salvano in una riga di `AppSetting`. Ogni canale scadenze conserva il giorno di Roma e un numero d’ordine della propria ultima riattivazione. La stessa sequenza PostgreSQL numera la creazione di una scadenza e il cambio effettivo della sua data. Le scadenze già presenti rappresentano cicli anteriori. Il salvataggio di note o della stessa data non apre un ciclo. In questo modo due eventi nello stesso millisecondo si possono ordinare senza usare `updatedAt`, che cambia anche con le note.

Per un ciclo già esistente alla riattivazione, il canale riparte dalle soglie che maturano nei giorni di Roma successivi. Le soglie già raggiunte, comprese quelle del giorno di riattivazione, restano fuori dall’arretrato. Una scadenza creata o rinnovata dopo quel confine segue subito la normale cadenza, anche nello stesso giorno. L’ordine tra operazioni sovrapposte è quello del prelievo dalla sequenza. Un rollback può lasciare un numero inutilizzato. [Migrazione del ciclo scadenza](../../prisma/migrations/20261127090000_expiry_notification_cycle/migration.sql)

## I quattro stati delle scadenze

| Titolare | Riepilogo admin | Comportamento |
| --- | --- | --- |
| Attivo | Attivo | Il job applica il confine temporale di ogni canale. Il riepilogo distingue invio al titolare, mancanza del recapito, errore di invio e soglia già maturata alla riattivazione. |
| Attivo | Spento | Il titolare riceve un avviso per le soglie esigibili. In caso di guasto, il job libera gli ID di quel tentativo e il prossimo giro può riprovare. |
| Spento | Attivo | La voce dovuta compare una volta nel riepilogo, con l’indicazione del promemoria disattivato. L’invio del riepilogo resta best effort per amministratore. Un rifiuto SMTP relativo a un admin lascia procedere gli altri. |
| Spento | Spento | Il comando e il cron restituiscono `disabled` e contatori a zero. Nessun invio e nessuna creazione di marker. |

Il cambio delle impostazioni e il claim non mantengono un lock durante SMTP. Il job ricontrolla il canale appena prima della consegna al titolare e prima di ogni singolo invio agli amministratori. Una consegna avviata può completarsi dopo il salvataggio delle nuove impostazioni. Se queste cambiano durante il giro il risultato `settings_changed` viene mostrato dalla schermata Scadenze. Un invio già accettato rimane nella storia dei tentativi.

## Revisione e regressioni

La revisione è stata affidata a GPT 6.2 Astra xhigh in un contesto separato: le due date di riattivazione agiscono sullo stesso registro delle soglie, mentre rinnovi e cambi delle preferenze possono avvenire durante il giro. Il revisore ha chiesto di ricontrollare i destinatari prima dell’handoff, descrivere correttamente una soglia già maturata alla riattivazione e verificare che un riepilogo rimasto senza voci valide non parta.

Una seconda prova riproduceva una perdita di promemoria: se il tipo veniva disattivato o la persona archiviata dopo il claim ma prima della consegna al primo admin, la voce spariva dal testo ma restavano registrati 60, 30 e 7. Il marker 60 era storico e solo 30 e 7 appartenevano al giro. Il codice ora elimina soltanto gli ID trattenuti dal tentativo obsoleto. Dopo il ripristino dell’ammissibilità il giro successivo registra 30 e 7 e consegna una sola volta. Se il primo admin ha già ricevuto il riepilogo, il job conserva lo storico del tentativo. [Regressioni su PostgreSQL](../../scripts/test-expiry-renewals.ts)

**Esito del riesame: approvato, nessun rilievo aperto.** Il revisore ha esaminato il delta finale del contratto OpenAPI e riletto i gate, i risultati PostgreSQL e Mailpit, le verifiche sull’installazione esistente e la suite Chromium del tree `a51953e`.

## Comandi e diagnostica

| Comando o verifica | Exit | Riscontro e risoluzione |
| --- | ---: | --- |
| `npx tsx --test --test-name-pattern='disabled channels' scripts/test-expiry-renewals.ts` sulla base | 1 | `Cannot read properties of undefined (reading 'expiryHolder')`. Lo snapshot delle impostazioni non esponeva il nuovo campo. |
| `npx vitest run src/server/services/{accounts,bookings,aircraft,settings,expiry-alerts}.service.test.ts src/server/services/expiry-alerts-17-8.test.ts src/lib/settings-draft.test.ts --reporter=dot` durante lo sviluppo | 1 | I primi mock non distinguevano le letture delle diverse impostazioni. Risolti i primi errori, due controlli della flotta asserivano troppo presto `Number of calls: 0`. La fixture ora aspetta il punto osservabile dell’operazione asincrona. |
| `npx tsc --noEmit --incremental false` preliminare | 2 | `TS2345 … Property 'status' is missing`. Aggiornata la fixture della risposta del cron. |
| `npx tsx --test scripts/test-expiry-renewals.ts` durante lo sviluppo | 1 | `2 !== 1` sul conteggio digest-only. La stessa stringa figurava nel cognome e nel tipo della stessa riga. L’asserzione ora conta le righe relative al titolare. |
| `scripts/e2e.sh start -c /tmp/amswitch/dev.config.cjs -g 'operational mail switches' e2e/settings.spec.ts` | 1, poi 0 | Nel primo mirato la dashboard ha richiesto 6,1 s per compilarsi in modalità sviluppo. L’attesa del login è scaduta a 5 s. Ripetuto a server caldo con attesa del mirato a 20 s, un caso passato in 47 s senza retry o skip. |
| `npx vitest run src/i18n/messages.test.ts` nel gruppo mirato | 1 | Il glossario rifiutava «Fermo del velivolo». L’etichetta usa ora «Velivolo fuori servizio». |
| Prove PostgreSQL di disattivazione del tipo e archiviazione della persona | 1, poi 0 | Sul candidato precedente restava `[60,30,7]` invece di `[60]`. Entrambi i casi sono passati dopo la correzione dei marker del tentativo. |
| `npm run db:reset:test` e `npx tsx --test scripts/test-expiry-renewals.ts` | 0 | Dopo la correzione dei marker 16/16 in 7,68 s. Ripetizione sul tree `a51953ebeff54fc123f4a6da26fd04b8dbffd36f`: 16/16 in 6,02 s su PostgreSQL locale con trasporto isolato, zero retry e skip. |
| Vitest mirato su servizi, bozze impostazioni, template, glossario e contratto cron | 0 | Dopo la correzione dei marker 705/705 in 5,41 s. Due avvii del gate su tree già superati sono stati interrotti esplicitamente (exit 143) prima delle prove sui dati. |
| `npm run gates` sul tree `d91e915` | 1 | Un’asserzione OpenAPI si aspettava i dieci blocchi precedenti di Impostazioni e ne riceveva undici. 2.362 unit passati e uno fallito. Lo schema documenta anche il minimo di un interruttore in un blocco inviato. Il test verifica il blocco parziale, lo snapshot con sei valori, la protezione amministrativa e i codici di risposta. `npx vitest run src/lib/schemas/registry.test.ts` ha superato 57/57 casi sul tree aggiornato. |
| `npm run gates` sul tree `a51953e`, Node 22.23.5 | 0 | Lint 48 s, typecheck 32 s, 2.363/2.363 unit in 16 s, build 49 s. Il server per il collaudo usa la build di questo snapshot. |
| `E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2` su database ricreato dal seed sintetico | 0 | `E2E_EXIT=0` in 31,3 min. Su 717 casi Chromium, 715 passati al primo tentativo, due passati al primo retry e zero skip. Il caso dei sei interruttori, i quattro casi promemoria e i tre METAR locali sono passati subito. |

I due retry della suite completa sono `bookings.spec.ts:2223` (approvazioni concorrenti) e `mobile-logbook.spec.ts:1225` (vista dell’istruttore). In entrambi il primo tentativo ha superato i 30 s nella preparazione del rispettivo utente sintetico: `apiRequestContext.post: Test timeout of 30000ms exceeded` su `POST /api/v1/users`. Il log individua la chiamata in corso allo scadere del test.

## Riscontri sul club già configurato

Chromium ha aperto Impostazioni sul database aggiornato prima del reset. Sia in italiano sia in inglese ha trovato sei switch attivi con un nome accessibile. La barra spaziatrice ha spento e riacceso il promemoria al titolare. Ripristinando il valore di partenza, «Salva» tornava inattivo. Il confronto dei dati preesistenti è stato ripetuto dopo queste letture.

Sul database aggiornato il primo passaggio con entrambi i canali spenti ha mantenuto tutti i 96 marker e alla riattivazione i candidati erano zero. La prima sonda da riga di comando usava soltanto il caricatore CommonJS di `tsx`: `ERR_IMPORT_ATTRIBUTE_MISSING` sul catalogo JSON durante il rendering. La sonda dei quattro eventi è uscita 1 dopo il timeout del controllo positivo Mailpit. L’analisi delle consegne usa la ripetizione con `npx tsx`, che carica anche i moduli ESM.

| Evento realmente registrato nel DB | Switch acceso, messaggi al destinatario sintetico | Switch spento, messaggi al destinatario sintetico |
| --- | ---: | ---: |
| Rettifica che peggiora il saldo | 1 | 0 |
| Diniego di una prenotazione pendente | 1 | 0 |
| Fermo con una prenotazione approvata interessata | 1 | 0 |
| Archiviazione con una prenotazione approvata interessata | 1 | 0 |

`npx tsx /tmp/amswitch/events-mailpit.cjs` è uscito 0. Le due configurazioni avevano attivi rispettivamente saldo e fermo, poi diniego e archiviazione. Il controllo positivo ha atteso le consegne in Mailpit e verificato oggetto e numero di email per ciascun destinatario univoco. I quattro controlli a interruttore spento hanno atteso anche 1,5 s dopo le consegne positive del rispettivo lotto. Le asserzioni sul mittente controllato nei test dei servizi coprono la decisione di chiamare o meno il trasporto.

Per verificare le soglie sui dati storici, una query SQL indipendente ha calcolato il prossimo giorno con soglie non consumate. La prima sonda aveva registrato due soglie durante l’avanzamento del calendario. La ripetizione completa, `npx tsx /tmp/amswitch/legacy-cycle-recheck.cjs` (exit 0), è partita da 98 marker. Il comando disattivato e il giro appena riattivato hanno lasciato il conteggio a 98. Al 2 dicembre simulato, la query prevedeva sei voci, il job ne ha elaborate sei e ha registrato sei nuovi marker. Il trasporto isolato ha ricevuto un riepilogo. Ripetendo lo stesso giro i candidati erano zero.
