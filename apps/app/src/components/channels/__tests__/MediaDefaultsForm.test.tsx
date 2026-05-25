import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MediaDefaultsForm } from '../MediaDefaultsForm'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockChannelFetch(defaultMediaConfigJson: unknown = null) {
  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/channels/ch-1') && (!options || options.method === undefined || options.method === 'GET')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            id: 'ch-1',
            name: 'Test Channel',
            niche: null,
            defaultMediaConfigJson: defaultMediaConfigJson,
          },
          error: null,
        }),
      } as unknown as Response
    }
    // PUT (save)
    if (urlStr.includes('/api/channels/ch-1') && options?.method === 'PUT') {
      return {
        ok: true,
        json: async () => ({ data: { id: 'ch-1' }, error: null }),
      } as unknown as Response
    }
    return {
      ok: true,
      json: async () => ({ data: null, error: null }),
    } as unknown as Response
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockChannelFetch())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaDefaultsForm', () => {
  it('renders four accordion sections — Blog, Video, Shorts, Podcast', async () => {
    render(<MediaDefaultsForm channelId="ch-1" />)

    await waitFor(() => {
      expect(screen.getByText('Blog')).toBeTruthy()
      expect(screen.getByText('Video')).toBeTruthy()
      expect(screen.getByText('Shorts')).toBeTruthy()
      expect(screen.getByText('Podcast')).toBeTruthy()
    })
  })

  it('populates fields from existing default_media_config_json', async () => {
    const existingConfig = {
      blog: { wordCount: 1800, maxReviewIterations: 3 },
      video: { durationSeconds: 600 },
      shorts: { assetImageCount: 5 },
      podcast: { provider: 'openai', model: 'gpt-4o' },
    }
    vi.stubGlobal('fetch', mockChannelFetch(existingConfig))

    render(<MediaDefaultsForm channelId="ch-1" />)

    // Open Blog accordion and verify wordCount is populated
    const blogTrigger = await screen.findByRole('button', { name: /blog/i })
    await userEvent.click(blogTrigger)

    await waitFor(() => {
      const wordCountInput = screen.getByLabelText(/word count/i) as HTMLInputElement
      expect(wordCountInput.value).toBe('1800')
    })
  })

  it('submits PUT /api/channels/:id with merged defaultMediaConfig on save', async () => {
    const mockFetch = mockChannelFetch()
    vi.stubGlobal('fetch', mockFetch)

    render(<MediaDefaultsForm channelId="ch-1" />)

    // Open Blog accordion
    const blogTrigger = await screen.findByRole('button', { name: /blog/i })
    await userEvent.click(blogTrigger)

    // Fill in wordCount
    const wordCountInput = await screen.findByLabelText(/word count/i)
    await userEvent.clear(wordCountInput)
    await userEvent.type(wordCountInput, '2000')

    // Submit
    const saveButton = screen.getByRole('button', { name: /save/i })
    await userEvent.click(saveButton)

    await waitFor(() => {
      const putCalls = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>).filter(
        ([url, opts]) =>
          String(url).includes('/api/channels/ch-1') && opts?.method === 'PUT',
      )
      expect(putCalls.length).toBeGreaterThan(0)
      const [, opts] = putCalls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.defaultMediaConfig?.blog?.wordCount).toBe(2000)
    })
  })
})
