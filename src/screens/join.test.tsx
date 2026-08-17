import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinScreen } from "./JoinScreen";

/**
 * The guest's side of a shared split.
 *
 * The person using this screen did not choose to install Billy — they were sent a link by somebody
 * who wanted to stop guessing what they ate. So the bar for confusion is lower here than anywhere
 * else in the app: they get one screen, and it has to explain itself.
 */

const split = {
  name: "Tasca do Bairro",
  emoji: "🧾",
  currency: "EUR",
  people: [
    { id: "ana", name: "Ana", color: "#ffd9a0" },
    { id: "rui", name: "Rui", color: "#ffc4b8" },
  ],
  receipts: [
    {
      id: "r1",
      storeName: "Tasca do Bairro",
      date: "2026-08-17",
      printedTotal: 4200,
      status: "done" as const,
      payments: [{ personId: "ana", amount: 4200 }],
      items: [
        { id: "bacalhau", name: "Bacalhau", quantity: 1, lineTotal: 1800, assignment: { kind: "unassigned" as const } },
        { id: "vinho", name: "Vinho verde", quantity: 1, lineTotal: 800, assignment: { kind: "unassigned" as const } },
      ],
    },
  ],
};

const readSharedSplit = vi.fn();
const joinSplit = vi.fn();
const putClaims = vi.fn();

vi.mock("../lib/sharedSplit", async () => {
  const actual = await vi.importActual<typeof import("../lib/sharedSplit")>("../lib/sharedSplit");
  return {
    ...actual,
    readSharedSplit: (...a: unknown[]) => readSharedSplit(...a),
    joinSplit: (...a: unknown[]) => joinSplit(...a),
    putClaims: (...a: unknown[]) => putClaims(...a),
    guestShareFor: () => null,
  };
});

beforeEach(() => {
  localStorage.clear();
  readSharedSplit.mockReset().mockResolvedValue({ split, taken: [], expiresAt: Date.now() + 1000 });
  joinSplit.mockReset().mockResolvedValue(undefined);
  putClaims.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("joining by typing a code", () => {
  it("will not look up something that cannot be a code", async () => {
    // Twelve characters from a known alphabet, so a typo is caught here rather than by a round trip
    // that comes back "not found" and reads like the split is gone.
    render(<JoinScreen go={() => {}} />);
    const find = screen.getByRole("button", { name: /find the split/i });
    expect(find).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/code/i), "TOOSHORT");
    expect(find).toBeDisabled();
    expect(readSharedSplit).not.toHaveBeenCalled();
  });

  it("looks it up once the code is the right shape", async () => {
    render(<JoinScreen go={() => {}} />);
    await userEvent.type(screen.getByLabelText(/code/i), "ABCD2345WXYZ");
    await userEvent.click(screen.getByRole("button", { name: /find the split/i }));
    await waitFor(() => expect(readSharedSplit).toHaveBeenCalledWith("ABCD2345WXYZ"));
  });

  it("says so plainly when the link has expired", async () => {
    const { ShareError } = await import("../lib/sharedSplit");
    readSharedSplit.mockRejectedValue(new ShareError("not-found", "That link has expired, or the split was taken back."));
    render(<JoinScreen code="ABCD2345WXYZ" go={() => {}} />);
    expect(await screen.findByText(/expired/i)).toBeTruthy();
  });
});

describe("saying which one you are", () => {
  it("offers the people on the split", async () => {
    render(<JoinScreen code="ABCD2345WXYZ" go={() => {}} />);
    expect(await screen.findByRole("button", { name: /ana/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /rui/i })).toBeTruthy();
  });

  it("shows a name somebody else already took, but will not let you pick it", async () => {
    // Knowing Ana is taken is more useful than discovering it after tapping — and it quietly tells
    // you your friends are already here.
    readSharedSplit.mockResolvedValue({ split, taken: ["ana"], expiresAt: Date.now() + 1000 });
    render(<JoinScreen code="ABCD2345WXYZ" go={() => {}} />);
    const ana = await screen.findByRole("button", { name: /ana/i });
    expect(ana).toBeDisabled();
    expect(screen.getByRole("button", { name: /rui/i })).not.toBeDisabled();
  });
});

describe("ticking what you had", () => {
  const pickRui = async () => {
    render(<JoinScreen code="ABCD2345WXYZ" go={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /rui/i }));
    await waitFor(() => expect(screen.getByText(/what did you have/i)).toBeTruthy());
  };

  /** The running total, not an item's price — both say €18.00 when only the bacalhau is ticked. */
  const total = () => screen.getByText(/^up to$/i).parentElement!.textContent ?? "";

  it("counts up as you tap, because that total is the reason to bother", async () => {
    await pickRui();
    expect(total()).toMatch(/0[.,]00/);
    await userEvent.click(screen.getByRole("button", { name: /bacalhau/i }));
    expect(total()).toMatch(/18[.,]00/);
    await userEvent.click(screen.getByRole("button", { name: /vinho/i }));
    expect(total()).toMatch(/26[.,]00/);
  });

  it("presents that total as a ceiling, because it can only ever come out lower", async () => {
    // A guest cannot see anybody else's picks, so a shared item is counted here at full price and
    // will be divided later. The number is always an overestimate — always in the alarming
    // direction — so it must not read as a bill.
    await pickRui();
    expect(screen.getByText(/^up to$/i)).toBeTruthy();
    expect(screen.queryByText(/yours so far/i)).toBeNull();
  });

  it("explains why it will be less, but only once there is something to explain", async () => {
    await pickRui();
    expect(screen.queryByText(/those get divided/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /vinho/i }));
    expect(screen.getByText(/those get divided/i)).toBeTruthy();
  });

  it("lets you change your mind", async () => {
    await pickRui();
    const item = screen.getByRole("button", { name: /bacalhau/i });
    await userEvent.click(item);
    expect(item.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(item);
    expect(item.getAttribute("aria-pressed")).toBe("false");
  });

  it("sends exactly what was ticked", async () => {
    await pickRui();
    await userEvent.click(screen.getByRole("button", { name: /vinho/i }));
    await userEvent.click(screen.getByRole("button", { name: /send my picks/i }));
    await waitFor(() => expect(putClaims).toHaveBeenCalledWith("ABCD2345WXYZ", ["vinho"]));
  });

  it("can send nothing, because none of it being yours is a real answer", async () => {
    await pickRui();
    await userEvent.click(screen.getByRole("button", { name: /send my picks/i }));
    await waitFor(() => expect(putClaims).toHaveBeenCalledWith("ABCD2345WXYZ", []));
  });
});
