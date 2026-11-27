import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { requireMailTestDatabase } from '../scripts/mail-test-database';
import { openCaptured, requestFromForm } from './email-access-forms';
import { startSyntheticSmtp } from '../scripts/synthetic-smtp';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('keeps the original deadline and refuses confirmation after expiry', async ({ page }) => {
  test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Disposable email-access trial disabled.');
  test.setTimeout(90_000);
  const db = new Client({ connectionString: requireMailTestDatabase('browser') });
  await db.connect();
  const relay = await startSyntheticSmtp();
  const fields = ['smtp.host', 'smtp.port', 'smtp.security', 'smtp.user', 'smtp.pass', 'smtp.from'];
  const saved = (await db.query('SELECT id,key,value,"updatedAt" FROM "AppSetting" WHERE key=ANY($1)', [fields])).rows;
  const id = randomUUID();
  const email = id + '@fixture.invalid';
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO "User" (id,email,roles,"updatedAt") VALUES ($1,$2,ARRAY[\'PILOT\']::"Role"[],now())', [id,email]);
    await db.query('INSERT INTO "EmailVerification" ("userId",email,"verifiedAt") VALUES ($1,$2,now())', [id,email]);
    await db.query('DELETE FROM "AppSetting" WHERE key=ANY($1)', [fields]);
    for (const [key,value] of [['smtp.host','127.0.0.1'],['smtp.port',String(relay.port)],['smtp.security','NONE'],['smtp.from','trial@fixture.invalid']]) {
      await db.query('INSERT INTO "AppSetting" (id,key,value,"updatedAt") VALUES ($1,$2,$3,now())', [randomUUID(),key,value]);
    }
    relay.controls.reply = 'temporary';
    await db.query('COMMIT');
    await requestFromForm(page, randomUUID() + '@fixture.invalid');
    await requestFromForm(page, email);
    const intent = async () => (await db.query<{state:string; attempts:number; expiresAt:Date}>(
      'SELECT state,attempts,"expiresAt" FROM "CredentialMail" WHERE "userId"=$1 AND purpose=\'LOGIN_LINK\'', [id],
    )).rows[0];
    await expect.poll(async () => {
      const current = await intent();
      return current && [current.state, current.attempts];
    }, { timeout: 20_000 }).toEqual(['QUEUED', 1]);
    const deadline = (await intent()).expiresAt.getTime();
    expect(relay.controls.accepted).toBe(0);
    // Switch the synthetic fixture to Mailpit and make the retry due.
    await db.query('BEGIN');
    await db.query('UPDATE "AppSetting" SET value=\'1025\',"updatedAt"=now() WHERE key=\'smtp.port\'');
    await db.query('UPDATE "CredentialMail" SET "nextAt"=now() WHERE "userId"=$1', [id]);
    await db.query('COMMIT');
    await openCaptured(page, email, 'login');
    await expect.poll(async () => (await intent()).state).toBe('ACCEPTED');
    expect((await intent()).attempts).toBe(2);
    expect((await intent()).expiresAt.getTime()).toBe(deadline);
    await db.query('WITH q AS (UPDATE "CredentialMail" SET "expiresAt"=now() WHERE "userId"=$1 RETURNING "tokenId","expiresAt") UPDATE "AuthToken" t SET "expiresAt"=q."expiresAt" FROM q WHERE t.id=q."tokenId"', [id]);
    await page.getByLabel('Email', {exact:true}).fill(email);
    await page.getByRole('button', {name:'Conferma e accedi'}).click();
    await expect(page.getByRole('status')).toHaveText('Impossibile completare la richiesta.');
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  } finally {
    try {
      await db.query('ROLLBACK');
      await db.query('BEGIN');
      await db.query('DELETE FROM "AppSetting" WHERE key=ANY($1)', [fields]);
      for (const row of saved) {
        await db.query('INSERT INTO "AppSetting" (id,key,value,"updatedAt") VALUES ($1,$2,$3,$4)', [row.id,row.key,row.value,row.updatedAt]);
      }
      await db.query('COMMIT');
    } finally {
      await relay.close();
      await db.end();
    }
  }
});
