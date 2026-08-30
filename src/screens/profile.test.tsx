import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { ProfileScreen } from "./ProfileScreen";
import { StoreProvider } from "../state/StoreProvider";
import { loadApiKey, exportTrip, saveData } from "../lib/storage";
import type { Trip } from "../types";
import { setOnboarded } from "../lib/onboarding";
import { leaveScanScreen } from "../test/leaveScanScreen";

beforeEach(() => {
  localStorage.clear();
  // These tests start from an empty app, which is exactly when the first-run introduction
  // appears. Mark it seen so they exercise the screens they are about.
  setOnboarded();
});

describe("profile screen", () => {
  it("is a root, so it has no back button — the tab bar is how you leave", () => {
    render(
      <StoreProvider>
        <ProfileScreen go={() => {}} />
      </StoreProvider>
    );
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
  });

  it("saves the API key locally", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test123");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(loadApiKey()).toBe("sk-ant-test123");
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it("imports a trip from an export file", async () => {
    const trip: Trip = {
      id: "t9", name: "Madeira", emoji: "⛰️", currency: "EUR",
      people: [], groups: [], receipts: [], createdAt: "", schemaVersion: 1,
    };
    const file = new File([exportTrip(trip)], "madeira.bills.json", { type: "application/json" });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    // Backup left Profile for a screen of its own: its export list grows one row per split, so on
    // Profile it pushed the settings below it further down the page with every holiday taken.
    await user.click(screen.getByRole("button", { name: /^backup/i }));
    await user.upload(screen.getByLabelText(/import split/i), file);
    // The imported trip appears in the list on this screen, without navigating again.
    expect(await screen.findByText(/madeira/i)).toBeInTheDocument();
  });

  it("rejects a non-split file", async () => {
    const file = new File(["{}"], "junk.json", { type: "application/json" });
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    await user.click(screen.getByRole("button", { name: /^backup/i }));
    await user.upload(screen.getByLabelText(/import split/i), file);
    expect(await screen.findByText(/isn't a Billy split/i)).toBeInTheDocument();
  });
});

describe("appearance and the API key card", () => {
  it("offers light, dark and follow-the-phone", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByRole("button", { name: /follow phone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument();
  });

  it("applies a chosen theme where the stylesheet reads it, and remembers it", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    await user.click(screen.getByRole("button", { name: /dark/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: /dark/i })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("bills.theme.v1")).toBe("dark");
  });

  it("shows the API key card while the app still scans with the user's own key", async () => {
    const user = userEvent.setup();
    render(<App />);
  leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByPlaceholderText(/sk-ant/i)).toBeInTheDocument();
  });
});

describe("the settings list", () => {
  /**
   * Profile used to be six stacked cards — scans, packs, Currency, Appearance, Backup, Help — each
   * with its own heading and body copy. Six equal boxes is the same as no hierarchy, and the Backup
   * one grew a row per split, so the page had no settled shape at all.
   */
  it("keeps the export list off Profile, however many splits there are", async () => {
    saveData({
      schemaVersion: 2,
      trips: ["Algarve", "Madeira", "Sintra"].map((name, i) => ({
        id: `t${i}`, name, emoji: "🏖️", currency: "EUR",
        people: [], groups: [], receipts: [], createdAt: "", schemaVersion: 2 as const,
      })),
    });
    const user = userEvent.setup();
    render(<App />);
    leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));

    // The names would be here if the export list still were, and there would be three more rows
    // between Appearance and Help than there were yesterday.
    expect(screen.queryByText(/algarve/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^export$/i })).not.toBeInTheDocument();
  });

  it("opens backup and comes back to profile", async () => {
    const user = userEvent.setup();
    render(<App />);
    leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    await user.click(screen.getByRole("button", { name: /^backup/i }));

    expect(screen.getByRole("heading", { name: /^backup$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("heading", { name: /^profile$/i })).toBeInTheDocument();
  });

  it("still sets a default currency, now from a row rather than a card", async () => {
    const user = userEvent.setup();
    render(<App />);
    leaveScanScreen();
    await user.click(screen.getByRole("tab", { name: /profile/i }));
    await user.selectOptions(screen.getByLabelText(/default currency/i), "GBP");
    expect(localStorage.getItem("bills.currency")).toBe("GBP");
  });
});
