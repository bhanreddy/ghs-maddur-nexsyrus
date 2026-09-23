import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
/** A focus-owned, non-overlapping loop also polls before departure. */
export function useTransportPolling(load: () => Promise<unknown>, intervalMs: number, key?: string) {
  const latest = useRef(load);
  latest.current = load;
  useFocusEffect(useCallback(() => {
    let stopped = false,
      running = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped || running || AppState.currentState === 'background') return;
      if (timer) clearTimeout(timer);
      running = true;
      try {
        await latest.current();
      } catch {/* Screen owns the visible error state. */} finally {
        running = false;
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    };
    void tick();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void tick();else if (timer) clearTimeout(timer);
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [intervalMs, key]));
}
