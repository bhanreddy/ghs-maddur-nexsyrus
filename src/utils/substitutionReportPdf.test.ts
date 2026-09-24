import { SubstitutionBoard } from '../services/substitutionService';
import {
  buildSubstitutionReportHtml,
  getSubstitutionReportFileName,
  resolveSubstitutionReportLogo,
} from './substitutionReportPdf';
import { buildSubstitutionReportCsv } from './substitutionReportCsv';
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
    { id: 'p1', name: 'Period 1', start_time: '09:00', end_time: '09:45', sort_order: 1, is_break: false },
    { id: 'p2', name: 'Period 2', start_time: '09:45', end_time: '10:30', sort_order: 2, is_break: false },
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
    expect(html).toContain('Powered by Nexsyrus SIMS');
    expect(html).toContain('Mr. Arun');
    expect(html).toContain('Ms. Bina');
    expect(html).toContain('<th>Signature</th>');
    expect(html).toContain('class="signature-cell"');
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('margin: 7px 0 8px;');
    expect(html).toContain('class="period-time"');
    expect(html).not.toContain('<th>Subject</th>');
    expect(html).not.toContain('Mathematics');
    expect(html).not.toContain('English');
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

  describe('Period numbering edge cases in exports', () => {
    const boardWithBreaks: SubstitutionBoard = {
      date: '2026-09-24',
      academic_year_id: 'ay-1',
      timetable_day: 'Thursday',
      timetable_mode: 'uniform',
      periods: [
        { id: 'p0', name: 'Assembly', start_time: '08:00', end_time: '08:30', sort_order: 1, is_break: true },
        { id: 'p1', name: 'Math Period', start_time: '08:30', end_time: '09:15', sort_order: 2, is_break: false },
        { id: 'p2', name: 'English Period', start_time: '09:15', end_time: '10:00', sort_order: 3, is_break: false },
        { id: 'p3', name: 'Recess', start_time: '10:00', end_time: '10:15', sort_order: 4, is_break: true },
        { id: 'p4', name: 'Science Period', start_time: '10:15', end_time: '11:00', sort_order: 5, is_break: false },
        { id: 'p5', name: 'Midday Break', start_time: '11:00', end_time: '11:15', sort_order: 6, is_break: true },
        { id: 'p6', name: 'Lunch', start_time: '11:15', end_time: '12:00', sort_order: 7, is_break: true },
        { id: 'p7', name: 'Social Studies', start_time: '12:00', end_time: '12:45', sort_order: 8, is_break: false },
      ],
      teachers: [],
      slots: [
        {
          slot_id: 's-math',
          class_section_id: 'cs-1',
          period_number: 2, // sort_order 2
          start_time: '08:30',
          end_time: '09:15',
          class_name: '10',
          section_name: 'A',
          subject_id: 'sub-m',
          subject_name: 'Mathematics',
          regular_teacher_id: 't-1',
          regular_teacher_name: 'Teacher 1',
          substitution_id: 'sub-1',
          substitute_teacher_id: 'sub-t1',
          substitute_teacher_name: 'Sub Teacher 1',
        },
        {
          slot_id: 's-eng',
          class_section_id: 'cs-2',
          period_number: 3, // sort_order 3
          start_time: '09:15',
          end_time: '10:00',
          class_name: '10',
          section_name: 'B',
          subject_id: 'sub-e',
          subject_name: 'English',
          regular_teacher_id: 't-2',
          regular_teacher_name: 'Teacher 2',
          substitution_id: 'sub-2',
          substitute_teacher_id: 'sub-t2',
          substitute_teacher_name: 'Sub Teacher 2',
        },
        {
          slot_id: 's-sci',
          class_section_id: 'cs-3',
          period_number: 5, // sort_order 5 (after Recess sort_order 4)
          start_time: '10:15',
          end_time: '11:00',
          class_name: '9',
          section_name: 'A',
          subject_id: 'sub-s',
          subject_name: 'Science',
          regular_teacher_id: 't-3',
          regular_teacher_name: 'Teacher 3',
          substitution_id: 'sub-3',
          substitute_teacher_id: 'sub-t3',
          substitute_teacher_name: 'Sub Teacher 3',
        },
        {
          slot_id: 's-soc',
          class_section_id: 'cs-4',
          period_number: 8, // sort_order 8 (after Midday Break 6 & Lunch 7)
          start_time: '12:00',
          end_time: '12:45',
          class_name: '9',
          section_name: 'B',
          subject_id: 'sub-ss',
          subject_name: 'Social Studies',
          regular_teacher_id: 't-4',
          regular_teacher_name: 'Teacher 4',
          substitution_id: 'sub-4',
          substitute_teacher_id: 'sub-t4',
          substitute_teacher_name: 'Sub Teacher 4',
        },
      ],
      summary: { total_slots: 4, covered_slots: 4, uncovered_slots: 0 },
    };

    it('numbers teaching periods continuously as P1, P2, P3, P4 despite breaks and assembly', () => {
      const html = buildSubstitutionReportHtml({
        board: boardWithBreaks,
        mode: 'complete',
      });

      // Math is after Assembly (break), so it must be P1
      expect(html).toContain('<strong>P1</strong>');
      // English is P2
      expect(html).toContain('<strong>P2</strong>');
      // Science is after Recess (break), so it must be P3 (NOT P4 or P5)
      expect(html).toContain('<strong>P3</strong>');
      // Social Studies is after Midday Break & Lunch (2 consecutive breaks), so it must be P4 (NOT P8)
      expect(html).toContain('<strong>P4</strong>');

      // It must NOT contain P5 or P8
      expect(html).not.toContain('<strong>P5</strong>');
      expect(html).not.toContain('<strong>P8</strong>');
    });

    it('groups period-wise using continuous teaching periods', () => {
      const html = buildSubstitutionReportHtml({
        board: boardWithBreaks,
        mode: 'period',
      });

      expect(html).toContain('Period 1');
      expect(html).toContain('Period 2');
      expect(html).toContain('Period 3');
      expect(html).toContain('Period 4');
    });

    it('exports CSV using identical continuous period numbering', () => {
      const csv = buildSubstitutionReportCsv(boardWithBreaks);
      const lines = csv.split('\n');

      expect(lines[0]).toContain('#,Date,Period,Time,Class');
      // Math -> P1
      expect(lines[1]).toContain('P1');
      // English -> P2
      expect(lines[2]).toContain('P2');
      // Science -> P3
      expect(lines[3]).toContain('P3');
      // Social Studies -> P4
      expect(lines[4]).toContain('P4');
    });
  });
});
