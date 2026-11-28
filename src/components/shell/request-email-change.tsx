'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';

export function RequestEmailChange({ userId, className }: { userId: string; className: string }) {
  const t = useTranslations('auth.emailTrial');
  const toast = useToast();
  const key = useRef<string | null>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  async function requestChange() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    key.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/v1/users/' + userId + '/request-email-change', {
        method: 'POST', headers: { 'Idempotency-Key': key.current },
      });
      if (response.ok || response.status < 500) key.current = null;
      if (response.ok) toast.show(t('changeQueued'), 'ok');
      else toast.show(t('changeUnavailable'), 'bad');
    } catch { toast.show(t('changeUnavailable'), 'bad'); }
    finally { busy.current = false; setPending(false); }
  }
  return <button type="button" className={className} onClick={requestChange} disabled={pending}>{t('changeStart')}</button>;
}
