import { Field, Input, Select, InputGroup } from 'airops';

// "Nuova prenotazione" form (new-booking-form.tsx): Fields inside `.form-grid` (2 columns, `wide` spans both).
export const BookingForm = () => (
  <div className="form-grid">
    <Field label="Persona" wide>
      <Select defaultValue="rossi">
        <option value="">Seleziona…</option>
        <option value="rossi">Rossi Marco</option>
        <option value="bianchi">Bianchi Giulia</option>
      </Select>
    </Field>
    <Field label="Aeromobile">
      <Select defaultValue="I-AMKT">
        <option value="I-AMKT">I-AMKT</option>
        <option value="I-BRAV">I-BRAV</option>
      </Select>
    </Field>
    <Field label="Istruttore (opzionale)">
      <Select defaultValue="">
        <option value="">Nessun istruttore</option>
        <option value="verdi">Verdi Luca</option>
      </Select>
    </Field>
    <Field label="Note" wide>
      <Input placeholder="Es. navigazione LIPE–LIPQ" />
    </Field>
  </div>
);

// Validation + hint states (error wins over hint; aria-invalid paints the red border).
export const States = () => (
  <div className="form-grid">
    <Field label="Email" error="Campo obbligatorio.">
      <Input type="email" aria-invalid defaultValue="" />
    </Field>
    <Field label="Tipo volo" hint="Forzato a Scuola: la persona selezionata è un allievo.">
      <Select disabled defaultValue="SCHOOL">
        <option value="SCHOOL">Scuola</option>
      </Select>
    </Field>
    <Field label="Codice ICAO">
      <Input defaultValue="LIPE" />
    </Field>
    <Field label="Disabilitato">
      <Input disabled defaultValue="Non modificabile" />
    </Field>
  </div>
);

// Prefix/suffix units (transaction-editor.tsx, instructor-editor.tsx, scheduling-card.tsx).
export const WithUnits = () => (
  <div className="form-grid">
    <Field label="Importo">
      <InputGroup prefix="€">
        <Input inputMode="decimal" defaultValue="145,00" />
      </InputGroup>
    </Field>
    <Field label="Tariffa payout">
      <InputGroup prefix="€" suffix="/h">
        <Input inputMode="decimal" defaultValue="28,00" />
      </InputGroup>
    </Field>
    <Field label="Preavviso minimo">
      <InputGroup suffix="min">
        <Input inputMode="numeric" defaultValue="60" />
      </InputGroup>
    </Field>
  </div>
);
