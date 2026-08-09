export function formatCents(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`.trim();
  }
}

/**
 * The same formatting as `formatCents`, split into pieces so the hero number can render its
 * currency symbol smaller and quieter while the digits keep full weight (design Rule 1).
 *
 * Uses `formatToParts` rather than slicing the string, because the symbol is not always in
 * front: `1 234,56 kr` puts it last, and a hard-coded prefix would drop it or mangle it.
 */
export function formatCentsParts(cents: number, currency: string): { currency: boolean; text: string }[] {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency })
      .formatToParts(value)
      .map((part) => ({ currency: part.type === "currency", text: part.value }));
  } catch {
    // Same fallback as formatCents: an AI-supplied currency code can be anything at all.
    return [
      { currency: false, text: value.toFixed(2) },
      { currency: true, text: ` ${currency}`.trimEnd() },
    ];
  }
}

export function parseToCents(input: string): number | null {
  const cleaned = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const result = Math.round(parseFloat(cleaned) * 100);
  return result === 0 ? 0 : result;
}
