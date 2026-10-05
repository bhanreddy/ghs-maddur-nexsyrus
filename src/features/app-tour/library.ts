import { canonicalRoute } from './state';
import type { TourDefinition, TourProgress } from './types';
export function routeCovered(guide: TourDefinition, path: string) {
  const route = canonicalRoute(path);
  return (guide.routes ?? guide.steps.map(s => s.route)).some(pattern => {
    const escaped = canonicalRoute(pattern).split('/').map(segment => segment.startsWith('[') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
    return new RegExp(`^${escaped}$`).test(route);
  });
}
const searchIndex = new WeakMap<TourDefinition, string>();
function searchableText(guide: TourDefinition) {
  let text = searchIndex.get(guide);
  if (!text) {
    text = [guide.id, guide.title.en, guide.title.te, guide.description.en, guide.description.te,
      ...guide.steps.flatMap(step => [step.title.en, step.title.te, step.body.en, step.body.te, ...step.narration.en, ...step.narration.te])].join(' ').normalize('NFKC').toLocaleLowerCase();
    searchIndex.set(guide, text);
  }
  return text;
}
export function searchGuides(guides: TourDefinition[], query: string, category: string, status: string, progress: Record<string, TourProgress | null>) {
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return guides.filter(guide => guide.kind === 'feature' && (!category || guide.category === category)
    && (!status || (progress[guide.id]?.status ?? 'unstarted') === status)
    && terms.every(term => searchableText(guide).includes(term)));
}
export function completedSteps(guide: TourDefinition, progress?: TourProgress | null) {
  if (guide.kind !== 'complete' && progress?.status === 'completed') return guide.steps.length;
  return guide.steps.filter(s => progress?.visited?.includes(s.id)).length;
}
