// TS's ambient `Intl.NumberFormatOptions['useGrouping']` type only widens
// past plain `boolean` when this registry has entries (ES2023 forward-compat
// declaration-merging pattern) — our lib config doesn't populate it, so
// money.ts's `useGrouping: 'always'` needs this opt-in instead of `as any`.
// Global ambient file (no import/export), so no `declare global` needed.
declare namespace Intl {
  interface NumberFormatOptionsUseGroupingRegistry {
    always: never;
  }
}
