/**
 * `.toggle` — the AirOps on/off switch (story 19.5, AD-4): one large button
 * instead of a pair of radios or a checkbox (PO point 10, «un bottonone
 * on/off»). Generic on purpose — the flight form's «Volo solista» is the
 * first consumer, story 19.6's «senza addebito» the next — so nothing here
 * is named after a domain.
 *
 * WAI-ARIA APG «switch»: a native `<button role="switch">` (Tab reaches it,
 * Space and Enter toggle it) whose state is `aria-checked`. The accessible
 * name is `label`, through `aria-labelledby`, so it never changes with the
 * state; the visible `onText`/`offText` says the state to sighted users and
 * stays out of the name (`aria-labelledby` replaces the content in the name
 * computation). Like `SearchCombobox`, this component owns the label/control
 * pairing so every call site gets it for free.
 */
export type ToggleProps = {
  /** Button id; also its `data-testid` and the base of the label id (`${id}-label`) — same contract as `SearchCombobox`'s `id`. */
  id: string;
  /** Visible field label AND the switch's accessible name (via `aria-labelledby`): stable across states. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible state text inside the button. */
  onText: string;
  offText: string;
};

export function Toggle({ id, label, checked, onChange, onText, offText }: ToggleProps) {
  const labelId = `${id}-label`;
  return (
    <div className="fld">
      <span id={labelId} className="fld-label">
        {label}
      </span>
      {/* `type="button"`: the switch lives inside forms (the flight editor's),
          where a bare `<button>` is a submit — a click or an Enter would post
          the form instead of toggling. */}
      <button
        type="button"
        role="switch"
        id={id}
        data-testid={id}
        aria-checked={checked}
        aria-labelledby={labelId}
        className="toggle"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        <span className="toggle-state">{checked ? onText : offText}</span>
      </button>
    </div>
  );
}
