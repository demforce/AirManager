# Un indirizzo verificato per accesso e comunicazioni

Stato BMAD **done**. Base `2290458fa0b1ac8e44e5775b58e672c436883655`. Enrico ha confermato che ogni account deve avere un solo indirizzo registrato per accesso e comunicazioni e che due utenti non possono condividere la stessa casella. Il candidato comprende il vincolo di unicità, l’invito automatico nel trial e la fonte comune per login e avvisi. Il campo della persona senza account mantiene il suo significato di contatto operativo. Il test SMTP del club resta separato.

## Unicità degli account

L’email esatta disponeva già di un indice univoco. Il login rimuove gli spazi esterni e converte in minuscolo. Nei dati importati, due valori letteralmente diversi potevano quindi rappresentare la stessa casella. La migrazione aggiunge un indice univoco che rispetta la normalizzazione del login, per tutti gli account inclusi quelli inattivi e in attesa di verifica. Conserva l’indice Prisma preesistente e i valori originari. Prima di costruire il nuovo indice, controlla le collisioni nella stessa transazione, con scritture concorrenti sulla tabella utenti sospese per la sua durata. Se ne rileva una, interrompe la migrazione. L’operatore deve chiarire la titolarità prima di procedere; la migrazione non sceglie quale record conservare.

La normale creazione di un’utenza e la creazione integrata dalla scheda persona continuano a salvare atomicamente account e invito. Il client amministrativo mostra un conflitto se la casella è già in uso. Il login pubblico risponde secondo il contratto generico esistente.

Il piano di prova copre creazione semplice e composita in contemporanea, inviti, maiuscole, spazi ammessi e varianti Unicode che il login riconduce ad ASCII. Controlla inoltre l’inserimento diretto nel database, l’aggiornamento da uno schema precedente e una collisione su dati storici sintetici. Dalla UI italiana ed inglese devono risultare comprensibili i rifiuti e deve continuare a funzionare un successivo invito valido.

## Riscontro sul candidato precedente

Dopo il collaudo separato delle parti, l’albero unificato comprende il routing approvato tecnicamente. Con il trial esistente attivo e un account collegato e verificato, usa la casella dell’account anche se la persona ha un recapito diverso o nullo. Il record della persona è collegato tramite `User.personId`. Per un invito ancora da confermare, gli eventi puntuali come saldo e diniego non hanno una coda per il recupero. Il job scadenze usa soglie condivise col digest: una prova su una scadenza a tre giorni ha trovato tre soglie consumate durante l’attesa e zero messaggi al titolare anche dopo la verifica. La revisione ha sospeso la pubblicazione di questo comportamento.

Quella proposta di recupero delle scadenze è stata superata dalla decisione di Enrico. Al primo accesso o alla prima attivazione il titolare riceve soltanto avvisi maturati dopo la verifica. La prova resta disattivata per default. Il cambio indirizzo resta nel checkout separato.

[Prove funzionali, unicità e invito](evidence/recapito-account-verificato/riscontri.md)

## Invito automatico nella prova

Enrico ha confermato che, se è attivo il flusso email di prova, ogni creazione amministrativa di un account deve accodare automaticamente un invito per verificare la sua unica casella registrata. La scelta spetta al server e si applica sia alla creazione diretta sia a quella integrata dalla scheda persona. Il modulo non deve offrire una scelta fra invito di verifica e invito password. La persona senza account conserva il normale campo di contatto. Fuori dalla prova restano disponibili i percorsi di accesso preesistenti.

Il collaudo deve usare le due UI, due richieste contemporanee e il normale percorso di impostazione della password di riserva per un nuovo amministratore già verificato. La verifica email non richiede una password. La predisposizione della password personale deve avvenire mentre l’amministratore ha accesso alla casella e la posta è disponibile. Il cambio indirizzo resta autorizzato in coda. La riattivazione con link lo precede e richiede un incarico distinto.

Sul candidato intermedio `bd327b98666d5ba27e3397b343fb45af3fbc2e90` il vincolo di unicità ha ricevuto approvazione tecnica indipendente. La prova con Chromium, dal modulo diretto italiano e dal composito inglese lasciando la vecchia spunta deselezionata, ha prodotto due intenti password e nessun invito di verifica. La suite Chromium su questo candidato è stata interrotta alla nuova richiesta per collaudare l’albero corretto. Nessuna pubblicazione al checkpoint.

## Inventario dei percorsi esaminati prima dell’implementazione

| Confine | Comportamento sulla base e verifica richiesta |
|---|---|
| Identità e accesso | L’associazione è la chiave persistente `User.personId`. Inviti, reset e accesso lavorano su `User.id` e `User.email`. `EmailVerification` registra l’indirizzo a cui si riferisce la verifica e il suo completamento. La coda delle credenziali ricontrolla l’idoneità al momento dell’affidamento al trasporto. L’invito iniziale serve precisamente a verificare la casella. |
| Contabilità e prenotazioni | Rettifica e addebito volo usano `sendNegativeBalanceAlert`; il diniego usa `bookings.service.ts`. La base invia al contatto della persona, anche quando la lingua viene letta sull’account collegato. Gli avvisi sono puntuali e successivi al salvataggio dell’operazione. |
| Velivoli | `aircraft.service.ts` invia le notifiche di fermo e archiviazione raggruppando per titolare. Preservare quel raggruppamento e gli interruttori esistenti. |
| Scadenze | `expiry-alerts.service.ts` prenota le soglie prima dell’invio al contatto della persona. Il digest ha una destinazione per admin e lingua. Sulla base un recapito mancante può consumare la soglia; questa semantica deve essere considerata esplicitamente quando il contatto esiste ma la verifica dell’account è pendente. |
| Avvisi di sicurezza e sonda del club | La consegna di sicurezza richiede un amministratore attivo con casella verificata, ricontrolla al trasporto e conserva in coda gli incidenti in attesa di un destinatario idoneo. La sonda usa esclusivamente il contatto del club. |
| Scrittura e visualizzazione | `people.service.ts` gestisce la creazione integrata e l’aggiornamento della persona. `users.service.ts` crea l’account o ne modifica l’associazione. Esaminare i lettori per scheda, liste ed export; intervenire sui campi esistenti del modulo dove serva impedire una seconda destinazione. Validare anche il payload sul server e i salvataggi concomitanti. |


Il conteggio preesistente che impedisce la rimozione dell’ultimo admin attivo include anche chi non ha ancora predisposto una password. La conferma della casella da sola non rende disponibile quel fallback. Durante un avvicendamento va provato l’accesso con password personale del nuovo admin da browser disconnesso prima di revocare l’accesso del precedente. Un guasto della posta precedente alla predisposizione impedisce l’uso del normale reset email per impostarla; questa story non introduce recuperi straordinari.

## Decisione di Enrico e piano test-first, prima attivazione

La conferma esplicita della casella apre la prima attivazione. L’invito vale sette giorni dall’emissione. Un reinvio esplicito dell’admin sostituisce il precedente soltanto mentre la prima verifica è pendente e l’utenza è abilitata. La verifica non riattiva un account disabilitato. L’accesso ordinario conserva i dieci minuti. Nessun evento pregresso viene inviato alla prima verifica o al primo login.

1. Esercitare prima in PostgreSQL le due creazioni, il retry con la scadenza originale, il reinvio simultaneo, il rifiuto dello stesso identificativo dopo attivazione e disabilitazione, e il pulsante nel modulo già disponibile. Verificare anche il testo e l’HTML IT/EN nel sink isolato.
2. Con una persona collegata, controllare il rifiuto di invii al dato storico e a un account privo di prova anche nel digest. Separare il contatto senza account. Accertare che un evento contabile maturato durante l’attesa resti soppresso se l’invio asincrono avviene dopo la conferma.
3. Preparare quattro fixture indipendenti per la combinazione digest acceso/spento e job eseguito/assente prima della conferma. Per scadenze pregresse, imminenti e già superate misurare catture al titolare e all’admin, una soglia successiva nello stesso ciclo, il rinnovo, la deduplica. Usare il giorno di Roma e un orologio del solo test. Non modificare il momento passato della verifica.
4. Rieseguire gate, collaudo browser, prove locali su indirizzo, login, coda, notifiche, unicità e riesame indipendente. Conservare i risultati storici con l’albero cui si riferiscono.

La riattivazione via link diventa la prima story successiva. L’invito iniziale, il login e l’admin non devono sostituire quell’azione distinta. La durata del futuro link di riattivazione resta da decidere. Il cambio indirizzo resta nel suo checkout separato.


## Implementazione candidata

La casella per il recapito dell’account nel trial proviene da `User.email`, sull’associazione persistente con la persona. L’accesso richiede una prova corrente della casella e lo stato abilitato. La destinazione operativa di una persona con utenza segue gli stessi controlli di titolarità e verifica. Un vecchio recapito della persona non supplisce alla mancanza della prova, anche per utenze legacy senza una riga di iscrizione al trial. Un contatto senza utenza conserva il recapito operativo proprio. Il campo esistente nella scheda della persona collegata mostra l’email dell’account in sola lettura. Il server rifiuta di impostarne una seconda con il salvataggio della persona.

Il reinvio passa dalla stessa azione amministrativa già disponibile in Piloti. L’idoneità della verifica iniziale è controllata anche quando viene ripresentata una chiave di idempotenza dopo l’attivazione o la sospensione. Restano in vigore la sostituzione del token, l’unicità canonica in PostgreSQL e i limiti condivisi fra operatori. I processi di consegna e le due lingue usano la scadenza originaria dell’intento.

Per gli avvisi puntuali il servizio legge una sola volta gli aventi diritto nella transazione dell’evento. La sospensione per destinatario assente rimane tale se nel frattempo la casella viene verificata. Il salvataggio dell’operazione può completarsi anche se fallisce la lettura del destinatario, confinata in un savepoint. Composizione e trasporto avvengono dopo il commit e il destinatario è ricontrollato prima dell’affidamento. Un messaggio già accettato dal trasporto non può essere ritirato.

Per gli avvisi a soglia, la conferma della casella memorizza la posizione nella sequenza già condivisa fra creazioni e rinnovi. Il job usa il giorno civile di Roma per distinguere le soglie attraversate dopo quel momento. Ogni nuova creazione o rinnovo ha il proprio ciclo, anche nello stesso giorno della conferma. I marker storici consumano una soglia senza attestare un invio e sono separati dai claim rilasciati al fallimento di un nuovo invio. Nel giro prima della verifica il titolare pendente resta ineleggibile. Un admin già abilitato e verificato riceve il riepilogo corrente se il digest è acceso. Dopo la verifica si escludono le soglie pregresse sia per il titolare sia per il singolo destinatario del digest. Una riga con una soglia nuova compare una sola volta. Il login non accoda né ripete tali eventi.

La migrazione aggiunge un solo campo nullable alla prova. Per chi aveva già verificato registra un confine comune di aggiornamento, conservando la data reale di prima verifica. La data di creazione della scadenza dimostra un ciclo successivo alla verifica anche se precede questo aggiornamento. Se una vecchia scadenza è stata modificata prima dell’aggiornamento, la data di modifica può riferirsi a note oppure a un rinnovo. Per una soglia già maturata alla verifica, in quel caso ambiguo non si recupera un invio. Una soglia attraversata dopo la verifica e tutti i rinnovi successivi all’aggiornamento restano idonei. La migrazione non crea verifiche, riscrive caselle o cambia versioni di sessione.

La UI Piloti contiene ancora il comando amministrativo di riattivazione diretta, su desktop e telefono, che aggiorna `isActive` senza un nuovo link. La prima verifica non può riabilitare un account sospeso. Il trial non è pronto per l’attivazione pubblica. Il passo seguente è la [riattivazione tramite link](riattivazione-account-con-link.md).

Il riesame del primo candidato ha identificato due concorrenze nel job. La destinazione del titolare viene ora fissata nella stessa transazione delle soglie. Un normale cambio di associazione prima dell’affidamento sopprime il vecchio promemoria e mantiene il marker. L’admin idoneo vede il motivo nel digest. Un guasto transitorio continua invece a rilasciare soltanto i claim di quel tentativo. Per un digest personalizzato il servizio conserva la fotografia delle sole righe effettivamente affidate. Il cambio di destinatario del titolare e il rinnovo di una riga omessa dal primo digest sono coperti da prove su database e trasporto locali.

## Riesame e verifiche

Il riesame indipendente ha approvato il tree applicativo `6c9bff26c31e37b65bb64b83f06d468e973fd0cb`. Il gate è passato con 2.404 unitari. I sei script PostgreSQL/SMTP hanno superato 107 casi. Con il trial acceso sono passati cinque casi Chromium senza retry o skip. Da Piloti e da Scadenze sono stati verificati l’invito automatico, il saldo e l’assenza di promemoria arretrati. La prova di aggiornamento ha mantenuto la data di verifica e ha distinto le scadenze anteriori da quelle successive alla conferma. Su 727 scenari Chromium generali a trial spento, 724 sono passati al primo tentativo, uno al primo retry e due sono stati saltati perché richiedevano il trial acceso. Questi ultimi sono passati nella suite dedicata. [Comandi, contatori ed errori recuperati](evidence/recapito-account-verificato/riscontri.md)
