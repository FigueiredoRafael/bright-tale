/**
 * Content draft save utility
 * Centralizes POST (create) / PUT (update) logic for all content formats.
 * Returns a typed result instead of throwing, so callers can show toast feedback.
 */

export type ContentFormat = "blog" | "video" | "shorts" | "podcast";

export interface SaveOptions {
  format: ContentFormat;
  data: Record<string, unknown>;
  /** If provided, issues a PUT to update the existing record; otherwise issues POST */
  savedId?: string;
}

export interface SaveResult {
  success: boolean;
  /** The record id — existing savedId on PUT, new id from response on POST */
  id?: string;
  error?: string;
}

const FORMAT_TO_PATH: Record<ContentFormat, string> = {
  blog: "/api/blogs",
  video: "/api/videos",
  shorts: "/api/shorts",
  podcast: "/api/podcasts",
};

/** Extracts the record id from the API response body */
function extractId(
  format: ContentFormat,
  body: { data?: Record<string, { id?: string }> },
): string | undefined {
  return body?.data?.[format]?.id ?? body?.data?.shorts?.id;
}

export async function saveContentDraft(options: SaveOptions): Promise<SaveResult> {
  const { format, data, savedId } = options;
  const basePath = FORMAT_TO_PATH[format];
  const url = savedId ? `${basePath}/${savedId}` : basePath;
  const method = savedId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
      return { success: false, error: message };
    }

    const body = await res.json();

    if (savedId) {
      return { success: true, id: savedId };
    }

    const newId = extractId(format, body as { data?: Record<string, { id?: string }> });
    return { success: true, id: newId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
