import { describe, it, expect } from "vitest";
import { newShareCode, isValidShareCode, CODE_LENGTH } from "./shareCodes";

describe("a join code", () => {
  it("is long enough that guessing is hopeless", () => {
    // The code IS the permission — there is no password behind it — so its only defence is
    // being unguessable.
    expect(CODE_LENGTH).toBeGreaterThanOrEqual(12);
    expect(newShareCode()).toHaveLength(CODE_LENGTH);
  });

  it("avoids the characters people misread when reading one aloud", () => {
    // A code gets read out at a table. O/0, I/l/1 and U/V are where that goes wrong.
    const codes = Array.from({ length: 200 }, newShareCode).join("");
    expect(codes).not.toMatch(/[OIl1U0]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, newShareCode));
    expect(seen.size).toBe(500);
  });

  it("accepts what it generates and refuses everything else", () => {
    expect(isValidShareCode(newShareCode())).toBe(true);
    for (const bad of [null, undefined, "", "short", "a".repeat(64), "has space!!!", "'; DROP TABLE--", "OOOOOOOOOOOO"]) {
      expect(isValidShareCode(bad), String(bad)).toBe(false);
    }
  });

  it("is case-insensitive on the way in, because links get retyped", () => {
    const code = newShareCode();
    expect(isValidShareCode(code.toLowerCase())).toBe(true);
  });
});
