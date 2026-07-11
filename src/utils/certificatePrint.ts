import { Platform, type View } from 'react-native';
import type { RefObject } from 'react';
import { exportToPDF, printElementToWindow } from './exportCertificate';

export const CERTIFICATE_PRINT_STYLE_ID = 'schoolims-certificate-print-styles';

export const CERTIFICATE_PRINT_CSS = `
@media print {
  body * {
    visibility: hidden;
  }
  .certificate-print-root,
  .certificate-print-root * {
    visibility: visible;
  }
  .certificate-print-root {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none !important;
    box-shadow: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .certificate-watermark,
  .certificate-watermark img {
    display: block !important;
    opacity: 0.08 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .certificate-print-root img {
    display: block !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

/** Inject global @media print rules once (web / Tauri desktop). */
export function injectCertificatePrintStyles(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(CERTIFICATE_PRINT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CERTIFICATE_PRINT_STYLE_ID;
  style.textContent = CERTIFICATE_PRINT_CSS;
  document.head.appendChild(style);
}

/** Resolve the mounted certificate DOM node from a React ref (RN Web). */
export function resolveCertificateElement(ref: RefObject<View | null>): HTMLElement | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !ref.current) {
    return null;
  }

  const node = ref.current as unknown as HTMLElement;
  if (node instanceof HTMLElement) {
    return node;
  }

  // Fallback if className/nativeID was applied but ref shape differs
  return (
    document.getElementById('certificate-print-root')
    ?? document.querySelector('.certificate-print-root')
  );
}

async function uriToDataUri(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const FileSystem: any = await import('expo-file-system/legacy');
  const base64Logo = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const mime = uri.toLowerCase().includes('.jpg') || uri.toLowerCase().includes('.jpeg') ? 'jpeg' : 'png';
  return `data:image/${mime};base64,${base64Logo}`;
}

/** Platform-aware base64 logo for embedded HTML / print output. */
export async function getLogoDataUri(logoUrl?: string): Promise<string> {
  if (logoUrl?.trim()) {
    try {
      return await uriToDataUri(logoUrl.trim());
    } catch {
      /* fall through to bundled asset */
    }
  }

  const { Asset } = await import('expo-asset');
  const asset = Asset.fromModule(require('../../assets/images/icon.png'));
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) return '';
  return uriToDataUri(uri);
}

export type CertificatePdfFormat = 'TC' | 'TC_A4_HALF' | 'BONAFIDE';

export async function downloadCertificatePdf(
  element: HTMLElement | null,
  format: CertificatePdfFormat,
  fileName: string,
): Promise<void> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('PDF download is only supported on web.');
  }

  if (!element) {
    throw new Error('Certificate preview not found.');
  }

  await exportToPDF(element, format, fileName);
}

/**
 * Rasterize the certificate with html2canvas, then print the image in an
 * isolated window. React Native Web compiles styles to CSS classes that do NOT
 * transfer to a new window, so we print a flattened image instead — all text,
 * logo, and watermark styles are preserved.
 */
export async function printCertificateElement(
  element: HTMLElement | null,
  format: CertificatePdfFormat,
): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  if (!element) {
    throw new Error('Certificate preview not found.');
  }

  await printElementToWindow(element, format, { title: 'Certificate' });
}
