import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import { setOnboarded } from "../lib/onboarding";
import type { Trip } from "../types";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [], groups: [], receipts: [], createdAt: "2026-08-01T00:00:00Z", schemaVersion: 2,
  };
}

beforeEach(() => localStorage.clear());

describe("the first-run introduction", () => {
  it("greets someone with nothing yet", () => {
    render(<App />);
    expect(screen.getByText(/photograph the receipt/i)).toBeInTheDocument();
    // and does not ask for anything: no key, no account, no email
    expect(screen.queryByPlaceholderText(/sk-ant/i)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("explains the three steps in order, then lands on the trip list", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/photograph the receipt/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/tap who got what/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/see who owes whom/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start splitting/i }));
    expect(screen.getByPlaceholderText(/trip name/i)).toBeInTheDocument();
  });

  it("can be skipped from the very first panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /skip/i }));
    expect(screen.getByPlaceholderText(/trip name/i)).toBeInTheDocument();
  });

  it("never appears again once it has been seen", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole("button", { name: /skip/i }));
    unmount();

    render(<App />); // a fresh launch reads localStorage again
    expect(screen.getByPlaceholderText(/trip name/i)).toBeInTheDocument();
    expect(screen.queryByText(/photograph the receipt/i)).toBeNull();
  });

  it("does not appear for someone who already has trips, even before it was ever dismissed", () => {
    // the upgrade case: v1 and v2 users have never seen this screen and must not be taught the
    // app they have been using all summer
    saveData({ schemaVersion: 2, trips: [seedTrip()] });
    render(<App />);
    expect(screen.queryByText(/photograph the receipt/i)).toBeNull();
    expect(screen.getByText(/algarve/i)).toBeInTheDocument();
  });

  it("stays away after the trips are deleted", async () => {
    const user = userEvent.setup();
    setOnboarded();
    saveData({ schemaVersion: 2, trips: [seedTrip()] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /delete trip/i }));
    // back to an empty app, but not back to being a stranger
    expect(screen.getByPlaceholderText(/trip name/i)).toBeInTheDocument();
    expect(screen.queryByText(/photograph the receipt/i)).toBeNull();
    vi.mocked(window.confirm).mockRestore();
  });

  it("says the trust part on the last panel, and only there", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByText(/no account, no sign-up/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/no account, no sign-up/i)).toBeInTheDocument();
    expect(screen.getByText(/no signal at all/i)).toBeInTheDocument();
  });

  it("survives storage it cannot write to, rather than blocking the app", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    render(<App />);
    await user.click(screen.getByRole("button", { name: /skip/i }));
    // it still gets out of the way for this session
    expect(screen.getByPlaceholderText(/trip name/i)).toBeInTheDocument();
    setItem.mockRestore();
  });
});
