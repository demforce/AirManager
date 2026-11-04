---
baseline_commit: 1f6ab3e
---

# Story 18.7: Desktop — colonne, intestazioni, fermo velivolo, Panoramica

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e` con modelli statici da riconfermare al passo 0). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Split per dipendenze** (v. §PO): **18.7a** (D2, D3, TD-19.1-d) indipendente dall'Epic 17; **18.7b** (M8 dopo la 16.8; D1 dopo 17.2 e 17.6).

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

### Completion Notes List

### File List
