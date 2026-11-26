# Corrispondenza fra tabelle ed export

**Verifica BMAD post Epic 18 · 26 novembre 2026.** Base `b8b049db6b950a4c7260e21c94d8561956779af4`. Commit applicativo `ddc1c6ffc808cc4769f9b6b8a1d7d1a7c4f5639b`, tree verificato `f327b9e80b707d5d110fd70dffe6531fd6792a56`. Questo lavoro segue l’handoff dell’Epic 18. Le story precedenti conservano il loro esito.

## Contabilità · filtro di periodo perso nell’Excel

Prima della correzione «Transazioni (Excel)» metteva nel link i parametri della pagina, `dateFrom` e `dateTo`. L’endpoint `/api/v1/transactions` riconosce `from` e `to`. Le righe fuori intervallo entravano così nel file con una risposta HTTP riuscita. Ora il link usa gli stessi filtri normalizzati della lettura che riempie la tabella. Il form conserva i nomi originari. Categoria, tipo contabile, ricerca della persona e movimenti senza metodo attribuito si combinano con il periodo.

Il browser ha applicato i filtri a cinque movimenti sintetici dal 1° al 5 marzo 2004. Il suffisso identifica il movimento e l’importo ne conferma l’identità. Il confronto legge le otto celle della riga, compresi tipo, descrizione, entrate, uscite e stato, rispettando l’ordine della schermata. [Confronto delle celle](evidence/parita-export/transazioni.json) · [XLSX del periodo](evidence/parita-export/transazioni-periodo.xlsx)

| Filtri sulla categoria sintetica | Ordine in tabella e nel file corretto |
|---|---|
| Dal 2 al 4 marzo, estremi compresi | 4, 3, 2 |
| Dal 3 marzo | 5, 4, 3 |
| Fino al 3 marzo | 3, 2, 1 |
| Dal 2 al 4 marzo, solo Ricavo | 4, 2 |

Sulla base, il primo caso scaricava **5, 4, 3, 2, 1**. Sul candidato sono stati provati anche periodo più `personQuery` (una riga e un intervallo vuoto) e periodo più `unattributed=true` (una riga storica da 5,00 € con metodo nullo e una da 7,00 € con metodo attribuito esclusa). Il primo controllo con entrambe già attribuite dava zero righe in ciascuna vista.

## Scadenze · cosa rappresentano le cinque colonne

Il registro e i due file leggono gli stessi elementi con gli stessi filtri. La schermata espone per Currency anche l’attività nella finestra e i giorni residui. L’export compatto contiene **Persona, Tipo, Ambito, Scadenza, Stato**. Per Currency l’ambito è «—». Le tre fasce visive fino a 7, 30 e 60 giorni condividono nel file lo stato «In scadenza». La scadenza è una data del calendario di Roma. Le righe per requisiti mai maturati seguono la decisione PO della 19.7b. [Contratto 19.7b, AD-3 e AD-4](19-7b-registro-scadenze-unificato.md)

Il server e Chromium sono stati fermati allo stesso istante, `2026-11-26T23:30:00Z`, **27 novembre alle 00:30 a Roma**. Otto Currency sintetiche avevano rispettivamente −1, 0, 7, 8, 30, 31, 60 e 61 giorni residui. Per quella a zero giorni la schermata riportava «1 volo negli ultimi 90 giorni», «0 gg» e «≤ 7 gg». Entrambi i file riportavano la stessa persona, «Currency», «—», «27/11/2026», «In scadenza». Nel caso a +30 la schermata contava due voli, nel caso scaduto zero. [Matrice delle righe](evidence/parita-export/scadenze.json) · [XLSX di esempio](evidence/parita-export/currency-tutte.xlsx) · [PDF di esempio](evidence/parita-export/currency-tutte.pdf)

| Vista con la stessa ricerca persona | Tutte | Scadute | Entro 7 gg | Entro 30 gg | Entro 60 gg |
|---|---:|---:|---:|---:|---:|
| Identità in ciascuna delle tre rappresentazioni | 8 | 1 | 3 | 5 | 7 |

Le finestre sono cumulative e comprendono le scadute. Sono stati controllati ordine e valori, inclusi i due lati di ciascun limite. Un rating persistito a +7 giorni ha mantenuto tipo, ambito «Tutti», persona, data e stato. Con filtro misto sulla stessa persona, la Currency di oggi precede il rating in entrambe le lingue. In nove coppie XLSX/PDF si contano 30 presenze di riga per formato, comprese le ripetizioni fra viste e lingue.

**Fedeltà dei nomi nel PDF.** Su una riga distinta il nome sintetico «Łukasz» è integro nella UI e nell’XLSX. Il testo estratto dal PDF contiene «V¶7» al suo posto. Il difetto è visibile anche nel rendering. Sul file salvato, `pdffonts` identifica Helvetica e Helvetica-Bold come Type 1 WinAnsi senza font incorporato. Anche una seconda estrazione con MuPDF perde il nome originale. Le altre quattro celle della riga coincidono. La scelta documentata di Helvetica standard con codifica WinAnsi limita il repertorio dei glifi. La prova dimostra la perdita del nome sul candidato e non ne data l’introduzione. [PDF originale della sonda](evidence/parita-export/nome-unicode.pdf) · [Immagine del PDF](evidence/parita-export/unicode-pdf.png) · [Decisioni sul font](17-7-export-pdf-stream.md)

**Decisioni da sottoporre al PO**

1. Mantenere il formato compatto. Se serve ricostruire la schermata dal file, proporre una versione dettagliata con attività, giorni residui e fascia. La scelta modifica le colonne o introduce una seconda versione del documento.
2. Per riportare fedelmente i nomi fuori WinAnsi, si propone un font Unicode incorporato, con verifiche di licenza, dimensioni, impaginazione ed estrazione su tutti e cinque i PDF. Per i nomi coinvolti l’XLSX conserva la grafia originale. La scelta del font resta aperta.

## Inventario delle superfici

L’inventario del ramo comprende nove risposte XLSX e cinque PDF. Le pagine condividono alcune destinazioni. Il browser desktop ha usato i menu reali del candidato in italiano, su una copia isolata del database sintetico. ExcelJS ha decodificato i fogli. Per i PDF sono stati usati Poppler e il confronto del testo per coordinate di colonna, ricomponendo i nomi andati a capo. Le misure di pagina sono conteggi della fixture.

| Tabella o documento | Formati | Riscontro |
|---|---|---|
| Piloti e anagrafiche | XLSX | Ricerca attiva e ricerca negli archiviati, una persona in ciascun caso. Identità e stato corrispondono. Il file ha cinque colonne anagrafiche, la UI aggiunge informazioni operative fra cui saldo e ultimo volo. |
| Flotta | XLSX | Ricerca di un mezzo operativo e di un archiviato incluso esplicitamente. Marche e modello coincidono. Il file distingue stato anagrafico e operativo. |
| Istruttori e compensi | XLSX | Stesse 91 persone in ordine, 90 attive e una ex istruttrice o ex istruttore con saldo. Confrontati nominativi, tariffe presenti, ore e importi dovuti. L’export riguarda il riepilogo. |
| Registro voli | XLSX e PDF | Un volo filtrato per velivolo e giorno. Verificati persona/PIC, data, tratta, orari, durata 0:30, un decollo, un atterraggio e addebito 0,00 €. La riga rimane in entrambi i file. La dicitura «Senza addebito» resta nella UI del registro secondo la [decisione D-10 della 19.6](19-6-volo-senza-addebito-cancellazione-definitiva.md). |
| Pianificazione, elenco Prenotazioni | XLSX e PDF | Quattro prenotazioni approvate del velivolo filtrato. Per tutte e quattro coincidono le sei colonne nei file, orari locali, ordine e dati visibili. L’export si riferisce all’elenco sotto il calendario. |
| Panoramica, anteprima Prenotazioni | XLSX e PDF | Otto righe visibili, le prime otto nella stessa sequenza dei file. I file contengono tutte le 188 prenotazioni della finestra dell’elenco, a partire da 48 ore prima e con tutti gli stati. Confrontate sei celle per ciascuna riga nei due file, anche fra le dieci pagine PDF. |
| Scheda persona ed estratto conto personale | XLSX e PDF | Amministratore, cinque movimenti più apertura con sei colonne. Pilota titolare, due movimenti più apertura con cinque colonne. Confrontati identità, ordine, date, importi e saldi, inclusa la riga di apertura. Il titolare non riceve l’autore interno della registrazione. Nel suo estratto è presente la descrizione del movimento «Volo senza addebito». |
| Contabilità, registro Transazioni | XLSX | Vedi il confronto dei limiti inclusivi e dei filtri combinati sopra. |
| Contabilità, Report di cassa | PDF | Documento dei totali per categoria. Con entrambi gli estremi dal 15 al 16 giugno 2019 mostra 12,00 € di entrate, 0,00 € di uscite e netto +12,00 € (movimenti da 5,00 e 7,00 €). Con un solo estremo, per ciascun lato, o nessuno, usa l’intero mese di riferimento, dal 1° al 30 novembre 2026. Contenuto del report mensile confrontato nei tre casi. |
| Registro Scadenze | XLSX e PDF | Otto scadenze derivate ai confini temporali, documento persistito, vista mista IT/EN e caso Unicode, descritti sopra. |
| Soli movimenti di cassa, interfaccia API | XLSX | `GET /api/v1/cash-movements` con `format=xlsx` resta disponibile tramite API. Sul campione storico due identità nella stessa sequenza, date, descrizioni e valori uguali alla risposta della lista. Nella pagina Contabilità il menu esporta il registro unificato delle transazioni. |

Le altre tabelle e sezioni consultate nell’inventario di route e menu comprendono Statistiche e classifiche, saldi negativi, compensi personali e dettaglio istruttore, calendario, tabelle di configurazione, pannelli e avvisi della Panoramica. Queste superfici non espongono un download autonomo della propria tabella. I conteggi della lista possono superare una pagina della UI e gli export hanno tetti applicativi di 10.000 righe XLSX e 5.000 PDF. Il confronto puntuale è sui campioni indicati. Restano fuori dalle misure una nuova prova di carico ai tetti, tutte le combinazioni ruolo/locale/filtro, dispositivi fisici e un catalogo completo dei glifi Unicode.

## Riproduzione ed errori osservati

Per la prova di accettazione di Contabilità, assegnare la stessa categoria a cinque righe identificabili e datarle dal 1° al 5 marzo. Applicare i quattro filtri elencati dalla pagina e scaricare ogni volta «Transazioni (Excel)». Leggere le celle del foglio anziché dedurre i risultati dall’URL. Il test di regressione permanente ripete la verifica sui dati di propria creazione. [Test del download](../../e2e/exports.spec.ts)

Per Scadenze, congelare la data sia nel processo Next sia in Chromium, con fuso del browser Europe/Rome. Creare voli a date tali da dare i giorni residui indicati, poi leggere la tabella e aprire entrambe le voci di Esporta con la stessa ricerca. Nel workbook leggere le celle in ordine e nel PDF estrarre il testo per righe e colonne. La matrice allegata conserva l’input dei filtri, l’istante e le tre rappresentazioni. Il test permanente copre il download XLSX dal registro. Il controllo PDF e la data congelata sono prove aggiuntive registrate in questa verifica. [Test del registro](../../e2e/expiries-registry.spec.ts)

| Comando o prova | Esito e risoluzione |
|---|---|
| `npm run db:reset:test`, poi `npm run build` per la prova con orologio congelato | Exit 0 su database sintetico locale dedicato. La suite completa ha un proprio database riseminato. |
| `npx playwright test -c /tmp/amexport/red.config.cjs e2e/exports.spec.ts -g 'Transazioni \(Excel\)'` | Base, exit 1. Nella differenza comparivano «Movimento 5» e «Movimento 1» oltre ai tre previsti. Stesso comando sul candidato, exit 0, 1 passato senza retry. |
| Ripetizione con il wrapper del progetto: `scripts/e2e.sh start -c CONFIG e2e/exports.spec.ts -g 'Transazioni \(Excel\)'` | Il mirato iniziale era in foreground. La replica con lo script del repository, output e configurazione separati per base e candidato, termina con `E2E_EXIT=1` sulla base (Movimento 5 e Movimento 1 in eccesso) e `E2E_EXIT=0` sul candidato, 1 passato in 11,1 s senza retry o skip. |
| `node /tmp/amexport/ledger.cjs` | Exit 0. Quattro selezioni dalla pagina, quattro download decodificati. |
| `node --require tsx/cjs /tmp/amexport/registry.cjs` e `node /tmp/amexport/mixed.cjs` | Exit 0 per entrambe le sonde. Il confronto distingue la riga fuori repertorio dalle 29 conformi. |
| `node /tmp/amexport-qa/final-q.cjs`, esecuzioni admin e pilota, `node /tmp/amexport-qa/unattributed.cjs`, `python /tmp/amexport-qa/verify-final.py` | Exit 0. Confronti delle altre famiglie sul build candidato e dei filtri ulteriori in Contabilità su un clone locale sintetico. Il solo endpoint API dei movimenti di cassa è stato decodificato sul build della base, con codice identico al candidato per quella rotta e il suo lettore. |
| Primo avvio della sonda generale `node /tmp/amexport-qa/surfaces.cjs` | Exit 1 su Compensi, «Timeout 30000ms exceeded while waiting for event download». La diagnosi con ascolto limitato alla sola pagina chiamante è scaduta a 12 s. Il collegamento apre un’altra scheda. Il click successivo ha consegnato HTTP 200 e l’XLSX. La sonda finale ascolta anche le nuove schede. Tutte le 91 righe sono state verificate. |
| Preparazione del clone con `python /tmp/amexport-qa/prepare.py` | Exit 1, «FileNotFoundError: createdb». `node /tmp/amexport-qa/clone.cjs` ha creato lo snapshot dal database sintetico locale con una connessione PostgreSQL, exit 0. |
| Avvio del wrapper dei gate `/tmp/amexport/run` | Prima invocazione, exit 1. Il sandbox ha negato la lettura di `/proc/<pid>/cwd` del vecchio listener. Identificati PID, nome del processo e orario di avvio nel log del server precedente, la procedura è proseguita. |
| `TMPDIR=/tmp/amexport/gates npm run gates` | Exit 0. Lint 47 s, typecheck 9 s, 2.351 test unitari in 16 s, build 62 s. |

Per lo sviluppo è stata selezionata la configurazione GPT 6.2 Astra xhigh. Il runtime non espone una misura indipendente del modello effettivo.

### Suite browser sul candidato

`E2E_REUSE_SERVER=1 TMPDIR=/tmp/amexport/full scripts/e2e.sh start --workers=2` ha eseguito 716 casi sulla build di produzione locale e su un database sintetico nuovo. In 31,5 minuti il reporter ha classificato **712 passed e 4 flaky**, con `E2E_EXIT=0`. Al primo giro sono passati 711 casi. Quattro hanno superato il primo retry. Il caso PDF Prenotazioni, sospeso al primo giro per il gruppo seriale, è passato alla ripresa in 4,3 s. Nel gruppo sono stati rieseguiti anche sette casi già verdi. Nessun fallimento o skip definitivo. Sono passati subito entrambi i test modificati e i tre METAR sintetici.

| Caso al retry | Primo tentativo | Esito del primo retry |
|---|---|---|
| `account-adjustments.spec.ts:94` | 30,1 s. «locator.click: Test timeout of 30000ms exceeded» sul link «Vedi tutte le persone» nel riquadro dei saldi negativi. | Passato, 11,0 s |
| `bookings.spec.ts:1851` | 31,8 s. «locator.count: Test timeout of 30000ms exceeded» nel caso di rifiuto della prenotazione. | Passato, 19,5 s |
| `mobile-logbook.spec.ts:1225` | 30,2 s. «apiRequestContext.post: Test timeout of 30000ms exceeded» nella preparazione del caso istruttore. | Passato, 7,4 s |
| `pdf-exports.spec.ts:306` | 30,1 s. «page.waitForEvent: Test timeout of 30000ms exceeded», attesa dell’evento «download» del Registro voli. | Passato, 3,7 s |

L’ultima prova è stata ripetuta anche in isolamento con `npx playwright test -c /tmp/amexport/red.config.cjs e2e/pdf-exports.spec.ts -g 'clicking "Voli \(PDF\)"'`, exit 0, 1/1 senza retry in 10,2 s. Nel confronto dei documenti il file del Registro voli è stato aperto e il contenuto verificato. I log identificano le attese scadute. La causa dei quattro timeout resta indeterminata.

Il controllo documentale `git diff --cached --check` ha restituito exit 2 sui byte di fine riga della tabella xref di un PDF di esempio («trailing whitespace»). La directory delle evidenze dichiara i PDF binari in `.gitattributes`. Le impronte dei due PDF corrispondono agli originali scaricati e il controllo ripetuto dà exit 0.

## Chiusura BMAD

La revisione indipendente, svolta in un contesto separato configurato con GPT 6 Sol xhigh, ha approvato il tree verificato. Il follow-up si chiude con la correzione di Contabilità e le due decisioni aperte su formato Scadenze e caratteri nel PDF. [Rapporto di revisione](evidence/parita-export/revisione.md)
