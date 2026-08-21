import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip } from "../types";
import { leaveScanScreen } from "../test/leaveScanScreen";
import { scanPhoto } from "../test/scanPhoto";

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
  /* Mutable, because the app now waits for the SERVER to confirm a purchase rather than believing
     the phone — see lib/awaitCredits.ts. A fixed quota never rises, so the wait would run to its
     timeout and the test would be exercising the "your scans are on their way" path instead.
     Bumping it inside buyPack mirrors what really happens: the webhook lands, then the balance
     changes. */
  const live = { ...quota, credits: quota.credits ?? 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.includes("/v1/quota") ? { ...live, month: "2026-08", subscribed: false } : {}), {
          status: 200,
        })
      )
    )
  );
  if (opts.boughtPack !== undefined) {
    const purchase = await import("../lib/purchase");
    const added = opts.boughtPack;
    vi.spyOn(purchase, "canBuy").mockReturnValue(true);
    vi.spyOn(purchase, "buyPack").mockImplementation(async () => {
      live.credits += added;
      live.left = (live.left ?? 0) + added;
      return { kind: "bought", scansAdded: added };
    });
  }
  const { saveData, saveApiKey } = await import("../lib/storage");
  localStorage.clear();
  saveData({ schemaVersion: 2, trips: [seedTrip()] });
  saveApiKey("sk-ant-test");
  const App = (await import("../App")).default;
  render(<App />);
  leaveScanScreen();
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
  // It lives on the scan button now, as a chip, rather than on a grey line underneath it — so the
  // wording is what fits there: "2 free", not "2 free scans left".
  it("shows how many are left once the server answers", async () => {
    await renderApp({ used: 1, left: 2, limit: 3 });
    expect(await screen.findByText(/^2 free$/i)).toBeInTheDocument();
  });

  it("still counts the last one, drawn with more weight rather than in a warning colour", async () => {
    await renderApp({ used: 2, left: 1, limit: 3 });
    expect(await screen.findByText(/^1 free$/i)).toBeInTheDocument();
  });

  it("says nothing at all for a subscriber, who has no cap to count against", async () => {
    await renderApp({ used: 40, left: null, limit: null });
    // give the fetch a chance to land before asserting an absence
    await waitFor(() => expect(screen.getByRole("button", { name: /scan receipt/i })).toBeInTheDocument());
    expect(screen.queryByText(/free scans? left/i)).toBeNull();
  });
});

describe("the paywall", () => {
  it("replaces the camera with a paywall once the free scans are gone", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    // the file input is gone, so tapping cannot open the camera
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    // And the gallery goes with it: importing a photo costs a scan too, so leaving a dimmed 🖼
    // there would imply a free path that does not exist.
    expect(screen.queryByLabelText(/choose a photo/i)).toBeNull();
    // The way out is a button rather than a sentence explaining there is one. Typing a receipt in
    // has never had a limit, and a screen whose only action is unavailable is a dead end.
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /get more scans/i }));
    expect(screen.getByText(/keep scanning/i)).toBeInTheDocument();
  });

  it("says what is paid for without explaining the bill, and promises no reset it cannot deliver", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    await user.click(screen.getByRole("button", { name: /get more scans/i }));

    expect(screen.getByText(/becomes a finished split/i)).toBeInTheDocument();
    // Somebody standing at a till being asked to pay is not the audience for Billy's cost base.
    // Volunteering it reads as an apology for the price, so the numbers behind it stay out.
    expect(screen.queryByText(/few cents|costs us|AI service/i)).toBeNull();
    // The free scans are a trial, not an allowance: nothing here may imply they come back.
    expect(screen.queryByText(/scanning is back|next month|this month/i)).toBeNull();

    // The prices are shown — they are useful wherever you read them — but the button cannot be
    // tapped into a payment sheet that does not exist here, and it says so rather than failing.
    expect(screen.getByRole("radio", { name: /20 scans/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get \d+ scans/ })).toBeDisabled();
    expect(screen.getByText(/aren't ready to buy yet/i)).toBeInTheDocument();
  });

  it("stops saying 'out of scans' the moment some are bought", async () => {
    // The gap this pins: with nothing wired to the purchase, someone who had just paid would still
    // be looking at the wall and would reasonably conclude their money had gone nowhere.
    const user = await renderApp({ used: 3, left: 0, limit: 3, credits: 0 }, { boughtPack: 20 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    await user.click(screen.getByRole("button", { name: /get more scans/i }));

    await user.click(screen.getByRole("button", { name: /Get \d+ scans/ }));

    expect(await screen.findByRole("heading", { name: /you're all set/i })).toBeInTheDocument();
    expect(screen.queryByText(/keep scanning/i)).toBeNull();
    // And it sends them back to what they were trying to do in the first place.
    expect(screen.getByRole("button", { name: /back to scanning/i })).toBeInTheDocument();
  });

  it("asks the server what was bought rather than trusting the phone", async () => {
    // A client that can tell itself it owns 20 scans is a client that can say it a hundred times.
    const user = await renderApp({ used: 3, left: 0, limit: 3, credits: 0 }, { boughtPack: 20 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    await user.click(screen.getByRole("button", { name: /get more scans/i }));
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /Get \d+ scans/ }));

    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("offers the honest way out and returns to the trip", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    await user.click(screen.getByRole("button", { name: /get more scans/i }));

    expect(screen.getByText(/free, and always will be/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add this receipt by hand/i }));
    // back on the trip, where adding by hand actually lives
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeInTheDocument();
  });

  it("counts what is left, the same way every other screen does", async () => {
    const user = await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    await user.click(screen.getByRole("button", { name: /get more scans/i }));
    // Never "3 of 3 used" — the Profile tab, the badge and the chip on the scan button all count
    // downwards, and one screen counting upwards made people check whether the two agreed.
    expect(screen.queryByText(/used/i)).toBeNull();
    // And at zero the number is not shown at all: a hero 0 is the worst anchor on a screen whose
    // job is to make buying feel easy, and the heading has already said it.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("does not price the button that opens the paywall", async () => {
    await renderApp({ used: 3, left: 0, limit: 3 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /scan receipt/i })).toBeNull());
    // The price belongs next to what it buys, which is one tap away. On the button it was a second
    // thing to read on a control whose only job is to be pressed.
    expect(screen.queryByText(/from €1.99/i)).toBeNull();
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
  leaveScanScreen();
    await userEvent.setup().click(screen.getByText(/algarve/i));

    expect(screen.getByRole("button", { name: /scan receipt/i })).toBeInTheDocument();
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
  leaveScanScreen();
    const user = userEvent.setup();
    await user.click(screen.getByText(/algarve/i));
    await scanPhoto(user, new File(["x"], "r.jpg", { type: "image/jpeg" }));

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
  leaveScanScreen();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /profile/i }));

    // the whole card is gone: no key field, no "Test key", no talk of Anthropic keys
    expect(screen.queryByPlaceholderText(/sk-ant/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /test key/i })).toBeNull();
    expect(screen.queryByText(/your own Anthropic API key/i)).toBeNull();
    // and the things that still matter are still there
    expect(screen.getByRole("heading", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /backup/i })).toBeInTheDocument();
  });
});
