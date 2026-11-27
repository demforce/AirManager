import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { requireMailTestDatabase } from '../scripts/mail-test-database';
import { startSyntheticSmtp } from '../scripts/synthetic-smtp';
test.describe.configure({
  mode: 'serial'
});
for (const locale of ['it', 'en'] as const) {
  test(`credential queue in ${locale}: invitation during a 451, recovery and separate club/automatic observations`, async ({
    page
  }) => {
    const db = new Client({ connectionString: requireMailTestDatabase('browser') });
    await db.connect();
    test.setTimeout(160_000);
    const relay = await startSyntheticSmtp();
    const fields = ['smtp.host', 'smtp.port', 'smtp.security', 'smtp.user', 'smtp.pass', 'smtp.from', 'airfield.contactEmail'];
    const saved = (await db.query<{id:string; key: string; value: string; updatedAt:Date}>('SELECT id,key,value,"updatedAt" FROM "AppSetting" WHERE key=ANY($1)', [fields])).rows;
    const set = (key: string, value: string) => db.query('INSERT INTO "AppSetting" (key,value,"updatedAt",id) VALUES ($1,$2,now(),$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now()', [key,value,randomUUID()]);
    const name = 'Queue-' + randomUUID();
    const email = randomUUID() + '@fixture.invalid';
    try {
      await db.query('DELETE FROM "AppSetting" WHERE key=ANY($1)', [['smtp.pass','smtp.user']]);
      for (const [key, value] of [['smtp.host', '127.0.0.1'], ['smtp.port', String(relay.port)], ['smtp.security', 'NONE'], ['smtp.from', 'from@fixture.invalid'], ['airfield.contactEmail', 'club@fixture.invalid']]) await set(key, value);
      await page.goto('/it/login');
      await page.getByLabel('Email').fill('admin@airmanager.local');
      await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD!);
      await page.getByRole('button', {
        name: 'Accedi'
      }).click();
      await expect(page).toHaveURL(/\/it\/dashboard$/, { timeout: 20_000 });
      const created = await page.request.post('/api/v1/people', {
        data: {
          firstName: 'Fixture',
          lastName: name
        }
      });
      expect(created.status()).toBe(201);
      await page.goto(`/${locale}/dashboard/pilots?q=${name}`);
      const row = page.locator('[data-testid^="pilot-row-"]').filter({
        hasText: name
      });
      await row.getByRole('button', {
        name: locale === 'it' ? 'Modifica' : 'Edit'
      }).click();
      const section = page.getByTestId('pilot-access-none');
      await section.getByLabel('Email').fill(email);
      await section.getByLabel(locale === 'it' ? 'Pilota' : 'Pilot', {
        exact: true
      }).check();
      relay.controls.reply = 'temporary';
      await page.getByTestId('pilot-access-create').click();
      await expect(page.getByTestId('toast')).toContainText(locale === 'it' ? 'Accesso creato' : 'Account created');
      const invite = page.getByTestId('credential-invite-status');
      await expect(invite).toContainText(locale === 'it' ? 'Rifiuto temporaneo' : 'Temporary rejection', {
        timeout: 15_000
      });
      const ready = () => db.query('UPDATE "CredentialMail" SET "nextAt"=now() WHERE "userId"=(SELECT id FROM "User" WHERE email=$1) AND state=$2', [email,'QUEUED']);
      relay.controls.reply = 'accept';
      await set('smtp.security', 'STARTTLS'); // Fixture relay explicitly refuses STARTTLS.
      await ready();
      await expect.poll(async () => (await db.query('SELECT mode FROM "MailChannel" WHERE id=1')).rows[0].mode).toBe('PAUSED');
      await set('smtp.security', 'NONE');
      await ready();
      await expect(invite).toContainText(locale === 'it' ? 'Accettato dal trasporto SMTP' : 'Accepted by the SMTP transport', {
        timeout: 15_000
      });
      await page.goto(`/${locale}/dashboard/pilots`);
      await page.getByTestId('pilots-new-button').click();
      const form = page.getByTestId('pilot-identity-form');
      await form.getByLabel(locale === 'it' ? 'Nome' : 'First name', {exact:true}).fill('Fixture');
      await form.getByLabel(locale === 'it' ? 'Cognome' : 'Last name', {exact:true}).fill('Composite-' + name);
      await form.getByTestId('new-person-grant-access').check();
      await form.getByTestId('new-person-access-email').fill('composite-' + email);
      await form.getByTestId('new-person-access-role-PILOT').check();
      relay.controls.reply = 'temporary';
      await form.getByTestId('pilot-identity-submit').click();
      await expect(page.getByTestId('toast')).toContainText(locale === 'it' ? 'Accesso creato. Invito in attesa.' : 'Account created. Invitation queued.');
      // Move this synthetic issued credential into the retry safety margin.
      // Both clocks retain the same absolute deadline, as they do for a real generation.
      const compositeEmail = 'composite-' + email;
      await expect.poll(async () => (await db.query(
        'SELECT q.attempts FROM "CredentialMail" q JOIN "User" u ON u.id=q."userId" WHERE u.email=$1 AND q.state=$2',
        [compositeEmail,'QUEUED'])).rows[0]?.attempts).toBe(1);
      const term = new Date(Date.now() + 110_000);
      const adjusted = await db.query(
        'WITH q AS (UPDATE "CredentialMail" SET "expiresAt"=$2 WHERE "userId"=(SELECT id FROM "User" WHERE email=$1) RETURNING "tokenId","userId") UPDATE "AuthToken" a SET "expiresAt"=$2 FROM q WHERE a.id=q."tokenId" RETURNING q."userId"',
        [compositeEmail,term]);
      expect(adjusted.rowCount).toBe(1);
      await page.goto(`/${locale}/dashboard/pilots?q=${'Composite-' + name}`);
      await page.locator('[data-testid^="pilot-row-"]').filter({hasText:'Composite-' + name}).getByRole('button',{name:locale==='it'?'Modifica':'Edit'}).click();
      const validity = page.getByTestId('invite-valid-until');
      await expect(validity).toHaveAttribute('datetime',term.toISOString(),{timeout:15_000});
      await expect(validity).toContainText(locale === 'it' ? 'ora di Roma' : 'Rome time');
      const revoked = await page.request.patch(`/api/v1/users/${adjusted.rows[0].userId}`,{data:{isActive:false}});
      expect(revoked.ok()).toBe(true);
      await expect(validity).toHaveCount(0,{timeout:15_000});
      relay.controls.reply = 'accept';
      await page.goto(`/${locale}/dashboard/settings`);
      const health = page.getByTestId('smtp-health');
      await expect(health).toContainText(locale === 'it' ? 'Verifica automatica su un messaggio dovuto: Accettato' : 'Automatic check on a due message: Accepted');
      expect(relay.controls.recipients.some(r => r.includes('club@fixture.invalid'))).toBe(false);
      const button = page.getByTestId('smtp-test-email-button');
      await expect(button).toBeEnabled();
      await button.focus();
      const [receipt] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/settings/smtp/test-email', { timeout: 100_000 }),
        button.press('Enter'),
      ]);
      expect(receipt.ok()).toBe(true);
      expect(await receipt.json()).toMatchObject({ sent: true, outcome: 'ACCEPTED', phase: 'FINAL' });
      const feedback = page.getByTestId('smtp-test-email-feedback');
      await expect(feedback).toHaveAttribute('role', 'status', { timeout: 15_000 });
      await expect(feedback).toContainText(locale === 'it' ? 'Accettato dal trasporto SMTP' : 'Accepted by the SMTP transport');
      await expect(health).toContainText(locale === 'it' ? 'Prova manuale al club: Accettato' : 'Manual club test: Accepted');
      expect(relay.controls.recipients.at(-1)?.includes('club@fixture.invalid')).toBe(true);
    } finally {
      try {
        await db.query('BEGIN');
        await db.query('DELETE FROM "AppSetting" WHERE key=ANY($1)', [fields]);
        for (const row of saved) await db.query('INSERT INTO "AppSetting" (id,key,value,"updatedAt") VALUES ($1,$2,$3,$4)', [row.id,row.key,row.value,row.updatedAt]);
        await db.query('COMMIT');
      } finally { await db.end(); }
      await relay.close();
    }
  });
}
