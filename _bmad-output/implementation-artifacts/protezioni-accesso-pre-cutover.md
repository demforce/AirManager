# Protezioni dell’accesso prima del cutover

Stato BMAD **done**, 27 novembre 2026. Base `6dd3a476e976830dcec59070dc7bd39d3dff4e59`.

Un amministratore deve poter operare durante un’interruzione della posta e sospendere esclusivamente gli invii dei link di login. Il club deve ricevere avvisi aggregati via email sui picchi di richieste e sul fermo del worker, anche quando il guasto impedisce di inviare subito l’avviso.

## Piano test-first

| Tranche | Prima prova sul comportamento | Criterio di uscita |
|---|---|---|
| 1 · Password amministrativa personale | Sul normale percorso di impostazione o reset, provare una password amministrativa corta e una conforme. Con una credenziale storica già attiva, esercitare il fallback dopo errori e allo scadere dell’attesa. | La policy vale sulle nuove impostazioni amministrative. Le richieste durante la pausa temporanea ricevono l’esito generico. Il titolare può rientrare dopo la finestra. Un admin con password esistente salva e rilegge un’operazione da browser disconnesso a posta e worker spenti. Restano in vigore i controlli su ruoli, disattivazione e sessioni. |
| 2 · Interruttore dei link di accesso | Da Impostazioni, sospendere gli invii con una richiesta ancora in coda e un link già emesso. Richiedere un link durante la pausa e riattivare prima che scada. | La pausa agisce sulla nuova prenotazione e sul controllo immediatamente precedente alla consegna. La riapertura serve le nuove richieste ammissibili. Il link già emesso continua a funzionare, senza recupero degli invii sospesi. Gli altri canali mantengono il loro comportamento. |
| 2 · Monitor e avvisi | Con richieste sintetiche e heartbeat fermo, eseguire il monitor a worker spento. Reiterare la rilevazione e simulare indisponibilità temporanea, rifiuto definitivo e risposta incerta con trasporto isolato. | L’intento sopravvive al riavvio. Le osservazioni ripetute dello stesso incidente sono deduplicate. Alla ripresa si cattura l’email HTML e testo in Mailpit per i soli admin attivi con indirizzo verificato. L’esito incerto resta distinguibile dall’accettazione SMTP e ferma il retry automatico. |

Prima della pubblicazione occorrono revisione indipendente, gate integrati e suite browser sul candidato verificato, PostgreSQL sintetico e Mailpit locale con inoltro disabilitato. Nel collaudo ordinario si usa il trial soltanto sul database dedicato. La verifica indipendente del fallback usa il trial spento. Prima di una futura transizione il club deve verificare che gli amministratori previsti siano in grado di operare con posta indisponibile e che esista un destinatario idoneo per gli avvisi.

Le decisioni precedenti sono nel [record del fallback](accesso-admin-password.md), nella [story del login di prova](invito-e-login-email.md) e nel [collaudo HTML delle email](template-html-email.md).

## Esito

L’ingresso amministrativo continua ad accettare le credenziali storiche anche a relay e worker spenti. Alla nuova impostazione o al reset di una password admin il server richiede 15 caratteri e rifiuta il riuso della password corrente. Dopo i primi tre tentativi non riusciti il fallback applica una distanza crescente tra verifiche, da cinque secondi a cinque minuti, nella finestra mobile di quindici minuti. Una richiesta già in pausa riceve la risposta generica e lascia invariato il termine. Il manuale del club richiede una password personale dedicata e la prova individuale prima del futuro passaggio.

Da Impostazioni un admin può sospendere e riprendere gli invii dei link di login. Il worker conserva la generazione registrata alla pausa. Può quindi scartare le richieste precedenti anche quando la connessione al relay inizia dopo la riattivazione. Il controllo prima della consegna conserva l’invito, la prova SMTP, gli avvisi operativi e quelli di sicurezza. I link già inviati conservano la loro scadenza originale. Dopo la riapertura serve una nuova richiesta ammissibile.

Il monitor indipendente registra il picco di richieste o il ritardo della posta e prepara l’avviso durabile. Il worker lo invia ai soli admin attivi con indirizzo ancora verificato. Ogni incidente e destinatario hanno un solo intento. La diagnostica distingue fermo, assenza di destinatari, attese, rifiuti e incertezza. La conferma positiva SMTP attesta l’accettazione del trasporto. La scheda operativa descrive soglie, retry e supervisione. [Procedura del club](../../docs/operations/credential-mail.md)

Il tree di codice e test approvato in riesame indipendente è `f082b22e8019b2afc18e7285ef65f916e11fcb1b`. Il gate integrato ha superato lint, TypeScript, 2.404 unit test e build. Sono passate 74 prove su PostgreSQL, oltre al collaudo offline e alla cattura MIME locale. La suite finale ha completato 727 casi Chromium, 726 passati al primo tentativo, uno passato al primo retry e zero skip. [Prove, diagnostica e limiti](evidence/protezioni-accesso/riscontri.md)
