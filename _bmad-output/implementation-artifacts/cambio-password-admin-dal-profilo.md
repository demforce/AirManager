---
baseline_commit: 1d8b46a981c1315cbafabb99fc7d6fb8ad793b29
---

# Cambiare la propria password amministrativa dal profilo

Stato BMAD **done**. La story del primo invito admin è chiusa. Il titolare con ruolo admin attivo e casella verificata può chiedere «Cambia password» dal proprio profilo.

## Criteri di accettazione

- Il server ricava l’unico destinatario dalla casella verificata dell’account in sessione. La richiesta riguarda esclusivamente il titolare. La creazione, il primo invito, il reset pubblico e la gestione di altri utenti conservano i rispettivi contratti.
- La coda protetta invia un link monouso per questo scopo, con scadenza a dieci minuti dall’emissione anche dopo un retry. Si riusano i controlli applicabili per origine fidata, limiti, deduplica, messaggi multipart IT/EN e diagnostica priva di segreti.
- Un GET apre il form «Nuova password» e «Conferma password». Solo un salvataggio esplicito, valido e riuscito cambia la password. Verificare scadenza, consumo singolo anche in concorrenza, declassamento o disattivazione sopravvenuti e comportamento delle sessioni secondo la politica già pubblicata.
- Per l’admin che usa la password come fattore singolo verificare lunghezza minima di 15 caratteri, supporto di almeno 64 caratteri, incolla e autofill, assenza di regole obbligatorie di composizione e rifiuto locale di password comuni, prevedibili o compromesse. Accettare o rifiutare esplicitamente l’intero valore. Non trasmettere password a servizi esterni. Conservare la lettura degli hash esistenti e l’operatività offline del fallback.
- Verifiche su PostgreSQL sintetico, Chromium e Mailpit isolato. Compresi link ricevuto, GET, conferma, errore di validazione, retry senza proroga e uso del fallback con la nuova credenziale. Trial spento per default.

## Compatibilità da verificare

La base usa Argon2id tramite `@node-rs/argon2`, controlla il minimo admin in punti di assegnazione e applica a più form un limite di 256 unità UTF-16. Verificare l’allineamento del conteggio Unicode, degli spazi e delle lunghezze fra impostazione e login, e predisporre un controllo locale efficace delle password prevedibili. La policy attuale di impostazione amministrativa verifica lunghezza e riuso della password corrente. Valutare i controlli sui nuovi valori separatamente dalla verifica degli hash storici.

Riferimento [NIST SP 800-63B-4, sezione 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#password).

## Piano test-first

1. Verificare la policy sui valori interi, il conteggio Unicode e la compatibilità Argon2id degli ingressi esistenti.
2. Provare con PostgreSQL la richiesta dal titolare, la deduplica, il retry e i ricontrolli di ruolo, versione, casella e scadenza. Il salvataggio riuscito deve consumare il link, invalidare le credenziali precedenti e aggiornare la password nella stessa transazione.
3. Provare profilo e form in Chromium, in italiano e inglese, con Mailpit locale. Verificare separatamente il fallback offline, la regressione a prova spenta e i gate prima della revisione.

## Attuazione e limiti

La richiesta prende l'account dalla sessione. Due clic concorrenti riusano l'intento valido per lo stesso titolare e conservano gli altri link. La coda registra la versione della credenziale amministrativa e la scadenza assoluta. Il worker verifica destinatario, ruolo e versione prima del passaggio al relay. Un messaggio già accettato può restare nella casella anche dopo una revoca. Il salvataggio ricontrolla i dati sotto lock nel DB, consuma il token, invalida gli altri link e incrementa le versioni delle sessioni. Il calcolo Argon2id del nuovo valore avviene fuori dal lock.

Per le nuove password admin vengono rifiutati interamente CR, LF e CRLF, poiché i campi password del browser scartano i terminatori di riga. La policy considera i punti di codice Unicode, con minimo 15 e il limite storico di 256 unità UTF-16 applicato anche dal login. Un valore eccedente viene rifiutato interamente. Gli spazi e la sequenza originale vengono preservati per Argon2id. Per la scelta del nuovo valore il server confronta localmente la password intera con il [dizionario distribuito da Django 5.2.8](https://github.com/django/django/blob/5.2.8/django/contrib/auth/common-passwords.txt.gz), compilato da Royce Williams, e con varianti prevedibili del servizio e della casella. La lista ha 19.640 voci e copertura finita. La licenza accompagna il file compresso. La nuova policy si applica alle assegnazioni admin tramite profilo, primo invito e reset. Gli hash esistenti conservano formato e semantica di confronto, incluse le differenze fra forme Unicode equivalenti. Il salvataggio non richiede SMTP. L'arrivo del link richiede il worker e il trasporto.

## Verifiche sul candidato

| Verifica | Comando | Exit e riscontro |
| --- | --- | --- |
| Riproduzione sulla base | `/tmp/am-pw28/proof base` | 1 atteso. Chromium ha creato un admin da invito e ha aperto il suo profilo. L'asserzione ha restituito `element(s) not found` per «Cambia password» dopo 6 s. |
| TDD | `vitest run src/server/auth/admin-password-policy.test.ts` e `node --import tsx --test scripts/test-profile-password.ts` | Entrambi 1 prima dell'implementazione, per modulo della policy e del servizio mancanti. Sul candidato entrambi 0, con le prove di policy e 6 prove di integrazione. |
| Gate | `npm run gates` | 0. ESLint, TypeScript, 2.421 test unitari e build Next.js. Le tracce del bundle di conferma e del reset contengono sia il dizionario compresso sia la licenza. |
| PostgreSQL e SMTP isolati | `node --import tsx --test scripts/test-<suite>.ts` per ogni suite | 0 in ciascuna delle sette suite. Profilo 6, invito verificato 33, unicità account 2, protezioni accesso 19, riattivazione 11, cambio indirizzo 10, coda credenziali 27. Tutti i 108 casi passati, zero skip. Compresi retry dopo 451, ruolo o indirizzo cambiato durante l'apertura del trasporto, due salvataggi concorrenti, scadenza e revoca. |
| Migrazione con dati preesistenti | `prisma migrate deploy`, controllo di uguaglianza prima/dopo e secondo `prisma migrate deploy` | 0. Sulla copia locale sono rimasti identici i dati confrontati di cinque account, una verifica, un intento e un token. Il secondo passaggio ha restituito `No pending migrations to apply`. Migrazione e seed sono passati anche su installazioni nuove. |
| Percorso reale offline | `/tmp/am-pw28/proof offline` (Playwright, Chromium mobile emulato) | 0, un caso senza retry. Dal profilo di un titolare creato tramite invito, Mailpit ha catturato un singolo destinatario e lo stesso link in HTML e testo. Il GET e la conferma discordante hanno lasciato hash, token e versioni inalterati. Dopo il salvataggio una vecchia sessione ha ricevuto 401. Spento il Mailpit dedicato e terminato il worker, una nuova sessione ha rifiutato la vecchia password e ha accettato la nuova passphrase lunga con Unicode e spazi. Il titolare ha salvato un pilota, lo ha riletto nella lista ed era presente una sola riga nel DB. Heartbeat e numero di tentativi mail sono rimasti identici durante l'operazione. |

Le prove usano esclusivamente account sintetici, PostgreSQL su loopback e Mailpit senza inoltro. In Chromium i due campi accettano incolla e dichiarano `autocomplete="new-password"`. Le prove non attestano l'integrazione con uno specifico gestore di password, un dispositivo fisico o un provider di posta esterno.

## Rilievi, correzioni e ripetizioni

- La prova Chromium sul tree iniziale `1bea2ebcd3bb469240197ad945daa402af1153b2` ha evidenziato un errore del test. `playwright test e2e/profile-password.spec.ts --grep @email-trial --no-deps --workers=1 --retries=0` sul banco mirato è terminato con exit 1 in entrambi gli idiomi. Il log era `strict mode violation: getByRole('alert') resolved to 2 elements`. Il selettore comprendeva anche l'annunciatore di navigazione di Next. Le due asserzioni ora verificano il testo esatto dell'errore nel solo form di salvataggio.
- Il revisore ha trovato che un valore con ritorno a capo poteva essere assegnato dall'API, ma il campo password di Chromium lo modificava al successivo accesso. Il test di policy iniziale è uscito con 1 (`expected true to be false`), il test PostgreSQL di assegnazione con 1 (`'saved' !== 'policy'`). Per tutte le nuove password admin il server rifiuta l'intero valore contenente CR, LF o CRLF e la UI specifica una sola riga. Le assegnazioni ordinarie e il confronto esatto degli hash storici conservano il comportamento precedente. Sul candidato corretto sono passate tutte le prove mirate, compresi i tre tipi di terminatore. Il revisore ha eseguito anche l'incolla da clipboard in Chromium con una passphrase Unicode di oltre 64 caratteri con spazi a entrambi gli estremi.
- I run integrati sugli alberi intermedi sono stati sospesi intenzionalmente con `scripts/e2e.sh stop` (exit 0) per ricominciare su copie fresche. Non sono inclusi nei totali finali. Durante il riavvio controllato del banco il primo controllo su `/proc/<pid>/cwd` ha restituito `PermissionError: [Errno 13] Permission denied`. Il controllo sostitutivo ha identificato ciascun server locale tramite PID, nome, gruppo e ora di avvio prima di fermarlo, exit 0. Una ricerca esplorativa su `e2e/global*` aveva restituito 2 per percorso inesistente. Il setup effettivo del worker è `e2e/mail-worker-setup.ts`, dichiarato in `playwright.config.ts`.

## Revisione indipendente

Le skill di progetto usate sono `bmad-create-story`, `bmad-dev-story` e `bmad-code-review`. Il revisore in un contesto separato ha approvato il tree `b5ef98f56d5087d60647a28d21503fcf3de60e3a` dopo il riesame dei due rilievi medi. Ha provato dal browser l’incolla e la revoca e, tramite il reset esistente, ha verificato che tre rifiuti HTTP 422 per terminatori di riga lasciassero utilizzabile lo stesso link per una password valida. [Rapporto indipendente](cambio-password-admin-dal-profilo-review-report.md)

## Esito finale

Sul tree di codice e test `b5ef98f56d5087d60647a28d21503fcf3de60e3a`, le due suite Playwright hanno restituito `E2E_EXIT=0`.

| Modalità | Comando del banco | Risultati |
| --- | --- | --- |
| Trial attivo | `scripts/e2e.sh start --config=<config-loopback-trial> --grep @email-trial --no-deps --workers=1` | 17/17 al primo tentativo, zero skip. Inclusi cambio personale mobile in italiano e desktop in inglese, primo invito, reset e fallback. |
| Trial spento | `scripts/e2e.sh start --workers=2` | Su 735 casi, 725 passati al primo tentativo, 1 intermittenti, 9 saltati. |
| Riscontro separato su Scadenze | `playwright test e2e/expiry-types.spec.ts:239 --repeat-each=3 --retries=0 --workers=1 --no-deps` con config di loopback | 3/3 passati senza retry su una copia fresca, exit 0. |

Nel primo tentativo di `expiry-types.spec.ts:239` il titolo «Le mie scadenze» non è comparso entro l'attesa. Il log riportava `expect(locator).toBeVisible() failed: element(s) not found`. Il primo retry della suite è passato in 4,0 s. Il primo avvio del riscontro mirato ha segnalato `ALREADY RUNNING` (exit 0) per il PID trattenuto dal runner precedente, già terminato con un risultato nel suo log. La prova in una directory di esecuzione distinta è quella riportata in tabella. La causa del primo timeout resta indeterminata.

I nove skip ordinari appartengono al trial: due cambi indirizzo, due riattivazioni, due percorsi di primo invito e accesso, due cambi password dal profilo nelle due lingue e il caso di scadenza durante il retry. La suite dedicata li ha eseguiti tutti. Il controllo separato del profilo con trial spento è passato.

Durante la regressione ordinaria il trasporto della shell Cloud ha segnalato `exec-server transport disconnected; failed to resume exec-server session: recovery timed out after 45s` prima di eseguire il controllo di stato (nessun exit code del comando). Alla riconnessione sulla stessa istanza, il tree e il PID del runner coincidevano; il log era passato da 95 a 156 casi registrati senza tentativi falliti. Il runner originale ha continuato la suite.
