import { describe, it, expect } from "vitest";
import { balances, countableReceipts, excludedReceipts, exclusionReason, settle } from "./settle";
import { receiptShares } from "./split";
import { summaryText } from "./summary";
import type { Assignment, Item, Person, Receipt, Trip } from "../types";

/** Deterministic RNG so any failure is reproducible. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Kept small enough to run beside the DOM tests without starving them. Before the v2
// release this ran 5 seeds x 2000 iterations (20260808, 1, 987654321, 42, 20250101) with
// every invariant holding; widen it again by hand when changing the money code.
const SEEDS = [20260808];
const ITERATIONS = 500;

describe.each(SEEDS)("money invariants over hostile random trips (seed %i)", (SEED) => {
  it("keeps every money invariant", () => {
    const random = makeRandom(SEED);
    const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
    const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const peopleCount = int(1, 5);
      const people: Person[] = Array.from({ length: peopleCount }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        color: "#fff",
      }));
      const ids = people.map((p) => p.id);
      const ghosts = ["ghost1", "ghost2"];

      const receipts: Receipt[] = [];
      const receiptCount = int(1, 4);
      for (let r = 0; r < receiptCount; r++) {
        const itemCount = int(1, 4);
        const items: Item[] = [];
        for (let i = 0; i < itemCount; i++) {
          const quantity = int(1, 3);
          // include negative lines (discounts) and zero lines
          const lineTotal = pick([int(-200, -1), 0, int(1, 900), int(1, 900)]);
          let assignment: Assignment;
          const shape = int(0, 6);
          if (shape === 0) {
            assignment = { kind: "unassigned" };
          } else if (shape === 1) {
            assignment = { kind: "everyone" };
          } else if (shape === 2) {
            // "everyone except one" — the newest feature's shape
            const dropped = pick(ids);
            const rest = ids.filter((id) => id !== dropped);
            assignment =
              rest.length === 0 ? { kind: "unassigned" } : { kind: "people", personIds: rest };
          } else if (shape === 3) {
            const n = int(1, ids.length);
            assignment = { kind: "people", personIds: ids.slice(0, n) };
          } else if (shape === 4) {
            // a non-member sneaks in (hand-edited or stale import)
            assignment = { kind: "people", personIds: [pick(ids), pick(ghosts)] };
          } else if (shape === 5) {
            const shares: Record<string, number> = {};
            let left = quantity;
            for (const id of ids) {
              if (left <= 0) break;
              const u = int(0, left);
              if (u > 0) shares[id] = u;
              left -= u;
            }
            assignment =
              Object.keys(shares).length === 0 ? { kind: "unassigned" } : { kind: "units", shares };
          } else {
            // duplicate ids within one assignment
            assignment = { kind: "people", personIds: [ids[0], ids[0]] };
          }
          items.push({ id: `i${r}-${i}`, name: `item${i}`, quantity, lineTotal, assignment });
        }

        const itemSum = items.reduce((s, it) => s + it.lineTotal, 0);
        // totals that agree, overshoot, undershoot, are zero, or negative
        const printedTotal = pick([itemSum, itemSum + int(1, 300), itemSum - int(1, 300), 0, int(-500, -1)]);

        const payerShape = int(0, 4);
        let payments;
        if (payerShape === 0) {
          payments = [{ personId: pick(ids), amount: printedTotal }];
        } else if (payerShape === 1) {
          payments = [] as { personId: string; amount: number }[]; // no payer
        } else if (payerShape === 2) {
          payments = [{ personId: pick(ghosts), amount: printedTotal }]; // non-member payer
        } else if (payerShape === 3) {
          const a = int(0, Math.max(0, printedTotal));
          payments = [
            { personId: ids[0], amount: a },
            { personId: ids[Math.min(1, ids.length - 1)], amount: printedTotal - a },
          ];
        } else {
          payments = [{ personId: pick(ids), amount: -int(1, 400) }]; // negative amount
        }
        // a two-payer list must not name the same person twice
        if (payments.length === 2 && payments[0].personId === payments[1].personId) {
          payments = [{ personId: payments[0].personId, amount: printedTotal }];
        }

        receipts.push({
          id: `r${r}`,
          storeName: "Store",
          date: "2026-08-08",
          payments,
          items,
          printedTotal,
          status: pick(["review", "assigning", "done"] as const),
        });
      }

      const trip: Trip = {
        id: "t1", name: "Trip", emoji: "🏖️", currency: "EUR",
        people, groups: [], receipts,
        createdAt: "2026-08-08T00:00:00Z", schemaVersion: 2,
      };

      const context = () => `iteration ${iter}\n${JSON.stringify(trip)}`;

      // (a) every countable receipt's shares sum exactly to its printed total
      for (const receipt of countableReceipts(trip)) {
        const shares = receiptShares(receipt, people);
        const sum = Object.values(shares).reduce((s, v) => s + v, 0);
        expect(sum, `shares must sum to printedTotal — ${context()}`).toBe(receipt.printedTotal);
        // (c) no share may land on a non-member
        for (const id of Object.keys(shares)) {
          expect(ids, `phantom person in shares — ${context()}`).toContain(id);
        }
      }

      // (b) balances sum to exactly zero, and transfers reconcile them
      const bal = balances(trip);
      const balSum = Object.values(bal).reduce((s, v) => s + v, 0);
      expect(balSum, `balances must sum to zero — ${context()}`).toBe(0);
      for (const id of Object.keys(bal)) {
        expect(ids, `phantom person in balances — ${context()}`).toContain(id);
      }

      const transfers = settle(bal);
      const net: Record<string, number> = {};
      for (const id of ids) net[id] = 0;
      for (const t of transfers) {
        net[t.from] += t.amount;
        net[t.to] -= t.amount;
        expect(t.amount, `transfer must be positive — ${context()}`).toBeGreaterThan(0);
      }
      for (const id of ids) {
        // normalise -0, which Object.is distinguishes from 0
        const want = bal[id] === 0 ? 0 : -bal[id];
        expect(net[id], `transfers must clear the balance — ${context()}`).toBe(want);
      }

      // (d) an excluded receipt always has a stated reason, and a counted one never does
      for (const receipt of excludedReceipts(trip)) {
        expect(exclusionReason(receipt, trip), `excluded needs a reason — ${context()}`).not.toBeNull();
      }
      for (const receipt of countableReceipts(trip)) {
        expect(exclusionReason(receipt, trip), `counted must have no reason — ${context()}`).toBeNull();
      }

      // (e) the shared text may never claim all-square while a receipt is excluded
      const text = summaryText(trip);
      if (excludedReceipts(trip).length > 0) {
        expect(text, `must warn when a receipt is excluded — ${context()}`).toContain("Not final");
      }
      // the unqualified, final-sounding claim is only allowed on a fully counted trip
      if (text.includes("All square! 🎉")) {
        expect(excludedReceipts(trip).length, `all-square with exclusions — ${context()}`).toBe(0);
        expect(countableReceipts(trip).length, `all-square with nothing counted — ${context()}`).toBeGreaterThan(0);
      }
    }
  });
});
