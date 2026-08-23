import { Platform } from 'react-native';
import { API_URL } from '../constants/school';

function getApiBaseUrl(): string {
  const url = API_URL.trim();
  if (Platform.OS === 'web') {
    return url.replace(/10\.0\.2\.2/g, 'localhost').replace(/10\.0\.3\.2/g, 'localhost');
  }
  // Android emulator: localhost/127.0.0.1 are the emulator itself — use 10.0.2.2 for host.
  if (Platform.OS === 'android') {
    return url.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2');
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

function isFileUri(uri: string | null | undefined): boolean {
  return !!uri && uri.startsWith('file:');
}

function hasReadableScheme(uri: string): boolean {
  return /^(file|content|http|https|data|asset):/i.test(uri);
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolve a bundled Expo image (`require(...)`) to a FileSystem-readable `file://` URI.
 *
 * On Android release builds, expo-asset marks images as already downloaded with a bare
 * drawable name like `assets_images_icon`. `readAsStringAsync` cannot read those — we
 * force a real cache copy first (known expo-asset Android quirk).
 */
export async function resolveBundledAssetFileUri(assetModule: number): Promise<string | null> {
  const { Asset } = await import('expo-asset');
  const asset = Asset.fromModule(assetModule);

  // Android may set downloaded=true with a drawable resource name (no scheme).
  // Reset so downloadAsync actually copies the bytes into the cache directory.
  if (asset.downloaded && asset.localUri && !asset.localUri.startsWith('file:')) {
    (asset as { downloaded: boolean }).downloaded = false;
  }

  await asset.downloadAsync();

  if (asset.localUri && isFileUri(asset.localUri)) {
    return asset.localUri;
  }

  const sourceUri = asset.localUri || asset.uri;
  if (!sourceUri) return null;

  if (Platform.OS === 'web') {
    return sourceUri;
  }

  // Already a scheme FileSystem / fetch can use.
  if (isFileUri(sourceUri)) {
    return sourceUri;
  }

  // Bare Android drawable name — copyAsync supports no-scheme sources on Android.
  if (Platform.OS === 'android' && !hasReadableScheme(sourceUri)) {
    const FileSystem = await import('expo-file-system/legacy');
    const ext = asset.type || 'png';
    const dest = `${FileSystem.cacheDirectory}ExponentAsset-${asset.hash ?? asset.name}.${ext}`;
    try {
      const info = await FileSystem.getInfoAsync(dest);
      if (!info.exists) {
        await FileSystem.copyAsync({ from: sourceUri, to: dest });
      }
      return dest;
    } catch {
      // Fall through to image-manipulator
    }
  }

  if (hasReadableScheme(sourceUri) && !sourceUri.startsWith('http')) {
    return sourceUri;
  }

  // Last resort: image-manipulator materializes a real file:// URI.
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const input = asset.localUri && isFileUri(asset.localUri) ? asset.localUri : sourceUri;
    const result = await ImageManipulator.manipulateAsync(input, [], {
      format: ImageManipulator.SaveFormat.PNG,
    });
    return result.uri || null;
  } catch {
    return null;
  }
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

    const FileSystem: any = await import('expo-file-system/legacy');
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
    const uri = await resolveBundledAssetFileUri(assetModule);
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
