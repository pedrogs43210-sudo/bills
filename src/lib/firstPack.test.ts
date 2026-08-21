import { describe, it, expect } from "vitest";
import { PACKS, bonusScans, FIRST_PACK_BONUS_RATE, bestValuePack } from "./packs";

describe("the first-pack bonus", () => {
  it("gives a quarter more on every pack, whichever one is chosen", () => {
    for (const pack of PACKS) {
      expect(bonusScans(pack)).toBe(Math.round(pack.scans * FIRST_PACK_BONUS_RATE));
      expect(bonusScans(pack)).toBeGreaterThan(0);
    }
  });

  it("is always a whole number of scans", () => {
    // Half a scan cannot be spent, and a pack advertised as 12.5 reads as a bug.
    for (const pack of PACKS) expect(Number.isInteger(bonusScans(pack))).toBe(true);
  });

  it("does not steer anyone into a bigger box than they wanted", () => {
    // A flat bonus would make one pack disproportionately better and turn the offer into a nudge.
    // A rate keeps the ranking by value per scan exactly as it was without the bonus.
    const rank = (scans: number, price: number) => price / scans;
    const withBonus = [...PACKS].sort(
      (a, b) => rank(a.scans + bonusScans(a), a.askingPrice) - rank(b.scans + bonusScans(b), b.askingPrice)
    );
    expect(withBonus[0].id).toBe(bestValuePack().id);
  });

  it("never makes the small pack a better deal than the big one", () => {
    const perScan = (p: (typeof PACKS)[number]) => p.askingPrice / (p.scans + bonusScans(p));
    const sorted = [...PACKS].sort((a, b) => a.scans - b.scans);
    for (let i = 1; i < sorted.length; i++) {
      expect(perScan(sorted[i])).toBeLessThanOrEqual(perScan(sorted[i - 1]));
    }
  });
});
