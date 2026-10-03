import { nextMarksInput } from './marksEntryNavigation';

const students = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
const fields = ['participation', 'writtenWork', 'projectWork', 'slipTest'] as const;

describe('marks entry navigation', () => {
  it('moves through each component before advancing to the next student', () => {
    expect(nextMarksInput(students, fields, 'one', 'participation'))
      .toEqual({ studentId: 'one', field: 'writtenWork' });
    expect(nextMarksInput(students, fields, 'one', 'projectWork'))
      .toEqual({ studentId: 'one', field: 'slipTest' });
    expect(nextMarksInput(students, fields, 'one', 'slipTest'))
      .toEqual({ studentId: 'two', field: 'participation' });
  });

  it('advances consolidated marks directly to the next student', () => {
    expect(nextMarksInput(students, ['consolidated'], 'one', 'consolidated'))
      .toEqual({ studentId: 'two', field: 'consolidated' });
  });

  it('lets the next student action skip the remaining components', () => {
    expect(nextMarksInput(students, fields, 'one', 'writtenWork', true))
      .toEqual({ studentId: 'two', field: 'participation' });
  });

  it('follows the filtered roster and stops at the last student without wrapping', () => {
    const filtered = [students[0], students[2]];
    expect(nextMarksInput(filtered, fields, 'one', 'slipTest'))
      .toEqual({ studentId: 'three', field: 'participation' });
    expect(nextMarksInput(filtered, fields, 'three', 'slipTest')).toBeNull();
  });

  it('does not jump to the first student when the current input is no longer in the roster', () => {
    expect(nextMarksInput([], fields, 'one', 'slipTest')).toBeNull();
    expect(nextMarksInput([students[1]], fields, 'one', 'slipTest')).toBeNull();
    expect(nextMarksInput(students, ['consolidated'], 'one', 'unknown')).toBeNull();
  });
});
