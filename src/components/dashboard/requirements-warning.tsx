'use client';

/**
 * The ONE warning of the requirements check (story 19.9, CR §4.4, R-19-h) —
 * every failure of a 422 `REQUIREMENTS_NOT_MET` (`details.failures`), in the
 * server's order, and the admin's «Procedi comunque», which resends the SAME
 * request with `force: true` and no motivo. Written once for the flight form
 * (desktop panel and full-screen phone panel alike) and reused by story
 * 19.10's booking forms and membership fee, hence its own texts
 * (`Requirements.*`, ICU plurals) instead of labels threaded through pages.
 *
 * `canProceed = false` is the blocked mode (the list, no buttons) for a
 * caller who cannot derogate; the flight form never uses it (only an admin
 * registers flights). `error` = the last «Procedi comunque» failed with
 * something the caller does not map itself (network, 5xx): the warning stays
 * open with a retry message. On mount it takes the focus and scrolls into
 * view — on the phone it sits under the whole form.
 *
 * Tokens only (`--warn-soft`/`--warn`, the panel of the deroga it replaces);
 * the 44px phone targets live in `airops.css` (`.req-warning`).
 */
import { useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { describeRequirementFailure } from '@/lib/requirement-failures';
import { formatCents } from '@/lib/money';
import type { RequirementFailure } from '@/lib/schemas/requirements';
import { formatDateOnly } from '@/lib/time';

export type RequirementsWarningProps = {
  failures: RequirementFailure[];
  canProceed: boolean;
  onProceed: () => void;
  onCancel: () => void;
  submitting: boolean;
  error: boolean;
  moneyLocale: 'it' | 'en';
  /** Defaults to `Requirements.title`. */
  title?: string;
};

export function RequirementsWarning({ failures, canProceed, onProceed, onCancel, submitting, error, moneyLocale, title }: RequirementsWarningProps) {
  const t = useTranslations('Requirements');
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const format = { formatDate: (dateOnly: string) => formatDateOnly(dateOnly, moneyLocale), formatMoney: (cents: number) => formatCents(cents, moneyLocale) };

  return (
    <div ref={rootRef} tabIndex={-1} role="group" aria-labelledby={titleId} data-testid="requirements-warning" className="req-warning">
      <h4 id={titleId} className="fld-label req-warning-title">
        {title ?? t('title')}
      </h4>
      <ul className="req-warning-list">
        {failures.map((failure, index) => {
          const described = describeRequirementFailure(failure, format);
          const message = t(`failure.${described.key}`, described.values);
          return (
            <li key={index} data-testid="requirements-warning-item" data-type={failure.type}>
              {described.who ? (
                <>
                  <span className="req-warning-who">{t('who', { name: described.who.name, role: t(`role.${described.who.role}`) })}</span>
                  {' — '}
                </>
              ) : null}
              {message}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" data-testid="requirements-proceed-error" className="fld-error">
          {t('proceedError')}
        </p>
      ) : null}
      {canProceed ? (
        <div className="req-warning-actions">
          <button type="button" className="btn primary" disabled={submitting} onClick={onProceed} data-testid="requirements-proceed">
            {t('proceed')}
          </button>
          <button type="button" className="btn" onClick={onCancel} data-testid="requirements-cancel">
            {t('cancel')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
