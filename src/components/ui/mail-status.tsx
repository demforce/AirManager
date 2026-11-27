'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/time';

type Observation = { at: string; outcome: string; phase: string; code: number | null };
type Health = { workerOverdue: boolean; mode: string; reason: string | null; heartbeatAt: string | null; waiting: number; uncertain: number; rejected: number; exhausted: number; oldestAt: string | null; manual: Observation | null; automatic: Observation | null };
type Invite = { credentialValidUntil: string | null; state: string; reason: string | null; observedAt: string; nextAt: string; revokedAt: string | null; history: { outcome: string | null }[] };
function useMailStatus<T>(url: string, refresh: number) {
  const [snapshot, setSnapshot] = useState<{ url: string; data: T } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (res.ok) {
          const data = await res.json() as T;
          if (!controller.signal.aborted) setSnapshot({ url, data });
        }
      } catch { /* A refresh can be retried after a lost connection. */ }
      if (!controller.signal.aborted) timer = setTimeout(read, 5000);
    }
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [url, refresh]);
  return snapshot?.url === url ? snapshot.data : null;
}
export function SmtpHealth({ refresh }: { refresh: number }) {
  const s = useMailStatus<Health>('/api/v1/settings/smtp/test-email', refresh);
  const t = useTranslations('CredentialMail');
  const locale = useLocale();
  const format = (date: string) => formatDateTime(new Date(date), locale === 'en' ? 'en' : 'it');
  const observation = (o: Observation | null) => o ? t('observation', { result: t(o.outcome), time: format(o.at) }) : t('never');
  if (!s) return null;
  const worker = !s.heartbeatAt ? t('never') : t(s.workerOverdue ? 'workerLate' : 'workerActive', { time: format(s.heartbeatAt) });
  return <div role="status" aria-live="polite" data-testid="smtp-health">
    <p>{t('channel', { state: t(s.mode) })}{s.reason && s.mode !== 'ACTIVE' ? ' — ' + t(s.reason) : ''}</p>
    <p>{t('counts', { waiting: s.waiting, uncertain: s.uncertain })}</p>
    <p>{t('failures', { rejected: s.rejected, exhausted: s.exhausted })}{s.oldestAt ? ' ' + t('oldest', { time: format(s.oldestAt) }) : ''}</p>
    <p>{t('manual', { observation: observation(s.manual) })}</p>
    <p>{t('automatic', { observation: observation(s.automatic) })}</p>
    <p>{t('worker', { observation: worker })}</p>
  </div>;
}
export function InviteStatus({ userId, refresh }: { userId: string; refresh: number }) {
  const snapshot = useMailStatus<{ invite: Invite | null }>(`/api/v1/users/${userId}/resend-invite`, refresh);
  const t = useTranslations('CredentialMail');
  const locale = useLocale();
  const invite = snapshot?.invite;
  if (!invite) return null;
  const when = (value: string) => formatDateTime(new Date(value), locale === 'en' ? 'en' : 'it');
  const outcome = invite.history[0]?.outcome;
  return <p role="status" data-testid="credential-invite-status">
    {t('invite', { state: t(invite.state), time: when(invite.observedAt) })}
    {invite.state === 'QUEUED' && outcome && outcome !== 'CANCELLED' ? ' ' + t('retry', { reason: t(outcome), time: when(invite.nextAt) }) : ''}
    {invite.reason === 'WINDOW' ? ' ' + t('WINDOW') : ''}
    {invite.reason === 'WINDOW' && !invite.revokedAt && invite.credentialValidUntil ? (
      <> {' '}<time dateTime={invite.credentialValidUntil} data-testid="invite-valid-until">
        {t('linkValidUntil', { time: when(invite.credentialValidUntil) })}
      </time></>
    ) : null}
    {invite.state === 'UNCERTAIN' ? ' ' + t('uncertainInvite') : ''}
    {invite.revokedAt ? ' ' + t('invalidLink') : ''}
  </p>;
}
