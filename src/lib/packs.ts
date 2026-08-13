/**
 * What Billy sells, in one place.
 *
 * Prices and product ids live here and nowhere else. A price written into a screen is a price that
 * will one day disagree with the store's, and the store is always right — it charges in the
 * customer's own currency, applies their VAT, and runs its own regional pricing. What is written
 * here is what we *asked* for; `displayPrice` is where the store's real answer goes once in-app
 * purchases are wired, and until then it falls back to these.
 *
 * Packs rather than a subscription, deliberately. A pack cannot lose money: what someone pays and
 * what their scans cost move together. An unlimited subscription at €4.99 nets €3.45 after VAT and
 * the store's cut, and goes underwater at about 120 scans — it hands the heaviest user the bill.
 * Splitting is also episodic, a holiday or a dinner, so a recurring charge asks for the renewal
 * decision at the exact moment the app is worth nothing to them.
 */

export type Pack = {
  /** The store product id. Must match what is registered in App Store Connect and Play Console. */
  id: string;
  /** How many scans it adds. Never expires — see the promise on the paywall. */
  scans: number;
  /** What we asked the store to charge, for display before the store has answered. */
  askingPrice: number;
  currency: string;
  /** The one that is pre-selected, and the only one that says so. */
  featured?: boolean;
};

export const PACKS: Pack[] = [
  { id: "app.billy.scans.10", scans: 10, askingPrice: 1.99, currency: "EUR" },
  { id: "app.billy.scans.20", scans: 20, askingPrice: 2.99, currency: "EUR", featured: true },
  { id: "app.billy.scans.60", scans: 60, askingPrice: 6.99, currency: "EUR" },
];

export const featuredPack = (): Pack => PACKS.find((p) => p.featured) ?? PACKS[0];

export const packById = (id: string): Pack | undefined => PACKS.find((p) => p.id === id);

/**
 * A pack's price, in the reader's own language and the pack's currency.
 *
 * `Intl` rather than a hard-coded "€", because the symbol's position is not the same everywhere —
 * "2,99 €" in Portugal, "€2.99" in Ireland — and getting that wrong is the sort of small wrongness
 * that makes a payment screen feel untrustworthy.
 */
export function displayPrice(pack: Pack): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: pack.currency }).format(
      pack.askingPrice
    );
  } catch {
    return `${pack.askingPrice.toFixed(2)} ${pack.currency}`;
  }
}

/** "15c each" — the number that makes a pack legible as value rather than as a toll. */
export function displayPerScan(pack: Pack): string {
  const each = pack.askingPrice / pack.scans;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: pack.currency,
      maximumFractionDigits: 2,
    }).format(each);
  } catch {
    return `${each.toFixed(2)} ${pack.currency}`;
  }
}
