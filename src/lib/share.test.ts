import { describe, it, expect, vi, afterEach } from "vitest";
import { shareOrCopy } from "./share";

function defineNav(prop: string, value: unknown) {
  Object.defineProperty(navigator, prop, { value, configurable: true });
}

afterEach(() => {
  defineNav("share", undefined);
  defineNav("clipboard", undefined);
});

describe("shareOrCopy", () => {
  it("uses the native share sheet when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    defineNav("share", share);
    expect(await shareOrCopy("hi")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hi" });
  });

  it("treats a cancelled share sheet as done (no clipboard side effect)", async () => {
    const err = new Error("cancel");
    err.name = "AbortError";
    defineNav("share", vi.fn().mockRejectedValue(err));
    const writeText = vi.fn();
    defineNav("clipboard", { writeText });
    expect(await shareOrCopy("hi")).toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    defineNav("clipboard", { writeText });
    expect(await shareOrCopy("hi")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("reports failure when neither mechanism exists", async () => {
    expect(await shareOrCopy("hi")).toBe("failed");
  });
});
