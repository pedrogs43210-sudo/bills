import { describe, it, expect } from "vitest";
import { assignTargets, followsParent, peopleOf, sameMembers, sharedAssignment, sharedPeople, togglePersonFor } from "./assigning";
import type { Assignment, Item, Person, Receipt } from "../types";

const people: Person[] = [
  { id: "a", name: "Ana", color: "#FFD9A0" },
  { id: "b", name: "Bruno", color: "#FFC4B8" },
  { id: "c", name: "Cara", color: "#C9E8C9" },
];

function item(id: string, assignment: Assignment, extra: Partial<Item> = {}): Item {
  return { id, name: id, quantity: 1, lineTotal: 500, assignment, ...extra };
}

function receipt(items: Item[]): Receipt {
  return {
    id: "r",
    storeName: "Conad",
    date: "2026-08-11",
    payments: [{ personId: "a", amount: 1000 }],
    items,
    printedTotal: 1000,
    status: "assigning",
  };
}

describe("who an assignment names", () => {
  it("expands everyone against the trip, so a name can be untapped from it", () => {
    expect(peopleOf({ kind: "everyone" }, people)).toEqual(["a", "b", "c"]);
  });

  it("answers nobody for a split by units", () => {
    // Not because nobody has it: because a name tapped against a unit split replaces the whole
    // thing, and highlighting those people would invite a tap that discards their counts.
    expect(peopleOf({ kind: "units", shares: { a: 2, b: 1 } }, people)).toEqual([]);
  });

  it("answers nobody for an unassigned item", () => {
    expect(peopleOf({ kind: "unassigned" }, people)).toEqual([]);
  });
});

describe("what a group of items has in common", () => {
  it("finds the shared assignment when they all match, whatever the order", () => {
    const items = [item("1", { kind: "people", personIds: ["a", "b"] }), item("2", { kind: "people", personIds: ["b", "a"] })];
    expect(sharedAssignment(items)).not.toBeNull();
    expect(sharedPeople(items, people)).toEqual(["a", "b"]);
  });

  it("says nothing is shared when they disagree", () => {
    const items = [item("1", { kind: "people", personIds: ["a"] }), item("2", { kind: "everyone" })];
    expect(sharedAssignment(items)).toBeNull();
    expect(sharedPeople(items, people)).toEqual([]);
  });

  it("tells an unassigned item apart from a unit split, which both name nobody", () => {
    // Both answer "nobody" for the chips, but they are different assignments, so the panel has to
    // warn that tapping a name will overwrite one of them.
    const items = [item("1", { kind: "unassigned" }), item("2", { kind: "units", shares: { a: 1 } })];
    expect(sharedAssignment(items)).toBeNull();
  });

  it("has nothing to share about an empty selection", () => {
    expect(sharedAssignment([])).toBeNull();
    expect(sharedPeople([], people)).toEqual([]);
  });

  it("compares unit splits by their counts, not by object order", () => {
    const one = item("1", { kind: "units", shares: { a: 2, b: 1 } });
    const two = item("2", { kind: "units", shares: { b: 1, a: 2 } });
    expect(sharedAssignment([one, two])).not.toBeNull();
    const different = item("3", { kind: "units", shares: { a: 1, b: 2 } });
    expect(sharedAssignment([one, different])).toBeNull();
  });

  it("ignores units recorded as zero, which mean the same as absent", () => {
    const one = item("1", { kind: "units", shares: { a: 2 } });
    const two = item("2", { kind: "units", shares: { a: 2, b: 0 } });
    expect(sharedAssignment([one, two])).not.toBeNull();
  });
});

describe("tapping a name", () => {
  it("adds to what the items already share", () => {
    const items = [item("1", { kind: "people", personIds: ["a"] }), item("2", { kind: "people", personIds: ["a"] })];
    expect(togglePersonFor(items, "b", people)).toEqual({ kind: "people", personIds: ["a", "b"] });
  });

  it("removes a name that all of them have", () => {
    const items = [item("1", { kind: "people", personIds: ["a", "b"] }), item("2", { kind: "people", personIds: ["a", "b"] })];
    expect(togglePersonFor(items, "a", people)).toEqual({ kind: "people", personIds: ["b"] });
  });

  it("turns everyone into everyone-except-them", () => {
    const items = [item("1", { kind: "everyone" })];
    expect(togglePersonFor(items, "b", people)).toEqual({ kind: "people", personIds: ["a", "c"] });
  });

  it("unassigns when the last name comes off", () => {
    const items = [item("1", { kind: "people", personIds: ["a"] })];
    expect(togglePersonFor(items, "a", people)).toEqual({ kind: "unassigned" });
  });

  it("replaces a disagreement with the single name tapped", () => {
    // Nothing to add to, so the tap is the whole answer. The panel warns before this happens.
    const items = [item("1", { kind: "people", personIds: ["a"] }), item("2", { kind: "everyone" })];
    expect(togglePersonFor(items, "c", people)).toEqual({ kind: "people", personIds: ["c"] });
  });

  it("stays a list of people even when the list is everybody", () => {
    // "Everyone" means whoever is on the trip at the time, which is a different promise; it is
    // what the Everyone chip is for, and tapping names one at a time has never meant it.
    const items = [item("1", { kind: "people", personIds: ["a", "b"] })];
    expect(togglePersonFor(items, "c", people)).toEqual({ kind: "people", personIds: ["a", "b", "c"] });
  });
});

describe("a discount line following the item above it", () => {
  const parent = item("1", { kind: "people", personIds: ["a"] });

  it("follows while unassigned", () => {
    expect(followsParent(parent, item("2", { kind: "unassigned" }, { lineTotal: -100 }))).toBe(true);
  });

  it("follows while it still mirrors what the parent had", () => {
    expect(followsParent(parent, item("2", { kind: "people", personIds: ["a"] }, { lineTotal: -100 }))).toBe(true);
  });

  it("stops following once someone assigned it themselves", () => {
    expect(followsParent(parent, item("2", { kind: "people", personIds: ["b"] }, { lineTotal: -100 }))).toBe(false);
  });

  it("never follows when it is already inside the prices above", () => {
    const informational = item("2", { kind: "unassigned" }, { lineTotal: -100, informational: true });
    expect(followsParent(parent, informational)).toBe(false);
  });

  it("is not a discount at all when the amount is positive", () => {
    expect(followsParent(parent, item("2", { kind: "unassigned" }, { lineTotal: 100 }))).toBe(false);
  });

  it("is nothing to follow at the end of the receipt", () => {
    expect(followsParent(parent, undefined)).toBe(false);
  });
});

describe("which items one tap writes to", () => {
  it("takes a discount line along with its parent", () => {
    const r = receipt([
      item("1", { kind: "unassigned" }),
      item("2", { kind: "unassigned" }, { lineTotal: -100 }),
      item("3", { kind: "unassigned" }),
    ]);
    expect(assignTargets(r, ["1"])).toEqual(["1", "2"]);
  });

  it("does not list a picked discount twice", () => {
    const r = receipt([item("1", { kind: "unassigned" }), item("2", { kind: "unassigned" }, { lineTotal: -100 })]);
    expect(assignTargets(r, ["1", "2"])).toEqual(["1", "2"]);
  });

  it("works out every follower from the receipt as it stands, not one at a time", () => {
    // Both discounts mirror their own parent right now. Assigning the two parents in one change
    // has to bring both discounts, which is only knowable before anything is written.
    const r = receipt([
      item("1", { kind: "people", personIds: ["a"] }),
      item("2", { kind: "people", personIds: ["a"] }, { lineTotal: -50 }),
      item("3", { kind: "people", personIds: ["b"] }),
      item("4", { kind: "people", personIds: ["b"] }, { lineTotal: -50 }),
    ]);
    expect(assignTargets(r, ["1", "3"])).toEqual(["1", "2", "3", "4"]);
  });

  it("leaves a diverged discount alone", () => {
    const r = receipt([
      item("1", { kind: "people", personIds: ["a"] }),
      item("2", { kind: "people", personIds: ["c"] }, { lineTotal: -50 }),
    ]);
    expect(assignTargets(r, ["1"])).toEqual(["1"]);
  });

  it("keeps the receipt's own order, whatever order the items were picked in", () => {
    const r = receipt([item("1", { kind: "unassigned" }), item("2", { kind: "unassigned" }), item("3", { kind: "unassigned" })]);
    expect(assignTargets(r, ["3", "1"])).toEqual(["1", "3"]);
  });

  it("writes nothing for nothing picked", () => {
    expect(assignTargets(receipt([item("1", { kind: "unassigned" })]), [])).toEqual([]);
  });
});

describe("comparing sets of people", () => {
  it("ignores order and catches a difference in length", () => {
    expect(sameMembers(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameMembers(["a"], ["a", "b"])).toBe(false);
  });
});
