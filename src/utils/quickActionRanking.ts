/**
 * Rank quick actions by today's school-wide click total.
 * Original navigation order is the deterministic tie-breaker, including the
 * initial state where no usage has been recorded yet.
 */
export function rankQuickActionsByUsage<T extends { route: string }>(
  actions: readonly T[],
  counts: Readonly<Record<string, number>>,
): T[] {
  return actions
    .map((action, originalIndex) => ({ action, originalIndex }))
    .sort((left, right) => {
      const leftCount = Math.max(0, Number(counts[left.action.route]) || 0);
      const rightCount = Math.max(0, Number(counts[right.action.route]) || 0);
      return rightCount - leftCount || left.originalIndex - right.originalIndex;
    })
    .map(({ action }) => action);
}
