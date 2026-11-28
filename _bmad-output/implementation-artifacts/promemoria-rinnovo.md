# Promemoria dopo il rinnovo di una scadenza

**Stato BMAD: done, 27 novembre 2026.** Base `c24bd192f502182fa7101aa096246327bcf44cc8`. Commit applicativo `c1ddad613bc0a02882243a3cc747e42a8981974f`, tree di codice e test `d4eb0a8bec486a78f3a0281bc4a0219f3611224d`.

## Story

Come titolare di una scadenza rinnovata, voglio che i promemoria seguano la nuova data e che restino disponibili le notifiche previste per il nuovo ciclo.

L’audit separato segnalato dal PO ha osservato questo caso durante un normale giro del job. La pagina di risultati contiene una scadenza a +3 giorni. Prima che il job ne registri le soglie, il rinnovo sposta la scadenza a +50. Il job usa ancora la data letta nella pagina, registra 60, 30 e 7 e prepara il testo a +3. Nel nuovo ciclo a +50 è dovuta solo la soglia 60. Lo storico del progetto descrive l’invio unico per le soglie divenute esigibili, il tetto per giro e il recupero dai rifiuti SMTP. [Story 6.3](6-3-expiry-alerts.md) · [Story 17.8](17-8-alert-job-a-lotti.md) · [Audit del job a lotti](audit-followup-2026-11-26.md)

## Criteri di accettazione

1. Se il rinnovo da +3 a +50 termina dopo la selezione e prima della registrazione delle soglie, il trasporto resta privo del vecchio testo. Una lettura aggiornata può consumare la soglia 60. Le soglie 30, 7 e 0 restano disponibili alla rispettiva scadenza.
2. Aggiornamento diretto della scadenza, modifica dalla scheda persona e rinnovo della quota ripristinano le soglie del ciclo secondo le rispettive regole. Salvare la stessa data o modificare solo le note conserva le soglie già registrate.
3. Due giri concorrenti inviano al massimo un promemoria per le stesse soglie. Un errore SMTP libera solo le righe create dal tentativo fallito, anche se nel frattempo un nuovo giro ha elaborato la scadenza rinnovata.
4. Il rinnovo può terminare mentre il trasporto è occupato. La transazione protegge la decisione sulle soglie e si conclude prima dell’invio. Un messaggio già accettato dal trasporto può essere recapitato dopo il rinnovo.
5. Con più di 200 scadenze in attesa il giro rispetta il tetto e quello successivo avanza. Il comando «Invia promemoria» dalla schermata Scadenze consegna l’avviso atteso a un titolare sintetico.
6. Il candidato supera i test funzionali, i gate del repository, la suite browser su database sintetico e la revisione indipendente. Registrare separatamente errori iniziali, retry e skip.

## Prova funzionale

Il test prepara due scadenze sintetiche nella stessa pagina del job. Quando il trasporto isolato riceve il promemoria per la prima, il test completa il rinnovo della seconda attraverso il servizio usato dall’applicazione. La seconda scadenza è quindi già stata selezionata con la vecchia data, mentre il rinnovo ha già fatto commit quando il job torna a elaborarla. Sulla base il controllo del destinatario fallisce su tutti e tre i percorsi con `Stale page must not dispatch a holder reminder`, atteso 0, ricevuto 1. Una seconda esecuzione sul codice originale ha registrato per ciascuno il testo «3 giorni», una voce obsoleta nel riepilogo e tre marker nel ciclo appena rinnovato, `[60, 30, 7]`. [Test PostgreSQL ripetibile](../../scripts/test-expiry-renewals.ts)

| Percorso | Riscontro sul database sintetico e sul trasporto isolato |
| --- | --- |
| Modifica diretta o dalla scheda persona, da +3 a +50 | Nel primo giro, zero messaggi al titolare rinnovato, zero soglie registrate per lui e nessuna voce a suo nome nel riepilogo. Al giro fresco, testo «50 giorni» e unica soglia 60. Avanzando il calendario a 30, 7 e 0 giorni, ogni soglia produce un solo invio. |
| Rinnovo della quota | Il servizio della quota applica i dodici mesi previsti dal dominio. Il vecchio avviso scompare dal giro in corso e al giro successivo la quota resta fuori finestra. |
| Due job e guasto SMTP ritardato | Due giri sullo stesso ciclo consegnano un solo promemoria e una sola voce nel riepilogo. Se il vecchio tentativo fallisce mentre il nuovo ciclo ha già registrato la soglia 60, il marker del nuovo ciclo sopravvive. |
| Due editor, stessa data o sole note | Il secondo editor attende il primo sulla stessa scadenza. Il salvataggio della data già aggiornata e il successivo salvataggio delle sole note conservano la soglia 60 intermedia. |
| Coda e ammissibilità | Su 201 scadenze il primo giro elabora 200 e ne lascia una. Il secondo elabora l’ultima. Se dopo la selezione la persona viene archiviata, il tipo disattivato o la scadenza eliminata, il giro salta la riga. |

## Confine con la posta

La selezione a pagine individua il lavoro. Al momento di registrare le soglie il job blocca per breve tempo la singola riga `Expiry`. Scheda, modifica diretta e quota usano la stessa riga per coordinare il cambio di data e il ripristino delle soglie. Il job rilegge le soglie dopo aver acquisito il lock. Una data cambiata fa scartare la selezione obsoleta.

La preparazione del testo e l’invio avvengono dopo il commit. Subito prima di chiamare il trasporto il job verifica che il tentativo possieda ancora il proprio marker. Un rinnovo può comunque intervenire fra quest’ultima lettura e l’accettazione SMTP o durante un invio già avviato. Un messaggio accettato può arrivare dopo il rinnovo e non può essere richiamato dal job. Anche il riepilogo di un tentativo già avviato può partire dopo il rinnovo, riportando l’esito di quel tentativo. Se il processo termina tra il commit del marker e l’invio resta possibile perdere quel promemoria, limite già documentato nella story 6.3.

## Decisione del PO per le story successive

Per chi ha un account, un unico indirizzo verificato servirà sia per accedere sia per ricevere comunicazioni. Questa decisione sostituisce la precedente proposta di due recapiti personali. Chi è censito soltanto come contatto continuerà a ricevere gli avvisi al proprio recapito e la ricezione di un avviso non creerà un account. Per il test SMTP si userà il recapito del club, una destinazione dell’organizzazione. Il prossimo lavoro approvato riguarda i sei interruttori operativi.

## Diagnostica del 27 novembre

| Comando | Exit | Esito o recupero |
| --- | ---: | --- |
| `npm run db:reset:test` al riavvio | 1 | `connect ECONNREFUSED 127.0.0.1:55484`. Avviato il container PostgreSQL 16 dedicato ai test. `docker exec am184-disposable pg_isready -h 127.0.0.1` ha restituito `accepting connections`. Reset e seed ripetuti con successo. |
| `npx tsx --test scripts/test-expiry-renewals.ts` sulla base | 1 | Tre casi rossi sul promemoria obsoleto. Gli altri due controlli iniziali sono passati. Una controprova mirata sul codice originale con `tsx --test --test-name-pattern='renew between selection' scripts/test-expiry-renewals.ts` ha confermato testo, riepilogo e tre marker obsoleti. |
| `npx tsx --test scripts/test-expiry-renewals.ts` durante l’estensione delle fixture | 1 | `0 !== 1` in due casi con calendario avanzato e `ERR_INVALID_ARG_VALUE` tentando di sostituire un metodo del proxy Prisma. Il callback di rinnovo ora agisce una sola volta. Il test dei due editor sincronizza le sessioni osservando il lock PostgreSQL. |
| `npx tsc --noEmit --incremental false` preliminare | 2 | `TS18048: 'digest' is possibly 'undefined'` e `TS2345` sul tipo restituito dai due mock Prisma. Aggiunti il controllo di presenza del riepilogo e la tipizzazione delle fixture secondo le convenzioni dei test. |
| `npm run db:reset:test` e `npx tsx --test scripts/test-expiry-renewals.ts` sul candidato | 0 | PostgreSQL locale appena inizializzato, trasporto in memoria, 8/8, zero retry e skip. Il guasto SMTP sintetico previsto è apparso nel log del caso che conserva il claim nuovo. |
| `npm run gates` (Node 24.22.3, runtime Cloud) | 0 | Lint 53 s, typecheck 21 s, 2.353 unit test in 19 s, build 54 s. |
| `scripts/e2e.sh start -c /tmp/amrenew/probe.config.cjs e2e/expiry-alerts.spec.ts` | 0 | Chromium sul server di prova, database dedicato e Mailpit locale. 4/4 al primo tentativo, zero skip, 28,4 s. Il click su «Invia promemoria» mostra il riscontro «in coda». Il messaggio arriva al titolare e ripetendo il giro la sua casella non riceve duplicati. |
| `E2E_REUSE_SERVER=1 TMPDIR=/tmp/amrenew/full scripts/e2e.sh start --workers=2` | 0 | Log finale `E2E_EXIT=0`. Sul database locale `airmanager_e2e` ricreato per la suite, 716 casi in 28,3 min. 714 passati al primo tentativo, due intermittenti passati al primo retry, zero skip. Tutti e quattro i casi promemoria e tutti e tre i casi METAR con risposta sintetica locale sono passati subito. |
| `npm run db:reset:test` e `npx tsx --test scripts/test-expiry-renewals.ts` (Node 22.23.5) | 0 | Anche con la versione indicata da `.nvmrc`, 8/8 in 7,99 s, zero retry e skip. |
| `npm run gates` (Node 22.23.5) | 0 | Ripetizione su copia isolata dello stesso tree. Lint 39 s, typecheck 30 s, 2.353 unit test in 16 s, build 49 s. |

Nel database della prova funzionale i 19 contatti sintetici con recapito sono rimasti privi di un account collegato. La verifica dell’indirizzo unico per gli utenti con account resta una story futura.

**Retry Chromium.** Il primo tentativo di `mobile-self-public.spec.ts:282` ha superato i 30 s nella chiamata di preparazione `POST /api/v1/users` (`apiRequestContext.post: Test timeout of 30000ms exceeded`). Per `personal-planning.spec.ts:24` l’elemento `mobile-personal-bookings` non era visibile entro 5 s. Entrambi sono passati alla prima ripetizione automatica. I log identificano le attese fallite e non stabiliscono una causa più profonda.

## Revisione indipendente

Il revisore GPT 6 Sol xhigh, in contesto separato, ha approvato il tree `d4eb0a8` dopo avere esaminato i 12 file modificati, i tre percorsi di scrittura, il claim con PostgreSQL a livello Read Committed, i test di concorrenza e gli esiti finali dei gate. Nessun rilievo bloccante. L’osservazione sul confine tra l’ultima lettura e SMTP e sul riepilogo di un tentativo avviato è recepita nel paragrafo «Confine con la posta». La suite Chromium è stata eseguita con Node 24, mentre le prove funzionali PostgreSQL e i gate sono stati eseguiti sia con Node 24 sia con Node 22.
