import { Platform } from 'react-native';
import { SCHOOL_LOGO, SCHOOL_NAME } from '../constants/school';
import { SubstitutionBoard, SubstitutionSlot } from '../services/substitutionService';
import { printHtmlOnWeb } from './pdfGenerator';
import { bundledAssetToBase64Uri, resolveApiAssetUrl, toBase64Uri } from './toBase64Uri';

const DEFAULT_SCHOOL_LOGO = require('../../assets/images/icon.png') as number;

export type SubstitutionReportMode = 'complete' | 'teacher' | 'period' | 'class';

export interface SubstitutionReportOptions {
  board: SubstitutionBoard;
  mode: SubstitutionReportMode;
  schoolName?: string;
  logoUri?: string | null;
  generatedAt?: Date;
}

export interface SubstitutionReportBranding {
  schoolName?: string | null;
  logoUrl?: string | null;
}

interface ReportGroup {
  key: string;
  title: string;
  subtitle: string;
  rows: SubstitutionSlot[];
}

const MODE_LABELS: Record<SubstitutionReportMode, string> = {
  complete: 'Complete list',
  teacher: 'Teacher-wise',
  period: 'Period-wise',
  class: 'Class-wise',
};

function escapeHtml(value?: string | number | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function classLabel(slot: SubstitutionSlot): string {
  return `${slot.class_name}-${slot.section_name}`;
}

function timeLabel(value?: string): string {
  if (!value) return '';
  const [hourRaw, minute = '00'] = value.split(':');
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value.slice(0, 5);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function dateFromYmd(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(value);
}

function formatDate(value: string): string {
  const parsed = dateFromYmd(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
}

function sortChronologically(rows: SubstitutionSlot[]): SubstitutionSlot[] {
  return [...rows].sort((a, b) =>
    a.period_number - b.period_number ||
    classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true }) ||
    String(a.substitute_teacher_name || '').localeCompare(String(b.substitute_teacher_name || ''))
  );
}

function makeGroups(board: SubstitutionBoard, mode: SubstitutionReportMode): ReportGroup[] {
  const assigned = board.slots.filter((slot) => Boolean(slot.substitution_id && slot.substitute_teacher_name));
  if (mode === 'complete') {
    return [{
      key: 'complete',
      title: 'All assigned substitutions',
      subtitle: 'Chronological duty register',
      rows: sortChronologically(assigned),
    }];
  }

  const grouped = new Map<string, SubstitutionSlot[]>();
  for (const row of assigned) {
    const key = mode === 'teacher'
      ? String(row.substitute_teacher_name || 'Unassigned')
      : mode === 'period'
        ? String(row.period_number)
        : classLabel(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  return [...grouped.entries()]
    .map(([key, rows]) => {
      if (mode === 'teacher') {
        return {
          key,
          title: key,
          subtitle: `${rows.length} cover dut${rows.length === 1 ? 'y' : 'ies'}`,
          rows: sortChronologically(rows),
        };
      }
      if (mode === 'period') {
        const period = board.periods.find((item) => item.sort_order === Number(key));
        return {
          key,
          title: period?.name || `Period ${key}`,
          subtitle: `${timeLabel(period?.start_time || rows[0]?.start_time)} - ${timeLabel(period?.end_time || rows[0]?.end_time)}`,
          rows: [...rows].sort((a, b) => classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })),
        };
      }
      return {
        key,
        title: key,
        subtitle: `${rows.length} cover dut${rows.length === 1 ? 'y' : 'ies'}`,
        rows: sortChronologically(rows),
      };
    })
    .sort((a, b) => {
      if (mode === 'period') return Number(a.key) - Number(b.key);
      return a.title.localeCompare(b.title, undefined, { numeric: true });
    });
}

function tableRows(rows: SubstitutionSlot[]): string {
  return rows.map((slot, index) => `
    <tr>
      <td class="serial">${index + 1}</td>
      <td class="period-time">
        <strong>P${escapeHtml(slot.period_number)}</strong>
        <span class="minor">${escapeHtml(timeLabel(slot.start_time))} - ${escapeHtml(timeLabel(slot.end_time))}</span>
      </td>
      <td><strong>${escapeHtml(classLabel(slot))}</strong>${slot.room_no ? `<span class="minor">Room ${escapeHtml(slot.room_no)}</span>` : ''}</td>
      <td>${escapeHtml(slot.regular_teacher_name || 'Not assigned')}</td>
      <td><strong class="substitute">${escapeHtml(slot.substitute_teacher_name)}</strong></td>
      <td class="signature-cell"><span class="row-signature-line"></span></td>
    </tr>`).join('');
}

export function buildSubstitutionReportHtml(options: SubstitutionReportOptions): string {
  const { board, mode } = options;
  const schoolName = options.schoolName?.trim() || SCHOOL_NAME || 'School';
  const logoUri = options.logoUri || '';
  const generatedAt = options.generatedAt || new Date();
  const assigned = board.slots.filter((slot) => Boolean(slot.substitution_id && slot.substitute_teacher_name));
  const substituteTeachers = new Set(assigned.map((slot) => slot.substitute_teacher_id || slot.substitute_teacher_name)).size;
  const periodsCovered = new Set(assigned.map((slot) => slot.period_number)).size;
  const groups = makeGroups(board, mode);
  const logo = logoUri
    ? `<img class="logo" src="${escapeHtml(logoUri)}" alt="School logo" />`
    : `<div class="logo-fallback">${escapeHtml(schoolName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase())}</div>`;
  const groupMarkup = groups.length > 0
    ? groups.map((group) => `
      <section class="report-group${mode === 'complete' ? ' report-group--continuous' : ''}">
        <div class="group-heading">
          <div>
            <h2>${escapeHtml(group.title)}</h2>
            <p>${escapeHtml(group.subtitle)}</p>
          </div>
          <span>${group.rows.length} ${group.rows.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th class="serial">#</th>
              <th>Period / time</th>
              <th>Class</th>
              <th>Absent teacher</th>
              <th>Substitute teacher</th>
              <th>Signature</th>
            </tr>
          </thead>
          <tbody>${tableRows(group.rows)}</tbody>
        </table>
      </section>`).join('')
    : `<div class="empty"><strong>No substitutions assigned</strong><span>There are no confirmed cover duties for this date.</span></div>`;

  const filename = getSubstitutionReportFileName(board.date, mode);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(filename.replace(/\.pdf$/i, ''))}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 10mm 13mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #ffffff; font-family: Inter, Arial, Helvetica, sans-serif; font-size: 9.5px; line-height: 1.38; }
    .page { width: 100%; }
    .letterhead { display: flex; align-items: center; gap: 16px; padding: 0 0 14px; border-bottom: 3px solid #172554; }
    .identity { flex: 1; min-width: 0; }
    .logo, .logo-fallback { width: 58px; height: 58px; flex: 0 0 58px; object-fit: contain; border-radius: 14px; }
    .logo { padding: 3px; border: 1px solid #dbe2ec; }
    .logo-fallback { display: flex; align-items: center; justify-content: center; color: #ffffff; background: #172554; font-size: 19px; font-weight: 800; letter-spacing: 1px; }
    .school-name { margin: 0; color: #0f172a; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; line-height: 1.12; font-weight: 700; }
    .school-caption { margin: 4px 0 0; color: #64748b; font-size: 8px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; }
    .document-type { text-align: right; }
    .document-type .kicker { color: #b45309; font-size: 8px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
    .document-type h1 { margin: 3px 0 0; color: #172554; font-size: 17px; line-height: 1.15; }
    .document-type p { margin: 4px 0 0; color: #64748b; font-size: 9px; }
    .meta-strip { display: grid; grid-template-columns: 1.5fr repeat(3, 1fr); gap: 5px; margin: 7px 0 8px; }
    .meta-card { padding: 5px 7px; border: 1px solid #dbe2ec; border-radius: 6px; background: #f8fafc; }
    .meta-card:first-child { background: #172554; border-color: #172554; color: #ffffff; }
    .meta-label { display: block; color: #64748b; font-size: 6px; line-height: 1.15; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
    .meta-card:first-child .meta-label { color: #c7d2fe; }
    .meta-value { display: block; margin-top: 1px; font-size: 10px; line-height: 1.2; font-weight: 800; }
    .report-group { margin: 0 0 10px; break-inside: avoid-page; page-break-inside: avoid; }
    .report-group--continuous { break-inside: auto; page-break-inside: auto; }
    .group-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin: 0 0 3px; padding: 0 1px; break-after: avoid; }
    .group-heading h2 { margin: 0; color: #172554; font-size: 11px; line-height: 1.15; }
    .group-heading p { margin: 0; color: #64748b; font-size: 6.5px; line-height: 1.15; }
    .group-heading > span { padding: 2px 6px; color: #3730a3; background: #eef2ff; border-radius: 99px; font-size: 6.5px; line-height: 1.15; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { padding: 5px 5px; color: #ffffff; background: #27355c; border: 1px solid #27355c; text-align: left; font-size: 7.5px; letter-spacing: .35px; text-transform: uppercase; }
    td { padding: 4px 5px; border: 1px solid #dbe2ec; vertical-align: middle; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    th:nth-child(1), td:nth-child(1) { width: 4%; text-align: center; }
    th:nth-child(2), td:nth-child(2) { width: 22%; }
    th:nth-child(3), td:nth-child(3) { width: 11%; }
    th:nth-child(4), td:nth-child(4) { width: 21%; }
    th:nth-child(5), td:nth-child(5) { width: 23%; }
    th:nth-child(6), td:nth-child(6) { width: 19%; }
    .minor { display: block; margin-top: 2px; color: #64748b; font-size: 7.5px; }
    .period-time { white-space: nowrap; }
    .period-time .minor { display: inline; margin: 0 0 0 5px; }
    .substitute { color: #047857; }
    .signature-cell { height: 30px; vertical-align: middle; }
    .row-signature-line { display: block; width: 88%; height: 12px; margin: 0 auto; border-bottom: 1px solid #94a3b8; }
    .empty { margin-top: 18px; padding: 32px; border: 1px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; text-align: center; }
    .empty strong { display: block; color: #172554; font-size: 14px; }
    .empty span { display: block; margin-top: 4px; color: #64748b; }
    .signatures { display: flex; justify-content: flex-end; gap: 36px; margin-top: 24px; break-inside: avoid; }
    .signature { width: 155px; padding-top: 24px; border-bottom: 1px solid #64748b; text-align: center; }
    .signature-label { margin-top: 4px; color: #475569; font-size: 8px; font-weight: 700; }
    .footer { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-top: 14px; padding-top: 7px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 7px; }
    .footer span:nth-child(2) { color: #64748b; font-weight: 700; text-align: center; }
    .footer span:last-child { text-align: right; }
  </style>
</head>
<body>
  <main class="page">
    <header class="letterhead">
      ${logo}
      <div class="identity">
        <p class="school-name">${escapeHtml(schoolName)}</p>
        <p class="school-caption">Academic Operations Office</p>
      </div>
      <div class="document-type">
        <div class="kicker">Official duty register</div>
        <h1>Daily Substitution Report</h1>
        <p>${escapeHtml(MODE_LABELS[mode])} | ${escapeHtml(formatDate(board.date))}</p>
      </div>
    </header>

    <section class="meta-strip">
      <div class="meta-card"><span class="meta-label">Cover date</span><span class="meta-value">${escapeHtml(formatDate(board.date))}</span></div>
      <div class="meta-card"><span class="meta-label">Assigned duties</span><span class="meta-value">${assigned.length}</span></div>
      <div class="meta-card"><span class="meta-label">Substitute teachers</span><span class="meta-value">${substituteTeachers}</span></div>
      <div class="meta-card"><span class="meta-label">Periods covered</span><span class="meta-value">${periodsCovered}</span></div>
    </section>

    ${groupMarkup}

    <section class="signatures">
      <div><div class="signature"></div><div class="signature-label">Prepared by</div></div>
      <div><div class="signature"></div><div class="signature-label">Academic Coordinator / Principal</div></div>
    </section>
    <footer class="footer">
      <span>Computer-generated substitution duty register | ${escapeHtml(schoolName)}</span>
      <span>Powered by Nexsyrus SIMS</span>
      <span>Generated ${escapeHtml(generatedAt.toLocaleString('en-IN'))}</span>
    </footer>
  </main>
</body>
</html>`;
}

export function getSubstitutionReportFileName(date: string, mode: SubstitutionReportMode): string {
  return `substitutions-${safeFilePart(date)}-${safeFilePart(mode)}.pdf`;
}

export async function resolveSubstitutionReportLogo(profileLogoUrl?: string | null): Promise<string | null> {
  const candidates = [profileLogoUrl, SCHOOL_LOGO]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const candidate of [...new Set(candidates)]) {
    const logoUrl = resolveApiAssetUrl(candidate);
    if (!logoUrl) continue;
    const encoded = await toBase64Uri(logoUrl);
    if (encoded) return encoded;
  }

  return bundledAssetToBase64Uri(DEFAULT_SCHOOL_LOGO, 'image/png');
}

export async function downloadSubstitutionReportPdf(
  board: SubstitutionBoard,
  mode: SubstitutionReportMode,
  branding: SubstitutionReportBranding = {},
): Promise<string> {
  const logoUri = await resolveSubstitutionReportLogo(branding.logoUrl);
  const html = buildSubstitutionReportHtml({
    board,
    mode,
    schoolName: branding.schoolName || SCHOOL_NAME,
    logoUri,
  });
  const fileName = getSubstitutionReportFileName(board.date, mode);

  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return fileName;
  }

  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      dialogTitle: `Download ${fileName}`,
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
  return fileName;
}
