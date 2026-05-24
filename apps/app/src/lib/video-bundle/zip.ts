/**
 * buildZipBlob — pure ZIP exporter for VideoAssetBundle (issue #218 S5).
 *
 * Accepts a manifest and an optional fetchImpl (defaults to global fetch).
 * Injecting fetchImpl keeps this module pure: tests can mock the network
 * without touching global state, and jsdom never needs URL.createObjectURL.
 *
 * Library: fflate (already installed as transitive dep from archiver).
 * Chosen over jszip because:
 *   1. fflate is already present in node_modules — no new npm dependency.
 *   2. fflate is pure ESM, ~57kB gzipped, faster than jszip.
 *   3. zipSync API is synchronous-friendly (no Promise-based API mismatch
 *      in testing environments).
 *
 * Two exported functions:
 *   buildZipBytes — returns the raw Uint8Array; primary test target.
 *   buildZipBlob  — wraps bytes in a Blob; used at call sites.
 * Splitting them avoids jsdom Blob limitations in tests (jsdom Blob may lack
 * arrayBuffer()). Tests directly assert on the Uint8Array via fflate.unzipSync.
 */

import { zipSync } from 'fflate'
import type { VideoAssetBundle } from '@brighttale/shared/schemas/videoAssetBundle'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the raw ZIP bytes for a VideoAssetBundle manifest.
 *
 * @param manifest  The VideoAssetBundle produced by buildVideoAssetBundle().
 * @param fetchImpl Optional fetch override (injected in tests). Falls back to
 *                  global fetch when not provided.
 * @returns         A Uint8Array containing valid ZIP bytes.
 */
export async function buildZipBytes(
  manifest: VideoAssetBundle,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const promptFallbacks: string[] = []

  // ── Text entries ─────────────────────────────────────────────────────────
  for (const text of manifest.texts) {
    files[text.filename] = encodeText(text.body)
  }

  // ── Image entries ────────────────────────────────────────────────────────
  for (const image of manifest.images) {
    if (image.url) {
      const bytes = await fetchImageBytes(image.url, fetchImpl)
      if (bytes !== null) {
        files[image.filename] = bytes
        continue
      }
      // fetch failed — fall back to prompt entry
    }
    // No URL, or fetch failed: record for image-prompts.txt
    promptFallbacks.push(`${image.filename}\n${image.prompt}`)
  }

  // ── Prompt summary ───────────────────────────────────────────────────────
  if (promptFallbacks.length > 0) {
    files['image-prompts.txt'] = encodeText(promptFallbacks.join('\n\n'))
  }

  return zipSync(files)
}

/**
 * Build a ZIP Blob from a VideoAssetBundle manifest.
 * Thin wrapper around buildZipBytes — use buildZipBytes in tests.
 *
 * @param manifest  The VideoAssetBundle produced by buildVideoAssetBundle().
 * @param fetchImpl Optional fetch override (injected in tests).
 * @returns         A Blob with MIME type 'application/zip'.
 */
export async function buildZipBlob(
  manifest: VideoAssetBundle,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Blob> {
  const bytes = await buildZipBytes(manifest, fetchImpl)
  // Copy into a fresh ArrayBuffer to satisfy Blob's strict type requirement.
  // (fflate's zipSync returns Uint8Array<ArrayBufferLike> which may be a
  // SharedArrayBuffer in some environments; Blob only accepts ArrayBuffer.)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type: 'application/zip' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Encode a UTF-8 string to a plain Uint8Array.
 *
 * Uses Buffer on Node.js (always available, same Uint8Array class as fflate).
 * Falls back to TextEncoder in browser contexts.
 *
 * We avoid top-level TextEncoder.encode() because in vitest's jsdom environment
 * the TextEncoder result may come from a different realm (jsdom's Uint8Array),
 * causing fflate's `instanceof Uint8Array` guard to silently skip the entry.
 */
function encodeText(text: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(text, 'utf8')
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  return new TextEncoder().encode(text)
}

async function fetchImageBytes(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Uint8Array | null> {
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}
