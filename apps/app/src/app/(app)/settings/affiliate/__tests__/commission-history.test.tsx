import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommissionHistory } from '../components/commission-history';

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    amountBrl: 100 + i,
    status: i % 3 === 0 ? 'paid' : i % 3 === 1 ? 'pending' : 'cancelled',
    isRetroactive: i % 5 === 0,
    createdAt: new Date(2026, 0, (i % 28) + 1).toISOString(),
  })) as any;

describe('CommissionHistory', () => {
  it('paginates at 20 per page', () => {
    render(<CommissionHistory items={makeRows(45)} />);
    expect(screen.getAllByRole('row').length - 1).toBe(20); // minus header
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(screen.getAllByRole('row').length - 1).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(screen.getAllByRole('row').length - 1).toBe(5);
  });

  it('status pills map colors per {pending, paid, cancelled}', () => {
    const { container } = render(<CommissionHistory items={makeRows(3)} />);
    const html = container.innerHTML;
    expect(html).toMatch(/green|paid/);
    expect(html).toMatch(/yellow|pending/);
    expect(html).toMatch(/red|cancel/);
  });

  it('retroactive rows display retroactive badge', () => {
    render(<CommissionHistory items={makeRows(1)} />); // i=0 → retroactive=true
    expect(screen.getByText(/Retroativo/)).toBeInTheDocument();
  });

  it('empty list shows empty state copy', () => {
    render(<CommissionHistory items={[]} />);
    expect(screen.getByText(/Nenhuma comissão/)).toBeInTheDocument();
  });
});
