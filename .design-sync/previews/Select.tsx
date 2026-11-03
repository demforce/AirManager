import { Select } from 'airops';

// Native `<select>` styled as `.input`; same states as Input.
export const States = () => (
  <div style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
    <Select defaultValue="">
      <option value="">Seleziona aeromobile…</option>
      <option value="I-AMKT">I-AMKT · Tecnam P92</option>
      <option value="I-BRAV">I-BRAV · Cessna 172</option>
    </Select>
    <Select defaultValue="I-BRAV">
      <option value="I-AMKT">I-AMKT · Tecnam P92</option>
      <option value="I-BRAV">I-BRAV · Cessna 172</option>
    </Select>
    <Select aria-invalid defaultValue="">
      <option value="">Seleziona istruttore…</option>
    </Select>
    <Select disabled defaultValue="SCHOOL">
      <option value="SCHOOL">Scuola</option>
    </Select>
  </div>
);
