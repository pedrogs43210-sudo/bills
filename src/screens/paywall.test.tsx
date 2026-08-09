import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip } from "../types";

/**
 * The scans-left counter and the paywall, driven through a fake proxy. scan.ts reads its env var
 * once at module load, so App has to be imported after the env is stubbed.
 */
const PROXY = "https://proxy.example";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [{ id: "p1", name: "Pedro", color: "#ffd9a0" }],
    groups: [], receipts: [], createdAt: "2026-08-01T00:00:00Z", schemaVersion: 2,
  };
}

async function renderApp(quota: { used: number; left: number | null; limit: number | null }) {
  vi.resetModules();
  vi.stubEnv("VITE_SCAN_PROXY_URL", PROXY);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.includes("/v1/quota") ? { ...quota, month: "2026-08", subscribed: false } : {}), {
          status: 200,
        })
      )
    )
  );
  const { saveData, saveApiKey } = await import("../lib/storage");
  localStorage.clear();
  saveData({ schemaVersion: 2, trips: [seedTrip()] });
  saveApiKey("sk-ant-test");
  const App = (await import("../App")).default;
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByText(/algarve/i));
  return user;
}

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => localStorage.clear());

describe("the scans-left counter", () => {
  it("shows how many are left once the server answers", async () => {
    await renderApp({ used: 2, left: 3, limit: 5 });
    expect(await screen.findByText(/3 scans left this month/i)).toBeInTheDocument();
  });

  it("says it in the singular for the last one", async () => {
    await renderApp({ used: 4, left: 1, limit: 5 });
    expect(await screen.findByText(/1 scan left this month/i)).toBeInTheDocument();
  });

  it("says nothing at all for a subscriber, who has no cap to count against", async () => {
    await renderApp({ used: 40, left: null, limit: null });
    // give the fetch a chance to land before asserting an absence
    await waitFor(() => expect(screen.getByLabelText(/scan receipt/i)).toBeInTheDocument());
    expect(screen.queryByText(/left this month/i)).toBeNull();
  });
});

describe("the paywall", () => {
  it("replaces the camera with a paywall once the allowance is gone", async () => {
    const user = await renderApp({ used: 5, left: 0, limit: 5 });
    // the file input is gone, so tapping cannot open the camera
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    expect(screen.getByText(/no scans left this month/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    expect(screen.getByText(/out of scans/i)).toBeInTheDocument();
  });

  it("says when scanning comes back, and does not ask for money it cannot take", async () => {
    const user = await renderApp({ used: 5, left: 0, limit: 5 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));

    expect(screen.getByText(/scanning is back on/i)).toBeInTheDocument();
    expect(screen.getByText(/isn't ready to buy yet/i)).toBeInTheDocument();
    // no purchase button exists yet, so there is nothing to tap that cannot work
    expect(screen.queryByRole("button", { name: /subscribe|buy|upgrade/i })).toBeNull();
  });

  it("offers the honest way out and returns to the trip", async () => {
    const user = await renderApp({ used: 5, left: 0, limit: 5 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));

    expect(screen.getByText(/free and always will be/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add a receipt by hand/i }));
    // back on the trip, where adding by hand actually lives
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeInTheDocument();
  });

  it("shows how much was used, so the number is never a mystery", async () => {
    const user = await renderApp({ used: 5, left: 0, limit: 5 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/of 5 scans used this month/i)).toBeInTheDocument();
  });
});

describe("with no proxy configured", () => {
  it("keeps the camera and shows no counter, exactly as the published app does", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SCAN_PROXY_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { saveData, saveApiKey } = await import("../lib/storage");
    localStorage.clear();
    saveData({ schemaVersion: 2, trips: [seedTrip()] });
    saveApiKey("sk-ant-test");
    const App = (await import("../App")).default;
    render(<App />);
    await userEvent.setup().click(screen.getByText(/algarve/i));

    expect(screen.getByLabelText(/scan receipt/i)).toBeInTheDocument();
    expect(screen.queryByText(/left this month/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled(); // no proxy means nothing to ask
  });
});

describe("scanning with a proxy and no API key of your own", () => {
  it("scans instead of sending the user to Settings", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SCAN_PROXY_URL", PROXY);
    const scanned = {
      storeName: "Conad", date: "2026-08-11", currency: "EUR", preDiscountTotal: null, paidTotal: 249,
      items: [{ name: "Pane", quantity: 1, lineTotal: 249, kind: "item" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve(new Response(JSON.stringify(
        url.includes("/v1/quota")
          ? { used: 0, left: 5, limit: 5, month: "2026-08", subscribed: false }
          : { result: scanned, used: 1, left: 4, limit: 5 }
      ), { status: 200 }))
    ));
    vi.doMock("../lib/image", () => ({ downscaleToBase64Jpeg: vi.fn().mockResolvedValue("b64") }));

    const { saveData } = await import("../lib/storage");
    localStorage.clear();
    saveData({ schemaVersion: 2, trips: [seedTrip()] }); // note: no API key saved at all
    const App = (await import("../App")).default;
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), new File(["x"], "r.jpg", { type: "image/jpeg" }));

    // lands on the review screen, rather than on Settings asking for a key
    expect(await screen.findByDisplayValue("Pane")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/sk-ant/i)).toBeNull();
  });
});
