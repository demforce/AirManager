import { useState } from 'react';
import { MobileSheet, Segmented } from 'airops';

// Phone-only bottom sheet (`.mobile-sheet` renders only at <=640px): scrim + grabber + focus-trapped panel.
export const FiltersSheet = () => {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<'all' | 'pending' | 'approved'>('pending');
  return (
    // Explicit height: the card wrapper is the containing block of the fixed sheet.
    <div style={{ padding: 16, height: 580 }}>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Filtri</button>
      <MobileSheet open={open} onClose={() => setOpen(false)} label="Filtri" testId="filters-sheet">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 4px 8px' }}>
          <div className="fld-label">Stato</div>
          <Segmented
            ariaLabel="Stato"
            options={[
              { value: 'all', label: 'Tutte' },
              { value: 'pending', label: 'In attesa' },
              { value: 'approved', label: 'Approvate' },
            ]}
            value={status}
            onChange={setStatus}
          />
          <button type="button" className="btn primary" onClick={() => setOpen(false)}>Applica filtri</button>
        </div>
      </MobileSheet>
    </div>
  );
};
