import { describe, it, expect } from 'vitest';
import { currencyForCountry, formatCurrency } from '../format-currency';

describe('currencyForCountry', () => {
  it('returns BRL for BR', () => {
    expect(currencyForCountry('BR')).toBe('BRL');
    expect(currencyForCountry('br')).toBe('BRL');
  });

  it('returns EUR for euro-zone country codes', () => {
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('FR')).toBe('EUR');
    expect(currencyForCountry('PT')).toBe('EUR');
  });

  it('returns USD for everything else', () => {
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('GB')).toBe('USD');
    expect(currencyForCountry(null)).toBe('USD');
    expect(currencyForCountry(undefined)).toBe('USD');
  });
});

describe('formatCurrency', () => {
  it('formats USD natively', () => {
    expect(formatCurrency({ amountUsd: 9.99, currency: 'USD' })).toBe('$9.99');
  });

  it('formats BRL with rate (USD → BRL)', () => {
    const out = formatCurrency({
      amountUsd: 9,
      currency: 'BRL',
      rateToTarget: 5.5,
    });
    // pt-BR uses non-breaking space (U+00A0) between "R$" and value
    expect(out).toBe('R$ 49,50');
  });

  it('formats EUR with rate', () => {
    const out = formatCurrency({
      amountUsd: 10,
      currency: 'EUR',
      rateToTarget: 0.92,
    });
    // de-DE: "9,20 €"
    expect(out).toBe('9,20 €');
  });

  it('throws when non-USD currency has no rate', () => {
    expect(() =>
      formatCurrency({ amountUsd: 10, currency: 'BRL' }),
    ).toThrow(/rateToTarget is required/);
  });

  it('respects custom locale override', () => {
    const out = formatCurrency({
      amountUsd: 9.99,
      currency: 'USD',
      locale: 'en-GB',
    });
    expect(out).toBe('US$9.99');
  });
});
