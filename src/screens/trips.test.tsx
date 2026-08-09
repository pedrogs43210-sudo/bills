import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";
import { setOnboarded } from "../lib/onboarding";

beforeEach(() => {
  localStorage.clear();
  // These tests start from an empty app, which is exactly when the first-run introduction
  // appears. Mark it seen so they exercise the screens they are about.
  setOnboarded();
});

describe("the trip list", () => {
  function tripNamed(id: string, name: string, createdAt: string): Trip {
    return {
      id, name, emoji: "🏖️", currency: "EUR",
      people: [], groups: [], receipts: [], createdAt, schemaVersion: 2,
    };
  }

  it("puts the newest trip first, whatever order it was stored in", () => {
    saveData({
      schemaVersion: 2,
      trips: [
        tripNamed("t1", "Oldest", "2026-01-01T00:00:00Z"),
        tripNamed("t3", "Newest", "2026-08-01T00:00:00Z"),
        tripNamed("t2", "Middle", "2026-05-01T00:00:00Z"),
      ],
    });
    render(<App />);
    const shown = screen.getAllByRole("button", { name: /Oldest|Middle|Newest/ }).map((b) => b.textContent);
    expect(shown[0]).toContain("Newest");
    expect(shown[1]).toContain("Middle");
    expect(shown[2]).toContain("Oldest");
  });

  it("falls back to the stored order when trips have no date", () => {
    saveData({
      schemaVersion: 2,
      trips: [tripNamed("t1", "First added", ""), tripNamed("t2", "Last added", "")],
    });
    render(<App />);
    const shown = screen.getAllByRole("button", { name: /added/ }).map((b) => b.textContent);
    expect(shown[0]).toContain("Last added"); // most recently added still comes first
  });

  it("shows the new-trip box above the trips", () => {
    saveData({ schemaVersion: 2, trips: [tripNamed("t1", "Algarve", "2026-01-01T00:00:00Z")] });
    render(<App />);
    const newTripBox = screen.getByPlaceholderText(/trip name/i);
    const tripRow = screen.getByRole("button", { name: /Algarve/ });
    // DOCUMENT_POSITION_FOLLOWING: the trip row comes after the box in the document
    expect(newTripBox.compareDocumentPosition(tripRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

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

/** Creates a trip named "Algarve" with Pedro and Ana already added, and renders it. */
async function tripWithTwoFriends(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
  await user.click(screen.getByRole("button", { name: /create trip/i }));
  for (const name of ["Pedro", "Ana"]) {
    await user.type(screen.getByPlaceholderText(/add friend/i), name);
    await user.click(screen.getByRole("button", { name: "Add" }));
  }
}

async function createGroup(user: ReturnType<typeof userEvent.setup>, name: string, memberNames: string[]) {
  await user.click(screen.getByRole("button", { name: /new group/i }));
  await user.type(screen.getByLabelText(/group name/i), name);
  for (const member of memberNames) {
    await user.click(screen.getByRole("button", { name: new RegExp(`add ${member} to group`, "i") }));
  }
  await user.click(screen.getByRole("button", { name: /save group/i }));
}

describe("groups on the trip screen", () => {
  it("creates a group", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    await createGroup(user, "Breakfast", ["Pedro"]);
    expect(screen.getByRole("button", { name: /Breakfast · 1/ })).toBeInTheDocument();
  });

  it("reopens and renames a group", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    await createGroup(user, "Breakfast", ["Pedro"]);

    await user.click(screen.getByRole("button", { name: /Breakfast · 1/ }));
    const nameInput = screen.getByLabelText(/group name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Brunch");
    await user.click(screen.getByRole("button", { name: /save group/i }));
    expect(screen.getByRole("button", { name: /Brunch · 1/ })).toBeInTheDocument();
  });

  it("changes members through the UI", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    await createGroup(user, "Breakfast", ["Pedro"]);

    await user.click(screen.getByRole("button", { name: /Breakfast · 1/ }));
    await user.click(screen.getByRole("button", { name: /add Ana to group/i }));
    await user.click(screen.getByRole("button", { name: /remove Pedro from group/i }));
    await user.click(screen.getByRole("button", { name: /save group/i }));
    expect(screen.getByRole("button", { name: /Breakfast · 1/ })).toBeInTheDocument();

    // reopen to confirm it's Ana, not Pedro, who ended up in the group
    await user.click(screen.getByRole("button", { name: /Breakfast · 1/ }));
    expect(screen.getByRole("button", { name: /remove Ana from group/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add Pedro to group/i })).toBeInTheDocument();
  });

  it("deletes a group with confirmation", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    await createGroup(user, "Breakfast", ["Pedro"]);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: /Breakfast · 1/ }));
    await user.click(screen.getByRole("button", { name: /delete group/i }));
    expect(screen.queryByRole("button", { name: /Breakfast/ })).toBeNull();
    vi.mocked(window.confirm).mockRestore();
  });

  it("hides groups until there are two friends", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.queryByRole("button", { name: /new group/i })).toBeNull();
    await user.type(screen.getByPlaceholderText(/add friend/i), "Ana");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: /new group/i })).toBeInTheDocument();
  });

  it("drops a friend removed mid-edit instead of writing their id back on save", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    // a third friend so the trip stays at 2+ people after Ana leaves —
    // otherwise the Groups card itself would hide and confound this case
    await user.type(screen.getByPlaceholderText(/add friend/i), "Bruno");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await createGroup(user, "Breakfast", ["Pedro", "Ana"]);
    expect(screen.getByRole("button", { name: /Breakfast · 2/ })).toBeInTheDocument();

    // reopen for editing, then remove Ana via the Friends card's × button
    // while the group form is still open (she has no money entries, so it's allowed)
    await user.click(screen.getByRole("button", { name: /Breakfast · 2/ }));
    await user.click(screen.getByRole("button", { name: "Remove Ana" }));
    await user.click(screen.getByRole("button", { name: /save group/i }));

    // the stale form must not resurrect Ana's deleted id into the saved group
    expect(screen.getByRole("button", { name: /Breakfast · 1/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Breakfast · 2/ })).toBeNull();
  });

  it("closes the form when its group is pruned away entirely", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    // a third friend so the trip stays at 2+ people after Bruno leaves —
    // otherwise the Groups card itself would hide and confound this case
    await user.type(screen.getByPlaceholderText(/add friend/i), "Bruno");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await createGroup(user, "Solo Bruno", ["Bruno"]);
    expect(screen.getByRole("button", { name: /Solo Bruno · 1/ })).toBeInTheDocument();

    // reopen it, then remove Bruno — the group has nobody left, so it's pruned away
    await user.click(screen.getByRole("button", { name: /Solo Bruno · 1/ }));
    await user.click(screen.getByRole("button", { name: "Remove Bruno" }));
    expect(screen.queryByRole("button", { name: /save group/i })).toBeNull();
    // the card itself is still there — Pedro and Ana keep the trip at 2 people
    expect(screen.getByRole("button", { name: /new group/i })).toBeInTheDocument();
  });

  it("rejects a duplicate group name", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);
    await createGroup(user, "Breakfast", ["Pedro"]);

    await user.click(screen.getByRole("button", { name: /new group/i }));
    await user.type(screen.getByLabelText(/group name/i), "breakfast"); // case-insensitive match
    await user.click(screen.getByRole("button", { name: /add Ana to group/i }));
    expect(screen.getByText(/there's already a group with that name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save group/i })).toBeDisabled();
  });

  it("refuses to name a group Everyone, which would clone the assign screen's own chip", async () => {
    const user = userEvent.setup();
    await tripWithTwoFriends(user);

    await user.click(screen.getByRole("button", { name: /new group/i }));
    await user.type(screen.getByLabelText(/group name/i), " everyone "); // padded and lower-case
    await user.click(screen.getByRole("button", { name: /add Ana to group/i }));
    expect(screen.getByText(/already the button that picks the whole trip/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save group/i })).toBeDisabled();

    // and it saves fine once the name is no longer the reserved one
    await user.clear(screen.getByLabelText(/group name/i));
    await user.type(screen.getByLabelText(/group name/i), "Everyone else");
    expect(screen.getByRole("button", { name: /save group/i })).toBeEnabled();
  });
});
