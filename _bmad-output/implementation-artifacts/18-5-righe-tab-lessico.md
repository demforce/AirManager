---
baseline_commit: 1f6ab3e
---

# Story 18.5: Righe, tab e lessico (riperimetrata il 2026-11-03: il lessico è passato alla 19.12b)

Status: **done** — **18.5a done** (AC 1–5, `450ac94`) e **18.5b done** (AC 6, `9732247`), approvate in revisioni indipendenti il 2026-11-26.

Piano originario del 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e` con modelli statici calibrati sulle misure documentate). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Split** (v. §PO): **18.5a** (M4, M6, M13d, TD-19.12b-a, card Piloti) indipendente dall'Epic 17, può partire subito dopo l'Epic 16; **18.5b** (M11) DOPO la 18.4 (condivide `schedule.tsx`, la pagina e il filtro) e coordinata con la 18.2 (stessa testata di Pianificazione).

## Story

As an **utente da telefono**,
I want righe che mostrano il dato che distingue, tab che stanno su una riga e una Pianificazione pensata per chi prenota,
so that il nome non sia troncato mentre la marca occupa lo spazio (ui M4), la tab bar non vada a capo (M6), la seconda tab del pilota non sia la console admin (M11) e lo sheet prenotazione abbia un'azione primaria (M13d).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.5» (riperimetrazione 2026-11-03); `ui-review.md` M4, M6, M11, M13; review 19.12b I2 e L3 (TD-19.12b-a); 19.12b domanda PO 1 (card «Anagrafica piloti»).

## Stato su HEAD

- **M4**: righe di Pianificazione `bookings-table.tsx:833-857` (chip marche, poi nome); CSS `airops.css:2227-2234` `.mobile-row-tail{flex-shrink:0}`, `.mobile-row-name` (`:2235`) è l'unico che si accorcia; nessun limite di lunghezza sulle marche (`schemas/aircraft.ts:61`); la baseline «52/133 px» veniva da marche di fixture lunghe: difetto nel codice, mascherato dai dati → rimisurare con fixture dichiarata. Grammatica già giusta altrove: coda in attesa della Panoramica (`dashboard/page.tsx:464-470`, nome come titolo, «marche · data» sotto) e agenda (`schedule.tsx:323-339`). Stessa grammatica difettosa in «In corso ora» (`dashboard/page.tsx:450-452` via `mobile-booking-list.tsx:107`) e nelle card voli del Registro (`logbook-console.tsx:748`).
- **M6**: etichetta `shell.nav.*` (`mobile-nav.tsx:81`), font 9,5 px (`airops.css:1874`, MOB-2). Il lessico l'ha già risolto la 19.12b: in IT a 375 la barra del pilota sta su una riga. A 9,5 px vanno ancora a capo: EN «Account statement» a 320-414 (barra 77,8 contro 66,9); IT «I miei compensi» dell'istruttore a ≤ 360; IT «Estratto conto» solo a 320. Con font più grande e le parole attuali tornano a capo (10,5 px: «I miei compensi» a 360-390, «Estratto conto» a 360; 11 px: «Estratto conto» a 360-390) → **«più grande e su una riga» non si ottiene con le parole attuali**. Con etichette brevi («Conto», «Compensi», «Statement», «Payouts») una riga a 360-414 fino a 11 px; a 320 va a capo solo «Registro voli» (+ «My payouts» a 11 px).
- **M11**: pilota e allievo vedono la pagina dell'admin (`bookings/page.tsx:419-484`); sottotitolo unico (`it.json:1260`, «Calendario dei velivoli e prenotazioni da approvare.») che descrive il lavoro dello staff; righe fuori servizio in testa all'agenda; prenotazioni altrui come «Occupato»; CTA di prenotazione sotto l'agenda. Chip della flotta e popover li chiudono 17.2 e 18.4; resta il «cosa è mio» (audit: «L, story propria, con ratifiche»).
- **M13d**: sheet prenotazione (`bookings-table.tsx:518-631`): APPROVED staff = Modifica, Effettuato, Assente, Annulla tutti secondari; PENDING ha già «Approva» primario; «Effettuato» prima dell'inizio risponde 422 `BOOKING_NOT_STARTED` (`bookings.service.ts:1561`, 16.3) ma il bottone c'è comunque (anche desktop `:768`); il focus di ritorno `sheetPrimaryRef` (`:230`, `:267`) va al **primo bottone in DOM**, non al primario.
- **TD-19.12b-a — la diagnosi registrata è sbagliata**: la causa è della 19.12b, non preesistente. Le due `<span class="sr-only">` aggiunte nell'intestazione (`logbook-console.tsx:608-615`, 0 occorrenze su `66fd139^`) sono `position:absolute` (`airops.css:95-101`) senza antenato posizionato: il loro blocco contenitore è il documento, né `.logbook{overflow-x:auto}` (`:1052`) né `.card{overflow:hidden}` le ritagliano, e allargano lo scroll del documento. Sul modello: con le span torna esattamente la tabella L3 (99/175/131/263/390); senza, sfondamento 0 a ogni larghezza. **Fix verificato**: `.lb-row > *{position:relative}` → 0 da 641 a 1280 (il contenitore interno nasconde ancora 404 px a 1280, ma è D2 della 18.7). L'audit 11-02 confermava che prima non c'era.
- **Card «Anagrafica piloti»** (`it.json:281`, EN «Pilots directory») elenca tutte le persone.

## Acceptance Criteria

### 18.5a

1. **M4**: *Given* una prenotazione run-unique con marche da 20 caratteri e una persona con nome da 20 *When* la lista rende a 375 e 390 *Then* il nome non è troncato (`scrollWidth ≤ clientWidth` sul nome) e la riga contiene ancora le marche. Grammatica e perimetro: §PO Q-18.5-a. Rosso su HEAD.
2. **M6**: *Given* i 4 ruoli, IT ed EN, a 360/375/390/414 *Then* ogni etichetta della tab bar è su una riga, la barra ha la stessa altezza per tutti i ruoli, il font è ≥ quello deciso; il 320 dichiarato a parte. Etichette: §PO Q-18.5-b. Rosso su HEAD (EN pilota 77,8). Se l'etichetta visibile si accorcia, il nome accessibile contiene il testo visibile (WCAG 2.5.3: `aria-label` col nome intero; «Conto» è contenuto in «Estratto conto»). `BANNED` vieta «il mio conto» e «le mie transazioni» (`messages.test.ts:237-238`).
3. **M13d**: nello sheet c'è esattamente un `.btn.primary` secondo §PO Q-18.5-c; il focus di ritorno dal secondo passo va riallineato al primario. Rosso su HEAD (0 primari su APPROVED).
4. **TD-19.12b-a**: *Given* ≥ 1 volo su `/it/dashboard/logbook` a 641/768/900/1024/1100/1280 *Then* `documentElement.scrollWidth ≤ clientWidth`. Rosso su HEAD. Correggere la diagnosi nel record (non preesistente: 19.12b).
5. **Card Piloti**: §PO Q-18.5-d.

### 18.5b (M11) — AC da completare dopo la 18.4, sull'ossatura ratificata in §PO Q-18.5-e

6. A 375, per pilota e allievo, le proprie prossime prenotazioni stanno nella prima schermata; il sottotitolo è per ruolo; la CTA di prenotazione è nella prima schermata; per l'admin nulla cambia (invarianza misurata). Coordinare la testata con la 18.2.

Per entrambe: misure M4 a 375/390 due temi; M6 a 320-414 × IT/EN × 4 ruoli × due temi; M13d uno screenshot per stato; TD a 641-1280. `npm run gates` + e2e via `scripts/e2e.sh` verdi.

## Dev Notes

**Blast radius (18.5a)**: `bookings-table.tsx` (righe mobile e sheet); eventualmente `dashboard/page.tsx:450` e `logbook-console.tsx:748` secondo §PO; `mobile-nav.tsx` + `dashboard/layout.tsx` (`toMobileItem`) + `messages` (chiavi brevi solo per la barra, parità it/en); `airops.css` (`:1874`, `:1053`, commento «67/78» `:1803-1807`). **e2e che pinnano**: `mobile-ink-targets.spec.ts:139-172` (5 colonne, h ≥ 44); `mobile-shell.spec.ts:185-241` (geometria della barra); `my-account.spec.ts:143-145` (cerca il link «Estratto conto» nel landmark «Aree operative», che **a 375 è la tab bar**); `mobile-planning.spec.ts:246`, `:658`, `booking-requirements.spec.ts:576`, `mobile-overview-overflow.spec.ts:148` (filtrano per testo/badge: reggono se le marche restano nel testo della riga). I testid restano invariati.

**Mutanti** (solo su copia isolata con sha256): via `position:relative` → TD rosso; ritorno a `flex-shrink:0` senza tetto → M4 rosso.

**Dimensione**: 18.5a ~10-12 file, +350-500; 18.5b ~10-14 file, +600-900.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.5-a** = A: righe come la coda della Panoramica — nome in prima riga, «marche · data · ora» sotto — su Pianificazione e «In corso ora»; le card del Registro voli restano invariate.
- **Q-18.5-b** = A: etichette brevi solo nella barra («Conto», «Compensi»; EN «Statement», «Payouts»), nome intero nel menu e nel titolo, testo un po' più grande (font deciso dal dev con la misura, ≥ 10,5 px, su una riga a 360-414).
- **Q-18.5-c** = A: primario «Effettuato» se la prenotazione approvata è già iniziata, altrimenti «Modifica»; gli altri restano; PENDING → «Approva» invariato.
- **Q-18.5-d** = B: «Anagrafica piloti» → «Anagrafica» (EN «Directory»).
- **Q-18.5-e (18.5b)** = A: per pilota e allievo in cima «Le mie prossime prenotazioni» e «Prenota», poi il calendario con gli altri «Occupato».
- **Split** = sì: **18.5a** (AC 1-5) e **18.5b** (AC 6, dopo la 18.4, coordinata con la 18.2).


## Dev Agent Record

### Agent Model Used

18.5a sviluppata da un solo agente nel contesto Codex Cloud avviato con la selezione GPT 6.2 Astra xhigh. Base di implementazione `d47a569053fd04dec30428eff8aa6c03dcb3eba5`. Albero congelato per la revisione di codice e test `5735a11d601db77a6049e426b38749486e41dffe`.

### Completion Notes List

#### 18.5a — AC 1–5

- **AC 1, M4.** Le righe dell’elenco prenotazioni e di «In corso ora» mostrano il nome nella prima riga e marche, data e ora sotto. La seconda riga di «In corso ora» conserva anche l’ora di fine e, quando presente, l’istruttore. Le informazioni lunghe possono andare a capo. Prova con un velivolo e un pilota sintetici run-unique, ciascun campo di 20 caratteri (nome completo con spazio). La misura su `.mobile-row-name` è `scrollWidth/clientWidth` in pixel. Nelle due esecuzioni i suffissi casuali producono nomi della stessa lunghezza ma di larghezza intrinseca leggermente diversa.

  | Superficie | Base a 375 / 390 | Candidato a 375 / 390 |
  | --- | --- | --- |
  | Pianificazione | 141/43, 141/58 | 138/138, 138/138 |
  | Panoramica, In corso ora | 141/49, 141/64 | 138/138, 138/138 |

  Ogni coppia è stata rilevata sia in tema chiaro sia in tema scuro. Il browser verifica anche il testo completo della riga secondaria e l’assenza di overflow su di essa.

- **AC 2, M6.** Font della barra da 9,5 a 10,5 px. Nella matrice di **80 combinazioni** (quattro ruoli, IT/EN, due temi, cinque larghezze), le 64 combinazioni fra 360 e 414 px hanno tutte e cinque le etichette su una sola riga e altezza barra **68,0625 px**. A 320 px «Registro voli» va a capo per istruttore, pilota e allievo in IT (barra 80,125 px in entrambi i temi). Le altre dieci combinazioni a 320 misurano 68,0625 px. Sulla base le barre misuravano 66,921875 o 77,84375 px. Il browser controlla i nomi accessibili completi dei link, li segue, verifica l’H1 e legge la voce completa nel menu desktop. Etichette brevi riservate alle due voci nella barra.
- **AC 3, M13d.** Nel primo passo di uno sheet con azioni, il primario e la destinazione del focus al ritorno coincidono. Per l’admin, approvata futura → Modifica, approvata iniziata → «Segna come effettuata», in attesa → Approva. Una prova con orologio controllato attraversa l’inizio mentre lo sheet è aperto. Il ritorno da Annulla o dal motivo di rifiuto è verificato sui tre stati decisionali. Nei tre stati riapribili il solo comando «Riapri» è primario. Una prenotazione annullata non espone decisioni. I controlli di ruolo e le transizioni disponibili restano quelli del servizio.
- **AC 4, TD-19.12b-a.** Le due etichette accessibili dell’intestazione Registro introdotte dalla 19.12b erano assolute senza un contenitore posizionato; ora le celle di intestazione ne sono il riferimento. Sul Registro con un volo sintetico della persona di prova, eccedenza di `documentElement.scrollWidth` rispetto a `clientWidth` a **641/768/900/1024/1100/1280 px**: **390/263/131/175/99/0** sulla base e **0/0/0/0/0/0** sul candidato. Questa misurazione riguarda lo scroll del documento; lo scroll interno della tabella appartiene alla 18.7.
- **AC 5.** La card della pagina Piloti è «Anagrafica» in IT e «Directory» in EN. Verifica sul testo visibile della card per entrambe le lingue.

**Screenshot dello sheet** raccolti nel mirato verde sul candidato, prima schermata di ogni stato con dati sintetici. [Approvata futura](evidence/18-5a/sheet-approved-future.png), [approvata iniziata](evidence/18-5a/sheet-approved-started.png), [in attesa](evidence/18-5a/sheet-pending.png), [rifiutata](evidence/18-5a/sheet-denied.png), [effettuata](evidence/18-5a/sheet-flown.png), [assente](evidence/18-5a/sheet-no-show.png), [annullata](evidence/18-5a/sheet-cancelled.png).

#### Prove di discriminazione

Sulla base, `scripts/e2e.sh start e2e/mobile-rows-tabs.spec.ts --retries=0 --workers=2` ha dato `E2E_EXIT=1`, tre test rossi. Riscontri: nome tagliato nelle due liste, etichette su due righe o font sotto soglia, zero pulsanti primari su APPROVED, documento con overflow e vecchio titolo. Il primo tentativo sullo stesso binario aveva incluso un timeout da 90 s dovuto alle ripetute attese su asserzioni volutamente rosse e un selettore di fixture errato. Lo spec corretto ha completato le misure di baseline. Il corrispondente mirato sul candidato è verde, **3/3 in 42,8 s**, nessun retry o skip.

Controprova su copia isolata della build, con il solo CSS emesso modificato. È stato rimosso il contenitore posizionato delle celle e riportata davanti al nome, in un layout flex, la metadata con `flex-shrink:0` senza limite. In questa copia la metadata comprende anche data e ora; sulla base era solo il chip marche. SHA-256 del CSS originale `3d9f9cc82e8bca6a48a1cb4e1e2cf2f08f61a9e38964fa77753202bcaee0d000`, della variante `6984a96d008f33d68d6069aa14ed7e0d82e662b8990f2bc8a3f130671294b343`. Eseguito nella copia `scripts/e2e.sh start e2e/mobile-rows-tabs.spec.ts -g 'distinguishable|populated' --retries=0 --workers=1`: **2 rossi**, `E2E_EXIT=1`; nome da 138 px in 0 px disponibili in entrambe le liste, eccedenze del Registro di nuovo 390/263/131/175/99/0. CSS del checkout ricontrollato con SHA-256 originale.

Nel primo `npm run gates` lint ha segnalato `bookings-table.tsx:547 react-hooks/purity: Cannot call impure function during render` (exit finale 1). La lettura dell’orologio è ora nella callback del click. Il primo controllo mirato con le parentesi del percorso escaped in modo errato è uscito 2 (`No files matching the pattern`); ripetuto sul percorso letterale, `npx eslint 'src/app/[locale]/dashboard/bookings/bookings-table.tsx'` è uscito 0.

#### Gate sul candidato

`npm run gates`, exit **0**: lint 71 s, typecheck 11 s, **2.349/2.349 unit** in 22 s, build di produzione 74 s. Il comando `env -u NODE_ENV node scripts/reset-test-db.mjs` ha azzerato, migrato e popolato il solo database disposable `airmanager_e2e` sul socket TCP locale dedicato (exit 0). La suite usa la build verificata con `--keepAliveTimeout 75000`, Mailpit su localhost e una fixture locale per la stazione LIML.

`E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2`, esito letto con `TMPDIR=/tmp/am185a scripts/e2e.sh status`: **`E2E_EXIT=0` in 27,2 minuti**, 700 casi distinti. **697 passati al primo tentativo**, **3 passati al retry**, nessuno saltato o fallito. I 3 test nuovi sono passati tutti al primo tentativo. Il secondo nome run-unique misura 132/132 px nelle otto combinazioni, con altezze della barra e misure del Registro uguali al mirato. I 3 casi METAR sono passati al primo tentativo con la fixture LIML.

Tentativi falliti del full (il runner non assegna un exit di processo separato a ogni tentativo):

| Test | Riga diagnostica sanitizzata | Esito |
| --- | --- | --- |
| `account-adjustments.spec.ts:94` | `Expected 1 Mailpit message(s) to [destinatario sintetico] within 15000ms` | Passato al retry 1 |
| `empty-18-2b.spec.ts:52` | `en/billing desktop`, poi `it/billing desktop`: ordinata attesa 85,84, rilevata 79,84 px a parità degli altri tre valori | Passato al retry 2 |
| `mobile-expiries-movements.spec.ts:666` | `/it/dashboard/reports .segmented button height`: atteso ≥ 43,5, rilevato 0 px | Passato al retry 1 |

#### Revisione indipendente

Il revisore GPT 6 Sol xhigh ha approvato gli AC 1–5 senza rilievi sul tree `5735a11d601db77a6049e426b38749486e41dffe`, poi committato come `450ac94`. Ha verificato l’interfaccia su una seconda build con database sintetico separato, i sette screenshot, le controprove e il log della suite completa. [Rapporto del revisore](evidence/18-5a/review.md).

### File List

- `src/app/[locale]/dashboard/(home)/page.tsx`, `mobile-booking-list.tsx`, `bookings/bookings-table.tsx` (due righe di prenotazione e azioni dello sheet)
- `src/app/[locale]/dashboard/layout.tsx`, `src/components/shell/mobile-nav.tsx`, `src/styles/airops.css`
- `messages/it.json`, `messages/en.json`
- `e2e/mobile-rows-tabs.spec.ts`, `_bmad-output/implementation-artifacts/evidence/18-5a/sheet-*.png`

## Dev Agent Record — 18.5b (AC 6)

La 18.5a e la 18.4 erano integrate su `dev` a `0c07fc668d4ad6d20eca7744f8643d02f1faf117`. La 18.5b riguarda la prima schermata di Pianificazione per pilota e allievo. Il calendario condiviso, il filtro velivolo e il pannello per creare una prenotazione sono quelli già in uso.

### AC 6 — prenotazioni personali e azione per ruolo

- Il lettore server usa il `personId` della sessione e il permesso `self.read`. Se manca la persona collegata restituisce una lista vuota senza interrogare le prenotazioni. Interroga le partenze da adesso in avanti negli stati In attesa e Approvata, ordinate per partenza e ID. Legge al massimo quattro righe per mostrarne tre e segnalare quando ce ne sono altre. La proiezione contiene ID, partenza, stato e marche. La ricerca rimane personale anche se l'utente cambia giorno, pagina, velivolo o stato nella vista generale.
- Pilota abilitato e allievo vedono la lista prima del calendario a una larghezza fino a 640 px. «Prenota» apre lo stesso modulo della lista generale e alla chiusura il focus torna al pulsante. La vista usa l'eligibilità di creazione della 18.2b. Per il solo allievo il sottotitolo indica che un istruttore o un amministratore può prenotare per lui. Un pilota con profilo disattivato conserva la lista e non ha l'azione di creazione. Per admin e istruttore la pagina evita anche la lettura personale. Il rendering server per pilota/allievo prepara la medesima anteprima limitata anche se il CSS desktop la nasconde.
- Prova browser in IT e EN attraverso la seconda tab. Fixture run-unique con utenti pilota e allievo, marche distinte, prenotazioni create fuori ordine, in corso, annullata e in attesa. Il filtro sul velivolo dell'altra persona, lo stato Rifiutata e `page=9` lasciano nella lista personale le tre partenze giuste, comprese le richieste in attesa. La riga altrui in agenda mostra «Occupato». Verificati anche lista vuota, sottotitolo, assenza della CTA per il solo allievo e dopo la disattivazione del profilo pilota, modulo e ripristino del focus, ritorno alla presentazione desktop.
- I due test unitari del nuovo lettore verificano il vincolo sulla persona, l'istante di partenza, gli stati, l'ordine stabile, la proiezione, il limite con quarta riga sentinella e il caso senza persona. Restano in suite i test di eligibilità multi-ruolo della 18.2b.

### Prima schermata e confronto con la base

Chromium, 375 × 812 in italiano, tema chiaro. Su DB fresco in entrambe le build sono state ricreate nove prenotazioni sintetiche approvate per il giorno successivo, sullo stesso velivolo. Due appartenevano al pilota, due all'allievo e cinque a un'altra persona. Le coordinate sono letture di `getBoundingClientRect()` dopo il caricamento di pagina e font. La barra delle tab inizia a 743,94 px. [Pilota prima](evidence/18-5b/before-pilot.png), [pilota dopo](evidence/18-5b/after-pilot.png), [allievo dopo](evidence/18-5b/after-student.png).

| Ruolo e superficie a 375 px | Base | 18.5b |
| --- | --- | --- |
| Pilota, prima riga personale | Nessun riepilogo | y 182,84, altezza 58,14 px |
| Pilota, prima azione di creazione | y 1.005,00 | y 128,84, altezza 44 px |
| Allievo, prima riga personale | Nessun riepilogo | y 177,25, altezza 58,14 px |
| Allievo, indicazioni per prenotare | Sottotitolo dello staff | Sottotitolo a y 75,00, altezza 37,69 px |
| Admin e istruttore, calendario | x 28, y 115,84, 319 × 771,86 | Identico |
| Admin e istruttore, lista | y 909,70 | y 909,70 |

A 375 px gli screenshot di admin e istruttore coincidono byte per byte tra le due build (SHA-256 admin `bb49cff89bb36ebac76ea838880521c47b7c9d643dbfe2e7d23ea912c71bd176`, istruttore `db3d3e1aef7e177ccd816199c81bd2f13d6926ca3b4db791cde5c173a741cfe5`). A 1280 × 812 i quattro ruoli conservano testo del sottotitolo e geometria di testata, calendario, lista e relativo pulsante, dove previsto. La testata misura 992 × 51,44 px a (260, 85,84) e il calendario 992 × 196,39 a (260, 159,28). Overflow orizzontale di pagina pari a zero per ogni misura.

### Prove di discriminazione e gate

| Comando | Exit | Riscontro |
| --- | --- | --- |
| `npx vitest run src/server/services/bookings.service.test.ts -t listOwnUpcomingBookings` prima del lettore | 1 | `TypeError: listOwnUpcomingBookings is not a function`, 2 test rossi |
| Stesso comando dopo l'implementazione | 0 | 2 test passati, 358 test esclusi dal filtro nominale |
| `node /tmp/am185b/red-browser.cjs` sulla base, dopo il click su Pianificazione | 1 | `getByRole('heading', { name: 'Le mie prossime prenotazioni' })`, `Timeout: 3000ms`, `element(s) not found` |
| Primo mirato sulla base, `scripts/e2e.sh start e2e/personal-planning.spec.ts --project=chromium --workers=1 --retries=0 --max-failures=1` | 1 | Selettore preparatorio errato, `waiting for getByTestId('mobile-tab-bookings')`, timeout 120.000 ms. Corretto in `mobile-tab-schedule`. La prova browser della riga sopra isola il criterio. |
| `npm run gates` | 0 | Lint 40 s, typecheck 16 s, 2.351 test unitari in 17 s, build 54 s |
| `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/personal-planning.spec.ts --project=chromium --workers=2 --retries=0` | 0 | Due casi passati al primo tentativo in 35,2 s |

Il candidato applicativo e di test è il tree `ab8e07a2494b96a8b0dfaa5767a4a1813593c7ad`. Dopo il mirato, `npm run db:reset:test` (exit 0) ha ricreato il solo database disposable `airmanager_e2e` su loopback alla porta 55484. Il server della build verificata è stato riavviato con SMTP/Mailpit su localhost, fixture METAR LIML locale e keep-alive di 75 s.

`E2E_REUSE_SERVER=1 TMPDIR=/tmp/am185b/final scripts/e2e.sh start --workers=2`, esito letto da `TMPDIR=/tmp/am185b/final scripts/e2e.sh status`: **702 casi in 27,5 minuti, E2E_EXIT=0**. 699 passati al primo tentativo e tre recuperati in quattro retry. Zero saltati e zero fallimenti finali. Entrambi i nuovi casi, tutti e tre i test 18.5a e i tre casi METAR sono passati al primo tentativo. A 360–414 px la barra della regressione 18.5a misura ancora 68,0625 px. A 320 px resta il ritorno a capo documentato di «Registro voli» in italiano per istruttore, pilota e allievo. I test 18.2b sugli stati vuoti e il test 18.4 della ricerca del velivolo sui due breakpoint sono passati al primo tentativo.

| Tentativo del full | Riga diagnostica sanitizzata | Esito |
| --- | --- | --- |
| `account-adjustments.spec.ts:94` | `Expected 1 Mailpit message(s) to [indirizzo sintetico] within 15000ms` | Passato al primo retry |
| `aog-impact-email.spec.ts:564` | `641px desktop AOG link vs exact base`, y attesa 620,44 px, rilevata 622,44 px sia nel primo tentativo sia al primo retry | Passato al secondo retry |
| `mobile-expiries-movements.spec.ts:666` | `/it/dashboard/reports .segmented button height`, valore atteso ≥ 43,5 px, rilevato 0 px | Passato al primo retry |

Il runner riporta l'exit della suite e l'esito dei singoli tentativi. Le righe sopra documentano l'asserzione fallita; il log non stabilisce la causa dei tre comportamenti intermittenti. La fixture LIML esercita l'interfaccia con dati locali. Per la 18.5b le misure sono state effettuate con Chromium, senza prova su un telefono fisico.

### Revisione indipendente e chiusura 18.5b

Per l’unico agente di sviluppo è stata selezionata la configurazione GPT 6.2 Astra xhigh. Il revisore indipendente GPT 6 Sol xhigh ha approvato il tree applicativo `ab8e07a2494b96a8b0dfaa5767a4a1813593c7ad`, pubblicabile come commit `9732247`, senza rilievi. Ha verificato l’AC 6 in una build e su un database sintetico separati, inclusi ruoli combinati, focus, Indietro, calendario condiviso e filtri. La chiusura di 18.5b completa i sei criteri della story 18.5. [Rapporto di revisione](evidence/18-5b/review.md).

### File della 18.5b

- `src/app/[locale]/dashboard/bookings/page.tsx`, `new-booking-form.tsx`, `schedule.tsx`, `src/styles/airops.css`, `messages/{it,en}.json`
- `src/server/services/bookings.service.ts`, `bookings.service.test.ts`
- `e2e/personal-planning.spec.ts`, `e2e/booking-actors.ts`, `e2e/empty-18-2b.spec.ts`
- Screenshot prima/dopo in `_bmad-output/implementation-artifacts/evidence/18-5b/`
