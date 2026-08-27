import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PACKS } from "./packs";

/** The plugin, replaced. Each test rewires these before importing the module under test. */
const configure = vi.fn(async (_o: unknown) => {});
const getProducts = vi.fn(async (_o: unknown) => ({ products: [] as { identifier: string }[] }));
const purchaseStoreProduct = vi.fn(async (_o: unknown) => ({ productIdentifier: "", customerInfo: {} }));
const restore = vi.fn(async () => ({ customerInfo: { nonSubscriptionTransactions: [] as unknown[] } }));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    configure: (o: unknown) => configure(o),
    getProducts: (o: unknown) => getProducts(o),
    purchaseStoreProduct: (o: unknown) => purchaseStoreProduct(o),
    restorePurchases: () => restore(),
  },
  PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION", SUBSCRIPTION: "SUBSCRIPTION" },
}));

const PACK = PACKS[1]; // the featured 20-pack

/** Pretend to be a phone, with or without a key for its store. */
async function load(opts: { platform?: string; iosKey?: string; androidKey?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_RC_KEY_IOS", opts.iosKey ?? "");
  vi.stubEnv("VITE_RC_KEY_ANDROID", opts.androidKey ?? "");
  if (opts.platform) {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => opts.platform });
  } else {
    vi.stubGlobal("Capacitor", undefined);
  }
  return import("./purchase");
}

beforeEach(() => {
  localStorage.clear();
  configure.mockClear();
  getProducts.mockClear();
  purchaseStoreProduct.mockClear();
  restore.mockClear();
  getProducts.mockResolvedValue({ products: [{ identifier: PACK.id }] });
  purchaseStoreProduct.mockResolvedValue({ productIdentifier: PACK.id, customerInfo: {} });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("whether buying is possible", () => {
  it("is not, in a browser", async () => {
    // Billy is a phone app; the web build exists so this can be developed. No copy mentions it.
    const { canBuy } = await load();
    expect(canBuy()).toBe(false);
  });

  it("is not, on a phone whose store has no key — a fork, or a local build", async () => {
    const { canBuy } = await load({ platform: "android" });
    expect(canBuy()).toBe(false);
  });

  it("reads the key belonging to the store it is running on", async () => {
    const both = { iosKey: "appl_x", androidKey: "goog_y" };
    expect((await load({ platform: "ios", ...both })).canBuy()).toBe(true);
    expect((await load({ platform: "android", ...both })).canBuy()).toBe(true);
    // An iOS build shipped with only an Android key must not offer a button that opens nothing.
    expect((await load({ platform: "ios", androidKey: "goog_y" })).canBuy()).toBe(false);
  });

  it("refuses to open a sheet it cannot open, rather than throwing", async () => {
    const { buyPack, restorePurchases } = await load();
    expect((await buyPack(PACK)).kind).toBe("unavailable");
    expect((await restorePurchases()).kind).toBe("unavailable");
    expect(configure).not.toHaveBeenCalled();
  });
});

describe("buying a pack", () => {
  const ready = { platform: "android", androidKey: "goog_y" };

  it("identifies the buyer by install id, which is what ties a payment to a row", async () => {
    // The webhook drops any event whose app_user_id is not a UUID rather than guessing whose
    // purchase it was, so this is the whole link between money and credits.
    const { installId } = await import("./installId");
    const id = installId();
    const { buyPack } = await load(ready);
    await buyPack(PACK);
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ appUserID: id }));
  });

  it("configures once, however many times it is used", async () => {
    const { buyPack } = await load(ready);
    await buyPack(PACK);
    await buyPack(PACK);
    expect(configure).toHaveBeenCalledTimes(1);
  });

  it("asks the store for a consumable, not a subscription", async () => {
    const { buyPack } = await load(ready);
    await buyPack(PACK);
    expect(getProducts).toHaveBeenCalledWith(
      expect.objectContaining({ productIdentifiers: [PACK.id], type: "NON_SUBSCRIPTION" })
    );
  });

  it("reports the scans from PACKS, never from the store's own metadata", async () => {
    // The same rule the Worker follows. A store product's title could say anything; the catalogue
    // is the catalogue.
    getProducts.mockResolvedValue({ products: [{ identifier: PACK.id, title: "9999 scans" } as never] });
    const { buyPack } = await load(ready);
    const out = await buyPack(PACK);
    expect(out).toEqual({ kind: "bought", scansAdded: PACK.scans });
  });

  it("says so plainly when the product does not exist in the store yet", async () => {
    // Much the commonest cause is a pack in PACKS that was never created, or not yet approved, in
    // App Store Connect or the Play Console — and "that didn't work" sends somebody hunting in
    // the wrong place.
    getProducts.mockResolvedValue({ products: [] });
    const { buyPack } = await load(ready);
    const out = await buyPack(PACK);
    expect(out.kind).toBe("unavailable");
    expect("why" in out && out.why).toMatch(/store yet/i);
    expect(purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it("treats backing out as cancelled, not as a failure", async () => {
    // RevenueCat reports this as a thrown error with a flag. Calling it a failure would tell
    // somebody their payment broke when they simply changed their mind.
    purchaseStoreProduct.mockRejectedValue({ userCancelled: true, message: "Purchase was cancelled" });
    const { buyPack } = await load(ready);
    expect((await buyPack(PACK)).kind).toBe("cancelled");
  });

  it("never leaves the caller without an answer when the store throws", async () => {
    purchaseStoreProduct.mockRejectedValue(new Error("network down"));
    const { buyPack } = await load(ready);
    const out = await buyPack(PACK);
    expect(out.kind).toBe("failed");
    expect("why" in out && out.why).toBeTruthy();
  });

  it("does not cache a failed configure as done", async () => {
    // Otherwise every later attempt fails silently against a half-initialised SDK.
    configure.mockRejectedValueOnce(new Error("bad key"));
    const { buyPack } = await load(ready);
    expect((await buyPack(PACK)).kind).toBe("failed");
    expect((await buyPack(PACK)).kind).toBe("bought");
    expect(configure).toHaveBeenCalledTimes(2);
  });
});

describe("restoring", () => {
  const ready = { platform: "ios", iosKey: "appl_x" };

  it("reports finding nothing as an ordinary answer", async () => {
    const { restorePurchases } = await load(ready);
    expect(await restorePurchases()).toEqual({ kind: "restored", found: false });
  });

  it("reports finding something, without claiming a number", async () => {
    // How many scans it is worth is the server's to say, not the store's.
    restore.mockResolvedValue({ customerInfo: { nonSubscriptionTransactions: [{}, {}] } });
    const { restorePurchases } = await load(ready);
    expect(await restorePurchases()).toEqual({ kind: "restored", found: true });
  });

  it("survives a customerInfo with no transactions field at all", async () => {
    restore.mockResolvedValue({ customerInfo: {} as never });
    const { restorePurchases } = await load(ready);
    expect(await restorePurchases()).toEqual({ kind: "restored", found: false });
  });
});
