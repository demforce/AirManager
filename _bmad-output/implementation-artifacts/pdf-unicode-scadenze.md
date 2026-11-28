# Unicode negli export PDF e quattro colonne nel PDF Scadenze

Stato BMAD **done**. Base della story `865689eddd7baab79dca0c630ecba47a57b0248b`. Candidato applicativo `049666c90fbdcbfc3a5bf60cd07bef94372d333b` (Git tree).

## Criteri e percorso di prova

1. Riprodurre il nome corrotto nel PDF già archiviato e nel download dell’app. Stampare ed estrarre «Łukasz» e gli accenti nei punti in cui il PDF usa caratteri normali e grassetti, compresi titolo, intestazione, corpo, totali e piè di pagina.
2. Dal registro Scadenze esportare con gli stessi filtri della tabella e del foglio Excel, confrontando identità, ordine e valori. Il PDF italiano deve avere le quattro colonne Persona, Tipo, Scadenza e Stato. Verificare la larghezza disponibile, gli a capo, la ripetizione delle intestazioni e il passaggio di pagina.
3. Controllare le cinque route in build di produzione, la distribuzione dei font, le dimensioni e i tempi del renderer al tetto esistente. Usare dati sintetici e ispezionare pagine rasterizzate con Poppler, oltre al testo estratto. Eseguire gate e revisione indipendente prima della pubblicazione.

## Diagnosi e modifica

Le cinque route per Scadenze, Registro voli, Prenotazioni, Estratto conto e Report di cassa convergono su `toPdfExport` e `renderReportPdf`. Il PDFKit della base usava i font PDF standard Helvetica e Helvetica-Bold con codifica WinAnsi. Il vecchio [PDF del caso Łukasz](evidence/parita-export/nome-unicode.pdf) restituiva «Ex0e1e41U V¶7» in Poppler.

Il renderer usa ora Liberation Sans 2.1.5 nei due pesi. I due file TrueType originali vengono distribuiti con l’app e tracciati nelle cinque route di Next. PDFKit incorpora nel documento il sottoinsieme dei glifi usati e la mappa ToUnicode per estrazione, copia e ricerca. Non occorrono download o font installati sul server o sul dispositivo del lettore. Le prove coprono i nomi latini «Łukasz Żółć», «Élodie», «Ștefan» e «Őri», oltre agli accenti italiani, alle lineette e al simbolo euro. Esistono scritture e simboli fuori repertorio, ad esempio il carattere CJK «漢» e l’emoji 🛩. Non è previsto un secondo font di ripiego per questi casi.

Gli asset provengono dal pacchetto Debian `fonts-liberation 1:2.1.5-3`. Entrambe le facce dichiarano nel font il permesso di incorporamento e subsetting. La distribuzione comprende gli avvisi di copyright e la SIL Open Font License 1.1. SHA-256 originali e locali coincidono.

| File | SHA-256 |
| --- | --- |
| LiberationSans-Regular.ttf | `bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3` |
| LiberationSans-Bold.ttf | `1b5f2da6f4cadce4c05b9ecebe3a6fcd374eb95ae443605e799f4c3287978939` |

[Licenza inclusa nel progetto](../../src/server/adapters/pdf/fonts/OFL.txt) · [Licenza upstream del tag 2.1.5](https://github.com/liberationfonts/liberation-fonts/blob/2.1.5/LICENSE)

La tabella PDF Scadenze assegna 5/18 della larghezza utile rispettivamente a Persona e Tipo, 4/18 rispettivamente a Scadenza e Stato. Prima ciascuna delle cinque colonne occupava 1/5. La categoria della Currency, la data, il testo e il colore dello stato seguono gli stessi dati del registro. Nell’export tabellare disponibile per Scadenze, il formato è XLSX e «Ambito» resta la terza colonna. Questa pagina non espone un CSV.

## Prove del renderer

- `node_modules/.bin/vitest run src/server/adapters/pdf/document.test.ts src/server/services/exports.service.test.ts --reporter=dot` sulla base con le nuove aspettative ha restituito exit 1. I due rossi su 45 erano `Aeroclub 6Az` al posto di `Aeroclub Łódź` e l’intestazione PDF con la colonna aggiuntiva «Ambito». Le precedenti prove di paginazione sono passate anche con l’estrazione Poppler.
- Sul primo candidato, `node_modules/.bin/vitest run src/server/adapters/pdf/document.test.ts -t 'last wrapped' --reporter=dot` ha restituito exit 1. In una cella di 200 ripetizioni di «Łukasz» l’ultima parola terminava a y = 671,906 pt e la riga successiva iniziava a y = 660,296 pt. Il renderer riserva ora anche l’altezza effettivamente misurata dal font qualora il layout compatto sia insufficiente. Le celle ordinarie conservano lo spazio precedente.
- Sul candidato finale, lo stesso comando sui due file ha passato tutte le **46 prove**, exit 0. Sono compresi righe vuote, token lunghi, riga eccezionale a 11 colonne, intestazioni ripetute, passaggio dei totali, numero di pagina e test geometrico. Il test usa `pdftotext` di Poppler (`poppler-utils` su Debian/Ubuntu). Il job CI lo installa se manca.
- Il controllo `pdffonts` sul report di stress indica per entrambe le facce CID TrueType, Identity-H e `emb/sub/uni = yes/yes/yes`. Ispezione con `pdftoppm -png` e `pdftotext -bbox` su A4. Sul campione senza sottotitolo l’ultima parola termina a y = 646,407 pt e la riga successiva inizia a 653,202 pt.
- `git diff --cached --check` ha rilevato inizialmente una riga vuota finale nell’avviso di licenza (exit 2). Eliminata la riga vuota, il controllo è passato con exit 0.

### Prestazioni

Comando `node_modules/.bin/tsx scripts/perf/pdf-bench.ts <forma> <righe> 3`, exit 0 per ciascuna misura. Dati sintetici del benchmark 17.7, Node 24.22.3. La forma storica Scadenze del benchmark usa cinque colonne. Il collaudo attraverso l’app misura separatamente il PDF effettivo a quattro colonne.

| Versione | Forma | Righe | Mediana | Pagine | Byte | Picco RSS processo | Load medio 1 min |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Base | Voli | 5.000 | 1.566 ms | 218 | 667.224 | 600.526.848 B | 0,55 |
| Candidato | Voli | 2.000 | 1.221 ms | 88 | 299.548 | 489.488.384 B | 0,72 |
| Candidato | Scadenze | 2.000 | 730 ms | 56 | 150.132 | 313.585.664 B | 1,22 |
| Candidato | Voli | 5.000 | 1.955 ms | 218 | 719.321 | 696.475.648 B | 1,28 |

I tre rendering candidati al tetto pubblicato dei voli hanno mediana inferiore a tre secondi. Il picco RSS comprende il processo Node nel corso delle tre iterazioni. Gli ultimi due punti candidati sono stati raccolti durante i gate locali, con carico superiore a quello della misura di base. Il tetto rimane 5.000.

## Download reali nella build di produzione

Il banco isolato usa PostgreSQL sintetico e Chromium disconnesso dai dati del club. Dal registro Scadenze l'amministratore ha scelto categoria RATING e finestra di 30 giorni e ha usato il menu di esportazione. L’interfaccia e l’API elencavano 48 righe su tre pagine da 20, 20 e 8, con due righe di controllo escluse per categoria o data. Il confronto con gli stessi filtri usa i nominativi sintetici, i tipi e le date nell’ordine della lista, oltre ai valori del foglio XLSX decodificato. Sulla base, il PDF occupava tre pagine e il nome «Łukasz» presente nell’Excel non era estraibile.

| PDF Scadenze | Pagine | Righe per pagina | Celle uguali all’Excel in ordine | Celle su più righe | Distanza minima testo/bordo |
| --- | ---: | --- | ---: | ---: | ---: |
| Italiano | 2 | 24 + 24 | 192/192 | 25 | 3,95 pt |
| Inglese | 2 | 24 + 24 | 192/192 | 25 | 3,95 pt |

Il confronto testuale ignora solo gli spazi e gli a capo dovuti all’impaginazione. I rettangoli delle parole estratti con Poppler restano dentro le rispettive celle, larghe 145,4 / 145,4 / 116,3 / 116,3 pt. Le due pagine italiane sono state anche rasterizzate e ispezionate. Si leggono i nomi accentati, le quattro intestazioni su entrambe le pagine e i piè di pagina. Entrambi gli XLSX riportano la quinta informazione nella terza colonna («Ambito»/«Scope», valore «Tutti»/«Everyone»).

Con filtro Currency, persona «Dąbrowski» e finestra «Tutte», l’interfaccia mostra una riga con «1 volo». Il PDF e l’XLSX contengono una riga nella versione compatta con gli medesimi valori per nominativo, categoria, data e stato. L’XLSX riporta «—» in Ambito. La prova sul menu dell’app (`scripts/e2e.sh start --config=/tmp/am-pdf28/currency.cjs`) si è conclusa con `E2E_EXIT=0`.

Dai rispettivi menu sono stati scaricati anche Registro voli (Łódź ed Évora), Prenotazioni ed Estratto conto (Łukasz), Report di cassa (Quote Łódź). Il nome del club sintetico includeva Łódź in grassetto. I cinque manifest di tracciamento della build includono entrambi i font e la loro licenza.

**Esempio scaricabile** · [Scadenze-Unicode-AirManager.pdf](evidence/pdf-unicode/Scadenze-Unicode-AirManager.pdf), 26.686 byte, A4, due pagine. SHA-256 `2db593884f9a6fe156c02a0229e4eadaf1e46a4a332bc17bc59bb8b36b6db37f`.

### Esecuzione

- `npm run gates` ha concluso con exit 0: lint, typecheck, 2.415 unitari e build di produzione.
- I download e le asserzioni sul banco hanno usato Chromium mediante `scripts/e2e.sh start` con configurazione di prova locale. La prima preparazione dati (`node fixtures.cjs`) si era fermata con exit 1 e PostgreSQL `23502` perché nell’INSERT sintetico mancava `AppSetting.id`. Dopo rollback e correzione della fixture, exit 0.
- Per l’analisi delle pagine sono stati usati `pdffonts`, `pdftotext -bbox` e `pdftoppm -r 115 -png`. Il primo `python inspect.py` aveva restituito exit 1 con `AttributeError`: il nome del file di prova nascondeva il modulo Python `inspect`. Con `python verify_geometry.py` il controllo è passato, exit 0.
- La suite Chromium locale con trial acceso ha passato 14/14 casi senza retry o skip (4 minuti).
- La suite Chromium ordinaria completa (`scripts/e2e.sh start`) ha registrato 731 casi, 725 passati al primo tentativo e 6 skip attesi con trial spento, in 30,0 minuti (`E2E_EXIT=0`). Sono passati tutti i 9 casi di `pdf-exports`. I sei skip corrispondono a due casi di cambio indirizzo, due di riattivazione, invito/login e scadenza/retry, tutti provati nella suite con trial acceso.
- Revisione indipendente in contesto separato sul tree applicativo `049666c90fbdcbfc3a5bf60cd07bef94372d333b` approvata, con la condizione di completare i gate. Il gate integrato e le due esecuzioni Chromium hanno concluso con exit 0.

Il collaudo visivo copre i raster Poppler delle pagine A4 italiane e il controllo geometrico dei report Scadenze nelle due lingue. Stampanti fisiche e lettori PDF specifici dei dispositivi del club restano fuori dal campione.
