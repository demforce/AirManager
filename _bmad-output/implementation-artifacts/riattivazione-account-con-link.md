# Riattivazione di un account già disattivato tramite link

Stato BMAD **done**. Enrico ha confermato dieci minuti dall'emissione per la riattivazione. Il primo invito resta valido sette giorni.

## Criteri e piano test-first

1. Verificare separatamente lo scopo della credenziale per un account sospeso con casella registrata e già verificata. Provare il rifiuto per account attivi, mai verificati, con casella in conflitto o con ruolo chiamante privo di gestione utenti.
2. In Piloti, provare da desktop e telefono la richiesta amministrativa, la permanenza della sospensione, l'anteprima GET e la conferma esplicita senza sessione. La coda deve renderizzare HTML e testo per un solo destinatario in italiano e inglese. Verificare scadenza iniziale, retry, concorrenza e secondo uso.
3. Controllare nel servizio il PATCH, anche combinato con ruoli e associazione, la disattivazione, il blocco dell'ultimo admin e la separazione dal reinvio invito. Controllare token, intenzioni in corso e versioni delle sessioni prima e dopo la conferma. Il titolare può poi autenticarsi nuovamente. Preservare il confine temporale degli avvisi e il funzionamento fuori trial.
4. Applicare la migrazione su PostgreSQL locale sintetico, eseguire regressioni, gate integrato e suite browser. Consegnare il candidato al revisore indipendente prima della chiusura.

## Comportamento del candidato

La richiesta da Piloti richiede il permesso di gestione utenti. Nel trial il PATCH che porterebbe un utente da sospeso ad attivo restituisce 409 anche con altri campi. I cambi di stato e di associazione acquisiscono i lock nello stesso ordine. Una modifica delle autorizzazioni o della persona di un account sospeso annulla la credenziale pendente. Il conteggio degli altri amministratori utilizzabili esclude i sospesi e gli inviti ancora da verificare. Una password presente nel database non prova che il suo titolare la ricordi; la verifica individuale prima del cutover resta necessaria.

La coda usa lo scopo REACTIVATE_ACCOUNT, il budget amministrativo e la configurazione di trasporto locale del trial esistente. La data di scadenza è fissata dal database all'emissione. Il worker controlla idoneità e titolarità prima del passaggio al trasporto. Il trigger PostgreSQL già presente invalida una credenziale se cambia la casella registrata. Il frammento nell'URL si cancella dopo il caricamento; il POST di conferma marca usato il token, chiude le intenzioni precedenti, avanza le versioni di sessione e riattiva l'account nello stesso commit. La pagina invita poi il titolare ad accedere nuovamente.

La prima verifica conserva la sua data. La conferma di riattivazione registra una nuova data e una posizione nella sequenza dei cicli delle scadenze. Il calcolo delle soglie applica le regole pubblicate a quel confine. I messaggi preparati per il titolare e il digest controllano la generazione anche immediatamente prima dell'invio. Un messaggio già affidato al relay può arrivare più tardi; l'eventuale credenziale revocata nel frattempo resta inutilizzabile. Un account storico senza prova della casella o con prova obsoleta rimane escluso dal percorso.

## Prove di sviluppo su fixture locali

- Prima del codice, `node_modules/.bin/vitest run src/server/auth/email-trial-policy.test.ts` ha restituito exit 1, due test passati e la nuova attesa di eleggibilità rossa con `expected false to be true`. Dopo l'implementazione, i tre file mirati su policy, utenti e registro OpenAPI hanno superato 78 test. Il test aggiunto successivamente per l'ultimo admin è passato nel run mirato a due file (22 test, exit 0).
- `prisma migrate deploy` e `prisma generate` hanno restituito exit 0. La migrazione aggiunge il solo scopo e una data opzionale alle prove di casella. Il PostgreSQL locale di sviluppo è usa-e-getta.
- `tsx --test scripts/test-account-reactivation.ts` ha superato 11 casi senza retry o skip. I casi comprendono i due MIME catturati da Mailpit dopo un rifiuto temporaneo certo, le conferme concorrenti, le sessioni dei tre ingressi, lo stato sospeso preesistente, la soglia storica e il nuovo ciclo, i controlli di invio su titolare e digest e il trial spento. In un tentativo intermedio il test si aspettava di prenotare un intento già soppresso dal trigger: exit 1, `assert.ok(attempt)`. L'asserzione corretta distingue cambio della casella prima della prenotazione, dopo la prenotazione e dopo la generazione del token. La prova ha consentito di riusare il trigger senza persistere un'altra copia o impronta della casella.
- Durante la preparazione un comando Python di editing locale ha restituito exit 1 con `SyntaxError: unterminated string literal`. Lo script corretto ha completato l'editing. Il prototipo di colonna ridondante era limitato a una copia sintetica di sviluppo. Il gate finale utilizza la sola migrazione inclusa nel candidato su una copia distinta.

## Chiusura e revisione indipendente

La revisione indipendente del tree applicativo `9face77e4b1db2e0bfb2c12f96e5bd4a8c1fc818` ha approvato il candidato senza rilievi bloccanti. Il revisore ha verificato il blocco dell'ultimo amministratore utilizzabile anche con un altro invito pendente e il controllo della generazione per i messaggi al titolare e per il digest. La chiusura aggiorna il commento Prisma di `expiryStartCycle` per indicare anche la riattivazione. Dopo la conferma valgono ancora i limiti del login ordinario: una richiesta molto ravvicinata alla precedente può dover attendere la normale finestra di dieci minuti.

| Verifica sul candidato | Esito |
| --- | --- |
| `npm run gates` | Exit 0. Lint, typecheck, 2.406/2.406 unitari e build. |
| `node --import tsx --test scripts/test-<nome>.ts` su PostgreSQL e trasporti locali | Sette suite, tutte exit 0. Credential-mail 27, expiry-renewals 16, account-email-uniqueness 2, single-account-address 13, verification-invite 31, account-reactivation 11, access-security 18. Totale 118/118, zero skip. |
| Browser completo, `scripts/e2e.sh start --workers=2`, trial spento | `E2E_EXIT=0`, 725 passati, quattro saltati, zero retry. I quattro richiedono il trial acceso: riattivazione desktop IT, riattivazione mobile EN, invito verificato con accesso e retry con scadenza originale. |
| Browser con trial acceso, `scripts/e2e.sh start --config=…/focused.cjs` | `E2E_EXIT=0`, 7/7, inclusi i quattro casi saltati a trial spento. Zero retry o skip. Dopo il POST il browser di conferma resta disconnesso; la sessione amministrativa aperta prima della sospensione riceve 401 alla prima richiesta protetta dopo la riattivazione. |
| Browser con SMTP e worker spenti, `scripts/e2e.sh start --config=…/offline.cjs` | `E2E_EXIT=0`, 5/5, zero retry o skip. Fallback da browser disconnesso, modifica in Piloti, lingua e ritorno alla pagina richiesta, revoca su declassamento, disattivazione e reset. |
| Aggiornamento della copia sintetica della base `4203a74` | Exit 0. Fixture già sospese, con e senza prova di casella. Prima data di verifica preservata, una sola email accettata nel sink locale e tre credenziali pregresse invalidate nella prova sul titolare idoneo. Nel primo avvio della copia QA, `prisma db seed` ha restituito exit 1, `MODULE_NOT_FOUND`, per il client Prisma non ancora generato. `prisma generate` e la ripetizione del seed hanno restituito exit 0. |

La prova mobile usa Chromium a 375 px. Non sono stati collaudati altri browser, dispositivi fisici o servizi esterni. La conferma dal browser e l'accettazione nel sink locale sono due osservazioni distinte.
