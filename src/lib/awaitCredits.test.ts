import { describe, it, expect, vi } from "vitest";
import { awaitCredits, CREDIT_WAIT_MS } from "./awaitCredits";
import type { ScanQuota } from "./scan";

const q = (credits: number): ScanQuota => ({ used: 0, left: credits, limit: 3, credits }) as ScanQuota;

/** A clock that only moves when the code under test sleeps, so no test waits in real time. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("waiting for scans somebody has paid for", () => {
  it("asks once before waiting, because the webhook often gets there first", async () => {
    const clock = fakeClock();
    const fetchQuota = vi.fn().mockResolvedValue(q(20));
    const out = await awaitCredits(0, fetchQuota, clock);
    expect(out).toEqual({ kind: "arrived", credits: 20 });
    expect(fetchQuota).toHaveBeenCalledTimes(1);
  });

  it("keeps asking until the balance rises", async () => {
    const clock = fakeClock();
    const fetchQuota = vi
      .fn()
      .mockResolvedValueOnce(q(0))
      .mockResolvedValueOnce(q(0))
      .mockResolvedValue(q(20));
    expect(await awaitCredits(0, fetchQuota, clock)).toEqual({ kind: "arrived", credits: 20 });
    expect(fetchQuota).toHaveBeenCalledTimes(3);
  });

  it("compares against the balance before the purchase, not against zero", async () => {
    // Somebody who already had 4 scans and bought 20 must not be told their scans arrived while the
    // server still says 4.
    const clock = fakeClock();
    const fetchQuota = vi.fn().mockResolvedValueOnce(q(4)).mockResolvedValue(q(24));
    expect(await awaitCredits(4, fetchQuota, clock)).toEqual({ kind: "arrived", credits: 24 });
  });

  it("gives up after a bounded wait rather than spinning for ever", async () => {
    const clock = fakeClock();
    const fetchQuota = vi.fn().mockResolvedValue(q(0));
    expect(await awaitCredits(0, fetchQuota, clock)).toEqual({ kind: "slow" });
    // Bounded, and it did keep trying rather than giving up after one look.
    expect(clock.now()).toBeGreaterThanOrEqual(CREDIT_WAIT_MS);
    expect(fetchQuota.mock.calls.length).toBeGreaterThan(3);
  });

  it("treats giving up as slow, never as failed", async () => {
    // The purchase stands whatever this returns. Telling somebody their payment failed when the
    // money has gone is the one thing this must never do.
    const clock = fakeClock();
    const out = await awaitCredits(0, vi.fn().mockResolvedValue(q(0)), clock);
    expect(out.kind).toBe("slow");
    expect(JSON.stringify(out)).not.toMatch(/fail|error/i);
  });

  it("survives the network dropping mid-wait", async () => {
    const clock = fakeClock();
    const fetchQuota = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(q(20));
    expect(await awaitCredits(0, fetchQuota, clock)).toEqual({ kind: "arrived", credits: 20 });
  });

  it("ignores a quota it could not read at all", async () => {
    const clock = fakeClock();
    const fetchQuota = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(q(20));
    expect(await awaitCredits(0, fetchQuota, clock)).toEqual({ kind: "arrived", credits: 20 });
  });
});
