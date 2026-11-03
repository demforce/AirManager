# design-sync notes — AirOps (AirManager)

## How this repo is synced

- AirOps has NO library build: it lives inside the Next app (`src/components/ui/*.tsx` + `src/styles/airops.css`). `buildCmd` (`node .design-sync/build-pkg.mjs`) stages a throwaway package at `.ds-sync/airops-pkg/` (tsc declarations of the UI modules, a barrel re-exporting the REAL `.tsx` sources, a copy of `airops.css` as `styles.css` - `cssEntry` must live inside the package dir). Run it from the repo root BEFORE every converter/driver run (after re-staging `.ds-sync/`).
- Converter invocation: `--node-modules ./node_modules` (the repo's), entry comes from `cfg.entry`. No `--entry` flag needed.
- `AirOpsRoot` (`.design-sync/airops-root.tsx`, bundled via `extraEntries`, also `cfg.provider`) is sync glue mirroring `src/app/[locale]/layout.tsx`: stamps `<html data-theme>` (airops.css defines every color token ONLY under `html[data-theme=...]`) and mounts `NextIntlClientProvider` with the `ui` namespace of `messages/{it,en}.json` (named JSON import: only `ui.datePicker` is used by the primitives).
- Fonts: `@fontsource` CSS (Inter Tight 400/500/600, JetBrains Mono 400/500/600, Instrument Serif 400 - the same set `layout.tsx` imports) via `extraFonts`.
- Groups come from category-only stubs in `.design-sync/docs/<Name>.md` (`docsDir`): an empty doc body keeps the synthesized `.prompt.md` (props + preview examples) while setting the group. A NEW UI primitive needs a stub there, or it lands in `misc`.
- `componentSrcMap` pins the components whose file name doesn't match (field.tsx hosts Input/Select/InputGroup, kpi.tsx hosts Spark/KPI, icons.tsx, toast.tsx, datetime-input.tsx).
- Fork `.design-sync/overrides/dts.mjs`: only change vs bundled `lib/dts.mjs` is `isComponentName` exempting `KPI` (ALL-CAPS names are otherwise dropped as constants). Needs the gitignored symlink `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` on every fresh clone. On re-sync, diff it against the bundled `lib/dts.mjs` and re-apply the one-line change on top of upstream.
- Converter deps in `.ds-sync/`: `npm i esbuild ts-morph @types/react playwright@1.61.1` - playwright pinned to the repo's `@playwright/test` version (chromium build 1228 is the one cached in `~/.cache/ms-playwright`). Never `playwright install` (project rule).

## Preview authoring gotchas

- Overlay previews (`SlideOver`, `MobileSheet`, `BottomSheet`, `ToastProvider`): the card wrapper (`.ds-single`, transformed) is the containing block of `position:fixed` descendants, so the preview root needs an explicit `height` or the fixed panel/sheet/toast host collapses to the in-flow content height and gets cropped.
- `MobileSheet`/`BottomSheet` render only at <=640px (`.mobile-sheet{display:none}` above it): their cards declare a 390px viewport (`cfg.overrides`).
- `ToastProvider` demo re-fires toasts every 2650ms (toast lifetime 2600ms) so the capture sees the stack.
- `CalendarPopover` preview uses fixed dates (Oct 2026) - never `new Date()` in a preview (non-deterministic render hash).
- `.kpi-row` is 2 columns under 900px viewport: the column-mode card shows the tablet layout. That is the app's own breakpoint, not a bug.
- `ExportMenu` can only be captured closed (open state is internal).

## Known render warns

- `[RENDER_THIN] Spark`: svg-only component, no text by design - benign.

## Re-sync risks

- `build-pkg.mjs` copies `airops.css` and declares every `.tsx` under `src/components/ui` public: a new `.tsx` there becomes a component automatically (needs a preview + a category stub); a new `.ts` helper stays internal.
- `airops-root.tsx` duplicates two facts from the app: the timezone (`Europe/Rome`, `APP_TIMEZONE` in `src/lib/time.ts`) and the `data-theme` contract of `layout.tsx`. If either changes in the app, update the glue.
- Previews hard-code realistic Italian copy and class names (`.form-grid`, `.kpi-row`, `.card-head`, `.btn.mini.bad`, `.fld-label-group`): renames in `airops.css` break them silently - rebuild + recapture shows it.
- `.design-sync/conventions.md` names AirOps classes/tokens validated against the 2026-10-26 build; re-validate after any `airops.css` refactor.
- `next-intl` is bundled (inlined npm package); a major bump may change `NextIntlClientProvider` props.

## Re-sync recipe (from the repo root)

1. Re-stage the converter: `cp -r <design-sync skill dir>/{package-build,package-validate,package-capture,resync}.mjs <skill>/lib <skill>/storybook .ds-sync/`, then `(cd .ds-sync && npm i esbuild ts-morph @types/react playwright@1.61.1)` if `.ds-sync/node_modules` is gone, and `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules`.
2. `node .design-sync/build-pkg.mjs` (buildCmd).
3. Fetch the anchor: DesignSync `get_file _ds_sync.json` from the pinned project -> `.design-sync/.cache/remote-sync.json`.
4. `node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json`
5. Grade `verification.pendingGrade` from `ds-bundle/_screenshots/review/`, re-validate `conventions.md` names, upload per the verdict's `upload` block (atomic path: project is pinned).
