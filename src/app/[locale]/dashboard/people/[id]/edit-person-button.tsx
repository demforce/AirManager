'use client';

/**
 * "Modifica" trigger for the scheda persona (story 13.3, R-13.3-c): the
 * dossier page itself is a read-only VIEW — editing anagrafica/profili/
 * ratings/accesso/archivio all happens through the SAME `PilotEditor`
 * slide-over story 13.2 built for the Piloti table, mounted here as a client
 * component per R-13.3-c ("nessuna logica di editing duplicata"). `onMutated`
 * calls `router.refresh()` so the read-only dossier re-renders with the
 * server's fresh data after a save — same convention as `pilots-console.tsx`.
 * `onClose` ALSO refreshes, unconditionally: unlike `pilots-console.tsx`
 * (whose table never shows ratings inline), this dossier renders a
 * read-only "Scadenze" card, and the editor's Ratings/Visita medica
 * sub-editor (`LiveExpiryEditor`) manages its OWN state with no `onMutated`
 * callback of its own (13.2) — closing is the only reliable moment to
 * pick up a rating added/edited/removed during this session.
 */
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { PilotEditor, type PilotEditorLabels, type ToastLabels } from '../../pilots/pilot-editor';
import type { PilotRow } from '../../pilots/pilots-console';

type EditPersonButtonProps = {
  person: PilotRow;
  canManageUsers: boolean;
  locale: 'it' | 'en';
  editLabel: string;
  labels: PilotEditorLabels;
  toastLabels: ToastLabels;
};

export function EditPersonButton({ person, canManageUsers, locale, editLabel, labels, toastLabels }: EditPersonButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)} data-testid="person-edit-button">
        {editLabel}
      </button>
      <PilotEditor
        // Remount on open (same convention as `pilots-console.tsx`'s own
        // `PilotEditor` mount): `current`'s `useState` initializer inside
        // `PilotEditor` only reads `target.pilot` on MOUNT — without a `key`
        // that changes between "closed" and "open for this person", the ONE
        // long-lived instance here (this button never unmounts it) would
        // keep the `target: null`-time initial value forever.
        key={open ? `editor-${person.id}` : 'editor-closed'}
        target={open ? { mode: 'edit', pilot: person } : null}
        onClose={() => {
          setOpen(false);
          router.refresh();
        }}
        onMutated={() => router.refresh()}
        canManageUsers={canManageUsers}
        locale={locale}
        labels={labels}
        toastLabels={toastLabels}
      />
    </>
  );
}
