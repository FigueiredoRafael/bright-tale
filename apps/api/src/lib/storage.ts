/**
 * Supabase Storage helpers (F1-007)
 *
 * Path convention: {bucket}/{org_id}/{project_id}/{filename}
 * or:              {bucket}/{org_id}/{filename}
 */

import { createServiceClient } from './supabase/index.js';

type Bucket = 'images' | 'audio' | 'video' | 'thumbnails' | 'exports';

interface UploadOptions {
  bucket: Bucket;
  orgId: string;
  path: string;       // e.g. "project-123/image.png"
  file: Buffer;
  contentType: string;
  upsert?: boolean;
}

interface StorageUrl {
  path: string;
  publicUrl: string | null;
  signedUrl: string | null;
}

/**
 * Upload a file to Supabase Storage.
 */
export async function uploadFile(options: UploadOptions): Promise<StorageUrl> {
  const sb = createServiceClient();
  const fullPath = `${options.orgId}/${options.path}`;

  const { error } = await sb.storage
    .from(options.bucket)
    .upload(fullPath, options.file, {
      contentType: options.contentType,
      upsert: options.upsert ?? false,
    });

  if (error) throw error;

  // Get public URL for thumbnails, signed URL for others
  if (options.bucket === 'thumbnails') {
    const { data } = sb.storage.from(options.bucket).getPublicUrl(fullPath);
    return { path: fullPath, publicUrl: data.publicUrl, signedUrl: null };
  }

  const { data: signed, error: signError } = await sb.storage
    .from(options.bucket)
    .createSignedUrl(fullPath, 3600); // 1 hour

  if (signError) throw signError;

  return { path: fullPath, publicUrl: null, signedUrl: signed.signedUrl };
}

/**
 * Get a signed download URL for a private file.
 */
export async function getSignedUrl(bucket: Bucket, path: string, expiresIn = 3600): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(bucket: Bucket, path: string): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.storage.from(bucket).remove([path]);
  if (error) throw error;
}

/**
 * List files in an org's folder.
 */
export async function listFiles(bucket: Bucket, orgId: string, folder?: string) {
  const sb = createServiceClient();
  const path = folder ? `${orgId}/${folder}` : orgId;

  const { data, error } = await sb.storage.from(bucket).list(path);
  if (error) throw error;
  return data;
}
