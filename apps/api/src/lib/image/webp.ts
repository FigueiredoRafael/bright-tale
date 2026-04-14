import sharp from 'sharp';

/**
 * Convert an image buffer to WebP format.
 * Returns null if conversion fails (caller should fall back to original).
 */
export async function convertToWebP(
  buffer: Buffer,
  quality = 80,
): Promise<Buffer | null> {
  try {
    return await sharp(buffer).webp({ quality }).toBuffer();
  } catch (err) {
    console.error('[WebP] Conversion failed, falling back to original:', err);
    return null;
  }
}
