import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { hashPassword } from '../src/server/auth/password';
import { requireMailTestDatabase } from '../scripts/mail-test-database';
import en from '../messages/en.json';
import it from '../messages/it.json';
import { openCaptured } from './email-access-forms';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function fallback(page: Page, email: string, password: string, locale: 'en' | 'it') {
  await page.goto('/' + locale + '/login?access=admin');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: locale === 'it' ? 'Accedi' : 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

for (const locale of ['it', 'en'] as const) {
  test(`own profile changes the admin password through the verified ${locale} mailbox`, { tag: '@email-trial' }, async ({ page, browser }) => {
    test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Isolated email trial only.');
    test.setTimeout(150_000);
    const db = new Client({ connectionString: requireMailTestDatabase('browser') });
    await db.connect();
    const confirmation = await browser.newPage();
    const id = randomUUID(), email = id + '@fixture.invalid', old = randomUUID(), next = randomUUID() + randomUUID();
    const { emailTrial: trial, setPassword: labels } = (locale === 'it' ? it : en).auth;
    const mobile = locale === 'it';
    try {
      expect((await (await fetch('http://127.0.0.1:8025/api/v1/webui')).json()).MessageRelay.Enabled).toBe(false);
      await db.query(`INSERT INTO "User" (id,email,roles,"passwordHash",locale,"updatedAt") VALUES ($1,$2,ARRAY['ADMIN']::"Role"[],$3,$4,now())`, [id,email,await hashPassword(old),locale]);
      await db.query('INSERT INTO "EmailVerification" ("userId",email,"verifiedAt") VALUES ($1,$2,now())', [id,email]);
      if (mobile) await page.setViewportSize({ width:375, height:812 });
      await fallback(page,email,old,locale);
      if (mobile) await page.getByTestId('mobile-profile-button').click();
      await page.getByTestId(mobile ? 'request-password-change-mobile' : 'request-password-change').click();
      await expect(page.getByTestId('toast')).toHaveText(trial.passwordQueued);
      await openCaptured(confirmation,email,'change-password',locale);
      const versions = async () => (await db.query(`SELECT "tokenVersion" AS version,
        (SELECT count(*)::int FROM "AuthToken" WHERE "userId"=$1 AND type='CHANGE_ADMIN_PASSWORD' AND "usedAt" IS NOT NULL) AS used
        FROM "User" WHERE id=$1`, [id])).rows[0];
      expect(await versions()).toEqual({ version:0, used:0 });
      const field = confirmation.getByLabel(labels.passwordLabel,{exact:true});
      const repeat = confirmation.getByLabel(labels.confirmPasswordLabel,{exact:true});
      const save = confirmation.getByRole('button',{name:trial['change-password'],exact:true});
      await expect(field).toHaveAttribute('autocomplete','new-password');
      await expect(repeat).toHaveAttribute('autocomplete','new-password');
      await field.fill(next);
      await repeat.fill(old);
      await save.click();
      const passwordError = confirmation.locator('form').filter({ has: save }).getByRole('alert');
      await expect(passwordError).toHaveText(labels.errorMismatch);
      await field.fill(old);
      await save.click();
      await expect(passwordError).toHaveText(labels.adminBlocked);
      expect(await versions()).toEqual({ version:0, used:0 });
      expect((await page.request.get('/api/v1/me')).status()).toBe(200);
      await field.fill(next);
      await repeat.fill(next);
      await save.click();
      await expect(confirmation.getByRole('status')).toHaveText(trial.passwordSaved);
      expect(await versions()).toEqual({ version:1, used:1 });
      expect((await page.request.get('/api/v1/me')).status()).toBe(401);
      await openCaptured(confirmation,email,'change-password',locale);
      await field.fill(next);
      await repeat.fill(next);
      await save.click();
      await expect(confirmation.getByRole('status')).toHaveText(trial.invalid);
      await fallback(page,email,next,locale);
    } finally { await confirmation.close(); await db.end(); }
  });
}

test('trial disabled keeps the password profile action unavailable to a verified admin', async ({ page }) => {
  test.skip(process.env.AIRMANAGER_EMAIL_TRIAL === '1','Normal mode only.');
  const db = new Client({connectionString:requireMailTestDatabase('browser')});
  const id = randomUUID(), email = id + '@fixture.invalid', old = randomUUID();
  await db.connect();
  try {
    await db.query(`INSERT INTO "User" (id,email,roles,"passwordHash","updatedAt") VALUES ($1,$2,ARRAY['ADMIN']::"Role"[],$3,now())`, [id,email,await hashPassword(old)]);
    await db.query('INSERT INTO "EmailVerification" ("userId",email,"verifiedAt") VALUES ($1,$2,now())',[id,email]);
    await fallback(page,email,old,'it');
    await expect(page.getByTestId('request-password-change')).toHaveCount(0);
    expect((await page.goto('/it/email-access?purpose=change-password'))?.status()).toBe(404);
    expect((await db.query('SELECT count(*)::int AS total FROM "CredentialMail" WHERE "userId"=$1',[id])).rows[0].total).toBe(0);
  } finally { await db.end(); }
});
