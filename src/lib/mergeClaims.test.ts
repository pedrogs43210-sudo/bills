import { describe, it, expect } from "vitest";
import { mergeClaims, type Claim } from "./mergeClaims";
import type { Item } from "../types";

const item = (id: string): Item => ({
  id,
  name: id,
  quantity: 1,
  lineTotal: 1000,
  assignment: { kind: "unassigned" },
});

describe("merging what everybody said they had", () => {
  it("assigns an item to the one person who claimed it", () => {
    const claims: Claim[] = [{ personId: "maria", itemIds: ["wine"] }];
    const [wine] = mergeClaims([item("wine")], claims);
    expect(wine.assignment).toEqual({ kind: "people", personIds: ["maria"] });
  });

  it("shares an item two people both claimed, which is the right answer and not a conflict", () => {
    // The whole reason this needs no locking: both of them did drink it.
    const claims: Claim[] = [
      { personId: "maria", itemIds: ["wine"] },
      { personId: "joao", itemIds: ["wine"] },
    ];
    const [wine] = mergeClaims([item("wine")], claims);
    expect(wine.assignment).toEqual({ kind: "people", personIds: ["maria", "joao"] });
  });

  it("leaves an item nobody claimed exactly as the host had it", () => {
    // Not "everyone". Nobody ticking the bread means nobody has answered about the bread yet, and
    // silently dividing it between four people would be inventing an answer that looks like one.
    const bread: Item = { ...item("bread"), assignment: { kind: "everyone" } };
    expect(mergeClaims([bread], [{ personId: "maria", itemIds: ["wine"] }])[0].assignment).toEqual({
      kind: "everyone",
    });
  });

  it("does not resurrect an item id that is no longer on the receipt", () => {
    // The host deleted a misread line after the link went out. A claim against it must not
    // reintroduce it or throw.
    const claims: Claim[] = [{ personId: "maria", itemIds: ["deleted", "wine"] }];
    const merged = mergeClaims([item("wine")], claims);
    expect(merged).toHaveLength(1);
    expect(merged[0].assignment).toEqual({ kind: "people", personIds: ["maria"] });
  });

  it("keeps people in a stable order, so applying twice changes nothing", () => {
    const claims: Claim[] = [
      { personId: "joao", itemIds: ["wine"] },
      { personId: "maria", itemIds: ["wine"] },
    ];
    const once = mergeClaims([item("wine")], claims);
    const twice = mergeClaims(once, claims);
    expect(twice).toEqual(once);
  });

  it("ignores a claim from somebody with no items, rather than assigning them nothing", () => {
    const merged = mergeClaims([item("wine")], [{ personId: "maria", itemIds: [] }]);
    expect(merged[0].assignment).toEqual({ kind: "unassigned" });
  });

  it("counts one person only once, however many times they say it", () => {
    const claims: Claim[] = [
      { personId: "maria", itemIds: ["wine", "wine"] },
      { personId: "maria", itemIds: ["wine"] },
    ];
    expect(mergeClaims([item("wine")], claims)[0].assignment).toEqual({
      kind: "people",
      personIds: ["maria"],
    });
  });

  it("never modifies the items it was given", () => {
    // The host taps Apply, sees the result, and changes their mind. That only works if the input
    // survived the merge.
    const items = [item("wine")];
    mergeClaims(items, [{ personId: "maria", itemIds: ["wine"] }]);
    expect(items[0].assignment).toEqual({ kind: "unassigned" });
  });

  it("copes with rubbish without throwing", () => {
    expect(() => mergeClaims([item("a")], [{ personId: "", itemIds: ["a"] }])).not.toThrow();
    expect(mergeClaims([], [{ personId: "maria", itemIds: ["a"] }])).toEqual([]);
    expect(mergeClaims([item("a")], [])).toHaveLength(1);
  });
});
