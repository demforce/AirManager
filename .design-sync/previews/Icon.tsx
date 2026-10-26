import { Icon } from 'airops';

// Every glyph of the `Icon.*` namespace (16px stroke set; svg inherits currentColor).
export const AllIcons = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
    {Object.entries(Icon).map(([name, Glyph]) => (
      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
        <Glyph style={{ width: 18, height: 18 }} />
        <span className="mono" style={{ fontSize: 11 }}>{name}</span>
      </div>
    ))}
  </div>
);

// In buttons: `.btn` sizes a child svg to 14px, `.iconbtn` to 15px.
export const InButtons = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <button type="button" className="btn"><Icon.plus /> Nuova prenotazione</button>
    <button type="button" className="btn"><Icon.filter /> Filtri</button>
    <button type="button" className="iconbtn" aria-label="Notifiche"><Icon.bell /></button>
    <button type="button" className="iconbtn" aria-label="Tema scuro"><Icon.moon /></button>
  </div>
);
