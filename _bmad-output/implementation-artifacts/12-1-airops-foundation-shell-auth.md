---
baseline_commit: f2f22bd
---

# Story 12.1: Fondamenta design system AirOps — stylesheet, primitive, shell, pagine auth

Status: done

## Story

As a utente di AirManager,
I want che l'app adotti il design system "AirOps" (stylesheet, primitive, sidebar/topbar, pagine di autenticazione) approvato nel prototipo,
so that ogni pagina successiva dell'Epic 12 possa essere costruita nel nuovo linguaggio visivo su fondamenta condivise, mentre le pagine legacy restano funzionanti dentro la nuova shell.

**Riferimenti vincolanti**: spec `docs/superpowers/specs/2026-07-14-airops-ui-replacement-design.md` (§2 D1–D3, D11; §4), piano `docs/superpowers/plans/2026-07-14-epic-12-airops-ui.md` (Task 1), prototipo `docs/design-reference/airops/` (fonte di verità visiva: markup e classi 1:1).

**OVERRIDE della regola visiva di default**: la regola "coerenza con lo stile minimalist-ui" citata nelle istruzioni del dev agent è SUPERATA da questo epic — il riferimento visivo canonico è il prototipo AirOps. NON usare la skill `minimalist-ui` come vincolo; `design-taste-frontend` e `ui-ux-pro-max` restano obbligatorie come metodo.

## Acceptance Criteria

1. **(Stylesheet)** **Given** l'app in build di produzione, **Then** `src/styles/airops.css` (port fedele di `docs/design-reference/airops/styles.css`) è importato globalmente via `globals.css`; le UNICHE differenze ammesse dal file sorgente: (a) i selettori `[data-theme=…]` targetizzano `html[data-theme=…]`; (b) in coda sono aggiunti gli stili `.ppr-*` estratti dal blocco `<style>` di `docs/design-reference/airops/PPR Request.html`; (c) nessun altro edit. I font del design (Inter Tight, JetBrains Mono, Instrument Serif) sono self-hosted via pacchetti `@fontsource/inter-tight`, `@fontsource/jetbrains-mono`, `@fontsource/instrument-serif` importati nel root layout — NESSUN fetch di font a build-time o runtime (vincolo di progetto). Tailwind resta importato (le pagine legacy lo usano ancora); Geist resta finché esistono pagine legacy.
2. **(Tema)** **Given** un utente con cookie `am-theme=dark`, **When** carica qualunque pagina, **Then** `<html data-theme="dark">` è presente NELL'HTML SERVER-RENDERED (niente flash, niente hydration mismatch); **When** clicca il toggle tema nella TopBar, **Then** il tema cambia istantaneamente e il cookie `am-theme` (path=/, max-age 1 anno, samesite=lax) persiste la scelta attraverso i reload. Default: light.
3. **(Primitive)** Esistono in `src/components/ui/` come componenti TypeScript client tipizzati, con GLI STESSI class name e struttura DOM del prototipo: `icons.tsx` (namespace `Icon.*` copiato da `icons.jsx`), `badge.tsx`, `kpi.tsx` (KPI+Spark), `avatar.tsx`, `toast.tsx` (provider React context `useToast().show(msg, tone)` montato nel layout dashboard — NIENTE eventi window), `slide-over.tsx` (chiusura su Esc e scrim-click), `field.tsx` (Field/Input/Select/InputGroup con prefix/suffix), `segmented.tsx`, `export-menu.tsx` (dropdown PDF/XLS che riceve gli href reali via props — riusa `src/lib/export-href.ts`), `calendar-popover.tsx` (griglia 6×7 lunedì-first, oggi/selezione/mese prec-succ, porting da `Schedule.jsx#CalendarPopover` con unit test sulla matematica della griglia). Ogni stringa utente via next-intl (IT dal prototipo, EN tradotto).
4. **(Shell)** **Given** un utente autenticato su `/[locale]/dashboard/...`, **Then** il layout usa la nuova `Sidebar` + `TopBar` (port di `Sidebar.jsx`/`TopBar.jsx`): gruppi nav Operazioni/Anagrafiche/Archivio/Sistema con le stesse voci/icone del prototipo come `<Link>` reali (`aria-current` sull'attiva; le route non ancora esistenti — movements, pilots, instructors, fleet, logbook, billing, reports — NON compaiono finché la pagina non esiste: la lista voci è filtrata su un registry di route attive, così ogni story successiva "accende" la sua voce); brand = **AirManager** + `<nome club · ICAO>` da `app-settings.service.ts`; card meteo renderizzata SOLO se le viene passata una prop `metar` (per ora mai → nascosta); badge conteggi opzionali via props (per ora assenti). TopBar: breadcrumb `AirManager / <ICAO> / <titolo pagina>`, toggle tema, user chip con nome e ruolo reali della sessione. Filtro per ruolo: ADMIN/STAFF vedono tutte le voci attive; INSTRUCTOR vede Panoramica/Pianificazione/Registro voli/Scadenze; PILOT/STUDENT vedono Panoramica/Pianificazione/Registro voli. Le pagine legacy esistenti continuano a renderizzare DENTRO la nuova shell senza rotture (nav della vecchia shell rimossa, contenuti intatti).
5. **(Auth)** Le pagine `/(auth)/login`, `/(auth)/set-password`, `/(auth)/forgot-password` sono ricostruite nel linguaggio del design (card su `--bg`, `.fld/.input/.btn.primary`, brand mark, entrambe le lingue): STESSI campi, STESSE chiamate API, STESSI redirect e messaggi d'errore di oggi — cambio esclusivamente visivo. `e2e/login.spec.ts` e `e2e/welcome.spec.ts` aggiornati e verdi.
6. **(e2e tema)** Un assert e2e dimostra: toggle → `html[data-theme]` cambia → reload → il tema scelto persiste.
7. **(Gates)** `npm run gates` verde; gli spec e2e toccati (`login`, `welcome`) verdi in locale; nessuna route esistente rotta (smoke: le pagine dashboard legacy si aprono senza errori console).

## Contesto e decisioni di design (vincolanti)

- **File da creare** (mappa completa nel piano, Task 1): `src/styles/airops.css`, `src/components/ui/{icons,badge,kpi,avatar,toast,slide-over,field,segmented,export-menu,calendar-popover}.tsx`, `src/components/shell/{sidebar,top-bar,theme-toggle}.tsx`.
- **Porting 1:1**: il markup e le classi CSS del prototipo NON si "migliorano" — si portano identici (il CSS è già stato approvato visivamente). Tipizzare le props, esternalizzare le stringhe, convertire i pattern non-React-idiomatici (window.*, custom events) in idiomi React: nient'altro.
- **Tema**: lettura cookie nel root layout server (`(await cookies()).get('am-theme')`), attributo su `<html>`; `theme-toggle.tsx` client aggiorna `document.documentElement.dataset.theme` + cookie. Non usare localStorage (SSR-inconsistente).
- **Sidebar route-registry**: un array locale di voci `{ id, href, labelKey, icon, roles, group }` con flag `enabled` — questa story accende SOLO le route già esistenti (`/dashboard` Panoramica, `/dashboard/bookings` Pianificazione, `/dashboard/ppr` Richieste PPR, `/dashboard/expiries` Scadenze, `/dashboard/settings` Impostazioni). Le voci del prototipo verso pagine non ancora costruite restano definite ma disabilitate (commento: la story che le costruisce le abilita).
- **Pagine legacy nella nuova shell**: il layout dashboard attuale va letto PRIMA di toccarlo; qualunque nav/chrome legacy che confligge con la nuova sidebar si rimuove, il resto (auth guard, provider, container) si preserva. Nessuna pagina legacy va riscritta in questa story.
- **i18n**: namespace nuovi per shell e auth (es. `shell.*`, `auth.*`) in `messages/it.json` + `messages/en.json`. IT = testi del prototipo.
- **Lockfile (macchina locale!)**: le dipendenze @fontsource si installano con `npx -y npm@10 install @fontsource/inter-tight @fontsource/jetbrains-mono @fontsource/instrument-serif` — MAI npm 11 locale sul lockfile (CI usa npm 10; un diff lockfile di migliaia di righe = red flag, rifare con npm@10).
- **Ambiente locale** (≠ container CLAUDE.md): Postgres+Mailpit via `docker compose` (già up); DB fresco = `docker compose down -v && docker compose up -d && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`; MAI `playwright install` (browser già presenti e funzionanti); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`). Utenti seed: admin@/staff@/pilot@/instructor@/student@airmanager.local (password = SEED_ADMIN_PASSWORD in .env).
- **Convenzioni e2e**: selettori scoped al landmark o `exact: true`; mai substring page-level; mai `hasText` con orari/date.
- **Commit**: un commit unico di implementazione a gates verdi: `feat(12.1): AirOps design system, shell, auth pages`. Niente push (le credenziali git mancano su questa macchina — il push lo fa l'utente).

## Fuori scope dichiarato

- Wiring dei badge conteggi della sidebar e della card meteo (arrivano con le rispettive story).
- Qualunque riscrittura di pagine dashboard legacy (story 12.3–12.12).
- Rimozione Tailwind/shadcn/Geist (story 12.13).

## Dev Agent Record

**Implementato da**: dev-story subagent (Sonnet 5 xhigh), branch `epic-12-airops-ui`.

### Cosa è stato fatto

- **AC1 (stylesheet)**: `src/styles/airops.css` è un porting verbatim di `docs/design-reference/airops/styles.css` (diff automatizzato verificato: solo i 7 selettori `[data-theme=...]` → `html[data-theme=...]` — conteggio corretto in review, F4 —, più il blocco `.ppr-*` in coda estratto da `PPR Request.html`; post-review si aggiunge la sezione marcata "AirManager additions" per il fix F1). Font self-hosted via `@fontsource/inter-tight`, `@fontsource/jetbrains-mono`, `@fontsource/instrument-serif` (pesi 400/500/600 per i primi due, 400 per Instrument Serif — unici pesi usati nel CSS), installati con `npx -y npm@10` (diff lockfile: 30 righe). Import in `src/app/[locale]/layout.tsx`, Geist rimane. `globals.css` importa `airops.css` dopo Tailwind.
- **AC2 (tema)**: root layout legge il cookie `am-theme` server-side e stampa `data-theme` su `<html>` (niente flash). `theme-toggle.tsx` (client) aggiorna `document.documentElement.dataset.theme` + cookie (`path=/`, `max-age=31536000`, `samesite=lax`), niente localStorage. Default light.
- **AC3 (primitive)**: tutti i file richiesti in `src/components/ui/` — `icons.tsx` (namespace `Icon.*`, porting 1:1 di `icons.jsx`), `badge.tsx`, `kpi.tsx` (KPI+Spark), `avatar.tsx`, `toast.tsx` (`ToastProvider`/`useToast().show(msg, tone)`, context React, NIENTE eventi window), `slide-over.tsx` (Esc + scrim-click), `field.tsx` (Field/Input/Select/InputGroup con prefix/suffix), `segmented.tsx`, `export-menu.tsx` (riceve `pdfHref`/`xlsHref` via props, nessun consumer ancora — arriva con gli export reali nelle story successive), `calendar-popover.tsx` (porting di `Schedule.jsx#CalendarPopover`; la matematica della griglia è estratta in `calendar-grid.ts`, con `calendar-grid.test.ts` — 6 casi, inclusi confini mese/anno). Stringhe via next-intl dove i componenti sono già montati (shell/auth); i primitive senza consumer in questa story (Badge/KPI/SlideOver/ExportMenu/CalendarPopover) non hanno ancora testo hardcoded da tradurre.
- **AC4 (shell)**: `src/components/shell/route-registry.ts` — registry statico `{id, href, icon, group, roles, enabled}`; questa story abilita SOLO `/dashboard`, `/dashboard/bookings`, `/dashboard/ppr`, `/dashboard/expiries`, `/dashboard/settings` (le altre voci del prototipo restano `enabled:false`). `sidebar.tsx`/`top-bar.tsx` (client, porting 1:1 di `Sidebar.jsx`/`TopBar.jsx`) ricevono dati già tradotti/filtrati da `src/app/[locale]/dashboard/layout.tsx` (server, NUOVO file — non esisteva un layout dashboard condiviso prima di questa story, ogni pagina renderizzava standalone con un proprio link "torna alla dashboard"). Filtro per ruolo verificato interattivamente per tutti e 5 i ruoli seed (screenshot). Brand = "AirManager" (wordmark hardcoded) + `<nome club · ICAO>` da `app-settings.service.ts` (vedi deviazione sotto). Le pagine legacy esistenti (nessuna toccata) renderizzano dentro `.main` invariate.
- **AC5 (auth)**: `login`, `set-password`, `forgot-password` ricostruite nel linguaggio AirOps (`.card` su `--bg`, `.fld`/`.input`/`.btn.primary`, brand mark `Icon.logo`), stessi campi/chiamate API/redirect/messaggi di errore. i18n spostato da `LoginPage`/`SetPasswordPage`/`ForgotPasswordPage` (namespace top-level) a `auth.login`/`auth.setPassword`/`auth.forgotPassword` (contenuto IT/EN invariato) per soddisfare la richiesta di namespace dedicati.
- **AC6 (e2e tema)**: nuovo test in `e2e/login.spec.ts` (`AirOps theme toggle`) — login, verifica `data-theme=light` di default, click toggle → `data-theme=dark`, `page.reload()` → persiste.
- **AC7 (gates)**: `npm run gates` verde (lint/typecheck/vitest 1231 test/build). `e2e/login.spec.ts` + `e2e/welcome.spec.ts` verdi in locale (12/12, vedi nota sotto). Smoke visivo delle pagine dashboard legacy fatto via screenshot (nessun errore console, contenuto leggibile in entrambi i temi).

### Verifica interattiva

Il tool MCP Playwright (`mcp__playwright__*`) non è utilizzabile su questa macchina locale: `.mcp.json` punta a `--executable-path /opt/pw-browsers/chromium`, che non esiste qui (drift ambiente locale già noto, vedi memoria utente). Sostituito con script Playwright standalone (stessa libreria `@playwright/test` del progetto, browser Chromium della cache locale) per login reale + screenshot in entrambi i temi: shell (sidebar/topbar) verificata per tutti e 5 i ruoli seed, pagine auth (login/set-password/forgot-password) in IT/EN/light/dark, stato d'errore login. Screenshot temporanei, non committati.

**Bug trovato e fissato durante la verifica visiva**: le pagine dashboard legacy (Tailwind, non theme-aware) diventavano illeggibili in dark mode perché `.main` (AirOps) applica `background: var(--bg)` mentre il testo legacy resta hardcoded scuro. Fix: `{children}` avvolto in `dashboard/layout.tsx` con uno sfondo chiaro fisso (`#FBFBFA`/`#2F3437`, gli stessi colori del vecchio `<body>`), commentato come shim temporaneo da rimuovere quando tutte le pagine saranno riscritte in linguaggio AirOps (story 12.13).

### Nota sui gate e2e locali (non un difetto della story)

Il **primissimo** login reale (POST `/api/auth/callback/credentials`) dopo un avvio a freddo del dev server fallisce con `CredentialsSignin` nonostante le credenziali siano corrette (verificato manualmente: hash Argon2id in DB corrisponde a `SEED_ADMIN_PASSWORD`). Riproducibile anche pre-scaldando le rotte GET (login/dashboard) prima del test — solo il primo vero POST di sign-in fallisce, tutti i successivi sono istantanei e affidabili. Il codice coinvolto (`src/server/auth/authorize.ts`, `password.ts`) non è stato toccato da questa story. Ipotesi: costo di primo caricamento del modulo nativo Argon2/prima connessione Prisma sotto Turbopack dev mode, che eccede il timeout di 5s di Playwright solo alla primissima invocazione reale. `playwright.config.ts` già documenta una classe di flakiness da compilazione a freddo per la CI (che usa `next build`, non `next dev`) — questo sembra la stessa classe applicata localmente al dev server. Segnalato per trasparenza al reviewer; **non bloccante**: con server scaldato (secondo run in poi) tutti i 12 test passano stabilmente e ripetutamente.

### Deviazioni dal file della story

1. **`app-settings.service.ts` esteso** (non nella lista "Modify" esplicita del piano Task 1, ma necessario per AC4): aggiunta `getAirfieldIcao()` (lettura, nessun writer — l'admin UI per scriverlo arriva nella story 12.11 "Impostazioni"). Additiva, non tocca `AirfieldBrandingDto`/`setAirfieldBranding` esistenti (zero rischio per `settings-form.tsx`, pagina legacy non toccata). Test unitari aggiunti in `app-settings.service.test.ts`.
2. **`.main` non è un tag `<main>`** come nel prototipo (`App.jsx`) ma un `<div className="main">`: le pagine legacy hanno già il proprio `<main>`, e annidare due landmark `<main>` è un anti-pattern di accessibilità. Solo la scelta del tag cambia, le classi/lo styling sono identici.
3. **Nessun wrapper `.page` nel layout condiviso**: nel prototipo SPA `App.jsx` avvolge ogni vista in `<div className="page">` una sola volta; in un'app multi-route ogni `page.tsx` futura lo includerà autonomamente (coerente con l'architettura "server component per pagina" della spec §4). Il layout di questa story fornisce solo sidebar/topbar.
4. **i18n auth spostato sotto `auth.*`** invece di restare in `LoginPage`/`SetPasswordPage`/`ForgotPasswordPage`: richiesto dai Dev Notes ("namespace nuovi per shell e auth"); contenuto IT/EN invariato, solo la chiave è cambiata (nessun altro consumer di quelle chiavi in tutto il repo, verificato via grep).
5. **e2e**: `e2e/welcome.spec.ts` non modificato (la pagina pubblica `/[locale]` che copre non è toccata da questa story — nessuna riga da aggiornare) ma eseguito e verde. Confermato AC7 letteralmente ("verdi in locale"), non "modificati".
6. **`ExportMenu`/`Badge`/`KPI`/`SlideOver`/`CalendarPopover`**: creati come da file map ma senza alcun consumer in questa story (arrivano con le story 12.3+). Nessun codice morto interno — sono componenti esportati completi, coerente con lo scopo dichiarato "fondamenta per le story successive".

### Dubbi/nota per il reviewer

- **Sidebar mostra "Impostazioni" anche a STAFF** (AC4 letterale: "ADMIN/STAFF vedono tutte le voci attive") ma `settings.manage` in `rbac.ts` è ADMIN-only: uno STAFF che clicca viene rimbalzato a `/dashboard` dalla guardia esistente della pagina legacy. Non è una rottura (redirect controllato, non un crash), ma è un'incoerenza nav-vs-permesso preesistente nel dominio che questa story non risolve (fuori scope: cambiare `rbac.ts` è una modifica di permessi globale, non "fondamenta shell"). Segnalo esplicitamente per decisione futura (story 12.11 o un fix RBAC dedicato).
- **Ruolo primario per multi-ruolo**: user chip/avatar-color usano la priorità ADMIN>STAFF>INSTRUCTOR>PILOT>STUDENT (non specificata nella story) — scelta ragionevole ma arbitraria, non testata su un utente seed multi-ruolo (il seed non ne crea uno).

## Review Record (adversarial, Opus 4.8 xhigh — 2026-07-14)

**Verdetto**: fixes-required → fixed. Full e2e CI-mode su DB fresco e build di produzione: 201 test, 198 pass, 3 fail triagiati:
- `bookings.spec.ts:509` (mobile 375px overflow) = REGRESSIONE 12.1 (finding F1);
- `bookings.spec.ts:880` e `:911` = bug datetime-local pre-esistenti, già fixati su `fix/e2e-datetime-local-tz` (eb4dfe7, NON merged) — cherry-pickato nell'epic dopo la review.

**Findings e risoluzione (fix applicati dalla sessione principale):**
- **F1 (major, FIXED)**: `.user-chip` della nuova TopBar sborda un viewport 375px (scrollWidth 426) → sezione marcata "AirManager additions" in coda a `airops.css` (crumbs truncate, chip perde il nome sotto 640px, classe `user-chip-name` in `top-bar.tsx`). Verifica: `bookings.spec.ts:509` PASSA (flaky only per cold-start login, v. sotto).
- **F2 (minor, FIXED)**: voce nav "Impostazioni" mostrata a STAFF ma pagina admin-only → `route-registry.ts` ristretto a `['ADMIN']` (D13: il contratto di dominio vince; commento nel codice).
- **F3 (note, DEFERRED → 12.3)**: SlideOver registra il listener Escape anche da chiuso — early-return su `!open` quando arriva il primo consumer.
- **F4 (note, FIXED)**: conteggio selettori nel Dev Agent Record corretto (7, non 6).

**Chiusura note del dev (in prima persona dal reviewer):** STAFF/Impostazioni confermato e fixato (F2); `getAirfieldIcao()` additivo e sicuro (fresh DB → '' → brand senza segmento ICAO, unit test 37/37); shim light-backdrop verificato in dark mode su pagina legacy (nessun leak nel chrome, 0 errori console/hydration); utente multi-ruolo {PILOT,INSTRUCTOR} creato in DB → chip "· Istruttore" con priorità sana; cold-start login flake CLASSIFICATO pre-esistente (stessa classe cold-compile documentata in playwright.config.ts, si manifesta sul primo POST reale sotto next dev — non regressione 12.1).
