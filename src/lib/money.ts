export function formatCents(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`.trim();
  }
}

export function parseToCents(input: string): number | null {
  const cleaned = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const result = Math.round(parseFloat(cleaned) * 100);
  return result === 0 ? 0 : result;
}
