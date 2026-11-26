'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

type LayerState = { token: string; consumed?: true };
type ActiveLayer = { token: string; close: () => void; navigating?: boolean; transferring?: boolean };

const STATE_KEY = '__airManagerHistoryLayer';
let activeLayer: ActiveLayer | null = null;
let skipBaseOnBack = false;
let transferPending = false;
let listening = false;

function layerState(): LayerState | undefined {
  return window.history.state?.[STATE_KEY] as LayerState | undefined;
}

function writeLayer(layer: LayerState, replace: boolean): void {
  const state = { ...window.history.state, [STATE_KEY]: layer };
  if (replace) window.history.replaceState(state, '');
  else window.history.pushState(state, '');
}

function handlePopState(): void {
  const state = layerState();
  if (activeLayer && state?.token !== activeLayer.token) {
    const close = activeLayer.close;
    activeLayer = null;
    skipBaseOnBack = false;
    close();
    return;
  }
  // A completed action left a same-URL entry in place. Skip it when the
  // person next travels back, rather than restoring a pending Next refresh.
  if (state?.consumed) {
    skipBaseOnBack = false;
    window.history.back();
    return;
  }
  if (skipBaseOnBack) {
    skipBaseOnBack = false;
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
  skipBaseOnBack = false;
}

/** Reuse the current history entry when a sheet opens an editor panel. */
export function transferHistoryLayer(): void {
  if (activeLayer) activeLayer.transferring = true;
  transferPending = true;
  skipBaseOnBack = false;
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
    writeLayer({ token }, (previous !== undefined && (activeLayer !== null || previous.consumed === true || transferPending)) || skipBaseOnBack);
    activeLayer = { token, close: () => onCloseRef.current() };
    transferPending = false;
    skipBaseOnBack = false;
    return () => {
      if (activeLayer?.token !== token) return;
      const { navigating, transferring } = activeLayer;
      activeLayer = null;
      // Next's HistoryUpdater may drop custom state during router.refresh().
      // A matching URL and active token still identify our current entry.
      const current = layerState();
      if (navigating || transferring || window.location.href !== openedUrl || (current && current.token !== token)) return;
      writeLayer({ token, consumed: true }, true);
      skipBaseOnBack = true;
    };
  }, [open]);

  return useCallback(() => dismissHistoryLayer(() => onCloseRef.current()), []);
}
