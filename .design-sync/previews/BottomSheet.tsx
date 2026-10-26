import { useState } from 'react';
import { BottomSheet, Badge } from 'airops';

// Phone row-detail sheet (mobile booking list): sub/title header + status badge, key/value rows, decision actions, close.
export const BookingDetail = () => {
  const [open, setOpen] = useState(true);
  return (
    // Explicit height: the card wrapper is the containing block of the fixed sheet.
    <div style={{ padding: 16, height: 660 }}>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Apri dettaglio</button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        testId="booking-sheet"
        sub="Prenotazione"
        title="I-AMKT · 28 ott, 09:30–11:00"
        badge={<Badge tone="warn" dot>In attesa</Badge>}
        rows={[
          { k: 'Pilota', v: 'Rossi Marco' },
          { k: 'Istruttore', v: 'Verdi Luca' },
          { k: 'Tipo volo', v: 'Scuola' },
          { k: 'Note', v: 'Navigazione LIPE–LIPQ' },
        ]}
        actions={
          <>
            <button type="button" className="btn primary">Approva</button>
            <button type="button" className="btn mini bad">Rifiuta</button>
          </>
        }
        closeLabel="Chiudi"
      />
    </div>
  );
};
