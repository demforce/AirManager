# Review adversarial — Story 19.12a «Glossario, test di parità, plurali ICU e chiavi morte»

- Reviewer: `review-19-12a` (Opus 5.5, unico layer adversarial), 2026-11-03, metodo `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor eseguiti in sequenza da me, nessun subagent disponibile) + `karpathy-guidelines`.
- Sotto review: `abb0dd3` (feat) e `3bfdbb7` + `6642625` (docs, solo story file). Baseline `a785e08`. Diff `a785e08..6642625`: 28 file, +721/−645.
- Repo NON modificato: nessun edit, nessun `git add`/`stash`, working tree identico a HEAD sui file della story (sha256 di `messages/*.json` e `fleet-card.tsx` = hash finali del record §E). Questo report non è committato.

## Verdetto

**SHIPPABLE con fix.** I meccanismi della story reggono all'attacco. Ho verificato empiricamente:

- arbitro completo su DB fresco verde, 604 test;
- nessuna chiave viva rimossa, con un resolver differenziale indipendente su 1 373 chiamate;
- test di parità discriminante: i mutanti (a), (b), (d) ed (e) sono rossi in una copia isolata;
- plurali giusti a schermo con 0, 1 e 2 in it ed en;
- lockfile stabile sotto npm@10.

I finding sono:

- **1 MEDIUM, F1**: una copy della story conta tutte le persone e le chiama «piloti», contro la regola D-5 del glossario scritto nella stessa story. Il fix è una riga di `it.json` più l'atteso del test.
- **3 LOW, F2-F4**: la coppia Conferma/Annulla spezzata da D-a, con il record impreciso su questo; «fuori / servizio» spezzato nella card Velivoli; due punti ciechi della guardia e del test di parità.

Solo F1 va corretto prima della chiusura.

## Arbitro (priorità zero, AC 12)

- Pre-condizioni: DB `airmanager` resettato dalla sessione principale alle 14:43 (migrate + seed); `ss -ltnp | grep :3000` vuoto; ultimo `scripts/e2e.sh status` = DONE della serie mirata delle 14:34 (`E2E_EXIT=1`, la serie `api-v1` del dev spiegata nel record §G).
- Lancio, alle 14:43:49 di Roma: `export JOBS_SECRET=review-19-12a-secret-not-placeholder && CI=1 scripts/e2e.sh start` (suite completa, build di produzione dentro il run; `.next/BUILD_ID` delle 14:44:25).
- Esito, verbatim da `scripts/e2e.sh status`:
  ```
  state: DONE — E2E_EXIT=0
  --- summary ---
    1 flaky
    603 passed (20.2m)
  === e2e start: 2026-11-03T14:43:49+01:00 ===
  === e2e end: 2026-11-03T15:04:03+01:00 ===
  E2E_EXIT=0
  ```
- **604 test: 603 passed + 1 flaky, 0 failed.** Il delta dichiarato 604 → 604 torna.
- Il flaky è `person-profiles.spec.ts:86` («student → pilot transition in ONE Salva…»): `loginExpectingDashboard` resta su `/it/login` (`toHaveURL(/\/it\/dashboard$/)`, timeout 5000 ms). È la classe nota «login-timeout flake», verde al retry #1 in 9,9 s. La story non tocca né la login né `PeoplePage`/`PilotsPage` letti da quello spec, quindi non è un finding.
- Verdi anche tutti gli spec toccati dalla story: `aog-impact-email` (compresa la guardia MAJOR-2 `:392`), `aog-overview-count` (ultimo della catena: «active aircraft before: 257»), `mobile-overview`, `flight-log`, `flight-requirements`, `mobile-settings`. Verde anche l'intera catena serializzata.
- **Log del server di produzione** (stderr di `webServer`, che finisce nel log del run): `grep -acE "MISSING_MESSAGE|IntlError|FORMATTING_ERROR|INVALID_KEY|ENVIRONMENT_FALLBACK"` → **0**. È la rete runtime di AD-5 su 604 test.
- Copia del log: `/tmp/claude-1000/-home-admin-AirManager/af449493-cc12-476a-90ac-651351693579/scratchpad/rv/arbiter-19-12a-full.log` (sha256 `97864516c47a969ac9d9bdb61418ab38badcde1eecae2c95dee0dc30d888cc62`). L'originale è `/tmp/airmanager-e2e/last-run.log`: dopo non ho lanciato altri run e2e.

## Gate rieseguiti dopo l'arbitro

- `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` → `Test Files 84 passed (84)`, `Tests 2209 passed (2209)`. Il delta 2178 → 2209 torna; l'env eager è rispettato.
- `npx tsc --noEmit` → exit 0.
- `npx eslint` sui 21 file `.ts`/`.tsx` del diff (codice, test e spec e2e) → exit 0.
- Non ho rieseguito `next build`: la build è passata dentro l'arbitro, e una seconda build avrebbe riscritto la `.next` condivisa sotto un possibile arbitro della sessione principale.

---

## Finding

### F1 — MEDIUM (patch) — `PilotsPage.sub` chiama «piloti» tutte le persone, contro la regola D-5 del glossario

- **Dove**: `messages/it.json:280`. Il valore è `{total, plural, one {# pilota} other {# piloti}} · {suspended, plural, …}`. L'argomento `total` è `listPilotsPageData#totalCount` = `prisma.person.count({ where: { archivedAt: null } })` (`src/server/services/people.service.ts:297`): **ogni** persona non archiviata, cioè istruttori, allievi e persone senza profilo (la persona dell'amministratore). La pagina Piloti elenca infatti tutte le persone.
- **Origine**: la proposta di §3.2 (riga `PilotsPage.sub`, «"in archivio" si confonde con "Solo archiviati"»). Il dev l'ha applicata alla lettera. Il glossario scritto dalla stessa story la vieta: `docs/i18n/glossario-it.md`, riga «Elenco misto | **Persona** | Pilota (per un elenco che include allievi e istruttori) | D-5».
- **Perché ora e non nella 19.12b**: l'AC 7 dichiara «copy finale» sulle chiavi di §3.2, e la 19.12b non ha `PilotsPage.sub` nel suo perimetro (`grep -n "PilotsPage" 19-12b-passata-testi.md` = 0 righe).
- **Riproduzione** (DB gemello appena seedato, build di HEAD, `:3100`, admin):
  ```
  pilots sub: 4 piloti · 0 sospesi
  persons (non-archived) with profiles: [["AirManager",[]],["Allieva",["student"]],["Istruttrice",["instructor"]],["Volante",["pilot"]]]
  pilot rows visible: 4
  ```
  Una sola persona ha il profilo pilota. La testata dice «4 piloti». Prima della story diceva «4 in archivio»: vago, ma non falso. L'inglese resta corretto («4 on file · 0 suspended»).
- **Fix proposto**: `{total, plural, one {# persona} other {# persone}} · {suspended, plural, one {# sospesa} other {# sospese}}`. L'accordo di «sospesa/e» con «persone» è una scelta di copy: «sospesi» resta accettabile se la sessione principale preferisce. Poi aggiornare l'atteso del caso `PilotsPage.sub` in `src/i18n/messages.test.ts:187`. Nessun e2e legge questa chiave (`grep -rnE "piloti ·|sospesi" e2e` = 0).

### F2 — LOW (patch facoltativa, o accettare documentando) — D-a: la domanda accorciata tiene Conferma sulla riga ma manda a capo **Annulla da solo**, e §H non lo dice

- **Dove**: `messages/it.json:844` (`confirmQuestion`) e `:845`. Il layout è `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx:981` (riga flex con `flexWrap: 'wrap', gap: 8`).
- **Cosa dice il record** (§H D-a): «con "Mettere fuori servizio? …" (49-54 caratteri) resta sulla riga (Conferma a x 1124-1158, y 756…)». Vero per Conferma. Ma **Annulla** va a capo, da solo, sotto la domanda. Sulla baseline, invece, domanda, Conferma e Annulla stavano su una riga. Si vede anche negli screenshot del dev (`scratchpad/ui/05-editor-confirm-2-1280.png`, `06-editor-confirm-0-1280.png`).
- **Misura** (1280×900, editor reale. Domanda armata, poi il testo della `.fld-label` sostituito nel DOM con le varianti, e lette le box. Il trigger è a y 756, h 35):

  | Domanda | car. | Conferma | Annulla | Stessa riga | Centro di Conferma nel trigger (precondizione MAJOR-2) |
  |---|---|---|---|---|---|
  | baseline «Confermi il fermo? 0 prenotazioni impattate» | 43 | x 1096, y 756 | x 1186, y 756 | **sì** | sì |
  | HEAD «Mettere fuori servizio? Nessuna prenotazione coinvolta» | 54 | x 1175, y 756 | **x 781, y 799** | **no** | sì |
  | HEAD con 12 («… 12 prenotazioni coinvolte») | 49 | x 1139, y 756 | x 781, y 799 | no | sì |
  | §3.2 «Mettere fuori servizio il velivolo? Nessuna prenotazione coinvolta» | 66 | x 781, y 779 | x 871, y 779 | sì | **no**: la guardia `:392` fallisce, come dice D-a |
  | «Fuori servizio? Nessuna prenotazione coinvolta» | 46 | x 1117, y 756 | x 781, y 799 | no | sì |

- **Valutazione di D-a**: la misura che motiva la deviazione è giusta (la copia di §3.2 rompe la precondizione della guardia), e la guardia resta discriminante. Testa il ramo `=0`, che è il più lungo dei rami contati (54 caratteri contro 48-49), e `aog-impact-email.spec.ts:392` è verde nell'arbitro. Il prezzo non dichiarato è la coppia spezzata. Non è un rischio di sicurezza: Annulla a y 799 sta sotto il trigger (756-791), non dentro, quindi un doppio clic non la tocca. È un difetto di layout di una conferma distruttiva, con Annulla staccato dal suo Conferma.
- **Fix possibili** (a scelta della sessione principale):
  - accorciare ancora, sotto i ~44 caratteri a 1280. Per esempio solo il ramo `=0`: «Mettere fuori servizio? Nessuna prenotazione» (44); il ramo `other` con numeri a due cifre (49) va comunque a capo;
  - oppure accettare e correggere la frase di §H D-a («Conferma resta sulla riga; Annulla va a capo da solo»).

  Una terza strada, un wrapper `nowrap` per la coppia, sposterebbe Conferma sotto e romperebbe la precondizione della guardia: sconsigliata.

### F3 — LOW (defer o patch cosmetica) — «fuori / servizio» spezzato nella card Velivoli della Panoramica a 1280, anche con i numeri di un club

- **Dove**: `messages/it.json:205` (`DashboardPage.fleetCard.summary`), resa in `src/components/dashboard/fleet-card.tsx:126`.
- L'osservazione del record §I è confermata e va oltre: il dev l'ha vista con 281 velivoli, io la riproduco con **4**.
  ```
  overview@1280 fleetcard="4 velivoli · 3 disponibili · 1 fuori servizio" height=32 lines~2 width=287
  overview@1440 fleetcard="4 velivoli · 3 disponibili · 1 fuori servizio" height=16 lines~1 width=294
  ```
  Screenshot `rv/ui/rv-04-fleet-card-1280.png`: «4 velivoli · 3 disponibili · 1 fuori» / «servizio». Niente si sovrappone e niente esce dalla card.
- **Fix possibile**, a basso costo: uno spazio non separabile in «fuori servizio» nelle due chiavi `summary` e `AircraftPage.sub`. Le regex `aog-overview-count.spec.ts:50` (`/(\d+)\s+fuori servizio/`) e `mobile-overview.spec.ts:268` hanno uno spazio letterale e andrebbero portate a `fuori\sservizio` (in JS `\s` comprende U+00A0). In alternativa resta alla 19.12b, che ritocca comunque la testata («Aggiungi velivolo»).

### F4 — LOW (patch facoltativa) — due punti ciechi: guardia `t.raw` con backtick, apostrofo che inghiotte un argomento ripetuto

Provati con mutanti in una copia isolata (`git archive 6642625 src messages …` più `node_modules` in symlink; working tree mai toccato, `sha256sum -c` OK dopo ogni mutante):
```
=== (g) t.raw with backtick literal:       Tests  31 passed (31)
=== (k) apostrophe swallows a repeated arg:       Tests  31 passed (31)
=== (l) en plural without one:       Tests  31 passed (31)
```
- **(g)**: `fleet-card.tsx:126` riletto come `` (t.raw(`summary`) as string) `` resta **verde**. La regex di `src/i18n/messages.test.ts:164` è `/\.raw\(\s*['"]([\w.]+)['"]/` e non vede il letterale col backtick. Oggi nel repo non esiste alcun `.raw(` con argomento diverso da un letterale `'…'`/`"…"` (`grep -rnE "\.raw\(\s*[^'\"[:space:]]" src` = 0), quindi nessun falso negativo vivo. Fix di un carattere: `['"\`]` nelle due classi.
- **(k)**: `Requirements.who` = «{name} ({role}), scheda dell'{name}» resta **verde**. Il controllo 3 confronta gli **insiemi** di nomi (`messages.test.ts:107`): se l'argomento inghiottito compare anche altrove nella stessa frase, la perdita non si vede. Raro. Basta una riga nella regola «Apostrofo» del glossario, oppure contare le occorrenze invece dell'insieme.
- **(l)**: un plurale inglese senza `one` («1 shown») passa. È conforme ad AD-2 punto 4, che chiede `one`/`=1` solo per l'italiano. Lo registro come limite, non come difetto.
- Altri falsi negativi ipotizzati dal lead, cercati e **assenti**:
  - nessun `t.raw` su un sottoalbero che contenga messaggi ICU (scansione risolta per namespace: 0);
  - nessun `getMessages`/`useMessages`;
  - nessun messaggio con `{x, number|date|time}` letto con `t.raw`;
  - nessun translator radice senza namespace.

  CI usa Node 22, quindi `readdirSync(…, { recursive: true })` funziona e la guardia scandisce 322 file, 13 dei quali con `.raw(`: non è vacua.

---

## Superfici d'attacco del lead: esiti

### 1. Chiavi morte (AD-5): nessuna chiave viva rimossa

- Conteggi indipendenti, `a785e08` → `abb0dd3`: **1 629 → 1 430** chiavi per file, **203 rimosse** (194 morte + 9 della fusione D-14), 4 aggiunte, 26 cambiate in it e 10 in en. Le rimozioni sono identiche in it ed en.
- **Resolver differenziale** (`rv/resolve.py`): ogni chiamata `x('…')`/`x.raw|rich|has('…')` è risolta sul translator dichiarato più vicino prima di lei nel file (`getTranslations`/`useTranslations`/`createTranslator`, anche `{ namespace }`), e la chiave è cercata come foglia o sottoalbero in base e in HEAD. Risultato: **1 373 chiamate risolte, 0 presenti in base e assenti in HEAD**. Le 66 chiamate che l'euristica attribuisce male (translator passati come parametro dentro `dashboard/page.tsx`) esistono tutte in qualche namespace di HEAD, e nessuna corrisponde a una chiave rimossa.
- **Translator passati come parametro**: risolti a mano dai chiamanti, nessuna chiave mancante.
  - `pilot-editor-labels.ts` riceve `PilotsPage`/`PeoplePage`/`UsersPage` (`pilots/page.tsx:64-72`, `people/[id]/page.tsx:319`, `instructors/page.tsx:180`);
  - `booking-labels.ts` riceve `BookingsPage`;
  - `my-compensation#methodLabel`.
- **Scheda persona** (`people/[id]/page.tsx`, la superficie più esposta: legge `PersonDetailPage`, `PeoplePage`, `ExpiriesPanel` e `AccountStatementPage` insieme): ogni chiamata statica risolve; `kicker`/`table.actions`/`backToDashboard` sono di `tAccount`/`t` e non delle chiavi rimosse.
- **Template dinamici**: 16 prefissi `` t(`…${x}`) `` nel repo (`list.status.`, `movementType.`, `registry.category.`, `scope.`, `table.bookTypes.`, `table.status.`, `placeholders.`, `failure.`, `role.`, `nav.`, …). Nessuna chiave rimossa ricade sotto uno di essi. `t(variabile)`: solo `t(genericKey)` in `booking-labels.ts:47`, sul namespace `BookingsPage` non toccato.
- **Export ed email**: `exports.service.ts:65` e `mail/templates.ts:14` tipizzano il catalogo, e `tsc` è verde. Runtime: 0 `MISSING_MESSAGE` nel log dell'arbitro, e gli spec `exports`, `pdf-exports`, `cash-register`, `cash-report`, `people-management` e `person-detail` sono verdi.

### 2. Discriminanza del test (AC 3, 4)

Mutanti di §4.3 riprodotti in una copia isolata (mai nel working tree), uno per volta, col ripristino controllato da `sha256sum -c`:
```
=== (a) key only in it:       Tests  1 failed | 30 passed (31)   FAIL … > have the same keys
=== (b) {count}->{n} in en:   Tests  1 failed | 30 passed (31)   FAIL … > every key has the same argument names …
=== (d) dell'{name} in it:    Tests  1 failed | 30 passed (31)   FAIL … > every key has the same argument names …
=== (e) t.raw on 3.2 key:     Tests  1 failed | 30 passed (31)   FAIL … > no source file reads an ICU plural or select with t.raw
restored OK (×4)
```
Hash del working tree all'inizio della review = hash finali di §E (`it.json b0f9b548…`, `en.json b47610f2…`, `fleet-card.tsx 01b357d0…`): nessun residuo dell'incidente delle 14:25. I punti ciechi sono in F4.

### 3. Plurali a schermo (AC 5, 10)

Build di HEAD su `:3100`, DB gemello `airmanager_rv1912a` (create + migrate + seed), admin, 1280 e 375. Output verbatim di `rv/ui-review.cjs` e `rv/ui-bookings.cjs`:
```
fleet card sub: 1 velivolo · 1 disponibile · 0 fuori servizio        (singolare)
fleet sub:      4 velivoli · 3 disponibili · 1 fuori servizio
overview sub:   0 fuori servizio  →  1 fuori servizio
instructors sub: 1 attivo · 0,00 € da liquidare
logbook sub: 0 voli registrati
expiries shown: 0 mostrate
preview 0: Nessuna prenotazione coinvolta · rientro da definire: conteggio non delimitato
preview 1: Interessa 1 prenotazione. …     preview 2: Interessa 2 prenotazioni. …
confirm 0/1/2: "Mettere fuori servizio? Nessuna prenotazione coinvolta" / "… 1 prenotazione coinvolta" / "… 2 prenotazioni coinvolte"
banner 1: Fuori servizio registrato: 1 prenotazione coinvolta. …
row 1: 1 prenotazione nel periodo · rientro da definire: conteggio non delimitato
week day counts: ["0 prenotazioni","0 prenotazioni","0 prenotazioni","2 prenotazioni","1 prenotazione","0 prenotazioni","0 prenotazioni"]
it (none) -> 0 in attesa su 3 | ?status=APPROVED -> 3 prenotazioni | ?status=DENIED -> 0 prenotazioni | ?status=CANCELLED (1) -> 1 prenotazione
hint (slot vuoto, days 1): … a passi di 0 minuti, fino a 1 giorno prima. …
agenda +2: 2 prenotazioni      agenda +3: 1 prenotazione                         (375)
cash categories mobile rows: ["Altro 2 movimenti Attiva", … "Utenze 0 movimenti Attiva"]   (375)
en week day counts: [… "2 bookings","1 booking" …]    en ?status=APPROVED -> 3 total
en dashboard/fleet sub: 4 total · 3 available · 1 AOG   (D-10: invariato)
reports chart subs: ["ultimi 12 mesi · €","ultimi 12 mesi · h"]
console errors: 0
```
- Nessun `{…, plural`/`{count}`/`{total}`/`{days}`/`{slot}` nel testo del `body` delle pagine controllate (Scadenze, Pianificazione settimana, Panoramica a 375, Statistiche, cinque pagine in inglese). Log del server `:3100`: 0 `MISSING_MESSAGE`/`IntlError`/`FORMATTING_ERROR`.
- **D-b** è corretto: `mobile-alerts-card.tsx` è un componente server (nessun `'use client'`, importato solo da `dashboard/page.tsx`), e `useTranslations` funziona nei server component non async. Anche `fleet-card.tsx` è server lato Panoramica, ed entra nel bundle client via `fleet-console.tsx` (che usa solo `FleetCardGrid`).
- **D-h** (`Number('')`): verificato, «a passi di 0 minuti» solo mentre il campo è vuoto. Gli input sono `type="number"`, quindi `NaN` non arriva (un valore non valido dà `''`). Accettabile, non è un finding.
- Valori stringa a un argomento `plural`: `createTranslator` li accetta («3 attivi», nessun `onError`), quindi nessuna chiave di fallback a schermo.
- Raggruppamento delle migliaia del `#`: in it le cifre a 4 non vengono raggruppate («1200 velivoli · 1174 disponibili», CLDR minimumGroupingDigits 2), quindi le regex `(\d+)\s+…` degli e2e reggono a ogni dimensione realistica del DB.

### 4. Deviazioni (§H)

- **D-a**: misura confermata, guardia discriminante, ma la coppia resta spezzata: F2.
- **§I, card Velivoli su due righe**: confermata e peggiore del record, perché succede già con 4 velivoli: F3.
- **D-b, D-c, D-e, D-f, D-g, D-h, D-i, D-j**: corrette o neutre.
  - D-g: `agendaCount` conta solo `row.kind === 'booking'` (`schedule.tsx:314`), quindi «prenotazioni» è esatto in entrambe le lingue.
  - Nessuna assunzione di dominio nuova.

### 5. Glossario e `CLAUDE.md` (AC 1)

- `docs/i18n/glossario-it.md`: 38 righe che coincidono con §G, e le decisioni PO ci sono tutte (Velivoli/Aeromobili, Estratto conto, currency f. Valida/In scadenza/Scaduta, Amministratore, compenso istruttore/payout). La sezione Regole copre D-3, D-4, D-8, D-9, D-13/D-14, D-16, l'apostrofo e D-10.
- Il consiglio sull'apostrofo raddoppiato è giusto, l'ho provato col formatter dell'app:
  ```
  "scheda dell''{name}" → "scheda dell'I-ABCD"     "scheda dell'{name}" → "scheda dell{name}"
  ```
- `CLAUDE.md`: una riga «Copy italiana» in §Convenzioni che rimanda al glossario e al test; nessuna copia del contenuto (AD-1).
- Unica incoerenza: F1, dove la copy della story contraddice la riga D-5 del glossario.

### 6. Lockfile (AC 2)

- `git diff a785e08..abb0dd3 -- package.json package-lock.json`: esattamente una riga per file, `"@formatjs/icu-messageformat-parser": "3.5.12"` (pin esatto). La voce `node_modules/@formatjs/icu-messageformat-parser` resta 3.5.12 senza `dev: true`: è corretto, perché il pacchetto serve anche in produzione via `intl-messageformat` 11.2.9, che lo chiede `3.5.12` esatto.
- Stabilità: `npx -y npm@10 install --package-lock-only --ignore-scripts` su una copia di `package.json` + `package-lock.json` di `abb0dd3` dà «up to date» e un `diff` vuoto. Il lockfile è coerente, quindi `npm ci` resta valido.

### 7. e2e modificati (AC 9)

- `aog-overview-count.spec.ts:50`/`:57`: `/(\d+)\s+fuori servizio/` e `/(\d+)\s+disponibil[ei]\b/` vanno bene con 1 e con 0; il `\b` evita i prefissi.
- `mobile-overview.spec.ts:268`: `/^\d+ fuori servizio$/`, ancorata.
- `aog-impact-email.spec.ts:429`: `getByText(…, { exact: true })` sulla domanda `=0`; gli altri `toContainText` stanno su testid di nodi propri, con conteggi di fixture run-unique.
- `flight-log.spec.ts` usa `toHaveText` esatti. `flight-requirements.spec.ts:431` ha il ramo `windowDays === 1` esplicito.
- Nessun `getByRole('link', { name })` page-level nuovo e nessun `hasText` con H:MM o date. Nessun letterale residuo dei valori vecchi in `e2e/` né negli unit test (scansione su «totali», «in archivio», «mostrati», «in anticipo», «Stai per impattare», «impattat», «nel fermo», «Fermo registrato», «· Vedi tutte», «N AOG», «ultimi N mesi», «voli oggi»…).
- `mobile-settings.spec.ts:655` («0 movimenti») resta valido.

## Scartati (dismiss)

- Raggruppamento delle migliaia nelle regex: vedi §3.
- `NaN` nel suggerimento di Pianificazione: vedi §3, D-h.
- Argomenti stringa a un plurale: vedi §3.
- Plurale inglese senza `one`: conforme ad AD-2 (F4 l).
- Flaky `person-profiles.spec.ts:86`: classe login-timeout nota, codice non toccato.
- «Vedi tutti» nell'overflow degli Avvisi: accorda con «avvisi», e la destinazione (`overview-alerts.ts:173`, `DOMAIN_HREF` del primo nascosto) cambia per tipo, quindi un accordo con la destinazione non è possibile. Scelta corretta.

## Pulizia

- Server `next start -p 3100` fermato (il processo `next-server` e il wrapper `npm exec`): `:3000` e `:3100` liberi.
- DB gemello `airmanager_rv1912a` eliminato (`dropdb`). `airmanager_audit`/`airmanager_load` non toccati.
- Nessuna build oltre a quella dell'arbitro; la `.next` dell'arbitro è stata solo letta.
- Artefatti nello scratchpad (`…/scratchpad/rv/`):
  - script `resolve.py`, `ui-review.cjs`, `ui-bookings.cjs`;
  - output `ui-review.out`;
  - screenshot `ui/rv-01…rv-08`;
  - copia del log dell'arbitro.

  La copia per i mutanti è in `…/scratchpad/mut/`.
