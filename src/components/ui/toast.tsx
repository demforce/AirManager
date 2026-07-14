'use client';

/**
 * `.toast-host`/`.toast` port (story 12.1, AC 3) — behavior port of
 * `docs/design-reference/airops/src/primitives.jsx#ToastHost`, converted
 * from the prototype's `window` CustomEvent bus to a React context provider
 * (`useToast().show(msg, tone)`), per the story's binding decision ("NIENTE
 * eventi window"). Mounted once in the dashboard layout.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastTone = 'ok' | 'bad' | 'warn' | 'info';

type ToastItem = {
  id: string;
  msg: string;
  tone: ToastTone;
};

type ToastContextValue = {
  show: (msg: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_LIFETIME_MS = 2600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, tone: ToastTone = 'ok') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((list) => [...list, { id, msg, tone }]);
    setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), TOAST_LIFETIME_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-host">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.tone === 'ok' ? '' : item.tone}`}>
            <span className="toast-dot" />
            {item.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }
  return context;
}
