---
baseline_commit: 1f6ab3e
---

# Story 18.7: Desktop — colonne, intestazioni, fermo velivolo, Panoramica

Status: **done** — **18.7a done** (AC 1–4, `c09f2b8`) e **18.7b done** (AC 5–6, `d675dd332c`).

Piano originario del 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e` con modelli statici da riconfermare al passo 0). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Split per dipendenze** (v. §PO): **18.7a** (D2, D3, TD-19.1-d) indipendente dall'Epic 17; **18.7b** (M8 dopo la 16.8; D1 dopo 17.2 e 17.6).

## Story

As an **admin a 1280 px**,
I want vedere la colonna Azioni del registro, intestazioni che restano, il fuori servizio a portata e una Panoramica che sta in poche schermate,
so that centinaia di px di tabella non siano fuori schermo (ui D2), le intestazioni siano sticky (D3), il fuori servizio non sia sepolto (M8), e la home non cresca con la flotta (D1 residuo dopo 17.2).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.7»; `ui-review.md` D1, D2, D3, M8; TD-19.1-d (`19-1-rimozione-dominio-ppr.md` §7: KPI a 4 colonne e 3+1 fra 901-1200).

## Stato su HEAD

- **D2**: Registro voli 11 colonne in `COLS` (`logbook-console.tsx:212-214`) dentro `.logbook{overflow-x:auto}` (`airops.css:1052`); a 1280 il contenitore nasconde **404 px** (i 354 dell'audit + 50 della colonna persona 150→200, 19.12b D-f); a 1440 ≈ 244, a 768 ≈ 748; PIC e Azioni (Elimina/Modifica, `:665-690`) fuori vista senza affordance. Piloti (`pilots-console.tsx:345`) ≈ 130 px nascosti a 1280; il secondo bottone d'azione è tagliato. Modello verificato: `.lb-row > :last-child{position:sticky; right:0; background}` tiene Azioni al bordo destro; le righe sono larghe quanto il contenitore, non quanto le tracce (scorrendo bordo e hover si interrompono) → `width:max-content; min-width:100%`.
- **D3**: `position: sticky` solo su sidebar (`:129`), topbar (`:235`) e piè di pannello. `.logbook` e `.students` (`:642-645`) hanno `overflow-x:auto` e `.card` `overflow:hidden` (`:457-463`): entrambi sono scroll container anche in verticale, quindi un `.header{position:sticky; top:0}` resta agganciato al contenitore e scorre via con la pagina (modello: −678 px dopo 800 px). Si aggancia alla pagina solo con `clip` (ma sparisce lo scorrimento orizzontale) o con un riquadro ad altezza massima che scorre dentro. La topbar desktop è sticky con `z-index` 4 (`:230-236`): un header a `top:0` le finisce sotto. La baseline «116 righe» non vale: tutte le liste sono paginate a 20; il Registro voli è ~2 190 px a 1280.
- **M8**: lo sheet della flotta ha solo «Modifica» (`fleet-console.tsx:325-349`, `aircraft-edit-mobile`); il fuori servizio sta nella sezione Disponibilità (`aircraft-editor.tsx:314-316`; logica `:655-1027`: motivo obbligatorio, conteggio con debounce `:726-744`, doppio passo `:755-758`, domanda `:985`, «Rimetti in servizio» `:887`) **dopo** Identità e Tariffe (`:298-312`, tariffe `:565`); baseline «744 px» da rimisurare; la 16.8 tocca lo stesso editor (`ArchiveSection :1029`, remount `fleet-console.tsx:311`).
- **D1**: la timeline della Panoramica mostra tutti i velivoli non archiviati (`dashboard/page.tsx:301` → `:642-666`; dopo la 17.2 solo prenotati + fuori servizio); il widget Velivoli mostra i primi 100 (`:258`, `:423`, `fleet-card.tsx:70-76`; dopo la 17.6 «Mostrati i primi 100 · Vedi tutti»); con `.split` 2fr/1fr (`airops.css:877-881`) una scheda per riga ≈ 189 px → 100 schede ≈ 19 000 px; la tabella prenotazioni ha 8 righe (`:68`). «33 313 px» non è più una baseline; i «~3 000 px» si raggiungono solo cappando il widget.
- **TD-19.1-d**: `.kpi-row` 5 colonne (`:367-371`), 3 a ≤ 1200 (`:1598-1599`); **4 KPI su sei superfici** (Panoramica `dashboard/page.tsx:536`, landing istruttore `:923`, landing pilota `:1068`, Statistiche `reports/page.tsx:134`, Registro voli `logbook/page.tsx:222`, Istruttori `instructors/page.tsx:87`) → quinta colonna vuota sopra 1200 e 3+1 fra 901 e 1200; precedente `.scadenze-kpi-row{repeat(4,1fr)}` (`:2875`); Compensi ha 5 KPI (`my-compensation/page.tsx:98`).

## Acceptance Criteria

### 18.7a — D2, D3, TD-19.1-d

1. *Given* ≥ 1 volo (e un pilota) a 1280 e 1100 *Then* il centro di Elimina/Modifica della prima riga del Registro voli e il secondo bottone dei Piloti sono hit-testable con `elementFromPoint` senza scroll. Rosso su HEAD.
2. **D3** secondo §PO Q-18.7-a (con A: dopo 800 px di scroll l'intestazione è visibile e il suo `top` è ≥ il bordo inferiore della topbar; rosso su HEAD).
3. A 1280 il bordo destro della quarta KPI coincide con quello della riga (±1 px) sulle sei superfici; a 1000 nessuna card sta da sola su una riga; nessun valore KPI tagliato (Ricavi sul DB di carico); Compensi invariato. Decisione tecnica: 4 KPI → 4 colonne sopra 1200 e 2+2 fra 901 e 1200.
4. Due temi: celle sticky opache, sotto popover e pannelli.

### 18.7b — M8, D1

5. **M8** secondo §PO Q-18.7-b (con A: dallo sheet un tocco porta al campo del motivo **a fuoco e nel viewport**; rosso su HEAD).
6. **D1**: con fixture run-unique, aggiungere velivoli liberi non aumenta l'altezza della Panoramica (assert sul delta, mai uguaglianza); widget secondo §PO Q-18.7-c con «Vedi tutti»; il conteggio fleet-wide del sottotitolo resta invariato (`aog-overview-count.spec.ts:126`). Nessun cap sulle righe della giornata (sono il lavoro dell'admin). Target espresso come invarianza + un numero su fixture dichiarata (come Q-17.2-d).

Per entrambe: misure a 1280 (anche 1100, 1440, 768), due temi; M8 a 375; `npm run gates` + e2e via `scripts/e2e.sh` verdi.

## Dev Notes

**Blast radius**: `logbook-console.tsx`, `pilots-console.tsx`, `airops.css`, `fleet-console.tsx`, `aircraft-editor.tsx` (prop di sezione/focus iniziale), `dashboard/page.tsx`, `fleet-card.tsx`, `messages`. **e2e da guardare**: `flights.spec.ts` (4 su `flight-pic-cell`, 2 su decolli/atterraggi se si fondono colonne); `mobile-registries.spec.ts:310-333` (sheet flotta) e `:896` (`^="mobile-fleet-"` = 0 sulla Panoramica); `mobile-a11y-sweep.spec.ts:228`, `:281`; `aircraft-out-of-service-until.spec.ts` e `aog-impact-email.spec.ts` (fuori servizio dall'editor: restano); `mobile-overview.spec.ts:255-258` (ordine dei KPI); `home-dashboard.spec.ts:145-148`. I `^="ac-card-"` stanno su /fleet: il cap del widget non li tocca.

**Discriminanze** (rosse su HEAD; mutanti solo su copia isolata con sha256): AC 1, 2, 3, 5; mutanti via sticky, via la classe a 4 colonne, via il focus iniziale.

**Trappole**: sticky dentro scroller annidati e sotto la topbar (sopra); `overflow: clip` non crea scroll container ma taglia lo scorrimento; niente `mobile-fleet-*` sulla Panoramica; azione nuova dello sheet `aircraft-out-of-service-mobile` (modello `aircraft-edit-mobile`; nessun `^=` su `aircraft-`); `SlideOver` mette il focus sul pannello nel suo effetto (`slide-over.tsx:65`), che gira **dopo** quelli dei figli → un focus sul motivo deciso da un figlio viene sovrascritto: serve un prop di focus iniziale o un `requestAnimationFrame`; il `key` di remount (`fleet-console.tsx:311`) deve cambiare se si apre la scheda «per il fuori servizio» sullo stesso velivolo; cap per rango, mai per posizione nel DOM (lezione 15.8b); i18n «fuori servizio» (`BANNED` «AOG», «fermo»), «Vedi tutti gli N» ICU plural.

**Dimensione**: totale ~16-22 file, +800-1 200 (≈ 0,4 della 19.7a); 18.7a ~8-10 file +300-500; 18.7b ~8-10 file +400-600.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.7-a** = A: la tabella scorre dentro il suo riquadro alto quanto lo schermo (max-height legata al viewport sotto la topbar): intestazione e colonna Azioni sempre visibili, a ogni larghezza desktop.
- **Q-18.7-b** = A: «Metti fuori servizio» nello sheet del velivolo apre la scheda già sulla sezione Disponibilità col cursore nel motivo; restano conteggio, conferma ed email di oggi.
- **Q-18.7-c** = A: widget «Velivoli» della Panoramica a 8 schede (prima i fuori servizio, poi quelli con voli oggi, poi per marche — per rango, mai per posizione nel DOM) con «Vedi tutti gli N» (supera il «Mostrati i primi 100» della 17.6, che lo dichiara nel frattempo).
- **Split** = sì: **18.7a** (AC 1-4) e **18.7b** (AC 5-6; M8 dopo la 16.8, D1 dopo 17.2 e 17.6).


## Dev Agent Record

### Agent Model Used

Per lo sviluppo della 18.7a è stata selezionata la configurazione GPT 6.2 Astra xhigh. Il processo di sviluppo non espone una misura indipendente del modello effettivo.

### Completion Notes List

**18.7a, AC 1–4 (2026-11-26).** Base `a7dff74c6572308632901ee7a0776cfa720892cd`. Tree finale di codice e test `7c73be797f1fe3e3826ae00fc478d062b3b50580`. Le misure iniziali e finali sono state prese sulle pagine italiane in Chromium con database sintetici e SMTP locale. L'implementazione lascia alla 18.7b gli AC 5–6.

| AC | Riscontro dall'interfaccia |
|---|---|
| 1 | A 1280 px, sulla base il centro di entrambi i pulsanti del Registro e quello del secondo pulsante dei Piloti erano irraggiungibili senza scroll orizzontale. Sul candidato entrambi i pulsanti ricevono il puntatore, anche su righe successive dopo lo scroll nei due assi. I test aprono Modifica e provano l'altra azione senza confermare scritture. |
| 2 | Prova con 20 voli e 20 persone filtrati per esecuzione. Nei due temi e a otto larghezze desktop da 641 a 1440 px, dopo 800 px reali di scroll interno l'intestazione è visibile sotto la topbar. A 1280×400 sul carico il suo top è 65,73 px e la topbar termina a 63,84 px. La regione ha nome accessibile, si attraversa da tastiera e risponde alle frecce in entrambi gli assi. A 375 px si apre lo sheet mobile. |
| 3 | Le quattro KPI occupano tutta la riga a 1280 px su Panoramica admin, home istruttore e pilota, Statistiche, Registro e Istruttori. A 1000 px sono due per riga. Verificati anche Statistiche con tre KPI quando manca l'orario di apertura e Compensi con cinque. Sul DB di carico con 60.018 voli il Registro mostra integralmente «15.589.074,93 €». A 1280 px il simbolo va a capo. |
| 4 | In chiaro e scuro l'alpha di intestazione, angolo e celle Azioni è 255. I punti effettivamente sovrapposti dal pannello o dal popover Export ricevono l'interazione dell'overlay. |

Le [264 misure prima/dopo](evidence/18-7a/misure.csv) e il [registro delle prove](evidence/18-7a/riscontri.md) includono i database usati, le misure sul carico, i confronti CSS su copia isolata, i comandi e gli errori dei tentativi precedenti. Screenshot a 1280 px in chiaro [prima](evidence/18-7a/registro-prima-light.png) e [dopo](evidence/18-7a/registro-dopo-light.png), in scuro [prima](evidence/18-7a/registro-prima-dark.png) e [dopo](evidence/18-7a/registro-dopo-dark.png).

Gate finale `npm run gates`, exit 0: lint, typecheck, 2.351 unit e build. Dopo `npm run db:reset:test` su DB locale dedicato, `scripts/e2e.sh start --workers=2` ha restituito `E2E_EXIT=0`. Dei 713 casi, 710 sono passati al primo tentativo e tre al primo retry, nessuno saltato. I cinque casi nuovi, il controllo desktop di Billing e i tre casi METAR sono passati al primo tentativo. I tre flaky riguardano Mailpit, la controprova mobile Statistiche e lo sheet transazioni personali. Comandi, codici, righe sanitizzate e diagnostica della prima suite interrotta sono nel [registro delle prove](evidence/18-7a/riscontri.md).

### Revisione indipendente 18.7a

Il 2026-11-26 il revisore GPT 6 Sol xhigh ha approvato gli AC 1–4 sul tree `7c73be797f1fe3e3826ae00fc478d062b3b50580`, commit `c09f2b8`. Ha verificato su un database sintetico separato la raggiungibilità delle azioni prima e dopo lo scroll, l’ordine di sovrapposizione, la tastiera, il nome accessibile delle regioni e la griglia KPI. Il full finale ha completato 713 casi con tre retry e zero skip. Chiuso il TD-19.1-d relativo alla disposizione dei quattro KPI. [Rapporto del revisore](evidence/18-7a/review.md).

### File List

- `src/styles/airops.css`
- `src/app/[locale]/dashboard/(home)/page.tsx`
- `src/app/[locale]/dashboard/instructors/page.tsx`
- `src/app/[locale]/dashboard/logbook/logbook-console.tsx`
- `src/app/[locale]/dashboard/logbook/page.tsx`
- `src/app/[locale]/dashboard/pilots/pilots-console.tsx`
- `src/app/[locale]/dashboard/reports/page.tsx`
- `e2e/db-fixtures.ts`
- `e2e/desktop-registries.spec.ts`
- `e2e/empty-18-2b.spec.ts`
- `_bmad-output/implementation-artifacts/evidence/18-7a/`

### 18.7b — Sviluppo e prove degli AC 5–6

Base `cdd819daa8dd33320bde4795c09caa248800eb7c`. Tree finale di codice e test `ec72d87fe283df6e054712df0c82a71273641a84`. Per lo sviluppo è stata selezionata la configurazione GPT 6.2 Astra xhigh. Il processo non espone telemetria indipendente sul modello effettivo.

| Criterio | Esito osservato |
|---|---|
| AC 5, fuori servizio dal telefono | A 375 × 812, l'admin passa dallo sheet al campo del motivo con un tocco. In chiaro e scuro l'azione misura 166,5 × 44 px e il campo a fuoco è interamente visibile, da y 385,98 a 441,67. Verificati riapertura dello stesso velivolo, motivo obbligatorio, annullamento e conferma, anteprima e conteggio autorevole, email acquisita da Mailpit. Con Back il focus torna alla tessera, con un altro Back si torna alla pagina precedente. Già fuori servizio e archiviato conservano le rispettive operazioni in «Modifica». Le home di pilota, allievo e istruttore mantengono i propri contenuti e il normale reindirizzamento da Flotta. |
| AC 6, Velivoli in Panoramica | La selezione sull'intera flotta attiva mostra al massimo otto schede ordinate per fuori servizio, attività del giorno e marche. Conta come attività sia un volo registrato nel giorno di Roma sia una prenotazione approvata che lo interseca. Nella fixture da 127 attivi tutti gli otto mostrati si trovano oltre la posizione 100 per marche. Il KPI conta 116 disponibili ora su 125 operativi e il sottotitolo 2 fuori servizio. Aggiungendo 110 velivoli liberi ai 17 iniziali la pagina resta a 3.437 px a 1280, con delta misurato di 0 px in entrambi i temi a tutte e cinque le larghezze. Le 13 righe operative restano visibili nella timeline. Sul carico sintetico (1.460 attivi) restano tutte le 185 righe della giornata, mentre il widget passa da 12.943 a 1.238 px a 1280. |

Le [60 misure](evidence/18-7b/misure.csv) coprono 375, 768, 1100, 1280 e 1440 px, in chiaro e in scuro. Il [registro con comandi e diagnostica](evidence/18-7b/riscontri.md) comprende i due bordi della giornata di Roma, la prova touch in Chromium, le soglie 0/1/8/9 attivi in italiano e inglese, la controprova del focus su copia isolata con SHA-256 e il confronto del delta di altezza sulla base. [Schermata iniziale](evidence/18-7b/motivo-prima.png) e [schermata finale](evidence/18-7b/motivo-dopo.png). Non è stata misurata la tastiera virtuale di un dispositivo fisico.

**File di codice e test della 18.7b.** `src/server/services/overview-fleet.service.ts`, `src/app/[locale]/dashboard/(home)/page.tsx`, `src/components/dashboard/fleet-card.tsx`, `src/app/[locale]/dashboard/fleet/fleet-console.tsx`, `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx`, `src/components/ui/slide-over.tsx`, `messages/it.json`, `messages/en.json`, `e2e/aog-impact-email.spec.ts`, `e2e/aog-overview-count.spec.ts`, `e2e/db-fixtures.ts`, `e2e/mobile-reports.spec.ts` (sincronizzazione della controprova), `playwright.config.ts` (isolamento delle due prove sulla flotta).

Sul tree intermedio `9473997e`, `npm run gates` ha dato exit 0 (lint, typecheck, 2.351 unit, build). Nel precedente run completo, la controprova di clipping di Statistiche misurava durante il caricamento: 649 passati al primo tentativo, 2 recuperati al retry, 1 fallito e 63 non eseguiti, `E2E_EXIT=1`. Il test finale aspetta il contenuto reale e verifica lo stile calcolato prima delle asserzioni geometriche. Nelle ripetizioni isolate del filtro «AC 11» sono passati 16/16, senza retry.

Il run completo `9473997e` ha avuto exit 0 con 708 passati al primo tentativo e 7 al primo retry. Due retry erano dovuti ai test della flotta globale che si eseguivano contemporaneamente e si modificavano i dati a vicenda. Sul candidato finale il progetto dedicato li esegue uno per volta, preservando i due worker globali e tutte le asserzioni.

Sul tree finale `ec72d87f`, `npm run gates` ha dato exit 0, con 2.351 unit e build. Le tre ripetizioni dei due test della flotta con due worker globali hanno riprodotto un fallimento di 68 px nella configurazione precedente. Nel progetto isolato finale entrambi i test sono passati in tutte e tre le ripetizioni senza retry, 6/6.

La suite browser finale (`E2E_REUSE_SERVER=1 scripts/e2e.sh start --workers=2`) ha concluso in 29,7 minuti con `E2E_EXIT=0`. Su 715 casi Playwright ne riporta 712 passati e 3 flaky recuperati al primo retry, con zero skip definitivi. AC 5 (7,5 s), AC 6 (4,4 s) e conteggio storico della flotta (2,6 s) sono passati al primo tentativo, così come i cinque casi desktop 18.7a, i tre METAR e i cinque del progetto picker-cap. I retry riguardano la preparazione del pilota per l'estratto conto, l'attesa della riga di un volo registrato e il feedback SMTP locale nelle Impostazioni. Nel gruppo seriale Impostazioni sono stati ripetuti sedici casi già verdi e recuperati due sospesi al primo giro. Il [registro conclusivo](evidence/18-7b/riscontri.md#suite-completa-sul-candidato-finale) conserva i tre errori sanitizzati, le durate dei retry e il comando esatto.

### Revisione indipendente 18.7b

Il revisore in un contesto separato, configurato con GPT 6 Sol xhigh, ha approvato il tree `ec72d87fe283df6e054712df0c82a71273641a84`, commit `d675dd332c`. Ha verificato il percorso mobile per stato del velivolo e ruolo, il rango delle otto schede, i bordi della giornata di Roma nei cambi di ora e l’isolamento delle due prove sulla flotta. Nessun rilievo bloccante. Gli AC 1–6 della 18.7 risultano completati. [Verdetto ed evidenze](evidence/18-7b/revisione.md)
