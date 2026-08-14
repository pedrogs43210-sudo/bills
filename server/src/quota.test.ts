import { describe, it, expect } from "vitest";
import {
  dayKey,
  decideQuota,
  decideSpend,
  isValidInstallId,
  monthKey,
  peekQuota,
  scanCostMicros,
  FREE_TRIAL_SCANS,
  MAX_SCANS_PER_DAY,
} from "./quota";

describe("dayKey", () => {
  it("is UTC, so the day cannot roll over twice on a flight", () => {
    expect(dayKey(new Date("2026-08-14T23:30:00Z"))).toBe("2026-08-14");
    expect(dayKey(new Date("2026-08-15T00:30:00Z"))).toBe("2026-08-15");
  });
});

describe("monthKey", () => {
  it("still pads, and is still UTC — it is a reporting column now, not a reset", () => {
    expect(monthKey(new Date("2026-03-02T00:00:00Z"))).toBe("2026-03");
    expect(monthKey(new Date("2026-12-31T23:59:00Z"))).toBe("2026-12");
  });
});

describe("the free trial", () => {
  it("lets a brand-new install scan, and counts it", () => {
    const d = decideQuota(null, false);
    expect(d.allowed).toBe(true);
    expect(d.used).toBe(1);
    expect(d.left).toBe(FREE_TRIAL_SCANS - 1);
  });

  it("allows exactly the free allowance", () => {
    const d = decideQuota({ used: FREE_TRIAL_SCANS - 1, credits: 0 }, false);
    expect(d.allowed).toBe(true);
    expect(d.left).toBe(0);
  });

  it("refuses the one after, without incrementing the count", () => {
    const d = decideQuota({ used: FREE_TRIAL_SCANS, credits: 0 }, false);
    expect(d.allowed).toBe(false);
    expect(d.used).toBe(FREE_TRIAL_SCANS);
    expect(d.left).toBe(0);
  });

  it("never comes back — this is the whole point of it not being monthly", () => {
    // A month later, a year later: the same install has the same spent trial. The old monthly
    // allowance was a recurring bill for every user who never paid.
    const spent = { used: FREE_TRIAL_SCANS, credits: 0 };
    expect(decideQuota(spent, false).allowed).toBe(false);
    expect(peekQuota(spent, false).left).toBe(0);
  });

  it("never caps a subscriber, but still counts them", () => {
    const d = decideQuota({ used: 999, credits: 0 }, true);
    expect(d.allowed).toBe(true);
    expect(d.used).toBe(1000);
    expect(d.left).toBeNull();
  });

  it("a lapsed subscriber falls back to the cap using the same counter", () => {
    // Their counter kept climbing while they were paying, so it is well past the trial.
    const d = decideQuota({ used: 400, credits: 0 }, false);
    expect(d.allowed).toBe(false);
    expect(d.left).toBe(0);
  });

  it("treats a tampered count as zero rather than as free scans", () => {
    for (const used of [-5, 1.5, NaN]) {
      expect(decideQuota({ used, credits: 0 }, false).allowed).toBe(true);
      expect(decideQuota({ used, credits: 0 }, false).used).toBe(1);
    }
  });

  it("honours a different limit, and copes with one lowered below what was used", () => {
    expect(decideQuota({ used: 5, credits: 0 }, false, 10).allowed).toBe(true);
    const d = decideQuota({ used: 9, credits: 0 }, false, 3);
    expect(d.allowed).toBe(false);
    expect(d.left).toBe(0); // never negative
  });

  it("reports without spending a scan, and agrees with the decision", () => {
    for (const used of [0, 1, FREE_TRIAL_SCANS - 1, FREE_TRIAL_SCANS, 99]) {
      const peek = peekQuota({ used, credits: 0 }, false);
      expect(peek.used).toBe(used);
      expect(peek.left! > 0).toBe(decideQuota({ used, credits: 0 }, false).allowed);
    }
  });

  it("shows no cap for a subscriber", () => {
    expect(peekQuota({ used: 12, credits: 0 }, true).left).toBeNull();
  });
});

describe("bought credits", () => {
  it("is spent only after the free trial is gone", () => {
    // Burning a paid scan while a free one is sitting there is a small theft.
    const fresh = decideQuota({ used: 0, credits: 20 }, false);
    expect(fresh.source).toBe("trial");
    expect(fresh.credits).toBe(20);

    const spent = decideQuota({ used: FREE_TRIAL_SCANS, credits: 20 }, false);
    expect(spent.source).toBe("credits");
    expect(spent.credits).toBe(19);
  });

  it("counts trial and credits together in what the app shows as left", () => {
    expect(peekQuota({ used: 1, credits: 20 }, false).left).toBe(FREE_TRIAL_SCANS - 1 + 20);
    expect(decideQuota({ used: 1, credits: 20 }, false).left).toBe(FREE_TRIAL_SCANS - 2 + 20);
  });

  it("refuses once both are empty", () => {
    const d = decideQuota({ used: FREE_TRIAL_SCANS, credits: 0 }, false);
    expect(d.allowed).toBe(false);
    expect(d.source).toBeNull();
    expect(d.left).toBe(0);
  });

  it("does not touch credits for a subscriber", () => {
    const d = decideQuota({ used: 500, credits: 20 }, true);
    expect(d.source).toBe("subscription");
    expect(d.credits).toBe(20);
    expect(d.left).toBeNull();
  });

  it("treats a tampered credit balance as none, never as free scans", () => {
    for (const credits of [-10, 2.5, NaN]) {
      const d = decideQuota({ used: FREE_TRIAL_SCANS, credits }, false);
      expect(d.allowed).toBe(false);
      expect(d.credits).toBe(0);
    }
  });
});

describe("what a scan cost", () => {
  it("prices the model that was actually used", () => {
    // 5,950 in and 900 out on Sonnet 5: 5950*3 + 900*15 = 31,350 micro-dollars, about 3 cents.
    expect(scanCostMicros("claude-sonnet-5", 5950, 900)).toBe(31_350);
  });

  it("bills an unknown model at the dearest rate rather than at nothing", () => {
    // A cost report that silently reads zero for a model nobody added is worse than one too high.
    expect(scanCostMicros("some-future-model", 1000, 100)).toBeGreaterThan(0);
    expect(scanCostMicros("some-future-model", 1000, 100)).toBe(
      scanCostMicros("claude-opus-4-8", 1000, 100)
    );
  });

  it("shrugs off missing or nonsense token counts", () => {
    expect(scanCostMicros("claude-sonnet-5", NaN, -5)).toBe(0);
  });
});

describe("the day's ceiling", () => {
  const noon = new Date("2026-08-14T12:00:00Z");

  it("serves the first scan of a day", () => {
    const s = decideSpend(null, noon);
    expect(s.allowed).toBe(true);
    expect(s.scansToday).toBe(0);
    expect(s.day).toBe("2026-08-14");
  });

  it("allows right up to the cap and refuses the one after", () => {
    expect(decideSpend({ day: "2026-08-14", scans: MAX_SCANS_PER_DAY - 1 }, noon).allowed).toBe(true);
    expect(decideSpend({ day: "2026-08-14", scans: MAX_SCANS_PER_DAY }, noon).allowed).toBe(false);
    expect(decideSpend({ day: "2026-08-14", scans: MAX_SCANS_PER_DAY + 50 }, noon).allowed).toBe(false);
  });

  it("starts fresh when the day rolls over", () => {
    // Yesterday's exhausted budget must not close today.
    expect(decideSpend({ day: "2026-08-13", scans: MAX_SCANS_PER_DAY }, noon).allowed).toBe(true);
    expect(decideSpend({ day: "2026-08-13", scans: MAX_SCANS_PER_DAY }, noon).scansToday).toBe(0);
  });

  it("treats a tampered row as an empty day rather than as a closed one", () => {
    // Erring the other way would let a corrupt row take scanning down for everybody.
    for (const scans of [-1, 2.5, NaN]) {
      expect(decideSpend({ day: "2026-08-14", scans }, noon).allowed).toBe(true);
    }
  });

  it("honours a cap of zero, which is the emergency stop", () => {
    expect(decideSpend(null, noon, 0).allowed).toBe(false);
    expect(decideSpend({ day: "2026-08-14", scans: 0 }, noon, 0).allowed).toBe(false);
  });

  it("is blind to who is asking, which is the point", () => {
    // A per-install limit cannot stop someone who can mint install ids. This can.
    const nearlyDone = { day: "2026-08-14", scans: MAX_SCANS_PER_DAY };
    expect(decideSpend(nearlyDone, noon).allowed).toBe(false);
  });
});

describe("isValidInstallId", () => {
  it("accepts the uuid the app issues", () => {
    expect(isValidInstallId("c2987a1a-9bfe-444b-b159-332468f72103")).toBe(true);
    expect(isValidInstallId("C2987A1A-9BFE-444B-B159-332468F72103")).toBe(true);
  });

  it("rejects anything else, so the table cannot be filled with keys that each carry an allowance", () => {
    for (const bad of [null, undefined, "", "abc", "c2987a1a9bfe444bb159332468f72103", "../../etc", "'; DROP TABLE installs; --"]) {
      expect(isValidInstallId(bad)).toBe(false);
    }
  });
});
