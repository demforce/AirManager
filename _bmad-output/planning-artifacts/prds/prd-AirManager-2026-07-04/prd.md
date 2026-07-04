---
title: AirManager
status: final
created: 2026-07-04
updated: 2026-07-04
---

# PRD: AirManager
*Gestionale per aviosuperficie — titolo di lavoro confermato dall'utente.*

## 0. Scopo del documento

Questo PRD è destinato al team di sviluppo AI del progetto (sessione di planning, agent di sviluppo e di review) e al proprietario dell'aviosuperficie. Definisce **cosa** AirManager deve fare; il **come** (stack, schema dati, API) vive nel documento di architettura. Il vocabolario è ancorato al Glossario (§3), le funzionalità sono raggruppate per feature con requisiti funzionali (FR) numerati globalmente, le assunzioni non confermate sono taggate inline `[ASSUMPTION]` e indicizzate in §9. Le decisioni già prese con l'utente sono registrate nel memlog del workspace.

## 1. Visione

AirManager è il gestionale unico di un'aviosuperficie italiana: sostituisce fogli di calcolo, registri cartacei e passaparola con un'unica applicazione web che tiene insieme le persone (piloti, allievi, istruttori, staff), i velivoli, i voli, i soldi e le scadenze.

Per lo staff significa sapere in ogni momento chi vola, con che velivolo, a che tariffa, con quale saldo; approvare le richieste PPR dei piloti esterni con un click invece che via telefono; vedere in anticipo le visite mediche e i rating in scadenza. Per i piloti e gli allievi significa prenotare un velivolo dal proprio telefono, vedere il proprio estratto conto e le proprie scadenze senza dover chiedere in segreteria.

Il sistema nasce API-first: le stesse API REST che servono la web app alimenteranno una futura app mobile Flutter, senza rifare il backend.

## 2. Utenti target

### 2.1 Jobs To Be Done

- **Staff/segreteria**: "Devo registrare voli, ricariche e spese senza errori di trascrizione, e chiudere i conti senza rincorrere i piloti."
- **Gestore/admin**: "Devo sapere se l'aviosuperficie sta in piedi economicamente e che nessuno voli con documenti scaduti."
- **Pilota socio**: "Voglio prenotare un aereo, volare e sapere quanto ho speso, senza telefonate."
- **Allievo**: "Voglio vedere i miei progressi, le mie ore e quanto credito mi resta."
- **Istruttore**: "Voglio vedere i miei allievi, le ore fatte e i voli scuola da registrare."
- **Pilota esterno**: "Devo chiedere il permesso di atterrare (PPR) in modo semplice e ricevere una conferma scritta."

### 2.2 Non-utenti (v1)

- Enti/autorità aeronautiche (nessuna trasmissione dati automatica a ENAC o simili).
- Passeggeri (nessun portale passeggeri).
- Officine di manutenzione (la manutenzione tecnica non è gestita in v1, solo annotazioni).

### 2.3 User Journeys chiave

- **UJ-1. Marco prenota e vola.**
  Marco, pilota socio con licenza PPL, apre AirManager sul telefono la sera prima. Autenticato, vede il calendario prenotazioni del velivolo I-ABCD, sceglie sabato 9:00–11:00 e conferma: il sistema verifica che non ci siano sovrapposizioni e che Marco non abbia scadenze bloccanti. Sabato Marco vola; al rientro lo staff registra il volo: 1h20 di contaore. Il sistema calcola il costo con la tariffa in vigore, lo addebita sul conto prepagato di Marco e Marco vede subito il nuovo saldo. **Edge case:** se il saldo va sotto zero, il volo viene registrato comunque e il conto va in negativo con evidenza per staff e pilota.

- **UJ-2. Silvia (staff) registra una ricarica.**
  Silvia riceve un bonifico di 500 € da Marco. Nel pannello finanze cerca il conto di Marco, registra una ricarica da 500 € con metodo "bonifico" e data valuta. Il saldo si aggiorna, il movimento compare nell'estratto conto di Marco, e Marco riceve conferma a video al prossimo accesso `[ASSUMPTION: nessuna email per le ricariche in v1]`.

- **UJ-3. Un pilota esterno chiede il PPR.**
  Jean, pilota francese in viaggio, trova il sito dell'aviosuperficie e apre il form PPR pubblico (in inglese): nome, contatti, marche e tipo aeromobile, provenienza/destinazione, data e ora stimata di arrivo, note. Invia. Lo staff riceve la richiesta nella coda PPR, la approva; Jean riceve una email di conferma con il numero PPR da citare in radio. **Edge case:** se lo staff rifiuta (es. pista chiusa), Jean riceve una email di rifiuto con il motivo.

- **UJ-4. Luca (allievo) vola con l'istruttore.**
  Luca ha un pacchetto ore da 10 ore acquistato con sconto. Vola 50 minuti di doppio comando con l'istruttrice Anna sul velivolo scuola. Lo staff registra il volo come volo scuola: il sistema scala il tempo dal pacchetto di Luca e addebita la tariffa istruttore `[ASSUMPTION: il pacchetto ore copre solo il costo velivolo; la tariffa istruttore è addebitata a parte sul conto]`, registra le ore di Anna, e Anna aggiunge un'annotazione di avanzamento sull'esercizio svolto.

- **UJ-5. Il gestore controlla le scadenze.**
  Paolo, admin, apre la dashboard il lunedì mattina. Vede il pannello scadenze: la visita medica di un pilota scade tra 25 giorni (giallo), il SEP di un altro è scaduto (rosso). Il sistema aveva già inviato gli alert a 60/30/7 giorni via email agli interessati. Paolo filtra, esporta la lista in Excel e la gira al consiglio.

- **UJ-6. Chiusura mese.**
  A fine mese Silvia apre il pannello finanze aviosuperficie: entrate (ricariche, PPR `[ASSUMPTION: il PPR può avere una tariffa di atterraggio incassata come entrata]`, vendite pacchetti) e uscite (carburante, assicurazione, manutenzione) categorizzate. Esporta il report mensile in PDF per il commercialista e in Excel per l'archivio.

## 3. Glossario

- **Persona** — Anagrafica di un essere umano nel sistema. Una Persona può avere uno o più profili: Pilota, Allievo, Istruttore. Ha zero o un Utente collegato.
- **Utente** — Credenziali di accesso (email + password) collegate a una Persona, con uno o più Ruoli.
- **Ruolo** — Insieme di permessi: `admin`, `staff`, `istruttore`, `pilota`, `allievo`. Un Utente può avere più Ruoli; i permessi si sommano.
- **Pilota** — Profilo di una Persona titolare di licenza, abilitata a prenotare Velivoli e volare da solista. Ha un Conto.
- **Allievo** — Profilo di una Persona iscritta alla Scuola volo. Vola solo in Voli scuola (o solista autorizzato dall'Istruttore). Ha un Conto.
- **Istruttore** — Profilo di una Persona che eroga istruzione nei Voli scuola. Ha una Tariffa istruttore.
- **Velivolo** — Aeromobile della flotta, identificato dalle marche (es. I-ABCD). Ha una Tariffa velivolo e un contaore progressivo.
- **Tariffa velivolo** — Prezzo orario (€/h) di un Velivolo, con validità temporale (storicizzata: ogni Volo usa la tariffa in vigore alla sua data).
- **Tariffa istruttore** — Prezzo orario (€/h) di un Istruttore, storicizzata come la Tariffa velivolo.
- **Volo** — Registrazione di un volo effettuato: Velivolo, Pilota (o Allievo), eventuale Istruttore, data, tempo di volo in minuti (da contaore), tipo (privato, scuola, altro). Genera Movimenti di addebito.
- **Volo scuola** — Volo con Allievo (o Pilota in addestramento) e Istruttore. Scala il Pacchetto ore se presente; genera addebito per la Tariffa istruttore.
- **Prenotazione** — Blocco di un Velivolo per un intervallo data/ora da parte di un Pilota (o Istruttore per la scuola). Senza sovrapposizioni sullo stesso Velivolo.
- **PPR** — *Prior Permission Required*: richiesta di atterraggio di un pilota esterno, con stati `in attesa` → `approvato`/`rifiutato` → `completato`/`annullato`. Ha un numero PPR univoco.
- **Conto** — Conto prepagato in euro di un Pilota o Allievo. Saldo = somma dei Movimenti. Può andare in negativo (con evidenza).
- **Movimento** — Voce del Conto: **Ricarica** (accredito registrato dallo staff, con metodo di pagamento), **Addebito volo** (generato da un Volo), **Acquisto pacchetto**, **Rettifica** (manuale, motivata, solo staff/admin).
- **Pacchetto ore** — Blocco di ore di volo prepagate a prezzo scontato, associato a un Conto e (opzionalmente) a un Velivolo o gruppo di Velivoli `[ASSUMPTION: il pacchetto vale per un insieme definito di velivoli, non per l'istruttore]`. I Voli idonei scalano minuti dal residuo.
- **Scadenza** — Documento/abilitazione con data di scadenza associata a una Persona: visita medica (classe 1/2/LAPL), licenza, rating (es. SEP), inglese ICAO, o Tipo scadenza personalizzato definito dall'admin.
- **Movimento di cassa** — Entrata o uscita della cassa dell'aviosuperficie, con categoria (carburante, assicurazione, PPR, ricariche, pacchetti, altro).
- **Export** — Estrazione di una tabella o report in formato Excel (`.xlsx`) o PDF.

## 4. Funzionalità

### 4.1 Autenticazione, ruoli e permessi

**Descrizione:** Accesso con email e password. Ogni Utente ha uno o più Ruoli che determinano cosa vede e cosa può fare. Lo staff/admin crea gli Utenti e li collega alle Persone; il primo accesso avviene con invito via email `[ASSUMPTION: flusso a invito, nessuna self-registration]`. Realizza tutte le UJ autenticate.

**Requisiti funzionali:**

#### FR-1: Login e sessione
Un Utente può autenticarsi con email e password e mantenere la sessione. Logout esplicito.
**Conseguenze (testabili):**
- Credenziali errate → errore generico senza rivelare se l'email esiste.
- Le route protette senza sessione reindirizzano al login (web) o rispondono 401 (API).

#### FR-2: Ruoli e permessi (RBAC)
Il sistema applica i permessi in base ai Ruoli: `admin` (tutto), `staff` (gestione operativa e finanze), `istruttore` (propri allievi, voli scuola, proprie ore), `pilota`/`allievo` (i propri dati, prenotazioni, conto, scadenze).
**Conseguenze (testabili):**
- Un `pilota` che richiede l'estratto conto di un altro pilota riceve 403.
- Un Utente con ruoli `pilota`+`istruttore` vede l'unione delle due viste.

#### FR-3: Gestione utenti
Un `admin` può creare, disattivare e modificare Utenti, assegnare Ruoli e collegarli a Persone; invito e reset password via email.
**Conseguenze (testabili):**
- Un Utente disattivato non può autenticarsi; le sue sessioni attive decadono al più tardi entro 15 minuti.

### 4.2 Anagrafiche persone (piloti, allievi, istruttori)

**Descrizione:** Un'unica anagrafica Persone con profili attivabili: la stessa Persona può essere insieme Pilota e Istruttore, o passare da Allievo a Pilota al conseguimento della licenza mantenendo storico e conto. Realizza UJ-1, UJ-4, UJ-5.

**Requisiti funzionali:**

#### FR-4: CRUD Persone
Lo `staff` può creare, modificare, archiviare Persone con dati anagrafici e contatti (nome, cognome, codice fiscale opzionale, email, telefono, indirizzo).
**Conseguenze (testabili):**
- L'archiviazione non cancella: voli, movimenti e scadenze restano consultabili.

#### FR-5: Profili multipli
Lo `staff` può attivare/disattivare i profili Pilota, Allievo, Istruttore su una Persona; i dati specifici (numero licenza, tipo licenza per i Piloti; data inizio corso per gli Allievi; abilitazioni per gli Istruttori) vivono nel profilo.
**Conseguenze (testabili):**
- Il passaggio Allievo→Pilota mantiene lo stesso Conto e lo storico voli.

#### FR-6: Vista dettaglio persona
Ogni Persona ha una scheda con: profili, scadenze e relativo stato, saldo Conto, pacchetti attivi, ultimi voli, prossime prenotazioni.

### 4.3 Anagrafica velivoli

**Descrizione:** Flotta dell'aviosuperficie: marche, tipo/modello, contaore, stato operativo. La manutenzione tecnica è fuori scope (§5), ma un velivolo può essere messo "fuori servizio" bloccando le prenotazioni.

**Requisiti funzionali:**

#### FR-7: CRUD Velivoli
Lo `staff` può creare, modificare e archiviare Velivoli (marche univoche, tipo, modello, note, contaore iniziale).

#### FR-8: Stato operativo
Lo `staff` può marcare un Velivolo `operativo`/`fuori servizio` con motivo. Un Velivolo fuori servizio non è prenotabile; le prenotazioni future esistenti vengono segnalate allo staff per gestione manuale.

#### FR-9: Contaore
Il sistema mantiene il contaore progressivo del Velivolo aggiornandolo con i minuti di ogni Volo registrato; lo staff può fare rettifiche motivate.
**Conseguenze (testabili):**
- La correzione di un Volo (FR-16) ricalcola il contaore.

### 4.4 Tariffe e pacchetti ore

**Descrizione:** Prezzi orari di Velivoli e Istruttori, storicizzati; pacchetti ore prepagati scontati. Realizza UJ-1, UJ-4.

**Requisiti funzionali:**

#### FR-10: Tariffe velivolo storicizzate
L'`admin` può definire la Tariffa velivolo (€/h) con data di inizio validità; la tariffa precedente si chiude automaticamente. Ogni Volo usa la tariffa in vigore alla data del volo.
**Conseguenze (testabili):**
- Cambiando la tariffa oggi, un volo registrato con data ieri usa la tariffa di ieri.

#### FR-11: Tariffe istruttore storicizzate
Come FR-10 per gli Istruttori.

#### FR-12: Definizione pacchetti ore
L'`admin` può definire tipi di Pacchetto ore: ore incluse, prezzo scontato, insieme di Velivoli idonei, validità `[ASSUMPTION: i pacchetti hanno una scadenza opzionale in mesi]`.

#### FR-13: Vendita e consumo pacchetti
Lo `staff` può vendere un Pacchetto a un Conto (genera Movimento "Acquisto pacchetto" e Movimento di cassa in entrata). I Voli su Velivoli idonei scalano automaticamente i minuti dal residuo del pacchetto più vecchio non esaurito; l'eccedenza è addebitata a tariffa piena.
**Conseguenze (testabili):**
- Volo di 70' con residuo pacchetto 60' → 60' scalati dal pacchetto, 10' addebitati a tariffa oraria pro-rata.
- La tariffa istruttore non è mai coperta dal pacchetto.

### 4.5 Voli

**Descrizione:** Registro voli dell'aviosuperficie. Ogni volo registrato calcola il costo e genera gli addebiti. Realizza UJ-1, UJ-4.

**Requisiti funzionali:**

#### FR-14: Registrazione volo
Solo lo `staff` (o `admin`) può registrare un Volo: Velivolo, Pilota o Allievo, eventuale Istruttore, data, contaore iniziale/finale o minuti, tipo volo, note, eventuale numero atterraggi. Piloti, allievi e istruttori consultano i voli in sola lettura. *(Deciso dall'utente il 2026-07-04.)*
**Conseguenze (testabili):**
- Tempo di volo derivato dal contaore (finale − iniziale) con possibilità di inserimento diretto dei minuti.
- Contaore finale < iniziale → errore di validazione.

#### FR-15: Calcolo costo e addebito automatico
Alla registrazione, il sistema calcola: costo velivolo = tariffa oraria in vigore × minuti / 60 (arrotondamento al centesimo di euro); più costo istruttore se Volo scuola. Genera i Movimenti di addebito sul Conto e applica i Pacchetti (FR-13).
**Conseguenze (testabili):**
- 80 minuti a 150 €/h → addebito 200,00 €.
- Il dettaglio del Movimento mostra la scomposizione (minuti, tariffa usata, pacchetto scalato).

#### FR-16: Correzione e annullamento volo
Lo `staff` può correggere o annullare un Volo di qualsiasi data (nessuna chiusura del mese contabile — *deciso dall'utente il 2026-07-04*); il sistema storna e rigenera i Movimenti e ripristina i residui pacchetto. Ogni correzione resta tracciata.
**Conseguenze (testabili):**
- L'annullamento produce movimenti di storno tracciati, non cancellazioni silenziose.

#### FR-17: Registro e filtri
Chiunque con permesso può consultare il registro voli filtrando per periodo, Velivolo, Persona, tipo; il `pilota` vede solo i propri voli.

### 4.6 Prenotazioni velivoli

**Descrizione:** Calendario prenotazioni per Velivolo. I Piloti brevettati prenotano in autonomia; gli Istruttori prenotano per la scuola; lo staff può tutto. Realizza UJ-1.

**Requisiti funzionali:**

#### FR-18: Creazione prenotazione
Un `pilota` può prenotare un Velivolo operativo per un intervallo data/ora futuro; un `istruttore` può prenotare indicando l'Allievo; lo `staff` per chiunque.
**Conseguenze (testabili):**
- Sovrapposizione sullo stesso Velivolo → rifiuto con messaggio.
- Un `allievo` non può prenotare da solo `[ASSUMPTION: le prenotazioni scuola le fa l'istruttore o lo staff]`.

#### FR-19: Vista calendario
Vista calendario per giorno/settimana per Velivolo, con le prenotazioni di tutti visibili (nome prenotante visibile a tutti gli autenticati `[ASSUMPTION]`).

#### FR-20: Modifica e cancellazione
Il prenotante può modificare/cancellare la propria prenotazione fino all'orario di inizio; lo `staff` sempre.

#### FR-21: Blocco per scadenze critiche
Se il Pilota ha visita medica o licenza scaduta, il sistema blocca la nuova prenotazione con messaggio esplicativo; lo `staff` può forzare con presa di responsabilità tracciata `[ASSUMPTION: blocco su medica/licenza scadute, solo warning per rating scaduti]`.

### 4.7 PPR (piloti esterni)

**Descrizione:** Form pubblico per richiedere il permesso di atterraggio, coda di approvazione per lo staff, email di esito. Realizza UJ-3.

**Requisiti funzionali:**

#### FR-22: Form PPR pubblico
Un visitatore non autenticato può inviare una richiesta PPR: nome e cognome, email, telefono, marche e tipo aeromobile, provenienza, destinazione, data e ora stimata di arrivo (e partenza opzionale), numero persone a bordo, note. Form bilingue IT/EN con protezione anti-spam `[ASSUMPTION: honeypot + rate limiting, niente CAPTCHA di terze parti]`.
**Conseguenze (testabili):**
- Invio valido → pagina di conferma con promemoria "riceverai email di esito" + email di ricevuta.

#### FR-23: Coda e decisione staff
Lo `staff` vede le richieste `in attesa`, il dettaglio, e può approvare (assegnando il numero PPR generato dal sistema) o rifiutare con motivo.
**Conseguenze (testabili):**
- Approvazione → email al richiedente con numero PPR, data/ora, istruzioni operative configurabili; rifiuto → email con motivo.

#### FR-24: Registro PPR e chiusura
Lo `staff` può marcare il PPR `completato` (atterraggio avvenuto, con incasso della tassa di atterraggio registrato come Movimento di cassa: importo standard configurabile dall'admin, modificabile dallo staff alla chiusura — *deciso dall'utente il 2026-07-04*) o `annullato`. Registro filtrabile ed esportabile.

### 4.8 Finanze piloti (conti prepagati)

**Descrizione:** Ogni Pilota/Allievo ha un Conto prepagato. Lo staff registra le Ricariche; i Voli generano addebiti automatici; tutto è visibile in un estratto conto. Realizza UJ-1, UJ-2, UJ-4.

**Requisiti funzionali:**

#### FR-25: Ricariche
Lo `staff` può registrare una Ricarica su un Conto: importo, metodo (contanti, bonifico, POS), data, note. Genera anche il Movimento di cassa in entrata.

#### FR-26: Estratto conto
Il titolare vede il proprio estratto conto (saldo corrente, movimenti con scomposizione, residuo pacchetti); lo `staff` vede quello di tutti. Esportabile in PDF ed Excel.

#### FR-27: Saldo negativo con evidenza
Il Conto può andare in negativo. Il sistema evidenzia i saldi negativi in dashboard staff e avvisa il titolare via email al passaggio sotto zero e sotto una soglia configurabile `[ASSUMPTION: soglia default −200 €]`.

#### FR-28: Rettifiche
`staff`/`admin` possono registrare Movimenti di rettifica con motivo obbligatorio; ogni rettifica è tracciata (chi, quando, perché).

### 4.9 Finanze aviosuperficie

**Descrizione:** Cassa dell'aviosuperficie: entrate (ricariche, pacchetti, PPR, altro) e uscite (carburante, assicurazione, manutenzione, utenze, altro) categorizzate, con report periodici. Realizza UJ-6.

**Requisiti funzionali:**

#### FR-29: Movimenti di cassa
Lo `staff` può registrare Movimenti di cassa manuali (uscite e entrate extra); ricariche, vendite pacchetti e incassi PPR generano i movimenti automaticamente.

#### FR-30: Categorie
L'`admin` gestisce le categorie di entrata/uscita; ogni movimento ha una categoria.

#### FR-31: Report periodici
Lo `staff` può generare un report per periodo (mese/trimestre/anno/intervallo libero): totali per categoria, saldo del periodo, dettaglio movimenti. Esportabile PDF/Excel.
**Conseguenze (testabili):**
- La somma dei movimenti del report coincide con il saldo variato del periodo.

### 4.10 Scuola volo

**Descrizione:** Gestione degli Allievi, dell'assegnazione agli Istruttori, dei voli scuola e dell'avanzamento didattico. Realizza UJ-4.

**Requisiti funzionali:**

#### FR-32: Assegnazione allievi
Lo `staff` può assegnare uno o più Istruttori a un Allievo; l'`istruttore` vede l'elenco dei propri Allievi.

#### FR-33: Avanzamento didattico
L'`istruttore` può registrare annotazioni di avanzamento su un Allievo (data, volo collegato opzionale, esercizi svolti, giudizio libero, prossimi passi). L'Allievo le vede in sola lettura `[ASSUMPTION: annotazioni visibili all'allievo]`.

#### FR-34: Riepilogo ore
Il sistema calcola: ore totali dell'Allievo (doppio comando/solista), ore erogate da ciascun Istruttore per periodo (per la loro retribuzione `[ASSUMPTION: il compenso istruttori è gestito fuori dal sistema; serve solo il conteggio ore]`). Esportabile.

### 4.11 Scadenze (visite mediche, licenze, rating)

**Descrizione:** Tracciamento delle Scadenze per Persona con alert automatici e visibilità in dashboard. Set standard precaricato + tipi personalizzati. Realizza UJ-5.

**Requisiti funzionali:**

#### FR-35: Tipi di scadenza
Set precaricato: visita medica classe 1, classe 2, LAPL; licenza; rating SEP; inglese ICAO. L'`admin` può creare tipi personalizzati (nome, ambito: piloti/allievi/istruttori/tutti).

#### FR-36: Registrazione scadenze
Lo `staff` (o il titolare per i propri documenti `[ASSUMPTION: il pilota può aggiornare le proprie scadenze, lo staff valida]`) registra per una Persona: tipo, data rilascio, data scadenza, note.

#### FR-37: Alert automatici
Il sistema invia email al titolare (e riepilogo allo staff) a 60, 30 e 7 giorni dalla scadenza, e al giorno della scadenza.
**Conseguenze (testabili):**
- Ogni alert è inviato una sola volta per soglia per scadenza.

#### FR-38: Dashboard scadenze
Vista staff con tutte le scadenze ordinate per prossimità, con stato colore (verde >60gg, giallo ≤60gg, rosso scaduto), filtri e export. Il pilota/allievo vede le proprie nella propria home.

### 4.12 Export Excel e PDF

**Descrizione:** Ogni tabella principale e ogni report è esportabile. Realizza UJ-5, UJ-6.

**Requisiti funzionali:**

#### FR-39: Export Excel
Le viste elenco (persone, velivoli, voli, prenotazioni, PPR, movimenti conto, movimenti cassa, scadenze) sono esportabili in `.xlsx` rispettando i filtri attivi.

#### FR-40: Export PDF
Estratto conto, report finanziario periodico, registro voli e lista scadenze sono esportabili in PDF impaginato con intestazione dell'aviosuperficie (logo/nome configurabili).

### 4.13 Dashboard e API

#### FR-41: Dashboard per ruolo
Home differenziata: staff/admin (PPR in attesa, saldi negativi, scadenze imminenti, prossime prenotazioni, velivoli fuori servizio); pilota/allievo (saldo, residuo pacchetti, prossime prenotazioni, proprie scadenze); istruttore (allievi, voli scuola recenti, ore del mese).

#### FR-42: API REST documentate
Tutte le funzionalità sono esposte via API REST versionate (`/api/v1/...`) con validazione degli input e spec OpenAPI pubblicata, per il futuro client Flutter.
**Conseguenze (testabili):**
- La spec OpenAPI è generata dal codice e servita da un endpoint; ogni FR ha i suoi endpoint.

## 5. Non-obiettivi (espliciti)

- **Manutenzione tecnica dei velivoli** (programmi di manutenzione, AD/SB, ore residue componenti): solo stato operativo e note.
- **Fatturazione fiscale elettronica** (SDI, fatture XML): il sistema produce report; la fiscalità resta al commercialista.
- **Pagamenti online** (carte, Stripe/PayPal): le ricariche sono registrate dallo staff. Candidato v2.
- **Logbook ufficiale del pilota**: i voli tracciati non sostituiscono il libretto di volo personale.
- **NOTAM, meteo, piani di volo**: fuori dominio.
- **Multi-aviosuperficie / multi-tenant**: una sola aviosuperficie per installazione.
- **App mobile**: v2, in Flutter, sulle API v1.

## 6. Scope MVP

### 6.1 In scope (MVP)

Tutte le feature §4 (FR-1…FR-42), UI web responsive bilingue IT/EN, email transazionali (invito, reset, PPR, alert scadenze, saldo negativo), export Excel/PDF, API REST + OpenAPI, seed dati demo.

### 6.2 Fuori scope MVP

- App mobile Flutter (v2 — le API nascono pronte).
- Pagamenti online (v2). `[NOTE FOR PM: emotivamente rilevante per i piloti giovani; rivalutare presto]`
- Notifiche push / WhatsApp (v2; in MVP solo email).
- Statistiche avanzate e grafici storici pluriennali (v2; in MVP tabelle + export).
- Gestione carburante come magazzino (v2; in MVP è solo categoria di spesa).

## 7. Metriche di successo

Strumento interno a bassa scala (decine di utenti): metriche leggere.

**Primarie**
- **SM-1**: Entro 2 mesi dal go-live, il 100% dei voli è registrato in AirManager (niente più registro cartaceo). Valida FR-14/15.
- **SM-2**: ≥80% delle prenotazioni create in autonomia da piloti (non dallo staff). Valida FR-18.
- **SM-3**: Zero voli con visita medica scaduta non segnalata. Valida FR-21/37.

**Secondarie**
- **SM-4**: Tempo di gestione di un PPR (ricezione→esito) < 24h. Valida FR-22/23.

**Counter-metric**
- **SM-C1**: Tempo dello staff speso in rettifiche/storni — se cresce, il flusso di registrazione voli è troppo error-prone; non ottimizzare la velocità di inserimento a scapito della correttezza. Bilancia SM-1.

## 8. Domande aperte

*Risolte con l'utente il 2026-07-04:* solo lo staff registra i voli (FR-14); tassa PPR con importo standard configurabile (FR-24); nessuna chiusura del mese contabile (FR-16); pacchetti con scadenza opzionale, validi per set di velivoli, istruttore escluso (FR-12/13).

Restano aperte:
1. Regole tariffarie aggiuntive (notturno/weekend/minimi) — per ora bastano tariffa oraria pro-rata + pacchetti; riaprire solo se l'utente le chiede.
2. Email provider di produzione (SMTP dell'aviosuperficie? servizio tipo Resend/SES?) — decisione rinviata al go-live (vedi architettura, Deferred).

## 9. Indice delle assunzioni

*(Confermate dall'utente il 2026-07-04 e quindi rimosse dall'indice: registrazione voli solo staff — FR-14; tassa PPR configurabile — FR-24; nessuna chiusura mese — FR-16; pacchetti con scadenza opzionale, per set di velivoli, istruttore escluso — FR-12/13.)*

- §2.3 UJ-2 — Nessuna email di conferma ricarica in v1.
- §4.1 — Accesso a invito, nessuna self-registration.
- §4.6 FR-18 — Gli allievi non prenotano da soli.
- §4.6 FR-19 — Nomi dei prenotanti visibili a tutti gli utenti autenticati.
- §4.6 FR-21 — Blocco prenotazione su medica/licenza scadute; warning su rating.
- §4.7 FR-22 — Anti-spam con honeypot + rate limiting, senza CAPTCHA di terze parti.
- §4.8 FR-27 — Soglia alert saldo negativo default −200 €.
- §4.10 FR-33 — Annotazioni di avanzamento visibili all'allievo.
- §4.10 FR-34 — Compenso istruttori calcolato fuori dal sistema (solo conteggio ore).
- §4.11 FR-36 — Il titolare può aggiornare le proprie scadenze, lo staff valida.

## 10. NFR trasversali

- **NFR-1 Bilinguismo**: tutta la UI (inclusi form pubblico PPR ed email) disponibile in italiano e inglese; lingua per utente e per richiedente PPR.
- **NFR-2 API-first**: nessuna funzionalità solo-UI; tutto passa dalle API REST versionate con OpenAPI (FR-42). Autenticazione API compatibile con un futuro client mobile.
- **NFR-3 Sicurezza e privacy (GDPR)**: dati personali e date di visita medica trattati come dati sensibili — accesso limitato per ruolo, cifratura in transito (HTTPS) e at-rest a livello DB `[ASSUMPTION: at-rest demandata all'hosting]`, nessun dettaglio clinico oltre alla data di scadenza e classe della visita.
- **NFR-4 Tracciabilità**: movimenti finanziari immutabili (correzioni solo per storno/rettifica motivata), con autore e timestamp.
- **NFR-5 Precisione monetaria e oraria**: importi in centesimi di euro (niente float), tempi di volo in minuti interi; arrotondamenti documentati (FR-15). Fuso orario Europe/Rome; valuta EUR.
- **NFR-6 Prestazioni**: elenchi paginati; risposte API p95 < 500 ms con 10 anni di dati simulati (~50k voli).
- **NFR-7 Affidabilità**: backup giornaliero del database documentato; gli invii email falliti sono ritentati e visibili in una coda di errore.
- **NFR-8 Accessibilità**: la web app segue le basi WCAG 2.1 AA (navigazione da tastiera, contrasti, label).
- **NFR-9 Test**: logica di calcolo costi/pacchetti/scadenze coperta da test unitari; flussi critici (login, prenotazione, registrazione volo, PPR) coperti da e2e.
