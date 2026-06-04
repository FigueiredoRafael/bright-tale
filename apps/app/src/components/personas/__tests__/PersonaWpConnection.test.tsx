/**
 * BRI-150 — PersonaWpConnection component tests
 *
 * The component fetches /api/channels on mount and gates the WordPress-linking
 * surface on whether any channel has WordPress configured:
 * 1. No channels at all → prompt to create a channel
 * 2. Channels exist but none WP-configured → prompt to configure WordPress
 * 3. A WP-configured channel exists → channel selector + link/create controls
 * 4. Persona already linked → shows the linked author id
 */

import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PersonaWpConnection } from '../PersonaWpConnection';

const PERSONA_ID = 'persona-abc';

function mockChannels(items: Array<{ id: string; name: string; has_wordpress: boolean }>) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ data: { items }, error: null }),
  }) as unknown as typeof fetch;
}

describe('PersonaWpConnection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches channels on mount', async () => {
    mockChannels([]);
    render(<PersonaWpConnection personaId={PERSONA_ID} currentWpAuthorId={null} />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/channels');
    });
  });

  it('prompts to create a channel when the user has none', async () => {
    mockChannels([]);
    render(<PersonaWpConnection personaId={PERSONA_ID} currentWpAuthorId={null} />);
    await waitFor(() => {
      expect(screen.getByText(/Create a content channel first/i)).toBeInTheDocument();
    });
  });

  it('prompts to configure WordPress when no channel has it', async () => {
    mockChannels([{ id: 'ch1', name: 'My Channel', has_wordpress: false }]);
    render(<PersonaWpConnection personaId={PERSONA_ID} currentWpAuthorId={null} />);
    await waitFor(() => {
      expect(screen.getByText(/None of your channels have WordPress configured/i)).toBeInTheDocument();
    });
  });

  it('renders the channel selector and link/create controls for a WP-configured channel', async () => {
    mockChannels([{ id: 'ch1', name: 'Blog Channel', has_wordpress: true }]);
    render(<PersonaWpConnection personaId={PERSONA_ID} currentWpAuthorId={null} />);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Link existing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create new/i })).toBeInTheDocument();
  });

  it('shows the linked author id when the persona is already linked', async () => {
    mockChannels([{ id: 'ch1', name: 'Blog Channel', has_wordpress: true }]);
    render(<PersonaWpConnection personaId={PERSONA_ID} currentWpAuthorId={42} />);
    await waitFor(() => {
      expect(screen.getByText(/WordPress author linked \(ID: 42\)/i)).toBeInTheDocument();
    });
  });
});
