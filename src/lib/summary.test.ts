import { describe, it, expect } from "vitest";
import { summaryText, receiptSummaryText } from "./summary";
import type { Trip } from "../types";

const trip: Trip = {
  id: "t1", name: "Algarve 2026", emoji: "🏖️", currency: "EUR",
  people: [
    { id: "pedro", name: "Pedro", color: "#ffd9a0" },
    { id: "ana", name: "Ana", color: "#ffc4b8" },
  ],
  receipts: [{
    id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "pedro",
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
