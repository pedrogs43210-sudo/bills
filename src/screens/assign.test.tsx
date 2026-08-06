import { describe, it, expect, beforeEach } from "vitest";
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
      { id: "p3", name: "Bruno", color: "#c9e8c9" },
    ],
    groups: [],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-07-08",
      payments: [{ personId: "p1", amount: 699 }],
      items: [
        { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
        { id: "i2", name: "Juice", quantity: 3, lineTotal: 450, assignment: { kind: "unassigned" } },
      ],
      printedTotal: 699, status: "assigning",
    }],
    createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});

async function openAssign(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/algarve/i));
  await user.click(screen.getByText(/lidl/i));
}

describe("assign screen", () => {
  it("shows unassigned count and disables done", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    expect(screen.getByText(/2 of 2 items unassigned/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
  });

  it("assigns an item to one person by tapping their chip", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    expect(screen.getByText(/1 of 2 items unassigned/i)).toBeInTheDocument();
  });

  it("toggles a second person into an equal split, and out again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    await user.click(screen.getByRole("button", { name: "Ana" }));
    expect(screen.getByText(/Pedro, Ana/)).toBeInTheDocument(); // summary line
    await user.click(screen.getByRole("button", { name: "Ana" }));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    expect(screen.getByText(/2 of 2 items unassigned/i)).toBeInTheDocument();
  });

  it("assigns to everyone", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: /everyone/i }));
    expect(screen.getByText(/👥 Everyone/)).toBeInTheDocument();
  });

  it("splits quantity lines by units", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Juice"));
    await user.click(screen.getByRole("button", { name: /split units/i }));
    // steppers: give Ana 2, Bruno 1
    await user.click(screen.getByRole("button", { name: "More units for Ana" }));
    await user.click(screen.getByRole("button", { name: "More units for Ana" }));
    await user.click(screen.getByRole("button", { name: "More units for Bruno" }));
    expect(screen.getByText(/3 of 3 units assigned/i)).toBeInTheDocument();
  });

  it("enables done when everything is assigned, then reaches settle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: /everyone/i }));
    await user.click(screen.getByText("Juice"));
    await user.click(screen.getByRole("button", { name: /everyone/i }));
    const done = screen.getByRole("button", { name: /done/i });
    expect(done).toBeEnabled();
    await user.click(done);
    expect(screen.getByText(/settle up/i)).toBeInTheDocument(); // SettleScreen placeholder heading
  });

  it("a discount line defaults to the assignment of the line above it", async () => {
    const t = seedTrip();
    t.receipts[0].items = [
      { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
      { id: "d1", name: "Desconto Fries", quantity: 1, lineTotal: -50, assignment: { kind: "unassigned" } },
    ];
    t.receipts[0].printedTotal = 199;
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    // both the item and its discount are now assigned
    expect(screen.getByText(/all assigned/i)).toBeInTheDocument();
  });

  it("clears the inherited discount when the item is un-assigned", async () => {
    const t = seedTrip();
    t.receipts[0].items = [
      { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
      { id: "d1", name: "Desconto Fries", quantity: 1, lineTotal: -50, assignment: { kind: "unassigned" } },
    ];
    t.receipts[0].printedTotal = 199;
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    expect(screen.getByText(/all assigned/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pedro" })); // un-assign; panel still open
    expect(screen.getByText(/2 of 2 items unassigned/i)).toBeInTheDocument();
  });

  it("moves the discount when the item is re-assigned", async () => {
    const t = seedTrip();
    t.receipts[0].items = [
      { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
      { id: "d1", name: "Desconto Fries", quantity: 1, lineTotal: -50, assignment: { kind: "unassigned" } },
    ];
    t.receipts[0].printedTotal = 199;
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    await user.click(screen.getByRole("button", { name: /everyone/i })); // re-assign to everyone
    expect(screen.getAllByText(/👥 Everyone/)).toHaveLength(2); // both summaries follow
  });
});
