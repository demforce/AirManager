import { Icon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';

type ErrorCardProps = {
  /** Shown above the title in the mono kicker (the 404 page); the error page has none. */
  code?: string;
  title: string;
  text: string;
  homeLabel: string;
  /** The error page's «Riprova» (`reset`); absent on the 404 page. */
  retry?: { label: string; onClick: () => void };
};

/**
 * Story 19.12b (AD-4, PO Q-19.12-d) — the one card the localized `not-found`
 * and `error` files render: the login page's own frame (`--bg`, brand mark,
 * `.card`), so a wrong address or a failed render stays inside AirOps instead
 * of Next's English default. The link goes to the Panoramica, which sends an
 * anonymous visitor on to the login page.
 */
export function ErrorCard({ code, title, text, homeLabel, retry }: ErrorCardProps) {
  return (
    <main
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        background: 'var(--bg)',
        color: 'var(--ink)',
      }}
      data-testid="error-page"
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28 }}>
          <div className="brand-mark">
            <Icon.logo />
          </div>
          <div className="brand-name" style={{ fontSize: 15 }}>
            AirManager
          </div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div className="page-title-block" style={{ marginBottom: 20 }}>
            {code ? <div className="so-sub mono">{code}</div> : null}
            <h1>{title}</h1>
            <div className="sub">{text}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {retry ? (
              <button type="button" className="btn primary" onClick={retry.onClick} data-testid="error-page-retry">
                {retry.label}
              </button>
            ) : null}
            <Link href="/dashboard" className={retry ? 'btn' : 'btn primary'} data-testid="error-page-home">
              {homeLabel}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
