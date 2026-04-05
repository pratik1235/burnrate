export type CurrencyCode = string;

function localeForCurrency(code: CurrencyCode): string {
  const c = (code || 'INR').toUpperCase();
  if (c === 'USD') return 'en-US';
  return 'en-IN';
}

export function formatCurrency(amount: number, currencyCode: CurrencyCode = 'INR'): string {
  const code = (currencyCode || 'INR').toUpperCase().slice(0, 3);
  return new Intl.NumberFormat(localeForCurrency(code), {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number, currencyCode: CurrencyCode = 'INR'): string {
  const code = (currencyCode || 'INR').toUpperCase().slice(0, 3);
  if (code === 'INR') {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
    return formatCurrency(amount, code);
  }
  if (code === 'USD') {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
    return formatCurrency(amount, code);
  }
  return formatCurrency(amount, code);
}
