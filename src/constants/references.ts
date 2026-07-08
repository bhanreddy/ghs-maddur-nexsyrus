/**
 * Reference data constants derived from backend schema (schema.sql seed data).
 * Use these for dropdowns and mapping IDs to labels.
 */

export const GENDERS = [
    { id: 1, name: 'Male' },
    { id: 2, name: 'Female' },
    { id: 3, name: 'Other' },
];

export const STUDENT_STATUSES = [
    { id: 1, name: 'Active', code: 'active' },
    { id: 2, name: 'Graduated', code: 'graduated' },
    { id: 3, name: 'Withdrawn', code: 'withdrawn' },
];

export const BLOOD_GROUPS = [
    { id: 1, name: 'A+' },
    { id: 2, name: 'A-' },
    { id: 3, name: 'B+' },
    { id: 4, name: 'B-' },
    { id: 5, name: 'AB+' },
    { id: 6, name: 'AB-' },
    { id: 7, name: 'O+' },
    { id: 8, name: 'O-' },
];

export const RELATIONSHIP_TYPES = [
    { id: 1, name: 'Father' },
    { id: 2, name: 'Mother' },
    { id: 3, name: 'Guardian' },
];

export const STUDENT_CATEGORIES = [
    { id: 1, name: 'General' },
    { id: 2, name: 'OBC' },
    { id: 3, name: 'SC/ST' },
];

export const RELIGIONS = [
    { id: 1, name: 'Hindu' },
    { id: 2, name: 'Muslim' },
    { id: 3, name: 'Christian' },
    { id: 4, name: 'Sikh' },
    { id: 5, name: 'Other' },
];
