'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';

export type MenuProps = {
  /** Accessible name of the trigger — the `<summary>`'s own text content. */
  label: string;
  children: ReactNode;
  className?: string;
  triggerTestId?: string;
};

/**
 * Overflow menu (story 12.4, AC 6 — DESIGN.md "nested" 10px radius): native
 * `<details>`/`<summary>` disclosure, zero dependency. Keyboard-accessible
 * for free (the `<summary>` is a native toggle button: Enter/Space opens
 * it, Tab reaches every item inside). `<details>` has neither
 * close-on-Escape nor close-on-outside-click natively — added here via one
 * listener pair attached only while open (same "listen only while
 * relevant" idiom as `SearchCombobox`'s own open-state effects).
 */
export function Menu({ label, children, className, triggerTestId }: MenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    function close(): void {
      if (details) details.open = false;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (details && !details.contains(event.target as Node)) close();
    }

    // Escape also returns focus to the trigger — same "closing an overlay
    // returns focus to what opened it" convention as `Dialog`/`Sheet`
    // (there, it is native `showModal()` behavior; here it is not, so it is
    // done explicitly).
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        close();
        summaryRef.current?.focus();
      }
    }

    function handleToggle(): void {
      if (details?.open) {
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
      } else {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      }
    }

    details.addEventListener('toggle', handleToggle);
    return () => {
      details.removeEventListener('toggle', handleToggle);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={cn('relative', className)}>
      <summary
        ref={summaryRef}
        data-testid={triggerTestId}
        className="flex min-h-[40px] cursor-pointer list-none items-center rounded-buttons border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas [&::-webkit-details-marker]:hidden"
      >
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 min-w-[190px] overflow-hidden rounded-nested border border-hairline bg-paper py-1 shadow-subtle">
        {children}
      </div>
    </details>
  );
}
