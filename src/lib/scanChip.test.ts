import { describe, it, expect } from "vitest";
import { scanChip, PAID_CHIP_BELOW } from "./scanChip";
import type { ScanQuota } from "./scan";

const q = (left: number | null, credits = 0): ScanQuota =>
  ({ used: 0, left, limit: 3, credits }) as ScanQuota;

describe("the chip on the scan button", () => {
  it("counts the free trial down, all three of them", () => {
    // Every one of the first three is worth explaining — this is the whole of what a new user has.
    expect(scanChip(q(3))).toEqual({ text: "3 free", tone: "quiet" });
    expect(scanChip(q(2))).toEqual({ text: "2 free", tone: "quiet" });
  });

  it("inverts on the last one, without reaching for a warning colour", () => {
    // Red would say something has gone wrong. Nothing has: they have a scan, and then a decision.
    expect(scanChip(q(1))).toEqual({ text: "1 free", tone: "last" });
  });

  it("stops calling them free once any have been bought", () => {
    expect(scanChip(q(4, 4))).toEqual({ text: "4 left", tone: "quiet" });
    expect(scanChip(q(1, 1))).toEqual({ text: "1 left", tone: "last" });
  });

  it("goes quiet for somebody who has just bought a pack", () => {
    // They solved this problem. A counter on every screen afterwards is nagging, not helping.
    expect(scanChip(q(24, 24))).toBeNull();
    expect(scanChip(q(PAID_CHIP_BELOW + 1, PAID_CHIP_BELOW + 1))).toBeNull();
  });

  it("comes back with enough runway to act on it", () => {
    expect(scanChip(q(PAID_CHIP_BELOW, PAID_CHIP_BELOW))).not.toBeNull();
  });

  it("says nothing at zero, because there the whole button changes job", () => {
    expect(scanChip(q(0))).toBeNull();
    expect(scanChip(q(0, 0))).toBeNull();
  });

  it("says nothing when there is no counter to report", () => {
    // No proxy configured, or a subscriber with no cap. Inventing "unlimited" would be a promise
    // this app cannot keep.
    expect(scanChip(null)).toBeNull();
    expect(scanChip(q(null))).toBeNull();
  });
});
