import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import App from "../App";
import { saveData } from "../lib/storage";
import { setOnboarded } from "../lib/onboarding";
import { claimFirstLaunch, SPLASH_MS } from "./SplashAnimation";
import { leaveScanScreen } from "../test/leaveScanScreen";
import type { Trip } from "../types";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [], groups: [], receipts: [], createdAt: "2026-08-01T00:00:00Z", schemaVersion: 2,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("claiming the first launch", () => {
  it("says yes exactly once, then no forever", () => {
    // Once per install is the whole design. A splash that replays is a loop, not an introduction.
    expect(claimFirstLaunch()).toBe(true);
    expect(claimFirstLaunch()).toBe(false);
    expect(claimFirstLaunch()).toBe(false);
  });

  it("claims on read, so a launch abandoned halfway still counts as seen", () => {
    claimFirstLaunch();
    expect(localStorage.getItem("bills.splashSeen.v1")).toBe("1");
  });

  it("says no when storage cannot be read", () => {
    // Same bias as lib/onboarding.ts: showing a title sequence to someone who has used the app all
    // summer is worse than skipping it for someone new.
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    expect(claimFirstLaunch()).toBe(false);
    get.mockRestore();
  });
});

describe("when it plays", () => {
  it("comes before the introduction on a genuinely fresh install", () => {
    render(<App />);
    expect(document.querySelector(".splash")).not.toBeNull();
    // and the introduction is behind it, not alongside
    expect(screen.queryByText(/photograph the receipt/i)).toBeNull();
  });

  it("hands over to the introduction when it finishes", async () => {
    vi.useFakeTimers();
    render(<App />);
    expect(document.querySelector(".splash")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(SPLASH_MS + 50);
    });
    expect(document.querySelector(".splash")).toBeNull();
    expect(screen.getByText(/photograph the receipt/i)).toBeInTheDocument();
  });

  it("never plays for somebody who already has splits", () => {
    // An upgrade from an older build is not a first launch. They have been using Billy all summer.
    saveData({ schemaVersion: 2, trips: [seedTrip()] });
    render(<App />);
    expect(document.querySelector(".splash")).toBeNull();
  });

  it("never plays for somebody who has already been introduced", () => {
    setOnboarded();
    render(<App />);
    expect(document.querySelector(".splash")).toBeNull();
    leaveScanScreen();
  });

  it("does not play twice, even across a relaunch", () => {
    const { unmount } = render(<App />);
    expect(document.querySelector(".splash")).not.toBeNull();
    unmount();

    render(<App />); // a fresh launch reads localStorage again
    expect(document.querySelector(".splash")).toBeNull();
  });
});

describe("what it draws", () => {
  it("starts the two bars stacked, so frame one reads as one bar", () => {
    render(<App />);
    const [long, short] = [...document.querySelectorAll(".splash rect")];
    // Long sits at y20 and is pushed down 7.5; short sits at y35 and is pulled up 7.5. Both land on
    // 27.5 with a height of 9 — the same nine units — which is what makes the split a split.
    expect(Number(long.getAttribute("y")) + 7.5).toBe(Number(short.getAttribute("y")) - 7.5);
  });

  it("shrinks the short bar from the long one's full length", () => {
    render(<App />);
    const [long, short] = [...document.querySelectorAll(".splash rect")];
    const scale = Number(long.getAttribute("width")) / Number(short.getAttribute("width"));
    // 44/26 — the 1.6923 in the keyframes. If these drift apart the bar jumps at frame one.
    expect(scale).toBeCloseTo(1.6923, 3);
  });

  it("keeps the mark out of the accessibility tree", () => {
    render(<App />);
    expect(document.querySelector(".splash svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
