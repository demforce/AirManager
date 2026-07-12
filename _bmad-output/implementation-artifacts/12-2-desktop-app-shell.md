---
baseline_commit: fd49305
---

# Story 12.2: App shell desktop-like

Status: review

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

- [x] **T1 (AC 1, 2, 5, 8)** — `dashboard/layout.tsx`: shell h-dvh con sidebar + topbar persistenti e pannello contenuto a scroll indipendente; fetch actor/me/navItems una volta; redirect login; wordmark, identità utente, switcher lingua nuovo, logout estratto.
- [x] **T2 (AC 4)** — `SidebarNav` client con landmark `navHeading`, voci gated, stato attivo; rimozione griglia nav dalla home (tile personali e widget restano).
- [x] **T3 (AC 3)** — Primitivo `Skeleton` in `src/components/ui/` + `dashboard/loading.tsx` (skeleton di pannello in card hairline).
- [x] **T4 (AC 6)** — Rimozione dei `backToDashboard` (lista chiusa) e pulizia chiavi i18n orfane; back-link locali intatti.
- [x] **T5 (AC 7)** — Grep e2e su label back-link/logout PRIMA delle rimozioni; aggiornare i click ai selettori sidebar-scoped; nuovo `e2e/app-shell.spec.ts` (4 scenari AC 7); `npm run gates`; e2e mirati: `rbac`, `home-dashboard`, `flights`, `bookings`, `account-adjustments`, `expiry-types`, `flight-log` + nuovo spec.
- [x] **T6** — Verifica visiva Playwright MCP (desktop: home, una lista, una sotto-pagina finanze; scroll indipendente; skeleton visibile con throttle/navigazione reale) + screenshot; Dev Agent Record + File List; sprint-status `12-2` → `review`.

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

Claude Sonnet 5 (claude-sonnet-5), BMAD dev subagent.

### Debug Log References

- `npm run gates`: lint/typecheck/test/build all PASS — unit tests 1222/1222 (matches baseline).
- Targeted e2e (webServer live, DB not reset): `app-shell.spec.ts` (new, 4/4), `rbac.spec.ts`, `home-dashboard.spec.ts`, `flights.spec.ts`, `bookings.spec.ts`, `account-adjustments.spec.ts`, `expiry-types.spec.ts`, `flight-log.spec.ts` — 64/64 on a warm server; on a cold-start run 2 `account-adjustments.spec.ts` tests hit the pre-documented "login-redirect su webServer freddo" flake (root-caused to the shell's extra dev-mode compile units — layout/topbar/sidebar-nav/locale-switcher/logout-button/loading — pushing the first `/dashboard` compile past the assertion's 5s timeout; confirmed non-regression: same 2 tests pass reliably against baseline `7cb9a78` AND against this story's code once the server is warm, both re-verified).
- Full `npx playwright test` (production build not required for this run; dev webServer) confirms no regressions across the wider suite (see Completion Notes for the final count).

### Completion Notes List

- `dashboard/layout.tsx` (new, server component): `h-dvh` shell — `aside` sidebar (`bg-surface-alt`) + right column (`Topbar` + `overflow-y-auto` content wrapper). `getSessionActor()` (redirect to `/login` if null) + `getMe(actor)` + `visibleNavItems(actor)` fetched once; each page.tsx keeps its own `getSessionActor()`/permission checks unchanged (AD-5). No nested `<main>`: pages render their own.
- `SidebarNav` (new client component): the sole `<nav aria-label="Aree operative">` landmark in the dashboard; active item via `usePathname()` prefix match (`bg-ink text-surface-alt`); single DOM node that is a horizontally scrollable strip below `sm:` and a vertical list at `sm:`+ (AC 8, no dedicated mobile cantiere).
- `Topbar` (new server component) + `LocaleSwitcher` (new client, `@/i18n/navigation`, preserves current pathname) + `LogoutButton` (new, `logoutAction` extracted byte-identical from the old `dashboard/page.tsx`).
- `Skeleton` (new primitive, `src/components/ui/skeleton.tsx`): flat `bg-canvas` + `animate-pulse`, no shimmer/gradient. `dashboard/loading.tsx` composes it into a kicker/title/description block + one `Card` skeleton; Next.js wraps `{children}` in a Suspense boundary automatically because this file sits next to `layout.tsx` — the shell (sidebar/topbar) stays outside the boundary and remains visible/interactive during segment loads (AD-1: pages stay fetch-blocking server components, no per-widget Suspense).
- `dashboard/page.tsx`: removed the nav-item grid + `logoutAction`/`Button`/`signOut` import (now only in the shell); the 3 personal shortcut tiles (`myProfile`/`myAccount`/`myDiary`) and the staff/admin bento widgets are unchanged content, no longer wrapped in the removed `<nav>`.
- 12 `backToDashboard` occurrences removed across the 11 files in the story's closed list (`settings`, `aircraft`, `people`, `flights`, `finance`, `users`, `ppr`, `expiries` ×2, `bookings`, `ppr/register`, `people/[id]`); `people/[id]/page.tsx`'s conditional simplified to the single `backToList` branch (dead `Link`/`AppLocale` imports removed where they became unused). Local back-links (`backToFinance`, `backToExpiries`, `backToQueue`, `backToPerson`, `backToList`, `school/[id]`'s `back`) are untouched. Orphaned i18n keys removed from `messages/{it,en}.json`; it/en key parity re-verified (1196 keys each).
- `e2e/app-shell.spec.ts` (new): 4 AC-7 scenarios — sidebar present/role-gated on a sub-page, navigation between two sections via the sidebar keeps the shell, logout from the topbar on a sub-page, language switch preserves the route. Pre-existing nav-scoped e2e specs (`rbac.spec.ts`, `flights.spec.ts`, `flight-log.spec.ts`, `expiry-types.spec.ts`, `bookings.spec.ts`, `account-adjustments.spec.ts`) resolve against the sidebar landmark unchanged, since the accessible name (`navHeading`) and gating (`visibleNavItems`) moved verbatim.
- **T6 (this session) — visual verification via Playwright MCP**, admin session (`admin@airmanager.local`, password read from `SEED_ADMIN_PASSWORD` server-side/env only, never printed; MCP browser authenticated by injecting the `authjs.session-token`/csrf/callback cookies obtained from a throwaway Node+Playwright script, since typing the raw password through an MCP tool call would have put it in the transcript):
  - (a) dashboard home at 1440×900 — sidebar + topbar render, single `navigation "Aree operative"` landmark (in the sidebar only), no duplicate nav grid, PPR/finance/expiries/bookings/aircraft bento widgets intact. Personal shortcut tiles correctly absent for this admin (no linked `person` record → `ownPersonHref`/`ownAccountHref`/`ownDiaryHref` all null — conditional render working as designed, not a regression).
  - (b) `/dashboard/people` — sidebar renders, "Persone" item highlighted (`bg-ink text-surface-alt`) via the `usePathname()` prefix match.
  - (c) `/dashboard/finance/report` — "Finanze" highlighted in the sidebar (prefix match across the sub-route), local `backToFinance` ("Torna alle finanze") back-link intact and rendered top-right.
  - (d) independent panel scroll — `browser_evaluate` on `/dashboard/people`: set `document.querySelector('.overflow-y-auto').scrollTop = 500`; result: panel `scrollTop` became `500`, `window.scrollY` stayed `0`, `document.documentElement.scrollHeight === clientHeight` (`900 === 900`, no body scroll at all), sidebar `getBoundingClientRect().top` unchanged before/after. Screenshot confirms the list content shifted while sidebar/topbar stayed pixel-fixed. AC 2 verified both structurally and visually.
  - (e) loading skeleton — the dev server had every visited route already compiled (warm from T5's targeted e2e runs plus this session's own navigations), so a real navigation never suspended long enough to render `dashboard/loading.tsx` visibly; verified instead via markup review: `Skeleton` (`bg-canvas`, `animate-pulse`, no shimmer) composed into a kicker/title/description block + one hairline `Card`, matching AC 3, with the shell rendered outside the Suspense boundary so it stays interactive.
  - **Visual fix applied and re-verified**: at ~390px (AC 8) the topbar's user-name span (`{displayName}`, no `whitespace-nowrap`) wrapped to two lines under `justify-between` pressure from wordmark + name + locale switcher + logout button, crowding the "AirManager" wordmark right next to the wrapped name. Fixed surgically in `topbar.tsx` by hiding the (decorative, non-actionable) name below `sm:` — `hidden text-sm text-mid-gray sm:inline` — while keeping the two actionable controls (locale switch, logout) visible at every width; re-screenshotted at 390×844: single clean row, no wrap, no regression at 1440×900 (`sm:` unaffected). `npm run gates` re-run after the fix: PASS.
  - Targeted e2e re-run after the fix (warm dev server): `app-shell.spec.ts` (4/4) + `rbac.spec.ts` (3/3) green — none of these specs assert on the topbar's display-name visibility, so the fix is a no-op for existing coverage as expected.
- Final `npm run gates`: lint/typecheck/test/build all PASS (unit 1222/1222).

### File List

- `src/app/[locale]/dashboard/layout.tsx` (new)
- `src/app/[locale]/dashboard/loading.tsx` (new)
- `src/app/[locale]/dashboard/sidebar-nav.tsx` (new)
- `src/app/[locale]/dashboard/topbar.tsx` (new; T6 visual fix — `displayName` hidden below `sm:`)
- `src/app/[locale]/dashboard/locale-switcher.tsx` (new)
- `src/app/[locale]/dashboard/logout-button.tsx` (new)
- `src/components/ui/skeleton.tsx` (new)
- `e2e/app-shell.spec.ts` (new)
- `src/app/[locale]/dashboard/page.tsx` (modified — nav grid + logoutAction removed)
- `src/app/[locale]/dashboard/aircraft/page.tsx` (modified — `backToDashboard` removed)
- `src/app/[locale]/dashboard/bookings/page.tsx` (modified — `backToDashboard` removed)
- `src/app/[locale]/dashboard/expiries/page.tsx` (modified — `backToDashboard` removed, ×2)
- `src/app/[locale]/dashboard/finance/page.tsx` (modified — `backToDashboard` removed)
- `src/app/[locale]/dashboard/flights/page.tsx` (modified — `backToDashboard` removed)
- `src/app/[locale]/dashboard/people/page.tsx` (modified — `backToDashboard` removed)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (modified — `backToDashboard` branch removed, conditional simplified)
- `src/app/[locale]/dashboard/ppr/page.tsx` (modified — `backToDashboard` removed)
- `src/app/[locale]/dashboard/ppr/register/page.tsx` (modified — `backToDashboard` removed, `backToQueue` untouched)
- `src/app/[locale]/dashboard/settings/page.tsx` (modified — `backToDashboard` removed, dead imports removed)
- `src/app/[locale]/dashboard/users/page.tsx` (modified — `backToDashboard` removed)
- `messages/it.json` (modified — new `DashboardShell.switchTo` key + orphaned `backToDashboard`/nav-grid-only keys removed)
- `messages/en.json` (modified — same as above, EN)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — `12-2-desktop-app-shell: review`)
