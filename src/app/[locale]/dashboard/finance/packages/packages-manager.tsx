'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable, TruncatedCell } from '@/components/data-table';
import { formatCents, parseCents } from '@/lib/money';
import { formatMinutes, parseMinutes } from '@/lib/time';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';
import { PencilIcon, ToggleIcon, TrashIcon } from '@/components/ui/icons';

export type PackageTypeAircraftOption = { id: string; registration: string };

export type PackageTypeRow = {
  id: string;
  name: string;
  includedMinutes: number;
  priceCents: number;
  validityMonths: number | null;
  isActive: boolean;
  eligibleAircraft: PackageTypeAircraftOption[];
};

export type PackagesManagerLabels = {
  newPackageType: string;
  table: {
    name: string;
    includedHours: string;
    price: string;
    effectivePrice: string;
    aircraft: string;
    validity: string;
    status: string;
    actions: string;
    empty: string;
    noValidity: string;
    noAircraft: string;
    monthsUnit: string;
  };
  status: { active: string; inactive: string };
  actions: {
    edit: string;
    deactivate: string;
    reactivate: string;
    delete: string;
    confirmDelete: string;
    confirmYes: string;
    confirmCancel: string;
  };
  form: {
    createTitle: string;
    editTitle: string;
    name: string;
    includedHours: string;
    includedHoursHint: string;
    price: string;
    validityMonths: string;
    validityMonthsHint: string;
    aircraft: string;
    noAircraftAvailable: string;
    submitCreate: string;
    submitSave: string;
    cancel: string;
    requiredField: string;
    invalidDuration: string;
    invalidAmount: string;
    invalidValidity: string;
    conflictError: string;
    genericError: string;
  };
  feedback: {
    created: string;
    updated: string;
    deactivated: string;
    reactivated: string;
    deleted: string;
    deleteInUseError: string;
    genericError: string;
  };
};

type PackagesManagerProps = {
  packageTypes: PackageTypeRow[];
  /** Active, non-archived aircraft — the create form's checkbox baseline (AC 1). */
  activeAircraft: PackageTypeAircraftOption[];
  /** `settings.manage` — hides every write control for a `finance.manage`-only (staff) viewer. */
  canManage: boolean;
  moneyLocale: 'it' | 'en';
  labels: PackagesManagerLabels;
};

type Panel = { mode: 'create' } | { mode: 'edit'; packageType: PackageTypeRow };

/**
 * The effective hourly price (Dev Notes, AD-2): derived from `priceCents`/
 * `includedMinutes` at render time, rounded to the nearest cent — NEVER
 * persisted or sent over the wire, purely an informational column.
 */
function effectiveHourlyPriceCents(priceCents: number, includedMinutes: number): number {
  return Math.round((priceCents * 60) / includedMinutes);
}

/**
 * Admin package-type management (story 4.3, Task 4, AC 1) — mirrors
 * `categories-manager.tsx` (story 3.4): list with lifecycle status, create/
 * edit panels, deactivate/reactivate toggles (a plain `PATCH { isActive }` —
 * there is no dedicated lifecycle endpoint, unlike `CashCategory`) and a
 * two-step delete. `finance.manage`-only (staff) viewers get the read-only
 * listino: same table, no "new package type" button, no actions column (Dev
 * Notes: staff sells from this list in story 4.4 and consults it now, but
 * only admin configures it).
 */
export function PackagesManager({ packageTypes, activeAircraft, canManage, moneyLocale, labels }: PackagesManagerProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function handleSuccess(message: string): void {
    setPanel(null);
    setFeedback({ text: message, isError: false });
    router.refresh();
  }

  async function handleToggleActive(packageType: PackageTypeRow): Promise<void> {
    setPendingActionId(packageType.id);
    const response = await fetch(`/api/v1/package-types/${packageType.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !packageType.isActive }),
    });
    setPendingActionId(null);
    if (response.ok) {
      setFeedback({
        text: packageType.isActive ? labels.feedback.deactivated : labels.feedback.reactivated,
        isError: false,
      });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  async function handleDelete(packageType: PackageTypeRow): Promise<void> {
    setPendingActionId(packageType.id);
    const response = await fetch(`/api/v1/package-types/${packageType.id}`, { method: 'DELETE' });
    setPendingActionId(null);
    setConfirmingDeleteId(null);
    if (response.ok) {
      setFeedback({ text: labels.feedback.deleted, isError: false });
    } else if (response.status === 409) {
      // AC 2: a package type already sold (story 4.4 onwards) is not deletable — deactivate instead.
      setFeedback({ text: labels.feedback.deleteInUseError, isError: true });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  const columns: ColumnDef<PackageTypeRow, unknown>[] = [
    {
      id: 'name',
      header: labels.table.name,
      cell: ({ row }) => <TruncatedCell value={row.original.name} className="max-w-[220px] font-medium text-ink" />,
    },
    {
      id: 'includedHours',
      header: labels.table.includedHours,
      cell: ({ row }) => formatMinutes(row.original.includedMinutes),
    },
    {
      id: 'price',
      header: labels.table.price,
      cell: ({ row }) => formatCents(row.original.priceCents, moneyLocale),
    },
    {
      id: 'effectivePrice',
      header: labels.table.effectivePrice,
      cell: ({ row }) => `${formatCents(effectiveHourlyPriceCents(row.original.priceCents, row.original.includedMinutes), moneyLocale)}/h`,
    },
    {
      id: 'aircraft',
      header: labels.table.aircraft,
      cell: ({ row }) =>
        row.original.eligibleAircraft.length === 0 ? (
          <span className="text-mid-gray">{labels.table.noAircraft}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.original.eligibleAircraft.map((aircraft) => (
              <span
                key={aircraft.id}
                className="rounded-full bg-[#E1F3FE] px-2.5 py-0.5 text-xs font-medium text-[#1F6C9F]"
              >
                {aircraft.registration}
              </span>
            ))}
          </div>
        ),
    },
    {
      id: 'validity',
      header: labels.table.validity,
      cell: ({ row }) =>
        row.original.validityMonths === null
          ? labels.table.noValidity
          : `${row.original.validityMonths} ${labels.table.monthsUnit}`,
    },
    {
      id: 'status',
      header: labels.table.status,
      cell: ({ row }) => (
        <StatusPill tone={row.original.isActive ? 'ok' : 'warning'}>
          {row.original.isActive ? labels.status.active : labels.status.inactive}
        </StatusPill>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: labels.table.actions,
            cell: ({ row }: { row: { original: PackageTypeRow } }) => {
              const packageType = row.original;

              if (confirmingDeleteId === packageType.id) {
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-mid-gray">{labels.actions.confirmDelete}</span>
                    <Button size="sm"
                      type="button"
                      disabled={pendingActionId === packageType.id}
                      onClick={() => void handleDelete(packageType)}
                    >
                      {labels.actions.confirmYes}
                    </Button>
                    <Button variant="outline" size="sm"
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      {labels.actions.confirmCancel}
                    </Button>
                  </div>
                );
              }

              return (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => setPanel({ mode: 'edit', packageType })}
                    aria-label={labels.actions.edit}
                    title={labels.actions.edit}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    disabled={pendingActionId === packageType.id}
                    onClick={() => void handleToggleActive(packageType)}
                    aria-label={packageType.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    title={packageType.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                  >
                    <ToggleIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    disabled={pendingActionId === packageType.id}
                    onClick={() => setConfirmingDeleteId(packageType.id)}
                    aria-label={labels.actions.delete}
                    title={labels.actions.delete}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {feedback ? (
          <p
            role="status"
            data-testid="packages-feedback"
            className={`text-sm ${feedback.isError ? 'text-[#9F2F2D]' : 'text-[#346538]'}`}
          >
            {feedback.text}
          </p>
        ) : (
          <span />
        )}
        {canManage ? (
          <Button
            type="button"
            onClick={() => setPanel({ mode: 'create' })}
          >
            {labels.newPackageType}
          </Button>
        ) : null}
      </div>

      {panel ? (
        <Card className="mt-6 p-6">
          <PackageTypeForm
            // Remount when the target changes (create ↔ edit A ↔ edit B):
            // react-hook-form reads defaultValues only at mount (review 2.4 F1 pattern).
            key={panel.mode === 'edit' ? panel.packageType.id : 'create'}
            packageType={panel.mode === 'edit' ? panel.packageType : null}
            activeAircraft={activeAircraft}
            labels={labels.form}
            onCancel={() => setPanel(null)}
            onSuccess={(mode) => handleSuccess(mode === 'create' ? labels.feedback.created : labels.feedback.updated)}
          />
        </Card>
      ) : null}

      <div className="mt-6" data-testid="package-types-table">
        <DataTable columns={columns} data={packageTypes} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

/**
 * Local, UI-only schema (never sent over the wire as-is): the duration and
 * price inputs stay plain strings while the user types (same pattern as
 * `aircraft-manager.tsx`'s `newRateFormSchema`) — only `onSubmit` converts
 * them via `parseMinutes`/`parseCents`, exactly at the API-call boundary
 * (AD-2). `validityMonths` is a string too: `''` means "no expiry" (`null`
 * on the wire), any other value must be a positive integer up to 600.
 */
const packageTypeFormSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    includedHours: z.string().trim().min(1),
    price: z.string().trim().min(1),
    validityMonths: z.string().trim(),
  })
  .refine(
    (values) => {
      try {
        return parseMinutes(values.includedHours) > 0;
      } catch {
        return false;
      }
    },
    { message: 'invalidDuration', path: ['includedHours'] },
  )
  .refine(
    (values) => {
      try {
        const cents = parseCents(values.price);
        return cents > 0 && cents <= 2_147_483_647;
      } catch {
        return false;
      }
    },
    { message: 'invalidAmount', path: ['price'] },
  )
  .refine(
    (values) => {
      if (values.validityMonths === '') return true;
      const parsed = Number(values.validityMonths);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= 600;
    },
    { message: 'invalidValidity', path: ['validityMonths'] },
  );

type PackageTypeFormValues = z.infer<typeof packageTypeFormSchema>;

type PackageTypeFormProps = {
  /** `null` = create mode; a row = edit mode. */
  packageType: PackageTypeRow | null;
  activeAircraft: PackageTypeAircraftOption[];
  labels: PackagesManagerLabels['form'];
  onCancel: () => void;
  onSuccess: (mode: 'create' | 'edit') => void;
};

function PackageTypeForm({ packageType, activeAircraft, labels, onCancel, onSuccess }: PackageTypeFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [aircraftIds, setAircraftIds] = useState<string[]>(packageType?.eligibleAircraft.map((aircraft) => aircraft.id) ?? []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PackageTypeFormValues>({
    resolver: zodResolver(packageTypeFormSchema),
    defaultValues: {
      name: packageType?.name ?? '',
      includedHours: packageType ? formatMinutes(packageType.includedMinutes) : '',
      // Plain comma-decimal editable string (never the locale-formatted
      // `formatCents` display, which may include a thousands separator) —
      // round-trips cleanly through `parseCents` on submit.
      price: packageType ? (packageType.priceCents / 100).toFixed(2).replace('.', ',') : '',
      validityMonths: packageType?.validityMonths != null ? String(packageType.validityMonths) : '',
    },
  });

  // Checkbox options: active/non-archived aircraft ∪ this type's OWN eligible
  // set (which may include an aircraft archived AFTER association, Dev
  // Notes: "resta nell'insieme"). Without this union, opening the edit form
  // and saving ANY unrelated field (e.g. just the price) would silently
  // drop an already-associated archived aircraft from the set — `aircraftIds`
  // is always a full replacement (Task 2), so every option the row already
  // holds must stay selectable/visible here.
  const aircraftOptions = useMemo(() => {
    const merged = new Map<string, PackageTypeAircraftOption>();
    for (const aircraft of activeAircraft) merged.set(aircraft.id, aircraft);
    for (const aircraft of packageType?.eligibleAircraft ?? []) merged.set(aircraft.id, aircraft);
    return Array.from(merged.values()).sort((a, b) => a.registration.localeCompare(b.registration));
  }, [activeAircraft, packageType]);

  function toggleAircraft(id: string, checked: boolean): void {
    setAircraftIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  async function onSubmit(values: PackageTypeFormValues): Promise<void> {
    setFormError(null);
    // Boundary conversion (AD-2): the user types hours/euros, the wire
    // format is always integer minutes/cents — never a float past this point.
    const includedMinutes = parseMinutes(values.includedHours);
    const priceCents = parseCents(values.price);
    const validityMonths = values.validityMonths === '' ? null : Number(values.validityMonths);
    const body = { name: values.name.trim(), includedMinutes, priceCents, validityMonths, aircraftIds };

    const response = packageType
      ? await fetch(`/api/v1/package-types/${packageType.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      : await fetch('/api/v1/package-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess(packageType ? 'edit' : 'create');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5" data-testid="package-type-form">
      <h4 className="text-base font-medium text-ink">{packageType ? labels.editTitle : labels.createTitle}</h4>

      <div>
        <label htmlFor="package-type-name" className="block text-sm font-medium text-ink">
          {labels.name}
        </label>
        <Input
          id="package-type-name"
          maxLength={100}
          aria-invalid={Boolean(errors.name)}
          className="mt-2 w-full max-w-md"
          {...register('name')}
        />
        {errors.name ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <label htmlFor="package-type-hours" className="block text-sm font-medium text-ink">
            {labels.includedHours}
          </label>
          <Input
            id="package-type-hours"
            placeholder="10:00"
            aria-invalid={Boolean(errors.includedHours)}
            className="mt-2 w-32"
            {...register('includedHours')}
          />
          <p className="mt-1 text-xs text-mid-gray">{labels.includedHoursHint}</p>
          {errors.includedHours ? <p className="mt-1 text-xs text-ember">{labels.invalidDuration}</p> : null}
        </div>

        <div>
          <label htmlFor="package-type-price" className="block text-sm font-medium text-ink">
            {labels.price}
          </label>
          <Input
            id="package-type-price"
            placeholder="1400,00"
            aria-invalid={Boolean(errors.price)}
            className="mt-2 w-32"
            {...register('price')}
          />
          {errors.price ? <p className="mt-1 text-xs text-ember">{labels.invalidAmount}</p> : null}
        </div>

        <div>
          <label htmlFor="package-type-validity" className="block text-sm font-medium text-ink">
            {labels.validityMonths}
          </label>
          <Input
            id="package-type-validity"
            placeholder="12"
            aria-invalid={Boolean(errors.validityMonths)}
            className="mt-2 w-24"
            {...register('validityMonths')}
          />
          <p className="mt-1 text-xs text-mid-gray">{labels.validityMonthsHint}</p>
          {errors.validityMonths ? <p className="mt-1 text-xs text-ember">{labels.invalidValidity}</p> : null}
        </div>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-ink">{labels.aircraft}</legend>
        {aircraftOptions.length === 0 ? (
          <p className="mt-2 text-sm text-mid-gray">{labels.noAircraftAvailable}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-4">
            {aircraftOptions.map((aircraft) => (
              <label key={aircraft.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={aircraftIds.includes(aircraft.id)}
                  onChange={(event) => toggleAircraft(aircraft.id, event.target.checked)}
                />
                {aircraft.registration}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {formError ? (
        <p role="alert" data-testid="package-type-form-error" className="text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {packageType ? labels.submitSave : labels.submitCreate}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
        >
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
