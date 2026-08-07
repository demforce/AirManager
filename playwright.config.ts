import 'dotenv/config';
import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Preinstalled Chromium in the dev container; absent in CI, where Playwright's
// own browser (npx playwright install) is used instead.
const containerChromium = '/opt/pw-browsers/chromium';

// Shared browser config for every project below.
const sharedUse = {
  ...devices['Desktop Chrome'],
  // In the dev container: never run `playwright install`, use the preinstalled binary.
  ...(fs.existsSync(containerChromium)
    ? { launchOptions: { executablePath: containerChromium } }
    : {}),
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // settings.spec.ts, booking-window.spec.ts, treasury-settings.spec.ts
      // and billing-global.spec.ts write/read GLOBAL state that a
      // `fullyParallel` concurrent writer would otherwise corrupt (AppSetting
      // rows — sched.*, club, smtp, treasury.* — or, for billing-global, the
      // ledger's own ALL-TIME aggregates and a single-use seeded fixture).
      // They are excluded from the main project and run serialized, after
      // it, via the 'settings'/'booking-window'/'treasury-settings'/
      // 'billing-global' projects below. Any future spec with the same
      // requirement must join this chain the same way.
      name: 'chromium',
      testIgnore: [
        '**/settings.spec.ts',
        '**/booking-window.spec.ts',
        '**/reports.spec.ts',
        '**/treasury-settings.spec.ts',
        '**/billing-global.spec.ts',
        '**/mobile-metar.spec.ts',
        '**/mobile-overview-overflow.spec.ts',
        '**/mobile-membership-fee.spec.ts',
        '**/mobile-settings.spec.ts',
        '**/aog-overview-count.spec.ts',
      ],
      use: sharedUse,
    },
    {
      name: 'settings',
      testMatch: '**/settings.spec.ts',
      dependencies: ['chromium'],
      use: sharedUse,
    },
    {
      name: 'booking-window',
      testMatch: '**/booking-window.spec.ts',
      dependencies: ['settings'],
      use: sharedUse,
    },
    {
      // Story 15.8b, R-15.8b-f — `reports.spec.ts` used to run in the main
      // `fullyParallel` project while its `fleetUtilization` test PUT a GLOBAL
      // `sched.*` window (07:00-21:00) and never restored it: the TD registered
      // since 14.4, AGGRAVATED by 15.4 (since `assertWithinSchedulingWindow`
      // also guards `updateBooking`, EVERY `moveBooking` in the suite inherited
      // that window, and the "today" fixtures of `mobile-planning` fell outside
      // it whenever the suite ran before ~07:20 or after ~20:40 Rome). The whole
      // file moves here rather than just the guilty test (PO decision, against
      // the recommendation) because that closes the time-dependency of the suite
      // as well as the leak.
      //
      // POSITION — right after `booking-window`, before `treasury-settings`:
      // `sched.*` is the only global key this file writes, and `booking-window`
      // is the project that OWNS that key, so the two `sched.*` writers stay
      // adjacent and the chain reads in one direction. It restores the same
      // permissive window `settings.spec.ts` restores, so everything downstream
      // (treasury, billing-global, the four mobile projects) sees exactly what
      // it saw before this project existed. Running it alone locally:
      // `npx playwright test reports.spec.ts --no-deps`.
      name: 'reports',
      testMatch: '**/reports.spec.ts',
      dependencies: ['booking-window'],
      use: sharedUse,
    },
    {
      // Story Billing-2, AC 6 — `treasury.*` (opening cash/bank balances)
      // feeds `getBillingSummary`'s Liquidità figures for EVERY other spec
      // that touches `/dashboard/billing` in the main project: last in the
      // chain, after `booking-window`.
      name: 'treasury-settings',
      testMatch: '**/treasury-settings.spec.ts',
      dependencies: ['reports'],
      use: sharedUse,
    },
    {
      // Review Billing-2 F4/F5 — two billing.spec.ts cases moved here
      // because NEITHER can tolerate a concurrent writer touching the
      // ledger: the three-riquadri invariant reads before/after ALL-TIME
      // aggregates with nothing but a client-side filter change in between
      // (flaked 2/2 runs under fullyParallel in the main project), and the
      // secchiello reclassify test consumes the ONE seeded unattributed
      // fixture (`prisma/seed.ts`) via a real write. Last in the chain —
      // nothing downstream reads either.
      name: 'billing-global',
      testMatch: '**/billing-global.spec.ts',
      dependencies: ['treasury-settings'],
      use: sharedUse,
    },
    {
      // Story 15.3, AC 5 — the mobile METAR card only exists once a station is
      // CONFIGURED, and that is a global `AppSetting` write: under
      // `fullyParallel` it would make the sidebar weather card appear (and one
      // upstream fetch fire) under every other spec's feet. Last in the chain,
      // and it restores "no station configured" in `afterAll` — nothing
      // downstream reads it.
      name: 'mobile-metar',
      testMatch: '**/mobile-metar.spec.ts',
      dependencies: ['billing-global'],
      use: sharedUse,
    },
    {
      // Review 15.3 F3 — proving that the mobile "Prenotazioni in attesa" card
      // declares its truncation means holding NINE pending bookings in the
      // GLOBAL 48h window at once, which under `fullyParallel` would shift
      // every other spec's view of that same card (`home-dashboard.spec.ts`
      // reads the 8-row window). Last in the chain, and it cancels its own
      // fixtures in `afterAll` — nothing downstream inherits them.
      name: 'mobile-overview-overflow',
      testMatch: '**/mobile-overview-overflow.spec.ts',
      dependencies: ['mobile-metar'],
      use: sharedUse,
    },
    {
      // Story 15.7, ratifica R-15.7-g — the "Quota associativa" button is
      // `disabled` while `membership.annualFeeCents` is 0, so exercising its
      // phone panel at all means WRITING that global `AppSetting`, which
      // `membership-fee.spec.ts` (main project) also writes five times and
      // leaves at 0. Two parallel writers on one global key is exactly what
      // this chain exists to prevent. Last in the chain, and it restores 0 in
      // `afterAll` — nothing downstream reads it.
      name: 'mobile-membership-fee',
      testMatch: '**/mobile-membership-fee.spec.ts',
      dependencies: ['mobile-overview-overflow'],
      use: sharedUse,
    },
    {
      // Story 15.8b, R-15.8b-d — proving that every write of Impostazioni still
      // works from a phone means writing the very `AppSetting` keys this chain
      // quarantines (`sched.*`, `smtp.*`, the five club keys). LAST in the
      // chain, and it restores the permissive scheduling window in `afterAll`,
      // read back to prove it — nothing downstream inherits anything. Running
      // it alone locally: `npx playwright test mobile-settings.spec.ts --no-deps`.
      name: 'mobile-settings',
      testMatch: '**/mobile-settings.spec.ts',
      dependencies: ['mobile-membership-fee'],
      use: sharedUse,
    },
    {
      // Story AOG-1a, AC 13 — the Panoramica's fleet-wide AOG count. TWO
      // independent reasons this cannot live in the main `fullyParallel`
      // project: it asserts an EQUALITY between two GLOBAL aggregates read from
      // two page loads (the class that flaked 2/2 in review Billing-2 F4), and
      // to DISCRIMINATE at all it must push the active fleet past
      // `OPTIONS_PAGE_SIZE = 100`, which degrades every `<select>` picker in the
      // suite (the open `OPTIONS_PAGE_SIZE` TD). ABSOLUTE LAST in the chain for
      // that second reason — nothing downstream inherits the inflated fleet.
      // Running it alone locally: `npx playwright test aog-overview-count.spec.ts --no-deps`.
      name: 'aog-overview-count',
      testMatch: '**/aog-overview-count.spec.ts',
      dependencies: ['mobile-settings'],
      use: sharedUse,
    },
  ],
  webServer: {
    // In CI the suite runs against the production build: `next dev`'s
    // on-demand compilation under CI-runner contention causes timeout
    // flakiness and hangs (known cold-compile flaky class). NODE_ENV is
    // unset for the build per repo rule (it breaks `next build`).
    command: process.env['CI'] ? 'env -u NODE_ENV npm run build && npm run start' : 'npm run dev',
    url: baseURL,
    // Under CI=1 the build runs INSIDE the suite's clock, so a series of runs
    // (what a dev/review cycle actually does) pays `next build` every time —
    // and a server already listening on :3000 makes the run fail outright
    // instead of being reused. `E2E_REUSE_SERVER=1` opts into reusing a
    // production server started once for the series; CI itself never sets it,
    // so the pipeline keeps building from scratch.
    reuseExistingServer: !process.env['CI'] || !!process.env['E2E_REUSE_SERVER'],
    timeout: 240_000,
  },
});
