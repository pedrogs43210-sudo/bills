import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";

beforeEach(() => localStorage.clear());

describe("trip management", () => {
  it("creates a trip and lands on the trip screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve 2026");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    expect(screen.getByText(/algarve 2026/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add friend/i)).toBeInTheDocument();
  });

  it("adds friends and persists across remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Ana");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();

    unmount();
    render(<App />); // fresh mount reads localStorage
    expect(screen.getByText(/algarve/i)).toBeInTheDocument();
  });

  it("disables adding receipts until there is at least one person", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeEnabled();
  });

  it("renames a friend inline", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedor");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Rename Pedor" }));
    const input = screen.getByLabelText("Rename Pedor");
    await user.clear(input);
    await user.type(input, "Pedro{Enter}");
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.queryByText("Pedor")).toBeNull();
  });

  it("deletes a trip after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    await user.click(screen.getByRole("button", { name: /delete trip/i }));
    expect(screen.queryByText(/algarve/i)).toBeNull();
    expect(screen.getByText(/new trip/i)).toBeInTheDocument();
    vi.mocked(window.confirm).mockRestore();
  });

  it("flags a receipt that isn't counted, and lists every payer for one that is", async () => {
    const trip: Trip = {
      id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
      people: [
        { id: "p1", name: "Pedro", color: "#ffd9a0" },
        { id: "p2", name: "Ana", color: "#ffc4b8" },
      ],
      groups: [],
      receipts: [
        {
          // deliberately not "done" so the ✅ done text below can only come from r2
          id: "r1", storeName: "Lidl", date: "2026-07-08",
          payments: [{ personId: "p1", amount: 600 }, { personId: "p2", amount: 400 }],
          items: [], printedTotal: 1000, status: "assigning",
        },
        {
          id: "r2", storeName: "Pingo Doce", date: "2026-07-09",
          payments: [], items: [], printedTotal: 500, status: "done",
        },
      ],
      createdAt: "", schemaVersion: 2,
    };
    saveData({ schemaVersion: 2, trips: [trip] });
    render(<App />);
    await userEvent.setup().click(screen.getByText(/algarve/i));
    expect(screen.getByText(/paid by Pedro \+ Ana/i)).toBeInTheDocument();
    expect(screen.getByText(/not counted/i)).toBeInTheDocument();
    // r2 is stored as "done", but exclusion outranks the status badge
    expect(screen.queryByText(/✅ done/)).toBeNull();
  });
});
