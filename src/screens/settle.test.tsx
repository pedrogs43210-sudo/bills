import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [
      { id: "p1", name: "Pedro", color: "#ffd9a0" },
      { id: "p2", name: "Ana", color: "#ffc4b8" },
    ],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "p1",
      items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "everyone" } }],
      printedTotal: 1000, status: "done",
    }],
    createdAt: "", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});

describe("settle screen", () => {
  it("shows per-person totals and transfers", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.getByText(/Ana → Pedro/)).toBeInTheDocument();
  });

  it("copies the summary when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    // Object.assign(navigator, { clipboard }) throws here: @testing-library/user-event's
    // setup() above installs its own getter-only navigator.clipboard stub (jsdom 29 +
    // user-event 14.6 combo), so we must override it with defineProperty AFTER setup()
    // runs, using a configurable descriptor of our own so the app's writeText call hits
    // our mock instead of user-event's internal clipboard stub.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    await user.click(screen.getByRole("button", { name: /share/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Algarve"));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("warns when a receipt still has unassigned items", async () => {
    const t = seedTrip();
    t.receipts[0].items[0].assignment = { kind: "unassigned" };
    t.receipts[0].status = "assigning";
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    expect(screen.getByText(/unassigned items/i)).toBeInTheDocument();
  });
});
