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

/**
 * `boughtPack` pretends the store took the money. It has to be stubbed *inside* here, after
 * resetModules and before App is imported — a spy installed on the module registry that
 * resetModules is about to throw away applies to nothing.
 */
async function renderApp(
  quota: { used: number; left: number | null; limit: number | null; credits?: number },
  opts: { boughtPack?: number } = {}
) {
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
  if (opts.boughtPack !== undefined) {
    const purchase = await import("../lib/purchase");
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockResolvedValue({ kind: "bought", scansAdded: opts.boughtPack });
  }
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
beforeEach(() => localStorage.clear());

describe("the scans-left counter", () => {
  it("shows how many are left once the server answers", async () => {
    await renderApp({ used: 1, left: 2, limit: 3 });
    expect(await screen.findByText(/2 free scans left/i)).toBeInTheDocument();
  });

  it("says it in the singular for the last one", async () => {
    await renderApp({ used: 2, left: 1, limit: 3 });
    expect(await screen.findByText(/1 free scan left/i)).toBeInTheDocument();
  });

  it("says nothing at all for a subscriber, who has no cap to count against", async () => {
    await renderApp({ used: 40, left: null, limit: null });
    // give the fetch a chance to land before asserting an absence
    await waitFor(() => expect(screen.getByLabelText(/scan receipt/i)).toBeInTheDocument());
    expect(screen.queryByText(/free scans? left/i)).toBeNull();
  });
});

describe("the paywall", () => {
  it("replaces the camera with a paywall once the free scans are gone", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    // the file input is gone, so tapping cannot open the camera
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    expect(screen.getByText(/no scans left/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    expect(screen.getByText(/out of free scans/i)).toBeInTheDocument();
  });

  it("says why scanning costs something, and promises no reset it cannot deliver", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));

    expect(screen.getByText(/Billy is free. Reading a receipt isn't./i)).toBeInTheDocument();
    // The free scans are a trial, not an allowance: nothing here may imply they come back.
    expect(screen.queryByText(/scanning is back|next month|this month/i)).toBeNull();

    // The prices are shown — they are useful wherever you read them — but the button cannot be
    // tapped into a payment sheet that does not exist here, and it says so rather than failing.
    expect(screen.getByRole("radio", { name: /20 scans/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy \d+ scans/ })).toBeDisabled();
    expect(screen.getByText(/aren't ready to buy yet/i)).toBeInTheDocument();
  });

  it("stops saying 'out of scans' the moment some are bought", async () => {
    // The gap this pins: with nothing wired to the purchase, someone who had just paid would still
    // be looking at the wall and would reasonably conclude their money had gone nowhere.
    const user = await renderApp({ used: 3, left: 0, limit: 3, credits: 0 }, { boughtPack: 20 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));

    await user.click(screen.getByRole("button", { name: /Buy \d+ scans/ }));

    expect(await screen.findByRole("heading", { name: /you're all set/i })).toBeInTheDocument();
    expect(screen.queryByText(/out of free scans/i)).toBeNull();
    // And it sends them back to what they were trying to do in the first place.
    expect(screen.getByRole("button", { name: /back to scanning/i })).toBeInTheDocument();
  });

  it("asks the server what was bought rather than trusting the phone", async () => {
    // A client that can tell itself it owns 20 scans is a client that can say it a hundred times.
    const user = await renderApp({ used: 3, left: 0, limit: 3, credits: 0 }, { boughtPack: 20 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /Buy \d+ scans/ }));

    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("offers the honest way out and returns to the trip", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));

    expect(screen.getByText(/free and always will be/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add a receipt by hand/i }));
    // back on the trip, where adding by hand actually lives
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeInTheDocument();
  });

  it("shows how much was used, so the number is never a mystery", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByLabelText(/scan receipt/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /scan receipt/i }));
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/of 3 free scans used/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/free scans? left/i)).toBeNull();
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

describe("Settings once the app scans on the user's behalf", () => {
  it("stops mentioning API keys entirely", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SCAN_PROXY_URL", PROXY);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ used: 0, left: 5, limit: 5, month: "2026-08", subscribed: false }), { status: 200 }))
    ));
    const { saveData } = await import("../lib/storage");
    const { setOnboarded } = await import("../lib/onboarding");
    localStorage.clear();
    setOnboarded();
    saveData({ schemaVersion: 2, trips: [seedTrip()] });
    const App = (await import("../App")).default;
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /settings/i }));

    // the whole card is gone: no key field, no "Test key", no talk of Anthropic keys
    expect(screen.queryByPlaceholderText(/sk-ant/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /test key/i })).toBeNull();
    expect(screen.queryByText(/your own Anthropic API key/i)).toBeNull();
    // and the things that still matter are still there
    expect(screen.getByRole("heading", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /backup/i })).toBeInTheDocument();
  });
});
