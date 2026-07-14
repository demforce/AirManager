'use client';

/**
 * `.slideover` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/SlideOver.jsx#SlideOver`, typed. Closes
 * on Esc or scrim click.
 */
import { useEffect, type ReactNode } from 'react';

export type SlideOverProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
};

export function SlideOver({ title, subtitle, open, onClose, children, footer, closeLabel }: SlideOverProps) {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  return (
    <div className={`slideover ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="slideover-scrim" onClick={onClose} />
      <aside className="slideover-panel">
        <header className="so-head">
          <div>
            <div className="so-sub">{subtitle}</div>
            <div className="so-title">{title}</div>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
            ✕
          </button>
        </header>
        <div className="so-body">{children}</div>
        {footer && <footer className="so-foot">{footer}</footer>}
      </aside>
    </div>
  );
}
