/**
 * Client-side Telugu notification translation map.
 * Used as fallback when backend Telugu rendering is unavailable.
 * Maps notification `type` values to Telugu title/body.
 *
 * For body: if the value is a function, it receives the original body and returns translated text.
 *           if the value is a string, it replaces the title/body entirely.
 */

export interface NotificationTranslation {
    title: string;
    /** Static body replacement, or null to keep original body text */
    body: string | null;
}

export const TELUGU_NOTIFICATION_MAP: Record<string, NotificationTranslation> = {
    // Attendance
    ATTENDANCE_ABSENT: {
        title: 'హాజరు హెచ్చరిక',
        body: null, // Keep dynamic body (date-based)
    },
    ATTENDANCE_PRESENT: {
        title: 'హాజరు నవీకరణ',
        body: null,
    },

    // Diary
    DIARY_UPDATED: {
        title: 'డైరీ నవీకరణ',
        body: null,
    },

    // Results
    RESULT_RELEASED: {
        title: 'ఫలితాలు ప్రకటించబడ్డాయి',
        body: null,
    },

    // Complaints
    COMPLAINT_CREATED: {
        title: 'కొత్త ఫిర్యాదు',
        body: null,
    },
    COMPLAINT_RESPONSE: {
        title: 'ఫిర్యాదు నవీకరణ',
        body: null,
    },

    // LMS
    LMS_CONTENT: {
        title: 'కొత్త అధ్యయన సామగ్రి',
        body: null,
    },

    // Timetable
    TIMETABLE_UPDATED: {
        title: 'టైమ్‌టేబుల్ నవీకరణ',
        body: null,
    },

    // Notices
    NOTICE_ADMIN_STUDENT: {
        title: 'అడ్మిన్ నోటీసు',
        body: null,
    },

    // Fees
    FEE_REMINDER: {
        title: 'ఫీజు రిమైండర్',
        body: null,
    },
    FEE_COLLECTED: {
        title: 'ఫీజు అందుకున్నారు',
        body: null,
    },

    // Leaves
    LEAVE_SUBMITTED: {
        title: 'సెలవు అభ్యర్థన',
        body: null,
    },
    LEAVE_APPROVED: {
        title: 'సెలవు ఆమోదించబడింది',
        body: null,
    },
    LEAVE_REJECTED: {
        title: 'సెలవు తిరస్కరించబడింది',
        body: null,
    },

    // Expenses
    EXPENSE_CREATED: {
        title: 'ఖర్చు సమర్పించబడింది',
        body: null,
    },
    EXPENSE_APPROVED: {
        title: 'ఖర్చు ఆమోదించబడింది',
        body: null,
    },
    EXPENSE_REJECTED: {
        title: 'ఖర్చు తిరస్కరించబడింది',
        body: null,
    },

    // Payroll
    PAYROLL_SUCCESS: {
        title: 'జీతం జమ అయింది',
        body: null,
    },

    // Access Control
    ACCESS_RESPONSE: {
        title: 'యాక్సెస్ అభ్యర్థన నవీకరణ',
        body: null,
    },
};

/**
 * Translates a notification to Telugu if translation exists.
 * @param type - FCM data.type value (e.g. 'ATTENDANCE_PRESENT')
 * @param title - Original English title
 * @param body - Original English body
 * @returns Translated { title, body } or original if no translation found
 */
export function translateNotification(
    type: string,
    title: string,
    body: string
): { title: string; body: string } {
    const translation = TELUGU_NOTIFICATION_MAP[type];
    if (!translation) {
        return { title, body };
    }

    return {
        title: translation.title || title,
        body: translation.body || body, // null means keep original body
    };
}
