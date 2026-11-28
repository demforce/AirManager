import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { adminPasswordSchema } from '@/lib/schemas/auth-tokens';

// Common password list compiled by Royce Williams. Source: Django 5.2.8, django/contrib/auth/common-passwords.txt.gz (BSD-3-Clause,
// see data/django-license). Load once, only when assigning an admin password.
let commonPasswords: Set<string> | undefined;

export function acceptableAdminPassword(value: string, email: string): boolean {
  if (!adminPasswordSchema.safeParse(value).success) return false;
  commonPasswords ??= new Set(gunzipSync(readFileSync(join(process.cwd(), 'src/server/auth/data/django-common.gz')))
    .toString('utf8').trimEnd().split('\n'));
  // Normalize for blocklist comparison only. Hash and verify the complete original value.
  const word = value.normalize('NFKC').trim().toLowerCase();
  const local = email.toLowerCase().split('@')[0];
  const contextual = new Set(['airmanager', 'airmanageradmin', 'amministratore', 'administrator',
    'admin', 'password', 'passwordpassword', email.toLowerCase(), local, local.replace(/[._-]/g, '')]);
  const stem = word.replace(/[\d\p{P}\p{S}]+$/u, '');
  return word.length > 0 && !commonPasswords.has(word) && !contextual.has(word) && !contextual.has(stem);
}
