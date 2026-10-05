import type { TourTargetHandle } from './types';
const targets = new Map<string, TourTargetHandle>();
const conditions = new Map<string, boolean>();
const conditionListeners = new Set<() => void>();
const events = new Set<(event: string) => void>();
const blockers = new Set<string>();
const blockerListeners = new Set<() => void>();
export function registerTarget(target: TourTargetHandle) {
  const key = `${target.route}:${target.id}`;
  targets.set(key, target);
  return () => { if (targets.get(key) === target) targets.delete(key); };
}
export const findTarget = (route: string, id: string) => targets.get(`${route}:${id}`);
export const emitTourEvent = (event: string) => events.forEach(fn => fn(event));
export function subscribeTourEvents(fn: (event: string) => void) { events.add(fn); return () => { events.delete(fn); }; }
export function setTourCondition(key: string, available: boolean) {
  if (conditions.get(key) === available) return;
  conditions.set(key, available); conditionListeners.forEach(fn => fn());
}
export function subscribeTourConditions(fn: () => void) { conditionListeners.add(fn); return () => { conditionListeners.delete(fn); }; }
export const tourCondition = (key: string) => conditions.get(key);
export function setTourBlocked(key: string, blocked: boolean) {
  const changed = blocked ? !blockers.has(key) : blockers.has(key);
  if (blocked) blockers.add(key); else blockers.delete(key);
  if (changed) blockerListeners.forEach(fn => fn());
}
export const tourBlocked = () => blockers.size > 0;
export function subscribeTourBlockers(fn: () => void) { blockerListeners.add(fn); return () => { blockerListeners.delete(fn); }; }
