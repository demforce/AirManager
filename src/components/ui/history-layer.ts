'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

type LayerState = { token: string; base?: true; consumed?: true };
type ActiveLayer = { token: string; close: () => void; navigating?: boolean; transferring?: boolean };
type PendingSkip = { token: string; key?: string; url: string };

const STATE_KEY = '__airManagerHistoryLayer';
let activeLayer: ActiveLayer | null = null;
let pendingSkip: PendingSkip | null = null;
let transferPending = false;
let listening = false;
let lastPoppedBaseToken: string | null = null;
// Next may replace history.state during router.refresh(). The browser entry
// key survives that replacement, so it still identifies a consumed layer.
const consumedEntryKeys = new Map<string, string>();

function entryKey(): string | undefined {
  return (window as Window & { navigation?: { currentEntry?: { key: string } } }).navigation?.currentEntry?.key;
}

function layerState(): LayerState | undefined {
  return window.history.state?.[STATE_KEY] as LayerState | undefined;
}

function isPendingEntry(): boolean {
  if (!pendingSkip) return false;
  const key = entryKey();
  if (key && pendingSkip.key) return key === pendingSkip.key;
  return window.location.href === pendingSkip.url && layerState()?.base !== true;
}

function writeLayer(layer: LayerState, replace: boolean): void {
  const key = entryKey();
  if (key) consumedEntryKeys.delete(key);
  const state = { ...window.history.state, [STATE_KEY]: layer };
  if (replace) window.history.replaceState(state, '');
  else window.history.pushState(state, '');
}

function handlePopState(): void {
  const state = layerState();
  const consumedToken = state?.consumed ? state.token : state ? undefined : consumedEntryKeys.get(entryKey() ?? '') ?? (isPendingEntry() ? pendingSkip?.token : undefined);
  const fromBase = consumedToken !== undefined && lastPoppedBaseToken === consumedToken;
  lastPoppedBaseToken = state?.base ? state.token : null;
  if (activeLayer && (state?.token !== activeLayer.token || state.base)) {
    const close = activeLayer.close;
    if (pendingSkip?.token === activeLayer.token) pendingSkip = null;
    activeLayer = null;
    close();
    return;
  }
  // A completed action left a same-URL entry in place. Back crosses it toward
  // its base; Forward from that base crosses it toward the next destination.
  if (consumedToken !== undefined) {
    if (pendingSkip?.token === consumedToken) pendingSkip = null;
    window.history.go(fromBase ? 1 : -1);
    return;
  }
  // Direct Back from a completed action lands on its own base entry. A Back
  // from another page first visits the consumed entry above and clears this
  // pending skip, so it stops at the base instead.
  if (state?.base && pendingSkip?.token === state.token) {
    pendingSkip = null;
    window.history.back();
  }
}

function ensureListener(): void {
  if (listening) return;
  window.addEventListener('popstate', handlePopState);
  listening = true;
}

/** Call before a Link/router.replace that leaves an open layer. */
export function prepareHistoryNavigation(): void {
  if (activeLayer) activeLayer.navigating = true;
  const key = entryKey();
  if (key) consumedEntryKeys.delete(key);
  if (isPendingEntry()) pendingSkip = null;
}

/** A filter Apply/Reset that cannot change the URL is a UI dismissal. */
export function dismissHistoryLayerIfSameSearch(query: Record<string, string>, onClose: () => void): boolean {
  const search = new URLSearchParams(query).toString();
  if (window.location.search !== (search ? `?${search}` : '')) return false;
  // A reset must override the panel's regular cancel handler, which restores
  // an unfinished person search. Keep that override through the async popstate.
  if (activeLayer) activeLayer.close = onClose;
  dismissHistoryLayer(onClose);
  return true;
}

/** Reuse the current history entry when a sheet opens an editor panel. */
export function transferHistoryLayer(): void {
  if (activeLayer) activeLayer.transferring = true;
  transferPending = true;
  if (isPendingEntry()) pendingSkip = null;
}

/** UI dismissal (✕, scrim, Escape, Chiudi) shares the browser Back path. */
export function dismissHistoryLayer(fallback: () => void): void {
  if (activeLayer && layerState()?.token === activeLayer.token) {
    window.history.back();
  } else {
    fallback();
  }
}

export function useHistoryLayer(open: boolean, onClose: () => void): () => void {
  const tokenRef = useRef<string>(crypto.randomUUID());
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // The entry must be consumed in the same commit that hides the layer.
  // A passive cleanup can run after the panel is visually closed, letting
  // an immediate Back land on its stale same-URL entry under load.
  useLayoutEffect(() => {
    if (!open) return;
    ensureListener();
    const token = tokenRef.current;
    const openedUrl = window.location.href;
    // Replacing another active layer also handles sheet-owner eviction. A
    // fresh open pushes once; neither operation changes the visible URL.
    const previous = layerState();
    // A Next refresh can replace history.state without our marker. The
    // consumed entry still occupies this same URL, so the next layer reuses it.
    const reusePending = isPendingEntry();
    const replace = (previous !== undefined && (activeLayer !== null || previous.consumed === true || transferPending)) || reusePending;
    if (!replace) writeLayer({ token, base: true }, true);
    writeLayer({ token }, replace);
    activeLayer = { token, close: () => onCloseRef.current() };
    transferPending = false;
    if (reusePending) pendingSkip = null;
    return () => {
      if (activeLayer?.token !== token) return;
      const { navigating, transferring } = activeLayer;
      activeLayer = null;
      // Next's HistoryUpdater may drop custom state during router.refresh().
      // A matching URL and active token still identify our current entry.
      const current = layerState();
      if (navigating || transferring || window.location.href !== openedUrl || (current && current.token !== token)) return;
      writeLayer({ token, consumed: true }, true);
      const key = entryKey();
      if (key) consumedEntryKeys.set(key, token);
      pendingSkip = { token, key, url: openedUrl };
    };
  }, [open]);

  return useCallback(() => dismissHistoryLayer(() => onCloseRef.current()), []);
}
