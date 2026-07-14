'use client';

/**
 * `.popover` export dropdown port (story 12.1, AC 3) — DOM/classes 1:1 of
 * `docs/design-reference/airops/src/ExportMenu.jsx`, but real: the
 * prototype's `exportCSV`/`exportPDF` only show a fake `showToast`; here the
 * PDF/XLS entries are plain `<a href>` downloads built by the caller from
 * `src/lib/export-href.ts` (same `target="_blank"` convention as the
 * existing `export-button.tsx`, so an error response never navigates the
 * dashboard tab away). An entry is omitted when its href isn't provided —
 * no dead links.
 */
import { useState } from 'react';
import { Icon } from './icons';

export type ExportMenuProps = {
  label: string;
  pdfLabel: string;
  pdfHref?: string;
  xlsLabel: string;
  xlsHref?: string;
};

export function ExportMenu({ label, pdfLabel, pdfHref, xlsLabel, xlsHref }: ExportMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn" onClick={() => setOpen((current) => !current)}>
        <Icon.doc /> {label} <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          <div className="popover-scrim" onClick={() => setOpen(false)} />
          <div className="popover" style={{ minWidth: 180, right: 0, left: 'auto' }}>
            <div className="pop-row" style={{ gap: 4 }}>
              {pdfHref && (
                <a
                  className="btn"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }}
                  href={pdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bad)', fontWeight: 600 }}>PDF</span>
                  {pdfLabel}
                </a>
              )}
              {xlsHref && (
                <a
                  className="btn"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }}
                  href={xlsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>XLS</span>
                  {xlsLabel}
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
