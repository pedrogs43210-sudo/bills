import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData, saveApiKey } from "../lib/storage";
import { setOnboarded } from "../lib/onboarding";
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
    groups: [], receipts: [], createdAt: "2026-08-01T00:00:00Z", schemaVersion: 2,
  };
}

const scanned = {
  readQuality: "good" as const, readProblem: null, storeName: "Conad", date: "2026-08-11", currency: "EUR", preDiscountTotal: null, paidTotal: 249,
  items: [{ name: "Pane", quantity: 1, lineTotal: 249, kind: "item" as const }],
};

const photo = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

beforeEach(() => {
  localStorage.clear();
  setOnboarded();
  saveData({ schemaVersion: 2, trips: [seedTrip()] });
  saveApiKey("sk-ant-test");
  vi.mocked(scanReceipt).mockReset();
});
afterEach(() => vi.useRealTimers());

/** Starts a scan and leaves it hanging, returning the resolver. */
async function startScan() {
  let resolve!: (v: typeof scanned) => void;
  vi.mocked(scanReceipt).mockReturnValue(new Promise((r) => (resolve = r)));
  const user = userEvent.setup();
  render(<App />);
  leaveScanScreen();
  await user.click(screen.getByText(/algarve/i));
  await scanPhoto(user, photo);
  return { user, resolve };
}

describe("while the receipt is being read", () => {
  it("shows a screen of its own, not a button that changed label", async () => {
    await startScan();
    expect(await screen.findByText(/reading the receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/finding the items/i)).toBeInTheDocument();
    // the trip screen is gone, so nothing invites a second scan mid-scan
    expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull();
  });

  it("announces itself politely rather than interrupting a screen reader", async () => {
    await startScan();
    await screen.findByText(/reading the receipt/i);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toMatch(/finding the items/i);
  });

  it("keeps the animation out of the accessibility tree", async () => {
    await startScan();
    await screen.findByText(/reading the receipt/i);
    // The paper is the Scan screen's viewfinder now, with the sweep running inside it, so that the
    // photo you just took appears to be the thing being read rather than the app cutting to an
    // unrelated card. Whatever it is drawn from, it is decoration.
    const art = document.querySelector(".viewfinder-paper");
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".scanning-sweep")).not.toBeNull();
  });

  it("moves on to the review screen when the items arrive", async () => {
    const { resolve } = await startScan();
    await screen.findByText(/reading the receipt/i);
    resolve(scanned);
    expect(await screen.findByDisplayValue("Pane")).toBeInTheDocument();
  });

  it("admits it is taking a while, once it is", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startScan();
    await screen.findByText(/reading the receipt/i);
    expect(screen.queryByText(/still going/i)).toBeNull();
    await vi.advanceTimersByTimeAsync(9500);
    expect(await screen.findByText(/still going/i)).toBeInTheDocument();
  });

  it("has a way out that keeps the receipt but stops the waiting", async () => {
    const { user, resolve } = await startScan();
    await screen.findByText(/reading the receipt/i);
    await user.click(screen.getByRole("button", { name: /cancel and add by hand/i }));

    // back on the trip, able to act again
    expect(screen.getByRole("button", { name: /scan receipt/i })).toBeInTheDocument();

    // and when the abandoned scan lands, the receipt is kept without hijacking the screen
    resolve(scanned);
    await waitFor(() => expect(screen.getByText(/conad/i)).toBeInTheDocument());
    expect(screen.queryByDisplayValue("Pane")).toBeNull(); // not dragged into the review screen
  });

  it("shows no ad slot content on the web, where there is no ad to show", async () => {
    await startScan();
    await screen.findByText(/reading the receipt/i);
    expect(document.querySelector("[data-ad-slot]")).toBeNull();
  });
});
