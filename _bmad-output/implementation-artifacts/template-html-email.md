# Template HTML comune per tutte le email AirManager

Stato BMAD **done**, 27 novembre 2026.

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

## Consegna e revisione indipendente

Tutti gli undici tipi di messaggio attivi usano intestazione, wordmark, footer e tipografia comuni. Gli inviti e il login mostrano un pulsante con l’azione nella lingua del destinatario. Il digest presenta una tabella con titolari e scadenze, gli avvisi semplici mantengono i paragrafi. Il wordmark occupa il punto predisposto per il futuro logo. La stessa base è disponibile per i futuri avvisi di sicurezza e per il cambio di recapito.

Le funzioni dei template restituiscono oggetto, testo semplice e HTML. Il rendering usa l’escape automatico anche negli attributi. Per una CTA il builder convalida origine configurata, percorso e scopo. L’indirizzo del destinatario viene assegnato dal servizio applicativo. Nel worker il rendering termina prima della transazione che autorizza la consegna al trasporto.

La revisione indipendente in contesto separato ha approvato il diff tra `6322ef967662df2af55d9e1b1b58e00584781e01` e il tree di codice e test `a4ccfc7eb7ef96966b2c655b123b7aded924c15e`. Ha controllato i chiamanti dei due trasporti, il destinatario singolo delle credenziali, il punto in cui il worker autorizza l’invio, i cataloghi, la convalida delle azioni e le evidenze MIME e visive. Zero rilievi bloccanti. [Matrice delle catture, metodo e quattro anteprime](evidence/email-html/collaudo.md)

## Verifiche sul candidato

| Comando o prova | Exit | Esito |
|---|---:|---|
| Vitest mirato ai builder e ai servizi che inviano email | 0 | 630/630 su sette file. |
| `npm run gates` su Node 22 | 0 | Lint, TypeScript, 2.400 test unitari e build. |
| `node --import tsx --test scripts/test-credential-mail.ts` | 0 | 27/27 su PostgreSQL sintetico e SMTP locale, compresi concorrenza, retry e risposta incerta. |
| `node --import tsx --test scripts/test-expiry-renewals.ts` | 0 | 16/16, inclusi rinnovo e soglie del nuovo ciclo. |
| `node --import tsx --test scripts/test-verification-invite.ts` | 0 | 13/13, inclusi invito e login del trial. |
| Cattura SMTP, decodifica delle parti MIME e verifica della persistenza | 0 | 21/21 in Mailpit. Oggetti e testi semplici corrispondenti alla base. Otto link effettivi identici fra le due parti. |
| Resa Chromium sulle catture | 0 | 84/84 alle quattro larghezze. Contrasto minimo 6,85:1, CTA alta almeno 48 px. |
| `E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2` su build e database e2e reinizializzato | 0 | 726/726 in 31,6 minuti, tutti al primo tentativo. Zero skip. Il runner ha registrato `E2E_EXIT=0`. |

## Diagnostica di sviluppo

| Comando | Exit | Diagnostica sanitizzata e risoluzione |
|---|---:|---|
| `vitest run src/server/adapters/mail/html-templates.test.ts` sulla base | 1 | 19 test rossi. Il campo HTML e i builder previsti dal test erano assenti. Dopo l’implementazione la suite mirata passa. |
| Vitest sui template durante lo sviluppo | 1 | Due casi IT/EN dei builder storici fallivano con `Invalid email action URL.`. Il caricamento della configurazione è stato isolato e l’intera selezione è passata. |
| `python /tmp/amhtml27/verify.py` sui MIME della base | 1 | 21 casi con `expected multipart/alternative plain then HTML`. Il confronto separato del testo passa 21/21 sulla stessa cattura. Il candidato supera entrambi i controlli. |
| `python /tmp/amhtml27/render.py` sulla prima versione | 1 | `('INVITE-en', 320, 'CTA height')`. L’area del pulsante era alta 42 px. Dopo la regolazione di interlinea e spaziatura, tutte le CTA misuravano almeno 48 px. |
| `node --import tsx --test scripts/test-credential-mail.ts` al primo giro | 1 | `worker loads a synthetic dotenv file while retaining supervisor precedence`, exit del processo figlio 1 invece di 0. Il figlio con dotenv sintetico ha poi restituito 0 in isolamento. Dopo il reset del database la suite ha superato tutti i 27 casi. La causa del primo esito resta indeterminata. |
| Prima raccolta di `npm run gates` | 1 a livello della shell di raccolta | Quattro righe `PASS` per lint, typecheck, 2.400 unit e build. Esecuzione diretta sullo stesso candidato con codice finale acquisito esplicitamente, exit 0. |
