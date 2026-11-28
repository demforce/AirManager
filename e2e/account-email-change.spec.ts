import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { hashPassword } from '../src/server/auth/password';
import { requireMailTestDatabase } from '../scripts/mail-test-database';
import { openCaptured, requestFromForm } from './email-access-forms';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

async function passwordSignIn(page: Page, email: string, password: string, fallback: boolean) {
  await page.goto('/it/login' + (fallback ? '?access=admin' : ''));
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

for (const assisted of [false, true]) {
  const locale = assisted ? 'en' : 'it';
  test(`sequential email change from ${assisted ? 'Piloti for another holder (EN)' : 'the administrator’s own profile (IT)'}`, async ({ page, browser }) => {
    test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Requires isolated email trial.');
    test.setTimeout(180_000);
    const info = await (await fetch('http://127.0.0.1:8025/api/v1/webui')).json();
    expect(info.MessageRelay.Enabled).toBe(false);
    const db = new Client({ connectionString: requireMailTestDatabase('browser') });
    await db.connect();
    const id = randomUUID(), person = randomUUID(), password = randomUUID();
    const old = id + '@fixture.invalid', next = randomUUID() + '@fixture.invalid';
    const holder = await browser.newPage();
    const confirmation = await browser.newPage();
    const actor = assisted ? page : holder;
    const state = async () => {
      const { rows } = await db.query(`SELECT u.email, v.email AS proof, u."tokenVersion" AS version,
        (SELECT count(*)::int FROM "AuthToken" WHERE "userId"=u.id AND type IN ('CHANGE_EMAIL_CURRENT','CHANGE_EMAIL_NEW') AND "usedAt" IS NOT NULL) AS consumed
        FROM "User" u JOIN "EmailVerification" v ON v."userId"=u.id WHERE u.id=$1`,[id]);
      return { original: rows[0].email === old && rows[0].proof === old, updated: rows[0].email === next && rows[0].proof === next, version: rows[0].version, consumed: rows[0].consumed };
    };
    try {
      await db.query('INSERT INTO "Person" (id,"firstName","lastName",email,"updatedAt") VALUES ($1,$2,$3,$4,now())', [person,'Fixture',person,randomUUID()+'@fixture.invalid']);
      await db.query(`INSERT INTO "User" (id,email,"passwordHash","personId",roles,locale,"updatedAt")
        VALUES ($1,$2,$3,$4,ARRAY[$5]::"Role"[],$6,now())`, [id,old,assisted ? null : await hashPassword(password),person,assisted ? 'PILOT' : 'ADMIN',locale]);
      await db.query('INSERT INTO "EmailVerification" ("userId",email,"verifiedAt") VALUES ($1,$2,now())',[id,old]);
      if (assisted) {
        await requestFromForm(holder, old);
        await openCaptured(holder, old, 'login', locale);
        await holder.getByLabel('Email', { exact: true }).fill(old);
        await holder.getByRole('button', { name: 'Confirm and sign in', exact: true }).click();
        await expect(holder).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
        await passwordSignIn(actor, 'admin@airmanager.local', process.env.SEED_ADMIN_PASSWORD!, false);
        await actor.goto('/en/dashboard/pilots?q=' + person);
        await actor.getByTestId('pilot-edit-' + person).click();
      } else {
        await holder.setViewportSize({ width: 375, height: 800 });
        await passwordSignIn(holder, old, password, true);
        await holder.getByTestId('mobile-profile-button').click();
      }
      const start = assisted ? actor.getByTestId('pilot-access-existing') : actor.getByTestId('mobile-profile-menu');
      const endpoint = '/api/v1/users/' + id + '/request-email-change';
      const premature = await actor.request.post(endpoint, {
        headers: { Origin: new URL(actor.url()).origin }, data: { email: next },
      });
      expect(premature.status()).toBe(422);
      expect((await db.query('SELECT count(*)::int AS n FROM "CredentialMail" WHERE "userId"=$1 AND purpose=$2', [id, 'CHANGE_EMAIL_CURRENT'])).rows[0].n).toBe(0);
      const [queued] = await Promise.all([
        actor.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/users/' + id + '/request-email-change'),
        start.getByRole('button', { name: assisted ? 'Change email address' : 'Cambia indirizzo email', exact: true }).click(),
      ]);
      expect(queued.status()).toBe(200);
      expect(queued.request().postData()).toBeNull();
      await openCaptured(confirmation, old, 'change-current', locale);
      expect(await state()).toEqual({ original:true, updated:false, version:0, consumed:0 });
      expect((await confirmation.request.get('/api/v1/me')).status()).toBe(401);
      await confirmation.getByLabel(assisted ? 'New email address' : 'Nuovo indirizzo email', {exact:true}).fill(next);
      await confirmation.getByRole('button', { name: assisted ? 'Send link to new address' : 'Invia link al nuovo indirizzo', exact:true }).click();
      await expect(confirmation.getByRole('status')).toHaveText(assisted ? 'Check your new inbox to confirm the change.' : 'Controlla la nuova casella per confermare il cambio.');
      await openCaptured(confirmation, next, 'change-new', locale);
      expect(await state()).toEqual({ original:true, updated:false, version:0, consumed:1 });
      await confirmation.getByRole('button', { name: assisted ? 'Confirm new address' : 'Conferma nuovo indirizzo', exact:true }).click();
      await expect(confirmation.getByRole('status')).toHaveText(assisted ? 'Email address updated. Sign in with your new address.' : 'Indirizzo aggiornato. Accedi con la nuova email.');
      expect(await state()).toEqual({ original:false, updated:true, version:1, consumed:2 });
      expect((await confirmation.request.get('/api/v1/me')).status()).toBe(401);
      expect((await holder.request.get('/api/v1/me')).status()).toBe(401);
      if (assisted) expect((await actor.request.get('/api/v1/me')).status()).toBe(200);
      await requestFromForm(confirmation, next);
      await openCaptured(confirmation, next, 'login', locale);
      await confirmation.getByLabel('Email', {exact:true}).fill(next);
      await confirmation.getByRole('button', {name: assisted ? 'Confirm and sign in' : 'Conferma e accedi', exact:true}).click();
      await expect(confirmation).toHaveURL(/\/dashboard$/, {timeout:20_000});
      const me = await confirmation.request.get('/api/v1/me');
      expect(me.ok() && (await me.json()).email === next).toBe(true);
    } finally {
      await holder.close();
      await confirmation.close();
      await db.end();
    }
  });
}
