import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackChooser } from "./PackChooser";
import { PACKS, bestValuePack, displayPerScan, displayPrice, featuredPack } from "../lib/packs";
import * as purchase from "../lib/purchase";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("choosing a pack", () => {
  it("offers every pack, with a price and a per-scan price", () => {
    render(<PackChooser />);
    for (const pack of PACKS) {
      const row = screen.getByRole("radio", { name: new RegExp(`${pack.scans} scans`) });
      expect(row).toHaveTextContent(displayPrice(pack));
      expect(row).toHaveTextContent(`${displayPerScan(pack)} each`);
    }
  });

  it("pre-selects exactly one pack — the easy yes, not the biggest", () => {
    render(<PackChooser />);
    const chosen = screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toHaveTextContent(`${featuredPack().scans} scans`);
  });

  it('labels "Best value" on the pack that really is, and on no other', () => {
    render(<PackChooser />);
    const labels = screen.getAllByText(/best value/i);
    expect(labels).toHaveLength(1);
    expect(screen.getByRole("radio", { name: new RegExp(`${bestValuePack().scans} scans`) })).toHaveTextContent(
      /best value/i
    );
  });

  it("computes best value from the prices rather than trusting a flag", () => {
    // A written-down flag survives a price change and starts quietly pointing at the wrong row.
    const cheapestPerScan = PACKS.reduce((a, b) =>
      a.askingPrice / a.scans <= b.askingPrice / b.scans ? a : b
    );
    expect(bestValuePack().id).toBe(cheapestPerScan.id);
  });

  it("moves the selection and the button's price together", async () => {
    const user = userEvent.setup();
    render(<PackChooser />);
    const biggest = PACKS[PACKS.length - 1];

    await user.click(screen.getByRole("radio", { name: new RegExp(`${biggest.scans} scans`) }));

    expect(screen.getByRole("radio", { name: new RegExp(`${biggest.scans} scans`) })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    // The button must never offer to charge for something other than what is selected.
    expect(
      screen.getByRole("button", { name: new RegExp(`Buy ${biggest.scans} scans.*${biggest.askingPrice}`) })
    ).toBeInTheDocument();
  });

  it("promises that scans do not expire, and does not assume a holiday", () => {
    render(<PackChooser />);
    // "your next receipt", not "your next trip" — plenty of these will be restaurant bills.
    expect(screen.getByText(/never expire — they wait for your next receipt/i)).toBeInTheDocument();
  });
});

describe("when buying is not possible", () => {
  it("still shows the prices, and says where buying happens instead of pretending", () => {
    // The web build cannot open a payment sheet. Hiding the prices would remove useful
    // information; a live-looking button that does nothing would be worse than either.
    vi.spyOn(purchase, "canBuy").mockReturnValue(false);
    render(<PackChooser />);

    expect(screen.getByText(displayPrice(featuredPack()))).toBeInTheDocument();
    const buy = screen.getByRole("button", { name: /Buy \d+ scans/ });
    expect(buy).toBeDisabled();
    expect(screen.getByText(/aren't ready to buy yet/i)).toBeInTheDocument();
    // Billy is a phone app. Nothing may mention that a web build exists.
    expect(screen.queryByText(/web version|browser|desktop/i)).toBeNull();
  });
});

describe("when buying is possible", () => {
  it("charges for the pack that is selected, and says thank you", async () => {
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    const buy = vi.spyOn(purchase, "buyPack").mockResolvedValue({ kind: "bought", scansAdded: 20 });
    const onBought = vi.fn();
    const user = userEvent.setup();
    render(<PackChooser onBought={onBought} />);

    await user.click(screen.getByRole("button", { name: /Buy \d+ scans/ }));

    expect(buy).toHaveBeenCalledWith(expect.objectContaining({ id: featuredPack().id }));
    expect(onBought).toHaveBeenCalledWith(20);
    expect(await screen.findByText(/added 20 scans/i)).toBeInTheDocument();
  });

  it("says nothing was charged when someone backs out", async () => {
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockResolvedValue({ kind: "cancelled" });
    const user = userEvent.setup();
    render(<PackChooser />);

    await user.click(screen.getByRole("button", { name: /Buy \d+ scans/ }));

    // Backing out of a payment is not a failure and must not be reported like one.
    expect(await screen.findByText(/nothing was charged/i)).toBeInTheDocument();
  });

  it("recovers from a payment sheet that throws, rather than spinning forever", async () => {
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockRejectedValue(new Error("sheet exploded"));
    const user = userEvent.setup();
    render(<PackChooser />);

    await user.click(screen.getByRole("button", { name: /Buy \d+ scans/ }));

    expect(await screen.findByText(/nothing has been charged/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy \d+ scans/ })).not.toBeDisabled();
  });

  it("offers restore, quietly", async () => {
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    const restore = vi.spyOn(purchase, "restorePurchases").mockResolvedValue({ kind: "bought", scansAdded: 60 });
    const user = userEvent.setup();
    render(<PackChooser />);

    const button = screen.getByRole("button", { name: /restore/i });
    // Not competing with the thing most people came here to do.
    expect(button.className).toContain("btn-ghost");
    await user.click(button);
    expect(restore).toHaveBeenCalled();
  });
});

describe("the price the app shows", () => {
  it("formats money for the reader's locale rather than gluing a symbol on", () => {
    for (const pack of PACKS) {
      // Whatever the locale, the digits are there and there is a currency mark of some kind.
      expect(displayPrice(pack)).toMatch(new RegExp(String(pack.askingPrice).replace(".", "[.,]")));
      expect(displayPrice(pack)).toMatch(/[€$£]|EUR/);
    }
  });

  it("gets cheaper per scan as the pack gets bigger, or the ladder makes no sense", () => {
    const perScan = PACKS.map((p) => p.askingPrice / p.scans);
    for (let i = 1; i < perScan.length; i++) {
      expect(perScan[i]).toBeLessThan(perScan[i - 1]);
    }
  });

  it("has exactly one featured pack, and unique store ids", () => {
    expect(PACKS.filter((p) => p.featured)).toHaveLength(1);
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
  });
});
