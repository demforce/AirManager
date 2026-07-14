# Epic 12 — AirOps UI Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Project override (CLAUDE.md, priority over skill defaults):** execution runs on the project's BMAD cycle — each Task below = ONE story, implemented by ONE `dev-story` subagent (Sonnet 5 xhigh) briefed with: this plan's task section, the spec (`docs/superpowers/specs/2026-07-14-airops-ui-replacement-design.md`), the prototype files it ports, and the skills `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (UI stories). After each story: adversarial review (Opus 4.8 xhigh, never downgraded), fixes in main session, commit per story. `npm run db:reset` before every dev AND review run.

**Goal:** Replace the entire AirManager UI with the AirOps design system (ported as-is from `docs/design-reference/airops/`), rewire every view to real data, extend the backend (booking approval workflow, instructor payouts, stats API, METAR, SMTP settings, aircraft fields), and remove the pages/APIs the new UI doesn't use.

**Architecture:** The prototype's `styles.css` becomes the app-wide stylesheet; its React primitives become typed components in `src/components/ui/`; each page = server component (service-layer fetch) + client component (interactivity), mutations via API v1. Backend changes land BEFORE the UI that consumes them. The prototype is the visual contract; the domain contract (spec D13) wins where they conflict.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma + PostgreSQL 16, Auth.js v5 RBAC, next-intl (IT source of truth), Zod + OpenAPI, Vitest + Playwright. Fonts self-hosted via `@fontsource/*` (project rule: no build-time font fetch).

---

## Ground rules (apply to every task)

- Branch: `epic-12-airops-ui` (exists). One commit set per story: story file (if used) → implementation → review fixes. Push after each commit when git credentials are available (this machine may lack them — then the user pushes).
- `npm run gates` MUST pass before every story commit (lint+typecheck+vitest+build, compact output — never run the 4 verbose commands separately).
- e2e: new/changed specs land in the SAME commit as the page they cover. Selectors scoped to landmarks (`getByRole('navigation', { name: … })`) or `exact: true`; NEVER page-level substring name-match; NEVER `hasText` with H:MM/date values (use `\b`-anchored regex or exact cell asserts).
- Dates: `formatDateOnly` (DD/MM/YYYY), days bucketed in Europe/Rome (`src/lib/zoned-time.ts`). Money: cents integers + existing `src/lib/money.ts` format (`1.500,00 €`, thousands separator always).
- i18n: every user-facing string via next-intl — IT = prototype text (source of truth), EN translated in the same commit. Keys under a per-page namespace in `messages/it.json` / `messages/en.json`.
- Before running e2e locally: `curl localhost:3000` must FAIL (`fuser -k 3000/tcp`). Full-suite runs: `CI=1 npx playwright test` on a fresh DB, production build.
- If a story adds env vars/settings: update `.env.example`, `.github/workflows/ci.yml`, hooks/scripts in the same commit (`src/lib/env.ci-sync.test.ts` enforces).

## File structure (epic-wide map)

**New shared UI (Task 1):**
```
src/styles/airops.css                     ← port of docs/design-reference/airops/styles.css
src/components/ui/icons.tsx               ← icons.jsx
src/components/ui/badge.tsx               ← primitives.jsx#Badge
src/components/ui/kpi.tsx                 ← primitives.jsx#KPI + Spark
src/components/ui/avatar.tsx              ← primitives.jsx#Avatar
src/components/ui/toast.tsx               ← primitives.jsx#ToastHost (context-based, no window events)
src/components/ui/slide-over.tsx          ← SlideOver.jsx#SlideOver
src/components/ui/field.tsx               ← SlideOver.jsx#Field/Input/Select + input-group
src/components/ui/segmented.tsx           ← .segmented pattern (used everywhere)
src/components/ui/export-menu.tsx         ← ExportMenu.jsx (wired to real export hrefs via src/lib/export-href.ts)
src/components/ui/calendar-popover.tsx    ← Schedule.jsx#CalendarPopover
src/components/shell/sidebar.tsx          ← Sidebar.jsx (nav = <Link>, real badges, weather slot)
src/components/shell/top-bar.tsx          ← TopBar.jsx (breadcrumb, theme toggle, user chip)
src/components/shell/theme-toggle.tsx     ← cookie-persisted data-theme switch
```
**Pages (Tasks 3–12)** replace the bodies under `src/app/[locale]/dashboard/*` (routes listed per task). **Deletions** concentrated in Task 13 (see table there).

---

### Task 1 (story 12.1): Design-system foundation, shell, auth pages

**Files:**
- Create: everything in the "New shared UI" map above
- Modify: `src/app/globals.css`, `src/app/[locale]/layout.tsx` (fonts, data-theme), `src/app/[locale]/dashboard/layout.tsx` (shell), `messages/it.json`, `messages/en.json`, `package.json` (fontsource deps)
- Modify: `src/app/[locale]/(auth)/login/page.tsx`, `.../set-password/page.tsx`, `.../forgot-password/page.tsx` (+ their client components)
- Test: `e2e/login.spec.ts`, `e2e/welcome.spec.ts` (update selectors), new `src/components/ui/badge.test.tsx`-style unit tests only where logic exists (calendar grid math)

- [ ] **Step 1: deps + fonts.** `npm i @fontsource/inter-tight @fontsource/jetbrains-mono @fontsource/instrument-serif`. In `src/app/[locale]/layout.tsx` import the three font CSS files; keep Geist imports until Task 13 removes legacy pages.
- [ ] **Step 2: port `styles.css` → `src/styles/airops.css`.** Copy verbatim from `docs/design-reference/airops/styles.css`, with ONLY these edits: (a) font-family vars point at the fontsource families (`"Inter Tight"`, `"JetBrains Mono"`, `"Instrument Serif"` — names unchanged, packages provide them); (b) `[data-theme=…]` selectors target `html[data-theme=…]` (theme is set on `<html>`, not `<body>`); (c) append the `.ppr-*` public-form styles from the `<style>` block of `docs/design-reference/airops/PPR Request.html` (they belong to the shared sheet so `/ppr` reuses them). Import it from `globals.css` after the tailwind import.
- [ ] **Step 3: theme cookie.** In `src/app/[locale]/layout.tsx` (server) read the cookie and stamp the attribute:
```tsx
const theme = (await cookies()).get('am-theme')?.value === 'dark' ? 'dark' : 'light';
// <html lang={locale} data-theme={theme}>
```
`src/components/shell/theme-toggle.tsx` (client): on click, flip `document.documentElement.dataset.theme` and `document.cookie = 'am-theme=…; path=/; max-age=31536000; samesite=lax'`. No flash: attribute is SSR'd.
- [ ] **Step 4: port primitives** listed in the file map. Rules: same class names and DOM shape as the prototype file (1:1 markup); typed props; `Toast` becomes a React context provider (`useToast().show(msg, tone)`) mounted in the dashboard layout — no `window` custom events; `Icon` is a namespace of typed SVG components copied verbatim from `icons.jsx`.
- [ ] **Step 5: shell.** `sidebar.tsx`: nav groups exactly as `Sidebar.jsx` (Operazioni/Anagrafiche/Archivio/Sistema) but items are `<Link>`s with `aria-current`, labels from i18n, badge counts passed in as props (wired per-page in later tasks; render nothing until provided); brand block = **AirManager** + `<clubName · ICAO>` from `app-settings.service.ts`; weather card renders only when a `metar` prop is provided (Task 11 supplies it). Role filtering: ADMIN/STAFF see all; INSTRUCTOR sees Panoramica/Pianificazione/Registro voli/Scadenze; PILOT/STUDENT see Panoramica/Pianificazione/Registro voli. `top-bar.tsx`: breadcrumb `AirManager / <ICAO> / <page>`, theme toggle, user chip (real session name + role). Wire both into `dashboard/layout.tsx` replacing the current shell; legacy pages must still render inside the new shell (they keep working until each is replaced).
- [ ] **Step 6: auth pages** rebuilt in the design language (card on `--bg`, `.fld/.input/.btn primary`, brand mark, IT/EN strings): same form fields, actions and API calls as today — visual change only.
- [ ] **Step 7: e2e + gates.** Update `login.spec.ts`/`welcome.spec.ts` selectors; add an e2e assert: theme toggle flips `html[data-theme]` and survives reload. `npm run gates`. Interactive check via Playwright MCP (login → dashboard shell, both themes).
- [ ] **Step 8: Commit** `feat(12.1): AirOps design system, shell, auth pages`.

### Task 2 (story 12.2): Booking approval workflow (backend)

**Files:**
- Modify: `prisma/schema.prisma`, Create: `prisma/migrations/<ts>_booking_approval_workflow/migration.sql` (hand-written)
- Modify: `src/server/services/bookings.service.ts` (+`.test.ts`), `src/lib/schemas/bookings.ts`, `src/lib/schemas/registry.ts`
- Create: `src/app/api/v1/bookings/[id]/transition/route.ts`
- Modify: `src/server/adapters/mail/mail-sender.ts` consumers (new deny email in `bookings.service.ts`)
- Test: extend `e2e/api-v1.spec.ts` happy-path; unit tests carry the matrix

- [ ] **Step 1: schema.** In `Booking`: replace enum + add decision/closure fields:
```prisma
enum BookingStatus {
  PENDING
  APPROVED
  DENIED
  FLOWN
  NO_SHOW
  CANCELLED
}
// on model Booking (in addition to existing fields):
  status          BookingStatus @default(PENDING)
  decidedAt       DateTime?
  decidedByUserId String?
  decidedByUser   User?     @relation("BookingDecidedBy", fields: [decidedByUserId], references: [id])
  denyReason      String?   /// mandatory when status == DENIED, null otherwise
  closedAt        DateTime? /// set on FLOWN / NO_SHOW
  closedByUserId  String?
  closedByUser    User?     @relation("BookingClosedBy", fields: [closedByUserId], references: [id])
```
- [ ] **Step 2: hand-written migration** (enum values can't be dropped in place — recreate type):
```sql
CREATE TYPE "BookingStatus_new" AS ENUM ('PENDING','APPROVED','DENIED','FLOWN','NO_SHOW','CANCELLED');
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus_new"
  USING (CASE "status"::text WHEN 'ACTIVE' THEN 'APPROVED' ELSE "status"::text END)::"BookingStatus_new";
DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "Booking" ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decidedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  ADD COLUMN "denyReason" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
```
- [ ] **Step 3: failing unit tests** in `bookings.service.test.ts` for the transition table (write BEFORE the service change):
```
creation: staff/admin → APPROVED; pilot/student/instructor → PENDING
PENDING  --APPROVE (staff)-->  APPROVED   (re-runs expiry/conflict checks; refuses like create would)
PENDING  --DENY (staff, reason required)--> DENIED  (sends email with reason to booking person)
APPROVED --FLOWN | NO_SHOW (staff)--> closedAt/closedByUserId stamped
DENIED|NO_SHOW|FLOWN --REOPEN (staff)--> PENDING (clears decidedAt/denyReason/closedAt/…)
anything else → 422 BOOKING_TRANSITION_INVALID; DENY without reason → 422 BOOKING_DENY_REASON_REQUIRED
CANCELLED stays reachable exactly as today (cancelBooking untouched, from PENDING or APPROVED)
```
- [ ] **Step 4: implement** `transitionBooking(actor, id, { to, reason? })` in `bookings.service.ts` with an explicit transition map; deny email via the existing mail adapter (subject/body in IT+EN, reason included). RBAC: transitions require `bookings.manage.any` (staff/admin); creation keeps existing permissions, only the initial status changes by role.
- [ ] **Step 5: API.** `POST /api/v1/bookings/[id]/transition` with Zod body `{ to: enum, reason?: string }` (in `src/lib/schemas/bookings.ts`, registered in `registry.ts` for OpenAPI). List/calendar endpoints expose the new statuses + `denyReason`.
- [ ] **Step 6: run** `npm run gates`; fix `bookings.spec.ts` fallout minimally (old UI still creates bookings — service now returns APPROVED for staff actor, so existing e2e stays green; verify).
- [ ] **Step 7: Commit** `feat(12.2): booking approval workflow (PENDING/APPROVED/DENIED/FLOWN/NO_SHOW)`.

### Task 3 (story 12.3): Pianificazione + Prenotazioni UI

**Files:**
- Rewrite: `src/app/[locale]/dashboard/bookings/page.tsx` (+ new client components under `src/app/[locale]/dashboard/bookings/`)
- Create: `src/components/schedule/schedule.tsx`, `week-grid.tsx`, `booking-table.tsx`, `new-booking-form.tsx`, `new-flight-form.tsx` (ports of `Schedule.jsx`, `Ops.jsx#BookingsTable`, `Forms.jsx#NewBookingForm`, `Schedule.jsx#NewFlightSlideOver`)
- Test: rewrite `e2e/bookings.spec.ts`

- [ ] **Step 1: Schedule timeline** ported from `Schedule.jsx`: rows = real aircraft (operational + OUT_OF_SERVICE rendered as AOG row), blocks = real bookings for the selected day (from `bookings/calendar`), day/week toggle, date navigator + `CalendarPopover`, filters (tipo volo from booking notes/instructor presence; istruttore from real instructor list), now-line only on today (Europe/Rome). Week view: per-day real booking counts.
- [ ] **Step 2: BookingsTable** with real rows + workflow actions calling `POST …/transition` (Approva/Rifiuta with reason mini-modal/Effettuato/Assente/Riapri per state, exactly the prototype's button matrix); deny reason shown under the badge. Status labels IT: in attesa/approvato/rifiutato/effettuato/assente (+annullato).
- [ ] **Step 3: forms.** `NewBookingForm`: person + aircraft + instructor = typed selectors (reuse the pattern replacing `search-combobox.tsx` with a design-styled combobox in `src/components/ui/`), date+time+duration → `startsAt/endsAt`; POST /bookings. "Nuovo volo" slide-over on this page = shortcut that opens the Task 8 flight form (if Task 8 not yet merged, hide the button — no dead UI).
- [ ] **Step 4: e2e rewrite** for the full workflow: pilot creates PENDING → staff approves → flown; deny requires reason and displays it; timeline shows the created booking block on the right day.
- [ ] **Step 5: gates + MCP visual check + Commit** `feat(12.3): pianificazione timeline + prenotazioni workflow UI`.

### Task 4 (story 12.4): PPR console + public form + Voli in transito

**Files:**
- Rewrite: `src/app/[locale]/dashboard/ppr/page.tsx` (port `Ops.jsx#PPRView` + `Forms.jsx#ManualPPRForm`)
- Rewrite: `src/app/[locale]/ppr/page.tsx` (public, port `PPR Request.html`)
- Create: `src/app/[locale]/dashboard/movements/page.tsx` (port `Ops.jsx#VisitingView`), `src/lib/ppr-movement-status.ts` (+`.test.ts`)
- Delete: `src/app/[locale]/dashboard/ppr/register/` (superseded)
- Modify: `src/server/services/ppr.service.ts` only if the movements list needs a dedicated query (prefer reusing the register query)
- Test: rewrite `e2e/ppr-queue.spec.ts`, `e2e/ppr-public.spec.ts`; replace `e2e/ppr-register.spec.ts` → `e2e/movements.spec.ts`

- [ ] **Step 1: derivation (TDD).** `src/lib/ppr-movement-status.ts`:
```ts
export type MovementStatus = 'expected' | 'inbound' | 'on-ground' | 'departed';
export function movementStatus(r: { eta: Date; closedAt: Date | null; landingFeeCents: number | null }, now: Date): MovementStatus {
  if (r.closedAt) return 'departed';               // completed or cancelled close-out
  if (r.eta <= now) return 'on-ground';
  return isSameRomeDay(r.eta, now) ? 'inbound' : 'expected';
}
```
Unit tests: the 22–24 UTC Rome-day boundary cases (lesson from PR #17), closed vs open, future days.
- [ ] **Step 2: PPR console** = full-width inbox (approve/reject with existing endpoints, reject reason mandatory as today), "PPR manuale" slide-over (existing manual-create path), "Modulo pubblico" links `/ppr`. Badge "da modulo web" for public submissions.
- [ ] **Step 3: Voli in transito** = APPROVED (open) + closed requests, KPI row (al suolo/in arrivo/attesi/movimenti nel mese from real counts), register table (nominativo/tipo/rotta/pilota·contatto/arrivo/partenza/stato). Existing register actions (complete with landing fee, cancel) move here unchanged. "Registra arrivo" = manual PPR created-and-approved in one action (service composes existing create+approve; PPR number issued normally).
- [ ] **Step 4: public form** rebuilt from `PPR Request.html` (hero, form sections, sidebar info cards, success panel with real `PPR-…` reference from the API response); airfield data (ICAO, opening hours) from settings; wingspan field maps to existing schema if present, otherwise DROP the field (check `src/lib/schemas/ppr.ts` first — do not invent columns).
- [ ] **Step 5: e2e** (public submit → appears in console → approve → shows in movements → complete with fee → departed) + gates + Commit `feat(12.4): PPR console, modulo pubblico, voli in transito`.

### Task 5 (story 12.5): Aeromobili

**Files:**
- Modify: `prisma/schema.prisma` (+migration `<ts>_aircraft_airops_fields`), `src/server/services/aircraft.service.ts` (+test), `src/lib/schemas/aircraft.ts`
- Rewrite: `src/app/[locale]/dashboard/aircraft/` → new route `src/app/[locale]/dashboard/fleet/page.tsx` (port `Fleet.jsx`; old route deleted here, not in Task 13)
- Test: rewrite `e2e/aircraft-management.spec.ts` (+ keep `aircraft-rates`/`aircraft-status-hours` green — rates/hour-meter flows keep their functionality inside the new editor)

- [ ] **Step 1: schema (additive).**
```prisma
enum AircraftOwner { CLUB PRIVATE }
// on model Aircraft:
  seats    Int?
  fuelType String?        /// free text: "AVGAS 100LL", "Jet A-1", "Mogas"
  owner    AircraftOwner @default(CLUB)
  based    Boolean       @default(true)
// on model AircraftRate:
  dryHourlyRateCents Int? /// optional dry rate, display-only (pricing keeps using the wet rate)
```
- [ ] **Step 2: fleet page** = card grid (`.ac-card`, silhouette icon, tariffa from current rate) + `AircraftEditor` slide-over (marche/modello/disponibilità/proprietario/tariffe wet+dry/posti/carburante/basato/note). AOG = existing OUT_OF_SERVICE + statusReason (editor exposes it exactly as the current page does); "Riservato" badge derived: an APPROVED booking overlapping now. Hour-meter panel and historicized rates management keep their current functionality re-skinned inside the editor.
- [ ] **Step 3: e2e + gates + Commit** `feat(12.5): fleet page + additive aircraft fields`.

### Task 6 (story 12.6): Piloti

**Files:**
- Create: `src/app/[locale]/dashboard/pilots/page.tsx` + client components (ports of `People.jsx#PilotsView/PilotEditor`, `PilotProfile.jsx`); Delete old `dashboard/people/*` here
- Modify: `src/server/services/people.service.ts` (+test) for the list projection (saldo, ultimo volo, stato account)
- Test: rewrite `e2e/people-management.spec.ts`, `e2e/person-detail.spec.ts`, `e2e/person-profiles.spec.ts`, `e2e/user-management.spec.ts` (user actions live here now), keep `e2e/typeahead-pickers.spec.ts` green

- [ ] **Step 1: list projection.** Extend the people list service with: account balance (existing accounts service), last flight date, linked-user status (attivo/sospeso/nessun accesso), role badge derived from profiles (StudentProfile→Studente, InstructorProfile→Istruttore, PilotProfile→Socio; Renter/Visitor from the prototype DO NOT exist — not rendered).
- [ ] **Step 2: page** = search + table with the prototype's columns; actions per row: Modifica (editor slide-over), Registra (top-up slide-over → existing accounts API), Sospendi/Riattiva (existing users API; only when a User is linked), name click → `PilotProfile` slide-over (identity, saldo/ultimo volo KPIs, certificazioni from expiries — medico/licenza/abilitazioni with real expiry badges — recent flights from flights API). "Aggiungi pilota" = create person (+ profiles) with optional email invite (existing invite flow).
- [ ] **Step 3: editor fields ↔ real model.** licenza/medico/abilitazioni are EXPIRIES, not Person columns: the editor's license/medical/rating fields read+write the person's expiry records via the existing expiries service (type matched by expiry-type). No new Person columns.
- [ ] **Step 4: e2e + gates + Commit** `feat(12.6): pilots registry, profile, account actions`.

### Task 7 (story 12.7): Istruttori + compensi

**Files:**
- Modify: `prisma/schema.prisma` (+migration `<ts>_instructor_payouts`): `InstructorProfile.payoutRateCents Int?` + new model
- Create: `src/server/services/instructor-compensation.service.ts` (+`.test.ts`), `src/lib/schemas/instructor-compensation.ts`, `src/app/api/v1/instructor-compensation/route.ts` (GET summary), `src/app/api/v1/instructor-payouts/route.ts` (POST)
- Create: `src/app/[locale]/dashboard/instructors/page.tsx` (+client, ports of `People.jsx#InstructorsView/InstructorEditor`, `InstructorProfile.jsx`)
- Test: adapt `e2e/instructor-rates.spec.ts`, new `e2e/instructor-compensation.spec.ts`

- [ ] **Step 1: schema.**
```prisma
model InstructorPayout {
  id                  String            @id @default(cuid())
  instructorProfileId String
  instructorProfile   InstructorProfile @relation(fields: [instructorProfileId], references: [id])
  amountCents         Int
  periodStart         DateTime          /// date-only semantics, Rome day
  periodEnd           DateTime
  method              PaymentMethod
  notes               String?
  actorUserId         String
  actorUser           User              @relation("InstructorPayoutActor", fields: [actorUserId], references: [id])
  createdAt           DateTime          @default(now())
  @@index([instructorProfileId, periodEnd])
}
```
- [ ] **Step 2: service (TDD).** `getCompensationSummary(range)` per instructor: minutes = Σ `Flight.minutes` of REGISTERED SCHOOL flights with that `instructorProfileId` in range (mtd/ytd/total variants); owed = round(minutes/60 × payoutRateCents) − Σ payouts in range; instructors without `payoutRateCents` → `owed: null` (UI shows "—"). `recordPayout` validates amount>0, period, permissions (`admin` only decides payouts; staff read). Unit tests with fixture flights across month/year boundaries (Rome days).
- [ ] **Step 3: UI.** Instructors page: KPI row (attivi, ore totali, dovuto, tariffa media payout), list (nome+ratings/tariffa payout/ore/dovuto/azioni Paga·Registra·Modifica), "Ciclo pagamenti" slide-over = all instructors with owed>0, batch "Paga" per row; `InstructorProfile` slide-over (KPIs, allievi recenti, voli recenti come CFI — real flights). Editor: dati persona + payoutRate + note (ore/dovuto readonly). "Registra" = registra volo shortcut (Task 8 form) — hide until Task 8 merged.
- [ ] **Step 4: e2e + gates + Commit** `feat(12.7): instructor compensation (payout rate, ledger, ciclo pagamenti)`.

### Task 8 (story 12.8): Registro voli

**Files:**
- Create: `src/app/[locale]/dashboard/logbook/page.tsx` (+client, port `LogbookView.jsx` + `Forms.jsx#NewLogbookForm` ADAPTED per D13); Delete old `dashboard/flights/*` here
- Test: rewrite `e2e/flights.spec.ts`, adapt `e2e/flight-log.spec.ts`, `e2e/flight-reversal.spec.ts`, keep `e2e/exports.spec.ts`/`e2e/pdf-exports.spec.ts` green (same export endpoints)

- [ ] **Step 1: table** = real flights (data/tratta/pilota+CFI/aereo/tipo/ore HH:MM/dec/att/costo/azioni), filters date-range/pilota/aereo, totals row, KPI row (voci, ore, dec/att, ricavo, IFR count only if derivable — otherwise omit the KPI). Storno/reversal action preserved from the current page.
- [ ] **Step 2: "Nuova voce" (D13 — domain contract wins):** fields = data, aeromobile, pilota (typed selector), istruttore, tipo (`FlightType`), partenza/arrivo ICAO (OBBLIGATORI), orario decollo/atterraggio (OBBLIGATORI), decolli/atterraggi (default 1). NO manual durata/costo — derived server-side (existing POST /flights contract, Epic 11). Show the computed duration live in the form footer as read-only feedback.
- [ ] **Step 3: e2e + gates + Commit** `feat(12.8): registro voli in AirOps language`.

### Task 9 (story 12.9): Contabilità

**Files:**
- Create: `src/server/services/transactions.service.ts` (+`.test.ts`), `src/lib/schemas/transactions.ts`, `src/app/api/v1/transactions/route.ts` (GET unified list, POST create)
- Create: `src/app/[locale]/dashboard/billing/page.tsx` (+client, port `BillingView.jsx` + `Forms.jsx#NewTransactionForm`); Delete `dashboard/finance/page.tsx` + `finance/report` here (categories/packages pages die in Task 13)
- Test: adapt `e2e/accounts-topups.spec.ts`, `e2e/account-adjustments.spec.ts`, `e2e/account-statement.spec.ts`, `e2e/cash-register.spec.ts`, `e2e/cash-report.spec.ts`; new `e2e/billing.spec.ts`

- [ ] **Step 1: unified ledger (TDD).** GET `/api/v1/transactions?from&to&personId&categoryId&direction&cursor`: merge `AccountMovement` (rows with person) and `CashMovement` (rows without person unless linked) into
```ts
type TransactionRow = {
  id: string; source: 'ACCOUNT' | 'CASH'; date: string;
  personId: string | null; personName: string | null;
  kind: string;            // AccountMovementType or cash category name
  description: string; amountCents: number;   // sign: >0 charge/income, <0 payment/outflow
  method: PaymentMethod | null; reference: string | null; // e.g. PPR number, flight id
};
```
Ordered by date desc, cursor-paginated (reuse `src/lib/api/pagination.ts`). Service test: mixed fixture, filters, ordering stability.
- [ ] **Step 2: page.** KPI row from real aggregates (ricavi mese, addebiti, pagamenti, credito netto, compensi istruttori via Task 7 API); transactions table (prototype columns; Metodo "—" when null; NO delete button on derived movements — only manual ones expose Elimina/storno via the existing reversal endpoints); filters tipo (cash categories + movement types)/pilota/date; "Ricavi per categoria" bars + "Compensi istruttori" card (Task 7 API). "Nuova transazione" slide-over: Tipo=Pagamento→account top-up; Tipo=Addebito conto→account adjustment; Tipo=Movimento cassa→cash movement with category. "Estratti conto" = per-pilot statement using the EXISTING statement export (see `e2e/account-statement.spec.ts` for the current entry point; relocate the button here).
- [ ] **Step 3: e2e + gates + Commit** `feat(12.9): contabilità unified ledger + estratti conto`.

### Task 10 (story 12.10): Statistiche

**Files:**
- Create: `src/server/services/stats.service.ts` (+`.test.ts`), `src/lib/schemas/stats.ts`, `src/app/api/v1/stats/route.ts`
- Create: `src/app/[locale]/dashboard/reports/page.tsx` (+client, port `ReportsView.jsx` incl. `BarChart`/`LineChart`/`RankBars` as `src/components/charts/*.tsx`)
- Test: new `e2e/reports.spec.ts`

- [ ] **Step 1: contract.** `GET /api/v1/stats?period=month|year&ref=YYYY-MM` (admin/staff), Zod response in `src/lib/schemas/stats.ts`:
```ts
{
  kpis: { revenueCents: number; flightMinutes: number; movements: number; transitShare: number; fleetUtilization: number },
  series: { months: string[]; revenueCents: number[]; flightMinutes: number[]; transitMovements: number[] }, // 6 (month) or 12 (year) points
  fleet: { registration: string; minutes: number; revenueCents: number }[],
  movementMix: { key: 'SCHOOL'|'TOURISM'|'AERIAL_WORK'|'TRANSIT'; count: number }[],   // labels adapted to real FlightType (D13)
  instructors: { name: string; minutes: number; owedCents: number | null }[],
  topPilots: { name: string; minutes: number; spentCents: number }[],                   // top 10 by minutes
}
```
Sources: flights (minutes, per-aircraft, per-pilot), account+cash movements (revenue), PPR closed movements (transit), settings window × operational aircraft × days for utilization denominator. Rome-day month bucketing. Deterministic service tests on a seeded fixture.
- [ ] **Step 2: page** with segmented mese/anno, KPI row, charts (SVG ports), utilizzo flotta bars, composizione movimenti, ore istruttori, RankBars per aeromobile/pilota. Export menu wired to nothing yet → OMIT the export button (no dead UI); "Condividi report" from the prototype is dropped for the same reason.
- [ ] **Step 3: e2e + gates + Commit** `feat(12.10): stats API + statistiche`.

### Task 11 (story 12.11): Scadenze + Impostazioni + METAR

**Files:**
- Rewrite: `src/app/[locale]/dashboard/expiries/page.tsx` (port `ScadenzeView.jsx`); Delete `expiries/types` page (catalog moves to settings)
- Rewrite: `src/app/[locale]/dashboard/settings/page.tsx` (port `SettingsView.jsx`)
- Create: `src/server/services/metar.service.ts` (+`.test.ts` with offline fixtures), `src/app/api/v1/metar/route.ts`
- Modify: `src/server/services/app-settings.service.ts` (+test) for SMTP + station keys; `src/server/adapters/mail/smtp-mail-sender.ts` (settings-first, env fallback); `src/lib/schemas/settings.ts`; `.env.example`+`.github/workflows/ci.yml` if the env contract changes
- Test: adapt `e2e/expiry-dashboard.spec.ts`, `e2e/expiry-registration.spec.ts`, `e2e/expiry-types.spec.ts` (now exercised via settings), keep `e2e/expiry-alerts.spec.ts` green; extend a settings e2e

- [ ] **Step 1: Scadenze** = 4 stat cards (scaduti/7/30/60 with real counts), window segmented control, filters tipo/pilota, tinted rows by tier, "Invia promemoria" = existing expiry-alerts job trigger (admin) with toast feedback.
- [ ] **Step 2: Impostazioni** = cards Club (nome/ICAO/email — existing settings), Pianificazione (finestra open/close, slot minimo, turnaround, anticipo max — NEW settings keys consumed by booking validation as advisory defaults: booking create/approve rejects outside window with 422 `BOOKING_OUTSIDE_WINDOW`), Email SMTP (host/porta/sicurezza/utente/password write-only/mittente + "Invia email di prova" that actually sends via the adapter), Abilitazioni = existing `expiry-types` CRUD (validità mesi, 0 = senza scadenza), Meteo (stazione ICAO). PPR landing fee + operating instructions settings keep their existing fields inside the Club card area.
- [ ] **Step 3: METAR.** `metar.service.ts`: fetch `https://aviationweather.gov/api/data/metar?ids=<ICAO>&format=json`, 10-min in-memory cache, map to `{ raw, tempC, windDir, windKt, visM, qnh, category }` (category from response `fltCat`, fallback derived: VFR ≥8km & ceiling ≥3000ft; MVFR ≥5km/1000ft; else IFR). On ANY error → `null` (sidebar hides the card). Route `GET /api/v1/metar` (authenticated); sidebar weather card wired via the shell (Task 1 slot). Unit tests parse recorded fixtures offline — the test suite must never hit the network.
- [ ] **Step 4: e2e + gates + Commit** `feat(12.11): scadenze, impostazioni (SMTP/pianificazione/abilitazioni), METAR widget`.

### Task 12 (story 12.12): Panoramica + landing per ruolo

**Files:**
- Rewrite: `src/app/[locale]/dashboard/page.tsx` (port `App.jsx#AdminOverview`; compose Schedule/BookingsTable/ScadenzeWidget/FleetCard from earlier tasks)
- Create: `src/components/dashboard/pilot-landing.tsx` (port `StudentView.jsx#PilotLanding`), `instructor-landing.tsx` (port `InstructorView.jsx`)
- Test: rewrite `e2e/home-dashboard.spec.ts`, adapt `e2e/rbac.spec.ts` (role → landing + sidebar filtering)

- [ ] **Step 1: AdminOverview** (ADMIN/STAFF): KPI row with real numbers (voli oggi = today's approved bookings + registered flights; flotta disponibile; PPR in attesa; prenotazioni in attesa; ricavi mese from stats service), embedded Schedule (today), BookingsTable (pending-first), ScadenzeWidget (7/30/60 toggle, link → scadenze), FleetCard. "Pianifica volo" opens the Task 8 flight form.
- [ ] **Step 2: role landings.** INSTRUCTOR → header "Buongiorno, <nome>", KPIs ore mese/tariffa payout/dovuto mese/voli oggi, "La mia giornata" (today's bookings as instructor). PILOT/STUDENT → "Ciao, <nome>", KPIs saldo/licenza/scadenza medico/abilitazioni (from expiries), "I miei prossimi voli" (upcoming approved bookings), CTA "Prenota volo" → bookings page. Sidebar filtering per Task 1 rules verified here e2e per role.
- [ ] **Step 3: e2e + gates + Commit** `feat(12.12): panoramica reale + landing per ruolo`.

### Task 13 (story 12.13): Removals, cleanup, CLAUDE.md, final sweep

**Files (delete):**
- `src/app/[locale]/dashboard/school/**`, `src/app/api/v1/school/**`, `src/server/services/school.service.ts(+test)`, `src/lib/schemas/school.ts`, `e2e/school.spec.ts`
- `src/app/[locale]/dashboard/users/**` (API v1/users kept only for invite/suspend/reactivate — remove now-unused handlers)
- `src/app/[locale]/dashboard/finance/**` remnants (categories/packages pages), `src/app/api/v1/package-types/**`, `src/server/services/package-types.service.ts(+test)`, `src/lib/schemas/package-types.ts`, `e2e/package-types.spec.ts`, `e2e/package-sale.spec.ts`, `e2e/package-consumption.spec.ts`. Per D10 the packages feature dies entirely: remove `packages.service.ts` and the package-consumption branch inside `registerFlight` (with its unit tests) — flights charge accounts directly from now on; already-consumed packages remain as historical DB rows.
- `src/app/api/v1/expiry-proposals/**`, proposal service parts in `expiries.service.ts`, related e2e sections
- Legacy shared components: `src/components/data-table.tsx`, `export-button.tsx`, `search-combobox.tsx`; shadcn leftovers; Geist font usage if nothing legacy remains
- **Files (modify):** `CLAUDE.md` (stack: design system AirOps CSS custom — Tailwind/shadcn removed or dormant; route map updated), `docs/handoffs/HANDOFF.md` via `/handoff` at epic end, seed (`prisma/seed…`) drop school/package seeding, `src/lib/schemas/registry.ts` (OpenAPI reflects removals)

- [ ] **Step 1:** delete per the list; run `npx tsc --noEmit` iteratively until no dangling imports.
- [ ] **Step 2: endpoint audit.** Generate OpenAPI (`/api/v1/openapi.json`), diff against actual UI consumers (grep fetch/href per route); remove any endpoint with zero consumers (candidate: `accounts/negative-balances` — verify Panoramica/Contabilità don't use it first).
- [ ] **Step 3:** update CLAUDE.md facts (stack, conventions, drop stale references to removed pages), seed data (school/packages out; instructor payoutRate example in).
- [ ] **Step 4: final sweep.** Fresh DB, production build, `CI=1 npx playwright test` — full suite green; unit suite green; counts drop ONLY by the removed features' tests.
- [ ] **Step 5: Commit** `feat(12.13): remove superseded pages/APIs, cleanup, CLAUDE.md` → `/handoff` → push → PR for the epic → STOP (no next epic in this session).

---

## e2e spec fate map (complete)

| Spec | Fate | Task |
|---|---|---|
| login, welcome | update selectors | 1 |
| api-v1, idempotency | extend/adapt (booking transition) | 2 |
| bookings | rewrite (workflow) | 3 |
| ppr-public, ppr-queue | rewrite | 4 |
| ppr-register | replaced by `movements.spec.ts` | 4 |
| aircraft-management, aircraft-rates, aircraft-status-hours | rewrite/adapt | 5 |
| people-management, person-detail, person-profiles, user-management, typeahead-pickers | rewrite/merge | 6 |
| instructor-rates | adapt (+ new instructor-compensation) | 7 |
| flights, flight-log, flight-reversal | rewrite/adapt | 8 |
| accounts-topups, account-adjustments, account-statement, cash-register, cash-report | adapt (+ new billing) | 9 |
| exports, pdf-exports | keep green; drop removed-feature sections | 8/9/13 |
| (new) reports | new | 10 |
| expiry-dashboard, expiry-registration, expiry-types, expiry-alerts | adapt | 11 |
| home-dashboard, rbac | rewrite/adapt | 12 |
| school, package-types, package-sale, package-consumption | delete | 13 |

## Self-review notes (already applied)

- Spec coverage: D1–D13 all mapped (D5/D10→Task 13, D7→Task 2/3, D8→Task 7, D9→Task 9, D13→Task 8 form, METAR/SMTP→Task 11, landings→Task 12, branding/i18n/port→Task 1).
- The prototype's "Esegui fatturazione", stats export/share buttons, Tweaks panel, Renter/Visitor roles, IFR-count KPI (if underivable) are explicitly OMITTED (no dead UI) — consistent with spec D9/§4.
- Type names used consistently: `payoutRateCents`, `InstructorPayout`, `TransactionRow`, `movementStatus`, cookie `am-theme`, sheet `src/styles/airops.css`.
- Package-consumption removal in Task 13 is the one place the plan goes BEYOND UI: ratified by D10 (feature loss accepted); historical rows preserved.
