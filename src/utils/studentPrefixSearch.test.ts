import { searchStudentsByPrefix } from './studentPrefixSearch';

const STUDENTS = [
  { id: '1', admission_no: '2026-014', display_name: 'Ravi Kumar', roll_number: 2 },
  { id: '2', admission_no: '2026-001', display_name: 'Ananya Ravi', roll_number: 1 },
  { id: '3', admission_no: '2025-010', display_name: 'Rohan Kiran', roll_number: 3 },
];

describe('student prefix search', () => {
  it('prioritizes exact admission numbers', () => {
    expect(searchStudentsByPrefix(STUDENTS, '2026-001').map((student) => student.id)).toEqual(['2']);
  });

  it('matches the beginning of any name token', () => {
    expect(searchStudentsByPrefix(STUDENTS, 'rav').map((student) => student.id)).toEqual(['1', '2']);
  });

  it('supports initials as a fast class-teacher shortcut', () => {
    expect(searchStudentsByPrefix(STUDENTS, 'rk').map((student) => student.id)).toEqual(['1', '3']);
  });
});
