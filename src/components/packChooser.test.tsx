import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackChooser } from "./PackChooser";
import { PACKS, bestValuePack, displayPerScan, displayPrice, featuredPack, bonusScans } from "../lib/packs";
import * as purchase from "../lib/purchase";
import * as scan from "../lib/scan";

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
      // "a receipt", not "each" — the unit price is only persuasive when the unit is the thing the
      // reader came to do, rather than an abstract count of scans.
      expect(row).toHaveTextContent(`${displayPerScan(pack)} a receipt`);
    }
  });

  it("shows the first-pack bonus as arithmetic rather than as a claim", () => {
    render(<PackChooser firstPack />);
    for (const pack of PACKS) {
      const row = screen.getByRole("radio", { name: new RegExp(`${pack.scans + bonusScans(pack)} scans`) });
      // Both numbers, so the offer is visible as a change rather than asserted as a kindness.
      expect(row).toHaveTextContent(String(pack.scans));
      expect(row).toHaveTextContent(`+${bonusScans(pack)} free on your first pack`);
    }
  });

  it("prices each scan by what you actually receive, so the row multiplies out", () => {
    render(<PackChooser firstPack />);
    const pack = featuredPack();
    const row = screen.getByRole("radio", {
      name: new RegExp(`${pack.scans + bonusScans(pack)} scans`),
    });
    // A reader who divides €2.99 by the 25 in front of them must land on the figure beside it.
    expect(row).toHaveTextContent(`${displayPerScan(pack, true)} a receipt`);
    expect(row).not.toHaveTextContent(`${displayPerScan(pack, false)} a receipt`);
  });

  it("says nothing about a bonus once somebody has bought before", () => {
    render(<PackChooser firstPack={false} />);
    expect(screen.queryByText(/free on your first pack/i)).toBeNull();
    // And the button offers the plain pack, not the one the server would refuse to honour.
    expect(
      screen.getByRole("button", { name: new RegExp(`Get ${featuredPack().scans} scans`) })
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: new RegExp(`Get ${biggest.scans} scans.*${biggest.askingPrice}`) })
    ).toBeInTheDocument();
  });

  it("promises that scans do not expire, and does not assume a holiday", () => {
    render(<PackChooser />);
    // "your next receipt", not "your next trip" — plenty of these will be restaurant bills.
    expect(screen.getByText(/never expire. No subscription/i)).toBeInTheDocument();
  });
});

describe("when buying is not possible", () => {
  it("still shows the prices, and says where buying happens instead of pretending", () => {
    // The web build cannot open a payment sheet. Hiding the prices would remove useful
    // information; a live-looking button that does nothing would be worse than either.
    vi.spyOn(purchase, "canBuy").mockReturnValue(false);
    render(<PackChooser />);

    expect(screen.getByText(displayPrice(featuredPack()))).toBeInTheDocument();
    const buy = screen.getByRole("button", { name: /Get \d+ scans/ });
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
    // The scans are not real until the server agrees, so the screen waits for the balance to rise
    // before thanking anybody — see lib/awaitCredits.ts. Without a server that agrees, the wait
    // times out into the "on their way" message, which is correct behaviour and not what this test
    // is about.
    vi.spyOn(scan, "lastKnownQuota").mockReturnValue({ used: 0, left: 0, limit: 3, credits: 0 });
    vi.spyOn(scan, "fetchQuota").mockResolvedValue({ used: 0, left: 20, limit: 3, credits: 20 });
    const onBought = vi.fn();
    const user = userEvent.setup();
    render(<PackChooser onBought={onBought} />);

    await user.click(screen.getByRole("button", { name: /Get \d+ scans/ }));

    expect(buy).toHaveBeenCalledWith(expect.objectContaining({ id: featuredPack().id }));
    expect(onBought).toHaveBeenCalledWith(20);
    expect(await screen.findByText(/added 20 scans/i)).toBeInTheDocument();
  });

  it("never calls a slow webhook a failed payment", async () => {
    /* The state this exists for. Google has taken the money and the scans have not appeared yet,
       because RevenueCat's webhook is retrying. The screen must say the scans are coming — never
       that anything went wrong, because nothing has: telling somebody their payment failed when the
       money has gone is the worst thing this component can do. */
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockResolvedValue({ kind: "bought", scansAdded: 20 });
    vi.spyOn(scan, "lastKnownQuota").mockReturnValue({ used: 0, left: 0, limit: 3, credits: 0 });
    // A server that never agrees, so the wait runs out.
    vi.spyOn(scan, "fetchQuota").mockResolvedValue({ used: 0, left: 0, limit: 3, credits: 0 });

    const user = userEvent.setup();
    render(<PackChooser />);
    await user.click(screen.getByRole("button", { name: /Get \d+ scans/ }));

    // While waiting, it says the payment landed rather than leaving a silent spinner.
    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();

    const slow = await screen.findByText(/on their way/i, {}, { timeout: 30_000 });
    expect(slow).toBeInTheDocument();
    // Says where to write, and never uses the language of failure.
    expect(slow.textContent).toMatch(/hello@splitwithbilly.com/);
    expect(slow.textContent).not.toMatch(/fail|error|wrong|declin/i);
  }, 40_000);

  it("says nothing was charged when someone backs out", async () => {
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockResolvedValue({ kind: "cancelled" });
    const user = userEvent.setup();
    render(<PackChooser />);

    await user.click(screen.getByRole("button", { name: /Get \d+ scans/ }));

    // Backing out of a payment is not a failure and must not be reported like one.
    expect(await screen.findByText(/nothing was charged/i)).toBeInTheDocument();
  });

  it("recovers from a payment sheet that throws, rather than spinning forever", async () => {
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockRejectedValue(new Error("sheet exploded"));
    const user = userEvent.setup();
    render(<PackChooser />);

    await user.click(screen.getByRole("button", { name: /Get \d+ scans/ }));

    expect(await screen.findByText(/nothing has been charged/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get \d+ scans/ })).not.toBeDisabled();
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
