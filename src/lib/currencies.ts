/**
 * The currencies the picker offers.
 *
 * Not an exhaustive ISO 4217 list — a scrolling wall of 180 codes is worse than useless on a
 * phone. This is where holidays actually happen, plus the majors, ordered so the likely answer is
 * near the top. Any other code already stored on a trip still works: the picker adds it rather
 * than silently changing someone's money.
 */
export type CurrencyOption = { code: string; label: string };

export const CURRENCIES: CurrencyOption[] = [
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British pound (£)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "CHF", label: "Swiss franc" },
  { code: "SEK", label: "Swedish krona (kr)" },
  { code: "NOK", label: "Norwegian krone (kr)" },
  { code: "DKK", label: "Danish krone (kr)" },
  { code: "PLN", label: "Polish złoty (zł)" },
  { code: "CZK", label: "Czech koruna (Kč)" },
  { code: "HUF", label: "Hungarian forint (Ft)" },
  { code: "RON", label: "Romanian leu (lei)" },
  { code: "BGN", label: "Bulgarian lev (лв)" },
  { code: "HRK", label: "Croatian kuna (kn)" },
  { code: "ISK", label: "Icelandic króna (kr)" },
  { code: "TRY", label: "Turkish lira (₺)" },
  { code: "MAD", label: "Moroccan dirham" },
  { code: "EGP", label: "Egyptian pound" },
  { code: "ZAR", label: "South African rand (R)" },
  { code: "AED", label: "UAE dirham" },
  { code: "CAD", label: "Canadian dollar (C$)" },
  { code: "MXN", label: "Mexican peso" },
  { code: "BRL", label: "Brazilian real (R$)" },
  { code: "ARS", label: "Argentine peso" },
  { code: "AUD", label: "Australian dollar (A$)" },
  { code: "NZD", label: "New Zealand dollar (NZ$)" },
  { code: "JPY", label: "Japanese yen (¥)" },
  { code: "CNY", label: "Chinese yuan (¥)" },
  { code: "KRW", label: "South Korean won (₩)" },
  { code: "THB", label: "Thai baht (฿)" },
  { code: "VND", label: "Vietnamese dong (₫)" },
  { code: "IDR", label: "Indonesian rupiah (Rp)" },
  { code: "MYR", label: "Malaysian ringgit (RM)" },
  { code: "SGD", label: "Singapore dollar (S$)" },
  { code: "INR", label: "Indian rupee (₹)" },
  { code: "ILS", label: "Israeli shekel (₪)" },
];

/**
 * The list to show for a trip, guaranteed to contain the trip's own currency.
 *
 * A trip created before this list existed — or imported from someone else — may hold a code that
 * is not in it. Appending it keeps the select honest: a picker that silently displayed EUR while
 * the trip was in złoty would be a way to change a whole holiday's money by opening a menu.
 */
export function currencyOptions(current: string): CurrencyOption[] {
  const code = current.trim().toUpperCase();
  if (!code || CURRENCIES.some((c) => c.code === code)) return CURRENCIES;
  return [...CURRENCIES, { code, label: code }];
}

/**
 * The symbol a currency prints, for the picker in a split's header.
 *
 * Asked of `Intl` rather than kept in a table beside the names above: a second list of currency
 * facts is a second list to forget to update, and the platform already knows every one of these.
 * Falls back to the code itself, which is what somebody using a currency `Intl` has never heard of
 * would rather see than a blank.
 */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}
