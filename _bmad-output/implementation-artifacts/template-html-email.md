# Template HTML comune per tutte le email AirManager
Stato BMAD: backlog. Ordine concordato: immediatamente dopo la prova invito/login via email, prima dell’attivazione pubblica.

Come destinatario voglio leggere un messaggio AirManager riconoscibile da telefono o desktop e capire quale azione posso compiere.

| Famiglia | Copertura richiesta |
|---|---|
| Accesso e identità | Login, invito di verifica, invito password storico, reset/recupero, futuro cambio recapito. |
| Operatività | Test SMTP, peggioramento del saldo, diniego prenotazione, fermo e archiviazione velivolo, promemoria scadenze e digest amministrativo. |
| Sicurezza | Applicare lo stesso layout ai futuri avvisi di sicurezza quando saranno implementati. |

- Usare un solo layout semplice, responsive, con wordmark testuale AirManager e uno spazio progettato per il futuro logo. Gli asset attuali sono esclusivamente interni al messaggio, senza logo inventato.
- Conservare lingue e contenuti esistenti. Produrre multipart/alternative con testo semplice e HTML coerenti. Dove c’è un’azione usare una CTA descrittiva con buon contrasto.
- Eseguire l’escape dei dati dinamici nei contesti HTML e attributo. Usare solo URL d’azione fidati. Niente JavaScript, tracking, immagini o font esterni.
- Costruire i contenuti delle credenziali solo nel momento consentito dalla coda. Log, diagnostica e persistenza applicativa devono restare privi di token in chiaro.
- Conservare destinatari, envelope, trigger, permessi e interruttori. Prima di modificare il codice verificare l’inventario sui chiamanti effettivi e documentare eventuali ulteriori email applicative.
- Collaudare entrambe le lingue su messaggi sintetici in capture locale, decodificare le due parti MIME e confrontare contenuti, CTA e resa mobile/desktop. I tipi di messaggio futuri entreranno nel collaudo alla rispettiva implementazione.
