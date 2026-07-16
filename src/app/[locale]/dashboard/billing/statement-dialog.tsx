'use client';

/**
 * "Estratti conto" mini-dialog (story 12.9, AC 5 — D9) — a `.mini-modal`
 * (same class as the logbook cancel panel / cash-register storno dialog),
 * NOT a `SlideOver`: a pilot typed picker + a mandatory period, resolving to
 * a plain `<a href>` download of `GET /api/v1/people/{id}/account/pdf?from&to`
 * (same convention as `ExportMenu`'s own PDF entries — no fetch/blob
 * handling needed). Both bounds mandatory here even though the endpoint's
 * own `from`/`to` are independently optional (AC 5) — the dialog always
 * sends a real period; the endpoint's "absent = full history" default stays
 * reachable only from the drill-down page's own PDF button.
 */
import { useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';

type PersonOption = { id: string; firstName: string; lastName: string };

export type StatementDialogLabels = {
  title: string;
  subtitle: string;
  pilot: string;
  dateFrom: string;
  dateTo: string;
  submit: string;
  cancel: string;
  requiredField: string;
  picker: { placeholder: string; noResults: string };
};

type StatementDialogProps = {
  open: boolean;
  onClose: () => void;
  personOptions: PersonOption[];
  locale: 'it' | 'en';
  labels: StatementDialogLabels;
};

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

async function searchPeople(query: string): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50', profile: 'pilot-or-student' });
  const response = await fetch(`/api/v1/people?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; firstName: string; lastName: string }[] };
  return body.items.map((person) => ({ id: person.id, label: personLabel(person) }));
}

export function StatementDialog({ open, onClose, personOptions, locale, labels }: StatementDialogProps) {
  const [personId, setPersonId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showError, setShowError] = useState(false);

  if (!open) return null;

  const personComboOptions: SearchComboboxOption[] = personOptions.map((person) => ({ id: person.id, label: personLabel(person) }));
  const canSubmit = personId.trim() !== '' && dateFrom !== '' && dateTo !== '';
  const href = canSubmit ? `/api/v1/people/${personId}/account/pdf?from=${dateFrom}&to=${dateTo}&locale=${locale}` : undefined;

  function handleClose(): void {
    setPersonId('');
    setDateFrom('');
    setDateTo('');
    setShowError(false);
    onClose();
  }

  return (
    <div className="mini-modal">
      <div className="mini-modal-card" data-testid="statement-dialog">
        <div className="so-title" style={{ fontSize: 16 }}>
          {labels.title}
        </div>
        <div className="so-sub">{labels.subtitle}</div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SearchCombobox
            id="statement-person"
            label={labels.pilot}
            value={personId}
            onChange={setPersonId}
            fetchOptions={searchPeople}
            initialOptions={personComboOptions}
            placeholder={labels.picker.placeholder}
            emptyText={labels.picker.noResults}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label={labels.dateFrom}>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} data-testid="statement-date-from" />
            </Field>
            <Field label={labels.dateTo}>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} data-testid="statement-date-to" />
            </Field>
          </div>
          {showError ? (
            <p style={{ color: 'var(--bad)', fontSize: 12 }}>{labels.requiredField}</p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn" onClick={handleClose}>
            {labels.cancel}
          </button>
          {href ? (
            <a className="btn primary" href={href} target="_blank" rel="noopener noreferrer" data-testid="statement-submit" onClick={handleClose}>
              {labels.submit}
            </a>
          ) : (
            <button type="button" className="btn primary" onClick={() => setShowError(true)} data-testid="statement-submit">
              {labels.submit}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
