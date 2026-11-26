'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import type { BillingLiveSnapshot } from '@/lib/billing-live';
import type { BillingFilters } from './billing-console';

type BillingLiveContextValue = {
  snapshot: BillingLiveSnapshot;
  reconcile: () => Promise<void>;
  cancelPending: () => void;
};

const BillingLiveContext = createContext<BillingLiveContextValue | null>(null);

function queryFor(filters: BillingFilters, page: number, pageSize: number): URLSearchParams {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.dateFrom) query.set('from', filters.dateFrom);
  if (filters.dateTo) query.set('to', filters.dateTo);
  if (filters.bookType) query.set('bookType', filters.bookType);
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.personQuery) query.set('personQuery', filters.personQuery);
  if (filters.unattributed) query.set('unattributed', 'true');
  return query;
}

export function BillingLiveProvider({ initial, filters, children }: { initial: BillingLiveSnapshot; filters: BillingFilters; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const lastInitial = useRef(initial);
  const toast = useToast();
  const t = useTranslations('BillingPage');

  const cancelPending = useCallback(() => {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  useEffect(() => {
    const onLinkClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (target.hasAttribute('download') || (target.target !== '' && target.target !== '_self')) return;
      if (target.href !== window.location.href) cancelPending();
    };
    document.addEventListener('click', onLinkClick, true);
    window.addEventListener('popstate', cancelPending);
    return () => {
      document.removeEventListener('click', onLinkClick, true);
      window.removeEventListener('popstate', cancelPending);
      cancelPending();
    };
  }, [cancelPending]);

  const reconcile = useCallback(async () => {
    cancelPending();
    const sequence = requestSequence.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const query = queryFor(filters, snapshot.transactions.page, snapshot.transactions.pageSize);
    try {
      const response = await fetch(`/api/v1/billing-view?${query.toString()}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Billing reconciliation failed: HTTP ${response.status}`);
      const next = (await response.json()) as BillingLiveSnapshot;
      if (sequence !== requestSequence.current) return;
      // BillingPage also clamps the displayed page without rewriting ?page.
      setSnapshot(next);
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      throw error;
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [cancelPending, filters, snapshot.transactions.page, snapshot.transactions.pageSize]);

  // A same-URL refresh from another control can deliver new server props while
  // this client provider survives. Read the canonical view again rather than
  // copying an RSC payload that may have completed before a local mutation.
  useEffect(() => {
    if (lastInitial.current === initial) return;
    lastInitial.current = initial;
    void reconcile().catch(() => toast.show(t('refreshError'), 'warn'));
  }, [initial, reconcile, t, toast]);

  return <BillingLiveContext.Provider value={{ snapshot, reconcile, cancelPending }}>{children}</BillingLiveContext.Provider>;
}

export function useBillingLive(): BillingLiveContextValue {
  const context = useContext(BillingLiveContext);
  if (!context) throw new Error('Billing live view is missing its provider.');
  return context;
}

export function BillingPageSub({ period }: { period: string }) {
  const t = useTranslations('BillingPage');
  const { snapshot } = useBillingLive();
  return <div className="sub">{t('sub', { count: snapshot.transactions.total, period })}</div>;
}
