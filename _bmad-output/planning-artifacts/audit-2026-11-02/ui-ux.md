# AirManager UI/UX audit (2026-11-02)

Auditor: product design + front-end + accessibility review, live instance `http://localhost:3100` (Next dev, Turbopack, DB `airmanager_audit`).
Screenshots and raw measurements: `/tmp/claude-1000/-home-admin-AirManager/3d06ddd1-b828-45ca-bf7a-109f0d9fa254/scratchpad/ui-shots/` (349 PNG, one JSON per page load in `results/`, scripts `crawl.js`, `measure.js`, `flow-*.js`, `mobile.js`, `perf.js`). All screenshot names below are relative to that folder.

---

## 1. Executive summary

**Verdict.** The AirOps port is a coherent, recognisable design system: no page overflows horizontally, no duplicate IDs, every icon button has a name, colour tokens hold in both themes, and the slide-over and combobox primitives are genuinely well engineered. The weak spots are the parts that sit *outside* those primitives: desktop confirmation modals and inline confirms, success feedback after a save, page titles and heading structure, error and 404 pages, and copy that the server writes in Italian. Most of the 2026-09-10 mobile findings are still open because epic 18 has not started; several are now hidden only because the demo data is small (3 aircraft, 11 people).

**Accessibility verdict.** Usable with a mouse in both themes. Not yet usable end-to-end with a keyboard or a screen reader. The worst blocker is destructive confirmations that are not dialogs: from the flight-delete confirm, a keyboard user needs 36 Tab presses to reach "Chiudi", and Escape does nothing. Pages have no page-specific title and expose a single heading.

New findings by severity:

| Severity | Count |
|---|---|
| High | 1 |
| Medium | 17 |
| Low | 26 |
| Nit | 4 |

Prior 2026-09-10 findings (21; that audit ordered them by impact without severities):

| Status | Count |
|---|---|
| Fixed | 0 |
| Open | 17, including the ratified M15 and T1 and the reshaped A1 |
| Open in code, masked by the small demo data | 4 (M4, M10, D1, D4) |

The Settings page is work in progress (story 19.8, uncommitted). Its observations are labelled **WIP page** and are not counted above.

---

## 2. Coverage

### 2.1 Method

- **Driver.** Node scripts on the repo's `playwright` 1.x with Chromium 1228, outside the repo. I did not use the MCP browser because other audit agents shared this server. One login per role, sessions reused through `storageState`. I made one deliberate failed login with a non-existent email; no real account was locked.
- **Per page load.** I collected console errors and warnings, `pageerror`, responses ≥ 400, `fetch`/`/api/` request count, document height, horizontal overflow, internal horizontal scrollers, ellipsis truncation, and DOM node count. I also counted nodes inside `display:none` subtrees, listed headings and landmarks, and checked duplicate IDs and live regions.
- **Contrast.** I computed WCAG ratios on canvas-normalised colours (needed for `oklch`/`lab` tokens), with opacity and alpha backgrounds composited and placeholders included.
- **Touch targets.** Every interactive element was measured with `getBoundingClientRect`, excluding `inert` and `aria-hidden` subtrees.
- **axe-core.** Version 4.12.1 from `node_modules`, run on the 1280 light, 1280 dark and 375 light combos.
- **Viewports and themes.**
  - Viewports: 1440×900, 1280×800, 768×1024 (touch), and 375×812 (`isMobile`, touch, deviceScaleFactor 2).
  - Themes: light and dark through the in-app cookie `am-theme`, plus OS `prefers-color-scheme: dark` with no cookie.
  - Locales: IT everywhere, EN for a representative subset.
- **Flows driven for real.**
  - Booking created by keyboard, then cancelled through the inline confirm.
  - Flight registered, result panel read, then deleted through the confirm modal.
  - Top-up form validation only; no money was moved.
  - Empty states, mobile sheets, back button, mobile filters, tab switch on throttled 3G with 4× CPU, a fixed-clock test of the default flight date, and auth pages including an invalid set-password token.
- **Data I created and cleaned up.**
  - A booking for De Santis Marco on I-PDVB, 27/11/2026 10:00-11:00. It is now cancelled ("Annullato").
  - A flight for De Santis Marco on I-PDVB, 02/11/2026, 0:55. It was deleted.
  - The `csrf-probe` cash category visible in Settings was created by another agent, not by me.

### 2.2 Caveats

- **Dev mode on a shared, loaded machine.** Load average reached 14. First loads compile, and timings are pessimistic and noisy, so I judge performance qualitatively plus DOM/API metrics.
- **The dev server restarted once around 18:00.** That restart caused two `ERR_CONNECTION_REFUSED` errors and one `ChunkLoadError`; they are environmental.
- **The demo dataset is small.** It has 3 aircraft, 11 people, 24 flights and 38 transactions, so findings that scale with data are marked "masked by data" and argued from code.
- **Not verified.** Real screen readers, real devices (iOS swipe-back, Android hardware back), and production-build timings.

### 2.3 Coverage table

Cell = document height in px, then `eN` (N console errors), `nN` (N failed requests), `[status]` when not 200, and `→/` when the role is redirected to its landing page. `·` = combo not visited. **No cell showed horizontal page overflow (0 of 209 loads).**

| Role | Route | 1440 L it | 1280 L it | 1280 D it | 768 L it | 375 L it | 375 D it | 1280 L en | 375 L en | OS-dark 1280 it |
|---|---|---|---|---|---|---|---|---|---|---|
| admin | / (overview) | 1819 | 1843 | 1843 | 2441 | 1355 | 1355 | 800 e2 n1 [500]¹ | 1355 e1² | · |
| admin | /bookings | 1199 | 1199 | 1199 | 1240 | 1234 | 1234 | 1277 e1² | 1238 | · |
| admin | /pilots | 922 | 922 | 922 | 1024 | 1233 | 1233 | 922 | 1233 | · |
| admin | /instructors | 922 | 922 | 922 | 1024 | 812 | 812 | 922 | 812 | · |
| admin | /fleet | 922 | 922 | 922 | 1024 | 812 | 812 | 922 | 812 | · |
| admin | /expiries | 1010 | 1010 | 1010 | 1068 | 1447 | 1447 | 1010 e1² | 1431 | · |
| admin | /logbook | 2147 | 2190 | 2190 | 2281 | 1865 | 1865 | 2190 | 1865 | · |
| admin | /billing | 1980 e1² | 1980 | 1980 | 2387 | 2492 | 2492 | 1980 e1² | 2492 | · |
| admin | /reports | 1248 | 1277 | 1277 | 1954 | 2316 | 2316 | 1261 | 2316 | · |
| admin | /settings (WIP) | 3053 | 3053 | 3053 | 3231 | 4641 | 4641 | 3088 | 4595 | · |
| admin | /people/{id} | 1922 | 1922 | 1922 | 2072 | 2588 | 2588 | 1922 | 2648 | · |
| admin | /people/{bad-id} | 900 [404] | 800 [404] | 800 [404] | 1024 [404] | 812 [404] | 812 [404] | · | · | · |
| instructor | / | · | 800 | 800 | 1024 | 812 | 812 | 800 | · | · |
| instructor | /bookings | · | 1093 | 1093 | 1134 | 1234 | 1234 | · | · | · |
| instructor | /expiries | · | 800 | 800 | 1024 | 812 | 812 | · | · | · |
| instructor | /logbook | · | 800 | 800 | 1024 | 812 | 812 | · | · | · |
| instructor | /my-compensation | · | 800 | 800 | 1024 | 812 | 812 | 800 | · | · |
| pilot | / | 900 | 800 | 800 | 1024 | 880 | 880 | 800 | 940 | · |
| pilot | /bookings | 1029 | 1029 | 1029 e1² | 1071 | 1173 | 1173 | 1079 e4³ | 1238 | · |
| pilot | /expiries | 900 | 800 | 800 | 1024 | 812 | 812 | 800 | 812 | · |
| pilot | /logbook | 900 | 869 | 869 | 1024 | 812 | 812 | · | · | · |
| pilot | /my-account | 900 | 800 | 800 | 1024 | 951 | 951 | 800 | 951 | · |
| pilot | /billing (admin-only) | 900 →/ | 800 →/ | 800 →/ | 1024 →/ | 880 →/ | 880 →/ | · | · | · |
| pilot | /settings (admin-only) | 900 →/ | 800 →/ | 800 →/ | 1024 →/ | 880 →/ | 880 →/ | · | · | · |
| student | / | · | 800 | 800 | · | 812 | 812 | · | · | · |
| student | /bookings | · | 1075 | 1075 | · | 1182 | 1182 | · | · | · |
| student | /expiries | · | 800 | 800 | · | 812 | 812 | · | · | · |
| student | /logbook | · | 800 | 800 | · | 812 | 812 | · | · | · |
| student | /my-account | · | 800 | 800 | · | 812 | 812 | · | · | · |
| anon | /login | · | 800 | 800 | · | 812 | · | 800 | 812 | 720 |
| anon | /forgot-password | · | 800 | 800 | · | 812 | · | 800 | 812 | 720 |
| anon | /set-password?token=invalid | · | 800 | 800 | · | 812 | · | 800 | 812 | 720 |

¹ Prisma P2028 "Unable to start a transaction in the given time" under concurrent load. It recurred 1 time in 3 manual reloads; see PERF-1.
² Intermittent React "tree hydrated but some attributes … didn't match". It appeared 6 times in 209 loads and did not recur in 10 forced reloads; see PERF-4.
³ Dev-server restart (`ERR_CONNECTION_REFUSED`, `ChunkLoadError`); environmental.

Total: **209 page loads**, 4 roles plus anonymous, 4 viewports, 3 theme modes, 2 locales. On the largest page, Billing, the DOM has 933 nodes. **Client API calls on page load: 0 on every page**, because data is server-rendered and there are no fetch waterfalls.

Page height on desktop is no longer pathological (max 2,190 px for Logbook, excluding the WIP Settings page). This is a property of the 3-aircraft dataset, not a fix; see D1 in §3.

---

## 3. Status of the 2026-09-10 UI findings

| ID | Status | Evidence (2026-11-02) |
|---|---|---|
| M1 header eats the fold on mobile | **OPEN** | First content row (y, px) at 375×812: Expiries **625** (was 625.2), Bookings **650** (was 366; worse), Billing **563** (=), Overview **463** (=), Logbook **423** (was 487), Instructors 369, Fleet 336, Pilots 324. H1 still repeats the sticky topbar title, KPI tiles on Expiries are still non-tappable `div`s, and the head still has 4 buttons on 2 rows. `admin-expiries-m375-light-it.png` |
| M2 44 px floor in panels/topbar | **OPEN (partly improved)** | Topbar theme and avatar buttons are **32×32** on every mobile page. `.date-nav` is 26×26, the date pick 28 h, Filters 34.8 h and the segmented control 27.4 h (`smallTargetGroups` in `results/*-m375-*.json`). Panel text, time and number inputs are **36.8-38.8 h**: New flight has 10 of 16 controls under 44, New booking 4 of 11, Pilot editor 6 of 9. Combobox inputs now meet 44. |
| M3 Schedule "Filtri" is the desktop popover | **OPEN** | It is still a `.popover` 320 px wide with **27.4 px** chips (9 chips with 3 aircraft; it scales with fleet size). `mob-admin-schedule-filters.png` |
| M4 booking-card name squeezed by tail | **OPEN in code, masked by data** | `src/styles/airops.css:2196-2197` still has `.mobile-row-tail{ flex-shrink: 0 }`. Demo registrations have 6 characters, so no truncation was observed. |
| M5 Back leaves the page instead of closing sheets | **OPEN** | With a booking sheet open, `goBack()` landed on `/it/dashboard/logbook`. With the "Altro" sheet open, it landed on the previous page. There are 0 `pushState`/`popstate` in `src/`. |
| M6 5th tab label wraps for PILOT/STUDENT | **OPEN** | "Le mie transazioni" renders on 2 lines (`pilot-bookings-m375-light-it.png`, `student-logbook-m375-light-it.png`). `messages/it.json:22`. The label font is 9.5 px (`airops.css:1843`). |
| M7 no navigation feedback | **OPEN** | There are 0 `loading.tsx`, 0 `useLinkStatus`, 0 `Suspense` and 0 `aria-busy`. On desktop, sidebar overview→billing gave its first visual change only when the content swapped (1,133, 1,320 and 2,005 ms). On mobile with 3G and 4× CPU, the tab bar still showed "Panoramica" active 300 ms after the tap, and content arrived at 8.2 s in dev mode (`mob-tabswitch-300ms-3g.png`). |
| M8 out-of-service buried in editor | **OPEN** | The fleet sheet's only action is "Modifica" (`fleet/fleet-console.tsx:336-348`). |
| M9 empty state keeps the whole apparatus | **OPEN (and see FORM-9)** | A filter that matches nothing on Logbook keeps 4 zero KPIs and says "Nessun volo registrato." (`empty-logbook-d1280.png`). |
| M10 ✕ shrinks with a two-line title | **OPEN in code, masked by data** | `airops.css:3694` sets `.so-head .iconbtn{ width:44px; height:44px; }` without `flex-shrink:0`. `.iconbtn` (`airops.css:262`) has no shrink guard either. Demo titles fit on one line, and ✕ measured 44×44. |
| M11 pilot/student schedule = admin console | **OPEN** | Same layout, and the subtitle still reads "Timeline aeromobili e prenotazioni in attesa di approvazione." (`pilot-bookings-m375-light-it.png`). Other pilots' bookings show as "Occupato", which is good. |
| M12 OS dark preference ignored | **OPEN** | With `colorScheme: 'dark'` and no cookie, `data-theme` is `light` and `color-scheme` is `normal`. There are 0 `prefers-color-scheme` rules in `airops.css` (`mob-admin-overview-osdark.png`, `anon-_login-osdark-osdark-it.png`). |
| M13a "Pianifica volo" opens "Registra volo" | **OPEN** | `dashboard/dispatch-flight-button.tsx:5-15` mounts `FlightEditor`. The label is `messages/it.json:115`; in EN it reads "Dispatch flight". |
| M13b two names per page | **OPEN** | Nav and breadcrumb say "Aeromobili" while the H1 says "Velivoli" (`admin-fleet-d1280-light-it.png`). In EN the topbar says "Operations overview" and the H1 "Operational overview" (`admin-overview-m375-light-en.png`). |
| M13c "Registra" without object | **OPEN** | `messages/it.json:345` `"topUp": "Registra"`, visible as a row button on Pilots. |
| M13d no primary action in booking sheet | **OPEN** | Modifica, Effettuato, Assente and Annulla are all `.btn` secondary, plus "Chiudi" (`mob-admin-booking-sheet.png`). |
| M14 auth pages outside the mobile epic | **OPEN** | Login email and password are 269×**36.8**, the "Accedi" button **34.8** tall, and "Password dimenticata?" 122×**15**. There is no language switch. `anon-_login-m375-light-it.png` |
| M15 ratified contrast items | **OPEN (accepted)** | Still exactly the ratified set: `.nav-label` 3.66 light / 4.14 dark, list headers 3.46 / 3.88, `.weather-title` 3.46 / 3.88, `.segmented` inactive 4.39, chart axis 3.66 / 4.14. |
| D1 33,313 px overview | **OPEN in code, masked by data** | 1,843 px at 1280 with 3 aircraft. The desktop timeline and fleet widget are still uncapped: `dashboard/page.tsx:423` maps every aircraft to a card, and only the Expiries widget caps ("+3 altre · Vedi tutte"). The overview also embeds the full Bookings table (`admin-overview-d1280-light-it-full.png`). |
| D2 Logbook columns off-screen at 1280 | **OPEN** | The internal scroller hides **354 px** at 1280 (identical to before) and 194 px at 1440. Pilots hides 112 px at 1280, so its second action button is clipped (`admin-pilots-d1280-light-it.png`). There is no scroll affordance. |
| D3 non-sticky list headers | **OPEN** | The only `position: sticky` rules are for the sidebar, topbars and footers (`airops.css:129, 235, 1792, 1998, 3305`). |
| D4 ranked lists uncapped on desktop | **OPEN in code, masked by data** | `.ranked-rows-capped` lives only inside `@media (max-width:640px)` (`airops.css:3336-3380`). |
| T1 tablet = desktop targets (ratified R1) | **OPEN (ratified)** | At 768, every control keeps desktop size. Tables now also hide content at 768: Logbook **698 px** (of 1,344), Pilots 456, Billing 342, Bookings 292, Expiries 244. |
| A1.1 no skip link, unnamed `main` | **OPEN** | `skipLink: false` on all 209 loads. Landmarks are `navigation[Aree operative]`, `header` and an unnamed `main`. |
| A1.2 KPI strip tab-stop without name | **CHANGED, still a defect** | It is no longer a tab stop. It is now an unreachable scroll region: axe `scrollable-region-focusable` (serious) on mobile Overview, Logbook, Reports and Instructors, and the scrollbar is hidden (`airops.css:2036`). See A-6. |
| A1.3 toast host outside trap | **OPEN (ratified TD)** | Unchanged; see A-7 for the new aspects. |
| A1.4 422 announcement / post-action focus | **Now verified** | Field errors are inline with `role="alert"` and the first invalid field is focused (good). After a *successful* action, focus is lost to `<body>` (A-4). |

---

## 4. New findings

Format: **ID · Severity · VERIFIED or SUSPECTED · title**, then where, what and why, and the fix.

### 4.1 Accessibility

**A-1 · High · VERIFIED · Destructive and money confirmations on desktop are not dialogs: no focus move, no trap, no Escape, no role.**
- **Where:** five `.mini-modal`s:
  - flight delete: `logbook/logbook-console.tsx:868`
  - booking reject: `bookings/bookings-table.tsx:792`
  - membership fee: `expiries/scadenze-console.tsx:933`
  - transaction adjust and reverse: `billing/billing-console.tsx:1204` and `:1255`
- **Second pattern:** the inline booking-cancel confirm at `bookings/bookings-table.tsx:623-640`.
- **Measured on flight delete:** after Enter on the row's "Annulla", focus stays on the row button (`inModal=false`). The overlay is `position:fixed; z-index:60` with a 45% scrim, yet keyboard focus walks behind it. **36 Tab presses** are needed to reach "Chiudi", and **Escape does not close** the modal. There is no `role="dialog"`/`alertdialog` and no `aria-modal`. Screenshot: `flow-flight-delete-modal-focus.png`.
- **Measured on the inline booking cancel:** the focused "Annulla" button unmounts, so focus drops to `<body>`. The prompt "Confermi l'annullamento…" is not in a live region, so a screen-reader user hears nothing.
- **Why it matters:** these are the irreversible actions (delete a flight and its charge, reverse a payment). Keyboard and screen-reader users cannot operate them predictably, which fails WCAG 2.4.3, 2.1.2 and 4.1.2. The app already has a correct dialog primitive in `SlideOver` (focus-in, trap, Escape, focus return, verified in §4.4), so this is an inconsistency, not a missing capability.
- **Fix:** add one `ConfirmDialog` primitive built on the `focus-trap.ts` and `SlideOver` mechanics: `role="alertdialog"`, `aria-labelledby`/`aria-describedby`, initial focus on the *safe* button, Escape to dismiss, and focus return to the trigger. Replace all 6 sites. On mobile, `secondStep` already does this inside a dialog sheet.

**A-2 · Medium · VERIFIED · One heading per page: card titles are `div`s.**
- **Where:** 11 of 12 admin pages and every self-service page expose only `h1` (`headings` in `results/*-d1280-light-it.json`). "Programma di oggi", "Prenotazioni", "Transazioni", "Registro scadenze", "Diario di volo" and "Flotta" are `.card-title` divs. The person page is the only one with `h2`s.
- **Why:** screen-reader users navigate by headings, and here they get one stop per page (WCAG 1.3.1 and 2.4.6, best practice).
- **Fix:** render `.card-title` as `<h2>` (style unchanged) where the card is a page section.

**A-3 · Medium · VERIFIED · Every page has the same `<title>` "AirManager".**
- **Where:** 202 of 209 loads; only the 404 pages differ. The only `generateMetadata` is in `app/[locale]/layout.tsx:51`.
- **Why:** WCAG 2.4.2. Tabs, history and bookmarks are indistinguishable. Next's route announcer reads `document.title`, so client-side navigations are probably not announced (SUSPECTED, not verified with a screen reader).
- **Fix:** add per-page `generateMetadata` with a `title.template` of `'%s · AirManager'`, using the same i18n key as the H1.

**A-4 · Medium · VERIFIED · Focus is lost to `<body>` after successful actions.**
- **Where it happens:**
  - New booking submit (`flow-booking.log`: "after submit focus: BODY")
  - Flight registered, before the result panel appears
  - Failed login
  - Inline booking cancel
- **Cause:** the focused submit button becomes `disabled` or unmounts.
- **Why:** keyboard users restart from the top of the document, 22 tabs to reach "Nuova prenotazione" again. Screen-reader users lose context.
- **Fix:** after success, move focus to the status message (`tabIndex={-1}`) or to the result panel heading. After a login error, focus the alert or the first field.

**A-5 · Medium · VERIFIED · The global link colour fails contrast in light theme.**
- **Where:** `airops.css:357` sets `a{ color: var(--info) }` at **3.61:1** on white. The pilot-name links on Pilots (`pilots/pilots-console.tsx:403-411`, 13.5 px) are blue at 3.61. The file's own comment (`airops.css:3626`) acknowledges the token and fixes it site by site.
- **Fix:** darken the token used for link text, for example a dedicated `--link` at ≈ oklch(0.50 0.12 245) in light. Keep `--info` for fills.

**A-6 · Medium · VERIFIED · The mobile KPI strip is a scroll region that keyboard and switch users cannot scroll.**
- **Where:** axe `scrollable-region-focusable` (serious) on mobile Overview, Logbook, Reports and Instructors. `.kpi-row` hides its scrollbar (`airops.css:2036`). Off-screen KPIs, for example "Prenotazioni in attesa" and "Ricavi del mese" on Overview, are unreachable without touch.
- **Fix:** `tabIndex={0}` with `role="group"` and `aria-label` (the previous audit's suggestion), or wrap to 2×2 when there are four KPIs or fewer.

**A-7 · Medium · VERIFIED (code) / SUSPECTED (announcement) · Toasts vanish after 2.6 s, including errors, and may not be announced.**
- **Where:** `components/ui/toast.tsx:27` sets `TOAST_LIFETIME_MS = 2600` for every tone. Errors shown only as toasts include booking conflict (`bookings-table.tsx:333`), generic booking errors (`:337`), aircraft status conflict (`aircraft-editor.tsx:781, 804`) and last-admin (`pilots-console.tsx:275`). Each toast is a `role="status"` node *inserted together with its text* (`toast.tsx:41-48`), a pattern several screen readers miss.
- **Also:** a successful rejection is shown in the red "bad" tone (`bookings-table.tsx:317, 365`).
- **Fix:** make the host a persistent `aria-live` container, keep error toasts until dismissed (or at least 8-10 s), use pause-on-hover, and use a neutral tone for "rejected".

**A-8 · Low · VERIFIED · A `select` has no accessible name.**
`select[data-testid="scadenze-filter-type"]` on the desktop Expiries page triggers axe `select-name` in both locales. Fix: `aria-label`.

**A-9 · Low · VERIFIED · Desktop targets under 24×24 (WCAG 2.5.8).**
- Bare search inputs are 18.1 px tall: `pilots-search`, `fleet-search`, `flight-filter-person`, `billing-filter-person` and `scadenze-filter-pilot`. The visual wrapper is larger, but only the input receives clicks.
- Small text links: "Vedi tutti" at 15.9 px (person page), "→ dettaglio" at 16.7 px and "Vedi tutte le persone" at 15.9 px (Billing).
- Fix: make the `.search` wrapper the click target (a `<label>`) and pad the links.

**A-10 · Nit · VERIFIED · `<aside role="navigation">`.**
axe reports `aria-allowed-role` on every page. Fix: put a `<nav>` inside the `aside`.

### 4.2 Mobile

**MOB-1 · Low · VERIFIED · Logbook and person-page rows truncate the route before the destination.**
- Mobile rows show "31/10/2026 · Aviosuperficie Poggio al…" (`scrollWidth` 451-498 vs 228). The destination is never visible on a phone.
- Screenshots: `admin-logbook-m375-light-it.png`, `student-logbook-m375-light-it.png`.
- Same root cause as DESK-1.

**MOB-2 · Low · VERIFIED · Tab-bar labels are 9.5 px.**
`airops.css:1843`. This is below the usual 11 px minimum for legible UI text and compounds M6. Fix: 10.5-11 px with the shorter label proposed in M6.

### 4.3 Desktop

**DESK-1 · Medium · VERIFIED · The Logbook route column spells out the full home-field name twice, in bold monospace.**
- Rows read "Aviosuperficie Poggio al Vento → Aviosuperficie Poggio al Vento" and wrap to 3-4 lines. Rows are about 80 px tall, so 20 rows produce a 2,190 px page that is mostly the airfield name.
- Screenshots: `admin-logbook-d1280-light-it-full.png`, and the person page's "Ultimi voli" in `admin-people_cmvzh573b000x77pvu01pc644-d1280-light-it-full.png`.
- Fix: show ICAO or a short code (`LIQS`), and collapse departure equals arrival into a "Locale" badge.

**DESK-2 · Medium · VERIFIED · Pending requests are invisible on the schedule the admin decides them against.**
- The timeline and week view read APPROVED bookings only (`bookings/page.tsx:276`; `bookings.service.ts:114`).
- The week view shows "0 prenotazioni" on 7/11 and 8/11, where pending requests exist (`admin-schedule-week-d1280.png`).
- The week bars have no legend.
- The page subtitle promises "prenotazioni in attesa di approvazione".
- Fix: draw pending requests as ghost (hatched) blocks with the requester's name, and add a legend.

**DESK-3 · Medium · VERIFIED · The person page ships a "coming soon" section and a generic title.**
- "Prossime prenotazioni — Disponibile prossimamente." is declared a placeholder in `people/[id]/page.tsx:32` and `messages/it.json:649`. De Santis Marco has upcoming bookings.
- The topbar title is the fallback "Pannello" (`messages/it.json:43`).
- Screenshot: `admin-people_cmvzh573b000x77pvu01pc644-d1280-light-it-full.png`.
- Fix: render the person's upcoming bookings (the data exists in `listBookings`) or remove the card. Give the route a registry title such as "Scheda persona" or the person's name.

**DESK-4 · Low · VERIFIED · Booking rows carry 4-5 equal-weight mini buttons that wrap to two lines.**
- Each row has Modifica, Effettuato, Assente and Annulla; pending rows add Approva and Rifiuta. There is no primary next step, and the destructive "Annulla" looks like the others. Rows are about 78 px tall.
- Screenshot: `admin-bookings-d1280-light-it-full.png`. This is the desktop twin of M13d.
- Fix: one primary contextual action (Approva, or Effettuato for past slots) plus a `⋯` menu.

**DESK-5 · Low · VERIFIED · Four-tile KPI rows leave an empty fifth column.**
- `.kpi-row{ grid-template-columns: repeat(5, 1fr) }` (`airops.css:367-371`). This affects Overview, Logbook, Reports, and the pilot and instructor landings at ≥ 1200 px.
- Fix: `repeat(auto-fit, minmax(180px, 1fr))`.

**DESK-6 · Low · VERIFIED · KPI numeric style used for text.**
- The pilot landing's "Ratings" tile renders "Rating SEP · Inglese ICAO" in the 28 px KPI style on 3 lines. That tile is 295 px tall while its siblings are 80 (`pilot-overview-d1280-light-it.png`). "Licenza PPL(A)" has the same issue.
- Fix: a "facts" tile variant or chip list for non-numeric values.

**DESK-7 · Low · VERIFIED · Billing table noise.**
- Empty cells show a coloured "—": red in "Uscite" on every revenue row and green in "Entrate" on cost rows.
- The "Stato" column reads "Registrato" on all rows.
- Descriptions truncate before their identifying part: "Addebito volo — Volo I-PDV…".
- Screenshot: `admin-billing-d1280-light-it-full.png`.
- Fix: neutral placeholders, hide the status column when uniform, and shorter descriptions (see I18N-1).

**DESK-8 · Low · VERIFIED · Reports charts are hard to read.**
- No y-axis values on "Ricavi" or "Ore volate".
- The current partial month is plotted as a plunge to 0.
- "Ore istruttori" shows negative amounts that wrap ("-58,33 €") and a stray 1 px bar.
- "Utilizzo flotta 0,2%" is unexplained.
- Screenshot: `admin-reports-d1280-light-it-full.png`.
- Fix: axis ticks, a dashed or partial marker for the current month, and a tooltip for the utilisation formula.

**DESK-9 · Low · VERIFIED · Grey haze on the right edge of every page that mounts a closed SlideOver.**
- The closed `.slideover-panel` sits at `translateX(100%)` but keeps `box-shadow: -24px 0 60px -30px …` (`airops.css:1099-1108`), which paints into the viewport. The effect is visible in every 1280 screenshot.
- It is inherited from the prototype (`proto-overview-1280-light.png`).
- Fix: apply the shadow only on `.slideover.open`, or set `visibility:hidden` after the close transition.

**DESK-10 · Low · VERIFIED · The instructor sees negative "due" amounts with no explanation.**
- "Dovuto nel mese -75,00 €" and "Residuo dovuto -58,33 €" with 0:00 hours (`instructor-my-compensation-d1280-light-it.png`); the landing shows "-75,00 € dovuti nel mese".
- Whatever the ledger semantics, a negative amount "owed to you" needs a label such as "anticipo" or "pagato in eccesso". The domain auditor should confirm the numbers.

### 4.4 Forms and flows

**FORM-1 · Medium · VERIFIED · "Annulla" means three different things, including both sides of one confirm.**
- The inline booking-cancel confirm reads "Confermi l'annullamento di questa prenotazione? **Sì, annulla** | **Annulla**" (`bookings-table.tsx:626-638`).
- The row action "Annulla" cancels a booking. The footer "Annulla" of every form closes it. The new-booking panel's ✕ is *also* named "Annulla" (first Tab stop in `flow-booking.log`).
- The flight row's "Annulla" opens a modal titled "Annulla volo" whose button is "Elimina volo".
- Fix: use "Chiudi" or "Indietro" for dismiss, and name the destructive verb by its object: "Annulla prenotazione" or "Elimina volo".

**FORM-2 · Medium · VERIFIED · The flight form preselects an aircraft and defaults the date from UTC.**
- "Nuova voce" opens with VELIVOLO = I-A661, the first aircraft (`flow-flight.log`). A hurried user charges the wrong aircraft.
- `todayDateOnly()` returns `new Date().toISOString().slice(0,10)` (`logbook/flight-editor.tsx:244-246`, the same in `billing/transaction-editor.tsx:73-75`).
- With the browser clock fixed at **00:30 Europe/Rome on 03/11**, the form defaulted to **2026-11-02**.
- Fix: no aircraft preselection (or preselect from the person's booking), and build the date from local `getFullYear/getMonth/getDate`.

**FORM-3 · Medium · VERIFIED · Booking success feedback is easy to miss.**
- After "Prenota", the panel stays open, the form resets, and a **10.5 px uppercase monospace** line "PRENOTAZIONE CREATA." appears in raw `--ok` at **2.73:1**. Focus goes to `<body>`.
- Screenshot: `flow-booking-08-success.png`.
- The flight form shows the right pattern: a result panel with duration, rate, total, new balance and a negative-balance warning (`flow-flight-04-result.png`).
- Fix: close the panel and show a persistent toast naming the booking, or switch to a result panel. The raw-token contrast is accepted TD ("40 inline var(--bad)/var(--ok)"); the hierarchy problem is not.

**FORM-4 · Medium · VERIFIED · Top-up amount errors say "Campo obbligatorio." for non-empty invalid input.**
- Typing "abc" or "-5" shows "Campo obbligatorio."
- Cause: `pilots/pilots-console.tsx:826` uses `error={errors.amount ? labels.requiredField : undefined}`.
- Fix: distinct messages for empty, not a number, and ≤ 0.

**FORM-5 · Medium · VERIFIED · Set-password with an invalid or expired token is a dead end.**
- The form renders normally. The error appears only after the user types the password twice: "Il link non è valido o è scaduto. Richiedine uno nuovo." It offers no link to `/forgot-password` and no way back to login.
- Screenshot: `anon-set-password-invalid-submitted-375.png`.
- Fix: validate the token on load, and replace the form with the message plus a "Richiedi un nuovo link" CTA.

**FORM-6 · Medium · VERIFIED · A filtered empty state claims there is no data.**
- Logbook with a date range that matches nothing shows "0 voci registrate", four zero KPIs and "Nessun volo registrato." while 24 flights exist.
- Desktop shows "Azzera filtri" in the head. Mobile shows only the "Filtri (1)" badge.
- Screenshot: `empty-logbook-d1280.png`.
- Fix: "Nessun volo corrisponde ai filtri" plus a reset button next to the message.

**FORM-7 · Low · VERIFIED · Focusing the first invalid combobox opens its listbox over the other errors.**
- After an empty submit on New booking, the person listbox opens and covers 3 of the 4 "Campo obbligatorio." messages.
- Screenshot: `flow-booking-03-empty-submit.png`.
- Fix: do not auto-open on programmatic focus.

**FORM-8 · Low · VERIFIED · Required fields are not marked.**
- The `Field` primitive has no `required` affordance (`components/ui/field.tsx`). Users discover required fields on submit: 4 of 11 on New flight, 4 of 6 on New booking.
- Fix: a `required` prop that renders a marker and `aria-required`.

**FORM-9 · Low · VERIFIED · Two money-input patterns.**
- Top-up and adjustment use a text input with `inputMode="decimal"` and placeholder "0,00", accepting a comma (`pilots-console.tsx`, `people/[id]/account-section.tsx:658, 791`).
- "Nuova transazione" uses `type="number" step="0.01"` with a **leading** "€" prefix (`billing/transaction-editor.tsx:299-305`). The rest of the app writes "10,50 €".
- Fix: one `MoneyInput` primitive.

**FORM-10 · Low · SUSPECTED · Native date inputs follow the browser locale, not the app locale.**
- `DateInput`/`DateTimeInput` wrap `<input type="date|datetime-local">` (`components/ui/date-input.tsx:123`). Headless Chrome showed "dd/mm/yyyy" in the Italian UI; an en-US browser would show mm/dd/yyyy inside the Italian app.
- This is a platform limitation. It is worth a note, or a text field with a mask.

### 4.5 i18n and copy

**I18N-1 · Medium · VERIFIED · Server-composed descriptions are stored in Italian with ISO dates.**
- Transaction descriptions read "Volo I-PDVB 2026-10-31 — 1:35" and "Volo senza addebito I-B412 2026-10-23 — 0:45".
- In IT they appear with an ISO date and a doubled word ("Addebito volo — Volo …").
- In EN the same cell mixes languages: "Flight charge — Volo I-PDV…" (`admin-billing-d1280-light-en.png`). The aria-labels show it too: "Open detail: Flight charge — Volo I-PDVB 2026-10-31 — 1:35 · €299.25".
- System categories "Compensi istruttori" and "Ricariche" are not localized in EN.
- Fix: store structured fields (registration, date, duration) and format them at render time. Localize system category names by key.

**I18N-2 · Low · VERIFIED · Person-name order differs between views.**
- Surname first: Pilots, Logbook, Expiries, Avvisi, the person page H1, mobile Logbook.
- First name first: Bookings table and sheet, Overview pending queue, Reports "Per pilota" and "Ore istruttori", the instructor landing greeting.
- Fix: surname-first in registries and sortable tables, first-name-first in conversational contexts, written down as a rule.

**I18N-3 · Low · VERIFIED · Anglicisms and English plurals in the Italian catalogue.**
- "Ratings" appears 17 times in `messages/it.json`, including "Aggiungi Ratings", "Nome Ratings" and "Scadenze certificati e Ratings". Italian keeps loan nouns invariable ("i rating"), and the prototype used "abilitazioni".
- "Currency" appears 6 times. "payout" appears in "Tariffa payout" and "Tariffa media payout".
- Decide the glossary once.

**I18N-4 · Nit · VERIFIED · Small inconsistencies.**
- Day abbreviations: "63g fa" vs "12 g" (IT), "10d ago" vs "12 d" (EN).
- Ellipses: "..." 4 times vs "…" 14 times.
- Date-time separators: "02/11/2026, 17:29" vs "03/11/2026 · 09:00".
- Status chips mix number and gender: "Tutte · In attesa · Approvato".
- Capitalisation in one toggle: "novembre 2026 | Anno 2026".
- Italian typography is otherwise clean: 0 occurrences of "E'" for "È" in 1,622 strings.

**I18N-5 · Low · VERIFIED · Error pages are English-only and outside the app.**
See PERF-1: the 404 and 500 pages show "This page could not be found." and "This page couldn't load".

**WIP page (Settings, story 19.8), observations only, not counted:**
- The EN page shows the Italian "Salva".
- Number inputs show "280.00" and "0.00" with dot decimals in the IT UI.
- The sticky save bar overlaps card content in a full-page capture.
- The SMTP placeholders are 3.60:1 in dark.
- The disabled "Salva" is 2.60:1 in dark (disabled, so exempt).

### 4.6 Visual consistency and identity

**VIS-1 · Low · VERIFIED · The favicon is Next.js's default.**
- `src/app/favicon.ico` is 25,931 bytes, the create-next-app default. There is no web manifest, `apple-touch-icon` or `theme-color`, so home-screen installs look generic.
- Fix: export the brand mark (the runway glyph already in `Icon.logo`).

**VIS-2 · Low · VERIFIED · The port dropped useful density from the prototype.**
- Fleet cards lost the hourly rate row (`proto-fleet-1280-light.png` vs `admin-fleet-d1280-light-it.png`).
- Expiries rows lost the role sub-line under the pilot name (`proto-scadenze-1280-light.png`).
- The overview subtitle became a lone "0 AOG" (the prototype read "1 AOG · 3 PPR in attesa · 2 in transito").

**VIS-3 · Low · VERIFIED (judgement) · Expiries full-row tints are heavy in dark theme.**
Saturated dark-red and brown row backgrounds on every row (`admin-expiries-d1280-dark-it.png`); the light theme is acceptable. Severity is already encoded three times: row tint, day count colour and status badge. Fix: tint only the status cell or a left rule.

**Identity assessment (no finding).**
- The app does **not** read as generic SaaS. It pairs Inter Tight with JetBrains Mono for data, uses one amber accent, a tight radius scale and hairline borders. There are no gradient blobs, no emoji icons and no glassmorphism.
- The weak notes are DESK-9 (accidental grey haze), the monospaced uppercase overuse (status text, labels, success messages and "Registrato da" emails all in mono), and the Next.js favicon.

### 4.7 Performance and resilience

**PERF-1 · Medium · VERIFIED · No app-level error or not-found boundary.**
- `src/` has 0 `error.tsx` and 0 `not-found.tsx`.
- `/it/dashboard/people/<invalid>` renders Next's default English "404 · This page could not be found." It has no shell, no way back, no `lang` attribute and no `main` landmark (axe `html-has-lang`, `landmark-one-main`). Screenshot: `admin-people_nonexistent-id-123-d1280-light-it.png`.
- Under concurrent load, `/en/dashboard` returned **500** in 1 of 3 manual reloads and once in the crawl. The cause is Prisma P2028 "Unable to start a transaction in the given time", from `renderAdminOverview` → `getStats` → `listAircraft`'s interactive `$transaction` (`aircraft.service.ts:137`; dev log `scratchpad/audit/devserver.log` lines 17-33, 460-478, 1284-1301). The user gets Next's generic English "This page couldn't load · Reload".
- Fix (UI): add a localized `error.tsx` and `not-found.tsx` under `[locale]/dashboard` that keep the shell.
- Fix (engineering, cross-reference for audit-engineering): the overview fans out several interactive transactions per request, and a single timeout takes down the whole page.

**PERF-2 · Low · VERIFIED · Dual desktop and mobile DOM trees.**
- Nodes inside `display:none` subtrees make up **18-37%** of the DOM on desktop and **32-89%** on mobile. The mobile Overview has 799 of 893 nodes hidden.
- Both trees render and hydrate. This is harmless at demo scale (max 933 nodes), but it doubles render and hydration cost as data grows; the prior audit's dataset had 187 aircraft.
- Hidden subtrees are out of the accessibility tree, so there is no duplicate ARIA.

**PERF-3 · Info · VERIFIED · Server-rendered data with no client waterfalls.**
- There were 0 client API calls on any page load.
- Dev-mode TTFB ran 0.66-1.7 s on a machine at load average 14. This is not representative; re-measure on `next start`.

**PERF-4 · Low · SUSPECTED · Intermittent hydration attribute mismatch.**
- It appeared 6 times in 209 loads (Billing, Bookings, Expiries, Overview, in both locales) and 0 times in 10 forced reloads.
- Client components that read the clock during render are only the date-default helpers in FORM-2. The likely cause is dev-time recompilation, but React says it "won't be patched up", so check once on a production build.

### 4.8 UI code

**CODE-1 · Low · VERIFIED · `airops.css` is 186,916 bytes over 3,746 lines, and 58% of that (107 KB) is comments.**
- Production minification strips the comments, but they make the file hard to navigate. Change history belongs in git, not in the stylesheet.
- There are 0 `!important` (good) and 32 `@media` blocks, almost all `max-width:640px`.
- There are **47 colour literals outside the token blocks**: badge, alert, stat and list-icon tone colours are hand-tuned per component, with per-component dark overrides (`airops.css:693-727, 826-827, 1146-1148`). The system lacks text-on-soft tokens such as `--ok-ink` and `--bad-ink`, which is why raw `--ok`/`--bad` keep leaking into text (A-5, FORM-3).
- There are 52 selector blocks declared more than once.

**CODE-2 · Low · VERIFIED · Primitives are bypassed.**
- `Segmented` is imported in 1 file, while 8 places hand-roll the `.segmented` markup.
- KPI tiles are re-implemented in `expiries/scadenze-console.tsx:832` and `billing/billing-panels-mobile.tsx:119-130`.
- There are **478 inline `style={{}}` objects**: `billing-console.tsx` 52, `pilot-editor.tsx` 38, `flight-editor.tsx` 28, `logbook-console.tsx` 28. Inline styles defeat media queries; the code comments themselves record two moves to classes for that reason.
- There are 25 inline raw tone text colours (accepted TD).

**CODE-3 · Low · VERIFIED · Giant client components.**
`billing-console.tsx` has 1,598 lines, `pilot-editor.tsx` 1,386, `flight-editor.tsx` 1,167, `logbook-console.tsx` 1,102 and `aircraft-editor.tsx` 1,093; the server `dashboard/page.tsx` has 1,160. Render cost is fine today. The cost is review and regression surface, and each holds its own copy of patterns that belong in primitives (confirm modal, money input, status line).

**CODE-4 · Nit · VERIFIED · Instrument Serif is imported but never used.**
`app/[locale]/layout.tsx:14` imports it, and `--font-display` is never referenced. Fonts are otherwise self-hosted through `@fontsource` with `font-display: swap`, which causes a brief FOUT on first load and no layout shift risk worth noting.

**CODE-5 · Nit · VERIFIED · No print styles.**
There are 0 `@media print` rules. Acceptable, because PDFs are server-rendered with react-pdf.

**Clean checks (no finding):**
- 0 Tailwind or shadcn leftovers.
- 0 `dangerouslySetInnerHTML`.
- `lang` is correct per locale on all in-app pages.
- `viewport` includes `viewport-fit=cover`.
- 0 duplicate IDs on 209 loads.

---

## 5. Contrast: worst measured, both themes

Measured text only; disabled controls are noted separately. "Accepted" means the item is in the 15.10 ratified list or in the `action_items` TD POST-EPIC entry.

| # | Light theme | Ratio | Status | | Dark theme | Ratio | Status |
|---|---|---|---|---|---|---|---|
| 1 | Form success line in raw `--ok` ("PRENOTAZIONE CREATA.", "Volo eliminato.") | **2.73** | accepted TD (40 inline) | | Table header labels (`--ink-4`, "Data", "Pilota") | **3.88** | accepted |
| 2 | Table header labels (`--ink-4`) on `--bg-sunken`, 24 pages | 3.46 | accepted | | `.weather-title` "Meteo campo" | 3.88 | accepted class |
| 3 | `.weather-title` "Meteo campo", 46 pages | 3.46 | accepted class | | `.nav-label` "Operazioni" | 4.14 | accepted |
| 4 | **Pilot-name links** (`a{color:var(--info)}`) | **3.61** | **NEW (A-5)** | | `.axis-label` "Aeromobile" | 4.14 | accepted |
| 5 | `.nav-label` "Operazioni" | 3.66 | accepted | | Bare search placeholders "Cerca per nome…" | 4.31 | NEW, placeholder |
| 6 | `.axis-label` "Aeromobile" (schedule) | 3.66 | accepted | | SMTP placeholders | 3.60 | WIP page |
| 7 | **Negative balance "-94,25 €"** in Pilots table (inline `var(--bad)`, `pilots-console.tsx:416`) | **3.96** | NEW instance of the accepted class | | Pagination "←" on page 1 | 3.53 | disabled, exempt |
| 8 | Form error lines in raw `--bad` (`booking-form-error`, `topup-form-error`, …) | 3.97 | accepted TD | | Disabled "Salva" | 2.60 | WIP and disabled |
| 9 | Bare search placeholders (5 pages) | 4.17 | NEW, placeholder | | | | |
| 10 | `.segmented` inactive "Settimana" | 4.39 | accepted | | | | |
| - | Pagination "←" on page 1 | 2.61 | disabled, exempt | | | | |

Body text, KPI values, badges (`.badge.ok/bad/warn/info`), status pills, sheet labels and the mobile tab bar pass in **both** themes on all 209 loads.

---

## 6. What is genuinely good

1. **Layout robustness.** There is 0 horizontal page overflow in 209 loads across 4 viewports, 3 theme modes and 2 locales. Internal scrollers are deliberate.
2. **The `SlideOver` dialog primitive is correct.**
   - Enter on the trigger moves focus into `aside[role=dialog]`, named "PRENOTAZIONI Nuova prenotazione".
   - Tab wraps inside the panel (`flow-booking.log`, positions 19→20→21).
   - The first Escape closes only an open combobox popup. The next Escape closes the panel.
   - Focus returns to "Nuova prenotazione".
   - Closed panels are `inert` and `aria-hidden`.
3. **`SearchCombobox`** implements the ARIA 1.2 combobox pattern (`role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role=option`, `aria-selected`). Arrow keys and Enter work.
4. **Inline validation.** Errors sit per field with `aria-invalid`, are linked by `aria-describedby` and use `role=alert`, and the first invalid field is focused (`flow-booking-03`, `flow-flight-02`).
5. **Double-submit protection.** Two Enter presses produced exactly one POST.
6. **The flight result panel** is the best feedback in the app. It shows duration, rate, cost, total, new balance and a plain-language negative-balance warning (`flow-flight-04-result.png`).
7. **The flight-delete confirmation copy** spells out the irreversibility and the ledger consequence: "Il volo verrà eliminato definitivamente insieme al suo addebito… L'operazione non si può annullare."
8. **Role landings.** A pilot sees balance, licence, medical expiry and upcoming flights. An instructor sees hours, rate and payout. Other pilots' bookings show as "Occupato", which protects privacy. Admin-only URLs redirect to the landing page instead of erroring.
9. **The mobile sheets** (booking, pilot, Altro, profile) have all actions at 44-45 px, and approving a request from a phone still takes 2 taps.
10. **Theme discipline.** There are 0 `!important`, tokens drive both themes, and badges and KPIs pass contrast in dark.
11. **Data architecture.** Every page is server-rendered with zero client fetches. The DOM stays under 1,000 nodes at demo scale.
12. **The Italian copy** is idiomatic, with correct accents (no "E'"), mostly typographic ellipses, and clear domain messages such as the AOG 422 messages naming the constraint.
13. **No leftovers.** There is no retired-stack code (Tailwind, shadcn) and no `dangerouslySetInnerHTML`.

---

## 7. Open questions (for the PO)

1. **Pending requests on the timeline (DESK-2).** Showing only APPROVED is a domain rule ("only approved occupies a slot"). Would the PO accept pending requests drawn as non-blocking ghost blocks, so approvals are decided against the plan?
2. **Aircraft preselection in "Nuova voce" (FORM-2).** Is it intended, for example "most common aircraft"? If not, should the field start empty or derive from the person's booking?
3. **Name order (I18N-2).** Which convention per context: registry surname-first, conversation first-name-first?
4. **Stored descriptions (I18N-1).** Can the ledger keep structured fields so EN users never see "Volo … 2026-10-31"? This touches existing rows, so it is a data-migration decision.
5. **Glossary (I18N-3).** "Rating"/"Ratings" vs "abilitazione", "Currency", "payout". Which terms are the club's own jargon to keep?
6. **Touch floor (T1, ratified R1).** Should the 44 px floor key on `(pointer: coarse)` instead of `≤640px`? Tablets now also clip 244-698 px of table content.
7. **Negative "dovuto" for instructors (DESK-10).** Is a negative "due this month" the intended presentation of an advance, or a ledger artefact? Over to the domain audit.
