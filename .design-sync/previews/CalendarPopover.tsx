import { useState } from 'react';
import { CalendarPopover } from 'airops';

// Controlled month grid. Normally opened by DateInput/DateTimeInput; here shown in flow
// (`style` overrides the `.cal-popover` absolute anchor). Fixed dates keep the render stable.
const TODAY = new Date(2026, 9, 26);

export const DateOnly = () => {
  const [cursor, setCursor] = useState(new Date(2026, 9, 1));
  const [selected, setSelected] = useState<Date | null>(new Date(2026, 9, 28));
  return (
    <div style={{ height: 370 }}>
      <CalendarPopover
        style={{ position: 'static', transform: 'none' }}
        cursor={cursor}
        onCursorChange={setCursor}
        selected={selected}
        today={TODAY}
        onPick={setSelected}
        onToday={() => setSelected(TODAY)}
        todayLabel="Oggi"
        prevMonthLabel="Mese precedente"
        nextMonthLabel="Mese successivo"
      />
    </div>
  );
};

export const DateAndTime = () => {
  const [cursor, setCursor] = useState(new Date(2026, 9, 1));
  const [selected, setSelected] = useState<Date | null>(new Date(2026, 9, 28));
  const [time, setTime] = useState('09:30');
  return (
    <div style={{ height: 440 }}>
      <CalendarPopover
        style={{ position: 'static', transform: 'none' }}
        cursor={cursor}
        onCursorChange={setCursor}
        selected={selected}
        today={TODAY}
        onPick={setSelected}
        onToday={() => setSelected(TODAY)}
        todayLabel="Oggi"
        prevMonthLabel="Mese precedente"
        nextMonthLabel="Mese successivo"
        time={{
          value: time,
          onChange: setTime,
          onConfirm: () => {},
          confirmDisabled: false,
          invalid: false,
          label: 'Ora',
          confirmLabel: 'Conferma',
          invalidLabel: 'Inserisci un orario valido (es. 09:30).',
        }}
      />
    </div>
  );
};
