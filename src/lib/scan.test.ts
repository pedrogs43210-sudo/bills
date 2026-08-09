import { describe, it, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class APIConnectionError extends APIError {}
  // NOTE: a `function` expression (not an arrow function) is required here so the mock
  // remains constructable with `new` under Vitest 4's stricter mockImplementation checks.
  const Anthropic = vi.fn().mockImplementation(function () {
    return { messages: { parse: parseMock, create: createMock } };
  }) as unknown as {
    new (...args: unknown[]): unknown;
    APIError: unknown;
    AuthenticationError: unknown;
    APIConnectionError: unknown;
  };
  Anthropic.APIError = APIError;
  Anthropic.AuthenticationError = AuthenticationError;
  Anthropic.APIConnectionError = APIConnectionError;
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { scanReceipt, scanTotals, verifyApiKey, ScanError } from "./scan";
import { discountConvention } from "./discounts";

const goodOutput = {
  storeName: "Lidl",
  date: "2026-07-08",
  currency: "EUR",
  items: [{ name: "Sumo laranja", quantity: 3, lineTotal: 450, kind: "item" }],
  paidTotal: 450,
  preDiscountTotal: null,
};

beforeEach(() => {
  parseMock.mockReset();
  createMock.mockReset();
});

describe("scanReceipt", () => {
  it("returns the parsed structured output", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: goodOutput });
    const result = await scanReceipt("sk-ant-x", "base64data");
    expect(result.items[0].name).toBe("Sumo laranja");
    // sends the image and asks the right model
    const req = parseMock.mock.calls[0][0];
    expect(req.model).toBe("claude-haiku-4-5");
    expect(req.messages[0].content[0]).toMatchObject({ type: "image" });
  });

  it("throws no-key without calling the API", async () => {
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "no-key" });
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("maps refusals", async () => {
    parseMock.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "refused" });
  });

  it("maps missing parsed output", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null });
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "unparseable" });
  });

  it("maps auth errors to bad-key", async () => {
    parseMock.mockRejectedValue(new (Anthropic as any).AuthenticationError("401"));
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "bad-key" });
  });

  it("maps other API errors to network", async () => {
    parseMock.mockRejectedValue(new (Anthropic as any).APIError("529"));
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "network" });
  });

  it("maps connection errors to network with an offline message", async () => {
    parseMock.mockRejectedValue(new (Anthropic as any).APIConnectionError("offline"));
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({
      reason: "network",
      message: expect.stringContaining("online"),
    });
  });
});

describe("discount lines from a scan", () => {
  /** Continente prints the discount unsigned; the app must not depend on the model's sign. */
  it("forces a discount line negative however the receipt printed it", async () => {
    parseMock.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        ...goodOutput,
        items: [
          { name: "Sumo laranja", quantity: 1, lineTotal: 400, kind: "item" },
          { name: "Desconto", quantity: 1, lineTotal: 50, kind: "discount" }, // unsigned
        ],
        paidTotal: 400,
      },
    });
    const result = await scanReceipt("sk", "img");
    expect(result.items[1].lineTotal).toBe(-50);
  });

  it("leaves an already-negative discount alone", async () => {
    parseMock.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        ...goodOutput,
        items: [
          { name: "Sumo laranja", quantity: 1, lineTotal: 450, kind: "item" },
          { name: "Desconto", quantity: 1, lineTotal: -50, kind: "discount" },
        ],
        paidTotal: 400,
      },
    });
    const result = await scanReceipt("sk", "img");
    expect(result.items[1].lineTotal).toBe(-50);
  });

  it("never flips the sign of a normal item line", async () => {
    // a refund or a corrected line can legitimately be negative and is not a discount
    parseMock.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        ...goodOutput,
        items: [{ name: "Devolução", quantity: 1, lineTotal: -200, kind: "item" }],
        paidTotal: -200,
      },
    });
    const result = await scanReceipt("sk", "img");
    expect(result.items[0].lineTotal).toBe(-200);
  });
});

describe("scanTotals", () => {
  const totalsOf = (items: { lineTotal: number; kind: "item" | "discount" }[], paidTotal: number) =>
    scanTotals({ ...goodOutput, items: items.map((i) => ({ name: "x", quantity: 1, ...i })), paidTotal });

  it("separates the item sum from the discount sum", () => {
    expect(totalsOf([
      { lineTotal: 249, kind: "item" },
      { lineTotal: 450, kind: "item" },
      { lineTotal: -50, kind: "discount" },
    ], 649)).toEqual({ itemsTotal: 699, discountsTotal: -50, paidTotal: 649 });
  });

  it("feeds the Pingo Doce verdict", () => {
    expect(discountConvention(totalsOf([
      { lineTotal: 249, kind: "item" },
      { lineTotal: 450, kind: "item" },
      { lineTotal: -50, kind: "discount" },
    ], 649))).toBe("discounts-separate");
  });

  it("feeds the Continente verdict", () => {
    expect(discountConvention(totalsOf([
      { lineTotal: 400, kind: "item" },
      { lineTotal: -50, kind: "discount" },
    ], 400))).toBe("discounts-included");
  });

  it("reports zero discounts on a receipt with none", () => {
    expect(totalsOf([{ lineTotal: 450, kind: "item" }], 450)).toEqual({
      itemsTotal: 450, discountsTotal: 0, paidTotal: 450,
    });
  });
});

describe("verifyApiKey", () => {
  it("true when a tiny request succeeds", async () => {
    createMock.mockResolvedValue({});
    expect(await verifyApiKey("sk")).toBe(true);
  });
  it("false on auth error", async () => {
    createMock.mockRejectedValue(new (Anthropic as any).AuthenticationError("401"));
    expect(await verifyApiKey("sk")).toBe(false);
  });
  it("false immediately for empty key", async () => {
    expect(await verifyApiKey("")).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });
  it("throws ScanError on network problems", async () => {
    createMock.mockRejectedValue(new Error("offline"));
    await expect(verifyApiKey("sk")).rejects.toBeInstanceOf(ScanError);
  });
});
