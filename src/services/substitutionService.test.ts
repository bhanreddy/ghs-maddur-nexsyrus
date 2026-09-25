jest.mock('./apiClient', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

import { api } from './apiClient';
import { SubstitutionService } from './substitutionService';

const get = api.get as jest.Mock;

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ slots: [], summary: { total_slots: 0, covered_slots: 0, uncovered_slots: 0 } });
});

it('requests the affected board by default', async () => {
  await SubstitutionService.getBoard('2026-09-25');
  expect(get).toHaveBeenCalledWith('/substitutions/board', {
    date: '2026-09-25',
    scope: 'affected',
  });
});

it('requests every scheduled slot when the manual picker asks for scope all', async () => {
  await SubstitutionService.getBoard('2026-09-25', 'all');
  expect(get).toHaveBeenCalledWith('/substitutions/board', {
    date: '2026-09-25',
    scope: 'all',
  });
});
