import { describe, it, expect, beforeEach } from "vitest";
import { defaultCurrency, setDefaultCurrency, FALLBACK_CURRENCY } from "./currencies";
import { reducer } from "../state/reducer";
import type { AppData } from "./storage";

const empty: AppData = { schemaVersion: 2, trips: [] };

beforeEach(() => localStorage.clear());

describe("the default currency", () => {
  it("is euros until somebody says otherwise", () => {
    expect(defaultCurrency()).toBe(FALLBACK_CURRENCY);
  });

  it("remembers what was chosen", () => {
    setDefaultCurrency("GBP");
    expect(defaultCurrency()).toBe("GBP");
  });

  it("refuses a code that is not a real option", () => {
    // Storage is editable, and a junk code reaches Intl.NumberFormat, which throws on it — turning
    // a bad setting into a blank screen rather than a wrong symbol.
    localStorage.setItem("bills.currency", "NOTACURRENCY");
    expect(defaultCurrency()).toBe(FALLBACK_CURRENCY);
  });

  it("survives storage that cannot be read", () => {
    localStorage.setItem("bills.currency", "");
    expect(defaultCurrency()).toBe(FALLBACK_CURRENCY);
  });
});

describe("creating a split", () => {
  it("starts it in the currency the caller asked for", () => {
    const data = reducer(empty, { type: "createTrip", id: "t1", name: "Tokyo", emoji: "🍜", currency: "JPY" });
    expect(data.trips[0].currency).toBe("JPY");
  });

  it("still defaults to euros for a caller that does not care", () => {
    // The reducer stays pure: it takes a currency, it does not read a preference. A reducer that
    // reached into localStorage would make the same action produce different data on two phones.
    const data = reducer(empty, { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" });
    expect(data.trips[0].currency).toBe("EUR");
  });

  it("leaves an existing split's currency alone", () => {
    setDefaultCurrency("GBP");
    let data = reducer(empty, { type: "createTrip", id: "t1", name: "Old", emoji: "x", currency: "EUR" });
    data = reducer(data, { type: "createTrip", id: "t2", name: "New", emoji: "y", currency: "GBP" });
    expect(data.trips[0].currency).toBe("EUR");
    expect(data.trips[1].currency).toBe("GBP");
  });
});
