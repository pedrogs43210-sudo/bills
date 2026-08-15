import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Scanning a receipt with no split to put it in.
 *
 * Most of this file exists to hold one rule: **nothing is created unless the scan succeeded.** An
 * app that leaves an empty "Tasca do Bairro" on its own home screen every time the network drops
 * is an app people delete, so every way a scan can fail gets its own test and its own assertion
 * that the splits list is still empty afterwards. One representative failure would not do — the
 * bug this guards against is the kind that survives in the one branch nobody checked.
 */

const scanReceipt = vi.fn();

/**
 * The stub has to be installed *between* `resetModules` and the dynamic `import("../App")`. A spy
 * put on a module registry that `resetModules` is about to throw away applies to nothing, and the
 * tests would then pass for the wrong reason. `ScanError` is handed back from the same import for
 * the same reason: a class from a discarded registry fails `instanceof` inside the app.
 */
async function renderApp() {
  vi.resetModules();
  vi.doMock("../lib/image", () => ({ downscaleToBase64Jpeg: async () => "base64" }));
  vi.doMock("../lib/scan", async () => {
    const actual = await vi.importActual<typeof import("../lib/scan")>("../lib/scan");
    return { ...actual, scanReceipt, usingProxy: () => true, fetchQuota: async () => null };
  });
  const { setOnboarded } = await import("../lib/onboarding");
  setOnboarded(); // the intro owns the whole window, tab bar included
  const { ScanError } = await import("../lib/scan");
  const { default: App } = await import("../App");
  render(<App />);
  return { user: userEvent.setup(), ScanError };
}

const photo = () => new File(["x"], "receipt.jpg", { type: "image/jpeg" });

const goodScan = {
  storeName: "Tasca do Bairro",
  date: "2026-08-14",
  currency: "EUR",
  preDiscountTotal: null,
  paidTotal: 2400,
  items: [{ name: "Bacalhau", quantity: 1, lineTotal: 2400, kind: "item" as const }],
};

/** What is actually on the phone, which is the only thing that survives a reload. */
const storedTrips = () => {
  const raw = localStorage.getItem("bills.data.v1");
  return raw ? JSON.parse(raw).trips : [];
};

/** Tap Scan, then hand over a photo. */
async function scan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /scan/i }));
  await user.upload(screen.getByLabelText("Scan receipt"), photo());
}

beforeEach(() => {
  localStorage.clear();
  scanReceipt.mockReset();
});

describe("a quick scan that works", () => {
  it("creates exactly one split, named after the shop", async () => {
    scanReceipt.mockResolvedValue(goodScan);
    const { user } = await renderApp();
    await scan(user);

    expect(await screen.findByText(/who's in/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /done/i }));
    // Done lands on the receipt; back out of it to the split, and again to the list.
    await user.click(await screen.findByRole("button", { name: /^back$/i }));
    await user.click(await screen.findByRole("button", { name: /^back$/i }));

    expect(screen.getByRole("tablist")).toBeInTheDocument(); // the splits root
    expect(screen.getAllByText("Tasca do Bairro")).toHaveLength(1);
    expect(storedTrips()).toHaveLength(1);
  });

  it("makes the person holding the receipt the payer", async () => {
    scanReceipt.mockResolvedValue(goodScan);
    const { user } = await renderApp();
    await scan(user);

    // "You" is on the split before anybody else is asked for
    expect(await screen.findByText("You")).toBeInTheDocument();
    await waitFor(() => expect(storedTrips()).toHaveLength(1));
    const trip = storedTrips()[0];
    expect(trip.people.map((p: { name: string }) => p.name)).toEqual(["You"]);
    // and is the one recorded as having paid
    expect(trip.receipts[0].payments).toEqual([{ personId: trip.people[0].id, amount: 2400 }]);
  });

  it("keeps the tab bar off every screen the scan leads to", async () => {
    // Exactly one element per screen may publish --footer-h, and every screen past the roots has
    // a Footerbar of its own. A tab bar on top of one is two publishers and a covered button.
    scanReceipt.mockResolvedValue(goodScan);
    const { user } = await renderApp();
    expect(screen.getByRole("tablist")).toBeInTheDocument(); // the splits root has one

    await scan(user);
    expect(await screen.findByText(/who's in/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(await screen.findByDisplayValue("Bacalhau")).toBeInTheDocument(); // the review screen
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("a quick scan that does not work", () => {
  it.each([
    ["a network failure", "network", /couldn't reach the scanning service/i],
    ["an unreadable photo", "unparseable", /that photo couldn't be read/i],
    ["a refusal", "refused", /that photo couldn't be read/i],
    ["a busy day", "busy", /busy day/i],
  ])("creates nothing after %s", async (_label, reason, saying) => {
    const { user, ScanError } = await renderApp();
    scanReceipt.mockRejectedValue(new ScanError(reason as never, "nope"));
    await scan(user);

    expect(await screen.findByText(saying)).toBeInTheDocument();
    // nothing was written down…
    expect(storedTrips()).toHaveLength(0);
    // …and nothing is waiting on the list once they back out of the failure
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(screen.queryByText("Tasca do Bairro")).toBeNull();
    expect(storedTrips()).toHaveLength(0);
  });

  it("creates nothing when the scans have run out, and shows the paywall", async () => {
    const { user, ScanError } = await renderApp();
    scanReceipt.mockRejectedValue(new ScanError("out-of-scans", "none left"));
    await scan(user);

    expect(await screen.findByRole("heading", { name: /out of free scans/i })).toBeInTheDocument();
    expect(storedTrips()).toHaveLength(0);
    // There is no split to go back to, so no button may claim there is.
    expect(screen.queryByRole("button", { name: /back to split|back to trip|back to scanning/i })).toBeNull();
    // The way out still works, and lands on the list rather than on a split that never existed.
    await user.click(screen.getByRole("button", { name: /add a receipt by hand/i }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(storedTrips()).toHaveLength(0);
  });

  it("creates nothing when the wait is cancelled before anything comes back", async () => {
    let settle!: (r: unknown) => void;
    scanReceipt.mockImplementation(() => new Promise((res) => { settle = res; }));
    const { user } = await renderApp();
    await scan(user);

    await screen.findByText(/reading the receipt/i);
    await user.click(screen.getByRole("button", { name: /cancel and add by hand/i }));
    expect(storedTrips()).toHaveLength(0);

    // The scan was paid for, so a result that lands late is still kept — but it must not yank
    // somebody who walked away onto a screen they did not ask for.
    settle(goodScan);
    await waitFor(() => expect(storedTrips()).toHaveLength(1));
    expect(screen.queryByText(/who's in/i)).toBeNull();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
