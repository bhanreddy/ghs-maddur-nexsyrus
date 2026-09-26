export interface SpecialSectionChoice {
  id: string;
  class_id: string;
  class_name: string;
  section_name: string;
  class_teacher_id?: string | null;
  class_teacher_name?: string | null;
}

export interface SpecialSubjectTarget {
  id?: string | null;
  class_id: string;
  class_section_id: string | null;
}

export interface SpecialSubjectSpec {
  name: string;
  max_marks: number;
  passing_marks: number;
  targets: SpecialSubjectTarget[];
}

export interface SpecialSubjectDraft {
  localId: string;
  name: string;
  maxMarks: string;
  passingMarks: string;
  /** `class:<classId>` selects every section. Otherwise the value is a class-section id. */
  selected: string[];
  paperIds: Record<string, string>;
}

export interface ExamOnlyPaperInput {
  id: string;
  class_id: string;
  class_section_id?: string | null;
  subject_name: string;
  max_marks: number | string;
  passing_marks: number | string;
  is_exam_only?: boolean;
}

export function classTargetKey(classId: string) {
  return `class:${classId}`;
}

export function emptySpecialSubjectDraft(): SpecialSubjectDraft {
  return {
    localId: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    name: '',
    maxMarks: '20',
    passingMarks: '8',
    selected: [],
    paperIds: {},
  };
}

export function papersToDrafts(papers: ExamOnlyPaperInput[]): SpecialSubjectDraft[] {
  const groups = new Map<string, SpecialSubjectDraft>();
  for (const paper of papers) {
    if (!paper.is_exam_only) continue;
    const name = String(paper.subject_name || '').trim();
    const maxMarks = String(Number(paper.max_marks));
    const passingMarks = String(Number(paper.passing_marks));
    const key = `${name.toLowerCase()}|${maxMarks}|${passingMarks}`;
    let draft = groups.get(key);
    if (!draft) {
      draft = {
        localId: paper.id,
        name,
        maxMarks,
        passingMarks,
        selected: [],
        paperIds: {},
      };
      groups.set(key, draft);
    }
    if (paper.class_section_id) {
      draft.selected.push(paper.class_section_id);
      draft.paperIds[paper.class_section_id] = paper.id;
    } else {
      const target = classTargetKey(paper.class_id);
      draft.selected.push(target);
      draft.paperIds[target] = paper.id;
    }
  }
  return [...groups.values()];
}

export function draftsToSpecs(
  drafts: SpecialSubjectDraft[],
  sections: SpecialSectionChoice[],
): SpecialSubjectSpec[] {
  return drafts.map((draft) => {
    const targets: SpecialSubjectTarget[] = [];
    const classWide = new Set(
      draft.selected.filter((value) => value.startsWith('class:')).map((value) => value.slice(6)),
    );
    for (const classId of classWide) {
      targets.push({
        id: draft.paperIds[classTargetKey(classId)] || null,
        class_id: classId,
        class_section_id: null,
      });
    }
    for (const sectionId of draft.selected) {
      if (sectionId.startsWith('class:')) continue;
      const section = sections.find((item) => item.id === sectionId);
      if (!section || classWide.has(section.class_id)) continue;
      targets.push({
        id: draft.paperIds[sectionId] || null,
        class_id: section.class_id,
        class_section_id: section.id,
      });
    }
    return {
      name: draft.name.trim().replace(/\s+/g, ' '),
      max_marks: Number(draft.maxMarks),
      passing_marks: Number(draft.passingMarks),
      targets,
    };
  });
}

export function sectionsMissingClassTeacher(
  draft: SpecialSubjectDraft,
  sections: SpecialSectionChoice[],
): SpecialSectionChoice[] {
  const classWide = new Set(
    draft.selected.filter((value) => value.startsWith('class:')).map((value) => value.slice(6)),
  );
  return sections.filter((section) => {
    const selected = classWide.has(section.class_id) || draft.selected.includes(section.id);
    return selected && !section.class_teacher_id;
  });
}

export const MARKS_ENTERED_BY_CLASS_TEACHER = 'Marks entered by: Assigned class teacher';
export const CLASS_TEACHER_NOT_ASSIGNED = 'Class teacher not assigned';
