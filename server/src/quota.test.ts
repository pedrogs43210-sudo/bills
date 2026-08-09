import { describe, it, expect } from "vitest";
import { decideQuota, isValidInstallId, monthKey, peekQuota, FREE_SCANS_PER_MONTH } from "./quota";

const AUG = new Date("2026-08-09T12:00:00Z");
const SEP = new Date("2026-09-01T00:00:00Z");

describe("monthKey", () => {
  it("is UTC, so the allowance cannot reset twice on a flight", () => {
    expect(monthKey(new Date("2026-08-31T23:30:00Z"))).toBe("2026-08");
    expect(monthKey(new Date("2026-09-01T00:30:00Z"))).toBe("2026-09");
  });

  it("pads the month", () => {
    expect(monthKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01");
  });
});

describe("decideQuota", () => {
  it("lets a brand-new install scan, and counts it", () => {
    const d = decideQuota(null, AUG, false);
    expect(d).toMatchObject({ allowed: true, used: 1, left: 4, month: "2026-08" });
  });

  it("allows exactly the free allowance", () => {
    for (let used = 0; used < FREE_SCANS_PER_MONTH; used++) {
      expect(decideQuota({ month: "2026-08", used }, AUG, false).allowed).toBe(true);
    }
  });

  it("refuses the one after, without incrementing the count", () => {
    const d = decideQuota({ month: "2026-08", used: 5 }, AUG, false);
    expect(d.allowed).toBe(false);
    expect(d.used).toBe(5); // a refused scan is not a used scan
    expect(d.left).toBe(0);
  });

  it("resets on a new month", () => {
    const d = decideQuota({ month: "2026-08", used: 5 }, SEP, false);
    expect(d).toMatchObject({ allowed: true, used: 1, left: 4, month: "2026-09", rolledOver: true });
  });

  it("does not resurrect an old month's allowance mid-month", () => {
    expect(decideQuota({ month: "2026-08", used: 5 }, AUG, false).rolledOver).toBe(false);
  });

  it("never caps a subscriber, but still counts them", () => {
    const d = decideQuota({ month: "2026-08", used: 240 }, AUG, true);
    expect(d.allowed).toBe(true);
    expect(d.left).toBeNull();
    expect(d.used).toBe(241); // so there is a real usage figure to judge the free tier by
  });

  it("treats a tampered count as zero rather than as free scans", () => {
    // a negative or fractional stored value must not become extra allowance
    for (const used of [-5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = decideQuota({ month: "2026-08", used: used as number }, AUG, false);
      expect(d.allowed).toBe(true);
      expect(d.used).toBe(1);
    }
  });

  it("honours a different limit, and copes with one lowered below what was used", () => {
    expect(decideQuota({ month: "2026-08", used: 9 }, AUG, false, 20).allowed).toBe(true);
    const lowered = decideQuota({ month: "2026-08", used: 9 }, AUG, false, 3);
    expect(lowered.allowed).toBe(false);
    expect(lowered.left).toBe(0); // never a negative number on screen
  });

  it("a lapsed subscriber falls back to the cap using the same counter", () => {
    const row = { month: "2026-08", used: 5 };
    expect(decideQuota(row, AUG, true).allowed).toBe(true);
    expect(decideQuota(row, AUG, false).allowed).toBe(false);
  });
});

describe("peekQuota", () => {
  it("reports without spending a scan", () => {
    expect(peekQuota({ month: "2026-08", used: 2 }, AUG, false)).toEqual({ used: 2, left: 3, month: "2026-08" });
  });

  it("shows a fresh allowance once the month turns", () => {
    expect(peekQuota({ month: "2026-08", used: 5 }, SEP, false)).toEqual({ used: 0, left: 5, month: "2026-09" });
  });

  it("shows no cap for a subscriber", () => {
    expect(peekQuota(null, AUG, true).left).toBeNull();
  });

  it("agrees with decideQuota about whether the next scan is allowed", () => {
    for (let used = 0; used <= 7; used++) {
      const row = { month: "2026-08", used };
      const canScan = peekQuota(row, AUG, false).left! > 0;
      expect(canScan).toBe(decideQuota(row, AUG, false).allowed);
    }
  });
});

describe("isValidInstallId", () => {
  it("accepts the uuid the app issues", () => {
    expect(isValidInstallId("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(isValidInstallId("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("rejects anything else, so the table cannot be filled with keys that each carry an allowance", () => {
    for (const bad of ["", "abc", null, undefined, "3f2504e0-4f89-41d3-9a0c", "../../etc/passwd", "x".repeat(200)]) {
      expect(isValidInstallId(bad as string), String(bad)).toBe(false);
    }
  });
});
