import { DateTimeInput, Field } from 'airops';

// Date + time field (`datetime-local` value "YYYY-MM-DDTHH:MM"); the popover adds an HH:MM field + Conferma.
export const BookingSlot = () => (
  <div className="form-grid" style={{ maxWidth: 560 }}>
    <Field label="Inizio">
      <DateTimeInput defaultValue="2026-10-28T09:30" />
    </Field>
    <Field label="Fine">
      <DateTimeInput defaultValue="2026-10-28T11:00" />
    </Field>
  </div>
);

export const States = () => (
  <div className="form-grid" style={{ maxWidth: 560 }}>
    <Field label="Inizio">
      <DateTimeInput />
    </Field>
    <Field label="Fine" error="La fine deve essere successiva all'inizio.">
      <DateTimeInput aria-invalid defaultValue="2026-10-28T08:00" />
    </Field>
    <Field label="Disabilitato">
      <DateTimeInput disabled defaultValue="2026-10-28T09:30" />
    </Field>
  </div>
);
