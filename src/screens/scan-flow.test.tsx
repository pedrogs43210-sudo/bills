import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData, saveApiKey } from "../lib/storage";
import { ScanError } from "../lib/scan";
import type { Trip } from "../types";

vi.mock("../lib/image", () => ({
  downscaleToBase64Jpeg: vi.fn().mockResolvedValue("fakebase64"),
}));
vi.mock("../lib/scan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/scan")>();
  return { ...actual, scanReceipt: vi.fn() };
});

import { scanReceipt } from "../lib/scan";
import { leaveScanScreen } from "../test/leaveScanScreen";
import { scanPhoto } from "../test/scanPhoto";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [{ id: "p1", name: "Pedro", color: "#ffd9a0" }],
    groups: [],
    receipts: [], createdAt: "", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
  saveApiKey("sk-ant-test");
  vi.mocked(scanReceipt).mockReset();
});

const photo = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

describe("discount conventions from a scan", () => {
  const scanned = (items: { name: string; lineTotal: number; kind: "item" | "discount" }[], paidTotal: number) => ({
    storeName: "Loja", date: "2026-08-08", currency: "EUR", preDiscountTotal: null, paidTotal,
    items: items.map((i) => ({ quantity: 1, ...i })),
  });
  const storedItems = () => JSON.parse(localStorage.getItem("bills.data.v1")!).trips[0].receipts[0].items;
  const storedReceipt = () => JSON.parse(localStorage.getItem("bills.data.v1")!).trips[0].receipts[0];

  async function scan() {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByText(/algarve/i));
    await scanPhoto(user, photo);
    await screen.findByDisplayValue("Sumo laranja");
  }

  it("leaves a Continente discount out of the maths, because the price already has it", async () => {
    // 4.00 already reduced from 4.50; the bracket is information only
    vi.mocked(scanReceipt).mockResolvedValue(
      scanned([
        { name: "Sumo laranja", lineTotal: 400, kind: "item" },
        { name: "Desconto", lineTotal: -50, kind: "discount" },
      ], 400)
    );
    await scan();
    expect(storedReceipt().discountConvention).toBe("discounts-included");
    expect(storedItems()[1].informational).toBe(true);
    // the items now agree with the total, instead of being 50 cents short
    expect(await screen.findByText(/matches the receipt total/i)).toBeInTheDocument();
  });

  it("counts a Pingo Doce discount, because it is a real separate line", async () => {
    // 2.49 + 4.50 = 6.99 printed, 0.50 off, 6.49 paid
    vi.mocked(scanReceipt).mockResolvedValue(
      scanned([
        { name: "Sumo laranja", lineTotal: 450, kind: "item" },
        { name: "Batatas fritas", lineTotal: 249, kind: "item" },
        { name: "Desconto", lineTotal: -50, kind: "discount" },
      ], 649)
    );
    await scan();
    expect(storedReceipt().discountConvention).toBe("discounts-separate");
    expect(storedItems()[2]).not.toHaveProperty("informational");
    expect(await screen.findByText(/matches the receipt total/i)).toBeInTheDocument();
  });

  it("changes nothing when the numbers do not add up either way", async () => {
    vi.mocked(scanReceipt).mockResolvedValue(
      scanned([
        { name: "Sumo laranja", lineTotal: 807, kind: "item" },
        { name: "Desconto", lineTotal: -50, kind: "discount" },
      ], 700)
    );
    await scan();
    expect(storedReceipt().discountConvention).toBe("mismatch");
    // counted, as before — the totals are already being questioned on screen
    expect(storedItems()[1]).not.toHaveProperty("informational");
    expect(await screen.findByText(/off by/i)).toBeInTheDocument();
  });
});

describe("scan flow", () => {
  it("scans a photo into a review-ready receipt", async () => {
    vi.mocked(scanReceipt).mockResolvedValue({
      storeName: "Lidl", date: "2026-07-08", currency: "EUR",
      items: [{ name: "Sumo laranja", quantity: 3, lineTotal: 450, kind: "item" }],
      paidTotal: 450, preDiscountTotal: null,
    });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByText(/algarve/i));
    await scanPhoto(user, photo);
    // lands on the review screen with the scanned items
    expect(await screen.findByDisplayValue("Sumo laranja")).toBeInTheDocument();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
  });

  it("shows a friendly error with retry when scanning fails", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("network", "The scanning service had a problem — try again"));
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByText(/algarve/i));
    await scanPhoto(user, photo);
    expect(await screen.findByText(/had a problem/i)).toBeInTheDocument();
    // retry uses the kept photo
    vi.mocked(scanReceipt).mockResolvedValue({
      storeName: "Lidl", date: null, currency: "EUR",
      items: [{ name: "Pão", quantity: 1, lineTotal: 119, kind: "item" }],
      paidTotal: 119, preDiscountTotal: null,
    });
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByDisplayValue("Pão")).toBeInTheDocument();
  });

  it("keeps the scanned receipt but does not navigate when the scan finishes after leaving", async () => {
    let resolveScan!: (r: unknown) => void;
    vi.mocked(scanReceipt).mockImplementation(() => new Promise((res) => { resolveScan = res; }) as never);
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByText(/algarve/i));
    await scanPhoto(user, photo);
    // Leaving mid-scan is now two steps, because the wait has a screen of its own: stop
    // waiting, then leave the trip.
    await user.click(screen.getByRole("button", { name: /cancel and add by hand/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));
    resolveScan({
      storeName: "Lidl", date: null, currency: "EUR",
      items: [{ name: "Pão", quantity: 1, lineTotal: 119, kind: "item" }], paidTotal: 119, preDiscountTotal: null,
    });
    expect(await screen.findByRole("heading", { name: "Billy" })).toBeInTheDocument(); // still on the trip list
    expect(screen.queryByText(/check the receipt/i)).toBeNull(); // no surprise navigation
    await user.click(screen.getByText(/algarve/i));
    expect(await screen.findByText(/lidl/i)).toBeInTheDocument(); // data was kept
  });

  it("sends you to settings when no key is saved", async () => {
    localStorage.removeItem("bills.apiKey");
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByText(/algarve/i));
    await scanPhoto(user, photo);
    expect(await screen.findByLabelText(/anthropic api key/i)).toBeInTheDocument();
  });
});
