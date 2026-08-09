import { describe, it, expect } from "vitest";
import { back, initialNav, isHome, navigate } from "./history";
import type { View } from "../App";

const trips: View = { screen: "trips" };
const trip: View = { screen: "trip", tripId: "t1" };
const receipt: View = { screen: "receipt", tripId: "t1", receiptId: "r1" };
const settle: View = { screen: "settle", tripId: "t1" };

describe("the back stack", () => {
  it("starts at the trip list with nowhere to go back to", () => {
    const nav = initialNav();
    expect(nav.current).toEqual(trips);
    expect(back(nav)).toBeNull(); // pressing back here closes the app, as it should
  });

  it("remembers each screen on the way in, and unwinds in order", () => {
    let nav = navigate(navigate(initialNav(), trip), receipt);
    expect(nav.current).toEqual(receipt);

    nav = back(nav)!;
    expect(nav.current).toEqual(trip);
    nav = back(nav)!;
    expect(nav.current).toEqual(trips);
    expect(back(nav)).toBeNull();
  });

  it("does not stack the screen you are already on", () => {
    const nav = navigate(initialNav(), trips);
    expect(nav.stack).toHaveLength(0);
  });

  it("unwinds rather than grows when going back to a screen already behind you", () => {
    // trip → receipt → trip, twenty times over, must not need twenty back presses to escape
    let nav = navigate(initialNav(), trip);
    for (let i = 0; i < 20; i++) {
      nav = navigate(nav, receipt);
      nav = navigate(nav, trip);
    }
    expect(nav.current).toEqual(trip);
    expect(nav.stack).toEqual([trips]);
    expect(back(nav)!.current).toEqual(trips);
  });

  it("treats two different receipts as two different screens", () => {
    const other: View = { screen: "receipt", tripId: "t1", receiptId: "r2" };
    const nav = navigate(navigate(navigate(initialNav(), trip), receipt), other);
    expect(nav.stack).toEqual([trips, trip, receipt]);
  });

  it("keeps the trip in the stack when moving sideways to settle up", () => {
    const nav = navigate(navigate(initialNav(), trip), settle);
    expect(back(nav)!.current).toEqual(trip);
  });

  it("knows home, which is the one screen back may exit from", () => {
    expect(isHome(trips)).toBe(true);
    expect(isHome(trip)).toBe(false);
    expect(isHome(settle)).toBe(false);
  });
});
