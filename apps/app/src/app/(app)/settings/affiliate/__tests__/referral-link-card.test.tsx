import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferralLinkCard } from '../components/referral-link-card';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

describe('ReferralLinkCard', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://app.brighttale.io' },
      writable: true,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    (window as any).posthog = { capture: vi.fn() };
  });

  it('copy signup link writes the expected URL', async () => {
    render(<ReferralLinkCard code="ABC" tier="nano" />);
    const btn = screen.getByRole('button', { name: /Copiar link de cadastro/ });
    fireEvent.click(btn);
    await new Promise(r => setTimeout(r, 0));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://brighttale.io/signup?ref=ABC');
  });

  it('copy homepage link writes root URL', async () => {
    render(<ReferralLinkCard code="ABC" tier="nano" />);
    fireEvent.click(screen.getByRole('button', { name: /Copiar link da página inicial/ }));
    await new Promise(r => setTimeout(r, 0));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://brighttale.io/?ref=ABC');
  });

  it('PostHog capture fires with variant=signup and tier/code props', async () => {
    render(<ReferralLinkCard code="XYZ" tier="micro" />);
    fireEvent.click(screen.getByRole('button', { name: /Copiar link de cadastro/ }));
    await new Promise(r => setTimeout(r, 0));
    expect((window as any).posthog.capture).toHaveBeenCalledWith('affiliate_link_copied', {
      variant: 'signup',
      tier: 'micro',
      code: 'XYZ',
    });
  });
});
