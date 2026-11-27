import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openCaptured, requestFromForm } from './email-access-forms';
import { Client } from 'pg';
import { requireMailTestDatabase } from '../scripts/mail-test-database';

// A capture, a trace or an error attachment must never archive a bearer link.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('verified invitation and one email session through the public forms', async ({page, browser}) => {
  test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Disposable email-access trial disabled.');
  test.setTimeout(180_000);
  const db = new Client({connectionString:requireMailTestDatabase('browser')});
  await db.connect();
  const email = randomUUID()+'@fixture.invalid';
  const surname = 'Verify-'+randomUUID();
  const first = await browser.newPage();
  const second = await browser.newPage();
  try {
    await page.goto('/it/login');
    await page.getByLabel('Email',{exact:true}).fill('admin@airmanager.local');
    await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_ADMIN_PASSWORD!);
    await page.getByRole('button',{name:'Accedi',exact:true}).click();
    await expect(page).toHaveURL(/\/dashboard$/, {timeout:20_000});
    expect((await page.request.post('/api/v1/people',{data:{firstName:'Fixture',lastName:surname}})).status()).toBe(201);
    await page.goto('/it/dashboard/pilots?q='+surname);
    const row=page.locator('[data-testid^="pilot-row-"]').filter({hasText:surname});
    await row.getByRole('button',{name:'Modifica'}).click();
    const section=page.getByTestId('pilot-access-none');
    await section.getByLabel('Email',{exact:true}).fill(email);
    await section.getByLabel('Pilota',{exact:true}).check();
    await section.getByLabel('Invita con verifica email (prova)').check();
    await section.getByTestId('pilot-access-create').click();
    await expect(page.getByText('Indirizzo da verificare',{exact:true})).toBeVisible();

    const count = async () => (await db.query<{n:number}>(`SELECT count(*)::int AS n FROM "CredentialMail" m
      JOIN "User" u ON u.id=m."userId" WHERE u.email=$1 AND m.purpose='LOGIN_LINK'`,[email])).rows[0].n;
    await requestFromForm(first,email);
    expect(await count()).toBe(0);
    await Promise.all([openCaptured(first,email,'verify'), openCaptured(second,email,'verify')]);
    expect((await first.request.get('/api/v1/me')).status()).toBe(401);
    const status = async () => (await db.query<{verified:boolean}>(`SELECT "verifiedAt" IS NOT NULL AS verified FROM "EmailVerification" WHERE email=$1`,[email])).rows[0].verified;
    expect(await status()).toBe(false);
    await Promise.all([first,second].map(p=>p.getByRole('button',{name:'Conferma indirizzo'}).click()));
    await Promise.all([first,second].map(p=>expect(p.getByRole('status')).toBeVisible()));
    expect((await Promise.all([first,second].map(p=>p.getByRole('status').textContent()))).filter(s=>s?.startsWith('Indirizzo verificato.'))).toHaveLength(1);
    expect(await status()).toBe(true);
    expect((await first.request.get('/api/v1/me')).status()).toBe(401);
    await Promise.all([requestFromForm(first,email),requestFromForm(second,email)]);
    expect(await count()).toBe(1);
    await Promise.all([openCaptured(first,email,'login'),openCaptured(second,email,'login')]);
    await Promise.all([first,second].map(async p=>{
      expect((await p.request.get('/api/v1/me')).status()).toBe(401);
      await p.getByLabel('Email',{exact:true}).fill(email);
      await p.getByRole('button',{name:'Conferma e accedi'}).click();
    }));
    await expect.poll(async()=>Promise.all([first,second].map(async p=>(await p.request.get('/api/v1/me')).status())).then(s=>s.sort()))
      .toEqual([200,401]);
    const account=(await db.query<{id:string}>('SELECT id FROM "User" WHERE email=$1',[email])).rows[0];
    expect((await page.request.patch('/api/v1/users/'+account.id,{data:{isActive:false}})).ok()).toBe(true);
    for(const p of [first,second])expect((await p.request.get('/api/v1/me')).status()).toBe(401);
    await requestFromForm(first,email);
    expect(await count()).toBe(1);
  } finally {
    await Promise.all([first.close(),second.close(),db.end()]);
  }
});
