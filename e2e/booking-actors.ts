import { expect, type Page } from '@playwright/test';

const SEED_PASSWORD = process.env['SEED_ADMIN_PASSWORD'];
if (!SEED_PASSWORD) throw new Error('The booking fixtures require SEED_ADMIN_PASSWORD');
export const PRIVATE_PASSWORD = 'AirManager18.2b!';

export async function login(page: Page, email: string, password = SEED_PASSWORD!): Promise<void> {
  await page.goto('/it/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/it\/dashboard$/);
}

export async function privateActor(page: Page, role: 'PILOT' | 'STUDENT'): Promise<{ email: string; personId: string }> {
  const marker = `bookingtest${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const created = await page.request.post('/api/v1/people', { data: { firstName: 'Test', lastName: marker } });
  expect(created.status()).toBe(201);
  const personId = ((await created.json()) as { id: string }).id;
  const profile = await page.request.put(`/api/v1/people/${personId}/profiles/${role === 'PILOT' ? 'pilot' : 'student'}`, {
    data: role === 'PILOT' ? { licenseNumber: marker, licenseType: 'PPL(A)' } : { courseStartDate: '2020-01-01' },
  });
  expect(profile.status()).toBe(200);
  const email = `${marker}@airmanager.local`;
  const user = await page.request.post('/api/v1/users', { data: { email, roles: [role], personId } });
  expect(user.status()).toBe(201);

  const deadline = Date.now() + 30_000;
  let text = '';
  while (Date.now() < deadline) {
    const result = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = (await result.json()) as { messages: Array<{ ID: string; Subject: string }> };
    const invite = body.messages.find((message) => message.Subject.includes('invito'));
    if (invite) {
      const full = await fetch(`http://localhost:8025/api/v1/message/${invite.ID}`);
      text = ((await full.json()) as { Text: string }).Text;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const match = /(https?:\/\/\S*\/set-password\?token=\S+)/.exec(text);
  expect(match, 'local Mailpit invitation').not.toBeNull();
  const url = new URL(match![1]!);
  await page.goto(url.pathname + url.search);
  await page.getByLabel('Nuova password').fill(PRIVATE_PASSWORD);
  await page.getByLabel('Conferma password').fill(PRIVATE_PASSWORD);
  await page.getByRole('button', { name: 'Imposta password' }).click();
  await expect(page.getByTestId('set-password-success')).toBeVisible();
  return { email, personId };
}
