# AirOps — how to build with this design system

AirOps is the UI of AirManager, an Italian airfield / flight-school manager (pilots, fleet, bookings, PPR, expiries, billing). Default copy language: **Italian**.

## Setup (required)

- Wrap the whole tree in **`<AirOpsRoot theme="light" locale="it">`** (`theme`: `light` | `dark`; `locale`: `it` | `en`). It stamps `<html data-theme>`: every color and shadow token is defined ONLY under `html[data-theme="light"|"dark"]`, so without it surfaces, text and borders render unstyled. It also provides the i18n context: `DateInput`, `DateTimeInput` and `CalendarPopover` throw outside it.
- Using toasts: mount `<ToastProvider>` once inside `AirOpsRoot`, then `useToast().show(msg, tone)` (`ok` | `warn` | `bad` | `info`).
- Components come from `window.AirOps` (`const { Field, Input, Badge } = window.AirOps`); `Icon` is a namespace: `<Icon.plane />`, `<Icon.calendar />`...

## Styling idiom: AirOps CSS classes + `var(--token)`

No Tailwind or utility classes. Layout glue uses the stylesheet's own classes; one-off tweaks use inline `style` with tokens.

| Need | Classes |
|---|---|
| Page shell | `.page` > `.page-head` (> `.page-title-block` with `h1` + `.sub`, then actions) |
| Surface | `.card` > `.card-head` (`.card-title`, `.card-sub`, `.spacer`) + `.card-body` (`.tight` = no padding) |
| Buttons | `.btn`; `.btn.primary` (ink fill: the one main CTA), `.btn.accent`, `.btn.on` (pressed), `.btn.mini` (+ `.ok` / `.bad`, row actions), `.btn.big`; icon-only `.iconbtn` |
| Forms | `.form-grid` (2 columns) of `Field`s; `<Field wide>` spans both |
| KPI strip | `.kpi-row` of `KPI` |
| Tabular lists | `.students` > `.student-row.header` + `.student-row`, columns via inline `gridTemplateColumns`; `.student-name`, `.student-sub` (the app has no `<table>`) |
| Simple lists | `.list` > `.list-item` (`.list-icon` + `.amber`/`.red`/`.green`, `.list-title`, `.list-sub`) |
| Messages | `.alert-box` + `.ok` / `.bad` / `.info`; colored text `.stat-tone-ok` / `-bad` / `-warn` / `-info` |
| Type | `.mono` (JetBrains Mono, tabular: registrations, times, codes), `.num`, `.sr-only` |

Tokens: surfaces `--bg`, `--bg-sunken`, `--panel`, `--panel-2`; lines `--border`, `--border-strong`; text `--ink` > `--ink-2` > `--ink-3` > `--ink-4`; brand `--accent` (runway amber), `--accent-ink`, `--accent-soft`; status `--ok`, `--warn`, `--bad`, `--info`, each with `-soft`; `--shadow-sm`, `--shadow-md`; `--radius-xs|sm|md|lg`; fonts `--font-ui` (Inter Tight), `--font-mono`, `--font-display` (Instrument Serif).

Responsive by viewport: breakpoints 1200 / 900 / 640px. At <=640px the phone layout applies: `MobileSheet` and `BottomSheet` render ONLY there, and `SlideOver` goes full-screen.

## Choosing components

- Status: `<Badge tone dot>`, with warn = pending, ok = approved/valid, bad = denied/expired, info = flown/informational, `""` = neutral/cancelled.
- Create/edit flows: `SlideOver` with `footer` = `<div style={{flex:1}}/>` + `.btn` "Annulla" + `.btn.primary`.
- Dates: `DateInput` (value `YYYY-MM-DD`) and `DateTimeInput` (`YYYY-MM-DDTHH:MM`) inside `Field`, never a raw date input. Amounts/units: `InputGroup prefix="€"` / `suffix="min"`. Small exclusive choices: `Segmented`.
- Phone row detail: `BottomSheet`; other phone sheets: `MobileSheet`.

## Where the truth lives

Read `styles.css` and the `_ds_bundle.css` it imports (the complete AirOps stylesheet) before writing any class; check each component's `<Name>.prompt.md` and `<Name>.d.ts`.

## Example

```jsx
const { AirOpsRoot, KPI, Badge, Field, Input, InputGroup } = window.AirOps;

<AirOpsRoot theme="light" locale="it">
  <div className="page">
    <div className="page-head">
      <div className="page-title-block"><h1>Panoramica</h1><div className="sub">26 ottobre 2026</div></div>
      <button type="button" className="btn primary">Nuova prenotazione</button>
    </div>
    <div className="kpi-row">
      <KPI label="Voli oggi" value={12} />
      <KPI label="Flotta disponibile" value={4} unit="/ 6" />
    </div>
    <div className="card">
      <div className="card-head"><div className="card-title">Prenotazioni</div><div className="spacer" /><Badge tone="warn" dot>In attesa</Badge></div>
      <div className="card-body form-grid">
        <Field label="Note" wide><Input placeholder="Es. navigazione LIPE–LIPQ" /></Field>
        <Field label="Importo"><InputGroup prefix="€"><Input defaultValue="145,00" /></InputGroup></Field>
      </div>
    </div>
  </div>
</AirOpsRoot>
```
