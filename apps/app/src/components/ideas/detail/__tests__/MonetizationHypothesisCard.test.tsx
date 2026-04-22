import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonetizationHypothesisCard } from '../MonetizationHypothesisCard';

describe('MonetizationHypothesisCard', () => {
  it('renders from the new monetization_hypothesis shape', () => {
    render(
      <MonetizationHypothesisCard
        hypothesis={{ affiliate_angle: 'SaaS tools', product_categories: ['CRM', 'Email'], sponsor_category: 'B2B' }}
        legacy={undefined}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('SaaS tools')).toBeDefined();
    expect(screen.getByText('CRM, Email')).toBeDefined();
    expect(screen.getByText('B2B')).toBeDefined();
  });

  it('falls back to legacy monetization shape when new is missing', () => {
    render(
      <MonetizationHypothesisCard
        hypothesis={undefined}
        legacy={{ affiliate_angle: 'Old angle', product_fit: 'Old fit', sponsor_appeal: 'Old sponsor' }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('Old angle')).toBeDefined();
    expect(screen.getByText('Old fit')).toBeDefined();
    expect(screen.getByText('Old sponsor')).toBeDefined();
  });

  it('renders null when both shapes are empty', () => {
    const { container } = render(
      <MonetizationHypothesisCard hypothesis={undefined} legacy={undefined} onSave={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
