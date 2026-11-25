import { describe, expect, it } from 'vitest';
import { browsePicker, canSearchPicker } from './picker';

describe('picker', () => {
  it('requires two non-padding characters', () => {
    expect(canSearchPicker(' I ')).toBe(false);
    expect(canSearchPicker(' I- ')).toBe(true);
  });

  it('retains an off-page selection and its active index', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i), label: String(i) }));
    const selected = { id: 'selected', label: 'I-TEST' };
    const result = browsePicker(rows, selected, 20);
    expect(result.items).toHaveLength(20);
    expect(result.items[result.active]).toEqual(selected);
    expect(result.truncated).toBe(true);
    expect(browsePicker(rows.slice(0, 20), rows[0]!, 20).truncated).toBe(false);
  });
});
