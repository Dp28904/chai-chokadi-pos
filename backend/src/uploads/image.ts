import sharp from 'sharp';

export type ImageKind = 'photo' | 'qr';

/** Largest edge stored. Counter cards are ~180 css px wide, so this is sharp even at 3x DPR. */
const PHOTO_MAX = 720;
/** QR codes stay lossless and large enough to scan from a phone screen. */
const QR_MAX = 1000;
/** Refuse "decompression bomb" images before decoding them. */
const MAX_INPUT_PIXELS = 40_000_000;

export class UnreadableImageError extends Error {}

/**
 * Normalises an upload so every device downloads a small file:
 * photos -> WebP (lossy, resized), QR -> PNG (lossless, resized).
 * Also applies EXIF rotation and strips metadata (e.g. GPS from phone photos).
 */
export async function optimiseImage(input: Buffer, kind: ImageKind): Promise<{ mime: string; data: Buffer }> {
  try {
    const img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    if (kind === 'qr') {
      const data = await img
        .resize({ width: QR_MAX, height: QR_MAX, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      return { mime: 'image/png', data };
    }
    const data = await img
      .resize({ width: PHOTO_MAX, height: PHOTO_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return { mime: 'image/webp', data };
  } catch {
    throw new UnreadableImageError("That file isn't a readable image");
  }
}
