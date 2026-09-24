import {
  buildPeriodDisplayMap,
  getSlotDisplayInfo,
  isNonTeachingPeriod,
  PeriodInfo,
} from './substitutionPeriodNumbering';

describe('substitutionPeriodNumbering', () => {
  describe('isNonTeachingPeriod', () => {
    it('identifies breaks using explicit is_break boolean', () => {
      expect(isNonTeachingPeriod({ is_break: true })).toBe(true);
      expect(isNonTeachingPeriod({ is_break: false })).toBe(false);
      expect(isNonTeachingPeriod({ is_break: null })).toBe(false);
      expect(isNonTeachingPeriod({})).toBe(false);
    });

    it('identifies breaks using explicit slot_type', () => {
      expect(isNonTeachingPeriod({ slot_type: 'break' })).toBe(true);
      expect(isNonTeachingPeriod({ slot_type: 'non_teaching' })).toBe(true);
      expect(isNonTeachingPeriod({ slot_type: 'recess' })).toBe(true);
      expect(isNonTeachingPeriod({ slot_type: 'lunch' })).toBe(true);
      expect(isNonTeachingPeriod({ slot_type: 'teaching' })).toBe(false);
    });
  });

  describe('buildPeriodDisplayMap and continuous numbering', () => {
    it('correctly handles break between teaching periods without skipping numbers', () => {
      const periods: PeriodInfo[] = [
        { sort_order: 1, name: 'Period 1', is_break: false, start_time: '08:00', end_time: '08:45' },
        { sort_order: 2, name: 'Period 2', is_break: false, start_time: '08:45', end_time: '09:30' },
        { sort_order: 3, name: 'Morning Break', is_break: true, start_time: '09:30', end_time: '09:45' },
        { sort_order: 4, name: 'Period 3 (Old Name)', is_break: false, start_time: '09:45', end_time: '10:30' },
        { sort_order: 5, name: 'Lunch', is_break: true, start_time: '10:30', end_time: '11:15' },
        { sort_order: 6, name: 'Period 4 (Old Name)', is_break: false, start_time: '11:15', end_time: '12:00' },
      ];

      const map = buildPeriodDisplayMap(periods);

      // Period 1
      expect(map.get(1)).toEqual({
        teachingPeriodNumber: 1,
        displayLabel: 'Period 1',
        shortLabel: 'P1',
        isBreak: false,
        name: 'Period 1',
      });

      // Period 2
      expect(map.get(2)).toEqual({
        teachingPeriodNumber: 2,
        displayLabel: 'Period 2',
        shortLabel: 'P2',
        isBreak: false,
        name: 'Period 2',
      });

      // Morning Break (does not increment)
      expect(map.get(3)).toEqual({
        teachingPeriodNumber: null,
        displayLabel: 'Morning Break',
        shortLabel: 'Morning Break',
        isBreak: true,
        name: 'Morning Break',
      });

      // Period after Break becomes continuous Period 3! (Not Period 4)
      expect(map.get(4)).toEqual({
        teachingPeriodNumber: 3,
        displayLabel: 'Period 3',
        shortLabel: 'P3',
        isBreak: false,
        name: 'Period 3 (Old Name)',
      });

      // Lunch (does not increment)
      expect(map.get(5)).toEqual({
        teachingPeriodNumber: null,
        displayLabel: 'Lunch',
        shortLabel: 'Lunch',
        isBreak: true,
        name: 'Lunch',
      });

      // Period after Lunch becomes continuous Period 4!
      expect(map.get(6)).toEqual({
        teachingPeriodNumber: 4,
        displayLabel: 'Period 4',
        shortLabel: 'P4',
        isBreak: false,
        name: 'Period 4 (Old Name)',
      });
    });

    it('handles break before the first teaching period (e.g. assembly/homeroom)', () => {
      const periods: PeriodInfo[] = [
        { sort_order: 1, name: 'Morning Assembly', is_break: true, start_time: '08:00', end_time: '08:30' },
        { sort_order: 2, name: 'Mathematics', is_break: false, start_time: '08:30', end_time: '09:15' },
        { sort_order: 3, name: 'English', is_break: false, start_time: '09:15', end_time: '10:00' },
      ];

      const map = buildPeriodDisplayMap(periods);

      expect(map.get(1)?.teachingPeriodNumber).toBeNull();
      expect(map.get(1)?.displayLabel).toBe('Morning Assembly');
      expect(map.get(1)?.isBreak).toBe(true);

      // Teaching period starts at 1
      expect(map.get(2)?.teachingPeriodNumber).toBe(1);
      expect(map.get(2)?.displayLabel).toBe('Period 1');
      expect(map.get(2)?.shortLabel).toBe('P1');

      expect(map.get(3)?.teachingPeriodNumber).toBe(2);
      expect(map.get(3)?.displayLabel).toBe('Period 2');
      expect(map.get(3)?.shortLabel).toBe('P2');
    });

    it('handles multiple consecutive breaks without incrementing', () => {
      const periods: PeriodInfo[] = [
        { sort_order: 1, name: 'Class 1', is_break: false },
        { sort_order: 2, name: 'Recess', is_break: true },
        { sort_order: 3, name: 'Midday Break', is_break: true },
        { sort_order: 4, name: 'Lunch', slot_type: 'break' },
        { sort_order: 5, name: 'Class 2', is_break: false },
      ];

      const map = buildPeriodDisplayMap(periods);

      expect(map.get(1)?.teachingPeriodNumber).toBe(1);
      expect(map.get(2)?.teachingPeriodNumber).toBeNull();
      expect(map.get(3)?.teachingPeriodNumber).toBeNull();
      expect(map.get(4)?.teachingPeriodNumber).toBeNull();
      expect(map.get(5)?.teachingPeriodNumber).toBe(2);
    });

    it('handles timetable with no breaks correctly', () => {
      const periods: PeriodInfo[] = [
        { sort_order: 1, name: 'Period 1', is_break: false },
        { sort_order: 2, name: 'Period 2', is_break: false },
        { sort_order: 3, name: 'Period 3', is_break: false },
      ];

      const map = buildPeriodDisplayMap(periods);

      expect(map.get(1)?.teachingPeriodNumber).toBe(1);
      expect(map.get(2)?.teachingPeriodNumber).toBe(2);
      expect(map.get(3)?.teachingPeriodNumber).toBe(3);
    });

    it('preserves chronological timetable order even if input array is out of order', () => {
      const periods: PeriodInfo[] = [
        { sort_order: 4, name: 'Period 4', is_break: false },
        { sort_order: 1, name: 'Period 1', is_break: false },
        { sort_order: 3, name: 'Period 3', is_break: false },
        { sort_order: 2, name: 'Break', is_break: true },
      ];

      const map = buildPeriodDisplayMap(periods);

      expect(map.get(1)?.teachingPeriodNumber).toBe(1);
      expect(map.get(2)?.teachingPeriodNumber).toBeNull();
      expect(map.get(3)?.teachingPeriodNumber).toBe(2);
      expect(map.get(4)?.teachingPeriodNumber).toBe(3);
    });
  });

  describe('getSlotDisplayInfo', () => {
    it('retrieves accurate display period info from periodMap', () => {
      const periods: PeriodInfo[] = [
        { sort_order: 1, name: 'Period 1', is_break: false },
        { sort_order: 2, name: 'Break', is_break: true },
        { sort_order: 3, name: 'Period 3', is_break: false },
      ];
      const periodMap = buildPeriodDisplayMap(periods);

      const slotTeaching = { period_number: 3, class_section_id: 'c1' };
      const infoTeaching = getSlotDisplayInfo(slotTeaching, periodMap);
      expect(infoTeaching.teachingPeriodNumber).toBe(2);
      expect(infoTeaching.shortLabel).toBe('P2');
      expect(infoTeaching.displayLabel).toBe('Period 2');

      const slotBreak = { period_number: 2, class_section_id: 'c1' };
      const infoBreak = getSlotDisplayInfo(slotBreak, periodMap);
      expect(infoBreak.teachingPeriodNumber).toBeNull();
      expect(infoBreak.shortLabel).toBe('Break');
      expect(infoBreak.displayLabel).toBe('Break');
    });

    it('falls back gracefully when periodMap does not contain the slot period', () => {
      const slot = { period_number: 5, period_name: 'Science' };
      const info = getSlotDisplayInfo(slot);
      expect(info.teachingPeriodNumber).toBe(5);
      expect(info.displayLabel).toBe('Period 5');
      expect(info.shortLabel).toBe('P5');
    });
  });
});
