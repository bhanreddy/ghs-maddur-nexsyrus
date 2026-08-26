import {
  buildTwoUpProgressReportHtml,
  ProgressReportBrand,
  ProgressReportStudent,
  progressReportSummary,
} from './progressReportHtml';

const brand: ProgressReportBrand = {
  name: 'Tenant School',
  address: 'School address',
  contact: '1234567890',
  email: 'school@example.com',
  affiliation: 'State recognised',
  tagline: 'Learn and grow.',
  logoUrl: '',
  primary: '#173f7a',
  secondary: '#ed6b21',
};

const student: ProgressReportStudent = {
  id: 'student-1',
  admissionNo: 'ADM-1',
  name: 'Test Student',
  parentName: 'Test Parent',
  classLabel: '5 - A',
  rollNo: '1',
  academicYear: '2026-2027',
  attendance: '90 / 100',
  examName: 'FA-1',
  examDate: '20 Aug 2026',
  subjects: [
    {
      subject: 'English',
      assessmentSchema: 'consolidated',
      maxMarks: 25,
      passingMarks: 9,
      obtained: 21,
      consolidatedMaxMarks: 25,
      consolidatedMarksObtained: 21,
      componentMaximums: { participation: 10, writtenWork: 10, projectWork: 10, slipTest: 20 },
      participationMarks: null,
      writtenWorkMarks: null,
      projectWorkMarks: null,
      slipTestMarks: null,
      grade: 'A1',
      remarks: 'Well done',
      isAbsent: false,
      hasMarks: true,
    },
    {
      subject: 'Mathematics',
      assessmentSchema: 'component',
      maxMarks: 50,
      passingMarks: 18,
      obtained: 44,
      consolidatedMaxMarks: 25,
      consolidatedMarksObtained: null,
      componentMaximums: { participation: 10, writtenWork: 10, projectWork: 10, slipTest: 20 },
      participationMarks: 9,
      writtenWorkMarks: 9,
      projectWorkMarks: 8,
      slipTestMarks: 18,
      grade: 'A1',
      remarks: '',
      isAbsent: false,
      hasMarks: true,
    },
  ],
};

describe('progress report HTML', () => {
  it('uses only subjects matching the chosen assessment format', () => {
    expect(progressReportSummary(student, 'direct').subjects.map((item) => item.subject)).toEqual(['English']);
    expect(progressReportSummary(student, 'component').subjects.map((item) => item.subject)).toEqual(['Mathematics']);
  });

  it('duplicates a single student into two labelled copies on one A4 page', () => {
    const output = buildTwoUpProgressReportHtml([student], 'direct', brand, { duplicateSingle: true });
    expect(output.match(/class="report-card direct"/g)).toHaveLength(2);
    expect(output).toContain('School copy');
    expect(output).toContain('Parent copy');
    expect(output).toContain('Tenant School');
    expect(output).toContain('@page { size: A4 portrait');
  });

  it('renders the stored component columns', () => {
    const output = buildTwoUpProgressReportHtml([student, { ...student, id: 'student-2' }], 'component', brand);
    expect(output).toContain('Component-Based Assessment');
    expect(output).toContain('Participation');
    expect(output).toContain('Written');
    expect(output).toContain('Project');
    expect(output).toContain('Slip test');
  });
});
