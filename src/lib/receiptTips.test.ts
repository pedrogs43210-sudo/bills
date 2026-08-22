import { describe, it, expect } from "vitest";
import { PROMPT } from "./receipt";

/**
 * The prompt is the extraction logic. It cannot be unit-tested against a photograph here, but the
 * instructions it gives can be — and every one of these lines is a bug that reached a real bill.
 */
describe("what the scan is told to read", () => {
  it("does not claim to be looking at a supermarket", () => {
    // "Read this grocery receipt photo" was the opening line while half the app's job was
    // restaurant bills. A model told it is holding a till roll reads a menu differently.
    expect(PROMPT).not.toMatch(/grocery receipt/i);
    expect(PROMPT).toMatch(/restaurant bill/i);
  });

  it("asks for service charge, cover and printed tips as items", () => {
    // These sit below the food, where the prompt's own rule says "never put anything from here in
    // items" — so they were dropped, and the table under-paid by exactly the service charge.
    for (const word of [/service charge/i, /cover/i, /gratuity|tip/i, /couvert/i, /coperto/i]) {
      expect(PROMPT).toMatch(word);
    }
  });

  it("still forbids totals and payment lines", () => {
    // The carve-out above must not become a hole. A duplicated total silently multiplies what
    // everybody owes, which is the worse of the two failures.
    expect(PROMPT).toMatch(/NEVER put a total, subtotal, tax line, payment line or change line/);
  });

  it("does not invite a guess at a handwritten tip", () => {
    expect(PROMPT).toMatch(/written on by hand.*do not guess|do not guess at one/is);
  });

  it("checks its own work before answering", () => {
    expect(PROMPT).toMatch(/service\s+charge, cover or printed tip IS in "items"/is);
  });
});
