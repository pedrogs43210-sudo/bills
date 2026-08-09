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
    // the chips stay open, so match the summary line rather than the chip
    expect(screen.getByText(/👥 Everyone/, { selector: "span" })).toBeInTheDocument();
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
    expect(screen.getAllByText(/👥 Everyone/, { selector: "span" })).toHaveLength(2); // both summaries follow
  });

  it("assigns an item to a whole group in one tap", async () => {
    const t = seedTrip();
    t.groups = [{ id: "g1", name: "Breakfast", personIds: ["p2", "p3"] }];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Breakfast" }));
    expect(screen.getByText("Ana, Bruno")).toBeInTheDocument();
  });

  it("highlights the group chip when the item matches it exactly", async () => {
    const t = seedTrip();
    t.groups = [{ id: "g1", name: "Breakfast", personIds: ["p2", "p3"] }];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    const chip = screen.getByRole("button", { name: "Breakfast" });
    expect(chip.className).not.toContain("selected");
    await user.click(chip);
    // the chips stay open after a group tap, so the group chip is still there to check
    expect(screen.getByRole("button", { name: "Breakfast" }).className).toContain("selected");
  });

  it("shows a group's members as highlighted names, so one can be untapped", async () => {
    const t = seedTrip();
    t.groups = [{ id: "g1", name: "Breakfast", personIds: ["p2", "p3"] }];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Breakfast" }));

    expect(screen.getByRole("button", { name: "Ana" }).className).toContain("selected");
    expect(screen.getByRole("button", { name: "Bruno" }).className).toContain("selected");
    expect(screen.getByRole("button", { name: "Pedro" }).className).not.toContain("selected");

    // untap Ana: the item is now Bruno's alone, and the group chip no longer matches
    await user.click(screen.getByRole("button", { name: "Ana" }));
    expect(screen.getByText("Bruno", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Breakfast" }).className).not.toContain("selected");
  });

  it("highlights every name after an Everyone tap, so one person can be dropped", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Everyone" }));

    for (const name of ["Pedro", "Ana", "Bruno"]) {
      expect(screen.getByRole("button", { name }).className).toContain("selected");
    }

    // drop Bruno — "everyone except Bruno", not "Bruno alone"
    await user.click(screen.getByRole("button", { name: "Bruno" }));
    expect(screen.getByText("Pedro, Ana", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Everyone" }).className).not.toContain("selected");
    expect(screen.getByRole("button", { name: "Bruno" }).className).not.toContain("selected");
  });

  it("keeps the discount line following when Everyone is narrowed to all-but-one", async () => {
    const t = seedTrip();
    t.receipts[0].items = [
      { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
      { id: "d1", name: "Desconto Fries", quantity: 1, lineTotal: -50, assignment: { kind: "unassigned" } },
    ];
    t.receipts[0].printedTotal = 199;
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Everyone" }));
    await user.click(screen.getByRole("button", { name: "Bruno" })); // everyone except Bruno

    // the discount must land on the same people, or it would be credited to the wrong pockets
    const items = JSON.parse(localStorage.getItem("bills.data.v1")!).trips[0].receipts[0].items;
    expect(items[0].assignment).toEqual({ kind: "people", personIds: ["p1", "p2"] });
    expect(items[1].assignment).toEqual({ kind: "people", personIds: ["p1", "p2"] });
  });

  it("hides a group with no members left", async () => {
    const t = seedTrip();
    t.groups = [{ id: "g1", name: "Ghosts", personIds: [] }];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    expect(screen.queryByRole("button", { name: /Ghosts/ })).toBeNull();
  });
});
