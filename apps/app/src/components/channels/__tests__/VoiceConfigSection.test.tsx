import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { VoiceConfigSection } from '../VoiceConfigSection';

const mockVoices = [
  { id: 'alloy', label: 'Alloy', gender: 'neutral' },
  { id: 'nova', label: 'Nova', gender: 'female' },
  { id: 'echo', label: 'Echo', gender: 'male' },
];

function mockFetchSuccess(provider = 'openai') {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/voice/voices')) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            data: { voices: mockVoices, configured: true, provider },
            error: null,
          }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/voice/synthesize')) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            data: {
              audioBase64: 'dGVzdA==',
              mimeType: 'audio/mpeg',
              estimatedSeconds: 3,
              provider,
              voiceId: 'alloy',
            },
            error: null,
          }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

function mockFetchUnconfigured() {
  return vi.fn().mockResolvedValue({
    json: () =>
      Promise.resolve({
        data: { voices: [], configured: false },
        error: null,
      }),
  });
}

describe('VoiceConfigSection', () => {
  const defaultProps = {
    value: { voiceProvider: 'openai' as string | null, voiceId: null as string | null, voiceSpeed: 1.0 },
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    defaultProps.onChange = vi.fn();
  });

  it('renders provider selector and voice label', async () => {
    global.fetch = mockFetchSuccess();
    render(<VoiceConfigSection {...defaultProps} />);

    expect(screen.getByText('Configuração de Voz')).toBeInTheDocument();
    expect(screen.getByText('Provedor')).toBeInTheDocument();
    expect(screen.getByText('Voz')).toBeInTheDocument();
    expect(screen.getByText('Velocidade')).toBeInTheDocument();
  });

  it('fetches voices on mount for the selected provider', async () => {
    global.fetch = mockFetchSuccess();
    render(<VoiceConfigSection {...defaultProps} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/voice/voices?provider=openai');
    });
  });

  it('shows loading state while fetching voices', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<VoiceConfigSection {...defaultProps} />);

    expect(screen.getByText('Carregando vozes...')).toBeInTheDocument();
  });

  it('shows warning when provider is not configured', async () => {
    global.fetch = mockFetchUnconfigured();
    render(<VoiceConfigSection {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Provedor não configurado/),
      ).toBeInTheDocument();
    });
  });

  it('displays speed value', () => {
    global.fetch = mockFetchSuccess();
    render(
      <VoiceConfigSection
        value={{ voiceProvider: 'openai', voiceId: 'alloy', voiceSpeed: 1.5 }}
        onChange={defaultProps.onChange}
      />,
    );

    expect(screen.getByText('1.5x')).toBeInTheDocument();
  });

  it('preview button is disabled when no voice is selected', async () => {
    global.fetch = mockFetchSuccess();
    render(<VoiceConfigSection {...defaultProps} />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Preview/ });
      expect(btn).toBeDisabled();
    });
  });

  it('preview button is enabled when a voice is selected', async () => {
    global.fetch = mockFetchSuccess();
    render(
      <VoiceConfigSection
        value={{ voiceProvider: 'openai', voiceId: 'alloy', voiceSpeed: 1.0 }}
        onChange={defaultProps.onChange}
      />,
    );

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Preview/ });
      expect(btn).not.toBeDisabled();
    });
  });

  it('shows credit cost badge for each provider', async () => {
    global.fetch = mockFetchSuccess();
    render(<VoiceConfigSection {...defaultProps} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(screen.getByText(/50 créditos\/5min/)).toBeInTheDocument();
  });
});
