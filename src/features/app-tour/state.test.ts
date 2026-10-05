import { portalAllowed, portalForRoute } from './catalog';
import { canonicalRoute, initialTourState, tourReducer } from './state';
const start = () => tourReducer(initialTourState, { type: 'start', tourId: 'student.welcome', index: 0 });
test('ignores target readiness from a cancelled route or exited guide', () => {
  const state = start();
  const moved = tourReducer(state, { type: 'move', index: 1 });
  const stale = { type: 'ready' as const, generation: state.generation, rect: { x: 0, y: 20, width: 100, height: 40 }, host: 'root', action: false };
  expect(tourReducer(moved, stale)).toBe(moved);
  const exited = tourReducer(moved, { type: 'exit' });
  expect(tourReducer(exited, stale)).toBe(exited);
});
test('pause cancels callbacks while retaining the current step', () => {
  const state = start(); const paused = tourReducer(state, { type: 'pause' });
  expect(paused.index).toBe(0); expect(paused.tourId).toBe('student.welcome');
  expect(tourReducer(paused, { type: 'missing', generation: state.generation, reason: 'target' })).toBe(paused);
});
test('tracks skipped steps and resolves them when replayed successfully', () => {
  const skipped = tourReducer(start(), { type: 'move', index: 1, skipId: 'start' });
  expect(skipped.skipped).toEqual(['start']);
  const resolved = tourReducer(skipped, { type: 'move', index: 1, resolvedId: 'start' });
  expect(resolved.skipped).toEqual([]);
});
test('normalizes grouped and index routes without changing real screen paths', () => {
  expect(canonicalRoute('/(tabs)/fees')).toBe('/fees'); expect(canonicalRoute('/admin/admissions/')).toBe('/admin/admissions');
});

test('portal eligibility respects roles without inferring access from route text', () => {
  expect(portalAllowed('accounts', ['teacher'])).toBe(false);
  expect(portalAllowed('accounts', ['accountant'])).toBe(true);
  expect(portalAllowed('staff', ['principal'])).toBe(true);
  expect(portalAllowed('student', ['parent'])).toBe(true);
  expect(portalForRoute('/welcome')).toBeNull();
  expect(portalForRoute('/admission/dashboard')).toBe('applicant');
});

test('chapter jumps preserve real visited steps and never resolve skipped steps implicitly', () => {
  const first = tourReducer(start(), { type: 'move', index: 1, resolvedId: 'start' });
  const skipped = tourReducer(first, { type: 'move', index: 2, skipId: 'navigation' });
  const jumped = tourReducer(skipped, { type: 'move', index: 8 });
  expect(jumped.visited).toEqual(['start']); expect(jumped.skipped).toEqual(['navigation']);
  const resumed = tourReducer(initialTourState, { type: 'start', tourId: 'student.complete', index: 8, visited: jumped.visited, skipped: jumped.skipped });
  expect(resumed.visited).toEqual(['start']); expect(resumed.skipped).toEqual(['navigation']);
});
