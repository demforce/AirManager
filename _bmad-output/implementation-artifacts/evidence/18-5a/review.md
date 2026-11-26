# Revisione indipendente — BMAD 18.5a

Base: `d47a569053fd04dec30428eff8aa6c03dcb3eba5`; candidato applicativo: tree `5735a11d601db77a6049e426b38749486e41dffe`. Ambito: AC 1–5 e ratifiche Q-18.5-a/b/c/d. Solo lettura del repository; prove browser su build isolata del tree, `http://localhost:3186`, DB PostgreSQL sintetico separato `airmanager_test`, SMTP locale. Nessun dato reale o invio.

## Verdetto finale

**APPROVATA** — nessun rilievo bloccante o non bloccante su AC 1–5/ratifiche nel tree applicativo indicato. `git diff --name-only 5735a11d601db77a6049e426b38749486e41dffe` alla chiusura elenca solo il record BMAD; il codice resta quello esaminato e il contenuto staged coincide col tree.

## Evidenze

- Diff base→tree: 9 file, 302 inserzioni/39 rimozioni al primo candidato; delta al tree finale qui esaminato: `Date.now()` raccolto nel callback `onClick` (6 righe di diff). `git diff --check` exit 0. Il Registro voli non cambia nelle righe: solo `.lb-row.header > * { position: relative }` contiene le etichette `sr-only` aggiunte nella 19.12b.
- Matrice browser su quattro ruoli, IT/EN, light/dark, 320/360/375/390/414: 80 combinazioni, script Playwright locale exit 0. A 360–414 tutte le etichette sono su una riga, font 10,5 px e altezza identica 68,0625 px per ogni ruolo, locale e tema. A 320 si spezza solo «Registro voli» in IT per istruttore/pilota/allievo: limite dichiarato dal record BMAD.
- In 6 combinazioni istruttore/pilota/allievo × IT/EN, tab brevi e aria-label pieni corrispondono; aria-label contiene il testo visibile, H1 e sidebar desktop restano pieni dopo navigazione. Script Playwright locale exit 0.
- Fixture run-unique con marche da 20 e nome visualizzato da 20 caratteri, creata via API sul DB sintetico. Pianificazione e «In corso ora» a 375/390 in light/dark: 8/8 misure `scrollWidth <= clientWidth` sia per nome che per sottoriga; marche presenti nella sottoriga. Script Playwright locale exit 0. Screenshot ispezionato: `/tmp/review185a-booking-row.png`.
- Sheet admin, tramite UI e transizioni API sintetiche: APPROVED futuro → unico primario Modifica; APPROVED iniziato → Effettuato; PENDING → Approva; FLOWN, DENIED, NO_SHOW → Riapri; CANCELLED → nessuna azione. Ritorno focus dopo secondo passo Annulla/Rifiuta al primario; script Playwright locali exit 0. Ispezionati i sette PNG in `_bmad-output/implementation-artifacts/evidence/18-5a/`.
- Prenotazione altrui su quattro ruoli: admin 4 azioni e nome visibile; istruttore/pilota/allievo nessuna azione; pilota/allievo nome mascherato. Script Playwright locale exit 0. ACL invariata nel diff; guardie `canManageAny` / `isOwnRow` restano le stesse del desktop.
- Registro voli popolato (1 riga): `documentElement.scrollWidth == clientWidth` a 641/768/900/1024/1100/1280, script Playwright locale exit 0.

## Limiti e retry dell'harness di review

- Non ho mutato ACL né effettuato prove offensive. La matrice manuale negativa delle autorizzazioni usa una prenotazione altrui; la positiva su prenotazione propria è stata verificata per il pilota, mentre il caso istruttore proprio resta coperto da guardie preesistenti nel codice e test esistenti, non da questa prova manuale.
- Primo tentativo di avvio Chromium con `/opt/pw-browsers/chromium`: exit 1, `executable doesn't exist`. Retry con `/usr/bin/chromium`: exit 0.
- Uno script manuale mappava per errore il passo `reject` al pulsante di dismiss della cancellazione: timeout, interrotto exit 130. Corretta la mappatura nello script di review; PENDING→Rifiuta→ritorno focus passati, exit 0. Nessun difetto applicativo dedotto dal tentativo errato.
- Ulteriore controllo browser exit 0: Escape chiude lo sheet e riporta il focus sulla riga `booking-row-mobile`; titolo della card Piloti = «Anagrafica» IT, «Directory» EN.
- Prova positiva aggiuntiva di autorizzazione su DB sintetico, script Playwright exit 0: prenotazione futura creata via API per il pilota seed; accesso come pilota, riga propria visibile con nome, sheet con sole azioni Modifica/Annulla e unico primario Modifica. Nessun controllo permessi alterato.

## Controprova isolata del test

Il dev ha applicato due mutazioni al solo asset CSS della copia `/tmp/am185a/mutant`, lasciando intatto il checkout: rimozione del comportamento che permette al nome di disporsi per intero e del contenimento delle etichette `sr-only` dell'intestazione Registro. `cat /tmp/am185a/mutant-hashes.log` registra SHA-256 dell'asset prima `3d9f9cc82e8bca6a48a1cb4e1e2cf2f08f61a9e38964fa77753202bcaee0d000`, dopo `6984a96d008f33d68d6069aa14ed7e0d82e662b8990f2bc8a3f130671294b343`. `tail /tmp/am185a/mut-run/airmanager-e2e/last-run.log`: `E2E_EXIT=1`, due test rossi come atteso; nome `scroll=138, client=0` in 8/8 misure e overflow Registro `[390,263,131,175,99,0]` alle sei larghezze. È evidenza che i due test discriminano queste regressioni nella copia; il run originale e la suite integrata sono separati.

## Gate mirato originale e gate integrato

- `tail /tmp/am185a/focused.log`: mirato `e2e/mobile-rows-tabs.spec.ts`, `3 passed (42.8s)`, `E2E_EXIT=0`; include attraversamento dell'istante d'inizio a sheet aperto tramite clock Playwright, matrice tab, righe, stati sheet e Registro. Output misure: nomi `[138,138]` negli 8 casi, overflow Registro `[0,0,0,0,0,0]`, altezze barra 68,0625 px a 360–414.
- `cat /tmp/am185a/gates-final.log`: `PASS lint`, `PASS typecheck`, `PASS test — 2349 passed`, `PASS build`; exit 0 riferito dal dev. Suite integrata corretta: `TMPDIR=/tmp/am185a scripts/e2e.sh status 18` legge `/tmp/am185a/airmanager-e2e/last-run.log` con sentinella `E2E_EXIT=0`, **697 passed + 3 flaky**, 0 skip/fail; 4 retry complessivi. I tre test nuovi `mobile-rows-tabs.spec.ts` sono passati al primo tentativo. I tre casi flaky sono `account-adjustments.spec.ts:94` (1 retry), `empty-18-2b.spec.ts:52` (2 retry), `mobile-expiries-movements.spec.ts:666` (1 retry), tutti preesistenti. I tre casi METAR hanno passato con fixture locale. La riga `state: RUNNING` di `status` è incoerente con la sentinella conclusiva; il risultato adottato è la sentinella come richiesto da CLAUDE.md.
