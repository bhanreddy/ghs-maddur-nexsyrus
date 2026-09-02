import { SubstitutionBoard } from '../services/substitutionService';
import {
  buildSubstitutionReportHtml,
  getSubstitutionReportFileName,
  resolveSubstitutionReportLogo,
} from './substitutionReportPdf';
import { bundledAssetToBase64Uri, resolveApiAssetUrl, toBase64Uri } from './toBase64Uri';

jest.mock('./pdfGenerator', () => ({ printHtmlOnWeb: jest.fn() }));
jest.mock('./toBase64Uri', () => ({
  resolveApiAssetUrl: jest.fn((value: string) => value),
  toBase64Uri: jest.fn(async (value: string) => `data:image/png;base64,${value}`),
  bundledAssetToBase64Uri: jest.fn(async () => 'data:image/png;base64,bundled-school-logo'),
}));

const board: SubstitutionBoard = {
  date: '2026-09-02',
  academic_year_id: 'ay-1',
  timetable_day: 'Wednesday',
  timetable_mode: 'uniform',
  periods: [
    { id: 'p1', name: 'Period 1', start_time: '09:00', end_time: '09:45', sort_order: 1 },
    { id: 'p2', name: 'Period 2', start_time: '09:45', end_time: '10:30', sort_order: 2 },
  ],
  teachers: [],
  slots: [
    {
      slot_id: 'slot-2',
      class_section_id: 'c2',
      period_number: 2,
      start_time: '09:45',
      end_time: '10:30',
      class_name: '8',
      section_name: 'B',
      subject_id: 'math',
      subject_name: 'Mathematics',
      regular_teacher_id: 'regular-2',
      regular_teacher_name: 'Mrs. Regular Two',
      substitution_id: 'sub-2',
      substitute_teacher_id: 'teacher-b',
      substitute_teacher_name: 'Ms. Bina',
      reason: 'Training',
    },
    {
      slot_id: 'slot-1',
      class_section_id: 'c1',
      period_number: 1,
      start_time: '09:00',
      end_time: '09:45',
      class_name: '7',
      section_name: 'A',
      subject_id: 'eng',
      subject_name: 'English',
      regular_teacher_id: 'regular-1',
      regular_teacher_name: 'Mr. Regular One',
      substitution_id: 'sub-1',
      substitute_teacher_id: 'teacher-a',
      substitute_teacher_name: 'Mr. Arun',
    },
    {
      slot_id: 'slot-unassigned',
      class_section_id: 'c3',
      period_number: 1,
      start_time: '09:00',
      end_time: '09:45',
      class_name: '9',
      section_name: 'C',
      subject_id: 'sci',
      subject_name: 'Science',
      regular_teacher_id: 'regular-3',
      regular_teacher_name: 'Hidden Unassigned Teacher',
    },
  ],
  summary: { total_slots: 3, covered_slots: 2, uncovered_slots: 1 },
};

describe('substitution report PDF', () => {
  it('renders a branded complete list with assigned substitutions only', () => {
    const html = buildSubstitutionReportHtml({
      board,
      mode: 'complete',
      schoolName: 'Premium Public School',
      logoUri: 'data:image/png;base64,school-logo',
      generatedAt: new Date('2026-09-02T08:30:00+05:30'),
    });

    expect(html).toContain('Premium Public School');
    expect(html).toContain('data:image/png;base64,school-logo');
    expect(html).toContain('Daily Substitution Report');
    expect(html).toContain('All assigned substitutions');
    expect(html).toContain('Mr. Arun');
    expect(html).toContain('Ms. Bina');
    expect(html).toContain('<th>Signature</th>');
    expect(html).toContain('class="signature-cell"');
    expect(html).not.toContain('Note / reason');
    expect(html).not.toContain('Training');
    expect(html).not.toContain('Hidden Unassigned Teacher');
    expect(html.indexOf('Mr. Arun')).toBeLessThan(html.indexOf('Ms. Bina'));
  });

  it('supports teacher-wise, period-wise, and class-wise arrangements', () => {
    const teacherHtml = buildSubstitutionReportHtml({ board, mode: 'teacher' });
    const periodHtml = buildSubstitutionReportHtml({ board, mode: 'period' });
    const classHtml = buildSubstitutionReportHtml({ board, mode: 'class' });

    expect(teacherHtml).toContain('Teacher-wise');
    expect(teacherHtml).toContain('Mr. Arun');
    expect(periodHtml).toContain('Period-wise');
    expect(periodHtml).toContain('9:00 AM - 9:45 AM');
    expect(classHtml).toContain('Class-wise');
    expect(classHtml).toContain('<h2>7-A</h2>');
  });

  it('uses a stable, descriptive filename', () => {
    expect(getSubstitutionReportFileName('2026-09-02', 'teacher'))
      .toBe('substitutions-2026-09-02-teacher.pdf');
  });

  it('embeds the school-profile logo when the environment logo is unavailable', async () => {
    await expect(resolveSubstitutionReportLogo('https://cdn.example.com/school-logo.png'))
      .resolves.toBe('data:image/png;base64,https://cdn.example.com/school-logo.png');
    expect(resolveApiAssetUrl).toHaveBeenCalledWith('https://cdn.example.com/school-logo.png');
    expect(toBase64Uri).toHaveBeenCalledWith('https://cdn.example.com/school-logo.png');
  });

  it('uses assets/images/icon.png when school_logo_url is empty', async () => {
    await expect(resolveSubstitutionReportLogo(null))
      .resolves.toBe('data:image/png;base64,bundled-school-logo');
    expect(bundledAssetToBase64Uri).toHaveBeenCalledWith(expect.anything(), 'image/png');
  });
});
