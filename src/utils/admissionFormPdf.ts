import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';
import { SCHOOL_CONFIG, SCHOOL_RECOGNITION_LINE, schoolTheme, schoolColorWithAlpha } from '../constants/schoolConfig';
import { GENDERS, BLOOD_GROUPS, RELIGIONS, STUDENT_CATEGORIES, STUDENT_STATUSES } from '../constants/references';
import { loadLogoAsBase64, escapeHtml, printHtmlOnWeb } from './pdfGenerator';

/**
 * Admission form PDF — mirrors the receipt/certificate architecture in pdfGenerator.ts:
 *  • Builds a self-contained HTML document (inline <style>, base64 logo).
 *  • Web: print into an isolated iframe via printHtmlOnWeb (browser dialog → Print or Save as PDF).
 *  • Native: Print.printAsync for the print dialog, Print.printToFileAsync + shareAsync to save/share.
 * School branding (name, address, colours) comes from SCHOOL_CONFIG / schoolTheme.
 */

export interface AdmissionParent {
  name: string;
  phone?: string;
  occupation?: string;
  relation: string;
}

export interface AdmissionFormData {
  fullName: string;
  dob?: string;
  gender?: string;
  category?: string;
  religion?: string;
  bloodGroup?: string;
  admissionNo: string;
  penNumber?: string;
  rollNumber?: string;
  admissionDate?: string;
  academicYear?: string;
  className?: string;
  sectionName?: string;
  status?: string;
  email?: string;
  phone?: string;
  parents: AdmissionParent[];
}

type RefItem = { id: number | string; name: string; code?: string };

const labelFor = (list: RefItem[], id: number | string | undefined | null): string | undefined => {
  if (id == null || id === '') return undefined;
  return list.find((x) => String(x.id) === String(id))?.name;
};

const formatDate = (raw?: string): string | undefined => {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Resolve the raw add-student screen state (IDs + reference lists) into a clean,
 * display-ready AdmissionFormData. Shared by the admin and accounts screens.
 */
export function buildAdmissionFormData(input: {
  formData: any;
  father?: { first_name?: string; last_name?: string; phone?: string; occupation?: string };
  mother?: { first_name?: string; last_name?: string; phone?: string; occupation?: string };
  guardian?: { first_name?: string; last_name?: string; phone?: string; occupation?: string; relation?: string };
  classes?: RefItem[];
  sections?: RefItem[];
  academicYears?: Array<{ id: string; code?: string; name?: string }>;
}): AdmissionFormData {
  const { formData, father, mother, guardian, classes = [], sections = [], academicYears = [] } = input;

  const fullName = [formData.first_name, formData.middle_name, formData.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Student';

  const parents: AdmissionParent[] = [];
  const pName = (p?: { first_name?: string; last_name?: string }) =>
    [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  if (father && pName(father)) {
    parents.push({ name: pName(father), phone: father.phone, occupation: father.occupation, relation: 'Father' });
  }
  if (mother && pName(mother)) {
    parents.push({ name: pName(mother), phone: mother.phone, occupation: mother.occupation, relation: 'Mother' });
  }
  if (guardian && pName(guardian)) {
    parents.push({
      name: pName(guardian),
      phone: guardian.phone,
      occupation: guardian.occupation,
      relation: guardian.relation || 'Guardian',
    });
  }

  const academicYear =
    academicYears.find((y) => String(y.id) === String(formData.academic_year_id))?.code ||
    academicYears.find((y) => String(y.id) === String(formData.academic_year_id))?.name;

  return {
    fullName,
    dob: formatDate(formData.dob),
    gender: labelFor(GENDERS, formData.gender_id),
    category: labelFor(STUDENT_CATEGORIES, formData.category_id),
    religion: labelFor(RELIGIONS, formData.religion_id),
    bloodGroup: labelFor(BLOOD_GROUPS, formData.blood_group_id),
    admissionNo: formData.admission_no || '—',
    penNumber: formData.pen_number?.trim() || undefined,
    rollNumber: formData.roll_number != null && formData.roll_number !== '' ? String(formData.roll_number) : undefined,
    admissionDate: formatDate(formData.admission_date),
    academicYear,
    className: labelFor(classes, formData.class_id),
    sectionName: labelFor(sections, formData.section_id),
    status: labelFor(STUDENT_STATUSES, formData.status_id),
    email: formData.email?.trim() || undefined,
    phone: formData.phone?.trim() || undefined,
    parents,
  };
}

// ─── HTML builder ────────────────────────────────────────────────────────────
const C = schoolTheme.light.colors;
const PRIMARY = C.primary;          // maroon brand
const SECONDARY = SCHOOL_CONFIG.theme.accent; // gold trim
const INK = C.textStrong;
const MUTED = C.textSecondary;
const BORDER = C.border;

const cell = (label: string, value?: string | null) => `
  <div class="field">
    <div class="field-label">${escapeHtml(label)}</div>
    <div class="field-value">${value ? escapeHtml(value) : '<span class="empty">—</span>'}</div>
  </div>`;

const parentRow = (p: AdmissionParent) => `
  <tr>
    <td class="p-rel">${escapeHtml(p.relation)}</td>
    <td>${escapeHtml(p.name)}</td>
    <td>${p.phone ? escapeHtml(p.phone) : '—'}</td>
    <td>${p.occupation ? escapeHtml(p.occupation) : '—'}</td>
  </tr>`;

export async function buildAdmissionFormHtml(data: AdmissionFormData): Promise<string> {
  const logoBase64 = await loadLogoAsBase64(SCHOOL_CONFIG.logo);
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" class="logo" alt="" />`
    : `<div class="logo-fallback">${escapeHtml(SCHOOL_CONFIG.name.slice(0, 2).toUpperCase())}</div>`;
  const watermarkHtml = logoBase64 ? `<img src="${logoBase64}" class="watermark" alt="" />` : '';

  const contactBits = [
    SCHOOL_CONFIG.contact ? `Phone: ${SCHOOL_CONFIG.contact}` : '',
    SCHOOL_CONFIG.email ? `Email: ${SCHOOL_CONFIG.email}` : '',
  ].filter(Boolean).join('  •  ');
  const affiliationBits = [
    SCHOOL_CONFIG.schoolCode && SCHOOL_CONFIG.schoolCode !== 'NA' ? `School Code: ${SCHOOL_CONFIG.schoolCode}` : '',
    SCHOOL_CONFIG.cbseAffiliationNo && SCHOOL_CONFIG.cbseAffiliationNo !== 'NA'
      ? `Affiliation No: ${SCHOOL_CONFIG.cbseAffiliationNo}` : '',
  ].filter(Boolean).join('  •  ');

  const parentsHtml = data.parents.length
    ? data.parents.map(parentRow).join('')
    : `<tr><td colspan="4" class="empty-row">No parent / guardian details recorded</td></tr>`;

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        @page { margin: 0; size: A4 portrait; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${INK}; background: #fff; }
        .page { position: relative; width: 794px; min-height: 1123px; margin: 0 auto; padding: 0 0 28px; background: #fff; overflow: hidden; }
        .watermark { position: absolute; top: 52%; left: 50%; width: 460px; transform: translate(-50%,-50%); opacity: 0.05; z-index: 0; }
        .content { position: relative; z-index: 1; }

        /* Header */
        .header { background: ${PRIMARY}; color: #fff; padding: 22px 32px 18px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .header-top { display: flex; align-items: center; gap: 18px; }
        .logo { width: 74px; height: 74px; border-radius: 12px; background: #fff; padding: 6px; object-fit: contain; }
        .logo-fallback { width: 74px; height: 74px; border-radius: 12px; background: #fff; color: ${PRIMARY}; font-weight: 800; font-size: 26px; display: flex; align-items: center; justify-content: center; }
        .school-name { font-size: 26px; font-weight: 800; letter-spacing: 0.3px; line-height: 1.15; }
        .school-tag { font-size: 12.5px; color: ${schoolColorWithAlpha('#FFFFFF', 0.9)}; margin-top: 3px; font-style: italic; }
        .school-addr { font-size: 11px; color: ${schoolColorWithAlpha('#FFFFFF', 0.85)}; margin-top: 6px; line-height: 1.5; }
        .school-meta { font-size: 10.5px; color: ${schoolColorWithAlpha('#FFFFFF', 0.82)}; margin-top: 2px; }
        .accent-bar { height: 6px; background: ${SECONDARY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .title-band { display: flex; align-items: center; justify-content: center; padding: 12px; background: ${schoolColorWithAlpha(PRIMARY, 0.07)}; border-bottom: 1px solid ${BORDER}; }
        .title-band h1 { font-size: 17px; font-weight: 800; letter-spacing: 2.5px; color: ${PRIMARY}; }

        /* Body */
        .body { padding: 18px 32px 0; }
        .admission-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border: 1px solid ${BORDER}; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
        .strip-cell { padding: 11px 14px; border-right: 1px solid ${BORDER}; border-bottom: 1px solid ${BORDER}; background: ${schoolColorWithAlpha(PRIMARY, 0.035)}; }
        .strip-cell .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.8px; color: ${MUTED}; font-weight: 700; }
        .strip-cell .v { font-size: 14px; font-weight: 700; color: ${PRIMARY}; margin-top: 3px; }

        .section { margin-bottom: 18px; }
        .section-title { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${PRIMARY}; padding-bottom: 7px; margin-bottom: 12px; border-bottom: 2px solid ${schoolColorWithAlpha(PRIMARY, 0.18)}; }
        .section-title::before { content: ''; width: 4px; height: 14px; background: ${SECONDARY}; border-radius: 2px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 18px; }
        .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 18px; }
        .field { padding: 2px 0; }
        .field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: ${MUTED}; font-weight: 600; }
        .field-value { font-size: 13.5px; color: ${INK}; font-weight: 600; margin-top: 3px; border-bottom: 1px dotted ${BORDER}; padding-bottom: 5px; min-height: 20px; }
        .field-value .empty { color: ${schoolColorWithAlpha(MUTED, 0.6)}; font-weight: 400; }

        table.parents { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        table.parents th { text-align: left; background: ${schoolColorWithAlpha(PRIMARY, 0.07)}; color: ${PRIMARY}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; padding: 9px 12px; border: 1px solid ${BORDER}; }
        table.parents td { padding: 9px 12px; border: 1px solid ${BORDER}; color: ${INK}; }
        table.parents td.p-rel { font-weight: 700; color: ${PRIMARY}; }
        table.parents td.empty-row { text-align: center; color: ${MUTED}; font-style: italic; }

        /* Declaration + signatures */
        .declaration { margin-top: 22px; font-size: 11px; color: ${MUTED}; line-height: 1.6; background: ${schoolColorWithAlpha(PRIMARY, 0.03)}; border-left: 3px solid ${SECONDARY}; padding: 12px 14px; border-radius: 0 8px 8px 0; }
        .signatures { display: flex; justify-content: space-between; margin-top: 46px; padding: 0 6px; }
        .sign { text-align: center; width: 200px; }
        .sign-line { border-top: 1.5px solid ${INK}; padding-top: 6px; font-size: 11px; font-weight: 700; color: ${INK}; }
        .footer { margin-top: 26px; padding: 12px 32px 0; border-top: 1px solid ${BORDER}; text-align: center; font-size: 9.5px; color: ${MUTED}; }
      </style>
    </head>
    <body>
      <div class="page">
        ${watermarkHtml}
        <div class="content">
          <div class="header">
            <div class="header-top">
              ${logoHtml}
              <div>
                <div class="school-name">${escapeHtml(SCHOOL_CONFIG.name)}</div>
                ${SCHOOL_CONFIG.tagline ? `<div class="school-tag">${escapeHtml(SCHOOL_CONFIG.tagline)}</div>` : ''}
                ${SCHOOL_CONFIG.address ? `<div class="school-addr">${escapeHtml(SCHOOL_CONFIG.address)}</div>` : ''}
                ${contactBits ? `<div class="school-meta">${escapeHtml(contactBits)}</div>` : ''}
                ${affiliationBits ? `<div class="school-meta">${escapeHtml(affiliationBits)}</div>` : ''}
                ${SCHOOL_RECOGNITION_LINE ? `<div class="school-meta">${escapeHtml(SCHOOL_RECOGNITION_LINE)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="accent-bar"></div>
          <div class="title-band"><h1>STUDENT ADMISSION FORM</h1></div>

          <div class="body">
            <div class="admission-strip">
              <div class="strip-cell"><div class="k">Admission No</div><div class="v">${escapeHtml(data.admissionNo)}</div></div>
              <div class="strip-cell"><div class="k">Academic Year</div><div class="v">${data.academicYear ? escapeHtml(data.academicYear) : '—'}</div></div>
              <div class="strip-cell"><div class="k">Admission Date</div><div class="v">${data.admissionDate ? escapeHtml(data.admissionDate) : '—'}</div></div>
              <div class="strip-cell"><div class="k">Class</div><div class="v">${data.className ? escapeHtml(data.className) : '—'}</div></div>
              <div class="strip-cell"><div class="k">Section</div><div class="v">${data.sectionName ? escapeHtml(data.sectionName) : '—'}</div></div>
              <div class="strip-cell"><div class="k">Roll No</div><div class="v">${data.rollNumber ? escapeHtml(data.rollNumber) : '—'}</div></div>
            </div>

            <div class="section">
              <div class="section-title">Student Details</div>
              <div class="grid">
                ${cell('Full Name', data.fullName)}
                ${cell('Date of Birth', data.dob)}
                ${cell('Gender', data.gender)}
                ${cell('Category', data.category)}
                ${cell('Religion', data.religion)}
                ${cell('Blood Group', data.bloodGroup)}
                ${cell('PEN Number', data.penNumber)}
                ${cell('Status', data.status)}
              </div>
            </div>

            <div class="section">
              <div class="section-title">Contact</div>
              <div class="grid-2">
                ${cell('Email', data.email)}
                ${cell('Phone', data.phone)}
              </div>
            </div>

            <div class="section">
              <div class="section-title">Parent / Guardian Details</div>
              <table class="parents">
                <thead>
                  <tr><th style="width:110px">Relation</th><th>Name</th><th style="width:150px">Phone</th><th style="width:170px">Occupation</th></tr>
                </thead>
                <tbody>${parentsHtml}</tbody>
              </table>
            </div>

            <div class="declaration">
              <strong>Declaration:</strong> I hereby declare that the information furnished above is true and correct to the best of my knowledge.
              I agree to abide by the rules and regulations of ${escapeHtml(SCHOOL_CONFIG.name)}.
            </div>

            <div class="signatures">
              <div class="sign"><div class="sign-line">Parent / Guardian Signature</div></div>
              <div class="sign"><div class="sign-line">Principal Signature &amp; Seal</div></div>
            </div>
          </div>

          <div class="footer">
            This is a computer-generated admission form for ${escapeHtml(data.fullName)} (Adm. No ${escapeHtml(data.admissionNo)}).<br/>
            Generated on ${new Date().toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

/** Open the platform print dialog (user can Print or choose Save as PDF as the destination). */
export async function printAdmissionForm(data: AdmissionFormData): Promise<void> {
  const html = await buildAdmissionFormHtml(data);
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return;
  }
  await Print.printAsync({ html });
}

/** Generate a PDF file and hand it to the share/save sheet (native); on web, open the print→Save as PDF dialog. */
export async function saveAdmissionFormPdf(data: AdmissionFormData): Promise<void> {
  const html = await buildAdmissionFormHtml(data);
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
}
