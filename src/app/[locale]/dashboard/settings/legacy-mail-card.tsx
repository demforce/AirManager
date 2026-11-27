'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { LegacyMailPreview } from '@/lib/schemas/legacy-mail-routing';

const endpoint = '/api/v1/settings/legacy-mail';

export function LegacyMailCard() {
  const t = useTranslations('LegacyMail');
  const [preview, setPreview] = useState<LegacyMailPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function read(page: number) {
    const response = await fetch(endpoint + '?page=' + page, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    setPreview(await response.json() as LegacyMailPreview);
  }
  async function simulate(page = 1) {
    setBusy(true);
    setNotice('');
    try { await read(page); }
    catch { setPreview(null); setNotice(t('failed')); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !preview.enabled, revision: preview.revision }) });
      if (response.status === 409) { setPreview(null); setNotice(t('stale')); return; }
      if (!response.ok) throw new Error();
      await read(preview.page);
      setNotice(t('saved'));
    } catch { setPreview(null); setNotice(t('failed')); }
    finally { setBusy(false); }
  }
  return <section className="card settings-card" data-testid="legacy-mail-settings-card" aria-label={t('title')}>
    <div className="card-head"><h2 className="card-title">{t('title')}</h2></div>
    <div className="legacy-mail-body">
      <p>{t('scope')}</p>
      <button type="button" className="btn" disabled={busy} onClick={() => void simulate()}>{t(preview ? 'refresh' : 'preview')}</button>
      <p role="status">{busy ? t('loading') : notice}</p>
      {preview && <>
        <p><strong>{t(preview.enabled ? 'active' : 'inactive')}</strong></p>
        <p>{t('summary', { eligible: preview.eligible, total: preview.total })}</p>
        <button type="button" className="btn" disabled={busy} onClick={() => void apply()}>{t(preview.enabled ? 'disable' : 'enable')}</button>
        <ul className="legacy-mail-rows">{preview.rows.map(row => <li key={row.personId ? 'p:' + row.personId : 'u:' + row.userId}>
          <div>{row.personId && <Link href={'/dashboard/people/' + row.personId}>{t('person', { id: row.personId })}</Link>}
            {row.personId && row.userId && ' · '}
            {row.userId && t('account', { id: row.userId })}</div>
          <div>{row.reasons.length ? row.reasons.map(reason => t(reason)).join(' · ') : t('eligible')}{row.mixedProfiles && ' · ' + t('mixed')}</div>
          {(row.queued + row.inFlight + row.uncertain > 0) && <div>{t('messages', { queued: row.queued, flight: row.inFlight, uncertain: row.uncertain })}</div>}
        </li>)}</ul>
        {preview.pages > 1 && <nav aria-label={t('pages')} className="legacy-mail-pages">
          <button className="btn" type="button" disabled={busy || preview.page === 1} onClick={() => void simulate(preview.page - 1)}>{t('previous')}</button>
          <span>{t('page', { page: preview.page, pages: preview.pages })}</span>
          <button className="btn" type="button" disabled={busy || preview.page === preview.pages} onClick={() => void simulate(preview.page + 1)}>{t('next')}</button>
        </nav>}
      </>}
    </div>
  </section>;
}
