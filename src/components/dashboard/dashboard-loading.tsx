import { getTranslations } from 'next-intl/server';

export default async function DashboardLoading() {
  const t = await getTranslations('shell');
  return (
    <main className="dashboard-loading" data-testid="dashboard-loading" aria-busy="true" aria-label={t('loading')}>
      <span className="sr-only">{t('loading')}</span>
      <div className="dashboard-loading-title dashboard-loading-shape" />
      <div className="dashboard-loading-subtitle dashboard-loading-shape" />
      <div className="dashboard-loading-grid">
        <div className="dashboard-loading-panel">
          <div className="dashboard-loading-heading dashboard-loading-shape" />
          <div className="dashboard-loading-row dashboard-loading-shape" />
          <div className="dashboard-loading-row dashboard-loading-shape" />
          <div className="dashboard-loading-row dashboard-loading-shape" />
        </div>
        <div className="dashboard-loading-panel">
          <div className="dashboard-loading-heading dashboard-loading-shape" />
          <div className="dashboard-loading-row dashboard-loading-shape" />
          <div className="dashboard-loading-row dashboard-loading-shape" />
          <div className="dashboard-loading-row dashboard-loading-shape" />
        </div>
      </div>
    </main>
  );
}
