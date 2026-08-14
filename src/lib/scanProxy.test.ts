import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The proxy path, tested by pointing VITE_SCAN_PROXY_URL at a fake server. Imported dynamically
 * because scan.ts reads the env var once at module load.
 */
const PROXY = "https://proxy.example/";

async function loadScanner() {
  vi.resetModules();
  vi.stubEnv("VITE_SCAN_PROXY_URL", PROXY);
  vi.stubEnv("VITE_APP_TOKEN", "tok");
  return import("./scan");
}

const goodResult = {
  storeName: "Conad",
  date: "2026-08-11",
  currency: "EUR",
  items: [{ name: "Pane", quantity: 1, lineTotal: 249, kind: "item" }],
  paidTotal: 249,
  preDiscountTotal: null,
};

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllEnvs());

describe("scanning through the proxy", () => {
  it("sends the photo and an install id, and needs no API key", async () => {
    const { scanReceipt, usingProxy } = await loadScanner();
    const fetchMock = vi.fn().mockReturnValue(respond({ result: goodResult, used: 1, left: 4, limit: 5 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(usingProxy()).toBe(true);
    const result = await scanReceipt("", "base64data"); // no key at all
    expect(result.items[0].name).toBe("Pane");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example/v1/scan");
    expect(init.headers["x-install-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(init.headers["x-app-token"]).toBe("tok");
    expect(JSON.parse(init.body).imageBase64).toBe("base64data");
  });

  it("reuses the same install id on the next scan", async () => {
    const { scanReceipt } = await loadScanner();
    // a fresh Response per call: a body can only be read once
    const fetchMock = vi.fn().mockImplementation(() => respond({ result: goodResult, used: 1, left: 4, limit: 5 }));
    vi.stubGlobal("fetch", fetchMock);
    await scanReceipt("", "a");
    await scanReceipt("", "b");
    const [first, second] = fetchMock.mock.calls.map((c) => c[1].headers["x-install-id"]);
    expect(first).toBe(second);
  });

  it("reports running out of scans as its own failure, not a network problem", async () => {
    const { scanReceipt, lastKnownQuota } = await loadScanner();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(respond({ error: "quota-exceeded", used: 5, left: 0, limit: 5 }, 402)));
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "out-of-scans" });
    // and the allowance is remembered, because the paywall needs it
    expect(lastKnownQuota()).toEqual({ used: 5, left: 0, limit: 5, credits: 0 });
  });

  it("still normalises an unsigned discount, wherever the scan happened", async () => {
    const { scanReceipt } = await loadScanner();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(respond({
      result: {
        ...goodResult,
        items: [
          { name: "Sumo", quantity: 1, lineTotal: 400, kind: "item" },
          { name: "Desconto", quantity: 1, lineTotal: 50, kind: "discount" },
        ],
        paidTotal: 400,
      },
      used: 1, left: 4, limit: 5,
    })));
    const result = await scanReceipt("", "img");
    expect(result.items[1].lineTotal).toBe(-50);
  });

  it("refuses a malformed result rather than turning it into money", async () => {
    const { scanReceipt } = await loadScanner();
    // a server that returns nonsense must not reach the review screen
    for (const bad of [
      { items: "not an array", paidTotal: 100 },
      { ...goodResult, paidTotal: "249" },
      { ...goodResult, items: [{ name: "x", quantity: 1, lineTotal: 1.5, kind: "item" }] },
      null,
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(respond({ result: bad, used: 1, left: 4, limit: 5 })));
      await expect(scanReceipt("", "img"), JSON.stringify(bad)).rejects.toMatchObject({ reason: "unparseable" });
    }
  });

  it("treats an unreachable or non-JSON server as a network problem", async () => {
    const { scanReceipt } = await loadScanner();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "network" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })));
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "network" });
  });

  it("maps an unrecognised error code to something sayable instead of leaking it", async () => {
    const { scanReceipt } = await loadScanner();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(respond({ error: "kaboom" }, 500)));
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "network" });
  });

  it("fetchQuota reads the counter without spending a scan", async () => {
    const { fetchQuota } = await loadScanner();
    const fetchMock = vi.fn().mockReturnValue(respond({ used: 2, left: 3, limit: 5, month: "2026-08", subscribed: false }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchQuota()).toEqual({ used: 2, left: 3, limit: 5, credits: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://proxy.example/v1/quota");
  });

  it("never lets the counter break the app", async () => {
    const { fetchQuota } = await loadScanner();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchQuota()).toBeNull();
  });
});

describe("without a proxy configured", () => {
  it("still uses the user's own key, so the published web app keeps working", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SCAN_PROXY_URL", "");
    const { usingProxy, scanReceipt, fetchQuota } = await import("./scan");
    expect(usingProxy()).toBe(false);
    expect(await fetchQuota()).toBeNull();
    // no key and no proxy is the one case that fails before any network call
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "no-key" });
  });
});
