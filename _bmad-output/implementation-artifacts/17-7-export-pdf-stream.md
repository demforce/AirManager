---
baseline_commit: e951960
---

# Story 17.7: Export PDF a stream

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Opus 5 xhigh** (Q-17.7-b = B ratificata: messaggio leggibile su 3 pagine). Review: Opus 5 xhigh adversarial. **Ordine**: dopo il commit della 16.5 (stessi file `exports.service.ts`, `exports.service.test.ts`, `registry.ts`) e della 16.6a (rinomina le intestazioni del Report di cassa): gli screenshot prima/dopo vanno presi sulla **stessa** base.

## Story

As an **admin che esporta un report**,
I want un PDF in pochi secondi anche con migliaia di righe,
so that il motore non costi 16-70 ms per riga (perf F5) e i report principali non rispondano 422 al primo volume vero.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.7»; `_bmad-output/planning-artifacts/audit-2026-09-10/perf-load-report.md` F5; TD-19.7b-a spostato qui (`19-7b-registro-scadenze-unificato.md:460,556`); audit 2026-11-02 (untracked) engineering I2 (JSON grezzo oltre il tetto) e S-3 (export prenotazioni aperto a ogni ruolo).

## Stato su HEAD (misurato il 2026-11-03)

- **Motore**: `src/server/adapters/pdf/document.tsx` con `@react-pdf/renderer` (`package.json:29` `^4.5.1`, installata 4.5.1, fork `@react-pdf/pdfkit` 5.1.1). Contratto `PdfColumn<T>` `:26-31` (`header`, `value`, `color?`, `width?` peso flex), `PdfTotal` `:34-37`, `PdfReportDocumentProps` `:39-51`. Layout: palette `COLOR` `:54-59`, stili `:61-76` (A4, padding 36/48/36, corpo 9 pt, nome campo 11 bold, titolo 16 bold, sottotitolo 10 grigio), intestazione con fondo `#F7F6F3`, righe separate da 1 pt `#EAEAEA`, **una riga non si spezza mai fra due pagine** (`wrap={false}` `:113`), zero righe → «—» `:109-111`, totali in flex-wrap `:127-135`, footer `fixed` «Pag. k di N» su ogni pagina `:137-141`; nome campo/titolo/sottotitolo solo a pagina 1; **l'intestazione colonne NON si ripete** (limite MVP dichiarato `:84-88`). Nessun `Font.register`: Helvetica/Helvetica-Bold standard (WinAnsi; per questo `→` è già `->`, `exports.service.ts:646`). `renderPdfBuffer` `:157-159` (`renderToBuffer`, in memoria) e `renderReportPdf` `:168-170`, unico entry point del servizio (`exports.service.ts:4`, `toPdfExport` `:122-149`). Risposta `response.ts:11-19`: Buffer → `NextResponse`.
- **Report: 5, non 6** (il PPR è uscito in `08eb558`, 19.1). Righe sul DB di carico (vista predefinita, `BEGIN READ ONLY`):

  | Report | Route | Funzione | Tetto | Righe |
  |---|---|---|---|---|
  | Estratto conto | `people/[id]/account/pdf` | `exportAccountStatementPdf` `:536` | sì `:538` | max 43 per conto (mediana 24) → OK |
  | Report di cassa | `cash-report/pdf` | `exportCashReportPdf` `:581` | no (limitato dalle categorie) | 7 categorie |
  | Registro voli | `flights/pdf` | `exportFlightsPdf` `:610` (11 colonne pesate `:620-677`) | sì | **60 018** senza periodo predefinito (`logbook/page.tsx:85-86,184`) → 422 in PDF e xlsx |
  | Scadenze | `expiries/pdf` | `exportExpiriesPdf` `:704` (colore di stato `:702`) | sì | finestra 60 g: **7 140** → 422 PDF, xlsx passa; «Tutte» 14 273 → 422 in entrambi |
  | Prenotazioni | `bookings/pdf` (`self.read`, ogni ruolo) | `exportBookingsPdf` `:737` | sì | predefinita: **12 017** → 422 in PDF **e** xlsx |

  Filtri da ~2 000 righe: voli ultimi 41 giorni = **1 945** (40 g = 1 885, 45 g = 2 288); scadenze documento entro oggi+7 = 2 736 + currency.
- **Tetti**: `src/lib/export-caps.ts:14` `PDF_EXPORT_MAX_ROWS = 2_000`, `:11` `EXPORT_MAX_ROWS = 10_000`; `assertWithinCap` `exports.service.ts:72-76` → `ValidationError('EXPORT_TOO_LARGE')` → 422 (`api/handler.ts:33`). Pre-avviso UI solo sull'estratto conto (19.11 AD-8: `people/[id]/page.tsx:431`, `my-account/page.tsx:171`, `Export.pdfTooLarge` `it.json:1473` «… o scarica l'Excel»); le altre voci PDF sono `<a target=_blank>` (`export-menu.tsx:7-10`): oltre il tetto si apre una scheda con un JSON grezzo.
- **Numeri di partenza**: audit F5 voli 124 righe 13,7 s, prenotazioni 11,5 s, scadenze 559 righe 40 s; 19.11 (TD-19.11-a) 100 righe 1,4 s, 510 → 7,6 s, **1 632 → 48,6 s** (cresce più che linearmente: 14,4 → 29,8 ms/riga, 45,9 sotto carico).
- **Nessun rasterizzatore** sulla macchina (`pdftoppm`, `mutool`, `gs` assenti; Chromium headless non mostra i PDF) → la parità visiva si fa con `pdfjs-dist` installato **fuori dal repo** + Chromium di Playwright.
- Harness `scripts/perf/`: target PDF già in `targets.json` (con note che dichiarano il 422); 6 placeholder (`README.md:100-115`), manca «oggi meno N giorni».

## Acceptance Criteria

1. **Motore**: *Given* `adapters/pdf/document.ts` *When* un export chiama `renderReportPdf(props)` *Then* il PDF è generato da **pdfkit 0.20.2**; `PdfColumn`, `PdfTotal`, `PdfReportDocumentProps` e la firma `Promise<Buffer>` invariati; `grep -rn "@react-pdf" src package.json` = 0; `exports.service.ts` invariato (salvo il tetto); i test PDF di `exports.service.test.ts` (mock di `renderReportPdf` a `:31`) passano senza modifiche.
2. **Parità di layout**: *Given* i 5 report resi con gli stessi dati (base react-pdf vs story, stesso DB gemello congelato, stessi filtri) *When* rasterizzo pagina 1 di ciascuno e pagina 2 di voli e scadenze *Then* il record mostra gli screenshot affiancati con A4, margini, corpi, palette `COLOR`, pesi delle colonne dei voli, colori di stato, totali e footer identici; ogni differenza (interlinea, altezza riga, intestazione ripetuta se Q-17.7-c = B, token lunghi spezzati invece di sforare) è elencata con la sua misura. Parità del testo per pagina (stesse celle, stesso ordine; footer diverso solo nell'ora).
3. **Struttura (unit discriminante)**: *Given* 120 righe sintetiche *When* le rendo e decodifico il testo (inflate con `node:zlib` + hex WinAnsi, nessuna dipendenza nuova) *Then* ogni pagina k riporta «Pag. k di N» con N = numero di `/Type /Page`; nessuna riga è divisa fra due pagine; zero righe → «—»; un token lungo resta nella sua colonna; (Q-17.7-c = B) intestazioni su ogni pagina. Ogni asserzione provata ROSSA su un mutante (footer senza totale, riga spezzabile, intestazione una volta sola), **solo su copia isolata** con sha256.
4. **Prestazioni del motore**: *Given* 2 000 righe sintetiche in forma voli (11 colonne pesate) e scadenze (5 colonne, colore) *When* misuro la mediana di 3 render a macchina scarica (load average < 1) *Then* ≤ 1,5 s per forma; il «prima» con react-pdf riportato (atteso ≥ 40 s, lanciato una volta sola). Script tsx (scratchpad, o `scripts/perf/pdf-bench.ts` se permanente) con N ∈ {100, 500, 2 000, 5 000, 10 000}: ms, ms/riga, byte, pagine, picco RSS.
5. **Prestazioni dell'endpoint**: *Given* build di produzione su `airmanager_load` *When* chiamo `GET /api/v1/flights/pdf?dateFrom=<oggi−41>&dateTo=<oggi>` (≈ 1 945 righe, conteggio psql nel record al momento del bench) 5 volte dopo un warm-up *Then* 200 con p50 < 3 s (prima/dopo con `bench.mjs`); idem scadenze `?window=7` ed estratto conto `{PERSON}`.
6. **Tetto**: §PO Q-17.7-a. Se cambia: `export-caps.ts:14` con la misura nel doc-comment, `registry.ts:649` e `:963` (il `2000` scritto a mano), `account-statement-period.spec.ts:539-569` (semina tetto+1 movimenti, verifica «1 / 101» e il testo «più di 2000 movimenti»); gli unit simbolici `exports.service.test.ts:574-580` restano.
7. **Build**: *Given* `env -u NODE_ENV npm run build && npm run start` *When* `pdf-exports.spec.ts` gira via `scripts/e2e.sh` *Then* i 5 PDF rispondono 200 con `%PDF-` (prova del bundling).
8. **Dipendenze**: via `@react-pdf/renderer` (libera ~15 pacchetti `@react-pdf`/yoga); entrano `pdfkit` 0.20.2 (MIT; dipendenze `fflate` 0.8.3, `png-js` 2.0.0 MIT nel tarball, `fontkit` ^2.0.4 già nell'albero, `linebreak` 2.0.0, `@noble/hashes` 1.8.0, `@noble/ciphers` 1.3.0) e `@types/pdfkit` 0.17.7 (dev; indietro rispetto all'API 0.20 → import default). Lockfile rigenerato con `npx npm@10`. Licenze nel record. Aggiornare la tabella versioni di `ARCHITECTURE-SPINE.md:127` («@react-pdf/renderer 4.5.x»).
9. **Oltre il tetto in UI**: §PO Q-17.7-b.
10. **Gate**: `npm run gates` verde; e2e via `scripts/e2e.sh` (baseline al momento del dev).

## Tasks / Subtasks

- [ ] Misura «prima» del motore (AC 4) allo sha di base, una volta sola; conteggi al momento del bench (AC 5).
- [ ] Riscrittura `document.tsx` → `document.ts` su pdfkit (AC 1), altezza di riga calcolata prima di disegnare (massimo di `heightOfString`), totali che possono andare a pagina nuova, `bufferPages: true` per «Pag. k di N», una cessione dell'event loop per pagina (`await new Promise(setImmediate)`).
- [ ] `next.config.ts`: `serverExternalPackages: ['pdfkit']`.
- [ ] Sostituire `document.test.ts:69-75` (dipende da react-pdf) con gli unit dell'AC 3; mutanti su copia isolata.
- [ ] Parità visiva e del testo (AC 2); misura «dopo» (AC 4, 5); tetto (AC 6); UI oltre il tetto se Q-17.7-b = B (AC 9).
- [ ] Dipendenze e lockfile (AC 8); target ~2 000 righe in `scripts/perf/targets.json` (+ placeholder «oggi meno N giorni» con la sua riga in `README.md:100-115` se serve); Dev Agent Record.

## Dev Notes

**Decisioni tecniche della sessione principale**: pdfkit 0.20.2 usato direttamente (pdfmake 0.3.13 come ripiego: dipende da pdfkit ^0.20.2, 12 MB); contratto e firma invariati; **Buffer, non streaming HTTP** («a stream» descrive il motore: con il corpo in streaming un errore a metà render diventerebbe un 200 troncato, perché `apiRoute` converte gli errori solo prima di restituire la `Response`; e «Pag. k di N» richiede comunque `bufferPages`); `pdfResponse` com'è; **Helvetica standard** (metriche interne `#standard-fonts/*`, nessun asset, nessun fetch a build-time; i woff2 `@fontsource` sono divisi per sottoinsieme unicode e pdfkit non ha fallback di glifi — e cambierebbero l'aspetto). pdfkit ha `doc.table()` da 0.17, ma la tabella si può fare a mano: scelta del dev, motivata. Fuori perimetro: tetto di concorrenza o 429 sugli export (S-3).

**Trappole**: (1) pdfkit scrive i caratteri fuori da WinAnsi come codice grezzo (`encodeText`): stessa classe di oggi, nomi con ł/ș/ő stampati male prima e dopo — dichiararlo. (2) **Bundling Next 16.2.10**: `@react-pdf/renderer` è nella lista interna `server-external-packages.jsonc:17`, pdfkit no; usa import `#…` e `require('u'+'rl')` → senza `serverExternalPackages` «Cannot find module» solo in produzione (lo prova l'AC 7, non gli unit). (3) pdfkit è sincrono: senza cessioni 10 000 righe bloccano il processo (l'export prenotazioni è aperto a ogni ruolo). (4) Env eager: l'adapter non importa `@/lib/env` e deve restare così; il mock di `exports.service.test.ts:31` vale per percorso + nome → tenerli identici; verifica `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/adapters/pdf src/server/services/exports.service.test.ts`. (5) i18n: `{max, number}` in italiano raggruppa le migliaia solo da 5 cifre (2000/5000 senza punto, 10000 → «10.000»; `account-statement-period.spec.ts:563` fissa il testo); `Export.pdfTooLarge` parla di «movimenti» → per voli/prenotazioni/scadenze serve una chiave nuova (glossario + `BANNED` `messages.test.ts:217-242`); `PdfExport.page` «Pag. {page} di {total}». (6) pdfkit spezza per carattere i token più larghi della colonna (react-pdf sforava, 11.3): differenza da dichiarare. (7) Le date del DB di carico sono relative al seed: ricontare i filtri al bench; scartare le misure con load average alto (lezione 19.7b). (8) Commenti già stantii, da non toccare se non si toccano le righe: `exports.service.ts:511` («Only 4 reports»), `export-href.ts:22` («4 covered»).

**Blast radius**: `src/server/adapters/pdf/document.tsx` → `document.ts` (spariscono `PdfReportDocument` e `renderPdfBuffer`, l'unico chiamante diretto è il test); `document.test.ts`; `package.json` + `package-lock.json`; `next.config.ts`; `src/lib/export-caps.ts` (commento `:5-6` che cita `@react-pdf` + valore); `registry.ts:649,963` se cambia il tetto (file toccato anche dalla 16.5: pathspec); `scripts/perf/targets.json`; `ARCHITECTURE-SPINE.md:127`; `account-statement-period.spec.ts:539-569` se cambia il tetto. Con Q-17.7-b = B: `logbook/page.tsx`, `bookings/page.tsx` + `bookings-table.tsx`, `expiries/page.tsx`, `messages/{it,en}.json`, un e2e — il totale va calcolato sullo **stesso** filtro dell'export (per le Scadenze `exportFilterQuery` azzera `scope`/`status`, `expiries/page.tsx:121`: il totale della lista non basta). Consumatori: i 5 export, le 5 route `src/app/api/v1/**/pdf/route.ts` (invariate), i link di `export-href.ts:29` da `logbook/page.tsx:184`, `bookings/page.tsx:380`, `dashboard/page.tsx:691`, `expiries/page.tsx:123`, `billing/page.tsx:118` e dall'estratto conto. Test che fissano il comportamento: `exports.service.test.ts` (mock `:31,42,77,91-93`, tetto `:574-580,620-625,705,791-799`); e2e `pdf-exports.spec.ts:145-202` (5 route, content-type, nome file, `%PDF-`), `:205-235`, `:247-303`, `:306-352`; `account-statement-period.spec.ts:233,399,415,460,539-569`; `cash-report.spec.ts:71-83`, `flights.spec.ts:1628`, `mobile-billing.spec.ts:854`, `mobile-self-public.spec.ts:418` (solo href e status).

**Dimensione**: Q-17.7-b = A ≈ 9-11 file, ~250 righe + lockfile (≈ 1/5 della 19.7a); Q-17.7-b = B ≈ 16-19 file (≈ 1/3). Nessuno split.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.7; `perf-load-report.md` F5; `19-7b-registro-scadenze-unificato.md:460,556`; `19-11-estratto-conto-periodo-progressivo.md` (AD-8, TD-19.11-a); `scripts/perf/README.md`

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Q-17.7-a — tetto del PDF** = B: il numero tondo più alto che il report più largo (voli) produce sotto i 3 s nella misura dell'AC 4, mai sopra 10 000; regola dichiarata nel doc-comment di `export-caps.ts`.
- **Q-17.7-b — oltre il tetto su Registro voli, Prenotazioni e Scadenze** = B: messaggio leggibile al posto della voce PDF (e della voce Excel oltre 10 000), come l'estratto conto (es. «PDF non disponibile: più di {max} righe con questi filtri. Restringi i filtri o scarica l'Excel»), totale calcolato sullo stesso filtro dell'export → la story diventa UI: **dev Opus 5 xhigh**.
- **Q-17.7-c — intestazione delle colonne** = B: ripetuta su ogni pagina.
- **Q-17.7-d — tetto Excel (TD-19.7b-a)** = A: resta 10 000; il TD si chiude come accettato e dichiarato.


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
