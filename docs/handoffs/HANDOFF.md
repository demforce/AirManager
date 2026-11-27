# Handoff AirManager · 27 novembre 2026

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

## Prossimo lavoro

Dopo la correzione dei promemoria a seguito di rinnovo, il prossimo passo approvato è la story dei sei interruttori operativi. Per una story successiva il PO ha scelto un unico indirizzo verificato per l’accesso e le comunicazioni di chi ha un account. I contatti senza account continueranno a ricevere avvisi al proprio recapito, senza creare account impliciti. Il recapito del club servirà da destinazione distinta per il test SMTP. [Record promemoria dopo rinnovo](../../_bmad-output/implementation-artifacts/promemoria-rinnovo.md)

Restano aperte le decisioni sul formato dettagliato di Scadenze e sul font Unicode nei PDF. La retrospettiva dell’Epic 18 resta facoltativa.
