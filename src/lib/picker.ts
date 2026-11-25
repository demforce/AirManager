export const PICKER_LIMIT = 20;
export const PICKER_MIN_QUERY = 2;
export type OptionPage<T> = { items: T[]; truncated: boolean };
export function boundedOptions<T>(rows: T[], limit = PICKER_LIMIT): OptionPage<T> {
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

export function canSearchPicker(query: string) {
  return query.trim().length >= PICKER_MIN_QUERY;
}

/** The current choice stays keyboard-active even when the first page doesn't contain it. */
export function browsePicker<T extends { id: string }>(initial: T[], selected: T, limit: number) {
  const items = initial.slice(0, limit);
  if (selected.id && !items.some((item) => item.id === selected.id)) {
    items.splice(limit - 1);
    items.push(initial.find((item) => item.id === selected.id) ?? selected);
  }
  return { items, active: items.findIndex((item) => item.id === selected.id), truncated: initial.length > limit };
}
