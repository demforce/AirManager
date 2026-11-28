# Coda SMTP per inviti e recupero password

**Stato BMAD: done, 27 novembre 2026.** Commit applicativo `25519f39d380cd248be9963890275fb037459322`, albero di codice e test `f5f08e99cdac8193e458b8ff8859c16cef6c6670`. Base `5149fdea94f25b5645baf803b92233823912ba37`. Il PO ha approvato la specifica preparatoria del 27 novembre 2026, SHA-256 `80b32d1dd218166b3e5eee2d27f8c5bb65f7b97a9167b9e810b4caea36079e2d`, che ha superato la revisione indipendente. La story segue gli [interruttori delle email operative](interruttori-email-operative.md).

## Esigenza

Chi amministra il club deve poter distinguere la creazione di un account dalla presa in carico del suo invito da parte di SMTP. Il recupero password deve conservare la risposta pubblica generica. Se il servizio SMTP è temporaneamente indisponibile, una richiesta ancora valida deve poter ripartire senza che l’utente debba ripeterla. Se manca la conferma dopo un possibile affidamento al trasporto, ripetere automaticamente l’invio può produrre due messaggi.

## Criteri

1. Accodare l’intento nella transazione autorizzata per creazione utente, creazione con accesso da anagrafica, reinvio di un invito pendente e recupero password. Conservare permessi, limiti delle richieste e risposta pubblica. Il reinvio amministrativo intenzionale sostituisce la credenziale precedente. Ripetere la stessa azione dopo perdita della risposta HTTP è idempotente.
2. Distinguere esiti e motivi normalizzati per messaggio e per tentativo. Solo una conferma finale SMTP positiva per il destinatario atteso attesta l’accettazione da parte del trasporto. Un rifiuto permanente, la scadenza, la sostituzione e una possibile accettazione senza conferma terminano i tentativi automatici.
3. Il worker riparte senza richieste HTTP. Il database coordina concorrenti, lease, limiti di lotto, tentativi e ripresa. Nessun lock durante SMTP. Al massimo tre tentativi, con attesa fra tentativi e scadenza originale, esclusivamente per errori transitori di mancata accettazione certa. Un processo interrotto dopo l’inizio del possibile affidamento lascia un esito incerto.
4. Verificare idoneità e generazione prima dell’invio; sopprimere link utilizzati, revocati, superati o fuori tempo. Conservare solo il materiale indispensabile. I log e la diagnostica escludono token, link, indirizzi e testo SMTP grezzo.
5. Esporre la diagnosi amministrativa in IT/EN e lo stato reale dell’invito nei percorsi UI. La sonda manuale usa il contatto del club. La verifica automatica dopo una pausa usa unicamente un intento dovuto; a coda vuota non genera messaggi. Documentare l’avvio autorizzato del worker e il suo stato di salute.
6. Dimostrare su database sintetico aggiornato la compatibilità con utenti, token, recapiti, impostazioni e marker antecedenti. Eseguire i test SMTP su loopback, i gate del progetto, i percorsi UI e il riesame indipendente sul candidato finale.

Il perimetro termina alla coda. Il login, l’unificazione futura degli indirizzi e il recupero dell’ultimo amministratore sono fuori da questa story. I contatti sprovvisti di account mantengono i recapiti operativi esistenti.

## Metodo di verifica

La prova preparatoria sulla base aveva mostrato che `451`, `550` e perdita della risposta dopo DATA producevano lo stesso `sent:false` nella sonda del club. Il collaudo di questa story deve verificare la persistenza dei diversi esiti su PostgreSQL, inclusa la ripresa di un altro processo, e le diciture effettivamente mostrate all’amministratore.

## Preparazione dei dati sintetici

PostgreSQL 16 è stato avviato appositamente per la story su loopback, con database separati per sviluppo, browser e aggiornamento. La copia di aggiornamento deriva da tutte le migrazioni e dal seed del commit di base. Contiene cinque utenti, cinque persone (una senza account), due token emessi con lo schema precedente, cinque impostazioni, una scadenza e un marker di avviso. Prima dell’upgrade sono state salvate le impronte delle sei tabelle sui campi originari. Nel verbale si riportano solo conteggi e confronti.

Il primo test sul recupero, `vitest run src/server/services/auth-tokens.service.test.ts -t 'does not call the transport'`, è uscito 1 sulla base. La chiamata ha attivato il trasporto una volta mentre il test ne attendeva zero. La verifica della nuova classificazione SMTP è partita con il relativo modulo assente e ha poi superato i primi tre casi mirati. Il test di aggiornamento preliminare ha confrontato i campi storici, verificato che nessun intento sia stato accodato dalla migrazione e consumato un invito antecedente attraverso il servizio applicativo.

## Diagnosi durante lo sviluppo

| Comando o prova | Exit | Riscontro |
|---|---:|---|
| `npm run gates` su `0766b523` | 0 | Lint, TypeScript, 2.366 unit e build verdi sul primo albero esaminato. |
| `npx playwright test --project=credential-mail --no-deps --workers=1 --retries=0` sullo stesso albero | 1 | `Cannot use 'import.meta' outside a module` importando il client Prisma nel loader del test. La selezione si è fermata prima di eseguire casi browser. |
| Verifica Chromium della copia di aggiornamento, primo avvio | 1 | La fixture scritta a mano ometteva `holderSince` e `digestSince` dalla preferenza operativa precedente. Impostazioni ha rifiutato la fixture con `invalid_type`. Il template storico è stato corretto chiamando il servizio di configurazione del commit di base e le impronte sono state ricalcolate. |

Il primo riesame indipendente ha richiesto interventi sul messaggio di creazione composita, la selezione dell’invito più recente durante emissioni concorrenti, il battito del worker, il caricamento dell’ambiente locale, la sanificazione dei cinque ingressi e l’isolamento del collaudo. Ha rilevato anche che una risposta tardiva, arrivata prima del giro di recupero del lease, poteva riaprire una sonda o programmare un retry. Il completamento deve considerare il tempo del database anche quando nessun altro processo ha ancora osservato la scadenza. Un errore tecnico nella preparazione del messaggio deve precedere l’affidamento e conservare il budget SMTP.

Sul tree intermedio `a27cfb53` il gate ha superato lint, TypeScript, 2.369 unit e build. L’arbitro ha ripetuto su PostgreSQL e trasporto locale 22 casi della coda e 16 dei promemoria. La verifica di compatibilità ha confrontato tutte le colonne preesistenti delle sei tabelle. Subito dopo la migrazione erano presenti zero intenti, zero tentativi e un solo registro del canale; il servizio applicativo ha accettato il token d’invito storico. I vecchi token non associati a un intento mantengono il loro contratto originale.

Sul primo snapshot con build di produzione, Chromium ha aperto Impostazioni sul database aggiornato in IT ed EN. Il test manuale da tastiera al contatto sintetico del club ha ricevuto la conferma finale 250 e la UI ha distinto questa prova dallo stato della verifica automatica. Nel primo collaudo l’attesa di 5 secondi della fixture per il feedback era insufficiente. Una misura isolata sullo stesso relay ha osservato 73 ms con l’indirizzo loopback letterale e 20.095 ms con il nome `localhost`; la prova con tempo di attesa compatibile con la sonda è passata. Il collaudo non misura la consegna in caselle esterne.

| Prova su candidati intermedi | Exit | Riscontro e risoluzione |
|---|---:|---|
| Chromium `--project=credential-mail --no-deps --retries=0` su `4824bbb9` in sviluppo | 1 | Raggiunto il limite di 5 s per il login a freddo. A server caldo il caso è arrivato alla sonda, dove era attesa una risposta entro 5 s. L’arbitro con build di produzione su `a27cfb53` ha poi eseguito i due casi IT/EN in 38,5 s, zero retry e skip. |
| `node --import tsx --test scripts/test-credential-mail.ts` durante lo sviluppo | 1 | Prima pulizia delle fixture nell’ordine errato (`AuthToken_userId_fkey`), poi un doppio che cercava di sostituire un metodo sul proxy Prisma (`ERR_INVALID_ARG_VALUE`). La pulizia e le fixture sono state corrette; nessun accesso a database esterni. |
| `tsc --noEmit` su alberi in lavorazione | 2 | Riferimenti a `sendInviteEmail` dopo la rimozione del vecchio percorso e tipi incompatibili nei doppi di route/Prisma. Il gate di `a27cfb53` ha superato il typecheck. |
| Riesame su `a27cfb53` | — | Riscontrati un vincolo nuovo su username SMTP senza password, la diversa risposta fra clic e storico allo scadere del lease, e l’assenza del termine residuo del token accanto alla finestra di retry. L’errore tardivo di preparazione richiedeva inoltre di verificare a chi fosse ancora assegnata la sonda. La suite browser integrale è stata riservata al candidato corretto. |

## Implementazione e revisione

L’intento di invio viene scritto nella stessa transazione che autorizza l’operazione applicativa. Il worker recupera il destinatario dal riferimento all’account e genera la credenziale al momento del tentativo. Nella coda e nel registro dei tentativi non sono conservati il destinatario SMTP, il contenuto del messaggio o il link. La tabella delle credenziali mantiene l’hash. Una nuova generazione revoca la precedente. I risultati già osservati dal trasporto restano distinguibili dalla validità del link.

L’amministratore vede il risultato relativo all’invito e può reinviare dai percorsi esistenti. Per una richiesta nota come certamente non accettata, il worker può riprovare entro il budget di tre tentativi e la data originaria. Il registro conserva separatamente i tentativi e l’esito corrente dell’intento. Il canale distingue la prova manuale sul contatto del club e l’invio già dovuto usato alla ripresa. La [guida operativa](../../docs/operations/credential-mail.md) descrive ambiente, comando, supervisione, limiti e diagnosi.

Per il riesame indipendente è stato selezionato Astra xhigh. La motivazione è l’interazione fra commit PostgreSQL, credenziali monouso, lease concorrenti e conferma SMTP. Il revisore ha approvato tecnicamente l’albero `f5f08e99cdac8193e458b8ff8859c16cef6c6670` dopo il riesame dei tredici rilievi. Le correzioni finali preservano il relay storico senza AUTH quando è valorizzato solo il nome utente, distinguono i 530/535 dai rifiuti del destinatario, proteggono la sonda già assegnata da un errore di preparazione tardivo e fanno leggere al clic manuale l’esito registrato per quel preciso tentativo. In caso di chiusura della finestra di invio, il pannello indica in ora di Roma il termine di un token già emesso e ancora valido.

Il formato storico del valore SMTP salvato non permette sempre di distinguere localmente una password legacy in chiaro da un valore non decifrabile. La risposta strutturata di autenticazione del relay costituisce il riscontro disponibile. Una conferma SMTP positiva attesta il passaggio al trasporto. L’arrivo nella casella resta fuori dal contratto.

La prima invocazione integrale di `scripts/e2e.sh start --workers=2` su `f5f08e99` ha ereditato un `TMPDIR` troppo lungo per il socket Unix di Chromium. Durante il lancio del browser comparivano `Socket path too long …/SingletonSocket` e `signal=SIGABRT`. Il coordinatore ha fermato quel gruppo di processi con SIGTERM prima dell’esito finale del runner. I tentativi di questo avvio non costituiscono prove dell’applicazione. Il rilancio usa una directory temporanea corta, lo stesso albero e un nuovo reset del database sintetico.

## Prove del candidato finale

| Verifica sull’albero `f5f08e99cdac8193e458b8ff8859c16cef6c6670` | Exit | Esito |
|---|---:|---|
| `npm run gates`, Node 22.23.5 e npm 10.9.11 | 0 | Lint 46 s, typecheck 46 s, 2.369 unit in 18 s, build 55 s. |
| `npm run db:reset:test`; `npx --no-install tsx --test scripts/test-credential-mail.ts` | 0 | 27/27 in 30,75 s sull’arbitro. Zero retry o skip. Verificati rollback, concorrenza, riavvio in un processo distinto, lease nei due ordini, 451, 550, 250 e conferma finale persa, scadenza, sostituzione, intervento manuale, log e compatibilità del trasporto. |
| `npx --no-install tsx --test scripts/test-expiry-renewals.ts` | 0 | 16/16 in 8,92 s. Zero retry o skip. |
| Migrazione della copia storica, confronto delle impronte e uso dell’invito antecedente | 0 | Utenti, persone, token, impostazioni, scadenze e marker corrispondono alla base. La migrazione ha accodato zero messaggi. Un invito preesistente è stato usato con il servizio aggiornato. |
| Chromium su copia aggiornata, e due casi della story su DB separato appena ricreato | 0 | La sonda attivata da tastiera mostra la stessa accettazione SMTP in IT/EN. I due casi passano senza retry o skip usando una build di produzione e SMTP controllato. Coprono entrambe le creazioni, 451, ripresa, sonde distinte e visibilità del termine della credenziale. |

I cinque controlli mirati delle ultime correzioni sono stati ripetuti dopo due run RED con exit 1. Il primo ha rilevato la configurazione SMTP storica rifiutata, la sonda sovrascritta da un errore precedente e la difformità fra il 451 tardivo restituito dalla sonda e la sua riga persistita. Il secondo ha rilevato l’assenza della data residua per un link valido alla chiusura della finestra di retry. Tutti e cinque sono passati sul candidato approvato.

Il run integrale successivo sullo stesso albero è terminato con exit 1 in 25,0 minuti: 652 passati subito, due passati al retry, uno fallito e 64 non eseguiti. I due retry seguivano attese di 5 s per «Le mie scadenze» e per «Nessun conto attivo». In `settings.spec.ts:208`, il collaudo si aspettava HTTP 422 per un indirizzo diverso dall’host SMTP autorizzato. L’arbitro aveva configurato proprio quell’indirizzo come host autorizzato, perciò l’applicazione ha restituito 200. Nel run successivo l’ambiente usa il valore storico previsto dalla suite, `localhost`, e solo quel nome riservato viene risolto attraverso la configurazione locale del sistema. I messaggi e le risposte SMTP transitano comunque sui veri socket di loopback. Il database è stato ricreato e il codice è identico.

La verifica separata del contratto corretto ha eseguito tutti i 20 casi di `e2e/settings.spec.ts` sulla build approvata, in 2,0 minuti, con exit 0 e zero retry o skip. Ha incluso l’atteso rifiuto HTTP 422, il test SMTP dal pulsante e la disponibilità di invito e recupero con tutti gli avvisi operativi spenti.

## Suite browser integrale

`E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2` ha concluso con `E2E_EXIT=0` in 30,8 minuti. Dei 719 casi, 716 sono passati al primo tentativo, 3 dopo retry e 0 sono stati saltati. I due casi specifici della coda sono registrati nel progetto Chromium `credential-mail`. Il meteo proviene dalla fixture sintetica locale.

- `flights.spec.ts:227` è passato al primo retry. Al primo tentativo l’attesa di 5 s è terminata prima che la riga del volo mostrasse la durata «1:20».
- `instructor-compensation.spec.ts:338` è passato al primo retry. Dopo il saldo del compenso, al termine dei 5 s il controllo trovava ancora una riga mobile dell’istruttore inattivo mentre ne attendeva zero.
- `personal-planning.spec.ts:24` è passato al primo retry. La vista mobile delle prenotazioni personali non era visibile entro i 5 s del primo tentativo.
