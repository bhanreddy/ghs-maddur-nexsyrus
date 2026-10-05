import { availableTourDefinitions, portalForContextRoute, tourCatalog } from './catalog';
import { completedSteps, routeCovered, searchGuides } from './library';
import type { TourProgress } from './types';
const student = availableTourDefinitions('student', () => true);
test('complete walkthroughs contain every eligible feature in catalog order', () => {
  for (const portal of ['student', 'staff', 'admin', 'accounts', 'driver', 'gatekeeper', 'applicant'] as const) {
    const guides = availableTourDefinitions(portal, () => true);
    const full = guides.find(t => t.kind === 'complete')!;
    const features = guides.filter(t => t.kind === 'feature');
    expect([...new Set(full.steps.map(s => s.chapterId))]).toEqual(features.map(t => t.id));
    expect(full.steps.length).toBe(features.reduce((count, guide) => count + guide.steps.length, 0));
  }
});
test('permission and school feature filtering removes whole chapters without mutating release content', () => {
  const original = tourCatalog.find(t => t.id === 'student.complete')!;
  const guides = availableTourDefinitions('student', t => !t.steps.some(s => s.featureFlag === 'nav.fees'));
  const full = guides.find(t => t.kind === 'complete')!;
  expect(full.steps.some(s => s.chapterId === 'student.feature-fees')).toBe(false);
  expect(original.steps.some(s => s.chapterId === 'student.feature-fees')).toBe(true);
  expect(guides.some(t => t.id === 'student.fees')).toBe(false);
});
test('English and Telugu search combines words and category and progress filters', () => {
  expect(searchGuides(student, 'ఫీజులు', '', '', {}).some(t => t.id === 'student.feature-fees')).toBe(true);
  expect(searchGuides(student, 'fees receipts', 'finance', '', {}).map(t => t.id)).toContain('student.feature-fees');
  const progress: Record<string, TourProgress> = { 'student.feature-fees': { stepId: 'review', status: 'completed', skipped: [], updatedAt: 1 } };
  expect(searchGuides(student, '', 'finance', 'completed', progress).map(t => t.id)).toEqual(['student.feature-fees']);
  expect(searchGuides(student, 'unknown module', '', '', {})).toEqual([]);
});
test('detail routes lead to a guide for the parent module without guessing a record ID', () => {
  const guide = tourCatalog.find(t => t.id === 'admin.feature-admissions')!;
  expect(routeCovered(guide, '/admin/admissions/actual-application')).toBe(true);
  expect(routeCovered(guide, '/admin/admissions/actual-application/edit')).toBe(false);
  expect(guide.steps.every(s => !s.route.includes('['))).toBe(true);
  expect(routeCovered(tourCatalog.find(t => t.id === 'student.feature-fees')!, '/fees')).toBe(true);
});
test('jumping to the last chapter cannot count earlier unvisited explanations as completed', () => {
  const full = student.find(t => t.kind === 'complete')!;
  expect(completedSteps(full, { stepId: full.steps.at(-1)!.id, status: 'completed', skipped: [], visited: [full.steps.at(-1)!.id], updatedAt: 1 })).toBe(1);
});
test('shared routes retain the originating portal and direct portal switches change context', () => {
  expect(portalForContextRoute('/Screen/schoolDaily', ['teacher'], 'staff')).toBe('staff');
  expect(portalForContextRoute('/change-password', ['driver'], 'driver')).toBe('driver');
  expect(portalForContextRoute('/accounts/fines', ['admin'], 'admin', { portal: 'admin', route: '/accounts/fines' })).toBe('admin');
  expect(portalForContextRoute('/accounts/dashboard', ['admin'], 'admin')).toBe('accounts');
  expect(portalForContextRoute('/notifications', ['student'], 'admin')).toBe('student');
  expect(portalForContextRoute('/login', ['admin'], 'admin')).toBeNull();
});

test('search finds tools mentioned inside explanations in either language', () => {
  expect(searchGuides(student, 'payment reference', 'finance', '', {}).map(t => t.id)).toContain('student.feature-fees');
  expect(searchGuides(student, 'చెల్లింపు సూచన', 'finance', '', {}).map(t => t.id)).toContain('student.feature-fees');
});
