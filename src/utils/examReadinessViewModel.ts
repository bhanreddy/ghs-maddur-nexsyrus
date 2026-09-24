import {
  ExamResultReadiness,
  ExamResultReadinessPaper,
  ExamResultReadinessSection,
  ExamResultReadinessTeacher,
} from '../services/examService';

export type FollowUpFilterType = 'all' | 'missing_uploads' | 'unassigned' | 'unresolved';
export type FollowUpItemType = 'assigned' | 'unassigned' | 'unresolved';

export interface FollowUpItem {
  id: string;
  type: FollowUpItemType;
  exam_subject_id: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  // Assigned teacher fields
  teacher_id?: string;
  teacher_name?: string;
  section_names?: string[];
  // Unassigned section fields
  section_id?: string;
  section_name?: string;
  // Numeric metrics
  expected_entries?: number;
  entered_entries?: number;
  missing_entries?: number;
  status_label: string;
  raw_paper: ExamResultReadinessPaper;
  raw_section?: ExamResultReadinessSection;
  raw_teacher?: ExamResultReadinessTeacher;
}

/**
 * Deterministic ordering for operational action:
 * 1. Unassigned sections (require teacher assignment first)
 * 2. Unresolved rows (require scheduling/investigation)
 * 3. Assigned teachers sorted by largest missing count descending
 * 4. Tie-breakers: class_name, section, subject_name, teacher_name
 */
export function compareFollowUpItems(a: FollowUpItem, b: FollowUpItem): number {
  const typeRank = (item: FollowUpItem): number => {
    if (item.type === 'unassigned') return 1;
    if (item.type === 'unresolved') return 2;
    return 3;
  };

  const rankDiff = typeRank(a) - typeRank(b);
  if (rankDiff !== 0) return rankDiff;

  // For assigned teachers, prioritize largest missing count
  if (a.type === 'assigned' && b.type === 'assigned') {
    const missingDiff = (b.missing_entries ?? 0) - (a.missing_entries ?? 0);
    if (missingDiff !== 0) return missingDiff;
  }

  // Deterministic tie-breakers
  const classComp = (a.class_name || '').localeCompare(b.class_name || '', undefined, { numeric: true });
  if (classComp !== 0) return classComp;

  const aSection = a.section_names?.join(', ') || a.section_name || '';
  const bSection = b.section_names?.join(', ') || b.section_name || '';
  const sectionComp = aSection.localeCompare(bSection, undefined, { numeric: true });
  if (sectionComp !== 0) return sectionComp;

  const subjectComp = (a.subject_name || '').localeCompare(b.subject_name || '');
  if (subjectComp !== 0) return subjectComp;

  return (a.teacher_name || '').localeCompare(b.teacher_name || '');
}

/**
 * Transforms backend readiness papers into a flattened, actionable follow-up list.
 * Preserves semantics: missing counts are never fabricated as 0 for unassigned sections.
 */
export function buildFollowUpItems(readiness?: ExamResultReadiness | null): FollowUpItem[] {
  if (!readiness?.papers || readiness.papers.length === 0) return [];

  const items: FollowUpItem[] = [];

  for (const paper of readiness.papers) {
    if (paper.complete) continue;

    const pendingTeachers = (paper.pending_teachers || []).filter(Boolean);
    const unassignedSections = (paper.unassigned_sections || []).filter(Boolean);

    // 1. Assigned teachers with pending marks
    for (const teacher of pendingTeachers) {
      items.push({
        id: `${paper.exam_subject_id}-teacher-${teacher.teacher_id || 'unknown'}`,
        type: 'assigned',
        exam_subject_id: paper.exam_subject_id,
        class_id: paper.class_id,
        class_name: paper.class_name || '',
        subject_id: paper.subject_id,
        subject_name: paper.subject_name || '',
        teacher_id: teacher.teacher_id,
        teacher_name: teacher.teacher_name || 'Staff Member',
        section_names: teacher.section_names || [],
        expected_entries: teacher.expected_entries,
        entered_entries: teacher.entered_entries,
        missing_entries: teacher.missing_entries,
        status_label: 'Pending upload',
        raw_paper: paper,
        raw_teacher: teacher,
      });
    }

    // 2. Unassigned sections (no teacher assigned to section)
    for (const section of unassignedSections) {
      items.push({
        id: `${paper.exam_subject_id}-unassigned-${section.section_id || 'unknown'}`,
        type: 'unassigned',
        exam_subject_id: paper.exam_subject_id,
        class_id: paper.class_id,
        class_name: paper.class_name || '',
        subject_id: paper.subject_id,
        subject_name: paper.subject_name || '',
        section_id: section.section_id,
        section_name: section.section_name || '',
        status_label: 'Teacher not assigned',
        raw_paper: paper,
        raw_section: section,
      });
    }

    // 3. Unresolved gap (marks missing but no teachers or unassigned sections resolved)
    if (pendingTeachers.length === 0 && unassignedSections.length === 0 && (paper.missing_entries ?? 0) > 0) {
      items.push({
        id: `${paper.exam_subject_id}-unresolved`,
        type: 'unresolved',
        exam_subject_id: paper.exam_subject_id,
        class_id: paper.class_id,
        class_name: paper.class_name || '',
        subject_id: paper.subject_id,
        subject_name: paper.subject_name || '',
        expected_entries: paper.expected_entries,
        entered_entries: paper.entered_entries,
        missing_entries: paper.missing_entries,
        status_label: 'Assignment unresolved',
        raw_paper: paper,
      });
    }
  }

  return items.sort(compareFollowUpItems);
}

export interface FilterOptions {
  query?: string;
  filter?: FollowUpFilterType;
  classId?: string;
}

/**
 * High-performance search and filtering, supporting 500+ rows smoothly.
 * Search matches teacher name, class, sections, subject, and status case-insensitively.
 */
export function filterFollowUpItems(
  items: FollowUpItem[],
  { query = '', filter = 'all', classId = 'all' }: FilterOptions
): FollowUpItem[] {
  const trimmed = query.trim().toLowerCase();

  return items.filter((item) => {
    // 1. Status type filter
    if (filter === 'missing_uploads' && item.type !== 'assigned') return false;
    if (filter === 'unassigned' && item.type !== 'unassigned') return false;
    if (filter === 'unresolved' && item.type !== 'unresolved') return false;

    // 2. Class filter
    if (classId && classId !== 'all' && item.class_id !== classId) return false;

    // 3. Search query
    if (!trimmed) return true;

    const sectionsCombined = [
      item.section_names?.join(' ') || '',
      item.section_name || '',
      item.section_names ? `Section ${item.section_names.join(', ')}` : '',
      item.section_name ? `Section ${item.section_name}` : '',
    ].join(' ');

    const compositeText = [
      item.teacher_name || '',
      item.class_name || '',
      sectionsCombined,
      item.subject_name || '',
      item.status_label || '',
    ].join(' ').toLowerCase();

    const terms = trimmed.split(/\s+/).filter(Boolean);
    return terms.every((term) => {
      if (term.length === 1) {
        const wordRegex = new RegExp(`(^|[^a-zA-Z0-9])${term}([^a-zA-Z0-9]|$)`, 'i');
        return wordRegex.test(compositeText);
      }
      return compositeText.includes(term);
    });
  });
}

export interface ReadinessBadgeInfo {
  stateKey: 'published' | 'ready' | 'partial' | 'in_progress' | 'not_started';
  label: string;
  icon: string;
  themeColor: 'success' | 'primary' | 'warning' | 'textTertiary';
}

export function getReadinessBadgeInfo(
  readiness?: ExamResultReadiness | null,
  resultsPublished?: boolean
): ReadinessBadgeInfo {
  if (resultsPublished) {
    return {
      stateKey: 'published',
      label: 'Results published',
      icon: 'checkmark-circle-outline',
      themeColor: 'success',
    };
  }

  if (!readiness) {
    return {
      stateKey: 'not_started',
      label: 'Not started',
      icon: 'help-circle-outline',
      themeColor: 'textTertiary',
    };
  }

  if (readiness.ready) {
    return {
      stateKey: 'ready',
      label: 'Ready to publish',
      icon: 'checkmark-done-circle-outline',
      themeColor: 'success',
    };
  }

  const entered = readiness.entered_entries ?? 0;
  const publishable = readiness.publishable ?? entered > 0;

  if (entered > 0) {
    if (publishable) {
      return {
        stateKey: 'partial',
        label: 'Partial ready',
        icon: 'pie-chart-outline',
        themeColor: 'primary',
      };
    }
    return {
      stateKey: 'in_progress',
      label: 'In progress',
      icon: 'time-outline',
      themeColor: 'warning',
    };
  }

  return {
    stateKey: 'not_started',
    label: 'Not started',
    icon: 'hourglass-outline',
    themeColor: 'warning',
  };
}

export function getReadinessExplanation(
  readiness?: ExamResultReadiness | null,
  resultsPublished?: boolean
): string {
  if (resultsPublished) {
    return 'Results are live. Parents and students can view saved subject results.';
  }
  if (!readiness) {
    return 'Readiness information is currently unavailable.';
  }
  if (readiness.papers_total === 0) {
    return 'Teachers can enter marks in Staff → Results without creating or publishing a timetable.';
  }
  if (readiness.expected_entries === 0) {
    return 'No active student results are expected for the selected classes.';
  }
  if (readiness.ready) {
    return 'All student marks have been uploaded across all scheduled subjects. Ready to publish to parents and students.';
  }
  if (readiness.entered_entries > 0) {
    return `${readiness.entered_entries} of ${readiness.expected_entries} student mark entries completed. Partial publication is supported.`;
  }
  return 'Mark entries have not been started yet. Follow up with subject teachers to begin entering marks.';
}
