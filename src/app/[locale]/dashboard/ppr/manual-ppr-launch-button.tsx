'use client';

/**
 * "PPR manuale" header button (epic 12, story 12.4, AC 2) — owns its own
 * `ManualPprForm` open state, self-contained so `page.tsx` (server) can drop
 * it into the page-head actions row without threading slide-over state
 * across the server/client boundary. `approveImmediately={false}`: stays
 * PENDING, same as `Forms.jsx#ManualPPRForm`'s prototype counterpart.
 */
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/ui/icons';
import { ManualPprForm, type ManualPprFormLabels } from '@/components/ppr/manual-ppr-form';

type ManualPprLaunchButtonProps = {
  locale: AppLocale;
  buttonLabel: string;
  successToast: string;
  labels: ManualPprFormLabels;
};

export function ManualPprLaunchButton({ locale, buttonLabel, successToast, labels }: ManualPprLaunchButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)} data-testid="ppr-manual-button">
        <Icon.plus /> {buttonLabel}
      </button>
      <ManualPprForm
        open={open}
        onClose={() => setOpen(false)}
        approveImmediately={false}
        locale={locale}
        labels={labels}
        onSuccess={() => {
          setOpen(false);
          toast.show(successToast, 'ok');
          router.refresh();
        }}
      />
    </>
  );
}
