/**
 * Image Storage Utilities
 *
 * Handles saving, retrieving, and deleting AI-generated images
 * stored locally under public/generated-images/.
 *
 * Files are served by Next.js static file serving at /generated-images/...
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// Root for generated images relative to the Next.js project root
const GENERATED_IMAGES_DIR = path.join(process.cwd(), "public", "generated-images");

function mimeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/**
 * Saves a base64-encoded image to disk.
 * Organises under a projectId sub-folder when provided.
 *
 * Returns:
 *   localPath — relative path from project root: "public/generated-images/{sub}/{file}"
 *   publicUrl — Next.js public URL: "/generated-images/{sub}/{file}"
 */
export async function saveImageLocally(
  base64: string,
  mimeType: string,
  projectId?: string,
): Promise<{ localPath: string; publicUrl: string }> {
  const subDir = projectId ?? "standalone";
  const dirPath = path.join(GENERATED_IMAGES_DIR, subDir);
  await fs.mkdir(dirPath, { recursive: true });

  const ext = mimeToExt(mimeType);
  const filename = `${randomUUID()}.${ext}`;
  const fullPath = path.join(dirPath, filename);

  const buffer = Buffer.from(base64, "base64");
  await fs.writeFile(fullPath, buffer);

  const localPath = path.join("public", "generated-images", subDir, filename);
  const publicUrl = `/generated-images/${subDir}/${filename}`;

  return { localPath, publicUrl };
}

/**
 * Deletes an image file from disk.
 * No-op if the file does not exist.
 */
export async function deleteImageFile(localPath: string): Promise<void> {
  try {
    const absolutePath = path.resolve(process.cwd(), localPath);
    await fs.unlink(absolutePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    // File not found — silently ignore
  }
}

/**
 * Returns the absolute filesystem path for a stored image.
 */
export function getAbsolutePath(localPath: string): string {
  return path.resolve(process.cwd(), localPath);
}

/**
 * Converts a local filesystem path to a Next.js public URL.
 * e.g. "public/generated-images/abc/img.jpg" → "/generated-images/abc/img.jpg"
 */
export function getPublicUrl(localPath: string): string {
  // Normalise separators and strip leading "public/"
  const normalised = localPath.replace(/\\/g, "/").replace(/^public\//, "");
  return `/${normalised}`;
}
