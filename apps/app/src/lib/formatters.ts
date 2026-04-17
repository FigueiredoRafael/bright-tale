/**
 * pt-BR hard-coded formatters for affiliate (and future) UI.
 * Locale is a constant now — promoted to an argument when i18n lands.
 */
export function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(iso));
}
