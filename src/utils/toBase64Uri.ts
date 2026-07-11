import { Platform } from 'react-native';
import { API_URL } from '../constants/school';

function getApiBaseUrl(): string {
  const url = API_URL.trim();
  if (Platform.OS === 'web' && url.includes('10.0.2.2')) {
    return url.replace('10.0.2.2', 'localhost');
  }
  if (Platform.OS === 'android' && url.includes('localhost')) {
    return url.replace('localhost', '10.0.2.2');
  }
  return url;
}

/** Prefix relative asset paths with the API base URL. */
export function resolveApiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const base = getApiBaseUrl().replace(/\/$/, '');
  const relative = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${relative}`;
}

function mimeFromUrl(url: string): string {
  if (/\.jpe?g($|\?)/i.test(url)) return 'image/jpeg';
  if (/\.webp($|\?)/i.test(url)) return 'image/webp';
  if (/\.gif($|\?)/i.test(url)) return 'image/gif';
  if (/\.svg($|\?)/i.test(url)) return 'image/svg+xml';
  return 'image/png';
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Fetch a remote image and return a base64 data-URI, or null on failure. */
export async function toBase64Uri(url: string): Promise<string | null> {
  try {
    if (url.startsWith('data:')) return url;

    if (Platform.OS === 'web') {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await blobToDataUri(blob);
    }

    const FileSystem: any = await import('expo-file-system');
    const tempPath = `${FileSystem.cacheDirectory ?? ''}payslip-logo-${Date.now()}`;
    const downloaded = await FileSystem.downloadAsync(url, tempPath);
    const base64 = await FileSystem.readAsStringAsync(downloaded.uri, {
      encoding: 'base64',
    });
    return `data:${mimeFromUrl(url)};base64,${base64}`;
  } catch {
    return null;
  }
}

/** Convert a bundled Expo image asset, such as require('../../assets/images/icon.png'), to a data URI. */
export async function bundledAssetToBase64Uri(assetModule: number, mimeType = 'image/png'): Promise<string | null> {
  try {
    const { Asset } = await import('expo-asset');
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) return null;

    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await blobToDataUri(blob);
    }

    const FileSystem = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}
