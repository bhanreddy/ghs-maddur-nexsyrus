import { SubstitutionSlot } from '../services/substitutionService';
import {
  filterManualPickerSlots,
  hasManualSubstitutionReason,
  isEligibleManualPickerSlot,
  isManualSubstitution,
  regularTeacherMetaLabel,
} from './manualSubstitutionSlots';

function slot(overrides: Partial<SubstitutionSlot> = {}): SubstitutionSlot {
  return {
    slot_id: 'slot-1',
    class_section_id: 'cs-1',
    period_number: 2,
    is_break: false,
    period_name: 'Period 2',
    start_time: '09:00',
    end_time: '09:45',
    class_name: '8',
    section_name: 'A',
    subject_id: 'sub-1',
    subject_name: 'Math',
    regular_teacher_id: 'teacher-1',
    regular_teacher_name: 'Anita Roy',
    ...overrides,
  };
}

const scheduled: SubstitutionSlot[] = [
  slot(),
  slot({
    slot_id: 'break',
    period_number: 3,
    is_break: true,
    period_name: 'Lunch',
    subject_name: 'Lunch',
    regular_teacher_id: 'teacher-1',
  }),
  slot({
    slot_id: 'open',
    period_number: 4,
    regular_teacher_id: null,
    regular_teacher_name: null,
    subject_name: 'Art',
    section_name: 'B',
  }),
  slot({
    slot_id: 'covered',
    period_number: 5,
    subject_name: 'Science',
    section_name: 'C',
    substitution_id: 'sub-1',
    substitute_teacher_id: 'teacher-2',
    substitute_teacher_name: 'Cover Teacher',
  }),
];

describe('manual substitution picker', () => {
  it('keeps teaching slots that have a regular teacher and no active cover', () => {
    expect(scheduled.filter(isEligibleManualPickerSlot).map((item) => item.slot_id)).toEqual(['slot-1']);
  });

  it('searches by class, section, subject, period, and regular teacher', () => {
    const rows = [
      slot(),
      slot({
        slot_id: 'slot-2',
        class_name: '10',
        section_name: 'C',
        subject_name: 'Physics',
        period_number: 6,
        period_name: 'Period 6',
        regular_teacher_name: 'Suresh Kumar',
        regular_teacher_id: 'teacher-2',
      }),
    ];

    expect(filterManualPickerSlots(rows, '10-c').map((item) => item.slot_id)).toEqual(['slot-2']);
    expect(filterManualPickerSlots(rows, 'physics').map((item) => item.slot_id)).toEqual(['slot-2']);
    expect(filterManualPickerSlots(rows, 'period 6').map((item) => item.slot_id)).toEqual(['slot-2']);
    expect(filterManualPickerSlots(rows, 'suresh').map((item) => item.slot_id)).toEqual(['slot-2']);
    expect(filterManualPickerSlots(rows, '8-A').map((item) => item.slot_id)).toEqual(['slot-1']);
  });

  it('labels a manual cover without calling the regular teacher unavailable', () => {
    const manual = slot({
      substitution_id: 'sub-1',
      unavailability_sources: ['manual'],
      unavailability_label: 'Manual Substitution',
    });
    const leave = slot({
      substitution_id: 'sub-2',
      unavailability_sources: ['leave'],
      unavailability_label: 'Leave',
    });

    expect(isManualSubstitution(manual)).toBe(true);
    expect(regularTeacherMetaLabel(manual)).toBe('REGULAR TEACHER');
    expect(regularTeacherMetaLabel(leave)).toBe('REGULAR TEACHER (UNAVAILABLE)');
    expect(regularTeacherMetaLabel(slot())).toBe('UNAVAILABLE TEACHER');
    expect(hasManualSubstitutionReason('No')).toBe(false);
    expect(hasManualSubstitutionReason('Staff meeting')).toBe(true);
  });
});
