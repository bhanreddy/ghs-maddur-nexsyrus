import { api } from './apiClient';

// Exam timetable module. One "paper" = one exam x class x subject with a date
// and session time. Admin generates papers from parameters, edits them, then
// publishes; student/teacher reads only ever return published timetables.

export type ExamScheduleMode = 'aligned' | 'per_class';
export type ExamWeekday =
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday';

export interface ExamResultReadinessSummary {
    ready: boolean;
    papers_total: number;
    papers_complete: number;
    expected_entries: number;
    entered_entries: number;
    missing_entries: number;
}

export interface ExamListItem {
    id: string;
    name: string;
    name_te?: string | null;
    exam_type: string;
    start_date: string | null;
    end_date: string | null;
    status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
    timetable_published?: boolean;
    results_published?: boolean;
    results_published_at?: string | null;
    papers_count?: number;
    scheduled_papers_count?: number;
    result_readiness?: ExamResultReadinessSummary;
    academic_year?: string;
}

/** One syllabus topic with optional mark weightage. */
export interface ExamSyllabusItem {
    topic: string;
    marks: number | null;
}

export interface ExamPaper {
    id: string;
    class_id: string;
    subject_id: string;
    exam_date: string | null;
    start_time: string | null; // "09:30:00"
    end_time: string | null;
    max_marks: number;
    passing_marks: number;
    class_name: string;
    subject_name: string;
    subject_name_te?: string | null;
    has_marks: boolean;
    syllabus?: ExamSyllabusItem[] | null;
    /** True when a subject teacher is assigned (they can self-serve the syllabus). */
    has_teacher?: boolean;
}

export interface ExamTimetableDetail {
    exam: ExamListItem & {
        timetable_published_at?: string | null;
        timetable_params?: ExamGenerateParams | null;
        academic_year_id: string;
    };
    papers: ExamPaper[];
    result_readiness: ExamResultReadiness;
}

export interface ExamResultReadinessPaper {
    exam_subject_id: string;
    class_name: string;
    subject_name: string;
    expected_entries: number;
    entered_entries: number;
    missing_entries: number;
    complete: boolean;
}

export interface ExamResultReadiness extends ExamResultReadinessSummary {
    papers: ExamResultReadinessPaper[];
}

export interface ExamHallTicketData {
    exam: Pick<ExamListItem, 'id' | 'name' | 'name_te' | 'exam_type' | 'start_date' | 'end_date'> & {
        academic_year_id: string;
        academic_year: string;
    };
    class_section: {
        id: string;
        class_id: string;
        section_id: string;
        class_name: string;
        section_name: string;
    };
    papers: ExamPaper[];
    students: {
        id: string;
        display_name: string;
        father_name?: string | null;
        photo_url?: string | null;
        admission_no: string;
        roll_number?: string | number | null;
    }[];
}

export interface ExamSession {
    start_time: string | null; // "09:30"
    end_time: string | null;
}

export interface ExamGenerateParams {
    class_ids: string[];
    start_date: string;
    end_date: string;
    start_time?: string | null;
    end_time?: string | null;
    /** Exam sessions per day (1–3), each with its own timings. Overrides start/end_time. */
    sessions?: ExamSession[];
    /** Zero-based session index used by the first paper on the first exam date. */
    starting_session_index?: number;
    include_saturdays?: boolean;
    /** Explicit days on which papers may be scheduled. */
    allowed_weekdays?: ExamWeekday[];
    exclude_holidays?: boolean;
    excluded_dates?: string[];
    gap_days?: number;
    /** Force one eligible rest day after this many consecutive exam days. 0 disables it. */
    max_consecutive_days?: number;
    max_marks?: number;
    passing_marks?: number;
    /** Optional per-subject marks that override the global defaults. */
    subject_marks?: {
        subject_id: string;
        max_marks: number;
        passing_marks: number;
    }[];
    /** Legacy priority hint; prefer subject_ids. */
    subject_order?: string[];
    /** Ordered subject selection — only these subjects, in exactly this order. */
    subject_ids?: string[];
    mode?: ExamScheduleMode;
}

/** One subject taught by at least one of the selected classes. */
export interface ClassSubjectOption {
    id: string;
    name: string;
    name_te?: string | null;
    /** How many of the selected classes teach this subject. */
    class_count: number;
}

export interface ExamGenerateResult {
    message: string;
    inserted: number;
    preserved: number;
    dates_used: string[];
    warnings: string[];
}

/** One row of a student's (or teacher's) published exam schedule. */
export interface ExamScheduleSlot {
    id: string;
    exam_id: string;
    exam_name: string;
    exam_name_te?: string | null;
    exam_type: string;
    exam_date: string | null;
    start_time: string | null;
    end_time: string | null;
    max_marks: number;
    subject_name: string;
    subject_name_te?: string | null;
    /** teacher read only */
    class_name?: string;
    /** teacher read only — true when this paper is the teacher's own subject */
    is_my_subject?: boolean;
    syllabus?: ExamSyllabusItem[] | null;
}

export const ExamTimetableService = {
    // ── Admin ───────────────────────────────────────────────────────────
    getTimetable: async (examId: string): Promise<ExamTimetableDetail> => {
        return api.get<ExamTimetableDetail>(`/results/exams/${examId}/timetable`);
    },

    getHallTicketData: async (
        examId: string,
        classId: string,
        sectionId: string
    ): Promise<ExamHallTicketData> => {
        return api.get<ExamHallTicketData>(`/results/exams/${examId}/hall-tickets`, {
            class_id: classId,
            section_id: sectionId,
        });
    },

    getClassSubjects: async (
        classIds: string[],
        academicYearId?: string
    ): Promise<ClassSubjectOption[]> => {
        return api.get<ClassSubjectOption[]>('/results/exam-timetable/class-subjects', {
            class_ids: classIds.join(','),
            ...(academicYearId ? { academic_year_id: academicYearId } : {}),
        });
    },

    generate: async (examId: string, params: ExamGenerateParams): Promise<ExamGenerateResult> => {
        return api.post<ExamGenerateResult>(`/results/exams/${examId}/timetable/generate`, params, { silent: true });
    },

    updatePaper: async (
        paperId: string,
        data: Partial<Pick<ExamPaper, 'exam_date' | 'start_time' | 'end_time' | 'max_marks' | 'passing_marks' | 'syllabus'>>
    ): Promise<{ paper: ExamPaper }> => {
        return api.patch<{ paper: ExamPaper }>(`/results/exam-subjects/${paperId}`, data, { silent: true });
    },

    deletePaper: async (paperId: string): Promise<void> => {
        return api.delete(`/results/exam-subjects/${paperId}`);
    },

    addPaper: async (
        examId: string,
        data: {
            subject_id: string;
            class_id: string;
            exam_date?: string;
            start_time?: string;
            end_time?: string;
            max_marks?: number;
            passing_marks?: number;
        }
    ): Promise<void> => {
        return api.post(`/results/exams/${examId}/subjects`, data, { silent: true });
    },

    setPublished: async (examId: string, published: boolean): Promise<void> => {
        return api.post(`/results/exams/${examId}/timetable/publish`, { published }, { silent: true });
    },

    setResultsPublished: async (examId: string, published: boolean): Promise<void> => {
        return api.post(`/results/exams/${examId}/results/publish`, { published }, { silent: true });
    },

    // ── Student / parent ────────────────────────────────────────────────
    getSectionSchedule: async (classSectionId: string): Promise<ExamScheduleSlot[]> => {
        return api.get<ExamScheduleSlot[]>(`/results/exam-timetable/section/${classSectionId}`);
    },

    // ── Teacher ─────────────────────────────────────────────────────────
    getTeacherSchedule: async (): Promise<ExamScheduleSlot[]> => {
        return api.get<ExamScheduleSlot[]>('/results/exam-timetable/teacher');
    },

    /** Teacher sets syllabus & weightage for a paper of a subject they teach. */
    updateSyllabus: async (paperId: string, syllabus: ExamSyllabusItem[]): Promise<void> => {
        return api.patch(`/results/exam-subjects/${paperId}/syllabus`, { syllabus }, { silent: true });
    },
};

// ── Seating & invigilation ──────────────────────────────────────────────

export interface ExamRoom {
    id: string;
    name: string;
    rows: number;
    columns: number;
    capacity: number;
    sort_order: number;
}

export type SeatingStrategy = 'sequential' | 'mixed' | 'balanced' | 'maximize';

export interface ExamRoomClassConfig {
    room_id: string;
    /** Empty means every class scheduled in the exam. */
    class_ids: string[];
}

export interface ExamAllocationParams {
    /** Rooms in fill order. */
    room_ids: string[];
    /** Classes permitted in each selected room. */
    room_configs?: ExamRoomClassConfig[];
    strategy: SeatingStrategy;
    invigilator_staff_ids: string[];
}

/** One room used in one sitting (exam × date × session). */
export interface ExamRoomAllocation {
    id: string;
    exam_date: string;
    session_start: string; // "09:30:00"; "00:00:00" = untimed sitting
    room_id: string;
    room_name: string;
    rows: number;
    columns: number;
    capacity: number;
    invigilator_staff_id: string | null;
    invigilator_name: string | null;
    seats_count: number;
    class_names: string | null;
}

export interface ExamSeatStudent {
    seat_id: string;
    seat_no: number | null;
    student_enrollment_id: string;
    class_name: string;
    section_name: string;
    roll_number: number | null;
    display_name: string;
    admission_no: string;
}

/** One invigilation duty on the staff schedule. */
export interface ExamDuty {
    id: string;
    exam_date: string;
    session_start: string;
    session_end: string | null;
    exam_id: string;
    exam_name: string;
    exam_name_te?: string | null;
    exam_type: string;
    room_name: string;
    seats_count: number;
    class_names: string | null;
}

/** A student's room + seat for one sitting. */
export interface ExamSeatInfo {
    exam_id: string;
    exam_date: string;
    session_start: string;
    seat_no: number | null;
    room_name: string;
}

export const ExamAllocationService = {
    // ── Room registry ───────────────────────────────────────────────────
    getRooms: async (): Promise<ExamRoom[]> => {
        return api.get<ExamRoom[]>('/results/exam-rooms');
    },
    addRoom: async (data: { name: string; rows: number; columns: number }): Promise<void> => {
        return api.post('/results/exam-rooms', data, { silent: true });
    },
    updateRoom: async (id: string, data: { name?: string; rows?: number; columns?: number }): Promise<void> => {
        return api.patch(`/results/exam-rooms/${id}`, data, { silent: true });
    },
    deleteRoom: async (id: string): Promise<void> => {
        return api.delete(`/results/exam-rooms/${id}`);
    },

    // ── Allocation ──────────────────────────────────────────────────────
    generate: async (
        examId: string,
        params: ExamAllocationParams
    ): Promise<{ sittings: number; students_seated: number; invigilators_assigned: number; warnings: string[] }> => {
        return api.post(`/results/exams/${examId}/allocations/generate`, params, { silent: true });
    },
    getAllocations: async (
        examId: string
    ): Promise<{ allocations: ExamRoomAllocation[]; allocation_params: ExamAllocationParams | null }> => {
        return api.get(`/results/exams/${examId}/allocations`);
    },
    getAllocationStudents: async (allocationId: string): Promise<ExamSeatStudent[]> => {
        return api.get<ExamSeatStudent[]>(`/results/exam-allocations/${allocationId}/students`);
    },
    setInvigilator: async (allocationId: string, staffId: string | null): Promise<void> => {
        return api.patch(`/results/exam-allocations/${allocationId}`, { invigilator_staff_id: staffId }, { silent: true });
    },
    /** Manually add an (empty) room to one sitting; students can then be moved in. */
    addToSitting: async (
        examId: string,
        data: { exam_date: string; session_start?: string | null; room_id: string }
    ): Promise<void> => {
        return api.post(`/results/exams/${examId}/allocations`, data, { silent: true });
    },
    removeAllocation: async (allocationId: string): Promise<void> => {
        return api.delete(`/results/exam-allocations/${allocationId}`);
    },
    moveSeat: async (seatId: string, toAllocationId: string): Promise<void> => {
        return api.post(`/results/exam-seats/${seatId}/move`, { to_allocation_id: toAllocationId }, { silent: true });
    },

    // ── Staff / student reads ───────────────────────────────────────────
    getMyDuties: async (): Promise<ExamDuty[]> => {
        return api.get<ExamDuty[]>('/results/exam-timetable/my-duties');
    },
    getMyAllocations: async (studentId: string): Promise<ExamSeatInfo[]> => {
        return api.get<ExamSeatInfo[]>('/results/exam-timetable/my-allocations', { student_id: studentId });
    },
};

/**
 * Key a sitting so paper rows and seat lookups can be matched client-side:
 * `${examId}|${YYYY-MM-DD}|${HH:MM}` ("00:00" = untimed).
 */
export function sittingKeyOf(examId: string, examDate?: string | null, startTime?: string | null): string {
    const time = startTime ? String(startTime).slice(0, 5) : '00:00';
    return `${examId}|${(examDate || '').slice(0, 10)}|${time}`;
}

/** Normalize an API date ("YYYY-MM-DD" or full ISO timestamp) to "YYYY-MM-DD". */
export function ymd(date?: string | null): string {
    return (date || '').slice(0, 10);
}

/** Group a flat slot list by exam for section headers. Keeps server order. */
export function groupSlotsByExam(slots: ExamScheduleSlot[]): {
    examId: string;
    examName: string;
    examNameTe?: string | null;
    examType: string;
    slots: ExamScheduleSlot[];
}[] {
    const groups: ReturnType<typeof groupSlotsByExam> = [];
    const byId = new Map<string, (typeof groups)[number]>();
    for (const slot of slots) {
        let group = byId.get(slot.exam_id);
        if (!group) {
            group = {
                examId: slot.exam_id,
                examName: slot.exam_name,
                examNameTe: slot.exam_name_te,
                examType: slot.exam_type,
                slots: [],
            };
            byId.set(slot.exam_id, group);
            groups.push(group);
        }
        group.slots.push(slot);
    }
    return groups;
}
