// Core Role Types
export type Role = 'admin' | 'staff' | 'teacher' | 'student' | 'parent' | 'accountant' | 'driver';

// ================= AUTH & USER =================
export interface User {
    readonly id: string;
    readonly uid?: string;
    readonly email: string;
    readonly first_name: string;
    readonly last_name: string;
    readonly display_name: string;
    readonly name?: string;
    readonly photo_url?: string;
    readonly photoUrl?: string; // App expects photoUrl in some places
    readonly phone?: string; // App expects phone in staff profile
    readonly role: Role;
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
    readonly admission_no?: string;
    readonly rollNo?: string; // App expects rollNo in some places
    readonly has_student_profile?: boolean;
    readonly has_staff_profile?: boolean;
    readonly classId?: string; // Mapped from class_section_id
    readonly class_section_id?: string;
    readonly staff_id?: string;
    readonly staff_code?: string;
    readonly notification_sound?: 'custom' | 'default';
    readonly gender?: string;
}

export interface AccountsUser extends User {
    readonly role: 'accountant';
}

export interface StaffProfile {
    readonly id: string;
    readonly staff_code: string;
    readonly joining_date: string;
    readonly salary: string;
    readonly person_id: string;
    readonly first_name: string;
    readonly last_name: string;
    readonly display_name: string;
    readonly gender: string;
    readonly designation: string;
    readonly status: string;
    readonly email?: string;
    readonly phone?: string;
    readonly photo_url?: string;
}

export interface StaffClassAssignment {
    readonly class_section_id: string;
    readonly class_name: string;
    readonly section_name: string;
    readonly subject_id?: string;
    readonly subject_name?: string;
    readonly is_class_teacher: boolean;
}

// ================= STUDENT PROFILE =================
export interface StudentEnrollment {
    readonly id: string;
    /** Class section UUID (timetable + diary APIs). */
    readonly class_section_id?: string;
    readonly roll_number: string;
    readonly class_code: string;
    readonly class_name?: string;
    readonly class_id: string;
    readonly class_sort_order?: number;
    readonly section_name: string;
    readonly section_id: string;
    readonly academic_year_id?: string;
    readonly academic_year: string;
    readonly academic_year_start_date?: string;
    readonly academic_year_end_date?: string;
    readonly start_date?: string;
    readonly end_date?: string | null;
    readonly created_at?: string;
    readonly status?: string;
    readonly class_teacher?: string;
    readonly class_teacher_id?: string;
    readonly class_teacher_user_id?: string;
    readonly class_teacher_photo_url?: string;
}

export interface Parent {
    readonly first_name: string;
    readonly last_name: string;
    readonly relation: string;
    readonly phone?: string;
    readonly occupation?: string;
    readonly is_primary?: boolean;
    readonly is_guardian?: boolean;
}

export interface Student {
    readonly id: string;
    readonly admission_no: string;
    readonly pen_number?: string;
    readonly apar_number?: string | null;
    readonly admission_date: string;
    readonly first_name: string;
    readonly middle_name?: string;
    readonly last_name: string;
    readonly display_name: string;
    readonly name?: string;
    readonly gender_id: number;
    readonly dob: string;
    readonly status: string;
    readonly email?: string;
    readonly phone?: string;
    readonly photo_url?: string;
    readonly current_enrollment?: StudentEnrollment;
    readonly parents?: Parent[];
    readonly category?: { id: number; name: string };
}

// ================= ATTENDANCE =================
export interface AttendanceSummary {
    readonly present: number;
    readonly absent: number;
    readonly late: number;
    readonly total: number;
}

export interface AttendanceRecord {
    readonly attendance_date: string;
    readonly status: 'present' | 'absent' | 'late' | 'half_day' | 'holiday';
    readonly marked_at?: string;
    readonly class_name?: string;
    readonly section_name?: string;
}

export interface AttendanceResponse {
    readonly summary: AttendanceSummary;
    readonly records: AttendanceRecord[];
}

export interface ClassAttendanceStudent {
    readonly student_id: string;
    readonly admission_no: string;
    readonly student_name: string;
    readonly photo_url?: string;
    readonly enrollment_id: string;
    readonly attendance_id?: string;
    readonly status?: 'present' | 'absent' | 'late' | 'half_day';
    readonly marked_at?: string;
}

export interface ClassAttendanceResponse {
    readonly date: string;
    readonly class_section_id: string;
    readonly class_name: string;
    readonly section_name: string;
    readonly total_students: number;
    readonly marked_count: number;
    readonly students: ClassAttendanceStudent[];
}

// ================= FEES =================
export interface TransportDue {
    readonly assignment_id?: string;
    readonly route_id?: string;
    readonly stop_id?: string | null;
    readonly route_name?: string;
    readonly stop_name?: string | null;
    readonly transport_fee_id?: string | null;
    readonly fee_amount?: number | null;
    readonly billing_cycle?: string | null;
    readonly academic_year?: string;
    readonly paid_amount?: number;
    readonly balance_due?: number | null;
    readonly fee_not_set?: boolean;
    readonly fee_type?: 'transport';
}

export interface FeeSummary {
    readonly total_due: number;
    readonly total_paid: number;
    readonly balance: number;
    readonly total_balance?: number;
    readonly transport_due?: TransportDue | null;
}

/** Per fee-type balance line on a fee receipt */
export interface StudentFeeDueLine {
    readonly student_fee_id?: string;
    readonly fee_type: string;
    readonly academic_year?: string;
    readonly amount_due: number;
    readonly amount_paid: number;
    readonly discount?: number;
    readonly balance_due: number;
    readonly status?: string;
}

export interface FeeTransaction {
    readonly id: string;
    readonly student_fee_id: string;
    readonly student_id?: string;
    readonly amount: number;
    readonly paid_at: string;
    readonly payment_method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
    readonly transaction_ref?: string;
    /** Serial receipt number (e.g. RCT-20260707-1001) generated on ledger post */
    readonly receipt_no?: string;
    readonly remarks?: string;
    readonly received_by?: string;
    readonly received_by_id?: string;
    readonly student_name?: string;
    readonly father_name?: string;
    readonly father_mobile?: string;
    readonly admission_no?: string;
    readonly class_name?: string;
    readonly section_name?: string;
    readonly fee_type?: string;
    readonly academic_year?: string;
    /** Total fee amount before discount (from student_fees.amount_due) */
    readonly amount_due?: number;
    /** Cumulative amount paid on this fee line after this transaction */
    readonly total_paid?: number;
    /** Discount applied on this fee line */
    readonly discount?: number;
    /** Remaining balance on this fee line after this transaction */
    readonly balance_due?: number;
    /** All assigned fee types and balances for this student */
    readonly fee_dues?: readonly StudentFeeDueLine[];
}

export interface FeeStructure {
    readonly id: string;
    readonly academic_year_id: string;
    readonly class_id: string;
    readonly class_name?: string;
    readonly section_id?: string | null;
    readonly section_name?: string | null;
    readonly fee_type_id: string;
    readonly fee_type?: string;
    readonly amount: number;
    readonly due_date?: string;
    readonly frequency: string;
    readonly academic_year?: string;
}

export type FeeMode = 'per_class' | 'per_section';

export interface FeeStructureListResponse {
    fee_mode: FeeMode;
    structures: FeeStructure[];
    missing_sections?: Array<{
        class_id: string;
        class_name: string;
        section_id: string;
        section_name: string;
        academic_year_id: string;
        academic_year: string;
        fee_type_id: string;
        fee_type: string;
    }>;
}

export interface FeeType {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly frequency?: string;
    readonly is_active?: boolean;
    readonly sort_order?: number;
}

export interface StudentFee {
    readonly id: string;
    readonly student_id: string;
    readonly amount_due: number;
    readonly amount_paid: number;
    readonly discount: number;
    readonly status: 'pending' | 'partial' | 'paid' | 'overdue' | 'waived';
    readonly due_date: string;
    readonly fee_type_id?: string;
    readonly fee_type: string;
    readonly fee_type_te?: string;
    readonly fee_type_sort_order?: number;
    readonly fee_code?: string;
    readonly period_month?: number;
    readonly period_year?: number;
    readonly adjustment_count?: number;
}

export type FeeAdjustmentType = 'waive' | 'add';

export interface FeeReceipt {
    readonly id: string;
    readonly receipt_no: string;
    readonly total_amount: number;
    readonly issued_at: string;
    readonly issued_by_name?: string;
    readonly student_name: string;
    readonly father_name?: string;
    readonly father_mobile?: string;
    readonly admission_no: string;
    readonly class_name?: string;
    readonly section_name?: string;
    readonly items: {
        readonly amount: number;
        readonly fee_type: string;
        readonly payment_method: string;
        readonly transaction_ref?: string;
        readonly paid_at: string;
    }[];
}

export interface AccountsDashboardStats {
    readonly today_collection: number;
    readonly monthly_collection: number;
    readonly collected_total: number;
    readonly pending_dues: number;
    readonly defaulter_count: number;
    readonly recent_transactions: FeeTransaction[];
    readonly config?: Record<string, boolean>;
    readonly stats?: {
        readonly collected_total?: number;
        readonly defaulter_count?: number;
        readonly recent_transactions?: any[];
        readonly total_collection_month?: number;
        readonly todays_collection?: number;
        readonly pending_dues?: number;
        readonly revenue_trend?: {
            readonly trend: any[];
            readonly total_invoiced: number;
            readonly total_collected: number;
            readonly outstanding_dues: number;
        };
        readonly collection_efficiency?: number;
        readonly avg_attendance?: {
            readonly avg_attendance: number;
            readonly total_present_days: number;
            readonly total_working_days: number;
        };
        readonly academic_score?: {
            readonly avg_score: number;
            readonly exams_conducted: number;
        };
        readonly system_insights?: any[];
    };
}

export interface FeeResponse {
    readonly student: {
        readonly id: string;
        readonly admission_no: string;
        readonly display_name: string;
        readonly class_name?: string;
        readonly section_name?: string;
        readonly father_name?: string;
        readonly father_mobile?: string;
        readonly parents?: Parent[];
    };
    readonly summary: FeeSummary;
    readonly fees: StudentFee[];
    readonly transport_due?: TransportDue | null;
}

// ================= LMS =================
export interface LMSMaterial {
    readonly id: string;
    readonly title: string;
    readonly title_te?: string;
    readonly description?: string;
    readonly description_te?: string;
    readonly content_url: string;
    readonly duration?: string;
    readonly material_type: 'video' | 'document' | 'link' | 'quiz' | 'assignment';
    readonly created_at: string;
    readonly course_title: string;
    readonly course_title_te?: string;
    readonly class_name?: string;
    readonly instructor_name?: string;
}

// ================= ANNOUNCEMENTS =================
export type NoticeAudience = 'all' | 'students' | 'staff' | 'parents' | 'class';

export interface Notice {
    readonly id: string;
    readonly title: string;
    readonly title_te?: string;
    readonly content: string;
    readonly content_te?: string;
    readonly audience: NoticeAudience;
    readonly target_class_id?: string;
    readonly priority?: 'low' | 'medium' | 'high' | 'urgent';
    readonly is_published: boolean;
    readonly is_pinned: boolean; // "Important" flag
    readonly publish_at?: string;
    readonly published_at?: string; // Kept for backward compatibility if used, but schema says ensure one naming
    readonly expires_at?: string;
    readonly created_by: string;
    readonly created_at: string;
    readonly author_name?: string;
}

// ================= ADMIN =================
export interface AdminDashboardStats {
    readonly totalStudents: number;
    readonly staffPresent: number;
    readonly totalStaff: number;
    readonly complaints: number;
    readonly collection: number;
    readonly todayCollection?: number;
    readonly diaryEntriesToday?: number;
}

export interface AdminUser {
    readonly id: string;
    readonly email: string;
    readonly first_name: string;
    readonly last_name: string;
    readonly display_name: string;
    readonly photo_url?: string;
    readonly account_status: 'active' | 'inactive' | 'suspended';
    readonly last_login_at?: string;
    readonly roles: string[];
    readonly permissions: string[];
}

export interface CreateUserRequest {
    readonly email: string;
    readonly password?: string; // Optional if auto-generated
    readonly first_name: string;
    readonly last_name: string;
    readonly gender_id: number;
    readonly role_codes: string[]; // e.g., ['staff', 'admin']
}

export interface UpdateUserRequest {
    readonly first_name?: string;
    readonly last_name?: string;
    readonly account_status?: 'active' | 'inactive' | 'suspended';
    readonly roles?: string[]; // Full replacement of roles
}

export interface AssignRoleRequest {
    readonly user_id: string;
    readonly role_codes: string[];
}

// ================= NEXSYRUS TABS =================

// 1. Discipline
export interface DisciplineRecord {
    readonly id: string;
    readonly student_id: string;
    readonly incident_date: string;
    readonly title: string;
    readonly title_te?: string;
    readonly description?: string;
    readonly description_te?: string;
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly action_taken?: string;
    readonly reported_by?: string;
    readonly created_at: string;
}

// 2. Money Science
export interface MoneyScienceModule {
    readonly id: string;
    readonly title: string;
    readonly title_te?: string;
    readonly description?: string;
    readonly description_te?: string;
    readonly age_group?: string;
    readonly content_url?: string;
    readonly total_points: number;
    readonly content_body?: string;
    readonly thumbnail_url?: string;
}

export interface MoneyScienceProgress {
    readonly id: string;
    readonly module_id: string;
    readonly status: 'not_started' | 'in_progress' | 'completed';
    readonly progress_percentage: number;
    readonly completed_at?: string;
}

// 3. Science Projects
export interface ScienceProject {
    readonly id: string;
    readonly title: string;
    readonly title_te?: string;
    readonly description?: string;
    readonly description_te?: string;
    readonly difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
    readonly is_group_project: boolean;
    readonly min_participants: number;
    readonly max_participants: number;
    readonly user_status?: 'registered' | 'submitted' | 'evaluated' | 'certified'; // Joined view
    readonly user_grade?: string;
}

export interface ProjectSubmission {
    readonly id: string;
    readonly project_id: string;
    readonly status: string;
    readonly submission_url?: string;
    readonly certified_at?: string;
}

// 4. Life Values
export interface LifeValuesModule {
    readonly id: string;
    readonly title: string;
    readonly title_te?: string;
    readonly description?: string;
    readonly description_te?: string;
    readonly content_body?: string;
    readonly content_body_te?: string;
    readonly banner_image_url?: string;
    readonly thumbnail_url?: string;
}

export interface LifeValuesProgress {
    readonly id: string;
    readonly module_id: string;
    readonly status: 'active' | 'completed';
    readonly engagement_score: number;
    readonly completed_at?: string;
}

// ================= FINANCIAL POLICY =================
export interface FinancialPolicyRule {
    readonly id: string;
    readonly rule_code: string;
    readonly rule_name: string;
    readonly description?: string;
    readonly value_type: 'amount' | 'percentage' | 'boolean' | 'json';
    readonly default_value: any;
    readonly current_value: any;
    readonly is_active: boolean;
    readonly updated_at: string;
}

export interface FinancialAuditLog {
    readonly id: string;
    readonly table_name: string;
    readonly record_id: string;
    readonly action_type: 'DELETE' | 'UPDATE' | 'CREATE';
    readonly old_data?: any;
    readonly new_data?: any;
    readonly reason?: string;
    readonly performed_by: string; // user_id
    readonly performed_by_name?: string; // Joined view
    readonly performed_at: string;
}

// ================= COMPLAINTS =================
export interface Complaint {
    readonly id: string;
    readonly ticket_no: string;
    readonly title: string;
    readonly title_te?: string;
    readonly description: string;
    readonly description_te?: string;
    readonly category?: 'academic' | 'fee' | 'transport' | 'hostel' | 'other';
    readonly priority?: 'low' | 'medium' | 'high' | 'urgent';
    readonly status: 'open' | 'in_progress' | 'resolved' | 'closed';
    readonly raised_by: string;
    readonly raised_by_name?: string;
    readonly raised_for_student_id?: string;
    readonly assigned_to?: string;
    readonly resolution?: string;
    readonly resolution_te?: string;
    readonly created_at: string;
    readonly resolved_at?: string;
}
