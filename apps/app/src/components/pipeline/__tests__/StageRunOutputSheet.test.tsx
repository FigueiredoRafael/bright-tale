/**
 * <StageRunOutputSheet /> — renders the canonical viewer per Payload Ref kind.
 *
 * Pins the contract: the sheet fetches the right endpoint, hydrates the
 * appropriate viewer (DraftViewer / ResearchFindingsReport / ...), and falls
 * back gracefully when the fetch fails or the payload kind is unknown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { StageRunOutputSheet } from '../StageRunOutputSheet';

function makeRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-1',
    projectId: 'p-1',
    stage: 'production',
    status: 'completed',
    awaitingReason: null,
    payloadRef: { kind: 'content_draft', id: 'd-1' },
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-05-13T00:00:00Z',
    updatedAt: '2026-05-13T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe('<StageRunOutputSheet />', () => {
  it('renders the empty-payload message when no Payload Ref', () => {
    render(
      <StageRunOutputSheet
        open
        onOpenChange={() => {}}
        run={makeRun({ payloadRef: null })}
      />,
    );
    expect(screen.getByTestId('stage-output-sheet')).toBeInTheDocument();
    expect(screen.getByText(/did not produce a Payload Ref/i)).toBeInTheDocument();
  });

  it('content_draft: fetches /api/content-drafts/:id and renders the markdown body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'd-1',
          type: 'blog',
          title: 'Why deep-sea creatures glow',
          draft_json: { full_draft: '## Hook\n\nText body here.' },
        },
        error: null,
      }),
    });

    render(
      <StageRunOutputSheet
        open
        onOpenChange={() => {}}
        run={makeRun({ payloadRef: { kind: 'content_draft', id: 'd-1' } })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('stage-output-draft')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/content-drafts/d-1');
    expect(screen.getByText('Why deep-sea creatures glow')).toBeInTheDocument();
    // Markdown body renders inside an article — assert the heading made it through.
    expect(screen.getByText('Hook')).toBeInTheDocument();
  });

  it('content_draft: falls back across nested body shapes (blog.full_draft)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'd-1',
          type: 'blog',
          title: null,
          draft_json: { blog: { full_draft: 'Top-level absent. Nested present.' } },
        },
        error: null,
      }),
    });

    render(
      <StageRunOutputSheet
        open
        onOpenChange={() => {}}
        run={makeRun({ payloadRef: { kind: 'content_draft', id: 'd-1' } })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nested present/)).toBeInTheDocument();
    });
  });

  it('research_session: fetches /api/research-sessions/:id and renders the findings report', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'rs-1',
          cards_json: {
            sources: [{ title: 'Nature article', url: 'https://nature.com/x' }],
            statistics: [],
            expert_quotes: [],
            counterarguments: [],
          },
          approved_cards_json: null,
        },
        error: null,
      }),
    });

    render(
      <StageRunOutputSheet
        open
        onOpenChange={() => {}}
        run={makeRun({
          stage: 'research',
          payloadRef: { kind: 'research_session', id: 'rs-1' },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('stage-output-research')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/research-sessions/rs-1');
  });

  it('shows the error state when the fetch fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ data: null, error: { code: 'NOT_FOUND', message: '...' } }),
    });

    render(
      <StageRunOutputSheet
        open
        onOpenChange={() => {}}
        run={makeRun({ payloadRef: { kind: 'content_draft', id: 'd-1' } })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('stage-output-error')).toBeInTheDocument();
    });
  });

  it('unknown payload kind: renders the raw fallback so the seam never crashes', () => {
    render(
      <StageRunOutputSheet
        open
        onOpenChange={() => {}}
        run={makeRun({
          payloadRef: { kind: 'mystery_kind', id: 'm-1' } as unknown as StageRun['payloadRef'],
        })}
      />,
    );
    expect(screen.getByTestId('stage-output-raw')).toBeInTheDocument();
    expect(screen.getByText(/mystery_kind#m-1/)).toBeInTheDocument();
  });
});
