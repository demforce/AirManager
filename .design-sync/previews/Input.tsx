import { Input } from 'airops';

// `.input` text field states. In forms, wrap it in `Field` for the label.
export const States = () => (
  <div style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
    <Input placeholder="Cerca pilota o marca…" />
    <Input defaultValue="I-AMKT" />
    <Input type="email" aria-invalid defaultValue="marco.rossi@" />
    <Input disabled defaultValue="Campo non modificabile" />
  </div>
);
