import { KPI } from 'airops';

// Panoramica KPI row (dashboard/page.tsx): five KPIs inside `.kpi-row`.
export const OverviewRow = () => (
  <div className="kpi-row">
    <KPI label="Voli oggi" value={12} />
    <KPI label="Flotta disponibile" value={4} unit="/ 6" />
    <KPI label="PPR in attesa" value={3} />
    <KPI label="Prenotazioni in attesa" value={5} />
    <KPI label="Ricavi del mese" value="€ 18.420,00" />
  </div>
);

// Trend variants: delta text + sparkline colored by trend.
export const WithTrend = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
    <KPI label="Ore volate (mese)" value="142,5" unit="h" delta="+12% vs agosto" trend="up" sparkData={[18, 22, 19, 25, 24, 28, 31, 30, 34, 37]} />
    <KPI label="Ore istruzione" value="38" unit="h" delta="−6% vs agosto" trend="down" sparkData={[12, 11, 13, 10, 9, 10, 8, 9, 7, 8]} />
    <KPI label="Movimenti" value={264} delta="stabile" sparkData={[24, 26, 25, 27, 25, 26, 24, 26, 25, 26]} />
  </div>
);
