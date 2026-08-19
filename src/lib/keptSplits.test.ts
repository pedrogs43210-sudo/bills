import { describe, it, expect, beforeEach } from "vitest";
import { keepSplit, keptSplit, keptSplits, forgetKeptSplit } from "./keptSplits";
import type { SharedSplitView } from "./sharedSplit";

function view(name: string, receipts = 1): SharedSplitView {
  return {
    split: {
      name,
      emoji: "🍕",
      currency: "EUR",
      people: [{ id: "p1", name: "Ana" }],
      receipts: Array.from({ length: receipts }, (_, i) => ({
        id: `r${i}`,
        storeName: "Conad",
        items: [{ id: `i${i}`, name: "Pane", lineTotal: 249 }],
      })),
    },
    taken: [],
  } as unknown as SharedSplitView;
}

beforeEach(() => localStorage.clear());

describe("the copy a guest keeps", () => {
  it("hands back what was put in", () => {
    keepSplit("ABCD2345WXYZ", view("Dinner"));
    expect(keptSplit("ABCD2345WXYZ")?.view.split.name).toBe("Dinner");
  });

  it("knows nothing about a code this phone never saw", () => {
    expect(keptSplit("ZZZZ9999ZZZZ")).toBeNull();
  });

  it("tracks the split while the link is alive, rather than freezing at the first read", () => {
    keepSplit("ABCD2345WXYZ", view("Dinner", 1));
    keepSplit("ABCD2345WXYZ", view("Dinner", 3));
    // One entry, not two, and it is the later one: the guest is left holding the last true state
    // of the split rather than whatever it looked like the minute they joined.
    expect(keptSplits()).toHaveLength(1);
    expect(keptSplit("ABCD2345WXYZ")?.view.split.receipts).toHaveLength(3);
  });

  it("survives the week — nothing here has an expiry", () => {
    keepSplit("ABCD2345WXYZ", view("Dinner"));
    const kept = keptSplit("ABCD2345WXYZ")!;
    // Written eight days ago, which is past the server's seven-day sweep. The server's copy is a
    // postbox and is gone by now; this one is the guest's own and is not the server's to expire.
    const old = { ...kept, keptAt: new Date(Date.now() - 8 * 864e5).toISOString() };
    localStorage.setItem("bills.share.kept", JSON.stringify({ ABCD2345WXYZ: old }));
    expect(keptSplit("ABCD2345WXYZ")?.view.split.name).toBe("Dinner");
  });

  it("puts the most recently seen split first", () => {
    keepSplit("AAAA2345WXYZ", view("Older"));
    localStorage.setItem(
      "bills.share.kept",
      JSON.stringify({
        AAAA2345WXYZ: { code: "AAAA2345WXYZ", view: view("Older"), keptAt: "2026-08-01T00:00:00Z" },
        BBBB2345WXYZ: { code: "BBBB2345WXYZ", view: view("Newer"), keptAt: "2026-08-18T00:00:00Z" },
      })
    );
    expect(keptSplits().map((k) => k.view.split.name)).toEqual(["Newer", "Older"]);
  });

  it("forgets one when asked, and leaves the others", () => {
    keepSplit("AAAA2345WXYZ", view("One"));
    keepSplit("BBBB2345WXYZ", view("Two"));
    forgetKeptSplit("AAAA2345WXYZ");
    expect(keptSplits().map((k) => k.view.split.name)).toEqual(["Two"]);
  });

  it("returns nothing rather than throwing on storage full of junk", () => {
    localStorage.setItem("bills.share.kept", "not json");
    expect(keptSplits()).toEqual([]);
    expect(keptSplit("ABCD2345WXYZ")).toBeNull();
  });
});
