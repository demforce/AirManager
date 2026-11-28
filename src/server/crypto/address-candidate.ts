import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { singleMailbox } from '@/lib/schemas/email-trial';

type Intent = { id: string; userId: string; purpose: string; generation: bigint };

function binding(intent: Intent) {
  return Buffer.from(JSON.stringify([intent.id, intent.userId, intent.purpose, String(intent.generation)]));
}

function key() {
  return Buffer.from(hkdfSync('sha256', env.AUTH_SECRET, 'airmanager.address-change.v1', 'candidate', 32));
}

export function sealCandidate(intent: Intent, email: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(binding(intent));
  const ciphertext = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function openCandidate(intent: Intent & { candidateBox: string | null }): string | null {
  if (intent.purpose !== 'CHANGE_EMAIL_NEW' || !intent.candidateBox) return null;
  try {
    const bytes = Buffer.from(intent.candidateBox, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAAD(binding(intent));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const email = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    return singleMailbox.safeParse(email).data === email ? email : null;
  } catch {
    return null;
  }
}
