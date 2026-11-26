'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLinkStatus } from 'next/link';

/** Rendered inside a Link: local pointer feedback precedes Next's pending transition. */
export function NavPendingIndicator({ className, label, routeKey }: { className: string; label: string; routeKey: string }) {
  const { pending } = useLinkStatus();
  const [press, setPress] = useState({ route: routeKey, active: false });
  const marker = useRef<HTMLSpanElement>(null);
  // Reset before painting a destination, including a fast A→B→A round trip.
  if (press.route !== routeKey) setPress({ route: routeKey, active: false });

  useEffect(() => {
    const link = marker.current?.closest('a');
    if (!link) return;
    let reset: ReturnType<typeof setTimeout> | null = null;
    let pointerId: number | null = null;
    const clear = () => {
      if (reset) clearTimeout(reset);
      reset = null;
      pointerId = null;
      setPress((current) => ({ ...current, active: false }));
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download') || link.href === window.location.href) return;
      // Only this small indicator commits before Link's click handler begins.
      flushSync(() => setPress({ route: routeKey, active: true }));
      pointerId = event.pointerId;
      if (reset) clearTimeout(reset);
      reset = setTimeout(clear, 1000); // no pointerup/cancel arrived
    };
    const onUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      if (reset) clearTimeout(reset);
      // LinkStatus takes over on a real navigation; a canceled click clears
      // shortly after release, including when release happened off the Link.
      reset = setTimeout(clear, 200);
    };
    link.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', clear);
    link.addEventListener('dragstart', clear);
    link.addEventListener('blur', clear);
    return () => {
      link.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', clear);
      link.removeEventListener('dragstart', clear);
      link.removeEventListener('blur', clear);
      if (reset) clearTimeout(reset);
    };
  }, [routeKey]);

  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => setPress((current) => ({ ...current, active: false })));
    return () => cancelAnimationFrame(frame);
  }, [pending]);

  const visible = pending || (press.route === routeKey && press.active);
  return (
    <span ref={marker} className={className} data-pending={visible ? 'true' : undefined} aria-live="polite">
      {visible && <span className="sr-only">{label}</span>}
    </span>
  );
}
