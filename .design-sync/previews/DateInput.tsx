import { DateInput, Field } from 'airops';

// Custom date field (native `type="date"` + calendar button that opens CalendarPopover). Needs AirOpsRoot (i18n labels).
export const States = () => (
  <div className="form-grid" style={{ maxWidth: 560 }}>
    <Field label="Scadenza visita medica">
      <DateInput defaultValue="2027-03-14" />
    </Field>
    <Field label="Dal">
      <DateInput />
    </Field>
    <Field label="Data rilascio" error="Campo obbligatorio.">
      <DateInput aria-invalid />
    </Field>
    <Field label="Disabilitato">
      <DateInput disabled defaultValue="2026-10-28" />
    </Field>
  </div>
);

// `inline` drops the stretch (`.grow`) for toolbars, e.g. a date filter next to buttons.
export const InlineToolbar = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <DateInput inline defaultValue="2026-10-26" aria-label="Dal" />
    <span style={{ color: 'var(--ink-3)' }}>→</span>
    <DateInput inline defaultValue="2026-11-01" aria-label="Al" />
    <button type="button" className="btn">Applica</button>
  </div>
);
