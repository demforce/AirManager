# Handoff AirManager · 28 novembre 2026

## Primo accesso dell’amministratore invitato

La [story di onboarding](../../_bmad-output/implementation-artifacts/primo-accesso-admin.md) riguarda la creazione di un nuovo admin nel trial locale. Il titolare conferma la sua casella e imposta la password personale dallo stesso invito di sette giorni. Il bootstrap del primo admin e le promozioni successive di account già attivati rimangono percorsi distinti. La prova è spenta per default. La [revisione indipendente](../../_bmad-output/implementation-artifacts/primo-accesso-admin-review-report.md) ha approvato il candidato. Sono passati i gate e tutti i 15 casi Chromium del trial. Il titolare ha anche salvato e riletto un pilota con la nuova password, a worker e relay dedicati fermi.

## Unicode nei PDF e colonne di Scadenze

I cinque export PDF usano Liberation Sans incorporato. Il PDF Scadenze dedica le quattro colonne a Persona, Tipo, Scadenza e Stato. Per le 48 scadenze sintetiche della prova ogni cella corrisponde all’Excel nello stesso ordine sia in italiano sia in inglese. Il campione scaricato dal menu dell’app contiene «Łukasz», nomi su più righe e due pagine A4. [Scarica il PDF sintetico](../../_bmad-output/implementation-artifacts/evidence/pdf-unicode/Scadenze-Unicode-AirManager.pdf).

Il tree applicativo `049666c90fbdcbfc3a5bf60cd07bef94372d333b` ha superato la revisione indipendente, 2.415 unitari e 725 casi Chromium ordinari al primo tentativo. I sei skip di modalità sono coperti dall’esecuzione trial (14/14). Il tema dell’amministratore legacy resta registrato nel collaudo readiness. [Criteri, misure e prove della story](../../_bmad-output/implementation-artifacts/pdf-unicode-scadenze.md).

## Readiness email sintetica

Il [collaudo readiness](../../_bmad-output/implementation-artifacts/readiness-email.md) è chiuso dopo revisione indipendente. Sul candidato sono passati 2.413 unitari, 129 casi PostgreSQL e tutti i 14 casi Chromium con trial acceso. La suite ordinaria ha registrato 724 passati al primo tentativo, un retry riuscito e sei skip coperti nel trial. L’admin legacy che ha già impostato la password accede dal fallback, ma per il medesimo account manca ancora il percorso di verifica della casella. Il rollout resta NO-GO per questa transizione. Per un admin creato nel trial, il vero invito seguito dalla conferma ha sbloccato l’avviso in attesa una sola volta. La [lista go/no-go](../operations/credential-mail.md#readiness-prima-di-una-decisione-sul-login-email) distingue le prove sintetiche dalle responsabilità del gestore. La CI comprende l’intera regressione ordinaria e un job autonomo per i contratti del trial.

## Cambio sequenziale dell’indirizzo verificato

La [story cambio indirizzo](../../_bmad-output/implementation-artifacts/cambio-indirizzo-verificato.md) è chiusa dalla base `abd20cab` dopo il riesame indipendente del tree applicativo `76678724869a053d482dc27b6a12a332b331473f`. Il titolare usa due link successivi, ciascuno di dieci minuti. L’avvio assistito si trova nella sezione Accesso dell’editor Piloti e indirizza il primo messaggio alla casella attuale del titolare. Al completamento il successivo accesso usa la nuova casella. Sulla copia migrata, i due POST sono riusciti a +543,0 e +662,3 secondi. La richiesta protetta con la vecchia sessione ha restituito 401 e la successiva rettifica del saldo ha generato una sola email per la nuova casella. Il gate ha superato 2.413 unitari, le otto suite PostgreSQL hanno superato 128 casi. Nel browser con trial spento ci sono stati 724 passati, un caso passato al retry e sei skip coperti dal run con trial acceso. La prova resta locale e spenta di default. Dopo questa story sono previsti readiness, poi Unicode e sola rimozione della colonna «Ambito» dal PDF Scadenze.


## Stato del progetto

AirManager gestisce voli, flotta, prenotazioni e contabilità dell’aviosuperficie. L’Epic 18 ha completato i miglioramenti dell’interfaccia mobile e desktop. Le sette story risultano concluse. Per lo stato delle altre iniziative fa fede lo [sprint BMAD](../../_bmad-output/implementation-artifacts/sprint-status.yaml). Lo [storico fino alla 18.7a](HANDOFF-2026-11-26-1827.md) conserva esiti e limiti delle singole story.

## Ultima consegna

La prima parte della 18.7 ha sistemato colonne e intestazioni desktop, commit `c09f2b8`. La 18.7b, commit `d675dd332c`, completa gli AC 5 e 6. Dal telefono un amministratore può aprire «Metti fuori servizio» per un velivolo operativo e trova subito il cursore nel motivo. Conteggio, conferma e notifica seguono il flusso esistente. Il widget desktop mostra fino a otto velivoli, privilegiando quelli fuori servizio e quelli con attività oggi. Il registro completo si raggiunge dal widget. I conteggi comprendono tutta la flotta attiva e la timeline presenta tutte le righe di attività del giorno. [Record 18.7](../../_bmad-output/implementation-artifacts/18-7-desktop-colonne-sticky-fermo-panoramica.md)

## Prove e problemi risolti

Su dati sintetici, aggiungendo 110 velivoli liberi ai 17 iniziali, a 1280 px la pagina resta alta 3.437 px e conserva 13 righe della giornata. I due temi hanno dato le stesse misure. Sul database di carico sono rimaste visibili 185 righe operative. L’interfaccia mobile è stata verificata con Chromium touch emulato a 375 px. La tastiera di un telefono fisico resta fuori dalla prova. [Misure e diagnostica](../../_bmad-output/implementation-artifacts/evidence/18-7b/riscontri.md)

Il primo tentativo browser aveva riutilizzato un vecchio processo sulla porta 3000. La ripetizione sul server del candidato ha superato entrambi i test mirati. La fixture distingueva inizialmente in modo errato il bordo del giorno di Roma. Dopo la correzione, le prenotazioni a cavallo della mezzanotte e quelle appena fuori dalla finestra danno esiti distinti. Un test di Statistiche mobile intercettava la schermata di caricamento durante la controprova di testo troncato. Il test ora attende un’etichetta visibile e controlla lo stile effettivo prima di misurarla. In un altro run, i due test che misurano lo stato globale della flotta si sovrapponevano. L’aggiunta dei 110 velivoli da parte di un caso alterava la lettura dell’altro. Il loro progetto Playwright ora li esegue in sequenza. Il revisore ha inoltre provato le giornate locali di 23 e 25 ore. [Revisione indipendente](../../_bmad-output/implementation-artifacts/evidence/18-7b/revisione.md)

Sul tree di codice e test `ec72d87fe283df6e054712df0c82a71273641a84`, `npm run gates` ha superato lint, typecheck, 2.351 unit test e build. La suite Chromium da 715 casi ha restituito exit 0. Playwright ha classificato 712 casi come passati e tre come intermittenti, tutti recuperati al primo retry. I due casi flotta e i tre METAR sono passati subito. Nessuno skip definitivo. Il database di test e Mailpit erano locali.

## Verifica degli export dopo l’Epic 18

Il follow-up è concluso sul commit applicativo `ddc1c6f`. In Contabilità, «Transazioni (Excel)» rispetta entrambi gli estremi del periodo, compresi gli intervalli aperti e i filtri combinati. Nel registro Scadenze la proiezione compatta a cinque colonne è coerente con la 19.7b. Il PDF perde alcuni caratteri dei nomi fuori da WinAnsi. Gli esempi scaricati, le decisioni aperte e la diagnosi dei quattro retry sono nel [record di verifica](../../_bmad-output/implementation-artifacts/verifica-corrispondenza-export.md).

Il candidato ha superato lint, typecheck, 2.351 unit e build. La suite Chromium su dati sintetici locali ha concluso con exit 0, 712 passati e quattro casi recuperati al primo retry su 716, zero skip definitivi. La revisione indipendente ha approvato la correzione.

## Promemoria dopo rinnovo

La story è conclusa nel commit applicativo `c1ddad6`. Il job confronta la data selezionata con quella corrente sotto lo stesso lock usato dai tre percorsi di rinnovo. Nella prova su PostgreSQL un rinnovo da +3 a +50 giorni durante il giro lascia intatte tutte le soglie e il titolare non riceve il testo a +3. Al giro successivo riceve «50 giorni». Un invio già affidato al trasporto può arrivare dopo il rinnovo. La revisione indipendente e i gate su Node 22 e 24 hanno approvato il candidato. Chromium ha chiuso con 714 passati al primo tentativo, due al primo retry e zero skip. Il [record della story](../../_bmad-output/implementation-artifacts/promemoria-rinnovo.md) conserva le prove sui due job concorrenti, sul guasto SMTP, sul lotto da 200 e sul comando «Invia promemoria» dalla schermata Scadenze.

## Interruttori delle email operative

La sezione Email operative di Impostazioni consente di scegliere separatamente gli avvisi per saldo, diniego di prenotazione, velivolo fuori servizio, archiviazione, promemoria al titolare e riepilogo agli amministratori. In un club già configurato, in assenza di una preferenza salvata, i sei valori sono tutti attivi. Le operazioni di saldo, prenotazione e flotta proseguono anche con la relativa email spenta. Il test SMTP del club e le email di invito e recupero restano disponibili.

Story chiusa al commit applicativo `2337eca` dopo riesame indipendente. Il candidato ha superato 2.363 unit test e 16 prove PostgreSQL. Dei 717 casi Chromium, 715 sono passati al primo tentativo e due al primo retry, con zero skip.

Se entrambi i canali scadenze sono spenti, il job risponde `disabled` senza registrare soglie. Quando un canale viene riacceso, i cicli esistenti ripartono dalle soglie dei giorni successivi di Roma. Creazioni e rinnovi successivi seguono la normale cadenza, anche il giorno stesso. La migrazione riguarda il ciclo delle scadenze. Il [record degli interruttori](../../_bmad-output/implementation-artifacts/interruttori-email-operative.md) riporta i controlli sugli avvisi, sui dati preesistenti e sulla finestra di consegna SMTP.

## Coda SMTP per inviti e recupero password

La [story della coda SMTP](../../_bmad-output/implementation-artifacts/coda-smtp-accesso.md) è conclusa al commit applicativo `25519f39d380`. La creazione utente e il recupero registrano la richiesta nel database. L’amministratore può distinguere un invito accodato da un messaggio accettato dal trasporto e vedere una conferma mancante. Il worker sospende gli invii incerti e limita a tre i tentativi nei casi temporanei con mancata accettazione certa. Il reinvio autorizzato dell’invito invalida la credenziale precedente.

La revisione indipendente ha approvato il candidato. Gate integrato con 2.369 unit, 27 prove PostgreSQL/SMTP sulla coda e 16 regressioni dei promemoria. Chromium su 719 casi, 716 al primo tentativo, 3 dopo retry e 0 skip. La migrazione è stata provata su una copia sintetica già configurata, inclusi un token storico utilizzabile e il contatto senza account.

Nell’ambiente di destinazione il worker richiede un processo supervisionato separato da Next. La [guida operativa](../operations/credential-mail.md) descrive l’attivazione autorizzata e la verifica dello stato in Impostazioni.

## Accesso amministratori con password individuale

La [prima fase del login](../../_bmad-output/implementation-artifacts/accesso-admin-password.md) è conclusa. Dalla pagina di accesso l’amministratore può aprire il form dedicato e lavorare anche a posta spenta. La sessione emessa da questo ingresso verifica subito ruolo, stato e versioni alla richiesta protetta successiva. Il form ordinario continua a servire gli utenti attuali. Prima di introdurre i link email, ogni admin deve collaudare la propria password da una sessione nuova. Il record documenta come preparare gli account con password mancante.

Sul candidato approvato sono passati i cinque casi Chromium isolati senza SMTP o worker, 2.378 unit, 27 prove della coda e 16 dei promemoria. La suite completa ha concluso con 723 casi al primo tentativo e un retry riuscito sul download Excel delle scadenze, senza skip.

## Prova isolata di verifica indirizzo e login via email

La [story di collaudo](../../_bmad-output/implementation-artifacts/invito-e-login-email.md) è conclusa su dati sintetici. Copre invito amministrativo, conferma esplicita, accesso monouso di dieci minuti e limiti agli invii. La modalità è disattivata per default. I link vengono generati dall’origine configurata e le anteprime non aprono una sessione.

Il riesame indipendente ha approvato il tree `528bbcfaa6b1765fd7e76db778d3b89cbb8dd8d7`. Sono passati 2.380 test unitari, 13 casi di invito/login sul database, 27 casi di regressione della coda e 16 dei promemoria. La suite completa ha superato 726 casi Chromium senza retry o skip. A parte, tutti e cinque i casi del fallback admin sono passati a trial e worker spenti, con relay indisponibile.

## HTML per tutte le email applicative

La story HTML è conclusa. Tutti gli undici tipi di email attivi condividono wordmark, intestazione, tipografia e footer. Gli inviti e il login mostrano la rispettiva azione. Il digest conserva l’associazione tra titolare, scadenza e stato in una tabella. Il messaggio SMTP del club resta bilingue. [Story, criteri e revisione indipendente](../../_bmad-output/implementation-artifacts/template-html-email.md)

Le 21 catture Mailpit conservano l’oggetto e il testo semplice della base. Le otto credenziali riportano in HTML lo stesso link dell’alternativa di testo. Su quattro larghezze Chromium sono stati verificati 84 rendering. Sul tree di codice e test approvato sono passati 2.400 unit, 56 casi PostgreSQL e 726 casi browser. La suite browser si è conclusa senza retry o skip. [Matrice e quattro anteprime sintetiche](../../_bmad-output/implementation-artifacts/evidence/email-html/collaudo.md)

## Protezioni dell’accesso prima del cutover

Il milestone è chiuso. Da Impostazioni l’amministratore può sospendere i soli nuovi invii dei link di login. I link già inviati funzionano fino alla loro scadenza e il fallback resta utilizzabile anche durante un’interruzione della posta. Il monitor registra i picchi e i ritardi del worker su database. La coda invia gli avvisi di sicurezza HTML e testo ai soli admin attivi con recapito verificato e distingue accettazione SMTP, rifiuto e incertezza. Prima di una futura attivazione il club deve collaudare individualmente il fallback, verificare i destinatari degli avvisi e predisporre la supervisione separata del monitor. [Record BMAD e collaudo](../../_bmad-output/implementation-artifacts/protezioni-accesso-pre-cutover.md)

Revisione indipendente approvata. Sono passati 2.404 unit, 74 casi PostgreSQL, cinque casi Chromium a posta spenta e la suite completa con 727 casi Chromium, 726 passati al primo tentativo, uno passato al primo retry e zero skip.

## Ritiro della simulazione dei recapiti

L'amministratore trova in Impostazioni le dieci schede precedenti. La destinazione degli avvisi operativi torna a seguire le regole anteriori a `142ef94`, anche nelle installazioni di prova che avevano attivato la simulazione. Il contatto delle persone senza account e quello del club per il test SMTP conservano i loro usi distinti. La migrazione correttiva rimuove i due indici di ricerca e la funzione della simulazione. [Record BMAD del ritiro](../../_bmad-output/implementation-artifacts/riconciliazione-recapiti-legacy.md)

## Requisito aperto

Enrico ha confermato un solo indirizzo registrato per utente, usato per l’accesso e per le comunicazioni. Questa correzione non migra i recapiti esistenti. Il cambio indirizzo è sospeso e fuori dal piano attivo. [Decisione sul recapito unico](../../_bmad-output/implementation-artifacts/promemoria-rinnovo.md)

Restano aperte le decisioni sul formato dettagliato di Scadenze e sul font Unicode nei PDF. La retrospettiva dell’Epic 18 resta facoltativa.

## Indirizzo account, unicità e invito di verifica

La story sull’indirizzo verificato è chiusa. Nel trial l’account usa un’unica casella per accesso e comunicazioni, univoca fra tutti gli account. L’amministratore ottiene un invito di verifica automatico sia creando l’utenza sia creando la persona con accesso. Il fallback amministrativo usa la password individuale predisposta prima di un eventuale guasto della posta.

Sul tree `6c9bff26c31e37b65bb64b83f06d468e973fd0cb` sono passati il riesame indipendente, il gate con 2.404 unitari, 107 casi PostgreSQL/SMTP e i cinque casi Chromium con trial acceso. La suite Chromium a trial spento ha concluso 727 scenari. Sono passati 724 al primo tentativo e uno al primo retry. I due scenari saltati richiedevano il trial acceso e sono passati nella suite dedicata. La copia sintetica aggiornata ha conservato la data originale della prova di casella. Enrico ha deciso la durata di sette giorni per l’invito iniziale, il reinvio finché la prima attivazione è pendente e l’esclusione degli avvisi precedenti alla conferma. Il record della story documenta le soglie del titolare e del digest, l’idoneità al momento dell’evento e il limite sui vecchi rinnovi di cui manca la data. [Prove locali e checkpoint precedenti](../../_bmad-output/implementation-artifacts/evidence/recapito-account-verificato/riscontri.md)

## Riattivazione di un account sospeso

La story è conclusa sul candidato applicativo `9face77`, approvato dalla revisione indipendente. Nel trial Piloti offre «Invia link di riattivazione» per un account sospeso con casella già verificata. Il link dura dieci minuti. L'account resta sospeso fino al POST di conferma, poi il titolare accede da una nuova sessione. L’invito per la prima attivazione resta valido sette giorni.

Il gate integrato ha superato 2.406 unitari e la build. Le sette suite di integrazione hanno superato 118 casi. Con trial spento, Chromium ha registrato 725 passati e quattro skip attesi, senza retry. Con trial acceso sono passati tutti e sette i casi mirati, inclusi i quattro esclusi dalla suite generale. Sono passati anche i cinque scenari del fallback con SMTP e worker spenti. La [scheda di riattivazione](../../_bmad-output/implementation-artifacts/riattivazione-account-con-link.md) riporta il collaudo di aggiornamento, i limiti e la diagnostica. Il cambio email e gli interventi sui PDF restano separati.
