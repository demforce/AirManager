---
baseline_commit: f34bc470d5f854e93eca2affaec6080d9a1d294f
---

# Primo accesso di un amministratore invitato

Stato BMAD **done**.

Un amministratore autorizzato crea un altro amministratore indicando la sua unica email. Il titolare riceve un invito di sette giorni e prepara la propria password personale mentre conferma la casella. Può così usare il fallback anche a posta ferma.

## Criteri di accettazione

1. Nel trial esistente la creazione diretta e quella composita emettono un solo invito alla casella registrata. L'operatore che crea l'account non imposta la password del titolare.
2. GET e anteprime sono inerti. Un invito valido apre il completamento esplicito. Una password personale conforme alla policy amministrativa e la conferma della casella sono registrate in una transazione con il consumo del link. Fino al commit sono preclusi accesso con link, password e operazioni protette.
3. Il reinvio resta disponibile per i soli inviti pendenti, con invalidazione della generazione precedente. Un link scaduto, già consumato o sostituito lascia intatto l'account. Due conferme concorrenti possono produrre un solo completamento.
4. Dopo il primo accesso funzionano sia il login ordinario via link sia quello amministrativo a posta e worker fermi, incluso un salvataggio autorizzato. La UI guida il titolare in italiano e inglese.
5. Gli inviti non amministrativi mantengono la verifica senza password. Il trial rimane disattivato per default e la modalità ordinaria conserva i suoi contratti. Nessuna migrazione. Il bootstrap del primo amministratore resta nel seed/provisioning esistente. Chi possiede già un account attivato e riceve una promozione segue le regole esistenti. La configurazione di account preesistenti non viene riscritta.

## Inventario e piano test-first

La scheda Accesso di Piloti invoca POST /api/v1/users. Il form di creazione con accesso usa POST /api/v1/people. Entrambi passano da createUserCore, che crea account, iscrizione e intento VERIFY_EMAIL sotto la stessa transazione. La coda già applica unicità, idoneità, reinvio, sostituzione e termine di sette giorni. Sulla base il clic «Conferma indirizzo» verifica l'admin con passwordHash nullo e il test browser usa un reset separato.

- [x] Scrivere la regressione PostgreSQL sul consumatore e confermare il rosso sulla base. Includere concorrenza, invito scaduto o sostituito, criteri password e assenza di accesso prima e dopo la sola anteprima.
- [x] Completare la conferma dal form esistente, rileggendo ruolo, idoneità e stato correnti sotto lo stesso lock dell'account usato dalle scritture; mantenere l'anteprima priva di effetti e l'hash Argon2id fuori dal lock globale.
- [x] Aggiornare i percorsi Chromium e le fixture interessate; provare dal browser entrambe le creazioni, fallback con salvataggio a posta/worker spenti e login via link. Eseguire le regressioni su PostgreSQL, Mailpit e Chromium sintetici.
- [x] Registrare gates, revisione indipendente ed esito. Le istruzioni di Enrico escludono procedure aggiuntive per admin legacy, promozioni e bootstrap.

## Dev Agent Record

Skill del progetto caricate: bmad-create-story, bmad-dev-story e karpathy-guidelines. I resolver delle prime due non aggiungono personalizzazioni di attivazione. Il vincolo rimane server-side e si applica al ruolo corrente dell'invitato alla conferma. Un admin promosso o declassato mentre è ancora pendente non può riutilizzare una scelta di ruolo letta dal client.

La richiesta di conferma riserva il tentativo e verifica scopo, scadenza e uso del token. Per un admin pendente il primo POST mostra il form: la casella resta da verificare. Il secondo POST accetta da 15 punti di codice Unicode fino al limite del login di 256 unità UTF-16. Un valore troppo lungo è rifiutato, anche se incollato. Argon2id viene calcolato solo per un invito amministrativo valido dopo la prenotazione del tentativo e fuori dalla transazione. Sotto il lock dell’account il server ricontrolla ruoli, stato, proprietà della casella e scadenza, reclama il token e memorizza hash e verifica in un unico commit. Gli inviti già emessi usano lo stesso URL. Il primo POST dei non amministratori mantiene la conferma senza password.

## Prove dello sviluppo

Su PostgreSQL sintetico e Mailpit locale, con il trial esplicitamente abilitato:

| Comando | Exit | Riscontro |
| --- | ---: | --- |
| `node --import tsx --test --test-name-pattern="first admin invitation" scripts/test-verification-invite.ts` sulla base | 1 | Prima della correzione, al click senza password il servizio restituiva l’identità già verificata. Il test attendeva `passwordRequired`. |
| `node --import tsx --test scripts/test-verification-invite.ts` sul candidato | 0 | 33 passati, zero skip. Due POST con password diverse hanno un solo vincitore e l’hash salvato verifica solo la sua password. I casi coprono anche ruolo mutato, scadenza, sostituzione e login negato a verifica incompleta. |
| `node --import tsx --test scripts/test-access-security.ts` | 0 | 19 passati, zero skip. L’avviso in attesa di destinatario viene sbloccato dalla conferma reale di un nuovo admin dopo la scelta della password. |
| `npm run typecheck`, ESLint sui file TypeScript cambiati, `git diff --check` | 0 | Tipi, lint e formato verificati. |

## File della story

- [_bmad-output/implementation-artifacts/primo-accesso-admin-review-report.md](primo-accesso-admin-review-report.md).

- `src/server/services/email-trial.service.ts`, `src/server/services/auth-tokens.service.ts`, `src/lib/schemas/auth-tokens.ts`.
- `src/app/[locale]/(auth)/email-access/actions.ts`, `src/app/[locale]/(auth)/email-access/form.tsx`, `messages/it.json`, `messages/en.json`.
- `scripts/test-verification-invite.ts`, `scripts/test-access-security.ts`, `e2e/email-access.spec.ts`.
- `docs/operations/credential-mail.md`, `docs/handoffs/HANDOFF.md`, `_bmad-output/implementation-artifacts/primo-accesso-admin.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`.


## Collaudo dall’interfaccia

Sul commit di base un admin ha creato un secondo admin dal form composito Piloti. Chromium ha aperto l’invito da una cattura Mailpit sintetica, ha seguito la normale conferma e ha letto lo stato risultante su PostgreSQL. Il comando di banco `/tmp/am-admin28/proof base` è uscito con codice 1 sull’asserzione attesa. Il riscontro sanitizzato era `verified=true, password=false`.

Sul tree applicativo `8a8020b62d3be4074b878d5340d148c4c71e7af1`, lo stesso collaudo ha ricevuto un solo messaggio per il titolare, ha aperto la pagina e ha verificato che la sola apertura lasciasse entrambi i valori falsi. Il titolare ha completato la scelta della password dall’invito. Entrambi i valori sono diventati veri, con zero intenti di reset. Il banco ha arrestato il proprio Mailpit e osservato il rifiuto della connessione sulla porta SMTP configurata. L’unico worker per quel DB aveva già terminato la sua esecuzione `--once`. Da una nuova sessione Chromium il titolare è entrato con la password, ha creato un pilota e lo ha riletto dalla lista. Nel DB risultava una sola riga corrispondente. Heartbeat e numero di tentativi SMTP sono rimasti identici durante l’accesso e la scrittura. `/tmp/am-admin28/proof offline` è uscito con codice 0, un caso in 20,7 s, senza retry.

Sul medesimo tree `npm run gates` ha superato lint, TypeScript, 2.415 test unitari e build con codice 0. Un precedente gate su uno snapshot intermedio è stato fermato intenzionalmente (143) al congelamento del candidato definitivo. Il gate completo sul candidato è ripartito dal lint. Le prove PostgreSQL di unicità account (2), recapito unico (13), code credenziali (27), riattivazione (11) e cambio indirizzo (10) sono terminate con codice 0. I rispettivi comandi sono `node --import tsx --test scripts/test-<suite>.ts`, sulle copie sintetiche del banco. Gli identificativi delle cinque suite sono `account-email-uniqueness`, `single-account-address`, `credential-mail`, `account-reactivation` e `account-email-change`.

## Revisione indipendente

Il revisore ha usato la skill di progetto `bmad-code-review` sul tree applicativo congelato. La scelta di Astra xhigh deriva dall’interazione tra conferma, transazioni, modifiche di ruolo e sessioni. Sul suo banco separato ha provato in Chromium sia la promozione sia il declassamento di un invitato ancora pendente. Il rapporto ha approvato il candidato senza rilievi bloccanti. Se il titolare viene declassato mentre sta compilando la password, riceve un errore generico e può riaprire lo stesso invito per terminare con il ruolo corrente.


## Correzione della prova Chromium

Nel primo run con trial attivo il caso composito ha trovato due elementi con ruolo `alert`, l’errore testuale del campo e l’annuncio di navigazione del framework. L’asserzione `getByRole('alert').toHaveText(...)` è fallita su tre tentativi. Sulla stessa copia il caso diretto è poi scaduto in attesa del messaggio (55 s). Gli intenti di invito erano stati accettati e l’account confermato. I conteggi sulla copia avevano raggiunto i tetti di 20 richieste e 30 conferme per origine nella finestra di dieci minuti. Le due suite intermedie sono state fermate intenzionalmente con `scripts/e2e.sh stop` (comando exit 0) per ripartire su database nuovi. Il primo run ordinario aveva completato 45 casi prima dello stop. Questi due run non attestano il superamento delle suite.

Il selettore corretto richiede entrambi i testi esatti all’interno del form di completamento. È l’unica differenza tra il tree precedente e il tree di codice e prove definitivo `c50064e35e1219943a7fcd9996adc974e5511cb9`. Sul banco mirato `scripts/e2e.sh start --config=/tmp/am-admin28/targeted.ts e2e/email-access.spec.ts --no-deps --workers=1 --retries=0` ha superato 2/2 casi, exit 0. Il revisore indipendente ha approvato nuovamente il delta. Le prove del fallback offline e della concorrenza si applicano allo stesso codice applicativo.


## Chiusura sul candidato finale

Sul tree `c50064e35e1219943a7fcd9996adc974e5511cb9`, `npm run gates` ha concluso lint, controllo tipi, 2.415 unitari e build con exit 0. `scripts/e2e.sh start --grep @email-trial --no-deps --workers=1` con il config di loopback del banco ha completato 15/15 casi da browser, zero retry e zero skip. Comprende i due percorsi di creazione, l’invito sostituito, il tentativo di fallback prima del completamento, il primo ingresso con password e il login via link dopo l’attivazione.

Su un altro database fresco, `scripts/e2e.sh start --workers=2` con trial spento ha registrato 724 casi passati al primo tentativo, 1 passato al primo retry e 7 riservati al trial. Entrambe le suite hanno restituito `E2E_EXIT=0`. I sette skip corrispondono a due cambi indirizzo, due riattivazioni, due inviti con login e alla scadenza del link durante i retry. Tutti e sette sono stati eseguiti dalla suite dedicata.

Nel caso ordinario `e2e/history-layers.spec.ts:281` il primo tentativo ha raggiunto il limite complessivo di 30 s in attesa di `billing-new-transaction-button`. Il primo retry è passato in 6,9 s. Su una copia isolata, `scripts/e2e.sh start --config=/tmp/am-admin28/final/history.config.ts e2e/history-layers.spec.ts:281 --repeat-each=3 --retries=0 --workers=1 --no-deps` ha poi superato 3/3 casi in 33,4 s, exit 0. La causa del primo timeout rimane indeterminata.
