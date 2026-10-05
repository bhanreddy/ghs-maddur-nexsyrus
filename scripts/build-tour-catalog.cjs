#!/usr/bin/env node
/* global __dirname */
/* Release content compiler. Runtime targets are explicit IDs from the reviewed bindings,
 * never text searches, DOM positions or coordinates inferred from screenshots. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const content = path.join(root, 'src/features/app-tour/content');
const source = JSON.parse(fs.readFileSync(path.join(content, 'features.json'), 'utf8'));
const sentences = text => text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
const extended = source.features.map(feature => {
  const module = source.modules[feature.module];
  if (!module || !feature.targets) throw Error(`Missing authored content or binding: ${feature.id}`);
  const title = feature.title ?? module.title;
  const steps = module.sections.map((body, index) => {
    const section = module.sectionTitles?.[index] ?? (index === 0 ? title : index === module.sections.length - 1 ? { en: 'Review before taking action', te: 'చర్య ముందు తనిఖీ చేయండి' } : { en: 'Explore the tools and workflow', te: 'సాధనాలు మరియు ప్రక్రియను తెలుసుకోండి' });
    const selected = feature.stepTargets?.[index];
    return {
      id: index === 0 ? 'overview' : index === module.sections.length - 1 ? 'review' : `tools-${index}`,
      route: feature.route, target: selected?.target ?? (index === 0 ? feature.targets.overview : feature.targets.workspace),
      title: section, body,
      narration: { en: sentences(body.en), te: sentences(body.te) },
      ...Object.fromEntries(['permission', 'feature', 'featureFlag', 'portalSetting'].filter(key => feature[key]).map(key => [key, feature[key]])),
      ...(selected?.event ? { event: selected.event } : { readOnly: true }),
      chapterId: feature.id,
    };
  });
  return { id: feature.id, version: feature.version ?? source.contentVersion, narrationVersion: feature.narrationVersion ?? feature.version ?? source.contentVersion, portal: feature.portal, kind: 'feature', category: module.category, title,
    description: { en: `${title.en}: ${module.sections.length} guided explanations on your actual screen.`, te: `${title.te}: మీ నిజమైన తెరపై ${module.sections.length} వివరణ దశలు.` }, routes: feature.routes, steps };
});
const portals = ['student', 'staff', 'admin', 'accounts', 'driver', 'gatekeeper', 'applicant'];
const complete = portals.map(portal => ({
  id: `${portal}.complete`, version: source.contentVersion, narrationVersion: source.contentVersion, portal, kind: 'complete',
  title: { en: 'Complete portal walkthrough', te: 'పూర్తి పోర్టల్ మార్గదర్శనం' },
  description: { en: 'Explore every feature available to your profile. Choose a chapter, save your place and continue at your own pace.', te: 'మీ ప్రొఫైల్‌కు అందుబాటులో ఉన్న ప్రతి ఫీచర్‌ను తెలుసుకోండి. అధ్యాయాన్ని ఎంచుకుని, పురోగతి సేవ్ చేసి, మీ వేగంతో కొనసాగించండి.' },
  steps: extended.filter(tour => tour.portal === portal).flatMap(tour => tour.steps.map(step => ({ ...step, id: `${tour.id.split('.feature-')[1]}-${step.id}`, audioSource: { tourId: tour.id, version: tour.version, stepId: step.id, narrationVersion: tour.narrationVersion } }))),
}));
const output = JSON.stringify([...extended, ...complete], null, 2) + '\n';
const file = path.join(content, 'extended-catalog.json');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output) throw Error('Extended tour catalog is stale. Run npm run tour:catalog.');
} else fs.writeFileSync(file, output);
const categoryFile = path.join(content, 'categories.json');
const categories = JSON.stringify(source.categories, null, 2) + '\n';
if (process.argv.includes('--check')) { if (!fs.existsSync(categoryFile) || fs.readFileSync(categoryFile, 'utf8') !== categories) throw Error('Tour categories are stale'); } else fs.writeFileSync(categoryFile, categories);
console.log(`Compiled ${extended.length} feature guides and ${complete.length} complete walkthroughs, ${extended.reduce((n,t)=>n+t.steps.length,0)} feature explanations.`);
