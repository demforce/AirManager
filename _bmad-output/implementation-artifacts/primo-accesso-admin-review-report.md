# Revisione indipendente del primo accesso amministratore

**Approvato il candidato applicativo `8a8020b62d3be4074b878d5340d148c4c71e7af1` rispetto alla base `f34bc470d5f854e93eca2affaec6080d9a1d294f`.** Il diff comprende dieci file, 240 righe aggiunte e 37 rimosse. Il parere copre l'implementazione e i casi indicati nella story. Il coordinatore verifica separatamente gli esiti finali delle suite browser e la pubblicazione.

## Metodo

Revisione svolta nel contesto separato del revisore. Per questo caso la scelta di Astra xhigh è stata motivata dall'interazione tra invito, verifica della casella, ruolo concorrente, sessione e password di fallback. Skill effettivamente caricate dalla directory di progetto in `.claude/skills`: `bmad-code-review` con resolver e passi in sequenza, e `karpathy-guidelines`. Ho applicato le istruzioni di `CLAUDE.md` e `.claude/agents/adversarial-reviewer.md` con un solo revisore e con l'ambito funzionale difensivo autorizzato. Le osservazioni derivano dalla lettura del diff, dei chiamanti e dei contratti precedenti, dai log contrassegnati di seguito e da una prova Chromium separata su PostgreSQL dedicato.

## Risultati

- Entrambi gli ingressi amministrativi delegano a `createUserCore`, che salva account senza password, iscrizione e intento di verifica nella stessa transazione. La coda e l'unicità canonica rimangono quelle della base. Il collaudo composito effettuato dallo sviluppatore conferma password e verifica impostate, un unico indirizzo e zero reset richiesti.
- La pagina serve un GET inerte. La prima conferma amministrativa esplicita restituisce soltanto la richiesta di password. Nel mio browser la sessione era ancora assente e il database conteneva un invito inutilizzato, senza password né data di verifica. L'azione conferma la provenienza della richiesta e il trial prima di raggiungere il servizio.
- `src/server/services/email-trial.service.ts`, righe 109–145. Il lavoro Argon2id avviene fuori transazione dopo il controllo dell'invito. Il commit rilegge l'account sotto lock, controlla ruolo, idoneità e proprietà della casella, verifica uso e scadenza nel claim condizionale e salva hash e verifica insieme. Il conteggio corretto dei punti di codice si applica al minimo di 15, mentre il limite superiore resta compatibile con l'ingresso password. Il front-end segnala i valori troppo lunghi. I regressivi PostgreSQL verificano precisamente che tra due conferme concorrenti sia memorizzata la sola password vincente, oltre a scadenza, sostituzione e diniego prima del completamento. L'invito iniziale ha durata misurata di sette giorni.
- Ho creato due utenti sintetici con l'ingresso amministrativo. Il primo ha ricevuto una promozione mentre l'invito era pendente. La pagina ha chiesto la password, l'ha registrata insieme alla verifica e ha consumato l'unico invito. In una sessione nuova il titolare ha usato il fallback e salvato e riletto una persona. Il secondo ha perso il ruolo dopo aver aperto il form password. PostgreSQL ha confermato che la richiesta ormai superata lasciava intatti l'invito e l'account. Riaprendo la stessa email, il titolare ha completato il normale percorso del pilota senza impostare la password.
- Il mio worker su 56215 ha eseguito un solo ciclo per ciascun invito ed era già terminato al login. Mailpit aveva relay disabilitato. Ho verificato per ciascun messaggio destinatario unico e stessa azione HTML/testo. Il collaudo offline distinto dello sviluppatore ha spento anche il relay dedicato e confermato salvataggio da UI, rilettura e heartbeat e tentativi invariati. La nuova schermata ha messaggi IT ed EN. La prova del reset pubblico presentata dai regressivi riguarda il comportamento già esistente dopo il completamento dell'invito.
- Ho esaminato l'assenza di modifiche a schema, flag di abilitazione, bootstrap, coda, avvisi, riattivazione, cambio indirizzo e PDF. Promozioni già attivate e bootstrap mantengono i percorsi precedenti. Il cambio password da profilo è un incarico separato.

## Comandi ed evidenze

| Prova | Esito verificato |
| --- | --- |
| `git diff --check f34bc470 8a8020b6` | Exit 0 |
| `node /tmp/am-admin28/review-ui.cjs` con DB dedicato `56215/airmanager_e2e`, server 3060, Mailpit 8025 e SMTP 1025 | Exit 0, quattro gruppi di asserzioni riusciti, zero retry e zero skip. Log sanitizzato in `/tmp/am-admin28/review-ui.log` |
| `npm run gates` sul tree congelato, evidenza letta in `gates.log` | Lint, TypeScript, 2.415 test e build riusciti |
| Test di integrazione inviti, evidenza letta in `dev-verification.log` | 33 passati, 0 falliti, 0 saltati; compresi consumo concorrente, ruolo pendente, scadenza e sostituzione |
| Prova offline UI, evidenza letta in `offline-proof.log` | 1 passato, nessun retry, relay fermo e worker terminato |
| Prova rossa sulla base, evidenze lette in `red-first-admin.log` e `base-proof.log` | Il vecchio invito verificava la casella senza impostare la password; il confronto mirato falliva come previsto |

## Rilievi e limiti

Nessun rilievo di gravità alta o media o correzione bloccante. Un limite minore del caso di declassamento concorrente è stato osservato in Chromium. Se l'operatore declassa l'invitato mentre questi ha aperto il form della password, il salvataggio produce l'errore generico; il titolare può riaprire la stessa email e completare la verifica con il ruolo corrente. Il percorso tutela i dati e non richiede un nuovo invito. Riferimenti `src/app/[locale]/(auth)/email-access/form.tsx`, righe 54–63, e `src/server/services/email-trial.service.ts`, righe 113–135.

La verifica di questo revisore riguarda Chromium, credenziali sintetiche e servizi locali. Gli altri browser e i servizi reali sono fuori da questa prova. Alla stesura del rapporto i risultati finali delle due suite Chromium gestite dal coordinatore non erano ancora disponibili.

## Riesame sul tree definitivo

**Approvato `c50064e35e1219943a7fcd9996adc974e5511cb9`**. Ho verificato il delta Git dal tree già revisionato `8a8020b62d3be4074b878d5340d148c4c71e7af1`. L'unico file cambiato è `e2e/email-access.spec.ts` (tre righe aggiunte, due rimosse). L'asserzione individua ora l'alert del form che contiene il bottone di completamento. Conserva il ruolo accessibile e i due testi esatti per password troppo lunga e conferma diversa. L'annuncio di navigazione di Next è esterno al form. Nessun caso escluso o cambio ai retry.

`git diff --exit-code 8a8020b6 c50064e3 -- src messages prisma package.json package-lock.json scripts` e `git diff --check f34bc470 c50064e3` hanno restituito 0. Il comportamento del prodotto coincide con quello esaminato direttamente in Chromium e PostgreSQL. Il log del nuovo test mirato su DB 56218 conferma entrambi i casi di creazione, diretta e composita, al primo tentativo, 2 passati in 37 secondi, `E2E_EXIT=0` (`/tmp/am-admin28/targeted/airmanager-e2e/last-run.log`). Nessun nuovo rilievo. Rimangono il limite minore sul declassamento a form aperto e l'ambito sintetico già documentati. Il coordinatore registra separatamente le suite complete e le condizioni di pubblicazione.
