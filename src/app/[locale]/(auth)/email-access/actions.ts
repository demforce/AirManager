'use server';

import { headers } from 'next/headers';
import { formMailbox } from '@/lib/schemas/email-trial';
import { emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { submitAddressChange } from '@/server/services/account-email-change';
import { consumeTrialLink, loginRequestOrigin, requestEmailLogin } from '@/server/services/email-trial.service';

async function localRequest() {
  if (!emailTrialEnabled()) return null;
  const h = await headers();
  return h.get('origin') === new URL(process.env.APP_URL!).origin ? h : null;
}

export async function requestLink(form: FormData): Promise<boolean> {
  const h = await localRequest();
  if (!h || !(form instanceof FormData)) return false;
  const email = formMailbox(form);
  if (!email) return false;
  await requestEmailLogin(email, loginRequestOrigin(h));
  return true;
}

export async function confirmReactivation(token: string): Promise<boolean> {
  const h = await localRequest();
  return Boolean(h && await consumeTrialLink('REACTIVATE_ACCOUNT', token, undefined, loginRequestOrigin(h)));
}

export async function confirmMailbox(token: string): Promise<boolean> {
  const h = await localRequest();
  return Boolean(h && await consumeTrialLink('VERIFY_EMAIL', token, undefined, loginRequestOrigin(h)));
}

export async function proposeNewAddress(token: string, form: FormData): Promise<boolean> {
  const h = await localRequest();
  if (!h || !(form instanceof FormData)) return false;
  const email = formMailbox(form);
  return Boolean(email && await submitAddressChange('CHANGE_EMAIL_CURRENT', token, email, loginRequestOrigin(h)));
}

export async function confirmNewAddress(token: string): Promise<boolean> {
  const h = await localRequest();
  return Boolean(h && await submitAddressChange('CHANGE_EMAIL_NEW', token, undefined, loginRequestOrigin(h)));
}
