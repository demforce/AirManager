# Epic 12 — Sostituzione totale della UI con il design "AirOps" + build-out backend

**Data**: 2026-07-14 · **Stato**: approvato dall'utente (brainstorming 2026-07-14, 4 sezioni + 3 ratifiche di dominio)
**Fonte visiva**: prototipo Claude Design (progetto `41ada161-b4c8-4573-8695-c752b2ced6d6`), mirror completo committato in `docs/design-reference/airops/` — è la fonte di verità per markup, classi CSS e comportamento delle viste.

## 1. Obiettivo

Sostituire integralmente la UI attuale di AirManager con il design system del prototipo "AirOps" (CSS custom + primitive React), ricablando ogni vista sui dati reali via service layer/API v1, ed estendere il backend dove il design richiede funzionalità nuove. La nuova UI è la fonte di verità dello scope: pagine e endpoint che non usa vengono rimossi.

## 2. Decisioni ratificate (vincolanti)

| # | Decisione |
|---|---|
| D1 | **i18n**: next-intl resta, IT è la lingua sorgente (stringhe del prototipo), EN tradotto insieme. Routing `/[locale]/` invariato. |
| D2 | **Design system**: port "as-is" — `styles.css` quasi verbatim, primitive convertite in componenti TypeScript con le stesse classi semantiche. NIENTE riespressione in Tailwind; shadcn/ui va in pensione a fine epic. |
| D3 | **Branding**: il prodotto resta **AirManager**; club name/ICAO accanto al brand vengono da Settings (il testo "AirOps"/"LIML" del prototipo è placeholder). |
| D4 | **Gestione utenti**: nessuna pagina utenti dedicata — creazione/sospensione/riattivazione account avviene dalle azioni di Piloti/Istruttori. |
| D5 | **Scuola**: area school **eliminata da UI e API** (routes `dashboard/school`, `api/v1/school/*`, servizi e test). Le tabelle DB restano (nessuna migrazione distruttiva); rimozione tabelle rinviata. |
| D6 | **Backend build-out completo**: stats API, compensi istruttori, estratti conto PDF, METAR live, workflow prenotazioni, campi aeromobile additivi. |
| D7 | **Workflow prenotazioni**: nuovi stati `PENDING/APPROVED/DENIED/FLOWN/NO_SHOW/CANCELLED`. Pilota/allievo/istruttore creano PENDING; staff/admin creano APPROVED; rifiuto con motivazione obbligatoria inviata via email; Effettuato/Assente azioni manuali staff su APPROVED; Riapri → PENDING. Migrazione: ACTIVE → APPROVED. |
| D8 | **Compensi istruttori**: nuovo campo `payoutRate` (tariffa pagata all'istruttore, distinta da `InstructorRate` addebitata all'allievo) su InstructorProfile + nuovo modello `InstructorPayout`. Dovuto = ore voli SCHOOL con quell'istruttore × payoutRate − payout registrati. |
| D9 | **Contabilità**: "Estratti conto" = PDF per pilota su periodo (riuso infrastruttura PDF). Bottone "Esegui fatturazione" **eliminato** (nessun motore fatture). |
| D10 | **Feature perse accettate**: pacchetti ore (`package-types`, HourPackage UI) e flusso expiry-proposals spariscono da UI e API. |
| D11 | **Formati**: date DD/MM/YYYY (`formatDateOnly`), money TD-5 (`1.500,00 €`), giorni in Europe/Rome — i formati ad-hoc del prototipo si sostituiscono con i formatter reali. |
| D13 | **Il contratto di dominio vince sul prototipo**: dove un form del prototipo contraddice regole già ratificate, comanda il backend. In particolare "Nuova voce" del Registro voli segue il contratto Epic 11 (orari decollo/atterraggio + aeroporti OBBLIGATORI, durata e costo DERIVATI server-side, decolli/atterraggi editabili) — i campi manuali `dur`/`cost` del prototipo non si portano. I campi pilota/istruttore free-text dei form diventano selettori tipizzati sulle entità reali (Person/InstructorProfile/Aircraft). |
| D12 | **Delivery**: un epic (`epic-12-airops-ui` da main), una PR, 13 story in ordine backend-prima-della-UI, gates verdi per story, full e2e CI-mode a fine epic. Leftover npm-init-playwright scartati (fatto). |

## 3. Mappa delle pagine (routing definitivo)

Tutte sotto `/[locale]/dashboard/...`, sidebar a 4 gruppi (Operazioni / Anagrafiche / Archivio / Sistema) come nel prototipo (`Sidebar.jsx`), nav = `<Link>` con badge a conteggi reali.

| Pagina (IT) | Route | Vista prototipo | Dati / API |
|---|---|---|---|
| Panoramica | `/dashboard` | `App.jsx#AdminOverview` | KPI reali (voli oggi, flotta disponibile, PPR pending, prenotazioni pending, ricavi mese), Schedule, BookingsTable, ScadenzeWidget, FleetCard |
| Pianificazione | `/dashboard/bookings` | `Schedule.jsx` + `Ops.jsx#BookingsTable` | `bookings`, `bookings/calendar`; timeline giorno/settimana per aeromobile, now-line, filtri tipo/istruttore, calendario popover |
| Richieste PPR | `/dashboard/ppr` | `Ops.jsx#PPRView` | `ppr-requests` (approva/rifiuta/riapri, PPR manuale, link modulo pubblico) |
| Voli in transito | `/dashboard/movements` | `Ops.jsx#VisitingView` | Sostituisce `ppr/register`. Stati DERIVATI dal ciclo PPR approvato: atteso (ETA futura), in arrivo (ETA oggi non passata), al suolo (ETA passata, non chiuso), partito (chiuso COMPLETED). "Registra arrivo" = PPR manuale auto-approvato. Nessun nuovo modello. |
| Piloti | `/dashboard/pilots` | `People.jsx#PilotsView` + `PilotProfile.jsx` | `people` (+profili), `users` (invito/sospendi/riattiva), `accounts` (saldo, "Registra" = top-up), `expiries` (medico/licenza/abilitazioni nel profilo), `flights` (voli recenti). Include allievi (badge ruolo derivato dai profili). |
| Istruttori | `/dashboard/instructors` | `People.jsx#InstructorsView` + `InstructorProfile.jsx` | `people` (instructor profiles) + compensi (nuova API): ore, dovuto, "Paga", "Ciclo pagamenti" |
| Aeromobili | `/dashboard/fleet` | `Fleet.jsx` | `aircraft` + campi additivi; AOG = OUT_OF_SERVICE (con motivo); "Riservato" derivato da prenotazioni correnti |
| Scadenze | `/dashboard/expiries` | `ScadenzeView.jsx` | `expiries`, `expiry-types`; finestre 7/30/60, "Invia promemoria" = job alert esistente |
| Registro voli | `/dashboard/logbook` | `LogbookView.jsx` | `flights` (+export xlsx/pdf esistenti); "Nuova voce" = POST /flights |
| Contabilità | `/dashboard/billing` | `BillingView.jsx` | Ledger unificato AccountMovement ∪ CashMovement (colonna pilota vuota per movimenti di cassa); filtri tipo (= cash categories)/pilota/date; "Nuova transazione"; "Estratti conto" PDF; KPI reali |
| Statistiche | `/dashboard/reports` | `ReportsView.jsx` | Nuova stats API (mese/anno) |
| Impostazioni | `/dashboard/settings` | `SettingsView.jsx` | `settings/*` (club/ICAO/email, finestra pianificazione, tassa PPR, istruzioni operative), SMTP (nuovi settings + "email di prova"), catalogo Abilitazioni = `expiry-types` (validità in mesi, 0 = senza scadenza), stazione METAR |
| Auth | `/(auth)/login`, `set-password`, `forgot-password` | — (nuovo, nel linguaggio del design) | API auth esistenti |
| Modulo PPR pubblico | `/ppr` | `PPR Request.html` | POST `ppr-requests`; dati aeroporto (ICAO, orari, frequenza/pista/circuito da settings dove esistono, altrimenti omessi) |

**Landing per ruolo** (stessa shell, home diversa): ADMIN+STAFF → console completa; INSTRUCTOR → `InstructorView` (la mia giornata, ore/dovuto mese); PILOT+STUDENT → `PilotLanding` (saldo, licenza/medico, prossimi voli, prenota). **Ratifica 2026-07-14**: gli allievi (STUDENT) NON creano prenotazioni — RBAC invariato; la CTA "Prenota volo" è nascosta per STUDENT (prenota staff/istruttore per loro). Sidebar filtrata per ruolo (le voci amministrative spariscono per pilot/student; instructor vede solo le sue superfici). Il pannello Tweaks del prototipo NON si porta: ruolo = sessione reale.

**Widget meteo sidebar**: METAR live dalla stazione configurata (fetch server-side aviationweather.gov, cache ~10 min, categoria VFR/MVFR/IFR derivata); card nascosta se non configurata o fetch fallito.

## 4. Architettura del port

- `styles.css` → `src/styles/airops.css` importato da `globals.css`; temi via `data-theme` su `<html>`, toggle in TopBar persistito in cookie (niente flash SSR).
- Font via `next/font` (Inter Tight, JetBrains Mono, Instrument Serif) — self-hosted.
- Primitive in `src/components/ui/`: `Badge`, `KPI`, `Spark`, `Avatar`, `SlideOver`, `Field/Input/Select/InputGroup`, `SegmentedControl`, `ExportMenu`, `Toast`, `CalendarPopover`, `Icon.*` — markup e classi 1:1 col prototipo, props tipizzate, stringhe via next-intl.
- Shell `/dashboard`: layout server component (sessione/ruolo) + `Sidebar`/`TopBar` client; breadcrumb `AirManager / <ICAO> / <pagina>`.
- Pagine: server component per il fetch (service layer) + client component per interattività; mutazioni via API v1 (API-first per Flutter invariato).
- Tailwind resta installato finché le pagine legacy esistono; a fine epic si rimuovono i componenti shadcn orfani e ogni residuo. CLAUDE.md aggiornato (stack UI = design system AirOps).

## 5. Estensioni backend (dettaglio)

1. **Prenotazioni** (D7): migrazione enum + colonne decisione (decidedAt/decidedBy/denyReason, flownAt/noShowAt); endpoint di transizione (approve/deny/flown/no-show/reopen) con RBAC (staff/admin decidono); email di rifiuto con motivazione; i controlli scadenze/conflitti esistenti si applicano alla creazione E all'approvazione.
2. **Compensi istruttori** (D8): `InstructorProfile.payoutRateCents` (nullable → istruttore senza compenso configurato mostra "—"); modello `InstructorPayout { id, instructorProfileId, amountCents, periodStart, periodEnd, method, notes, actorUserId, createdAt }`; API: GET riepilogo compensi (ore da `Flight` SCHOOL per istruttore, dovuto, payout storici), POST payout (singolo e ciclo). Le ore derivano dai voli reali — nessuna cache.
3. **Contabilità** (D9): endpoint lista unificata (union AccountMovement+CashMovement con cursore data), POST transazione (addebito/pagamento su conto pilota o movimento cassa), GET estratto conto PDF per persona+periodo (riuso `pdf` infra, cap 2k righe → 422 EXPORT_TOO_LARGE come da convenzione).
4. **Stats API**: `GET /api/v1/stats?period=month|year&ref=YYYY-MM` (admin/staff): kpis{ricavi, ore, movimenti, quotaTransiti, utilizzoFlotta}, serie mensili (ricavi, ore, transiti — 6/12 punti), utilizzoFlotta per aeromobile, composizione movimenti (basati/transiti/scuola/noleggio da FlightType+PPR), oreIstruttori (con dovuto), classifiche per aeromobile (ore, ricavo) e pilota (top 10: ore, spesa). Utilizzo flotta = ore volate / (finestra prenotabile da settings × giorni × aeromobili operativi).
5. **METAR**: `AppSetting` stazione (default ICAO aviosuperficie); route server con cache 10 min su aviationweather.gov; parsing minimo (vento, visibilità, QNH, temperatura, categoria volo).
6. **Aeromobili**: campi additivi `seats`, `fuelType`, `owner (CLUB|PRIVATE)`, `based (bool)`; `AircraftRate.dryHourlyRateCents` opzionale. Nessun cambio a pricing/contaore.
7. **SMTP settings**: host/porta/sicurezza/utente/password/mittente in AppSetting (password write-only nella UI), "Invia email di prova"; il mailer esistente legge da settings con fallback alle env var attuali (env contract e `env.ci-sync.test.ts` aggiornati nello stesso commit).

## 6. Rimozioni (UI + API + servizi + test relativi)

- `dashboard/school` + `api/v1/school/*` (students, summaries) e servizi scuola.
- `dashboard/users` (pagina; le API users restano SOLO per invito/sospensione/riattivazione usate da Piloti).
- `dashboard/finance` e sottopagine (categories/packages/report) — sostituite da Contabilità+Statistiche; le API `cash-categories`/`cash-movements`/`cash-report(+pdf)` restano (usate da Contabilità/Statistiche/estratti); `package-types` API e UI eliminate (D10).
- `dashboard/expiries/types` come pagina (il catalogo vive in Impostazioni); API `expiry-types` resta.
- `api/v1/expiry-proposals*` + flusso proposte (D10).
- `dashboard/flights`, `dashboard/people`, `dashboard/aircraft`, `dashboard/ppr/register` (sostituite dalle nuove route).
- Componenti condivisi legacy (`data-table.tsx`, `export-button.tsx`, `search-combobox.tsx`) e componenti shadcn orfani a fine epic.
- Tabelle DB scuola/pacchetti: restano dormienti (nessuna migrazione distruttiva in questo epic).
- **Audit finale** (12.13): ogni endpoint v1 rimasto senza consumer nella nuova UI (es. `accounts/negative-balances` se nessuna vista lo usa) viene rimosso, con verifica sull'OpenAPI generato.

## 7. Test e qualità

- Ogni story aggiorna/riscrive i suoi e2e nello stesso commit (selettori scoped al landmark, niente `hasText` su H:MM/date — convenzioni esistenti). I conteggi calano solo per le feature droppate.
- Unit test per: transizioni workflow prenotazioni, calcolo compensi, union ledger, aggregazioni stats (con fixture deterministiche), parsing METAR (fixture offline), settings SMTP.
- `npm run gates` verde per ogni story; a fine epic full e2e CI-mode su DB fresco (build di produzione).
- Verifica UI interattiva via Playwright MCP durante dev/review; skill `design-taste-frontend` + `ui-ux-pro-max` per le story UI (regola di progetto); coerenza visiva = il prototipo in `docs/design-reference/airops/`.

## 8. Piano di consegna (story dell'epic)

1. **12.1** Fondamenta design system: airops.css, font, tema, primitive, shell Sidebar/TopBar, layout dashboard, pagine auth nel nuovo linguaggio.
2. **12.2** Backend workflow prenotazioni (enum, migrazione ACTIVE→APPROVED, transizioni, email rifiuto).
3. **12.3** Pianificazione + Prenotazioni (Schedule timeline, week view, filtri, BookingsTable, NewBooking/NewFlight slide-over).
4. **12.4** PPR: console richieste + modulo pubblico + Voli in transito (stati derivati).
5. **12.5** Aeromobili: campi additivi + pagina fleet + editor.
6. **12.6** Piloti: registry, profilo slide-over, editor, sospendi/riattiva, registra pagamento.
7. **12.7** Istruttori: payout backend (modello+API) + pagina + profilo + ciclo pagamenti.
8. **12.8** Registro voli (logbook + nuova voce + export).
9. **12.9** Contabilità: ledger unificato + nuova transazione + estratti conto PDF.
10. **12.10** Stats API + pagina Statistiche.
11. **12.11** Scadenze + Impostazioni (club, pianificazione, SMTP, abilitazioni, METAR widget).
12. **12.12** Panoramica (KPI reali) + landing per ruolo (pilota/allievo, istruttore).
13. **12.13** Rimozioni (sezione 6) + pulizia shadcn/legacy + aggiornamento CLAUDE.md + sweep e2e finale.

Dipendenze: 12.2 prima di 12.3; 12.5 prima delle card fleet in 12.12; 12.7 prima dei compensi in Contabilità (KPI) e Statistiche; 12.10 dopo 12.4/12.8 (dati transiti/ore). Le rimozioni per area possono anticiparsi nella story dell'area quando la nuova pagina sostituisce la vecchia (es. `ppr/register` cade in 12.4); la 12.13 è la scopa finale.

## 9. Fuori scope (esplicito)

- App mobile Flutter (le API v1 restano il contratto; il breaking del workflow prenotazioni è ratificato — nessun consumer esterno esiste).
- Motore di fatturazione (D9), pagamenti online, notifiche push.
- Rimozione tabelle DB scuola/pacchetti (migrazione distruttiva rinviata).
- Deferred pre-esistenti non toccati dall'epic (v. HANDOFF).
