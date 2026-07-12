---
baseline_commit: fd49305
---

# Story 12.2: App shell desktop-like

Status: ready-for-dev

## Story

As a utente autenticato,
I want una shell di navigazione persistente che non si ricarica mai,
so that l'app risponda come un'applicazione desktop e non come un sito di pagine (FR-48; epics.md «Epic 12», intent doc cantiere B).

## Acceptance Criteria

1. **Given** l'area autenticata (`/dashboard/**`), **When** navigo tra le sezioni, **Then** sidebar (`bg-surface-alt` `#fafafa`, full-height) e topbar NON vengono ri-renderizzate: vivono in `src/app/[locale]/dashboard/layout.tsx` (server component, NUOVO) e Next.js naviga solo il pannello contenuto; la voce di navigazione attiva è evidenziata (stato derivato da `usePathname`).
2. **Given** contenuto più alto del viewport, **When** scorro, **Then** scrolla SOLO il pannello contenuto (`overflow-y-auto` su contenitore shell `h-dvh`): sidebar e topbar restano fisse. Niente body scroll nella dashboard.
3. **Given** una navigazione di sezione, **When** il segmento carica dati, **Then** il pannello contenuto mostra uno skeleton pulse PIATTO (nuovo primitivo `Skeleton` in `src/components/ui/`, fill `#f5f5f5` dentro card hairline, `animate-pulse`, NIENTE shimmer/gradienti) via `dashboard/loading.tsx` — la shell resta visibile e interattiva.
4. **Given** la sidebar, **Then** è LEI il landmark di navigazione: `<nav aria-label>` = stringa i18n esistente `navHeading` ("Aree operative"/"Operational areas"), voci da `visibleNavItems(actor)` con le label i18n `nav.*` esistenti (stringhe INVARIATE) — e la griglia tile di navigazione della home (`dashboard/page.tsx:268-279`) SPARISCE (un solo landmark con quel nome in pagina, pena strict-mode violation negli e2e). I tile personali `myProfile`/`myAccount`/`myDiary` e i widget bento della home RESTANO.
5. **Given** la topbar, **Then** contiene: identità app a sinistra (wordmark "AirManager" testuale, stile DESIGN.md); a destra nome utente (da `getMe`), switcher lingua IT/EN (NUOVO client component su `@/i18n/navigation`, preserva il pathname corrente) e logout — `logoutAction` ESTRATTA da `dashboard/page.tsx:242-261` in componente condiviso, label i18n invariata, e rimossa dalla home. Actor/me/navItems fetchati UNA volta nel layout (redirect a login se actor null), non per pagina.
6. **Given** le 13 pagine col back-link `backToDashboard` (lista chiusa in Contesto), **Then** quel link è RIMOSSO (ridondante con la sidebar); i back-link di risalita LOCALE (`backToFinance`, `backToExpiries`, `backToQueue`, `backToPerson`, `backToList`, `back` di school/[id]) RESTANO. Kicker/h1/descrizione restano nelle pagine (sono contenuto, non chrome).
7. **Given** la suite di test, **Then** `npm run gates` passa e gli e2e restano verdi — in particolare i nav-scoped su 'Aree operative' (`rbac.spec.ts:38,47`, `flights.spec.ts:457,462`, `flight-log.spec.ts:222`, `expiry-types.spec.ts:190,215`, `bookings.spec.ts:439`, `account-adjustments.spec.ts:118`) ora risolvono sulla sidebar; PRIMA di rimuovere i back-link, grep negli e2e dei loro label e aggiornare i click al selettore sidebar-scoped. NUOVO `e2e/app-shell.spec.ts`: sidebar presente e gated per ruolo su una SOTTO-pagina, navigazione tra 2 sezioni via sidebar, logout dalla topbar da una sotto-pagina, switch lingua che preserva la route.
8. **Given** le route pubbliche (`(auth)/*`, `/ppr`, `[locale]/page.tsx`), **Then** NON hanno la shell (il layout vive solo sotto `dashboard/`); a viewport stretto (~390px) la dashboard resta usabile (nav raggiungibile con soluzione minima, es. sidebar collassabile) — NESSUN cantiere mobile dedicato (WON'T ratificato).

## Contesto e decisioni di design (vincolanti)

- **Recon 2026-07-12 (fatti verificati)**: unico layout esistente = `[locale]/layout.tsx` (body flex-col, body-scroll); ZERO `loading.tsx`/`Suspense`/skeleton in tutta `src/`; nessun route group `(dashboard)`. Ogni page dashboard ripete inline lo stesso header (kicker+h1+descrizione+back-link) dentro `<main className="flex-1 px-6 py-16 sm:px-16"><div className="mx-auto max-w-5xl">`.
- **Decisione: shell in `src/app/[locale]/dashboard/layout.tsx`** — NON spostare file in un route group: il layout di cartella copre esattamente tutte e sole le route `/dashboard/*`, URL invariati, diff minimo.
- **Decisione: il landmark migra alla sidebar, la griglia tile della home muore.** Due `<nav>` con lo stesso accessible name romperebbero i `getByRole('navigation', {name:'Aree operative'})` (strict mode). La sidebar contiene le stesse voci con gli stessi label (`t('nav.*')`) e lo stesso gating (`visibleNavItems`) → `rbac.spec.ts` continua a valere così com'è. Verificare che i tile personali/widget della home (che restano) non abbiano riferimenti alla griglia rimossa negli e2e (`home-dashboard.spec.ts` usa i testid dei widget, non i tile nav — confermato dal recon).
- **Struttura shell** (server component): `getSessionActor()` (redirect login se null) + `getMe(actor)` + `visibleNavItems(actor)` UNA volta; markup: `div.flex.h-dvh` → `aside` sidebar (`bg-surface-alt`, bordo destro hairline opzionale — lo spec dice che il tono basta, NIENTE divider se regge visivamente) + colonna destra (`topbar` + pannello `overflow-y-auto` che avvolge `{children}`). Le pagine NON cambiano il loro `<main>`/container (il py-16 può ridursi se la topbar rende ridondante lo spazio — SOLO se necessario, dichiarandolo).
- **Sidebar attiva**: la lista voci è un client component (`SidebarNav`) che riceve items+labels dal server e usa `usePathname()` per lo stato attivo (match per prefisso href); stile voce attiva: fill paper o ink solid — scegliere col contratto DESIGN.md (sidebar `#fafafa`, voce attiva leggibile, niente colore).
- **Le page.tsx restano server component fetch-bloccanti** (AD-1/AD-5 invariati): il loading granulare è dato da `dashboard/loading.tsx` (skeleton nel SOLO pannello durante la navigazione). NIENTE Suspense per-widget in questa story (COULD futuro, non richiesto).
- **`logoutAction`**: oggi inline SOLO in `dashboard/page.tsx:242-245` (server action → `signOut({redirectTo})`). Estrarla (es. `src/app/[locale]/dashboard/logout-button.tsx` o actions file) e usarla nella topbar; via dalla home. Grep e2e del label logout prima di spostare.
- **Language switcher**: NON esiste in dashboard (solo landing pubblica, `[locale]/page.tsx:24-29`). Crearlo client con `Link`/`usePathname` di `@/i18n/navigation` (locale opposto, stesso pathname). `routing.ts`: locales it/en, default it, `localeDetection:false`.
- **Back-link — lista CHIUSA dei `backToDashboard` da rimuovere**: `settings/page.tsx:56`, `aircraft/page.tsx:88`, `people/page.tsx:76`, `flights/page.tsx:237`, `finance/page.tsx:145`, `users/page.tsx:65`, `ppr/page.tsx:117`, `expiries/page.tsx:234,447`, `bookings/page.tsx:376`, `ppr/register/page.tsx:133` (solo il backToDashboard; il `backToQueue:126` resta), `people/[id]/page.tsx:151-167` (SOLO il ramo backToDashboard del condizionale: se l'actor non ha `people.read` il link alla lista non ha senso e la sidebar copre — semplificare il condizionale di conseguenza), `school/[id]/page.tsx` (resta: è un `back` locale). Chiavi i18n orfane: rimuovere SOLO se non riusate altrove.
- **NFR-10**: la shell non introduce superfici dati nuove (nav e identità utente sono già gated server-side); il layout NON deve esporre dati oltre `me` e i nav item permessi.
- **Test fragili**: mantenere IDENTICI i label i18n di nav/logout; `data-testid` dei widget home intatti; i `page.goto` diretti restano validi. Il nuovo spec e2e usa selettori scoped al landmark (convenzione di progetto, lezione 103-F1).
- **Fuori scope (dichiarato)**: search trigger/⌘K in topbar (12.6 — NON anticipare nemmeno il placeholder); dialog/sheet (12.3); breadcrumb trail (non richiesto dall'intent — i back-link locali bastano); Suspense per-widget; redesign della home oltre la rimozione della griglia nav; mobile dedicato.

## Tasks / Subtasks

- [ ] **T1 (AC 1, 2, 5, 8)** — `dashboard/layout.tsx`: shell h-dvh con sidebar + topbar persistenti e pannello contenuto a scroll indipendente; fetch actor/me/navItems una volta; redirect login; wordmark, identità utente, switcher lingua nuovo, logout estratto.
- [ ] **T2 (AC 4)** — `SidebarNav` client con landmark `navHeading`, voci gated, stato attivo; rimozione griglia nav dalla home (tile personali e widget restano).
- [ ] **T3 (AC 3)** — Primitivo `Skeleton` in `src/components/ui/` + `dashboard/loading.tsx` (skeleton di pannello in card hairline).
- [ ] **T4 (AC 6)** — Rimozione dei `backToDashboard` (lista chiusa) e pulizia chiavi i18n orfane; back-link locali intatti.
- [ ] **T5 (AC 7)** — Grep e2e su label back-link/logout PRIMA delle rimozioni; aggiornare i click ai selettori sidebar-scoped; nuovo `e2e/app-shell.spec.ts` (4 scenari AC 7); `npm run gates`; e2e mirati: `rbac`, `home-dashboard`, `flights`, `bookings`, `account-adjustments`, `expiry-types`, `flight-log` + nuovo spec.
- [ ] **T6** — Verifica visiva Playwright MCP (desktop: home, una lista, una sotto-pagina finanze; scroll indipendente; skeleton visibile con throttle/navigazione reale) + screenshot; Dev Agent Record + File List; sprint-status `12-2` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE le skill `impeccable`, `design-taste-frontend`, `ui-ux-pro-max`; contratto vincolante `_bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/DESIGN.md` (sidebar = Sidebar Surface `#fafafa`; componenti già tokenizzati da 12.1 in `src/components/ui/` — riusarli, NON reinventare).
- App Router: un `layout.tsx` NON si ri-renderizza navigando tra i suoi figli — è questa la persistenza richiesta; nessuna magia client aggiuntiva. `loading.tsx` si attiva automaticamente sulle navigazioni del segmento.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`.
- UN commit di implementazione (`Story 12.2: ...`); NON pushare (amend+push li fa la sessione principale).
- Baseline: `fd49305` (12.1 done), 30 migrazioni, 200 e2e / 1222 unit su DB fresco. Flake noti: `cash-report` ECONNRESET sotto load, login-redirect su webServer freddo.
- Lezione 12.1: lo sweep meccanico salta occorrenze — a fine T4 grep di verifica su TUTTI i label/chiavi rimossi.

### Project Structure Notes

- Nuovi file attesi: `src/app/[locale]/dashboard/layout.tsx`, `dashboard/loading.tsx`, `src/components/ui/skeleton.tsx`, componenti shell (`sidebar-nav.tsx`, `logout-button.tsx`/action condivisa, `locale-switcher.tsx` — naming kebab-case), `e2e/app-shell.spec.ts`. Modifiche: `dashboard/page.tsx` (rimozione nav grid + logout), le 13 pagine dei back-link, `messages/{it,en}.json` (solo chiavi nuove topbar/pulizia orfane — label esistenti INVARIATI). NESSUNA migrazione, env var, API nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 12.2»; intent doc cantiere B; DESIGN.md «Sidebar Surface», «Search Trigger» (NON in questa story)]
- [Source: recon Explore 12.2 in sessione — layout.tsx:39-44 (body flex-col), dashboard/page.tsx:242-261 (logoutAction), :268-279 (nav grid landmark), :280-303 (tile personali); nav-items.ts:4-77 (NavItem, visibleNavItems, unione permessi) + nav-items.test.ts; proxy.ts PUBLIC_WEB_PATHS; container `max-w-5xl` (eccezioni settings 3xl, school/[id] 4xl); zero loading/Suspense/skeleton in src/]
- [Source: e2e nav-scoped — rbac.spec.ts:38,47; flights.spec.ts:457,462; flight-log.spec.ts:222; expiry-types.spec.ts:190,215; bookings.spec.ts:439; account-adjustments.spec.ts:118; home-dashboard.spec.ts:335-373 (widget testid)]
- [Source: story file 12-1 (primitivi ui/, cn(), token; lezione sweep)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
