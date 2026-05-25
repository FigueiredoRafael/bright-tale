/**
 * ZIP exporter — issue #218 (S5)
 *
 * TDD: red→green per acceptance criterion.
 *
 * All tests use fflate + jsdom (no real network, no real file system).
 *
 * We test buildZipBytes (returns raw Uint8Array) for content assertions because
 * jsdom's Blob may lack arrayBuffer(). buildZipBlob is tested only for Blob
 * shape (type/size) since jsdom can construct a Blob but may not read it back.
 */
import { describe, it, expect, vi } from 'vitest'
import { buildZipBytes, buildZipBlob } from '../zip'
import type { VideoAssetBundle } from '@brighttale/shared/schemas/videoAssetBundle'

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal manifest with one URL image + one prompt-only image + basic texts. */
const MIXED_MANIFEST: VideoAssetBundle = {
  meta: {
    draftId: 'draft-abc',
    title: 'Test Video',
    channelName: 'Test Channel',
  },
  images: [
    {
      kind: 'thumbnail',
      prompt: 'Bold hero shot',
      filename: 'thumbnail-01.png',
      url: 'https://example.com/thumb.png',
    },
    {
      kind: 'broll',
      chapterIndex: 1,
      prompt: 'Factory footage',
      filename: 'broll-ch01-01.png',
      // no url — prompt-only
    },
  ],
  texts: [
    { kind: 'title', body: 'Test Video Title', filename: 'title.txt' },
    { kind: 'description', body: 'A great description.', filename: 'description.txt' },
  ],
}

/** Manifest where ALL images are prompt-only (no url). */
const PROMPTS_ONLY_MANIFEST: VideoAssetBundle = {
  meta: {
    draftId: 'draft-xyz',
    title: 'Prompts Only',
    channelName: 'Channel X',
  },
  images: [
    {
      kind: 'thumbnail',
      prompt: 'Bright sunrise',
      filename: 'thumbnail-01.png',
    },
    {
      kind: 'hook',
      prompt: 'Dynamic opener',
      filename: 'hook-01.png',
    },
  ],
  texts: [
    { kind: 'title', body: 'Prompts Only Video', filename: 'title.txt' },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal fetchImpl stub that returns a PNG-like ArrayBuffer for any URL. */
function makeFetchStub(overrides?: { [url: string]: 'fail' | Uint8Array }): typeof fetch {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG header

  return vi.fn(async (input: URL | RequestInfo): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const override = overrides?.[url]
    if (override === 'fail') {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response
    }
    if (override instanceof Uint8Array) {
      return { ok: true, status: 200, arrayBuffer: async () => override.buffer } as unknown as Response
    }
    return { ok: true, status: 200, arrayBuffer: async () => PNG_BYTES.buffer.slice(0) } as unknown as Response
  }) as typeof fetch
}

const textDecoder = new TextDecoder()

// Shorthand to extract files from ZIP bytes
async function unzip(bytes: Uint8Array) {
  const { unzipSync } = await import('fflate')
  return unzipSync(bytes)
}

async function fileText(bytes: Uint8Array, filename: string): Promise<string> {
  const { unzipSync } = await import('fflate')
  const files = unzipSync(bytes)
  if (!(filename in files)) return ''
  return textDecoder.decode(files[filename])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildZipBlob — Blob shape (issue #218)', () => {
  it('returns a Blob', async () => {
    const blob = await buildZipBlob(MIXED_MANIFEST, makeFetchStub())
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returned Blob has zip MIME type', async () => {
    const blob = await buildZipBlob(MIXED_MANIFEST, makeFetchStub())
    expect(blob.type).toBe('application/zip')
  })

  it('returned Blob is non-empty', async () => {
    const blob = await buildZipBlob(MIXED_MANIFEST, makeFetchStub())
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe('buildZipBytes — ZIP contents (issue #218)', () => {
  // ── AC1: text files from manifest.texts ───────────────────────────────────
  it('produces a text file for each manifest text entry', async () => {
    const bytes = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const files = await unzip(bytes)
    expect('title.txt' in files).toBe(true)
    expect('description.txt' in files).toBe(true)
  })

  it('text file content matches manifest text body', async () => {
    const bytes = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const title = await fileText(bytes, 'title.txt')
    expect(title).toBe('Test Video Title')
  })

  it('description text file content matches body', async () => {
    const bytes = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const desc = await fileText(bytes, 'description.txt')
    expect(desc).toBe('A great description.')
  })

  // ── AC2: URL-present images are fetched and added ─────────────────────────
  it('fetches image from URL and adds it to ZIP under the manifest filename', async () => {
    const fetchStub = makeFetchStub()
    const bytes = await buildZipBytes(MIXED_MANIFEST, fetchStub)
    const files = await unzip(bytes)
    // thumbnail-01.png had a URL → should be in ZIP as image data
    expect('thumbnail-01.png' in files).toBe(true)
    // fetch should have been called with the thumbnail URL
    expect(fetchStub).toHaveBeenCalledWith('https://example.com/thumb.png')
  })

  it('fetched image bytes are stored correctly in ZIP', async () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const fetchStub = makeFetchStub({ 'https://example.com/thumb.png': PNG })
    const bytes = await buildZipBytes(MIXED_MANIFEST, fetchStub)
    const files = await unzip(bytes)
    expect(files['thumbnail-01.png'][0]).toBe(0x89) // PNG magic byte
  })

  // ── AC3: prompt-only images go into image-prompts.txt ─────────────────────
  it('prompt-only images (no url) are written into image-prompts.txt summary', async () => {
    const bytes = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const files = await unzip(bytes)
    expect('image-prompts.txt' in files).toBe(true)
    const prompts = await fileText(bytes, 'image-prompts.txt')
    // The prompt-only broll entry's prompt should appear
    expect(prompts).toContain('Factory footage')
    // The broll filename should appear as a label
    expect(prompts).toContain('broll-ch01-01.png')
  })

  it('prompt-only images do NOT appear as individual files in ZIP', async () => {
    const bytes = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const files = await unzip(bytes)
    // broll-ch01-01.png had no URL → must NOT appear as a raw file
    expect('broll-ch01-01.png' in files).toBe(false)
  })

  // ── AC4: fetch failure → falls back to image-prompts.txt ─────────────────
  it('when image fetch fails, thumbnail is excluded from ZIP as image file', async () => {
    const fetchStub = makeFetchStub({ 'https://example.com/thumb.png': 'fail' })
    const bytes = await buildZipBytes(MIXED_MANIFEST, fetchStub)
    const files = await unzip(bytes)
    expect('thumbnail-01.png' in files).toBe(false)
  })

  it('when image fetch fails, prompt appears in image-prompts.txt', async () => {
    const fetchStub = makeFetchStub({ 'https://example.com/thumb.png': 'fail' })
    const bytes = await buildZipBytes(MIXED_MANIFEST, fetchStub)
    const prompts = await fileText(bytes, 'image-prompts.txt')
    expect(prompts).toContain('Bold hero shot')
    expect(prompts).toContain('thumbnail-01.png')
  })

  // ── AC5: all-prompts-only manifest ────────────────────────────────────────
  it('all-prompts-only manifest: image-prompts.txt contains all prompts', async () => {
    const fetchStub = makeFetchStub()
    const bytes = await buildZipBytes(PROMPTS_ONLY_MANIFEST, fetchStub)
    const prompts = await fileText(bytes, 'image-prompts.txt')
    expect(prompts).toContain('Bright sunrise')
    expect(prompts).toContain('Dynamic opener')
  })

  it('all-prompts-only manifest: no raw image files in ZIP', async () => {
    const fetchStub = makeFetchStub()
    const bytes = await buildZipBytes(PROMPTS_ONLY_MANIFEST, fetchStub)
    const files = await unzip(bytes)
    expect('thumbnail-01.png' in files).toBe(false)
    expect('hook-01.png' in files).toBe(false)
  })

  it('all-prompts-only manifest: fetch is never called (no URLs)', async () => {
    const fetchStub = makeFetchStub()
    await buildZipBytes(PROMPTS_ONLY_MANIFEST, fetchStub)
    expect(fetchStub).not.toHaveBeenCalled()
  })

  // ── AC6: deterministic filenames ─────────────────────────────────────────
  it('ZIP filenames are deterministic — same manifest produces same filenames', async () => {
    const bytes1 = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const bytes2 = await buildZipBytes(MIXED_MANIFEST, makeFetchStub())
    const files1 = Object.keys(await unzip(bytes1)).sort()
    const files2 = Object.keys(await unzip(bytes2)).sort()
    expect(files1).toEqual(files2)
  })
})
