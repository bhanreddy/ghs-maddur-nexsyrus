import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import QRCode from 'qrcode';
import type { IssuedLoginQr, LoginQrSchool } from './types';

export const LOGIN_QR_CARDS_PER_PAGE = 8;

// Keep the complete four-module quiet zone in every exported card.
const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 4 };

export function studentQrPngDataUrl(payload: string): Promise<string> {
  // Render directly to canvas on web. Exporting a hidden react-native-svg view
  // depends on DOM measurements and an image load that has no error callback.
  const modules = QRCode.create(payload, QR_OPTIONS).modules.size;
  return QRCode.toDataURL(payload, {
    ...QR_OPTIONS,
    type: 'image/png',
    scale: Math.ceil(1024 / (modules + 8)),
  });
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] || character);
}

async function printHtmlOnWeb(html: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); reject(new Error('Could not open print preview.')); return; }
    const finish = () => { frame.remove(); resolve(); };
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { win.focus(); win.print(); win.addEventListener('afterprint', finish, { once: true }); setTimeout(finish, 4000); }
      catch (error) { frame.remove(); reject(error); }
    }, 400);
  });
}

export interface StudentQrPrintOptions {
  school: LoginQrSchool;
  academicYear: string;
  className: string;
  sectionName: string;
  credentials: IssuedLoginQr[];
  generatedAt?: Date;
}

function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'SchoolIMS';
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SI';
}

function logoMarkup(school: LoginQrSchool): string {
  if (school.logo_url) return `<img class="school-logo" src="${escapeHtml(school.logo_url)}" alt="" />`;
  return `<div class="logo-fallback">${escapeHtml(initials(school.name))}</div>`;
}

function cardMarkup(credential: IssuedLoginQr, qrSvg: string, large = false): string {
  const student = credential.student;
  return `<article class="qr-card${large ? ' single-card' : ''}">
    <div class="card-brand"><span>SchoolIMS</span><span class="private-label">PRIVATE</span></div>
    <div class="card-body">
      <div class="qr-box">${qrSvg}</div>
      <div class="student-copy">
        <h2>${escapeHtml(student.name)}</h2>
        <p class="class-line">Class ${escapeHtml(student.className || '-')} - ${escapeHtml(student.sectionName || '-')}</p>
        <p>Admission No: <strong>${escapeHtml(student.admissionNo)}</strong></p>
        <p class="instruction">Open SchoolIMS, then scan to sign in</p>
        <p class="privacy">Keep this QR private. Anyone with this card can sign in as this student.</p>
      </div>
    </div>
  </article>`;
}

export function buildStudentQrPdfHtmlFromSvgs(
  options: StudentQrPrintOptions,
  qrSvgs: string[],
  single = false,
): string {
  if (!options.credentials.length || options.credentials.length !== qrSvgs.length) {
    throw new Error('QR card data is incomplete.');
  }
  const generated = options.generatedAt || new Date();
  const pages: string[] = [];
  const pageSize = single ? 1 : LOGIN_QR_CARDS_PER_PAGE;
  for (let start = 0; start < options.credentials.length; start += pageSize) {
    const cards = options.credentials.slice(start, start + pageSize).map((credential, index) =>
      cardMarkup(credential, qrSvgs[start + index], single),
    ).join('');
    pages.push(`<section class="page${single ? ' single-page' : ''}">
      <header class="sheet-header">
        <div class="header-brand">${logoMarkup(options.school)}<div><h1>${escapeHtml(options.school.name)}</h1><p>Student Login QR Codes</p></div></div>
        <div class="header-meta"><strong>Class ${escapeHtml(options.className)} - ${escapeHtml(options.sectionName)}</strong><span>${escapeHtml(options.academicYear)}</span><span>Generated ${escapeHtml(dateLabel(generated))}</span></div>
      </header>
      <main class="card-grid">${cards}</main>
      <footer>SchoolIMS secure credential cards - Page ${pages.length + 1}</footer>
    </section>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #172033; font-family: Arial, "Noto Sans", sans-serif; background: #eef1f6; }
    .page { width: 210mm; height: 297mm; padding: 9mm 10mm 7mm; background: #fff; page-break-after: always; overflow: hidden; display: flex; flex-direction: column; }
    .page:last-child { page-break-after: auto; }
    .sheet-header { height: 23mm; flex: 0 0 23mm; display: flex; align-items: center; justify-content: space-between; border-bottom: .35mm solid #5b36a3; padding-bottom: 3mm; }
    .header-brand { display: flex; align-items: center; gap: 3mm; }
    .school-logo, .logo-fallback { width: 13mm; height: 13mm; object-fit: contain; }
    .logo-fallback { border-radius: 50%; background: #5b36a3; color: white; display: grid; place-items: center; font-weight: 800; font-size: 4mm; }
    h1 { margin: 0; font-size: 5mm; line-height: 1.1; } .header-brand p { margin: 1mm 0 0; font-size: 3.1mm; color: #536079; }
    .header-meta { text-align: right; display: grid; gap: .7mm; font-size: 2.8mm; color: #536079; } .header-meta strong { color: #172033; font-size: 3.2mm; }
    .card-grid { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(4, 1fr); gap: 6mm; padding-top: 5mm; padding-bottom: 3mm; }
    .qr-card { min-width: 0; min-height: 0; border: .3mm dashed #9aa4b6; border-radius: 2.5mm; padding: 3mm; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
    .card-brand { height: 5mm; display: flex; justify-content: space-between; align-items: start; color: #5b36a3; font-weight: 800; font-size: 2.8mm; letter-spacing: .2mm; }
    .private-label { padding: .7mm 1.4mm; border-radius: 2mm; color: #8a4b00; background: #fff2d8; font-size: 2mm; letter-spacing: .3mm; }
    .card-body { height: calc(100% - 5mm); display: flex; align-items: center; gap: 3mm; }
    .qr-box { width: 38mm; height: 38mm; flex: 0 0 38mm; display: grid; place-items: center; background: #fff; }
    .qr-box svg { width: 38mm !important; height: 38mm !important; display: block; }
    .student-copy { min-width: 0; flex: 1; }
    .student-copy h2 { margin: 0 0 1.4mm; font-size: 3.7mm; line-height: 1.15; overflow-wrap: anywhere; word-break: break-word; }
    .student-copy p { margin: .8mm 0; font-size: 2.6mm; line-height: 1.25; }
    .class-line { color: #46536b; font-weight: 700; } .instruction { color: #5b36a3; font-weight: 800; }
    .student-copy .privacy { margin-top: 1.5mm; color: #68748a; font-size: 2.05mm; line-height: 1.2; }
    footer { flex: 0 0 3mm; text-align: center; color: #8993a5; font-size: 2.1mm; }
    .single-page .card-grid { display: flex; align-items: center; justify-content: center; }
    .single-card { width: 105mm; height: 145mm; padding: 8mm; border-width: .45mm; }
    .single-card .card-brand { height: 10mm; font-size: 4mm; }
    .single-card .card-body { flex-direction: column; justify-content: center; text-align: center; gap: 5mm; }
    .single-card .qr-box, .single-card .qr-box svg { width: 48mm !important; height: 48mm !important; }
    .single-card .student-copy h2 { font-size: 6mm; } .single-card .student-copy p { font-size: 3.5mm; }
    .single-card .student-copy .privacy { font-size: 2.7mm; max-width: 80mm; }
    @media screen { .page { margin: 10px auto; box-shadow: 0 5px 25px rgba(15,23,42,.12); } }
  </style></head><body>${pages.join('')}</body></html>`;
}

export async function buildStudentQrPdfHtml(options: StudentQrPrintOptions, single = false): Promise<string> {
  const qrSvgs = await Promise.all(options.credentials.map((credential) =>
    QRCode.toString(credential.qrPayload, { ...QR_OPTIONS, type: 'svg', width: 512 }),
  ));
  return buildStudentQrPdfHtmlFromSvgs(options, qrSvgs, single);
}

export function studentQrPdfFilename(options: StudentQrPrintOptions): string {
  const date = (options.generatedAt || new Date()).toISOString().slice(0, 10);
  return `${safeFilename(options.school.name)}_Class-${safeFilename(options.className)}-${safeFilename(options.sectionName)}_Login-QR_${date}.pdf`;
}

export async function saveStudentQrPdf(options: StudentQrPrintOptions, single = false): Promise<void> {
  const html = await buildStudentQrPdfHtml(options, single);
  const filename = single
    ? `${safeFilename(options.credentials[0].student.name)}_LoginQR_Card.pdf`
    : studentQrPdfFilename(options);
  if (Platform.OS === 'web') {
    await downloadPdfOnWeb(html, filename);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const target = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Save Student Login QR Codes' });
}

async function downloadPdfOnWeb(html: string, filename: string): Promise<void> {
  if (typeof document === 'undefined') {
    await printHtmlOnWeb(html);
    return;
  }
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-12000px;top:0;width:210mm;background:#ffffff;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const pages = Array.from(host.querySelectorAll<HTMLElement>('section.page'));
    if (!pages.length) throw new Error('PDF layout failed.');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      // JPEG artifacts soften the module edges and make printed cards harder to scan.
      const image = canvas.toDataURL('image/png');
      if (index > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(image, 'PNG', 0, 0, 210, 297);
    }
    pdf.save(filename);
  } finally {
    host.remove();
  }
}

export async function printStudentQrPdf(options: StudentQrPrintOptions, single = false): Promise<void> {
  const html = await buildStudentQrPdfHtml(options, single);
  if (Platform.OS === 'web') return printHtmlOnWeb(html);
  await Print.printAsync({ html });
}
