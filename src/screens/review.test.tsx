import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";
import { leaveScanScreen } from "../test/leaveScanScreen";

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
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.getByDisplayValue("Fries")).toBeInTheDocument();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
  });

  it("warns when items do not sum to the printed total", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
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
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(screen.getAllByPlaceholderText(/item name/i)).toHaveLength(3);
    await user.click(screen.getAllByRole("button", { name: /remove item/i })[2]);
    expect(screen.getAllByPlaceholderText(/item name/i)).toHaveLength(2);
  });

  it("allows clearing the quantity and retyping", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
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
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /looks right/i }));
    expect(screen.getByText(/who got what/i)).toBeInTheDocument(); // AssignScreen placeholder heading (Task 9)
  });

  it("deletes the receipt after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /delete receipt/i }));
    expect(screen.queryByText(/lidl/i)).toBeNull(); // back on trip screen, receipt gone
    vi.mocked(window.confirm).mockRestore();
  });

  it("adopts the items' sum with one tap", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
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
  leaveScanScreen();
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
  leaveScanScreen();
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
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    await user.click(screen.getByRole("button", { name: /remove payer 2/i }));
    expect(screen.queryByLabelText("Payer 1 amount")).toBeNull();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("does not offer a payer twice", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
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
  leaveScanScreen();
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
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.queryByLabelText("Payer 1 amount")).toBeNull(); // still implicit
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("refuses a negative receipt total", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    const total = screen.getByLabelText("Receipt total");
    await user.clear(total);
    await user.type(total, "-1.50");
    await user.tab();
    expect(screen.getByText(/can't be negative/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
  });

  it("refuses a negative payer amount", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    const first = screen.getByLabelText("Payer 1 amount");
    await user.clear(first);
    await user.type(first, "-1.00");
    await user.tab();
    expect(screen.getByText(/payer's amount can't be negative/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
  });

  it("words a lone negative payer as needing a re-pick, not an amount fix", async () => {
    const t = seedTrip();
    t.receipts[0].payments = [{ personId: "p1", amount: -50 }]; // total stays positive at 699
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.getByText(/re-pick who paid/i)).toBeInTheDocument();
    expect(screen.queryByText(/payer's amount can't be negative/i)).toBeNull();
  });

  it("flags a payer who is no longer in the trip instead of showing someone else", async () => {
    const t = seedTrip();
    t.receipts[0].payments = [{ personId: "ghost", amount: 699 }];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.getByText(/isn't in this split/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
    expect((screen.getByLabelText("Payer 1") as HTMLSelectElement).value).toBe("");
  });

  it("allows a fully discounted receipt totalling zero", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    const total = screen.getByLabelText("Receipt total");
    await user.clear(total);
    await user.type(total, "0.00");
    await user.tab();
    expect(screen.queryByText(/can't be negative/i)).toBeNull();
    expect(screen.getByRole("button", { name: /looks right/i })).toBeEnabled();
  });

  it("names Split evenly as the way to fix short coverage", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    const first = screen.getByLabelText("Payer 1 amount");
    await user.clear(first);
    await user.type(first, "1.00");
    await user.tab();
    expect(screen.getByText(/tap split evenly/i)).toBeInTheDocument();
  });

  it("keeps a row's amount when its person changes", async () => {
    // A third person is required here: seedTrip's other person (Ana) is already Payer 2,
    // and the no-duplicate-payer invariant correctly keeps her out of Payer 1's options —
    // so switching Payer 1 needs someone not already paying.
    const t = seedTrip();
    t.people.push({ id: "p3", name: "Bea", color: "#c9e8c9" });
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    const first = screen.getByLabelText("Payer 1 amount");
    await user.clear(first);
    await user.type(first, "5.00");
    await user.tab();
    await user.selectOptions(screen.getByLabelText("Payer 1"), "p3");
    expect(screen.getByLabelText("Payer 1 amount")).toHaveValue("5.00");
  });

  it("hides Add another payer while no one is picked yet", async () => {
    const t = seedTrip();
    t.receipts[0].payments = [];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.queryByRole("button", { name: /add another payer/i })).toBeNull();
  });

  it("hides the one-tap fix when the items sum is negative", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    const price = screen.getByLabelText("Fries price");
    await user.clear(price);
    await user.type(price, "-9.00");
    await user.tab();
    expect(screen.getByText(/off by/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^use /i })).toBeNull();
    // no button precedes it, so "Or" (an alternative to something absent) would dangle
    expect(screen.getByText(/Fix a line — otherwise/)).toBeInTheDocument();
    expect(screen.queryByText(/Or fix a line/)).toBeNull();
  });

  it("announces coverage changes to screen readers", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add another payer/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/payers cover/i);
  });

  it("never shows a reassuring checkmark while the confirm button is blocked", async () => {
    // amounts add up (arithmeticOk) but one is negative, so covered is still false —
    // the banner must not celebrate an arithmetic pass that isn't a real pass.
    const t = seedTrip();
    t.receipts[0].printedTotal = 1000;
    t.receipts[0].payments = [{ personId: "p1", amount: 1200 }, { personId: "p2", amount: -200 }];
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.getByRole("button", { name: /looks right/i })).toBeDisabled();
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent("✓");
    expect(status).not.toHaveClass("banner-good");
  });
});

describe("a receipt typed in by hand", () => {
  /** Start a blank hand-made receipt on a trip that has people. */
  async function addByHand(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /add items by hand/i }));
  }

  async function typePrice(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
    await user.tab(); // blur commits
  }

  it("adds the items up into the total by itself", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await addByHand(user);

    await user.click(screen.getByRole("button", { name: /add item/i }));
    await typePrice(user, "price", "4.00");
    expect(screen.getByLabelText("Receipt total")).toHaveValue("4.00");

    await user.click(screen.getByRole("button", { name: /add item/i }));
    const prices = screen.getAllByLabelText("price");
    await user.clear(prices[1]);
    await user.type(prices[1], "2.50");
    await user.tab();
    expect(screen.getByLabelText("Receipt total")).toHaveValue("6.50");
  });

  it("keeps the payer's amount in step with the automatic total", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await addByHand(user);
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await typePrice(user, "price", "4.00");

    const receipts = JSON.parse(localStorage.getItem("bills.data.v1")!).trips[0].receipts;
    const stored = receipts[receipts.length - 1]; // the hand-made one, appended
    expect(stored.printedTotal).toBe(400);
    expect(stored.payments).toEqual([{ personId: "p1", amount: 400 }]);
  });

  it("stops adding up once the total is typed over, and resumes on Use", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await addByHand(user);
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await typePrice(user, "price", "4.00");

    // an explicit total wins, even when the items disagree
    await typePrice(user, "Receipt total", "10.00");
    expect(screen.getByLabelText("Receipt total")).toHaveValue("10.00");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await typePrice(user, "Receipt total", "10.00"); // still mine after another item
    expect(screen.getByLabelText("Receipt total")).toHaveValue("10.00");

    // tapping the suggestion hands control back to the items
    await user.click(screen.getByRole("button", { name: /^Use /i }));
    expect(screen.getByLabelText("Receipt total")).toHaveValue("4.00");
    const prices = screen.getAllByLabelText("price");
    await user.clear(prices[1]);
    await user.type(prices[1], "1.00");
    await user.tab();
    expect(screen.getByLabelText("Receipt total")).toHaveValue("5.00");
  });

  it("leaves a scanned receipt's printed total alone when an item is corrected", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByText(/lidl/i)); // seeded, came from a scan
    await typePrice(user, "Fries price", "3.00");
    // the paper said 6.99 — correcting a misread line must not rewrite it
    expect(screen.getByLabelText("Receipt total")).toHaveValue("6.99");
  });
});

describe("the discount-convention band", () => {
  /** A Continente-shaped receipt: the 4.00 price already has the 0.50 off. */
  function continenteTrip(): Trip {
    const t = seedTrip();
    t.receipts[0] = {
      ...t.receipts[0],
      payments: [{ personId: "p1", amount: 400 }],
      items: [
        { id: "i1", name: "Sumo", quantity: 1, lineTotal: 400, assignment: { kind: "unassigned" } },
        { id: "d1", name: "Desconto", quantity: 1, lineTotal: -50, assignment: { kind: "unassigned" },
          discountLine: true, informational: true },
      ],
      printedTotal: 400,
      discountConvention: "discounts-included",
    };
    return t;
  }

  const storedItems = () => JSON.parse(localStorage.getItem("bills.data.v1")!).trips[0].receipts[0].items;

  it("says in plain words that it left the discount out", async () => {
    saveData({ schemaVersion: 2, trips: [continenteTrip()] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.getByText(/prices already include the discount/i)).toBeInTheDocument();
    expect(screen.getByText(/left that line out/i)).toBeInTheDocument();
    // and the arithmetic agrees, so no spurious warning
    expect(screen.getByText(/Matches the receipt total/i)).toBeInTheDocument();
  });

  it("counts the discount when overruled, and the money follows immediately", async () => {
    saveData({ schemaVersion: 2, trips: [continenteTrip()] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /count them/i }));

    // the line now counts: 4.00 - 0.50 is 3.50 against a 4.00 total
    expect(screen.getByText(/off by/i)).toBeInTheDocument();
    expect(storedItems()[1]).not.toHaveProperty("informational");
    expect(screen.getByText(/separate line on the receipt/i)).toBeInTheDocument();
  });

  it("can be switched back again", async () => {
    saveData({ schemaVersion: 2, trips: [continenteTrip()] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /count them/i }));
    await user.click(screen.getByRole("button", { name: /already included/i }));
    expect(storedItems()[1].informational).toBe(true);
    expect(screen.getByText(/Matches the receipt total/i)).toBeInTheDocument();
  });

  it("admits it when the numbers fit neither convention", async () => {
    const t = continenteTrip();
    t.receipts[0] = { ...t.receipts[0], printedTotal: 700, discountConvention: "mismatch",
      items: t.receipts[0].items.map((i) => ({ ...i, informational: undefined })) };
    saveData({ schemaVersion: 2, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user);
    expect(screen.getByText(/couldn't tell whether/i)).toBeInTheDocument();
    expect(screen.getByText(/It's counted/i)).toBeInTheDocument();
  });

  it("says nothing at all on a receipt with no discount lines", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await openReceipt(user); // the plain seeded receipt
    expect(screen.queryByText(/discount/i)).toBeNull();
  });
});
