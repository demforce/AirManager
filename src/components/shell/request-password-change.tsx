'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestMyPasswordChange } from '@/app/[locale]/(auth)/email-access/actions';
import { useToast } from '@/components/ui/toast';

export function RequestPasswordChange({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations('auth.emailTrial');
  const toast = useToast();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  async function request() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const queued = await requestMyPasswordChange();
      toast.show(t(queued ? 'passwordQueued' : 'passwordUnavailable'), queued ? 'ok' : 'bad');
    } catch { toast.show(t('passwordUnavailable'), 'bad'); }
    finally { busy.current = false; setPending(false); }
  }
  return <button type="button" className={mobile ? 'mobile-sheet-row' : 'btn'} disabled={pending}
    data-testid={mobile ? 'request-password-change-mobile' : 'request-password-change'} onClick={request}>{t('change-passwordTitle')}</button>;
}
