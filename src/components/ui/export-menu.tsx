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
 *
 * Story 15.8a (ratifica R-15.8a-h, the epic's TD R-15.2-c): at <=640px the
 * SAME menu opens as a bottom sheet instead of a popover. Measured pre-fix
 * at 375px, on the Contabilità AND on the Prenotazioni, the popover sat at
 * `x = -29.09` — 29px OFF SCREEN to the left (`.popover{right:0}` under a
 * trigger that starts at x=47) — and its Italian entries wrapped to 53.69px
 * tall on the Contabilità.
 *
 * The container is ONE node that changes shape in CSS, not two trees: five
 * page-level e2e assertions (`cash-report`, `exports`, `pdf-exports` x2,
 * `movements`) read exactly one "Esporta" button and one link per voice, and
 * a phone twin would double them at 1280px too (AD-4). So the chassis is
 * `MobileSheet` — which brings the scrim, Escape, focus-in/focus-return,
 * `role="dialog"` and the one-sheet-at-a-time rule every other sheet of the
 * epic has, and is where story 15.10's focus trap will land ONCE — while the
 * `.popover`/`.popover-scrim` classes it carries keep the desktop popover
 * exactly as it was (measured invariant on all nine consumers at
 * 641/800/1280). `airops.css`'s own `.export-menu-*` block does the rest.
 */
import { useCallback, useState } from 'react';
import { Icon } from './icons';
import { MobileSheet } from './mobile-sheet';

export type ExportMenuProps = {
  label: string;
  pdfLabel: string;
  pdfHref?: string;
  xlsLabel: string;
  xlsHref?: string;
};

export function ExportMenu({ label, pdfLabel, pdfHref, xlsLabel, xlsHref }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  /** Referentially stable by contract — `MobileSheet` gates its focus effect on it. */
  const close = useCallback(() => setOpen(false), []);

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn" onClick={() => setOpen((current) => !current)} data-testid="export-menu-trigger">
        <Icon.doc /> {label} <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.6 }}>▾</span>
      </button>
      <MobileSheet
        open={open}
        onClose={close}
        label={label}
        testId="export-menu-sheet"
        className="export-menu-sheet"
        scrimClassName="popover-scrim"
        panelClassName="popover export-menu-panel"
      >
        <div className="pop-row" style={{ gap: 4 }}>
          {pdfHref && (
            <a
              className="btn"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }}
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              data-testid="export-menu-pdf"
            >
              {/* Story 15.8a: `.stat-tone-bad` instead of the raw token — measured 3.96:1
                  as 11px text on `--panel` in the light theme (the XLS twin 2.73:1), on a
                  surface this story turns into a phone sheet. Same medicine, same class,
                  dark theme back on its own token. */}
              <span className="mono stat-tone-bad" style={{ fontSize: 11, fontWeight: 600 }}>PDF</span>
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
              onClick={close}
              data-testid="export-menu-xls"
            >
              <span className="mono stat-tone-ok" style={{ fontSize: 11, fontWeight: 600 }}>XLS</span>
              {xlsLabel}
            </a>
          )}
        </div>
      </MobileSheet>
    </div>
  );
}
