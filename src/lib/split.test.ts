import { describe, it, expect } from "vitest";
import { receiptShares, roundLargestRemainder, isItemAssigned, isFullyAssigned } from "./split";
import type { Item, Person, Receipt, Assignment } from "../types";

const people: Person[] = [
  { id: "pedro", name: "Pedro", color: "#FFD9A0" },
  { id: "ana", name: "Ana", color: "#FFC4B8" },
  { id: "bruno", name: "Bruno", color: "#C9E8C9" },
];

let n = 0;
function item(lineTotal: number, assignment: Assignment, quantity = 1): Item {
  return { id: `i${n++}`, name: `item${n}`, quantity, lineTotal, assignment };
}

function receipt(items: Item[], printedTotal: number, paidBy = "pedro"): Receipt {
  return { id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy, items, printedTotal, status: "assigning" };
}

describe("receiptShares", () => {
  it("gives a solo item entirely to its person", () => {
    const r = receipt([item(249, { kind: "people", personIds: ["pedro"] })], 249);
    expect(receiptShares(r, people)).toEqual({ pedro: 249, ana: 0, bruno: 0 });
  });

  it("splits an everyone item equally", () => {
    const r = receipt([item(300, { kind: "everyone" })], 300);
    expect(receiptShares(r, people)).toEqual({ pedro: 100, ana: 100, bruno: 100 });
  });

  it("splits a shared item among selected people only", () => {
    const r = receipt([item(500, { kind: "people", personIds: ["ana", "bruno"] })], 500);
    expect(receiptShares(r, people)).toEqual({ pedro: 0, ana: 250, bruno: 250 });
  });

  it("splits quantity lines by units", () => {
    // 3 juices for 450: Ana 2 units (300), Bruno 1 unit (150)
    const r = receipt([item(450, { kind: "units", shares: { ana: 2, bruno: 1 } }, 3)], 450);
    expect(receiptShares(r, people)).toEqual({ pedro: 0, ana: 300, bruno: 150 });
  });

  it("rounds so shares sum exactly to the printed total, payer wins ties", () => {
    // 100 among 3 → 33.33... each; payer (pedro) takes the extra cent
    const r = receipt([item(100, { kind: "everyone" })], 100);
    const s = receiptShares(r, people);
    expect(s.pedro + s.ana + s.bruno).toBe(100);
    expect(s.pedro).toBe(34);
  });

  it("payer absorbs a difference between item sum and printed total", () => {
    // items sum 200 but receipt says 210 (accepted mismatch) → payer pays the extra 10
    const r = receipt([item(200, { kind: "people", personIds: ["ana"] })], 210);
    expect(receiptShares(r, people)).toEqual({ pedro: 10, ana: 200, bruno: 0 });
  });

  it("handles negative discount lines", () => {
    const r = receipt(
      [item(500, { kind: "people", personIds: ["ana"] }), item(-100, { kind: "people", personIds: ["ana"] })],
      400
    );
    expect(receiptShares(r, people)).toEqual({ pedro: 0, ana: 400, bruno: 0 });
  });

  it("ignores assignment ids that are not trip members (cents fall to the payer)", () => {
    const r = receipt([item(300, { kind: "units", shares: { ghost: 2, ana: 1 } }, 3)], 300);
    const s = receiptShares(r, people);
    expect(Object.keys(s).sort()).toEqual(["ana", "bruno", "pedro"]);
    expect(s.ana).toBe(100);
    expect(s.pedro).toBe(200); // payer absorbs the ghost's 200
    expect(s.pedro + s.ana + s.bruno).toBe(300);
  });

  it("shares always sum to printedTotal (random receipts)", () => {
    for (let run = 0; run < 200; run++) {
      const items: Item[] = [];
      let sum = 0;
      const count = 1 + Math.floor(Math.random() * 8);
      for (let k = 0; k < count; k++) {
        const cents = Math.floor(Math.random() * 2000) + 1;
        sum += cents;
        const kinds: Assignment[] = [
          { kind: "everyone" },
          { kind: "people", personIds: ["pedro", "ana"] },
          { kind: "people", personIds: ["bruno"] },
          { kind: "units", shares: { pedro: 1, ana: 2 } },
        ];
        const a = kinds[Math.floor(Math.random() * kinds.length)];
        items.push(item(cents, a, a.kind === "units" ? 3 : 1));
      }
      const r = receipt(items, sum);
      const shares = receiptShares(r, people);
      const total = Object.values(shares).reduce((x, y) => x + y, 0);
      expect(total).toBe(sum);
    }
  });
});

describe("roundLargestRemainder", () => {
  it("distributes leftover cents to largest remainders first", () => {
    const exact = new Map([["a", 33.4], ["b", 33.3], ["c", 33.3]]);
    const rounded = roundLargestRemainder(exact);
    expect([...rounded.values()].reduce((x, y) => x + y, 0)).toBe(100);
    expect(rounded.get("a")).toBe(34);
  });
});

describe("assignment completeness", () => {
  it("unassigned item is not assigned", () => {
    expect(isItemAssigned(item(100, { kind: "unassigned" }))).toBe(false);
  });
  it("people assignment needs at least one person", () => {
    expect(isItemAssigned(item(100, { kind: "people", personIds: [] }))).toBe(false);
  });
  it("units assignment must cover the full quantity", () => {
    expect(isItemAssigned(item(100, { kind: "units", shares: { ana: 2 } }, 3))).toBe(false);
    expect(isItemAssigned(item(100, { kind: "units", shares: { ana: 2, bruno: 1 } }, 3))).toBe(true);
  });
  it("isFullyAssigned requires every item assigned", () => {
    const r = receipt([item(100, { kind: "everyone" }), item(50, { kind: "unassigned" })], 150);
    expect(isFullyAssigned(r)).toBe(false);
  });
});
