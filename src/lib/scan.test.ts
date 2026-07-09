import { describe, it, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  // NOTE: a `function` expression (not an arrow function) is required here so the mock
  // remains constructable with `new` under Vitest 4's stricter mockImplementation checks.
  const Anthropic = vi.fn().mockImplementation(function () {
    return { messages: { parse: parseMock, create: createMock } };
  }) as unknown as { new (...args: unknown[]): unknown; APIError: unknown; AuthenticationError: unknown };
  Anthropic.APIError = APIError;
  Anthropic.AuthenticationError = AuthenticationError;
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { scanReceipt, verifyApiKey, ScanError } from "./scan";

const goodOutput = {
  storeName: "Lidl",
  date: "2026-07-08",
  currency: "EUR",
  items: [{ name: "Sumo laranja", quantity: 3, lineTotal: 450 }],
  printedTotal: 450,
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
    expect(req.model).toBe("claude-opus-4-8");
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
