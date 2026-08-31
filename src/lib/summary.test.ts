import { describe, it, expect } from "vitest";
import { summaryText, receiptSummaryText } from "./summary";
import { APP_LINK, SHARE_FOOTER } from "./appLink";
import type { Trip } from "../types";

const trip: Trip = {
  id: "t1", name: "Algarve 2026", emoji: "🏖️", currency: "EUR",
  people: [
    { id: "pedro", name: "Pedro", color: "#ffd9a0" },
    { id: "ana", name: "Ana", color: "#ffc4b8" },
  ],
  groups: [],
  receipts: [{
    id: "r1", storeName: "Lidl", date: "2026-07-08",
    payments: [{ personId: "pedro", amount: 1000 }],
    items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "everyone" } }],
    printedTotal: 1000, status: "done",
  }],
  createdAt: "", schemaVersion: 1,
};

describe("summaryText", () => {
  it("contains the header, per-person lines and transfers", () => {
    const text = summaryText(trip);
    expect(text).toContain("🏖️ Algarve 2026");
    expect(text).toContain("1 receipt");
    expect(text).toMatch(/Pedro: .*5[.,]00.* \(paid .*10[.,]00.*\)/);
    expect(text).toMatch(/💸 Ana → Pedro .*5[.,]00/);
  });

  it("does not call a restaurant bill a grocery split", () => {
    // The header used to end "— grocery split" on every summary, including a dinner. A small
    // wrongness, but it lands in a group chat where four people read it.
    expect(summaryText(trip)).not.toContain("grocery");
  });

  it("ends with a link, so somebody reading it in a group chat can get the app", () => {
    const text = summaryText(trip);
    expect(text).toContain(SHARE_FOOTER);
    expect(text.trimEnd().endsWith(SHARE_FOOTER)).toBe(true);
  });

  it("keeps the link below the numbers, which is what the message is for", () => {
    // A friend opens this to find out what they owe. Anything above that answer is in their way,
    // and an advert above it is the reason somebody stops sharing these.
    const text = summaryText(trip);
    expect(text.indexOf(SHARE_FOOTER)).toBeGreaterThan(text.indexOf("💸"));
  });

  it("carries a source marker and nothing about who shared it", () => {
    // Measurable — did anybody arrive from a shared summary — without putting an identifier into
    // a URL that lands in a group chat.
    expect(APP_LINK).toContain("from=share");
    expect(APP_LINK).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("still reads sensibly when there is nothing to settle", () => {
    const even: Trip = {
      ...trip,
      receipts: [{
        ...trip.receipts[0],
        items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "people", personIds: ["pedro"] } }],
      }],
    };
    const text = summaryText(even);
    expect(text.indexOf(SHARE_FOOTER)).toBeGreaterThan(text.indexOf("All square"));
  });

  it("says all square when balanced and everything is counted", () => {
    const even: Trip = {
      ...trip,
      receipts: [{
        ...trip.receipts[0],
        items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "people", personIds: ["pedro"] } }],
      }],
    };
    expect(summaryText(even)).toContain("All square! 🎉");
  });

  it("says nothing to settle when no receipt could be counted", () => {
    // one receipt, excluded because its payer isn't in the trip
    const stuck: Trip = {
      ...trip,
      receipts: [{ ...trip.receipts[0], payments: [{ personId: "ghost", amount: 1000 }] }],
    };
    const text = summaryText(stuck);
    expect(text).toContain("Nothing to settle yet.");
    expect(text).not.toContain("All square! 🎉");
    expect(text).toContain("Not final");
  });

  it("qualifies all-square while a receipt is still excluded", () => {
    const partly: Trip = {
      ...trip,
      receipts: [
        // counted, and it balances by itself
        {
          ...trip.receipts[0],
          items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "people", personIds: ["pedro"] } }],
        },
        // excluded: no payer at all
        { ...trip.receipts[0], id: "r2", payments: [] },
      ],
    };
    const text = summaryText(partly);
    expect(text).toContain("All square so far");
    expect(text).not.toContain("All square! 🎉");
  });
});

describe("receiptSummaryText", () => {
  it("breaks one receipt down per person", () => {
    const text = receiptSummaryText(trip, trip.receipts[0]);
    expect(text).toContain("🧾 Lidl");
    expect(text).toMatch(/Pedro: .*5[.,]00/);
    expect(text).toMatch(/paid by Pedro/i);
  });

  it("drops the paid-by clause instead of naming an unknown payer", () => {
    const orphan = { ...trip.receipts[0], payments: [] };
    const text = receiptSummaryText(trip, orphan);
    expect(text).not.toMatch(/paid by/i);
    expect(text).toMatch(/10[.,]00/); // the total is still shown
  });
});

describe("receiptSummaryText with several payers", () => {
  it("lists each payer and what they put in", () => {
    const receipt = {
      ...trip.receipts[0],
      payments: [{ personId: "pedro", amount: 600 }, { personId: "ana", amount: 400 }],
      printedTotal: 1000,
    };
    const text = receiptSummaryText({ ...trip, receipts: [receipt] }, receipt);
    expect(text).toMatch(/paid by Pedro \(.*6[.,]00.*\) \+ Ana \(.*4[.,]00.*\)/);
  });

  it("keeps the simple wording for one payer", () => {
    expect(receiptSummaryText(trip, trip.receipts[0])).toMatch(/paid by Pedro$/m);
  });
});

describe("summary text with excluded receipts", () => {
  it("counts only the receipts that are counted, and says so before the per-person lines", () => {
    const good = { ...trip.receipts[0] };
    const orphan = { ...trip.receipts[0], id: "r2", payments: [], printedTotal: 500 };
    const text = summaryText({ ...trip, receipts: [good, orphan] });
    expect(text).toMatch(/1 receipt ·/);
    expect(text).toMatch(/Not final — 1 receipt isn't counted yet/i);
    expect(text).not.toMatch(/15[.,]00/); // never claims the excluded receipt's money
    // the caveat must land before the headline could be mistaken for "all done"
    expect(text.indexOf("Not final")).toBeGreaterThan(-1);
    expect(text.indexOf("Not final")).toBeLessThan(text.indexOf("Pedro:"));
  });
});

describe("what travels into a group chat", () => {
  /**
   * The split's icon is drawn in the app now, but this text is pasted into WhatsApp and read on a
   * phone that has never heard of Billy. An SVG cannot go in a message, so the summary keeps the
   * emoji — and that is also why the stored value stayed an emoji rather than becoming an icon
   * name. If someone ever "tidies" this to use the icon's name, the group chat starts saying
   * "beach Algarve 2026".
   */
  it("still carries the emoji, not an icon name and not markup", () => {
    const text = summaryText(trip);
    expect(text).toContain("🏖️");
    expect(text).not.toContain("<svg");
    expect(text).not.toContain("beach");
  });

  it("puts it first, where a skimming reader starts", () => {
    expect(summaryText(trip).startsWith("🏖️ ")).toBe(true);
  });
});
