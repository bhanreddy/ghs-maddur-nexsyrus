/** Resolve the next input in roster order, without skipping unmounted students. */
export function nextMarksInput<Field extends string>(
  students: readonly { id: string }[],
  fields: readonly Field[],
  studentId: string,
  field: Field,
  nextStudentOnly = false,
): { studentId: string; field: Field } | null {
  const studentIndex = students.findIndex((student) => student.id === studentId);
  const fieldIndex = fields.indexOf(field);
  if (studentIndex < 0 || fieldIndex < 0 || fields.length === 0) return null;
  if (!nextStudentOnly && fieldIndex + 1 < fields.length) {
    return { studentId, field: fields[fieldIndex + 1] };
  }
  const nextStudent = students[studentIndex + 1];
  return nextStudent ? { studentId: nextStudent.id, field: fields[0] } : null;
}
