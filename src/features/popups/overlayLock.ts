type OverlayName = 'festival' | 'popup' | 'force-update' | 'tour';

let holder: OverlayName | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function acquireOverlay(name: OverlayName): boolean {
  if (holder && holder !== name) return false;
  holder = name;
  notify();
  return true;
}

export function releaseOverlay(name: OverlayName): void {
  if (holder === name) {
    holder = null;
    notify();
  }
}

export function overlayHolder(): OverlayName | null {
  return holder;
}

export function subscribeOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
