import { InputGroup, Input } from 'airops';

// Unit chips glued to an Input: prefix, suffix, or both.
export const Units = () => (
  <div style={{ display: 'grid', gap: 10, maxWidth: 320 }}>
    <InputGroup prefix="€">
      <Input inputMode="decimal" defaultValue="145,00" />
    </InputGroup>
    <InputGroup prefix="€" suffix="/h">
      <Input inputMode="decimal" defaultValue="28,00" />
    </InputGroup>
    <InputGroup suffix="min">
      <Input inputMode="numeric" defaultValue="60" />
    </InputGroup>
    <InputGroup suffix="giorni">
      <Input inputMode="numeric" defaultValue="30" />
    </InputGroup>
  </div>
);
