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
    groups: [],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-07-08",
      payments: [{ personId: "p1", amount: 1000 }],
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
  it("offers a way back to the trip, for the next shop", async () => {
    // Settling up is rarely the end of the holiday, and the topbar's arrow is in the far corner.
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    await user.click(screen.getByRole("button", { name: /back to the split/i }));
    // back on the trip screen, where receipts get added
    expect(screen.getByRole("heading", { name: /Algarve/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/scan receipt/i)).toBeInTheDocument();
  });

  it("shows per-person totals and transfers", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    // Pedro appears in both the transfer row and his own share row
    expect(screen.getAllByText("Pedro").length).toBeGreaterThan(0);
    // the transfer row is now names, discs and an arrow in separate elements, so match the row
    const row = screen.getByText("pays").parentElement!;
    expect(row.textContent).toContain("Ana");
    expect(row.textContent).toContain("Pedro");
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
    expect(screen.getByText(/aren't assigned to anyone/i)).toBeInTheDocument();
  });

  it("warns that a receipt isn't counted, naming the receipt and the real reason", async () => {
    const t = seedTrip();
    t.receipts.push({
      id: "r2", storeName: "Pingo Doce", date: "2026-07-09",
      payments: [{ personId: "p1", amount: -50 }], // the reachable cause: a negative total mirrored onto the lone payment
      items: [{ id: "i2", name: "stuff", quantity: 1, lineTotal: 500, assignment: { kind: "everyone" } }],
      printedTotal: 500, status: "done",
    });
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    expect(screen.getByText(/isn't counted yet/i)).toBeInTheDocument();
    expect(screen.getByText(/pingo doce/i)).toBeInTheDocument();
    expect(screen.getByText(/an amount is negative/i)).toBeInTheDocument();
  });
});
