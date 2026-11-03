import { useState } from 'react';
import { Segmented } from 'airops';

// Schedule view toggle (bookings schedule: day / week).
export const ViewToggle = () => {
  const [view, setView] = useState<'day' | 'week'>('day');
  return (
    <Segmented
      ariaLabel="Vista"
      options={[
        { value: 'day', label: 'Giorno' },
        { value: 'week', label: 'Settimana' },
      ]}
      value={view}
      onChange={setView}
    />
  );
};

// Named pair inside a form row (new booking: "per me" / "per un allievo").
export const BookingTarget = () => {
  const [target, setTarget] = useState<'self' | 'student'>('student');
  return (
    <div className="fld" style={{ maxWidth: 360 }}>
      <div className="fld-label-group">
        <span className="fld-label">Prenota</span>
        <span className="fld-ctrl">
          <Segmented
            ariaLabel="Prenota"
            options={[
              { value: 'self', label: 'Per me' },
              { value: 'student', label: 'Per un allievo' },
            ]}
            value={target}
            onChange={setTarget}
          />
        </span>
      </div>
    </div>
  );
};

// Three-way filter.
export const Filter = () => {
  const [f, setF] = useState<'all' | 'pending' | 'approved'>('pending');
  return (
    <Segmented
      options={[
        { value: 'all', label: 'Tutte' },
        { value: 'pending', label: 'In attesa' },
        { value: 'approved', label: 'Approvate' },
      ]}
      value={f}
      onChange={setF}
    />
  );
};
