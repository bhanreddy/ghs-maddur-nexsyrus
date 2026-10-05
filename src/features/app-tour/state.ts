import type { TourState } from './types';
export const initialTourState: TourState = { tourId: null, index: 0, phase: 'idle', generation: 0, rect: null, host: 'root', skipped: [], visited: [] };
export type TourAction =
  | { type: 'start'; tourId: string; index: number; skipped?: string[]; visited?: string[] }
  | { type: 'move'; index: number; skipId?: string; resolvedId?: string }
  | { type: 'ready'; generation: number; rect: TourState['rect']; host: string; action: boolean }
  | { type: 'missing'; generation: number; reason: TourState['reason'] }
  | { type: 'pause' | 'retry' | 'complete' | 'exit' };
export function tourReducer(state: TourState, action: TourAction): TourState {
  if ('generation' in action && action.generation !== state.generation) return state;
  switch (action.type) {
    case 'start': return { ...initialTourState, tourId: action.tourId, index: action.index, skipped: action.skipped ?? [], visited: action.visited ?? [], phase: 'navigating', generation: state.generation + 1 };
    case 'move': return { ...state, index: action.index, phase: 'navigating', rect: null, host: 'root', reason: undefined, generation: state.generation + 1, visited: action.resolvedId ? [...new Set([...state.visited, action.resolvedId])] : state.visited, skipped: action.skipId ? [...new Set([...state.skipped, action.skipId])] : state.skipped.filter(id => id !== action.resolvedId) };
    case 'ready': return { ...state, rect: action.rect, host: action.host, phase: action.action ? 'action' : 'presenting', reason: undefined };
    case 'missing': return { ...state, rect: null, phase: 'missing', reason: action.reason };
    case 'pause': return { ...state, phase: 'paused', rect: null, reason: 'interrupted', generation: state.generation + 1 };
    case 'retry': return { ...state, phase: 'navigating', rect: null, reason: undefined, generation: state.generation + 1 };
    case 'complete': return { ...state, phase: 'completed', rect: null, generation: state.generation + 1 };
    case 'exit': return { ...initialTourState, generation: state.generation + 1 };
  }
}
export function canonicalRoute(route: string): string { return route.replace('/(tabs)', '').replace(/\/$/, '') || '/'; }
