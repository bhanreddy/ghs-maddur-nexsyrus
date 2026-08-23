import {
  buildHallTicketHtml,
  getHallTicketFileName,
  HallTicketPdfOptions,
  TICKETS_PER_PAGE,
} from './hallTicketPdf';

const options: HallTicketPdfOptions = {
  examName: 'Formative Assessment 1',
  academicYear: '2026-27',
  className: '5',
  sectionName: 'A',
  school: {
    school_name: 'Example Public School',
    school_address: 'Hyderabad, Telangana',
    school_tagline: 'Learn · Lead · Serve',
    school_phone: '040-1234567',
    school_email: 'office@example.edu',
  },
  logoDataUri: 'data:image/png;base64,abc',
  principalSignatureDataUri: 'data:image/png;base64,signature',
  students: Array.from({ length: 4 }, (_, index) => ({
    id: `student-${index + 1}`,
    display_name: `Student ${index + 1}`,
    father_name: `Father ${index + 1}`,
    photo_url: index === 0 ? 'data:image/jpeg;base64,student-photo' : null,
    admission_no: `ADM-${index + 1}`,
    roll_number: `SECRET-ROLL-${index + 1}`,
  })),
  papers: [
    {
      id: 'paper-1',
      class_id: 'class-5',
      subject_id: 'math',
      exam_date: '2026-08-10',
      start_time: '13:30:00',
      end_time: '14:30:00',
      max_marks: 40,
      passing_marks: 14,
      class_name: '5',
      subject_name: 'Mathematics',
      has_marks: false,
    },
    {
      id: 'paper-2',
      class_id: 'class-5',
      subject_id: 'science',
      exam_date: '2026-08-11',
      start_time: '09:30:00',
      end_time: '10:30:00',
      max_marks: 40,
      passing_marks: 14,
      class_name: '5',
      subject_name: 'Science',
      has_marks: false,
    },
  ],
};

describe('hallTicketPdf', () => {
  it(`defaults to ${TICKETS_PER_PAGE} compact tickets and starts a second page for the next student`, () => {
    const html = buildHallTicketHtml({
      ...options,
      students: [
        ...options.students,
        { id: 'student-5', display_name: 'Student 5', admission_no: 'ADM-5', roll_number: 5 },
      ],
    });

    expect(TICKETS_PER_PAGE).toBe(4);
    expect((html.match(/class="hall-sheet /g) || []).length).toBe(2);
    expect((html.match(/class="ticket-slot"/g) || []).length).toBe(5);
    expect(html).toContain('hall-sheet hall-sheet--4');
    expect(html).toContain('grid-template-rows: repeat(4, 64mm)');
    expect(html).toContain('ticket ticket--layout-4');
    expect(html).toContain('height: 64mm');
    expect(html).toContain('border-bottom: 0.3mm dashed');
    expect(html).toContain('--cut-offset: 4mm');
    expect(html).toContain('--cut-offset: 4.5mm');
    expect(html).toContain('--cut-offset: 7mm');
    expect(html).toContain('top: calc(100% + var(--cut-offset));');
    expect(html).toContain('transform: translate(-50%, -50%);');
  });

  it.each([
    [2, 'schedule-detail', 3],
    [3, 'schedule-grid', 2],
    [4, 'schedule', 2],
  ] as const)('creates the distinct %i-per-page model', (ticketsPerPage, scheduleClass, expectedPages) => {
    const html = buildHallTicketHtml({
      ...options,
      ticketsPerPage,
      students: Array.from({ length: 5 }, (_, index) => ({
        id: `student-${index + 1}`,
        display_name: `Student ${index + 1}`,
        admission_no: `ADM-${index + 1}`,
        roll_number: index + 1,
      })),
    });

    expect((html.match(/class="hall-sheet /g) || []).length).toBe(expectedPages);
    expect(html).toContain(`hall-sheet hall-sheet--${ticketsPerPage}`);
    expect(html).toContain(`ticket ticket--layout-${ticketsPerPage}`);
    expect(html).toContain(`class="${scheduleClass}`);
  });

  it('renders one school logo, a student portrait, and a watermark in the header area', () => {
    const html = buildHallTicketHtml(options);

    expect((html.match(/class="school-logo"/g) || []).length).toBe(options.students.length);
    expect((html.match(/class="student-photo(?: |")/g) || []).length).toBe(options.students.length);
    expect((html.match(/class="watermark"/g) || []).length).toBe(options.students.length);
    expect(html).toContain('data:image/png;base64,abc');
    expect(html).toContain('data:image/jpeg;base64,student-photo');
    expect(html).toContain('class="student-photo student-photo--school-logo"');
    expect(html).toContain('Hall Ticket');
    expect(html).toContain('Hall Ticket | Formative Assessment 1');
    expect(html).toContain('| 2026-27');
    expect(html).toContain('opacity: 0.1');
    expect(html).not.toContain('Hyderabad, Telangana');
  });

  it('falls back to initials when no logo is provided', () => {
    const html = buildHallTicketHtml({
      ...options,
      logoDataUri: null,
      students: options.students.slice(0, 1),
    });

    expect(html).toContain('school-logo--fallback');
    expect(html).toContain('student-photo--initials');
    expect(html).toContain('EP');
  });

  it('uses the student profile photo on the right and the school logo when it is unavailable', () => {
    const html = buildHallTicketHtml({
      ...options,
      students: [
        {
          id: 'with-photo',
          display_name: 'Asha & Rao',
          photo_url: 'data:image/jpeg;base64,asha',
          admission_no: 'ADM-1',
        },
        {
          id: 'without-photo',
          display_name: 'Bala',
          photo_url: null,
          admission_no: 'ADM-2',
        },
      ],
    });

    expect(html).toContain(
      'class="student-photo" src="data:image/jpeg;base64,asha" alt="Asha &amp; Rao"',
    );
    expect((html.match(/class="student-photo student-photo--school-logo"/g) || []).length).toBe(1);
  });

  it('places the configured principal signature in every hall ticket', () => {
    const html = buildHallTicketHtml(options);

    expect((html.match(/class="principal-signature"/g) || []).length).toBe(options.students.length);
    expect((html.match(/class="principal-signature-line"/g) || []).length).toBe(options.students.length);
    expect(
      (html.match(/class="sign-block principal-sign-block principal-sign-block--signed"/g) || [])
        .length,
    ).toBe(options.students.length);
    expect(html).toContain('data:image/png;base64,signature');
    expect(html).toContain('<span>Principal</span>');
    expect(html).toMatch(/<span>Principal<\/span>[\s\S]*?<div class="principal-signature-line">/);
    expect(html).toContain('width: auto;\n      height: auto;\n      max-width: 100%;');
    expect(html).toContain('flex-direction: row;');
    expect(html).toContain('margin: 0;\n      border: 0;');
    expect(html).toContain('max-width: 36mm;\n      max-height: 7mm;');
    expect(html).toContain('filter: contrast(1.35);');
  });

  it('removes the class-teacher line and keeps its label', () => {
    const html = buildHallTicketHtml({
      ...options,
      students: options.students.slice(0, 1),
    });

    expect(html).toContain('<div class="sign-block class-teacher-sign-block">');
    expect(html).toMatch(/class-teacher-sign-block">\s*<span>Class teacher<\/span>/);
    expect(html).not.toMatch(/class-teacher-sign-block">\s*<i>/);
  });

  it('keeps a blank principal signing line when no signature is configured', () => {
    const html = buildHallTicketHtml({
      ...options,
      principalSignatureDataUri: null,
      students: options.students.slice(0, 1),
    });

    expect(html).not.toContain('class="principal-signature"');
    expect(html).toContain('<div class="sign-block principal-sign-block">');
    expect(html).toMatch(/<span>Principal<\/span>\s*<i><\/i>/);
    expect(html).toContain('<i></i>');
  });

  it('repeats the full subject schedule on every student ticket', () => {
    const html = buildHallTicketHtml(options);

    expect((html.match(/Mathematics/g) || []).length).toBe(options.students.length);
    expect((html.match(/Science/g) || []).length).toBe(options.students.length);
    expect((html.match(/9:30 AM - 10:30 AM/g) || []).length).toBe(options.students.length);
    expect((html.match(/1:30 PM - 2:30 PM/g) || []).length).toBe(options.students.length);
    expect(html).not.toContain('AM session');
    expect(html).not.toContain('PM session');
    expect(html).toContain('10/08/2026');
    expect(html).toContain('11/08/2026');
    expect(html).not.toContain('Examination schedule');
    expect(html).not.toContain('2 subjects');
  });

  it('lays dates and subjects out horizontally like the compact printed hall ticket', () => {
    const html = buildHallTicketHtml({
      ...options,
      students: options.students.slice(0, 1),
    });

    expect(html).not.toContain('Instructions');
    expect((html.match(/Sign of invigilator/g) || []).length).toBe(options.papers.length);
    expect(html).not.toContain('invigilator-sign-line');
    expect(html).not.toContain('detail-sign-line');
    expect(html).not.toContain('Signature of invigilator');
    expect(html).not.toContain('Student signature');
    expect(html).not.toContain('Max 40');
    expect(html).toContain(
      '.hall-sheet--4 { grid-template-rows: repeat(4, 64mm); row-gap: 8mm; --cut-offset: 4mm; }',
    );
    expect(html).toContain('font-size: 8.5pt');
    expect(html).toContain('font-size: 6.5pt');
    expect(html).toContain('font-weight: 800');
    expect(html).toContain('align-content: center;');
    expect(html).toContain('vertical-align: top;');
    expect(html).toContain('padding-bottom: 3mm;');
    expect(html).toContain('flex: 1 1 auto');
    expect(html).toContain('height: 100%');
    expect((html.match(/2026-27/g) || []).length).toBe(1);
    expect(html).toContain(
      '<tr><th scope="col">10/08/2026</th><th scope="col">11/08/2026</th></tr>',
    );
    expect(html).toMatch(/<tbody><tr><td>[\s\S]*Mathematics[\s\S]*Science[\s\S]*<\/tr><\/tbody>/);
  });

  it('shows father names and omits roll numbers by default', () => {
    const html = buildHallTicketHtml(options);

    expect((html.match(/Father name/g) || []).length).toBe(options.students.length);
    expect(html).toContain('Father 1');
    expect((html.match(/class="roll-number-box"/g) || []).length).toBe(0);
    expect(html).not.toContain('SECRET-ROLL-1');
    expect(html).toContain('min-height: 7mm;');
  });

  it('prints saved roll numbers only when enabled', () => {
    const html = buildHallTicketHtml({ ...options, showRollNumbers: true });

    expect((html.match(/class="roll-number-box"/g) || []).length).toBe(options.students.length);
    expect(html).toContain('SECRET-ROLL-1');
    expect(html).toContain('SECRET-ROLL-4');
  });

  it('uses white, larger date rows and edge-aligned signature blocks', () => {
    const html = buildHallTicketHtml(options);

    expect(html).toContain('height: var(--schedule-date-height, 6mm);');
    expect(html).toContain('font-size: var(--schedule-date-size, 8.5pt);');
    expect(html).toContain('.paper-date {');
    expect(html).toContain('font-size: 7.2pt');
    expect(html).toContain('.sign-block:first-child { align-items: flex-start; padding-left: 0; }');
    expect(html).toContain('.class-teacher-sign-block { justify-content: flex-end; }');
    expect(html).toContain('gap: 1.8mm;');
  });

  it('continuously scales compact schedule typography as subject columns increase', () => {
    const twoSubjectHtml = buildHallTicketHtml(options);
    const sixSubjectHtml = buildHallTicketHtml({
      ...options,
      papers: Array.from({ length: 6 }, (_, index) => ({
        ...options.papers[index % options.papers.length],
        id: `paper-${index + 1}`,
        exam_date: `2026-08-${String(index + 10).padStart(2, '0')}`,
      })),
    });

    expect(twoSubjectHtml).toContain('data-subject-count="2"');
    expect(twoSubjectHtml).toContain('--schedule-subject-size:9.8pt');
    expect(twoSubjectHtml).toContain('--schedule-padding-x:0.45mm');
    expect(sixSubjectHtml).toContain('data-subject-count="6"');
    expect(sixSubjectHtml).toContain('--schedule-subject-size:7.48pt');
    expect(sixSubjectHtml).toContain('--schedule-time-size:5.92pt');
    expect(sixSubjectHtml).toContain('--schedule-padding-x:0.29mm');
  });

  it('scales header, subject, and timing text by hall-ticket model', () => {
    const html = buildHallTicketHtml(options);

    expect(html).toContain('.ticket--layout-3 .school-name { font-size: 13.5pt; }');
    expect(html).toContain('.ticket--layout-3 .hall-ticket-title { font-size: 9.5pt; }');
    expect(html).toContain('font-size: 8.8pt');
    expect(html).toContain('font-size: 6.8pt');
    expect(html).toContain('.ticket--layout-2 .school-name { font-size: 16pt; }');
    expect(html).toContain('.ticket--layout-2 .hall-ticket-title { font-size: 11pt; }');
    expect(html).toContain('font-size: 10pt');
    expect(html).toContain('.ticket--layout-4.ticket--single .schedule th { height: 7mm; font-size: 9.5pt; }');
    expect(html).toContain('font-size: 13pt;\n      line-height: 1.12;');
    expect(html).toContain('margin-top: 0.9mm;\n      font-size: 9.5pt;');
    expect(html).toContain('font-size: 5.2pt;');
  });

  it('gives the compact student-details card more space and reduces the schedule whitespace', () => {
    const html = buildHallTicketHtml(options);

    expect(html).toContain('.ticket--layout-4 .student-meta {');
    expect(html).toContain('padding: 1.3mm 1.4mm');
    expect(html).toContain('.ticket--layout-4 .student-meta strong {');
    expect(html).toContain('font-size: 8.2pt');
    expect(html).toContain('.ticket--layout-4 .meta-wide strong { font-size: 9pt; }');
  });

  it.each([
    [1, 'schedule-grid--1'],
    [2, 'schedule-grid--2'],
    [5, 'schedule-grid--3'],
    [8, 'schedule-grid--4'],
  ] as const)('uses the full comfortable-layout width for %i subjects', (paperCount, gridClass) => {
    const html = buildHallTicketHtml({
      ...options,
      ticketsPerPage: 3,
      students: options.students.slice(0, 1),
      papers: Array.from({ length: paperCount }, (_, index) => ({
        ...options.papers[0],
        id: `paper-${index}`,
        subject_id: `subject-${index}`,
        subject_name: `Subject ${index + 1}`,
      })),
    });

    expect(html).toContain(`class="schedule-grid ${gridClass}"`);
  });

  it('keeps every subject in a single schedule table for long exams', () => {
    const longPapers = Array.from({ length: 12 }, (_, index) => ({
      ...options.papers[0],
      id: `paper-${index}`,
      subject_id: `subject-${index}`,
      subject_name: `Subject ${index + 1}`,
    }));
    const html = buildHallTicketHtml({
      ...options,
      students: options.students.slice(0, 1),
      papers: longPapers,
    });

    expect(html).not.toContain('class="schedule-columns"');
    expect((html.match(/class="schedule"/g) || []).length).toBe(1);
    for (const paper of longPapers) expect(html).toContain(paper.subject_name);
  });

  it('uses class and section in a safe download name', () => {
    expect(getHallTicketFileName(options)).toBe(
      'hall-tickets_formative-assessment-1_5-a.pdf',
    );
  });
});
