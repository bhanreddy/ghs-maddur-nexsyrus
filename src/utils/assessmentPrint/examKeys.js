/** Resolve FA/SA source names without importing any server dependencies. */
export function canonicalFinalSourceKey(examType, examName) {
  const type = String(examType || '').toLowerCase();
  const name = String(examName || '').trim().toUpperCase();
  const numeric = [...name.matchAll(/(?:^|\D)([1-4])(?=\D|$)/g)].at(-1)?.[1];
  const roman = /\bIV\b/.test(name) ? 4 : /\bIII\b/.test(name) ? 3
    : /\bII\b/.test(name) ? 2 : /\bI\b/.test(name) ? 1 : null;
  const index = numeric ? Number(numeric) : roman;
  if (type === 'fa_results' && index >= 1 && index <= 4) return `fa${index}`;
  if (type === 'sa_results' && index >= 1 && index <= 2) return `sa${index}`;
  return null;
}
