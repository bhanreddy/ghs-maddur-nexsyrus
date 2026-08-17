import { rankQuickActionsByUsage } from './quickActionRanking';

const actions = [
  { route: '/admin/academics', title: 'Academics' },
  { route: '/admin/timetable', title: 'Timetable' },
  { route: '/admin/reports', title: 'Reports' },
];

describe('rankQuickActionsByUsage', () => {
  it('moves the school-wide most-used action to the first position', () => {
    expect(rankQuickActionsByUsage(actions, {
      '/admin/academics': 3,
      '/admin/timetable': 10,
      '/admin/reports': 5,
    }).map((action) => action.route)).toEqual([
      '/admin/timetable',
      '/admin/reports',
      '/admin/academics',
    ]);
  });

  it('preserves canonical navigation order for ties and missing totals', () => {
    expect(rankQuickActionsByUsage(actions, {
      '/admin/academics': 4,
      '/admin/timetable': 4,
    })).toEqual(actions);
  });

  it('does not mutate the canonical action list', () => {
    const original = [...actions];
    rankQuickActionsByUsage(actions, { '/admin/reports': 12 });
    expect(actions).toEqual(original);
  });
});
