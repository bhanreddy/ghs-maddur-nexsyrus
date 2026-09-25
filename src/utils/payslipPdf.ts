import { Platform } from 'react-native';
import { SCHOOL_NAME } from '../constants/school';
import { SCHOOL_CONFIG } from '../constants/schoolConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PayslipPdfLine {
  name: string;
  kind?: string;
  quantity?: string | null;
  amount?: string | null;
  explanation?: string | null;
}

export interface PayslipPdfRow {
  id: string;
  month: string;
  status: string;
  earnings: string;
  deductions: string;
  net: string;
  payment_date?: string | null;
  amount_in_words?: string | null;
  per_day_salary?: string | null;
  calendar_days?: number | null;
  employment_days?: number | null;
  lines?: PayslipPdfLine[];
  attendance?: Record<string, string | number | null> | null;
  identity?: {
    classification?: string | null;
    employmentType?: string | null;
    campus?: string | null;
    department?: string | null;
    bankMasked?: string | null;
  } | null;
}

export interface PayslipPdfEmployee {
  name?: string | null;
  staffCode?: string | null;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface PayslipPdfSchool {
  name?: string | null;
  /** base64 data-URI or https URL — REQUIRED for logo watermark */
  logoUri?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  affiliation?: string | null;
}

export interface PayslipPdfOptions {
  payslip: PayslipPdfRow;
  employee?: PayslipPdfEmployee;
  school?: PayslipPdfSchool;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function valueOrDash(value?: string | null): string {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : '—';
}

function normalizeCurrency(value?: string | null): string {
  return valueOrDash(value).replace(/₹/g, 'Rs. ');
}

function parseCurrencyValue(value?: string | null): number | null {
  const numeric = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!numeric) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(value?: string | null): string {
  return valueOrDash(value)
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
      .slice(0, 60) || 'payslip'
  );
}

function getFileName(payslip: PayslipPdfRow): string {
  return `payslip-${fileSafe(payslip.month)}.pdf`;
}

// ─── HTML Template (expo-print / native) ─────────────────────────────────────
// Premium light "document-grade" payslip. Designed at A4 proportions
// (794 × 1123 px @ 96dpi) so jsPDF fills the page without vertical squish.
// Palette: ivory paper, deep navy letterhead, gold hairline accents.

function buildPayslipHtml({ payslip, employee, school }: PayslipPdfOptions): string {
  const schoolName = escapeHtml(school?.name || SCHOOL_CONFIG.name || SCHOOL_NAME || 'School');
  const schoolAddr = escapeHtml(school?.address || SCHOOL_CONFIG.address);
  const schoolPhone = escapeHtml(school?.phone || SCHOOL_CONFIG.contact);
  const schoolEmail = escapeHtml(school?.email || SCHOOL_CONFIG.email);
  const schoolWeb = escapeHtml(school?.website || SCHOOL_CONFIG.website);
  const affiliationText = school?.affiliation || (SCHOOL_CONFIG.cbseAffiliationNo ? `Affiliated to ${SCHOOL_CONFIG.cbseAffiliationNo}` : null);
  const affiliation = escapeHtml(affiliationText);
  const logoUri = school?.logoUri ?? '';

  const empName = escapeHtml(employee?.name || 'Staff Member');
  const staffCode = escapeHtml(employee?.staffCode);
  const designation = escapeHtml(employee?.designation || 'School Staff');
  const department = escapeHtml(employee?.designation ? 'Academic / Administration' : 'School Office');
  const empEmail = escapeHtml(employee?.email);
  const empPhone = escapeHtml(employee?.phone);

  const month = escapeHtml(payslip.month);
  const status = escapeHtml((payslip.status || 'Paid').toUpperCase());
  const isPaid = (payslip.status || 'Paid').toLowerCase().includes('paid');
  const paymentDate = escapeHtml(formatDate(payslip.payment_date));
  const generatedDate = escapeHtml(formatDate(new Date().toISOString()));
  const deductionValue = parseCurrencyValue(payslip.deductions) ?? 0;
  const earnings = escapeHtml(normalizeCurrency(payslip.earnings));
  const deductions = escapeHtml(normalizeCurrency(payslip.deductions));
  const net = escapeHtml(normalizeCurrency(payslip.net));
  const payslipId = escapeHtml(payslip.id);
  const officePhone = schoolPhone !== '—' ? schoolPhone : escapeHtml(SCHOOL_CONFIG.contact);

  const deductionsRow = deductionValue > 0
    ? `<tr>
         <td class="t-desc">Total Deductions</td>
         <td class="t-note">PF, TDS &amp; statutory deductions</td>
         <td class="t-amt neg">- ${deductions}</td>
       </tr>`
    : '';
  const lineRows = (payslip.lines || []).map((line) => {
    const sign = line.kind === 'deduction' ? '-' : '';
    return `<tr>
         <td class="t-desc">${escapeHtml(line.name)}</td>
         <td class="t-note">${escapeHtml(line.explanation).replace(/\n/g, '<br>')}</td>
         <td class="t-amt ${line.kind === 'deduction' ? 'neg' : 'pos'}">${sign} ${escapeHtml(line.amount)}</td>
       </tr>`;
  }).join('');
  const ledgerRows = lineRows || `<tr>
              <td class="t-desc">Gross Earnings</td>
              <td class="t-note">Total payable earnings</td>
              <td class="t-amt pos">${earnings}</td>
            </tr>
            ${deductionsRow}`;
  const amountWords = payslip.amount_in_words
    ? `<div class="net-sub">${escapeHtml(payslip.amount_in_words)}</div>`
    : '<div class="net-sub">Credited for the pay period</div>';
  const classification = payslip.identity?.classification
    ? `<div class="row"><span>Classification</span><strong>${escapeHtml(payslip.identity.classification)}</strong></div>`
    : '';
  const bank = payslip.identity?.bankMasked
    ? `<div class="row"><span>Bank</span><strong>${escapeHtml(payslip.identity.bankMasked)}</strong></div>`
    : '';

  const logoBlock = logoUri
    ? `<img src="${logoUri}" alt="School Logo" class="emblem-logo" />`
    : `<span class="emblem-initials">${schoolName.charAt(0).toUpperCase()}</span>`;
  const watermarkBlock = logoUri
    ? `<div class="watermark"><img src="${logoUri}" alt="" /></div>`
    : `<div class="watermark"><span class="wm-mono">${schoolName.charAt(0).toUpperCase()}</span></div>`;

  const statusColor = isPaid ? '#047857' : '#92400e';
  const statusBg = isPaid ? '#ecfdf5' : '#fffbeb';
  const statusBorder = isPaid ? '#a7f3d0' : '#fde68a';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 0; size: A4 portrait; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #eef1f5;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .serif { font-family: Georgia, "Times New Roman", serif; }

    /* A4 sheet — captured element for html2canvas */
    .sheet {
      position: relative;
      width: 794px;
      min-height: 1123px;
      margin: 0 auto;
      background: #ffffff;
      overflow: hidden;
    }

    /* Double frame — navy outer + gold hairline inner (prints cleanly) */
    .frame-outer {
      position: absolute;
      top: 18px; right: 18px; bottom: 18px; left: 18px;
      border: 1.5px solid #0c2a52;
      pointer-events: none;
    }
    .frame-inner {
      position: absolute;
      top: 23px; right: 23px; bottom: 23px; left: 23px;
      border: 1px solid #b08d57;
      pointer-events: none;
    }

    /* Faint watermark behind content */
    .watermark {
      position: absolute;
      top: 420px; left: 0; right: 0;
      display: flex;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
    }
    .watermark img { width: 300px; height: 300px; object-fit: contain; opacity: 0.05; }
    .wm-mono {
      font-family: Georgia, serif;
      font-size: 360px;
      font-weight: 700;
      color: #0c2a52;
      opacity: 0.04;
      line-height: 1;
    }

    .inner {
      position: relative;
      z-index: 1;
      padding: 34px 40px 40px;
    }

    /* ── Letterhead ───────────────────────────────────────────── */
    .header {
      display: grid;
      grid-template-columns: 78px 1fr auto;
      gap: 18px;
      align-items: center;
      padding-bottom: 18px;
    }
    .emblem {
      width: 76px; height: 76px;
      border-radius: 50%;
      display: grid; place-items: center;
      background: #ffffff;
      border: 2px solid #b08d57;
      box-shadow: 0 0 0 4px #ffffff, 0 0 0 5px #e6d3ac;
    }
    .emblem-logo { width: 58px; height: 58px; object-fit: contain; }
    .emblem-initials {
      font-family: Georgia, serif;
      color: #0c2a52;
      font-size: 30px;
      font-weight: 700;
    }
    .school-block { min-width: 0; }
    .school-title {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 25px;
      line-height: 1.12;
      color: #0c2a52;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .affiliation {
      margin-top: 5px;
      color: #6b7280;
      font-size: 9.5px;
      letter-spacing: 1.6px;
      text-transform: uppercase;
    }
    .contacts {
      margin-top: 9px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: #475569;
      font-size: 10px;
    }
    .contacts span { white-space: nowrap; }
    .contacts span + span { padding-left: 14px; border-left: 1px solid #e2e8f0; }
    .doc-mark { text-align: right; }
    .doc-title {
      font-family: Georgia, serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 5px;
      color: #0c2a52;
      line-height: 1;
    }
    .doc-month { margin-top: 6px; color: #64748b; font-size: 10.5px; letter-spacing: 0.4px; }
    .status-badge {
      display: inline-block;
      margin-top: 9px;
      padding: 4px 13px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.2px;
      color: ${statusColor};
      background: ${statusBg};
      border: 1px solid ${statusBorder};
    }

    .rule {
      height: 2px;
      background: linear-gradient(90deg, #0c2a52 0%, #0c2a52 60%, #b08d57 60%, #b08d57 100%);
      margin: 2px 0 22px;
    }

    /* ── Detail cards ─────────────────────────────────────────── */
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .card {
      border: 1px solid #e2e8f0;
      border-top: 3px solid #0c2a52;
      border-radius: 6px;
      padding: 14px 16px;
      background: #fcfcfd;
    }
    .card-title {
      color: #0c2a52;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 1.1px;
      text-transform: uppercase;
      margin-bottom: 10px;
      padding-bottom: 7px;
      border-bottom: 1px solid #eef1f5;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 5.5px 0;
      font-size: 11px;
      color: #64748b;
    }
    .row strong { color: #0f172a; font-weight: 600; text-align: right; }
    .row strong.ok { color: #047857; }

    /* ── Salary ledger ────────────────────────────────────────── */
    .ledger-wrap { margin-top: 24px; }
    .section-label {
      font-family: Georgia, serif;
      color: #0c2a52;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    table.ledger { width: 100%; border-collapse: collapse; }
    table.ledger thead th {
      text-align: left;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #475569;
      background: #f5f7fa;
      padding: 10px 14px;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
    }
    table.ledger thead th:last-child,
    table.ledger td.t-amt { text-align: right; }
    table.ledger td {
      padding: 12px 14px;
      border-bottom: 1px solid #eef1f5;
      font-size: 11.5px;
      color: #0f172a;
    }
    td.t-desc { font-weight: 600; }
    td.t-note { color: #94a3b8; font-size: 10.5px; }
    td.t-amt { font-weight: 700; }
    td.t-amt.pos { color: #047857; }
    td.t-amt.neg { color: #b91c1c; }

    /* ── Net pay band ─────────────────────────────────────────── */
    .net-band {
      margin-top: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      border-left: 5px solid #0c2a52;
      background: #f8fafc;
    }
    .net-left { display: flex; align-items: center; gap: 16px; }
    .rupee {
      width: 46px; height: 46px;
      border-radius: 50%;
      display: grid; place-items: center;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      background: #0c2a52;
      border: 2px solid #b08d57;
    }
    .net-label {
      color: #0c2a52;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
    }
    .net-sub { color: #64748b; font-size: 10px; margin-top: 3px; }
    .net-value {
      font-family: Georgia, serif;
      color: #047857;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    /* ── Signature + footer ───────────────────────────────────── */
    .sign-row {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .gen-note { color: #94a3b8; font-size: 10px; }
    .gen-note strong { color: #475569; font-weight: 600; }
    .sign-box { text-align: center; min-width: 200px; }
    .sign-line { border-top: 1px solid #94a3b8; padding-top: 6px; }
    .sign-label { color: #475569; font-size: 10px; font-weight: 600; letter-spacing: 0.6px; }
    .sign-sub { color: #94a3b8; font-size: 9px; margin-top: 2px; }

    .footer {
      margin-top: 26px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      color: #94a3b8;
      font-size: 9.5px;
    }
    .footer strong { color: #475569; font-weight: 600; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="frame-outer"></div>
    <div class="frame-inner"></div>
    ${watermarkBlock}

    <div class="inner">
      <div class="header">
        <div class="emblem">${logoBlock}</div>
        <div class="school-block">
          <div class="school-title">${schoolName}</div>
          ${affiliation !== '—' ? `<div class="affiliation">${affiliation}</div>` : ''}
          <div class="contacts">
            ${schoolAddr !== '—' ? `<span>${schoolAddr}</span>` : ''}
            ${schoolPhone !== '—' ? `<span>${schoolPhone}</span>` : ''}
            ${schoolEmail !== '—' ? `<span>${schoolEmail}</span>` : ''}
            ${schoolWeb !== '—' ? `<span>${schoolWeb}</span>` : ''}
          </div>
        </div>
        <div class="doc-mark">
          <div class="doc-title">PAYSLIP</div>
          <div class="doc-month">${month}</div>
          <div class="status-badge">${status}</div>
        </div>
      </div>

      <div class="rule"></div>

      <div class="cards">
        <div class="card">
          <div class="card-title">Employee Details</div>
          <div class="row"><span>Name</span><strong>${empName}</strong></div>
          <div class="row"><span>Staff Code</span><strong>${staffCode}</strong></div>
          <div class="row"><span>Designation</span><strong>${designation}</strong></div>
          <div class="row"><span>Department</span><strong>${department}</strong></div>
          ${classification}
          ${bank}
          ${empEmail !== '—' ? `<div class="row"><span>Email</span><strong>${empEmail}</strong></div>` : ''}
          ${empPhone !== '—' ? `<div class="row"><span>Phone</span><strong>${empPhone}</strong></div>` : ''}
        </div>
        <div class="card">
          <div class="card-title">Payslip Details</div>
          <div class="row"><span>Pay Period</span><strong>${month}</strong></div>
          <div class="row"><span>Pay Date</span><strong>${paymentDate}</strong></div>
          <div class="row"><span>Status</span><strong class="ok">${status}</strong></div>
          <div class="row"><span>Generated</span><strong>${generatedDate}</strong></div>
          <div class="row"><span>Payslip ID</span><strong>#${payslipId}</strong></div>
        </div>
      </div>

      <div class="ledger-wrap">
        <div class="section-label">Salary Breakdown</div>
        <table class="ledger">
          <thead>
            <tr><th>Description</th><th>Details</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${ledgerRows}
          </tbody>
        </table>
      </div>

      <div class="net-band">
        <div class="net-left">
          <div class="rupee">&#8377;</div>
          <div>
            <div class="net-label">Net Pay</div>
            ${amountWords}
          </div>
        </div>
        <div class="net-value">${net}</div>
      </div>

      <div class="sign-row">
        <div class="gen-note">
          <div>This is a computer-generated payslip.</div>
          <div>No physical signature is required for validity.</div>
        </div>
        <div class="sign-box">
          <div class="sign-line">
            <div class="sign-label">Authorised Signatory</div>
            <div class="sign-sub">For ${schoolName}</div>
          </div>
        </div>
      </div>

      <div class="footer">
        <span>Verifiable by school authority &middot; Payslip #${payslipId}</span>
        <span><strong>School Office:</strong> ${officePhone}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── jsPDF (Web) ──────────────────────────────────────────────────────────────

async function downloadPayslipWeb(options: PayslipPdfOptions, fileName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;
  const html = buildPayslipHtml(options);

  if (typeof document === 'undefined') {
    throw new Error('PDF download is only available in a browser context.');
  }

  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:794px',
    'background:#ffffff',
    'z-index:-1',
  ].join(';');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  try {
    const target = wrapper.querySelector('.sheet') as HTMLElement | null;
    if (!target) throw new Error('Payslip PDF template failed to mount.');

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Preserve aspect ratio instead of stretching the canvas to fill A4.
    const ratio = canvas.height / canvas.width;
    let renderW = pageW;
    let renderH = pageW * ratio;
    if (renderH > pageH) {
      renderH = pageH;
      renderW = pageH / ratio;
    }
    const offsetX = (pageW - renderW) / 2;
    const offsetY = (pageH - renderH) / 2;

    doc.addImage(canvas.toDataURL('image/png'), 'PNG', offsetX, offsetY, renderW, renderH);
    doc.save(fileName);
  } finally {
    wrapper.remove();
  }
}

// ─── Native ──────────────────────────────────────────────────────────────────

async function downloadPayslipNative(options: PayslipPdfOptions, fileName: string): Promise<void> {
  const Print   = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html: buildPayslipHtml(options) });

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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function downloadPayslipPdf(options: PayslipPdfOptions): Promise<string> {
  const fileName = getFileName(options.payslip);
  if (Platform.OS === 'web') {
    await downloadPayslipWeb(options, fileName);
  } else {
    await downloadPayslipNative(options, fileName);
  }
  return fileName;
}