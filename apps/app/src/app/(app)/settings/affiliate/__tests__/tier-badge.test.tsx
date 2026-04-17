import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from '../components/tier-badge';

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const iso = (d: Date) => d.toISOString();

describe('TierBadge', () => {
  it('renders all 5 tier labels correctly', () => {
    const tiers = ['nano', 'micro', 'mid', 'macro', 'mega'] as const;
    for (const t of tiers) {
      const { container, unmount } = render(
        <TierBadge tier={t} commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 90))} />,
      );
      expect(container.textContent?.toLowerCase()).toContain(t);
      unmount();
    }
  });

  it('renders commissionRate as percent (e.g. 0.15 → 15%)', () => {
    render(<TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 90))} />);
    expect(screen.getByText(/15%/)).toBeInTheDocument();
  });

  it('expiry <30d adds yellow class; <7d adds red class', () => {
    const { container: yellow, unmount: u1 } = render(
      <TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 20))} />,
    );
    expect(yellow.innerHTML).toMatch(/yellow/);
    u1();

    const { container: red } = render(
      <TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 5))} />,
    );
    expect(red.innerHTML).toMatch(/red/);
  });

  it('expiry >30d renders neutral (no yellow/red class)', () => {
    const { container } = render(
      <TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 120))} />,
    );
    expect(container.innerHTML).not.toMatch(/yellow|red/);
  });
});
