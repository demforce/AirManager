import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { hashPassword } from '../src/server/auth/password';
import { requireMailTestDatabase } from '../scripts/mail-test-database';
import { openCaptured } from './email-access-forms';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

for (const locale of ['it', 'en'] as const) {
  const mobile = locale === 'en';
  test(`Piloti requests reactivation and the holder confirms without signing in (${mobile ? 'mobile' : 'desktop'}, ${locale})`, async ({ page, browser }) => {
    test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Requires isolated email trial.');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: mobile ? 375 : 1280, height: 800 });
    const db = new Client({ connectionString: requireMailTestDatabase('browser') });
    await db.connect();
    const id = randomUUID();
    const person = randomUUID();
    const email = id + '@fixture.invalid';
    const password = randomUUID();
    const holder = await browser.newPage();
    const preview = await browser.newPage();
    try {
      await db.query('INSERT INTO "Person" (id,"firstName","lastName","updatedAt") VALUES ($1,$2,$3,now())',[person,'Fixture',person]);
      await db.query(`INSERT INTO "User" (id,email,"passwordHash","personId",roles,locale,"updatedAt")
        VALUES ($1,$2,$3,$4,ARRAY['ADMIN']::"Role"[],$5,now())`,[id,email,await hashPassword(password),person,locale]);
      await db.query('INSERT INTO "EmailVerification" ("userId",email,"verifiedAt") VALUES ($1,$2,now())',[id,email]);
      await holder.goto('/it/login?access=admin');
      await holder.getByLabel('Email',{exact:true}).fill(email);
      await holder.getByLabel('Password',{exact:true}).fill(password);
      await holder.getByRole('button',{name:'Accedi',exact:true}).click();
      await expect(holder).toHaveURL(/\/dashboard$/, {timeout:20_000});
      await page.goto('/it/login');
      await page.getByLabel('Email',{exact:true}).fill('admin@airmanager.local');
      await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_ADMIN_PASSWORD!);
      await page.getByRole('button',{name:'Accedi',exact:true}).click();
      await expect(page).toHaveURL(/\/dashboard$/, {timeout:20_000});
      expect((await page.request.patch('/api/v1/users/'+id,{data:{isActive:false}})).status()).toBe(200);
      await page.goto('/'+locale+'/dashboard/pilots?q='+person);
      const action = mobile ? 'Send reactivation link' : 'Invia link di riattivazione';
      if (mobile) {
        await page.getByTestId('mobile-pilot-row-'+person).click();
        await page.getByRole('button',{name:action,exact:true}).click();
      } else {
        await page.getByTestId('pilot-row-'+person).getByRole('button',{name:action,exact:true}).click();
      }
      const [queued] = await Promise.all([
        page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname === '/api/v1/users/'+id+'/request-reactivation'),
        page.getByTestId(mobile?'pilot-suspend-confirm-mobile':'pilot-suspend-confirm-'+person).click(),
      ]);
      expect(queued.status()).toBe(200);
      await expect(page.getByTestId('toast')).toContainText(mobile?'Reactivation link queued.':'Link di riattivazione in coda.');
      await openCaptured(preview,email,'reactivate',locale);
      const state = async () => (await db.query<{isActive:boolean; used:boolean}>(`SELECT u."isActive", t."usedAt" IS NOT NULL AS used
        FROM "User" u JOIN "AuthToken" t ON t."userId"=u.id WHERE u.id=$1 AND t.type='REACTIVATE_ACCOUNT'`,[id])).rows[0];
      expect(await state()).toEqual({isActive:false,used:false});
      expect((await preview.request.get('/api/v1/me')).status()).toBe(401);
      await preview.getByRole('button',{name:mobile?'Confirm reactivation':'Conferma riattivazione',exact:true}).click();
      await expect(preview.getByRole('status')).toHaveText(mobile?'Account reactivated. You can now sign in.':'Account riattivato. Ora puoi accedere.');
      expect(await state()).toEqual({isActive:true,used:true});
      expect((await preview.request.get('/api/v1/me')).status()).toBe(401);
      // This session made no protected request between suspension and confirmation.
      expect((await holder.request.get('/api/v1/me')).status()).toBe(401);
    } finally {
      await preview.close();
      await holder.close();
      await db.end();
    }
  });
}
