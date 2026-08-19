import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData, saveApiKey } from "../lib/storage";
import { setOnboarded } from "../lib/onboarding";
import type { Trip } from "../types";

vi.mock("../lib/image", () => ({
  downscaleToBase64Jpeg: vi.fn().mockResolvedValue("b64"),
}));
vi.mock("../lib/scan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/scan")>();
  return { ...actual, scanReceipt: vi.fn() };
});
import { scanReceipt, ScanError } from "../lib/scan";
import { leaveScanScreen } from "../test/leaveScanScreen";
import { scanPhoto } from "../test/scanPhoto";

function seedTrip(currency = "EUR"): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency,
    people: [{ id: "p1", name: "Pedro", color: "#ffd9a0" }],
    groups: [], receipts: [], createdAt: "2026-08-01T00:00:00Z", schemaVersion: 2,
  };
}

const photo = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

beforeEach(() => {
  localStorage.clear();
  setOnboarded();
  saveApiKey("sk-ant-test");
  saveData({ schemaVersion: 2, trips: [seedTrip()] });
  vi.mocked(scanReceipt).mockReset();
});

async function openTrip() {
  const user = userEvent.setup();
  render(<App />);
  leaveScanScreen();
  await user.click(screen.getByText(/algarve/i));
  return user;
}

describe("opening the camera", () => {
  it("asks for the rear camera, which is what the gallery-only picker was missing", async () => {
    const user = await openTrip();
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    const camera = screen.getByLabelText(/take a photo of the receipt/i);
    // Without capture, a browser shows a generic file picker and Android lands in the gallery.
    expect(camera).toHaveAttribute("capture", "environment");
    expect(camera).toHaveAttribute("accept", "image/*");
  });

  it("still offers a photo you already have, since capture hides the gallery", async () => {
    const user = await openTrip();
    // Behind the button now rather than beside it: a permanent second control saying what it cost
    // put a caveat about pricing on the screen, for the rarer of the two paths.
    expect(screen.queryByLabelText(/choose a photo of a receipt/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    expect(screen.getByLabelText(/choose a photo of a receipt/i)).not.toHaveAttribute("capture");
  });

  it("scans from either control", async () => {
    const scanned = {
      storeName: "Conad", date: "2026-08-11", currency: "EUR", preDiscountTotal: null, paidTotal: 249,
      items: [{ name: "Pane", quantity: 1, lineTotal: 249, kind: "item" as const }],
    };
    vi.mocked(scanReceipt).mockResolvedValue(scanned);
    const user = await openTrip();
    await scanPhoto(user, photo, "gallery");
    expect(await screen.findByDisplayValue("Pane")).toBeInTheDocument();
  });

  it("stays shut until somebody is on the trip", async () => {
    saveData({ schemaVersion: 2, trips: [{ ...seedTrip(), people: [] }] });
    const user = await openTrip();
    const scan = screen.getByRole("button", { name: /scan receipt/i });
    expect(scan).toBeDisabled();
    // One disabled control rather than two, and the sheet behind it never opens — so neither
    // source can be reached, which is what disabling both used to say.
    await user.click(scan);
    expect(screen.queryByLabelText(/take a photo of the receipt/i)).toBeNull();
    expect(screen.queryByLabelText(/choose a photo of a receipt/i)).toBeNull();
  });
});

describe("picking the trip's currency", () => {
  it("shows the trip's own currency, and changes what amounts look like", async () => {
    const user = await openTrip();
    const select = screen.getByLabelText(/currency/i);
    expect(select).toHaveValue("EUR");

    await user.selectOptions(select, "GBP");
    expect(screen.getByLabelText(/currency/i)).toHaveValue("GBP");

    // and it survives a remount, because it is stored on the trip
    const stored = JSON.parse(localStorage.getItem("bills.data.v1")!);
    expect(stored.trips[0].currency).toBe("GBP");
  });

  it("keeps a currency it has never heard of rather than silently showing another one", async () => {
    // an imported trip, or one from before the list existed
    saveData({ schemaVersion: 2, trips: [seedTrip("XZY")] });
    await openTrip();
    expect(screen.getByLabelText(/currency/i)).toHaveValue("XZY");
  });

  it("offers currencies beyond the euro, since a holiday is not always in one", async () => {
    await openTrip();
    for (const code of ["GBP", "USD", "JPY", "TRY", "PLN"]) {
      expect(screen.getByRole("option", { name: new RegExp(`^${code}`) })).toBeInTheDocument();
    }
  });
});

describe("when a scan fails", () => {
  it("gives an unreadable photo the way out that works, not a retry", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(
      new ScanError("unparseable", "Could not read the receipt — try again or enter items by hand")
    );
    const user = await openTrip();
    await scanPhoto(user, photo);

    expect(await screen.findByText(/that photo couldn't be read/i)).toBeInTheDocument();
    // typing it in is the primary action here — retrying the same photo just fails again
    const byHand = screen.getByRole("button", { name: /add items by hand/i });
    expect(byHand.className).toContain("btn-primary");
  });

  it("treats a network failure as worth retrying, and keeps the photo", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("network", "offline"));
    const user = await openTrip();
    await scanPhoto(user, photo);

    expect(await screen.findByText(/couldn't reach the scanning service/i)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /try again/i });
    expect(retry.className).toContain("btn-primary");
  });

  it("says a busy day is our problem, not theirs, and never sends them to a paywall for it", async () => {
    // The day's ceiling is the proxy protecting itself. Reporting it as "out of scans" would be a
    // lie, and would push someone towards buying something that would not help.
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("busy", "closed today"));
    const user = await openTrip();
    await scanPhoto(user, photo);

    expect(await screen.findByText(/busy day/i)).toBeInTheDocument();
    expect(screen.getByText(/a limit on our side, not on yours/i)).toBeInTheDocument();
    const byHand = screen.getByRole("button", { name: /add items by hand/i });
    expect(byHand.className).toContain("btn-primary");
  });

  it("sends a rejected key to Settings rather than asking for another photo", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("bad-key", "rejected"));
    const user = await openTrip();
    await scanPhoto(user, photo);

    expect(await screen.findByText(/api key was rejected/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open settings/i }));
    expect(screen.getByPlaceholderText(/sk-ant/i)).toBeInTheDocument();
  });

  it("always offers typing it in, whatever went wrong", async () => {
    for (const reason of ["unparseable", "network", "refused", "bad-key", "busy"] as const) {
      localStorage.clear();
      setOnboarded();
      saveApiKey("sk-ant-test");
      saveData({ schemaVersion: 2, trips: [seedTrip()] });
      vi.mocked(scanReceipt).mockRejectedValue(new ScanError(reason, "boom"));

      // Mounted and unmounted per reason so each iteration starts from one clean app.
      const user = userEvent.setup();
      const { unmount } = render(<App />);
  leaveScanScreen();
      await user.click(screen.getByText(/algarve/i));
      await scanPhoto(user, photo);
      expect(
        await screen.findByRole("button", { name: /add items by hand/i }),
        `${reason} must still offer it`
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("takes the way out straight to a receipt to type into", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("unparseable", "nope"));
    const user = await openTrip();
    await scanPhoto(user, photo);
    await user.click(await screen.findByRole("button", { name: /add items by hand/i }));
    // lands on the review screen, where items are typed
    expect(screen.getByPlaceholderText(/store name/i)).toBeInTheDocument();
  });

  it("goes back to the trip without leaving a broken state behind", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("network", "offline"));
    const user = await openTrip();
    await scanPhoto(user, photo);
    await user.click(await screen.findByRole("button", { name: /back/i }));
    expect(screen.getByRole("button", { name: /scan receipt/i })).toBeInTheDocument();
  });
});
