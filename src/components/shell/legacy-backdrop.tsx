'use client';

/**
 * Legacy shim opt-out (story 12.3, AC 1) — `dashboard/layout.tsx` used to
 * wrap EVERY page's `{children}` unconditionally in the pre-AirOps light
 * backdrop (`#FBFBFA`/`#2F3437`); this component makes that wrapper
 * conditional, pathname-aware via `usePathname` + a `route-registry.ts`
 * lookup (`findNavItemByPathname`, the exact same lookup `TopBar` already
 * uses for its breadcrumb). A route the registry marks `airopsNative: true`
 * (story 12.3 marks `bookings`) renders bare — its own markup is already in
 * the AirOps visual language, dark mode included. Every other route,
 * including one the registry does not know about at all (`findNavItemByPathname`
 * is exact-match only — a legacy page not yet in the registry, e.g. a
 * detail route like `/dashboard/people/[id]`, falls through to `null` and
 * gets the shim, same as before this story), keeps the legacy backdrop
 * unchanged.
 */
import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { findNavItemByPathname } from './route-registry';

export function LegacyBackdrop({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAirOpsNative = findNavItemByPathname(pathname)?.airopsNative ?? false;

  if (isAirOpsNative) {
    return <>{children}</>;
  }

  return <div style={{ background: '#FBFBFA', color: '#2F3437', minHeight: '100%' }}>{children}</div>;
}
