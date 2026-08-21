export interface PrefixSearchStudent {
  id: string;
  admission_no: string;
  display_name: string;
  roll_number?: number | null;
}

const normalize = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .trim()
  .replace(/\s+/g, ' ');

/** Exact and admission-number matches lead, followed by full-name and token prefixes. */
export function searchStudentsByPrefix<T extends PrefixSearchStudent>(
  students: T[],
  query: string,
  limit = 10,
): T[] {
  const prefix = normalize(query);
  if (!prefix) return [];

  return students
    .flatMap((student) => {
      const name = normalize(student.display_name);
      const admission = normalize(student.admission_no);
      const tokens = name.split(' ');
      const initials = tokens.map((token) => token[0] || '').join('');
      let relevance = -1;
      if (admission === prefix) relevance = 0;
      else if (name === prefix) relevance = 1;
      else if (admission.startsWith(prefix)) relevance = 2;
      else if (name.startsWith(prefix)) relevance = 3;
      else if (tokens.some((token) => token.startsWith(prefix))) relevance = 4;
      else if (initials.startsWith(prefix)) relevance = 5;
      return relevance < 0 ? [] : [{ student, relevance }];
    })
    .sort((a, b) =>
      a.relevance - b.relevance
      || (a.student.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.student.roll_number ?? Number.MAX_SAFE_INTEGER)
      || a.student.display_name.localeCompare(b.student.display_name)
    )
    .slice(0, limit)
    .map(({ student }) => student);
}
