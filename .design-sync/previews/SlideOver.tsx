import { useState } from 'react';
import { SlideOver, Field, Select, Input, DateTimeInput } from 'airops';

// Right-side editor panel (every create/edit form in the app). Footer: spacer + Annulla + primary.
export const BookingEditor = () => {
  const [open, setOpen] = useState(true);
  return (
    // Explicit height: the card wrapper is the containing block of the fixed panel.
    <div style={{ padding: 24, height: 660 }}>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>Nuova prenotazione</button>
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Nuova prenotazione"
        subtitle="Prenotazioni"
        closeLabel="Chiudi"
        footer={
          <>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn" onClick={() => setOpen(false)}>Annulla</button>
            <button type="button" className="btn primary">Crea prenotazione</button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Persona" wide>
            <Select defaultValue="rossi">
              <option value="rossi">Rossi Marco</option>
            </Select>
          </Field>
          <Field label="Aeromobile">
            <Select defaultValue="I-AMKT">
              <option value="I-AMKT">I-AMKT</option>
            </Select>
          </Field>
          <Field label="Istruttore (opzionale)">
            <Select defaultValue="">
              <option value="">Nessun istruttore</option>
            </Select>
          </Field>
          <Field label="Inizio">
            <DateTimeInput defaultValue="2026-10-28T09:30" />
          </Field>
          <Field label="Fine">
            <DateTimeInput defaultValue="2026-10-28T11:00" />
          </Field>
          <Field label="Note" wide>
            <Input placeholder="Es. navigazione LIPE–LIPQ" />
          </Field>
        </div>
      </SlideOver>
    </div>
  );
};
