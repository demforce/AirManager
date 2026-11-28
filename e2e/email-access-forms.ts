import { expect, type Page } from '@playwright/test';

async function capturedLink(email: string, subject: string) {
  const api = 'http://localhost:8025/api/v1';
  let link: URL | undefined;
  await expect.poll(async () => {
    const response = await fetch(api + '/search?query=' + encodeURIComponent('to:' + email));
    const list = await response.json() as { messages: { ID: string; Subject: string }[] };
    const match = list.messages.find(m => m.Subject === subject);
    if (!match) return false;
    const mail = await (await fetch(api + '/message/' + match.ID)).json() as { Text: string; To: {Address:string}[]; Cc?: unknown[]; Bcc?: unknown[] };
    if (mail.To.length !== 1 || mail.To[0].Address !== email || mail.Cc?.length || mail.Bcc?.length) throw Error('Unexpected envelope in local capture');
    const textLink = mail.Text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!textLink) return false;
    link = new URL(textLink);
    return link.origin === new URL(process.env.APP_URL!).origin;
  }, { timeout: 55_000, intervals: [250,500,1000] }).toBe(true);
  return link!;
}

export async function openCapturedReset(page: Page, email: string) {
  const link = await capturedLink(email, 'Reimposta la tua password AirManager');
  expect(link.pathname).toBe('/set-password');
  expect(Boolean(link.searchParams.get('token'))).toBe(true);
  // Do not include the raw link in navigation steps or test output.
  await page.evaluate(url => { location.assign(url); }, link.toString());
  await expect(page.getByLabel('Nuova password', {exact: true})).toBeVisible();
}

export async function openCaptured(page: Page, email: string, purpose: 'verify' | 'login') {
  const subject = purpose === 'verify' ? 'Verifica il tuo indirizzo AirManager' : 'Link di accesso AirManager';
  const link = await capturedLink(email, subject);
  expect(link.searchParams.get('purpose')).toBe(purpose);
  expect(/^#[A-Za-z0-9_-]{43}$/.test(link.hash) && !link.searchParams.has('token')).toBe(true);
  // Open the site with the same fragment as the email. Keep Playwright API
  // error messages and its automatic navigation steps free of that fragment.
  await page.goto('/it/login');
  const origin = new URL(page.url()).origin;
  let thirdParty = false;
  const observe = (request: import('@playwright/test').Request) => {
    if (new URL(request.url()).origin !== origin) thirdParty = true;
  };
  page.on('request', observe);
  try {
    const responsePromise = page.waitForResponse(r => r.request().isNavigationRequest() && new URL(r.url()).pathname.endsWith('/email-access'));
    await page.evaluate(({ path, hash }) => { location.assign(path + hash); }, { path: link.pathname + link.search, hash: link.hash });
    const response = await responsePromise;
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['content-security-policy']).toContain("connect-src 'self'");
    await expect(page.getByRole('heading', { name: purpose === 'verify' ? 'Verifica il tuo indirizzo' : 'Conferma l’accesso' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash.length).toBe(0);
    expect(thirdParty).toBe(false);
  } finally { page.off('request', observe); }
}

export async function requestFromForm(page: Page, email: string) {
  await page.goto('/it/login');
  await page.getByRole('link', { name: 'Accedi via email' }).click();
  await expect(page.getByRole('heading', { name: 'Accesso via email' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/email-access'), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Richiedi il link' }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(Object.keys(response.headers()).some(k => /rate.?limit|retry-after/i.test(k))).toBe(false);
  await expect(page.getByRole('status')).toHaveText('Se l’account è abilitato, riceverai un link via email.');
}
