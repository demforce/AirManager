import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openCaptured, openCapturedReset, requestFromForm } from './email-access-forms';
import { Client } from 'pg';
import { requireMailTestDatabase } from '../scripts/mail-test-database';

// A capture, a trace or an error attachment must never archive a bearer link.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('verified invitation and one email session through the public forms', { tag: '@email-trial' }, async ({page, browser}) => {
  test.skip(process.env.AIRMANAGER_EMAIL_TRIAL !== '1', 'Disposable email-access trial disabled.');
  test.setTimeout(210_000);
  const db = new Client({connectionString:requireMailTestDatabase('browser')});
  await db.connect();
  const email = randomUUID()+'@fixture.invalid';
  const surname = 'Verify-'+randomUUID();
  const historical = randomUUID()+'@fixture.invalid';
  const first = await browser.newPage();
  const second = await browser.newPage();
  try {
    await page.goto('/it/login');
    await page.getByLabel('Email',{exact:true}).fill('admin@airmanager.local');
    await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_ADMIN_PASSWORD!);
    await page.getByRole('button',{name:'Accedi',exact:true}).click();
    await expect(page).toHaveURL(/\/dashboard$/, {timeout:20_000});
    const create = await page.request.post('/api/v1/people',{data:{firstName:'Fixture',lastName:surname,email:historical}});
    expect(create.status()).toBe(201);
    const personId = (await create.json()).id as string;
    await page.goto('/it/dashboard/pilots?q='+surname);
    const row=page.locator('[data-testid^="pilot-row-"]').filter({hasText:surname});
    await row.getByRole('button',{name:'Modifica'}).click();
    const section=page.getByTestId('pilot-access-none');
    // A legacy spelling on an inactive account reserves the login address too.
    const duplicate = 'duplicate-'+randomUUID()+'@fixture.invalid';
    await db.query('INSERT INTO "User" (id, email, "isActive", "updatedAt") VALUES ($1, $2, false, now())',
      [randomUUID(), ' '+duplicate.toUpperCase()+' ']);
    await section.getByLabel('Email',{exact:true}).fill(duplicate);
    await section.getByLabel('Pilota',{exact:true}).check();
    await expect(section.getByRole('checkbox',{name:/verifica email/i})).toHaveCount(0);
    const [conflict] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/users'),
      section.getByTestId('pilot-access-create').click(),
    ]);
    expect(conflict.status()).toBe(409);
    await expect(section.getByRole('alert')).toHaveText('Esiste già un accesso con questa email.');
    await requestFromForm(first,duplicate);
    await requestFromForm(first,randomUUID()+'@fixture.invalid');
    await section.getByLabel('Email',{exact:true}).fill(email);
    await section.getByTestId('pilot-access-create').click();
    await expect(page.getByText('Indirizzo da verificare',{exact:true})).toBeVisible();

    const displayed = page.getByTestId('pilot-identity-form').getByLabel('Email', { exact: true });
    await expect(displayed).toHaveValue(email);
    await expect(displayed).toHaveAttribute('readonly', '');
    expect((await page.request.patch('/api/v1/people/'+personId,{data:{email:historical}})).status()).toBe(409);
    expect((await (await page.request.get('/api/v1/people/'+personId)).json()).email).toBe(email);

    const count = async () => (await db.query<{n:number}>(`SELECT count(*)::int AS n FROM "CredentialMail" m
      JOIN "User" u ON u.id=m."userId" WHERE u.email=$1 AND m.purpose='LOGIN_LINK'`,[email])).rows[0].n;
    await requestFromForm(first,email);
    expect(await count()).toBe(0);
    // A preview captures the original generation. Only a fresh admin request may replace it.
    await openCaptured(first,email,'verify');
    const resend = page.getByRole('button', { name: 'Reinvia invito', exact: true });
    await expect(resend).toBeVisible();
    const [replacement] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/resend-invite')),
      resend.click(),
    ]);
    expect(replacement.status()).toBe(200);
    await first.getByRole('button',{name:'Conferma indirizzo'}).click();
    await expect(first.getByRole('status')).toBeVisible();
    await expect(first.getByRole('status')).not.toContainText('Indirizzo verificato.');
    await expect.poll(async () => (await db.query(`SELECT m.state FROM "CredentialMail" m JOIN "User" u ON u.id=m."userId"
      WHERE u.email=$1 AND m.purpose='VERIFY_EMAIL' ORDER BY m.generation DESC LIMIT 1`,[email])).rows[0].state,
      { timeout: 50_000 }).toBe('ACCEPTED');
    await Promise.all([openCaptured(first,email,'verify'), openCaptured(second,email,'verify')]);
    expect((await first.request.get('/api/v1/me')).status()).toBe(401);
    const status = async () => (await db.query<{verified:boolean}>(`SELECT "verifiedAt" IS NOT NULL AS verified FROM "EmailVerification" WHERE email=$1`,[email])).rows[0].verified;
    expect(await status()).toBe(false);
    await Promise.all([first,second].map(p=>p.getByRole('button',{name:'Conferma indirizzo'}).click()));
    await Promise.all([first,second].map(p=>expect(p.getByRole('status')).toBeVisible()));
    expect((await Promise.all([first,second].map(p=>p.getByRole('status').textContent()))).filter(s=>s?.startsWith('Indirizzo verificato.'))).toHaveLength(1);
    expect(await status()).toBe(true);
    await page.goto('/it/dashboard/pilots?q='+surname);
    await row.getByRole('button',{name:'Modifica'}).click();
    await expect(page.getByText('Indirizzo verificato',{exact:true})).toBeVisible();
    await expect(resend).toHaveCount(0);
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
    expect((await page.request.post('/api/v1/users/'+account.id+'/resend-invite')).status()).toBe(409);
    await page.goto('/it/dashboard/pilots?q='+surname);
    await row.getByRole('button',{name:'Modifica'}).click();
    await expect(page.getByTestId('pilot-access-existing')).toBeVisible();
    await expect(resend).toHaveCount(0);
    for(const p of [first,second])expect((await p.request.get('/api/v1/me')).status()).toBe(401);
    await requestFromForm(first,email);
    await requestFromForm(first,historical);
    expect(await count()).toBe(1);

    // The composite can fail on the access email with no person email supplied.
    await page.goto('/it/dashboard/pilots');
    await page.getByTestId('pilots-new-button').click();
    const form = page.getByTestId('pilot-identity-form');
    const compositeSurname = 'Duplicate-'+randomUUID();
    await form.getByLabel('Nome', {exact:true}).fill('Fixture');
    await form.getByLabel('Cognome', {exact:true}).fill(compositeSurname);
    await form.getByTestId('new-person-grant-access').check();
    await expect(form.locator('input[type=email]')).toHaveCount(1);
    await form.getByTestId('new-person-access-email').fill(duplicate);
    await form.getByTestId('new-person-access-role-PILOT').check();
    const [compositeConflict] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/people'),
      page.getByTestId('pilot-identity-submit').click(),
    ]);
    expect(compositeConflict.status()).toBe(409);
    await expect(form.getByTestId('pilot-identity-error')).toHaveText('Questo indirizzo email è già in uso.');
    expect((await db.query('SELECT id FROM "Person" WHERE "lastName" = $1',[compositeSurname])).rowCount).toBe(0);

    const adminEmail = randomUUID()+'@fixture.invalid';
    await form.getByTestId('new-person-access-email').fill(adminEmail);
    await form.getByTestId('new-person-access-role-PILOT').uncheck();
    await form.getByTestId('new-person-access-role-ADMIN').check();
    await page.getByTestId('pilot-identity-submit').click();
    await expect(page.getByTestId('toast')).toContainText('Pilota creato');
    const stored = await db.query<{noPassword:boolean; noPersonEmail:boolean; pending:boolean; purpose:string}>(`
      SELECT u."passwordHash" IS NULL AS "noPassword", p.email IS NULL AS "noPersonEmail",
             v."verifiedAt" IS NULL AS pending, q.purpose FROM "User" u JOIN "Person" p ON p.id=u."personId"
        JOIN "EmailVerification" v ON v."userId"=u.id JOIN "CredentialMail" q ON q."userId"=u.id WHERE u.email=$1`,[adminEmail]);
    expect(stored.rows).toEqual([{noPassword:true, noPersonEmail:true, pending:true, purpose:'VERIFY_EMAIL'}]);
    await openCaptured(second,adminEmail,'verify');
    await second.getByRole('button',{name:'Conferma indirizzo'}).click();
    await expect(second.getByRole('status')).toContainText('Indirizzo verificato.');

    // The existing reset provisions the optional personal fallback after verification.
    await second.goto('/it/forgot-password');
    await second.getByLabel('Email',{exact:true}).fill(adminEmail);
    await second.getByRole('button',{name:'Invia link di reimpostazione'}).click();
    await expect(second.getByTestId('forgot-password-confirmation')).toBeVisible();
    await openCapturedReset(second,adminEmail);
    const password = randomUUID();
    await second.getByLabel('Nuova password',{exact:true}).fill(password);
    await second.getByLabel('Conferma password',{exact:true}).fill(password);
    await second.getByRole('button',{name:'Imposta password',exact:true}).click();
    await expect(second.getByTestId('set-password-success')).toBeVisible();
    await second.goto('/it/login');
    await second.getByRole('link',{name:'Accesso amministratori con password'}).click();
    await expect(second.getByRole('heading',{name:'Accesso amministratori con password',exact:true})).toBeVisible();
    await second.getByLabel('Email',{exact:true}).fill(adminEmail);
    await second.getByLabel('Password',{exact:true}).fill(password);
    await second.getByRole('button',{name:'Accedi',exact:true}).click();
    await expect(second).toHaveURL(/\/dashboard$/, {timeout:20_000});

  } finally {
    await Promise.all([first.close(),second.close(),db.end()]);
  }
});
