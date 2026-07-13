/**
 * Table row-action icon set (TD-6, AC 2) — zero-dependency inline SVG,
 * canonical stroke style already established by `date-picker.tsx`'s
 * `CalendarGlyph` and `search-trigger.tsx`'s `SearchIcon` (DESIGN.md
 * "Imagery": thin-stroke 1.5-2px geometric marks, functional not
 * decorative): `viewBox 0 0 24 24`, `stroke="currentColor"`,
 * `strokeWidth="1.75"`, round caps/joins, `aria-hidden` (the button that
 * wraps each icon carries the accessible name via `aria-label`/`title`).
 * Names are functional (what the action DOES), reused across every table
 * that needs the same verb — no per-table duplicates.
 */

const SIZE = 16;

type IconSvgProps = { children: React.ReactNode };

function IconSvg({ children }: IconSvgProps) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Dettaglio (voli). */
export function EyeIcon() {
  return (
    <IconSvg>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </IconSvg>
  );
}

/** Modifica / Rinomina (voli, persone, velivoli, utenti, categorie, pacchetti e tipi, scadenze-panel). */
export function PencilIcon() {
  return (
    <IconSvg>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </IconSvg>
  );
}

/** Annulla / Cancella (voli, prenotazioni, PPR register). */
export function CircleXIcon() {
  return (
    <IconSvg>
      <circle cx="12" cy="12" r="9" />
      <path d="m9.5 9.5 5 5" />
      <path d="m14.5 9.5-5 5" />
    </IconSvg>
  );
}

/** Elimina (scadenze-panel, categorie, pacchetti e tipi). */
export function TrashIcon() {
  return (
    <IconSvg>
      <path d="M4 7h16" />
      <path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </IconSvg>
  );
}

/** Archivia (persone, velivoli). */
export function ArchiveIcon() {
  return (
    <IconSvg>
      <rect x="3" y="4" width="18" height="4.5" rx="1.5" />
      <path d="M4.5 8.5v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9" />
      <path d="M10 13h4" />
    </IconSvg>
  );
}

/** Ripristina (persone, velivoli — archive counterpart). */
export function RestoreIcon() {
  return (
    <IconSvg>
      <path d="M3 8a9 9 0 1 1 2.2 6.3" />
      <path d="M3 3v5h5" />
    </IconSvg>
  );
}

/** Profili (persone). */
export function ProfileIcon() {
  return (
    <IconSvg>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <circle cx="12" cy="10" r="2.25" />
      <path d="M8 17c.7-1.8 2.1-2.7 4-2.7s3.3.9 4 2.7" />
    </IconSvg>
  );
}

/** Attiva/Disattiva, Riattiva, Fuori servizio/Rientro in servizio (velivoli, utenti, categorie, pacchetti e tipi — one glyph, the tooltip carries the verb). */
export function ToggleIcon() {
  return (
    <IconSvg>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <circle cx="8" cy="12" r="3" />
    </IconSvg>
  );
}

/** Reinvia invito (utenti). */
export function MailIcon() {
  return (
    <IconSvg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </IconSvg>
  );
}

/** Rettifica contaore (velivoli). */
export function GaugeIcon() {
  return (
    <IconSvg>
      <path d="M3.5 15.5a8.5 8.5 0 1 1 17 0" />
      <path d="M12 15.5 16 9" />
      <circle cx="12" cy="15.5" r="1" />
    </IconSvg>
  );
}

/** Tariffe (velivoli). */
export function TagEuroIcon() {
  return (
    <IconSvg>
      <path d="M20 12.5 12.5 20 4 11.5V4h7.5L20 12.5Z" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </IconSvg>
  );
}

/** Sposta (prenotazioni). */
export function MoveIcon() {
  return (
    <IconSvg>
      <path d="M3 8h13" />
      <path d="m13 4 4 4-4 4" />
      <path d="M21 16H8" />
      <path d="m11 20-4-4 4-4" />
    </IconSvg>
  );
}

/** Completa (PPR register). */
export function CheckIcon() {
  return (
    <IconSvg>
      <path d="M4 12.5 9.5 18 20 6.5" />
    </IconSvg>
  );
}

/** Proponi aggiornamento (my-expiries). */
export function SendIcon() {
  return (
    <IconSvg>
      <path d="M21 3 3 10.5l7.5 3L14 21l7-18Z" />
      <path d="M10.5 13.5 21 3" />
    </IconSvg>
  );
}
