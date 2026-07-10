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
    // In CI the suite runs against the production build: `next dev`'s
    // on-demand compilation under CI-runner contention causes timeout
    // flakiness and hangs (known cold-compile flaky class). NODE_ENV is
    // unset for the build per repo rule (it breaks `next build`).
    command: process.env['CI'] ? 'env -u NODE_ENV npm run build && npm run start' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
  },
});
