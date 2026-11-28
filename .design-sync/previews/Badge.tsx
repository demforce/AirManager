import { Badge } from 'airops';

// Booking status column (bookings-table.tsx STATUS_TONE): every status badge carries a dot.
export const BookingStatus = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    <Badge tone="warn" dot>In attesa</Badge>
    <Badge tone="ok" dot>Approvato</Badge>
    <Badge tone="bad" dot>Rifiutato</Badge>
    <Badge tone="info" dot>Effettuato</Badge>
    <Badge dot>Annullato</Badge>
  </div>
);

// Category labels without a dot (scadenze-console.tsx CATEGORY_TONE).
export const Categories = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    <Badge tone="info">Medico</Badge>
    <Badge>Licenza</Badge>
    <Badge tone="warn">Abilitazione</Badge>
  </div>
);
