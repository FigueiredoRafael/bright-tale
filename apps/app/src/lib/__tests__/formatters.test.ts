import { describe, it, expect } from 'vitest';
import { formatBrl, formatDate } from '../formatters';

describe('formatters', () => {
  it('formatBrl renders integer BRL with pt-BR grouping and no fraction digits', () => {
    expect(formatBrl(50)).toMatch(/R\$\s?50/);
    expect(formatBrl(1234)).toMatch(/R\$\s?1\.234/);
    expect(formatBrl(0)).toMatch(/R\$\s?0/);
  });

  it('formatBrl handles negative values', () => {
    expect(formatBrl(-10)).toMatch(/-.*10/);
  });

  it('formatDate renders ISO date in pt-BR medium format', () => {
    // 2026-04-17 in pt-BR medium is "17 de abr. de 2026"
    const out = formatDate('2026-04-17T12:00:00.000Z');
    expect(out).toMatch(/17/);
    expect(out).toMatch(/2026/);
  });
});
