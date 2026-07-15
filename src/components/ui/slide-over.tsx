'use client';

/**
 * `.slideover` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/SlideOver.jsx#SlideOver`, typed. Closes
 * on Esc or scrim click.
 */
import { useEffect, type ReactNode } from 'react';

// Story 12.1 review finding F3, fixed here (story 12.3, its first real
// consumer): the Esc listener is mounted unconditionally for the component's
// whole lifetime, regardless of `open` — without the early-return below, an
// Esc press with the panel CLOSED still calls `onClose`, which a caller
// wired to also reset other state (e.g. clearing a "which row is this
// slide-over editing" id) would run on every stray Esc anywhere on the page.

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
      if (!open) return;
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

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
