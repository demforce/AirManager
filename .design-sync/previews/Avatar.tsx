import { Avatar } from 'airops';

// The five avatar colors (initials chip used in person rows and the top bar user chip).
export const Colors = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <Avatar init="MR" />
    <Avatar init="GB" color="amber" />
    <Avatar init="LV" color="green" />
    <Avatar init="AF" color="red" />
    <Avatar init="SC" color="violet" />
  </div>
);

// Person row: avatar next to name + role, as in the pilots / instructors registries.
export const PersonRow = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {[
      { init: 'MR', color: '' as const, name: 'Rossi Marco', role: 'Pilota · PPL(A)' },
      { init: 'LV', color: 'green' as const, name: 'Verdi Luca', role: 'Istruttore · FI(A)' },
      { init: 'GB', color: 'amber' as const, name: 'Bianchi Giulia', role: 'Allieva · corso PPL' },
    ].map((p) => (
      <div key={p.init} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar init={p.init} color={p.color} />
        <div>
          <div style={{ fontWeight: 500 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.role}</div>
        </div>
      </div>
    ))}
  </div>
);
