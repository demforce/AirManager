# Collaudo delle email HTML AirManager

Il 27 novembre 2026 due trasporti hanno generato 21 messaggi sintetici. Mailpit li ha accettati su loopback con inoltro disabilitato. Per ogni messaggio il confronto usa l’oggetto e il testo semplice generati dal codice e dai cataloghi di `6322ef967662df2af55d9e1b1b58e00584781e01`, con gli stessi dati e la stessa scadenza assoluta. Il tree di codice e test collaudato è `a4ccfc7eb7ef96966b2c655b123b7aded924c15e`.

## Messaggi catturati

| Percorso applicativo | Catture | Riscontro nel messaggio |
|---|---:|---|
| Invito con impostazione della password | IT, EN | Un pulsante descrittivo imposta la password. |
| Recupero password | IT, EN | Il pulsante di reset conserva il link e la scadenza. |
| Invito di verifica indirizzo | IT, EN | Il pulsante porta alla verifica nella lingua del destinatario. |
| Login monouso | IT, EN | Il pulsante porta alla conferma di accesso. |
| Test SMTP del club da Impostazioni | 1 bilingue | Un unico messaggio contiene oggetto e testo in entrambe le lingue e usa il contatto del club. |
| Peggioramento del saldo | IT, EN | Nome e saldo dopo la rettifica corrispondono al testo semplice. |
| Diniego prenotazione | IT, EN | Velivolo, orario e motivo corrispondono alla prenotazione. |
| Velivolo fuori servizio | IT, EN | Stato, motivo e prenotazione interessata restano leggibili. |
| Archiviazione velivolo | IT, EN | L’avviso conserva il velivolo e la prenotazione interessata. |
| Promemoria al titolare | IT, EN | Tipo di scadenza, data e giorni residui corrispondono. |
| Riepilogo agli amministratori | IT, EN | Ogni riga associa titolare, scadenza e indicazione operativa. |

Sono stati attivati i servizi applicativi di creazione utente, reset, login di un account verificato, prova SMTP, rettifica contabile, transizione di una prenotazione e cambio di stato del velivolo. Il job delle scadenze ha trattato tre titolari, inclusa una persona senza recapito. Il worker ha elaborato le otto credenziali e la prova del club tramite `observed-smtp`. Gli altri dodici messaggi sono passati da `SmtpMailSender`. Il test unitario del digest copre anche le indicazioni per invio fallito, promemoria disattivato e soglia sospesa.

## Confronto MIME e protezione dei link

Il parser MIME ha decodificato il messaggio grezzo di ogni cattura. Tutti e 21 contenevano un solo destinatario in `To`, un’alternativa `text/plain` seguita da `text/html` e nessun allegato, CC o BCC. Oggetti e testi semplici coincidevano con la base, normalizzati i fine riga MIME. Per gli otto messaggi con credenziali, il confronto con la base ha usato un segnaposto per il valore casuale. Nel confronto fra le parti del **medesimo messaggio** il valore era invece quello effettivo, con uguaglianza esatta tra link di testo e destinazione del pulsante. Sono stati verificati origine, percorso, scopo e lingua. Per il digest sono stati confrontati ordine, titolare, dettagli e stato di ogni riga.

Le otto credenziali sintetiche sono state confrontate in memoria con 28 righe delle tabelle `AuthToken`, `MailAttempt`, `CredentialMail`, `MailChannel` ed `EmailTrialRequest`. Nessuna riga conteneva il valore in chiaro o un documento HTML. Il log del giro di prova era privo di questi valori. Il worker costruisce il messaggio in memoria prima di `beginHandoff` e conserva il controllo immediatamente prima dell’invio.

## Resa e anteprime

Chromium 156 ha aperto ciascuna delle 21 parti HTML con JavaScript disabilitato a 320, 375, 768 e 1280 px. Su 84 misurazioni ci sono stati zero overflow orizzontali e zero richieste di rete. Il contrasto minimo del testo misurato rispetto allo sfondo era 6,85:1. Ogni pulsante misurava almeno 48 px in altezza. I titoli del digest sono marcati come intestazioni di riga e colonna. Le indicazioni operative sono scritte per esteso.

Le immagini mostrano dati sintetici. Prima della cattura, la destinazione di ogni pulsante è stata sostituita in memoria con un segnaposto inerte. Sono state esaminate le viste Chromium. Gmail, Outlook, Apple Mail, lettori di schermo e dispositivi fisici restano fuori dal collaudo.

- [Invito, 375 px](invito-mobile.png)
- [Digest, 320 px](riepilogo-mobile.png)
- [Digest, 768 px](riepilogo-desktop.png)
- [Avviso di fermo in inglese, 375 px](avviso-mobile-en.png)

## Come ripetere il confronto

1. Preparare un PostgreSQL di test dedicato e Mailpit su loopback con inoltro disabilitato. Usare le impostazioni sintetiche del progetto e abilitare il trial email in questo ambiente. Inizializzare il database dedicato con `npm run db:reset:test`.
2. Predisporre un titolare e un amministratore per lingua. Attivare i percorsi in tabella, eseguire il worker per le credenziali e il job per promemoria e digest. Assegnare recapiti sintetici distinti per poter attribuire ogni messaggio.
3. In Mailpit aprire la sorgente MIME delle singole catture. Decodificare subject, parti e destinatari con un parser MIME. Confrontare i contenuti usando le stesse fixture sui cataloghi e i builder della base. Per ciascuna credenziale verificare in memoria l’identità del link delle due alternative. Per il digest confrontare separatamente ogni riga.
4. Aprire le parti HTML con rete bloccata alle quattro larghezze. Misurare larghezza del documento, contrasto e area del pulsante. Sostituire i link prima di salvare anteprime condivisibili.
