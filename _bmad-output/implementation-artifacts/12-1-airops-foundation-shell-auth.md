---
baseline_commit: f2f22bd
---

# Story 12.1: Fondamenta design system AirOps — stylesheet, primitive, shell, pagine auth

Status: ready-for-dev

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

(compilato dal dev agent)
