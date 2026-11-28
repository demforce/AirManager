# Cambiare la propria password amministrativa dal profilo

Stato BMAD **backlog**. Da avviare su incarico separato. La story del primo invito admin è chiusa. Il titolare con ruolo admin attivo e casella verificata può chiedere «Cambia password» dal proprio profilo.

## Criteri di accettazione proposti per la story

- Il server ricava l’unico destinatario dalla casella verificata dell’account in sessione. La richiesta riguarda esclusivamente il titolare. La creazione, il primo invito, il reset pubblico e la gestione di altri utenti conservano i rispettivi contratti.
- La coda protetta invia un link monouso per questo scopo, con scadenza a dieci minuti dall’emissione anche dopo un retry. Si riusano i controlli applicabili per origine fidata, limiti, deduplica, messaggi multipart IT/EN e diagnostica priva di segreti.
- Un GET apre il form «Nuova password» e «Conferma password». Solo un salvataggio esplicito, valido e riuscito cambia la password. Verificare scadenza, consumo singolo anche in concorrenza, declassamento o disattivazione sopravvenuti e comportamento delle sessioni secondo la politica già pubblicata.
- Per l’admin che usa la password come fattore singolo verificare lunghezza minima di 15 caratteri, supporto di almeno 64 caratteri, incolla e autofill, assenza di regole obbligatorie di composizione e rifiuto locale di password comuni, prevedibili o compromesse. Accettare o rifiutare esplicitamente l’intero valore. Non trasmettere password a servizi esterni. Conservare la lettura degli hash esistenti e l’operatività offline del fallback.
- Verifiche su PostgreSQL sintetico, Chromium e Mailpit isolato. Compresi link ricevuto, GET, conferma, errore di validazione, retry senza proroga e uso del fallback con la nuova credenziale. Trial spento per default.

## Compatibilità da verificare

La base usa Argon2id tramite `@node-rs/argon2`, controlla il minimo admin in punti di assegnazione e applica a più form un limite di 256 unità UTF-16. Verificare l’allineamento del conteggio Unicode, degli spazi e delle lunghezze fra impostazione e login, e predisporre un controllo locale efficace delle password prevedibili. La policy attuale di impostazione amministrativa verifica lunghezza e riuso della password corrente. Valutare i controlli sui nuovi valori separatamente dalla verifica degli hash storici.

Riferimento [NIST SP 800-63B-4, sezione 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#password).
