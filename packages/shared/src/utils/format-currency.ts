/**
 * format-currency — formats USD amounts in the user's locale currency.
 *
 * Base currency is USD (from Stripe webhooks). Conversion to BRL/EUR uses
 * the daily rate cached in the `currency_rates` table — fetch happens
 * server-side; this utility just applies the rate.
 */

export type SupportedCurrency = 'USD' | 'BRL' | 'EUR';

export interface FormatCurrencyInput {
  /** Amount in USD (canonical base) */
  amountUsd: number;
  /** Target currency */
  currency: SupportedCurrency;
  /** Rate from USD → target. Required for non-USD output. */
  rateToTarget?: number;
  /** BCP-47 locale for digit grouping / decimal sep. Defaults per currency. */
  locale?: string;
}

const DEFAULT_LOCALE: Record<SupportedCurrency, string> = {
  USD: 'en-US',
  BRL: 'pt-BR',
  EUR: 'de-DE',
};

/**
 * Detect target currency from a country code (ISO 3166 alpha-2).
 * BR → BRL, anything in EU zone → EUR, else → USD.
 */
export function currencyForCountry(country?: string | null): SupportedCurrency {
  if (!country) return 'USD';
  const c = country.toUpperCase();
  if (c === 'BR') return 'BRL';
  if (
    [
      'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'IE',
      'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
    ].includes(c)
  ) {
    return 'EUR';
  }
  return 'USD';
}

export function formatCurrency(input: FormatCurrencyInput): string {
  const { amountUsd, currency } = input;
  const rateToTarget = currency === 'USD' ? 1 : input.rateToTarget;

  if (rateToTarget === undefined) {
    throw new Error(
      `formatCurrency: rateToTarget is required when currency is ${currency}`,
    );
  }

  const targetAmount = amountUsd * rateToTarget;
  const locale = input.locale ?? DEFAULT_LOCALE[currency];

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(targetAmount);
}
