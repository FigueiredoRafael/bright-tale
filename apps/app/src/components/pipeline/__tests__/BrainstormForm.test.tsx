/**
 * Slice 5 (#13) — BrainstormForm.
 *
 * Leaf input. Submits { stage: 'brainstorm', input } to the generic
 * /api/projects/:id/stage-runs endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { BrainstormForm } from '../BrainstormForm';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const PROJECT_ID = 'proj-1';

/**
 * BrainstormForm calls GET /api/projects/:id on mount to hydrate from
 * `autopilot_config_json.brainstorm`. Tests that only care about the submit
 * path use this helper to route the hydration call to a manual project shape
 * that disables autorun, then return the submit response on subsequent calls.
 */
function routeFetch(submitResponses: Array<Record<string, unknown>>): void {
  let submitIdx = 0;
  fetchMock.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.endsWith(`/api/projects/${PROJECT_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          data: { id: PROJECT_ID, mode: 'manual', autopilot_config_json: null },
          error: null,
        }),
      };
    }
    const resp = submitResponses[submitIdx] ?? submitResponses[submitResponses.length - 1] ?? {
      ok: true,
      json: async () => ({ data: { stageRun: { id: 'sr-new' } }, error: null }),
    };
    submitIdx += 1;
    return resp;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  routeFetch([
    {
      ok: true,
      json: async () => ({ data: { stageRun: { id: 'sr-new' } }, error: null }),
    },
  ]);
});

describe('<BrainstormForm />', () => {
  it('renders the form in topic_driven mode by default with a topic input', () => {
    render(<BrainstormForm projectId={PROJECT_ID} />);
    expect(screen.getByTestId('bs-topic')).toBeInTheDocument();
    expect(screen.queryByTestId('bs-reference-url')).not.toBeInTheDocument();
  });

  it('switches to reference_guided mode and shows the URL input', () => {
    render(<BrainstormForm projectId={PROJECT_ID} />);
    fireEvent.change(screen.getByTestId('bs-mode'), { target: { value: 'reference_guided' } });
    expect(screen.getByTestId('bs-reference-url')).toBeInTheDocument();
    expect(screen.queryByTestId('bs-topic')).not.toBeInTheDocument();
  });

  it('POSTs to /api/projects/:id/stage-runs with the parsed input on submit', async () => {
    const onSubmitted = vi.fn();
    render(<BrainstormForm projectId={PROJECT_ID} onSubmitted={onSubmitted} />);

    // Wait for hydration fetch to settle so the submit picks up clean state.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('bs-topic'), { target: { value: 'AI pricing' } });
    fireEvent.click(screen.getByTestId('bs-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const submitCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].endsWith('/stage-runs'),
    );
    expect(submitCall).toBeDefined();
    const [url, init] = submitCall!;
    expect(url).toBe(`/api/projects/${PROJECT_ID}/stage-runs`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.stage).toBe('brainstorm');
    expect(body.input.mode).toBe('topic_driven');
    expect(body.input.topic).toBe('AI pricing');
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('sr-new'));
  });

  it('surfaces server error messages without firing onSubmitted', async () => {
    routeFetch([
      {
        ok: false,
        json: async () => ({ data: null, error: { message: 'Concurrent run', code: 'CONCURRENT_STAGE_RUN' } }),
      },
    ]);
    const onSubmitted = vi.fn();
    render(<BrainstormForm projectId={PROJECT_ID} onSubmitted={onSubmitted} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('bs-topic'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('bs-submit'));

    await waitFor(() => expect(screen.getByTestId('bs-error')).toHaveTextContent('Concurrent run'));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('does NOT POST when both topic and referenceUrl are empty (input has no payload to send)', async () => {
    routeFetch([
      {
        ok: false,
        json: async () => ({ data: null, error: { message: 'topic required', code: 'STAGE_INPUT_VALIDATION' } }),
      },
    ]);
    render(<BrainstormForm projectId={PROJECT_ID} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('bs-submit'));

    await waitFor(() => expect(screen.getByTestId('bs-error')).toHaveTextContent('topic required'));
  });

  it('hydrates inputs from projects.autopilot_config_json.brainstorm on mount', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.endsWith(`/api/projects/${PROJECT_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: PROJECT_ID,
              mode: 'manual',
              autopilot_config_json: {
                brainstorm: {
                  mode: 'topic_driven',
                  topic: 'A/B testing for blogs',
                  niche: 'Early Stage Entrepreneurship',
                  tone: 'practical',
                  audience: 'B2B founders',
                },
              },
            },
            error: null,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ data: { stageRun: { id: 'sr-new' } }, error: null }),
      };
    });
    render(<BrainstormForm projectId={PROJECT_ID} />);

    await waitFor(() => expect((screen.getByTestId('bs-topic') as HTMLInputElement).value).toBe('A/B testing for blogs'));
    expect((screen.getByTestId('bs-niche') as HTMLInputElement).value).toBe('Early Stage Entrepreneurship');
    expect((screen.getByTestId('bs-tone') as HTMLInputElement).value).toBe('practical');
    expect((screen.getByTestId('bs-audience') as HTMLInputElement).value).toBe('B2B founders');
  });

  it('autopilot mode auto-submits the hydrated config without a click', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.endsWith(`/api/projects/${PROJECT_ID}`)) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: PROJECT_ID,
              mode: 'autopilot',
              autopilot_config_json: {
                brainstorm: { mode: 'topic_driven', topic: 'Cohort retention 101' },
              },
            },
            error: null,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ data: { stageRun: { id: 'sr-auto' } }, error: null }),
      };
    });
    const onSubmitted = vi.fn();
    render(<BrainstormForm projectId={PROJECT_ID} onSubmitted={onSubmitted} />);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('sr-auto'));
    const submitCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].endsWith('/stage-runs'),
    );
    expect(submitCall).toBeDefined();
    const body = JSON.parse((submitCall![1] as RequestInit).body as string);
    expect(body.input.topic).toBe('Cohort retention 101');
  });
});
