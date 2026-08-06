import { describe, it, expect } from "vitest";
import { summaryText, receiptSummaryText } from "./summary";
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

  it("says all square when balanced", () => {
    const even: Trip = { ...trip, receipts: [] };
    expect(summaryText(even)).toContain("All square! 🎉");
  });
});

describe("receiptSummaryText", () => {
  it("breaks one receipt down per person", () => {
    const text = receiptSummaryText(trip, trip.receipts[0]);
    expect(text).toContain("🧾 Lidl");
    expect(text).toMatch(/Pedro: .*5[.,]00/);
    expect(text).toMatch(/paid by Pedro/i);
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
  it("counts only the receipts that are counted, and says so", () => {
    const good = { ...trip.receipts[0] };
    const orphan = { ...trip.receipts[0], id: "r2", payments: [], printedTotal: 500 };
    const text = summaryText({ ...trip, receipts: [good, orphan] });
    expect(text).toMatch(/1 receipt ·/);
    expect(text).toMatch(/1 receipt not counted yet/i);
    expect(text).not.toMatch(/15[.,]00/); // never claims the excluded receipt's money
  });
});
