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

  it("adopts the items' sum with one tap", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    const total = screen.getByLabelText("Receipt total");
    await user.clear(total);
    await user.type(total, "7.99");
    await user.tab();
    expect(screen.getByText(/off by/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /use .*6[.,]99/i }));
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Receipt total")).toHaveValue("6.99");
  });

  it("keeps a lone payer's amount equal to the total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    // one payer: no amount field is shown at all
    expect(screen.queryByLabelText("Payer 1 amount")).toBeNull();
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    // second payer appears and the total is split evenly
    expect(screen.getByLabelText("Payer 1 amount")).toHaveValue("3.50");
    expect(screen.getByLabelText("Payer 2 amount")).toHaveValue("3.49");
    expect(screen.getByText(/payers cover/i)).toBeInTheDocument();
  });

  it("blocks the confirm button until the payers cover the total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    const first = screen.getByLabelText("Payer 1 amount");
    await user.clear(first);
    await user.type(first, "1.00");
    await user.tab();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /split evenly/i }));
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("removing the second payer restores the implicit amount", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    await user.click(screen.getByRole("button", { name: /remove payer 2/i }));
    expect(screen.queryByLabelText("Payer 1 amount")).toBeNull();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("does not offer a payer twice", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    // trip has exactly two people, so both are now paying
    expect(screen.getByRole("button", { name: /add another payer/i })).toBeDisabled();
    expect(screen.getByLabelText("Payer 1")).toHaveDisplayValue("Pedro");
    expect(screen.getByLabelText("Payer 2")).toHaveDisplayValue("Ana");
  });

  it("makes an empty-payments receipt visibly unset rather than silently showing a name", async () => {
    const trip = seedTrip();
    trip.receipts[0].payments = [];
    saveData({ schemaVersion: 2, trips: [trip] });
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    // no payer is implied — the placeholder is shown, not the first person in the list
    expect(screen.getByLabelText("Payer 1")).toHaveDisplayValue("Nobody yet — pick a payer");
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Payer 1"), "p2");
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("does not trap the user when a stored single payment is stale", async () => {
    const t = seedTrip();
    t.receipts[0].payments = [{ personId: "p1", amount: 500 }]; // stale: total is 699
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    expect(screen.queryByLabelText("Payer 1 amount")).toBeNull(); // still implicit
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("refuses a negative receipt total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    const total = screen.getByLabelText("Receipt total");
    await user.clear(total);
    await user.type(total, "-1.50");
    await user.tab();
    expect(screen.getByText(/can't be negative/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
  });
});
