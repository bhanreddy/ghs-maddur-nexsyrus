import type { ExamPaper } from '../services/examService';
import type { SchoolSettings } from '../services/schoolSettingsService';
import { getMediaUrl } from './media';

export interface HallTicketStudent {
  id: string;
  display_name: string;
  father_name?: string | null;
  photo_url?: string | null;
  admission_no: string;
  roll_number?: string | number | null;
}

export interface HallTicketPdfOptions {
  examName: string;
  academicYear?: string | null;
  className: string;
  sectionName: string;
  students: HallTicketStudent[];
  papers: ExamPaper[];
  school?: Partial<SchoolSettings> | null;
  /** Pre-resolved logo (data URI preferred). Resolved automatically on download if omitted. */
  logoDataUri?: string | null;
  /** Pre-resolved principal signature. Resolved from school settings when omitted. */
  principalSignatureDataUri?: string | null;
  /** Printable hall-ticket model. Defaults to the compact four-up A4 layout. */
  ticketsPerPage?: HallTicketsPerPage;
  /** Print each student's saved roll number. Defaults to false. */
  showRollNumbers?: boolean;
}

export type HallTicketsPerPage = 2 | 3 | 4;

/** Backward-compatible default for callers that do not choose a model. */
export const TICKETS_PER_PAGE = 4;

const A4_PAGE_WIDTH_PX = 794;

function escapeHtml(value?: string | number | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fileSafe(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'exam'
  );
}

function formatCompactDate(value?: string | null): string {
  if (!value) return 'TBA';
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatTime(value?: string | null): string {
  if (!value) return 'TBA';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'To be announced';
  if (!end) return formatTime(start);
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function schoolInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function sortedPapers(papers: ExamPaper[]): ExamPaper[] {
  return [...papers].sort((a, b) => {
    const left = `${a.exam_date || '9999'}|${a.start_time || '99:99'}|${a.subject_name}`;
    const right = `${b.exam_date || '9999'}|${b.start_time || '99:99'}|${b.subject_name}`;
    return left.localeCompare(right);
  });
}

function compactScheduleTable(papers: ExamPaper[]): string {
  const sorted = sortedPapers(papers);

  const dates = sorted
    .map(
      (paper) => `<th scope="col">${escapeHtml(formatCompactDate(paper.exam_date))}</th>`,
    )
    .join('');

  const subjects = sorted
    .map(
      (paper) => `<td>
        <strong>${escapeHtml(paper.subject_name)}</strong>
        <span class="subject-time">${escapeHtml(formatTimeRange(paper.start_time, paper.end_time))}</span>
        <small>Sign of invigilator</small>
      </td>`,
    )
    .join('');

  return `<table class="schedule">
    <thead>
      <tr>${dates}</tr>
    </thead>
    <tbody><tr>${subjects}</tr></tbody>
  </table>`;
}

function comfortableScheduleGrid(papers: ExamPaper[]): string {
  const paperCount = papers.length;
  const columns = paperCount <= 3 ? Math.max(1, paperCount) : paperCount <= 6 ? 3 : 4;
  return `<div class="schedule-grid schedule-grid--${columns}">
    ${sortedPapers(papers)
      .map(
        (paper) => `<div class="paper-card">
          <div class="paper-date">${escapeHtml(formatCompactDate(paper.exam_date))}</div>
          <strong>${escapeHtml(paper.subject_name)}</strong>
          <span class="subject-time">${escapeHtml(formatTimeRange(paper.start_time, paper.end_time))}</span>
          <div class="paper-sign"><small>Invigilator</small></div>
        </div>`,
      )
      .join('')}
  </div>`;
}

function largeScheduleTable(papers: ExamPaper[]): string {
  return `<table class="schedule-detail">
    <thead>
      <tr>
        <th>Date</th>
        <th>Subject</th>
        <th>Timing</th>
        <th>Invigilator signature</th>
      </tr>
    </thead>
    <tbody>
      ${sortedPapers(papers)
        .map(
          (paper) => `<tr>
            <td>${escapeHtml(formatCompactDate(paper.exam_date))}</td>
            <td><strong>${escapeHtml(paper.subject_name)}</strong></td>
            <td>
              <strong>${escapeHtml(formatTimeRange(paper.start_time, paper.end_time))}</strong>
            </td>
            <td class="detail-sign-space"></td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

function scheduleMarkup(papers: ExamPaper[], ticketsPerPage: HallTicketsPerPage): string {
  if (ticketsPerPage === 2) return largeScheduleTable(papers);
  if (ticketsPerPage === 3) return comfortableScheduleGrid(papers);
  return compactScheduleTable(papers);
}

function compactScheduleVariables(paperCount: number): string {
  const count = Math.max(2, Math.min(12, paperCount));
  const extraColumns = count - 2;
  const cssNumber = (value: number) => String(Number(value.toFixed(2)));
  const values = {
    dateHeight: Math.max(4.2, 6 - extraColumns * 0.22),
    dateSize: Math.max(5.2, 8.5 - extraColumns * 0.42),
    subjectSize: Math.max(5.4, 9.8 - extraColumns * 0.58),
    timeSize: Math.max(4.5, 7.2 - extraColumns * 0.32),
    captionSize: Math.max(2.5, 3.7 - extraColumns * 0.12),
    paddingY: Math.max(0.2, 0.5 - extraColumns * 0.03),
    paddingX: Math.max(0.18, 0.45 - extraColumns * 0.04),
  };
  return [
    `--schedule-date-height:${cssNumber(values.dateHeight)}mm`,
    `--schedule-date-size:${cssNumber(values.dateSize)}pt`,
    `--schedule-subject-size:${cssNumber(values.subjectSize)}pt`,
    `--schedule-time-size:${cssNumber(values.timeSize)}pt`,
    `--schedule-caption-size:${cssNumber(values.captionSize)}pt`,
    `--schedule-padding-y:${cssNumber(values.paddingY)}mm`,
    `--schedule-padding-x:${cssNumber(values.paddingX)}mm`,
  ].join(';');
}

function logoMarkup(logoDataUri: string | null | undefined, schoolName: string, className: string): string {
  if (logoDataUri) {
    return `<img class="${className}" src="${escapeHtml(logoDataUri)}" alt="" />`;
  }
  return `<div class="${className} ${className}--fallback">${escapeHtml(schoolInitials(schoolName))}</div>`;
}

function studentPhotoMarkup(
  photoDataUri: string | null | undefined,
  logoDataUri: string | null | undefined,
  schoolName: string,
  studentName: string,
): string {
  if (photoDataUri) {
    return `<img class="student-photo" src="${escapeHtml(photoDataUri)}" alt="${escapeHtml(studentName)}" />`;
  }
  if (logoDataUri) {
    return `<img class="student-photo student-photo--school-logo" src="${escapeHtml(logoDataUri)}" alt="" />`;
  }
  return `<div class="student-photo student-photo--initials">${escapeHtml(schoolInitials(schoolName))}</div>`;
}

function ticketHtml(
  options: HallTicketPdfOptions,
  student: HallTicketStudent,
  ticketsPerPage: HallTicketsPerPage,
): string {
  const schoolName = options.school?.school_name || 'School';
  const schoolMedium = (options.school?.school_medium || '').trim();
  const logo = options.logoDataUri;
  const densityClass =
    options.papers.length > 9
      ? 'ticket--very-dense'
      : options.papers.length > 6
        ? 'ticket--dense'
        : options.papers.length === 1
          ? 'ticket--single'
          : '';
  const compactScheduleStyle = ticketsPerPage === 4
    ? ` style="${compactScheduleVariables(options.papers.length)}"`
    : '';

  return `<section class="ticket-slot">
    <article class="ticket ticket--layout-${ticketsPerPage} ${densityClass}" data-subject-count="${options.papers.length}"${compactScheduleStyle}>
      ${logoMarkup(logo, schoolName, 'watermark')}

      <header class="ticket-header">
        ${logoMarkup(logo, schoolName, 'school-logo')}
        <div class="school-block">
          <div class="school-name">${escapeHtml(schoolName)}</div>
          <div class="ticket-subtitle">
            <div class="hall-ticket-title">
              Hall Ticket | ${escapeHtml(options.examName)}
              ${options.academicYear ? ` | ${escapeHtml(options.academicYear)}` : ''}
            </div>
            ${schoolMedium ? `<span class="medium-label">${escapeHtml(schoolMedium)}</span>` : ''}
          </div>
        </div>
        ${studentPhotoMarkup(student.photo_url, logo, schoolName, student.display_name)}
      </header>

      <div class="header-rule" aria-hidden="true"></div>

      <div class="student-meta">
        <div class="meta-wide">
          <span>Student</span>
          <strong>${escapeHtml(student.display_name)}</strong>
        </div>
        <div class="meta-wide">
          <span>Father name</span>
          <strong>${escapeHtml(student.father_name || 'Not provided')}</strong>
        </div>
        <div>
          <span>Admission No.</span>
          <strong>${escapeHtml(student.admission_no || '-')}</strong>
        </div>
        <div>
          <span>Class / Section</span>
          <strong>${escapeHtml(options.className)} / ${escapeHtml(options.sectionName)}</strong>
        </div>
        ${options.showRollNumbers ? `<div>
          <span>Roll No.</span>
          <strong class="roll-number-box">${escapeHtml(student.roll_number ?? '-')}</strong>
        </div>` : ''}
      </div>

      <div class="schedule-wrap">${scheduleMarkup(options.papers, ticketsPerPage)}</div>

      <footer class="ticket-footer">
        <div class="sign-block class-teacher-sign-block">
          <span>Class teacher</span>
        </div>
        <div class="sign-block principal-sign-block${options.principalSignatureDataUri ? ' principal-sign-block--signed' : ''}">
          <span>Principal</span>
          ${options.principalSignatureDataUri
            ? `<div class="principal-signature-line"><img class="principal-signature" src="${escapeHtml(options.principalSignatureDataUri)}" alt="" /></div>`
            : '<i></i>'}
        </div>
      </footer>
    </article>
  </section>`;
}

export function buildHallTicketHtml(options: HallTicketPdfOptions): string {
  const ticketsPerPage = options.ticketsPerPage || TICKETS_PER_PAGE;
  const pages: string[] = [];
  for (let index = 0; index < options.students.length; index += ticketsPerPage) {
    const ticketRows = options.students
      .slice(index, index + ticketsPerPage)
      .map((student) => ticketHtml(options, student, ticketsPerPage))
      .join('');
    pages.push(`<main class="hall-sheet hall-sheet--${ticketsPerPage}">${ticketRows}</main>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.examName)} Hall Tickets</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #0f172a;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    }

    .hall-sheet {
      width: 210mm;
      height: 297mm;
      padding: 4.5mm 6mm;
      display: grid;
      align-content: center;
      page-break-inside: avoid;
      break-inside: avoid-page;
      overflow: hidden;
      background: #fff;
    }
    .hall-sheet--4 { grid-template-rows: repeat(4, 64mm); row-gap: 8mm; --cut-offset: 4mm; }
    .hall-sheet--3 { grid-template-rows: repeat(3, 86mm); row-gap: 9mm; --cut-offset: 4.5mm; }
    .hall-sheet--2 { grid-template-rows: repeat(2, 133mm); row-gap: 14mm; --cut-offset: 7mm; }
    .hall-sheet + .hall-sheet { page-break-before: always; break-before: page; }

    .ticket-slot {
      min-height: 0;
      position: relative;
      padding: 0;
    }
    .ticket-slot:not(:last-child)::before {
      content: "";
      position: absolute;
      z-index: 3;
      left: -3mm;
      right: -3mm;
      top: calc(100% + var(--cut-offset));
      height: 0;
      border-bottom: 0.3mm dashed #94a3b8;
    }
    .ticket-slot:not(:last-child)::after {
      content: "CUT HERE";
      position: absolute;
      z-index: 4;
      left: 50%;
      top: calc(100% + var(--cut-offset));
      transform: translate(-50%, -50%);
      padding: 0 2mm;
      background: #fff;
      color: #94a3b8;
      font-size: 4.3pt;
      line-height: 2mm;
      letter-spacing: 0.65pt;
      font-weight: 700;
    }

    .ticket {
      position: relative;
      border: 0.3mm solid #243b8f;
      border-radius: 1.6mm;
      padding: 1.6mm 2.5mm 1.3mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background:
        linear-gradient(90deg, #f59e0b 0, #f59e0b 0.9mm, transparent 0.9mm),
        linear-gradient(180deg, #f8faff 0%, #ffffff 14mm);
    }
    .ticket--layout-4 { height: 64mm; }
    .ticket--layout-3 { height: 86mm; padding: 2mm 3mm 1.8mm; }
    .ticket--layout-2 { height: 133mm; padding: 2.6mm 3.5mm 2.2mm; }

    .watermark {
      position: absolute;
      z-index: 0;
      top: 56%;
      left: 50%;
      width: 35mm;
      height: 35mm;
      object-fit: contain;
      opacity: 0.1;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .watermark--fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: #1e3a8a;
      color: #fff;
      font-size: 15pt;
      font-weight: 800;
      opacity: 0.1;
    }

    .ticket-header,
    .header-rule,
    .student-meta,
    .schedule-wrap,
    .ticket-footer {
      position: relative;
      z-index: 1;
    }

    /* Balanced identity header: school logo, centred title, student portrait. */
    .ticket-header {
      display: grid;
      grid-template-columns: 10mm minmax(0, 1fr) 10mm;
      align-items: center;
      gap: 2.4mm;
      min-height: 10.2mm;
    }
    .school-logo,
    .student-photo {
      width: 10mm;
      height: 10mm;
      border-radius: 1.4mm;
      background: #fff;
      border: 0.25mm solid #c7d2fe;
    }
    .school-logo {
      object-fit: contain;
      padding: 0.3mm;
    }
    .school-logo--fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #1e3a8a, #312e81);
      border: none;
      color: #fff;
      font-size: 5.8pt;
      font-weight: 800;
      letter-spacing: 0.2pt;
    }
    .student-photo {
      object-fit: cover;
      object-position: center 24%;
      justify-self: end;
      box-shadow: 0 0 0 0.2mm #fff, 0 0 0 0.4mm #d7def7;
    }
    .student-photo--school-logo {
      object-fit: contain;
      object-position: center;
      padding: 0.45mm;
    }
    .student-photo--initials {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #1e3a8a, #312e81);
      color: #fff;
      font-size: 5.8pt;
      font-weight: 800;
      letter-spacing: 0.2pt;
    }
    .school-block {
      min-width: 0;
      text-align: center;
    }
    .school-name {
      font-size: 9.4pt;
      line-height: 1.05;
      font-weight: 800;
      color: #172554;
      text-transform: uppercase;
      letter-spacing: 0.15pt;
    }
    .ticket-subtitle {
      min-width: 0;
      margin-top: 0.35mm;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1mm;
    }
    .hall-ticket-title {
      min-width: 0;
      font-size: 7.2pt;
      line-height: 1.1;
      color: #1e3a8a;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.22pt;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .medium-label {
      flex: 0 0 auto;
      padding: 0.2mm 0.7mm;
      border-radius: 2mm;
      background: #e0e7ff;
      font-size: 6pt;
      font-weight: 700;
      color: #172554;
      text-transform: uppercase;
    }

    .header-rule {
      height: 0.45mm;
      margin: 0.7mm 0 0.75mm;
      border-radius: 1mm;
      background: #1e3a8a;
    }

    .student-meta {
      display: grid;
      grid-template-columns: 1.7fr 1.55fr 1fr 1.1fr 1fr;
      gap: 0;
      padding: 0.75mm 1.1mm;
      margin-bottom: 0.7mm;
      border-radius: 1mm;
      background: #f4f6ff;
      border: 0.2mm solid #d7def7;
    }
    .student-meta div { min-width: 0; padding: 0 0.9mm; }
    .student-meta div:first-child { padding-left: 0; }
    .student-meta div:last-child { padding-right: 0; }
    .student-meta div + div { border-left: 0.2mm solid #d7def7; }
    .student-meta span {
      display: block;
      font-size: 4.3pt;
      line-height: 1;
      text-transform: uppercase;
      color: #667085;
      letter-spacing: 0.25pt;
      font-weight: 700;
    }
    .student-meta strong {
      display: block;
      margin-top: 0.35mm;
      font-size: 6.3pt;
      line-height: 1.15;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta-wide strong { font-size: 7pt; color: #172554; }
    .student-meta .roll-number-box {
      display: block;
      box-sizing: border-box;
      width: 100%;
      min-width: 14mm;
      min-height: 7mm;
      margin-top: 0.35mm;
      border: 0.25mm solid #64748b;
      border-radius: 0.5mm;
      background: #fff;
    }

    .schedule-wrap {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
    }

    /* Every paper is one horizontal column: date above subject, time and marks. */
    .schedule {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 5.3pt;
    }
    .schedule th, .schedule td {
      border: 0.2mm solid #aab7cf;
      padding: var(--schedule-padding-y, 0.5mm) var(--schedule-padding-x, 0.45mm);
      line-height: 1.08;
      vertical-align: middle;
      text-align: center;
      overflow-wrap: anywhere;
    }
    .schedule th {
      height: var(--schedule-date-height, 6mm);
      background: #fff;
      color: #0f172a;
      font-size: var(--schedule-date-size, 8.5pt);
      letter-spacing: 0.05pt;
      font-weight: 900;
    }
    .schedule tbody tr { height: auto; }
    .schedule td {
      position: relative;
      padding-top: 1mm;
      padding-bottom: 3mm;
      vertical-align: top;
      background-color: rgba(255, 255, 255, 0.9);
    }
    .schedule td strong {
      display: block;
      font-size: var(--schedule-subject-size, 8.5pt);
      line-height: 1.08;
      color: #172554;
      font-weight: 800;
    }
    .schedule td .subject-time,
    .schedule td small {
      display: block;
      margin-top: 0.35mm;
      color: #64748b;
      font-size: var(--schedule-time-size, 6.5pt);
      line-height: 1.05;
    }
    .schedule td .subject-time {
      color: #1e293b;
      font-weight: 800;
    }
    .schedule td small {
      position: absolute;
      right: 0;
      bottom: 0.45mm;
      left: 0;
      margin-top: 0;
      font-size: var(--schedule-caption-size, 3.3pt);
    }

    /* Three-up model: spacious schedule cards, three or four cards per row. */
    .ticket--layout-3 .ticket-header {
      min-height: 14.5mm;
      grid-template-columns: 14mm minmax(0, 1fr) 14mm;
    }
    .ticket--layout-3 .school-logo,
    .ticket--layout-3 .student-photo { width: 14mm; height: 14mm; }
    .ticket--layout-3 .school-name { font-size: 13.5pt; }
    .ticket--layout-3 .hall-ticket-title { font-size: 9.5pt; }
    .ticket--layout-3 .medium-label { font-size: 7pt; }
    .ticket--layout-3 .student-meta { padding: 1.1mm 1.3mm; margin-bottom: 1mm; }
    .ticket--layout-3 .student-meta span { font-size: 5pt; }
    .ticket--layout-3 .student-meta strong { font-size: 7.3pt; }
    .ticket--layout-3 .meta-wide strong { font-size: 8.2pt; }
    .ticket--layout-3 .meta-wide strong,
    .ticket--layout-2 .meta-wide strong {
      white-space: normal;
      line-height: 1.05;
      max-height: 2.1em;
    }
    .schedule-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-auto-rows: minmax(0, 1fr);
      gap: 1mm;
    }
    .schedule-grid--1 { grid-template-columns: minmax(0, 1fr); }
    .schedule-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .schedule-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .schedule-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .paper-card {
      min-width: 0;
      min-height: 0;
      padding: 0.8mm;
      display: flex;
      flex-direction: column;
      border: 0.2mm solid #aab7cf;
      border-radius: 0.8mm;
      background: rgba(255, 255, 255, 0.9);
      text-align: center;
    }
    .paper-date {
      margin: -0.8mm -0.8mm 0.7mm;
      padding: 0.8mm 0.4mm;
      border-radius: 0.65mm 0.65mm 0 0;
      border-bottom: 0.2mm solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      font-size: 9.2pt;
      font-weight: 900;
    }
    .paper-card > strong {
      display: block;
      min-height: 5.2mm;
      color: #172554;
      font-size: 11pt;
      line-height: 1.1;
      font-weight: 800;
    }
    .paper-card .subject-time {
      display: block;
      margin-top: 0.55mm;
      color: #1e293b;
      font-size: 8.6pt;
      line-height: 1.08;
      font-weight: 800;
    }
    .paper-sign {
      flex: 1 1 auto;
      min-height: 3.4mm;
      margin-top: 0.5mm;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .paper-sign small {
      display: block;
      color: #64748b;
      font-size: 4.6pt;
      line-height: 1;
    }
    .ticket--layout-3 .ticket-footer {
      min-height: 8mm;
      flex-basis: 8mm;
      margin-top: auto;
    }
    .ticket--layout-3 .sign-block { font-size: 5.4pt; }
    .ticket--layout-3 .principal-signature { max-height: 5mm; }
    .ticket--layout-3.ticket--single .paper-card > strong { font-size: 12.5pt; }
    .ticket--layout-3.ticket--single .paper-card .subject-time { font-size: 9.3pt; }
    .ticket--layout-3.ticket--dense .paper-card > strong { font-size: 9.8pt; }
    .ticket--layout-3.ticket--dense .paper-card .subject-time { font-size: 7.5pt; }
    .ticket--layout-3.ticket--very-dense .paper-card > strong { font-size: 8.8pt; }
    .ticket--layout-3.ticket--very-dense .paper-card .subject-time { font-size: 6.8pt; }

    /* Two-up model: large readable row-based schedule. */
    .ticket--layout-2 {
      background:
        linear-gradient(90deg, #f59e0b 0, #f59e0b 1.2mm, transparent 1.2mm),
        linear-gradient(180deg, #f4f7ff 0%, #ffffff 20mm);
    }
    .ticket--layout-2 .ticket-header {
      min-height: 17.5mm;
      grid-template-columns: 17mm minmax(0, 1fr) 17mm;
      gap: 3mm;
    }
    .ticket--layout-2 .school-logo,
    .ticket--layout-2 .student-photo { width: 17mm; height: 17mm; }
    .ticket--layout-2 .school-name { font-size: 16pt; }
    .ticket--layout-2 .ticket-subtitle { margin-top: 0.6mm; }
    .ticket--layout-2 .hall-ticket-title { font-size: 11pt; }
    .ticket--layout-2 .medium-label { font-size: 8pt; }
    .ticket--layout-2 .header-rule { height: 0.65mm; margin: 1mm 0; }
    .ticket--layout-2 .student-meta { padding: 1.5mm; margin-bottom: 1.3mm; }
    .ticket--layout-2 .student-meta span { font-size: 5.8pt; }
    .ticket--layout-2 .student-meta strong { margin-top: 0.5mm; font-size: 8.7pt; }
    .ticket--layout-2 .meta-wide strong { font-size: 10pt; }
    .schedule-detail {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .schedule-detail th,
    .schedule-detail td {
      height: 5.2mm;
      padding: 0.65mm 1.1mm;
      border: 0.2mm solid #aab7cf;
      vertical-align: middle;
    }
    .schedule-detail th {
      background: #fff;
      color: #0f172a;
      font-size: 6.5pt;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.2pt;
    }
    .schedule-detail th:nth-child(1) { width: 21%; }
    .schedule-detail th:nth-child(2) { width: 30%; }
    .schedule-detail th:nth-child(3) { width: 28%; }
    .schedule-detail th:nth-child(4) { width: 21%; }
    .schedule-detail td {
      background: rgba(255, 255, 255, 0.9);
      color: #1e293b;
      font-size: 7pt;
      text-align: center;
    }
    .schedule-detail td:first-child {
      color: #0f172a;
      font-size: 9pt;
      font-weight: 900;
    }
    .schedule-detail td:nth-child(2) strong,
    .schedule-detail td:nth-child(3) strong {
      color: #172554;
      font-size: 10pt;
      line-height: 1.05;
      font-weight: 800;
    }
    .ticket--layout-2.ticket--single .schedule-detail td:nth-child(2) strong,
    .ticket--layout-2.ticket--single .schedule-detail td:nth-child(3) strong { font-size: 11pt; }
    .ticket--layout-2.ticket--dense .schedule-detail td:nth-child(2) strong,
    .ticket--layout-2.ticket--dense .schedule-detail td:nth-child(3) strong { font-size: 9pt; }
    .ticket--layout-2.ticket--very-dense .schedule-detail td:nth-child(2) strong,
    .ticket--layout-2.ticket--very-dense .schedule-detail td:nth-child(3) strong { font-size: 8.5pt; }
    .ticket--layout-2 .ticket-footer {
      min-height: 10mm;
      flex-basis: 10mm;
      margin-top: auto;
    }
    .ticket--layout-2 .sign-block { font-size: 6.2pt; padding: 0.8mm 1.5mm 0.6mm; }
    .ticket--layout-2 .principal-signature { max-height: 8mm; }

    .ticket-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8mm;
      min-height: 6.5mm;
      margin-top: 1mm;
      padding: 0;
      flex: 0 0 6.5mm;
      border: 0;
      background: transparent;
      overflow: visible;
    }
    .sign-block {
      flex: 0 0 34%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 0.55mm 1mm 0.45mm;
      text-align: left;
      font-size: 4.8pt;
      color: #475569;
      font-weight: 600;
    }
    .sign-block:first-child { align-items: flex-start; padding-left: 0; }
    .class-teacher-sign-block { justify-content: flex-end; }
    .principal-sign-block {
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      gap: 1.8mm;
      padding-top: 0;
      padding-right: 0;
      text-align: right;
    }
    .sign-block + .sign-block { border-left: 0; }
    .sign-block i {
      display: block;
      flex: 1 1 auto;
      width: 100%;
      min-height: 2.4mm;
      border-bottom: 0.25mm solid #64748b;
      margin: 0 0 0.5mm;
    }
    .principal-sign-block > i {
      flex: 0 0 28mm;
      width: 28mm;
      min-height: 4mm;
      margin: 0;
    }
    .principal-signature-line {
      display: flex;
      flex: 1 1 auto;
      width: 100%;
      min-height: 2.4mm;
      align-items: flex-end;
      justify-content: flex-end;
      margin: 0 0 0.5mm;
      border-bottom: 0.25mm solid #64748b;
      overflow: hidden;
    }
    .principal-signature {
      display: block;
      flex: 0 1 auto;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 3.5mm;
      object-fit: contain;
      object-position: right bottom;
      image-rendering: auto;
      filter: contrast(1.35);
    }
    .principal-sign-block--signed {
      gap: 1.8mm;
    }
    .principal-sign-block--signed .principal-signature-line {
      flex: 0 1 auto;
      width: auto;
      min-height: 0;
      margin: 0;
      border: 0;
      overflow: visible;
    }
    .principal-sign-block--signed .principal-signature {
      max-width: 36mm;
      max-height: 7mm;
    }
    .ticket--layout-3 .principal-sign-block--signed .principal-signature { max-height: 8mm; }
    .ticket--layout-2 .principal-sign-block--signed .principal-signature { max-height: 9mm; }

    .ticket--layout-4 .student-meta {
      padding: 1.3mm 1.4mm;
      margin-bottom: 0.8mm;
    }
    .ticket--layout-4 .student-meta span { font-size: 5pt; }
    .ticket--layout-4 .student-meta strong {
      margin-top: 0.45mm;
      font-size: 8.2pt;
    }
    .ticket--layout-4 .meta-wide strong { font-size: 9pt; }

    .ticket--layout-4.ticket--dense .ticket-header {
      min-height: 9.2mm;
      grid-template-columns: 8.5mm minmax(0, 1fr) 8.5mm;
    }
    .ticket--layout-4.ticket--dense .school-logo,
    .ticket--layout-4.ticket--dense .student-photo { width: 8.5mm; height: 8.5mm; }
    .ticket--layout-4.ticket--dense .header-rule { margin: 0.55mm 0; height: 0.4mm; }
    .ticket--layout-4.ticket--dense .student-meta { padding: 0.85mm 1.2mm; margin-bottom: 0.6mm; }
    .ticket--layout-4.ticket--dense .student-meta span { font-size: 4.6pt; }
    .ticket--layout-4.ticket--dense .student-meta strong { font-size: 7pt; }
    .ticket--layout-4.ticket--dense .meta-wide strong { font-size: 7.8pt; }
    .ticket--layout-4.ticket--dense .sign-block i,
    .ticket--layout-4.ticket--dense .principal-signature-line { min-height: 2.2mm; }

    .ticket--layout-4.ticket--very-dense { padding-top: 1.2mm; padding-bottom: 1mm; }
    .ticket--layout-4.ticket--very-dense .ticket-header {
      min-height: 8.2mm;
      grid-template-columns: 7.5mm minmax(0, 1fr) 7.5mm;
    }
    .ticket--layout-4.ticket--very-dense .school-logo,
    .ticket--layout-4.ticket--very-dense .student-photo { width: 7.5mm; height: 7.5mm; }
    .ticket--layout-4.ticket--very-dense .school-name { font-size: 8pt; }
    .ticket--layout-4.ticket--very-dense .header-rule { margin: 0.4mm 0; height: 0.35mm; }
    .ticket--layout-4.ticket--very-dense .student-meta { padding: 0.65mm 1mm; margin-bottom: 0.45mm; }
    .ticket--layout-4.ticket--very-dense .student-meta span { font-size: 4.3pt; }
    .ticket--layout-4.ticket--very-dense .student-meta strong { font-size: 6.4pt; }
    .ticket--layout-4.ticket--very-dense .meta-wide strong { font-size: 7pt; }
    .ticket--layout-4.ticket--very-dense .ticket-footer { padding-top: 0.2mm; }
    .ticket--layout-4.ticket--very-dense .sign-block i,
    .ticket--layout-4.ticket--very-dense .principal-signature-line { min-height: 2mm; }
    .ticket--layout-4.ticket--single .schedule th { height: 7mm; font-size: 9.5pt; }
    .ticket--layout-4.ticket--single .schedule td { padding: 1.5mm 1mm; }
    .ticket--layout-4.ticket--single .schedule td strong {
      font-size: 13pt;
      line-height: 1.12;
    }
    .ticket--layout-4.ticket--single .schedule td .subject-time {
      margin-top: 0.9mm;
      font-size: 9.5pt;
      line-height: 1.1;
    }
    .ticket--layout-4.ticket--single .schedule td small {
      font-size: 5.2pt;
    }
  </style>
</head>
<body>${pages.join('')}</body>
</html>`;
}

export function getHallTicketFileName(options: HallTicketPdfOptions): string {
  return `hall-tickets_${fileSafe(options.examName)}_${fileSafe(options.className)}-${fileSafe(options.sectionName)}.pdf`;
}

async function resolveLogoDataUri(options: HallTicketPdfOptions): Promise<string | null> {
  const candidate =
    options.logoDataUri ||
    (await (async () => {
      try {
        const { getLogoDataUri } = await import('./certificatePrint');
        return (await getLogoDataUri(options.school?.school_logo_url)) || null;
      } catch {
        return null;
      }
    })());

  return isRenderableImage(candidate);
}

async function isRenderableImage(candidate?: string | null): Promise<string | null> {
  if (!candidate) return null;
  // Reject broken/empty images — html2canvas crashes on 0×0 bitmaps via createPattern.
  if (typeof Image === 'undefined') return candidate;
  const ok = await new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => resolve(false);
    img.src = candidate;
  });
  return ok ? candidate : null;
}

async function resolvePrincipalSignatureDataUri(options: HallTicketPdfOptions): Promise<string | null> {
  const candidate =
    options.principalSignatureDataUri ||
    (await (async () => {
      const signatureUrl = options.school?.principal_signature_url?.trim();
      if (!signatureUrl) return null;
      try {
        const { getImageDataUri } = await import('./certificatePrint');
        return await getImageDataUri(getMediaUrl(signatureUrl));
      } catch {
        return null;
      }
    })());

  return isRenderableImage(candidate);
}

async function resolveStudentPhotoDataUris(students: HallTicketStudent[]): Promise<HallTicketStudent[]> {
  let getImageDataUri: (imageUrl?: string | null) => Promise<string | null>;
  try {
    ({ getImageDataUri } = await import('./certificatePrint'));
  } catch {
    return students.map((student) => ({ ...student, photo_url: null }));
  }

  const imageCache = new Map<string, Promise<string | null>>();
  return Promise.all(
    students.map(async (student) => {
      const photoUrl = getMediaUrl(student.photo_url);
      if (!photoUrl) return { ...student, photo_url: null };

      let resolvedPhoto = imageCache.get(photoUrl);
      if (!resolvedPhoto) {
        resolvedPhoto = getImageDataUri(photoUrl).then(isRenderableImage);
        imageCache.set(photoUrl, resolvedPhoto);
      }
      return { ...student, photo_url: await resolvedPhoto };
    }),
  );
}

/** Wait until every <img> in the offscreen tree has settled (load or error). */
function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          if (img.complete && img.naturalWidth === 0) {
            // Broken image — remove so html2canvas never paints a 0×0 canvas.
            img.replaceWith(document.createElement('span'));
            resolve();
            return;
          }
          const done = () => {
            if (img.naturalWidth === 0) {
              img.replaceWith(document.createElement('span'));
            }
            resolve();
          };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }),
    ),
  ).then(() => undefined);
}

async function downloadHallTicketsWeb(options: HallTicketPdfOptions, fileName: string): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('Hall-ticket download is only available in a browser context.');
  }

  const [{ jsPDF }, html2canvasModule] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const html2canvas = html2canvasModule.default;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  // Keep on-screen (opacity 0) so layout/images get real dimensions. Off-left
  // positioning can yield 0-size canvases inside html2canvas createPattern.
  wrapper.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${A4_PAGE_WIDTH_PX}px`,
    'opacity:0',
    'pointer-events:none',
    'background:#ffffff',
    'z-index:-1',
  ].join(';');
  wrapper.innerHTML = buildHallTicketHtml(options);
  document.body.appendChild(wrapper);

  try {
    await waitForImages(wrapper);
    // Let the browser finish layout after any logo fallback swaps.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const sheets = Array.from(wrapper.querySelectorAll('.hall-sheet')) as HTMLElement[];
    if (sheets.length === 0) throw new Error('No hall-ticket pages were generated.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    for (let index = 0; index < sheets.length; index += 1) {
      const canvas = await html2canvas(sheets[index], {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: false,
        imageTimeout: 8000,
        logging: false,
      });
      if (!canvas.width || !canvas.height) {
        throw new Error('Could not render hall-ticket page. Please try again.');
      }
      if (index > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
    }
    pdf.save(fileName);
  } finally {
    wrapper.remove();
  }
}

async function downloadHallTicketsNative(options: HallTicketPdfOptions, fileName: string): Promise<void> {
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html: buildHallTicketHtml(options) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      dialogTitle: `Download ${fileName}`,
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
    return;
  }
  await Print.printAsync({ uri });
}

export async function downloadHallTicketPdf(options: HallTicketPdfOptions): Promise<string> {
  if (options.students.length === 0) throw new Error('No students found for this class and section.');
  if (options.papers.length === 0) throw new Error('No exam papers are scheduled for this class.');

  const [logoDataUri, principalSignatureDataUri, students] = await Promise.all([
    resolveLogoDataUri(options),
    resolvePrincipalSignatureDataUri(options),
    resolveStudentPhotoDataUris(options.students),
  ]);
  const resolved: HallTicketPdfOptions = {
    ...options,
    logoDataUri,
    principalSignatureDataUri,
    students,
  };

  const fileName = getHallTicketFileName(resolved);
  if (typeof document !== 'undefined') {
    await downloadHallTicketsWeb(resolved, fileName);
  } else {
    await downloadHallTicketsNative(resolved, fileName);
  }
  return fileName;
}
