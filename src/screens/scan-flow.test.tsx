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

describe("scan flow", () => {
  it("scans a photo into a review-ready receipt", async () => {
    vi.mocked(scanReceipt).mockResolvedValue({
      storeName: "Lidl", date: "2026-07-08", currency: "EUR",
      items: [{ name: "Sumo laranja", quantity: 3, lineTotal: 450 }],
      printedTotal: 450,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    // lands on the review screen with the scanned items
    expect(await screen.findByDisplayValue("Sumo laranja")).toBeInTheDocument();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
  });

  it("shows a friendly error with retry when scanning fails", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("network", "The scanning service had a problem — try again"));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    expect(await screen.findByText(/had a problem/i)).toBeInTheDocument();
    // retry uses the kept photo
    vi.mocked(scanReceipt).mockResolvedValue({
      storeName: "Lidl", date: null, currency: "EUR",
      items: [{ name: "Pão", quantity: 1, lineTotal: 119 }],
      printedTotal: 119,
    });
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByDisplayValue("Pão")).toBeInTheDocument();
  });

  it("keeps the scanned receipt but does not navigate when the scan finishes after leaving", async () => {
    let resolveScan!: (r: unknown) => void;
    vi.mocked(scanReceipt).mockImplementation(() => new Promise((res) => { resolveScan = res; }) as never);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    await user.click(screen.getByRole("button", { name: /back/i })); // leave mid-scan
    resolveScan({
      storeName: "Lidl", date: null, currency: "EUR",
      items: [{ name: "Pão", quantity: 1, lineTotal: 119 }], printedTotal: 119,
    });
    expect(await screen.findByPlaceholderText(/trip name/i)).toBeInTheDocument(); // still on trip list
    expect(screen.queryByText(/check the receipt/i)).toBeNull(); // no surprise navigation
    await user.click(screen.getByText(/algarve/i));
    expect(await screen.findByText(/lidl/i)).toBeInTheDocument(); // data was kept
  });

  it("sends you to settings when no key is saved", async () => {
    localStorage.removeItem("bills.apiKey");
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    expect(await screen.findByLabelText(/anthropic api key/i)).toBeInTheDocument();
  });
});
