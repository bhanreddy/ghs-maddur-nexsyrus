export type ProgressReportType = 'direct' | 'component';
export type ProgressReportLayout = 'ultra-premium' | 'normal';

export interface ProgressReportBrand {
  name: string;
  address: string;
  contact: string;
  email: string;
  affiliation: string;
  tagline: string;
  logoUrl: string;
  primary: string;
  secondary: string;
}

export interface ProgressReportSubject {
  subject: string;
  assessmentSchema: 'component' | 'consolidated';
  maxMarks: number;
  passingMarks: number;
  obtained: number | null;
  consolidatedMaxMarks: number;
  consolidatedMarksObtained: number | null;
  componentMaximums: {
    participation: number;
    writtenWork: number;
    projectWork: number;
    slipTest: number;
  };
  participationMarks: number | null;
  writtenWorkMarks: number | null;
  projectWorkMarks: number | null;
  slipTestMarks: number | null;
  grade: string;
  remarks: string;
  isAbsent: boolean;
  hasMarks: boolean;
}

export interface ProgressReportStudent {
  id: string;
  admissionNo: string;
  name: string;
  parentName: string;
  classLabel: string;
  rollNo: string;
  academicYear: string;
  attendance: string;
  examName: string;
  examDate: string;
  subjects: ProgressReportSubject[];
  classRank?: number | null;
}

const html = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const mark = (value: number | null | undefined, absent = false) => {
  if (absent) return 'Absent';
  if (value == null || !Number.isFinite(Number(value))) return '-';
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
};

const reportSubjects = (
  student: ProgressReportStudent,
  reportType: ProgressReportType,
) => student.subjects.filter((subject) =>
  reportType === 'component'
    ? subject.assessmentSchema === 'component'
    : subject.assessmentSchema === 'consolidated',
);

export function progressReportSummary(
  student: ProgressReportStudent,
  reportType: ProgressReportType,
) {
  const subjects = reportSubjects(student, reportType);
  let totalObtained = 0;
  let totalMax = 0;
  let completed = 0;
  let failed = false;

  subjects.forEach((subject) => {
    const maximum = reportType === 'direct'
      ? subject.consolidatedMaxMarks || subject.maxMarks
      : subject.maxMarks;
    const obtained = reportType === 'direct'
      ? subject.consolidatedMarksObtained ?? subject.obtained
      : subject.obtained;
    totalMax += maximum;
    if (!subject.hasMarks) return;
    completed += 1;
    if (!subject.isAbsent && obtained != null) totalObtained += Number(obtained);
    if (
      subject.isAbsent ||
      (obtained != null && Number(obtained) < (subject.passingMarks || maximum * 0.35))
    ) failed = true;
  });

  const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const pending = subjects.length - completed;
  return {
    subjects,
    totalObtained,
    totalMax,
    percentage,
    pending,
    result: subjects.length === 0 || pending > 0 ? 'PENDING' : failed ? 'NEEDS SUPPORT' : 'PROMOTED',
  };
}

function subjectRows(student: ProgressReportStudent, reportType: ProgressReportType) {
  const { subjects } = progressReportSummary(student, reportType);
  if (!subjects.length) {
    return `<tr><td colspan="9" class="empty-row">No ${reportType === 'direct' ? 'direct' : 'component-based'} assessment marks are available for this exam.</td></tr>`;
  }

  return subjects.slice(0, 10).map((subject, index) => {
    if (reportType === 'component') {
      if (subject.isAbsent) {
        return `<tr>
          <td>${index + 1}</td>
          <td class="subject">${html(subject.subject)}</td>
          <td colspan="6" class="absent-mark">Absent</td>
        </tr>`;
      }
      return `<tr>
        <td>${index + 1}</td>
        <td class="subject">${html(subject.subject)}</td>
        <td>${mark(subject.participationMarks, subject.isAbsent)}</td>
        <td>${mark(subject.writtenWorkMarks, subject.isAbsent)}</td>
        <td>${mark(subject.projectWorkMarks, subject.isAbsent)}</td>
        <td>${mark(subject.slipTestMarks, subject.isAbsent)}</td>
        <td class="total">${mark(subject.obtained, subject.isAbsent)} / ${mark(subject.maxMarks)}</td>
        <td>${html(subject.grade || '-')}</td>
      </tr>`;
    }
    return `<tr>
      <td>${index + 1}</td>
      <td class="subject">${html(subject.subject)}</td>
      <td>${mark(subject.consolidatedMaxMarks || subject.maxMarks)}</td>
      <td class="total">${mark(subject.consolidatedMarksObtained ?? subject.obtained, subject.isAbsent)}</td>
      <td>${html(subject.grade || '-')}</td>
      <td class="remarks">${html(subject.remarks || '')}</td>
    </tr>`;
  }).join('');
}

function card(
  student: ProgressReportStudent,
  reportType: ProgressReportType,
  brand: ProgressReportBrand,
  copyLabel = '',
) {
  const summary = progressReportSummary(student, reportType);
  const logo = brand.logoUrl
    ? `<img src="${html(brand.logoUrl)}" alt="School logo" />`
    : `<div class="logo-fallback">${html(brand.name.slice(0, 2).toUpperCase())}</div>`;
  const resultClass = summary.result === 'PROMOTED'
    ? 'pass'
    : summary.result === 'PENDING'
      ? 'pending'
      : 'support';
  const columns = reportType === 'component'
    ? `<th>No.</th><th class="subject">Subject</th><th>Participation<small>/${mark(summary.subjects[0]?.componentMaximums.participation ?? 10)}</small></th><th>Written<small>/${mark(summary.subjects[0]?.componentMaximums.writtenWork ?? 10)}</small></th><th>Project<small>/${mark(summary.subjects[0]?.componentMaximums.projectWork ?? 10)}</small></th><th>Slip test<small>/${mark(summary.subjects[0]?.componentMaximums.slipTest ?? 20)}</small></th><th>Total</th><th>Grade</th>`
    : '<th>No.</th><th class="subject">Subject</th><th>Max.</th><th>Marks</th><th>Grade</th><th class="remarks">Teacher\'s remarks</th>';
  const contact = [brand.address, brand.contact ? `Ph: ${brand.contact}` : '', brand.email]
    .filter(Boolean)
    .join('  |  ');

  return `<article class="report-card ${reportType}${copyLabel ? ' has-copy-label' : ''}">
    <div class="top-accent"></div>
    <header class="school-header">
      <div class="logo">${logo}</div>
      <div class="school-copy">
        <div class="school-name">${html(brand.name)}</div>
        ${brand.affiliation ? `<div class="affiliation">${html(brand.affiliation)}</div>` : ''}
        <div class="contact">${html(contact)}</div>
      </div>
      ${copyLabel ? `<div class="copy-label">${html(copyLabel)}</div>` : ''}
    </header>
    <div class="title-row">
      <div>
        <div class="report-kind">${reportType === 'component' ? 'Component-Based Assessment' : 'Direct Assessment'}</div>
        <div class="report-title">${html(student.examName)} Progress Report</div>
      </div>
      <div class="year"><span>Academic year</span>${html(student.academicYear)}</div>
    </div>
    <section class="student-info">
      <div class="wide"><span>Student</span><strong>${html(student.name)}</strong></div>
      <div><span>Class & Section</span><strong>${html(student.classLabel)}</strong></div>
      <div><span>Roll No.</span><strong>${html(student.rollNo)}</strong></div>
      <div class="wide"><span>Parent / Guardian</span><strong>${html(student.parentName)}</strong></div>
      <div><span>Admission No.</span><strong>${html(student.admissionNo)}</strong></div>
      <div><span>Assessment date</span><strong>${html(student.examDate || '-')}</strong></div>
    </section>
    <table>
      <thead><tr>${columns}</tr></thead>
      <tbody>${subjectRows(student, reportType)}</tbody>
      <tfoot><tr><td></td><td class="subject">GRAND TOTAL</td><td colspan="${reportType === 'component' ? 4 : 1}"></td><td class="total">${mark(summary.totalObtained)} / ${mark(summary.totalMax)}</td><td colspan="${reportType === 'component' ? 1 : 2}"></td></tr></tfoot>
    </table>
    <section class="summary">
      <div><span>Overall result</span><strong class="result ${resultClass}">${summary.result}</strong></div>
      <div><span>Percentage</span><strong>${summary.totalMax ? `${summary.percentage.toFixed(1)}%` : '-'}</strong></div>
      <div><span>Class rank</span><strong>${student.classRank ? `#${student.classRank}` : '-'}</strong></div>
      <div><span>Attendance</span><strong>${html(student.attendance)}</strong></div>
    </section>
    <div class="strength"><span>Strengths / Areas of improvement</span><div></div></div>
    <footer>
      <div><i></i><span>Class Teacher</span></div>
      <div class="motto">${html(brand.tagline || 'Learn. Grow. Shine.')}</div>
      <div><i></i><span>Parent / Guardian</span></div>
      <div><i></i><span>Principal</span></div>
    </footer>
  </article>`;
}

function stylesheet(brand: ProgressReportBrand) {
  return `<style>
    @page { size: A4 portrait; margin: 6mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; background: #fff; color: #172033; font-family: Inter, "Segoe UI", Arial, sans-serif; }
    .page { height: 285mm; break-after: page; page-break-after: always; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .layout-normal .page { display: grid; grid-template-rows: minmax(0, 1fr) 7mm minmax(0, 1fr); }
    .layout-ultra-premium .page { display: block; }
    .report-card { position: relative; height: 100%; overflow: hidden; border: .35mm solid #cbd5e1; border-radius: 2.4mm; padding: 3mm 3.5mm 2.4mm; background: linear-gradient(180deg, #fff 0%, #fff 86%, #f8fafc 100%); }
    .top-accent { position: absolute; top: 0; left: 0; right: 0; height: 1.4mm; background: linear-gradient(90deg, ${brand.primary}, ${brand.secondary}); }
    .school-header { height: 18mm; display: grid; grid-template-columns: 18mm 1fr 20mm; align-items: center; border-bottom: .3mm solid #dbe4ef; padding-top: 1mm; }
    .logo { width: 16mm; height: 16mm; display: grid; place-items: center; overflow: hidden; }
    .logo img { width: 16mm; height: 16mm; object-fit: contain; display: block; }
    .logo-fallback { width: 12mm; height: 12mm; border-radius: 50%; display: grid; place-items: center; background: ${brand.primary}; color: #fff; font-size: 9pt; font-weight: 900; }
    .school-copy { text-align: center; min-width: 0; }
    .school-name { color: ${brand.primary}; text-transform: uppercase; font-size: 14.2pt; line-height: 1.05; font-weight: 900; letter-spacing: .35pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .affiliation { color: ${brand.secondary}; font-size: 6.3pt; line-height: 1.3; font-weight: 800; letter-spacing: .35pt; text-transform: uppercase; }
    .contact { color: #596579; font-size: 6.1pt; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .copy-label { justify-self: end; align-self: start; margin-top: 2mm; color: #8792a5; font-size: 6pt; font-weight: 800; letter-spacing: .4pt; text-transform: uppercase; }
    .title-row { min-height: 12mm; display: flex; align-items: center; justify-content: space-between; gap: 4mm; padding: 1.7mm .8mm 1.5mm; }
    .report-kind { color: ${brand.secondary}; font-size: 6.2pt; line-height: 1.2; font-weight: 900; letter-spacing: .65pt; text-transform: uppercase; }
    .report-title { color: #172033; font-size: 10pt; line-height: 1.2; font-weight: 900; text-transform: uppercase; }
    .year { text-align: right; font-size: 7.8pt; font-weight: 800; white-space: nowrap; }
    .year span { display: block; color: #7b879b; font-size: 5.2pt; line-height: 1.2; letter-spacing: .35pt; text-transform: uppercase; }
    .student-info { display: grid; grid-template-columns: 1.3fr .75fr .55fr; border: .25mm solid #cbd5e1; border-radius: 1mm; background: #f8fafc; margin-bottom: 1.7mm; overflow: hidden; }
    .student-info > div { min-width: 0; padding: 1.05mm 1.5mm; border-right: .2mm solid #dbe4ef; border-bottom: .2mm solid #dbe4ef; }
    .student-info > div:nth-child(3n) { border-right: 0; }
    .student-info > div:nth-last-child(-n+3) { border-bottom: 0; }
    .student-info span, .summary span { display: block; color: #7a879a; font-size: 5.2pt; line-height: 1.1; font-weight: 800; letter-spacing: .35pt; text-transform: uppercase; }
    .student-info strong { display: block; overflow: hidden; color: #1e293b; font-size: 7.5pt; line-height: 1.35; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
    th { height: 6mm; padding: .7mm .8mm; background: ${brand.primary}; border: .18mm solid rgba(255,255,255,.2); color: #fff; font-size: 5.9pt; line-height: 1.05; font-weight: 800; text-align: center; }
    th small { display: block; opacity: .8; font-size: 4.9pt; }
    td { height: 4.45mm; padding: .5mm .8mm; border: .2mm solid #d6deea; color: #263247; font-size: 6.25pt; line-height: 1.1; font-weight: 650; text-align: center; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    th:first-child, td:first-child { width: 7mm; }
    th.subject, td.subject { width: 45mm; text-align: left; }
    .component th.subject, .component td.subject { width: 37mm; }
    .direct th.remarks, .direct td.remarks { width: 52mm; text-align: left; }
    td.total { color: ${brand.primary}; font-weight: 900; }
    td.absent-mark { color: #b42318; font-weight: 900; letter-spacing: .15pt; }
    tfoot td { height: 4.8mm; background: #eef2f7; font-weight: 900; }
    .empty-row { height: 27mm; color: #8b96a8; font-style: italic; text-align: center; }
    .summary { display: grid; grid-template-columns: 1.2fr .85fr .75fr 1fr; margin-top: 1.6mm; border: .25mm solid #cbd5e1; border-radius: 1mm; overflow: hidden; }
    .summary > div { min-width: 0; padding: 1.1mm 1.5mm; border-right: .2mm solid #dbe4ef; }
    .summary > div:last-child { border-right: 0; }
    .summary strong { color: #172033; font-size: 7.3pt; line-height: 1.3; font-weight: 900; }
    .summary .result { font-size: 6.1pt; letter-spacing: .3pt; }
    .result.pass { color: #087f5b; } .result.pending { color: #a16207; } .result.support { color: #b42318; }
    .strength { height: 6.5mm; display: flex; align-items: center; gap: 2mm; padding: 1.1mm .8mm 0; color: #596579; font-size: 5.9pt; font-weight: 800; }
    .strength div { flex: 1; height: 3mm; border-bottom: .2mm solid #9aa6b7; }
    footer { display: grid; grid-template-columns: 1fr 1.25fr 1fr 1fr; gap: 5mm; align-items: end; padding: .8mm 2mm 0; color: #536075; font-size: 5.7pt; font-weight: 800; text-align: center; }
    footer > div:not(.motto) i { display: block; height: 4.5mm; border-bottom: .2mm solid #7b8797; margin-bottom: .8mm; }
    footer .motto { align-self: center; color: ${brand.secondary}; font-size: 5.8pt; font-style: italic; }
    .empty-slot { border: .25mm dashed #d6deea; border-radius: 2mm; }
    .tear-strip { position: relative; display: flex; align-items: center; justify-content: center; color: #7b879b; font-size: 5.8pt; font-weight: 800; letter-spacing: .35pt; text-transform: uppercase; }
    .tear-strip::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: .35mm dashed #94a3b8; }
    .tear-strip span { position: relative; padding: 0 3mm; background: #fff; }

    .layout-ultra-premium .report-card { padding: 7mm 8mm 6mm; border-width: .5mm; border-radius: 3.5mm; background: linear-gradient(180deg, #fff 0%, #fff 78%, #f4f7fb 100%); }
    .layout-ultra-premium .top-accent { height: 2.2mm; }
    .layout-ultra-premium .school-header { height: 32mm; grid-template-columns: 30mm 1fr; padding-top: 2mm; }
    .layout-ultra-premium .has-copy-label .school-header { grid-template-columns: 30mm 1fr 24mm; }
    .layout-ultra-premium .logo, .layout-ultra-premium .logo img { width: 27mm; height: 27mm; }
    .layout-ultra-premium .logo-fallback { width: 23mm; height: 23mm; font-size: 15pt; }
    .layout-ultra-premium .school-name { font-size: 18.5pt; letter-spacing: .45pt; }
    .layout-ultra-premium .has-copy-label .school-name { font-size: 16pt; }
    .layout-ultra-premium .affiliation { font-size: 9pt; margin-top: 1mm; }
    .layout-ultra-premium .contact { font-size: 8.5pt; margin-top: .6mm; }
    .layout-ultra-premium .copy-label { font-size: 8pt; margin-top: 3mm; }
    .layout-ultra-premium .title-row { min-height: 24mm; padding: 4mm 1.5mm 3mm; }
    .layout-ultra-premium .report-kind { font-size: 9pt; }
    .layout-ultra-premium .report-title { font-size: 16pt; margin-top: 1mm; }
    .layout-ultra-premium .year { font-size: 11.5pt; }
    .layout-ultra-premium .year span { font-size: 7.5pt; }
    .layout-ultra-premium .student-info { margin-bottom: 4mm; border-radius: 1.7mm; }
    .layout-ultra-premium .student-info > div { padding: 2.4mm 2.8mm; }
    .layout-ultra-premium .student-info span, .layout-ultra-premium .summary span { font-size: 7.5pt; }
    .layout-ultra-premium .student-info strong { font-size: 11.5pt; line-height: 1.5; }
    .layout-ultra-premium th { height: 10mm; padding: 1.4mm; font-size: 9pt; }
    .layout-ultra-premium th small { font-size: 7pt; }
    .layout-ultra-premium td { height: 8.4mm; padding: 1.2mm 1.4mm; font-size: 10pt; }
    .layout-ultra-premium th:first-child, .layout-ultra-premium td:first-child { width: 10mm; }
    .layout-ultra-premium th.subject, .layout-ultra-premium td.subject { width: 52mm; }
    .layout-ultra-premium .component th.subject, .layout-ultra-premium .component td.subject { width: 47mm; }
    .layout-ultra-premium .direct th.remarks, .layout-ultra-premium .direct td.remarks { width: 55mm; }
    .layout-ultra-premium tfoot td { height: 9mm; }
    .layout-ultra-premium .summary { margin-top: 4mm; border-radius: 1.7mm; }
    .layout-ultra-premium .summary > div { padding: 3mm; }
    .layout-ultra-premium .summary strong { font-size: 11.5pt; line-height: 1.55; }
    .layout-ultra-premium .summary .result { font-size: 9.5pt; }
    .layout-ultra-premium .strength { height: 20mm; padding: 4mm 1.5mm 0; font-size: 9pt; align-items: flex-start; }
    .layout-ultra-premium .strength div { height: 10mm; }
    .layout-ultra-premium footer { gap: 8mm; padding: 3mm 3mm 0; font-size: 8.5pt; }
    .layout-ultra-premium footer > div:not(.motto) i { height: 12mm; margin-bottom: 1.5mm; }
    .layout-ultra-premium footer .motto { font-size: 9pt; }
  </style>`;
}

export function buildProgressReportHtml(
  students: ProgressReportStudent[],
  reportType: ProgressReportType,
  brand: ProgressReportBrand,
  layout: ProgressReportLayout,
  options?: { duplicateSingle?: boolean },
) {
  const duplicateSingle = students.length === 1 && options?.duplicateSingle;
  const records = duplicateSingle
    ? [students[0], students[0]]
    : students;
  const pages: string[] = [];
  const recordsPerPage = layout === 'ultra-premium' ? 1 : 2;
  for (let index = 0; index < records.length; index += recordsPerPage) {
    const first = records[index];
    const second = records[index + 1];
    const firstLabel = duplicateSingle ? (index === 0 ? 'School copy' : 'Parent copy') : '';
    if (layout === 'ultra-premium') {
      pages.push(`<section class="page">${card(first, reportType, brand, firstLabel)}</section>`);
    } else {
      const secondLabel = duplicateSingle ? 'Parent copy' : '';
      pages.push(`<section class="page">
        ${card(first, reportType, brand, firstLabel)}
        <div class="tear-strip" aria-hidden="true"><span>✂ Tear here</span></div>
        ${second ? card(second, reportType, brand, secondLabel) : '<div class="empty-slot"></div>'}
      </section>`);
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(reportType === 'component' ? 'Component-Based' : 'Direct')} Assessment Progress Reports</title>${stylesheet(brand)}</head><body class="layout-${layout}">${pages.join('')}</body></html>`;
}

export function buildTwoUpProgressReportHtml(
  students: ProgressReportStudent[],
  reportType: ProgressReportType,
  brand: ProgressReportBrand,
  options?: { duplicateSingle?: boolean },
) {
  return buildProgressReportHtml(students, reportType, brand, 'normal', options);
}
