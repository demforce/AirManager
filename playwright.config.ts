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
        '**/treasury-settings.spec.ts',
        '**/billing-global.spec.ts',
        '**/mobile-metar.spec.ts',
        '**/mobile-overview-overflow.spec.ts',
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
      // Story Billing-2, AC 6 — `treasury.*` (opening cash/bank balances)
      // feeds `getBillingSummary`'s Liquidità figures for EVERY other spec
      // that touches `/dashboard/billing` in the main project: last in the
      // chain, after `booking-window`.
      name: 'treasury-settings',
      testMatch: '**/treasury-settings.spec.ts',
      dependencies: ['booking-window'],
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
