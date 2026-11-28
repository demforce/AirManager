// Count Next router prefetch requests after a dashboard view. Run against the
// same synthetic load database on baseline and candidate builds.
// BASE=http://localhost:3001 PASSWORD=... node scripts/perf/prefetch.mjs
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:3000';
const password = process.env.PASSWORD;
if (!password) throw new Error('PASSWORD is required');

const executablePath = ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto(`${base}/it/login`);
await page.getByLabel('Email').fill('admin@airmanager.local');
await page.getByLabel('Password').fill(password);
await page.getByRole('button', { name: 'Accedi' }).click();
await page.waitForURL(/\/it\/dashboard$/);

console.log('| page | prefetch requests | distinct destinations |');
console.log('|---|---:|---:|');
for (const path of ['/it/dashboard', '/it/dashboard/fleet', '/it/dashboard/bookings']) {
  const urls = [];
  const onRequest = (request) => {
    if (request.headers()['next-router-prefetch']) urls.push(request.url());
  };
  page.on('request', onRequest);
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(2000);
  page.off('request', onRequest);
  console.log(`| ${path} | ${urls.length} | ${new Set(urls.map((url) => new URL(url).pathname)).size} |`);
}
await browser.close();
