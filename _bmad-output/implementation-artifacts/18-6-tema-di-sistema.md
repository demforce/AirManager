---
baseline_commit: 1f6ab3e
---

# Story 18.6: Il tema di sistema

Status: **done** — AC 1–9 approvati il 2026-11-26 sul commit `475b3f1`. Chiuso il TD sullo schema dei colori dei controlli nativi della 15.10.

Piano originario del 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e`). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. Indipendente dall'Epic 17. Chiude anche il TD «color-scheme» della 15.10 (`sprint-status.yaml` action_items).

## Story

As an **utente con il telefono in scuro**,
I want che l'app apra scura,
so that senza cookie il tema segua `prefers-color-scheme` e i controlli nativi rispettino `color-scheme` (ui M12); il toggle continua a vincere.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.6»; `ui-review.md` M12.

## Stato su HEAD

- Il tema viene **solo dal cookie `am-theme`**: letto in `[locale]/layout.tsx:18` e `:74` (`dark` → scuro, **altrimenti chiaro**), sempre stampato su `<html data-theme>` (`:77`); riletto in `dashboard/layout.tsx:31` e `:85` per `initialTheme` dei **due** `ThemeToggle` (`top-bar.tsx:107`, `mobile-top-bar.tsx:90`), entrambi sempre nel DOM; il toggle (`theme-toggle.tsx:18-35`) ha stato locale e scrive `dataset.theme` + cookie per 1 anno. Difetto latente: i due toggle non si allineano (dopo un clic l'icona dell'altro è sbagliata).
- CSS: token in `html[data-theme="light"]` (`airops.css:15-39`) e `html[data-theme="dark"]` (`:41-64`) più **23 override di componente** sotto `html[data-theme="dark"]` (`:450-453`, `626`, `720-723`, `740-742`, `792-794`, `916-917`, `1218`, `1329-1330`, `1632`, `3631`); `:root` (`:2-13`) solo font e raggi; `prefers-color-scheme` e `color-scheme`: 0 occorrenze.
- CSP `script-src 'self' 'unsafe-inline'` (`next.config.ts`): uno script inline nel `<head>` è permesso.
- Baseline 11-02: sistema scuro e niente cookie → `data-theme=light`, `color-scheme: normal`.

## Acceptance Criteria

1. *Given* nessun cookie e sistema scuro *When* apro `/it/login` e `/it/dashboard` a 375 e 1280 *Then* lo sfondo è scuro **già al primo paint**, anche con i chunk JS bloccati (`page.route('**/_next/static/**', abort)`). Rosso su HEAD.
2. Nessun cookie e sistema chiaro → chiaro, invariato (`login.spec.ts:113` resta valido).
3. Cookie `light` con sistema scuro → chiaro; cookie `dark` con sistema chiaro → scuro (il toggle vince).
4. Sistema scuro senza cookie *When* premo «Cambia tema» *Then* chiaro + cookie `light`; icona corretta prima e dopo in **entrambe** le barre.
5. `getComputedStyle(html).colorScheme` = `dark` in scuro e `light` in chiaro. Rosso su HEAD (`normal`).
6. Nessun avviso di idratazione in console; un `router.refresh()` dopo un'azione non riporta il tema al chiaro.
7. Parità degli override: 4 campioni (toast-dot, badge.ok, fld-error, btn.accent) hanno lo stesso stile calcolato con «cookie scuro» e con «sistema scuro»; `mobile-ink-targets` (due temi) e `login.spec.ts:124-160` verdi.
8. Scelta «Automatico» e cambio del tema di sistema con l'app aperta: §PO Q-18.6-a/b.
9. `npm run gates` + e2e via `scripts/e2e.sh` verdi; nuovo `e2e/theme-system.spec.ts` nel project `chromium` (non scrive settings, nessuna catena).

## Dev Notes

**Decisioni tecniche della sessione principale**: script inline **sincrono** nel `<head>` del layout radice che, solo senza cookie, imposta `data-theme` da `matchMedia`; il server stampa l'attributo solo se c'è il cookie (`suppressHydrationWarning` solo su `<html>`); fallback CSS chiaro quando manca l'attributo (es. `html:not([data-theme="dark"])` sul blocco chiaro: stessa specificità, misurare la cascata — lezione 15.9); `color-scheme` per ciascun tema; entrambe le icone nel DOM scelte dal CSS (niente mismatch di idratazione, i due toggle restano allineati); il toggle calcola il prossimo tema da `dataset.theme`; i 23 override restano dove sono (fonte unica; una media query CSS pura richiederebbe di duplicare 24 blocchi). Nel commento dello script: se un giorno sparisce `'unsafe-inline'` servirà un hash o un nonce.

**Blast radius**: `[locale]/layout.tsx`, `dashboard/layout.tsx` (cookie a tre stati), `theme-toggle.tsx`, `top-bar.tsx`, `mobile-top-bar.tsx`, `airops.css`; e2e `login.spec.ts:103-122` (riscrivere il commento «default è chiaro") + spec nuovo. Il nome del cookie compare in 3 file.

**Misure** a 375 e 1280 × {sistema chiaro, scuro} × {nessun cookie, cookie chiaro, cookie scuro} su login, Panoramica, «Nuova voce» del Registro voli (orari nativi), Impostazioni (select): screenshot, `colorScheme`, `--bg`, primo paint con JS bloccato. **Mutanti** (solo su copia isolata): via lo script → AC 1 rosso; decisione in un `useEffect` → AC 1 con JS bloccato rosso; script che ignora il cookie → AC 3 rosso; via `color-scheme` → AC 5 rosso.

**Trappole**: qualunque decisione presa dopo l'idratazione lampeggia (FOUC); senza JS e senza attributo nessun token è definito → serve il fallback chiaro; `color-scheme: dark` cambia i controlli nativi (select, scrollbar, autofill, checkbox senza `accent-color`): misurare i form; Playwright emula `light` per default (gli spec che non impostano il cookie restano chiari); il glossario non ha voci sul tema: se nasce «Automatico» va aggiunto.

**Dimensione**: ~7-9 file, +250-400/−30 (≈ 0,15 della 19.7a). Nessuno split.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.6-a** = A: l'interruttore resta a due stati; dopo una scelta manuale vale su quel browser finché non la si cambia (niente «Automatico»).
- **Q-18.6-b** = A: se il sistema passa da chiaro a scuro con l'app aperta, l'app cambia subito (listener `matchMedia` attivo solo senza cookie).


## Dev Agent Record

### Sviluppo e prove del 2026-11-26

Il ramo locale `story/18-6` parte da `d13da84b3498eded221b2f0b8fece7f1f4c5e3e9`. Per l'unico agente di sviluppo il task Cloud ha richiesto `gpt-6.2-astra` con effort `xhigh`. Il comando di selezione è esplicito. Il processo di sviluppo non espone una seconda attestazione del modello effettivamente servito.

La pagina rende sul server soltanto un cookie `am-theme=light|dark` valido. Alla prima visita uno script fisso e sincrono nel `head` applica il tema di sistema prima del corpo. Senza script e senza preferenza il CSS ha un tema chiaro completo. Il click usa il tema corrente del documento, salva la scelta per un anno e interrompe l'ascolto del sistema. Entrambe le barre usano la stessa coppia di icone e lo stesso selettore CSS. Nessuna modifica a CSP, settings, schema o ruoli.

Il primo candidato applicativo e di test è il tree `54c9e927c9306a9187172cf9dd6181fab45712fb`. I sei test di `e2e/theme-system.spec.ts` entrano nel progetto ordinario `chromium`. La sola scrittura applicativa della nuova verifica è un velivolo sintetico con marche uniche nel database disposable.

| Criterio | Riscontro |
|---|---|
| 1, 2 | Primo accesso a login e Panoramica autenticata, a 375 e 1.280 px. In Chromium lo sfondo di sistema scuro rende sRGB (11,16,21), il chiaro (249,250,252). Le misure con JavaScript applicativo bloccato e quelle con interfaccia attiva coprono anche Registro voli e Impostazioni. |
| 3 | La risposta HTML iniziale contiene la preferenza valida e omette l'attributo in assenza della scelta. La matrice copre anche chiaro su scuro e scuro su chiaro. Un cookie preesistente non riconosciuto segue il sistema. Con JavaScript interamente disattivato e nessun cookie lo sfondo è chiaro e lo schema dei controlli è `light`. |
| 4, 8 | Dalla Panoramica il passaggio del sistema da scuro a chiaro e di nuovo a scuro avviene senza salvare cookie. Il toggle desktop sceglie chiaro. Dopo il passaggio alla larghezza mobile, il secondo toggle sceglie scuro. Sono stati verificati i due SVG di **entrambe** le barre prima e dopo i click, l'evento di cambio sistema dopo la scelta, il cookie e la ricarica completa. Il comando resta a due stati, come ratificato dal PO. |
| 5 | `color-scheme` sul documento, sull'input email, sul campo di decollo `input[type=time]` del pannello «Registra volo» e sulla select SMTP di Impostazioni corrisponde al tema effettivo. Il test legge la select senza cambiare alcuna impostazione. |
| 6 | Navigazione dalla sidebar in Velivoli con tema automatico scuro. La ricerca con le nuove marche è vuota prima della creazione. Dopo l'invio nel pannello appaiono toast e scheda con le marche cercate. Questa griglia riceve gli elementi dal server dopo `router.refresh()`. Il documento resta scuro, il cookie resta assente, il ritorno a Panoramica usa il link della sidebar. Console e `pageerror` controllati nelle prove con idratazione. |
| 7 | Quattro nodi di prova montati sul foglio AirOps reale. Con entrambi i modi di entrare nel tema scuro, i colori sRGB sono (37,134,81) per lo sfondo `.toast-dot`, (161,236,187) per `.badge.ok`, (253,115,109) per `.fld-error`, (71,26,0) per `.btn.accent`. Quest'ultimo è un selettore presente nel CSS senza consumatori correnti nel JSX. La prova dei quattro campioni è una verifica della cascata su un fixture DOM. |
| 9 | Gate e regressioni del candidato sono riportati sotto. |

#### Primo paint e schermate

Il mirato sul candidato ha acquisito 48 campioni a 375 e 1.280 px. Le combinazioni comprendono i due temi emulati del sistema, nessun cookie o una delle due preferenze manuali, e quattro pagine. La route Playwright interrompe le richieste `script` sotto `/_next/static/` lasciando passare fogli di stile e font. Un observer installato a inizio documento legge il primo corpo con token AirOps risolto, registrando orario, tema, schema e colore di sfondo. Il test verifica che l'istante di questo campione preceda o coincida con il timestamp della voce Chromium `first-paint`. In questo run i campioni precedono il paint di **12,7–91,2 ms**, mediana 23,9 ms. Sono stati bloccati da 12 a 16 chunk per caricamento. Gli screenshot con script bloccati mostrano il documento già dipinto. Sulla Panoramica si vedono la shell autenticata e lo scheletro scuro del contenuto in streaming. La matrice interattiva verifica anche la Panoramica caricata. La misura temporale proviene dall'observer e dall'API Paint Timing.

| Primo accesso scuro, senza cookie | Campione del corpo (ms) | Primo paint (ms) | Chunk bloccati |
|---|---:|---:|---:|
| Login, 375 px | 123,3 | 136 | 12 |
| Panoramica, 375 px | 126,7 | 144 | 16 |
| Login, 1.280 px | 71,0 | 84 | 12 |
| Panoramica, 1.280 px | 188,1 | 212 | 16 |

Una seconda matrice di 48 schermate con idratazione attiva apre l'editor del Registro e porta a vista i controlli nativi. Il primo paint misurabile con i chunk bloccati è quello della pagina Registro. L'apertura del pannello richiede JavaScript e viene provata nella matrice interattiva. Le misure riguardano Chromium desktop con emulazione del sistema operativo, senza una misura su un dispositivo fisico o su WebKit.

[Misure, colori e corrispondenza con gli screenshot](evidence/18-6/matrix.csv). Il CSV associa ogni caso al PNG acquisito. Le 52 acquisizioni (48 interattive, 4 con chunk bloccati) producono 21 file diversi per SHA-256. Le celle con PNG identici puntano allo stesso file. [Registro voli scuro a 375 px](evidence/18-6/375-dark-system-logbook.png) · [Select chiara a 375 px](evidence/18-6/375-light-system-settings.png).

#### Comandi e diagnostica

Tutti i run usano PostgreSQL `airmanager_e2e` su loopback e porta dedicata 55484, credenziali di seed sintetiche e SMTP Mailpit su localhost. Il server di test intercetta la fonte METAR e restituisce una fixture locale LIML.

| Comando o fase | Exit | Esito o diagnostica sanitizzata |
|---|---:|---|
| `npm run db:reset:test` prima della base e del candidato | 0 | `Test database airmanager_e2e reset and seeded.` |
| `scripts/e2e.sh start e2e/theme-system.spec.ts --project=chromium --workers=1 --retries=0` sulla base | 1 | Prima visita, sistema scuro e chunk bloccati. Ricevuti `theme=light`, `scheme=normal`, sfondo `lab(98.2578 -0.333846 -1.07464)`. |
| Primo mirato sul candidato, stesso comando con `--workers=2` | 1 | 4 passati, 2 falliti. `getByTestId('logbook-new-button') … element is not visible`, timeout 120 s a 375 px sulla lista vuota. `await (await refreshed).finished()`, timeout 30 s dopo la creazione del velivolo. |
| Diagnosi mobile `node /tmp/am186/debug.cjs` | 1 | `locator.click: Timeout 6000ms exceeded`, pulsante desktop presente nel DOM con `boundingBox=null`. La prova ora usa «Registra volo» visibile. Per il refresh verifica la nuova scheda nella griglia filtrata proveniente dal server. |
| Mirato finale `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/theme-system.spec.ts --project=chromium --workers=2 --retries=0` | 0 | `6 passed (54.9s)`, `E2E_EXIT=0`, nessun retry o skip. |

**Controprove isolate.** Copia dei sorgenti e build di produzione privata su porta 3196. Lo script di verifica in Chromium usa soltanto la pagina login pubblica in loopback. La copia offre varianti limitate alla presentazione del tema. Il tentativo iniziale di riusare i moduli con hard link ha restituito `Invalid cross-device link` e ha lasciato le dipendenze incomplete (`npm run build`, exit 127, `sh: 1: next: not found`). La copia completa delle dipendenze ha permesso la build standard, exit 0. Nessuna variante è entrata nel candidato.

| `node /tmp/am186/verify-mutant.cjs <variante> <prova>` | Exit | Risultato |
|---|---:|---|
| `none paint` | 1 | Tolto lo script. Con i 12 chunk bloccati, `'absent' !== 'dark'`, sfondo chiaro. |
| `late paint` / `late hydrated` | 1 / 0 | Spostata la decisione in un vero `useEffect`. Con i chunk bloccati, `'absent' !== 'dark'`. Consentendo l'idratazione, la pagina passa a scuro. |
| `ignore-cookie precedence` | 1 | Rimossa nella copia la guardia sul cookie SSR. Con cookie chiaro e sistema scuro, `'dark' !== 'light'`. |
| `no-scheme scheme` | 1 | Riportato il solo schema nativo al valore iniziale `normal`. `'normal' !== 'dark'` pur con sfondo scuro. |
| `original paint`, `original precedence`, `original scheme` | 0, 0, 0 | Le medesime verifiche passano nella copia con presentazione originale. |

#### File applicativi e di test

- `src/app/[locale]/layout.tsx`, `src/app/[locale]/dashboard/layout.tsx`, `src/lib/theme.ts`
- `src/components/shell/theme-toggle.tsx`, `src/components/shell/top-bar.tsx`, `src/components/shell/mobile-top-bar.tsx`, `src/styles/airops.css`
- `e2e/theme-system.spec.ts`, `e2e/login.spec.ts`
- `_bmad-output/implementation-artifacts/evidence/18-6/`

#### Gate integrati

`TMPDIR=/tmp/am186/gates-final npm run gates`, exit 0 sul primo candidato congelato. Lint 44 s, typecheck 37 s, Vitest 2.351/2.351 in 18 s, build di produzione 64 s. Dopo `npm run db:reset:test` (exit 0) il server usa la build verificata sul database appena ricreato e popolato, SMTP locale e la fixture METAR.

La prima suite completa, `E2E_REUSE_SERVER=1 TMPDIR=/tmp/am186/final scripts/e2e.sh start --workers=2`, ha consumato entrambi i retry di `aog-impact-email.spec.ts:564`. Nei tre tentativi, «641px desktop AOG link vs exact base», unica differenza `y: 620.44 → 622.44`. Il runner era ancora attivo e aveva registrato 222 tentativi conclusi quando è stato interrotto. `TMPDIR=/tmp/am186/final scripts/e2e.sh stop` ha restituito 0 e `SIGTERM sent to process group 1729049`. Nessun processo vivo fra i 24 censiti prima del segnale. Il runner interrotto non ha scritto una sentinella di uscita della suite.

Nel tratto eseguito, `account-adjustments.spec.ts:94` è passato al primo retry dopo `Expected 1 Mailpit message(s) … within 15000ms`. `account-statement-period.spec.ts:590` è passato al primo retry dopo un timeout di 5 s sull'URL del periodo. `bookings.spec.ts:1602` è passato al primo retry dopo `page.goto: net::ERR_ABORTED` e timeout di 30 s. `empty-18-2b.spec.ts:4` è passato al secondo retry dopo la coordinata verticale desktop di Contabilità a 79,84 invece di 85,84 px in italiano e inglese. I test ancora in corso al segnale non hanno esito.

**Diagnosi e correzione del test AOG.** Due server di produzione in loopback, uno costruito dalla base `d13da84`, uno dal candidato, sullo stesso PostgreSQL 16 sintetico dedicato alla diagnosi (porta 55486). Il percorso reale del test crea un velivolo e apre il pannello, conferma il fermo, poi misura il link a 641, 900 e 1.280 px. `node /tmp/am186/aog-probe.cjs 3195 4` e `node /tmp/am186/aog-probe.cjs 3198 4` hanno entrambi restituito 0. Su ciascuna versione sono state raccolte 12 misure. Il link cade a 620,44 px quando il pannello è scorso di 2 px, a 622,44 px quando è scorso di 0 px. La coordinata al netto dello scroll è sempre 622,44 px su entrambe le versioni. Larghezza 102,92 px, altezza 19,38 px, coordinate x 156/415/795 e regole di stile coincidono. Anche il run 18.5b aveva osservato la stessa intermittenza.

Il candidato definitivo `67f6a7176c83ee98cc435c8baa2e66adfcfba3bb` cambia unicamente `e2e/aog-impact-email.spec.ts` rispetto al tree iniziale: misura la posizione del link a pannello non scorso (`rect.y + scrollTop`). La precisione al centesimo, le altre dimensioni e le verifiche mobile restano quelle originali. Controprova isolata `node /tmp/am186/aog-probe.cjs 3198 1 offset`, exit 1: una regola aggiunta alla sola pagina di prova sposta davvero il link di 2 px e produce `Expected unscrolledY 622.44; received 624.44`.

#### Verifiche sul candidato definitivo

- `TMPDIR=/tmp/am186/gates-v2 npm run gates`, exit 0. Lint 42 s, typecheck 7 s, 2.351 test Vitest su 2.351 in 18 s e build di produzione 59 s.
- `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/aog-impact-email.spec.ts --project=chromium -g "the two controls of the double step" --workers=1 --retries=0`, `E2E_EXIT=0`. Il caso AOG è passato in un run di 11,9 s senza retry.
- Dopo il mirato, `npm run db:reset:test`, exit 0, ha ricreato `airmanager_e2e` in loopback. Il server è stato riavviato dalla build verificata con keep-alive di 75 s, Mailpit locale e meteo sintetico.
- `E2E_REUSE_SERVER=1 TMPDIR=/tmp/am186/full2 scripts/e2e.sh start --workers=2`. Risultato letto con `TMPDIR=/tmp/am186/full2 scripts/e2e.sh status`: **708 casi distinti**, `706 passed`, `2 flaky`, **zero fallimenti e zero skip finali**, 30,8 minuti, `E2E_EXIT=0` alle 17:16:57 UTC.
- I sei casi 18.6 sono passati al primo tentativo, inclusi i 48 campioni anteriori al primo paint (anticipo min/mediana/max 5,9/19,9/1.094,7 ms in questa suite completa) e le 48 schermate interattive. Al primo tentativo anche tutti i 9 casi `login`, i 59 `mobile-ink-targets`, la sfida di geometria AOG e i tre `mobile-metar` con fixture locale.

Il log registra 704 successi nel primo giro, due errori recuperati al primo retry e due casi del gruppo seriale posticipati ed eseguiti con successo al giro successivo. Le esecuzioni contrassegnate `retry #1` sono 20: una per Scadenze e 19 per il gruppo Impostazioni, che ha rieseguito anche 16 casi già passati.

| Caso recuperato | Diagnostica sanitizzata nel primo tentativo | Esito |
|---|---|---|
| `expiry-types.spec.ts:239` | `getByRole('heading', { name: 'Le mie scadenze' })`, `Timeout: 5000ms`, `element(s) not found` | Passato al primo retry |
| `settings.spec.ts:715` | `getByTestId('smtp-test-email-feedback')`, `Timeout: 5000ms`, `element(s) not found` | Passato al primo retry del gruppo seriale. Anche i casi alle righe 771 e 830, posticipati nel primo giro, sono passati. |

Il runner espone la sentinella e l'esito dei tentativi. Il log non stabilisce la causa dei due timeout.

### Revisione indipendente e chiusura

Il revisore GPT 6 Sol xhigh ha approvato gli AC 1–9 sul tree `67f6a7176c83ee98cc435c8baa2e66adfcfba3bb`, committato come `475b3f1`. Il riesame ha verificato la correzione del test di geometria a 641/900/1280 px e il risultato della suite finale. Le prove sul tema sono state eseguite in Chromium con sistema emulato. [Rapporto di revisione](evidence/18-6/review.md) e [matrice delle misure](evidence/18-6/matrix.csv).
