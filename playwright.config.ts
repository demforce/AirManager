import 'dotenv/config';
import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Preinstalled Chromium in the dev container; absent in CI, where Playwright's
// own browser (npx playwright install) is used instead.
const containerChromium = '/opt/pw-browsers/chromium';

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
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // In the dev container: never run `playwright install`, use the preinstalled binary.
        ...(fs.existsSync(containerChromium)
          ? { launchOptions: { executablePath: containerChromium } }
          : {}),
      },
    },
  ],
  webServer: {
    // CI also runs against the dev server for now: the production build
    // surfaced a REAL signOut/session-refresh race (logout can leave the
    // session alive) that must be fixed in the auth flow before switching
    // CI to `next build && next start` — see docs/handoffs/HANDOFF.md.
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
