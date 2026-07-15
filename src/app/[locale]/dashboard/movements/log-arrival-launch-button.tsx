'use client';

/**
 * "Registra arrivo" header button (epic 8, story 8.3; epic 12, story 12.4,
 * AC 3) — same shape as `dashboard/ppr/manual-ppr-launch-button.tsx`, but
 * `approveImmediately={true}`: the created request is immediately APPROVED
 * with a pprNumber assigned, so it shows up right away as `al suolo`/`in
 * arrivo` in the table below (`Ops.jsx#LogArrivalForm`'s prototype
 * counterpart).
 */
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/ui/icons';
import { ManualPprForm, type ManualPprFormLabels } from '@/components/ppr/manual-ppr-form';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';

type LogArrivalLaunchButtonProps = {
  locale: AppLocale;
  buttonLabel: string;
  /** `{pprNumber}` unresolved placeholder — filled from the response after a successful create. */
  successToast: string;
  labels: ManualPprFormLabels;
};

export function LogArrivalLaunchButton({ locale, buttonLabel, successToast, labels }: LogArrivalLaunchButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  function handleSuccess(created: PprRequestItemDto): void {
    setOpen(false);
    toast.show(successToast.replace('{pprNumber}', created.pprNumber ?? ''), 'ok');
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)} data-testid="log-arrival-button">
        <Icon.plus /> {buttonLabel}
      </button>
      <ManualPprForm open={open} onClose={() => setOpen(false)} approveImmediately={true} locale={locale} labels={labels} onSuccess={handleSuccess} />
    </>
  );
}
