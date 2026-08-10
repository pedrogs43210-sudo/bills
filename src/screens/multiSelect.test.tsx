import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { loadData, saveData } from "../lib/storage";
import type { Trip } from "../types";
import { runBackIntercept } from "../lib/backIntercept";

/**
 * Holding an item to pick several, then assigning the lot in one tap.
 *
 * The gesture is driven through pointer events with fake timers, because that is what actually
 * happens on a phone: a finger goes down, 500ms pass, and the click that follows the lift has to
 * be swallowed or holding an item would also open its panel.
 */

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [
      { id: "p1", name: "Pedro", color: "#ffd9a0" },
      { id: "p2", name: "Ana", color: "#ffc4b8" },
      { id: "p3", name: "Bruno", color: "#c9e8c9" },
    ],
    groups: [{ id: "g1", name: "Breakfast", personIds: ["p1", "p2"] }],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-08-11",
      payments: [{ personId: "p1", amount: 1000 }],
      items: [
        { id: "i1", name: "Fries", quantity: 1, lineTotal: 250, assignment: { kind: "unassigned" } },
        { id: "i2", name: "Juice", quantity: 1, lineTotal: 300, assignment: { kind: "unassigned" } },
        { id: "i3", name: "Bread", quantity: 1, lineTotal: 450, assignment: { kind: "unassigned" } },
      ],
      printedTotal: 1000, status: "assigning",
    }],
    createdAt: "2026-08-11T00:00:00Z", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});
afterEach(() => vi.useRealTimers());

/** The card button for an item, which is what a finger lands on. */
const row = (name: RegExp) => screen.getByRole("button", { name });

/** Text inside the bottom bar. The item's own price says €2.50 too, so the total needs scoping. */
function inBar(text: string): HTMLElement | null {
  const bar = document.querySelector(".footerbar");
  return bar ? [...bar.querySelectorAll("*")].find((el) => el.textContent?.trim() === text) as HTMLElement ?? null : null;
}

/** A finger held on a row for long enough, then lifted — including the click that follows. */
function hold(element: HTMLElement) {
  act(() => {
    fireEvent.pointerDown(element, { button: 0, clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(600);
  });
  act(() => {
    fireEvent.pointerUp(element);
    fireEvent.click(element);
  });
}

/** A tap: down, straight back up, click. */
function tap(element: HTMLElement) {
  act(() => {
    fireEvent.pointerDown(element, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(element);
    fireEvent.click(element);
  });
}

async function openAssign() {
  const user = userEvent.setup();
  await user.click(screen.getByText(/algarve/i));
  await user.click(screen.getByText(/lidl/i));
  return user;
}

/** Assignments as stored, which is the only place that matters for the money. */
const assignments = () => {
  const items = loadData().trips[0].receipts[0].items;
  return Object.fromEntries(items.map((i) => [i.name, i.assignment]));
};

describe("holding an item to pick several", () => {
  it("picks the held item and offers the same chips as a single one", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));

    expect(screen.getByRole("heading", { name: "1 selected" })).toBeInTheDocument();
    expect(inBar("€2.50")).not.toBeNull();
    // The people, the saved group and Everyone — the panel a single item shows.
    expect(screen.getByRole("button", { name: /Ana/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Breakfast/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Everyone/ })).toBeInTheDocument();
  });

  it("does not open the held item's own panel as well", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));

    // One panel, in the bar — not a second copy of the chips inside the card.
    expect(screen.getAllByRole("button", { name: /Ana/ })).toHaveLength(1);
  });

  it("adds more items with a tap, and counts the money as it goes", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    tap(row(/Bread/));

    expect(screen.getByRole("heading", { name: "2 selected" })).toBeInTheDocument();
    expect(inBar("€7.00")).not.toBeNull(); // 2.50 + 4.50
  });

  it("assigns every picked item to the name tapped, in one go", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    tap(row(/Bread/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: /Ana/ })));

    expect(assignments()).toMatchObject({
      Fries: { kind: "people", personIds: ["p2"] },
      Bread: { kind: "people", personIds: ["p2"] },
      Juice: { kind: "unassigned" }, // untouched
    });
  });

  it("assigns a whole selection to a saved group", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    tap(row(/Juice/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: /Breakfast/ })));

    expect(assignments().Fries).toEqual({ kind: "people", personIds: ["p1", "p2"] });
    expect(assignments().Juice).toEqual({ kind: "people", personIds: ["p1", "p2"] });
  });

  it("keeps adding names to the selection rather than replacing them", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    tap(row(/Bread/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: /Ana/ })));
    act(() => void fireEvent.click(screen.getByRole("button", { name: /Bruno/ })));

    expect(assignments().Fries).toEqual({ kind: "people", personIds: ["p2", "p3"] });
    expect(assignments().Bread).toEqual({ kind: "people", personIds: ["p2", "p3"] });
  });

  it("says so when the picked items are not assigned the same way", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    // Give one of them somebody, on its own.
    hold(row(/Fries/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: /Ana/ })));
    tap(row(/Bread/)); // Bread is still unassigned

    expect(screen.getByText(/aren't assigned the same way yet/i)).toBeInTheDocument();
  });

  it("selects every item at once when asked", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Select every item" })));
    act(() => void fireEvent.click(screen.getByRole("button", { name: /Everyone/ })));

    const all = assignments();
    expect(all.Fries).toEqual({ kind: "everyone" });
    expect(all.Juice).toEqual({ kind: "everyone" });
    expect(all.Bread).toEqual({ kind: "everyone" });
  });
});

describe("getting out of a selection", () => {
  it("leaves when the last picked item is tapped off", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    tap(row(/Fries/));

    expect(screen.queryByRole("heading", { name: /selected/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /who got what/i })).toBeInTheDocument();
  });

  it("leaves on cancel, changing nothing", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Cancel selection" })));

    expect(screen.getByRole("heading", { name: /who got what/i })).toBeInTheDocument();
    expect(assignments().Fries).toEqual({ kind: "unassigned" });
  });

  it("gives the hardware back button to the selection before the app navigates", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    // Exactly what App asks before it goes back a screen.
    expect(runBackIntercept()).toBe(true);
    await act(async () => {});
    expect(screen.getByRole("heading", { name: /who got what/i })).toBeInTheDocument();
    // and with nothing picked, back means what it always meant
    expect(runBackIntercept()).toBe(false);
  });

  it("still opens an item's own panel on a plain tap once the selection is gone", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    hold(row(/Fries/));
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Cancel selection" })));
    tap(row(/Juice/));

    expect(screen.getByRole("button", { name: /Ana/ })).toBeInTheDocument();
  });
});

describe("a press that is not a hold", () => {
  it("does not pick anything when the finger is dragged away", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    const card = row(/Fries/);
    act(() => {
      fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(card, { clientX: 10, clientY: 80 }); // a scroll
      vi.advanceTimersByTime(600);
      fireEvent.pointerUp(card);
    });

    expect(screen.queryByRole("heading", { name: /selected/ })).not.toBeInTheDocument();
  });

  it("does not pick anything when the finger lifts too soon", async () => {
    render(<App />);
    await openAssign();
    vi.useFakeTimers();

    const card = row(/Fries/);
    act(() => {
      fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
      vi.advanceTimersByTime(200);
      fireEvent.pointerUp(card);
      vi.advanceTimersByTime(600); // and the timer must not fire after the lift
    });

    expect(screen.queryByRole("heading", { name: /selected/ })).not.toBeInTheDocument();
  });

  it("tells you the gesture exists", async () => {
    render(<App />);
    await openAssign();
    expect(screen.getByText(/hold an item to pick several/i)).toBeInTheDocument();
  });
});
