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
      payments: [{ personId: "p1", amount: 699 }],
      items: [
        { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
        { id: "i2", name: "Juice", quantity: 3, lineTotal: 450, assignment: { kind: "unassigned" } },
      ],
      printedTotal: 699, status: "review",
    }],
    createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});

async function openReceipt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/algarve/i));
  await user.click(screen.getByText(/lidl/i));
}

describe("review screen", () => {
  it("shows items and a matching total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    expect(screen.getByDisplayValue("Fries")).toBeInTheDocument();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
  });

  it("warns when items do not sum to the printed total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    const price = screen.getByLabelText("Fries price");
    await user.clear(price);
    await user.type(price, "3.00");
    await user.tab(); // blur commits
    expect(screen.getByText(/off by/i)).toBeInTheDocument();
  });

  it("adds and removes items", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(screen.getAllByPlaceholderText(/item name/i)).toHaveLength(3);
    await user.click(screen.getAllByRole("button", { name: /remove item/i })[2]);
    expect(screen.getAllByPlaceholderText(/item name/i)).toHaveLength(2);
  });

  it("allows clearing the quantity and retyping", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    const qty = screen.getByLabelText("Juice quantity");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.tab();
    expect(screen.getByLabelText("Juice quantity")).toHaveValue("2");
  });

  it("moves to assigning on confirm", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /looks right/i }));
    expect(screen.getByText(/who got what/i)).toBeInTheDocument(); // AssignScreen placeholder heading (Task 9)
  });

  it("deletes the receipt after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /delete receipt/i }));
    expect(screen.queryByText(/lidl/i)).toBeNull(); // back on trip screen, receipt gone
    vi.mocked(window.confirm).mockRestore();
  });
});
