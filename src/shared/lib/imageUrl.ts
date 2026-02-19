export function extractGoogleDriveFileId(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  const matchFromPath = input.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (matchFromPath?.[1]) return decodeURIComponent(matchFromPath[1]);

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (!host.includes('drive.google.com')) return null;

    const filePathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
    if (filePathMatch?.[1]) return decodeURIComponent(filePathMatch[1]);

    const id = url.searchParams.get('id');
    if (id) return decodeURIComponent(id);
  } catch {
    return null;
  }

  return null;
}

export function normalizeExternalImageUrl(value: string): string {
  const input = value.trim();
  if (!input) return '';

  const driveFileId = extractGoogleDriveFileId(input);
  if (!driveFileId) return input;

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1200`;
}

const FORCE_CONTRAST_DRIVE_FILE_IDS = new Set([
  '11pW3aivugwyFn_aUab-iQpMTIpxblisk',
  '15DwY7jq6RDlwmg1ikJsKENbDFHyqDv1b',
]);

export function shouldForceLogoContrastBoost(value: string): boolean {
  const driveFileId = extractGoogleDriveFileId(value);
  if (!driveFileId) return false;
  return FORCE_CONTRAST_DRIVE_FILE_IDS.has(driveFileId);
}

const imageLuminanceCache = new Map<string, number | null>();

export async function estimateImageLuminance(url: string): Promise<number | null> {
  const input = url.trim();
  if (!input) return null;
  if (imageLuminanceCache.has(input)) return imageLuminanceCache.get(input) ?? null;
  if (typeof window === 'undefined') return null;

  const luminance = await new Promise<number | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let weighted = 0;
        let alphaSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] / 255;
          if (alpha < 0.06) continue;
          const luminanceSample =
            (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          weighted += luminanceSample * alpha;
          alphaSum += alpha;
        }

        resolve(alphaSum > 0 ? weighted / alphaSum : null);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = input;
  });

  imageLuminanceCache.set(input, luminance);
  return luminance;
}
