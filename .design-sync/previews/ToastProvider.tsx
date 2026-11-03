import { useEffect } from 'react';
import { ToastProvider, useToast } from 'airops';

// Mount ToastProvider once near the root; call `useToast().show(msg, tone)` anywhere below it.
// Toasts live 2.6s; this demo re-fires them right after they expire.
function Demo() {
  const { show } = useToast();
  useEffect(() => {
    const fire = () => {
      show('Prenotazione approvata.', 'ok');
      show('Visita medica in scadenza tra 12 giorni.', 'warn');
      show('Impossibile salvare: aeromobile non disponibile.', 'bad');
      show('Esportazione avviata.', 'info');
    };
    fire();
    const id = setInterval(fire, 2650);
    return () => clearInterval(id);
  }, [show]);
  // Explicit height: the card wrapper is the containing block of the fixed toast host.
  return <div style={{ padding: 24, height: 360, color: 'var(--ink-3)' }}>Contenuto della pagina…</div>;
}

export const Tones = () => (
  <ToastProvider>
    <Demo />
  </ToastProvider>
);
