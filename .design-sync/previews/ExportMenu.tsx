import { ExportMenu } from 'airops';

// Export trigger in a list toolbar (bookings / scadenze): opens a PDF/XLS menu (a bottom sheet on phones).
export const InToolbar = () => (
  <div className="card" style={{ maxWidth: 640 }}>
    <div className="card-head">
      <div className="card-title">Prenotazioni</div>
      <div className="spacer" />
      <ExportMenu label="Esporta" pdfLabel="Scarica PDF" pdfHref="#" xlsLabel="Scarica Excel" xlsHref="#" />
      <button type="button" className="btn primary">Nuova prenotazione</button>
    </div>
  </div>
);
